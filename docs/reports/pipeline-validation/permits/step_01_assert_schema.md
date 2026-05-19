# Step 01: assert_schema
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 5d66bcf
**Risk class:** sanity
**Per-step agent:** none
**Final status:** FAIL
**Notes:** Read-only sanity

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3138,
    "status": "completed",
    "completed_at": "2026-05-08T22:21:24.763Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:21:23.500Z",
    "duration_ms": "1263"
  },
  {
    "id": 3110,
    "status": "completed",
    "completed_at": "2026-05-08T21:45:44.297Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:45:43.292Z",
    "duration_ms": "1004"
  },
  {
    "id": 3043,
    "status": "completed",
    "completed_at": "2026-05-08T18:10:47.802Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:10:47.010Z",
    "duration_ms": "792"
  }
]

## Execution
- Command: `node scripts/quality/assert-schema.js`
- Exit code: 1
- Duration: 1422ms
- New `pipeline_runs.id`: 3165

## Post-run state
- Output table counts: {}
- New run: {"id":3165,"status":"failed","verdict":"PASS","duration_ms":"1226","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 11,
    "metric": "permit_columns_checked",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "schema_mismatch_count",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "api_errors",
    "status": "PASS",
    "threshold": "== 0"
  }
]
```

### records_meta (minus audit_table)
```json
{
  "errors": [
    "Parcels schema drift detected"
  ],
  "checks_failed": 1
}
```

### stdout tail
```

=== CQA Tier 1: Schema Validation ===

  Fetching metadata for Building Permits...
  OK: Building Permits — all 11 expected columns present (32 total)
  OK: Building Permits — EST_CONST_COST type coercion verified
  Fetching metadata for CoA Active...
  OK: CoA Active — all 11 expected columns present (30 total)
  Fetching CSV headers for Address Points...
  OK: Address Points — all 2 expected columns present (38 total)
  Fetching CSV headers for Parcels...
  Checking URL accessibility for 3D Massing...
  OK: 3D Massing — URL accessible (200)
  Fetching GeoJSON properties for Neighbourhoods...
  OK: Neighbourhoods — ID property found (11 total properties)
PIPELINE_SUMMARY:{"records_total":0,"records_new":null,"records_updated":null,"records_meta":{"checks_failed":1,"errors":["Parcels schema drift detected"],"audit_table":{"phase":1,"name":"Schema Validation","verdict":"PASS","rows":[{"metric":"permit_columns_checked","value":11,"threshold":null,"status":"INFO"},{"metric":"schema_mismatch_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"api_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":1313,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"CKAN API":["metadata"]},"writes":{"pipeline_runs":["checks_passed","checks_failed"]}}

=== Schema Validation: FAILED (1.3s) ===


```

### stderr tail
```
  FAIL: Parcels is missing columns: ADDRESS_NUMBER, LINEAR_NAME_FULL, DATE_EFFECTIVE
{"level":"ERROR","tag":"[assert-schema]","msg":"Schema validation failed — schema drift detected","error_type":"unknown","stack":"Error: Schema validation failed — schema drift detected\n    at C:\\Users\\User\\Buildo\\scripts\\quality\\assert-schema.js:426:25\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async Object.withAdvisoryLock (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:802:22)\n    at async C:\\Users\\User\\Buildo\\scripts\\quality\\assert-schema.js:216:22\n    at async Object.run (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:350:5)","context":{"phase":"fatal"}}
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: Schema validation failed — schema drift detected
    at C:\Users\User\Buildo\scripts\quality\assert-schema.js:426:25
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async Object.withAdvisoryLock (C:\Users\User\Buildo\scripts\lib\pipeline.js:802:22)
    at async C:\Users\User\Buildo\scripts\quality\assert-schema.js:216:22
    at async Object.run (C:\Users\User\Buildo\scripts\lib\pipeline.js:350:5)

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=1422ms

### C2: INVESTIGATE
**Evidence:** id=3165 status=failed completed_at=Tue May 19 2026 09:19:32 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 3 audit rows: [permit_columns_checked, schema_mismatch_count, api_errors]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 2 records_meta keys: [errors, checks_failed]

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

## Tripwires (per-risk-class profile: sanity)

- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_No agent for this step per Spec 79 §3a (sanity-class)._ Investigation done inline:

### Investigation: current CKAN Parcels schema (2026-05-19)

Fetched live CSV header from:
`https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/property-boundaries/resource/23d1f792-018f-4069-ac5d-443e932e1b78/download/Property%20Boundaries%20-%204326.csv`

**Current schema (6 columns):**
`_id, PARCELID, FEATURE_TYPE, STATEDAREA, OBJECTID, geometry`

**Removed columns (vs expectations):**
- `ADDRESS_NUMBER` — civic address number
- `LINEAR_NAME_FULL` — street name
- `DATE_EFFECTIVE` — parcel record effective date

**Added columns (not in expectations):**
- `_id` — CKAN row PK
- `OBJECTID` — sequential ID

### Findings — three layered issues

| # | Severity | Finding | Affected files |
|---|---|---|---|
| F1 | HIGH (external) | CKAN's Parcels dataset schema changed; lost 3 address columns | external data source |
| F2 | HIGH (internal) | `assert-schema.js` audit_table.rows omits a `parcels_schema_mismatch_count` row — drift surfaces in `records_meta.errors[]` only, so `audit_table.verdict='PASS'` while script exited 1. Spec 48 §3.6 cascade gap. | `scripts/quality/assert-schema.js` lines 56-58, 426 |
| F3 | MED | `load-parcels.js` lines 431, 432, 461 read `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `DATE_EFFECTIVE` from the CSV — will crash on next sources-chain run | `scripts/load-parcels.js` |

### Proposed corrective actions (for SUMMARY.md execution plan)

- **WF3 #1 (CRIT)** — `assert-schema.js`: add `parcels_schema_mismatch_count` to audit_table.rows; update `EXPECTED_PARCEL_COLUMNS` to the new schema (6 cols); add migration note in commit. Effort: S.
- **WF3 #2 (HIGH)** — `load-parcels.js`: handle removed address columns (either NULL-tolerant or sourced from address_points instead — needs design decision). Effort: M.
- **No immediate impact on permits chain steps 2-28** — `link_parcels` (step 9) reads from local `parcels` table which has prior-ingest data; not blocked by this finding.

### Downstream risk to this validation run
**LOW.** Step 1 is sanity-only with no output tables. Step 2 (load-permits) ingests CKAN's *permits* dataset independently. Step 9 (link_parcels) reads the local `parcels` table (populated by a prior load-parcels run before the schema drift). Per Spec 79 §3 non-stop rule, chain proceeds.
