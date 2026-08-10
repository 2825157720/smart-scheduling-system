import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))


class D1MigrationTests(unittest.TestCase):
    def test_initial_schema_creates_required_tables_and_constraints(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("PRAGMA foreign_keys = ON")
        for migration in MIGRATIONS:
            connection.executescript(migration.read_text(encoding="utf-8"))
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({
            "groups", "staff", "positions", "schedule_days", "schedule_day_off_staff",
            "schedule_day_off_groups", "schedule_cells", "schedule_slots", "hidden_days", "memos", "schedule_backups",
            "app_revision", "mutation_audit", "auth_login_attempts",
        }.issubset(tables))
        connection.execute("INSERT INTO groups (id, name) VALUES ('g1', '测试组')")
        with self.assertRaises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO groups (id, name) VALUES ('g2', '测试组')")
        connection.execute("INSERT INTO staff (id, name, group_id) VALUES ('s1', '测试人员', 'g1')")
        connection.execute("DELETE FROM groups WHERE id = 'g1'")
        self.assertIsNone(connection.execute("SELECT group_id FROM staff WHERE id = 's1'").fetchone()[0])
        schedule_cell_columns = {row[1] for row in connection.execute("PRAGMA table_info(schedule_cells)")}
        self.assertIn("group_id", schedule_cell_columns)
        self.assertIn("assignment_source", schedule_cell_columns)
        self.assertIn("sort_order", {row[1] for row in connection.execute("PRAGMA table_info(positions)")})
        staff_columns = {row[1] for row in connection.execute("PRAGMA table_info(staff)")}
        self.assertIn("weekend_only", staff_columns)
        self.assertEqual(
            connection.execute("SELECT weekend_only FROM staff WHERE id = 's1'").fetchone()[0],
            0,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            connection.execute("UPDATE staff SET weekend_only = 2 WHERE id = 's1'")
        connection.execute("UPDATE staff SET saturday_only = 1, no_substitute = 1 WHERE id = 's1'")
        self.assertEqual(
            connection.execute(
                "SELECT saturday_only, weekend_only, no_substitute FROM staff WHERE id = 's1'"
            ).fetchone(),
            (1, 0, 1),
        )
        indexes = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("idx_schedule_cells_day_position", indexes)
        self.assertIn("idx_schedule_cells_position_source", indexes)
        self.assertIn("idx_auth_login_attempts_updated_at", indexes)
        connection.execute("INSERT INTO positions (id, name, workload) VALUES ('p1', '岗位', 1)")
        connection.execute("INSERT INTO schedule_days (id, schedule_date) VALUES ('d1', '2026-08-08')")
        connection.execute("INSERT INTO schedule_cells (id, schedule_day_id, position_id, status) VALUES ('c1', 'd1', 'p1', 'pending')")
        self.assertEqual(connection.execute("SELECT assignment_source FROM schedule_cells WHERE id = 'c1'").fetchone()[0], "legacy")
        with self.assertRaises(sqlite3.IntegrityError):
            connection.execute("UPDATE schedule_cells SET assignment_source = 'unknown' WHERE id = 'c1'")


if __name__ == "__main__":
    unittest.main()
