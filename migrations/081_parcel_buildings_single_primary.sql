-- Migration 081 — enforce single primary building per parcel
-- Fixes: link-massing.js PostGIS path was setting is_primary = true for ALL
-- matched buildings (argument order bug). This migration repairs existing data
-- and adds a partial unique index to prevent future violations.

-- UP

-- Step 1: Repair existing data — keep only the largest-area building as primary per parcel.
-- For ties, the lowest building_id wins (deterministic).
UPDATE parcel_buildings pb
SET is_primary = false
WHERE pb.is_primary = true
  AND pb.id NOT IN (
    SELECT DISTINCT ON (pb2.parcel_id) pb2.id
    FROM parcel_buildings pb2
    JOIN building_footprints bf ON bf.id = pb2.building_id
    WHERE pb2.is_primary = true
    ORDER BY pb2.parcel_id, bf.footprint_area_sqm DESC NULLS LAST, pb2.building_id ASC
  );

-- Step 2: Enforce at most one primary building per parcel at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcel_buildings_one_primary
  ON parcel_buildings (parcel_id)
  WHERE is_primary = true;

-- DOWN
-- DROP INDEX IF EXISTS idx_parcel_buildings_one_primary;
