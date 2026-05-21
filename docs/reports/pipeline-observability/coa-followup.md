
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

## coa — 2026-05-20 01:04 UTC  (run_id: 3172)

**Chain status:** failed | **Duration:** 56.7s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.6s | 0 | no baseline |
| coa | ✅ PASS | 3.1s | 0 | no baseline |
| assert\_coa\_freshness | ✅ PASS | 0.4s | 0 | no baseline |
| link\_coa\_to\_parcels | — — | 0.0s | 0 | no baseline |
| classify\_coa\_scope | ✅ PASS | 1.1s | 2610 | no baseline |
| classify\_coa\_trades | ✅ PASS | 3.6s | 2486 | no baseline |
| compute\_coa\_cost\_estimates | ✅ PASS | 3.2s | 2486 | no baseline |
| link\_coa | — — | 0.0s | 0 | no baseline |
| refresh\_snapshot | ✅ PASS | 21.3s | 1 | no baseline |
| assert\_data\_bounds | ✅ PASS | 0.6s | 0 | no baseline |
| assert\_engine\_health | ✅ PASS | 1.2s | 57 | no baseline |
| classify\_lifecycle\_phase | ✅ PASS | 15.7s | 0 | no baseline |
| assert\_lifecycle\_phase\_distribution | ❌ FAIL | 5.9s | 0 | no baseline |

### Summary
Chain `coa` run 3172 failed due to multiple `assert_lifecycle_phase_distribution` FAILs on phase counts, indicating a severe data integrity breach. Additionally, a WARN on dead tuple percentage and several other WARN metrics suggest potential data quality or system health issues.

### Anomalies & Warnings
- **assert_lifecycle_phase_distribution FAIL**: Multiple phase counts (P1, P2, P3, P20) far exceed their thresholds — this is a major data integrity anomaly.
- **assert_engine_health WARN**: Dead tuple percentage at 23.97% (threshold < 10%) — suggests database bloat.
- **assert_lifecycle_phase_distribution WARN**: Sequence unclassified count at 246,903 (threshold <= 5,000) — indicates large volume of unclassified records.
- **Other WARNs** in assert_lifecycle_phase_distribution (e.g., stalled, active inspection, permit issued, seq_bands_warn) — all indicate potential data quality degradation.

### Critical Issues — WF3 Prompts
> **WF3** Investigate and fix `assert_lifecycle_phase_distribution` — phase counts (P1, P2, P3, P20) are orders of magnitude larger than expected thresholds, causing chain failure.

---

## coa — 2026-05-20 01:50 UTC  (run_id: 3219)

**Chain status:** completed_with_warnings | **Duration:** 217.4s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 1.1s | 0 | 88.6% |
| coa | ✅ PASS | 6.2s | 0 | 103.6% |
| assert\_coa\_freshness | ✅ PASS | 0.6s | 0 | 60.8% |
| link\_coa\_to\_parcels | ✅ PASS | 2.6s | 0 | no baseline |
| classify\_coa\_scope | ✅ PASS | 1.8s | 2610 | 68.7% |
| classify\_coa\_trades | ✅ PASS | 6.9s | 2486 | 90.5% |
| compute\_coa\_cost\_estimates | ✅ PASS | 3.3s | 2486 | 4.8% |
| link\_coa | ✅ PASS | 12.6s | 0 | no baseline |
| refresh\_snapshot | ✅ PASS | 25.9s | 1 | 21.6% |
| assert\_data\_bounds | ✅ PASS | 0.7s | 0 | 29.9% |
| assert\_engine\_health | ✅ PASS | 21.5s | 57 | 1701.0% |
| classify\_lifecycle\_phase | ✅ PASS | 122.0s | 229211 | 678.5% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 8.5s | 281196 | no baseline |
| compute\_phase\_calibration | ⚠️ WARN | 1.4s | 119214 | no baseline |
| assert\_global\_coverage | ⚠️ WARN | 1.8s | 1 | no baseline |

### Summary
Chain completed with warnings, but severe lifecycle phase distribution anomalies and widespread missing sequence data indicate a data integrity failure; classify_lifecycle_phase runtime also exploded by 678%.

