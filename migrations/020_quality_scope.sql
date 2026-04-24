-- Migration 020: Add scope classification metrics to data quality snapshots.

-- UP
ALTER TABLE data_quality_snapshots
    ADD COLUMN IF NOT EXISTS permits_with_scope INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS scope_project_type_breakdown JSONB;

-- DOWN
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS scope_project_type_breakdown;
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS permits_with_scope;
