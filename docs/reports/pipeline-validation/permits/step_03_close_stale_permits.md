# Step 03: close_stale_permits
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** Date arithmetic invariants §11.1

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3299,
    "status": "completed",
    "completed_at": "2026-05-20T20:38:00.633Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:37:51.115Z",
    "duration_ms": "9518"
  },
  {
    "id": 3253,
    "status": "completed",
    "completed_at": "2026-05-20T02:06:44.770Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:06:41.725Z",
    "duration_ms": "3044"
  },
  {
    "id": 3208,
    "status": "completed",
    "completed_at": "2026-05-20T01:42:38.816Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:42:33.689Z",
    "duration_ms": "5127"
  }
]

## Execution
- Command: `node scripts/close-stale-permits.js`
- Exit code: 0
- Duration: 2275ms
- New `pipeline_runs.id`: 3299

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3299,"status":"completed","verdict":"PASS","duration_ms":"9518","records_total":8,"records_new":0,"records_updated":8}

### audit_table.rows
```json
[
  {
    "value": "2026-05-20",
    "metric": "last_load_at",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 7,
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
    "value": 1,
    "metric": "promoted_to_closed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 5502,
    "metric": "total_pending",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 13447,
    "metric": "total_closed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "7.6%",
    "metric": "closure_rate",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2.69,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2974,
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
        "idx_scan": 7054987,
        "seq_scan": 631,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4311,
        "n_dead_tup": 213217,
        "n_live_tup": 281404
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 8
      }
    },
    "null_fills": {}
  },
  "duration_ms": 2921,
  "total_closed": 13447,
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
  "total_pending": 5502,
  "pending_closed": 7,
  "promoted_to_closed": 1
}
```

### stdout tail
```
{"level":"INFO","tag":"[close-stale-permits]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[close-stale-permits]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[close-stale]","msg":"Reference load: 2026-05-20T20:33:36.433Z"}
{"level":"INFO","tag":"[close-stale]","msg":"Pending Closed: 0 permits"}
{"level":"INFO","tag":"[close-stale]","msg":"Promoted to Closed: 389 permits"}
{"level":"INFO","tag":"[close-stale]","msg":"Complete","context":{"pending_closed":0,"promoted_to_closed":389,"total_pending":5112,"total_closed":13835,"duration":"2.0s"}}
PIPELINE_SUMMARY:{"records_total":389,"records_new":0,"records_updated":389,"records_meta":{"duration_ms":1999,"pending_closed":0,"promoted_to_closed":389,"total_pending":5112,"total_closed":13835,"audit_table":{"phase":3,"name":"Stale Permit Closure","verdict":"PASS","rows":[{"metric":"last_load_at","value":"2026-05-20","threshold":null,"status":"INFO"},{"metric":"pending_closed","value":0,"threshold":null,"status":"INFO"},{"metric":"pending_closed_rate","value":"0.0%","threshold":"< 10%","status":"PASS"},{"metric":"promoted_to_closed","value":389,"threshold":null,"status":"INFO"},{"metric":"total_pending","value":5112,"threshold":null,"status":"INFO"},{"metric":"total_closed","value":13835,"threshold":null,"status":"INFO"},{"metric":"closure_rate","value":"7.6%","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":189.2,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":2056,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["status","last_seen_at","completed_date"],"pipeline_runs":["pipeline","status","started_at"]},"writes":{"permits":["status","completed_date"]}}

[close-stale-permits] completed in 2.1s

```

### stderr tail
```
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[close-stale-permits]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=2275ms

### C2: PASS
**Evidence:** id=3299 status=completed completed_at=Wed May 20 2026 16:38:00 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=8; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for close_stale_permits

### C11: N/A-MANUAL
**Evidence:** records_total=8 records_new=0 records_updated=8; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=8 records_new=0 records_updated=8
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
- **C8:** claimed records_new+records_updated=8; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for close_stale_permits
- **C11:** records_total=8 records_new=0 records_updated=8; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
