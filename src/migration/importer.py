"""Convert the legacy Supabase JSON-document snapshot into D1 seed SQL."""
from __future__ import annotations

import json
import re
from csv import DictReader
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


_CELL_STATUSES = {"on", "off", "pending", "substitute", "split"}
_SLOT_STATUSES = _CELL_STATUSES - {"split"}


@dataclass
class ImportValidationError(ValueError):
    code: str
    detail: str

    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


def _q(value: object | None) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _bool(value: object) -> int:
    return 1 if bool(value) else 0


def _as_list(value: object) -> list[dict]:
    return value if isinstance(value, list) else []


def _assignment_id(person: object, staff_ids: Mapping[str, str], group_ids: Mapping[str, str]) -> tuple[str | None, str | None]:
    name = str(person or "").strip()
    if not name:
        return None, None
    if name in staff_ids:
        return staff_ids[name], None
    if name in group_ids:
        return None, group_ids[name]
    raise ImportValidationError("UNKNOWN_ASSIGNMENT_SUBJECT", "schedule references an unknown staff or group")


def _schedule_date(month: str, day: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}", month) or not str(day).isdigit():
        raise ImportValidationError("INVALID_SCHEDULE_DATE", "schedule month/day format is invalid")
    return f"{month}-{int(day):02d}"


