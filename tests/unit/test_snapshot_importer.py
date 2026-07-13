from src.migration.importer import ImportValidationError, build_import_sql


def test_build_import_sql_preserves_group_and_split_assignments():
    documents = {
        "groups.json": [{"id": "g1", "name": "一组", "members": []}],
        "staff.json": [
            {"id": "s1", "name": "甲", "group_id": "g1", "can_cpin": True, "can_jd": False},
            {"id": "s2", "name": "乙", "group_id": "", "saturday_only": True},
        ],
        "positions.json": [
            {"id": "p1", "name": "岗位", "workload": 8, "default_person": "甲", "split_allowed": True}
        ],
        "schedule.json": {
            "2026-07": {
                "1": {
                    "_off_persons": ["乙"],
                    "_scatter_groups": True,
                    "p1": {
                        "status": "split",
                        "person": "",
                        "slots": {
                            "am": {"status": "on", "person": "甲", "workload": 4},
                            "pm": {"status": "on", "person": "一组", "workload": 4},
                        },
                    },
                }
            }
        },
        "hidden_days.json": {"2026-07": [2]},
        "memo.json": {"global": {"content": "说明", "updated_at": "2026-07-01 10:00"}},
        "backup/schedule_2026-07.json": {"schedule": {"1": {}}, "backup_time": "2026-07-01 11:00"},
    }

    sql = build_import_sql(documents, imported_at="2026-07-13T00:00:00Z")

    assert "INSERT INTO groups" in sql
    assert "INSERT INTO schedule_cells" in sql
    assert "'g1'" in sql
    assert "INSERT INTO schedule_slots" in sql
    assert "'am'" in sql
    assert "INSERT INTO hidden_days" in sql
    assert "INSERT INTO schedule_backups" in sql


def test_build_import_sql_rejects_global_staff_group_name_collision():
    documents = {
        "groups.json": [{"id": "g1", "name": "重复", "members": []}],
        "staff.json": [{"id": "s1", "name": "重复"}],
        "positions.json": [],
        "schedule.json": {},
        "hidden_days.json": {},
        "memo.json": {},
    }

    try:
        build_import_sql(documents, imported_at="2026-07-13T00:00:00Z")
    except ImportValidationError as error:
        assert error.code == "GLOBAL_NAME_COLLISION"
    else:
        raise AssertionError("expected global-name collision to stop import")
