
## permits — 2026-04-25 16:41 UTC  (run_id: 2834)

**Chain status:** cancelled | **Duration:** 152.3s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.9s | 0 | 1.5% |
| permits | ✅ PASS | 151.2s | 0 | 16.8% |

### Summary
Chain `permits` run 2834 was **cancelled** after 152s, producing 0 records across both steps despite passing schema and permit validation. No baseline velocity comparison is possible because both steps processed zero records.

### Anomalies & Warnings
- **Cancelled chain**: run_id 2834 ended with status `cancelled` rather than `completed` or `failed` — this may hide underlying step failures or manual termination.
- **Zero records ingested**: both `assert_schema` and `permits` steps processed 0 records, which is a sign of missing source data or pipeline blockage; no runtime anomaly can be computed.

### Critical Issues — WF3 Prompts
> **WF3** Investigate why chain `permits` run 2834 was cancelled with zero records ingested; likely upstream source failure or premature termination.

---

## permits — 2026-04-25 16:43 UTC  (run_id: 2837)

**Chain status:** completed_with_errors | **Duration:** 987.4s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.6s | 0 | -34.6% |
| permits | ✅ PASS | 81.2s | 0 | -37.8% |
| close\_stale\_permits | ❌ FAIL | 5.3s | 0 | -28.5% |
| classify\_permit\_phase | ✅ PASS | 6.6s | 17 | 32.0% |
| classify\_scope | ✅ PASS | 188.3s | 230688 | 55.2% |
| builders | — — | 0.0s | 0 | -100.0% |
| link\_wsib | — — | 0.0s | 0 | -100.0% |
| geocode\_permits | — — | 0.0s | 0 | -100.0% |
| link\_parcels | — — | 0.0s | 0 | -100.0% |
| link\_neighbourhoods | — — | 0.0s | 0 | -100.0% |
| link\_massing | — — | 0.0s | 0 | -100.0% |
| link\_similar | — — | 0.0s | 0 | -100.0% |
| classify\_permits | ✅ PASS | 217.7s | 230688 | 68.7% |
| compute\_cost\_estimates | ✅ PASS | 116.8s | 245541 | 117.6% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 3.6s | 131 | 82.6% |
| link\_coa | — — | 0.0s | 0 | -100.0% |
| create\_pre\_permits | — — | 0.0s | 0 | -100.0% |
| refresh\_snapshot | ✅ PASS | 37.4s | 1 | 66.1% |
| assert\_data\_bounds | ⚠️ WARN | 14.3s | 0 | 65.6% |
| assert\_engine\_health | ⚠️ WARN | 22.2s | 45 | 66.0% |
| classify\_lifecycle\_phase | ✅ PASS | 241.9s | 230688 | 240.3% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 8.3s | 278505 | 114.8% |
| compute\_trade\_forecasts | ⚠️ WARN | 6.1s | 29904 | -34.1% |
| compute\_opportunity\_scores | ✅ PASS | 1.5s | 8035 | 61.9% |
| update\_tracked\_projects | ✅ PASS | 0.7s | 0 | 75.9% |
| assert\_entity\_tracing | ✅ PASS | 13.8s | 231007 | 80.3% |
| assert\_global\_coverage | ⚠️ WARN | 20.7s | 1 | 96.6% |

### Summary
Pipeline `completed_with_errors` with a CRITICAL failure in `close_stale_permits` (93.9% pending-closed rate against <10% threshold) and multiple WARNs indicating data coverage and lifecycle distribution issues.

### Anomalies & Warnings
- **close_stale_permits FAIL**: pending_closed_rate 93.9% (threshold <10%) – stalls are not being closed, data integrity risk.
- **assert_data_bounds WARN**: 2 permits with null status in 24h.
- **assert_engine_health WARN**: 2 tables with dead tuple ratio > threshold.
- **assert_lifecycle_phase_distribution WARN**: cross_check_stalled=8, active_inspection=18, permit_issued=87 (all below WARN thresholds).
- **compute_trade_forecasts WARN**: expired_urgency_pct 32.0% (threshold <30%).
- **assert_global_coverage WARN**: 13 fields with coverage between 8.1% and 89.9% (notably `entities.primary_email` at 8.1%).

