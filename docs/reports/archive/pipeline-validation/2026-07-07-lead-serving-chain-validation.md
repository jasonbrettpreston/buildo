# Phase 7 — Validated Lead-Serving Chain Runs (Spec 41 + 42) — 2026-07-07

**WF2 Active Task:** `.cursor/active_task.md` (Lead-Serving Reliability). Phase 7 = the validated
coa→permits chain runs per Spec 47/48/49.
**DB:** local `buildo` (dev). All figures from live `psql` / `pipeline_runs` rows.
**Baseline:** `docs/reports/pipeline-validation/2026-07-06-lead-serving-baseline.md`.

---

## Preconditions (executed in order, before the chains)

| # | Action | Result |
|---|---|---|
| 1a | Amend reset script to back up `(id, trade_classified_at)` before NULL-out | Commit `6af3d53` — `_backup_coa_trade_classified_20260707` (CREATE TABLE AS) + one-UPDATE restore printed |
| 1b | Run `wf2-reset-coa-trade-classification.js --confirm` | 31,348 backed up; 31,348 NULLed; verify: backup=31,348, still_classified=0, all 33,280 now NULL |
| 2 | `backfill-permits-location.js` (219K historical rows) | **Blocked by a pre-existing cast bug — fixed commit `dda4b3a`** (see below). After fix: 219,265 rows updated, `permits.location` coverage **4.3% → 91.2%** (matches lat/lng exactly) |
| 3 | Pre-P7 snapshot deltas captured | lifecycle_stalled 34,465; trade_forecasts 1,743,244; calibration_method + urgency = baseline; CoA lead_trades all-active 937,674 (zero inactive); CoA active/CoA mean 30.93 / median 33; CoA priced 19,449 |

### Precondition-2 defect fixed (commit `dda4b3a`, own commit)
`backfill-permits-location.js` crashed with Postgres 42883 (no operator). Root cause:
`permits.revision_num` is `varchar`, but the VALUES-join placeholder cast it to `::int`
(line 49), making `p.revision_num = k.revision_num` a `varchar = int` comparison. Fixed to
`::text` (mirrors `permit_num`). Idempotent backfill, zero behavioral risk. This is a
**pre-existing bug** (not a P7 change) but it blocked a stated P7 precondition and is a
one-character trivial defect — fixed under the "trivial, obvious defect" allowance and flagged.

---

## Chain runs (strictly sequential, never overlapping)

### coa chain (16 steps) — `completed_with_errors`, wall-clock **583s (~9.7 min)**

All 16 steps landed §R10 (PIPELINE_SUMMARY) + §R11 (PIPELINE_META) rows in `pipeline_runs`.
Chain status `completed_with_errors` = one verdict-only FAIL (assert_global_coverage);
`run-chain.js` halts only on process crash, never on FAIL verdicts.

| # | Step | Status | Verdict | s |
|---|---|---|---|---|
| 1 | assert_schema | completed | PASS | 1.3 |
| 2 | coa (load) | completed | PASS | 30.5 |
| 3 | assert_coa_freshness | completed | PASS | 1.8 |
| 4 | link_coa_to_parcels | completed | WARN | 14.6 |
| 5 | enrich_coa_zoning | completed | PASS | 66.0 |
| 6 | classify_coa_scope | completed | PASS | 1.7 |
| 7 | classify_coa_trades | completed | **PASS** | 226.8 |
| 8 | compute_coa_cost_estimates | completed | WARN | 37.2 |
| 9 | link_coa | completed | PASS | 23.6 |
| 10 | refresh_snapshot | completed | PASS | 51.3 |
| 11 | assert_data_bounds | completed | PASS | 0.7 |
| 12 | assert_engine_health | completed | PASS | 0.8 |
| 13 | classify_lifecycle_phase | completed | PASS | 106.8 |
| 14 | assert_lifecycle_phase_distribution | completed | WARN | 2.9 |
| 15 | compute_phase_calibration | completed | WARN | 3.7 |
| 16 | assert_global_coverage | completed | FAIL | 12.7 |

### Spec 42 acceptance

