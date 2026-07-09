import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import db_json_store
import app as app_module


class DatabaseJsonStoreTests(unittest.TestCase):
    def test_sqlite_store_round_trips_json_by_relative_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "state.db"
            data_dir = Path(tmp) / "data"
            target = data_dir / "schedule.json"
            url = f"sqlite:///{db_path.as_posix()}"

            with patch.dict(os.environ, {"DATABASE_URL": url}):
                db_json_store.save_document(target, {"2026-07": {"9": "ok"}}, data_dir)
                self.assertEqual(
                    db_json_store.load_document(target, data_dir),
                    {"2026-07": {"9": "ok"}},
                )

    def test_server_load_and_save_use_database_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "state.db"
            url = f"sqlite:///{db_path.as_posix()}"

            with patch.dict(os.environ, {"DATABASE_URL": url}):
                app_module.save_json(app_module.STAFF_FILE, [{"id": "s1", "name": "Alice"}])
                self.assertEqual(
                    app_module.load_json(app_module.STAFF_FILE, []),
                    [{"id": "s1", "name": "Alice"}],
                )

    def test_server_falls_back_to_file_when_database_is_not_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "sample.json"

            with patch.dict(os.environ, {}, clear=True):
                app_module.save_json(target, {"ok": True})
                self.assertEqual(app_module.load_json(target, {}), {"ok": True})

    def test_postgres_url_defaults_to_ssl_required(self):
        url = db_json_store._postgres_url("postgresql://user:pass@example.com:5432/postgres")
        self.assertIn("sslmode=require", url)

    def test_storage_info_reports_file_mode_without_database_url(self):
        with patch.dict(os.environ, {}, clear=True):
            with app_module.app.test_request_context("/api/storage-info"):
                payload = app_module.storage_info().get_json()

        self.assertEqual(payload["mode"], "file")
        self.assertFalse(payload["database_configured"])
        self.assertFalse(payload["database_available"])


if __name__ == "__main__":
    unittest.main()