### Critical Issues — WF3 Prompts
> **WF3** Fix `close_stale_permits` to close pending permits at rate below 10% — currently 93.9% remain open, breaking data integrity.
> **WF3** Investigate and correct 2 null-status permits in last 24h (assert_data_bounds).

---

## permits — 2026-04-25 17:58 UTC  (run_id: 2878)

**Chain status:** completed_with_warnings | **Duration:** 886.4s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.8s | 0 | -12.8% |
| permits | ✅ PASS | 137.3s | 0 | 7.0% |
| close\_stale\_permits | ✅ PASS | 10.0s | 0 | 37.0% |
| classify\_permit\_phase | ✅ PASS | 7.2s | 17 | 41.4% |
| classify\_scope | ✅ PASS | 171.1s | 230688 | 37.3% |
| builders | — — | 0.0s | 0 | -100.0% |
| link\_wsib | — — | 0.0s | 0 | -100.0% |
| geocode\_permits | — — | 0.0s | 0 | -100.0% |
| link\_parcels | — — | 0.0s | 0 | -100.0% |
| link\_neighbourhoods | — — | 0.0s | 0 | -100.0% |
| link\_massing | — — | 0.0s | 0 | -100.0% |
| link\_similar | — — | 0.0s | 0 | -100.0% |
| classify\_permits | ✅ PASS | 235.0s | 230688 | 75.8% |
| compute\_cost\_estimates | ✅ PASS | 94.5s | 245541 | 65.8% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 2.3s | 131 | 9.8% |
| link\_coa | — — | 0.0s | 0 | -100.0% |
| create\_pre\_permits | — — | 0.0s | 0 | -100.0% |
| refresh\_snapshot | ✅ PASS | 29.1s | 1 | 25.0% |
| assert\_data\_bounds | ⚠️ WARN | 9.8s | 0 | 10.0% |
| assert\_engine\_health | ⚠️ WARN | 20.7s | 45 | 49.4% |
| classify\_lifecycle\_phase | ✅ PASS | 114.6s | 230688 | 43.1% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 7.0s | 278512 | 69.9% |
| compute\_trade\_forecasts | ⚠️ WARN | 6.0s | 29907 | -33.5% |
| compute\_opportunity\_scores | ✅ PASS | 1.9s | 8036 | 97.9% |
| update\_tracked\_projects | ✅ PASS | 0.6s | 0 | 30.7% |
| assert\_entity\_tracing | ✅ PASS | 14.9s | 231007 | 85.0% |
| assert\_global\_coverage | ⚠️ WARN | 23.3s | 1 | 103.6% |

### Summary
Pipeline completed with warnings: 4 data-quality steps flagged coverage gaps and lifecycle anomalies, but no hard failures or CRITICAL risks were detected.

### Anomalies & Warnings
- **assert_global_coverage**: 13 WARNs on coverage thresholds for `permits.current_use` (88.2%), `entities.name_normalized` (80.5%), `cost_estimates.*` (86.8%), and others — indicates systemic coverage degradation across multiple steps (HIGH, data quality).
- **assert_lifecycle_phase_distribution**: `cross_check_stalled`=8, `cross_check_active_inspection`=18, `cross_check_permit_issued`=87 — low values may indicate early lifecycle stage or data ingestion lag (HIGH, needs monitoring).
- **assert_engine_health**: 3 tables with high dead tuple ratio — recommend VACUUM (HIGH, performance).
- **assert_data_bounds**: 2 null_status_24h records — minor anomaly (INFO).
- **compute_trade_forecasts**: `expired_urgency_pct`=32% (threshold <30%) — slight over-allocation, and duration dropped -33.5% (anomaly, but not velocity drop >30% relative to baseline context — acceptable).
- **Duration spikes**: Multiple steps with >40% duration increase (classify_permits +75.8%, compute_cost_estimates +65.8%, assert_global_coverage +103.6%) — indicates increased data volume or resource contention, but no FAIL threshold exceeded.
- **Skipped steps**: 7 steps skipped (builders, link_wsib, geocode_permits, etc.) — likely feature flags or downstream dependency, not an anomaly.

### Critical Issues — WF3 Prompts
None

---

## permits — 2026-04-25 20:59 UTC  (run_id: 2919)

