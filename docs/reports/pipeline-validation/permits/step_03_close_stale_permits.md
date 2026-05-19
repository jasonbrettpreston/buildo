# Step 03: close_stale_permits
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** Date arithmetic invariants §11.1

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- Last 3 runs: [
  {
    "id": 3140,
    "status": "completed",
    "completed_at": "2026-05-08T22:24:07.108Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:23:55.767Z",
    "duration_ms": "11341"
  },
  {
    "id": 3112,
    "status": "completed",
    "completed_at": "2026-05-08T21:48:27.571Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:48:19.179Z",
    "duration_ms": "8392"
  },
  {
    "id": 3045,
    "status": "completed",
    "completed_at": "2026-05-08T18:13:31.717Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:13:19.110Z",
    "duration_ms": "12607"
  }
]

## Execution
- Command: `node scripts/close-stale-permits.js`
- Exit code: 0
- Duration: 6743ms
- New `pipeline_runs.id`: 3140

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3140,"status":"completed","verdict":"PASS","duration_ms":"11341","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": "2026-05-08",
    "metric": "last_load_at",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "pending_closed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "0.0%",
    "metric": "pending_closed_rate",
    "status": "PASS",
    "threshold": "< 10%"
  },
  {
    "value": 0,
    "metric": "promoted_to_closed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6699,
    "metric": "total_pending",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 10695,
    "metric": "total_closed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "7.0%",
    "metric": "closure_rate",
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
    "value": 3385,
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
        "idx_scan": 12095673,
        "seq_scan": 989,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4146,
        "n_dead_tup": 174369,
        "n_live_tup": 246168
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "duration_ms": 3303,
  "total_closed": 10695,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "status",
        "last_seen_at",
        "completed_date"
      ],
      "pipeline_runs": [
        "pipeline",
        "status",
        "started_at"
      ]
    },
    "writes": {
      "permits": [
        "status",
        "completed_date"
      ]
    }
  },
  "total_pending": 6699,
  "pending_closed": 0,
  "promoted_to_closed": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[close-stale-permits]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[close-stale-permits]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[close-stale]","msg":"Reference load: 2026-05-08T22:21:24.774Z"}
{"level":"INFO","tag":"[close-stale]","msg":"Pending Closed: 0 permits"}
{"level":"INFO","tag":"[close-stale]","msg":"Promoted to Closed: 2,899 permits"}
{"level":"INFO","tag":"[close-stale]","msg":"Complete","context":{"pending_closed":0,"promoted_to_closed":2899,"total_pending":3790,"total_closed":13592,"duration":"6.5s"}}
PIPELINE_SUMMARY:{"records_total":2899,"records_new":0,"records_updated":2899,"records_meta":{"duration_ms":6486,"pending_closed":0,"promoted_to_closed":2899,"total_pending":3790,"total_closed":13592,"audit_table":{"phase":3,"name":"Stale Permit Closure","verdict":"PASS","rows":[{"metric":"last_load_at","value":"2026-05-08","threshold":null,"status":"INFO"},{"metric":"pending_closed","value":0,"threshold":null,"status":"INFO"},{"metric":"pending_closed_rate","value":"0.0%","threshold":"< 10%","status":"PASS"},{"metric":"promoted_to_closed","value":2899,"threshold":null,"status":"INFO"},{"metric":"total_pending","value":3790,"threshold":null,"status":"INFO"},{"metric":"total_closed","value":13592,"threshold":null,"status":"INFO"},{"metric":"closure_rate","value":"7.0%","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":443.14,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":6542,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["status","last_seen_at","completed_date"],"pipeline_runs":["pipeline","status","started_at"]},"writes":{"permits":["status","completed_date"]}}

[close-stale-permits] completed in 6.5s

```

### stderr tail
```
{"level":"WARN","tag":"[close-stale-permits]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=6743ms

### C2: PASS
**Evidence:** id=3140 status=completed completed_at=Fri May 08 2026 18:24:07 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 9 audit rows: [last_load_at, pending_closed, pending_closed_rate, promoted_to_closed, total_pending, total_closed, closure_rate, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 7 records_meta keys: [telemetry, duration_ms, total_closed, pipeline_meta, total_pending, pending_closed, promoted_to_closed]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for close_stale_permits

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T7:** N/A-MANUAL — sentinel-set specific per step
- **T8:** N/A-MANUAL — time-bucket boundaries per step
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T10:** N/A-MANUAL — calibration cohort thinning manual
- **T11:** N/A-MANUAL — catchall rule rate per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for close_stale_permits
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
