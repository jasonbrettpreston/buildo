-- Migration 065: Add native PostGIS geometry column to building_footprints
-- Enables ST_Contains spatial queries with GiST index for link-massing.js
-- Parallel to migration 039 pattern (parcels + neighbourhoods already have geom columns).
-- Spec: docs/specs/pipeline/56_source_massing.md
--
-- NOTE: This migration is PostGIS-conditional. If PostGIS is not installed,
-- only the DO NOTHING branch executes. Scripts fall back to JS spatial math.

-- UP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE building_footprints ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326)';
    EXECUTE 'UPDATE building_footprints SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE geometry IS NOT NULL AND geom IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_building_footprints_geom_gist ON building_footprints USING GiST (geom)';
    RAISE NOTICE 'building_footprints.geom column + GiST index created';
  ELSE
    RAISE NOTICE 'PostGIS not installed — skipping building_footprints.geom column';
  END IF;
END
$$;

-- DOWN
-- DROP INDEX IF EXISTS idx_building_footprints_geom_gist;
-- ALTER TABLE building_footprints DROP COLUMN IF EXISTS geom;