**Chain status:** failed | **Duration:** 1464.6s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.9s | 0 | -0.9% |
| permits | ✅ PASS | 266.2s | 0 | 106.9% |
| close\_stale\_permits | ✅ PASS | 16.7s | 0 | 124.4% |
| classify\_permit\_phase | ✅ PASS | 7.6s | 17 | 46.9% |
| classify\_scope | ✅ PASS | 235.3s | 230688 | 85.5% |
| builders | — — | 0.0s | 0 | -100.0% |
| link\_wsib | — — | 0.0s | 0 | -100.0% |
| geocode\_permits | — — | 0.0s | 0 | -100.0% |
| link\_parcels | — — | 0.0s | 0 | -100.0% |
| link\_neighbourhoods | — — | 0.0s | 0 | -100.0% |
| link\_massing | — — | 0.0s | 0 | -100.0% |
| link\_similar | — — | 0.0s | 0 | -100.0% |
| classify\_permits | ✅ PASS | 270.1s | 230688 | 94.6% |
| compute\_cost\_estimates | ✅ PASS | 131.0s | 245541 | 122.6% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 5.1s | 131 | 145.2% |
| link\_coa | — — | 0.0s | 0 | -100.0% |
| create\_pre\_permits | — — | 0.0s | 0 | -100.0% |
| refresh\_snapshot | ✅ PASS | 111.1s | 1 | 371.1% |
| assert\_data\_bounds | ⚠️ WARN | 61.5s | 0 | 587.3% |
| assert\_engine\_health | ⚠️ WARN | 28.7s | 45 | 102.1% |
| classify\_lifecycle\_phase | ✅ PASS | 252.3s | 230688 | 208.4% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 9.1s | 278512 | 113.0% |
| compute\_trade\_forecasts | ⚠️ WARN | 6.8s | 29903 | -23.5% |
| compute\_opportunity\_scores | ✅ PASS | 2.1s | 8031 | 106.9% |
| update\_tracked\_projects | ✅ PASS | 0.6s | 0 | 46.1% |
| assert\_entity\_tracing | ✅ PASS | 18.0s | 231007 | 111.4% |
| assert\_global\_coverage | ⚠️ WARN | 33.3s | 1 | 168.4% |
| backup\_db | — — | 7.5s | 0 | no baseline |

### Summary
Chain failed at `backup_db`. 4 steps issued WARNs covering data coverage, engine health, and lifecycle distribution; no CRITICAL data integrity risks found.

### Anomalies & Warnings
- **`backup_db`** – step **failed** (no baseline). Investigate reason for backup failure.
- **`assert_global_coverage`** – 13 **WARN** thresholds breached (e.g., `permits.current_use` 88.2% vs ≥90%, `entities.primary_email` 8.1% vs ≥10%). Coverage deficits across multiple fields.
- **`assert_lifecycle_phase_distribution`** – 3 **WARN** cross-checks (e.g., `cross_check_stalled`=8, `cross_check_active_inspection`=18, `cross_check_permit_issued`=87).
- **`compute_trade_forecasts`** – `expired_urgency_pct` at **32%** (WARN threshold <30%).
- **`assert_data_bounds`** – `null_status_24h`=2 (WARN).
- **`assert_engine_health`** – `high_dead_ratio_tables`=2 (WARN).
- Several steps show extreme duration increases (e.g., `refresh_snapshot` +371%, `assert_data_bounds` +587%, `link_massing` etc. all skipped). Skipped steps appear conditional — not anomalous.

### Critical Issues — WF3 Prompts
None — no data integrity threats requiring a WF3. All WARNs are high touch-points for monitoring but not critical.

---

## permits — 2026-05-20 01:04 UTC  (run_id: 3169)

