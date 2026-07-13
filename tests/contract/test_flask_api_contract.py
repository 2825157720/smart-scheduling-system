import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server_runtime as app_module


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "cloudflare"
CONTRACT_DOC = REPO_ROOT / "docs" / "cloudflare" / "api-contract.md"


class FlaskApiContractTests(unittest.TestCase):
    """Freeze the HTTP shapes consumed by the current browser client."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self.temp_dir.name)
        self.paths = {
            "DATA_DIR": data_dir,
            "BACKUP_DIR": data_dir / "backup",
            "STAFF_FILE": data_dir / "staff.json",
            "POSITION_FILE": data_dir / "positions.json",
            "SCHEDULE_FILE": data_dir / "schedule.json",
            "GROUPS_FILE": data_dir / "groups.json",
            "HIDDEN_DAYS_FILE": data_dir / "hidden_days.json",
            "MEMO_FILE": data_dir / "memo.json",
        }
        self.patch_paths = patch.multiple(app_module, **self.paths)
        self.patch_paths.start()
        app_module._init_data()
        app_module.app.config.update(TESTING=True)
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.patch_paths.stop()
        self.temp_dir.cleanup()

    def request_json(self, method, path, payload=None):
        response = self.client.open(path, method=method, json=payload)
        self.assertEqual(response.content_type, "application/json")
        return response, response.get_json()

    def assert_success(self, method, path, payload=None, status=200):
        response, body = self.request_json(method, path, payload)
        self.assertEqual(response.status_code, status)
        self.assertIs(body.get("success"), True)
        return body

    def assert_error(self, method, path, payload=None, status=400):
        response, body = self.request_json(method, path, payload)
        self.assertEqual(response.status_code, status)
        self.assertIs(body.get("success"), False)
        self.assertIsInstance(body.get("msg"), str)

    def test_contract_document_records_global_name_uniqueness(self):
        content = CONTRACT_DOC.read_text(encoding="utf-8")
        self.assertIn("人员名称与小组名称全局唯一", content)
        self.assertIn("停止导入", content)

    def test_entity_crud_routes_keep_success_and_error_shapes(self):
        groups_response, groups = self.request_json("GET", "/api/groups")
        self.assertEqual(groups_response.status_code, 200)
        self.assertIsInstance(groups, list)
        self.assertIn("member_names", groups[0])

        created_group = self.assert_success("POST", "/api/groups", {"name": "合同组"})
        group_id = created_group["group_id"]
        self.assert_error("POST", "/api/groups", {"name": ""})
        self.assert_success("PUT", f"/api/groups/{group_id}", {"name": "合同组-更新"})
        self.assert_success("DELETE", f"/api/groups/{group_id}")
        self.assert_error("PUT", "/api/groups/missing", {"name": "不存在"}, status=404)

        created_staff = self.assert_success("POST", "/api/staff", {"name": "合同人员"})
        staff_id = created_staff["staff_id"]
        self.assert_error("POST", "/api/staff", {"name": ""})
        self.assert_success("PUT", f"/api/staff/{staff_id}", {"name": "合同人员"})
        self.assert_success("DELETE", f"/api/staff/{staff_id}")
        self.assert_error("PUT", "/api/staff/missing", {"name": "不存在"}, status=404)

        created_position = self.assert_success("POST", "/api/positions", {"name": "合同岗位", "workload": 4})
        position_id = created_position["pos_id"]
        self.assert_error("POST", "/api/positions", {"name": ""})
        self.assert_success("PUT", f"/api/positions/{position_id}", {"name": "合同岗位", "workload": 6})
        self.assert_success("POST", "/api/positions/reorder", [position_id])
        self.assert_success("DELETE", f"/api/positions/{position_id}")
        self.assert_error("PUT", "/api/positions/missing", {"name": "不存在"}, status=404)

    def test_schedule_and_automation_routes_keep_contract_shapes(self):
        response, schedule = self.request_json("GET", "/api/schedule/2026/2")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(schedule, {})
        # Legacy Flask treats a JSON list as an empty schedule.  The Worker
        # adapter must preserve this observable behavior until a versioned API
        # replaces it.
        list_payload = self.assert_success("POST", "/api/schedule/2026/2", [])
        self.assertEqual(list_payload["schedule"], {})
        saved = self.assert_success("POST", "/api/schedule/2026/2", {"schedule": {"1": {}}})
        self.assertEqual(saved["schedule"], {"1": {}})
        self.assert_error("POST", "/api/schedule/2026/2/day", {})
        day = self.assert_success("POST", "/api/schedule/2026/2/day", {"day": 1, "pos_id": "p1", "status": "on", "person": "测试"})
        self.assertIn("schedule", day)
        self.assertIn("cleared_positions", day)
        self.assert_error("POST", "/api/schedule/2026/2/plan-day", {"day": 30})
        planned = self.assert_success("POST", "/api/schedule/2026/2/plan-day", {"day": 1})
        self.assertEqual(set(planned), {"success", "day_data", "assigned", "failed"})
        self.assert_error("POST", "/api/schedule/2026/2/reset", {"password": "wrong"}, status=403)
        reset = self.assert_success("POST", "/api/schedule/2026/2/reset", {"password": "11050"})
        self.assertEqual(len(reset["schedule"]), 28)
        backup = self.assert_success("POST", "/api/schedule/2026/2/backup")
        self.assertIn("backup_time", backup)
        restored = self.assert_success("POST", "/api/schedule/2026/2/restore", {"password": "11050"})
        self.assertIn("schedule", restored)
        self.assert_error("POST", "/api/auto-substitute", {})
        substitute = self.assert_success("POST", "/api/auto-substitute", {"year": 2026, "month": 2, "day": 1, "pos_id": "p1"})
        self.assertIn("person", substitute)
        self.assert_error("POST", "/api/cascade-off", {})
        cascade = self.assert_success("POST", "/api/cascade-off", {"year": 2026, "month": 2, "day": 1, "person": "测试"})
        self.assertIsInstance(cascade["updated"], list)

    def test_hidden_days_and_memo_routes_keep_empty_and_success_shapes(self):
        response, hidden = self.request_json("GET", "/api/hidden-days/2026/2")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(hidden, [])
        self.assert_success("POST", "/api/hidden-days/2026/2", [1, 2, 2])
        _, hidden = self.request_json("GET", "/api/hidden-days/2026/2")
        self.assertEqual(hidden, [1, 2])
        response, memo = self.request_json("GET", "/api/memo/2026/2")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(memo), {"content", "updated_at"})
        saved = self.assert_success("POST", "/api/memo/2026/2", {"content": "迁移合同"})
        self.assertEqual(saved["memo"]["content"], "迁移合同")

    def test_golden_fixtures_are_valid_json(self):
        for filename in ("golden_input.json", "golden_responses.json"):
            with self.subTest(filename=filename):
                with (FIXTURE_DIR / filename).open(encoding="utf-8") as handle:
                    self.assertIsInstance(json.load(handle), dict)


if __name__ == "__main__":
    unittest.main()
