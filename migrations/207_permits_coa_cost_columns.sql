-- Migration 207: permits + coa_applications — cost headline + FSI scalars (Spec 88 §2.10 propagation targets).
--
-- SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.10 (propagation) / Spec 48 §4D
--
-- The parcel cost scalars propagate to permits/coa via the §4D dominant-parcel pass (enrich-permits.js
-- COST_PROP_COLS), exactly like the optimal-config/max-build scalars. These are the SAME flat scalars as
-- parcels (mig 206) MINUS parcel_cost_menu — the JSONB menu stays parcel-scoped (not propagated). Metadata-
-- only ADD COLUMN; backfill is the propagation pass. Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['permits', 'coa_applications'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format($f$
        ALTER TABLE %I
          ADD COLUMN IF NOT EXISTS cost_fb_total                  NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_coa_total                 NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_solar_total               NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_garden_suite_total        NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_laneway_suite_total       NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_garage_total              NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_gut_total                 NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_addition_total            NUMERIC(12,2),
          ADD COLUMN IF NOT EXISTS cost_kitchen_per_sqm           NUMERIC(10,2),
          ADD COLUMN IF NOT EXISTS cost_bath_per_sqm              NUMERIC(10,2),
          ADD COLUMN IF NOT EXISTS cost_basement_per_sqm          NUMERIC(10,2),
          ADD COLUMN IF NOT EXISTS cost_basement_underpin_per_sqm NUMERIC(10,2),
          ADD COLUMN IF NOT EXISTS max_build_fsi                  NUMERIC(6,3),
          ADD COLUMN IF NOT EXISTS coa_fsi                        NUMERIC(6,3),
          ADD COLUMN IF NOT EXISTS realized_fsi_p90               NUMERIC(6,3)
      $f$, t);
    END IF;
  END LOOP;
END $mig$;

-- DOWN (comments-only — Rule 6, single-txn runner):
-- For each of permits, coa_applications: ALTER TABLE <t>
--   DROP COLUMN IF EXISTS cost_fb_total, cost_coa_total, cost_solar_total, cost_garden_suite_total,
--   cost_laneway_suite_total, cost_garage_total, cost_gut_total, cost_addition_total, cost_kitchen_per_sqm,
--   cost_bath_per_sqm, cost_basement_per_sqm, cost_basement_underpin_per_sqm, max_build_fsi, coa_fsi,
--   realized_fsi_p90;
