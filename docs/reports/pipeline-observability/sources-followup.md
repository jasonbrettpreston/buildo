
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

## sources — 2026-09-26 13:24 UTC  (run_id: 2005)

**Chain status:** completed | **Duration:** 432.3s

### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
| link\_wsib | ✅ PASS | 432.2s | 120244 | no baseline |

### Summary
Chain `sources`/run 2005 completed with a single PASS step (`link_wsib`, 120,244 records), no failed steps and no baseline to compare velocity against. The real story is query performance: two queries consume ~80% of the 432s chain duration and are severe outliers.

### Anomalies & Warnings
- No velocity anomaly detectable — `link_wsib` reports "no baseline" (0 baseline runs), so the >30% drop rule can't be applied. Baseline coverage gap is itself worth flagging.
- **Slow query (CRITICAL-class severity):** trade-name similarity matching query — mean 246,431 ms (246s) over 8 calls, total 1,971s, stddev 44,866 ms. This single query's *total* execution time exceeds the reported chain duration, and its mean is 2,464× the 100 ms threshold. High variance across calls suggests unstable plans / index usage.
- **Slow query:** GeoJSON → geometry ingest — mean 210,774 ms (211s) for 1 call, 495,496 rows. Also ~2,100× threshold; large-row bulk spatial load, no batching evidence.
- **Slow query:** md5 `string_agg` checksum over parcels — mean 20,091 ms (20s), 1 call. 200× threshold; full-table sort/aggregate.
- Secondary offenders (>100 ms, lower risk): 9,280 ms parcel/building link count, 4,968 ms permit-parcel count, 2,788 ms `COUNT(*)` on parcels, 2,230 ms and 2,041 ms ravine-area validation counts, 2,221 ms permit_parcels link count, 2,205 ms permits checksum. `COUNT(*)` at 2.8s indicates table/index bloat or missing index-only scan.
- All failing behavior is performance-side; no data-integrity issues reported (empty `issues` and `failed_sample`).

### Critical Issues — WF3 Prompts
> **WF3** Optimize trade-name similarity match query (246s mean, 8 calls): add expression/GiST or trigram index on `wsib.trade_name_normalized` and `entity.name_normalized`, and cap candidate set before `similarity()`.

> **WF3** Batch the GeoJSON→geometry ingest (211s, 495k rows in one call): load in chunks with `ST_GeomFromGeoJSON` and a geometry index instead of a single unnest join.

> **WF3** Replace the full-table md5 `string_agg` checksum over parcels (20s) with an incremental or ordered-index-backed hash to avoid the full sort.

> **WF3** Investigate 2.8s `SELECT count(*) FROM parcels` and other >2s count queries — likely needs an index-only scan path (VACUUM / covering index).

> **WF3** Restore baseline capture for `link_wsib` so velocity regressions are detectable in future runs.

---
