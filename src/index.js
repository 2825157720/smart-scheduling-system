const json = (body, init = {}) => Response.json(body, init);
const rows = async (statement) => (await statement.all()).results;
const now = () => new Date().toISOString();

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
    ORDER BY p.id
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
  return result;
}

async function getMemo(db, id = "global") {
  const row = await db.prepare("SELECT content, updated_at FROM memos WHERE id = ?").bind(id).first();
  return row || { content: "", updated_at: "" };
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
    const dayId = `day_${date}`;
    statements.push(db.prepare("INSERT INTO schedule_days (id, schedule_date, scatter_groups) VALUES (?, ?, ?)").bind(dayId, date, data._scatter_groups ? 1 : 0));
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
    if (request.method === "GET" && url.pathname === "/api/groups") return json(await getGroups(env.DB));
    if (request.method === "GET" && url.pathname === "/api/staff") return json(await getStaff(env.DB));
    if (request.method === "GET" && url.pathname === "/api/positions") return json(await getPositions(env.DB));
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
    const hiddenDays = url.pathname.match(/^\/api\/hidden-days\/(\d{4})\/(\d{1,2})$/);
    if (request.method === "GET" && hiddenDays) {
      const prefix = `${hiddenDays[1]}-${String(hiddenDays[2]).padStart(2, "0")}`;
      const values = await rows(env.DB.prepare("SELECT schedule_date FROM hidden_days WHERE schedule_date LIKE ? ORDER BY schedule_date").bind(`${prefix}-%`));
      return json(values.map((item) => Number(item.schedule_date.slice(-2))));
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
