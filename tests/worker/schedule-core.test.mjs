import assert from "node:assert/strict";
import test from "node:test";

import {
  FAIRNESS_LOAD_TOLERANCE,
  FAIRNESS_ROTATION_LOAD_TOLERANCE,
  buildFairnessContext,
  planDaySchedule,
  rankFairCandidates,
} from "../../src/schedule-core.js";

const member = (name) => ({
  id: `s-${name}`,
  name,
  group_id: "",
  can_cpin: true,
  can_jd: true,
  saturday_only: false,
  no_substitute: false,
});

const position = (name, workload, extra = {}) => ({
  id: `p-${name}`,
  name: `${name}岗位`,
  workload,
  default_person: name,
  split_allowed: false,
  ...extra,
});

test("base fair candidate pool includes +2 but excludes +2.01 when a fresh base candidate exists", () => {
  const staff = ["甲", "乙", "丙"].map(member);
  const positions = [
    position("甲", 10),
    position("乙", 12),
    position("丙", 12.01),
  ];
  const dayData = Object.fromEntries(positions.map((pos) => [
    pos.id,
    { status: "on", person: pos.default_person },
  ]));

  const ranked = rankFairCandidates(
    [...staff].reverse(),
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
  );

  assert.equal(FAIRNESS_LOAD_TOLERANCE, 2);
  assert.equal(FAIRNESS_ROTATION_LOAD_TOLERANCE, 6);
  assert.deepEqual(ranked.map((item) => item.name), ["甲", "乙"]);
});

test("rotation pool admits a fresh +6 candidate but excludes +6.01 when base candidates worked yesterday", () => {
  const staff = ["低10", "低12", "旧16", "新16", "新16.01"].map(member);
  const positions = [
    position("低10", 10),
    position("低12", 12),
    position("旧16", 16),
    position("新16", 16),
    position("新16.01", 16.01),
  ];
  const dayData = Object.fromEntries(positions.map((pos) => [
    pos.id,
    { status: "on", person: pos.default_person },
  ]));
  const ranked = rankFairCandidates(
    staff,
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
    {
      fairnessContext: {
        previousDaySubstitutes: new Set(["低10", "低12", "旧16"]),
        substituteWorkloads: new Map(),
      },
    },
  );

  assert.deepEqual(ranked.map((item) => item.name), ["新16", "低10", "低12"]);
});

test("a fresh base candidate prevents unnecessary expansion to +6", () => {
  const staff = ["旧10", "新12", "新16"].map(member);
  const positions = [
    position("旧10", 10),
    position("新12", 12),
    position("新16", 16),
  ];
  const dayData = Object.fromEntries(positions.map((pos) => [
    pos.id,
    { status: "on", person: pos.default_person },
  ]));
  const ranked = rankFairCandidates(
    staff,
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
    {
      fairnessContext: {
        previousDaySubstitutes: new Set(["旧10"]),
        substituteWorkloads: new Map([["新12", 100], ["新16", 0]]),
      },
    },
  );

  assert.deepEqual(ranked.map((item) => item.name), ["新12", "旧10"]);
});

test("fairness context counts weighted substitutes before the target day", () => {
  const positions = [
    position("整岗", 10),
    position("拆分", 8, { split_allowed: true }),
  ];
  const monthSchedule = {
    1: {
      "p-整岗": { status: "substitute", person: "甲" },
      "p-拆分": {
        status: "split",
        slots: {
          am: { status: "substitute", person: "乙", workload: 3 },
          pm: { status: "substitute", person: "丙", workload: 0 },
        },
      },
    },
    2: {
      "p-整岗": { status: "substitute", person: "丁" },
      "p-拆分": {
        status: "split",
        slots: {
          am: { status: "on", person: "整岗", workload: 5.5 },
          pm: { status: "substitute", person: "乙", workload: 2.5 },
        },
      },
    },
    3: {
      "p-整岗": { status: "substitute", person: "不应统计" },
    },
  };

  const context = buildFairnessContext(monthSchedule, 3, positions);

  assert.deepEqual(
    Object.fromEntries(context.substituteWorkloads),
    { 甲: 10, 乙: 5.5, 丙: 4, 丁: 10 },
  );
  assert.deepEqual([...context.previousDaySubstitutes].sort(), ["丁", "乙"].sort());
});

