# Chain Validation — Spec 58 WF3 (enrich-permits) in-chain run

**Date:** 2026-06-01 · **Framework:** Spec 79 §6.2 (full-chain run) + Spec 49 §6.1 (completeness cap) · **Branch:** `auto-unblock/validation-2026-05-23`
**Scope:** focused validation that the newly-added `enrich_permits` / `enrich_coa_zoning` steps (Spec 66 WF3) execute correctly **in their real chains** via `node scripts/run-chain.js`. (Not a full Spec 79 per-step cycle — that 2026-05-19 cycle is in `SUMMARY.md`.)

## Verdict: ✅ GO for the zoning work

Both new steps ran **in-chain with verdict PASS**. Every non-PASS step in both chains is attributable to **(a) the separate cost-model track's uncommitted WIP** or **(b) pre-existing pipeline WARNs** — none are zoning regressions.

---

## CoA chain — `completed_with_errors`, 60.9 s, 16/16 steps ran

**Target — `coa:enrich_coa_zoning` = PASS** (Spec 79 C1–C4/C11):
- C1 completed (4.7 s, exit 0). C2 row `coa:enrich_coa_zoning` status=completed. C3 verdict=PASS.
- C4 audit rows complete: `coa_zoning_class_coverage_pct=84.4` (PASS), `coa_enriched_count=58`, `coa_no_parcel_link_count=4534`, `coa_unlink_cleared_count=0`, `coa_multi_parcel_count=1`, `coa_heterogeneous_assembly_count=0`, 3× `*_null_pct`, duration.
- C11 `records_total/new=null`, `records_updated=58` (primary entity coa); idempotent-guarded.

**Non-PASS (NOT zoning):**
| Step | Verdict | Cause | Owner |
|---|---|---|---|
| `compute_coa_cost_estimates` | FAIL | `cost_estimate_coverage_pct=0.0%` | cost-model track (uncommitted WIP) |
| `assert_global_coverage` (Spec 49) | WARN | `coa_applications.estimated_cost=71%` (cascade) | cost-model track |
| `assert_lifecycle_phase_distribution` | WARN | lifecycle band config | pre-existing |
| `compute_phase_calibration` | WARN | cohort thinning | pre-existing |

## Permits chain — `completed_with_errors`, 1023 s (~17 min), 30/30 steps ran

**Target — `permits:enrich_permits` = PASS** (position 10, after `link_parcels`):
- C1 completed (22.6 s). C2/C3 `permits:enrich_permits` completed, verdict=PASS.
- C4 `permits_zoning_class_coverage_pct=84.2` (PASS), `permits_enriched_count=1011`, `permits_no_parcel_link_count=13801`, `unlink_cleared=0`, `multi=0`, `heterogeneous=0`, 3× null-rate, duration. C11 counters correct.

**Non-PASS (NOT zoning):**
| Step | Verdict | Cause | Owner |
|---|---|---|---|
| `assert_global_coverage` (Spec 49) | **FAIL** | 6 `cost_estimates.*` fields @ **45.4%** (<90%): estimated_cost, cost_tier, cost_range_low/high, modeled_gfa_sqm, effective_area_sqm | cost-model track (cascade) |
| `compute_cost_estimates` | WARN | permits-side cost model | cost-model track (uncommitted WIP) |
| `geocode_permits` | WARN | 91.2% geocode cov | pre-existing (session handoff) |
| `link_neighbourhoods` / `assert_data_bounds` / `assert_engine_health` / `assert_lifecycle_phase_distribution` / `compute_phase_calibration` / `compute_trade_forecasts` / `compute_opportunity_scores` | WARN | known pipeline WARNs | pre-existing |

`backup_db` completed (4.0 s) — no GCS blocker materialized.

---

## Spec 49 adherence
- Profile **ran as the last step of both chains** (chain-aware via `PIPELINE_CHAIN`) per Spec 49 §2. ✓
- All FAIL/WARN coverage rows are cost-estimate fields (cost-model track) or pre-existing; non-cost fields PASS.
- **Gap (#406):** Spec 49's denominator matrix does not yet include `permits.zoning_class` / `coa_applications.zoning_class` — profile is silent on zoning coverage (the F-H12 gate inside `enrich-permits.js` covers it at 84.2/84.4%).

## Workflow discipline (user directive + Spec 79 §3c)
**Zero code changed during validation.** The cost-model-track FAIL/WARNs are another track's uncommitted WIP — left untouched per the session handoff; surfaced as cross-track findings. No auto-unblock fixes were needed (zoning steps ran clean).

## Follow-ups
1. **cost-model track** (owner action): `compute_cost_estimates` 45.4% / `compute_coa_cost_estimates` 0% cost coverage — uncommitted WIP, not zoning.
2. **#406**: add zoning columns to the Spec 49 coverage matrix.
3. **#399**: `road_overlay_distance_m=5` overlay-membership buffer.
