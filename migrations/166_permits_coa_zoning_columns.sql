-- 166: Permit + CoA zoning enrichment columns (Spec 58 WF3 / Spec 66).
--
-- SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (v1.0)
--
-- Adds the zoning by-law feed onto `permits` (via permit_parcels) and
-- `coa_applications` (via lead_parcels). scripts/enrich-permits.js (lock 66,
-- ENRICH_TARGET=permits|coa) populates these by JOINing the WF2-enriched parcels
-- (migration 165). Pure schema-evolution; the enrichment backfill is the script's
-- job (always-full relational join, no incremental — DEC-3).
--
-- Design decisions baked in:
--   nullable/no-default — ADD COLUMN of a nullable column with no default is
--         metadata-only on PG11+ (instant on ~248K permits, no rewrite).
--   NO base_zoning_class on coa_applications — it would be a redundant copy of
--         zoning_class with no variance-decision history; the base snapshot lives
--         in variance_context jsonb (Spec 66 DEC; plan-review Gemini/DeepSeek).
--   zoning_dominant_parcel_method — CHECK-constrained vocab ('max_area') so the
--         provenance value cannot drift (Gemini plan review).
--   NO INDEX HERE — permits is >100K rows; validate-migration.js Rule 2 forbids
--         non-CONCURRENTLY indexes on large tables + migrate.js runs the file in
--         one transaction. Partial (WHERE zoning_class IS NOT NULL) + GIN indexes
--         ship out-of-band via scripts/one-time/backfill-permits-coa-zoning-index.js
--         (mig-116 precedent; mirrors mig 165's parcels indexes).

-- ============================================================================
-- UP
-- ============================================================================

ALTER TABLE permits
  ADD COLUMN IF NOT EXISTS zoning_class                TEXT,
  ADD COLUMN IF NOT EXISTS bylaw_max_coverage_pct      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_max_fsi               NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS bylaw_max_height_m          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS exception_number            INTEGER,
  ADD COLUMN IF NOT EXISTS applicable_bylaws           JSONB,
  ADD COLUMN IF NOT EXISTS overlay_summary             JSONB,
  ADD COLUMN IF NOT EXISTS zoning_parcel_count         INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_dominant_parcel_id   INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_dominant_parcel_method TEXT
    CONSTRAINT permits_zoning_dom_method_chk CHECK (zoning_dominant_parcel_method IN ('max_area')),
  ADD COLUMN IF NOT EXISTS zoning_enriched_at          TIMESTAMPTZ;

ALTER TABLE coa_applications
  ADD COLUMN IF NOT EXISTS zoning_class                TEXT,
  ADD COLUMN IF NOT EXISTS bylaw_max_coverage_pct      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bylaw_max_fsi               NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS bylaw_max_height_m          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS exception_number            INTEGER,
  ADD COLUMN IF NOT EXISTS variance_context            JSONB,
  ADD COLUMN IF NOT EXISTS zoning_parcel_count         INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_dominant_parcel_id   INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_dominant_parcel_method TEXT
    CONSTRAINT coa_zoning_dom_method_chk CHECK (zoning_dominant_parcel_method IN ('max_area')),
  ADD COLUMN IF NOT EXISTS zoning_enriched_at          TIMESTAMPTZ;

COMMENT ON COLUMN permits.zoning_class IS 'Spec 66: dominant linked parcel''s zoning_class (via permit_parcels→parcels). ~84% of construction permits (5.5% no-link + ~10% gap-parcel; see runbook 66).';
COMMENT ON COLUMN permits.applicable_bylaws IS 'Spec 66: ordered (dominant-first) array of per-linked-parcel zoning {parcel_id, zoning_class, bylaw_max_*, exception_number, area_share}. Single-element today (multi-parcel ~0); forward-looking.';
COMMENT ON COLUMN permits.overlay_summary IS 'Spec 66: overlay memberships (bool_or) + dominant parcel zoning_overlays detail. Inherits WF2-resolved values (no spatial re-derivation).';
COMMENT ON COLUMN coa_applications.variance_context IS 'Spec 66: {base:{zoning_class,bylaw_max_*,exception_number}, parcels:[...]} — the zoning the variance is measured against (replaces the dropped base_zoning_class column).';
COMMENT ON COLUMN coa_applications.zoning_class IS 'Spec 66: dominant linked parcel''s zoning_class (via lead_parcels.lead_id = coa.lead_id → parcels). ~84.4% coverage.';

-- ============================================================================
-- DOWN — Rule 6 comments-only (migrate.js runs the whole file in one transaction
-- and does NOT honour -- UP / -- DOWN markers; an uncommented statement here would
-- execute immediately after UP and silently undo the migration — tasks/lessons.md).
-- ============================================================================
-- ALTER TABLE permits
--   DROP COLUMN IF EXISTS zoning_class,
--   DROP COLUMN IF EXISTS bylaw_max_coverage_pct,
--   DROP COLUMN IF EXISTS bylaw_max_fsi,
--   DROP COLUMN IF EXISTS bylaw_max_height_m,
--   DROP COLUMN IF EXISTS exception_number,
--   DROP COLUMN IF EXISTS applicable_bylaws,
--   DROP COLUMN IF EXISTS overlay_summary,
--   DROP COLUMN IF EXISTS zoning_parcel_count,
--   DROP COLUMN IF EXISTS zoning_dominant_parcel_id,
--   DROP COLUMN IF EXISTS zoning_dominant_parcel_method,
--   DROP COLUMN IF EXISTS zoning_enriched_at;
-- ALTER TABLE coa_applications
--   DROP COLUMN IF EXISTS zoning_class,
--   DROP COLUMN IF EXISTS bylaw_max_coverage_pct,
--   DROP COLUMN IF EXISTS bylaw_max_fsi,
--   DROP COLUMN IF EXISTS bylaw_max_height_m,
--   DROP COLUMN IF EXISTS exception_number,
--   DROP COLUMN IF EXISTS variance_context,
--   DROP COLUMN IF EXISTS zoning_parcel_count,
--   DROP COLUMN IF EXISTS zoning_dominant_parcel_id,
--   DROP COLUMN IF EXISTS zoning_dominant_parcel_method,
--   DROP COLUMN IF EXISTS zoning_enriched_at;
