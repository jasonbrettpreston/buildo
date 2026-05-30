-- 164: Toronto Zoning By-law (569-2013) ingest — 10 layer tables.
--
-- SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (v2.3)
--
-- FK-EXEMPT: source_id is the CKAN-assigned `_id` upsert key (D1), NOT a Buildo
-- foreign key; holding_id / policy_id / objectid and exception_number (D6 —
-- denormalized, no zoning_exceptions table) are source-data identifiers, not
-- references to other tables.
--
-- Creates the base layer (zoning_bylaw_areas) + 9 overlay tables that
-- scripts/load-zoning.js populates from Toronto CKAN (per-layer transactions,
-- D2). Pure data-loading spec — enrich-parcels.js / enrich-permits.js
-- (the consumers that write parcels/permits/coa zoning columns) are FUTURE
-- WFs (§8c/§8d), out of scope here.
--
-- Design decisions baked in:
--   D6  — exceptions are DENORMALIZED into zoning_bylaw_areas
--         (exception_number / exception_text). NO separate zoning_exceptions
--         table; exception_number carries NO FK.
--   F-H6 — GIST indexes are created WITHOUT CONCURRENTLY: all 10 tables are
--         empty at migration time, and migrate.js runs the whole file in one
--         transaction (CONCURRENTLY would error inside a txn block).
--         These tables are NOT in validate-migration.js LARGE_TABLES, so the
--         non-CONCURRENTLY index passes Rule 2.
--   F-M10 — objectid is INTEGER (not TEXT) on the 4 layers where OBJECTID
--         appears (building setback, parking zone, priority retail, QueenStW).
--   geom — base + 7 overlays are GEOMETRY(MultiPolygon, 4326); policy_road +
--         priority_retail are GEOMETRY(MultiLineString, 4326). load-zoning.js
--         wraps every feature in ST_Multi(ST_GeomFromGeoJSON(...)) so single-
--         part inputs satisfy the typed Multi* columns. SRID 4326 matches the
--         source (no ST_Transform — Phase 0 confirmed). PostGIS enabled by
--         migration 039.
--   source_id — INTEGER UNIQUE NOT NULL is the upsert conflict target
--         (ON CONFLICT (source_id) DO UPDATE, D1) for every table.

