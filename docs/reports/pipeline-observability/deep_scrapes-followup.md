
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

## deep_scrapes — 2026-08-01 01:45 UTC  (run_id: 1601)

**Chain status:** completed_with_warnings | **Duration:** 26.8s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| inspections | ✅ PASS | 10.0s | 2 | no baseline |
| classify\_inspection\_status | ✅ PASS | 0.5s | 3 | no baseline |
| assert\_network\_health | ⚠️ WARN | 0.3s | 0 | no baseline |
| refresh\_snapshot | ✅ PASS | 14.5s | 1 | no baseline |
| assert\_data\_bounds | ✅ PASS | 0.4s | 0 | no baseline |
| assert\_engine\_health | ✅ PASS | 0.5s | 89 | no baseline |
| assert\_staleness | ⚠️ WARN | 0.5s | 0 | no baseline |

### Summary
Chain completed with warnings: network latency exceeded threshold and staleness coverage is critically low. Multiple slow queries (>1s) indicate potential performance bottlenecks.

### Anomalies & Warnings
- **assert_network_health**: avg_latency_ms=3640 exceeds 2000ms threshold (WARN) — potential network bottleneck
- **assert_staleness**: coverage_pct=0.1% (threshold ≥10%), max_days_stale=140 days (threshold ≤60), stale_over_30d=59 (WARN) — data freshness severely degraded
- **Slow queries**: 4 queries >1s (9357ms, 1339ms, 1144ms, 1015ms) — performance risk; top query is 9.3s aggregation

### Critical Issues — WF3 Prompts
> **WF3** Fix stale data coverage — coverage_pct dropped to 0.1% (threshold ≥10%), max_days_stale at 140 days; investigate scraper queue fill and refresh_snapshot efficiency.

> **WF3** Optimize slow aggregation query (9.3s) on permits_with_trades — likely missing index on (permit_num, revision_num); add composite index to reduce execution time.

---
