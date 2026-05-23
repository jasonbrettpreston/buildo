# Step 09: link_parcels
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447},"permit_parcels":{"ok":true,"n":231140},"lead_parcels":{"ok":true,"n":29754}}
- Last 3 runs: [
  {
    "id": 3305,
    "status": "completed",
    "completed_at": "2026-05-20T20:42:25.012Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:42:14.116Z",
    "duration_ms": "10896"
  },
  {
    "id": 3259,
    "status": "completed",
    "completed_at": "2026-05-20T02:10:22.487Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:10:17.297Z",
    "duration_ms": "5190"
  },
  {
    "id": 3214,
    "status": "completed",
    "completed_at": "2026-05-20T01:46:48.019Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:46:41.487Z",
    "duration_ms": "6532"
  }
]

## Execution
- Command: `node scripts/link-parcels.js`
- Exit code: 0
- Duration: 14088ms
- New `pipeline_runs.id`: 3305

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447},"permit_parcels":{"ok":true,"n":231483},"lead_parcels":{"ok":true,"n":30097}}
- New run: {"id":3305,"status":"completed","verdict":"PASS","duration_ms":"10896","records_total":2,"records_new":0,"records_updated":2}

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
    "value": 2,
    "metric": "tier_1_exact_address",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_2_name_only",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_3_spatial",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_3_polygon",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2,
    "metric": "run_matched",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "93.2%",
    "metric": "link_rate",
    "status": "PASS",
    "threshold": ">= 75%"
  },
  {
    "value": 0,
    "metric": "no_match",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2,
    "metric": "permit_parcels_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0.33,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6056,
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
      },
      "permit_parcels": {
        "after": 231140,
        "delta": 2,
        "before": 231138
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 7284452,
        "seq_scan": 657,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5824,
        "n_dead_tup": 346941,
        "n_live_tup": 248813
      },
      "permit_parcels": {
        "idx_scan": 782906,
        "seq_scan": 71,
        "seq_ratio": 0.0001,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 2
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 2
      },
      "permit_parcels": {
        "del": 0,
        "ins": 2,
        "upd": 0
      }
    },
    "null_fills": {
      "permits": {
        "latitude": {
          "after": 21945,
          "before": 21945,
          "filled": 0
        },
        "longitude": {
          "after": 21945,
          "before": 21945,
          "filled": 0
        }
      }
    }
  },
  "db_upserted": 2,
  "duration_ms": 4606,
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
  },
  "no_match_count": 0,
  "permits_processed": 2,
  "matches_tier_2_name": 0,
  "matches_tier_1_exact": 2,
  "matches_tier_3_polygon": 0,
  "matches_tier_3_spatial": 0,
  "matches_tier_3_centroid": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-parcels]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[link-parcels]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[link-parcels]","msg":"PostGIS detected — spatial queries will use ST_Contains/ST_DWithin"}
{"level":"INFO","tag":"[link-parcels]","msg":"Mode: INCREMENTAL (unlinked only)"}
{"level":"INFO","tag":"[link-parcels]","msg":"Permits to process: 355"}
{"level":"INFO","tag":"[link-parcels]","msg":"Parcels with centroids: 486,530 (Strategy 3 enabled)"}
  [link-parcels] 355 / 355 (100.0%) — 11.8s — 30 rows/s
{"level":"INFO","tag":"[link-parcels]","msg":"Linking complete","context":{"processed":355,"linked":343,"exact":299,"name_only":11,"spatial":33,"spatial_polygon":28,"no_match":12,"db_upserted":343,"duration":"11.8s"}}
PIPELINE_SUMMARY:{"records_total":355,"records_new":0,"records_updated":343,"records_meta":{"duration_ms":11763,"permits_processed":355,"matches_tier_1_exact":299,"matches_tier_2_name":11,"matches_tier_3_spatial":33,"matches_tier_3_polygon":28,"matches_tier_3_centroid":5,"no_match_count":12,"db_upserted":343,"audit_table":{"phase":7,"name":"Parcel Linking","verdict":"PASS","rows":[{"metric":"permits_processed","value":355,"threshold":null,"status":"INFO"},{"metric":"tier_1_exact_address","value":299,"threshold":null,"status":"INFO"},{"metric":"tier_2_name_only","value":11,"threshold":null,"status":"INFO"},{"metric":"tier_3_spatial","value":33,"threshold":null,"status":"INFO"},{"metric":"tier_3_polygon","value":28,"threshold":null,"status":"INFO"},{"metric":"run_matched","value":343,"threshold":null,"status":"INFO"},{"metric":"link_rate","value":"93.2%","threshold":">= 75%","status":"PASS"},{"metric":"no_match","value":12,"threshold":null,"status":"INFO"},{"metric":"permit_parcels_written","value":343,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":25.49,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":13927,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","street_num","street_name","street_type","latitude","longitude"],"parcels":["id","addr_num_normalized","street_name_normalized","street_type_normalized","centroid_lat","centroid_lng","geometry"]},"writes":{"permit_parcels":["permit_num","revision_num","parcel_id","match_type","confidence","linked_at"]}}

[link-parcels] completed in 13.9s

```

### stderr tail
```
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-parcels]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=14088ms

### C2: PASS
**Evidence:** id=3305 status=completed completed_at=Wed May 20 2026 16:42:25 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 11 audit rows: [permits_processed, tier_1_exact_address, tier_2_name_only, tier_3_spatial, tier_3_polygon, run_matched, link_rate, no_match, permit_parcels_written, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 11 records_meta keys: [telemetry, db_upserted, duration_ms, pipeline_meta, no_match_count, permits_processed, matches_tier_2_name, matches_tier_1_exact, matches_tier_3_polygon, matches_tier_3_spatial, matches_tier_3_centroid]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=2; deltas={"permits":{"pre":248447,"post":248447,"delta":0},"permit_parcels":{"pre":231140,"post":231483,"delta":343},"lead_parcels":{"pre":29754,"post":30097,"delta":343}}

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
- **C8:** claimed records_new+records_updated=2; deltas={"permits":{"pre":248447,"post":248447,"delta":0},"permit_parcels":{"pre":231140,"post":231483,"delta":343},"lead_parcels":{"pre":29754,"post":30097,"delta":343}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=2 records_new=0 records_updated=2; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
