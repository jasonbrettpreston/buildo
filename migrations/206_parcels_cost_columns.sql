-- Migration 206: parcels — parcel_cost_menu JSONB + cost headline scalars + FSI fields (Spec 88 §2.4/2.5).
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.4 (JSONB schema) / §2.5 (scalars)
--
-- The parcel cost model writes a parcel-scoped JSONB menu (13 lines) + flat headline scalars + the FSI
-- fields. The JSONB stays parcel-scoped (like optimal_config); the flat scalars propagate to permits/coa
-- (mig 207). max_build_fsi = max_buildable_gfa_sqm/lot (derived); coa_fsi = realized_fsi_p90 (the density
-- basis). Metadata-only ADD COLUMN. Backfill = the compute-parcel-cost-estimates run. Rollback comments-only.

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    ALTER TABLE parcels
      ADD COLUMN IF NOT EXISTS parcel_cost_menu               JSONB,           -- §2.4: 13-line menu (parcel-scoped)
      ADD COLUMN IF NOT EXISTS cost_fb_total                  NUMERIC(12,2),   -- #1 max build
      ADD COLUMN IF NOT EXISTS cost_coa_total                 NUMERIC(12,2),   -- #2 CoA build
      ADD COLUMN IF NOT EXISTS cost_solar_total               NUMERIC(12,2),   -- #3/#4 solar (CoA = max)
      ADD COLUMN IF NOT EXISTS cost_garden_suite_total        NUMERIC(12,2),   -- #5
      ADD COLUMN IF NOT EXISTS cost_laneway_suite_total       NUMERIC(12,2),   -- #6
      ADD COLUMN IF NOT EXISTS cost_garage_total              NUMERIC(12,2),   -- #9
      ADD COLUMN IF NOT EXISTS cost_gut_total                 NUMERIC(12,2),   -- #12
      ADD COLUMN IF NOT EXISTS cost_addition_total            NUMERIC(12,2),   -- #13
      ADD COLUMN IF NOT EXISTS cost_kitchen_per_sqm           NUMERIC(10,2),   -- #7
      ADD COLUMN IF NOT EXISTS cost_bath_per_sqm              NUMERIC(10,2),   -- #8
      ADD COLUMN IF NOT EXISTS cost_basement_per_sqm          NUMERIC(10,2),   -- #11
      ADD COLUMN IF NOT EXISTS cost_basement_underpin_per_sqm NUMERIC(10,2),   -- #10
      ADD COLUMN IF NOT EXISTS max_build_fsi                  NUMERIC(6,3),    -- = max_buildable_gfa_sqm / lot
      ADD COLUMN IF NOT EXISTS coa_fsi                        NUMERIC(6,3),    -- = realized_fsi_p90 (CoA density)
      ADD COLUMN IF NOT EXISTS realized_fsi_p90               NUMERIC(6,3);    -- detached realized FSI p90 (density basis)
  END IF;
END $mig$;

-- DOWN (comments-only — Rule 6):
-- ALTER TABLE parcels DROP COLUMN IF EXISTS parcel_cost_menu, DROP COLUMN IF EXISTS cost_fb_total,
--   DROP COLUMN IF EXISTS cost_coa_total, DROP COLUMN IF EXISTS cost_solar_total,
--   DROP COLUMN IF EXISTS cost_garden_suite_total, DROP COLUMN IF EXISTS cost_laneway_suite_total,
--   DROP COLUMN IF EXISTS cost_garage_total, DROP COLUMN IF EXISTS cost_gut_total,
--   DROP COLUMN IF EXISTS cost_addition_total, DROP COLUMN IF EXISTS cost_kitchen_per_sqm,
--   DROP COLUMN IF EXISTS cost_bath_per_sqm, DROP COLUMN IF EXISTS cost_basement_per_sqm,
--   DROP COLUMN IF EXISTS cost_basement_underpin_per_sqm, DROP COLUMN IF EXISTS max_build_fsi,
--   DROP COLUMN IF EXISTS coa_fsi, DROP COLUMN IF EXISTS realized_fsi_p90;
