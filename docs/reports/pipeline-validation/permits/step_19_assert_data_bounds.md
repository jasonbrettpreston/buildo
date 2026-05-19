# Step 19: assert_data_bounds
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Phase G permits_pre_permit_count gate

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3156,
    "status": "completed",
    "completed_at": "2026-05-08T22:34:52.198Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T22:34:43.478Z",
    "duration_ms": "8720"
  },
  {
    "id": 3128,
    "status": "completed",
    "completed_at": "2026-05-08T21:57:31.571Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T21:57:19.474Z",
    "duration_ms": "12097"
  },
  {
    "id": 3061,
    "status": "completed",
    "completed_at": "2026-05-08T18:21:04.537Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T18:20:57.179Z",
    "duration_ms": "7359"
  }
]

## Execution
- Command: `node scripts/quality/assert-data-bounds.js`
- Exit code: 1
- Duration: 15691ms
- New `pipeline_runs.id`: 3166

## Post-run state
- Output table counts: {}
- New run: {"id":3166,"status":"failed","verdict":"FAIL","duration_ms":"15362","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "cost_outliers",
    "status": "PASS",
    "threshold": "< 20"
  },
  {
    "value": "0.2%",
    "metric": "null_descriptions_24h",
    "status": "PASS",
    "threshold": "< 5%"
  },
  {
    "value": "94.9%",
    "metric": "null_builders_24h",
    "status": "PASS",
    "threshold": "< 95%"
  },
  {
    "value": 2,
    "metric": "null_status_24h",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "orphaned_permit_trades",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "orphaned_permit_parcels",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "duplicate_pk_groups",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 147,
    "metric": "permits_pre_permit_count",
    "status": "FAIL",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_no_legal_name",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_no_g_class",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_invalid_naics",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_orphaned_links",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 1341,
    "metric": "ghost_permits_30d",
    "status": "WARN",
    "threshold": "== 0"
  }
]
```

### records_meta (minus audit_table)
```json
{
  "errors": [
    "147 Pre-Permits remain after Phase G retirement",
    "147 Pre-Permits remain after Phase G retirement"
  ],
  "warnings": [
    "2 permits with NULL status",
    "3 parcels with lot_size_sqm out of bounds (0-1M sqm)",
    "1 completed_without_date",
    "64 ancient_dates",
    "1341 non-terminal permits not seen in 30+ days (oldest: Sat Apr 11 2026 05:48:09 GMT-0400 (Eastern Daylight Time))"
  ],
  "checks_failed": 2,
  "checks_warned": 5
}
```

### stdout tail
```
  OK: All WSIB NAICS codes are numeric
  OK: No orphaned WSIB entity links

--- Phase 3: Inspection Data Quality (94,645 rows) ---
  PASS: null_permit_num = 0
  PASS: null_stage_name = 0
  PASS: null_status = 0
  PASS: null_scraped_at = 0
  PASS: orphan_inspections = 0
  PASS: invalid_status = 0
  PASS: outstanding_with_date = 0
  WARN: completed_without_date = 1
  PASS: duplicate_stages = 0
  PASS: future_dates = 0
  WARN: ancient_dates = 64
  PASS: date_before_permit_year = 0

--- Cost Estimates Coverage ---
  OK: 245785 cost estimates (10.8% null, 5 distinct tiers)

--- Ghost Records (stale > 30 days) ---
PIPELINE_SUMMARY:{"records_total":0,"records_new":null,"records_updated":null,"records_meta":{"checks_failed":2,"checks_warned":5,"errors":["147 Pre-Permits remain after Phase G retirement","147 Pre-Permits remain after Phase G retirement"],"warnings":["2 permits with NULL status","3 parcels with lot_size_sqm out of bounds (0-1M sqm)","1 completed_without_date","64 ancient_dates","1341 non-terminal permits not seen in 30+ days (oldest: Sat Apr 11 2026 05:48:09 GMT-0400 (Eastern Daylight Time))"],"audit_table":{"phase":15,"name":"Data Quality Checks","verdict":"FAIL","rows":[{"metric":"cost_outliers","value":0,"threshold":"< 20","status":"PASS"},{"metric":"null_descriptions_24h","value":"0.2%","threshold":"< 5%","status":"PASS"},{"metric":"null_builders_24h","value":"94.9%","threshold":"< 95%","status":"PASS"},{"metric":"null_status_24h","value":2,"threshold":"== 0","status":"WARN"},{"metric":"orphaned_permit_trades","value":0,"threshold":"== 0","status":"PASS"},{"metric":"orphaned_permit_parcels","value":0,"threshold":"== 0","status":"PASS"},{"metric":"duplicate_pk_groups","value":0,"threshold":"== 0","status":"PASS"},{"metric":"permits_pre_permit_count","value":147,"threshold":"== 0","status":"FAIL"},{"metric":"wsib_no_legal_name","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_no_g_class","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_invalid_naics","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_orphaned_links","value":0,"threshold":"== 0","status":"PASS"},{"metric":"ghost_permits_30d","value":1341,"threshold":"== 0","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":15470,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["*"],"parcels":["*"],"address_points":["*"],"building_footprints":["*"],"neighbourhoods":["*"],"coa_applications":["*"],"permit_inspections":["*"]},"writes":{"pipeline_runs":["checks_passed","checks_failed","checks_warned"]}}

  Warnings: 5
  Errors: 2

=== Data Bounds: FAILED (15.4s) ===


```

### stderr tail
```
{"level":"WARN","tag":"[assert-data-bounds]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}
  WARN: 1341 ghost permits (non-terminal, unseen 30+ days) — oldest last_seen_at: Sat Apr 11 2026 05:48:09 GMT-0400 (Eastern Daylight Time)
{"level":"ERROR","tag":"[assert-data-bounds]","msg":"Data bounds validation failed","error_type":"unknown","stack":"Error: Data bounds validation failed\n    at C:\\Users\\User\\Buildo\\scripts\\quality\\assert-data-bounds.js:783:24\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async Object.withAdvisoryLock (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:802:22)\n    at async C:\\Users\\User\\Buildo\\scripts\\quality\\assert-data-bounds.js:38:22\n    at async Object.run (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:350:5)","context":{"phase":"fatal"}}
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: Data bounds validation failed
    at C:\Users\User\Buildo\scripts\quality\assert-data-bounds.js:783:24
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async Object.withAdvisoryLock (C:\Users\User\Buildo\scripts\lib\pipeline.js:802:22)
    at async C:\Users\User\Buildo\scripts\quality\assert-data-bounds.js:38:22
    at async Object.run (C:\Users\User\Buildo\scripts\lib\pipeline.js:350:5)

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=15691ms

### C2: INVESTIGATE
**Evidence:** id=3166 status=failed completed_at=Tue May 19 2026 14:24:50 GMT-0400 (Eastern Daylight Time)

### C3: FAIL
**Evidence:** verdict='FAIL'

### C4: PASS
**Evidence:** 13 audit rows: [cost_outliers, null_descriptions_24h, null_builders_24h, null_status_24h, orphaned_permit_trades, orphaned_permit_parcels, duplicate_pk_groups, permits_pre_permit_count, wsib_no_legal_name, wsib_no_g_class, wsib_invalid_naics, wsib_orphaned_links, ghost_permits_30d]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 4 records_meta keys: [errors, warnings, checks_failed, checks_warned]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
