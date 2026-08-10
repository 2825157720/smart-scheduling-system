import { buildFairnessContext, buildFutureResetSchedule, canCoverMember, groupMemberNames, planDaySchedule, planPositionAssignment, rankFairCandidates } from "./schedule-core.js";
import { buildImportPreview, createImportToken, normalizeImportPayload, shanghaiBusinessDate, verifyAdminPassword } from "./import-off-days.js";

const json = (body, init = {}) => Response.json(body, init);
const rows = async (statement) => (await statement.all()).results;
const now = () => new Date().toISOString();
const failure = (msg, status = 400, init = {}) => json({ success: false, msg }, { ...init, status });
const ASSIGNMENT_SOURCES = new Set(["automatic", "manual", "legacy"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WRITE_LOCK_RETRY_AFTER_SECONDS = "300";
const DISALLOWED_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const POSITION_CATEGORIES = new Set(["", "次品", "京东"]);

function writesLocked(env) {
  return env.WRITE_MODE !== "enabled";
}

function normalizeText(value, label, { maxLength = 80, allowEmpty = false, allowNewlines = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label}必须是文本`);
  const normalized = value.normalize("NFC").trim();
  if (!allowEmpty && !normalized) throw new Error(`${label}不能为空`);
  if (Array.from(normalized).length > maxLength) throw new Error(`${label}不能超过${maxLength}个字符`);
  const invalid = allowNewlines
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u
    : DISALLOWED_TEXT;
  if (invalid.test(normalized)) throw new Error(`${label}包含不允许的控制字符`);
  return normalized;
}

function normalizeWorkload(value) {
  const workload = Number(value ?? 0);
  if (!Number.isFinite(workload) || workload < 0 || workload > 100000) throw new Error("工作量必须是 0 到 100000 之间的数字");
  return workload;
}

async function subjectHasReferences(db, type, id) {
  const columns = type === "staff"
    ? [
      ["schedule_cells", "staff_id"], ["schedule_slots", "staff_id"], ["schedule_day_off_staff", "staff_id"], ["positions", "default_staff_id"],
    ]
    : [
      ["schedule_cells", "group_id"], ["schedule_slots", "group_id"], ["schedule_day_off_groups", "group_id"], ["positions", "default_group_id"], ["staff", "group_id"],
    ];
  for (const [table, column] of columns) {
    const referenced = await db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).bind(id).first();
    if (referenced) return true;
  }
  return false;
}
const assignmentSource = (value, fallback = "legacy") => ASSIGNMENT_SOURCES.has(value) ? value : fallback;

function markDayAssignments(dayData, source = "automatic") {
  for (const [positionId, cell] of Object.entries(dayData || {})) {
    if (!positionId.startsWith("p") || !cell || typeof cell !== "object") continue;
    cell._source = assignmentSource(source, "automatic");
  }
  return dayData;
}

export function normalizeSubstituteRestrictions(body = {}, existing = {}) {
  const hasSaturday = Object.prototype.hasOwnProperty.call(body, "saturday_only");
  const hasWeekend = Object.prototype.hasOwnProperty.call(body, "weekend_only");
  const hasNoSubstitute = Object.prototype.hasOwnProperty.call(body, "no_substitute");
  let saturdayOnly = hasSaturday ? Boolean(body.saturday_only) : Boolean(existing.saturday_only);
  let weekendOnly = hasWeekend ? Boolean(body.weekend_only) : Boolean(existing.weekend_only);
  let noSubstitute = hasNoSubstitute ? Boolean(body.no_substitute) : Boolean(existing.no_substitute);

  if (hasNoSubstitute && noSubstitute) {
    saturdayOnly = false;
    weekendOnly = false;
  } else if (hasWeekend && weekendOnly) {
    saturdayOnly = false;
    noSubstitute = false;
  } else if (hasSaturday && saturdayOnly) {
    weekendOnly = false;
    noSubstitute = false;
  } else if (noSubstitute) {
    saturdayOnly = false;
    weekendOnly = false;
  } else if (weekendOnly) {
    saturdayOnly = false;
  }

  return { saturdayOnly, weekendOnly, noSubstitute };
}

async function getGroups(db) {
  return rows(db.prepare(`
    SELECT g.id, g.name, COALESCE(json_group_array(s.name) FILTER (WHERE s.id IS NOT NULL), json('[]')) AS member_names
    FROM groups g LEFT JOIN staff s ON s.group_id = g.id
    GROUP BY g.id, g.name ORDER BY g.id
  `)).then((items) => items.map((item) => ({ ...item, member_names: JSON.parse(item.member_names) })));
}

async function getStaff(db) {
  return rows(db.prepare(`
    SELECT s.id, s.name, s.group_id, COALESCE(g.name, '') AS group_name,
           s.can_cpin, s.can_jd, s.saturday_only, s.weekend_only, s.no_substitute
    FROM staff s LEFT JOIN groups g ON g.id = s.group_id ORDER BY s.id
  `)).then((items) => items.map((item) => {
    const restrictions = normalizeSubstituteRestrictions({}, item);
    return {
      ...item,
      group_id: item.group_id || "",
      can_cpin: Boolean(item.can_cpin),
      can_jd: Boolean(item.can_jd),
      saturday_only: restrictions.saturdayOnly,
      weekend_only: restrictions.weekendOnly,
      no_substitute: restrictions.noSubstitute,
    };
  }));
}

async function getPositions(db) {
  return rows(db.prepare(`
    SELECT p.id, p.name, p.workload, p.category, p.split_allowed,
           COALESCE(s.name, g.name, '') AS default_person
    FROM positions p
    LEFT JOIN staff s ON s.id = p.default_staff_id
    LEFT JOIN groups g ON g.id = p.default_group_id
    ORDER BY p.sort_order, p.id
  `)).then((items) => items.map((item) => ({ ...item, split_allowed: Boolean(item.split_allowed) })));
}

async function getSchedule(db, year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const days = await rows(db.prepare(
    "SELECT id, schedule_date, scatter_groups FROM schedule_days WHERE schedule_date LIKE ? ORDER BY schedule_date"
  ).bind(`${prefix}-%`));
  if (!days.length) return {};
  const cells = await rows(db.prepare(`
    SELECT c.id, c.schedule_day_id, c.position_id, c.status, c.assignment_source,
           COALESCE(s.name, g.name, '') AS person
    FROM schedule_cells c
    JOIN schedule_days d ON d.id = c.schedule_day_id
    LEFT JOIN staff s ON s.id = c.staff_id
    LEFT JOIN groups g ON g.id = c.group_id
    WHERE d.schedule_date LIKE ?
  `).bind(`${prefix}-%`));
  const slots = await rows(db.prepare(`
    SELECT sl.schedule_cell_id, sl.slot, sl.status, sl.workload,
           COALESCE(s.name, g.name, '') AS person
    FROM schedule_slots sl
    JOIN schedule_cells c ON c.id = sl.schedule_cell_id
    JOIN schedule_days d ON d.id = c.schedule_day_id
    LEFT JOIN staff s ON s.id = sl.staff_id
    LEFT JOIN groups g ON g.id = sl.group_id
    WHERE d.schedule_date LIKE ?
  `).bind(`${prefix}-%`));
  const off = await rows(db.prepare(`
    SELECT x.schedule_day_id, x.name FROM (
      SELECT o.schedule_day_id, s.name FROM schedule_day_off_staff o JOIN staff s ON s.id = o.staff_id
      UNION ALL
      SELECT o.schedule_day_id, g.name FROM schedule_day_off_groups o JOIN groups g ON g.id = o.group_id
    ) x JOIN schedule_days d ON d.id = x.schedule_day_id WHERE d.schedule_date LIKE ?
  `).bind(`${prefix}-%`));
  const result = Object.fromEntries(days.map((day) => [String(Number(day.schedule_date.slice(-2))), {
    _off_persons: [], _scatter_groups: Boolean(day.scatter_groups),
  }]));
  const cellIndex = new Map();
  for (const cell of cells) {
    const day = days.find((item) => item.id === cell.schedule_day_id);
    const data = { person: cell.person, status: cell.status, _source: assignmentSource(cell.assignment_source) };
    result[String(Number(day.schedule_date.slice(-2)))][cell.position_id] = data;
    cellIndex.set(cell.id, data);
  }
  for (const slot of slots) {
    const cell = cellIndex.get(slot.schedule_cell_id);
    if (!cell) continue;
    cell.slots ||= {};
    cell.slots[slot.slot] = { person: slot.person, status: slot.status, workload: slot.workload };
  }
  for (const item of off) {
    const day = days.find((candidate) => candidate.id === item.schedule_day_id);
    result[String(Number(day.schedule_date.slice(-2)))]._off_persons.push(item.name);
  }
  for (const data of Object.values(result)) data._off_persons.sort((a, b) => a.localeCompare(b, "zh-CN"));
  return result;
}

async function getMemo(db, id = "global") {
  const row = await db.prepare("SELECT content, updated_at FROM memos WHERE id = ?").bind(id).first();
  return row || { content: "", updated_at: "" };
}

async function nameExists(db, name, except = {}) {
  const [staff, groups] = await Promise.all([
    db.prepare("SELECT id FROM staff WHERE name = ? AND id != ?").bind(name, except.staffId || "").first(),
    db.prepare("SELECT id FROM groups WHERE name = ? AND id != ?").bind(name, except.groupId || "").first(),
  ]);
  return Boolean(staff || groups);
}

async function subjectMaps(db) {
  const [staff, groups] = await Promise.all([
    rows(db.prepare("SELECT id, name FROM staff")), rows(db.prepare("SELECT id, name FROM groups")),
  ]);
  return { staff: new Map(staff.map((item) => [item.name, item.id])), groups: new Map(groups.map((item) => [item.name, item.id])) };
}

function subjectId(name, subjects) {
  if (!name) return { staffId: null, groupId: null };
  if (subjects.staff.has(name)) return { staffId: subjects.staff.get(name), groupId: null };
  if (subjects.groups.has(name)) return { staffId: null, groupId: subjects.groups.get(name) };
  throw new Error("排班引用了不存在的人员或小组");
}

function insertDayStatements(db, date, data, subjects) {
  const dayId = `day_${date}`;
  const statements = [
    db.prepare("INSERT INTO schedule_days (id, schedule_date, scatter_groups) VALUES (?, ?, ?)").bind(dayId, date, data._scatter_groups ? 1 : 0),
  ];
  for (const person of data._off_persons || []) {
    const subject = subjectId(String(person || ""), subjects);
    if (subject.staffId) statements.push(db.prepare("INSERT INTO schedule_day_off_staff (schedule_day_id, staff_id) VALUES (?, ?)").bind(dayId, subject.staffId));
    if (subject.groupId) statements.push(db.prepare("INSERT INTO schedule_day_off_groups (schedule_day_id, group_id) VALUES (?, ?)").bind(dayId, subject.groupId));
  }
  for (const [positionId, cell] of Object.entries(data)) {
    if (!positionId.startsWith("p") || !cell || typeof cell !== "object") continue;
    const cellId = `cell_${date}_${positionId}`;
    const subject = subjectId(String(cell.person || ""), subjects);
    const status = String(cell.status || "pending");
    statements.push(db.prepare("INSERT INTO schedule_cells (id, schedule_day_id, position_id, status, staff_id, group_id, assignment_source) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(cellId, dayId, positionId, status, subject.staffId, subject.groupId, assignmentSource(cell._source)));
    for (const slot of ["am", "pm"]) {
      const detail = cell.slots?.[slot];
      if (!detail || typeof detail !== "object") continue;
      const slotSubject = subjectId(String(detail.person || ""), subjects);
      statements.push(db.prepare("INSERT INTO schedule_slots (id, schedule_cell_id, slot, status, staff_id, group_id, workload) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${cellId}_${slot}`, cellId, slot, String(detail.status || "pending"), slotSubject.staffId, slotSubject.groupId, Number(detail.workload || 0)));
    }
  }
  return statements;
}

