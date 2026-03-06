-- Migration 047: Add enabled toggle to pipeline_schedules
-- Allows individual pipeline steps to be disabled (skipped during chain execution).
-- enrich_wsib_builders and enrich_named_builders default to FALSE (enabled later).

-- UP
ALTER TABLE pipeline_schedules
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Disable enrichment steps by default (to be turned on at a later stage)
UPDATE pipeline_schedules
  SET enabled = FALSE
  WHERE pipeline IN ('enrich_wsib_builders', 'enrich_named_builders');

-- Ensure the two enrichment rows exist (they may not have been seeded in migration 038)
INSERT INTO pipeline_schedules (pipeline, cadence, enabled)
VALUES
  ('enrich_wsib_builders',  'Daily', FALSE),
  ('enrich_named_builders', 'Daily', FALSE)
ON CONFLICT (pipeline) DO NOTHING;

-- DOWN
-- ALTER TABLE pipeline_schedules DROP COLUMN IF EXISTS enabled;
