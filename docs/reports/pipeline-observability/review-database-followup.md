# Pipeline Observability — AI Review Log

Each section below is appended automatically by `scripts/observe-chain.js` after a pipeline chain completes. Entries are timestamped by chain run start time.

For critical issues flagged here, file a WF3 using the prompt provided.

---

## permits — 2026-04-24 19:20 UTC  (run_id: 2733)

**Chain status:** failed | **Duration:** 242.0s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 1.8s | 0 | 117.5% |
| permits | ✅ PASS | 152.2s | 1655 | 25.0% |
| close_stale_permits | ✅ PASS | 13.3s | 623 | 94.6% |
| classify_permit_phase | ✅ PASS | 7.5s | 17 | 57.5% |
| classify_scope | — — | 62.6s | 0 | -43.5% |

### Summary
Chain `permits` run #2733 failed at the `classify_scope` step after 4 minutes. The chain is unhealthy due to a step failure.

### Anomalies & Warnings
- **classify_scope** failed with no records processed; duration dropped 43.5% vs baseline (likely aborted early).
- **close_stale_permits** duration surged 94.6% vs baseline (WARN).
- **classify_permit_phase** duration up 57.5% vs baseline (WARN).

### Critical Issues — WF3 Prompts
> **WF3** classify_scope step failed with no records; investigate for data processing bug or upstream timeout in run #2733.

---

## coa — 2026-04-24 19:23 UTC  (run_id: 2736)

**Chain status:** completed_with_warnings | **Duration:** 305.2s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 0.7s | 0 | -15.6% |
| coa | ✅ PASS | 4.8s | 107 | 127.2% |
| assert_coa_freshness | ✅ PASS | 0.7s | 0 | 31.9% |
| link_coa | ✅ PASS | 3.4s | 20 | 27.7% |
| create_pre_permits | ✅ PASS | 1.5s | 147 | 169.1% |
| assert_pre_permit_aging | ⚠️ WARN | 1.3s | 147 | 218.0% |
| refresh_snapshot | ✅ PASS | 45.7s | 1 | 93.8% |
| assert_data_bounds | ✅ PASS | 0.9s | 0 | 45.5% |
| assert_engine_health | ✅ PASS | 20.1s | 45 | 390.9% |
| classify_lifecycle_phase | ✅ PASS | 218.3s | 230843 | 926.0% |
| assert_lifecycle_phase_distribution | ⚠️ WARN | 6.0s | 278346 | 31.3% |
| assert_global_coverage | ⚠️ WARN | 1.5s | 1 | -30.1% |

### Summary
Pipeline `coa` completed with warnings; severe duration spikes (up to 926%) degrade pipeline speed but do not yet risk data integrity. Key metrics indicate expired pre-permits (119) and lifecycle coverage gaps (89.9%) require attention.

### Anomalies & Warnings
- **assert_pre_permit_aging (WARN):** 119 expired pre-permits exceed threshold of 0; duration anomaly (+218% vs baseline).
- **assert_lifecycle_phase_distribution (WARN):** Cross-check counts (stalled: 8, active_inspection: 18, permit_issued: 86) are well below WARN thresholds — may indicate missing or misclassified records.
- **assert_global_coverage (WARN):** Lifecycle phase coverage at 89.9% (187/208) — below target of 100%.
- Significant duration anomalies in `assert_engine_health` (+390.9%) and `classify_lifecycle_phase` (+926.0%), though no data integrity risk.
- No velocity drops >30% (no step shows duration decrease >30%).

### Critical Issues — WF3 Prompts
> **WF3** Fix `assert_pre_permit_aging` threshold or cleanup expired pre-permits — 119 expired records flagged as WARN (threshold=0).
> **WF3** Improve lifecycle phase coverage — only 89.9% assigned; 21 records missing classification in `coa_applications.lifecycle_phase`.

---

## sources — 2026-04-24 19:29 UTC  (run_id: 2752)

**Chain status:** completed_with_warnings | **Duration:** 668.1s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 1.0s | 0 | -0.7% |
| address_points | ✅ PASS | 28.0s | 0 | -0.4% |
| geocode_permits | ⚠️ WARN | 19.0s | 354 | 96.3% |
| parcels | ✅ PASS | 158.1s | 0 | 122.1% |
| compute_centroids | ✅ PASS | 5.5s | 0 | 126.3% |
| link_parcels | ✅ PASS | 98.4s | 374 | 1310.3% |
| massing | ✅ PASS | 74.9s | 4 | 15.4% |
| link_massing | ✅ PASS | 15.4s | 486530 | 163.4% |
| neighbourhoods | ✅ PASS | 24.4s | 158 | 131.9% |
| link_neighbourhoods | ⚠️ WARN | 14.3s | 364 | 1815.7% |
| load_wsib | ✅ PASS | 0.7s | 0 | 125.6% |
| link_wsib | ✅ PASS | 174.6s | 107162 | 82.7% |
| refresh_snapshot | ✅ PASS | 32.0s | 1 | 119.8% |
| assert_data_bounds | ⚠️ WARN | 6.3s | 0 | 193.7% |
| assert_engine_health | ⚠️ WARN | 15.3s | 45 | 1859.2% |

