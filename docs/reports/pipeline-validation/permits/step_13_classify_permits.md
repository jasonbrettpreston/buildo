# Step 13: classify_permits
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1377443},"lead_trades":{"ok":true,"n":0}}
- Last 3 runs: [
  {
    "id": 3150,
    "status": "completed",
    "completed_at": "2026-05-08T22:32:44.665Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:29:42.047Z",
    "duration_ms": "182618"
  },
  {
    "id": 3122,
    "status": "completed",
    "completed_at": "2026-05-08T21:55:09.644Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:51:14.014Z",
    "duration_ms": "235630"
  },
  {
    "id": 3055,
    "status": "completed",
    "completed_at": "2026-05-08T18:19:21.307Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:16:05.930Z",
    "duration_ms": "195377"
  }
]

## Execution
- Command: `node scripts/classify-permits.js`
- Exit code: 0
- Duration: 197536ms
- New `pipeline_runs.id`: 3150

## Post-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237132},"lead_trades":{"ok":true,"n":1145045}}
- New run: {"id":3150,"status":"completed","verdict":"PASS","duration_ms":"182618","records_total":229702,"records_new":0,"records_updated":226111}

### audit_table.rows
```json
[
  {
    "value": 229702,
    "metric": "permits_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 226111,
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
    "value": 1293820,
    "metric": "total_trade_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1293820,
    "metric": "permit_trades_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 219561,
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
    "value": 1039,
    "metric": "class.administrative",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6551,
    "metric": "class.safety_upgrade",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2551,
    "metric": "class.unclassified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1316.72,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 174450,
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
      },
      "permit_trades": {
        "after": 1377443,
        "delta": -6,
        "before": 1377449
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 12693426,
        "seq_scan": 1032,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.6743,
        "n_dead_tup": 512856,
        "n_live_tup": 247703
      },
      "permit_trades": {
        "idx_scan": 10117679,
        "seq_scan": 122,
        "seq_ratio": 0,
        "dead_ratio": 0.4429,
        "n_dead_tup": 1111828,
        "n_live_tup": 1398294
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 229702
      },
      "permit_trades": {
        "del": 10,
        "ins": 4,
        "upd": 1293816
      }
    },
    "null_fills": {
      "permits": {
        "trade_classified_at": {
          "after": 0,
          "before": 0,
          "filled": 0
        }
      }
    }
  },
  "db_updated": 1293820,
  "duration_ms": 155364,
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
  "permits_processed": 229702,
  "permits_with_trades": 226111,
  "total_trade_matches": 1293820,
  "avg_trades_per_permit": 5.72
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-permits]","msg":"Mode: INCREMENTAL, permits to classify: 229,211"}
  [classify-permits] 10,000 / 229,211 (4.4%) — 9.2s — 1086 rows/s
  [classify-permits] 20,000 / 229,211 (8.7%) — 16.1s — 1239 rows/s
  [classify-permits] 30,000 / 229,211 (13.1%) — 23.5s — 1274 rows/s
  [classify-permits] 40,000 / 229,211 (17.5%) — 30.5s — 1310 rows/s
  [classify-permits] 50,000 / 229,211 (21.8%) — 37.2s — 1342 rows/s
  [classify-permits] 60,000 / 229,211 (26.2%) — 45.0s — 1332 rows/s
  [classify-permits] 70,000 / 229,211 (30.5%) — 53.0s — 1321 rows/s
  [classify-permits] 80,000 / 229,211 (34.9%) — 61.2s — 1307 rows/s
  [classify-permits] 90,000 / 229,211 (39.3%) — 70.4s — 1279 rows/s
  [classify-permits] 100,000 / 229,211 (43.6%) — 78.6s — 1273 rows/s
  [classify-permits] 110,000 / 229,211 (48.0%) — 86.3s — 1274 rows/s
  [classify-permits] 120,000 / 229,211 (52.4%) — 94.5s — 1269 rows/s
  [classify-permits] 130,000 / 229,211 (56.7%) — 103.3s — 1259 rows/s
  [classify-permits] 140,000 / 229,211 (61.1%) — 112.7s — 1242 rows/s
  [classify-permits] 150,000 / 229,211 (65.4%) — 121.4s — 1235 rows/s
  [classify-permits] 160,000 / 229,211 (69.8%) — 129.0s — 1240 rows/s
  [classify-permits] 170,000 / 229,211 (74.2%) — 138.1s — 1231 rows/s
  [classify-permits] 180,000 / 229,211 (78.5%) — 146.4s — 1230 rows/s
  [classify-permits] 190,000 / 229,211 (82.9%) — 154.5s — 1229 rows/s
  [classify-permits] 200,000 / 229,211 (87.3%) — 162.1s — 1234 rows/s
  [classify-permits] 210,000 / 229,211 (91.6%) — 169.5s — 1239 rows/s
  [classify-permits] 220,000 / 229,211 (96.0%) — 176.7s — 1245 rows/s
  [classify-permits] 229,211 / 229,211 (100.0%) — 184.7s — 1241 rows/s
{"level":"INFO","tag":"[classify-permits]","msg":"Classification complete","context":{"processed":229211,"permits_with_trades":225541,"total_matches":1145045,"avg_trades":"5.1","db_changes":1145045,"duration":"184.7s"}}
PIPELINE_SUMMARY:{"records_total":229211,"records_new":1207,"records_updated":225541,"records_meta":{"duration_ms":184730,"permits_processed":229211,"permits_with_trades":225541,"total_trade_matches":1145045,"avg_trades_per_permit":5.08,"db_updated":1145045,"audit_table":{"phase":11,"name":"Trade Classification","verdict":"PASS","rows":[{"metric":"permits_processed","value":229211,"threshold":null,"status":"INFO"},{"metric":"run_classified","value":225541,"threshold":null,"status":"INFO"},{"metric":"classification_coverage","value":"98.5%","threshold":">= 95%","status":"PASS"},{"metric":"total_trade_matches","value":1145045,"threshold":null,"status":"INFO"},{"metric":"permit_trades_written","value":1145045,"threshold":null,"status":"INFO"},{"metric":"class.construction","value":219044,"threshold":null,"status":"INFO"},{"metric":"class.signage","value":0,"threshold":null,"status":"INFO"},{"metric":"class.administrative","value":1049,"threshold":null,"status":"INFO"},{"metric":"class.safety_upgrade","value":6550,"threshold":null,"status":"INFO"},{"metric":"class.unclassified","value":2568,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1161.16,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":197398,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","work","description","status","est_const_cost","issued_date","current_use","proposed_use","scope_tags","last_seen_at"],"trade_mapping_rules":["id","trade_id","tier","match_field","match_pattern","confidence","phase_start","phase_end","is_active"]},"writes":{"permit_trades":["permit_num","revision_num","trade_id","tier","confidence","is_active","phase","lead_score","classified_at"]}}

[classify-permits] completed in 197.4s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=197536ms

### C2: PASS
**Evidence:** id=3150 status=completed completed_at=Fri May 08 2026 18:32:44 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=226111; deltas={"permit_trades":{"pre":1377443,"post":1237132,"delta":-140311},"lead_trades":{"pre":0,"post":1145045,"delta":1145045}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=229702 records_new=0 records_updated=226111; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=229702 records_new=0 records_updated=226111
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=226111; deltas={"permit_trades":{"pre":1377443,"post":1237132,"delta":-140311},"lead_trades":{"pre":0,"post":1145045,"delta":1145045}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229702 records_new=0 records_updated=226111; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
