# Step 07: compute_coa_cost_estimates
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** FAIL
**Notes:** §11.10 invariants; geometric-only per Spec 83 §3.A

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106}}
- Last 3 runs: []

## Execution
- Command: `node scripts/compute-coa-cost-estimates.js`
- Exit code: 1
- Duration: 233ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106}}
- New run: {}

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
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Loaded 115 logic variables from control panel"}

```

### stderr tail
```
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}
{"level":"ERROR","tag":"[compute-coa-cost-estimates]","msg":"logicVars validation failed","error_type":"unknown","stack":"Error: logicVars validation failed\n    at validateLogicVars (C:\\Users\\User\\Buildo\\scripts\\lib\\config-loader.js:269:36)\n    at C:\\Users\\User\\Buildo\\scripts\\compute-coa-cost-estimates.js:101:22\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async Object.run (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:350:5)","context":{"errors":["model_range_pct: Invalid input: expected number, received NaN","fallback_range_pct: Invalid input: expected number, received NaN"]}}
{"level":"ERROR","tag":"[compute-coa-cost-estimates]","msg":"logicVars validation failed: model_range_pct: Invalid input: expected number, received NaN; fallback_range_pct: Invalid input: expected number, received NaN","error_type":"unknown","stack":"Error: logicVars validation failed: model_range_pct: Invalid input: expected number, received NaN; fallback_range_pct: Invalid input: expected number, received NaN\n    at C:\\Users\\User\\Buildo\\scripts\\compute-coa-cost-estimates.js:103:11\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async Object.run (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:350:5)","context":{"phase":"fatal"}}
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: logicVars validation failed: model_range_pct: Invalid input: expected number, received NaN; fallback_range_pct: Invalid input: expected number, received NaN
    at C:\Users\User\Buildo\scripts\compute-coa-cost-estimates.js:103:11
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async Object.run (C:\Users\User\Buildo\scripts\lib\pipeline.js:350:5)

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=233ms

### C2: FAIL
**Evidence:** no new pipeline_runs row found

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

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_coa_cost_estimates

### C11: INVESTIGATE
**Evidence:** no pipeline_runs row

### C12: INVESTIGATE
**Evidence:** tripwire(s) INVESTIGATE

## Tripwires (per-risk-class profile: calculation)

- **T1:** INVESTIGATE — undefined
- **T3:** INVESTIGATE — undefined
- **T4:** INVESTIGATE — undefined
- **T5:** INVESTIGATE — undefined
- **T6:** INVESTIGATE — undefined
- **T7:** INVESTIGATE — undefined
- **T8:** INVESTIGATE — undefined
- **T9:** INVESTIGATE — undefined
- **T10:** INVESTIGATE — undefined
- **T11:** INVESTIGATE — undefined
- **T12:** INVESTIGATE — undefined

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_coa_cost_estimates

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
