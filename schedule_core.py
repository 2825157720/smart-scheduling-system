from __future__ import annotations

import datetime as _datetime
from typing import Iterable


def _normalize_name(value) -> str:
    return (value or "").strip()


def _group_by_name(groups):
    return {(_normalize_name(group.get("name"))): group for group in groups or [] if _normalize_name(group.get("name"))}


def _group_name_set(groups) -> set[str]:
    return {_normalize_name(group.get("name")) for group in groups or [] if _normalize_name(group.get("name"))}


def _positions_iter(positions) -> list[dict]:
    if isinstance(positions, dict):
        return list(positions.values())
    return list(positions or [])


def _pos_map(positions):
    return {pos.get("id"): pos for pos in _positions_iter(positions) if pos.get("id")}


def _day_cell(day_data, pos_id):
    pos_cell = (day_data or {}).get(pos_id, {})
    if pos_cell:
        return {
            "status": pos_cell.get("status", ""),
            "person": pos_cell.get("person", ""),
        }
    return None


def _default_day_cell(pos):
    default_person = _normalize_name((pos or {}).get("default_person", ""))
    return {
        "status": "on" if default_person else "pending",
        "person": default_person,
    }


def build_day_base(positions, off_persons=None) -> dict:
    off_set = {_normalize_name(name) for name in (off_persons or []) if _normalize_name(name)}
    day_data: dict = {}

    if off_set:
        day_data["_off_persons"] = sorted(off_set)

    for pos in _positions_iter(positions):
        pos_id = pos.get("id")
        if not pos_id:
            continue

        default_person = _normalize_name((pos or {}).get("default_person", ""))
        if default_person and default_person in off_set:
            day_data[pos_id] = {
                "status": "off",
                "person": default_person,
            }
        elif default_person:
            day_data[pos_id] = {
                "status": "on",
                "person": default_person,
            }
        else:
            day_data[pos_id] = {
                "status": "pending",
                "person": "",
            }

    return day_data


def _cell_for_position(day_data, pos):
    cell = _day_cell(day_data, (pos or {}).get("id"))
    return cell if cell is not None else _default_day_cell(pos)


def _is_person_active(name, day_data, positions):
    target = _normalize_name(name)
    if not target:
        return False
    for pos in _positions_iter(positions):
        for assignment in _position_assignments(day_data, pos):
            if _normalize_name(assignment.get("person")) == target and assignment.get("status") in ("on", "substitute"):
                return True
    return False


def _is_person_off(name, day_data):
    target = _normalize_name(name)
    if not target:
        return False
    if target in (day_data or {}).get("_off_persons", []):
        return True
    has_off = False
    has_active = False
    for key, cell in (day_data or {}).items():
        if str(key).startswith("_"):
            continue
        if _is_split_cell(cell):
            for slot in ("am", "pm"):
                slot_cell = _slot_assignment(cell, slot)
                if _normalize_name(slot_cell.get("person")) != target:
                    continue
                status = slot_cell.get("status", "")
                if status in ("on", "substitute"):
                    has_active = True
                elif status == "off":
                    has_off = True
        elif _normalize_name((cell or {}).get("person")) == target:
            status = (cell or {}).get("status", "")
            if status in ("on", "substitute"):
                has_active = True
            elif status == "off":
                has_off = True
    if has_active:
        return False
    return has_off


def group_member_names(group_name, staff, groups) -> list[str]:
    group = _group_by_name(groups).get(_normalize_name(group_name))
    if not group:
        return []
    group_id = group.get("id", "")
    return [_normalize_name(member.get("name")) for member in staff or [] if member.get("group_id") == group_id and _normalize_name(member.get("name"))]


def group_active_members(group_name, day_data, positions, staff, groups) -> list[str]:
    active_members = []
    for name in group_member_names(group_name, staff, groups):
        if _is_person_active(name, day_data, positions):
            active_members.append(name)
    return active_members


def group_is_fully_off(group_name, day_data, positions, staff, groups) -> bool:
    member_names = group_member_names(group_name, staff, groups)
    if not member_names:
        return False
    return not group_active_members(group_name, day_data, positions, staff, groups)


def person_day_workload(name, day_data, positions, staff, groups) -> float:
    total = 0.0
    group_names = _group_name_set(groups)
    active_members_cache: dict[str, list[str]] = {}
    scatter_groups = bool((day_data or {}).get("_scatter_groups"))

    for pos in _positions_iter(positions):
        default_person = _normalize_name((pos or {}).get("default_person"))
        cell = (day_data or {}).get((pos or {}).get("id"))
        if scatter_groups and default_person in group_names and not _is_split_cell(cell):
            status = _normalize_name((cell or {}).get("status"))
            person = _normalize_name((cell or {}).get("person"))
            if status in ("on", "substitute") and person == default_person:
                continue
        if default_person in group_names and not scatter_groups and not _is_split_cell(cell):
            cell = _cell_for_position(day_data, pos)
            active_members = active_members_cache.get(default_person)
            if active_members is None:
                active_members = group_active_members(default_person, day_data, positions, staff, groups)
                active_members_cache[default_person] = active_members
            if name in active_members and active_members:
                total += (pos or {}).get("workload", 0) / len(active_members)
        else:
            for assignment in _position_assignments(day_data, pos):
                if assignment.get("status") in ("on", "substitute") and _normalize_name(assignment.get("person")) == _normalize_name(name):
                    total += assignment.get("workload", 0)
    return float(total)


