-- Migration 037: Trade classification breakdown by use-type (residential vs commercial/mixed-use)
ALTER TABLE data_quality_snapshots
  ADD COLUMN trade_residential_classified INT DEFAULT 0,
  ADD COLUMN trade_residential_total INT DEFAULT 0,
  ADD COLUMN trade_commercial_classified INT DEFAULT 0,
  ADD COLUMN trade_commercial_total INT DEFAULT 0;
