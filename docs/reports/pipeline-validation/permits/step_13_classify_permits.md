# Step 13: classify_permits
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1236223},"lead_trades":{"ok":true,"n":1584828}}
- Last 3 runs: [
  {
    "id": 3309,
    "status": "completed",
    "completed_at": "2026-05-20T20:46:40.336Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:42:41.512Z",
    "duration_ms": "238824"
  },
  {
    "id": 3263,
    "status": "completed",
    "completed_at": "2026-05-20T02:13:32.231Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:10:34.972Z",
    "duration_ms": "177258"
  },
  {
    "id": 3218,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:40.158Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:47:04.794Z",
    "duration_ms": "215364"
  }
]

## Execution
- Command: `node scripts/classify-permits.js`
- Exit code: 0
- Duration: 213171ms
- New `pipeline_runs.id`: 3309

## Post-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237730},"lead_trades":{"ok":true,"n":1586336}}
- New run: {"id":3309,"status":"completed","verdict":"PASS","duration_ms":"238824","records_total":229206,"records_new":2,"records_updated":225534}

### audit_table.rows
```json
[
  {
    "value": 229206,
    "metric": "permits_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 225534,
    "metric": "run_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "98.5%",
    "metric": "classification_coverage",
    "status": "PASS",
    "threshold": ">= 95%"
  },
  {
    "value": 1145036,
    "metric": "total_trade_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1145036,
    "metric": "permit_trades_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 219037,
    "metric": "class.construction",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "class.signage",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1049,
    "metric": "class.administrative",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6550,
    "metric": "class.safety_upgrade",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2570,
    "metric": "class.unclassified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 983.06,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 233156,
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
      },
      "permit_trades": {
        "after": 1236223,
        "delta": 0,
        "before": 1236223
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 7652353,
        "seq_scan": 676,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.6853,
        "n_dead_tup": 541816,
        "n_live_tup": 248813
      },
      "permit_trades": {
        "idx_scan": 6450839,
        "seq_scan": 86,
        "seq_ratio": 0,
        "dead_ratio": 0.447,
        "n_dead_tup": 996268,
        "n_live_tup": 1232652
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 229206
      },
      "permit_trades": {
        "del": 0,
        "ins": 0,
        "upd": 1145036
      }
    },
    "null_fills": {
      "permits": {
        "trade_classified_at": {
          "after": 0,
          "before": 2,
          "filled": 2
        }
      }
    }
  },
  "db_updated": 1145036,
  "duration_ms": 222286,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "permit_type",
        "structure_type",
        "work",
        "description",
        "status",
        "est_const_cost",
        "issued_date",
        "current_use",
        "proposed_use",
        "scope_tags",
        "last_seen_at"
      ],
      "trade_mapping_rules": [
        "id",
        "trade_id",
        "tier",
        "match_field",
        "match_pattern",
        "confidence",
        "phase_start",
        "phase_end",
        "is_active"
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
        "phase",
        "lead_score",
        "classified_at"
      ]
    }
  },
  "permits_processed": 229206,
  "permits_with_trades": 225534,
  "total_trade_matches": 1145036,
  "avg_trades_per_permit": 5.08
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-permits]","msg":"Mode: INCREMENTAL, permits to classify: 229,060"}
  [classify-permits] 10,000 / 229,060 (4.4%) — 12.8s — 778 rows/s
  [classify-permits] 20,000 / 229,060 (8.7%) — 20.1s — 993 rows/s
  [classify-permits] 30,000 / 229,060 (13.1%) — 29.1s — 1031 rows/s
  [classify-permits] 40,000 / 229,060 (17.5%) — 37.1s — 1079 rows/s
  [classify-permits] 50,000 / 229,060 (21.8%) — 44.4s — 1126 rows/s
  [classify-permits] 60,000 / 229,060 (26.2%) — 52.7s — 1138 rows/s
  [classify-permits] 70,000 / 229,060 (30.6%) — 61.9s — 1132 rows/s
  [classify-permits] 80,000 / 229,060 (34.9%) — 71.1s — 1126 rows/s
  [classify-permits] 90,000 / 229,060 (39.3%) — 81.2s — 1108 rows/s
  [classify-permits] 100,000 / 229,060 (43.7%) — 90.0s — 1111 rows/s
  [classify-permits] 110,000 / 229,060 (48.0%) — 98.8s — 1113 rows/s
  [classify-permits] 120,000 / 229,060 (52.4%) — 108.0s — 1111 rows/s
  [classify-permits] 130,000 / 229,060 (56.8%) — 117.5s — 1106 rows/s
  [classify-permits] 140,000 / 229,060 (61.1%) — 126.6s — 1106 rows/s
  [classify-permits] 150,000 / 229,060 (65.5%) — 135.3s — 1109 rows/s
  [classify-permits] 160,000 / 229,060 (69.9%) — 143.4s — 1115 rows/s
  [classify-permits] 170,000 / 229,060 (74.2%) — 152.6s — 1114 rows/s
  [classify-permits] 180,000 / 229,060 (78.6%) — 160.8s — 1120 rows/s
  [classify-permits] 190,000 / 229,060 (82.9%) — 169.0s — 1124 rows/s
  [classify-permits] 200,000 / 229,060 (87.3%) — 177.1s — 1129 rows/s
  [classify-permits] 210,000 / 229,060 (91.7%) — 184.4s — 1139 rows/s
  [classify-permits] 220,000 / 229,060 (96.0%) — 191.9s — 1147 rows/s
  [classify-permits] 229,060 / 229,060 (100.0%) — 199.5s — 1148 rows/s
{"level":"INFO","tag":"[classify-permits]","msg":"Classification complete","context":{"processed":229060,"permits_with_trades":225393,"total_matches":1144482,"avg_trades":"5.1","db_changes":1144482,"duration":"199.5s"}}
PIPELINE_SUMMARY:{"records_total":229060,"records_new":355,"records_updated":225393,"records_meta":{"duration_ms":199502,"permits_processed":229060,"permits_with_trades":225393,"total_trade_matches":1144482,"avg_trades_per_permit":5.08,"db_updated":1144482,"audit_table":{"phase":11,"name":"Trade Classification","verdict":"PASS","rows":[{"metric":"permits_processed","value":229060,"threshold":null,"status":"INFO"},{"metric":"run_classified","value":225393,"threshold":null,"status":"INFO"},{"metric":"classification_coverage","value":"98.5%","threshold":">= 95%","status":"PASS"},{"metric":"total_trade_matches","value":1144482,"threshold":null,"status":"INFO"},{"metric":"permit_trades_written","value":1144482,"threshold":null,"status":"INFO"},{"metric":"class.construction","value":218900,"threshold":null,"status":"INFO"},{"metric":"class.signage","value":0,"threshold":null,"status":"INFO"},{"metric":"class.administrative","value":1050,"threshold":null,"status":"INFO"},{"metric":"class.safety_upgrade","value":6545,"threshold":null,"status":"INFO"},{"metric":"class.unclassified","value":2565,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1075.35,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":213009,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","work","description","status","est_const_cost","issued_date","current_use","proposed_use","scope_tags","last_seen_at"],"trade_mapping_rules":["id","trade_id","tier","match_field","match_pattern","confidence","phase_start","phase_end","is_active"]},"writes":{"permit_trades":["permit_num","revision_num","trade_id","tier","confidence","is_active","phase","lead_score","classified_at"]}}

[classify-permits] completed in 213.0s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=213171ms

### C2: PASS
**Evidence:** id=3309 status=completed completed_at=Wed May 20 2026 16:46:40 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 12 audit rows: [permits_processed, run_classified, classification_coverage, total_trade_matches, permit_trades_written, class.construction, class.signage, class.administrative, class.safety_upgrade, class.unclassified, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 8 records_meta keys: [telemetry, db_updated, duration_ms, pipeline_meta, permits_processed, permits_with_trades, total_trade_matches, avg_trades_per_permit]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=225536; deltas={"permit_trades":{"pre":1236223,"post":1237730,"delta":1507},"lead_trades":{"pre":1584828,"post":1586336,"delta":1508}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=229206 records_new=2 records_updated=225534; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=229206 records_new=2 records_updated=225534
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=225536; deltas={"permit_trades":{"pre":1236223,"post":1237730,"delta":1507},"lead_trades":{"pre":1584828,"post":1586336,"delta":1508}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229206 records_new=2 records_updated=225534; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
