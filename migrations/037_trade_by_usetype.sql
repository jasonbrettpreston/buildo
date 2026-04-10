-- Migration 037: Trade classification breakdown by use-type (residential vs commercial/mixed-use)
-- UP
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'data_quality_snapshots' AND column_name = 'trade_residential_classified') THEN
    ALTER TABLE data_quality_snapshots ADD COLUMN trade_residential_classified INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'data_quality_snapshots' AND column_name = 'trade_residential_total') THEN
    ALTER TABLE data_quality_snapshots ADD COLUMN trade_residential_total INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'data_quality_snapshots' AND column_name = 'trade_commercial_classified') THEN
    ALTER TABLE data_quality_snapshots ADD COLUMN trade_commercial_classified INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'data_quality_snapshots' AND column_name = 'trade_commercial_total') THEN
    ALTER TABLE data_quality_snapshots ADD COLUMN trade_commercial_total INT DEFAULT 0;
  END IF;
END $$;

-- DOWN
-- ALTER TABLE data_quality_snapshots DROP COLUMN trade_residential_classified;
-- ALTER TABLE data_quality_snapshots DROP COLUMN trade_residential_total;
-- ALTER TABLE data_quality_snapshots DROP COLUMN trade_commercial_classified;
-- ALTER TABLE data_quality_snapshots DROP COLUMN trade_commercial_total;