test("ranking prefers group members, then fresh and historically lighter substitutes", () => {
  const staff = ["甲", "乙", "丙", "丁"].map(member);
  const positions = staff.map((item) => position(item.name, 10));
  const dayData = Object.fromEntries(positions.map((pos) => [
    pos.id,
    { status: "on", person: pos.default_person },
  ]));
  const fairnessContext = {
    previousDaySubstitutes: new Set(["甲", "乙"]),
    substituteWorkloads: new Map([
      ["甲", 2],
      ["乙", 8],
      ["丙", 9],
      ["丁", 1],
    ]),
  };

  const first = rankFairCandidates(
    [staff[2], staff[1], staff[3], staff[0]],
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
    { preferredNames: new Set(["丙"]), fairnessContext },
  );
  const second = rankFairCandidates(
    [staff[2], staff[1], staff[3], staff[0]],
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
    { preferredNames: new Set(["丙"]), fairnessContext },
  );

  assert.deepEqual(first.map((item) => item.name), ["丙", "丁", "甲", "乙"]);
  assert.deepEqual(second.map((item) => item.name), first.map((item) => item.name));
});

test("a sole fair candidate remains available even after substituting yesterday", () => {
  const staff = [member("甲")];
  const positions = [position("甲", 10)];
  const dayData = { "p-甲": { status: "on", person: "甲" } };
  const ranked = rankFairCandidates(
    staff,
    position("缺勤", 10),
    dayData,
    positions,
    staff,
    [],
    {
      fairnessContext: {
        previousDaySubstitutes: new Set(["甲"]),
        substituteWorkloads: new Map([["甲", 20]]),
      },
    },
  );

  assert.deepEqual(ranked.map((item) => item.name), ["甲"]);
});

test("split planning tries the next fair candidate when the first does not improve balance", () => {
  const staff = ["A", "B", "C", "X"].map(member);
  const positions = [
    position("A", 8),
    position("B", 10),
    position("C", 8),
    position("X", 4, { split_allowed: true }),
  ];
  const monthSchedule = {
    1: {
      "p-B": { status: "substitute", person: "C" },
      "p-X": {
        status: "split",
        slots: {
          am: { status: "substitute", person: "B", workload: 1 },
          pm: { status: "on", person: "X", workload: 3 },
        },
      },
    },
  };
  for (let day = 2; day <= 8; day += 1) {
    monthSchedule[day] = { "p-B": { status: "substitute", person: "C" } };
  }

  const result = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 7,
    day: 10,
    offPersons: ["X"],
    monthSchedule,
  });

  assert.equal(result.day_data["p-X"].status, "split");
  assert.equal(result.day_data["p-X"].slots.am.person, "A");
  assert.equal(result.day_data["p-X"].slots.pm.person, "C");
});

test("identical consecutive absences repeat at most one of four split substitutes", () => {
  const candidateLoads = [
    ["A", 10],
    ["B", 10],
    ["C", 10],
    ["D", 12],
    ["E", 12],
    ["F", 16],
    ["G", 20],
  ];
  const staff = candidateLoads.map(([name]) => member(name));
  const positions = [
    ...candidateLoads.map(([name, workload]) => position(name, workload)),
    position("X", 10, { default_person: "", split_allowed: true }),
    position("Y", 10, { default_person: "", split_allowed: true }),
  ];
  const args = {
    year: 2026,
    month: 7,
    offPersons: ["X", "Y"],
  };

  const day28 = planDaySchedule(positions, staff, [], { ...args, day: 28 });
  day28.day_data["p-X"] = {
    status: "split",
    slots: {
      am: { status: "substitute", person: "A", workload: 5 },
      pm: { status: "substitute", person: "B", workload: 5 },
    },
  };
  day28.day_data["p-Y"] = {
    status: "split",
    slots: {
      am: { status: "substitute", person: "C", workload: 5 },
      pm: { status: "substitute", person: "G", workload: 5 },
    },
  };
  const day29 = planDaySchedule(positions, staff, [], {
    ...args,
    day: 29,
    monthSchedule: { 28: day28.day_data },
  });
  const substitutes = (data) => new Set(positions.flatMap((pos) => {
    const cell = data[pos.id];
    if (cell?.status === "split") {
      return ["am", "pm"]
        .map((key) => cell.slots?.[key])
        .filter((detail) => detail?.status === "substitute")
        .map((detail) => detail.person);
    }
    return cell?.status === "substitute" ? [cell.person] : [];
  }));
  const first = substitutes(day28.day_data);
  const second = substitutes(day29.day_data);

  assert.equal(first.size, 4);
  assert.equal(second.size, 4);
  assert.ok([...second].filter((name) => first.has(name)).length <= 1);
});
