# Step 08: geocode_permits
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** Backlog drainage

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- Last 3 runs: [
  {
    "id": 3145,
    "status": "completed",
    "completed_at": "2026-05-08T22:29:09.192Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T22:28:56.199Z",
    "duration_ms": "12993"
  },
  {
    "id": 3117,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.007Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.007Z",
    "duration_ms": "0"
  },
  {
    "id": 3050,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.925Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.925Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/geocode-permits.js`
- Exit code: 0
- Duration: 4300ms
- New `pipeline_runs.id`: 3145

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3145,"status":"completed","verdict":"WARN","duration_ms":"12993","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 247030,
    "metric": "total_permits",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 224999,
    "metric": "already_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "newly_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 224999,
    "metric": "total_geocoded",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "91.1%",
    "metric": "geocode_coverage",
    "status": "WARN",
    "threshold": ">= 95%"
  },
  {
    "value": 7715,
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
    "value": 14316,
    "metric": "backlog_remaining",
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
    "value": 5197,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "no_geo_id": 7715,
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
        "idx_scan": 12325629,
        "seq_scan": 1007,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.565,
        "n_dead_tup": 321700,
        "n_live_tup": 247703
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {
      "permits": {
        "latitude": {
          "after": 22031,
          "before": 22031,
          "filled": 0
        },
        "longitude": {
          "after": 22031,
          "before": 22031,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 4695,
  "permits_total": 247030,
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
  "total_geocoded": 224999,
  "zombies_cleaned": 0,
  "has_geo_id_no_match": 14316
}
```

### stdout tail
```
{"level":"INFO","tag":"[geocode-permits]","msg":"Starting permit geocoding (Address Points lookup)"}
{"level":"INFO","tag":"[geocode-permits]","msg":"Before","context":{"total":248237,"already_geocoded":224999,"has_geo_id":240507,"to_geocode":15508}}
{"level":"INFO","tag":"[geocode-permits]","msg":"Address points loaded: 525,346"}
{"level":"INFO","tag":"[geocode-permits]","msg":"Running bulk UPDATEs (atomic)..."}
{"level":"INFO","tag":"[geocode-permits]","msg":"Geocoding complete","context":{"updated":1148,"total_geocoded":226145,"has_geo_id_no_match":14362,"no_geo_id":7730,"duration":"4.1s"}}
PIPELINE_SUMMARY:{"records_total":1148,"records_new":0,"records_updated":1148,"records_meta":{"duration_ms":4109,"permits_total":248237,"total_geocoded":226145,"has_geo_id_no_match":14362,"no_geo_id":7730,"zombies_cleaned":0,"audit_table":{"phase":6,"name":"Permit Geocoding","verdict":"WARN","rows":[{"metric":"total_permits","value":248237,"threshold":null,"status":"INFO"},{"metric":"already_geocoded","value":224999,"threshold":null,"status":"INFO"},{"metric":"newly_geocoded","value":1148,"threshold":null,"status":"INFO"},{"metric":"total_geocoded","value":226145,"threshold":null,"status":"INFO"},{"metric":"geocode_coverage","value":"91.1%","threshold":">= 95%","status":"WARN"},{"metric":"no_geo_id","value":7730,"threshold":null,"status":"INFO"},{"metric":"zombies_cleaned","value":0,"threshold":null,"status":"INFO"},{"metric":"backlog_remaining","value":14360,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":274.12,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":4188,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","geo_id","latitude","longitude"],"address_points":["address_point_id","latitude","longitude"]},"writes":{"permits":["latitude","longitude","geocoded_at"]}}

[geocode-permits] completed in 4.2s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=4300ms

### C2: PASS
**Evidence:** id=3145 status=completed completed_at=Fri May 08 2026 18:29:09 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
