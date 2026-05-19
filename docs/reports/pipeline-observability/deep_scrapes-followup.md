
## deep_scrapes — 2026-05-08 19:49 UTC  (run_id: 3084)

**Chain status:** failed | **Duration:** 1231.6s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| inspections | ✅ PASS | 1179.8s | 1000 | no baseline |
| classify\_inspection\_status | ✅ PASS | 7.5s | 75 | no baseline |
| assert\_network\_health | ✅ PASS | 0.5s | 0 | no baseline |
| refresh\_snapshot | ✅ PASS | 38.9s | 1 | no baseline |
| assert\_data\_bounds | ⚠️ WARN | 1.3s | 0 | no baseline |
| assert\_engine\_health | ❌ FAIL | 1.8s | 50 | no baseline |
| assert\_staleness | ❌ FAIL | 1.8s | 0 | no baseline |

### Summary
Chain **deep_scrapes** run #3084 **failed** due to severe data quality and engine health failures, plus two WARN violations on data bounds. No baselines exist for any step, so velocity anomaly detection is not possible.

### Anomalies & Warnings
- **assert_data_bounds**: `completed_without_date` = 1 (WARN, should be 0) — possible missing timestamps.
- **assert_data_bounds**: `ancient_dates` = 64 (WARN, threshold ≤5) — large number of very old records.
- **assert_engine_health**: `dead_tuple_pct` = 85.86% (FAIL, threshold <10%) — table bloat critical.
- **assert_engine_health**: `update_insert_ratio` = 66.19 (FAIL, threshold <5.0) — excessive row churn.
- **assert_staleness**: `stale_over_30d` = 6,514 (FAIL, threshold ==0) — massive ingestion or data retention failure.

### Critical Issues — WF3 Prompts
> **WF3** Fix high dead tuple percentage (85.86%) by running VACUUM or tuning autovacuum for the table in `assert_engine_health`.
> **WF3** Investigate `assert_staleness`: 6,514 records older than 30 days indicating a missing or broken data retention / ingestion pipeline.

---
