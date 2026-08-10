import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../../src/index.js";

const encoder = new TextEncoder();
const TEST_USERNAME = "test-user";
const TEST_PASSWORD = "test-password";
const TEST_SESSION_SECRET = Buffer.alloc(32, 7).toString("base64url");

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
      CREATE TABLE auth_login_attempts (
        attempt_key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        first_failed_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    `);
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }
}

async function testCredential(username = TEST_USERNAME, password = TEST_PASSWORD) {
  const salt = Buffer.alloc(16, 11);
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 50_000, hash: "SHA-256" },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`paiban-login-v1:${username}`));
  return JSON.stringify({
    iterations: 50_000,
    salt: salt.toString("base64url"),
    signature: Buffer.from(signature).toString("base64url"),
  });
}

async function environment() {
  return {
    AUTH_MODE: "enabled",
    AUTH_CREDENTIAL: await testCredential(),
    AUTH_SESSION_SECRET: TEST_SESSION_SECRET,
    WRITE_MODE: "enabled",
    DB: new TestD1(),
    ASSETS: {
      fetch: async () => new Response("app", { headers: { "Cache-Control": "public, max-age=0" } }),
    },
  };
}

function request(path, { method = "GET", body, cookie, origin = true, address = "203.0.113.10" } = {}) {
  const headers = new Headers({ "CF-Connecting-IP": address });
  if (origin) headers.set("Origin", "https://example.test");
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("authentication protects the app and business APIs while liveness stays public", async () => {
  const env = await environment();
  const page = await worker.fetch(request("/", { origin: false }), env);
  assert.equal(page.status, 302);
  assert.equal(page.headers.get("Location"), "/login?next=%2F");

  const api = await worker.fetch(request("/api/staff", { origin: false }), env);
  assert.equal(api.status, 401);
  assert.equal((await api.json()).msg, "请先登录");

  const live = await worker.fetch(request("/api/live", { origin: false }), env);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { ok: true });
});

test("valid login creates a secure session and same-origin writes remain available", async () => {
  const env = await environment();
  const login = await worker.fetch(request("/api/auth/login", {
    method: "POST",
    body: { username: TEST_USERNAME, password: TEST_PASSWORD },
  }), env);
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("Set-Cookie");
  assert.match(setCookie, /^paiban_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";", 1)[0];

  const session = await worker.fetch(request("/api/auth/session", { cookie, origin: false }), env);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { authenticated: true, username: TEST_USERNAME });

  const page = await worker.fetch(request("/", { cookie, origin: false }), env);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Cache-Control"), "private, no-store");

  const crossOriginWrite = await worker.fetch(request("/api/groups", {
    method: "POST",
    body: { name: "" },
    cookie,
    origin: false,
  }), env);
  assert.equal(crossOriginWrite.status, 403);

  const sameOriginWrite = await worker.fetch(request("/api/groups", {
    method: "POST",
    body: { name: "" },
    cookie,
  }), env);
  assert.equal(sameOriginWrite.status, 400);
  assert.equal((await sameOriginWrite.json()).msg, "小组名称不能为空");
});

test("five failed logins trigger a per-source cooldown", async () => {
  const env = await environment();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await worker.fetch(request("/api/auth/login", {
      method: "POST",
      body: { username: TEST_USERNAME, password: "wrong-password" },
    }), env);
    assert.equal(response.status, 401);
  }

  const blocked = await worker.fetch(request("/api/auth/login", {
    method: "POST",
    body: { username: TEST_USERNAME, password: "wrong-password" },
  }), env);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) > 0);

  const stillBlocked = await worker.fetch(request("/api/auth/login", {
    method: "POST",
    body: { username: TEST_USERNAME, password: TEST_PASSWORD },
  }), env);
  assert.equal(stillBlocked.status, 429);
});

test("enabled authentication fails closed when secrets are missing", async () => {
  const env = { AUTH_MODE: "enabled", ASSETS: { fetch: async () => new Response("asset") } };
  const page = await worker.fetch(request("/", { origin: false }), env);
  assert.equal(page.status, 503);
  assert.equal((await page.json()).msg, "登录服务尚未配置");
});
