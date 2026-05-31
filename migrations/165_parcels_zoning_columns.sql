-- 165: Parcel zoning enrichment columns (Spec 58 WF2 / Spec 65).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0)
--
-- Adds the full Toronto zoning by-law feed onto `parcels`. scripts/enrich-parcels.js
-- (lock 65) populates these via a set-based spatial join against the 10 zoning
-- tables created by migration 164 (Spec 58 ingest). Pure schema-evolution migration;
-- the enrichment backfill is the script's job, NOT this migration.
--
-- Design decisions baked in:
--   DEC-2 (Spec 65) — FULL bylaw feed: every bylaw-rule column from
--         zoning_bylaw_areas (excl. source_id/geometry/geom/created_at/
--         area_units/holding_id) + the 2 numeric overlays (height, lot_coverage)
--         + 7 boolean overlay-membership flags + zoning_overlays jsonb detail.
--   F-H5 (Spec 58) — bylaw_max_* / bylaw_min_* naming (avoids the 3-table
--         coverage_max_pct / fsi_max collision).
--   nullable/no-default — ADD COLUMN of a nullable column with no default is
--         metadata-only on PG11+ (instant on 486,530 rows, no table rewrite).
--         CHECK-free: values flow from the CHECK-validated base table; the
--         enrichment SQL produces in-range values (range asserted by the
--         enrich-parcels.db.test.ts, not a column constraint).
--   NO INDEX HERE — parcels is >100K rows; validate-migration.js Rule 2 forbids
--         non-CONCURRENTLY indexes on large tables and migrate.js runs the file
--         in one transaction (CONCURRENTLY is illegal inside it). The zoning_class
--         + boolean indexes ship out-of-band via
--         scripts/one-time/backfill-parcels-zoning-index.js (mig-116 precedent).
--         The spatial join itself reads only the pre-existing idx_parcels_geom_gist
--         (migration 039) + the zoning tables' GiST indexes (migration 164).

-- ============================================================================
-- UP
-- ============================================================================

ALTER TABLE parcels
  -- Identity (from the area-dominant base zone — Spec 65 DEC-1)
  ADD COLUMN IF NOT EXISTS zoning_class                      TEXT,
  ADD COLUMN IF NOT EXISTS zoning_zn_string                  TEXT,
  ADD COLUMN IF NOT EXISTS zoning_gen_zone                   INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_holding                    TEXT,
  ADD COLUMN IF NOT EXISTS zone_status                       INTEGER,
  -- Numeric ceilings (MIN) / floors (MAX); overlay replaces base where noted (D4)
  ADD COLUMN IF NOT EXISTS bylaw_max_fsi                     NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS bylaw_max_coverage_pct            NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_max_height_m                NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS bylaw_max_stories                 INTEGER,
  ADD COLUMN IF NOT EXISTS bylaw_max_units                   INTEGER,
  ADD COLUMN IF NOT EXISTS bylaw_max_density                 NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS bylaw_min_frontage_m              NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS bylaw_min_area_sqm                INTEGER,
  ADD COLUMN IF NOT EXISTS bylaw_standard_setback_m          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS bylaw_pct_commercial_max          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_pct_residential_max         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_pct_employment_max          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_pct_office_max              NUMERIC(5,2),
  -- Exception / by-law references (from the dominant zone)
  ADD COLUMN IF NOT EXISTS exception_number                  INTEGER,
  ADD COLUMN IF NOT EXISTS exception_text                    TEXT,
  ADD COLUMN IF NOT EXISTS bylaw_chapter                     TEXT,
  ADD COLUMN IF NOT EXISTS bylaw_section                     TEXT,
  ADD COLUMN IF NOT EXISTS bylaw_exception_ref               TEXT,
  -- Overlay membership flags (indexable; Gemini-D)
  ADD COLUMN IF NOT EXISTS in_policy_area                    BOOLEAN,
  ADD COLUMN IF NOT EXISTS on_policy_road                    BOOLEAN,
  ADD COLUMN IF NOT EXISTS in_rooming_house_overlay          BOOLEAN,
  ADD COLUMN IF NOT EXISTS in_parking_zone_overlay           BOOLEAN,
  ADD COLUMN IF NOT EXISTS in_building_setback_overlay       BOOLEAN,
  ADD COLUMN IF NOT EXISTS on_priority_retail                BOOLEAN,
  ADD COLUMN IF NOT EXISTS in_queenstw_eat_overlay           BOOLEAN,
  -- Overlay detail + provenance + ambiguity
  ADD COLUMN IF NOT EXISTS zoning_overlays                   JSONB,
  ADD COLUMN IF NOT EXISTS zoning_base_source_id             INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_dominant_area_share        NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS zoning_is_ambiguous               BOOLEAN,
  ADD COLUMN IF NOT EXISTS zoning_base_source_dataset_version TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zoning_enriched_at                TIMESTAMPTZ;

