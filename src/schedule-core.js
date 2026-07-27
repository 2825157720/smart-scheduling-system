const norm = (value) => String(value || "").trim();
const FLOAT_EPSILON = 1e-9;
const posList = (positions) => Array.isArray(positions) ? positions : Object.values(positions || {});
const groupNames = (groups) => new Set((groups || []).map((g) => norm(g.name)).filter(Boolean));
const isSplit = (cell) => cell && cell.status === "split" && cell.slots && typeof cell.slots === "object";
const slot = (cell, key) => ({ status: cell?.slots?.[key]?.status || "pending", person: norm(cell?.slots?.[key]?.person), workload: Number(cell?.slots?.[key]?.workload || 0) });
const defaultCell = (pos) => ({ status: norm(pos.default_person) ? "on" : "pending", person: norm(pos.default_person) });
const cellFor = (data, pos) => data?.[pos.id] || defaultCell(pos);

export const FAIRNESS_LOAD_TOLERANCE = 2;
export const FAIRNESS_ROTATION_LOAD_TOLERANCE = 6;
export const AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT = 4;

export function groupMemberNames(name, staff, groups) {
  const group = (groups || []).find((item) => norm(item.name) === norm(name));
  return group ? (staff || []).filter((item) => item.group_id === group.id).map((item) => norm(item.name)).filter(Boolean) : [];
}
function assignments(data, pos) {
  const cell = data?.[pos.id]; const workload = Number(pos.workload || 0);
  if (isSplit(cell)) { const half = workload / 2; return ["am", "pm"].map((key) => ({ ...slot(cell, key), workload: slot(cell, key).workload || half })); }
  return [{ ...cellFor(data, pos), workload }];
}
function active(name, data, positions) {
  return posList(positions).some((pos) => assignments(data, pos).some((item) => norm(item.person) === norm(name) && ["on", "substitute"].includes(item.status)));
}
function off(name, data, positions) {
  const target = norm(name); if (!target) return false;
  if ((data?._off_persons || []).includes(target)) return true;
  let isOff = false; let isActive = false;
  for (const pos of posList(positions)) for (const item of assignments(data, pos)) if (norm(item.person) === target) {
    if (["on", "substitute"].includes(item.status)) isActive = true;
    if (item.status === "off") isOff = true;
  }
  return !isActive && isOff;
}
export function groupActiveMembers(name, data, positions, staff, groups) { return groupMemberNames(name, staff, groups).filter((person) => active(person, data, positions)); }
export function groupIsFullyOff(name, data, positions, staff, groups) { const members = groupMemberNames(name, staff, groups); return members.length > 0 && !groupActiveMembers(name, data, positions, staff, groups).length; }
export function personDayWorkload(name, data, positions, staff, groups) {
  let total = 0; const groupSet = groupNames(groups); const scatter = Boolean(data?._scatter_groups);
  for (const pos of posList(positions)) {
    const defaultPerson = norm(pos.default_person); const cell = data?.[pos.id];
    if (scatter && groupSet.has(defaultPerson) && !isSplit(cell) && ["on", "substitute"].includes(cell?.status) && norm(cell?.person) === defaultPerson) continue;
    if (groupSet.has(defaultPerson) && !scatter && !isSplit(cell)) {
      const members = groupActiveMembers(defaultPerson, data, positions, staff, groups);
      if (members.includes(norm(name)) && members.length) total += Number(pos.workload || 0) / members.length;
    } else for (const item of assignments(data, pos)) if (["on", "substitute"].includes(item.status) && norm(item.person) === norm(name)) total += item.workload;
  }
  return total;
}
export function buildFairnessContext(monthSchedule = {}, day, positions) {
  const targetDay = Number(day);
  const substituteWorkloads = new Map();
  const previousDaySubstitutes = new Set();
  if (!Number.isInteger(targetDay) || targetDay <= 1) return { substituteWorkloads, previousDaySubstitutes };
  const add = (name, workload, isPreviousDay) => {
    const person = norm(name);
    if (!person) return;
    substituteWorkloads.set(person, (substituteWorkloads.get(person) || 0) + Number(workload || 0));
    if (isPreviousDay) previousDaySubstitutes.add(person);
  };
  for (let currentDay = 1; currentDay < targetDay; currentDay += 1) {
    const data = monthSchedule?.[String(currentDay)] || {};
    const isPreviousDay = currentDay === targetDay - 1;
    for (const pos of posList(positions)) {
      const cell = data?.[pos.id];
      if (isSplit(cell)) {
        const fallback = Number(pos.workload || 0) / 2;
        for (const key of ["am", "pm"]) {
          const detail = cell.slots?.[key];
          if (detail?.status !== "substitute") continue;
          const explicit = Number(detail.workload);
          const workload = Number.isFinite(explicit) && explicit !== 0 ? explicit : fallback;
          add(detail.person, workload, isPreviousDay);
        }
      } else if (cell?.status === "substitute") {
        add(cell.person, Number(pos.workload || 0), isPreviousDay);
      }
    }
  }
  return { substituteWorkloads, previousDaySubstitutes };
}
export function rankFairCandidates(candidates, pos, dayData, positions, staff, groups, { preferredNames, fairnessContext } = {}) {
  const preferred = new Set([...(preferredNames || [])].map(norm).filter(Boolean));
  const previous = fairnessContext?.previousDaySubstitutes || new Set();
  const historical = fairnessContext?.substituteWorkloads || new Map();
  const historicalLoad = (name) => historical instanceof Map ? Number(historical.get(name) || 0) : Number(historical?.[name] || 0);
  const rows = (candidates || []).map((member) => ({
    member,
    name: norm(member?.name),
    dayLoad: personDayWorkload(member?.name, dayData, positions, staff, groups),
  }));
  if (!rows.length) return [];
  const minLoad = Math.min(...rows.map((item) => item.dayLoad));
  const baseRows = rows.filter((item) => item.dayLoad <= minLoad + FAIRNESS_LOAD_TOLERANCE + FLOAT_EPSILON);
  const pool = baseRows.some((item) => !previous.has(item.name))
    ? baseRows
    : rows.filter((item) => (
      item.dayLoad <= minLoad + FAIRNESS_LOAD_TOLERANCE + FLOAT_EPSILON
      || (!previous.has(item.name) && item.dayLoad <= minLoad + FAIRNESS_ROTATION_LOAD_TOLERANCE + FLOAT_EPSILON)
    ));
  return pool
    .map((item) => ({ ...item, loadBand: item.dayLoad <= minLoad + FAIRNESS_LOAD_TOLERANCE + FLOAT_EPSILON ? 0 : 1 }))
    .sort((a, b) => (
      (preferred.has(a.name) ? 0 : 1) - (preferred.has(b.name) ? 0 : 1)
      || (previous.has(a.name) ? 1 : 0) - (previous.has(b.name) ? 1 : 0)
      || a.loadBand - b.loadBand
      || historicalLoad(a.name) - historicalLoad(b.name)
      || a.dayLoad - b.dayLoad
      || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    ))
    .map((item) => item.member);
}
export function canCoverMember(member, pos, data, positions, staff, groups, { day, excludeName = "", usedNames = new Set() } = {}) {
  const name = norm(member?.name); const target = norm(pos?.default_person);
  if (!name || name === norm(excludeName) || usedNames.has(name) || member?.no_substitute || name === target || off(name, data, positions)) return false;
  const date = new Date(`${day}T00:00:00`);
  if (member?.saturday_only && date.getDay() !== 6) return false;
  if (pos?.category === "次品" && !member?.can_cpin) return false;
  if (pos?.category === "京东" && !member?.can_jd) return false;
  return norm(data?.[pos?.id]?.person) !== name;
}
export function buildDayBase(positions, offPersons = []) {
  const offSet = new Set(offPersons.map(norm).filter(Boolean)); const result = {};
  if (offSet.size) result._off_persons = [...offSet].sort();
  for (const pos of posList(positions)) { const person = norm(pos.default_person); result[pos.id] = person ? { status: offSet.has(person) ? "off" : "on", person } : { status: "pending", person: "" }; }
  return result;
}
export function buildFutureResetSchedule(positions, { year, month, today, current = {} }) {
  const schedule = { ...current };
  const resetDates = [];
  const days = new Date(Number(year), Number(month), 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date <= today) continue;
    schedule[String(day)] = Object.fromEntries(posList(positions).map((position) => [position.id, {
      status: norm(position.default_person) ? "on" : "pending",
      person: norm(position.default_person),
    }]));
    resetDates.push(day);
  }
  return { schedule, reset_dates: resetDates };
}
function score(loads) { const positive = [...loads.values()].filter((value) => value > 0); if (positive.length <= 1) return [0, 0]; const avg = positive.reduce((a, b) => a + b, 0) / positive.length; return [Math.max(...positive) - Math.min(...positive), Math.sqrt(positive.reduce((sum, v) => sum + (v - avg) ** 2, 0) / positive.length)]; }
function applySplits(data, positions, staff, groups, day, fairnessContext) {
  const all = posList(positions); const groupSet = groupNames(groups); const used = new Set();
  for (const cell of Object.values(data || {})) if (isSplit(cell)) for (const key of ["am", "pm"]) if (slot(cell, key).person) used.add(slot(cell, key).person);
  const loads = new Map((staff || []).map((m) => [norm(m.name), personDayWorkload(m.name, data, all, staff, groups)]));
  const current = score(loads); if (current[0] <= 0) return;
  const candidates = all
    .map((pos, index) => ({ pos, index }))
    .filter(({ pos }) => pos.split_allowed && (data?._scatter_groups || !groupSet.has(norm(pos.default_person))))
    .sort((a, b) => Number(b.pos.workload || 0) - Number(a.pos.workload || 0) || a.index - b.index);
  const proposals = [];
  for (let positionRank = 0; positionRank < candidates.length; positionRank += 1) {
    const pos = candidates[positionRank].pos;
    const cell = data[pos.id]; const currentName = norm(cell?.person);
    if (isSplit(cell) || !["on", "substitute"].includes(cell?.status) || !currentName || used.has(currentName) || currentName === norm(pos.default_person)) continue;
    const preferred = data?._scatter_groups && groupSet.has(norm(pos.default_person)) ? new Set(groupMemberNames(pos.default_person, staff, groups)) : new Set();
    const choices = rankFairCandidates(
      (staff || []).filter((m) => canCoverMember(m, pos, data, all, staff, groups, { day, excludeName: currentName, usedNames: used })),
      pos,
      data,
      all,
      staff,
      groups,
      { preferredNames: preferred, fairnessContext },
    );
    const half = Number(pos.workload || 0) / 2; if (half <= 0) continue;
    for (let candidateRank = 0; candidateRank < choices.length; candidateRank += 1) {
      const partner = norm(choices[candidateRank].name);
      const nextLoads = new Map(loads);
      nextLoads.set(currentName, Math.max(0, (nextLoads.get(currentName) || 0) - half));
      nextLoads.set(partner, (nextLoads.get(partner) || 0) + half);
      const nextScore = score(nextLoads);
      const improvement = current[0] - nextScore[0];
      if (improvement + FLOAT_EPSILON < AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT) continue;
      proposals.push({ pos, cell, currentName, partner, half, nextScore, improvement, positionRank, candidateRank });
      break;
    }
  }
  proposals.sort((a, b) => (
    b.improvement - a.improvement
    || a.nextScore[1] - b.nextScore[1]
    || a.positionRank - b.positionRank
    || a.candidateRank - b.candidateRank
    || (a.partner < b.partner ? -1 : a.partner > b.partner ? 1 : 0)
  ));
  const best = proposals[0]; if (!best) return;
  data[best.pos.id] = {
    status: "split",
    person: best.currentName,
    slots: {
      am: { status: best.cell.status, person: best.currentName, workload: best.half },
      pm: { status: "substitute", person: best.partner, workload: best.half },
    },
  };
}
export function planDaySchedule(positions, staff, groups, { year, month, day, offPersons = [], scatterGroups = false, monthSchedule = {} }) {
  const all = posList(positions); const groupsSet = groupNames(groups); const data = buildDayBase(all, offPersons); if (scatterGroups) data._scatter_groups = true;
  const fairnessContext = buildFairnessContext(monthSchedule, Number(day), all);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; const targets = [];
  for (const pos of all) { const def = norm(pos.default_person); const cell = data[pos.id]; if (groupsSet.has(def) ? scatterGroups || groupIsFullyOff(def, data, all, staff, groups) : ["off", "pending"].includes(cell.status)) targets.push(pos); }
  for (const pos of targets) {
    const def = norm(pos.default_person); const preferred = scatterGroups && groupsSet.has(def) ? new Set(groupMemberNames(def, staff, groups)) : new Set();
    const choices = rankFairCandidates(
      (staff || []).filter((m) => canCoverMember(m, pos, data, all, staff, groups, { day: iso })),
      pos,
      data,
      all,
      staff,
      groups,
      { preferredNames: preferred, fairnessContext },
    );
    if (!choices.length) data[pos.id] = { status: "pending", person: "" };
    else { const chosen = norm(choices[0].name); data[pos.id] = { status: def && data[pos.id]?.status === "off" && chosen === def ? "on" : "substitute", person: chosen }; }
  }
  applySplits(data, all, staff, groups, iso, fairnessContext); let assigned = 0; let failed = 0;
  for (const pos of all) for (const item of assignments(data, pos)) { if (norm(item.person)) assigned++; else if (item.status === "pending") failed++; }
  return { day_data: data, assigned, failed };
}