def _is_split_cell(cell) -> bool:
    return isinstance(cell, dict) and cell.get("status") == "split" and isinstance(cell.get("slots"), dict)


def _slot_assignment(cell, slot):
    slots = (cell or {}).get("slots", {})
    if not isinstance(slots, dict):
        return {"status": "pending", "person": "", "workload": 0.0}
    slot_cell = slots.get(slot, {})
    if not isinstance(slot_cell, dict):
        return {"status": "pending", "person": "", "workload": 0.0}
    return {
        "status": slot_cell.get("status", "pending"),
        "person": _normalize_name(slot_cell.get("person")),
        "workload": float(slot_cell.get("workload", 0) or 0),
    }


def _position_assignments(day_data, pos):
    pos_id = (pos or {}).get("id")
    workload = float((pos or {}).get("workload", 0) or 0)
    cell = (day_data or {}).get(pos_id)
    if _is_split_cell(cell):
        half = workload / 2
        am = _slot_assignment(cell, "am")
        pm = _slot_assignment(cell, "pm")
        return [
            {**am, "workload": am.get("workload") or half},
            {**pm, "workload": pm.get("workload") or half},
        ]
    normalized = _cell_for_position(day_data, pos)
    return [{**normalized, "workload": workload}]


def _split_person_names(day_data) -> set[str]:
    split_names = set()
    for cell in (day_data or {}).values():
        if not _is_split_cell(cell):
            continue
        for slot in ("am", "pm"):
            person = _normalize_name(_slot_assignment(cell, slot).get("person"))
            if person:
                split_names.add(person)
    return split_names


def _load_map(day_data, positions, staff, groups):
    return {
        _normalize_name(member.get("name")): person_day_workload(member.get("name"), day_data, positions, staff, groups)
        for member in staff or []
        if _normalize_name(member.get("name"))
    }


def _load_spread(load_map) -> float:
    positive = [float(val) for val in (load_map or {}).values() if float(val) > 0]
    if len(positive) <= 1:
        return 0.0
    return max(positive) - min(positive)


def _load_std(load_map) -> float:
    positive = [float(val) for val in (load_map or {}).values() if float(val) > 0]
    if len(positive) <= 1:
        return 0.0
    mean = sum(positive) / len(positive)
    variance = sum((val - mean) ** 2 for val in positive) / len(positive)
    return variance ** 0.5


def _is_better_load_score(new_score, current_score, epsilon: float = 1e-9) -> bool:
    new_spread, new_std = new_score
    current_spread, current_std = current_score
    if new_spread < current_spread - epsilon:
        return True
    if abs(new_spread - current_spread) <= epsilon and new_std < current_std - epsilon:
        return True
    return False


def _apply_split_positions(day_data, positions, staff, groups, day_date, used_names=None):
    position_list = _positions_iter(positions)
    group_names = _group_name_set(groups)
    scatter_groups = bool((day_data or {}).get("_scatter_groups"))
    loads = _load_map(day_data, position_list, staff, groups)
    split_names = _split_person_names(day_data)
    if used_names:
        split_names.update(_normalize_name(name) for name in used_names if _normalize_name(name))

    while True:
        current_score = (_load_spread(loads), _load_std(loads))
        current_spread = current_score[0]
        if current_spread <= 0:
            break

        split_candidates = [
            pos for pos in position_list
            if bool(pos.get("split_allowed"))
            and (scatter_groups or _normalize_name((pos or {}).get("default_person", "")) not in group_names)
        ]
        split_candidates.sort(key=lambda pos: float((pos or {}).get("workload", 0) or 0), reverse=True)

        applied = False
        for pos in split_candidates:
            pos_id = pos.get("id")
            if not pos_id:
                continue
            cell = day_data.get(pos_id, {})
            default_person = _normalize_name((pos or {}).get("default_person", ""))
            if _is_split_cell(cell):
                continue
            current_name = _normalize_name((cell or {}).get("person"))
            current_status = (cell or {}).get("status", "")
            if not current_name or current_status not in ("on", "substitute"):
                continue
            if current_name in split_names:
                continue
            if default_person and current_name == default_person:
                continue

            half = float((pos or {}).get("workload", 0) or 0) / 2.0
            if half <= 0:
                continue

            candidates = [
                member for member in staff or []
                if can_cover_member(
                    member,
                    pos,
                    day_data,
                    position_list,
                    staff,
                    groups,
                    day=day_date,
                    exclude_name=current_name,
                    used_names=split_names,
                )
            ]
            if not candidates:
                continue

            candidates.sort(key=lambda member: (loads.get(member["name"], 0.0), member["name"]))
            partner = candidates[0]["name"]
            new_loads = dict(loads)
            new_loads[current_name] = max(0.0, new_loads.get(current_name, 0.0) - half)
            new_loads[partner] = new_loads.get(partner, 0.0) + half

            if not _is_better_load_score((_load_spread(new_loads), _load_std(new_loads)), current_score):
                continue

            day_data[pos_id] = {
                "status": "split",
                "person": current_name,
                "slots": {
                    "am": {"status": current_status, "person": current_name, "workload": half},
                    "pm": {"status": "substitute", "person": partner, "workload": half},
                },
            }
            split_names.add(current_name)
            split_names.add(partner)
            loads = new_loads
            applied = True
            break

        if not applied:
            break


