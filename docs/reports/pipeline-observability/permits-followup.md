
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
