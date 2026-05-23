# Step 12: link_similar
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3308,
    "status": "completed",
    "completed_at": "2026-05-20T20:42:41.510Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:42:33.693Z",
    "duration_ms": "7817"
  },
  {
    "id": 3262,
    "status": "completed",
    "completed_at": "2026-05-20T02:10:34.971Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:10:27.564Z",
    "duration_ms": "7406"
  },
  {
    "id": 3217,
    "status": "completed",
    "completed_at": "2026-05-20T01:47:04.792Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:46:56.420Z",
    "duration_ms": "8372"
  }
]

## Execution
- Command: `node scripts/link-similar.js`
- Exit code: 0
- Duration: 9608ms
- New `pipeline_runs.id`: 3308

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3308,"status":"completed","verdict":"PASS","duration_ms":"7817","records_total":5393,"records_new":0,"records_updated":5393}

### audit_table.rows
```json
[
  {
    "value": 5393,
    "metric": "run_propagated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 83917,
    "metric": "cumulative_propagated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 248092,
    "metric": "cumulative_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "33.8%",
    "metric": "propagation_rate",
    "status": "PASS",
    "threshold": ">= 20%"
  },
  {
    "value": 832.51,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6478,
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
        "idx_scan": 7284459,
        "seq_scan": 670,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5853,
        "n_dead_tup": 351182,
        "n_live_tup": 248813
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 5393
      }
    },
    "null_fills": {}
  },
  "duration_ms": 5074,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "scope_tags",
        "project_type",
        "permit_type"
      ]
    },
    "writes": {
      "permits": [
        "scope_tags",
        "project_type",
        "scope_classified_at",
        "scope_source"
      ]
    }
  },
  "tags_propagated": 5393
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-similar]","msg":"Linking similar permits (BLD → companion propagation)..."}
{"level":"INFO","tag":"[link-similar]","msg":"Propagated scope tags to 5,339 companion permits"}
{"level":"INFO","tag":"[link-similar]","msg":"Done","context":{"tags_propagated":5339,"duration":"7.8s"}}
PIPELINE_SUMMARY:{"records_total":5339,"records_new":0,"records_updated":5339,"records_meta":{"duration_ms":7791,"tags_propagated":5339,"audit_table":{"phase":10,"name":"Similar Permit Linking","verdict":"PASS","rows":[{"metric":"run_propagated","value":5339,"threshold":null,"status":"INFO"},{"metric":"cumulative_propagated","value":84070,"threshold":null,"status":"INFO"},{"metric":"cumulative_classified","value":248447,"threshold":null,"status":"INFO"},{"metric":"propagation_rate","value":"33.8%","threshold":">= 20%","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":563.42,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":9476,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","scope_tags","project_type","permit_type"]},"writes":{"permits":["scope_tags","project_type","scope_classified_at","scope_source"]}}

[link-similar] completed in 9.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=9608ms

### C2: PASS
**Evidence:** id=3308 status=completed completed_at=Wed May 20 2026 16:42:41 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 6 audit rows: [run_propagated, cumulative_propagated, cumulative_classified, propagation_rate, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 4 records_meta keys: [telemetry, duration_ms, pipeline_meta, tags_propagated]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=5393; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=5393 records_new=0 records_updated=5393; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=5393 records_new=0 records_updated=5393
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=5393; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=5393 records_new=0 records_updated=5393; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