### Summary
Pipeline completed with warnings: geocode coverage dropped to 91.0% (threshold 95%), link_rate at 94.8%, and multiple steps show extreme duration spikes (up to 1815%) compared to baseline, indicating performance degradation or data volume changes.

### Anomalies & Warnings
- **geocode_coverage**: 91.0% (WARN) — below 95% threshold, data integrity risk for downstream links
- **link_rate**: 94.8% (WARN) — slightly below 95% threshold for neighbourhood links
- **parcel_lot_outliers**: 3 outliers detected (WARN) — may indicate data quality issues
- **high_dead_ratio_tables**: 2 tables with high dead ratio (WARN) — potential vacuum/maintenance need
- **Severe duration increases**: link_neighbourhoods (+1815%), assert_engine_health (+1859%), link_parcels (+1310%) — likely due to increased data volume or slow queries; not a velocity drop but notable performance shift
- No velocity drops >30% vs baseline detected (some steps had insufficient baseline runs for comparison)

### Critical Issues — WF3 Prompts
> **WF3** Fix geocode_coverage dropping to 91%; adjust address matching logic or geocoding service to restore ≥95% coverage and ensure address-to-parcel links are complete.

---

## permits — 2026-04-24 19:51 UTC  (run_id: 2771)

**Chain status:** completed_with_errors | **Duration:** 538.5s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 1.0s | 0 | 18.0% |
| permits | ✅ PASS | 116.2s | 0 | -5.7% |
| close_stale_permits | ❌ FAIL | 3.3s | 0 | -53.5% |
| classify_permit_phase | ✅ PASS | 1.6s | 17 | -66.6% |
| classify_scope | ✅ PASS | 25.6s | 0 | -76.9% |
| builders | — — | 0.0s | 0 | -100.0% |
| link_wsib | — — | 0.0s | 0 | -100.0% |
| geocode_permits | — — | 0.0s | 0 | -100.0% |
| link_parcels | — — | 0.0s | 0 | -100.0% |
| link_neighbourhoods | — — | 0.0s | 0 | -100.0% |
| link_massing | — — | 0.0s | 0 | -100.0% |
| link_similar | — — | 0.0s | 0 | -100.0% |
| classify_permits | ✅ PASS | 207.5s | 230843 | 66.9% |
| compute_cost_estimates | ✅ PASS | 74.1s | 245382 | 53.4% |
| compute_timing_calibration_v2 | ✅ PASS | 3.0s | 131 | 51.1% |
| link_coa | — — | 0.0s | 0 | -100.0% |
| create_pre_permits | — — | 0.0s | 0 | -100.0% |
| refresh_snapshot | ✅ PASS | 31.1s | 1 | 44.8% |
| assert_data_bounds | ⚠️ WARN | 13.7s | 0 | 67.9% |
| assert_engine_health | ⚠️ WARN | 16.1s | 45 | 23.4% |
| classify_lifecycle_phase | ✅ PASS | 10.0s | 0 | -86.3% |
| assert_lifecycle_phase_distribution | ⚠️ WARN | 6.2s | 278346 | 71.5% |
| compute_trade_forecasts | ⚠️ WARN | 3.6s | 29842 | -63.2% |
| compute_opportunity_scores | ✅ PASS | 1.0s | 7976 | 15.8% |
| update_tracked_projects | ✅ PASS | 0.4s | 0 | -12.8% |
| assert_entity_tracing | ✅ PASS | 10.1s | 230843 | 39.3% |
| assert_global_coverage | ⚠️ WARN | 13.4s | 1 | 37.7% |

### Summary
Chain `permits` run 2771 completed with errors; **close_stale_permits** FAILed (94% pending_close_rate) and multiple WARNs indicate data coverage and engine health risks.

### Anomalies & Warnings
- **close_stale_permits**: FAIL — pending_closed_rate 94.0% (threshold <10%); duration dropped -53.5%, likely cause of failure.
- **assert_data_bounds**: WARN — 2 permits with null_status_24h.
- **assert_engine_health**: WARN — 2 tables with high dead ratio.
- **assert_lifecycle_phase_distribution**: WARN — 8 stalled, 18 active_inspection, 86 permit_issued below thresholds.
- **compute_trade_forecasts**: WARN — expired_urgency_pct 32.2% (threshold <30%).
- **assert_global_coverage**: 13 WARNs, notably entities.primary_email at 8.1% coverage, multiple cost_estimates fields ~86.9%.
- **Downtick velocity**: classify_scope (-76.9%), classify_lifecycle_phase (-86.3%) — not critical; runs completed faster.

### Critical Issues — WF3 Prompts
> **WF3** close_stale_permits failing: pending_closed_rate at 94%, threshold is <10% — logic likely reversed or flagging wrong permits.

