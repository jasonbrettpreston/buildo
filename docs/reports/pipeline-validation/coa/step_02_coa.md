# Step 02: coa
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ledger_writer
**Per-step agent:** Observability
**Final status:** PASS-pending-manual
**Notes:** Phase I.1 ledger writer

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33052},"lifecycle_status_history":{"ok":true,"n":252480}}
- Last 3 runs: [
  {
    "id": 3073,
    "status": "completed",
    "completed_at": "2026-05-08T18:40:57.234Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:40:53.615Z",
    "duration_ms": "3619"
  },
  {
    "id": 3033,
    "status": "completed",
    "completed_at": "2026-05-08T15:59:45.722Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T15:59:42.611Z",
    "duration_ms": "3111"
  },
  {
    "id": 2964,
    "status": "completed",
    "completed_at": "2026-05-07T19:24:58.875Z",
    "verdict": "PASS",
    "started_at": "2026-05-07T19:24:54.972Z",
    "duration_ms": "3903"
  }
]

## Execution
- Command: `node scripts/load-coa.js`
- Exit code: 0
- Duration: 2620ms
- New `pipeline_runs.id`: 3073

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"lifecycle_status_history":{"ok":true,"n":252729}}
- New run: {"id":3073,"status":"completed","verdict":"PASS","duration_ms":"3619","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 2995,
    "metric": "records_fetched",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2889,
    "metric": "records_mapped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 106,
    "metric": "records_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "3.5%",
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
    "value": 340,
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
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3297,
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
        "after": 33052,
        "delta": 0,
        "before": 33052
      }
    },
    "engine": {
      "coa_applications": {
        "idx_scan": 14004,
        "seq_scan": 125,
        "seq_ratio": 0.0088,
        "dead_ratio": 0.0754,
        "n_dead_tup": 2697,
        "n_live_tup": 33052
      }
    },
    "pg_stats": {
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 2888
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
    "avg_req_latency_ms": 340,
    "max_req_latency_ms": 340
  },
  "data_health": {
    "skip_reasons": {
      "missing_app_num": 106
    },
    "max_days_stale": 0,
    "records_mapped": 2889,
    "records_fetched": 2995,
    "records_skipped": 106,
    "records_deduplicated": 2888,
    "schema_mismatch_count": 0
  },
  "duration_ms": 3075,
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
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[load-coa]","msg":"Mode: INCREMENTAL (Active only)"}
{"level":"INFO","tag":"[load-coa]","msg":"Fetching \"Active Applications\"..."}
{"level":"INFO","tag":"[load-coa]","msg":"Active Applications: offset=0, got 2972 (total: 2972)"}
{"level":"INFO","tag":"[load-coa]","msg":"Fetched 2972 raw records from CKAN"}
{"level":"INFO","tag":"[load-coa]","msg":"Sample CKAN fields","context":{"fields":["_id","SYS_ID","APPLICATION_TYPE","IN_DATE","PLANNING_DISTRICT","WARD","STREET_NUM","STREET_NAME","STREET_TYPE","STREET_DIRECTION","POSTAL","REFERENCE_FILE#","SUB_TYPE","WORK_TYPE","ZONING_REVIEW","ZONING_DESIGNATION","COMMUNITY","EMPLOYMENT_DISTRICT","DESCRIPTION","HEARING_DATE","TIME_OF_MEETING","MEETING_LOCATION","C_OF_A_DESCISION","ANYONE_OBJECT_AT_MEETING","APPEAL_EXPIRY_DATE","OMB_ORDER_DATE","OMB_DESCISION","NUMBER_OF_LOTS_CREATED","CONDITION_EXPIRY_DATE","STATUSDESC"]}}
{"level":"INFO","tag":"[load-coa]","msg":"Mapped 2858 valid records (114 skipped)","context":{"skip_reasons":{"missing_app_num":114}}}
{"level":"INFO","tag":"[load-coa]","msg":"Deduplicated: 2857 unique applications"}
  [load-coa] 500 / 2,857 (17.5%) — 1.4s — 370 rows/s
  [load-coa] 1,000 / 2,857 (35.0%) — 1.4s — 708 rows/s
  [load-coa] 1,500 / 2,857 (52.5%) — 1.4s — 1036 rows/s
  [load-coa] 2,000 / 2,857 (70.0%) — 1.5s — 1352 rows/s
  [load-coa] 2,500 / 2,857 (87.5%) — 1.5s — 1666 rows/s
  [load-coa] 2,857 / 2,857 (100.0%) — 1.5s — 1885 rows/s
{"level":"INFO","tag":"[load-coa]","msg":"last_seen_at refreshed for 2857 records"}
{"level":"INFO","tag":"[load-coa]","msg":"Load complete","context":{"inserted":54,"updated":220,"skipped":114,"duration":"2.4s","avg_latency":"382ms"}}
PIPELINE_SUMMARY:{"records_total":274,"records_new":54,"records_updated":220,"records_meta":{"duration_ms":2354,"api_health":{"api_errors":0,"avg_req_latency_ms":382,"max_req_latency_ms":382},"data_health":{"records_fetched":2972,"records_mapped":2858,"records_skipped":114,"skip_reasons":{"missing_app_num":114},"records_deduplicated":2857,"schema_mismatch_count":0,"max_days_stale":0},"audit_table":{"phase":2,"name":"CoA Ingestion","verdict":"PASS","rows":[{"metric":"records_fetched","value":2972,"threshold":null,"status":"INFO"},{"metric":"records_mapped","value":2858,"threshold":null,"status":"INFO"},{"metric":"records_skipped","value":114,"threshold":null,"status":"INFO"},{"metric":"skip_rate","value":"3.8%","threshold":"< 5%","status":"PASS"},{"metric":"records_inserted","value":54,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":220,"threshold":null,"status":"INFO"},{"metric":"api_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"avg_latency_ms","value":382,"threshold":null,"status":"INFO"},{"metric":"schema_mismatch_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"max_days_stale","value":0,"threshold":"< 45","status":"PASS"},{"metric":"lifecycle_status_history_inserted","value":249,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":111.61,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":2455,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"CKAN API":["REFERENCE_FILE#","STREET_NUM","STREET_NAME","WARD","C_OF_A_DESCISION","STATUSDESC","HEARING_DATE","DESCRIPTION","CONTACT_NAME","SUB_TYPE"],"coa_applications":["application_number","status"]},"writes":{"coa_applications":["application_number","address","street_num","street_name","street_name_normalized","ward","status","decision","decision_date","hearing_date","description","applicant","sub_type","data_hash","first_seen_at","last_seen_at"],"lifecycle_status_history":["lead_id","from_status","to_status","decision","decision_date","transitioned_at","detected_by"]}}
{"level":"INFO","tag":"[load-coa]","msg":"Stats: 33106 total | 27289 approved | 32846 linked | 6 upcoming leads"}

[load-coa] completed in 2.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=2620ms

### C2: PASS
**Evidence:** id=3073 status=completed completed_at=Fri May 08 2026 14:40:57 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 12 audit rows: [records_fetched, records_mapped, records_skipped, skip_rate, records_inserted, records_updated, api_errors, avg_latency_ms, schema_mismatch_count, max_days_stale, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 5 records_meta keys: [telemetry, api_health, data_health, duration_ms, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33052,"post":33106,"delta":54},"lifecycle_status_history":{"pre":252480,"post":252729,"delta":249}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ledger_writer)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"api_errors","status":"PASS","threshold":"== 0"}]
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C6:** grep audit_table push for *_inserted INFO row not gated by if(count>0)
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33052,"post":33106,"delta":54},"lifecycle_status_history":{"pre":252480,"post":252729,"delta":249}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Observability agent to run separately and append findings here._
