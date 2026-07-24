import { buildFairnessContext, buildFutureResetSchedule, canCoverMember, groupMemberNames, planDaySchedule, rankFairCandidates } from "./schedule-core.js";
import { buildImportPreview, createImportToken, normalizeImportPayload, shanghaiBusinessDate, verifyAdminPassword } from "./import-off-days.js";

const json = (body, init = {}) => Response.json(body, init);
const rows = async (statement) => (await statement.all()).results;
const now = () => new Date().toISOString();
const failure = (msg, status = 400) => json({ success: false, msg }, { status });

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
           s.can_cpin, s.can_jd, s.saturday_only, s.no_substitute
    FROM staff s LEFT JOIN groups g ON g.id = s.group_id ORDER BY s.id
  `)).then((items) => items.map((item) => ({
    ...item,
    group_id: item.group_id || "",
    can_cpin: Boolean(item.can_cpin), can_jd: Boolean(item.can_jd),
    saturday_only: Boolean(item.saturday_only), no_substitute: Boolean(item.no_substitute),
  })));
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
    SELECT c.id, c.schedule_day_id, c.position_id, c.status,
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
    const data = { person: cell.person, status: cell.status };
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
    statements.push(db.prepare("INSERT INTO schedule_cells (id, schedule_day_id, position_id, status, staff_id, group_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(cellId, dayId, positionId, status, subject.staffId, subject.groupId));
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
    const dayId = `day_${date}`;
    statements.push(
      db.prepare("DELETE FROM schedule_slots WHERE schedule_cell_id IN (SELECT id FROM schedule_cells WHERE schedule_day_id = ?)").bind(dayId),
      db.prepare("DELETE FROM schedule_day_off_staff WHERE schedule_day_id = ?").bind(dayId),
      db.prepare("DELETE FROM schedule_day_off_groups WHERE schedule_day_id = ?").bind(dayId),
      db.prepare("DELETE FROM schedule_cells WHERE schedule_day_id = ?").bind(dayId),
      db.prepare("DELETE FROM schedule_days WHERE id = ?").bind(dayId),
      ...insertDayStatements(db, date, data, subjects),
    );
  }
  return statements;
}

async function saveMonth(db, year, month, monthData) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      return json({ ok: true });
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
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("小组名称不能为空");
      if (await nameExists(env.DB, name)) return failure("名称已存在");
      const groupId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").bind(groupId, name).run();
      return json({ success: true, group_id: groupId });
    }
    const group = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (group && request.method === "PUT") {
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("小组名称不能为空");
      if (await nameExists(env.DB, name, { groupId: group[1] })) return failure("名称已存在");
      const result = await env.DB.prepare("UPDATE groups SET name = ? WHERE id = ?").bind(name, group[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("小组不存在", 404);
    }
    if (group && request.method === "DELETE") {
      const inSchedule = await env.DB.prepare("SELECT 1 FROM schedule_cells WHERE group_id = ? LIMIT 1").bind(group[1]).first();
      if (inSchedule) return failure("该小组已被排班历史引用，不能删除", 409);
      await env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(group[1]).run();
      return json({ success: true });
    }
    if (request.method === "POST" && url.pathname === "/api/staff") {
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("姓名不能为空");
      if (await nameExists(env.DB, name)) return failure("名称已存在");
      const staffId = crypto.randomUUID(); const groupId = body.group_id || null;
      await env.DB.prepare("INSERT INTO staff (id, name, group_id, can_cpin, can_jd, saturday_only, no_substitute) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(staffId, name, groupId, body.can_cpin ? 1 : 0, body.can_jd ? 1 : 0, body.saturday_only ? 1 : 0, body.no_substitute ? 1 : 0).run();
      return json({ success: true, staff_id: staffId });
    }
    const staff = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
    if (staff && request.method === "PUT") {
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("姓名不能为空");
      if (await nameExists(env.DB, name, { staffId: staff[1] })) return failure("名称已存在");
      const result = await env.DB.prepare("UPDATE staff SET name=?, group_id=?, can_cpin=?, can_jd=?, saturday_only=?, no_substitute=? WHERE id=?")
        .bind(name, body.group_id || null, body.can_cpin ? 1 : 0, body.can_jd ? 1 : 0, body.saturday_only ? 1 : 0, body.no_substitute ? 1 : 0, staff[1]).run();
      return result.meta.changes ? json({ success: true }) : failure("人员不存在", 404);
    }
    if (staff && request.method === "DELETE") {
      const inSchedule = await env.DB.prepare("SELECT 1 FROM schedule_cells WHERE staff_id = ? LIMIT 1").bind(staff[1]).first();
      if (inSchedule) return failure("该人员已被排班历史引用，不能删除", 409);
      await env.DB.prepare("DELETE FROM staff WHERE id = ?").bind(staff[1]).run();
      return json({ success: true });
    }
    if (request.method === "POST" && url.pathname === "/api/positions") {
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("岗位名称不能为空");
      const posId = crypto.randomUUID(); const subject = await subjectMaps(env.DB); const defaultSubject = subjectId(String(body.default_person || ""), subject);
      const rank = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS rank FROM positions").first()).rank + 1;
      await env.DB.prepare("INSERT INTO positions (id, name, workload, default_staff_id, default_group_id, category, split_allowed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(posId, name, Number(body.workload || 0), defaultSubject.staffId, defaultSubject.groupId, String(body.category || ""), body.split_allowed ? 1 : 0, rank).run();
      return json({ success: true, pos_id: posId });
    }
    const position = url.pathname.match(/^\/api\/positions\/([^/]+)$/);
    if (position && request.method === "PUT") {
      const body = await request.json(); const name = String(body.name || "").trim();
      if (!name) return failure("岗位名称不能为空");
      const subject = await subjectMaps(env.DB); const defaultSubject = subjectId(String(body.default_person || ""), subject);
      const existing = await env.DB.prepare("SELECT id FROM positions WHERE id=?").bind(position[1]).first();
      if (!existing) return failure("岗位不存在", 404);
      const today = shanghaiBusinessDate();
      const synced = await rows(env.DB.prepare(`
        SELECT DISTINCT d.schedule_date FROM schedule_days d JOIN schedule_cells c ON c.schedule_day_id=d.id
        WHERE c.position_id=? AND d.schedule_date>? AND c.status IN ('on','pending')
      `).bind(position[1], today));
      const nextStatus = defaultSubject.staffId || defaultSubject.groupId ? "on" : "pending";
      const statements = [
        env.DB.prepare("UPDATE positions SET name=?, workload=?, default_staff_id=?, default_group_id=?, category=?, split_allowed=? WHERE id=?")
          .bind(name, Number(body.workload || 0), defaultSubject.staffId, defaultSubject.groupId, String(body.category || ""), body.split_allowed ? 1 : 0, position[1]),
        env.DB.prepare(`UPDATE schedule_cells SET status=?, staff_id=?, group_id=? WHERE position_id=? AND status IN ('on','pending') AND schedule_day_id IN (SELECT id FROM schedule_days WHERE schedule_date>?)`)
          .bind(nextStatus, defaultSubject.staffId, defaultSubject.groupId, position[1], today),
      ];
      await env.DB.batch(statements);
      return json({ success: true, synced_days: synced.map((item) => item.schedule_date) });
    }
    if (position && request.method === "DELETE") {
      const inSchedule = await env.DB.prepare("SELECT 1 FROM schedule_cells WHERE position_id = ? LIMIT 1").bind(position[1]).first();
      if (inSchedule) return failure("该岗位已被排班历史引用，不能删除", 409);
      await env.DB.prepare("DELETE FROM positions WHERE id = ?").bind(position[1]).run();
      return json({ success: true });
    }
    if (request.method === "POST" && url.pathname === "/api/positions/reorder") {
      const payload = await request.json(); const ids = Array.isArray(payload) ? payload.map((item) => typeof item === "object" ? item.id : item) : [];
      await env.DB.batch(ids.map((id, index) => env.DB.prepare("UPDATE positions SET sort_order = ? WHERE id = ?").bind(index + 1, id)));
      return json({ success: true });
    }
    const schedule = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})$/);
    if (request.method === "GET" && schedule) return json(await getSchedule(env.DB, schedule[1], schedule[2]));
    if (request.method === "POST" && schedule) {
      const body = await request.json();
      const monthData = body?.schedule ?? body;
      if (!monthData || Array.isArray(monthData) || typeof monthData !== "object") return json({ success: false, msg: "排班数据格式错误" }, { status: 400 });
      try {
        await saveMonth(env.DB, schedule[1], schedule[2], monthData);
      } catch (error) {
        return json({ success: false, msg: error.message || "保存排班失败" }, { status: 400 });
      }
      return json({ success: true, schedule: monthData });
    }
    const scheduleDay = url.pathname.match(/^\/api\/schedule\/(\d{4})\/(\d{1,2})\/day$/);
    if (request.method === "POST" && scheduleDay) {
      const body = await request.json();
      const day = Number(body.day);
      if (!Number.isInteger(day) || day < 1 || !body.pos_id) return json({ success: false, msg: "日期或岗位无效" }, { status: 400 });
      const monthData = await getSchedule(env.DB, scheduleDay[1], scheduleDay[2]);
      const dayData = monthData[String(day)] ||= {};
      if (body.split && typeof body.split === "object") {
        const slots = Object.fromEntries(["am", "pm"].map((slot) => [slot, { status: body.split[slot]?.status || "pending", person: body.split[slot]?.person || "", workload: body.split[slot]?.workload || 0 }]));
        dayData[body.pos_id] = { status: "split", person: slots.am.person || slots.pm.person, slots };
      } else if (["am", "pm"].includes(String(body.slot || "").toLowerCase())) {
        const slots = dayData[body.pos_id]?.slots || { am: { status: "pending", person: "" }, pm: { status: "pending", person: "" } };
        const slot = String(body.slot).toLowerCase(); slots[slot] = { status: body.status || "pending", person: body.person || "", workload: body.workload || 0 };
        dayData[body.pos_id] = { status: "split", person: slots.am.person || slots.pm.person, slots };
      } else dayData[body.pos_id] = { status: body.status || "pending", person: body.person || "" };
      if (body.status === "off" && body.person) dayData._off_persons = [...new Set([...(dayData._off_persons || []), body.person])];
      if (body.status === "on" && body.person) dayData._off_persons = (dayData._off_persons || []).filter((name) => name !== body.person);
      try { await saveMonth(env.DB, scheduleDay[1], scheduleDay[2], monthData); }
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
      current[String(day)] = result.day_data; await saveMonth(env.DB, planDay[1], planDay[2], current);
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
      const preview = buildImportPreview({ year, month, today, staff, positions, groups, current, imported });
      const previewToken = await createImportToken({ year, month, today, current, imported });
      const summary = {
        changed_dates: preview.changed_dates,
        ignored_dates: preview.ignored_dates,
        changes: preview.changes,
        plan_results: preview.plan_results,
        added_count: preview.added_count,
        removed_count: preview.removed_count,
        matched_count: imported.length,
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
        data: preview.schedule[String(day)],
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
        if (cell.status === "split" && cell.slots) for (const slot of ["am", "pm"]) { const item = cell.slots[slot]; if (!item || item.person !== person) continue; if (item.status === "substitute") { cell.slots[slot] = { status: "pending", person: "" }; updated.push({ pos_id: pos.id, slot, person: "", status: "pending", pos_name: pos.name }); } else if (body.person_is_off && ["on", "pending", ""].includes(item.status)) { cell.slots[slot] = { ...item, status: "off" }; updated.push({ pos_id: pos.id, slot, person, status: "off", pos_name: pos.name }); } }
        else if (cell.person === person && cell.status === "substitute") { dayData[pos.id] = { status: "pending", person: "" }; updated.push({ pos_id: pos.id, person: "", status: "pending", pos_name: pos.name }); }
        else if (cell.person === person && body.person_is_off && ["on", "pending", ""].includes(cell.status)) { dayData[pos.id] = { status: "off", person }; updated.push({ pos_id: pos.id, person, status: "off", pos_name: pos.name }); }
      }
      await saveMonth(env.DB, year, month, current); return json({ success: true, updated });
    }
    if (request.method === "POST" && url.pathname === "/api/auto-fill-all") {
      const body = await request.json(); const { year, month, day } = body;
      if (!(year && month && day)) return failure("参数无效");
      const [positions, staff, groups, current] = await Promise.all([getPositions(env.DB), getStaff(env.DB), getGroups(env.DB), getSchedule(env.DB, year, month)]);
      const result = planDaySchedule(positions, staff, groups, { year: Number(year), month: Number(month), day: Number(day), offPersons: current[String(day)]?._off_persons || [], scatterGroups: Boolean(body.scatter_groups), monthSchedule: current });
      current[String(day)] = result.day_data; await saveMonth(env.DB, year, month, current);
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
      const scheduleData = JSON.parse(record.payload); await saveMonth(env.DB, restore[1], restore[2], scheduleData);
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
