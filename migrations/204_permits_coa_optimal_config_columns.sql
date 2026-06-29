-- Migration 204: optimal-config + comparable-builds propagation on permits + coa_applications (Spec 78 §4D / Spec 49).
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (§4D — propagation)
--
-- scripts/enrich-permits.js propagates the 13 FLAT optimal-config + comp headline scalars from the
-- DOMINANT parcel (the same dominant-parcel propagation that carries lot/max-build/existing/scenario), so
-- a lead carries the queryable optimal-config + comp signal (Spec 49 completeness). The 3 JSONB blobs
-- (optimal_config, comparable_builds, nearby_builds_summary) are NOT propagated — parcel-scoped by design.
-- All 13 are nullable, incl. opt_suite_fits_full (plain BOOLEAN, NOT NOT-NULL — orphan leads → NULL, i.e.
-- "no dominant-parcel match", not "suite does not fit"). Metadata-only. Rollback comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS opt_aor_storeys          INTEGER,
      ADD COLUMN IF NOT EXISTS opt_aor_gfa_sqm          NUMERIC,
      ADD COLUMN IF NOT EXISTS opt_aor_units            INTEGER,
      ADD COLUMN IF NOT EXISTS opt_coa_storeys          INTEGER,
      ADD COLUMN IF NOT EXISTS opt_coa_gfa_sqm          NUMERIC,
      ADD COLUMN IF NOT EXISTS opt_suite_type           TEXT,
      ADD COLUMN IF NOT EXISTS opt_suite_fits_full      BOOLEAN,
      ADD COLUMN IF NOT EXISTS opt_binding_constraint   TEXT,
      ADD COLUMN IF NOT EXISTS opt_config_confidence    TEXT,
      ADD COLUMN IF NOT EXISTS comp_count               INTEGER,
      ADD COLUMN IF NOT EXISTS comp_dominant_build      TEXT,
      ADD COLUMN IF NOT EXISTS comp_build_ratio_p50     NUMERIC,
      ADD COLUMN IF NOT EXISTS comp_fsi_p50             NUMERIC;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS opt_aor_storeys          INTEGER,
      ADD COLUMN IF NOT EXISTS opt_aor_gfa_sqm          NUMERIC,
      ADD COLUMN IF NOT EXISTS opt_aor_units            INTEGER,
      ADD COLUMN IF NOT EXISTS opt_coa_storeys          INTEGER,
      ADD COLUMN IF NOT EXISTS opt_coa_gfa_sqm          NUMERIC,
      ADD COLUMN IF NOT EXISTS opt_suite_type           TEXT,
      ADD COLUMN IF NOT EXISTS opt_suite_fits_full      BOOLEAN,
      ADD COLUMN IF NOT EXISTS opt_binding_constraint   TEXT,
      ADD COLUMN IF NOT EXISTS opt_config_confidence    TEXT,
      ADD COLUMN IF NOT EXISTS comp_count               INTEGER,
      ADD COLUMN IF NOT EXISTS comp_dominant_build      TEXT,
      ADD COLUMN IF NOT EXISTS comp_build_ratio_p50     NUMERIC,
      ADD COLUMN IF NOT EXISTS comp_fsi_p50             NUMERIC;
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6 single-txn runner).
-- ALTER TABLE permits DROP COLUMN IF EXISTS opt_aor_storeys, DROP COLUMN IF EXISTS opt_aor_gfa_sqm, DROP COLUMN IF EXISTS opt_aor_units, DROP COLUMN IF EXISTS opt_coa_storeys, DROP COLUMN IF EXISTS opt_coa_gfa_sqm, DROP COLUMN IF EXISTS opt_suite_type, DROP COLUMN IF EXISTS opt_suite_fits_full, DROP COLUMN IF EXISTS opt_binding_constraint, DROP COLUMN IF EXISTS opt_config_confidence, DROP COLUMN IF EXISTS comp_count, DROP COLUMN IF EXISTS comp_dominant_build, DROP COLUMN IF EXISTS comp_build_ratio_p50, DROP COLUMN IF EXISTS comp_fsi_p50;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS opt_aor_storeys, ... (same 13);
