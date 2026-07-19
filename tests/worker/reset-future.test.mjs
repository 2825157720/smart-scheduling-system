import assert from "node:assert/strict";
import test from "node:test";

import { buildFutureResetSchedule } from "../../src/schedule-core.js";

const positions = [
  { id: "p1", default_person: "甲" },
  { id: "p2", default_person: "" },
];

test("reset preserves history and today while rebuilding only future dates", () => {
  const current = {
    18: { _off_persons: ["甲"], p1: { status: "off", person: "甲" } },
    19: { p1: { status: "substitute", person: "乙" }, p2: { status: "pending", person: "" } },
    20: { _off_persons: ["甲"], p1: { status: "substitute", person: "乙" } },
  };

  const result = buildFutureResetSchedule(positions, {
    year: 2026,
    month: 7,
    today: "2026-07-19",
    current,
  });

  assert.deepEqual(result.schedule[18], current[18]);
  assert.deepEqual(result.schedule[19], current[19]);
  assert.deepEqual(result.schedule[20], {
    p1: { status: "on", person: "甲" },
    p2: { status: "pending", person: "" },
  });
  assert.deepEqual(result.reset_dates, Array.from({ length: 12 }, (_, index) => index + 20));
});

test("reset is a no-op for a past month", () => {
  const current = { 1: { p1: { status: "substitute", person: "乙" } } };
  const result = buildFutureResetSchedule(positions, {
    year: 2026,
    month: 6,
    today: "2026-07-19",
    current,
  });

  assert.deepEqual(result.reset_dates, []);
  assert.deepEqual(result.schedule, current);
});

test("reset rebuilds every date in a future month", () => {
  const result = buildFutureResetSchedule(positions, {
    year: 2026,
    month: 8,
    today: "2026-07-19",
    current: {},
  });

  assert.equal(result.reset_dates.length, 31);
  assert.equal(result.reset_dates[0], 1);
  assert.equal(result.reset_dates.at(-1), 31);
});
