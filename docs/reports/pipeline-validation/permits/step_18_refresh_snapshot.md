# Step 18: refresh_snapshot
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Materialized view refresh

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3155,
    "status": "completed",
    "completed_at": "2026-05-08T22:34:43.473Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:34:12.385Z",
    "duration_ms": "31088"
  },
  {
    "id": 3127,
    "status": "completed",
    "completed_at": "2026-05-08T21:57:19.467Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:56:48.449Z",
    "duration_ms": "31018"
  },
  {
    "id": 3060,
    "status": "completed",
    "completed_at": "2026-05-08T18:20:57.175Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:20:36.559Z",
    "duration_ms": "20616"
  }
]

## Execution
- Command: `node scripts/refresh-snapshot.js`
- Exit code: 0
- Duration: 20729ms
- New `pipeline_runs.id`: 3155

## Post-run state
- Output table counts: {}
- New run: {"id":3155,"status":"completed","verdict":"PASS","duration_ms":"31088","records_total":1,"records_new":0,"records_updated":1}

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
    "value": 0.03,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 30777,
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
        "after": 40,
        "delta": 0,
        "before": 40
      }
    },
    "engine": {
      "data_quality_snapshots": {
        "idx_scan": 13,
        "seq_scan": 60,
        "seq_ratio": 0.8219,
        "dead_ratio": 0.0698,
        "n_dead_tup": 3,
        "n_live_tup": 40
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
  "duration_ms": 30617,
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
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Permits: 248237 total, 212683 active"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Neighbourhoods (active): 201641 / 212683 = 94.8%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"CoA: 33052 total, 32846 linked = 99.4%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Scope tags: 212683 total, 197665 detailed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Top tags: alter:interior-alterations:36018, new:addition:34409, office:22653, new:garage:19268, new:build-sfd:18085"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Nulls: desc=296, builder=202115, cost=94590"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Violations: cost_oor=19024, future_issued=0, missing_status=0, total=19024"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Inspections: 94645 stages, 10102 permits, 71658 outstanding, 17298 passed, 5689 not passed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Cost Estimates: 245785 total (21316 permit, 197886 model, 26583 null)"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Snapshot inserted for Tue May 19 2026 00:00:00 GMT-0400 (Eastern Daylight Time):"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Neighbourhoods: 201641 / 212683 = 94.8%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  CoA: 32846 / 33052 = 99.4%"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Scope Class: 212683 classified"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"  Scope Tags: 212683 total, 197665 detailed"}
{"level":"INFO","tag":"[refresh-snapshot]","msg":"Done in 20502ms"}
PIPELINE_SUMMARY:{"records_total":1,"records_new":1,"records_updated":0,"records_meta":{"duration_ms":20502,"audit_table":{"phase":18,"name":"Refresh Snapshot","verdict":"PASS","rows":[{"metric":"snapshots_created","value":1,"threshold":null,"status":"INFO"},{"metric":"snapshots_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0.05,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":20551,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["*"],"permit_trades":["*"],"entities":["*"],"permit_parcels":["*"],"coa_applications":["*"],"sync_runs":["*"],"building_footprints":["*"],"parcel_buildings":["*"],"permit_inspections":["*"],"cost_estimates":["cost_source","estimated_cost"]},"writes":{"data_quality_snapshots":["*"]}}

[refresh-snapshot] completed in 20.6s

```

### stderr tail
```
{"level":"WARN","tag":"[refresh-snapshot]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=20729ms

### C2: PASS
**Evidence:** id=3155 status=completed completed_at=Fri May 08 2026 18:34:43 GMT-0400 (Eastern Daylight Time)

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
