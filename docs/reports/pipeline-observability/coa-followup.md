
## coa — 2026-04-25 17:21 UTC  (run_id: 2865)

**Chain status:** completed_with_warnings | **Duration:** 61.1s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 1.3s | 0 | 60.0% |
| coa | ✅ PASS | 2.9s | 116 | 19.0% |
| assert\_coa\_freshness | ✅ PASS | 0.7s | 0 | 26.3% |
| link\_coa | ✅ PASS | 3.1s | 7 | 20.3% |
| create\_pre\_permits | ✅ PASS | 0.8s | 147 | 5.4% |
| assert\_pre\_permit\_aging | ⚠️ WARN | 0.5s | 147 | 4.2% |
| refresh\_snapshot | ✅ PASS | 30.6s | 1 | 20.3% |
| assert\_data\_bounds | ✅ PASS | 0.9s | 0 | 45.5% |
| assert\_engine\_health | ✅ PASS | 0.6s | 45 | -90.2% |
| classify\_lifecycle\_phase | ✅ PASS | 11.6s | 5 | -74.3% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 5.4s | 278512 | 14.4% |
| assert\_global\_coverage | ⚠️ WARN | 2.5s | 1 | 22.5% |

### Summary
Chain completed with warnings; no critical data integrity risks detected, but multiple metrics indicate intermittent data quality gaps needing attention.

### Anomalies & Warnings
- **WARN**: `assert_pre_permit_aging` — 119 expired pre-permits (threshold: 0)
- **WARN**: `assert_lifecycle_phase_distribution` — cross-checks low: stalled (8), active inspection (18), permit issued (87)
- **WARN**: `assert_global_coverage` — lifecycle phase coverage 89.9% (187/208)
- **INFO**: `assert_engine_health` duration dropped 90.2% vs baseline — may indicate reduced processing scope, investigate

### Critical Issues — WF3 Prompts
None

---

## coa — 2026-04-25 18:19 UTC  (run_id: 2906)

**Chain status:** completed_with_warnings | **Duration:** 72.4s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.8s | 0 | -9.9% |
| coa | ✅ PASS | 4.1s | 0 | 64.6% |
| assert\_coa\_freshness | ✅ PASS | 0.6s | 0 | -1.1% |
| link\_coa | — — | 0.0s | 0 | -100.0% |
| create\_pre\_permits | — — | 0.0s | 0 | -100.0% |
| assert\_pre\_permit\_aging | ⚠️ WARN | 0.4s | 147 | -24.7% |
| refresh\_snapshot | ✅ PASS | 35.3s | 1 | 36.1% |
| assert\_data\_bounds | ✅ PASS | 1.1s | 0 | 57.5% |
| assert\_engine\_health | ✅ PASS | 11.8s | 45 | 120.0% |
| classify\_lifecycle\_phase | ✅ PASS | 11.0s | 0 | -73.7% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 5.9s | 278512 | 22.5% |
| assert\_global\_coverage | ⚠️ WARN | 1.2s | 1 | -41.4% |

### Summary
Pipeline `coa` completed with warnings; no critical data integrity risks, but one WARN for global coverage just below 90% threshold requires attention.

### Anomalies & Warnings
- **assert_pre_permit_aging**: 119 expired pre-permits (WARN) — operational hygiene risk.
- **classify_lifecycle_phase**: duration dropped -73.7% vs baseline — velocity anomaly (but records_total=0, likely no data to process).
- **assert_lifecycle_phase_distribution**: small but non-zero counts for `cross_check_stalled` (8), `active_inspection` (18), `permit_issued` (87) — all WARN (below 1000/500/500 thresholds).
- **assert_global_coverage**: coverage at 89.9% — just below the 90% WARN threshold, indicates incomplete lifecycle phase classification.

### Critical Issues — WF3 Prompts
> **WF3** Fix `assert_global_coverage` to classify `coa_applications.lifecycle_phase` for the ~10% of records missing coverage, or adjust threshold to match expected coverage floor.

---
