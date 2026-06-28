-- 202: parcels comparable-builds columns — Spec 78 Phase 3C (§K parcel-level comps).
--
-- Per-parcel NAMED evidence of what nearby comparable lots actually built: the enrich-parcels comp pass
-- (a spatial kNN over the permitted-parcel candidate set) writes up to ~10 nearest similar builds + the
-- modal build + the realized build-ratio / FSI medians. `comparable_builds` is the parcel-level evidence
-- (named addresses); `nearby_builds_summary` (§J, mig 200) is the neighbourhood-level aggregate.
--
-- Nullable ADDs = metadata-only on the ~486K parcels table (no rewrite). Backfilled by the next
-- enrich-parcels run. Rollback comments-only per Rule 6 (single-txn runner — tasks/lessons.md).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS comparable_builds      JSONB,
    ADD COLUMN IF NOT EXISTS comp_count             INTEGER,
    ADD COLUMN IF NOT EXISTS comp_dominant_build    TEXT,
    ADD COLUMN IF NOT EXISTS comp_build_ratio_p50   NUMERIC,
    ADD COLUMN IF NOT EXISTS comp_fsi_p50           NUMERIC;

COMMENT ON COLUMN parcels.comparable_builds IS 'Spec 78 §K: up to ~10 nearest SIMILAR realized builds (same zoning, lot/frontage ±20%) — each { address, lot_sqm, frontage_m, distance_m, work_type, permit_gfa_sqm, permit_fsi, storeys, coa_decision, build_ratio }. Named parcel-level evidence; the neighbourhood aggregate is nearby_builds_summary (§J).';
COMMENT ON COLUMN parcels.comp_count IS 'Spec 78 §K: # comparable builds matched (confidence signal — low count → less reliable comps).';
COMMENT ON COLUMN parcels.comp_dominant_build IS 'Spec 78 §K: modal work_type (new_build / addition) among the comparable builds.';
COMMENT ON COLUMN parcels.comp_build_ratio_p50 IS 'Spec 78 §K: median realized footprint ÷ max-build among comps — EXCLUDES over-captured comps (build_ratio > 1.1, physically impossible from massing noise).';
COMMENT ON COLUMN parcels.comp_fsi_p50 IS 'Spec 78 §K: median realized FSI (permit GFA ÷ lot_sqm) among comps. NULL until the residential_sqm backfill.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS comparable_builds, DROP COLUMN IF EXISTS comp_count,
--   DROP COLUMN IF EXISTS comp_dominant_build, DROP COLUMN IF EXISTS comp_build_ratio_p50,
--   DROP COLUMN IF EXISTS comp_fsi_p50;
