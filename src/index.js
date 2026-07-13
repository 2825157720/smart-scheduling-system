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
