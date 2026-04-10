-- Migration 080 — cost_estimates + timing_calibration snapshot columns
-- Adds lead feed observability metrics to data_quality_snapshots.
-- Spec: docs/specs/pipeline/41_chain_permits.md (steps 14-15)

-- UP
ALTER TABLE data_quality_snapshots ADD COLUMN cost_estimates_total INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN cost_estimates_from_permit INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN cost_estimates_from_model INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN cost_estimates_null_cost INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN timing_calibration_total INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN timing_calibration_avg_sample INTEGER;
ALTER TABLE data_quality_snapshots ADD COLUMN timing_calibration_freshness_hours NUMERIC(6,1);

-- DOWN
-- ALTER TABLE data_quality_snapshots DROP COLUMN cost_estimates_total;
-- ALTER TABLE data_quality_snapshots DROP COLUMN cost_estimates_from_permit;
-- ALTER TABLE data_quality_snapshots DROP COLUMN cost_estimates_from_model;
-- ALTER TABLE data_quality_snapshots DROP COLUMN cost_estimates_null_cost;
-- ALTER TABLE data_quality_snapshots DROP COLUMN timing_calibration_total;
-- ALTER TABLE data_quality_snapshots DROP COLUMN timing_calibration_avg_sample;
-- ALTER TABLE data_quality_snapshots DROP COLUMN timing_calibration_freshness_hours;
