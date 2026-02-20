ALTER TABLE permits ADD COLUMN IF NOT EXISTS neighbourhood_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_permits_neighbourhood_id ON permits(neighbourhood_id);
