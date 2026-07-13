CREATE INDEX idx_staff_group_id ON staff(group_id);
CREATE INDEX idx_schedule_days_date ON schedule_days(schedule_date);
CREATE INDEX idx_schedule_cells_day_position ON schedule_cells(schedule_day_id, position_id);
CREATE INDEX idx_schedule_slots_cell ON schedule_slots(schedule_cell_id);
CREATE INDEX idx_mutation_audit_revision ON mutation_audit(revision);