| Criterion | Observed | Verdict | Citation |
|---|---|---|---|
| Every step lands §R10+§R11 rows | 16/16 steps have PIPELINE_SUMMARY + PIPELINE_META | PASS | `pipeline_runs` coa:* rows (this run) |
| compute_coa_cost_estimates verdict | WARN (cost_estimate_coverage_pct 62.0% incremental; structural) | PASS (as-documented) | coa:compute_coa_cost_estimates audit |
| new `coa_corpus_cost_coverage_pct` row ~58-59% | **58.4%** (INFO) | PASS | coa:compute_coa_cost_estimates audit |
| classify_coa_trades avg_active ≤18 WARN-gate | **avg_active 14.70 (PASS)**, all-rows avg 30.93 (INFO) | PASS | coa:classify_coa_trades audit |
| median active ≤18 | **16** | PASS | coa:classify_coa_trades audit (median_active_trades_per_lead) |
| severance-only → 0 active | Corpus severance CoAs 33→2.67 active avg; fresh pure-severance → ~0 fresh rows. Minor pre-existing stale-row gap (14 CoAs/141 rows) — see follow-up | PASS (gate met) w/ follow-up | lead_trades classified_at analysis |
| lifecycle steps PASS/WARN-as-documented | classify_lifecycle_phase PASS; distribution WARN (E.4 seq-band + lifecycle_seq NULL-by-design, seq_unclassified 250,782); calibration WARN (unreliable_buckets 288, sample-size) | PASS (as-documented) | coa:assert_lifecycle_phase_distribution / compute_phase_calibration audits |

### P6.6 acceptance (CoA trade fan-out fix)

| Metric | Baseline (pre-reset) | After P7 | Delta | Verdict |
|---|---|---|---|---|
| CoA lead_trades active | 937,674 (all active, 0 inactive) | 442,532 active / **496,725 inactive** | ~496K flipped inactive (plan projected ~490K) | PASS |
| active trades / CoA (mean) | 30.93 | **14.70** | −16.2 | PASS |
| active trades / CoA (median) | 33 | **16** | −17 (≤18) | PASS |
| CoA priced count | 19,449 | **19,479** | +30 (+0.15%, within ±2%) | PASS |
| CoA priced cost_source | archetype_parcel 19,449 | archetype_parcel 19,479 (100%) | zero coverage shift (GRD edit-3) | PASS |
| null_reason_no_active_trades | 125 (incremental batch) | 996 (corpus-wide) | corpus figure; priced-count unchanged → bounded | PASS |

**assert_global_coverage FAIL** = single row `coa_applications.estimated_cost` 58.4% vs
aspirational `>=90%`. CoA cost coverage is structurally ~58% (severance / no-parcel / no-rate
CoAs). Pre-existing structural gate, verdict-only, not a regression — honest representation.

### Diagnosed follow-up (pre-existing, NOT this WF's diff)
`classify-coa-trades.js` upserts `lead_trades` (INSERT…ON CONFLICT DO UPDATE) with **no
per-lead DELETE** — unlike `lead_products` (line 212, delete-then-insert). A CoA whose trade
set SHRINKS between runs keeps stale rows at their old `is_active`. Corpus impact: **14 CoAs /
141 stale rows** (0.015% of 939K). E.g. `coa:B0008/26NY` (project_type Severance, pure
`{residential,severance}` → classifyCoaTrades returns 0) retains 32 stale 2026-06-21 rows +
1 fresh. Does NOT move the median/avg gate. Recommend: add the lead_products-style per-lead
DELETE to lead_trades in a follow-up WF3 (with a regression lock on shrink-to-empty).

---

## permits chain (32 steps) — `completed_with_errors`, wall-clock **46.1 min** (20:08:38 → 20:54:42)

All 32 steps landed §R10+§R11 rows. Chain status `completed_with_errors` = verdict-only FAILs
(close_stale_permits fail-safe abort + assert_entity_tracing pre-existing score-coverage gate);
no step crashed.

| # | Step | Verdict | s | | # | Step | Verdict | s |
|---|---|---|---|---|---|---|---|---|
| 1 | assert_schema | PASS | 0.8 | | 17 | backfill_realtor_permit_trades | PASS | 8.8 |
| 2 | permits (load) | PASS | 177.6 | | 18 | compute_cost_estimates | WARN | 130.1 |
| 3 | close_stale_permits | **FAIL** | 3.9 | | 19 | compute_timing_calibration_v2 | PASS | 0.5 |
| 4 | classify_permit_phase | PASS | 4.9 | | 20 | link_coa | PASS | 15.7 |
| 5 | classify_scope | PASS | 160.0 | | 21 | refresh_snapshot | PASS | 48.9 |
| 6 | builders | PASS | 1.8 | | 22 | assert_data_bounds | WARN | 5.1 |
| 7 | link_wsib | PASS | 156.0 | | 23 | assert_engine_health | WARN | 4.2 |
| 8 | geocode_permits | WARN | 10.5 | | 24 | classify_lifecycle_phase | PASS | 142.3 |
| 9 | link_parcels | PASS | 105.5 | | 25 | assert_lifecycle_phase_distribution | WARN | 2.4 |
| 10 | enrich_permits | PASS | 76.1 | | 26 | compute_phase_calibration | WARN | 1.7 |
| 11 | link_neighbourhoods | WARN | 3.5 | | 27 | compute_trade_forecasts | WARN | 350.6 |
| 12 | link_massing | PASS | 11.3 | | 28 | compute_opportunity_scores | PASS | 229.5 |
| 13 | link_similar | PASS | 13.2 | | 29 | update_tracked_projects | PASS | 0.5 |
| 14 | classify_permits | PASS | 967.9 | | 30 | assert_entity_tracing | **FAIL** | 19.3 |
| 15 | compute_storey_norms | PASS | 2.5 | | 31 | assert_global_coverage | WARN | 85.2 |
| 16 | compute_build_norms | **WARN (first-ever)** | 13.8 | | 32 | backup_db | — | 9.4 |

