-- 122: Backfill building_footprints.footprint_area_sqm for the 427K NULL
-- rows shipped by load-massing.js with the Web Mercator projection bug.
--
-- Spec 56 §2: the source shapefile is in EPSG:3857 (Web Mercator). The
-- previous load-massing.js detected the projection and explicitly NULLED
-- the area (line 327-328: `isProjected ? null : shoelaceArea(ring)`).
-- This left all 427,077 rows with footprint_area_sqm = NULL +
-- footprint_area_sqft = NULL.
--
-- Downstream impact (Spec 83 §3 GFA Step A): compute-cost-estimates.js
-- silently fell back to the lot-size path for every permit, producing
-- ~237K cost estimates with the wrong geometric basis.
--
-- This migration computes the area via PostGIS:
--   1. ST_GeomFromGeoJSON(geometry::text)  — JSONB → geometry
--   2. ST_SetSRID(..., 3857)               — declare Web Mercator CRS
--   3. ST_Transform(..., 4326)             — to WGS84 lat/lng
--   4. ::geography                         — switch to spheroid for true sqm
--   5. ST_Area(...)                        — compute square meters
--
-- Idempotent: WHERE footprint_area_sqm IS NULL guards against re-running.
-- Sister fix in scripts/load-massing.js (this commit) prevents future
-- nullification: the JS area computation is removed; a post-INSERT UPDATE
-- pass with the same SQL handles new rows uniformly.
--
-- Performance: ~427K rows × ST_Transform + ST_Area is expected to run in
-- 30-60 seconds on the dev DB. Single transactional pass; no PK or unique
-- constraint touched; WAL writes bounded by the row count.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

UPDATE building_footprints
SET
  footprint_area_sqm = ROUND(
    (ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ))::numeric,
    2
  ),
  footprint_area_sqft = ROUND(
    (ST_Area(
      ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
    ) * 10.7639104167)::numeric,
    2
  )
WHERE footprint_area_sqm IS NULL
  AND geometry IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration would re-NULL the backfilled area columns,
-- erasing the corrective work and restoring the cost-model bug class.
-- Same convention as migrations 118, 119, 121: a transactional DOWN
-- would risk destroying the corrected state. To roll back manually
-- (only if absolutely required):
--
--   UPDATE building_footprints
--      SET footprint_area_sqm = NULL,
--          footprint_area_sqft = NULL
--    WHERE TRUE;
--
-- Then revert the post-INSERT UPDATE block in scripts/load-massing.js
-- and restore the JS-side `isProjected ? null : shoelaceArea(ring)`
-- shortcut. This sequence is undocumented intentionally — the path
-- forward from a regression is "fix and re-apply mig 122," not "revert."
