# -*- coding: utf-8 -*-
from __future__ import annotations

import calendar
import copy
import datetime as dt
import json
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

from schedule_core import (
    can_cover_member as core_can_cover_member,
    group_active_members as core_group_active_members,
    group_is_fully_off as core_group_is_fully_off,
    group_member_names as core_group_member_names,
    plan_day_schedule as core_plan_day_schedule,
    person_day_workload as core_person_day_workload,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
BACKUP_DIR = DATA_DIR / "backup"

STAFF_FILE = DATA_DIR / "staff.json"
POSITION_FILE = DATA_DIR / "positions.json"
SCHEDULE_FILE = DATA_DIR / "schedule.json"
GROUPS_FILE = DATA_DIR / "groups.json"
HIDDEN_DAYS_FILE = DATA_DIR / "hidden_days.json"
MEMO_FILE = DATA_DIR / "memo.json"


DEFAULT_GROUPS = [
    {"id": "g1", "name": "鞋包组", "members": []},
    {"id": "g2", "name": "特价组", "members": []},
    {"id": "g3", "name": "大分类组1", "members": []},
    {"id": "g4", "name": "大分类组2", "members": []},
    {"id": "g5", "name": "款色组", "members": []},
]

DEFAULT_STAFF = [
    {"id": "s1", "name": "赵创", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s2", "name": "爱萍", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s3", "name": "玉兰", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s4", "name": "志才", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s5", "name": "姑姐", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s6", "name": "春华", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s7", "name": "志健", "can_cpin": True, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s8", "name": "翠珍", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s9", "name": "赵娟", "can_cpin": False, "can_jd": True, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s10", "name": "姑嫂", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s11", "name": "林灏", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s12", "name": "龙泽", "can_cpin": False, "can_jd": False, "saturday_only": False, "no_substitute": False, "group_id": ""},
    {"id": "s13", "name": "俊佳", "can_cpin": False, "can_jd": False, "saturday_only": True, "no_substitute": False, "group_id": ""},
]

DEFAULT_POSITIONS = [
    {"id": "p1", "name": "专员2", "workload": 12, "default_person": "赵创", "category": ""},
    {"id": "p2", "name": "专员3", "workload": 8, "default_person": "爱萍", "category": ""},
    {"id": "p3", "name": "专员4", "workload": 6, "default_person": "", "category": ""},
    {"id": "p4", "name": "专员5", "workload": 8, "default_person": "", "category": ""},
    {"id": "p5", "name": "专员6", "workload": 8, "default_person": "", "category": ""},
    {"id": "p6", "name": "专员7", "workload": 8, "default_person": "", "category": ""},
    {"id": "p7", "name": "专员8", "workload": 10, "default_person": "", "category": ""},
    {"id": "p8", "name": "专员9", "workload": 8, "default_person": "", "category": ""},
    {"id": "p9", "name": "专员10", "workload": 10, "default_person": "", "category": ""},
    {"id": "p10", "name": "专员11", "workload": 10, "default_person": "", "category": ""},
    {"id": "p11", "name": "专员12", "workload": 8, "default_person": "", "category": ""},
    {"id": "p12", "name": "专员13", "workload": 8, "default_person": "", "category": ""},
    {"id": "p13", "name": "专员14", "workload": 10, "default_person": "", "category": ""},
    {"id": "p14", "name": "专员15", "workload": 8, "default_person": "", "category": ""},
    {"id": "p15", "name": "专员16", "workload": 8, "default_person": "", "category": ""},
    {"id": "p16", "name": "次品北", "workload": 6, "default_person": "", "category": "次品"},
    {"id": "p17", "name": "次品中", "workload": 6, "default_person": "", "category": "次品"},
    {"id": "p18", "name": "京东北", "workload": 1, "default_person": "", "category": "京东"},
    {"id": "p19", "name": "京东中", "workload": 1, "default_person": "", "category": "京东"},
    {"id": "p20", "name": "京东南", "workload": 1, "default_person": "", "category": "京东"},
]


app = Flask(__name__, static_folder="static")


def _ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path, default):
    try:
        if Path(path).exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return copy.deepcopy(default)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _today_date():
    return dt.date.today()


def _init_data():
    _ensure_dirs()
    if not STAFF_FILE.exists():
        save_json(STAFF_FILE, DEFAULT_STAFF)
    if not POSITION_FILE.exists():
        save_json(POSITION_FILE, DEFAULT_POSITIONS)
    if not GROUPS_FILE.exists():
        save_json(GROUPS_FILE, DEFAULT_GROUPS)
    if not SCHEDULE_FILE.exists():
        save_json(SCHEDULE_FILE, {})
    if not HIDDEN_DAYS_FILE.exists():
        save_json(HIDDEN_DAYS_FILE, {})
    if not MEMO_FILE.exists():
        save_json(MEMO_FILE, {})


def _month_key(year: int, month: int) -> str:
    return f"{int(year)}-{int(month):02d}"


def _positions():
    data = load_json(POSITION_FILE, DEFAULT_POSITIONS)
    return data if isinstance(data, list) else list(data.values())


def _staff():
    data = load_json(STAFF_FILE, DEFAULT_STAFF)
    return data if isinstance(data, list) else list(data.values())


def _groups():
    data = load_json(GROUPS_FILE, DEFAULT_GROUPS)
    return data if isinstance(data, list) else list(data.values())


def _schedule():
    return load_json(SCHEDULE_FILE, {})


def _hidden_days():
    return load_json(HIDDEN_DAYS_FILE, {})


def _memo_data():
    return load_json(MEMO_FILE, {})


def _memo_updated_at(item):
    text = str((item or {}).get("updated_at", "") or "").strip()
    if not text:
        return dt.datetime.min
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return dt.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return dt.datetime.min


def _primary_memo_entry(memo):
    latest_item = None
    latest_score = None
    for index, (key, item) in enumerate((memo or {}).items()):
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "") or "").strip()
        if not content:
            continue
        score = (_memo_updated_at(item), 1 if key == "global" else 0, index)
        if latest_score is None or score > latest_score:
            latest_score = score
            latest_item = item
    if latest_item is None:
        return {"content": "", "updated_at": ""}
    return {
        "content": str(latest_item.get("content", "") or ""),
        "updated_at": str(latest_item.get("updated_at", "") or ""),
    }