function replaceDayStatements(db, datesAndData, subjects) {
  const statements = [];
  for (const { date, data } of datesAndData) {
    statements.push(
      db.prepare("DELETE FROM schedule_slots WHERE schedule_cell_id IN (SELECT c.id FROM schedule_cells c JOIN schedule_days d ON d.id = c.schedule_day_id WHERE d.schedule_date = ?)").bind(date),
      db.prepare("DELETE FROM schedule_day_off_staff WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date = ?)").bind(date),
      db.prepare("DELETE FROM schedule_day_off_groups WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date = ?)").bind(date),
      db.prepare("DELETE FROM schedule_cells WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date = ?)").bind(date),
      db.prepare("DELETE FROM schedule_days WHERE schedule_date = ?").bind(date),
      ...insertDayStatements(db, date, data, subjects),
    );
  }
  return statements;
}

function monthDayLimit(year, month) {
  const parsedYear = Number(year); const parsedMonth = Number(month);
  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) throw new Error("年月无效");
  return new Date(parsedYear, parsedMonth, 0).getDate();
}

function mutationAuditStatements(db, action) {
  const createdAt = now();
  return [
    db.prepare("UPDATE app_revision SET revision = revision + 1, updated_at = ? WHERE id = 1").bind(createdAt),
    db.prepare("INSERT INTO mutation_audit (id, revision, action, created_at) SELECT ?, revision, ?, ? FROM app_revision WHERE id = 1")
      .bind(crypto.randomUUID(), action, createdAt),
  ];
}

