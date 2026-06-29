# 调度规则收口与小组模型重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把排班规则、小组成员关系和前端展示逻辑收口到单一来源，减少重复判断和数据口径不一致。

**Architecture:** 新增一层纯规则函数模块，后端路由只负责组装输入和写回 JSON。前端只展示并调用 API，不再自己维护第二套小组口径。辅助脚本改成项目相对路径，启动脚本只在缺依赖时安装 Flask。

**Tech Stack:** Python 3.13, Flask 3.1.3, plain HTML/CSS/JS, JSON files, standard-library `unittest`.

## Global Constraints

- `staff.group_id` is the only source of truth for membership.
- `groups.json` is definition-only; `members` must not drive behavior.
- Keep JSON storage and the existing Flask entrypoint.
- No new runtime dependencies.
- Preserve existing scheduling semantics for `on`, `off`, `substitute`, and `pending`.
- Helper scripts must resolve files relative to the project root, not a hardcoded machine path.

---

### Task 1: Extract shared scheduling rules

**Files:**
- Create: `schedule_core.py`
- Create: `tests/test_schedule_core.py`

**Interfaces:**
- Consumes: plain Python dict/list data for `staff`, `groups`, `positions`, and `day_data`
- Produces: pure helpers for group membership, active-members lookup, full-off detection, workload calculation, and coverage eligibility
  - `group_member_names(group_name, staff, groups) -> list[str]`
  - `group_active_members(group_name, day_data, positions, staff, groups) -> list[str]`
  - `group_is_fully_off(group_name, day_data, positions, staff, groups) -> bool`
  - `person_day_workload(name, day_data, positions, staff, groups) -> float`
  - `can_cover_member(member, pos, day_data, positions, staff, groups, *, day: datetime.date, exclude_name="") -> bool`

- [ ] **Step 1: Write the failing tests**

Create tests that prove the shared rules work on in-memory data:

```python
def test_group_members_come_from_staff_group_id():
    groups = [{"id": "g1", "name": "A"}]
    staff = [{"id": "s1", "name": "张三", "group_id": "g1"}]
    assert group_member_names("A", staff, groups) == ["张三"]

def test_group_full_off_and_active_members_share_workload():
    groups = [{"id": "g1", "name": "A"}]
    positions = [{"id": "p1", "default_person": "A", "workload": 8}]
    staff = [{"id": "s1", "name": "张三", "group_id": "g1"}]
    day_data = {"p1": {"status": "on", "person": "A"}}
    assert group_active_members("A", day_data, positions, staff, groups) == ["张三"]
    assert group_is_fully_off("A", {"p1": {"status": "off", "person": "A"}}, positions, staff, groups) is True
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest discover -s tests -v
```

Expected: import or assertion failures because `schedule_core.py` does not exist yet.

- [ ] **Step 3: Implement the helpers**

Add the pure helper functions to `schedule_core.py` and keep them free of file I/O so they can be unit-tested directly.

- [ ] **Step 4: Run the tests again**

Run:

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest discover -s tests -v
```

Expected: tests pass.

### Task 2: Refactor backend routes onto the shared rules

**Files:**
- Modify: `app.py`
- Modify: `data/groups.json` only if migration cleanup is needed during implementation
- Create: `tests/test_app_groups.py`

**Interfaces:**
- Consumes: helpers from `schedule_core.py`
- Produces: route handlers that call the shared helpers, plus group deletion that clears stale `staff.group_id`

- [ ] **Step 1: Write the failing backend tests**

Add route-level tests that mock JSON I/O and verify:

```python
from unittest.mock import patch
import app as app_module

def test_get_groups_returns_member_names_from_staff_group_id():
    fake_groups = [{"id": "g1", "name": "A", "members": ["s9"]}]
    fake_staff = [{"id": "s1", "name": "张三", "group_id": "g1"}]
    with patch.object(app_module, "load_json", side_effect=[fake_groups, fake_staff]):
        with app_module.app.test_request_context("/api/groups"):
            payload = app_module.get_groups().get_json()
    assert payload[0]["member_names"] == ["张三"]

