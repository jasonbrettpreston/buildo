-- Migration 048: Backfill missing pipeline_schedules rows
-- Several pipelines added after migration 038 are missing from the schedules
-- table, causing toggle PATCH to return 404. Also remove stale legacy slugs.

-- UP

-- Remove legacy slugs that no longer match pipeline registry
DELETE FROM pipeline_schedules WHERE pipeline IN ('enrich_google', 'enrich_wsib');

-- Backfill all missing pipeline slugs (idempotent via ON CONFLICT)
INSERT INTO pipeline_schedules (pipeline, cadence, enabled) VALUES
  ('load_wsib',            'Quarterly', TRUE),
  ('link_wsib',            'Daily',     TRUE),
  ('assert_schema',        'Daily',     TRUE),
  ('assert_data_bounds',   'Daily',     TRUE),
  ('inspections',          'Daily',     TRUE),
  ('coa_documents',        'Daily',     TRUE)
ON CONFLICT (pipeline) DO NOTHING;

-- DOWN
-- DELETE FROM pipeline_schedules WHERE pipeline IN ('load_wsib', 'link_wsib', 'assert_schema', 'assert_data_bounds', 'inspections', 'coa_documents');
