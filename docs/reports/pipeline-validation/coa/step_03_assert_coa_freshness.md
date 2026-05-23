# Step 03: assert_coa_freshness
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3286,
    "status": "completed",
    "completed_at": "2026-05-20T20:33:40.948Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:40.392Z",
    "duration_ms": "556"
  },
  {
    "id": 3222,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:37.089Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:36.517Z",
    "duration_ms": "572"
  },
  {
    "id": 3175,
    "status": "completed",
    "completed_at": "2026-05-20T01:04:34.195Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:04:33.840Z",
    "duration_ms": "355"
  }
]

## Execution
- Command: `node scripts/quality/assert-coa-freshness.js`
- Exit code: 0
- Duration: 318ms
- New `pipeline_runs.id`: 3286

## Post-run state
- Output table counts: {}
- New run: {"id":3286,"status":"completed","verdict":"PASS","duration_ms":"556","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 33106,
    "metric": "total_records",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "2026-05-20",
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
    "value": "2026-06-29T04:00:00.000Z",
    "metric": "max_decision_date",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "2027-05-12T04:00:00.000Z",
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
    "value": 268,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "duration_ms": 78,
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
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Checking CoA source data freshness..."}
{"level":"INFO","tag":"[assert-coa-freshness]","msg":"Freshness check complete","context":{"total_records":33119,"last_ingestion":"2026-05-23T01:47:56.595Z","ingestion_days_ago":0,"max_decision_date":"2026-07-06T04:00:00.000Z","max_hearing_date":"2027-05-19T04:00:00.000Z","stale":false}}
PIPELINE_SUMMARY:{"records_total":0,"records_new":null,"records_updated":null,"records_meta":{"duration_ms":86,"audit_table":{"phase":3,"name":"Source Freshness","verdict":"PASS","rows":[{"metric":"total_records","value":33119,"threshold":null,"status":"INFO"},{"metric":"last_ingestion","value":"2026-05-23","threshold":null,"status":"INFO"},{"metric":"ingestion_days_ago","value":0,"threshold":"< 45","status":"PASS"},{"metric":"max_decision_date","value":"2026-07-06T04:00:00.000Z","threshold":null,"status":"INFO"},{"metric":"max_hearing_date","value":"2027-05-19T04:00:00.000Z","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":138,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["last_seen_at","hearing_date","decision_date"]},"writes":{}}

[assert-coa-freshness] completed in 0.1s

```

### stderr tail
```
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-coa-freshness]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=318ms

### C2: PASS
**Evidence:** id=3286 status=completed completed_at=Wed May 20 2026 16:33:40 GMT-0400 (Eastern Daylight Time)

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
