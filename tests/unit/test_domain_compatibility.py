import unittest


class DomainCompatibilityTests(unittest.TestCase):
    def test_worker_domain_exports_legacy_schedule_algorithm(self):
        from schedule_core import plan_day_schedule as legacy
        from src.domain.schedule.core import plan_day_schedule as worker_domain

        positions = [{"id": "p1", "name": "岗位", "workload": 4, "default_person": "", "category": "", "split_allowed": False}]
        staff = [{"id": "s1", "name": "人员", "group_id": "", "can_cpin": True, "can_jd": True, "saturday_only": False, "no_substitute": False}]
        kwargs = {"year": 2028, "month": 2, "day": 29, "off_persons": []}
        self.assertEqual(worker_domain(positions, staff, [], **kwargs), legacy(positions, staff, [], **kwargs))


if __name__ == "__main__":
    unittest.main()
