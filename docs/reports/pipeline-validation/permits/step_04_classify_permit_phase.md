# Step 04: classify_permit_phase
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Legacy P-code

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3300,
    "status": "completed",
    "completed_at": "2026-05-20T20:38:06.891Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:38:00.636Z",
    "duration_ms": "6255"
  },
  {
    "id": 3254,
    "status": "completed",
    "completed_at": "2026-05-20T02:06:48.110Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:06:44.771Z",
    "duration_ms": "3339"
  },
  {
    "id": 3209,
    "status": "completed",
    "completed_at": "2026-05-20T01:42:40.863Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:42:38.817Z",
    "duration_ms": "2046"
  }
]

## Execution
- Command: `node scripts/classify-permit-phase.js`
- Exit code: 0
- Duration: 1387ms
- New `pipeline_runs.id`: 3300

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3300,"status":"completed","verdict":"PASS","duration_ms":"6255","records_total":17,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "examination_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 17,
    "metric": "total_examination",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 137336,
    "metric": "total_inspection",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "0.0%",
    "metric": "examination_rate",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6.55,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2596,
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
        "idx_scan": 7054997,
        "seq_scan": 632,
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
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "duration_ms": 2482,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "status",
        "revision_num",
        "issued_date",
        "enriched_status",
        "last_seen_at"
      ]
    },
    "writes": {
      "permits": [
        "enriched_status",
        "last_seen_at"
      ]
    }
  },
  "total_inspection": 137336,
  "total_examination": 17,
  "examination_classified": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-phase]","msg":"Examination: 1 permits reclassified"}
{"level":"INFO","tag":"[classify-phase]","msg":"Complete","context":{"examination_classified":1,"total_examination":18,"total_inspection":137571,"duration":"1.1s"}}
PIPELINE_SUMMARY:{"records_total":18,"records_new":0,"records_updated":1,"records_meta":{"duration_ms":1052,"examination_classified":1,"total_examination":18,"total_inspection":137571,"audit_table":{"phase":4,"name":"Permit Phase Classification","verdict":"PASS","rows":[{"metric":"examination_classified","value":1,"threshold":null,"status":"INFO"},{"metric":"total_examination","value":18,"threshold":null,"status":"INFO"},{"metric":"total_inspection","value":137571,"threshold":null,"status":"INFO"},{"metric":"examination_rate","value":"0.0%","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":14.3,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":1259,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["status","revision_num","issued_date","enriched_status","last_seen_at"]},"writes":{"permits":["enriched_status","last_seen_at"]}}

[classify-permit-phase] completed in 1.3s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=1387ms

### C2: PASS
**Evidence:** id=3300 status=completed completed_at=Wed May 20 2026 16:38:06 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 6 audit rows: [examination_classified, total_examination, total_inspection, examination_rate, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 6 records_meta keys: [telemetry, duration_ms, pipeline_meta, total_inspection, total_examination, examination_classified]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=17 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=17 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=17 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
