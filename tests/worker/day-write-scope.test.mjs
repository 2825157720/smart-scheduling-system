import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../../src/index.js";

class Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params) }; }
  async first() { return this.database.prepare(this.sql).get(...this.params) || null; }
  async run() { const result = this.database.prepare(this.sql).run(...this.params); return { meta: { changes: Number(result.changes) } }; }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec(`
      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, group_id TEXT, can_cpin INTEGER DEFAULT 0, can_jd INTEGER DEFAULT 0, saturday_only INTEGER DEFAULT 0, weekend_only INTEGER DEFAULT 0, no_substitute INTEGER DEFAULT 0);
      CREATE TABLE positions (id TEXT PRIMARY KEY, name TEXT NOT NULL, workload REAL NOT NULL DEFAULT 0, default_staff_id TEXT, default_group_id TEXT, category TEXT NOT NULL DEFAULT '', split_allowed INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE schedule_days (id TEXT PRIMARY KEY, schedule_date TEXT NOT NULL UNIQUE, scatter_groups INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE schedule_cells (id TEXT PRIMARY KEY, schedule_day_id TEXT NOT NULL, position_id TEXT NOT NULL, status TEXT NOT NULL, staff_id TEXT, group_id TEXT, assignment_source TEXT NOT NULL DEFAULT 'legacy');
      CREATE TABLE schedule_slots (id TEXT PRIMARY KEY, schedule_cell_id TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL, staff_id TEXT, group_id TEXT, workload REAL NOT NULL DEFAULT 0);
      CREATE TABLE schedule_day_off_staff (schedule_day_id TEXT NOT NULL, staff_id TEXT NOT NULL);
      CREATE TABLE schedule_day_off_groups (schedule_day_id TEXT NOT NULL, group_id TEXT NOT NULL);
      CREATE TABLE app_revision (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE mutation_audit (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO app_revision (id, revision, updated_at) VALUES (1, 0, '2026-08-01T00:00:00.000Z');
    `);
  }
  prepare(sql) { return new Statement(this.database, sql); }
  async batch(statements) { for (const statement of statements) await statement.run(); }
}

test("single-day update preserves every other day in the month", async () => {
  const DB = new TestD1();
  DB.database.exec(`
    INSERT INTO staff (id, name) VALUES ('s1', '甲');
    INSERT INTO positions (id, name) VALUES ('p1', '岗位');
    INSERT INTO schedule_days (id, schedule_date) VALUES ('d1', '2026-08-01'), ('d2', '2026-08-02');
    INSERT INTO schedule_cells (id, schedule_day_id, position_id, status, staff_id) VALUES ('c1', 'd1', 'p1', 'on', 's1'), ('c2', 'd2', 'p1', 'on', 's1');
  `);
  const response = await worker.fetch(new Request("https://example.test/api/schedule/2026/8/day", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: 1, pos_id: "p1", status: "off", person: "甲" }),
  }), { DB, WRITE_MODE: "enabled" });

  const responseBody = await response.json();
  assert.equal(response.status, 200, JSON.stringify(responseBody));
  assert.equal(DB.database.prepare("SELECT COUNT(*) AS count FROM schedule_days").get().count, 2);
  assert.deepEqual({ ...DB.database.prepare("SELECT revision FROM app_revision WHERE id = 1").get() }, { revision: 1 });
  assert.deepEqual({ ...DB.database.prepare("SELECT revision, action FROM mutation_audit").get() }, { revision: 1, action: "schedule-day" });
  assert.deepEqual({ ...DB.database.prepare(`
    SELECT d.schedule_date, c.status, s.name AS person
    FROM schedule_cells c JOIN schedule_days d ON d.id = c.schedule_day_id LEFT JOIN staff s ON s.id = c.staff_id
    WHERE d.schedule_date = '2026-08-02'
  `).get() }, { schedule_date: "2026-08-02", status: "on", person: "甲" });
});