**Chain status:** failed | **Duration:** 961.6s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 1.5s | 0 | no baseline |
| permits | ✅ PASS | 232.1s | 0 | no baseline |
| close\_stale\_permits | ✅ PASS | 9.7s | 1707 | no baseline |
| classify\_permit\_phase | ✅ PASS | 6.2s | 17 | no baseline |
| classify\_scope | ✅ PASS | 151.4s | 229211 | no baseline |
| builders | ✅ PASS | 0.7s | 3819 | no baseline |
| link\_wsib | ✅ PASS | 134.1s | 107120 | no baseline |
| geocode\_permits | ⚠️ WARN | 11.9s | 0 | no baseline |
| link\_parcels | ✅ PASS | 7.2s | 0 | no baseline |
| link\_neighbourhoods | ⚠️ WARN | 7.4s | 0 | no baseline |
| link\_massing | ✅ PASS | 6.7s | 5336 | no baseline |
| link\_similar | ✅ PASS | 13.1s | 5470 | no baseline |
| classify\_permits | ✅ PASS | 263.4s | 229211 | no baseline |
| backfill\_realtor\_permit\_trades | ✅ PASS | 5.8s | 68580 | no baseline |
| compute\_cost\_estimates | ⚠️ WARN | 47.7s | 248090 | no baseline |
| compute\_timing\_calibration\_v2 | ✅ PASS | 1.9s | 130 | no baseline |
| link\_coa | ✅ PASS | 9.5s | 52 | no baseline |
| refresh\_snapshot | ✅ PASS | 23.6s | 1 | no baseline |
| assert\_data\_bounds | ⚠️ WARN | 8.1s | 0 | no baseline |
| assert\_engine\_health | ⚠️ WARN | 18.6s | 57 | no baseline |
| classify\_lifecycle\_phase | — — | 0.6s | 0 | no baseline |

### Summary
Chain `permits` failed on step `classify_lifecycle_phase`. Multiple data quality warnings detected, including low geocode coverage, failed cost estimates, and stale engine health issues.

### Anomalies & Warnings
- **geocode_coverage** at 91.2% (threshold: ≥95%) — **HIGH**
- **link_rate** at 94.8% (threshold: ≥95%) — **HIGH**
- **failed_rows** (248,090) and **failed_batches** (57) in `compute_cost_estimates` — **HIGH**
- **null_status_24h** = 2 detected — **HIGH**
- **high_dead_ratio_tables** = 3 detected — **HIGH**
- **classify_lifecycle_phase** step failed with duration 570ms — **CRITICAL**

### Critical Issues — WF3 Prompts
> **WF3** Fix `classify_lifecycle_phase` step failure — investigate crash and ensure phase classification completes without error on all permit records.

---

## permits — 2026-05-20 01:40 UTC  (run_id: 3205)

**Chain status:** failed | **Duration:** 898.9s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 1.6s | 0 | 4.9% |
| permits | ✅ PASS | 144.3s | 0 | -37.8% |
| close\_stale\_permits | ✅ PASS | 5.1s | 0 | -47.2% |
| classify\_permit\_phase | ✅ PASS | 2.0s | 17 | -66.8% |
| classify\_scope | ✅ PASS | 123.4s | 229211 | -18.5% |
| builders | ✅ PASS | 0.7s | 3819 | 0.8% |
| link\_wsib | ✅ PASS | 107.5s | 107120 | -19.8% |
| geocode\_permits | ⚠️ WARN | 8.9s | 0 | -25.1% |
| link\_parcels | ✅ PASS | 6.5s | 0 | -8.9% |
| link\_neighbourhoods | ⚠️ WARN | 3.2s | 0 | -56.2% |
| link\_massing | ✅ PASS | 5.2s | 5336 | -22.9% |
| link\_similar | ✅ PASS | 8.4s | 5422 | -36.0% |
| classify\_permits | ✅ PASS | 215.4s | 229211 | -18.2% |
| backfill\_realtor\_permit\_trades | ✅ PASS | 6.4s | 68580 | 10.4% |
| compute\_cost\_estimates | ⚠️ WARN | 56.4s | 248090 | 18.3% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 3.5s | 131 | 80.5% |
| link\_coa | ✅ PASS | 9.9s | 0 | 4.3% |
| refresh\_snapshot | ✅ PASS | 24.3s | 1 | 3.2% |
| assert\_data\_bounds | ⚠️ WARN | 10.9s | 0 | 34.3% |
| assert\_engine\_health | ⚠️ WARN | 6.1s | 57 | -67.2% |
| classify\_lifecycle\_phase | — UNKNOWN | 4.8s | 0 | no baseline |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 7.4s | 281196 | no baseline |
| compute\_phase\_calibration | ⚠️ WARN | 2.4s | 119214 | no baseline |
| compute\_trade\_forecasts | ⚠️ WARN | 92.7s | 801420 | no baseline |
| compute\_opportunity\_scores | ⚠️ WARN | 25.1s | 617146 | no baseline |
| update\_tracked\_projects | ✅ PASS | 0.5s | 0 | no baseline |
| assert\_entity\_tracing | ✅ PASS | 13.0s | 229211 | no baseline |
| assert\_global\_coverage | — — | 2.6s | 0 | no baseline |

