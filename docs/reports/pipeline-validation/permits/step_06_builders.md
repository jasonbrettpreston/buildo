# Step 06: builders
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Entity extraction from applicant names

## Pre-run state
- Output table counts: {"entities":{"ok":true,"n":3818}}
- Last 3 runs: [
  {
    "id": 3143,
    "status": "completed",
    "completed_at": "2026-05-08T22:26:47.249Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:26:46.514Z",
    "duration_ms": "735"
  },
  {
    "id": 3115,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.003Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.003Z",
    "duration_ms": "0"
  },
  {
    "id": 3048,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.922Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.922Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/extract-builders.js`
- Exit code: 0
- Duration: 713ms
- New `pipeline_runs.id`: 3143

## Post-run state
- Output table counts: {"entities":{"ok":true,"n":3846}}
- New run: {"id":3143,"status":"completed","verdict":"PASS","duration_ms":"735","records_total":3791,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 3832,
    "metric": "raw_names_distinct",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3791,
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
    "value": 3818,
    "metric": "total_in_db",
    "status": "PASS",
    "threshold": ">= 3791"
  },
  {
    "value": 1125,
    "metric": "corporations",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2666,
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
    "value": 6447.28,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 588,
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
        "after": 3818,
        "delta": 0,
        "before": 3818
      }
    },
    "engine": {
      "entities": {
        "idx_scan": 18145,
        "seq_scan": 91,
        "seq_ratio": 0.005,
        "dead_ratio": 0.0016,
        "n_dead_tup": 6,
        "n_live_tup": 3818
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
          "after": 3191,
          "before": 3191,
          "filled": 0
        },
        "primary_email": {
          "after": 3510,
          "before": 3510,
          "filled": 0
        },
        "primary_phone": {
          "after": 3309,
          "before": 3309,
          "filled": 0
        }
      }
    }
  },
  "db_inserts": 0,
  "db_updates": 0,
  "duration_ms": 476,
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
  "raw_names_found": 3832,
  "normalized_unique_entities": 3791
}
```

### stdout tail
```
{"level":"INFO","tag":"[extract-builders]","msg":"Extracting builders from permits..."}
{"level":"INFO","tag":"[extract-builders]","msg":"Found 3,861 unique raw builder names"}
{"level":"INFO","tag":"[extract-builders]","msg":"Normalized to 3,819 unique builders"}
  [extract-builders] 1,000 / 3,819 (26.2%) — 0.5s — 2203 rows/s
  [extract-builders] 2,000 / 3,819 (52.4%) — 0.5s — 4219 rows/s
  [extract-builders] 3,000 / 3,819 (78.6%) — 0.5s — 6048 rows/s
  [extract-builders] 3,819 / 3,819 (100.0%) — 0.5s — 7444 rows/s
{"level":"INFO","tag":"[extract-builders]","msg":"Complete","context":{"total_in_db":3846,"raw_names":3861,"normalized":3819,"corporations":1140,"individuals":2679,"inserted":28,"updated":30,"unchanged":3761,"backfilled":0,"duration":"0.5s"}}
PIPELINE_SUMMARY:{"records_total":3819,"records_new":28,"records_updated":30,"records_meta":{"duration_ms":516,"raw_names_found":3861,"normalized_unique_entities":3819,"db_inserts":28,"db_updates":30,"audit_table":{"phase":4,"name":"Builder Extraction","verdict":"PASS","rows":[{"metric":"raw_names_distinct","value":3861,"threshold":null,"status":"INFO"},{"metric":"normalized_entities","value":3819,"threshold":null,"status":"INFO"},{"metric":"dedup_ratio","value":"1.1%","threshold":null,"status":"INFO"},{"metric":"db_inserted","value":28,"threshold":null,"status":"INFO"},{"metric":"db_updated","value":30,"threshold":null,"status":"INFO"},{"metric":"total_in_db","value":3846,"threshold":">= 3819","status":"PASS"},{"metric":"corporations","value":1140,"threshold":null,"status":"INFO"},{"metric":"individuals","value":2679,"threshold":null,"status":"INFO"},{"metric":"backfilled_entity_type","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":6365,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":600,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["builder_name"]},"writes":{"entities":["legal_name","name_normalized","permit_count","entity_type","last_seen_at"]}}

[extract-builders] completed in 0.6s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=713ms

### C2: PASS
**Evidence:** id=3143 status=completed completed_at=Fri May 08 2026 18:26:47 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=0; deltas={"entities":{"pre":3818,"post":3846,"delta":28}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=3791 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=3791 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"entities":{"pre":3818,"post":3846,"delta":28}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=3791 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
