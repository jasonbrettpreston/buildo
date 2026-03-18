-- Migration 033: Generic pipeline run tracking
-- Tracks when each data pipeline was last executed, enabling freshness display
-- and "Update Now" functionality in the admin Data Health Overview.

-- UP
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

-- Backfill removed: historical seed INSERTs moved to scripts/backfill/seed-pipeline-runs.js
-- (one-time script, not needed on every migration replay)

-- DOWN
-- DROP INDEX IF EXISTS idx_pipeline_runs_lookup;
-- DROP TABLE IF EXISTS pipeline_runs;
