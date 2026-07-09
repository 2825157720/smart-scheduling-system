import datetime as dt
import unittest
from unittest.mock import patch

import app as app_module


class AppGroupRouteTests(unittest.TestCase):
    def test_get_groups_uses_staff_group_id_for_member_names(self):
        groups = [
            {"id": "g1", "name": "Alpha", "members": ["legacy-a", "legacy-b"]},
            {"id": "g2", "name": "Beta", "members": ["legacy-c"]},
        ]
        staff = [
            {"id": "s1", "name": "Bob", "group_id": "g1"},
            {"id": "s2", "name": "Alice", "group_id": "g1"},
            {"id": "s3", "name": "Carol", "group_id": "g2"},
        ]

        with patch.object(app_module, "load_json", side_effect=[groups, staff]):
            with app_module.app.test_request_context("/api/groups", method="GET"):
                response = app_module.get_groups()

        payload = response.get_json()
        self.assertEqual(payload[0]["member_names"], ["Bob", "Alice"])
        self.assertEqual(payload[1]["member_names"], ["Carol"])

    def test_delete_group_clears_staff_group_id_before_saving(self):
        groups = [
            {"id": "g1", "name": "Alpha", "members": ["legacy-a"]},
            {"id": "g2", "name": "Beta", "members": []},
        ]
        staff = [
            {"id": "s1", "name": "Bob", "group_id": "g1"},
            {"id": "s2", "name": "Alice", "group_id": "g2"},
            {"id": "s3", "name": "Carol", "group_id": ""},
        ]

        with patch.object(app_module, "load_json", side_effect=[groups, staff]):
            with patch.object(app_module, "save_json") as save_json:
                with app_module.app.test_request_context("/api/groups/g1", method="DELETE"):
                    response = app_module.delete_group("g1")

        payload = response.get_json()
        self.assertEqual(payload, {"success": True})
        self.assertEqual(save_json.call_count, 2)
        saved_groups = save_json.call_args_list[0].args[1]
        saved_staff = save_json.call_args_list[1].args[1]
        self.assertEqual([group["id"] for group in saved_groups], ["g2"])
        self.assertEqual(saved_staff[0]["group_id"], "")
        self.assertEqual(saved_staff[1]["group_id"], "g2")
        self.assertEqual(saved_staff[2]["group_id"], "")

    def test_add_position_persists_split_allowed_flag(self):
        with patch.object(app_module, "load_json", return_value=[]):
            with patch.object(app_module, "save_json") as save_json:
                with app_module.app.test_request_context(
                    "/api/positions",
                    method="POST",
                    json={
                        "name": "Heavy",
                        "workload": 8,
                        "default_person": "",
                        "category": "",
                        "split_allowed": True,
                    },
                ):
                    response = app_module.add_position()

        payload = response.get_json()
        self.assertTrue(payload["success"])
        saved_positions = save_json.call_args.args[1]
        self.assertTrue(saved_positions[0]["split_allowed"])

    def test_update_position_preserves_split_allowed_flag(self):
        positions = [
            {"id": "p1", "name": "Heavy", "workload": 8, "default_person": "", "category": "", "split_allowed": False},
        ]

        with patch.object(app_module, "load_json", return_value=positions):
            with patch.object(app_module, "save_json") as save_json:
                with app_module.app.test_request_context(
                    "/api/positions/p1",
                    method="PUT",
                    json={
                        "name": "Heavy",
                        "workload": 8,
                        "default_person": "",
                        "category": "",
                        "split_allowed": True,
                    },
                ):
                    response = app_module.update_position("p1")

        payload = response.get_json()
        self.assertTrue(payload["success"])
        saved_positions = save_json.call_args.args[1]
        self.assertTrue(saved_positions[0]["split_allowed"])

    def test_update_position_syncs_future_schedule_but_keeps_history(self):
        positions = [
            {"id": "p14", "name": "专员15", "workload": 8, "default_person": "大分类组1", "category": "", "split_allowed": False},
        ]
        schedule = {
            "2026-06": {
                "24": {"_off_persons": [], "p14": {"status": "on", "person": "大分类组1"}},
                "25": {"_off_persons": [], "p14": {"status": "on", "person": "大分类组1"}},
                "26": {"_off_persons": [], "p14": {"status": "substitute", "person": "大分类组1"}},
                "27": {"_off_persons": [], "p14": {"status": "on", "person": "别人"}},
            },
            "2026-07": {
                "1": {"_off_persons": [], "p14": {"status": "on", "person": "大分类组1"}},
            },
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_schedule", return_value=schedule):
                with patch.object(app_module, "_today_date", return_value=dt.date(2026, 6, 25)):
                    with patch.object(app_module, "save_json") as save_json:
                        with app_module.app.test_request_context(
                            "/api/positions/p14",
                            method="PUT",
                            json={
                                "name": "专员15",
                                "workload": 8,
                                "default_person": "款色组",
                                "category": "",
                                "split_allowed": False,
                            },
                        ):
                            response = app_module.update_position("p14")

        payload = response.get_json()
        self.assertTrue(payload["success"])
        saved_schedule = next(args[1] for args in (call.args for call in save_json.call_args_list) if args[0] == app_module.SCHEDULE_FILE)
        self.assertEqual(saved_schedule["2026-06"]["24"]["p14"]["person"], "大分类组1")
        self.assertEqual(saved_schedule["2026-06"]["25"]["p14"]["person"], "款色组")
        self.assertEqual(saved_schedule["2026-06"]["26"]["p14"]["person"], "款色组")
        self.assertEqual(saved_schedule["2026-06"]["27"]["p14"]["person"], "别人")
        self.assertEqual(saved_schedule["2026-07"]["1"]["p14"]["person"], "款色组")

    def test_get_memo_normalizes_latest_entry_to_global_main_memo(self):
        memo = {
            "2026-06": {
                "content": "中方次品按下列排序安排（每日）：玉兰-徐昊-爱萍-志才-林灏-岐峰-赵创-龙泽-丽彬\n",
                "updated_at": "2026-06-29 13:48",
            },
            "global": {
                "content": "京东北顺序：\n京东中顺序：\n京东南顺序：",
                "updated_at": "2026-06-25 18:20",
            },
        }

        with patch.object(app_module, "_memo_data", return_value=memo):
            with patch.object(app_module, "save_json") as save_json:
                payload = app_module._get_memo(2026, 7)

        self.assertEqual(payload["content"], memo["2026-06"]["content"])
        self.assertEqual(payload["updated_at"], memo["2026-06"]["updated_at"])
        self.assertEqual(save_json.call_count, 1)
        self.assertEqual(save_json.call_args.args[0], app_module.MEMO_FILE)
        self.assertEqual(
            save_json.call_args.args[1],
            {"global": {"content": memo["2026-06"]["content"], "updated_at": "2026-06-29 13:48"}},
        )

    def test_save_memo_writes_global_only(self):
        with patch.object(app_module, "save_json") as save_json:
            result = app_module._save_memo(2026, 7, "固定主备忘录")

        saved = save_json.call_args.args[1]
        self.assertEqual(list(saved.keys()), ["global"])
        self.assertEqual(saved["global"]["content"], "固定主备忘录")
        self.assertTrue(saved["global"]["updated_at"])
        self.assertEqual(result, saved["global"])

    def test_save_day_schedule_can_store_split_slots(self):
        positions = [
            {"id": "p1", "name": "Heavy", "workload": 8, "default_person": "", "category": "", "split_allowed": True},
        ]
        month_data = {
            "24": {
                "_off_persons": [],
                "p1": {"status": "pending", "person": ""},
            }
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_current_month_data", return_value=month_data):
                with patch.object(app_module, "_save_month_schedule") as save_month_schedule:
                    with app_module.app.test_request_context(
                        "/api/schedule/2026/6/day",
                        method="POST",
                        json={
                            "day": 24,
                            "pos_id": "p1",
                            "status": "substitute",
                            "person": "Alice",
                            "slot": "am",
                        },
                    ):
                        response = app_module.save_day_schedule(2026, 6)

        payload = response.get_json()
        self.assertTrue(payload["success"])
        saved_schedule = save_month_schedule.call_args.args[2]
        self.assertEqual(saved_schedule["24"]["p1"]["status"], "split")
        self.assertEqual(saved_schedule["24"]["p1"]["slots"]["am"], {"status": "substitute", "person": "Alice"})

    def test_plan_day_schedule_api_resolves_off_person_ids(self):
        positions = [
            {"id": "p1", "name": "Task A", "workload": 6, "default_person": "Alice", "category": ""},
            {"id": "p2", "name": "Task B", "workload": 6, "default_person": "", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]
        month_data = {
            "28": {
                "_off_persons": [],
                "p1": {"status": "pending", "person": ""},
                "p2": {"status": "pending", "person": ""},
            }
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_staff", return_value=staff):
                with patch.object(app_module, "_groups", return_value=[]):
                    with patch.object(app_module, "_current_month_data", return_value=month_data):
                        with patch.object(app_module, "_save_month_schedule") as save_month_schedule:
                            with app_module.app.test_request_context(
                                "/api/schedule/2026/6/plan-day",
                                method="POST",
                                json={
                                    "day": 28,
                                    "off_person_ids": ["s1"],
                                },
                            ):
                                response = app_module.plan_day_schedule_api(2026, 6)

        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["day_data"]["_off_persons"], ["Alice"])
        self.assertNotEqual(payload["day_data"]["p1"]["person"], "Alice")
        saved_schedule = save_month_schedule.call_args.args[2]
        self.assertEqual(saved_schedule["28"]["_off_persons"], ["Alice"])

    def test_plan_day_schedule_api_uses_saved_off_persons_when_requested(self):
        positions = [
            {"id": "p1", "name": "Task A", "workload": 6, "default_person": "Alice", "category": ""},
            {"id": "p2", "name": "Task B", "workload": 6, "default_person": "", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]
        month_data = {
            "28": {
                "_off_persons": ["Alice"],
                "p1": {"status": "pending", "person": ""},
                "p2": {"status": "pending", "person": ""},
            }
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_staff", return_value=staff):
                with patch.object(app_module, "_groups", return_value=[]):
                    with patch.object(app_module, "_current_month_data", return_value=month_data):
                        with patch.object(app_module, "_save_month_schedule") as save_month_schedule:
                            with app_module.app.test_request_context(
                                "/api/schedule/2026/6/plan-day",
                                method="POST",
                                json={
                                    "day": 28,
                                    "off_person_ids": [],
                                    "off_persons": [],
                                    "use_saved_off_persons": True,
                                },
                            ):
                                response = app_module.plan_day_schedule_api(2026, 6)

        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["day_data"]["_off_persons"], ["Alice"])
        self.assertNotEqual(payload["day_data"]["p1"]["person"], "Alice")
        saved_schedule = save_month_schedule.call_args.args[2]
        self.assertEqual(saved_schedule["28"]["_off_persons"], ["Alice"])

    def test_plan_day_schedule_api_passes_scatter_groups_flag(self):
        positions = [
            {"id": "p1", "name": "Task A", "workload": 6, "default_person": "Alpha", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Amy", "group_id": "g1", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]
        month_data = {
            "28": {
                "_off_persons": [],
                "p1": {"status": "pending", "person": ""},
            }
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_staff", return_value=staff):
                with patch.object(app_module, "_groups", return_value=[{"id": "g1", "name": "Alpha"}]):
                    with patch.object(app_module, "_current_month_data", return_value=month_data):
                        with patch.object(app_module, "_save_month_schedule") as save_month_schedule:
                            with patch.object(app_module, "core_plan_day_schedule", return_value={"day_data": {"_scatter_groups": True, "p1": {"status": "substitute", "person": "Amy"}}, "assigned": 1, "failed": 0}) as plan_day_schedule:
                                with app_module.app.test_request_context(
                                    "/api/schedule/2026/6/plan-day",
                                    method="POST",
                                    json={
                                        "day": 28,
                                        "off_person_ids": [],
                                        "scatter_groups": True,
                                    },
                                ):
                                    response = app_module.plan_day_schedule_api(2026, 6)

        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertTrue(plan_day_schedule.call_args.kwargs["scatter_groups"])
        saved_schedule = save_month_schedule.call_args.args[2]
        self.assertTrue(saved_schedule["28"]["_scatter_groups"])

    def test_cascade_off_clears_split_on_slot_and_substitute_slot(self):
        positions = [
            {"id": "p1", "name": "Split A", "workload": 10, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Regular B", "workload": 6, "default_person": "", "category": "", "split_allowed": False},
        ]
        month_data = {
            "5": {
                "_off_persons": [],
                "p1": {
                    "status": "split",
                    "person": "徐昊",
                    "slots": {
                        "am": {"status": "on", "person": "徐昊"},
                        "pm": {"status": "substitute", "person": "曼诗"},
                    },
                },
                "p2": {"status": "substitute", "person": "徐昊"},
            }
        }

        with patch.object(app_module, "_positions", return_value=positions):
            with patch.object(app_module, "_current_month_data", return_value=month_data):
                with patch.object(app_module, "_save_month_schedule") as save_month_schedule:
                    with app_module.app.test_request_context(
                        "/api/cascade-off",
                        method="POST",
                        json={
                            "year": 2026,
                            "month": 7,
                            "day": 5,
                            "person": "徐昊",
                            "person_is_off": True,
                        },
                    ):
                        response = app_module.cascade_off()

        payload = response.get_json()
        self.assertTrue(payload["success"])
        updated = payload["updated"]
        self.assertIn(
            {"pos_id": "p1", "slot": "am", "person": "徐昊", "status": "off", "pos_name": "Split A"},
            updated,
        )
        self.assertIn(
            {"pos_id": "p2", "person": "", "status": "pending", "pos_name": "Regular B"},
            updated,
        )
        saved_schedule = save_month_schedule.call_args.args[2]
        self.assertEqual(saved_schedule["5"]["_off_persons"], ["徐昊"])
        self.assertEqual(saved_schedule["5"]["p1"]["slots"]["am"], {"status": "off", "person": "徐昊"})
        self.assertEqual(saved_schedule["5"]["p1"]["slots"]["pm"], {"status": "substitute", "person": "曼诗"})
        self.assertEqual(saved_schedule["5"]["p2"], {"status": "pending", "person": ""})


if __name__ == "__main__":
    unittest.main()
