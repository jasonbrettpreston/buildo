-- UP
ALTER TABLE permits ADD COLUMN IF NOT EXISTS neighbourhood_id INTEGER;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_neighbourhood_id ON permits(neighbourhood_id);

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_neighbourhood_id;
-- ALTER TABLE permits DROP COLUMN IF EXISTS neighbourhood_id;
