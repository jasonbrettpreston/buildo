# Step 09: link_parcels
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237},"permit_parcels":{"ok":true,"n":230001},"lead_parcels":{"ok":true,"n":28519}}
- Last 3 runs: [
  {
    "id": 3146,
    "status": "completed",
    "completed_at": "2026-05-08T22:29:18.589Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:29:09.197Z",
    "duration_ms": "9393"
  },
  {
    "id": 3118,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.009Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.009Z",
    "duration_ms": "0"
  },
  {
    "id": 3051,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.926Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.926Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-parcels.js`
- Exit code: 0
- Duration: 34406ms
- New `pipeline_runs.id`: 3146

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237},"permit_parcels":{"ok":true,"n":231183},"lead_parcels":{"ok":true,"n":29703}}
- New run: {"id":3146,"status":"completed","verdict":"PASS","duration_ms":"9393","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": "SKIPPED",
    "metric": "status",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "No unlinked permits — all already have parcel links",
    "metric": "reason",
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
    "value": 3798,
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
      },
      "permit_parcels": {
        "after": 230001,
        "delta": 0,
        "before": 230001
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 12325629,
        "seq_scan": 1013,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.565,
        "n_dead_tup": 321700,
        "n_live_tup": 247703
      },
      "permit_parcels": {
        "idx_scan": 1293672,
        "seq_scan": 103,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.0031,
        "n_dead_tup": 5,
        "n_live_tup": 1590
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 0
      },
      "permit_parcels": {
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
  "pipeline_meta": {
    "reads": {
      "parcels": [
        "id",
        "addr_num_normalized",
        "street_name_normalized",
        "street_type_normalized",
        "centroid_lat",
        "centroid_lng",
        "geometry"
      ],
      "permits": [
        "permit_num",
        "revision_num",
        "street_num",
        "street_name",
        "street_type",
        "latitude",
        "longitude"
      ]
    },
    "writes": {
      "permit_parcels": [
        "permit_num",
        "revision_num",
        "parcel_id",
        "match_type",
        "confidence",
        "linked_at"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-parcels]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[link-parcels]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[link-parcels]","msg":"PostGIS detected — spatial queries will use ST_Contains/ST_DWithin"}
{"level":"INFO","tag":"[link-parcels]","msg":"Mode: INCREMENTAL (unlinked only)"}
{"level":"INFO","tag":"[link-parcels]","msg":"Permits to process: 1,209"}
{"level":"INFO","tag":"[link-parcels]","msg":"Parcels with centroids: 486,530 (Strategy 3 enabled)"}
  [link-parcels] 1,209 / 1,209 (100.0%) — 33.4s — 36 rows/s
{"level":"INFO","tag":"[link-parcels]","msg":"Linking complete","context":{"processed":1209,"linked":1184,"exact":1016,"name_only":18,"spatial":150,"spatial_polygon":120,"no_match":25,"db_upserted":1184,"duration":"33.4s"}}
PIPELINE_SUMMARY:{"records_total":1209,"records_new":0,"records_updated":1184,"records_meta":{"duration_ms":33400,"permits_processed":1209,"matches_tier_1_exact":1016,"matches_tier_2_name":18,"matches_tier_3_spatial":150,"matches_tier_3_polygon":120,"matches_tier_3_centroid":30,"no_match_count":25,"db_upserted":1184,"audit_table":{"phase":7,"name":"Parcel Linking","verdict":"PASS","rows":[{"metric":"permits_processed","value":1209,"threshold":null,"status":"INFO"},{"metric":"tier_1_exact_address","value":1016,"threshold":null,"status":"INFO"},{"metric":"tier_2_name_only","value":18,"threshold":null,"status":"INFO"},{"metric":"tier_3_spatial","value":150,"threshold":null,"status":"INFO"},{"metric":"tier_3_polygon","value":120,"threshold":null,"status":"INFO"},{"metric":"run_matched","value":1184,"threshold":null,"status":"INFO"},{"metric":"link_rate","value":"93.1%","threshold":">= 75%","status":"PASS"},{"metric":"no_match","value":25,"threshold":null,"status":"INFO"},{"metric":"permit_parcels_written","value":1184,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":35.31,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":34235,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","street_num","street_name","street_type","latitude","longitude"],"parcels":["id","addr_num_normalized","street_name_normalized","street_type_normalized","centroid_lat","centroid_lng","geometry"]},"writes":{"permit_parcels":["permit_num","revision_num","parcel_id","match_type","confidence","linked_at"]}}

[link-parcels] completed in 34.2s

```

### stderr tail
```
{"level":"WARN","tag":"[link-parcels]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=34406ms

### C2: PASS
**Evidence:** id=3146 status=completed completed_at=Fri May 08 2026 18:29:18 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 4 audit rows: [status, reason, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 2 records_meta keys: [telemetry, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0},"permit_parcels":{"pre":230001,"post":231183,"delta":1182},"lead_parcels":{"pre":28519,"post":29703,"delta":1184}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0},"permit_parcels":{"pre":230001,"post":231183,"delta":1182},"lead_parcels":{"pre":28519,"post":29703,"delta":1184}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
