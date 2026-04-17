-- add fields to workshift table: waste, downtime_seconds, active_state, oee_percentage, stoppage_count
ALTER TABLE workshift ADD COLUMN waste INT NOT NULL DEFAULT 0;
ALTER TABLE workshift ADD COLUMN downtime_seconds INT NOT NULL DEFAULT 0;
ALTER TABLE workshift ADD COLUMN active_state BOOLEAN;
ALTER TABLE workshift ADD COLUMN oee_percentage DECIMAL(5,2);

-- add field to worker table: access_level
ALTER TABLE worker ADD COLUMN access_level INT;