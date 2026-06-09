-- Migration 175: geography GIST on toronto_centreline (Spec 62 §11 WF2 — proximity join).
-- SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §11
-- §8d live validation found parcels sit ~10 m off the street centerline (containment matched
-- 0.05%), so enrich-centreline.js's §11 driver becomes a 20 m proximity join:
--   ST_DWithin(p.geom::geography, c.geom::geography, 20)
-- The planar idx_toronto_centreline_geom_gist (mig 173) does NOT serve a ::geography predicate,
-- so this expression GIST on geom::geography is required — else the join seq-scans 47K segments
-- per parcel × 486K parcels. Mirrors idx_ravines_geog_gist (mig 167).

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping toronto_centreline geography GIST';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'toronto_centreline') THEN
    RAISE NOTICE 'toronto_centreline absent (migration 173 not applied) — skipping geography GIST';
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_toronto_centreline_geog_gist
    ON toronto_centreline USING GIST ((geom::geography));
END
$mig$;

-- DOWN
-- DROP INDEX IF EXISTS idx_toronto_centreline_geog_gist;
