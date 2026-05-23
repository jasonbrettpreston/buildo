# Step 02: coa
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ledger_writer
**Per-step agent:** Observability
**Final status:** PASS-pending-manual
**Notes:** Phase I.1 ledger writer

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"lifecycle_status_history":{"ok":true,"n":289429}}
- Last 3 runs: [
  {
    "id": 3285,
    "status": "completed",
    "completed_at": "2026-05-20T20:33:40.390Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:37.002Z",
    "duration_ms": "3388"
  },
  {
    "id": 3221,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:36.508Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:30.272Z",
    "duration_ms": "6236"
  },
  {
    "id": 3174,
    "status": "completed",
    "completed_at": "2026-05-20T01:04:33.836Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:04:30.774Z",
    "duration_ms": "3063"
  }
]

## Execution
- Command: `node scripts/load-coa.js`
- Exit code: 0
- Duration: 4916ms
- New `pipeline_runs.id`: 3285

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119},"lifecycle_status_history":{"ok":true,"n":289477}}
- New run: {"id":3285,"status":"completed","verdict":"PASS","duration_ms":"3388","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 2972,
    "metric": "records_fetched",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2858,
    "metric": "records_mapped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 114,
    "metric": "records_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "3.8%",
    "metric": "skip_rate",
    "status": "PASS",
    "threshold": "< 5%"
  },
  {
    "value": 0,
    "metric": "records_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "records_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "api_errors",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 399,
    "metric": "avg_latency_ms",
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
    "metric": "max_days_stale",
    "status": "PASS",
    "threshold": "< 45"
  },
  {
    "value": 0,
    "metric": "lifecycle_status_history_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "lifecycle_status_history_errors",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3121,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "telemetry": {
    "counts": {
      "coa_applications": {
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "coa_applications": {
        "idx_scan": 25431,
        "seq_scan": 181,
        "seq_ratio": 0.0071,
        "dead_ratio": 0.0794,
        "n_dead_tup": 2857,
        "n_live_tup": 33106
      }
    },
    "pg_stats": {
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 2857
      }
    },
    "null_fills": {
      "coa_applications": {
        "ward": {
          "after": 3,
          "before": 3,
          "filled": 0
        },
        "address": {
          "after": 3,
          "before": 3,
          "filled": 0
        }
      }
    }
  },
  "api_health": {
    "api_errors": 0,
    "avg_req_latency_ms": 399,
    "max_req_latency_ms": 399
  },
  "data_health": {
    "skip_reasons": {
      "missing_app_num": 114
    },
    "max_days_stale": 0,
    "records_mapped": 2858,
    "records_fetched": 2972,
    "records_skipped": 114,
    "records_deduplicated": 2857,
    "schema_mismatch_count": 0
  },
  "duration_ms": 2909,
  "pipeline_meta": {
    "reads": {
      "CKAN API": [
        "REFERENCE_FILE#",
        "STREET_NUM",
        "STREET_NAME",
        "WARD",
        "C_OF_A_DESCISION",
        "STATUSDESC",
        "HEARING_DATE",
        "DESCRIPTION",
        "CONTACT_NAME",
        "SUB_TYPE"
      ],
      "coa_applications": [
        "application_number",
        "status"
      ]
    },
    "writes": {
      "coa_applications": [
        "application_number",
        "address",
        "street_num",
        "street_name",
        "street_name_normalized",
        "ward",
        "status",
        "decision",
        "decision_date",
        "hearing_date",
        "description",
        "applicant",
        "sub_type",
        "data_hash",
        "first_seen_at",
        "last_seen_at"
      ],
      "lifecycle_status_history": [
        "lead_id",
        "from_status",
        "to_status",
        "decision",
        "decision_date",
        "transitioned_at",
        "detected_by"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[load-coa]","msg":"Mode: INCREMENTAL (Active only)"}
{"level":"INFO","tag":"[load-coa]","msg":"Fetching \"Active Applications\"..."}
{"level":"INFO","tag":"[load-coa]","msg":"Active Applications: offset=0, got 2966 (total: 2966)"}
{"level":"INFO","tag":"[load-coa]","msg":"Fetched 2966 raw records from CKAN"}
{"level":"INFO","tag":"[load-coa]","msg":"Sample CKAN fields","context":{"fields":["_id","SYS_ID","APPLICATION_TYPE","IN_DATE","PLANNING_DISTRICT","WARD","STREET_NUM","STREET_NAME","STREET_TYPE","STREET_DIRECTION","POSTAL","REFERENCE_FILE#","SUB_TYPE","WORK_TYPE","ZONING_REVIEW","ZONING_DESIGNATION","COMMUNITY","EMPLOYMENT_DISTRICT","DESCRIPTION","HEARING_DATE","TIME_OF_MEETING","MEETING_LOCATION","C_OF_A_DESCISION","ANYONE_OBJECT_AT_MEETING","APPEAL_EXPIRY_DATE","OMB_ORDER_DATE","OMB_DESCISION","NUMBER_OF_LOTS_CREATED","CONDITION_EXPIRY_DATE","STATUSDESC"]}}
{"level":"INFO","tag":"[load-coa]","msg":"Mapped 2841 valid records (125 skipped)","context":{"skip_reasons":{"missing_app_num":125}}}
{"level":"INFO","tag":"[load-coa]","msg":"Deduplicated: 2840 unique applications"}
  [load-coa] 500 / 2,840 (17.6%) — 3.0s — 165 rows/s
  [load-coa] 1,000 / 2,840 (35.2%) — 3.1s — 326 rows/s
  [load-coa] 1,500 / 2,840 (52.8%) — 3.1s — 482 rows/s
  [load-coa] 2,000 / 2,840 (70.4%) — 3.1s — 638 rows/s
  [load-coa] 2,500 / 2,840 (88.0%) — 3.2s — 789 rows/s
  [load-coa] 2,840 / 2,840 (100.0%) — 3.2s — 884 rows/s
{"level":"INFO","tag":"[load-coa]","msg":"last_seen_at refreshed for 2840 records"}
{"level":"INFO","tag":"[load-coa]","msg":"Load complete","context":{"inserted":13,"updated":45,"skipped":125,"duration":"4.7s","avg_latency":"441ms"}}
PIPELINE_SUMMARY:{"records_total":58,"records_new":13,"records_updated":45,"records_meta":{"duration_ms":4656,"api_health":{"api_errors":0,"avg_req_latency_ms":441,"max_req_latency_ms":441},"data_health":{"records_fetched":2966,"records_mapped":2841,"records_skipped":125,"skip_reasons":{"missing_app_num":125},"records_deduplicated":2840,"schema_mismatch_count":0,"max_days_stale":0},"audit_table":{"phase":2,"name":"CoA Ingestion","verdict":"PASS","rows":[{"metric":"records_fetched","value":2966,"threshold":null,"status":"INFO"},{"metric":"records_mapped","value":2841,"threshold":null,"status":"INFO"},{"metric":"records_skipped","value":125,"threshold":null,"status":"INFO"},{"metric":"skip_rate","value":"4.2%","threshold":"< 5%","status":"PASS"},{"metric":"records_inserted","value":13,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":45,"threshold":null,"status":"INFO"},{"metric":"api_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"avg_latency_ms","value":441,"threshold":null,"status":"INFO"},{"metric":"schema_mismatch_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"max_days_stale","value":0,"threshold":"< 45","status":"PASS"},{"metric":"lifecycle_status_history_inserted","value":48,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":12.24,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":4737,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"CKAN API":["REFERENCE_FILE#","STREET_NUM","STREET_NAME","WARD","C_OF_A_DESCISION","STATUSDESC","HEARING_DATE","DESCRIPTION","CONTACT_NAME","SUB_TYPE"],"coa_applications":["application_number","status"]},"writes":{"coa_applications":["application_number","address","street_num","street_name","street_name_normalized","ward","status","decision","decision_date","hearing_date","description","applicant","sub_type","data_hash","first_seen_at","last_seen_at"],"lifecycle_status_history":["lead_id","from_status","to_status","decision","decision_date","transitioned_at","detected_by","event_date"]}}
{"level":"INFO","tag":"[load-coa]","msg":"Stats: 33119 total | 27290 approved | 32898 linked | 6 upcoming leads"}

[load-coa] completed in 4.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=4916ms

### C2: PASS
**Evidence:** id=3285 status=completed completed_at=Wed May 20 2026 16:33:40 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 14 audit rows: [records_fetched, records_mapped, records_skipped, skip_rate, records_inserted, records_updated, api_errors, avg_latency_ms, schema_mismatch_count, max_days_stale, lifecycle_status_history_inserted, lifecycle_status_history_errors, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 5 records_meta keys: [telemetry, api_health, data_health, duration_ms, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33119,"delta":13},"lifecycle_status_history":{"pre":289429,"post":289477,"delta":48}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ledger_writer)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"api_errors","status":"PASS","threshold":"== 0"},{"value":0,"metric":"lifecycle_status_history_errors","status":"PASS","threshold":"== 0"}]
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C6:** grep audit_table push for *_inserted INFO row not gated by if(count>0)
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33119,"delta":13},"lifecycle_status_history":{"pre":289429,"post":289477,"delta":48}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Observability agent to run separately and append findings here._
