-- Migration 169: add ravine-enrichment columns to permits + coa_applications (Spec 59 §8e / M-3).
-- Written by scripts/enrich-permits.js (lock 66) — propagates the §8d parcel ravine feed
-- onto leads via permit_parcels (permits) / lead_parcels (coa), L12 MIN(ABS)×sign rule.
-- SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md
-- SEPARATE from the zoning migrations (165/166) per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on ~250K permits / ~33K coa).
-- lock_timeout: the metadata-only add still needs a brief ACCESS EXCLUSIVE; bound the wait so a
-- long-running query can't block the deploy. SET LOCAL → scoped to migrate.js's per-file txn.

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false, -- L1: Chapter 658 applies?
      ADD COLUMN IF NOT EXISTS ravine_distance_m            DOUBLE PRECISION;                -- L2/L12: MIN(ABS)×sign over linked parcels
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS is_in_ravine_protection_area BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ravine_distance_m            DOUBLE PRECISION;
  END IF;
END
$mig$;

-- DOWN
-- ALTER TABLE permits DROP COLUMN IF EXISTS ravine_distance_m;
-- ALTER TABLE permits DROP COLUMN IF EXISTS is_in_ravine_protection_area;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS ravine_distance_m;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS is_in_ravine_protection_area;