def plan_day_schedule(positions, staff, groups, *, year: int, month: int, day: int, off_persons=None, scatter_groups: bool = False) -> dict:
    position_list = _positions_iter(positions)
    pos_map = _pos_map(position_list)
    group_names = _group_name_set(groups)
    day_data = build_day_base(position_list, off_persons)
    if scatter_groups:
        day_data["_scatter_groups"] = True
    day_date = _datetime.date(year, month, day)

    fill_targets = []
    for pos in position_list:
        pos_id = pos.get("id")
        if not pos_id:
            continue

        default_person = _normalize_name((pos or {}).get("default_person", ""))
        cell = day_data.get(pos_id, {})

        if default_person in group_names:
            if scatter_groups or group_is_fully_off(default_person, day_data, position_list, staff, groups):
                fill_targets.append(pos)
            continue

        if cell.get("status") in ("off", "pending"):
            fill_targets.append(pos)

    for pos in fill_targets:
        pos_id = pos.get("id")
        if not pos_id:
            continue

        default_person = _normalize_name((pos or {}).get("default_person", ""))
        candidates = [
            member
            for member in staff or []
            if can_cover_member(
                member,
                pos,
                day_data,
                position_list,
                staff,
                groups,
                day=day_date,
            )
        ]

        if not candidates:
            day_data[pos_id] = {
                "status": "pending",
                "person": "",
            }
            continue

        preferred_group_members = set()
        if scatter_groups and default_person in group_names:
            preferred_group_members = set(group_member_names(default_person, staff, groups))

        def _candidate_sort_key(member):
            member_name = _normalize_name(member.get("name"))
            load = person_day_workload(member_name, day_data, position_list, staff, groups)
            group_bias = 0 if not preferred_group_members or member_name in preferred_group_members else 1
            return (load, group_bias, member_name)

        candidates.sort(key=_candidate_sort_key)
        chosen_name = candidates[0]["name"]
        chosen_status = "on" if default_person and day_data.get(pos_id, {}).get("status") == "off" and chosen_name == default_person else "substitute"
        day_data[pos_id] = {
            "status": chosen_status,
            "person": chosen_name,
        }

    _apply_split_positions(day_data, position_list, staff, groups, day_date)

    assigned = 0
    failed = 0
    for pid, cell in day_data.items():
        if str(pid).startswith("_"):
            continue
        if _is_split_cell(cell):
            for slot in ("am", "pm"):
                slot_cell = _slot_assignment(cell, slot)
                person = _normalize_name(slot_cell.get("person"))
                status = slot_cell.get("status", "")
                if person:
                    assigned += 1
                elif status == "pending":
                    failed += 1
            continue
        person = _normalize_name((cell or {}).get("person"))
        status = (cell or {}).get("status", "")
        if person:
            assigned += 1
        elif status == "pending":
            failed += 1

    return {
        "day_data": day_data,
        "assigned": assigned,
        "failed": failed,
    }


def can_cover_member(member, pos, day_data, positions, staff, groups, *, day: _datetime.date, exclude_name="", used_names=None) -> bool:
    member_name = _normalize_name((member or {}).get("name"))
    target_default = _normalize_name((pos or {}).get("default_person"))
    if not member_name:
        return False
    if exclude_name and member_name == _normalize_name(exclude_name):
        return False
    if used_names and member_name in used_names:
        return False
    if (member or {}).get("no_substitute"):
        return False
    if member_name == target_default:
        return False
    if _is_person_off(member_name, day_data):
        return False

    if (member or {}).get("saturday_only") and day.weekday() != 5:
        return False
    if (pos or {}).get("category") == "次品" and not (member or {}).get("can_cpin"):
        return False
    if (pos or {}).get("category") == "京东" and not (member or {}).get("can_jd"):
        return False

    current_cell = (day_data or {}).get((pos or {}).get("id"), {})
    if _normalize_name(current_cell.get("person")) == member_name:
        return False

    return True
