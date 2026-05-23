# Step 02: permits
**Chain:** permits
**Validated:** 2026-05-22
**HEAD commit:** 61abe60
**Risk class:** ledger_writer
**Per-step agent:** Observability
**Final status:** PASS-pending-manual
**Notes:** Phase I.1 ledger writer

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248092},"lifecycle_status_history":{"ok":true,"n":286090}}
- Last 3 runs: [
  {
    "id": 3284,
    "status": "completed",
    "completed_at": "2026-05-20T20:37:51.084Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:36.433Z",
    "duration_ms": "254651"
  },
  {
    "id": 3252,
    "status": "completed",
    "completed_at": "2026-05-20T02:06:41.721Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:04:28.978Z",
    "duration_ms": "132744"
  },
  {
    "id": 3207,
    "status": "completed",
    "completed_at": "2026-05-20T01:42:33.684Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:40:09.351Z",
    "duration_ms": "144333"
  }
]

## Execution
- Command: `node scripts/load-permits.js`
- Exit code: 0
- Duration: 100739ms
- New `pipeline_runs.id`: 3284

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447},"lifecycle_status_history":{"ok":true,"n":287805}}
- New run: {"id":3284,"status":"completed","verdict":"PASS","duration_ms":"254651","records_total":18,"records_new":2,"records_updated":16}