### Summary
Pipeline run #3205 for "permits" chain **failed** at `assert_global_coverage` step; numerous WARNs indicate severe data quality and lifecycle distribution shifts, with many lifecycle sequence counts at zero and critical coverage/linkage issues.

### Anomalies & Warnings
- **Pipeline failed** at final `assert_global_coverage` step — root cause unknown but likely due to preceding failures.
- **geocode_coverage** 91.2% (WARN, threshold ≥95%) — data quality risk.
- **link_rate** 94.8% (WARN, threshold ≥95%) — link rate just under threshold.
- **compute_cost_estimates**: **248,090 failed rows** and **57 failed batches** (WARN, threshold ==0) — performance/accuracy risk.
- **null_status_24h**: 2 permits with null status (WARN, threshold ==0).
- **assert_engine_health**: 1 table with high dead ratio (WARN, threshold ==0).
- **Lifecycle distribution**: 47 metrics out of expected range, including many sequence counts at **zero** (e.g., seq_24, 25, 26, 27, 29, 31,...) — likely indicates data processing gap or source change.
- **coa_cohort_presence** = 0 (WARN) — CoA association step may have not run or is broken.
- **permit_orphaned_cost_count** = 4597 (WARN) — orphaned cost records.
- **lead_analytics_unmatched_permit_count** = 50 (WARN) — unmatched lead-permit records.
- **seq_bands_warn** = 89 — excessive unclassified lifecycle bands.
- **seq_unclassified_count** = 246,910 — vast majority of permits unclassified.
- **compute_trade_forecasts** blocked by `coa_audit_gate_status` (WARN) — upstream dependency failure cascade.
- **Velocity drops >30%**: `permits` (-37.8%), `close_stale_permits` (-47.2%), `classify_permit_phase` (-66.8%), `link_neighbourhoods` (-56.2%), `link_similar` (-36.0%), `assert_engine_health` (-67.2%) — all with only 1 baseline run, so less reliable but still notable.

### Critical Issues — WF3 Prompts
> **WF3** Investigate source data ingestion for lifecycle phase — zero counts across sequences 24–108 indicate possible missing permit records or processing failure; block pipeline until verified.
> **WF3** Fix coa_cohort_presence zero — CoA association step may be failing silently, causing cascaded WARNs in trade forecasts, opportunity scores, and orphan cost counts.
> **WF3** Resolve 248,090 failed rows and 57 failed batches in compute_cost_estimates — likely upstream data issue or estimator logic error causing performance degradation.
> **WF3** Investigate assert_global_coverage step failure — check logs for error; this is a gate that should not fail unless preceding step(s) produced invalid data.

---

## permits — 2026-05-20 02:04 UTC  (run_id: 3250)

