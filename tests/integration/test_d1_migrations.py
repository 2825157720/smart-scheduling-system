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
            "app_revision", "mutation_audit",
        }.issubset(tables))
        connection.execute("INSERT INTO groups (id, name) VALUES ('g1', '测试组')")
        with self.assertRaises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO groups (id, name) VALUES ('g2', '测试组')")
        connection.execute("INSERT INTO staff (id, name, group_id) VALUES ('s1', '测试人员', 'g1')")
        connection.execute("DELETE FROM groups WHERE id = 'g1'")
        self.assertIsNone(connection.execute("SELECT group_id FROM staff WHERE id = 's1'").fetchone()[0])
        self.assertIn("group_id", {row[1] for row in connection.execute("PRAGMA table_info(schedule_cells)")})
        self.assertIn("sort_order", {row[1] for row in connection.execute("PRAGMA table_info(positions)")})
        indexes = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("idx_schedule_cells_day_position", indexes)


if __name__ == "__main__":
    unittest.main()
