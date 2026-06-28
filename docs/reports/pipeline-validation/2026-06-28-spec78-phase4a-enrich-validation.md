# Spec 78 Phase 4A — Full Enrich Run + Scale Validation

**Date:** 2026-06-28 · **Spec:** 78 (Optimal Lot Configuration) · **Sub-phase:** 4A (wire + verify)
**Run:** `node scripts/enrich-parcels.js --full` · **Verdict:** PASS · **Duration:** ~43 min (2,578,240 ms)

## Context
First real `--full` enrich run after the `residential_sqm` backfill (which made `neighbourhood_build_norms`
live). The optimal-config (3A) + comparable-builds (3C) passes had **never run against real data** — `0`
of 454,837 eligible parcels were populated. This run materialized the whole epic's outputs at scale.

## Run audit (PASS)
| Metric | Value |
|---|---|
| `optimal_config_enriched_count` | **448,775** (was 0) |
| `opt_config_engine_errors` | **0** (gated) |
| `opt_config_confidence` | high 3,964 / medium 444,811 / low 0 (medium dominates — FSI sparse ~5%) |
| `opt_config_citywide_fallback_count` | 28 (nbhd norms cover ~everything) |
| `comparable_builds_enriched_count` (with comps) | **374,934** |
| `comp_zero_comps_count` | 63,960 (no nearby same-zoning/size comp) |
| `comp_build_ratio_p50_count` | 313,456 |
| `comp_candidate_pool` | 9,154 |

## Invariants (over the 448,775 configured)
- **`opt_coa_gfa ≥ opt_aor_gfa`: holds for ALL** (0 violations — CoA-upside is storeys-not-footprint).
- **comp `build_ratio_p50 > 1.1` leak: 0** — the over-capture exclusion is airtight.
- `opt_aor_gfa ≤ 0`: **5** — the known degenerate `max_buildable_footprint_sqm` passthrough (pre-existing
  max-build data bug; review_followups spec78-p3a #3). Negligible.
- `opt_aor_gfa < footprint`: **1,009 (0.2%)** — legitimate low-FSI zones where `fsi × lot < footprint`
  (can't build one full coverage-floor); `binding = 'fsi'`. Correct, not a defect.

## Distributions (sane)
- **Suite:** garden 335,441 / laneway 65,150 / none 48,184 → 89% of configured parcels fit a rear suite.
- **Binding constraint:** coverage 382,000 / depth 26,009 / ravine 21,210 / heritage 8,790 / fsi 8,406 /
  through_lot 2,360 — coverage dominates (expected for low-rise), and ravine/heritage parcels correctly
  bind on their site gate.

## Ground-truth — Derwyn Rd (the parcels that motivated the epic)
65 configured parcels on Derwyn Rd:
- avg `opt_aor_gfa` **242 m² (2 storeys)** → avg `opt_coa_gfa` **362 m² (3 storeys, +50% CoA upside)`.
- garden suite fits; avg **9.8 named comps**/parcel; comp `build_ratio_p50` 0.81 (= citywide).
- headline: *"Old East York: 33 new builds + 57 additions + 36 renos in 5 yrs; CoA 95% approval; typically
  2 storeys (p90 3), 99% of the max-build footprint."* Comps incl. 307 Linsmore, 15 Derwyn.

The original investigation found the **massing footprint** unreliable for these parcels (tree-contaminated,
±20–38%). The optimal config now gives a **lot-driven, reliable** answer (2-storey as-of-right → 3-storey
CoA-upside, matching the real 2015 new-build-to-CoA pattern on the street), grounded by named comps + the
neighbourhood card.

## Verdict
**4A PASS.** No WF3 triage needed — the only edge cases (5 degenerate-footprint, 1,009 FSI-bound) are
known/legitimate. The epic's Phases 0–3 are validated end-to-end at scale.

**Next:** 4B (§G/§H calibrated `cur_gfa` range + reno fields — its own gate; the live old-stock ratio
~0.80 vs the design's 0.62 reopens the §G design) and 4C (forecast/cost reconciliation — the 40%
`estimated_cost` coverage gap).
