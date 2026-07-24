import assert from "node:assert/strict";
import test from "node:test";

import { parseScheduleMatrix } from "../../static/schedule-import.js";

const systemStaff = [
  { id: "s1", name: "岐峰" },
  { id: "s2", name: "丽彬" },
];

test("parses the selected month across a month boundary and applies name aliases", () => {
  const matrix = [
    [],
    ["", "", "", "7月", "", "8月", ""],
    ["小组", "序号", "工号姓名", 29, 30, 1, 2],
    ["", "", "", "", "", "", ""],
    ["", "", "", "三", "四", "五", "六"],
    ["管控组", 1, "潘岐峰", "√", "休", "年", "门店"],
    ["管控组", 2, "覃丽彬", "休", "√", "年假", "休"],
    ["加盟组", 3, "表外人员", "√", "√", "休", "√"],
    ["", "", "在班人数", 2, 2, 1, 1],
  ];

  const parsed = parseScheduleMatrix(matrix, "商品部2026年", 2026, 8, systemStaff);

  assert.deepEqual(parsed.staff_off_days, [
    { staff_id: "s1", off_days: [1, 2] },
    { staff_id: "s2", off_days: [1, 2] },
  ]);
  assert.deepEqual(parsed.matched.map((item) => item.source_name), ["潘岐峰", "覃丽彬"]);
  assert.deepEqual(parsed.ignored, ["表外人员"]);
  assert.deepEqual(parsed.days, [1, 2]);
});

test("accepts a merged month label anchored one column after day one", () => {
  const matrix = [
    [],
    ["", "", "", "", "8月"],
    ["小组", "序号", "工号姓名", 1, 2],
    [],
    [],
    ["管控组", 1, "潘岐峰", "休", "√"],
  ];
  const parsed = parseScheduleMatrix(matrix, "商品部2026年", 2026, 8, systemStaff);
  assert.deepEqual(parsed.days, [1, 2]);
  assert.deepEqual(parsed.staff_off_days[0].off_days, [1]);
});

test("rejects a source sheet from a different year", () => {
  const matrix = [
    [],
    ["", "", "", "8月"],
    ["小组", "序号", "工号姓名", 1],
    [],
    [],
    ["管控组", 1, "潘岐峰", "休"],
  ];
  assert.throws(() => parseScheduleMatrix(matrix, "商品部2025年", 2026, 8, systemStaff), /年份/);
});

test("rejects duplicate rows that resolve to one system staff member", () => {
  const matrix = [
    [],
    ["", "", "", "8月"],
    ["小组", "序号", "工号姓名", 1],
    [],
    [],
    ["管控组", 1, "潘岐峰", "休"],
    ["管控组", 2, "岐峰", "√"],
  ];
  assert.throws(() => parseScheduleMatrix(matrix, "商品部2026年", 2026, 8, systemStaff), /重复/);
});
