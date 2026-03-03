-- Migration 035: Add scope_tags metrics to data quality snapshots
-- Tracks permits with scope_tags array (beyond just project_type classification)

ALTER TABLE data_quality_snapshots ADD COLUMN IF NOT EXISTS permits_with_scope_tags INT DEFAULT 0;
ALTER TABLE data_quality_snapshots ADD COLUMN IF NOT EXISTS scope_tags_top JSONB;
