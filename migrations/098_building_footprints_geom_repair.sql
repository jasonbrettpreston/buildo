-- Migration 098: Repair building_footprints.geom if missed by migration 065
-- Migration 065 conditionally skipped the geom column when PostGIS was not
-- installed at migration time. This migration is idempotent and re-applies
-- the same logic so link-massing.js can use the PostGIS fast path.
-- Spec: docs/specs/pipeline/56_source_massing.md

-- UP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE building_footprints ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326)';
    EXECUTE 'UPDATE building_footprints SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE geometry IS NOT NULL AND geom IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_building_footprints_geom_gist ON building_footprints USING GiST (geom)';
    RAISE NOTICE 'building_footprints.geom column repaired (migration 098)';
  ELSE
    RAISE NOTICE 'PostGIS not installed — skipping building_footprints.geom repair (migration 098)';
  END IF;
END
$$;

-- DOWN
-- DROP INDEX IF EXISTS idx_building_footprints_geom_gist;
-- ALTER TABLE building_footprints DROP COLUMN IF EXISTS geom;
