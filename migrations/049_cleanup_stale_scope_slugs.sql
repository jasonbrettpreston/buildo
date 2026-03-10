-- Migration 049: Clean up stale classify_scope_class / classify_scope_tags slugs
-- After the scope merge (classify_scope_class + classify_scope_tags → classify_scope),
-- old rows in pipeline_schedules and pipeline_runs reference non-existent slugs.

-- UP
DELETE FROM pipeline_schedules WHERE pipeline IN ('classify_scope_class', 'classify_scope_tags');
DELETE FROM pipeline_runs WHERE pipeline IN ('classify_scope_class', 'classify_scope_tags');

-- Ensure the merged classify_scope slug has a schedule row
INSERT INTO pipeline_schedules (pipeline, cadence, enabled)
VALUES ('classify_scope', 'Daily', TRUE)
ON CONFLICT (pipeline) DO NOTHING;

-- DOWN (best-effort restore)
-- INSERT INTO pipeline_schedules (pipeline, cadence, enabled) VALUES ('classify_scope_class', 'Daily', TRUE) ON CONFLICT DO NOTHING;
-- INSERT INTO pipeline_schedules (pipeline, cadence, enabled) VALUES ('classify_scope_tags', 'Daily', TRUE) ON CONFLICT DO NOTHING;
-- DELETE FROM pipeline_schedules WHERE pipeline = 'classify_scope';
