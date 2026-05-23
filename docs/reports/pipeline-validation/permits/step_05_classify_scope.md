# Step 05: classify_scope
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
    "id": 3301,
    "status": "completed",
    "completed_at": "2026-05-20T20:40:26.539Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:38:06.893Z",
    "duration_ms": "139646"
  },
  {
    "id": 3255,
    "status": "completed",
    "completed_at": "2026-05-20T02:08:30.168Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:06:48.112Z",
    "duration_ms": "102056"
  },
  {
    "id": 3210,
    "status": "completed",
    "completed_at": "2026-05-20T01:44:44.281Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:42:40.865Z",
    "duration_ms": "123417"
  }
]

## Execution
- Command: `node scripts/classify-scope.js`
- Exit code: 0
- Duration: 94321ms
- New `pipeline_runs.id`: 3301

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447}}
- New run: {"id":3301,"status":"completed","verdict":"PASS","duration_ms":"139646","records_total":229206,"records_new":2,"records_updated":229204}

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
    "value": 215124,
    "metric": "run_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100.0%",
    "metric": "tags_coverage_rate",
    "status": "PASS",
    "threshold": ">= 50%"
  },
  {
    "value": 2,
    "metric": "newly_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 77661,
    "metric": "scope_propagations",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 4,
    "metric": "dem_tag_fixes",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "mechanical",
    "metric": "top_project_type",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1713.06,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 133799,
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
        "idx_scan": 7284446,
        "seq_scan": 637,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5536,
        "n_dead_tup": 348932,
        "n_live_tup": 281404
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 306871
      }
    },
    "null_fills": {
      "permits": {
        "scope_classified_at": {
          "after": 0,
          "before": 2,
          "filled": 2
        }
      }
    }
  },
  "duration_ms": 126291,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "permit_type",
        "structure_type",
        "work",
        "description",
        "current_use",
        "proposed_use",
        "storeys",
        "housing_units",
        "dwelling_units_created",
        "scope_classified_at",
        "last_seen_at"
      ]
    },
    "writes": {
      "permits": [
        "project_type",
        "scope_tags",
        "scope_classified_at",
        "scope_source"
      ]
    }
  },
  "demolitions_fixed": 4,
  "permits_processed": 229206,
  "permits_with_tags": 215124,
  "propagated_companions": 77661
}
```

### stdout tail
```
  [classify-scope] 30,000 / 229,060 (13.1%) — 6.5s — 4595 rows/s
  [classify-scope] 40,000 / 229,060 (17.5%) — 7.9s — 5086 rows/s
  [classify-scope] 50,000 / 229,060 (21.8%) — 9.2s — 5417 rows/s
  [classify-scope] 60,000 / 229,060 (26.2%) — 10.9s — 5495 rows/s
  [classify-scope] 70,000 / 229,060 (30.6%) — 12.3s — 5680 rows/s
  [classify-scope] 80,000 / 229,060 (34.9%) — 13.7s — 5838 rows/s
  [classify-scope] 90,000 / 229,060 (39.3%) — 15.0s — 6014 rows/s
  [classify-scope] 100,000 / 229,060 (43.7%) — 16.7s — 6002 rows/s
  [classify-scope] 110,000 / 229,060 (48.0%) — 18.4s — 5977 rows/s
  [classify-scope] 120,000 / 229,060 (52.4%) — 20.4s — 5881 rows/s
  [classify-scope] 130,000 / 229,060 (56.8%) — 22.5s — 5767 rows/s
  [classify-scope] 140,000 / 229,060 (61.1%) — 24.2s — 5796 rows/s
  [classify-scope] 150,000 / 229,060 (65.5%) — 26.0s — 5776 rows/s
  [classify-scope] 160,000 / 229,060 (69.9%) — 28.0s — 5722 rows/s
  [classify-scope] 170,000 / 229,060 (74.2%) — 29.7s — 5733 rows/s
  [classify-scope] 180,000 / 229,060 (78.6%) — 31.6s — 5702 rows/s
  [classify-scope] 190,000 / 229,060 (82.9%) — 33.2s — 5716 rows/s
  [classify-scope] 200,000 / 229,060 (87.3%) — 35.0s — 5717 rows/s
  [classify-scope] 210,000 / 229,060 (91.7%) — 37.4s — 5617 rows/s
  [classify-scope] 220,000 / 229,060 (96.0%) — 39.8s — 5534 rows/s
{"level":"INFO","tag":"[classify-scope]","msg":"BLD→Companion scope propagation..."}
{"level":"INFO","tag":"[classify-scope]","msg":"Propagated: 77,607 companions, 4 DM tags restored"}
{"level":"INFO","tag":"[classify-scope]","msg":"Classification complete","context":{"processed":229060,"with_tags":214983,"propagated":77607,"dem_fixed":4,"duration":"85.7s"}}
{"level":"INFO","tag":"[classify-scope]","msg":"Type distribution","context":{"types":{"mechanical":108438,"renovation":38211,"other":28425,"addition":26614,"new_build":18700,"demolition":4375,"repair":4297}}}
{"level":"INFO","tag":"[classify-scope]","msg":"Top scope tags","context":{"tags":{"residential":140290,"commercial":86995,"plumbing":44852,"hvac":41989,"office":24173,"basement":21534,"alter:interior-alterations":19606,"new:addition":18720,"garage":17102,"drain":15930}}}
PIPELINE_SUMMARY:{"records_total":229060,"records_new":355,"records_updated":228705,"records_meta":{"duration_ms":85653,"permits_processed":229060,"permits_with_tags":214983,"propagated_companions":77607,"demolitions_fixed":4,"audit_table":{"phase":3,"name":"Scope Classification","verdict":"PASS","rows":[{"metric":"permits_processed","value":229060,"threshold":null,"status":"INFO"},{"metric":"run_classified","value":214983,"threshold":null,"status":"INFO"},{"metric":"tags_coverage_rate","value":"100.0%","threshold":">= 50%","status":"PASS"},{"metric":"newly_classified","value":355,"threshold":null,"status":"INFO"},{"metric":"scope_propagations","value":77607,"threshold":null,"status":"INFO"},{"metric":"dem_tag_fixes","value":4,"threshold":null,"status":"INFO"},{"metric":"top_project_type","value":"mechanical","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":2431.61,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":94201,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","work","description","current_use","proposed_use","storeys","housing_units","dwelling_units_created","scope_classified_at","last_seen_at"]},"writes":{"permits":["project_type","scope_tags","scope_classified_at","scope_source"]}}

[classify-scope] completed in 94.2s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=94321ms

### C2: PASS
**Evidence:** id=3301 status=completed completed_at=Wed May 20 2026 16:40:26 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 9 audit rows: [permits_processed, run_classified, tags_coverage_rate, newly_classified, scope_propagations, dem_tag_fixes, top_project_type, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 7 records_meta keys: [telemetry, duration_ms, pipeline_meta, demolitions_fixed, permits_processed, permits_with_tags, propagated_companions]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=229206; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=229206 records_new=2 records_updated=229204; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=229206 records_new=2 records_updated=229204
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=229206; deltas={"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229206 records_new=2 records_updated=229204; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