def _staff_group_name_map():
    groups = _groups()
    return {g["id"]: g["name"] for g in groups if g.get("id")}


def _enrich_staff(staff):
    group_names = _staff_group_name_map()
    out = []
    for m in staff:
        item = dict(m)
        item["group_name"] = group_names.get(item.get("group_id"), "")
        out.append(item)
    return out


def _group_member_names(group_id, staff):
    return [m["name"] for m in staff if m.get("group_id") == group_id and m.get("name")]


def _resolve_off_persons(payload, staff):
    name_by_id = {
        str(member.get("id", "")).strip(): str(member.get("name", "")).strip()
        for member in staff or []
        if str(member.get("id", "")).strip() and str(member.get("name", "")).strip()
    }

    resolved = []
    seen = set()

    for person_id in payload.get("off_person_ids", []) or []:
        name = name_by_id.get(str(person_id).strip(), "")
        if name and name not in seen:
            seen.add(name)
            resolved.append(name)

    for person in payload.get("off_persons", []) or []:
        name = str(person).strip()
        if name and name not in seen:
            seen.add(name)
            resolved.append(name)

    return resolved


def _collect_day_off_persons(day_data):
    if not isinstance(day_data, dict):
        return []

    off_names = []
    seen = set()

    def add(name):
        text = str(name).strip()
        if text and text not in seen:
            seen.add(text)
            off_names.append(text)

    for person in day_data.get("_off_persons", []) or []:
        add(person)

    active_names = set()
    off_candidates = []

    for pid, cell in day_data.items():
        if str(pid).startswith("_"):
            continue
        if isinstance(cell, dict) and cell.get("status") == "split" and isinstance(cell.get("slots"), dict):
            for slot_name in ("am", "pm"):
                slot_cell = cell.get("slots", {}).get(slot_name, {})
                if not isinstance(slot_cell, dict):
                    continue
                name = str(slot_cell.get("person", "") or "").strip()
                if not name:
                    continue
                status = str(slot_cell.get("status", "") or "").strip()
                if status in ("on", "substitute"):
                    active_names.add(name)
                elif status == "off":
                    off_candidates.append(name)
            continue
        if not isinstance(cell, dict):
            continue
        name = str(cell.get("person", "") or "").strip()
        if not name:
            continue
        status = str(cell.get("status", "") or "").strip()
        if status in ("on", "substitute"):
            active_names.add(name)
        elif status == "off":
            off_candidates.append(name)

    for name in off_candidates:
        if name not in active_names:
            add(name)

    return off_names


