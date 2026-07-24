import assert from "node:assert/strict";
import test from "node:test";

import { buildImportPreview, normalizeImportPayload } from "../../src/import-off-days.js";

const staff = [
  { id: "s1", name: "岐峰", group_id: "" },
  { id: "s2", name: "丽彬", group_id: "" },
  { id: "s3", name: "未导入人员", group_id: "" },
];
const positions = [
  { id: "p1", name: "岗位1", workload: 8, default_person: "岐峰", split_allowed: false },
  { id: "p2", name: "岗位2", workload: 8, default_person: "丽彬", split_allowed: false },
  { id: "p3", name: "岗位3", workload: 8, default_person: "未导入人员", split_allowed: false },
];

test("import only changes dates strictly after the Shanghai business date", () => {
  const current = {
    18: { _off_persons: ["岐峰"], p1: { status: "off", person: "岐峰" } },
    19: { _off_persons: ["丽彬"], p2: { status: "off", person: "丽彬" } },
    20: { _off_persons: ["未导入人员"] },
  };
  const normalized = normalizeImportPayload({
    staff_off_days: [
      { staff_id: "s1", off_days: [18, 19, 20] },
      { staff_id: "s2", off_days: [] },
    ],
  }, staff, 31);

  const preview = buildImportPreview({
    year: 2026,
    month: 7,
    today: "2026-07-19",
    staff,
    positions,
    groups: [],
    current,
    imported: normalized,
  });

  assert.deepEqual(preview.changed_dates, [20]);
  assert.deepEqual(preview.ignored_dates, [19]);
  assert.deepEqual(preview.schedule[18], current[18]);
  assert.deepEqual(preview.schedule[19], current[19]);
  assert.deepEqual(preview.schedule[20]._off_persons, ["岐峰", "未导入人员"]);
  assert.equal(preview.added_count, 1);
  assert.equal(preview.removed_count, 0);
});

test("unchanged system staff stay untouched and changed days are fully replanned", () => {
  const current = {
    21: {
      _off_persons: ["丽彬", "未导入人员"],
      p1: { status: "substitute", person: "丽彬" },
      p2: { status: "off", person: "丽彬" },
      p3: { status: "off", person: "未导入人员" },
    },
  };
  const normalized = normalizeImportPayload({
    staff_off_days: [
      { staff_id: "s1", off_days: [] },
      { staff_id: "s2", off_days: [] },
    ],
  }, staff, 31);

  const preview = buildImportPreview({
    year: 2026,
    month: 7,
    today: "2026-07-19",
    staff,
    positions,
    groups: [],
    current,
    imported: normalized,
  });

  assert.deepEqual(preview.changed_dates, [21]);
  assert.deepEqual(preview.schedule[21]._off_persons, ["未导入人员"]);
  assert.deepEqual(preview.schedule[21].p1, { status: "on", person: "岐峰" });
  assert.deepEqual(preview.schedule[21].p2, { status: "on", person: "丽彬" });
  assert.equal(preview.removed_count, 1);
});

test("Friday, Saturday and Sunday use the existing scatter-groups default", () => {
  const normalized = normalizeImportPayload({
    staff_off_days: [{ staff_id: "s1", off_days: [24, 27] }],
  }, staff, 31);
  const preview = buildImportPreview({
    year: 2026,
    month: 7,
    today: "2026-07-19",
    staff,
    positions,
    groups: [],
    current: {},
    imported: normalized,
  });

  assert.equal(preview.schedule[24]._scatter_groups, true); // Friday
  assert.equal(Boolean(preview.schedule[27]._scatter_groups), false); // Monday
});

test("consecutive identical absences rotate at least one fair-pool substitute", () => {
  const fairStaff = [
    ...["A", "B", "C", "D", "E", "F", "G", "X", "Y"].map((name) => ({
      id: `s${name}`,
      name,
      group_id: "",
      can_cpin: true,
      can_jd: true,
      saturday_only: false,
      no_substitute: false,
    })),
  ];
  const fairPositions = [
    ...[
      ["A", 10],
      ["B", 10],
      ["C", 10],
      ["D", 12],
      ["E", 12],
      ["F", 16],
      ["G", 20],
    ].map(([name, workload]) => ({
      id: `p${name}`,
      name: `${name} default`,
      workload,
      default_person: name,
      split_allowed: false,
    })),
    { id: "pX", name: "X cover", workload: 10, default_person: "X", split_allowed: true },
    { id: "pY", name: "Y cover", workload: 10, default_person: "Y", split_allowed: true },
  ];
  const normalized = normalizeImportPayload({
    staff_off_days: [
      { staff_id: "sX", off_days: [28, 29] },
      { staff_id: "sY", off_days: [28, 29] },
    ],
  }, fairStaff, 31);

  const preview = buildImportPreview({
    year: 2026,
    month: 7,
    today: "2026-07-24",
    staff: fairStaff,
    positions: fairPositions,
    groups: [],
    current: {},
    imported: normalized,
  });
  const substitutes = (day) => new Set(fairPositions.flatMap((position) => {
    const cell = preview.schedule[String(day)]?.[position.id];
    if (cell?.status === "split") {
      return ["am", "pm"]
        .map((slot) => cell.slots?.[slot])
        .filter((detail) => detail?.status === "substitute")
        .map((detail) => detail.person);
    }
    return cell?.status === "substitute" ? [cell.person] : [];
  }));

  assert.deepEqual(preview.changed_dates, [28, 29]);
  assert.equal(substitutes(28).size, 4);
  assert.equal(substitutes(29).size, 4);
  assert.notDeepEqual([...substitutes(29)].sort(), [...substitutes(28)].sort());
});

test("payload rejects duplicate and unknown staff identifiers", () => {
  assert.throws(
    () => normalizeImportPayload({ staff_off_days: [
      { staff_id: "s1", off_days: [] },
      { staff_id: "s1", off_days: [20] },
    ] }, staff, 31),
    /重复人员/,
  );
  assert.throws(
    () => normalizeImportPayload({ staff_off_days: [{ staff_id: "missing", off_days: [] }] }, staff, 31),
    /人员不存在/,
  );
});
