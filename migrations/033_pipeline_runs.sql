-- Migration 033: Generic pipeline run tracking
-- Tracks when each data pipeline was last executed, enabling freshness display
-- and "Update Now" functionality in the admin Data Health Overview.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id SERIAL PRIMARY KEY,
  pipeline TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  records_total INT DEFAULT 0,
  records_new INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  error_message TEXT,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_lookup
  ON pipeline_runs (pipeline, started_at DESC);

-- Backfill: seed one "completed" row per pipeline from best-available timestamps.
-- Permits: use the most recent sync_runs entry.
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'permits', started_at, completed_at, 'completed', records_total
FROM sync_runs ORDER BY started_at DESC LIMIT 1
ON CONFLICT DO NOTHING;

-- CoA: use MAX(last_seen_at) from coa_applications
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'coa', MAX(last_seen_at), MAX(last_seen_at), 'completed', COUNT(*)::int
FROM coa_applications
HAVING COUNT(*) > 0;

-- Builders: use MAX(created_at) from builders
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'builders', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
FROM builders
HAVING COUNT(*) > 0;

-- Address points: use MAX(created_at) if column exists, otherwise NOW()
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'address_points') THEN
    INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
    SELECT 'address_points', NOW(), NOW(), 'completed', COUNT(*)::int
    FROM address_points
    HAVING COUNT(*) > 0;
  END IF;
END $$;

-- Parcels
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'parcels', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
FROM parcels
HAVING COUNT(*) > 0;

-- Massing (building_footprints)
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'massing', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
FROM building_footprints
HAVING COUNT(*) > 0;

-- Neighbourhoods
INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
SELECT 'neighbourhoods', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
FROM neighbourhoods
HAVING COUNT(*) > 0;
