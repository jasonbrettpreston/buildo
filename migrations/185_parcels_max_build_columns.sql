-- Migration 185: max-build envelope columns on parcels (Spec 65 max-build extension).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§ Max-build envelope)
--
-- Written by scripts/enrich-parcels.js (lock 65) in a SECOND set-based UPDATE pass that reads
-- the already-written zoning feed (bylaw_max_*) + lot dims (frontage_m/depth_m, mig 011) +
-- geom + the massing join (parcel_buildings → building_footprints) and computes a lot-validated
-- max buildable envelope. SEPARATE migration from the zoning feed (165) — these columns are NOT
-- in enrich-parcels ALL_WRITE_COLS (they have their own MAX_BUILD_COLS array + UPDATE pass).
--
-- All nullable, no default (except the two NOT-NULL booleans) → metadata-only ADD on PG11+
-- (instant on 486K rows, no rewrite). The script backfills; no enrichment in this migration.
-- No CHECK constraints (values produced by the script's range-guarded SQL). No index here
-- (validate-migration Rule 2 forbids non-CONCURRENTLY indexes on >100K-row tables; migrate.js
-- runs the file in one transaction). DOWN comments-only (Rule 6 — single-txn runner).
-- lock_timeout bounds the brief ACCESS EXCLUSIVE.

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  -- Phase 1 — lot-size validation (3-way cross-check trust)
  ADD COLUMN IF NOT EXISTS lot_size_confidence         TEXT,     -- high/medium/low (area agreement)
  ADD COLUMN IF NOT EXISTS lot_size_basis              TEXT,     -- 3way/pair/single/oob
  -- Phase 2 — max-build box + footprint + GFA
  ADD COLUMN IF NOT EXISTS max_build_setback_basis     TEXT,     -- bylaw/zone_default
  ADD COLUMN IF NOT EXISTS max_buildable_footprint_sqm NUMERIC(12,2), -- LEAST(neg-buffer, box, coverage cap)
  ADD COLUMN IF NOT EXISTS max_build_width_m           NUMERIC(8,2),  -- rect approx
  ADD COLUMN IF NOT EXISTS max_build_length_m          NUMERIC(8,2),  -- rect approx
  ADD COLUMN IF NOT EXISTS max_build_height_m          NUMERIC(8,2),  -- = bylaw_max_height_m
  ADD COLUMN IF NOT EXISTS max_build_stories           INTEGER,
  ADD COLUMN IF NOT EXISTS max_build_basis             TEXT,     -- rect_approx/heritage_existing
  ADD COLUMN IF NOT EXISTS max_buildable_gfa_sqm       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_buildable_gfa_basis     TEXT,     -- fsi/coverage_box/heritage_existing
  ADD COLUMN IF NOT EXISTS max_build_confidence        TEXT,     -- high/medium/low (number trust)
  -- Phase 3 — garden suite + constraint flags
  ADD COLUMN IF NOT EXISTS max_garden_suite_gfa_sqm    NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS garden_suite_fits           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envelope_constrained        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envelope_constraint_reason  TEXT;     -- ravine/heritage/heritage_no_massing/lot_too_narrow/setback_exceeds_lot/no_setback_data/low_lot_confidence/ambiguous_zone

COMMENT ON COLUMN parcels.lot_size_confidence IS 'Spec 65 max-build: 3-way area cross-check (lot_size_sqm vs ST_Area(geom) vs frontage×depth). Gates the envelope — Phase 2/3 emit only when high/medium.';
COMMENT ON COLUMN parcels.max_buildable_footprint_sqm IS 'Spec 65 max-build: LEAST(ST_Area(ST_Buffer(geom,-setback)), rect box, lot×coverage). Geometric (irregular-lot-safe).';
COMMENT ON COLUMN parcels.max_buildable_gfa_sqm IS 'Spec 65 max-build: LEAST(footprint×stories, lot×FSI). Sparse where FSI absent (basis=coverage_box). INFO-only coverage (not gated).';
COMMENT ON COLUMN parcels.max_build_confidence IS 'Spec 65 max-build: output-number trust (high/medium/low), decoupled from constraint status. Heritage-frozen with real massing stays high.';
COMMENT ON COLUMN parcels.envelope_constraint_reason IS 'Spec 65 max-build: ravine/heritage/heritage_no_massing/lot_too_narrow/setback_exceeds_lot/no_setback_data/low_lot_confidence/ambiguous_zone.';

-- DOWN — Rule 6 comments-only (migrate.js runs the whole file in one transaction and does NOT
-- honour -- UP / -- DOWN markers; an uncommented statement would execute right after UP and undo
-- the migration — see tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS lot_size_confidence,
--   DROP COLUMN IF EXISTS lot_size_basis,
--   DROP COLUMN IF EXISTS max_build_setback_basis,
--   DROP COLUMN IF EXISTS max_buildable_footprint_sqm,
--   DROP COLUMN IF EXISTS max_build_width_m,
--   DROP COLUMN IF EXISTS max_build_length_m,
--   DROP COLUMN IF EXISTS max_build_height_m,
--   DROP COLUMN IF EXISTS max_build_stories,
--   DROP COLUMN IF EXISTS max_build_basis,
--   DROP COLUMN IF EXISTS max_buildable_gfa_sqm,
--   DROP COLUMN IF EXISTS max_buildable_gfa_basis,
--   DROP COLUMN IF EXISTS max_build_confidence,
--   DROP COLUMN IF EXISTS max_garden_suite_gfa_sqm,
--   DROP COLUMN IF EXISTS garden_suite_fits,
--   DROP COLUMN IF EXISTS envelope_constrained,
--   DROP COLUMN IF EXISTS envelope_constraint_reason;