---

## permits — 2026-04-24 20:30 UTC  (run_id: 2799)

**Chain status:** completed_with_warnings | **Duration:** 939.7s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 1.0s | 0 | 13.9% |
| permits | ✅ PASS | 158.6s | 0 | 27.0% |
| close_stale_permits | ✅ PASS | 15.6s | 0 | 130.9% |
| classify_permit_phase | ✅ PASS | 9.7s | 17 | 104.5% |
| classify_scope | ✅ PASS | 211.7s | 230843 | 90.2% |
| builders | — — | 0.0s | 0 | -100.0% |
| link_wsib | — — | 0.0s | 0 | -100.0% |
| geocode_permits | — — | 0.0s | 0 | -100.0% |
| link_parcels | — — | 0.0s | 0 | -100.0% |
| link_neighbourhoods | — — | 0.0s | 0 | -100.0% |
| link_massing | — — | 0.0s | 0 | -100.0% |
| link_similar | — — | 0.0s | 0 | -100.0% |
| classify_permits | ✅ PASS | 174.1s | 230843 | 35.7% |
| compute_cost_estimates | ✅ PASS | 102.2s | 245382 | 95.4% |
| compute_timing_calibration_v2 | ✅ PASS | 3.3s | 131 | 62.4% |
| link_coa | — — | 0.0s | 0 | -100.0% |
| create_pre_permits | — — | 0.0s | 0 | -100.0% |
| refresh_snapshot | ✅ PASS | 42.9s | 1 | 97.2% |
| assert_data_bounds | ⚠️ WARN | 15.8s | 0 | 87.3% |
| assert_engine_health | ⚠️ WARN | 23.8s | 45 | 79.8% |
| classify_lifecycle_phase | ✅ PASS | 147.1s | 230843 | 112.5% |
| assert_lifecycle_phase_distribution | ⚠️ WARN | 5.6s | 278346 | 48.7% |
| compute_trade_forecasts | ⚠️ WARN | 2.6s | 29852 | -72.1% |
| compute_opportunity_scores | ✅ PASS | 1.4s | 7984 | 61.7% |
| update_tracked_projects | ✅ PASS | 0.3s | 0 | -37.7% |
| assert_entity_tracing | ✅ PASS | 9.8s | 230843 | 30.2% |
| assert_global_coverage | ⚠️ WARN | 13.8s | 1 | 36.1% |

### Summary
Run 2799 completed with warnings; several steps show major duration increases and data quality issues, but no critical data integrity failure detected.

### Anomalies & Warnings
- **close_stale_permits**: Duration +130.9% vs baseline (HIGH)
- **classify_permit_phase**: Duration +104.5% vs baseline (HIGH)
- **classify_scope**: Duration +90.2% vs baseline (HIGH)
- **compute_cost_estimates**: Duration +95.4% vs baseline (HIGH)
- **refresh_snapshot**: Duration +97.2% vs baseline (HIGH)
- **classify_lifecycle_phase**: Duration +112.5% vs baseline (HIGH)
- **assert_data_bounds**: 2 null_status_24h (WARN)
- **assert_engine_health**: 2 high_dead_ratio_tables (WARN)
- **assert_lifecycle_phase_distribution**: Cross-check counts below WARN thresholds (WARN)
- **compute_trade_forecasts**: Expired urgency 32.1% >30% threshold (WARN); Duration -72.1% drop (anomaly but likely due to smaller dataset)
- **assert_global_coverage**: 13 field coverage warnings — notably entities.primary_email at 8.1% (WARN)
- **update_tracked_projects**: Duration -37.7% vs baseline (minor, not actionable)

### Critical Issues — WF3 Prompts
None

---

## permits — 2026-04-25 13:05 UTC  (run_id: 2827)

**Chain status:** failed | **Duration:** 406.1s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert_schema | ✅ PASS | 1.0s | 0 | 12.0% |
| permits | ✅ PASS | 181.3s | 978 | 43.0% |
| close_stale_permits | ✅ PASS | 12.6s | 323 | 76.5% |
| classify_permit_phase | ✅ PASS | 6.5s | 17 | 31.4% |
| classify_scope | ✅ PASS | 203.8s | 230688 | 74.6% |
| builders | — — | 0.6s | 0 | -18.3% |

### Summary
Chain `permits` run 2827 failed at step `builders`; multiple steps show significantly increased durations vs baseline.

### Anomalies & Warnings
- **Step `permits`** duration delta +43.0% — significant slowdown.
- **Step `close_stale_permits`** duration delta +76.5% — severe slowdown.
- **Step `classify_permit_phase`** duration delta +31.4% — moderate slowdown.
- **Step `classify_scope`** duration delta +74.6% — severe slowdown.
- **Step `builders`** failed — cause unknown; requires investigation.

### Critical Issues — WF3 Prompts
> **WF3** Fix `builders` step failure — it processed 0 records and failed after 646ms; diagnose error and ensure data ingestion completes.

---
