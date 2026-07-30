import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSubstituteRestrictions } from "../../src/index.js";

test("weekend-only takes precedence when an API payload sends both mutually exclusive restrictions", () => {
  assert.deepEqual(normalizeSubstituteRestrictions({
    saturday_only: true,
    weekend_only: true,
  }), {
    saturdayOnly: false,
    weekendOnly: true,
    noSubstitute: false,
  });
});

test("Saturday-only remains available when weekend-only is not selected", () => {
  assert.deepEqual(normalizeSubstituteRestrictions({
    saturday_only: true,
    weekend_only: false,
  }), {
    saturdayOnly: true,
    weekendOnly: false,
    noSubstitute: false,
  });
});

test("no-substitute takes precedence over both date-limited substitute modes", () => {
  assert.deepEqual(normalizeSubstituteRestrictions({
    saturday_only: true,
    weekend_only: true,
    no_substitute: true,
  }), {
    saturdayOnly: false,
    weekendOnly: false,
    noSubstitute: true,
  });
});

test("an older payload preserves an existing weekend-only setting unless it selects another restriction", () => {
  assert.deepEqual(normalizeSubstituteRestrictions({
    saturday_only: false,
    no_substitute: false,
  }, {
    saturday_only: false,
    weekend_only: true,
    no_substitute: false,
  }), {
    saturdayOnly: false,
    weekendOnly: true,
    noSubstitute: false,
  });
});
