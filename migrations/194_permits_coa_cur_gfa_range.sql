-- Migration 194: current-building GFA range + existing data-quality flag propagation on permits + coa_applications (Spec 65 Phase 1 / WF3-A).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§5/§6 — propagation)
--
-- scripts/enrich-permits.js propagates from the DOMINANT parcel: the 4 cur-GFA-range cols ride the
-- SCENARIO_COLS set; existing_data_quality_flag rides the EXISTING_STRUCTURE_COLS set. All nullable,
-- metadata-only. Rollback is comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS cur_floor_gfa_sqm          NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_pot_2story_gfa_sqm     NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_pot_3story_gfa_sqm     NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_gfa_range_basis        TEXT,
      ADD COLUMN IF NOT EXISTS existing_data_quality_flag TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS cur_floor_gfa_sqm          NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_pot_2story_gfa_sqm     NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_pot_3story_gfa_sqm     NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS cur_gfa_range_basis        TEXT,
      ADD COLUMN IF NOT EXISTS existing_data_quality_flag TEXT;
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6).
-- ALTER TABLE permits DROP COLUMN IF EXISTS cur_floor_gfa_sqm, DROP COLUMN IF EXISTS cur_pot_2story_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_pot_3story_gfa_sqm, DROP COLUMN IF EXISTS cur_gfa_range_basis, DROP COLUMN IF EXISTS existing_data_quality_flag;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS cur_floor_gfa_sqm, ... (same list);
