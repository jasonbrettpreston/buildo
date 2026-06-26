-- 200: parcels optimal-config columns — Spec 78 Phase 3A (§I optimal config + §J nearby builds).
--
-- The headline optimal-lot-configuration outputs the enrich-parcels optimal-config pass writes per
-- residential parcel (computed by scripts/lib/optimal-config.js from lot dims + by-law caps + max-build
-- cols + neighbourhood_build_norms). Flat scalar columns for the headline numbers (queryable) + two
-- JSONB blobs: `optimal_config` (the full as-of-right / CoA-upside menu + components) and
-- `nearby_builds_summary` (a frozen snapshot of the parcel's neighbourhood_build_norms row + headline).
--
-- Nullable ADDs = metadata-only on the ~486K parcels table (Postgres 11+: no table rewrite for a
-- nullable column with no DEFAULT). Backfilled by the next enrich-parcels run. The imagery rename +
-- §G/§H degrade (3B) and the comparable-builds columns (3C) are SEPARATE migrations.
-- Rollback is comments-only per Rule 6 (single-txn runner — tasks/lessons.md).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS opt_aor_storeys          INTEGER,
    ADD COLUMN IF NOT EXISTS opt_aor_gfa_sqm          NUMERIC,
    ADD COLUMN IF NOT EXISTS opt_aor_units            INTEGER,
    ADD COLUMN IF NOT EXISTS opt_coa_storeys          INTEGER,
    ADD COLUMN IF NOT EXISTS opt_coa_gfa_sqm          NUMERIC,
    ADD COLUMN IF NOT EXISTS opt_suite_type           TEXT,
    ADD COLUMN IF NOT EXISTS opt_suite_fits_full      BOOLEAN,
    ADD COLUMN IF NOT EXISTS opt_binding_constraint   TEXT,
    ADD COLUMN IF NOT EXISTS opt_config_confidence    TEXT,
    ADD COLUMN IF NOT EXISTS optimal_config           JSONB,
    ADD COLUMN IF NOT EXISTS nearby_builds_summary    JSONB;

COMMENT ON COLUMN parcels.opt_aor_gfa_sqm IS 'Spec 78 §I: as-of-right main-build GFA from optimal-config.js (coverage cap × storeys, FSI-bound). MARKET/by-law-realized, not a guarantee.';
COMMENT ON COLUMN parcels.opt_coa_gfa_sqm IS 'Spec 78 §C/§I: CoA-upside main-build GFA (nbhd p90 storeys at the same footprint — CoA = up, not out).';
COMMENT ON COLUMN parcels.opt_binding_constraint IS 'Spec 78 §I: what limits the as-of-right config — coverage / fsi / depth / soft_landscaping / holding / heritage / ravine / through_lot.';
COMMENT ON COLUMN parcels.optimal_config IS 'Spec 78 §I: full config menu { bylaw_version, as_of_right, coa_upside, opt_* } from optimal-config.js#computeOptimalConfig.';
COMMENT ON COLUMN parcels.nearby_builds_summary IS 'Spec 78 §J: frozen snapshot of the parcel''s neighbourhood_build_norms row (5-yr counts, p50/p90, CoA approval, ratios) + a human headline string.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS opt_aor_storeys, DROP COLUMN IF EXISTS opt_aor_gfa_sqm,
--   DROP COLUMN IF EXISTS opt_aor_units, DROP COLUMN IF EXISTS opt_coa_storeys,
--   DROP COLUMN IF EXISTS opt_coa_gfa_sqm, DROP COLUMN IF EXISTS opt_suite_type,
--   DROP COLUMN IF EXISTS opt_suite_fits_full, DROP COLUMN IF EXISTS opt_binding_constraint,
--   DROP COLUMN IF EXISTS opt_config_confidence, DROP COLUMN IF EXISTS optimal_config,
--   DROP COLUMN IF EXISTS nearby_builds_summary;
