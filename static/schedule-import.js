const NAME_ALIASES = Object.freeze({
  "潘岐峰": "岐峰",
  "覃丽彬": "丽彬",
  "陆显鹏": "显鹏",
  "吴绍基": "绍基",
  "崔盼": "盼盼",
});
const OFF_MARKERS = new Set(["休", "年", "年假", "门店"]);
const norm = (value) => String(value ?? "").replace(/\s+/g, "").trim();

function sourceYear(sheetName) {
  const match = String(sheetName || "").match(/((?:19|20)\d{2})\s*年/);
  return match ? Number(match[1]) : null;
}

function headerLocation(matrix) {
  for (let row = 0; row < Math.min(matrix.length, 20); row += 1) {
    const values = matrix[row] || [];
    const column = values.findIndex((value) => ["工号姓名", "姓名"].includes(norm(value)));
    if (column >= 0) return { row, column };
  }
  throw new Error("未找到“工号姓名”表头，请确认使用原始排休表");
}

function monthMarkers(matrix, headerRow, headerValues) {
  const rawMarkers = new Map();
  const maxColumn = headerValues.length - 1;
  for (let row = Math.max(0, headerRow - 4); row < headerRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1) {
      const match = norm(matrix[row]?.[column]).match(/^(\d{1,2})月$/);
      if (match) rawMarkers.set(column, Number(match[1]));
    }
  }
  const markers = new Map();
  for (const [column, month] of rawMarkers) {
    const nearbyDayOne = [column, column - 1, column + 1, column - 2, column + 2]
      .find((candidate) => candidate >= 0 && Number(norm(headerValues[candidate])) === 1);
    markers.set(nearbyDayOne ?? column, month);
  }
  return markers;
}

export function parseScheduleMatrix(matrix, sheetName, targetYear, targetMonth, systemStaff, { requireCompleteMonth = false } = {}) {
  if (!Array.isArray(matrix)) throw new Error("工作表格式无效");
  const year = sourceYear(sheetName);
  if (!year) throw new Error("工作表名称中未找到年份");
  if (year !== Number(targetYear)) throw new Error(`文件年份为 ${year}，当前选择的是 ${targetYear} 年`);

  const header = headerLocation(matrix);
  const headerValues = matrix[header.row] || [];
  const markers = monthMarkers(matrix, header.row, headerValues);
  const dateColumns = [];
  let activeMonth = null;
  for (let column = header.column + 1; column < headerValues.length; column += 1) {
    if (markers.has(column)) activeMonth = markers.get(column);
    const day = Number(norm(headerValues[column]));
    if (activeMonth === Number(targetMonth) && Number.isInteger(day) && day >= 1 && day <= 31) {
      dateColumns.push({ column, day });
    }
  }
  if (!dateColumns.length) throw new Error(`文件中未找到 ${targetMonth} 月日期列`);
  const days = dateColumns.map((item) => item.day);
  if (new Set(days).size !== days.length) throw new Error(`${targetMonth} 月存在重复日期列`);
  days.sort((a, b) => a - b);
  if (requireCompleteMonth) {
    const maxDay = new Date(Number(targetYear), Number(targetMonth), 0).getDate();
    const missing = Array.from({ length: maxDay }, (_, index) => index + 1).filter((day) => !days.includes(day));
    if (missing.length) throw new Error(`${targetMonth} 月缺少日期列：${missing.join("、")}`);
  }

  const staffByName = new Map((systemStaff || []).map((item) => [norm(item.name), item]));
  const matched = [];
  const ignored = [];
  const staffOffDays = [];
  const seenStaff = new Set();
  for (let row = header.row + 1; row < matrix.length; row += 1) {
    const values = matrix[row] || [];
    const sourceName = norm(values[header.column]);
    if (!sourceName || !dateColumns.some(({ column }) => norm(values[column]))) continue;
    if (/人数|合计|总计/.test(sourceName)) continue;
    const systemName = NAME_ALIASES[sourceName] || sourceName;
    const member = staffByName.get(norm(systemName));
    if (!member) {
      if (!ignored.includes(sourceName)) ignored.push(sourceName);
      continue;
    }
    if (seenStaff.has(String(member.id))) throw new Error(`文件中存在重复人员：${systemName}`);
    seenStaff.add(String(member.id));
    const offDays = dateColumns
      .filter(({ column }) => OFF_MARKERS.has(norm(values[column])))
      .map(({ day }) => day)
      .sort((a, b) => a - b);
    staffOffDays.push({ staff_id: String(member.id), off_days: offDays });
    matched.push({ source_name: sourceName, system_name: member.name, staff_id: String(member.id) });
  }
  if (!staffOffDays.length) throw new Error("文件中没有匹配到排班系统人员");
  staffOffDays.sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)));
  matched.sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)));
  return { year, month: Number(targetMonth), days, staff_off_days: staffOffDays, matched, ignored };
}

export async function readScheduleWorkbook(file, targetYear, targetMonth, systemStaff) {
  if (!globalThis.XLSX) throw new Error("Excel 解析组件未加载，请刷新页面后重试");
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = globalThis.XLSX.read(buffer, { type: "array", cellDates: false });
  } catch (error) {
    throw new Error("文件无法读取，可能仍受绿盾加密；请在 Excel 中另存为普通 .xlsx 后重试");
  }
  const preferred = workbook.SheetNames.filter((name) => sourceYear(name) === Number(targetYear));
  const candidates = preferred.length ? preferred : workbook.SheetNames;
  const errors = [];
  for (const sheetName of candidates) {
    try {
      const matrix = globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      return parseScheduleMatrix(matrix, sheetName, targetYear, targetMonth, systemStaff, { requireCompleteMonth: true });
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(errors[0] || "未找到可识别的排休工作表");
}

if (typeof window !== "undefined") {
  window.ScheduleImport = Object.freeze({ parseScheduleMatrix, readScheduleWorkbook, NAME_ALIASES });
}