def _sync_position_default_person_forward(pos_id, old_default_person, new_default_person):
    old_default_person = str(old_default_person or "").strip()
    new_default_person = str(new_default_person or "").strip()
    if old_default_person == new_default_person:
        return []

    today = _today_date()
    schedules = copy.deepcopy(_schedule())
    synced_days = []

    for month_key, month_data in schedules.items():
        if not isinstance(month_data, dict):
            continue
        try:
            year_str, month_str = str(month_key).split("-", 1)
            year = int(year_str)
            month = int(month_str)
        except Exception:
            continue
        _, days_in_month = calendar.monthrange(year, month)

        for day in range(1, days_in_month + 1):
            current_date = dt.date(year, month, day)
            if current_date < today:
                continue

            day_data = month_data.get(str(day))
            if not isinstance(day_data, dict):
                continue

            cell = day_data.get(pos_id)
            if not isinstance(cell, dict):
                continue

            if cell.get("status") == "split" and isinstance(cell.get("slots"), dict):
                slots = copy.deepcopy(cell.get("slots") or {})
                changed = False
                for slot_name in ("am", "pm"):
                    slot_cell = slots.get(slot_name)
                    if not isinstance(slot_cell, dict):
                        continue
                    if str(slot_cell.get("person", "") or "").strip() != old_default_person:
                        continue
                    updated_slot = dict(slot_cell)
                    updated_slot["person"] = new_default_person
                    slots[slot_name] = updated_slot
                    changed = True
                if changed:
                    updated_cell = dict(cell)
                    updated_cell["slots"] = slots
                    updated_cell["person"] = slots.get("am", {}).get("person") or slots.get("pm", {}).get("person", "")
                    day_data[pos_id] = updated_cell
                    synced_days.append(f"{year}-{month:02d}-{day}")
                continue

            if str(cell.get("person", "") or "").strip() != old_default_person:
                continue

            updated_cell = dict(cell)
            updated_cell["person"] = new_default_person
            day_data[pos_id] = updated_cell
            synced_days.append(f"{year}-{month:02d}-{day}")

    if synced_days:
        save_json(SCHEDULE_FILE, schedules)

    return synced_days


def _enrich_groups(groups, staff):
    out = []
    for g in groups:
        item = dict(g)
        item["member_names"] = _group_member_names(item.get("id"), staff)
        out.append(item)
    return out


def _make_day_base(positions, off_persons=None):
    off_set = {str(x).strip() for x in (off_persons or []) if str(x).strip()}
    day_data = {}
    if off_set:
        day_data["_off_persons"] = sorted(off_set)
    for pos in positions:
        pid = pos.get("id")
        if not pid:
            continue
        default_person = str(pos.get("default_person", "")).strip()
        if default_person and default_person in off_set:
            day_data[pid] = {"status": "off", "person": default_person}
        elif default_person:
            day_data[pid] = {"status": "on", "person": default_person}
        else:
            day_data[pid] = {"status": "pending", "person": ""}
    return day_data


def _split_day_slot(cell, slot):
    slots = (cell or {}).get("slots", {})
    if not isinstance(slots, dict):
        return {"status": "pending", "person": ""}
    slot_cell = slots.get(slot, {})
    if not isinstance(slot_cell, dict):
        return {"status": "pending", "person": ""}
    return {
        "status": str(slot_cell.get("status", "pending") or "pending").strip() or "pending",
        "person": str(slot_cell.get("person", "") or "").strip(),
    }


def _month_schedule_container(year: int, month: int):
    schedules = _schedule()
    return schedules.get(_month_key(year, month), {})


def _save_month_schedule(year: int, month: int, month_data):
    schedules = _schedule()
    schedules[_month_key(year, month)] = month_data
    save_json(SCHEDULE_FILE, schedules)


def _save_hidden_days(year: int, month: int, days):
    hidden = _hidden_days()
    hidden[_month_key(year, month)] = sorted({int(d) for d in days})
    save_json(HIDDEN_DAYS_FILE, hidden)


