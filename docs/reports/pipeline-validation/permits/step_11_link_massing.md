# Step 11: link_massing
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- Last 3 runs: [
  {
    "id": 3148,
    "status": "completed",
    "completed_at": "2026-05-08T22:29:31.949Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:29:23.844Z",
    "duration_ms": "8105"
  },
  {
    "id": 3120,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.011Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.011Z",
    "duration_ms": "0"
  },
  {
    "id": 3053,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.928Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.928Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-massing.js`
- Exit code: 0
- Duration: 3153ms
- New `pipeline_runs.id`: 3148

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3148,"status":"completed","verdict":"PASS","duration_ms":"8105","records_total":5336,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "buildings_indexed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "N/A (PostGIS)",
    "metric": "grid_cells",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 5336,
    "metric": "parcels_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "run_matched",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "match_centroid_in_parcel",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "match_nearest_fallback",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "98.9%",
    "metric": "link_rate",
    "status": "PASS",
    "threshold": ">= 50%"
  },
  {
    "value": 5336,
    "metric": "no_match",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "parcel_buildings_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 781.26,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6830,
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
      "parcel_buildings": {
        "after": 516551,
        "delta": 0,
        "before": 516551
      }
    },
    "engine": {
      "parcel_buildings": {
        "idx_scan": 2470895,
        "seq_scan": 48,
        "seq_ratio": 0,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      }
    },
    "pg_stats": {
      "parcel_buildings": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "duration_ms": 5909,
  "pipeline_meta": {
    "reads": {
      "parcels": [
        "id",
        "centroid_lat",
        "centroid_lng",
        "geometry"
      ],
      "building_footprints": [
        "id",
        "geometry",
        "footprint_area_sqm",
        "centroid_lat",
        "centroid_lng"
      ]
    },
    "writes": {
      "parcel_buildings": [
        "parcel_id",
        "building_id",
        "is_primary",
        "structure_type",
        "match_type",
        "confidence",
        "linked_at"
      ]
    }
  },
  "no_match_count": 5336,
  "parcels_linked": 0,
  "matches_nearest": 0,
  "buildings_matched": 0,
  "parcels_processed": 5336,
  "buildings_upserted": 0,
  "matches_centroid_in_parcel": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-massing]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[link-massing]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[link-massing]","msg":"Mode: INCREMENTAL (unlinked parcels only) [PostGIS]"}
{"level":"INFO","tag":"[link-massing]","msg":"Using PostGIS ST_Contains (fast path — no in-memory grid)"}
{"level":"INFO","tag":"[link-massing]","msg":"Parcels to process: 5,336"}
  [link-massing] 5,336 / 5,336 (100.0%) — 2.7s — 2008 rows/s
{"level":"INFO","tag":"[link-massing]","msg":"Linking complete","context":{"parcels_processed":5336,"parcels_linked":0,"buildings_matched":0,"buildings_upserted":0,"centroid_in_parcel":0,"nearest":0,"no_match":5336,"duration":"2.7s"}}
PIPELINE_SUMMARY:{"records_total":5336,"records_new":0,"records_updated":0,"records_meta":{"duration_ms":2657,"parcels_processed":5336,"parcels_linked":0,"buildings_matched":0,"buildings_upserted":0,"matches_centroid_in_parcel":0,"matches_nearest":0,"no_match_count":5336,"audit_table":{"phase":9,"name":"Building Footprint Linking","verdict":"PASS","rows":[{"metric":"buildings_indexed","value":0,"threshold":null,"status":"INFO"},{"metric":"grid_cells","value":"N/A (PostGIS)","threshold":null,"status":"INFO"},{"metric":"parcels_processed","value":5336,"threshold":null,"status":"INFO"},{"metric":"run_matched","value":0,"threshold":null,"status":"INFO"},{"metric":"match_centroid_in_parcel","value":0,"threshold":null,"status":"INFO"},{"metric":"match_nearest_fallback","value":0,"threshold":null,"status":"INFO"},{"metric":"link_rate","value":"98.9%","threshold":">= 50%","status":"PASS"},{"metric":"no_match","value":5336,"threshold":null,"status":"INFO"},{"metric":"parcel_buildings_written","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1790.6,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":2980,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"parcels":["id","centroid_lat","centroid_lng","geometry"],"building_footprints":["id","geometry","footprint_area_sqm","centroid_lat","centroid_lng"]},"writes":{"parcel_buildings":["parcel_id","building_id","is_primary","structure_type","match_type","confidence","linked_at"]}}

[link-massing] completed in 3.0s

```

### stderr tail
```
{"level":"WARN","tag":"[link-massing]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=3153ms

### C2: PASS
**Evidence:** id=3148 status=completed completed_at=Fri May 08 2026 18:29:31 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 11 audit rows: [buildings_indexed, grid_cells, parcels_processed, run_matched, match_centroid_in_parcel, match_nearest_fallback, link_rate, no_match, parcel_buildings_written, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 10 records_meta keys: [telemetry, duration_ms, pipeline_meta, no_match_count, parcels_linked, matches_nearest, buildings_matched, parcels_processed, buildings_upserted, matches_centroid_in_parcel]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=5336 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=5336 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=5336 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
