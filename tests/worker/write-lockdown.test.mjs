import assert from "node:assert/strict";
import test from "node:test";

import worker from "../../src/index.js";

const request = (path, method, body) => new Request(`https://example.test${path}`, {
  method,
  headers: body === undefined ? undefined : { "content-type": "application/json" },
  body,
});

test("write lockdown fails closed before parsing an invalid request body", async () => {
  const response = await worker.fetch(
    request("/api/staff", "POST", "{not-json"),
    { DB: { prepare: () => { throw new Error("D1 must not be reached"); } } },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "300");
  assert.deepEqual(await response.json(), {
    success: false,
    msg: "系统正在维护，暂时禁止修改",
  });
});

test("legacy whole-month write is permanently unavailable even when writes are enabled", async () => {
  const response = await worker.fetch(
    request("/api/schedule/2026/8", "POST", "{}"),
    { WRITE_MODE: "enabled" },
  );

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    success: false,
    msg: "整月保存接口已停用，请使用单日排班接口",
  });
});

test("liveness remains available while writes are locked", async () => {
  const response = await worker.fetch(request("/api/live", "GET"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