**Chain status:** completed_with_warnings | **Duration:** 795.2s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.7s | 0 | -56.7% |
| permits | ✅ PASS | 132.7s | 0 | -29.5% |
| close\_stale\_permits | ✅ PASS | 3.0s | 0 | -59.0% |
| classify\_permit\_phase | ✅ PASS | 3.3s | 17 | -18.7% |
| classify\_scope | ✅ PASS | 102.1s | 229211 | -25.7% |
| builders | ✅ PASS | 0.7s | 3819 | -2.8% |
| link\_wsib | ✅ PASS | 100.6s | 107120 | -16.7% |
| geocode\_permits | ⚠️ WARN | 5.8s | 0 | -44.1% |
| link\_parcels | ✅ PASS | 5.2s | 0 | -24.2% |
| link\_neighbourhoods | ⚠️ WARN | 2.7s | 0 | -50.0% |
| link\_massing | ✅ PASS | 2.4s | 5336 | -59.3% |
| link\_similar | ✅ PASS | 7.4s | 5264 | -31.0% |
| classify\_permits | ✅ PASS | 177.3s | 229211 | -25.9% |
| backfill\_realtor\_permit\_trades | ✅ PASS | 3.4s | 68580 | -45.0% |
| compute\_cost\_estimates | ⚠️ WARN | 28.1s | 248090 | -46.1% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 1.4s | 130 | -48.8% |
| link\_coa | ✅ PASS | 6.1s | 0 | -37.1% |
| refresh\_snapshot | ✅ PASS | 16.9s | 1 | -29.4% |
| assert\_data\_bounds | ⚠️ WARN | 6.5s | 0 | -30.9% |
| assert\_engine\_health | ⚠️ WARN | 14.5s | 57 | 16.9% |
| classify\_lifecycle\_phase | ✅ PASS | 73.2s | 229211 | 1434.5% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 4.5s | 281196 | -38.4% |
| compute\_phase\_calibration | ⚠️ WARN | 2.0s | 119214 | -14.3% |
| compute\_trade\_forecasts | ⚠️ WARN | 51.0s | 801420 | -45.0% |
| compute\_opportunity\_scores | ⚠️ WARN | 19.1s | 617146 | -23.8% |
| update\_tracked\_projects | ✅ PASS | 0.3s | 0 | -29.9% |
| assert\_entity\_tracing | ✅ PASS | 7.5s | 229211 | -42.0% |
| assert\_global\_coverage | ⚠️ WARN | 13.0s | 1 | no baseline |
| backup\_db | — UNKNOWN | 3.5s | 0 | no baseline |

### Summary
Chain completed with warnings across multiple data quality and lifecycle distribution metrics. No velocity anomalies or slow queries detected, but several data completeness and integrity issues require attention.

### Anomalies & Warnings
- **geocode_permits**: Geocode coverage at 91.2% (threshold ≥95%) — data completeness gap
- **link_neighbourhoods**: Link rate at 94.8% (threshold ≥95%) — marginal linkage failure
- **compute_cost_estimates**: 248,090 failed rows and 57 failed batches — cost estimation broken
- **assert_data_bounds**: 2 records with null status in the last 24h — data integrity issue
- **assert_engine_health**: 4 tables with high dead tuple ratio — performance risk
- **assert_lifecycle_phase_distribution**: 30+ lifecycle sequence counts at zero or out of bounds — likely data pipeline gap or source change
- **compute_phase_calibration**: 101 unreliable buckets, 0 CoA cohort presence, 7,769 null CoA type transitions — CoA data pipeline not running or incomplete
- **compute_trade_forecasts**: Blocked by CoA audit gate WARN — forecast outputs stale
- **compute_opportunity_scores**: 0 CoA rows, 4,597 orphaned costs, 50 unmatched leads — CoA integration failed
- **assert_global_coverage**: current_use (88.3%), proposed_use (88.3%), name_normalized (80.4%), primary_email (8%) below thresholds — data quality degradation in multiple source columns

### Critical Issues — WF3 Prompts
> **WF3** Fix CoA data pipeline: 0 CoA rows in compute_opportunity_scores and compute_phase_calibration, blocking trade_forecasts via audit gate; investigate ETL step for CoA ingestion failure
> **WF3** Fix lifecycle phase classifier: 30+ lifecycle sequence counts at zero (e.g., sequences 24-27, 29, 31-33, 36, 38-46, 49, 57, 59-64, 72-73, 89-90, 92, 97-99, 101-108) — possible mapping/taxonomy change or source data shift
> **WF3** Fix compute_cost_estimates: 248,090 failed rows and 57 failed batches indicate a processing bug in cost estimation logic

---

## permits — 2026-05-20 20:33 UTC  (run_id: 3280)