def test_delete_group_clears_staff_group_id():
    saved = []
    fake_groups = [{"id": "g1", "name": "A", "members": []}]
    fake_staff = [{"id": "s1", "name": "张三", "group_id": "g1"}]
    def fake_save(path, data):
        saved.append((path, data))
    with patch.object(app_module, "load_json", side_effect=[fake_groups, fake_staff]), \
         patch.object(app_module, "save_json", side_effect=fake_save):
        with app_module.app.test_request_context("/api/groups/g1", method="DELETE"):
            payload = app_module.delete_group("g1").get_json()
    assert payload["success"] is True
    assert any(data == [] for _, data in saved)
    assert any(rows and rows[0]["group_id"] == "" for _, rows in saved if isinstance(rows, list))
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest discover -s tests -v
```

- [ ] **Step 3: Refactor `app.py`**

Replace repeated group and coverage logic in:
- `/api/auto-fill-all`
- `/api/auto-substitute`
- `/api/cascade-off`
- `/api/groups`
- `/api/groups/<gid>` delete handling

with calls to the shared helpers.

- [ ] **Step 4: Run the backend tests again**

Run:

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest discover -s tests -v
```

Expected: tests pass.

### Task 3: Simplify the frontend group flow

**Files:**
- Modify: `static/index.html`
- Create: `tests/test_frontend_smoke.py`

**Interfaces:**
- Consumes: `GET /api/groups` returning `member_names`
- Produces: group table rendering and selection UI that stay aligned with the backend's single membership source

- [ ] **Step 1: Write a frontend smoke check**

Create a small unittest that reads `static/index.html` as text and checks the updated helpers are present.

- [ ] **Step 2: Run the smoke check and confirm it fails**

Run:

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest tests.test_frontend_smoke -v
```

- [ ] **Step 3: Update the frontend data flow**

Make the group table read `member_names` from the API response, keep the member picker on `staff.group_id`, and leave workload/statistics semantics unchanged.

- [ ] **Step 4: Re-run the smoke check**

Run the same command again and confirm it passes.

### Task 4: Clean utility scripts and startup behavior

**Files:**
- Modify: `add_group_helpers.py`
- Modify: `inject_group_auto_sub.py`
- Modify: `start.bat`

**Interfaces:**
- Consumes: project-relative paths and the bundled Python interpreter path
- Produces: helper scripts that work from the current repo, and a startup script that does not reinstall Flask every launch

- [ ] **Step 1: Write the failing checks**

Use search-based checks for the hardcoded absolute path and unconditional install:

```powershell
rg -n "c:\\Users\\admin\\Desktop\\WorkBuddy\\智能排班系统\\static\\index.html" add_group_helpers.py inject_group_auto_sub.py
rg -n "pip install flask" start.bat
```

- [ ] **Step 2: Run the checks to confirm the current code fails them**

Both commands should match the current files.

- [ ] **Step 3: Rewrite the scripts**

Move both Python helper scripts to `Path(__file__).resolve().parent`-based path resolution and make `start.bat` install Flask only when it is missing.

- [ ] **Step 4: Re-run the checks**

The hardcoded path search should return nothing, and `start.bat` should only install Flask conditionally.

### Task 5: Final verification

**Files:**
- All changed files

**Interfaces:**
- Consumes: the full refactor diff
- Produces: a clean validation pass across Python syntax and the new tests

- [ ] **Step 1: Run Python syntax checks**

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m py_compile app.py schedule_core.py add_group_helpers.py inject_group_auto_sub.py
```

- [ ] **Step 2: Run the unittest suite**

```powershell
& 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe' -m unittest discover -s tests -v
```

- [ ] **Step 3: Do a final grep smoke pass**

```powershell
rg -n "groups\\.json\\.members|member_names|c:\\Users\\admin\\Desktop\\WorkBuddy\\智能排班系统\\static\\index.html|pip install flask" .
```

Expected: no code still relies on `groups.json.members`, no absolute script path remains, and `start.bat` is no longer reinstalling Flask on every launch.
