-- Migration 190: scenario GFA + max_build_stories_basis propagation on permits + coa_applications (Spec 65 Phase 2).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§6 — propagation)
--
-- scripts/enrich-permits.js propagates from the DOMINANT parcel: the 6 scenario GFAs via a new
-- SCENARIO_COLS set; max_build_stories_basis rides the existing max-build propagation (it's now in
-- MAX_BUILD_COLS → LOT_MAXBUILD_COLS, so it must exist on the targets). All nullable, metadata-only.
-- Rollback is comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS max_newbuild_coa_gfa_sqm  NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_basement_gfa_sqm      NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_storey_gfa_sqm        NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_interior_reno_gfa_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_est_kitchen_gfa_sqm   NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_est_bath_gfa_sqm      NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_build_stories_basis   TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS max_newbuild_coa_gfa_sqm  NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_basement_gfa_sqm      NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_storey_gfa_sqm        NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_interior_reno_gfa_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_est_kitchen_gfa_sqm   NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_est_bath_gfa_sqm      NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_build_stories_basis   TEXT;
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6).
-- ALTER TABLE permits DROP COLUMN IF EXISTS max_newbuild_coa_gfa_sqm, DROP COLUMN IF EXISTS cur_basement_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_storey_gfa_sqm, DROP COLUMN IF EXISTS cur_interior_reno_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_est_kitchen_gfa_sqm, DROP COLUMN IF EXISTS cur_est_bath_gfa_sqm, DROP COLUMN IF EXISTS max_build_stories_basis;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS max_newbuild_coa_gfa_sqm, ... (same list);
