-- Migration 170: create the heritage source tables (Spec 61 §8c / M-1).
-- Toronto Heritage Register (Part IV/Part V points) + Heritage Conservation
-- Districts (polygons), Ontario Heritage Act Parts IV (s.29) + V (s.41).
-- SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
-- Loaded by scripts/load-heritage.js (advisory lock 61).
-- FK-EXEMPT: heritage_properties.source_id (CKAN OBJECTID) + heritage_districts.source_id
--            (CKAN HCD_NO) are source identifiers (UNIQUE NOT NULL), not foreign keys.

-- UP

-- levenshtein() for the §8d Part IV address-fuzzy match. Shared with WSIB matching
-- (Spec 46) — the DOWN block intentionally does NOT drop it.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- L27 / §12.3 normalize_address: lowercase + standardize the 8 most-common Toronto
-- street-type suffixes (Phase 0 Q0.17) + collapse whitespace. IMMUTABLE so it can be
-- used in the §8d enrich index/LATERAL. No unit handling (Heritage Register has no units).
-- NOTE: uses PostgreSQL word boundary \y, NOT \b — the spec §12.3 code uses \b, which in
-- PostgreSQL ARE is a backspace (only meaningful in bracket expressions) and never matches
-- a word boundary, so \b...\b silently fails to rewrite any suffix (DB-test caught; spec-text followup).
CREATE OR REPLACE FUNCTION normalize_address(addr TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT TRIM(
    REGEXP_REPLACE(  -- final pass: collapse whitespace
      REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
      REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
        LOWER(COALESCE(addr, '')),
        '\yavenue\y',    'ave',  'g'),
        '\ystreet\y',    'st',   'g'),
        '\yroad\y',      'rd',   'g'),
        '\yboulevard\y', 'blvd', 'g'),
        '\ycrescent\y',  'cres', 'g'),
        '\ydrive\y',     'dr',   'g'),
        '\yplace\y',     'pl',   'g'),
        '\ycourt\y',     'crt',  'g'),
      '\s+', ' ', 'g')
  );
$fn$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping heritage table creation';
    RETURN;
  END IF;

  -- Heritage Register points (Part IV individual + Part V member-of-HCD).
  -- Filtered to Part IV / Part V at JS load (Listed dropped, L25).
  CREATE TABLE IF NOT EXISTS heritage_properties (
    id                     BIGSERIAL PRIMARY KEY,
    source_id              BIGINT UNIQUE NOT NULL,                              -- CKAN OBJECTID (L7 drift-monitored)
    status                 TEXT NOT NULL CHECK (status IN ('part_iv', 'part_v_member')),
    geom                   GEOMETRY(Point, 4326) NOT NULL,
    designated_date        DATE,                                               -- DESIGNATED::date; sentinel 1899-11-30 -> NULL (L2)
    bylaw_no               TEXT,
    htg_conser_name        TEXT,                                               -- HTG_CONSER; -> heritage_districts.name when part_v_member
    building_type          TEXT,                                               -- BUILDING_T
    reason                 TEXT,                                               -- REASON
    address_text           TEXT NOT NULL,                                      -- ADDRESS (0 nulls in source; L13 fuzzy-match key)
    construction_year      INTEGER,                                            -- CONSTRUCTI
    source_dataset_version TEXT NOT NULL,                                      -- content-hash; surfaces to UI per L3
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Planar GIST for §8d Part IV ST_DWithin pre-filter.
  CREATE INDEX IF NOT EXISTS idx_heritage_properties_geom_gist
    ON heritage_properties USING GIST (geom);
  -- Geography expression GIST for the <-> nearest-neighbor distance sort (§11.1 L13);
  -- expression form matches repo precedent (mig 167/078/083), not the spec's literal geography(geom).
  CREATE INDEX IF NOT EXISTS idx_heritage_properties_geog_gist
    ON heritage_properties USING GIST ((geom::geography));
  -- Status index: §8d Part IV branch filters status='part_iv'.
  CREATE INDEX IF NOT EXISTS idx_heritage_properties_status
    ON heritage_properties (status);

  -- Heritage Conservation Districts polygons. Filtered to 'Designated District'
  -- at JS load (Under Appeal/Study dropped, L25). Mixed Polygon/MultiPolygon -> ST_Multi() on load.
  CREATE TABLE IF NOT EXISTS heritage_districts (
    id                     BIGSERIAL PRIMARY KEY,
    source_id              BIGINT UNIQUE NOT NULL,                              -- CKAN HCD_NO
    name                   TEXT NOT NULL,                                       -- HCD_NAME (0 nulls in source)
    hcd_type               TEXT NOT NULL CHECK (hcd_type = 'designated_district'),
    geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
    designated_date        DATE,                                                -- HCD_DESDAT::date — NULLABLE: L2 sentinel 1899-11-30→NULL (Parkdale Main Street); spec §2 had NOT NULL, relaxed (smoke-caught)
    bylaw_no               TEXT,                                                -- HCD_BYLAWN — NULLABLE: 7 source rows null (DEC-M; spec §2 had NOT NULL, relaxed)
    wards                  TEXT,                                                -- HCD_WARDS
    source_dataset_version TEXT NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_heritage_districts_geom_gist
    ON heritage_districts USING GIST (geom);
END
$mig$;

-- DOWN
-- DROP TABLE IF EXISTS heritage_properties CASCADE;
-- DROP TABLE IF EXISTS heritage_districts CASCADE;
-- DROP FUNCTION IF EXISTS normalize_address(TEXT);
-- (intentionally NOT dropping EXTENSION fuzzystrmatch — shared with WSIB matching, Spec 46)
