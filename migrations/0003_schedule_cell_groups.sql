ALTER TABLE schedule_cells ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE schedule_slots ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL;
CREATE TABLE schedule_day_off_groups (
  schedule_day_id TEXT NOT NULL REFERENCES schedule_days(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY(schedule_day_id, group_id)
);