### audit_table.rows
```json
[
  {
    "value": 229206,
    "metric": "records_fetched",
    "status": "PASS",
    "threshold": ">= 200000"
  },
  {
    "value": 229206,
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
    "value": 244,
    "metric": "records_deduplicated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2,
    "metric": "records_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 16,
    "metric": "records_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 229188,
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
    "value": 563,
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
    "value": 109,
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
    "value": 0.07,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 241685,
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
        "after": 248092,
        "delta": 2,
        "before": 248090
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 7054980,
        "seq_scan": 626,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4311,
        "n_dead_tup": 213211,
        "n_live_tup": 281404
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 2,
        "upd": 229222
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
          "after": 16191,
          "before": 16190,
          "filled": -1
        },
        "builder_name": {
          "after": 235518,
          "before": 235516,
          "filled": -2
        },
        "est_const_cost": {
          "after": 113746,
          "before": 113744,
          "filled": -2
        }
      }
    }
  },
  "api_health": {
    "api_errors": 0,
    "avg_req_latency_ms": 563,
    "max_req_latency_ms": 916
  },
  "data_health": {
    "dups_removed": 244,
    "records_mapped": 229206,
    "records_fetched": 229206,
    "records_skipped": 0,
    "schema_mismatch_count": 0
  },
  "duration_ms": 241592,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "status"
      ],
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
      ],
      "lifecycle_status_history": [
        "lead_id",
        "from_status",
        "to_status",
        "transitioned_at",
        "detected_by",
        "permit_type"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[load-permits]","msg":"Deduplicated: removed 243 cross-page duplicate(s)"}
  [load-permits] 10,000 / 229,060 (4.4%) — 43.4s — 231 rows/s
  [load-permits] 20,000 / 229,060 (8.7%) — 46.9s — 426 rows/s
  [load-permits] 30,000 / 229,060 (13.1%) — 49.7s — 603 rows/s
  [load-permits] 40,000 / 229,060 (17.5%) — 52.5s — 762 rows/s
  [load-permits] 50,000 / 229,060 (21.8%) — 55.0s — 909 rows/s
  [load-permits] 60,000 / 229,060 (26.2%) — 58.1s — 1032 rows/s
  [load-permits] 70,000 / 229,060 (30.6%) — 60.4s — 1158 rows/s
  [load-permits] 80,000 / 229,060 (34.9%) — 62.9s — 1272 rows/s
  [load-permits] 90,000 / 229,060 (39.3%) — 65.2s — 1380 rows/s
  [load-permits] 100,000 / 229,060 (43.7%) — 67.5s — 1483 rows/s
  [load-permits] 110,000 / 229,060 (48.0%) — 70.1s — 1570 rows/s
  [load-permits] 120,000 / 229,060 (52.4%) — 72.7s — 1650 rows/s
  [load-permits] 130,000 / 229,060 (56.8%) — 75.5s — 1722 rows/s
  [load-permits] 140,000 / 229,060 (61.1%) — 78.0s — 1796 rows/s
  [load-permits] 150,000 / 229,060 (65.5%) — 80.2s — 1871 rows/s
  [load-permits] 160,000 / 229,060 (69.9%) — 82.5s — 1939 rows/s
  [load-permits] 170,000 / 229,060 (74.2%) — 84.8s — 2004 rows/s
  [load-permits] 180,000 / 229,060 (78.6%) — 87.1s — 2066 rows/s
  [load-permits] 190,000 / 229,060 (82.9%) — 89.6s — 2121 rows/s
  [load-permits] 200,000 / 229,060 (87.3%) — 92.2s — 2169 rows/s
  [load-permits] 210,000 / 229,060 (91.7%) — 95.4s — 2202 rows/s
  [load-permits] 220,000 / 229,060 (96.0%) — 98.1s — 2243 rows/s
{"level":"INFO","tag":"[load-permits]","msg":"Load complete","context":{"processed":229060,"newInserts":355,"updated":1296,"unchanged":227409,"errors":0,"dups_removed":243,"duration":"100.4s","avg_latency":"441ms"}}
PIPELINE_SUMMARY:{"records_total":1651,"records_new":355,"records_updated":1296,"records_meta":{"duration_ms":100437,"api_health":{"api_errors":0,"avg_req_latency_ms":441,"max_req_latency_ms":528},"data_health":{"records_fetched":229060,"records_mapped":229060,"records_skipped":0,"schema_mismatch_count":0,"dups_removed":243},"audit_table":{"phase":2,"name":"Permit Ingestion","verdict":"PASS","rows":[{"metric":"records_fetched","value":229060,"threshold":">= 200000","status":"PASS"},{"metric":"records_mapped","value":229060,"threshold":null,"status":"INFO"},{"metric":"records_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"records_deduplicated","value":243,"threshold":null,"status":"INFO"},{"metric":"records_inserted","value":355,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":1296,"threshold":null,"status":"INFO"},{"metric":"records_unchanged","value":227409,"threshold":null,"status":"INFO"},{"metric":"api_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"avg_latency_ms","value":441,"threshold":null,"status":"INFO"},{"metric":"schema_drift","value":0,"threshold":"== 0","status":"PASS"},{"metric":"lifecycle_status_history_inserted","value":1715,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":16.43,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":100515,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"CKAN API":["PERMIT_NUM","REVISION_NUM","PERMIT_TYPE","STRUCTURE_TYPE","WORK","STREET_NUM","STREET_NAME","STREET_TYPE","STREET_DIRECTION","CITY","POSTAL","GEO_ID","BUILDING_TYPE","CATEGORY","APPLICATION_DATE","ISSUED_DATE","COMPLETED_DATE","STATUS","DESCRIPTION","EST_CONST_COST","BUILDER","OWNER","DWELLING_UNITS_CREATED","DWELLING_UNITS_LOST","WARD","COUNCIL_DISTRICT","CURRENT_USE","PROPOSED_USE","HOUSING_UNITS","STOREYS"],"permits":["permit_num","revision_num","status"]},"writes":{"permits":["permit_num","revision_num","permit_type","structure_type","work","street_num","street_name","street_name_normalized","street_type","street_direction","city","postal","geo_id","building_type","category","application_date","issued_date","completed_date","status","description","est_const_cost","builder_name","owner","dwelling_units_created","dwelling_units_lost","ward","council_district","current_use","proposed_use","housing_units","storeys","data_hash","raw_json"],"lifecycle_status_history":["lead_id","from_status","to_status","transitioned_at","detected_by","permit_type","event_date"]}}
{"level":"INFO","tag":"[load-permits]","msg":"Sync run logged"}

[load-permits] completed in 100.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=100739ms

### C2: PASS
**Evidence:** id=3284 status=completed completed_at=Wed May 20 2026 16:37:51 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 14 audit rows: [records_fetched, records_mapped, records_errors, records_deduplicated, records_inserted, records_updated, records_unchanged, api_errors, avg_latency_ms, schema_drift, lifecycle_status_history_inserted, lifecycle_status_history_errors, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 5 records_meta keys: [telemetry, api_health, data_health, duration_ms, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=18; deltas={"permits":{"pre":248092,"post":248447,"delta":355},"lifecycle_status_history":{"pre":286090,"post":287805,"delta":1715}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=18 records_new=2 records_updated=16; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ledger_writer)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"records_errors","status":"PASS","threshold":"== 0"},{"value":0,"metric":"api_errors","status":"PASS","threshold":"== 0"},{"value":0,"metric":"lifecycle_status_history_errors","status":"PASS","threshold":"== 0"}]
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C6:** grep audit_table push for *_inserted INFO row not gated by if(count>0)
- **C8:** claimed records_new+records_updated=18; deltas={"permits":{"pre":248092,"post":248447,"delta":355},"lifecycle_status_history":{"pre":286090,"post":287805,"delta":1715}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=18 records_new=2 records_updated=16; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Observability agent to run separately and append findings here._
