-- Migration 020: Add scope classification metrics to data quality snapshots.

ALTER TABLE data_quality_snapshots
    ADD COLUMN IF NOT EXISTS permits_with_scope INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS scope_project_type_breakdown JSONB;
