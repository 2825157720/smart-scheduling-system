from pathlib import Path
import unittest


class MigrationHygieneTests(unittest.TestCase):
    def test_gitignore_excludes_migration_artifacts_and_worker_secrets(self):
        root = Path(__file__).resolve().parents[1]
        ignored = (root / ".gitignore").read_text(encoding="utf-8")

        for required in (".migration/", ".dev.vars", ".wrangler/"):
            self.assertIn(required, ignored)


if __name__ == "__main__":
    unittest.main()
