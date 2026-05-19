# Step 02: permits
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ledger_writer
**Per-step agent:** Observability
**Final status:** PASS-pending-manual
**Notes:** Phase I.1 ledger writer

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":247761},"lifecycle_status_history":{"ok":true,"n":2641}}
- Last 3 runs: [
  {
    "id": 3139,
    "status": "completed",
    "completed_at": "2026-05-08T22:23:55.762Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:21:24.774Z",
    "duration_ms": "150987"
  },
  {
    "id": 3111,
    "status": "completed",
    "completed_at": "2026-05-08T21:48:19.174Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:45:44.298Z",
    "duration_ms": "154876"
  },
  {
    "id": 3044,
    "status": "completed",
    "completed_at": "2026-05-08T18:13:19.103Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:10:47.804Z",
    "duration_ms": "151299"
  }
]

## Execution
- Command: `node scripts/load-permits.js`
- Exit code: 0
- Duration: 98801ms
- New `pipeline_runs.id`: 3139

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237},"lifecycle_status_history":{"ok":true,"n":4245}}
- New run: {"id":3139,"status":"completed","verdict":"PASS","duration_ms":"150987","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 229702,
    "metric": "records_fetched",
    "status": "PASS",
    "threshold": ">= 200000"
  },
  {
    "value": 229702,
    "metric": "records_mapped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "records_errors",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 247,
    "metric": "records_deduplicated",
    "status": "INFO",
    "threshold": null
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
    "value": 229702,
    "metric": "records_unchanged",
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
    "value": 519,
    "metric": "avg_latency_ms",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "schema_drift",
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
    "value": 129695,
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
      "permits": {
        "after": 247030,
        "delta": 0,
        "before": 247030
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 12095667,
        "seq_scan": 985,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4146,
        "n_dead_tup": 174371,
        "n_live_tup": 246168
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 229702
      }
    },
    "null_fills": {
      "permits": {
        "description": {
          "after": 410,
          "before": 410,
          "filled": 0
        },
        "issued_date": {
          "after": 16142,
          "before": 16142,
          "filled": 0
        },
        "builder_name": {
          "after": 234532,
          "before": 234532,
          "filled": 0
        },
        "est_const_cost": {
          "after": 113271,
          "before": 113271,
          "filled": 0
        }
      }
    }
  },
  "api_health": {
    "api_errors": 0,
    "avg_req_latency_ms": 519,
    "max_req_latency_ms": 1312
  },
  "data_health": {
    "dups_removed": 247,
    "records_mapped": 229702,
    "records_fetched": 229702,
    "records_skipped": 0,
    "schema_mismatch_count": 0
  },
  "duration_ms": 129585,
  "pipeline_meta": {
    "reads": {
      "CKAN API": [
        "PERMIT_NUM",
        "REVISION_NUM",
        "PERMIT_TYPE",
        "STRUCTURE_TYPE",
        "WORK",
        "STREET_NUM",
        "STREET_NAME",
        "STREET_TYPE",
        "STREET_DIRECTION",
        "CITY",
        "POSTAL",
        "GEO_ID",
        "BUILDING_TYPE",
        "CATEGORY",
        "APPLICATION_DATE",
        "ISSUED_DATE",
        "COMPLETED_DATE",
        "STATUS",
        "DESCRIPTION",
        "EST_CONST_COST",
        "BUILDER",
        "OWNER",
        "DWELLING_UNITS_CREATED",
        "DWELLING_UNITS_LOST",
        "WARD",
        "COUNCIL_DISTRICT",
        "CURRENT_USE",
        "PROPOSED_USE",
        "HOUSING_UNITS",
        "STOREYS"
      ]
    },
    "writes": {
      "permits": [
        "permit_num",
        "revision_num",
        "permit_type",
        "structure_type",
        "work",
        "street_num",
        "street_name",
        "street_name_normalized",
        "street_type",
        "street_direction",
        "city",
        "postal",
        "geo_id",
        "building_type",
        "category",
        "application_date",
        "issued_date",
        "completed_date",
        "status",
        "description",
        "est_const_cost",
        "builder_name",
        "owner",
        "dwelling_units_created",
        "dwelling_units_lost",
        "ward",
        "council_district",
        "current_use",
        "proposed_use",
        "housing_units",
        "storeys",
        "data_hash",
        "raw_json"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[load-permits]","msg":"Deduplicated: removed 244 cross-page duplicate(s)"}
  [load-permits] 10,000 / 229,211 (4.4%) — 28.3s — 354 rows/s
  [load-permits] 20,000 / 229,211 (8.7%) — 31.3s — 639 rows/s
  [load-permits] 30,000 / 229,211 (13.1%) — 33.9s — 884 rows/s
  [load-permits] 40,000 / 229,211 (17.5%) — 36.6s — 1092 rows/s
  [load-permits] 50,000 / 229,211 (21.8%) — 39.2s — 1276 rows/s
  [load-permits] 60,000 / 229,211 (26.2%) — 43.0s — 1396 rows/s
  [load-permits] 70,000 / 229,211 (30.5%) — 46.3s — 1511 rows/s
  [load-permits] 80,000 / 229,211 (34.9%) — 49.4s — 1621 rows/s
  [load-permits] 90,000 / 229,211 (39.3%) — 52.1s — 1728 rows/s
  [load-permits] 100,000 / 229,211 (43.6%) — 54.7s — 1829 rows/s
  [load-permits] 110,000 / 229,211 (48.0%) — 57.5s — 1911 rows/s
  [load-permits] 120,000 / 229,211 (52.4%) — 60.8s — 1974 rows/s
  [load-permits] 130,000 / 229,211 (56.7%) — 63.7s — 2040 rows/s
  [load-permits] 140,000 / 229,211 (61.1%) — 67.2s — 2082 rows/s
  [load-permits] 150,000 / 229,211 (65.4%) — 70.7s — 2123 rows/s
  [load-permits] 160,000 / 229,211 (69.8%) — 73.7s — 2170 rows/s
  [load-permits] 170,000 / 229,211 (74.2%) — 76.8s — 2213 rows/s
  [load-permits] 180,000 / 229,211 (78.5%) — 80.1s — 2246 rows/s
  [load-permits] 190,000 / 229,211 (82.9%) — 83.3s — 2281 rows/s
  [load-permits] 200,000 / 229,211 (87.3%) — 87.7s — 2281 rows/s
  [load-permits] 210,000 / 229,211 (91.6%) — 91.7s — 2289 rows/s
  [load-permits] 220,000 / 229,211 (96.0%) — 95.3s — 2308 rows/s
{"level":"INFO","tag":"[load-permits]","msg":"Load complete","context":{"processed":229211,"newInserts":476,"updated":1040,"unchanged":227695,"errors":0,"dups_removed":244,"duration":"98.5s","avg_latency":"69ms"}}
PIPELINE_SUMMARY:{"records_total":1516,"records_new":476,"records_updated":1040,"records_meta":{"duration_ms":98483,"api_health":{"api_errors":0,"avg_req_latency_ms":69,"max_req_latency_ms":478},"data_health":{"records_fetched":229211,"records_mapped":229211,"records_skipped":0,"schema_mismatch_count":0,"dups_removed":244},"audit_table":{"phase":2,"name":"Permit Ingestion","verdict":"PASS","rows":[{"metric":"records_fetched","value":229211,"threshold":">= 200000","status":"PASS"},{"metric":"records_mapped","value":229211,"threshold":null,"status":"INFO"},{"metric":"records_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"records_deduplicated","value":244,"threshold":null,"status":"INFO"},{"metric":"records_inserted","value":476,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":1040,"threshold":null,"status":"INFO"},{"metric":"records_unchanged","value":227695,"threshold":null,"status":"INFO"},{"metric":"api_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"avg_latency_ms","value":69,"threshold":null,"status":"INFO"},{"metric":"schema_drift","value":0,"threshold":"== 0","status":"PASS"},{"metric":"lifecycle_status_history_inserted","value":1604,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":15.38,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":98570,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"CKAN API":["PERMIT_NUM","REVISION_NUM","PERMIT_TYPE","STRUCTURE_TYPE","WORK","STREET_NUM","STREET_NAME","STREET_TYPE","STREET_DIRECTION","CITY","POSTAL","GEO_ID","BUILDING_TYPE","CATEGORY","APPLICATION_DATE","ISSUED_DATE","COMPLETED_DATE","STATUS","DESCRIPTION","EST_CONST_COST","BUILDER","OWNER","DWELLING_UNITS_CREATED","DWELLING_UNITS_LOST","WARD","COUNCIL_DISTRICT","CURRENT_USE","PROPOSED_USE","HOUSING_UNITS","STOREYS"],"permits":["permit_num","revision_num","status"]},"writes":{"permits":["permit_num","revision_num","permit_type","structure_type","work","street_num","street_name","street_name_normalized","street_type","street_direction","city","postal","geo_id","building_type","category","application_date","issued_date","completed_date","status","description","est_const_cost","builder_name","owner","dwelling_units_created","dwelling_units_lost","ward","council_district","current_use","proposed_use","housing_units","storeys","data_hash","raw_json"],"lifecycle_status_history":["lead_id","from_status","to_status","transitioned_at","detected_by","permit_type"]}}
{"level":"INFO","tag":"[load-permits]","msg":"Sync run logged"}

[load-permits] completed in 98.6s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=98801ms

### C2: PASS
**Evidence:** id=3139 status=completed completed_at=Fri May 08 2026 18:23:55 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 12 audit rows: [records_fetched, records_mapped, records_errors, records_deduplicated, records_inserted, records_updated, records_unchanged, api_errors, avg_latency_ms, schema_drift, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 5 records_meta keys: [telemetry, api_health, data_health, duration_ms, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":247761,"post":248237,"delta":476},"lifecycle_status_history":{"pre":2641,"post":4245,"delta":1604}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ledger_writer)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"records_errors","status":"PASS","threshold":"== 0"},{"value":0,"metric":"api_errors","status":"PASS","threshold":"== 0"}]
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C6:** grep audit_table push for *_inserted INFO row not gated by if(count>0)
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":247761,"post":248237,"delta":476},"lifecycle_status_history":{"pre":2641,"post":4245,"delta":1604}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Observability agent to run separately and append findings here._
