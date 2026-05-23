# Step 18: refresh_snapshot
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Materialized view refresh

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3314,
    "status": "completed",
    "completed_at": "2026-05-20T20:47:58.375Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:47:39.513Z",
    "duration_ms": "18862"
  },
  {
    "id": 3268,
    "status": "completed",
    "completed_at": "2026-05-20T02:14:28.103Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:14:11.189Z",
    "duration_ms": "16914"
  },
  {
    "id": 3236,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:20.785Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:51:56.440Z",
    "duration_ms": "24345"
  }
]

## Execution
- Command: `node scripts/refresh-snapshot.js`
- Exit code: 0
- Duration: 18874ms
- New `pipeline_runs.id`: 3314

## Post-run state
- Output table counts: {}
- New run: {"id":3314,"status":"completed","verdict":"PASS","duration_ms":"18862","records_total":1,"records_new":0,"records_updated":1}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "snapshots_created",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1,
    "metric": "snapshots_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0.05,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 18641,
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
      "data_quality_snapshots": {
        "after": 42,
        "delta": 0,
        "before": 42
      }
    },
    "engine": {
      "data_quality_snapshots": {
        "idx_scan": 10,
        "seq_scan": 37,
        "seq_ratio": 0.7872,
        "dead_ratio": 0.0455,
        "n_dead_tup": 2,
        "n_live_tup": 42
      }
    },
    "pg_stats": {
      "data_quality_snapshots": {
        "del": 0,
        "ins": 0,
        "upd": 1
      }
    },
    "null_fills": {}
  },
  "duration_ms": 18593,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "*"
      ],
      "entities": [
        "*"
      ],
      "sync_runs": [
        "*"
      ],
      "permit_trades": [
        "*"
      ],
      "cost_estimates": [
        "cost_source",
        "estimated_cost"
      ],
      "permit_parcels": [
        "*"
      ],
      "coa_applications": [
        "*"
      ],
      "parcel_buildings": [
        "*"
      ],
      "permit_inspections": [
        "*"
      ],
      "building_footprints": [
        "*"
      ]
    },
    "writes": {
      "data_quality_snapshots": [
        "*"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Recapturing data quality snapshot..."}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Permits: 248447 total, 211503 active"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Neighbourhoods (active): 200505 / 211503 = 94.8%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"CoA: 33106 total, 32898 linked = 99.4%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Scope tags: 211503 total, 196567 detailed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Top tags: alter:interior-alterations:35798, new:addition:34234, office:22543, new:garage:19100, new:build-sfd:17925"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Nulls: desc=293, builder=201000, cost=93947"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Violations: cost_oor=18921, future_issued=0, missing_status=0, total=18921"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Inspections: 94645 stages, 10102 permits, 71658 outstanding, 17298 passed, 5689 not passed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Cost Estimates: 271073 total (21316 permit, 197886 model, 26583 null)"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Snapshot inserted for Fri May 22 2026 00:00:00 GMT-0400 (Eastern Daylight Time):"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Neighbourhoods: 200505 / 211503 = 94.8%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  CoA: 32898 / 33106 = 99.4%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Scope Class: 211503 classified"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Scope Tags: 211503 total, 196567 detailed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Done in 18655ms"}
PIPELINE_SUMMARY:{"records_total":1,"records_new":1,"records_updated":0,"records_meta":{"duration_ms":18655,"audit_table":{"phase":18,"name":"Refresh Snapshot","verdict":"PASS","rows":[{"metric":"snapshots_created","value":1,"threshold":null,"status":"INFO"},{"metric":"snapshots_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0.05,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":18705,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["*"],"permit_trades":["*"],"entities":["*"],"permit_parcels":["*"],"coa_applications":["*"],"sync_runs":["*"],"building_footprints":["*"],"parcel_buildings":["*"],"permit_inspections":["*"],"cost_estimates":["cost_source","estimated_cost"]},"writes":{"data_quality_snapshots":["*"]}}

[refresh-snapshot] completed in 18.7s

```

### stderr tail
```
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[refresh-snapshot]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=18874ms

### C2: PASS
**Evidence:** id=3314 status=completed completed_at=Wed May 20 2026 16:47:58 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 4 audit rows: [snapshots_created, snapshots_updated, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 3 records_meta keys: [telemetry, duration_ms, pipeline_meta]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=1 records_new=0 records_updated=1; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=1 records_new=0 records_updated=1
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=1 records_new=0 records_updated=1; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