async function saveDay(db, year, month, day, data, action = "schedule-day") {
  const parsedDay = Number(day);
  const maxDay = monthDayLimit(year, month);
  if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > maxDay || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("日期或排班数据无效");
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(parsedDay).padStart(2, "0")}`;
  const subjects = await subjectMaps(db);
  await db.batch([
    ...replaceDayStatements(db, [{ date, data }], subjects),
    ...mutationAuditStatements(db, action),
  ]);
}

async function restoreMonth(db, year, month, monthData) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const subjects = await subjectMaps(db);
  const statements = [
    db.prepare("DELETE FROM schedule_slots WHERE schedule_cell_id IN (SELECT c.id FROM schedule_cells c JOIN schedule_days d ON d.id=c.schedule_day_id WHERE d.schedule_date LIKE ?)").bind(`${prefix}-%`),
    db.prepare("DELETE FROM schedule_day_off_staff WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date LIKE ?)").bind(`${prefix}-%`),
    db.prepare("DELETE FROM schedule_day_off_groups WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date LIKE ?)").bind(`${prefix}-%`),
    db.prepare("DELETE FROM schedule_cells WHERE schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date LIKE ?)").bind(`${prefix}-%`),
    db.prepare("DELETE FROM schedule_days WHERE schedule_date LIKE ?").bind(`${prefix}-%`),
  ];
  for (const [dayText, data] of Object.entries(monthData)) {
    const day = Number(dayText);
    if (!Number.isInteger(day) || day < 1 || day > 31 || !data || typeof data !== "object") continue;
    const date = `${prefix}-${String(day).padStart(2, "0")}`;
    statements.push(...insertDayStatements(db, date, data, subjects));
  }
  await db.batch(statements);
}

async function synchronizePositionFuture(db, positionId, { includeLegacy = false, apply = false } = {}) {
  const today = shanghaiBusinessDate();
  const candidates = await rows(db.prepare(`
    SELECT c.id, c.status, c.assignment_source, d.schedule_date
    FROM schedule_cells c JOIN schedule_days d ON d.id = c.schedule_day_id
    WHERE c.position_id = ? AND d.schedule_date >= ?
    ORDER BY d.schedule_date
  `).bind(positionId, today));
  const [positions, staff, groups] = await Promise.all([getPositions(db), getStaff(db), getGroups(db)]);
  const position = positions.find((item) => item.id === positionId);
  if (!position) throw new Error("岗位不存在");
  const monthCache = new Map();
  const subjects = apply ? await subjectMaps(db) : null;
  const changes = []; const legacyConflicts = []; const manualProtected = [];
  const statements = [];
  for (const item of candidates) {
    const source = assignmentSource(item.assignment_source);
    if (source === "manual") { manualProtected.push(item.schedule_date); continue; }
    if (source === "legacy" && !["on", "pending"].includes(item.status) && !includeLegacy) {
      legacyConflicts.push(item.schedule_date); continue;
    }
    const [yearText, monthText, dayText] = item.schedule_date.split("-");
    const monthKey = `${yearText}-${monthText}`;
    if (!monthCache.has(monthKey)) monthCache.set(monthKey, await getSchedule(db, Number(yearText), Number(monthText)));
    const monthSchedule = monthCache.get(monthKey);
    const dayData = monthSchedule[String(Number(dayText))] || {};
    const current = dayData[positionId] || { status: "pending", person: "", _source: source };
    const proposed = planPositionAssignment(position, positions, staff, groups, {
      year: Number(yearText), month: Number(monthText), day: Number(dayText), dayData, monthSchedule,
    });
    changes.push({
      date: item.schedule_date,
      from: { status: current.status || "pending", person: current.person || "", source },
      to: { ...proposed, source: "automatic" },
    });
    dayData[positionId] = { ...proposed, _source: "automatic" };
    if (!apply) continue;
    const subject = subjectId(String(proposed.person || ""), subjects);
    statements.push(
      db.prepare("DELETE FROM schedule_slots WHERE schedule_cell_id = ?").bind(item.id),
      db.prepare("UPDATE schedule_cells SET status = ?, staff_id = ?, group_id = ?, assignment_source = 'automatic' WHERE id = ?")
        .bind(proposed.status, subject.staffId, subject.groupId, item.id),
    );
  }
  if (apply) {
    for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
  }
  return {
    synced_days: changes.map((item) => item.date),
    legacy_conflict_days: legacyConflicts,
    manual_protected_days: manualProtected,
    changes,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      return json({ ok: true });
    }
    const legacyMonthWrite = url.pathname.match(/^\/api\/schedule\/\d{4}\/\d{1,2}$/);
    if (request.method === "POST" && legacyMonthWrite) {
      return failure("整月保存接口已停用，请使用单日排班接口", 410);
    }
    if (MUTATING_METHODS.has(request.method) && writesLocked(env)) {
      return failure("系统正在维护，暂时禁止修改", 503, {
        headers: { "Retry-After": WRITE_LOCK_RETRY_AFTER_SECONDS },
      });
    }
    if (url.pathname === "/api/storage-info") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM staff").first();
      return json({ mode: "d1", database_available: true, staff_count: row.count });
    }
    if (request.method === "GET" && url.pathname === "/api/server-info") {
      return json({ ip: url.hostname, port: 443, url: url.origin });
    }
    if (request.method === "GET" && url.pathname === "/api/routes") {
      return json({ success: true, version: "cloudflare-d1", route_count: 23 });
    }
    if (request.method === "GET" && url.pathname === "/api/groups") return json(await getGroups(env.DB));
    if (request.method === "GET" && url.pathname === "/api/staff") return json(await getStaff(env.DB));
    if (request.method === "GET" && url.pathname === "/api/positions") return json(await getPositions(env.DB));
    if (request.method === "POST" && url.pathname === "/api/groups") {
      const body = await request.json(); let name;
      try { name = normalizeText(body.name, "小组名称"); } catch (error) { return failure(error.message); }
      if (await nameExists(env.DB, name)) return failure("名称已存在");
      const groupId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").bind(groupId, name).run();
      return json({ success: true, group_id: groupId });
    }
    const group = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (group && request.method === "PUT") {
      const body = await request.json(); let name;
      try { name = normalizeText(body.name, "小组名称"); } catch (error) { return failure(error.message); }
      if (await nameExists(env.DB, name, { groupId: group[1] })) return failure("名称已存在");
      const result = await env.DB.prepare("UPDATE groups SET name = ? WHERE id = ?").bind(name, group[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("小组不存在", 404);
    }
    if (group && request.method === "DELETE") {
      if (await subjectHasReferences(env.DB, "group", group[1])) return failure("该小组仍被人员、岗位或排班记录引用，不能删除", 409);
      const result = await env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(group[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("小组不存在", 404);
    }
    if (request.method === "POST" && url.pathname === "/api/staff") {
      const body = await request.json(); let name;
      try { name = normalizeText(body.name, "姓名"); } catch (error) { return failure(error.message); }
      if (await nameExists(env.DB, name)) return failure("名称已存在");
      const staffId = crypto.randomUUID(); const groupId = body.group_id || null;
      const restrictions = normalizeSubstituteRestrictions(body);
      await env.DB.prepare("INSERT INTO staff (id, name, group_id, can_cpin, can_jd, saturday_only, weekend_only, no_substitute) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(staffId, name, groupId, body.can_cpin ? 1 : 0, body.can_jd ? 1 : 0, restrictions.saturdayOnly ? 1 : 0, restrictions.weekendOnly ? 1 : 0, restrictions.noSubstitute ? 1 : 0).run();
      return json({ success: true, staff_id: staffId });
    }
    const staff = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
    if (staff && request.method === "PUT") {
      const body = await request.json();
      const existing = await env.DB.prepare("SELECT name, group_id, can_cpin, can_jd, saturday_only, weekend_only, no_substitute FROM staff WHERE id = ?").bind(staff[1]).first();
      if (!existing) return failure("人员不存在", 404);
      let name;
      try { name = normalizeText(Object.prototype.hasOwnProperty.call(body, "name") ? body.name : existing.name, "姓名"); } catch (error) { return failure(error.message); }
      if (await nameExists(env.DB, name, { staffId: staff[1] })) return failure("名称已存在");
      const restrictions = normalizeSubstituteRestrictions(body, existing);
      const groupId = Object.prototype.hasOwnProperty.call(body, "group_id") ? body.group_id || null : existing.group_id || null;
      const canCpin = Object.prototype.hasOwnProperty.call(body, "can_cpin") ? Boolean(body.can_cpin) : Boolean(existing.can_cpin);
      const canJd = Object.prototype.hasOwnProperty.call(body, "can_jd") ? Boolean(body.can_jd) : Boolean(existing.can_jd);
      const result = await env.DB.prepare("UPDATE staff SET name=?, group_id=?, can_cpin=?, can_jd=?, saturday_only=?, weekend_only=?, no_substitute=? WHERE id=?")
        .bind(name, groupId, canCpin ? 1 : 0, canJd ? 1 : 0, restrictions.saturdayOnly ? 1 : 0, restrictions.weekendOnly ? 1 : 0, restrictions.noSubstitute ? 1 : 0, staff[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("人员不存在", 404);
    }
    if (staff && request.method === "DELETE") {
      if (await subjectHasReferences(env.DB, "staff", staff[1])) return failure("该人员仍被岗位或排班记录引用，不能删除", 409);
      const result = await env.DB.prepare("DELETE FROM staff WHERE id = ?").bind(staff[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("人员不存在", 404);
    }
    if (request.method === "POST" && url.pathname === "/api/positions") {
      const body = await request.json(); let name; let workload;
      try { name = normalizeText(body.name, "岗位名称"); workload = normalizeWorkload(body.workload); } catch (error) { return failure(error.message); }
      if (!POSITION_CATEGORIES.has(body.category || "")) return failure("岗位类别无效");
      const posId = crypto.randomUUID(); const subject = await subjectMaps(env.DB); const defaultSubject = subjectId(String(body.default_person || ""), subject);
      const rank = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS rank FROM positions").first()).rank + 1;
      await env.DB.prepare("INSERT INTO positions (id, name, workload, default_staff_id, default_group_id, category, split_allowed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(posId, name, workload, defaultSubject.staffId, defaultSubject.groupId, body.category || "", body.split_allowed ? 1 : 0, rank).run();
      return json({ success: true, pos_id: posId });
    }
    const position = url.pathname.match(/^\/api\/positions\/([^/]+)$/);
    if (position && request.method === "PUT") {
      const body = await request.json(); let name; let workload;
      try { name = normalizeText(body.name, "岗位名称"); workload = normalizeWorkload(body.workload); } catch (error) { return failure(error.message); }
      if (!POSITION_CATEGORIES.has(body.category || "")) return failure("岗位类别无效");
      const subject = await subjectMaps(env.DB); const defaultSubject = subjectId(String(body.default_person || ""), subject);
      const existing = await env.DB.prepare(`
        SELECT p.id, COALESCE(s.name, g.name, '') AS default_person
        FROM positions p
        LEFT JOIN staff s ON s.id = p.default_staff_id
        LEFT JOIN groups g ON g.id = p.default_group_id
        WHERE p.id = ?
      `).bind(position[1]).first();
      if (!existing) return failure("岗位不存在", 404);
      await env.DB.prepare("UPDATE positions SET name=?, workload=?, default_staff_id=?, default_group_id=?, category=?, split_allowed=? WHERE id=?")
        .bind(name, workload, defaultSubject.staffId, defaultSubject.groupId, body.category || "", body.split_allowed ? 1 : 0, position[1]).run();
      const sync = await synchronizePositionFuture(env.DB, position[1], { apply: true });
      return json({ success: true, previous_default_person: existing.default_person, ...sync });
    }
    if (position && request.method === "DELETE") {
      const inSchedule = await env.DB.prepare("SELECT 1 FROM schedule_cells WHERE position_id = ? LIMIT 1").bind(position[1]).first();
      if (inSchedule) return failure("该岗位已被排班历史引用，不能删除", 409);
      await env.DB.prepare("DELETE FROM positions WHERE id = ?").bind(position[1]).run();
      return json({ success: true });
    }
    const positionSync = url.pathname.match(/^\/api\/positions\/([^/]+)\/sync-schedule$/);
    if (positionSync && request.method === "POST") {
      const body = await request.json();
      const apply = body.action === "apply";
      if (!apply && body.action !== "preview") return failure("同步操作无效");
      const result = await synchronizePositionFuture(env.DB, positionSync[1], { includeLegacy: Boolean(body.include_legacy), apply });
      return json({ success: true, action: body.action, ...result });
    }
    if (request.method === "POST" && url.pathname === "/api/positions/reorder") {
      const payload = await request.json(); const ids = Array.isArray(payload) ? payload.map((item) => typeof item === "object" ? item.id : item) : [];
      await env.DB.batch(ids.map((id, index) => env.DB.prepare("UPDATE positions SET sort_order = ? WHERE id = ?").bind(index + 1, id)));
      return json({ success: true });
    }
    const schedule = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})$/);
    if (request.method === "GET" && schedule) return json(await getSchedule(env.DB, schedule[1], schedule[2]));
    if (request.method === "POST" && schedule) {
      return failure("整月保存接口已停用，请使用单日排班接口", 410);
    }
    const scheduleDay = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/day$/);
    if (request.method === "POST" && scheduleDay) {
      const body = await request.json();
      const day = Number(body.day);
      if (!Number.isInteger(day) || day < 1 || day > monthDayLimit(scheduleDay[1], scheduleDay[2]) || !body.pos_id) return json({ success: false, msg: "日期或岗位无效" }, { status: 400 });
      const monthData = await getSchedule(env.DB, scheduleDay[1], scheduleDay[2]);
      const dayData = monthData[String(day)] ||= {};
      const source = assignmentSource(body.assignment_source, "manual");
      if (body.split && typeof body.split === "object") {
        const slots = Object.fromEntries(["am", "pm"].map((slot) => [slot, { status: body.split[slot]?.status || "pending", person: body.split[slot]?.person || "", workload: body.split[slot]?.workload || 0 }]));
        dayData[body.pos_id] = { status: "split", person: slots.am.person || slots.pm.person, slots, _source: source };
      } else if (["am", "pm"].includes(String(body.slot || "").toLowerCase())) {
        const slots = dayData[body.pos_id]?.slots || { am: { status: "pending", person: "" }, pm: { status: "pending", person: "" } };
        const slot = String(body.slot).toLowerCase(); slots[slot] = { status: body.status || "pending", person: body.person || "", workload: body.workload || 0 };
        dayData[body.pos_id] = { status: "split", person: slots.am.person || slots.pm.person, slots, _source: source };
      } else dayData[body.pos_id] = { status: body.status || "pending", person: body.person || "", _source: source };
      if (body.status === "off" && body.person) dayData._off_persons = [...new Set([...(dayData._off_persons || []), body.person])];
      if (body.status === "on" && body.person) dayData._off_persons = (dayData._off_persons || []).filter((name) => name !== body.person);
      try { await saveDay(env.DB, scheduleDay[1], scheduleDay[2], day, dayData, "schedule-day"); }
      catch (error) { return json({ success: false, msg: error.message || "保存排班失败" }, { status: 400 }); }
      return json({ success: true, schedule: monthData, cleared_positions: [] });
    }
    const planDay = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/plan-day$/);
    if (request.method === "POST" && planDay) {
      const body = await request.json(); const day = Number(body.day);
      const maxDay = new Date(Number(planDay[1]), Number(planDay[2]), 0).getDate();
      if (!Number.isInteger(day) || day < 1 || day > maxDay) return failure(day > maxDay ? "日期超出当月范围" : "日期无效");
      const [positions, staff, groups, current] = await Promise.all([getPositions(env.DB), getStaff(env.DB), getGroups(env.DB), getSchedule(env.DB, planDay[1], planDay[2])]);
      const offIds = new Set(body.off_person_ids || []); const supplied = [...(body.off_persons || []), ...staff.filter((item) => offIds.has(item.id)).map((item) => item.name)];
      const saved = current[String(day)]?._off_persons || []; const offPersons = body.use_saved_off_persons || (!("off_person_ids" in body) && !("off_persons" in body) && saved.length) ? saved : supplied;
      const result = planDaySchedule(positions, staff, groups, { year: Number(planDay[1]), month: Number(planDay[2]), day, offPersons, scatterGroups: Boolean(body.scatter_groups), monthSchedule: current });
      markDayAssignments(result.day_data); current[String(day)] = result.day_data; await saveDay(env.DB, planDay[1], planDay[2], day, result.day_data, "plan-day");
      return json({ success: true, ...result });
    }
    const importOffDays = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/import-off-days$/);
    if (request.method === "POST" && importOffDays) {
      const year = Number(importOffDays[1]);
      const month = Number(importOffDays[2]);
      if (month < 1 || month > 12) return failure("月份无效");
      const body = await request.json();
      const action = String(body.action || "preview");
      if (!["preview", "apply"].includes(action)) return failure("导入操作无效");
      const forceReplan = body.force_replan === true;
      const maxDay = new Date(year, month, 0).getDate();
      const [positions, staff, groups, current] = await Promise.all([
        getPositions(env.DB), getStaff(env.DB), getGroups(env.DB), getSchedule(env.DB, year, month),
      ]);
      let imported;
      try {
        imported = normalizeImportPayload(body, staff, maxDay);
      } catch (error) {
        return failure(error.message || "导入数据格式错误");
      }
      const today = shanghaiBusinessDate();
      const preview = buildImportPreview({ year, month, today, staff, positions, groups, current, imported, forceReplan });
      const previewToken = await createImportToken({ year, month, today, current, imported, forceReplan });
      const summary = {
        changed_dates: preview.changed_dates,
        ignored_dates: preview.ignored_dates,
        changes: preview.changes,
        plan_results: preview.plan_results,
        added_count: preview.added_count,
        removed_count: preview.removed_count,
        matched_count: imported.length,
        force_replan: forceReplan,
        today,
        preview_token: previewToken,
      };
      if (action === "preview") return json({ success: true, ...summary });
      if (!env.ADMIN_PASSWORD) return failure("管理员密码未配置", 503);
      if (!await verifyAdminPassword(body.password, env.ADMIN_PASSWORD)) return failure("密码错误", 403);
      if (!body.preview_token || body.preview_token !== previewToken) return failure("排班数据已变化，请重新预览后再导入", 409);
      if (!preview.changed_dates.length) return json({ success: true, schedule: current, backup_time: "", ...summary });
      const backupTime = now();
      const subjects = await subjectMaps(env.DB);
      const changedDays = preview.changed_dates.map((day) => ({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        data: markDayAssignments(preview.schedule[String(day)]),
      }));
      const statements = [
        env.DB.prepare("INSERT INTO schedule_backups (id, year, month, created_at, payload) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), year, month, backupTime, JSON.stringify(current)),
        ...replaceDayStatements(env.DB, changedDays, subjects),
      ];
      try {
        await env.DB.batch(statements);
      } catch (error) {
        return json({ success: false, msg: error.message || "导入排休失败" }, { status: 400 });
      }
      return json({ success: true, schedule: preview.schedule, backup_time: backupTime, ...summary });
    }
    if (request.method === "POST" && url.pathname === "/api/auto-substitute") {
      const body = await request.json(); const { year, month, day, pos_id: posId } = body;
      if (!(year && month && day && posId)) return failure("参数无效");
      const [positions, staff, groups, current] = await Promise.all([getPositions(env.DB), getStaff(env.DB), getGroups(env.DB), getSchedule(env.DB, year, month)]);
      const pos = positions.find((item) => item.id === posId); if (!pos) return failure("岗位不存在", 404);
      const dayData = current[String(day)] || {}; const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const preferredNames = dayData?._scatter_groups ? groupMemberNames(pos.default_person, staff, groups) : [];
      const choices = rankFairCandidates(
        staff.filter((member) => canCoverMember(member, pos, dayData, positions, staff, groups, { day: iso })),
        pos,
        dayData,
        positions,
        staff,
        groups,
        { preferredNames, fairnessContext: buildFairnessContext(current, Number(day), positions) },
      );
      return choices.length ? json({ success: true, person: choices[0].name }) : json({ success: false, msg: "无可用替班人" });
    }
    if (request.method === "POST" && url.pathname === "/api/cascade-off") {
      const body = await request.json(); const { year, month, day, person } = body;
      if (!(year && month && day && person)) return failure("参数无效");
      const [positions, current] = await Promise.all([getPositions(env.DB), getSchedule(env.DB, year, month)]); const dayData = current[String(day)] ||= {};
      if (body.person_is_off) dayData._off_persons = [...new Set([...(dayData._off_persons || []), person])];
      const updated = [];
      for (const pos of positions) {
        const cell = dayData[pos.id]; if (!cell) continue;
        if (cell.status === "split" && cell.slots) for (const slot of ["am", "pm"]) { const item = cell.slots[slot]; if (!item || item.person !== person) continue; if (item.status === "substitute") { cell.slots[slot] = { status: "pending", person: "" }; cell._source = "automatic"; updated.push({ pos_id: pos.id, slot, person: "", status: "pending", pos_name: pos.name }); } else if (body.person_is_off && ["on", "pending", ""].includes(item.status)) { cell.slots[slot] = { ...item, status: "off" }; cell._source = "automatic"; updated.push({ pos_id: pos.id, slot, person, status: "off", pos_name: pos.name }); } }
        else if (cell.person === person && cell.status === "substitute") { dayData[pos.id] = { status: "pending", person: "", _source: "automatic" }; updated.push({ pos_id: pos.id, person: "", status: "pending", pos_name: pos.name }); }
        else if (cell.person === person && body.person_is_off && ["on", "pending", ""].includes(cell.status)) { dayData[pos.id] = { status: "off", person, _source: "automatic" }; updated.push({ pos_id: pos.id, person, status: "off", pos_name: pos.name }); }
      }
      try { await saveDay(env.DB, year, month, day, dayData, "cascade-off"); }
      catch (error) { return failure(error.message || "保存排班失败"); }
      return json({ success: true, updated });
    }
    if (request.method === "POST" && url.pathname === "/api/auto-fill-all") {
      const body = await request.json(); const { year, month, day } = body;
      if (!(year && month && day)) return failure("参数无效");
      const [positions, staff, groups, current] = await Promise.all([getPositions(env.DB), getStaff(env.DB), getGroups(env.DB), getSchedule(env.DB, year, month)]);
      const result = planDaySchedule(positions, staff, groups, { year: Number(year), month: Number(month), day: Number(day), offPersons: current[String(day)]?._off_persons || [], scatterGroups: Boolean(body.scatter_groups), monthSchedule: current });
      markDayAssignments(result.day_data); current[String(day)] = result.day_data; await saveDay(env.DB, year, month, day, result.day_data, "auto-fill-all");
      return json({ success: true, ...result });
    }
    const hiddenDays = url.pathname.match(/^\/api\/hidden-days\/(\d{4})\/(\d{1,2})$/);
    if (request.method === "GET" && hiddenDays) {
      const prefix = `${hiddenDays[1]}-${String(hiddenDays[2]).padStart(2, "0")}`;
      const values = await rows(env.DB.prepare("SELECT schedule_date FROM hidden_days WHERE schedule_date LIKE ? ORDER BY schedule_date").bind(`${prefix}-%`));
      return json(values.map((item) => Number(item.schedule_date.slice(-2))));
    }
    if (request.method === "POST" && hiddenDays) {
      const body = await request.json(); const prefix = `${hiddenDays[1]}-${String(hiddenDays[2]).padStart(2, "0")}`;
      const days = [...new Set((Array.isArray(body) ? body : []).map(Number).filter((day) => Number.isInteger(day) && day > 0 && day <= 31))].sort((a, b) => a - b);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM hidden_days WHERE schedule_date LIKE ?").bind(`${prefix}-%`),
        ...days.map((day) => env.DB.prepare("INSERT INTO hidden_days (schedule_date) VALUES (?)").bind(`${prefix}-${String(day).padStart(2, "0")}`)),
      ]);
      return json({ success: true });
    }
    const reset = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/reset$/);
    if (request.method === "POST" && reset) {
      const body = await request.json();
      if (!env.ADMIN_PASSWORD) return failure("管理员密码未配置", 503);
      if (!await verifyAdminPassword(body.password, env.ADMIN_PASSWORD)) return failure("密码错误", 403);
      const year = Number(reset[1]); const month = Number(reset[2]);
      const [positions, current] = await Promise.all([getPositions(env.DB), getSchedule(env.DB, year, month)]);
      const result = buildFutureResetSchedule(positions, { year, month, today: shanghaiBusinessDate(), current });
      for (const day of result.reset_dates) markDayAssignments(result.schedule[String(day)]);
      if (result.reset_dates.length) {
        const subjects = await subjectMaps(env.DB);
        const changedDays = result.reset_dates.map((day) => ({
          date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          data: result.schedule[String(day)],
        }));
        await env.DB.batch(replaceDayStatements(env.DB, changedDays, subjects));
      }
      return json({ success: true, schedule: result.schedule, reset_dates: result.reset_dates });
    }
    const backup = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/backup$/);
    if (request.method === "POST" && backup) {
      const scheduleData = await getSchedule(env.DB, backup[1], backup[2]); const backupTime = now();
      await env.DB.prepare("INSERT INTO schedule_backups (id, year, month, created_at, payload) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), Number(backup[1]), Number(backup[2]), backupTime, JSON.stringify(scheduleData)).run();
      return json({ success: true, backup_time: backupTime });
    }
    const restore = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/restore$/);
    if (request.method === "POST" && restore) {
      const body = await request.json();
      if (!env.ADMIN_PASSWORD) return failure("管理员密码未配置", 503);
      if (!await verifyAdminPassword(body.password, env.ADMIN_PASSWORD)) return failure("密码错误", 403);
      const record = await env.DB.prepare("SELECT created_at, payload FROM schedule_backups WHERE year=? AND month=? ORDER BY created_at DESC LIMIT 1")
        .bind(Number(restore[1]), Number(restore[2])).first();
      if (!record) return failure("未找到备份文件，请先备份", 404);
      const scheduleData = JSON.parse(record.payload); await restoreMonth(env.DB, restore[1], restore[2], scheduleData);
      return json({ success: true, schedule: scheduleData, backup_time: record.created_at });
    }
    if (request.method === "GET" && url.pathname === "/api/memo") return json(await getMemo(env.DB));
    const monthMemo = url.pathname.match(/^\/api\/memo\/(\d{4})\/(\d{1,2})$/);
    if (request.method === "GET" && monthMemo) return json(await getMemo(env.DB, `${monthMemo[1]}-${String(monthMemo[2]).padStart(2, "0")}`));
    if (request.method === "POST" && url.pathname === "/api/memo") {
      const body = await request.json();
      const memo = { content: String(body.content || ""), updated_at: now() };
      await env.DB.prepare(`INSERT INTO memos (id, content, updated_at) VALUES ('global', ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`).bind(memo.content, memo.updated_at).run();
      return json({ success: true, memo });
    }
    if (request.method === "POST" && monthMemo) {
      const body = await request.json();
      const id = `${monthMemo[1]}-${String(monthMemo[2]).padStart(2, "0")}`;
      const memo = { content: String(body.content || ""), updated_at: now() };
      await env.DB.prepare(`INSERT INTO memos (id, content, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`).bind(id, memo.content, memo.updated_at).run();
      return json({ success: true, memo });
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ success: false, msg: "接口不存在" }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
