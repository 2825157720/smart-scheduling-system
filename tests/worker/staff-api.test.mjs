import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../../src/index.js";

class D1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.params) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.params) || null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec(`
      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        group_id TEXT,
        can_cpin INTEGER NOT NULL DEFAULT 0,
        can_jd INTEGER NOT NULL DEFAULT 0,
        saturday_only INTEGER NOT NULL DEFAULT 0,
        no_substitute INTEGER NOT NULL DEFAULT 0,
        weekend_only INTEGER NOT NULL DEFAULT 0
          CHECK (weekend_only IN (0, 1))
      );
    `);
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }
}

const request = (path, method = "GET", body) => new Request(`https://example.test${path}`, {
  method,
  headers: body ? { "content-type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

test("staff API preserves omitted legacy fields and enforces the three-way restriction invariant", async () => {
  const DB = new TestD1();
  DB.database.exec(`
    INSERT INTO groups (id, name) VALUES ('g1', '一组');
    INSERT INTO staff (id, name, group_id, can_cpin, can_jd, weekend_only)
    VALUES ('s1', '甲', 'g1', 1, 1, 1);
  `);
  const env = { DB };

  const legacyUpdate = await worker.fetch(request("/api/staff/s1", "PUT", {
    name: "甲更新",
    saturday_only: false,
    no_substitute: false,
  }), env);
  assert.equal(legacyUpdate.status, 200);

  const afterLegacy = DB.database.prepare(
    "SELECT group_id, can_cpin, can_jd, saturday_only, weekend_only, no_substitute FROM staff WHERE id = 's1'",
  ).get();
  assert.deepEqual({ ...afterLegacy }, {
    group_id: "g1",
    can_cpin: 1,
    can_jd: 1,
    saturday_only: 0,
    weekend_only: 1,
    no_substitute: 0,
  });

  const blockedUpdate = await worker.fetch(request("/api/staff/s1", "PUT", {
    name: "甲更新",
    saturday_only: true,
    weekend_only: true,
    no_substitute: true,
  }), env);
  assert.equal(blockedUpdate.status, 200);

  const staffResponse = await worker.fetch(request("/api/staff"), env);
  const staff = await staffResponse.json();
  assert.equal(staff[0].group_name, "一组");
  assert.equal(staff[0].saturday_only, false);
  assert.equal(staff[0].weekend_only, false);
  assert.equal(staff[0].no_substitute, true);
});

test("staff create normalizes conflicting weekend and Saturday values before D1 insert", async () => {
  const DB = new TestD1();
  const response = await worker.fetch(request("/api/staff", "POST", {
    name: "乙",
    saturday_only: true,
    weekend_only: true,
    no_substitute: false,
  }), { DB });

  assert.equal(response.status, 200);
  const row = DB.database.prepare(
    "SELECT saturday_only, weekend_only, no_substitute FROM staff WHERE name = '乙'",
  ).get();
  assert.deepEqual({ ...row }, {
    saturday_only: 0,
    weekend_only: 1,
    no_substitute: 0,
  });
});
