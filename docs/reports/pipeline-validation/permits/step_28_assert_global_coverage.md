# Step 28: assert_global_coverage
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Spec 49 cap

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3164,
    "status": "failed",
    "completed_at": "2026-05-08T22:38:42.906Z",
    "verdict": null,
    "started_at": "2026-05-08T22:38:40.462Z",
    "duration_ms": "2444"
  },
  {
    "id": 3136,
    "status": "failed",
    "completed_at": "2026-05-08T22:04:11.273Z",
    "verdict": null,
    "started_at": "2026-05-08T22:04:08.260Z",
    "duration_ms": "3013"
  },
  {
    "id": 3069,
    "status": "completed",
    "completed_at": "2026-05-08T18:25:19.074Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T18:25:01.161Z",
    "duration_ms": "17913"
  }
]

## Execution
- Command: `node scripts/quality/assert-global-coverage.js`
- Exit code: 1
- Duration: 2158ms
- New `pipeline_runs.id`: 3164

## Post-run state
- Output table counts: {}
- New run: {"id":3164,"status":"failed","verdict":null,"duration_ms":"2444","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
null
```

### records_meta (minus audit_table)
```json
null
```

### stdout tail
```
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Chain mode: permits (full profile)","context":{"pass_pct":90,"warn_pct":70}}

```

### stderr tail
```
    ^

error: column "area_sqm" does not exist
    at C:\Users\User\Buildo\node_modules\pg-pool\index.js:45:11
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async pipeline.withAdvisoryLock.skipEmit (C:\Users\User\Buildo\scripts\quality\assert-global-coverage.js:321:30)
    at async Object.withAdvisoryLock (C:\Users\User\Buildo\scripts\lib\pipeline.js:802:22)
    at async C:\Users\User\Buildo\scripts\quality\assert-global-coverage.js:43:22
    at async Object.run (C:\Users\User\Buildo\scripts\lib\pipeline.js:350:5) {
  length: 109,
  severity: 'ERROR',
  code: '42703',
  detail: undefined,
  hint: undefined,
  position: '587',
  internalPosition: undefined,
  internalQuery: undefined,
  where: undefined,
  schema: undefined,
  table: undefined,
  column: undefined,
  dataType: undefined,
  constraint: undefined,
  file: 'parse_relation.c',
  line: '3827',
  routine: 'errorMissingColumn'
}

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=2158ms

### C2: INVESTIGATE
**Evidence:** id=3164 status=failed completed_at=Fri May 08 2026 18:38:42 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict=null (missing or unexpected)

### C4: INVESTIGATE
**Evidence:** audit_table.rows empty or missing

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: INVESTIGATE
**Evidence:** records_meta empty or audit_table-only

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
