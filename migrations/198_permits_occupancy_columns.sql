-- 198: permits occupancy floor-area columns (Spec 78 — Optimal Lot Configuration Phase 1).
--
-- The Toronto "Building Permits – Active Permits" CKAN feed (load-permits.js already fetches it)
-- carries occupancy floor-area columns we never mapped. RESIDENTIAL is the residential floor area
-- (m²) of the permit work — new-build TOTAL, addition DELTA — the authoritative GFA the
-- neighbourhood_build_norms (compute-build-norms.js) calibrate against. The others are kept for the
-- use-class breakdown. INTERIOR_ALTERATIONS is the interior-reno area.
--
-- Nullable ADDs = metadata-only on the ~250K permits table (Postgres 11+: no table rewrite for a
-- nullable column with no DEFAULT). Backfilled by the next streaming load-permits run.
-- Rollback is comments-only per Rule 6 (single-txn runner — tasks/lessons.md).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE permits
    ADD COLUMN IF NOT EXISTS residential_sqm                 NUMERIC,
    ADD COLUMN IF NOT EXISTS interior_alterations_sqm        NUMERIC,
    ADD COLUMN IF NOT EXISTS assembly_sqm                    NUMERIC,
    ADD COLUMN IF NOT EXISTS institutional_sqm               NUMERIC,
    ADD COLUMN IF NOT EXISTS mercantile_sqm                  NUMERIC,
    ADD COLUMN IF NOT EXISTS industrial_sqm                  NUMERIC,
    ADD COLUMN IF NOT EXISTS business_personal_services_sqm  NUMERIC;

COMMENT ON COLUMN permits.residential_sqm IS 'Spec 78: CKAN RESIDENTIAL = residential floor area (m²) of the permit work — new-build total / addition delta. The authoritative GFA the neighbourhood build-norms calibrate against (~37% raw fill).';
COMMENT ON COLUMN permits.interior_alterations_sqm IS 'Spec 78: CKAN INTERIOR_ALTERATIONS = interior-reno area (m²). Sparse for residential; reno-% uses scope-classified KIT/BTH permits, not this raw value.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE permits
--   DROP COLUMN IF EXISTS residential_sqm, DROP COLUMN IF EXISTS interior_alterations_sqm,
--   DROP COLUMN IF EXISTS assembly_sqm, DROP COLUMN IF EXISTS institutional_sqm,
--   DROP COLUMN IF EXISTS mercantile_sqm, DROP COLUMN IF EXISTS industrial_sqm,
--   DROP COLUMN IF EXISTS business_personal_services_sqm;
