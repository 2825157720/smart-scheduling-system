import datetime as dt
from collections import Counter
import unittest

from schedule_core import (
    AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT,
    FAIRNESS_LOAD_TOLERANCE,
    FAIRNESS_ROTATION_LOAD_TOLERANCE,
    build_fairness_context,
    can_cover_member,
    find_global_name_collisions,
    group_active_members,
    group_is_fully_off,
    group_member_names,
    plan_day_schedule,
    plan_position_assignment,
    person_day_workload,
    rank_fair_candidates,
)


class ScheduleCoreTests(unittest.TestCase):
    def test_position_refresh_restores_available_new_default(self):
        position = {
            "id": "p-jd",
            "name": "京东中",
            "workload": 2,
            "default_person": "赵创",
            "category": "京东",
            "split_allowed": False,
        }
        staff = [
            {"id": "s1", "name": "赵创", "can_jd": True},
            {"id": "s2", "name": "龙泽", "can_jd": True},
        ]
        day_data = {"p-jd": {"status": "substitute", "person": "龙泽"}}

        result = plan_position_assignment(
            position,
            [position],
            staff,
            [],
            year=2026,
            month=8,
            day=8,
            day_data=day_data,
            month_schedule={"8": day_data},
        )

        self.assertEqual(result, {"status": "on", "person": "赵创"})

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

    def test_global_name_collision_is_reported_for_migration_gate(self):
        collisions = find_global_name_collisions(
            [{"id": "s1", "name": "同名主体"}, {"id": "s2", "name": "独立人员"}],
            [{"id": "g1", "name": "同名主体"}, {"id": "g2", "name": "独立小组"}],
        )

        self.assertEqual(collisions, ["同名主体"])

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

    def test_weekend_only_covers_friday_through_sunday_and_saturday_only_stays_unchanged(self):
        target = {"id": "p_target", "name": "Target", "workload": 8, "default_person": "Target", "category": ""}
        weekend_member = {
            "id": "s_weekend",
            "name": "Weekend",
            "group_id": "",
            "can_cpin": True,
            "can_jd": True,
            "saturday_only": False,
            "weekend_only": True,
            "no_substitute": False,
        }
        saturday_member = {
            **weekend_member,
            "id": "s_saturday",
            "name": "Saturday",
            "saturday_only": True,
            "weekend_only": False,
        }
        staff = [weekend_member, saturday_member]

        for day, expected in (
            (dt.date(2026, 8, 6), False),
            (dt.date(2026, 8, 7), True),
            (dt.date(2026, 8, 8), True),
            (dt.date(2026, 8, 9), True),
            (dt.date(2026, 8, 10), False),
        ):
            with self.subTest(day=day, restriction="weekend"):
                self.assertEqual(
                    can_cover_member(weekend_member, target, {}, [target], staff, [], day=day),
                    expected,
                )

        for day, expected in (
            (dt.date(2026, 8, 7), False),
            (dt.date(2026, 8, 8), True),
            (dt.date(2026, 8, 9), False),
        ):
            with self.subTest(day=day, restriction="saturday"):
                self.assertEqual(
                    can_cover_member(saturday_member, target, {}, [target], staff, [], day=day),
                    expected,
                )

        both_limited = {**weekend_member, "saturday_only": True}
        self.assertTrue(
            can_cover_member(
                both_limited,
                target,
                {},
                [target],
                [both_limited],
                [],
                day=dt.date(2026, 8, 7),
            )
        )

    def test_weekend_only_eligibility_stays_synchronized_with_adjacent_day_rotation(self):
        staff = [
            {
                "id": "s_weekend",
                "name": "A周末",
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "weekend_only": True,
                "no_substitute": False,
            },
            {
                "id": "s_regular",
                "name": "B普通",
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "weekend_only": False,
                "no_substitute": False,
            },
        ]
        positions = [
            {
                "id": "p_empty",
                "name": "空岗",
                "workload": 8,
                "default_person": "",
                "category": "",
                "split_allowed": False,
            }
        ]
        month_schedule = {}
        assigned = []

        for day in (7, 8, 9, 10):
            result = plan_day_schedule(
                positions,
                staff,
                [],
                year=2026,
                month=8,
                day=day,
                month_schedule=month_schedule,
            )
            month_schedule[str(day)] = result["day_data"]
            assigned.append(result["day_data"]["p_empty"]["person"])

        self.assertEqual(assigned, ["A周末", "B普通", "A周末", "B普通"])

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
        self.assertEqual(day_data["p3"], {"status": "substitute", "person": "Bob"})
        self.assertEqual(result["assigned"], 3)
        self.assertEqual(result["failed"], 0)

    def test_plan_day_schedule_splits_eligible_position_when_it_reduces_imbalance(self):
        positions = [
            {"id": "p1", "name": "Heavy", "workload": 8, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Light", "workload": 1, "default_person": "Bob", "category": "", "split_allowed": False},
        ]
        staff = [
            {"id": "s1", "name": "Alice", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "Bob", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": True},
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

        self.assertEqual(AUTO_SPLIT_MIN_SPREAD_IMPROVEMENT, 4.0)
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

    def test_plan_day_schedule_does_not_split_below_four_points_of_spread_improvement(self):
        positions = [
            {"id": "p1", "name": "Almost", "workload": 7.98, "default_person": "", "category": "", "split_allowed": True},
            {"id": "p2", "name": "Light", "workload": 1, "default_person": "B", "category": "", "split_allowed": False},
        ]
        staff = [
            {"id": "s1", "name": "A", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
            {"id": "s2", "name": "B", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": True},
            {"id": "s3", "name": "C", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False},
        ]

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=3,
        )

        self.assertEqual(result["day_data"]["p1"]["status"], "substitute")

    def test_plan_day_schedule_does_not_split_when_only_standard_deviation_improves(self):
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
        self.assertEqual(day_data["p2"]["status"], "substitute")
        loads = sorted(
            person_day_workload(name, day_data, pos_map, staff, [])
            for name in ["A", "B", "C", "D"]
        )
        self.assertEqual(loads, [0.0, 0.0, 3.0, 4.0])
        self.assertEqual(result["assigned"], 2)
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

    def test_plan_day_schedule_applies_only_the_best_split_proposal(self):
        base_loads = [
            ("A", 4),
            ("B", 11),
            ("C", 9),
            ("D", 3),
            ("E", 5),
            ("F", 10),
        ]
        positions = [
            {
                "id": f"p_{name}",
                "name": f"{name} base",
                "workload": workload,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name, workload in base_loads
        ]
        positions.extend([
            {
                "id": "p_target_1",
                "name": "Target 1",
                "workload": 12,
                "default_person": "",
                "category": "",
                "split_allowed": True,
            },
            {
                "id": "p_target_2",
                "name": "Target 2",
                "workload": 12,
                "default_person": "",
                "category": "",
                "split_allowed": True,
            },
        ])
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            }
            for name, _ in base_loads
        ]

        first = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=3,
        )
        repeated = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=3,
        )
        split_ids = [
            pos["id"]
            for pos in positions
            if first["day_data"][pos["id"]]["status"] == "split"
        ]

        self.assertEqual(split_ids, ["p_target_2"])
        self.assertEqual(first["day_data"]["p_target_2"]["slots"]["am"]["person"], "A")
        self.assertEqual(first["day_data"]["p_target_2"]["slots"]["pm"]["person"], "E")
        self.assertEqual(first["day_data"], repeated["day_data"])

    def test_rank_fair_candidates_expands_to_fresh_plus_six_only_when_base_pool_is_stale(self):
        candidate_loads = [
            ("Low10", 10),
            ("Low12", 12),
            ("Old16", 16),
            ("Fresh16", 16),
            ("Fresh16.01", 16.01),
        ]
        positions = [
            {
                "id": f"p_{name}",
                "name": f"{name} base",
                "workload": workload,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name, workload in candidate_loads
        ]
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            }
            for name, _ in candidate_loads
        ]
        day_data = {
            pos["id"]: {"status": "on", "person": pos["default_person"]}
            for pos in positions
        }
        ranked = rank_fair_candidates(
            staff,
            day_data,
            positions,
            staff,
            [],
            fairness_context={
                "previous_substitutes": {"Low10", "Low12", "Old16"},
                "month_substitute_workloads": {},
            },
        )

        self.assertEqual(FAIRNESS_LOAD_TOLERANCE, 2.0)
        self.assertEqual(FAIRNESS_ROTATION_LOAD_TOLERANCE, 6.0)
        self.assertEqual(
            [member["name"] for member in ranked],
            ["Fresh16", "Low10", "Low12"],
        )

    def test_rank_fair_candidates_keeps_plus_two_when_base_pool_has_a_fresh_candidate(self):
        candidate_loads = [("Old10", 10), ("Fresh12", 12), ("Fresh16", 16)]
        positions = [
            {
                "id": f"p_{name}",
                "name": f"{name} base",
                "workload": workload,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name, workload in candidate_loads
        ]
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            }
            for name, _ in candidate_loads
        ]
        day_data = {
            pos["id"]: {"status": "on", "person": pos["default_person"]}
            for pos in positions
        }
        ranked = rank_fair_candidates(
            staff,
            day_data,
            positions,
            staff,
            [],
            fairness_context={
                "previous_substitutes": {"Old10"},
                "month_substitute_workloads": {"Fresh12": 100, "Fresh16": 0},
            },
        )

        self.assertEqual(
            [member["name"] for member in ranked],
            ["Fresh12", "Old10"],
        )

    def test_low_workload_positions_use_each_eligible_substitute_once_before_repeating(self):
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "weekend_only": False,
                "no_substitute": False,
            }
            for name in ("A", "B", "C")
        ]
        positions = [
            {
                "id": f"p_{name}",
                "name": f"{name} base",
                "workload": workload,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name, workload in (("A", 10), ("B", 12), ("C", 12))
        ]
        positions.extend([
            {
                "id": f"p_jd_{suffix}",
                "name": f"JD {suffix}",
                "workload": 2,
                "default_person": "",
                "category": "京东",
                "split_allowed": False,
            }
            for suffix in ("middle", "north", "south", "west")
        ])

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=2,
            month_schedule={
                "1": {
                    "p_jd_middle": {"status": "substitute", "person": "B"},
                    "p_jd_north": {"status": "substitute", "person": "C"},
                },
            },
        )

        self.assertEqual(
            [result["day_data"][position_id]["person"] for position_id in (
                "p_jd_middle", "p_jd_north", "p_jd_south", "p_jd_west",
            )],
            ["A", "B", "C", "A"],
        )

    def test_plan_day_schedule_fair_pool_includes_plus_two_and_excludes_plus_two_point_zero_one(self):
        candidate_loads = [
            ("A10", 10),
            ("B10", 10),
            ("C10", 10),
            ("D12", 12),
            ("E12", 12),
            ("F12.01", 12.01),
            ("G16", 16),
            ("H20", 20),
        ]
        positions = [
            {
                "id": f"p_{name}",
                "name": f"{name} base",
                "workload": workload,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name, workload in candidate_loads
        ]
        positions.append(
            {
                "id": "p_target",
                "name": "Target",
                "workload": 4,
                "default_person": "",
                "category": "",
                "split_allowed": False,
            }
        )
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            }
            for name, _ in candidate_loads
        ]
        month_schedule = {
            "26": {
                "p_target": {"status": "substitute", "person": "E12"},
            },
            "27": {
                "p_A10": {"status": "substitute", "person": "A10"},
                "p_B10": {"status": "substitute", "person": "B10"},
                "p_C10": {"status": "substitute", "person": "C10"},
                "p_D12": {"status": "substitute", "person": "D12"},
            },
        }

        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=7,
            day=28,
            off_persons=[],
            month_schedule=month_schedule,
        )

        # E12 remains eligible at exactly +2. F12.01 would win the fairness
        # tiebreaks if it incorrectly entered the pool.
        self.assertEqual(result["day_data"]["p_target"], {"status": "substitute", "person": "E12"})

    def test_consecutive_planning_keeps_one_split_and_rotates_both_split_workers(self):
        positions = [
            {
                "id": "p_target",
                "name": "Target",
                "workload": 8,
                "default_person": "",
                "category": "",
                "split_allowed": True,
            },
            {
                "id": "p_b",
                "name": "B base",
                "workload": 1,
                "default_person": "B",
                "category": "",
                "split_allowed": False,
            },
        ]
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": name == "B",
            }
            for name in ("A", "B", "C", "D", "E")
        ]
        day_one = {
            "p_target": {
                "status": "split",
                "slots": {
                    "am": {"status": "substitute", "person": "A", "workload": 4},
                    "pm": {"status": "substitute", "person": "C", "workload": 4},
                },
            },
            "p_b": {"status": "on", "person": "B"},
        }

        second = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=2,
            month_schedule={"1": day_one},
        )
        repeated = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=8,
            day=2,
            month_schedule={"1": day_one},
        )
        split_cells = [
            cell
            for cell in second["day_data"].values()
            if isinstance(cell, dict) and cell.get("status") == "split"
        ]
        workers = {
            split_cells[0]["slots"][slot]["person"]
            for slot in ("am", "pm")
        }

        self.assertEqual(len(split_cells), 1)
        self.assertEqual(workers, {"D", "E"})
        self.assertEqual(second["day_data"], repeated["day_data"])

    def test_plan_day_schedule_uses_weighted_prior_substitutions_and_ignores_target_day(self):
        names = ["A", "B", "C"]
        positions = [
            {
                "id": f"p_base_{name}",
                "name": f"{name} base",
                "workload": 10,
                "default_person": name,
                "category": "",
                "split_allowed": False,
            }
            for name in names
        ]
        positions.append(
            {
                "id": "p_target",
                "name": "Target",
                "workload": 8,
                "default_person": "",
                "category": "",
                "split_allowed": False,
            }
        )
        staff = [
            {
                "id": f"s_{name}",
                "name": name,
                "group_id": "",
                "can_cpin": True,
                "can_jd": True,
                "saturday_only": False,
                "no_substitute": False,
            }
            for name in names
        ]
        month_schedule = {
            1: {
                "p_target": {"status": "substitute", "person": "A"},
            },
            "2": {
                "p_target": {
                    "status": "split",
                    "person": "B",
                    "slots": {
                        "am": {"status": "substitute", "person": "B", "workload": 3},
                        "pm": {"status": "substitute", "person": "C", "workload": 0},
                    },
                },
            },
            "3": {
                "p_target": {"status": "on", "person": "B"},
            },
            "4": {
                "p_target": {"status": "substitute", "person": "B"},
            },
        }

        fairness_context = build_fairness_context(month_schedule, positions, day=4)
        result = plan_day_schedule(
            positions,
            staff,
            [],
            year=2026,
            month=7,
            day=4,
            month_schedule=month_schedule,
        )

        # Prior substitute workload is A=8, B=3, C=4. The old result already
        # stored for day 4 must not count against B.
        self.assertEqual(fairness_context["previous_substitutes"], set())
        self.assertEqual(
            fairness_context["month_substitute_workloads"],
            {"A": 8.0, "B": 3.0, "C": 4.0},
        )
        self.assertEqual(result["day_data"]["p_target"], {"status": "substitute", "person": "B"})




if __name__ == "__main__":
    unittest.main()
