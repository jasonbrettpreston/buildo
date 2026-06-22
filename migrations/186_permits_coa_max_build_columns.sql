-- Migration 186: max-build envelope propagation columns on permits + coa_applications (Spec 65 §8e-style).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§ Max-build envelope — propagation)
--
-- Written by scripts/enrich-permits.js (lock 66) — propagates the parcels max-build feed (mig 185)
-- onto leads via permit_parcels (permits) / lead_parcels (coa), from the DOMINANT parcel (an
-- assembly has no single coherent envelope; max_build_confidence degrades to 'low' when
-- zoning_parcel_count > 1). Carries BOTH the lot-validation INPUTS (so the operator can eyeball
-- lot_size/frontage/depth per-application) AND the max-build OUTPUTS. is_through_lot is ALREADY
-- propagated via migration 176 (centreline) — not re-added here.
--
-- SEPARATE from the zoning (166) / ravine (169) / heritage (172) / centreline (176) lead
-- migrations (L11). Additive; the two booleans are NOT NULL DEFAULT false (PG11+ constant-default
-- metadata-only add — no rewrite on ~250K permits / ~33K coa). No CHECK (free-text basis/reason).
-- lock_timeout bounds the brief ACCESS EXCLUSIVE. DOWN comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS lot_size_sqm                NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS frontage_m                  NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS depth_m                     NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS lot_size_confidence         TEXT,
      ADD COLUMN IF NOT EXISTS lot_size_basis              TEXT,
      ADD COLUMN IF NOT EXISTS max_build_setback_basis     TEXT,
      ADD COLUMN IF NOT EXISTS max_buildable_footprint_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_build_width_m           NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_length_m          NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_height_m          NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_stories           INTEGER,
      ADD COLUMN IF NOT EXISTS max_build_basis             TEXT,
      ADD COLUMN IF NOT EXISTS max_buildable_gfa_sqm       NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_buildable_gfa_basis     TEXT,
      ADD COLUMN IF NOT EXISTS max_build_confidence        TEXT,
      ADD COLUMN IF NOT EXISTS max_garden_suite_gfa_sqm    NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS garden_suite_fits           BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS envelope_constrained        BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS envelope_constraint_reason  TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS lot_size_sqm                NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS frontage_m                  NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS depth_m                     NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS lot_size_confidence         TEXT,
      ADD COLUMN IF NOT EXISTS lot_size_basis              TEXT,
      ADD COLUMN IF NOT EXISTS max_build_setback_basis     TEXT,
      ADD COLUMN IF NOT EXISTS max_buildable_footprint_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_build_width_m           NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_length_m          NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_height_m          NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS max_build_stories           INTEGER,
      ADD COLUMN IF NOT EXISTS max_build_basis             TEXT,
      ADD COLUMN IF NOT EXISTS max_buildable_gfa_sqm       NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_buildable_gfa_basis     TEXT,
      ADD COLUMN IF NOT EXISTS max_build_confidence        TEXT,
      ADD COLUMN IF NOT EXISTS max_garden_suite_gfa_sqm    NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS garden_suite_fits           BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS envelope_constrained        BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS envelope_constraint_reason  TEXT;
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6). DATA-LOSS: re-deriving requires a full enrich-permits.js re-run
-- (ENRICH_TARGET=permits + =coa) after re-adding the columns.
-- ALTER TABLE permits DROP COLUMN IF EXISTS lot_size_sqm, DROP COLUMN IF EXISTS frontage_m, DROP COLUMN IF EXISTS depth_m,
--   DROP COLUMN IF EXISTS lot_size_confidence, DROP COLUMN IF EXISTS lot_size_basis, DROP COLUMN IF EXISTS max_build_setback_basis,
--   DROP COLUMN IF EXISTS max_buildable_footprint_sqm, DROP COLUMN IF EXISTS max_build_width_m, DROP COLUMN IF EXISTS max_build_length_m,
--   DROP COLUMN IF EXISTS max_build_height_m, DROP COLUMN IF EXISTS max_build_stories, DROP COLUMN IF EXISTS max_build_basis,
--   DROP COLUMN IF EXISTS max_buildable_gfa_sqm, DROP COLUMN IF EXISTS max_buildable_gfa_basis, DROP COLUMN IF EXISTS max_build_confidence,
--   DROP COLUMN IF EXISTS max_garden_suite_gfa_sqm, DROP COLUMN IF EXISTS garden_suite_fits, DROP COLUMN IF EXISTS envelope_constrained,
--   DROP COLUMN IF EXISTS envelope_constraint_reason;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lot_size_sqm, ... (same column list as permits above);
