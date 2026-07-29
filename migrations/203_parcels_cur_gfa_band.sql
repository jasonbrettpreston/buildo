-- 203: parcels current-GFA rough realized band — Spec 78 Phase 4B (§G).
--
-- A ROUGH realized-size band for the current structure, calibrated from neighbourhood_build_norms
-- (the realized old-stock ratio). EXPLICITLY NOT a precise current-home measurement: the old-stock
-- ratio (1 − addition_delta ÷ max_build) skews HIGH because small additions dominate (a 9 m² bump-out
-- makes the ratio ≈0.98), so this band OVER-states current homes / under-states reno upside. It is a
-- realized-typical band, not a measured GFA. The reliable products are the optimal-config + comps.
--
-- NB: a SEPARATE band column set from the WF3-A cur_floor/cur_pot menu (which stays) — the cost model's
-- ARCHETYPE_GEOM_BASIS still reads cur_floor/cur_pot, untouched. `cur_gfa_band_basis` is a NEW column,
-- NOT a reuse of `cur_gfa_range_basis` (which holds WF3-A '1-2'/'1-3' storey flags).
--
-- Nullable ADDs = metadata-only on ~486K parcels (no rewrite). Backfilled by the next enrich run.
-- Rollback comments-only per Rule 6 (single-txn runner — tasks/lessons.md).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS cur_gfa_low_sqm     NUMERIC,
    ADD COLUMN IF NOT EXISTS cur_gfa_high_sqm    NUMERIC,
    ADD COLUMN IF NOT EXISTS cur_storeys_range   TEXT,
    ADD COLUMN IF NOT EXISTS cur_gfa_band_basis  TEXT;

COMMENT ON COLUMN parcels.cur_gfa_high_sqm IS 'Spec 78 §G: ROUGH realized-GFA band upper = max_buildable_gfa_sqm × nbhd existing_build_ratio_p50, capped at max-build. NOT a measured current-home GFA — the old-stock ratio over-states homes (small additions dominate). A realized-typical band only.';
COMMENT ON COLUMN parcels.cur_gfa_low_sqm IS 'Spec 78 §G: rough realized-GFA band lower = max_buildable_gfa_sqm × nbhd existing_build_ratio_p25 (capped at high). Rough band, not a measurement.';
COMMENT ON COLUMN parcels.cur_storeys_range IS 'Spec 78 §G: realized storey range from nbhd storey-norms p50/p90 (e.g. ''2-3''; ''N'' when p50=p90; falls back to max_build_stories).';
COMMENT ON COLUMN parcels.cur_gfa_band_basis IS 'Spec 78 §G: provenance of the band ratio — nbhd_realized / citywide_realized / default_062 (the §P 0.62 last-resort constant). DISTINCT from cur_gfa_range_basis (WF3-A storey flags).';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS cur_gfa_low_sqm, DROP COLUMN IF EXISTS cur_gfa_high_sqm,
--   DROP COLUMN IF EXISTS cur_storeys_range, DROP COLUMN IF EXISTS cur_gfa_band_basis;
