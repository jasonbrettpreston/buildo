-- 214_parcels_lot_size_source.sql
-- SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §lot_size + docs/specs/01-pipeline/56_source_massing.md
--
-- P12-A1 (trust-assessment). lot_size_sqm = the source STATEDAREA attribute
-- (load-parcels.js:500 parseStatedArea). NULL = source-absent (a deliberate
-- suppression — the loader has polygon area at :142 and pointedly does not use it).
-- The column feeds the LIVE cost-model T1 FSI gate (cost-model-shared.js:611-613)
-- and the fallback GFA (:212-219), so the NULL-lot geom backfill (separate,
-- deliberate data op with a backup table) is VALUE-CHANGING and must be
-- provenance-flagged so consumers can distinguish the two semantics.
--
-- lot_size_source is THE provenance carrier ('stated' | 'geom_backfill'). It is
-- SEMANTICALLY ORTHOGONAL to the existing lot_size_basis (a frontage×depth
-- reconciliation-method enum: 3way/oob/pair/single) — do NOT overload that column.
--
-- This migration: (1) ADD COLUMN lot_size_source; (2) label all existing non-NULL
-- lot_size rows 'stated' (idempotent — WHERE lot_size_source IS NULL). NULL-lot rows
-- stay NULL here; the geom backfill flips them to 'geom_backfill' in the same op that
-- writes the geom-derived lot_size_sqm value.

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS lot_size_source TEXT;  -- 'stated' | 'geom_backfill'

-- Label existing stated rows (idempotent). NULL-lot rows remain NULL until the
-- geom backfill (which sets 'geom_backfill' alongside the ST_Area-derived value).
UPDATE parcels
  SET lot_size_source = 'stated'
  WHERE lot_size_sqm IS NOT NULL AND lot_size_source IS NULL;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 153/212/213 convention).
-- ============================================================================
-- BEGIN;
--   ALTER TABLE parcels DROP COLUMN IF EXISTS lot_size_source;
-- COMMIT;
