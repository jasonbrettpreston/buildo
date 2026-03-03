-- Migration 036: Add detailed scope tags count to data quality snapshots
-- Counts permits with at least one scope_tag beyond 'residential'/'commercial'

ALTER TABLE data_quality_snapshots ADD COLUMN IF NOT EXISTS permits_with_detailed_tags INT DEFAULT 0;