### Spec 41 acceptance table

| Criterion | Observed | Verdict | Citation |
|---|---|---|---|
| Every step §R10+§R11 | 32/32 steps landed pipeline_runs rows with audit tables + PIPELINE_META | PASS | permits:* rows started_at > 20:00 |
| `compute_build_norms` FIRST in-chain verdict | Recorded (WARN — `build_ratio_null_rate_pct` 53.9; neighbourhoods 154, pocket_family_rows 293, citywide_fsi_p50 0.724; reads neighbourhood_storey_norms from prior step — in-chain ordering validated). Prior pipeline_runs history: **zero rows ever** (verified pre-run) | PASS | permits:compute_build_norms audit |
| Cost step re-audited (tier counts visible) | archetype_t1_declared_area 17,455 / t2_parcel 74,300 / t3_rate 4,722 / additive_pairs 11,623 / tier_none 8,397 / unpriceable_t4 9,240; archetype_coverage 74.6%; model_coverage 58.9% WARN (pre-existing) | PASS | permits:compute_cost_estimates audit |
| `live_status_null_count` ≈ 0 | **0** (audit row PASS) + DB truth 0 (`lifecycle_phase IS NULL AND matched_rule IS NULL`). The 544+585 drain landed — total NULL-phase now 1,286, all dead-status carry matched_rule (NULL-by-design) | PASS | permits:assert_lifecycle_phase_distribution audit + live DB |
| `never_classified_count` = 0 | **0** (audit row) + DB truth 0 (`lifecycle_classified_at IS NULL`) | PASS | same |
| forecasts `unmapped_trades = 0` | **0** (PASS row) | PASS | permits:compute_trade_forecasts audit |
| `excluded_rows`/`excluded_trade_slugs` visible | excluded_rows **86,574** (INFO) + excluded_trade_slugs **site-maintenance** (INFO) | PASS | same |
| `default_calibration_pct` verdict per externalized 70/85 | **60.3% → PASS** (relaxed thresholds warn=70/fail=85) | PASS | same |
| `calibration_thresholds_relaxed` WARN row visible | Present: `warn=70/fail=85 (strict warn=20/fail=50)` WARN + `calibration_cohort_fill_pct` 39.7% INFO | PASS | same |
| **CoA branch ACTIVE** | `coa_forecasts_computed` = **35,492 > 0**; `coa_audit_gate_status` = `pass_or_warn_accepted` (WARN); **`coa_audit_gate_warn_accepted` = 1 (WARN row visible)**; grace_bypass 0, force_active 0, coa_skipped_audit_blocked 0 | PASS | same |
| scores `coa_orphaned_cost_count` ≈ unpriced-CoA share (NOT ≈0) | **11,743** vs re-derived expectation **11,820** CoA forecast rows on unpriced CoAs (99.3% match; drift = post-scoring snapshot). CoA scores fresh: forecasts_in_scope_coa 35,492 = total_rows_coa 35,492 | PASS | permits:compute_opportunity_scores audit + live re-derivation |
| entity-tracing `trade_forecasts` coverage ≥ 0.85 (FIRST validation) | **89.7 PASS** (history: 89.5 on 06-25, 89.0 on 06-16 — the 0.30→0.85 restore is correct) | PASS | permits:assert_entity_tracing audit |
| Propagation freshness | enrich_permits ran in-chain (76.1s PASS) + enrich_coa_zoning ran in coa chain (66.0s PASS) — both propagate the morning sources-run scalars | PASS | pipeline_runs both chains |

### Interaction guards [G1][G3][G5]

| Guard | Baseline | After | Delta | Reading |
|---|---|---|---|---|
| `lifecycle_stalled` | 34,465 | 33,877 | **−588** | Exceeds the P3 ≤2-flip projection **but is not the P3-fix flip class**: the permits load refreshed `last_seen_at` for feed-active permits after 12 days between runs; stall = `computeStallFromActivity(daysSinceActivity)` (lifecycle-phase.js:317), so refreshed activity clocks un-stall data-driven. **The G1-guarded consequences read ZERO: `skipped_too_old` = 0, `grace_purged` = 0** — no expired-forecast wave, no grace purge. |
| `skipped_too_old` / `grace_purged` | (visibility rows) | **0 / 0** (+ `skipped_too_old_coa` 0) | none | PASS |
| `calibration_method` distribution | default 1,040,193 (59.7%) of 1,743,244 | default 1,104,197 (**60.3%**) of 1,832,103; exact 93,364→107,755; fallback_all_types 213,906→221,769 | +0.6pt default share | Matches the P1 projection (new site-preparation/overhead-doors rows start uncalibrated; total forecasts +88,859 ≈ +5.1%) |

