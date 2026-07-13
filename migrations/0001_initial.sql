PRAGMA foreign_keys = ON;

CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE staff (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  can_cpin INTEGER NOT NULL DEFAULT 0, can_jd INTEGER NOT NULL DEFAULT 0,
  saturday_only INTEGER NOT NULL DEFAULT 0, no_substitute INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE positions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, workload REAL NOT NULL CHECK(workload >= 0),
  default_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  default_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT '', split_allowed INTEGER NOT NULL DEFAULT 0,
  CHECK(NOT (default_staff_id IS NOT NULL AND default_group_id IS NOT NULL))
);
CREATE TABLE schedule_days (id TEXT PRIMARY KEY, schedule_date TEXT NOT NULL UNIQUE, scatter_groups INTEGER NOT NULL DEFAULT 0);
CREATE TABLE schedule_day_off_staff (
  schedule_day_id TEXT NOT NULL REFERENCES schedule_days(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  PRIMARY KEY(schedule_day_id, staff_id)
);
CREATE TABLE schedule_cells (
  id TEXT PRIMARY KEY, schedule_day_id TEXT NOT NULL REFERENCES schedule_days(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('on','off','pending','substitute','split')),
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL, UNIQUE(schedule_day_id, position_id)
);
CREATE TABLE schedule_slots (
  id TEXT PRIMARY KEY, schedule_cell_id TEXT NOT NULL REFERENCES schedule_cells(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK(slot IN ('am','pm')), status TEXT NOT NULL CHECK(status IN ('on','off','pending','substitute')),
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL, workload REAL NOT NULL CHECK(workload >= 0), UNIQUE(schedule_cell_id, slot)
);
CREATE TABLE hidden_days (schedule_date TEXT PRIMARY KEY);
CREATE TABLE memos (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE schedule_backups (id TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE app_revision (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO app_revision (id, revision, updated_at) VALUES (1, 0, CURRENT_TIMESTAMP);
CREATE TABLE mutation_audit (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
