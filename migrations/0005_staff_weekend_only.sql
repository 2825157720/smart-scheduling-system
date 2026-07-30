ALTER TABLE staff
ADD COLUMN weekend_only INTEGER NOT NULL DEFAULT 0
CHECK (weekend_only IN (0, 1));
