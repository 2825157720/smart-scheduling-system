const norm = (value) => String(value || "").trim();
const posList = (positions) => Array.isArray(positions) ? positions : Object.values(positions || {});
const groupNames = (groups) => new Set((groups || []).map((g) => norm(g.name)).filter(Boolean));
const isSplit = (cell) => cell && cell.status === "split" && cell.slots && typeof cell.slots === "object";
const slot = (cell, key) => ({ status: cell?.slots?.[key]?.status || "pending", person: norm(cell?.slots?.[key]?.person), workload: Number(cell?.slots?.[key]?.workload || 0) });
const defaultCell = (pos) => ({ status: norm(pos.default_person) ? "on" : "pending", person: norm(pos.default_person) });
const cellFor = (data, pos) => data?.[pos.id] || defaultCell(pos);

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
function better(next, current) { return next[0] < current[0] - 1e-9 || (Math.abs(next[0] - current[0]) <= 1e-9 && next[1] < current[1] - 1e-9); }
function applySplits(data, positions, staff, groups, day) {
  const all = posList(positions); const groupSet = groupNames(groups); const used = new Set();
  for (const cell of Object.values(data || {})) if (isSplit(cell)) for (const key of ["am", "pm"]) if (slot(cell, key).person) used.add(slot(cell, key).person);
  let loads = new Map((staff || []).map((m) => [norm(m.name), personDayWorkload(m.name, data, all, staff, groups)]));
  while (true) {
    const current = score(loads); if (current[0] <= 0) break; let applied = false;
    const candidates = all.filter((p) => p.split_allowed && (data?._scatter_groups || !groupSet.has(norm(p.default_person)))).sort((a, b) => Number(b.workload || 0) - Number(a.workload || 0));
    for (const pos of candidates) {
      const cell = data[pos.id]; const currentName = norm(cell?.person); if (isSplit(cell) || !["on", "substitute"].includes(cell?.status) || !currentName || used.has(currentName) || currentName === norm(pos.default_person)) continue;
      const choices = (staff || []).filter((m) => canCoverMember(m, pos, data, all, staff, groups, { day, excludeName: currentName, usedNames: used })).sort((a, b) => (loads.get(norm(a.name)) - loads.get(norm(b.name))) || norm(a.name).localeCompare(norm(b.name)));
      if (!choices.length) continue; const partner = norm(choices[0].name); const half = Number(pos.workload || 0) / 2; if (half <= 0) continue;
      const next = new Map(loads); next.set(currentName, Math.max(0, (next.get(currentName) || 0) - half)); next.set(partner, (next.get(partner) || 0) + half);
      if (!better(score(next), current)) continue;
      data[pos.id] = { status: "split", person: currentName, slots: { am: { status: cell.status, person: currentName, workload: half }, pm: { status: "substitute", person: partner, workload: half } } };
      used.add(currentName); used.add(partner); loads = next; applied = true; break;
    }
    if (!applied) break;
  }
}
export function planDaySchedule(positions, staff, groups, { year, month, day, offPersons = [], scatterGroups = false }) {
  const all = posList(positions); const groupsSet = groupNames(groups); const data = buildDayBase(all, offPersons); if (scatterGroups) data._scatter_groups = true;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; const targets = [];
  for (const pos of all) { const def = norm(pos.default_person); const cell = data[pos.id]; if (groupsSet.has(def) ? scatterGroups || groupIsFullyOff(def, data, all, staff, groups) : ["off", "pending"].includes(cell.status)) targets.push(pos); }
  for (const pos of targets) {
    const def = norm(pos.default_person); const preferred = scatterGroups && groupsSet.has(def) ? new Set(groupMemberNames(def, staff, groups)) : new Set();
    const choices = (staff || []).filter((m) => canCoverMember(m, pos, data, all, staff, groups, { day: iso })).sort((a, b) => (personDayWorkload(a.name, data, all, staff, groups) - personDayWorkload(b.name, data, all, staff, groups)) || ((preferred.has(norm(a.name)) ? 0 : 1) - (preferred.has(norm(b.name)) ? 0 : 1)) || norm(a.name).localeCompare(norm(b.name)));
    if (!choices.length) data[pos.id] = { status: "pending", person: "" };
    else { const chosen = norm(choices[0].name); data[pos.id] = { status: def && data[pos.id]?.status === "off" && chosen === def ? "on" : "substitute", person: chosen }; }
  }
  applySplits(data, all, staff, groups, iso); let assigned = 0; let failed = 0;
  for (const pos of all) for (const item of assignments(data, pos)) { if (norm(item.person)) assigned++; else if (item.status === "pending") failed++; }
  return { day_data: data, assigned, failed };
}
