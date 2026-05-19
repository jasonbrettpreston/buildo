# Step 12: link_similar
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
    "id": 3149,
    "status": "completed",
    "completed_at": "2026-05-08T22:29:42.045Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:29:31.952Z",
    "duration_ms": "10093"
  },
  {
    "id": 3121,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.012Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.012Z",
    "duration_ms": "0"
  },
  {
    "id": 3054,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.929Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.929Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-similar.js`
- Exit code: 0
- Duration: 6870ms
- New `pipeline_runs.id`: 3149

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3149,"status":"completed","verdict":"PASS","duration_ms":"10093","records_total":5332,"records_new":0,"records_updated":5332}

### audit_table.rows
```json
[
  {
    "value": 5332,
    "metric": "run_propagated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 83415,
    "metric": "cumulative_propagated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 247030,
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
    "value": 657.46,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 8110,
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
        "idx_scan": 12325636,
        "seq_scan": 1026,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5685,
        "n_dead_tup": 326326,
        "n_live_tup": 247703
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 5332
      }
    },
    "null_fills": {}
  },
  "duration_ms": 6051,
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
  "tags_propagated": 5332
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-similar]","msg":"Linking similar permits (BLD → companion propagation)..."}
{"level":"INFO","tag":"[link-similar]","msg":"Propagated scope tags to 5,345 companion permits"}
{"level":"INFO","tag":"[link-similar]","msg":"Done","context":{"tags_propagated":5345,"duration":"5.2s"}}
PIPELINE_SUMMARY:{"records_total":5345,"records_new":0,"records_updated":5345,"records_meta":{"duration_ms":5192,"tags_propagated":5345,"audit_table":{"phase":10,"name":"Similar Permit Linking","verdict":"PASS","rows":[{"metric":"run_propagated","value":5345,"threshold":null,"status":"INFO"},{"metric":"cumulative_propagated","value":83916,"threshold":null,"status":"INFO"},{"metric":"cumulative_classified","value":248237,"threshold":null,"status":"INFO"},{"metric":"propagation_rate","value":"33.8%","threshold":">= 20%","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":790.8,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":6759,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","scope_tags","project_type","permit_type"]},"writes":{"permits":["scope_tags","project_type","scope_classified_at","scope_source"]}}

[link-similar] completed in 6.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=6870ms

### C2: PASS
**Evidence:** id=3149 status=completed completed_at=Fri May 08 2026 18:29:42 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=5332; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=5332 records_new=0 records_updated=5332; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=5332 records_new=0 records_updated=5332
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=5332; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=5332 records_new=0 records_updated=5332; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
