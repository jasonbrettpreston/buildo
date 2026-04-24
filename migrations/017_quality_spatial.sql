-- 017_quality_spatial.sql
-- Add spatial match count to data quality snapshots.

-- UP
ALTER TABLE data_quality_snapshots
    ADD COLUMN IF NOT EXISTS parcel_spatial_matches INTEGER DEFAULT 0;

-- DOWN
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS parcel_spatial_matches;
