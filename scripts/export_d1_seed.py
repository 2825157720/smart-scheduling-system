"""Create a D1 seed SQL file from a local, ignored Supabase snapshot CSV."""
from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.migration.importer import build_import_sql, load_snapshot_csv


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    documents = load_snapshot_csv(args.snapshot)
    sql = build_import_sql(documents, imported_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    args.output.write_text(sql, encoding="utf-8")


if __name__ == "__main__":
    main()