def _save_memo(year: int, month: int, content: str):
    memo = {
        "global": {
            "content": content or "",
            "updated_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
    }
    save_json(MEMO_FILE, memo)
    return memo["global"]


def _get_memo(year: int, month: int):
    memo = _memo_data()
    primary = _primary_memo_entry(memo)
    normalized = {"global": primary}
    if memo != normalized:
        save_json(MEMO_FILE, normalized)
    return primary


def _get_server_ip():
    try:
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            import socket

            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


@app.after_request
def _add_cors(response):
    if request.path.startswith("/api/"):
        origin = request.headers.get("Origin")
        response.headers["Access-Control-Allow-Origin"] = "*" if not origin or origin == "null" else origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Vary"] = "Origin"
    return response


@app.before_request
def _handle_options():
    if request.method == "OPTIONS" and request.path.startswith("/api/"):
        return ("", 204)


@app.route("/")
def index():
    return send_file(STATIC_DIR / "index.html")


@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.route("/api/server-info")
def server_info():
    ip = _get_server_ip()
    return jsonify({"ip": ip, "port": 3000, "url": f"http://{ip}:3000"})


@app.route("/api/routes")
def list_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        routes.append({
            "endpoint": rule.endpoint,
            "methods": sorted(rule.methods - {"HEAD", "OPTIONS"}),
            "path": str(rule),
        })
    return jsonify({"success": True, "version": "2026-06-28-bootstrap", "route_count": len(routes), "routes": sorted(routes, key=lambda x: x["path"])})


@app.route("/api/groups", methods=["GET"])
def get_groups():
    groups = _groups()
    staff = _staff()
    return jsonify(_enrich_groups(groups, staff))


@app.route("/api/groups", methods=["POST"])
def add_group():
    payload = request.json or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify({"success": False, "msg": "小组名称不能为空"}), 400
    groups = _groups()
    if any(g.get("name") == name for g in groups):
        return jsonify({"success": False, "msg": "小组已存在"}), 400
    next_id = f"g{len(groups) + 1}"
    while any(g.get("id") == next_id for g in groups):
        next_id = f"g{int(next_id[1:]) + 1}"
    groups.append({"id": next_id, "name": name, "members": []})
    save_json(GROUPS_FILE, groups)
    return jsonify({"success": True, "group_id": next_id})


@app.route("/api/groups/<gid>", methods=["PUT"])
def update_group(gid):
    payload = request.json or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify({"success": False, "msg": "小组名称不能为空"}), 400
    groups = _groups()
    updated = False
    for g in groups:
        if g.get("id") == gid:
            g["name"] = name
            updated = True
            break
    if not updated:
        return jsonify({"success": False, "msg": "小组不存在"}), 404
    save_json(GROUPS_FILE, groups)
    return jsonify({"success": True})


@app.route("/api/groups/<gid>", methods=["DELETE"])
def delete_group(gid):
    groups = _groups()
    staff = _staff()
    groups = [g for g in groups if g.get("id") != gid]
    for member in staff:
        if member.get("group_id") == gid:
            member["group_id"] = ""
    save_json(GROUPS_FILE, groups)
    save_json(STAFF_FILE, staff)
    return jsonify({"success": True})


@app.route("/api/staff", methods=["GET"])
def get_staff():
    return jsonify(_enrich_staff(_staff()))


@app.route("/api/staff", methods=["POST"])
def add_staff():
    payload = request.json or {}
    staff = _staff()
    next_id = f"s{len(staff) + 1}"
    while any(m.get("id") == next_id for m in staff):
        next_id = f"s{int(next_id[1:]) + 1}"
    item = {
        "id": next_id,
        "name": str(payload.get("name", "")).strip(),
        "can_cpin": bool(payload.get("can_cpin", False)),
        "can_jd": bool(payload.get("can_jd", False)),
        "saturday_only": bool(payload.get("saturday_only", False)),
        "no_substitute": bool(payload.get("no_substitute", False)),
        "group_id": str(payload.get("group_id", "") or ""),
    }
    if not item["name"]:
        return jsonify({"success": False, "msg": "姓名不能为空"}), 400
    staff.append(item)
    save_json(STAFF_FILE, staff)
    return jsonify({"success": True, "staff_id": next_id})


@app.route("/api/staff/<sid>", methods=["PUT"])
def update_staff(sid):
    payload = request.json or {}
    staff = _staff()
    found = False
    for member in staff:
        if member.get("id") == sid:
            member.update({
                "name": str(payload.get("name", member.get("name", ""))).strip(),
                "can_cpin": bool(payload.get("can_cpin", member.get("can_cpin", False))),
                "can_jd": bool(payload.get("can_jd", member.get("can_jd", False))),
                "saturday_only": bool(payload.get("saturday_only", member.get("saturday_only", False))),
                "no_substitute": bool(payload.get("no_substitute", member.get("no_substitute", False))),
                "group_id": str(payload.get("group_id", member.get("group_id", "")) or ""),
            })
            found = True
            break
    if not found:
        return jsonify({"success": False, "msg": "人员不存在"}), 404
    save_json(STAFF_FILE, staff)
    return jsonify({"success": True})


@app.route("/api/staff/<sid>", methods=["DELETE"])
def delete_staff(sid):
    staff = [m for m in _staff() if m.get("id") != sid]
    save_json(STAFF_FILE, staff)
    return jsonify({"success": True})


@app.route("/api/positions", methods=["GET"])
def get_positions():
    return jsonify(_positions())


@app.route("/api/positions", methods=["POST"])
def add_position():
    payload = request.json or {}
    positions = _positions()
    next_id = f"p{len(positions) + 1}"
    while any(p.get("id") == next_id for p in positions):
        next_id = f"p{int(next_id[1:]) + 1}"
    item = {
        "id": next_id,
        "name": str(payload.get("name", "")).strip(),
        "workload": int(payload.get("workload", 0) or 0),
        "default_person": str(payload.get("default_person", "") or ""),
        "category": str(payload.get("category", "") or ""),
        "split_allowed": bool(payload.get("split_allowed", False)),
    }
    if not item["name"]:
        return jsonify({"success": False, "msg": "岗位名称不能为空"}), 400
    positions.append(item)
    save_json(POSITION_FILE, positions)
    return jsonify({"success": True, "pos_id": next_id})


@app.route("/api/positions/<pid>", methods=["PUT"])
def update_position(pid):
    payload = request.json or {}
    positions = _positions()
    found = False
    synced_days = []
    for pos in positions:
        if pos.get("id") == pid:
            old_default_person = str(pos.get("default_person", "") or "").strip()
            new_default_person = str(payload.get("default_person", pos.get("default_person", "")) or "").strip()
            pos.update({
                "name": str(payload.get("name", pos.get("name", ""))).strip(),
                "workload": int(payload.get("workload", pos.get("workload", 0)) or 0),
                "default_person": str(payload.get("default_person", pos.get("default_person", "")) or "").strip(),
                "category": str(payload.get("category", pos.get("category", "")) or ""),
                "split_allowed": bool(payload.get("split_allowed", pos.get("split_allowed", False))),
            })
            synced_days = _sync_position_default_person_forward(pid, old_default_person, new_default_person)
            found = True
            break
    if not found:
        return jsonify({"success": False, "msg": "岗位不存在"}), 404
    save_json(POSITION_FILE, positions)
    return jsonify({"success": True, "synced_days": synced_days})


@app.route("/api/positions/<pid>", methods=["DELETE"])
def delete_position(pid):
    positions = [p for p in _positions() if p.get("id") != pid]
    save_json(POSITION_FILE, positions)
    return jsonify({"success": True})


@app.route("/api/positions/reorder", methods=["POST"])
def reorder_positions():
    payload = request.json or []
    positions = _positions()
    pos_map = {p["id"]: p for p in positions if p.get("id")}
    reordered = []
    seen = set()
    ids = [item["id"] if isinstance(item, dict) else item for item in payload]
    for pid in ids:
        if pid in pos_map and pid not in seen:
            reordered.append(pos_map[pid])
            seen.add(pid)
    for pos in positions:
        pid = pos.get("id")
        if pid and pid not in seen:
            reordered.append(pos)
    save_json(POSITION_FILE, reordered)
    return jsonify({"success": True})


def _current_month_data(year: int, month: int):
    schedules = _schedule()
    return schedules.get(_month_key(year, month), {})


@app.route("/api/schedule/<int:year>/<int:month>", methods=["GET"])
def get_schedule(year, month):
    return jsonify(_current_month_data(year, month))


@app.route("/api/schedule/<int:year>/<int:month>", methods=["POST"])
def save_schedule(year, month):
    payload = request.json or {}
    month_data = payload.get("schedule")
    if month_data is None:
        month_data = payload
    if not isinstance(month_data, dict):
        return jsonify({"success": False, "msg": "排班数据格式错误"}), 400
    _save_month_schedule(year, month, month_data)
    return jsonify({"success": True, "schedule": month_data})


@app.route("/api/schedule/<int:year>/<int:month>/day", methods=["POST"])
def save_day_schedule(year, month):
    payload = request.json or {}
    day = int(payload.get("day", 0) or 0)
    pos_id = str(payload.get("pos_id", "")).strip()
    status = str(payload.get("status", "")).strip()
    person = str(payload.get("person", "")).strip()
    slot = str(payload.get("slot", "") or "").strip().lower()
    split_payload = payload.get("split")
    if day <= 0 or not pos_id:
        return jsonify({"success": False, "msg": "日期或岗位无效"}), 400

    positions = _positions()
    month_data = copy.deepcopy(_current_month_data(year, month))
    day_key = str(day)
    day_data = month_data.get(day_key) or _make_day_base(positions)

    def _normalize_slot_cell(data):
        data = data if isinstance(data, dict) else {}
        return {
            "status": str(data.get("status", "pending") or "pending").strip() or "pending",
            "person": str(data.get("person", "") or "").strip(),
        }

    cleared_positions = []
    if isinstance(split_payload, dict):
        slots = {
            "am": _normalize_slot_cell(split_payload.get("am")),
            "pm": _normalize_slot_cell(split_payload.get("pm")),
        }
        day_data[pos_id] = {
            "status": "split",
            "person": slots["am"].get("person") or slots["pm"].get("person", ""),
            "slots": slots,
        }
    elif slot in ("am", "pm"):
        existing = day_data.get(pos_id, {})
        if isinstance(existing, dict) and existing.get("status") == "split" and isinstance(existing.get("slots"), dict):
            slots = copy.deepcopy(existing.get("slots") or {})
        else:
            slots = {
                "am": {"status": "pending", "person": ""},
                "pm": {"status": "pending", "person": ""},
            }
        slots.setdefault("am", {"status": "pending", "person": ""})
        slots.setdefault("pm", {"status": "pending", "person": ""})
        slots[slot] = {"status": status or "pending", "person": person}
        day_data[pos_id] = {
            "status": "split",
            "person": slots["am"].get("person") or slots["pm"].get("person", ""),
            "slots": slots,
        }
    else:
        day_data[pos_id] = {"status": status, "person": person}

        if "_off_persons" not in day_data:
            day_data["_off_persons"] = []
        if status == "off" and person:
            if person not in day_data["_off_persons"]:
                day_data["_off_persons"].append(person)
        elif status == "on" and person and person in day_data["_off_persons"]:
            day_data["_off_persons"].remove(person)

        if status == "off" and person:
            for pid, cell in list(day_data.items()):
                if pid.startswith("_") or pid == pos_id:
                    continue
                if cell.get("status") == "substitute" and str(cell.get("person", "")).strip() == person:
                    day_data[pid] = {"status": "pending", "person": ""}
                    cleared_positions.append(pid)

    month_data[day_key] = day_data
    _save_month_schedule(year, month, month_data)
    return jsonify({"success": True, "schedule": month_data, "cleared_positions": cleared_positions})


@app.route("/api/schedule/<int:year>/<int:month>/plan-day", methods=["POST"])
def plan_day_schedule_api(year, month):
    payload = request.json or {}
    day = int(payload.get("day", 0) or 0)
    if day <= 0:
        return jsonify({"success": False, "msg": "日期无效"}), 400
    _, days_in_month = calendar.monthrange(year, month)
    if day > days_in_month:
        return jsonify({"success": False, "msg": "日期超出当月范围"}), 400

    positions = _positions()
    staff = _staff()
    groups = _groups()
    month_data = copy.deepcopy(_current_month_data(year, month))
    existing_day = month_data.get(str(day), {})
    selected_off_persons = _resolve_off_persons(payload, staff)
    saved_off_persons = _collect_day_off_persons(existing_day)
    use_saved_off_persons = bool(payload.get("use_saved_off_persons", False))
    scatter_groups = bool(payload.get("scatter_groups", False))
    has_off_person_fields = "off_person_ids" in payload or "off_persons" in payload
    if use_saved_off_persons or (not has_off_person_fields and saved_off_persons):
        off_persons = saved_off_persons
    else:
        off_persons = selected_off_persons
    result = core_plan_day_schedule(
        positions,
        staff,
        groups,
        year=year,
        month=month,
        day=day,
        off_persons=off_persons,
        scatter_groups=scatter_groups,
    )

    month_data[str(day)] = result["day_data"]
    _save_month_schedule(year, month, month_data)
    return jsonify({
        "success": True,
        "day_data": result["day_data"],
        "assigned": result["assigned"],
        "failed": result["failed"],
    })


@app.route("/api/schedule/<int:year>/<int:month>/reset", methods=["POST"])
def reset_month_schedule(year, month):
    payload = request.json or {}
    password = str(payload.get("password", ""))
    if password != "11050":
        return jsonify({"success": False, "msg": "密码错误"}), 403

    positions = _positions()
    _, days_in_month = calendar.monthrange(year, month)
    month_data = {str(day): _make_day_base(positions) for day in range(1, days_in_month + 1)}
    _save_month_schedule(year, month, month_data)
    return jsonify({"success": True, "schedule": month_data})


@app.route("/api/schedule/<int:year>/<int:month>/backup", methods=["POST"])
def backup_month_schedule(year, month):
    month_data = _current_month_data(year, month)
    backup_time = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    backup_file = BACKUP_DIR / f"schedule_{year}-{month:02d}.json"
    save_json(backup_file, {"backup_time": backup_time, "schedule": month_data})
    return jsonify({"success": True, "backup_time": backup_time})


@app.route("/api/schedule/<int:year>/<int:month>/restore", methods=["POST"])
def restore_month_schedule(year, month):
    payload = request.json or {}
    password = str(payload.get("password", ""))
    if password != "11050":
        return jsonify({"success": False, "msg": "密码错误"}), 403
    backup_file = BACKUP_DIR / f"schedule_{year}-{month:02d}.json"
    if not backup_file.exists():
        return jsonify({"success": False, "msg": "未找到备份文件，请先备份"}), 404
    backup_data = load_json(backup_file, {})
    schedule = backup_data.get("schedule", {})
    if not isinstance(schedule, dict):
        return jsonify({"success": False, "msg": "备份文件格式错误"}), 500
    _save_month_schedule(year, month, schedule)
    return jsonify({
        "success": True,
        "schedule": schedule,
        "backup_time": backup_data.get("backup_time", "未知"),
    })


@app.route("/api/auto-substitute", methods=["POST"])
def auto_substitute():
    payload = request.json or {}
    year = int(payload.get("year", 0) or 0)
    month = int(payload.get("month", 0) or 0)
    day = int(payload.get("day", 0) or 0)
    pos_id = str(payload.get("pos_id", "")).strip()
    if not (year and month and day and pos_id):
        return jsonify({"success": False, "msg": "参数无效"}), 400

    positions = _positions()
    staff = _staff()
    groups = _groups()
    month_data = _current_month_data(year, month)
    day_data = month_data.get(str(day), _make_day_base(positions))
    pos_map = {p["id"]: p for p in positions if p.get("id")}
    pos = pos_map.get(pos_id)
    if not pos:
        return jsonify({"success": False, "msg": "岗位不存在"}), 404

    day_date = dt.date(year, month, day)
    candidates = [
        m for m in staff
        if core_can_cover_member(m, pos, day_data, positions, staff, groups, day=day_date)
    ]
    if not candidates:
        return jsonify({"success": False, "msg": "无可用替班人"}), 200
    candidates.sort(key=lambda m: core_person_day_workload(m["name"], day_data, positions, staff, groups))
    chosen = candidates[0]["name"]
    return jsonify({"success": True, "person": chosen})


@app.route("/api/cascade-off", methods=["POST"])
def cascade_off():
    payload = request.json or {}
    year = int(payload.get("year", 0) or 0)
    month = int(payload.get("month", 0) or 0)
    day = int(payload.get("day", 0) or 0)
    person = str(payload.get("person", "")).strip()
    person_is_off = bool(payload.get("person_is_off", False))
    if not (year and month and day and person):
        return jsonify({"success": False, "msg": "参数无效"}), 400

    positions = _positions()
    month_data = copy.deepcopy(_current_month_data(year, month))
    day_data = month_data.get(str(day), _make_day_base(positions))
    updated = []

    if person_is_off and person not in day_data.get("_off_persons", []):
        day_data.setdefault("_off_persons", []).append(person)

    for pos in positions:
        pid = pos.get("id")
        if not pid:
            continue
        cell = day_data.get(pid, {})
        if isinstance(cell, dict) and cell.get("status") == "split" and isinstance(cell.get("slots"), dict):
            slots = copy.deepcopy(cell.get("slots") or {})
            changed = False
            for slot_name in ("am", "pm"):
                slot_cell = _split_day_slot(cell, slot_name)
                if slot_cell.get("person") != person:
                    continue
                if slot_cell.get("status") == "substitute":
                    slots[slot_name] = {"status": "pending", "person": ""}
                    updated.append({"pos_id": pid, "slot": slot_name, "person": "", "status": "pending", "pos_name": pos.get("name", pid)})
                    changed = True
                elif person_is_off and slot_cell.get("status") in ("on", "pending", ""):
                    slots[slot_name] = {"status": "off", "person": person}
                    updated.append({"pos_id": pid, "slot": slot_name, "person": person, "status": "off", "pos_name": pos.get("name", pid)})
                    changed = True
            if changed:
                day_data[pid] = {
                    "status": "split",
                    "person": slots["am"].get("person") or slots["pm"].get("person", ""),
                    "slots": slots,
                }
            continue
        if str(cell.get("person", "")).strip() != person:
            continue
        if cell.get("status") == "substitute":
            day_data[pid] = {"status": "pending", "person": ""}
            updated.append({"pos_id": pid, "person": "", "status": "pending", "pos_name": pos.get("name", pid)})
        elif person_is_off and (cell.get("status") in ("on", "pending", "")):
            day_data[pid] = {"status": "off", "person": person}
            updated.append({"pos_id": pid, "person": person, "status": "off", "pos_name": pos.get("name", pid)})

    month_data[str(day)] = day_data
    _save_month_schedule(year, month, month_data)
    return jsonify({"success": True, "updated": updated})


@app.route("/api/auto-fill-all", methods=["POST"])
def auto_fill_all():
    payload = request.json or {}
    year = int(payload.get("year", 0) or 0)
    month = int(payload.get("month", 0) or 0)
    day = int(payload.get("day", 0) or 0)
    if not (year and month and day):
        return jsonify({"success": False, "msg": "参数无效"}), 400
    result = plan_day_schedule_api(year, month)
    return result


@app.route("/api/hidden-days/<int:year>/<int:month>", methods=["GET"])
def get_hidden_days(year, month):
    hidden = _hidden_days()
    return jsonify(hidden.get(_month_key(year, month), []))


@app.route("/api/hidden-days/<int:year>/<int:month>", methods=["POST"])
def save_hidden_days_api(year, month):
    payload = request.json or []
    _save_hidden_days(year, month, payload)
    return jsonify({"success": True})


@app.route("/api/memo", methods=["GET", "POST"])
def memo_api():
    year = int(request.args.get("year", dt.datetime.now().year))
    month = int(request.args.get("month", dt.datetime.now().month))
    if request.method == "GET":
        return jsonify(_get_memo(year, month))
    payload = request.json or {}
    memo = _save_memo(year, month, str(payload.get("content", "")))
    return jsonify({"success": True, "memo": memo})


@app.route("/api/memo/<int:year>/<int:month>", methods=["GET", "POST"])
def memo_api_month(year, month):
    if request.method == "GET":
        return jsonify(_get_memo(year, month))
    payload = request.json or {}
    memo = _save_memo(year, month, str(payload.get("content", "")))
    return jsonify({"success": True, "memo": memo})


def main():
    print("=" * 50)
    print("智能排班系统启动中... [bootstrap]")
    print("本地访问: http://127.0.0.1:3000")
    print(f"局域网访问: http://{_get_server_ip()}:3000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=3000, debug=False)


_init_data()
