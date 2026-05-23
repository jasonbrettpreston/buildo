# Step 06: builders
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Entity extraction from applicant names

## Pre-run state
- Output table counts: {"entities":{"ok":true,"n":3846}}
- Last 3 runs: [
  {
    "id": 3302,
    "status": "completed",
    "completed_at": "2026-05-20T20:40:27.173Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:40:26.543Z",
    "duration_ms": "630"
  },
  {
    "id": 3256,
    "status": "completed",
    "completed_at": "2026-05-20T02:08:30.874Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:08:30.172Z",
    "duration_ms": "701"
  },
  {
    "id": 3211,
    "status": "completed",
    "completed_at": "2026-05-20T01:44:45.009Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:44:44.286Z",
    "duration_ms": "723"
  }
]

## Execution
- Command: `node scripts/extract-builders.js`
- Exit code: 0
- Duration: 1019ms
- New `pipeline_runs.id`: 3302

## Post-run state
- Output table counts: {"entities":{"ok":true,"n":3859}}
- New run: {"id":3302,"status":"completed","verdict":"PASS","duration_ms":"630","records_total":3819,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 3861,
    "metric": "raw_names_distinct",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3819,
    "metric": "normalized_entities",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "1.1%",
    "metric": "dedup_ratio",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "db_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "db_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3846,
    "metric": "total_in_db",
    "status": "PASS",
    "threshold": ">= 3819"
  },
  {
    "value": 1140,
    "metric": "corporations",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2679,
    "metric": "individuals",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "backfilled_entity_type",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 7547.43,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 506,
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
      "entities": {
        "after": 3846,
        "delta": 0,
        "before": 3846
      }
    },
    "engine": {
      "entities": {
        "idx_scan": 15351,
        "seq_scan": 76,
        "seq_ratio": 0.0049,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      }
    },
    "pg_stats": {
      "entities": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {
      "entities": {
        "website": {
          "after": 3218,
          "before": 3218,
          "filled": 0
        },
        "primary_email": {
          "after": 3538,
          "before": 3538,
          "filled": 0
        },
        "primary_phone": {
          "after": 3337,
          "before": 3337,
          "filled": 0
        }
      }
    }
  },
  "db_inserts": 0,
  "db_updates": 0,
  "duration_ms": 421,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "builder_name"
      ]
    },
    "writes": {
      "entities": [
        "legal_name",
        "name_normalized",
        "permit_count",
        "entity_type",
        "last_seen_at"
      ]
    }
  },
  "raw_names_found": 3861,
  "normalized_unique_entities": 3819
}
```

### stdout tail
```
{"level":"INFO","tag":"[extract-builders]","msg":"Extracting builders from permits..."}
{"level":"INFO","tag":"[extract-builders]","msg":"Found 3,874 unique raw builder names"}
{"level":"INFO","tag":"[extract-builders]","msg":"Normalized to 3,832 unique builders"}
  [extract-builders] 1,000 / 3,832 (26.1%) — 0.4s — 2770 rows/s
  [extract-builders] 2,000 / 3,832 (52.2%) — 0.4s — 5222 rows/s
  [extract-builders] 3,000 / 3,832 (78.3%) — 0.4s — 7444 rows/s
  [extract-builders] 3,832 / 3,832 (100.0%) — 0.4s — 9189 rows/s
{"level":"INFO","tag":"[extract-builders]","msg":"Complete","context":{"total_in_db":3859,"raw_names":3874,"normalized":3832,"corporations":1142,"individuals":2690,"inserted":13,"updated":9,"unchanged":3810,"backfilled":0,"duration":"0.4s"}}
PIPELINE_SUMMARY:{"records_total":3832,"records_new":13,"records_updated":9,"records_meta":{"duration_ms":420,"raw_names_found":3874,"normalized_unique_entities":3832,"db_inserts":13,"db_updates":9,"audit_table":{"phase":4,"name":"Builder Extraction","verdict":"PASS","rows":[{"metric":"raw_names_distinct","value":3874,"threshold":null,"status":"INFO"},{"metric":"normalized_entities","value":3832,"threshold":null,"status":"INFO"},{"metric":"dedup_ratio","value":"1.1%","threshold":null,"status":"INFO"},{"metric":"db_inserted","value":13,"threshold":null,"status":"INFO"},{"metric":"db_updated","value":9,"threshold":null,"status":"INFO"},{"metric":"total_in_db","value":3859,"threshold":">= 3832","status":"PASS"},{"metric":"corporations","value":1142,"threshold":null,"status":"INFO"},{"metric":"individuals","value":2690,"threshold":null,"status":"INFO"},{"metric":"backfilled_entity_type","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":7648.7,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":501,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["builder_name"]},"writes":{"entities":["legal_name","name_normalized","permit_count","entity_type","last_seen_at"]}}

[extract-builders] completed in 0.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=1019ms

### C2: PASS
**Evidence:** id=3302 status=completed completed_at=Wed May 20 2026 16:40:27 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 11 audit rows: [raw_names_distinct, normalized_entities, dedup_ratio, db_inserted, db_updated, total_in_db, corporations, individuals, backfilled_entity_type, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 7 records_meta keys: [telemetry, db_inserts, db_updates, duration_ms, pipeline_meta, raw_names_found, normalized_unique_entities]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"entities":{"pre":3846,"post":3859,"delta":13}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=3819 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=3819 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"entities":{"pre":3846,"post":3859,"delta":13}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=3819 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
