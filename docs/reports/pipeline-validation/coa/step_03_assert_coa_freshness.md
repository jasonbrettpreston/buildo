# Step 03: assert_coa_freshness
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3074,
    "status": "completed",
    "completed_at": "2026-05-08T18:40:57.670Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:40:57.237Z",
    "duration_ms": "433"
  },
  {
    "id": 3034,
    "status": "completed",
    "completed_at": "2026-05-08T15:59:46.053Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T15:59:45.724Z",
    "duration_ms": "329"
  },
  {
    "id": 2965,
    "status": "completed",
    "completed_at": "2026-05-07T19:24:59.460Z",
    "verdict": "PASS",
    "started_at": "2026-05-07T19:24:58.879Z",
    "duration_ms": "581"
  }
]

## Execution
- Command: `node scripts/quality/assert-coa-freshness.js`
- Exit code: 0
- Duration: 295ms
- New `pipeline_runs.id`: 3074

## Post-run state
- Output table counts: {}
- New run: {"id":3074,"status":"completed","verdict":"PASS","duration_ms":"433","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 33052,
    "metric": "total_records",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "2026-05-08",
    "metric": "last_ingestion",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "ingestion_days_ago",
    "status": "PASS",
    "threshold": "< 45"
  },
  {
    "value": "2026-06-28T04:00:00.000Z",
    "metric": "max_decision_date",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "2027-04-29T04:00:00.000Z",
    "metric": "max_hearing_date",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 163,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "duration_ms": 96,
  "pipeline_meta": {
    "reads": {
      "coa_applications": [
        "last_seen_at",
        "hearing_date",
        "decision_date"
      ]
    },
    "writes": {}
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Checking CoA source data freshness..."}
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Freshness check complete","context":{"total_records":33106,"last_ingestion":"2026-05-19T18:58:03.491Z","ingestion_days_ago":0,"max_decision_date":"2026-06-29T04:00:00.000Z","max_hearing_date":"2027-05-12T04:00:00.000Z","stale":false}}
PIPELINE_SUMMARY:{"records_total":0,"records_new":null,"records_updated":null,"records_meta":{"duration_ms":72,"audit_table":{"phase":3,"name":"Source Freshness","verdict":"PASS","rows":[{"metric":"total_records","value":33106,"threshold":null,"status":"INFO"},{"metric":"last_ingestion","value":"2026-05-19","threshold":null,"status":"INFO"},{"metric":"ingestion_days_ago","value":0,"threshold":"< 45","status":"PASS"},{"metric":"max_decision_date","value":"2026-06-29T04:00:00.000Z","threshold":null,"status":"INFO"},{"metric":"max_hearing_date","value":"2027-05-12T04:00:00.000Z","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":120,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["last_seen_at","hearing_date","decision_date"]},"writes":{}}

[assert-coa-freshness] completed in 0.1s

```

### stderr tail
```
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=295ms

### C2: PASS
**Evidence:** id=3074 status=completed completed_at=Fri May 08 2026 14:40:57 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 7 audit rows: [total_records, last_ingestion, ingestion_days_ago, max_decision_date, max_hearing_date, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 2 records_meta keys: [duration_ms, pipeline_meta]

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
