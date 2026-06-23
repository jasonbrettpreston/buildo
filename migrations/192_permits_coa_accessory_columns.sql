-- Migration 192: accessory-fit + abuts_laneway propagation on permits + coa_applications (Spec 65 Phase 3).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§7 — propagation)
--
-- scripts/enrich-permits.js propagates from the DOMINANT parcel: the 8 garage/rear-suite cols ride
-- MAX_BUILD_COLS → LOT_MAXBUILD_COLS (nullable → generic =NULL orphan path); abuts_laneway rides
-- CENTRELINE_COLS (NOT NULL DEFAULT false on the targets, matching garden_suite_fits in mig 186 —
-- the orphan-nullify reset-to-false depends on this). All metadata-only. DOWN comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS abuts_laneway             BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS max_garage_gfa_sqm        NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS garage_capacity_cars      INTEGER,
      ADD COLUMN IF NOT EXISTS garage_constraint_reason  TEXT,
      ADD COLUMN IF NOT EXISTS garage_permission         TEXT,
      ADD COLUMN IF NOT EXISTS max_laneway_suite_gfa_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_rear_suite_gfa_sqm    NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS rear_suite_type           TEXT,
      ADD COLUMN IF NOT EXISTS rear_suite_permission     TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS abuts_laneway             BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS max_garage_gfa_sqm        NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS garage_capacity_cars      INTEGER,
      ADD COLUMN IF NOT EXISTS garage_constraint_reason  TEXT,
      ADD COLUMN IF NOT EXISTS garage_permission         TEXT,
      ADD COLUMN IF NOT EXISTS max_laneway_suite_gfa_sqm NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS max_rear_suite_gfa_sqm    NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS rear_suite_type           TEXT,
      ADD COLUMN IF NOT EXISTS rear_suite_permission     TEXT;
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6).
-- ALTER TABLE permits DROP COLUMN IF EXISTS abuts_laneway, DROP COLUMN IF EXISTS max_garage_gfa_sqm,
--   DROP COLUMN IF EXISTS garage_capacity_cars, DROP COLUMN IF EXISTS garage_constraint_reason,
--   DROP COLUMN IF EXISTS garage_permission, DROP COLUMN IF EXISTS max_laneway_suite_gfa_sqm,
--   DROP COLUMN IF EXISTS max_rear_suite_gfa_sqm, DROP COLUMN IF EXISTS rear_suite_type, DROP COLUMN IF EXISTS rear_suite_permission;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS abuts_laneway, ... (same list);
