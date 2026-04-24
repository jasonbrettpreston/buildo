-- UP
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS building_footprints_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS parcels_with_buildings INTEGER NOT NULL DEFAULT 0;

-- DOWN
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS parcels_with_buildings;
-- ALTER TABLE data_quality_snapshots DROP COLUMN IF EXISTS building_footprints_total;
