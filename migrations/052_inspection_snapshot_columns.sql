-- Add inspection coverage metrics to data_quality_snapshots
-- UP
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS inspections_total INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inspections_permits_scraped INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inspections_outstanding_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inspections_passed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inspections_not_passed_count INTEGER DEFAULT 0;

-- DOWN (reverse)
-- ALTER TABLE data_quality_snapshots
--   DROP COLUMN IF EXISTS inspections_total,
--   DROP COLUMN IF EXISTS inspections_permits_scraped,
--   DROP COLUMN IF EXISTS inspections_outstanding_count,
--   DROP COLUMN IF EXISTS inspections_passed_count,
--   DROP COLUMN IF EXISTS inspections_not_passed_count;