### Urgency no-regression bounds [RC5]

| Bound | Observed | Verdict |
|---|---|---|
| imminent ∈ [55%, 61%] | **59.2%** (1,084,625) | PASS |
| delayed ∈ [37%, 43%] | **38.1%** (698,579) | PASS |
| expired + on_time = 0 | **0** (absent from distribution; upcoming 2.7%, overdue 59) | PASS |

### Verdict-FAIL diagnoses (both non-blocking, neither a P7 regression)

1. **close_stale_permits FAIL** — `pending_closed_rate` 16.0% (would_close 40,402) tripped the
   `<10%` mass-close abort: the script **refused to close anything** (records_updated = 0,
   fail-safe by design, close-stale-permits.js:109). Cause: dev-DB run cadence — 12 days since
   the last chain run accumulated a stale backlog beyond the abort bound. Honest tripwire;
   requires an operator decision (raise the bound one-off or accept progressive drainage on a
   daily cadence). NOT a defect in this WF's changes.
2. **assert_entity_tracing FAIL** — the failing row is `opportunity_score_coverage_pct` **77.7**
   vs ≥80 — **pre-existing** (77.9 on 06-25, 72.3 on 06-16); structural: opportunity_score is
   NULL where the permit carries no cost (spec 81 §3), and ~41% of permits are cost_source
   'none'. P5's priceable-gap work is the lever. The NEW first-validation row
   (`trade_forecasts_coverage_pct` 89.7 ≥ 85) PASSES.

### Remaining WARNs (all known residuals, cited)
geocode_coverage 91.3% (stable); link_neighbourhoods link_rate 94.8% (documented stable residual);
assert_data_bounds ghost_permits_30d 34,963 + null_status_24h 2 (run-cadence artifacts);
assert_engine_health dead-ratio/seq-scan advisories post-bulk-run; assert_global_coverage
street_name_normalized 85.5% / current_use 88.5% / proposed_use 88.5% / entities.name_normalized
80.3% / opportunity_score 77.9% (all pre-existing coverage postures); compute_phase_calibration
unreliable_buckets (sample-size); assert_lifecycle_phase_distribution = E.4 seq-band posture +
permits `lifecycle_seq` NULL-by-design (seq_unclassified 251,468).

---

## Combined wall-clocks
- coa chain: **9.7 min** (19:53:33 → 20:03:16), 16/16 steps
- permits chain: **46.1 min** (20:08:38 → 20:54:42), 32/32 steps
- strictly sequential, zero lock contention (pre-run check: no live advisory locks; stale
  'running' pipeline_runs rows from March–June killed runs verified as ghosts — no live backends)

## Commits (this phase)
- `6af3d53` chore(42_chain_coa): back up (id, trade_classified_at) before P7 reset NULL-out
- `dda4b3a` fix(50_load_permits): cast revision_num to text (not int) in location backfill
- (this report) docs(41_chain_permits): P7 validation

## Baseline-vs-after diff (baseline = 2026-07-06 report)

| Metric | Baseline (07-06) | After P7 (07-07) |
|---|---|---|
| trade_forecasts total | 1,743,244 | 1,832,103 (+88,859, +5.1%) |
| urgency imminent | 58.3% | 59.2% |
| urgency delayed | 39.9% | 38.1% |
| urgency expired+on_time | 0 | 0 |
| calibration default | 1,040,193 (59.7%) | 1,104,197 (60.3%) |
| calibration exact | 93,364 | 107,755 |
| lifecycle_stalled | 34,465 | 33,877 (−588, activity-refresh-driven; skipped_too_old/grace_purged 0) |
| live-status NULL permits | 544 (+585 sampled) | **0** |
| never-classified permits | 544 | **0** |
| permits.location coverage | 4.3% | **91.2%** (backfill, 219,265 rows) |
| CoA lead_trades (active/inactive) | 937,674 / 0 | 442,532 / **496,725** |
| CoA active trades mean / median | 30.93 / 33 | **14.70 / 16** |
| CoA priced (cost_estimates) | 19,449 | 19,479 (+0.15%) |
| coa_corpus_cost_coverage_pct | (new metric) | 58.4% |
| CoA forecasts | frozen 2026-06-16 | **35,492 fresh** (gate pass_or_warn_accepted) |
| unmapped_trades | 207,538 (3 slugs) | **0** (+ excluded_rows 86,574 site-maintenance) |
