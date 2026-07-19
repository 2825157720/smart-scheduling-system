import fs from "node:fs";

import XLSX from "../static/vendor/xlsx.full.min.js";
import { parseScheduleMatrix } from "../static/schedule-import.js";

const filePath = process.argv[2];
const year = Number(process.argv[3] || new Date().getFullYear());
const months = (process.argv[4] || "1,2,3,4,5,6,7,8,9,10,11,12").split(",").map(Number);
const staffUrl = process.argv[5] || "https://ief666.top/api/staff";
const debug = process.argv.includes("--debug");
if (!filePath) throw new Error("用法：node scripts/verify-schedule-import.mjs <xlsx路径> [年份] [月份列表] [人员接口]");

const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: false });
const staffResponse = await fetch(staffUrl);
if (!staffResponse.ok) throw new Error(`人员接口读取失败：HTTP ${staffResponse.status}`);
const staff = await staffResponse.json();
const sheetName = workbook.SheetNames.find((name) => new RegExp(`${year}年`).test(name));
if (!sheetName) throw new Error(`未找到包含 ${year}年的工作表`);
const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
if (debug) {
  for (let row = 0; row < Math.min(matrix.length, 12); row += 1) {
    const selected = (matrix[row] || []).map((value, column) => ({ column, value: String(value).trim() }))
      .filter((item) => item.value && (/月$/.test(item.value) || item.value === "工号姓名" || item.value === "1"));
    if (selected.length) process.stdout.write(`debug row=${row} ${JSON.stringify(selected)}\n`);
  }
}

for (const month of months) {
  const parsed = parseScheduleMatrix(matrix, sheetName, year, month, staff, { requireCompleteMonth: true });
  const offCount = parsed.staff_off_days.reduce((sum, item) => sum + item.off_days.length, 0);
  process.stdout.write(`${JSON.stringify({
    month,
    sheet_name: sheetName,
    day_columns: parsed.days.length,
    matched: parsed.matched.map((item) => `${item.source_name}->${item.system_name}`),
    ignored: parsed.ignored,
    off_count: offCount,
  })}\n`);
}
