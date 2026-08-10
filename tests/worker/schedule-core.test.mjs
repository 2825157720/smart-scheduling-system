import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT,
  FAIRNESS_LOAD_TOLERANCE,
  FAIRNESS_ROTATION_LOAD_TOLERANCE,
  buildFairnessContext,
  canCoverMember,
  planDaySchedule,
  planPositionAssignment,
  personDayWorkload,
  rankFairCandidates,
} from "../../src/schedule-core.js";

const member = (name) => ({
  id: `s-${name}`,
  name,
  group_id: "",
  can_cpin: true,
  can_jd: true,
  saturday_only: false,
  weekend_only: false,
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

test("position refresh restores an available new default instead of keeping a stale substitute", () => {
  const target = position("京东中", 2, { id: "p-jd", default_person: "赵创", category: "京东" });
  const staff = [member("赵创"), member("龙泽")];
  const dayData = {
    "p-jd": { status: "substitute", person: "龙泽" },
  };
  assert.deepEqual(planPositionAssignment(target, [target], staff, [], {
    year: 2026,
    month: 8,
    day: 8,
    dayData,
    monthSchedule: { "8": dayData },
  }), { status: "on", person: "赵创" });
});

test("weekend-only substitutes are eligible Friday through Sunday while Saturday-only remains Saturday-only", () => {
  const target = position("Target", 8);
  const positions = [target];
  const weekendMember = { ...member("Weekend"), weekend_only: true };
  const saturdayMember = { ...member("Saturday"), saturday_only: true };
  const canCover = (candidate, day) => canCoverMember(
    candidate,
    target,
    {},
    positions,
    [weekendMember, saturdayMember],
    [],
    { day },
  );

  for (const [day, expected] of [
    ["2026-08-06", false],
    ["2026-08-07", true],
    ["2026-08-08", true],
    ["2026-08-09", true],
    ["2026-08-10", false],
  ]) {
    assert.equal(canCover(weekendMember, day), expected, `weekend-only eligibility for ${day}`);
  }
  assert.equal(canCover(saturdayMember, "2026-08-07"), false);
  assert.equal(canCover(saturdayMember, "2026-08-08"), true);
  assert.equal(canCover(saturdayMember, "2026-08-09"), false);
  assert.equal(canCover({ ...weekendMember, saturday_only: true }, "2026-08-07"), true);
});

test("weekend-only eligibility stays synchronized with adjacent-day fairness rotation", () => {
  const staff = [
    { ...member("A周末"), weekend_only: true },
    member("B普通"),
  ];
  const positions = [position("空岗", 8, { default_person: "" })];
  const monthSchedule = {};
  const assigned = [];

  for (const day of [7, 8, 9, 10]) {
    const result = planDaySchedule(positions, staff, [], {
      year: 2026,
      month: 8,
      day,
      monthSchedule,
    });
    monthSchedule[String(day)] = result.day_data;
    assigned.push(result.day_data["p-空岗"].person);
  }

  assert.deepEqual(assigned, ["A周末", "B普通", "A周末", "B普通"]);
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

test("low workload positions use each eligible substitute once before repeating", () => {
  const staff = ["A", "B", "C"].map(member);
  const positions = [
    position("A", 10),
    position("B", 12),
    position("C", 12),
    position("京东中", 2, { default_person: "", category: "京东" }),
    position("京东北", 2, { default_person: "", category: "京东" }),
    position("京东南", 2, { default_person: "", category: "京东" }),
    position("京东西", 2, { default_person: "", category: "京东" }),
  ];
  const result = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 8,
    day: 2,
    monthSchedule: {
      1: {
        "p-京东中": { status: "substitute", person: "B" },
        "p-京东北": { status: "substitute", person: "C" },
      },
    },
  });

  assert.deepEqual(
    ["p-京东中", "p-京东北", "p-京东南", "p-京东西"].map((id) => result.day_data[id].person),
    ["A", "B", "C", "A"],
  );
});

test("repeat rounds stay balanced after every eligible substitute has already worked", () => {
  const staff = ["A", "B", "C"].map(member);
  const positions = [
    position("A", 10), position("B", 10), position("C", 10),
    position("A-1", 10), position("A-2", 8),
    position("B-1", 10), position("B-2", 10), position("B-3", 12),
    position("C-1", 10), position("C-2", 10),
    position("京东中", 2, { category: "京东" }),
    position("京东北", 2, { category: "京东" }),
    position("京东南", 2, { category: "京东" }),
  ];
  const dayData = Object.fromEntries(positions.map((pos) => [pos.id, { status: "pending", person: "" }]));
  for (const name of ["A", "B", "C"]) dayData[`p-${name}`] = { status: "on", person: name };
  for (const [id, name] of [["A-1", "A"], ["A-2", "A"], ["B-1", "B"], ["B-2", "B"], ["B-3", "B"], ["C-1", "C"], ["C-2", "C"]]) {
    dayData[`p-${id}`] = { status: "substitute", person: name };
  }
  const fairnessContext = {
    previousDaySubstitutes: new Set(["A", "B"]),
    substituteWorkloads: new Map(),
  };
  const assignments = [];
  for (const id of ["京东中", "京东北", "京东南"]) {
    const pos = positions.find((item) => item.id === `p-${id}`);
    const chosen = rankFairCandidates(staff, pos, dayData, positions, staff, [], { fairnessContext })[0].name;
    dayData[pos.id] = { status: "substitute", person: chosen };
    assignments.push(chosen);
  }

  assert.deepEqual(assignments, ["A", "C", "B"]);
  assert.equal(new Set(assignments).size, 3);
  assert.equal(personDayWorkload("A", dayData, positions, staff, []), 30);
  assert.equal(personDayWorkload("C", dayData, positions, staff, []), 32);
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

test("automatic split requires at least four points of spread improvement", () => {
  const staff = [
    member("A"),
    { ...member("B"), no_substitute: true },
    member("C"),
  ];
  const plan = (workload) => planDaySchedule([
    position("Target", workload, { default_person: "", split_allowed: true }),
    position("B", 1),
  ], staff, [], {
    year: 2026,
    month: 8,
    day: 3,
  });

  const exact = plan(8);
  const below = plan(7.98);

  assert.equal(AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT, 4);
  assert.equal(exact.day_data["p-Target"].status, "split");
  assert.equal(below.day_data["p-Target"].status, "substitute");
});

test("automatic split does not run for standard deviation improvement alone", () => {
  const result = planDaySchedule([
    position("Target", 4, { default_person: "", split_allowed: true }),
    position("Light", 3, { default_person: "" }),
  ], ["A", "B", "C", "D"].map(member), [], {
    year: 2026,
    month: 8,
    day: 3,
  });

  assert.equal(result.day_data["p-Target"].status, "substitute");
});

test("automatic split applies only the best proposal of the day", () => {
  const staff = ["A", "B", "C", "D", "E", "F"].map(member);
  const positions = [
    position("A", 4),
    position("B", 11),
    position("C", 9),
    position("D", 3),
    position("E", 5),
    position("F", 10),
    position("T1", 12, { default_person: "", split_allowed: true }),
    position("T2", 12, { default_person: "", split_allowed: true }),
  ];

  const first = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 8,
    day: 3,
  });
  const repeated = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 8,
    day: 3,
  });
  const splitIds = positions
    .filter((pos) => first.day_data[pos.id].status === "split")
    .map((pos) => pos.id);

  assert.deepEqual(splitIds, ["p-T2"]);
  assert.equal(first.day_data["p-T2"].slots.am.person, "A");
  assert.equal(first.day_data["p-T2"].slots.pm.person, "E");
  assert.deepEqual(first.day_data, repeated.day_data);
});

test("consecutive planning keeps one split and rotates both split workers", () => {
  const staff = ["A", "B", "C", "D", "E"].map((name) => ({
    ...member(name),
    no_substitute: name === "B",
  }));
  const positions = [
    position("Target", 8, { default_person: "", split_allowed: true }),
    position("B", 1),
  ];
  const day1 = {
    "p-Target": {
      status: "split",
      slots: {
        am: { status: "substitute", person: "A", workload: 4 },
        pm: { status: "substitute", person: "C", workload: 4 },
      },
    },
    "p-B": { status: "on", person: "B" },
  };
  const day2 = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 8,
    day: 2,
    monthSchedule: { 1: day1 },
  });
  const repeated = planDaySchedule(positions, staff, [], {
    year: 2026,
    month: 8,
    day: 2,
    monthSchedule: { 1: day1 },
  });
  const splitCells = Object.values(day2.day_data).filter((cell) => cell?.status === "split");
  const workers = new Set(["am", "pm"].map((key) => splitCells[0].slots[key].person));

  assert.equal(splitCells.length, 1);
  assert.deepEqual(workers, new Set(["D", "E"]));
  assert.deepEqual(day2.day_data, repeated.day_data);
});
