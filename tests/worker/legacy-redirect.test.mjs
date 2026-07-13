import assert from "node:assert/strict";
import test from "node:test";

import worker from "../../src/legacy-redirect.js";

test("redirects the legacy URL to the short production hostname", async () => {
  const request = new Request(
    "https://smart-scheduling-system-production.2825157720.workers.dev/api/live?probe=1",
  );

  const response = await worker.fetch(request);

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://paiban.2825157720.workers.dev/api/live?probe=1",
  );
});
