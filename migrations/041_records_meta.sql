-- Migration 041: Add records_meta JSONB to pipeline_runs
-- Stores per-field extraction counts from each pipeline run,
-- enabling the "Last Run" view in the Enrichment Funnel UI.
-- Example payload: {"processed": 500, "matched": 480, "extracted_fields": {"phone": 350, "email": 200}}

-- UP
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS records_meta JSONB;

-- DOWN
ALTER TABLE pipeline_runs DROP COLUMN IF EXISTS records_meta;