def build_import_sql(documents: Mapping[str, object], *, imported_at: str) -> str:
    """Return transactional D1 SQL without exposing or modifying the source DB."""
    groups = _as_list(documents.get("groups.json"))
    staff = _as_list(documents.get("staff.json"))
    positions = _as_list(documents.get("positions.json"))
    schedule = documents.get("schedule.json") or {}
    hidden_days = documents.get("hidden_days.json") or {}
    memos = documents.get("memo.json") or {}

    group_ids = {str(item.get("name", "")).strip(): str(item.get("id", "")).strip() for item in groups}
    staff_ids = {str(item.get("name", "")).strip(): str(item.get("id", "")).strip() for item in staff}
    group_names = {name for name, identifier in group_ids.items() if name and identifier}
    staff_names = {name for name, identifier in staff_ids.items() if name and identifier}
    if group_names & staff_names:
        raise ImportValidationError("GLOBAL_NAME_COLLISION", f"collision_count={len(group_names & staff_names)}")

    lines = ["PRAGMA foreign_keys = ON;"]
    for group in groups:
        lines.append(f"INSERT INTO groups (id, name) VALUES ({_q(group.get('id'))}, {_q(group.get('name'))});")
    for member in staff:
        group_id = str(member.get("group_id", "")).strip() or None
        lines.append(
            "INSERT INTO staff (id, name, group_id, can_cpin, can_jd, saturday_only, no_substitute) VALUES "
            f"({_q(member.get('id'))}, {_q(member.get('name'))}, {_q(group_id)}, {_bool(member.get('can_cpin'))}, "
            f"{_bool(member.get('can_jd'))}, {_bool(member.get('saturday_only'))}, {_bool(member.get('no_substitute'))});"
        )
    for position in positions:
        default_staff_id, default_group_id = _assignment_id(position.get("default_person"), staff_ids, group_ids)
        lines.append(
            "INSERT INTO positions (id, name, workload, default_staff_id, default_group_id, category, split_allowed) VALUES "
            f"({_q(position.get('id'))}, {_q(position.get('name'))}, {_q(position.get('workload', 0))}, "
            f"{_q(default_staff_id)}, {_q(default_group_id)}, {_q(position.get('category', ''))}, {_bool(position.get('split_allowed'))});"
        )

    if not isinstance(schedule, Mapping):
        raise ImportValidationError("INVALID_SCHEDULE", "schedule.json must be an object")
    for month, days in schedule.items():
        if not isinstance(days, Mapping):
            raise ImportValidationError("INVALID_SCHEDULE", "schedule month must be an object")
        for day, day_data in days.items():
            if not isinstance(day_data, Mapping):
                raise ImportValidationError("INVALID_SCHEDULE", "schedule day must be an object")
            date = _schedule_date(str(month), str(day))
            day_id = f"day_{date}"
            lines.append(
                "INSERT INTO schedule_days (id, schedule_date, scatter_groups) VALUES "
                f"({_q(day_id)}, {_q(date)}, {_bool(day_data.get('_scatter_groups'))});"
            )
            for off_name in day_data.get("_off_persons", []) or []:
                staff_id, group_id = _assignment_id(off_name, staff_ids, group_ids)
                if group_id:
                    lines.append(
                        "INSERT INTO schedule_day_off_groups (schedule_day_id, group_id) VALUES "
                        f"({_q(day_id)}, {_q(group_id)});"
                    )
                if staff_id:
                    lines.append(
                        "INSERT INTO schedule_day_off_staff (schedule_day_id, staff_id) VALUES "
                        f"({_q(day_id)}, {_q(staff_id)});"
                    )
            for position_id, cell in day_data.items():
                if not str(position_id).startswith("p"):
                    continue
                if not isinstance(cell, Mapping):
                    raise ImportValidationError("INVALID_SCHEDULE_CELL", "schedule cell must be an object")
                status = str(cell.get("status", "pending"))
                if status not in _CELL_STATUSES:
                    raise ImportValidationError("INVALID_CELL_STATUS", "schedule contains an unsupported cell status")
                staff_id, group_id = _assignment_id(cell.get("person"), staff_ids, group_ids)
                cell_id = f"cell_{date}_{position_id}"
                lines.append(
                    "INSERT INTO schedule_cells (id, schedule_day_id, position_id, status, staff_id, group_id) VALUES "
                    f"({_q(cell_id)}, {_q(day_id)}, {_q(position_id)}, {_q(status)}, {_q(staff_id)}, {_q(group_id)});"
                )
                slots = cell.get("slots") or {}
                if not isinstance(slots, Mapping):
                    raise ImportValidationError("INVALID_SCHEDULE_SLOTS", "schedule slots must be an object")
                for slot in ("am", "pm"):
                    item = slots.get(slot)
                    if not isinstance(item, Mapping):
                        continue
                    slot_status = str(item.get("status", "pending"))
                    if slot_status not in _SLOT_STATUSES:
                        raise ImportValidationError("INVALID_SLOT_STATUS", "schedule contains an unsupported slot status")
                    slot_staff_id, slot_group_id = _assignment_id(item.get("person"), staff_ids, group_ids)
                    lines.append(
                        "INSERT INTO schedule_slots (id, schedule_cell_id, slot, status, staff_id, group_id, workload) VALUES "
                        f"({_q(f'{cell_id}_{slot}')}, {_q(cell_id)}, {_q(slot)}, {_q(slot_status)}, {_q(slot_staff_id)}, {_q(slot_group_id)}, {_q(item.get('workload', 0))});"
                    )

    if isinstance(hidden_days, Mapping):
        for month, days in hidden_days.items():
            for day in days or []:
                lines.append(f"INSERT INTO hidden_days (schedule_date) VALUES ({_q(_schedule_date(str(month), str(day)))});")
    if isinstance(memos, Mapping):
        for memo_id, memo in memos.items():
            item = memo if isinstance(memo, Mapping) else {}
            lines.append(
                "INSERT INTO memos (id, content, updated_at) VALUES "
                f"({_q(memo_id)}, {_q(item.get('content', ''))}, {_q(item.get('updated_at') or imported_at)});"
            )
    for key, backup in documents.items():
        matched = re.fullmatch(r"backup/schedule_(\d{4})-(\d{2})\.json", str(key))
        if not matched or not isinstance(backup, Mapping):
            continue
        backup_id = f"backup_{matched.group(1)}_{matched.group(2)}"
        payload = json.dumps(backup.get("schedule", {}), ensure_ascii=False, separators=(",", ":"))
        lines.append(
            "INSERT INTO schedule_backups (id, year, month, created_at, payload) VALUES "
            f"({_q(backup_id)}, {_q(matched.group(1))}, {_q(matched.group(2))}, {_q(backup.get('backup_time') or imported_at)}, {_q(payload)});"
        )
    lines.append("UPDATE app_revision SET revision = 1, updated_at = " + _q(imported_at) + " WHERE id = 1;")
    return "\n".join(lines) + "\n"


def load_snapshot_csv(path: Path) -> dict[str, object]:
    """Read the Supabase SQL-editor CSV export without logging document values."""
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(DictReader(handle))
    documents = {str(row["key"]): json.loads(row["value"]) for row in rows}
    if not documents:
        raise ImportValidationError("EMPTY_SNAPSHOT", "snapshot contains no documents")
    return documents
