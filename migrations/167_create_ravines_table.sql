-- Migration 167: create the `ravines` source table (Spec 59 §8c / M-1).
-- Toronto Ravine & Natural Feature Protection Area polygons (Chapter 658).
-- SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md
-- Loaded by scripts/load-ravines.js (advisory lock 59).
-- FK-EXEMPT: source_id is the CKAN OBJECTID source identifier (UNIQUE NOT NULL),
--            not a foreign key — no REFERENCES intended.

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping ravines table creation';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS ravines (
    id                     BIGSERIAL PRIMARY KEY,
    source_id              BIGINT UNIQUE NOT NULL,                 -- CKAN OBJECTID (L7 drift-monitored); BIGINT defends future ID expansion
    geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,  -- mixed Polygon/MultiPolygon source → ST_Multi() on load
    source_dataset_version TEXT NOT NULL,                          -- ETag/Last-Modified/content-hash; surfaces to UI per L3
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()      -- row-level lineage; refreshed on upsert
  );

  -- Planar GIST for ST_Intersects (boolean is_in_ravine_protection_area predicate, §11.1).
  CREATE INDEX IF NOT EXISTS idx_ravines_geom_gist
    ON ravines USING GIST (geom);

  -- Geography expression GIST for the <-> nearest-neighbor signed-distance sort (§11.1 L13).
  -- Expression-index form matches repo precedent (migrations 078/083), not the spec's
  -- literal geography(geom) — functionally equivalent cast, repo-consistent syntax.
  CREATE INDEX IF NOT EXISTS idx_ravines_geog_gist
    ON ravines USING GIST ((geom::geography));
END
$mig$;

-- DOWN
-- DROP INDEX IF EXISTS idx_ravines_geog_gist;
-- DROP INDEX IF EXISTS idx_ravines_geom_gist;
-- DROP TABLE IF EXISTS ravines;
