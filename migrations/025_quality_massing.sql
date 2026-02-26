ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS building_footprints_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS parcels_with_buildings INTEGER NOT NULL DEFAULT 0;
