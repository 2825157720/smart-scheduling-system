import { planDaySchedule } from "./schedule-core.js";

const norm = (value) => String(value || "").trim();
const uniqueSorted = (values) => [...new Set(values.map(norm).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function shanghaiBusinessDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function normalizeImportPayload(body, staff, maxDay) {
  if (!body || !Array.isArray(body.staff_off_days) || !body.staff_off_days.length) {
    throw new Error("未找到可导入的系统人员");
  }
  if (body.staff_off_days.length > 200) throw new Error("导入人员数量超出限制");
  const staffById = new Map((staff || []).map((item) => [String(item.id), item]));
  const seen = new Set();
  return body.staff_off_days.map((item) => {
    const staffId = norm(item?.staff_id);
    const member = staffById.get(staffId);
    if (!member) throw new Error(`导入人员不存在：${staffId || "空标识"}`);
    if (seen.has(staffId)) throw new Error(`导入文件存在重复人员：${member.name}`);
    seen.add(staffId);
    if (!Array.isArray(item.off_days)) throw new Error(`休假日期格式错误：${member.name}`);
    const offDays = [...new Set(item.off_days.map(Number))].sort((a, b) => a - b);
    if (offDays.some((day) => !Number.isInteger(day) || day < 1 || day > maxDay)) {
      throw new Error(`休假日期超出当月范围：${member.name}`);
    }
    return { staff_id: staffId, name: member.name, off_days: offDays };
  }).sort((a, b) => a.staff_id.localeCompare(b.staff_id));
}

function importedDayDifference(currentOff, imported, day) {
  const before = new Set(currentOff);
  const after = new Set(currentOff);
  const added = [];
  const removed = [];
  for (const member of imported) {
    const shouldBeOff = member.off_days.includes(day);
    const wasOff = before.has(member.name);
    if (shouldBeOff) after.add(member.name);
    else after.delete(member.name);
    if (shouldBeOff && !wasOff) added.push(member.name);
    if (!shouldBeOff && wasOff) removed.push(member.name);
  }
  return { after: uniqueSorted([...after]), added: uniqueSorted(added), removed: uniqueSorted(removed) };
}

function defaultScatterGroups(year, month, day) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 5 || weekday === 6 || weekday === 0;
}

export function buildImportPreview({ year, month, today, staff, positions, groups, current, imported }) {
  const maxDay = new Date(Number(year), Number(month), 0).getDate();
  const schedule = structuredClone(current || {});
  const changedDates = [];
  const ignoredDates = [];
  const changes = [];
  const planResults = [];
  let addedCount = 0;
  let removedCount = 0;

  for (let day = 1; day <= maxDay; day += 1) {
    const currentDay = current?.[String(day)] || {};
    const difference = importedDayDifference(currentDay._off_persons || [], imported, day);
    if (!difference.added.length && !difference.removed.length) continue;
    const date = isoDate(year, month, day);
    if (date <= today) {
      ignoredDates.push(day);
      continue;
    }
    const planned = planDaySchedule(positions, staff, groups, {
      year: Number(year),
      month: Number(month),
      day,
      offPersons: difference.after,
      scatterGroups: defaultScatterGroups(Number(year), Number(month), day),
      monthSchedule: schedule,
    });
    schedule[String(day)] = planned.day_data;
    changedDates.push(day);
    addedCount += difference.added.length;
    removedCount += difference.removed.length;
    changes.push({ day, date, added: difference.added, removed: difference.removed });
    planResults.push({ day, assigned: planned.assigned, failed: planned.failed });
  }

  return {
    schedule,
    changed_dates: changedDates,
    ignored_dates: ignoredDates,
    changes,
    plan_results: planResults,
    added_count: addedCount,
    removed_count: removedCount,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export async function createImportToken({ year, month, today, current, imported }) {
  const canonical = JSON.stringify(stableValue({
    year: Number(year),
    month: Number(month),
    today,
    current,
    imported: imported.map((item) => ({ staff_id: item.staff_id, off_days: item.off_days })),
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyAdminPassword(supplied, expected) {
  if (!expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(supplied || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(expected))),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}
