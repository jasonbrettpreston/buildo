# Step 14: backfill_realtor_permit_trades
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Spec 84 §8.5

## Pre-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237730},"lead_trades":{"ok":true,"n":1586336}}
- Last 3 runs: [
  {
    "id": 3310,
    "status": "completed",
    "completed_at": "2026-05-20T20:46:43.817Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:46:40.343Z",
    "duration_ms": "3474"
  },
  {
    "id": 3264,
    "status": "completed",
    "completed_at": "2026-05-20T02:13:35.611Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:13:32.234Z",
    "duration_ms": "3377"
  },
  {
    "id": 3225,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:46.604Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:40.164Z",
    "duration_ms": "6440"
  }
]

## Execution
- Command: `node scripts/backfill-realtor-permit-trades.js`
- Exit code: 0
- Duration: 6881ms
- New `pipeline_runs.id`: 3310

## Post-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237730},"lead_trades":{"ok":true,"n":1586336}}
- New run: {"id":3310,"status":"completed","verdict":"PASS","duration_ms":"3474","records_total":68580,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 74777,
    "metric": "realtor_rows_after_backfill",
    "status": "PASS",
    "threshold": 68580
  },
  {
    "value": 0,
    "metric": "rows_inserted_this_run",
    "status": "PASS",
    "threshold": null
  },
  {
    "value": 1,
    "metric": "completed_naturally",
    "status": "PASS",
    "threshold": 1
  },
  {
    "value": 2603,
    "metric": "elapsed_ms",
    "status": "PASS",
    "threshold": null
  },
  {
    "value": 25859.73,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2652,
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
      "permit_trades": {
        "after": 1236223,
        "delta": 0,
        "before": 1236223
      }
    },
    "engine": {
      "permit_trades": {
        "idx_scan": 6519422,
        "seq_scan": 93,
        "seq_ratio": 0,
        "dead_ratio": 0.4184,
        "n_dead_tup": 886800,
        "n_live_tup": 1232652
      }
    },
    "pg_stats": {
      "permit_trades": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "pipeline_meta": {
    "reads": {
      "trades": [
        "id",
        "slug"
      ],
      "permits": [
        "permit_num",
        "revision_num",
        "status",
        "permit_type",
        "scope_tags"
      ],
      "permit_type_classifications": [
        "permit_type",
        "class"
      ]
    },
    "writes": {
      "permit_trades": [
        "permit_num",
        "revision_num",
        "trade_id",
        "tier",
        "confidence",
        "is_active",
        "classified_at"
      ]
    }
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Starting realtor permit_trades backfill"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Total realtor-eligible ACTIVE permits in scope: 68,678 (3-axis gate: construction class + REALTOR_RELEVANT_TYPES + non-commercial scope)"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Existing realtor rows in permit_trades: 74,892"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Backfill complete after 1 batch(es)"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Done. Inserted 0 new rows in 6728ms. Total realtor rows now: 74,892."}
PIPELINE_SUMMARY:{"records_total":68678,"records_new":0,"records_updated":0,"records_meta":{"audit_table":{"phase":91,"name":"Backfill Realtor permit_trades","verdict":"PASS","rows":[{"metric":"realtor_rows_after_backfill","value":74892,"threshold":68678,"status":"PASS"},{"metric":"rows_inserted_this_run","value":0,"threshold":null,"status":"PASS"},{"metric":"completed_naturally","value":1,"threshold":1,"status":"PASS"},{"metric":"elapsed_ms","value":6728,"threshold":null,"status":"PASS"},{"metric":"sys_velocity_rows_sec","value":10139.97,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":6773,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","status","permit_type","scope_tags"],"trades":["id","slug"],"permit_type_classifications":["permit_type","class"]},"writes":{"permit_trades":["permit_num","revision_num","trade_id","tier","confidence","is_active","classified_at"]}}

[backfill-realtor-permit-trades] completed in 6.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=6881ms

### C2: PASS
**Evidence:** id=3310 status=completed completed_at=Wed May 20 2026 16:46:43 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 6 audit rows: [realtor_rows_after_backfill, rows_inserted_this_run, completed_naturally, elapsed_ms, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 2 records_meta keys: [telemetry, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permit_trades":{"pre":1237730,"post":1237730,"delta":0},"lead_trades":{"pre":1586336,"post":1586336,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=68580 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=68580 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permit_trades":{"pre":1237730,"post":1237730,"delta":0},"lead_trades":{"pre":1586336,"post":1586336,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=68580 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