**Chain status:** completed_with_warnings | **Duration:** 1087.2s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | — UNKNOWN | 0.2s | 0 | -84.9% |
| permits | ✅ PASS | 254.6s | 18 | 50.1% |
| close\_stale\_permits | ✅ PASS | 9.5s | 8 | 59.6% |
| classify\_permit\_phase | ✅ PASS | 6.3s | 17 | 62.4% |
| classify\_scope | ✅ PASS | 139.6s | 229206 | 11.1% |
| builders | ✅ PASS | 0.6s | 3819 | -11.8% |
| link\_wsib | ✅ PASS | 99.8s | 107120 | -12.5% |
| geocode\_permits | ⚠️ WARN | 7.1s | 2 | -20.0% |
| link\_parcels | ✅ PASS | 10.9s | 2 | 73.0% |
| link\_neighbourhoods | ⚠️ WARN | 4.2s | 2 | -4.3% |
| link\_massing | ✅ PASS | 4.4s | 5336 | -6.8% |
| link\_similar | ✅ PASS | 7.8s | 5393 | -18.7% |
| classify\_permits | ✅ PASS | 238.8s | 229206 | 9.2% |
| backfill\_realtor\_permit\_trades | ✅ PASS | 3.5s | 68580 | -33.4% |
| compute\_cost\_estimates | ⚠️ WARN | 46.2s | 248092 | 4.9% |
| compute\_timing\_calibration\_v2 | ✅ PASS | 1.7s | 131 | -24.7% |
| link\_coa | ✅ PASS | 7.8s | 0 | -8.8% |
| refresh\_snapshot | ✅ PASS | 18.9s | 1 | -12.7% |
| assert\_data\_bounds | ⚠️ WARN | 7.8s | 0 | -7.6% |
| assert\_engine\_health | ⚠️ WARN | 15.8s | 57 | 20.8% |
| classify\_lifecycle\_phase | ✅ PASS | 88.0s | 229206 | 125.7% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 7.0s | 281198 | 17.3% |
| compute\_phase\_calibration | ⚠️ WARN | 1.5s | 119225 | -29.7% |
| compute\_trade\_forecasts | ⚠️ WARN | 60.2s | 801235 | -16.2% |
| compute\_opportunity\_scores | ⚠️ WARN | 18.1s | 617001 | -18.0% |
| update\_tracked\_projects | ✅ PASS | 0.3s | 0 | -16.8% |
| assert\_entity\_tracing | ✅ PASS | 9.8s | 229213 | -4.8% |
| assert\_global\_coverage | ⚠️ WARN | 12.8s | 1 | -1.8% |
| backup\_db | — UNKNOWN | 3.5s | 0 | 0.3% |

### Summary
Pipeline permits run #3280 completed with warnings: 7 steps raised alerts, primarily driven by lifecycle distribution failures and compute-step issues indicating data missing for large portions of the permit lifecycle.

### Anomalies & Warnings
- **assert_lifecycle_phase_distribution**: 40+ lifecycle sequence counts at 0 or far below thresholds (e.g., seq_59-64, seq_72-73, seq_99-108, etc.) — **HIGH** — indicates data ingestion or classification failure for entire lifecycle phases.
- **compute_cost_estimates**: 248,092 rows and 57 batches failed — **HIGH** — cost estimation is breaking on a large scale.
- **compute_opportunity_scores**: 0 total_rows_coa, 4,597 orphaned cost records, 50 unmatched lead analytics permits — **HIGH** — CoA data missing entirely.
- **compute_phase_calibration**: 101 unreliable buckets; coa_cohort_presence = 0 — **HIGH** — calibration hinges on absent CoA data.
- **compute_trade_forecasts**: blocked_by_warn (CoA audit gate) — **HIGH** — cascading block.
- **geocode_permits**: 91.2% coverage (threshold 95%) — **INFO** (single-step issue).
- **link_neighbourhoods**: 94.8% link rate (threshold 95%) — **INFO**.
- **assert_data_bounds**: 2 null_status_24h records — **INFO**.
- **assert_engine_health**: 3 high dead_ratio tables — **INFO** (infra hygiene).
- **assert_global_coverage**: 88.3% coverage on permit uses, 80.4% on builder names, 8% on email — **HIGH** — multiple coverage gaps.
- **classify_lifecycle_phase** duration +125.7% vs baseline — **INFO** (likely processing more data, baseline only 2 runs).

### Critical Issues — WF3 Prompts
> **WF3** Fix lifecycle phase classification or permit import so that later sequences (seq_24-108, seq_59-73, etc.) are populated with non-zero counts.
> **WF3** Fix compute_cost_estimates to reduce failed rows (248,092/248,092 = 100% failure) — likely schema mismatch or missing input data.
> **WF3** Fix CoA ingestion or linkage pipeline to populate `total_rows_coa` and reduce orphaned cost records (4,597) and unmatched permit counts (50).

---
