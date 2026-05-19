
## sources — 2026-05-08 21:07 UTC  (run_id: 3093)

**Chain status:** completed_with_warnings | **Duration:** 549.0s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| assert\_schema | ✅ PASS | 1.2s | 0 | no baseline |
| address\_points | ✅ PASS | 34.4s | 0 | no baseline |
| geocode\_permits | ⚠️ WARN | 16.3s | 0 | no baseline |
| parcels | ✅ PASS | 96.4s | 0 | no baseline |
| compute\_centroids | ✅ PASS | 4.7s | 0 | no baseline |
| link\_parcels | ✅ PASS | 9.0s | 0 | no baseline |
| massing | ✅ PASS | 107.5s | 4 | no baseline |
| link\_massing | ✅ PASS | 17.0s | 486530 | no baseline |
| neighbourhoods | ✅ PASS | 35.2s | 158 | no baseline |
| link\_neighbourhoods | ⚠️ WARN | 1.6s | 0 | no baseline |
| load\_wsib | ✅ PASS | 0.3s | 0 | no baseline |
| link\_wsib | ✅ PASS | 199.5s | 107140 | no baseline |
| refresh\_snapshot | ✅ PASS | 23.2s | 1 | no baseline |
| assert\_data\_bounds | ⚠️ WARN | 2.3s | 0 | no baseline |
| assert\_engine\_health | ✅ PASS | 0.3s | 50 | no baseline |

### Summary
Sources pipeline completed with warnings: geocode coverage (91.1%) and link rate (94.8%) both below 95% thresholds, plus 3 parcel lot outliers detected. No baseline data available to assess velocity drift.

### Anomalies & Warnings
- **WARN** `geocode_permits`: geocode_coverage 91.1% (threshold ≥ 95%) — data quality gap.
- **WARN** `link_neighbourhoods`: link_rate 94.8% (threshold ≥ 95%) — missing links in neighbourhood data.
- **WARN** `assert_data_bounds`: 3 parcel_lot_outliers (threshold == 0) — spatial boundary anomalies.

### Critical Issues — WF3 Prompts
> **WF3** Raise geocode coverage threshold to ≥95% or fix upstream address geocoding failures causing 91.1% coverage.

> **WF3** Investigate and fix missing neighbourhood links; link_rate at 94.8% is slightly below 95% threshold and may cause data gaps.

> **WF3** Review and correct 3 parcel lot outliers in assert_data_bounds; these exceed the zero-tolerance threshold for spatial data integrity.

---