COMMENT ON COLUMN parcels.zoning_class IS 'Spec 65: area-dominant base zone (zoning_bylaw_areas.zn_zone). ~96.8% populated; gap = parks/federal/utility/ravine.';
COMMENT ON COLUMN parcels.bylaw_max_fsi IS 'Spec 65: most-restrictive base FSI_TOTAL. Sparse by design (~5%) — FSI regulates apartment/commercial zones only. Phase-3 cost input.';
COMMENT ON COLUMN parcels.bylaw_max_coverage_pct IS 'Spec 65: from zoning_lot_coverage_overlay.coverage_max_pct_override (base COVERAGE is null in source per Spec 58 D10). ~57% populated.';
COMMENT ON COLUMN parcels.bylaw_max_height_m IS 'Spec 65: from zoning_height_overlay.height_max_m (base has no height). ~90% populated.';
COMMENT ON COLUMN parcels.zoning_overlays IS 'Spec 65: jsonb overlay-membership map + per-overlay attrs + base-zone candidates. FROZEN shape — consumed by Spec 58 WF3 enrich-permits.';
COMMENT ON COLUMN parcels.zoning_is_ambiguous IS 'Spec 65: true when dominant base-zone area share < 0.60 (docs/specs/_contracts.json zoning.ambiguous_dominant_share_max). ~0.2% of parcels.';
COMMENT ON COLUMN parcels.zoning_enriched_at IS 'Spec 65: DB-clock stamp of last enrichment; incremental re-run key (re-enriches only parcels whose intersecting zone source_dataset_version is newer).';

-- ============================================================================
-- DOWN — Rule 6 comments-only per project convention (migrate.js runs the whole
-- file in one transaction and does NOT honour -- UP / -- DOWN markers; an
-- uncommented statement here would execute immediately after UP and silently
-- undo the migration — see tasks/lessons.md). Manual rollback only.
-- ============================================================================
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS zoning_class,
--   DROP COLUMN IF EXISTS zoning_zn_string,
--   DROP COLUMN IF EXISTS zoning_gen_zone,
--   DROP COLUMN IF EXISTS zoning_holding,
--   DROP COLUMN IF EXISTS zone_status,
--   DROP COLUMN IF EXISTS bylaw_max_fsi,
--   DROP COLUMN IF EXISTS bylaw_max_coverage_pct,
--   DROP COLUMN IF EXISTS bylaw_max_height_m,
--   DROP COLUMN IF EXISTS bylaw_max_stories,
--   DROP COLUMN IF EXISTS bylaw_max_units,
--   DROP COLUMN IF EXISTS bylaw_max_density,
--   DROP COLUMN IF EXISTS bylaw_min_frontage_m,
--   DROP COLUMN IF EXISTS bylaw_min_area_sqm,
--   DROP COLUMN IF EXISTS bylaw_standard_setback_m,
--   DROP COLUMN IF EXISTS bylaw_pct_commercial_max,
--   DROP COLUMN IF EXISTS bylaw_pct_residential_max,
--   DROP COLUMN IF EXISTS bylaw_pct_employment_max,
--   DROP COLUMN IF EXISTS bylaw_pct_office_max,
--   DROP COLUMN IF EXISTS exception_number,
--   DROP COLUMN IF EXISTS exception_text,
--   DROP COLUMN IF EXISTS bylaw_chapter,
--   DROP COLUMN IF EXISTS bylaw_section,
--   DROP COLUMN IF EXISTS bylaw_exception_ref,
--   DROP COLUMN IF EXISTS in_policy_area,
--   DROP COLUMN IF EXISTS on_policy_road,
--   DROP COLUMN IF EXISTS in_rooming_house_overlay,
--   DROP COLUMN IF EXISTS in_parking_zone_overlay,
--   DROP COLUMN IF EXISTS in_building_setback_overlay,
--   DROP COLUMN IF EXISTS on_priority_retail,
--   DROP COLUMN IF EXISTS in_queenstw_eat_overlay,
--   DROP COLUMN IF EXISTS zoning_overlays,
--   DROP COLUMN IF EXISTS zoning_base_source_id,
--   DROP COLUMN IF EXISTS zoning_dominant_area_share,
--   DROP COLUMN IF EXISTS zoning_is_ambiguous,
--   DROP COLUMN IF EXISTS zoning_base_source_dataset_version,
--   DROP COLUMN IF EXISTS zoning_enriched_at;
