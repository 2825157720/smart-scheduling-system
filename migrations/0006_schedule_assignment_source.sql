ALTER TABLE schedule_cells
ADD COLUMN assignment_source TEXT NOT NULL DEFAULT 'legacy'
CHECK(assignment_source IN ('automatic', 'manual', 'legacy'));

CREATE INDEX idx_schedule_cells_position_source
ON schedule_cells(position_id, assignment_source);
