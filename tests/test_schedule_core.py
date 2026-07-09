import datetime as dt
from collections import Counter
import unittest

from schedule_core import (
    can_cover_member,
    group_active_members,
    group_is_fully_off,
    group_member_names,
    plan_day_schedule,
    person_day_workload,
)


class ScheduleCoreTests(unittest.TestCase):
    def setUp(self):
        self.groups = [
            {"id": "g1", "name": "Alpha", "members": ["ignored-a", "ignored-b"]},
            {"id": "g2", "name": "Beta", "members": ["ignored-c"]},
        ]
        self.staff = [
            {
                "id": "s1",
                "name": "Bob",
                "group_id": "g1",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": True,
                "no_substitute": False,
            },
            {
                "id": "s2",
                "name": "Alice",
                "group_id": "g1",
                "can_cpin": False,
                "can_jd": False,
                "saturday_only": False,
                "no_substitute": False,
            },
            {
                "id": "s3",
                "name": "Carol",
                "group_id": "g2",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": True,
            },
            {
                "id": "s4",
                "name": "Dana",
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            },
            {
                "id": "s5",
                "name": "Target",
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            },
        ]
        self.positions = [
            {"id": "p_group", "name": "Group task", "workload": 10, "default_person": "Alpha", "category": ""},
            {"id": "p_bob_def", "name": "Bob default", "workload": 5, "default_person": "Bob", "category": ""},
            {"id": "p_plain", "name": "Plain", "workload": 6, "default_person": "", "category": ""},
            {"id": "p_cpin", "name": "Cpin", "workload": 7, "default_person": "", "category": "次品"},
            {"id": "p_jd", "name": "Jd", "workload": 7, "default_person": "", "category": "京东"},
            {"id": "p_target", "name": "Target", "workload": 7, "default_person": "Target", "category": ""},
        ]

    def test_group_members_come_from_staff_group_id(self):
        self.assertEqual(group_member_names("Alpha", self.staff, self.groups), ["Bob", "Alice"])
        self.assertEqual(group_member_names("Beta", self.staff, self.groups), ["Carol"])

    def test_group_active_members_are_detected_correctly(self):
        day_data = {
            "p_plain": {"status": "on", "person": "Alice"},
            "p_bob_def": {"status": "substitute", "person": "Bob"},
            "p_cpin": {"status": "off", "person": "Carol"},
        }

        self.assertEqual(
            group_active_members("Alpha", day_data, {p["id"]: p for p in self.positions}, self.staff, self.groups),
            ["Bob", "Alice"],
        )

    def test_group_is_fully_off_when_all_members_are_off(self):
        day_data = {
            "p_plain": {"status": "off", "person": "Alice"},
            "p_bob_def": {"status": "off", "person": "Bob"},
        }

        self.assertTrue(
            group_is_fully_off("Alpha", day_data, {p["id"]: p for p in self.positions}, self.staff, self.groups)
        )
        self.assertEqual(
            group_active_members("Alpha", day_data, {p["id"]: p for p in self.positions}, self.staff, self.groups),
            [],
        )

    def test_grouped_default_person_shares_workload_across_active_members(self):
        day_data = {
            "p_plain": {"status": "on", "person": "Alice"},
            "p_bob_def": {"status": "substitute", "person": "Bob"},
        }

        self.assertEqual(
            person_day_workload("Alice", day_data, {p["id"]: p for p in self.positions}, self.staff, self.groups),
            11.0,
        )
        self.assertEqual(
            person_day_workload("Bob", day_data, {p["id"]: p for p in self.positions}, self.staff, self.groups),
            10.0,
        )

    def test_can_cover_member_respects_existing_rules(self):
        day = dt.date(2026, 6, 24)
        day_data = {
            "_off_persons": ["Dana"],
            "p_bob_def": {"status": "substitute", "person": "Alice"},
            "p_plain": {"status": "on", "person": "Target"},
        }
        pos_map = {p["id"]: p for p in self.positions}

        with self.subTest("off members cannot cover"):
            self.assertFalse(
                can_cover_member(
                    self.staff[3],
                    self.positions[2],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )

        with self.subTest("default person of a substituted position cannot cover"):
            self.assertFalse(
                can_cover_member(
                    self.staff[0],
                    self.positions[2],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )

        with self.subTest("target default person cannot cover their own position"):
            self.assertFalse(
                can_cover_member(
                    self.staff[4],
                    self.positions[5],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )

        with self.subTest("category saturday_only and no_substitute rules apply"):
            self.assertFalse(
                can_cover_member(
                    self.staff[1],
                    self.positions[3],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )
            self.assertFalse(
                can_cover_member(
                    self.staff[1],
                    self.positions[4],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )
            self.assertFalse(
                can_cover_member(
                    self.staff[2],
                    self.positions[2],
                    day_data,
                    self.positions,
                    self.staff,
                    self.groups,
                    day=day,
                )
            )

    def test_can_cover_member_allows_active_member_even_with_separate_off_cell(self):
        day = dt.date(2026, 6, 24)
        positions = [
            {"id": "p_active", "name": "Active", "workload": 5, "default_person": "", "category": ""},
            {"id": "p_off", "name": "Off", "workload": 5, "default_person": "", "category": ""},
            {"id": "p_cover", "name": "Cover", "workload": 5, "default_person": "", "category": ""},
        ]
        day_data = {
            "_off_persons": [],
            "p_active": {"status": "on", "person": "Alice"},
            "p_off": {"status": "off", "person": "Alice"},
        }

        self.assertTrue(
            can_cover_member(
                self.staff[1],
                positions[2],
                day_data,
                positions,
                self.staff,
                self.groups,
                day=day,
            )
        )

    def test_plan_day_schedule_rebuilds_entire_day_from_off_list(self):
        positions = [
            {"id": "p1", "name": "A岗", "workload": 10, "default_person": "Alice", "category": ""},
            {"id": "p2", "name": "B岗", "workload": 20, "default_person": "Bob", "category": ""},
            {"id": "p3", "name": "C岗", "workload": 6, "default_person": "", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=["Alice"],
        )

        day_data = result["day_data"]
        self.assertEqual(day_data["_off_persons"], ["Alice"])
        self.assertEqual(day_data["p1"], {"status": "substitute", "person": "Carol"})
        self.assertEqual(day_data["p2"], {"status": "on", "person": "Bob"})
        self.assertEqual(day_data["p3"], {"status": "substitute", "person": "Carol"})
        self.assertEqual(result["assigned"], 3)
        self.assertEqual(result["failed"], 0)

    def test_plan_day_schedule_splits_eligible_position_when_it_reduces_imbalance(self):
        positions = [
            {"id": "p1", "name": "Heavy", "workload": 8, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Light", "workload": 1, "default_person": "", "category": "", "split_allowed": False},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=[],
        )

        day_data = result["day_data"]
        pos_map = {p["id"]: p for p in positions}

        self.assertEqual(day_data["p1"]["status"], "split")
        self.assertEqual(day_data["p1"]["slots"]["am"]["workload"], 4.0)
        self.assertEqual(day_data["p1"]["slots"]["pm"]["workload"], 4.0)
        self.assertNotEqual(day_data["p1"]["slots"]["am"]["person"], day_data["p1"]["slots"]["pm"]["person"])
        loads = sorted(
            person_day_workload(name, day_data, pos_map, staff, [])
            for name in ["Alice", "Bob", "Carol"]
        )
        self.assertEqual(loads, [1.0, 4.0, 4.0])
        self.assertEqual(result["assigned"], 3)
        self.assertEqual(result["failed"], 0)

    def test_plan_day_schedule_splits_when_spread_stays_the_same_but_balance_improves(self):
        positions = [
            {"id": "p1", "name": "Light", "workload": 3, "default_person": "", "category": "", "split_allowed": False},
            {"id": "p2", "name": "SplitMe", "workload": 4, "default_person": "", "category": "", "split_allowed": True},
        ]
        staff = [
            {"id": "s1", "name": "A", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "B", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "C", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s4", "name": "D", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]
        pos_map = {p["id"]: p for p in positions}

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=[],
        )

        day_data = result["day_data"]
        self.assertEqual(day_data["p2"]["status"], "split")
        self.assertEqual(day_data["p2"]["slots"]["am"]["workload"], 2.0)
        self.assertEqual(day_data["p2"]["slots"]["pm"]["workload"], 2.0)
        loads = sorted(
            person_day_workload(name, day_data, pos_map, staff, [])
            for name in ["A", "B", "C", "D"]
        )
        self.assertEqual(loads, [0.0, 2.0, 2.0, 3.0])
        self.assertEqual(result["assigned"], 3)
        self.assertEqual(result["failed"], 0)

    def test_plan_day_schedule_does_not_split_when_default_person_is_already_on_duty(self):
        positions = [
            {"id": "p1", "name": "Heavy", "workload": 8, "default_person": "Alice", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Light", "workload": 1, "default_person": "Bob", "category": "", "split_allowed": False},
            {"id": "p3", "name": "Light2", "workload": 1, "default_person": "Carol", "category": "", "split_allowed": False},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=[],
            scatter_groups=True,
        )

        self.assertEqual(result["day_data"]["p1"], {"status": "on", "person": "Alice"})

    def test_plan_day_schedule_scatter_groups_prefers_lighter_non_group_member_over_heavier_group_member(self):
        positions = [
            {"id": "p_other", "name": "Other load", "workload": 2, "default_person": "Dana", "category": ""},
            {"id": "p_group", "name": "Group task", "workload": 6, "default_person": "Alpha", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Zoe", "group_id": "g1", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Amy", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            self.groups,
            year=2026,
            month=6,
            day=24,
            off_persons=[],
            scatter_groups=True,
        )

        day_data = result["day_data"]
        pos_map = {p["id"]: p for p in positions}

        self.assertTrue(day_data["_scatter_groups"])
        self.assertEqual(day_data["p_other"], {"status": "on", "person": "Dana"})
        self.assertEqual(day_data["p_group"]["person"], "Zoe")
        self.assertEqual(day_data["p_group"]["status"], "substitute")
        self.assertEqual(person_day_workload("Zoe", day_data, pos_map, staff, self.groups), 6.0)
        self.assertEqual(person_day_workload("Amy", day_data, pos_map, staff, self.groups), 0.0)

    def test_plan_day_schedule_scatter_groups_falls_back_to_non_group_member_when_group_member_is_off(self):
        positions = [
            {"id": "p_other", "name": "Other load", "workload": 2, "default_person": "Dana", "category": ""},
            {"id": "p_group", "name": "Group task", "workload": 6, "default_person": "Alpha", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Zoe", "group_id": "g1", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Amy", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            self.groups,
            year=2026,
            month=6,
            day=24,
            off_persons=["Zoe"],
            scatter_groups=True,
        )

        self.assertTrue(result["day_data"]["_scatter_groups"])
        self.assertEqual(result["day_data"]["p_other"], {"status": "on", "person": "Dana"})
        self.assertEqual(result["day_data"]["p_group"]["person"], "Amy")

    def test_person_day_workload_ignores_scatter_group_placeholders(self):
        positions = [
            {"id": "p_group", "name": "Group task", "workload": 6, "default_person": "Alpha", "category": ""},
            {"id": "p_alice", "name": "Alice load", "workload": 4, "default_person": "Alice", "category": ""},
            {"id": "p_bob", "name": "Bob load", "workload": 4, "default_person": "Bob", "category": ""},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "g1", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "g1", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]
        day_data = {
            "_scatter_groups": True,
            "p_group": {"status": "on", "person": "Alpha"},
            "p_alice": {"status": "on", "person": "Alice"},
            "p_bob": {"status": "on", "person": "Bob"},
        }
        pos_map = {p["id"]: p for p in positions}

        self.assertEqual(person_day_workload("Alice", day_data, pos_map, staff, self.groups), 4.0)
        self.assertEqual(person_day_workload("Bob", day_data, pos_map, staff, self.groups), 4.0)

    def test_plan_day_schedule_allows_same_person_to_cover_multiple_full_positions(self):
        positions = [
            {"id": "p1", "name": "Slot 1", "workload": 4, "default_person": "", "category": "", "split_allowed": False},
            {"id": "p2", "name": "Slot 2", "workload": 4, "default_person": "", "category": "", "split_allowed": False},
            {"id": "p3", "name": "Slot 3", "workload": 4, "default_person": "", "category": "", "split_allowed": False},
        ]
        staff = [
            {"id": "s1", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": True},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=[],
        )

        self.assertEqual(result["day_data"]["p1"], {"status": "substitute", "person": "Bob"})
        self.assertEqual(result["day_data"]["p2"], {"status": "substitute", "person": "Bob"})
        self.assertEqual(result["day_data"]["p3"], {"status": "substitute", "person": "Bob"})

    def test_plan_day_schedule_limits_each_person_to_one_split_slot(self):
        positions = [
            {"id": "p1", "name": "Slot 1", "workload": 4, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Slot 2", "workload": 10, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p3", "name": "Slot 3", "workload": 10, "default_person": "", "category": "", "split_allowed": True},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s3", "name": "Carol", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s4", "name": "Dave", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=6,
            day=24,
            off_persons=[],
            scatter_groups=True,
        )

        split_counts = Counter()
        full_counts = Counter()
        for pos in positions:
            cell = result["day_data"][pos["id"]]
            if cell["status"] == "split":
                for slot in ("am", "pm"):
                    person = cell["slots"][slot]["person"]
                    if person:
                        split_counts[person] += 1
            elif cell["person"]:
                full_counts[cell["person"]] += 1

        self.assertLessEqual(split_counts["Alice"], 1)
        self.assertEqual(full_counts["Alice"], 1)
        self.assertEqual(result["failed"], 0)




if __name__ == "__main__":
    unittest.main()
