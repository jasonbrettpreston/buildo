# Step 08: geocode_permits
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** Backlog drainage

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3304,
    "status": "completed",
    "completed_at": "2026-05-20T20:42:14.106Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:42:06.984Z",
    "duration_ms": "7122"
  },
  {
    "id": 3258,
    "status": "completed",
    "completed_at": "2026-05-20T02:10:17.295Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:10:11.455Z",
    "duration_ms": "5840"
  },
  {
    "id": 3213,
    "status": "completed",
    "completed_at": "2026-05-20T01:46:41.485Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:46:32.541Z",
    "duration_ms": "8943"
  }
]

## Execution
- Command: `node scripts/geocode-permits.js`
- Exit code: 0
- Duration: 3593ms
- New `pipeline_runs.id`: 3304

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3304,"status":"completed","verdict":"WARN","duration_ms":"7122","records_total":2,"records_new":0,"records_updated":2}

### audit_table.rows
```json
[
  {
    "value": 248092,
    "metric": "total_permits",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 226145,
    "metric": "already_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2,
    "metric": "newly_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 226147,
    "metric": "total_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "91.2%",
    "metric": "geocode_coverage",
    "status": "WARN",
    "threshold": ">= 95%"
  },
  {
    "value": 7583,
    "metric": "no_geo_id",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "zombies_cleaned",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 14362,
    "metric": "backlog_remaining",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0.66,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3018,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "no_geo_id": 7583,
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
        "idx_scan": 7284447,
        "seq_scan": 650,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5824,
        "n_dead_tup": 346939,
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
        "latitude": {
          "after": 21945,
          "before": 21947,
          "filled": 2
        },
        "longitude": {
          "after": 21945,
          "before": 21947,
          "filled": 2
        }
      }
    }
  },
  "duration_ms": 2941,
  "permits_total": 248092,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "geo_id",
        "latitude",
        "longitude"
      ],
      "address_points": [
        "address_point_id",
        "latitude",
        "longitude"
      ]
    },
    "writes": {
      "permits": [
        "latitude",
        "longitude",
        "geocoded_at"
      ]
    }
  },
  "total_geocoded": 226147,
  "zombies_cleaned": 0,
  "has_geo_id_no_match": 14362
}
```

### stdout tail
```
{"level":"INFO","tag":"[geocode-permits]","msg":"Starting permit geocoding (Address Points lookup)"}
{"level":"INFO","tag":"[geocode-permits]","msg":"Before","context":{"total":248447,"already_geocoded":226147,"has_geo_id":240853,"to_geocode":14706}}
{"level":"INFO","tag":"[geocode-permits]","msg":"Address points loaded: 525,346"}
{"level":"INFO","tag":"[geocode-permits]","msg":"Running bulk UPDATEs (atomic)..."}
{"level":"INFO","tag":"[geocode-permits]","msg":"Geocoding complete","context":{"updated":336,"total_geocoded":226483,"has_geo_id_no_match":14370,"no_geo_id":7594,"duration":"3.3s"}}
PIPELINE_SUMMARY:{"records_total":336,"records_new":0,"records_updated":336,"records_meta":{"duration_ms":3255,"permits_total":248447,"total_geocoded":226483,"has_geo_id_no_match":14370,"no_geo_id":7594,"zombies_cleaned":0,"audit_table":{"phase":6,"name":"Permit Geocoding","verdict":"WARN","rows":[{"metric":"total_permits","value":248447,"threshold":null,"status":"INFO"},{"metric":"already_geocoded","value":226147,"threshold":null,"status":"INFO"},{"metric":"newly_geocoded","value":336,"threshold":null,"status":"INFO"},{"metric":"total_geocoded","value":226483,"threshold":null,"status":"INFO"},{"metric":"geocode_coverage","value":"91.2%","threshold":">= 95%","status":"WARN"},{"metric":"no_geo_id","value":7594,"threshold":null,"status":"INFO"},{"metric":"zombies_cleaned","value":0,"threshold":null,"status":"INFO"},{"metric":"backlog_remaining","value":14370,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":97.28,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":3454,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","geo_id","latitude","longitude"],"address_points":["address_point_id","latitude","longitude"]},"writes":{"permits":["latitude","longitude","geocoded_at"]}}

[geocode-permits] completed in 3.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=3593ms

### C2: PASS
**Evidence:** id=3304 status=completed completed_at=Wed May 20 2026 16:42:14 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 10 audit rows: [total_permits, already_geocoded, newly_geocoded, total_geocoded, geocode_coverage, no_geo_id, zombies_cleaned, backlog_remaining, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 8 records_meta keys: [no_geo_id, telemetry, duration_ms, permits_total, pipeline_meta, total_geocoded, zombies_cleaned, has_geo_id_no_match]

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
