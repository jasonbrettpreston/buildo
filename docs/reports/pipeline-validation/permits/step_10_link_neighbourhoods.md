# Step 10: link_neighbourhoods
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3306,
    "status": "completed",
    "completed_at": "2026-05-20T20:42:29.261Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:42:25.021Z",
    "duration_ms": "4241"
  },
  {
    "id": 3260,
    "status": "completed",
    "completed_at": "2026-05-20T02:10:25.151Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:10:22.489Z",
    "duration_ms": "2662"
  },
  {
    "id": 3215,
    "status": "completed",
    "completed_at": "2026-05-20T01:46:51.263Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:46:48.021Z",
    "duration_ms": "3242"
  }
]

## Execution
- Command: `node scripts/link-neighbourhoods.js`
- Exit code: 0
- Duration: 3908ms
- New `pipeline_runs.id`: 3306

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3306,"status":"completed","verdict":"WARN","duration_ms":"4241","records_total":2,"records_new":0,"records_updated":2}

### audit_table.rows
```json
[
  {
    "value": 2,
    "metric": "permits_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 158,
    "metric": "neighbourhoods_loaded",
    "status": "PASS",
    "threshold": "== 158"
  },
  {
    "value": 2,
    "metric": "run_linked",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "94.8%",
    "metric": "link_rate",
    "status": "WARN",
    "threshold": ">= 95%"
  },
  {
    "value": 0,
    "metric": "no_neighbourhood_match",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "polygon_tests_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1.25,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1604,
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
        "delta": 0,
        "before": 248092
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 7284458,
        "seq_scan": 664,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5824,
        "n_dead_tup": 346943,
        "n_live_tup": 248813
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 2
      }
    },
    "null_fills": {
      "permits": {
        "neighbourhood_id": {
          "after": 12854,
          "before": 12856,
          "filled": 2
        }
      }
    }
  },
  "duration_ms": 371,
  "pipeline_meta": {
    "reads": {
      "parcels": [
        "id",
        "geometry"
      ],
      "permits": [
        "permit_num",
        "revision_num",
        "latitude",
        "longitude",
        "neighbourhood_id"
      ],
      "neighbourhoods": [
        "id",
        "neighbourhood_id",
        "name",
        "geometry"
      ]
    },
    "writes": {
      "permits": [
        "neighbourhood_id"
      ]
    }
  },
  "no_match_count": 0,
  "permits_linked": 2,
  "permits_processed": 2,
  "polygon_tests_skipped": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-neighbourhoods]","msg":"Loading neighbourhood boundaries..."}
{"level":"INFO","tag":"[link-neighbourhoods]","msg":"Loaded 158 neighbourhoods with geometry"}
{"level":"INFO","tag":"[link-neighbourhoods]","msg":"Permits to link: 457"}
{"level":"INFO","tag":"[link-neighbourhoods]","msg":"Using PostGIS ST_Contains (fast path)"}
{"level":"INFO","tag":"[link-neighbourhoods]","msg":"Linking complete","context":{"permits_processed":336,"permits_linked":336,"no_match":0,"polygon_tests_skipped":0,"duration":"0.6s"}}
PIPELINE_SUMMARY:{"records_total":336,"records_new":0,"records_updated":336,"records_meta":{"duration_ms":620,"permits_processed":336,"permits_linked":336,"no_match_count":0,"polygon_tests_skipped":0,"audit_table":{"phase":8,"name":"Neighbourhood Linking","verdict":"WARN","rows":[{"metric":"permits_processed","value":336,"threshold":null,"status":"INFO"},{"metric":"neighbourhoods_loaded","value":158,"threshold":"== 158","status":"PASS"},{"metric":"run_linked","value":336,"threshold":null,"status":"INFO"},{"metric":"link_rate","value":"94.8%","threshold":">= 95%","status":"WARN"},{"metric":"no_neighbourhood_match","value":0,"threshold":null,"status":"INFO"},{"metric":"polygon_tests_skipped","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":88.47,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":3798,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","latitude","longitude","neighbourhood_id"],"neighbourhoods":["id","neighbourhood_id","name","geometry"],"parcels":["id","geometry"]},"writes":{"permits":["neighbourhood_id"]}}

[link-neighbourhoods] completed in 3.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=3908ms

### C2: PASS
**Evidence:** id=3306 status=completed completed_at=Wed May 20 2026 16:42:29 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 8 audit rows: [permits_processed, neighbourhoods_loaded, run_linked, link_rate, no_neighbourhood_match, polygon_tests_skipped, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 7 records_meta keys: [telemetry, duration_ms, pipeline_meta, no_match_count, permits_linked, permits_processed, polygon_tests_skipped]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=2; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=2 records_new=0 records_updated=2; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=2 records_new=0 records_updated=2
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=2; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=2 records_new=0 records_updated=2; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