-- ============================================================================
-- UP
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Base layer: zoning_bylaw_areas (11,719 polygons). D6 denormalized exceptions.
-- 27 writable columns (id SERIAL + created_at DEFAULT are not bound by the
-- loader → MAX_ROWS_PER_INSERT = pipeline.maxRowsPerInsert(27)).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_bylaw_areas (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  gen_zone               INTEGER,
  zn_zone                TEXT NOT NULL CHECK (char_length(zn_zone) <= 20),
  zn_string              TEXT NOT NULL CHECK (char_length(zn_string) <= 50),
  zn_holding             TEXT,
  holding_id             INTEGER,
  frontage_min_m         NUMERIC(8,2)  CHECK (frontage_min_m >= 0),
  area_min_sqm           INTEGER       CHECK (area_min_sqm >= 0),
  units_max              INTEGER       CHECK (units_max >= 0),
  density_max            NUMERIC(10,2) CHECK (density_max >= 0),
  coverage_max_pct       NUMERIC(5,2)  CHECK (coverage_max_pct BETWEEN 0 AND 100),
  fsi_max                NUMERIC(6,3)  CHECK (fsi_max >= 0),
  pct_commercial_max     NUMERIC(5,2)  CHECK (pct_commercial_max BETWEEN 0 AND 100),
  pct_residential_max    NUMERIC(5,2)  CHECK (pct_residential_max BETWEEN 0 AND 100),
  pct_employment_max     NUMERIC(5,2)  CHECK (pct_employment_max BETWEEN 0 AND 100),
  pct_office_max         NUMERIC(5,2)  CHECK (pct_office_max BETWEEN 0 AND 100),
  exception_number       INTEGER,
  exception_text         TEXT,
  bylaw_chapter          TEXT,
  bylaw_section          TEXT,
  bylaw_exception_ref    TEXT,
  standard_setback       NUMERIC(8,2)  CHECK (standard_setback >= 0),
  zone_status            INTEGER,
  area_units             NUMERIC(10,2),
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoning_bylaw_areas_geom
  ON zoning_bylaw_areas USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zoning_bylaw_areas_zn_zone
  ON zoning_bylaw_areas (zn_zone);
CREATE INDEX IF NOT EXISTS idx_zoning_bylaw_areas_exception_number
  ON zoning_bylaw_areas (exception_number) WHERE exception_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zoning_bylaw_areas_bylaw_chapter
  ON zoning_bylaw_areas (bylaw_chapter);

COMMENT ON TABLE  zoning_bylaw_areas IS 'Spec 58: Toronto Zoning By-law base layer (one row per zone polygon). Exceptions denormalized per D6 (no zoning_exceptions table). Populated by scripts/load-zoning.js.';
COMMENT ON COLUMN zoning_bylaw_areas.coverage_max_pct IS 'Spec 58: from CKAN COVERAGE. Phase-3 cost-model input (consumed downstream via enrich-parcels → enrich-permits).';
COMMENT ON COLUMN zoning_bylaw_areas.fsi_max IS 'Spec 58: from CKAN FSI_TOTAL. Phase-3 cost-model input.';
COMMENT ON COLUMN zoning_bylaw_areas.exception_number IS 'Spec 58 D6: Chapter 900 exception number; NULL if none. No FK — exception_text is denormalized into this table.';

-- ----------------------------------------------------------------------------
-- Overlay 1/9: zoning_height_overlay (2,528 polygons). HT_LABEL → height_max_m
-- is parsed by load-zoning.js with a strict pattern (R2-16); unparseable → NULL.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_height_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  ht_stories             INTEGER      CHECK (ht_stories >= 0),
  ht_string              TEXT,
  height_max_m           NUMERIC(8,2) CHECK (height_max_m >= 0),
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_height_overlay_geom
  ON zoning_height_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 2/9: zoning_lot_coverage_overlay (1,242 polygons).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_lot_coverage_overlay (
  id                       SERIAL PRIMARY KEY,
  source_id                INTEGER UNIQUE NOT NULL,
  coverage_max_pct_override NUMERIC(5,2) CHECK (coverage_max_pct_override BETWEEN 0 AND 100),
  geometry                 JSONB NOT NULL,
  geom                     GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version   TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_lot_coverage_overlay_geom
  ON zoning_lot_coverage_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 3/9: zoning_building_setback_overlay (polygons). objectid INTEGER (F-M10).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_building_setback_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  objectid               INTEGER,
  zn_string              TEXT,
  ch600_area_type        INTEGER,
  bylaw_section_link     TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_building_setback_overlay_geom
  ON zoning_building_setback_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 4/9: zoning_policy_area_overlay (352 polygons).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_policy_area_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  policy_id              TEXT,
  chapter_200_ref        TEXT,
  exception_link         TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_policy_area_overlay_geom
  ON zoning_policy_area_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 5/9: zoning_policy_road_overlay (8,913 LINESTRINGS → MultiLineString).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_policy_road_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  road_name              TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiLineString, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_policy_road_overlay_geom
  ON zoning_policy_road_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 6/9: zoning_rooming_house_overlay (558 polygons).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_rooming_house_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  rmh_area               TEXT,
  rmg_hs_no              INTEGER,
  rmg_string             TEXT,
  chapter_150_25_ref     TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_rooming_house_overlay_geom
  ON zoning_rooming_house_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 7/9: zoning_parking_zone_overlay (913 polygons). objectid INTEGER (F-M10).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_parking_zone_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  objectid               INTEGER,
  zn_parkzone            TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_parking_zone_overlay_geom
  ON zoning_parking_zone_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 8/9: zoning_priority_retail_overlay (643 LINESTRINGS → MultiLineString).
-- objectid INTEGER (F-M10).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_priority_retail_overlay (
  id                       SERIAL PRIMARY KEY,
  source_id                INTEGER UNIQUE NOT NULL,
  objectid                 INTEGER,
  zn_string                TEXT,
  ch600_line_type          INTEGER,
  linear_name_full_legal   TEXT,
  bylaw_section_link       TEXT,
  geometry                 JSONB NOT NULL,
  geom                     GEOMETRY(MultiLineString, 4326) NOT NULL,
  source_dataset_version   TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_priority_retail_overlay_geom
  ON zoning_priority_retail_overlay USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Overlay 9/9: zoning_queenstw_eat_overlay (4 polygons). objectid INTEGER (F-M10).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zoning_queenstw_eat_overlay (
  id                     SERIAL PRIMARY KEY,
  source_id              INTEGER UNIQUE NOT NULL,
  objectid               INTEGER,
  zn_string              TEXT,
  ch600_area_type        INTEGER,
  bylaw_section_link     TEXT,
  geometry               JSONB NOT NULL,
  geom                   GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_dataset_version TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoning_queenstw_eat_overlay_geom
  ON zoning_queenstw_eat_overlay USING GIST (geom);

-- ============================================================================
-- DOWN — Rule 6 comments-only per project convention (see migrations
-- 132/145/160/161/162 precedent). Manual rollback only; migrate.js runs the
-- whole file in one transaction and does not honour -- UP / -- DOWN markers.
-- ============================================================================
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS zoning_queenstw_eat_overlay      CASCADE;
-- DROP TABLE IF EXISTS zoning_priority_retail_overlay   CASCADE;
-- DROP TABLE IF EXISTS zoning_parking_zone_overlay      CASCADE;
-- DROP TABLE IF EXISTS zoning_rooming_house_overlay     CASCADE;
-- DROP TABLE IF EXISTS zoning_policy_road_overlay       CASCADE;
-- DROP TABLE IF EXISTS zoning_policy_area_overlay       CASCADE;
-- DROP TABLE IF EXISTS zoning_building_setback_overlay  CASCADE;
-- DROP TABLE IF EXISTS zoning_lot_coverage_overlay      CASCADE;
-- DROP TABLE IF EXISTS zoning_height_overlay            CASCADE;
-- DROP TABLE IF EXISTS zoning_bylaw_areas               CASCADE;