### Anomalies & Warnings
- **classify_lifecycle_phase** duration explosion (+678.5% vs baseline, 122s) — **HIGH**
- **assert_lifecycle_phase_distribution** 47 WARNs: 30+ lifecycle phases at 0 count (expected hundreds), seq_unclassified_count 246,910 (WARN >5k), and multiple cross-check values below thresholds — **CRITICAL**
- **compute_phase_calibration** 3 WARNs: 7769 CoA type class null transitions, 0 CoA cohort presence (likely indicates E.2/phase D incomplete), 101 unreliable buckets — **HIGH**
- **assert_global_coverage** cost estimates at 76.4% (threshold ≥90%) — **HIGH**
- **assert_engine_health** dead_tuple_pct at 24.01% (threshold <10%) — **HIGH**
- **classify_lifecycle_phase** runtime anomaly (122s vs ~15s baseline) — **HIGH**

### Critical Issues — WF3 Prompts
> **WF3** Fix lifecycle sequence classification pipeline: 30+ lifecycle phases showing 0 count with expected ranges >600, and 246,910 unclassified records indicate sequence mapping or upstream data ingestion failure in classify_lifecycle_phase.

---

## coa — 2026-05-20 20:33 UTC  (run_id: 3281)

**Chain status:** completed_with_warnings | **Duration:** 52.5s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 0.8s | 0 | -7.1% |
| coa | ✅ PASS | 3.4s | 0 | -27.1% |
| assert\_coa\_freshness | ✅ PASS | 0.6s | 0 | 20.3% |
| link\_coa\_to\_parcels | — — | 0.0s | 0 | -100.0% |
| classify\_coa\_scope | ✅ PASS | 0.9s | 2610 | -38.3% |
| classify\_coa\_trades | ✅ PASS | 3.3s | 2486 | -37.1% |
| compute\_coa\_cost\_estimates | ✅ PASS | 3.6s | 2486 | 9.2% |
| link\_coa | — — | 0.0s | 0 | -100.0% |
| refresh\_snapshot | ✅ PASS | 20.6s | 1 | -12.7% |
| assert\_data\_bounds | ✅ PASS | 0.5s | 0 | -17.6% |
| assert\_engine\_health | ✅ PASS | 1.4s | 57 | -87.7% |
| classify\_lifecycle\_phase | ✅ PASS | 5.5s | 0 | -92.0% |
| assert\_lifecycle\_phase\_distribution | ⚠️ WARN | 7.8s | 281196 | -8.4% |
| compute\_phase\_calibration | ⚠️ WARN | 2.2s | 119214 | 59.1% |
| assert\_global\_coverage | ⚠️ WARN | 1.8s | 1 | 0.8% |

### Summary
Chain completed with warnings; many lifecycle phase distribution counts are zero or significantly below thresholds, and data coverage for estimated costs is below target. No velocity anomalies or slow queries detected.

### Anomalies & Warnings
- **assert_lifecycle_phase_distribution**: WARN – 40+ lifecycle sequence counts (e.g., seq_24 to seq_99) are at 0, far below expected ranges; 246,910 records unclassified, and other cross-check metrics are WARN but below FAIL threshold.
- **compute_phase_calibration**: WARN – 7,769 CoA type-class null transitions, 101 unreliable buckets, and zero CoA cohort presence indicate incomplete phase calibration or missing upstream data.
- **assert_global_coverage**: WARN – `coa_applications.estimated_cost` coverage at 76.4% (target ≥90%).
- **assert_engine_health**: WARN – dead tuple percentage at 23.97% (threshold <10%).
- **Failed/FAIL steps**: None.
- **Velocity drops >30%**: None detected (e.g., `classify_coa_scope` -38.3% but not flagged as anomaly per instructions).
- **Slow queries**: None.

### Critical Issues — WF3 Prompts
> **WF3** Fix lifecycle phase distribution logic: many sequence counts are zero and 246,910 records are unclassified, indicating a missing or broken mapping from lifecycle sequences to phases.

---
