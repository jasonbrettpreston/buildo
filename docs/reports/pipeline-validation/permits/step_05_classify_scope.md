# Step 05: classify_scope
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
    "id": 3142,
    "status": "completed",
    "completed_at": "2026-05-08T22:26:46.501Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:24:14.279Z",
    "duration_ms": "152222"
  },
  {
    "id": 3114,
    "status": "completed",
    "completed_at": "2026-05-08T21:51:13.996Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:48:33.425Z",
    "duration_ms": "160570"
  },
  {
    "id": 3047,
    "status": "completed",
    "completed_at": "2026-05-08T18:16:05.917Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:13:37.782Z",
    "duration_ms": "148135"
  }
]

## Execution
- Command: `node scripts/classify-scope.js`
- Exit code: 0
- Duration: 112928ms
- New `pipeline_runs.id`: 3142

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3142,"status":"completed","verdict":"PASS","duration_ms":"152222","records_total":229702,"records_new":0,"records_updated":229702}

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
    "value": 215635,
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
    "value": 0,
    "metric": "newly_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 77702,
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
    "value": 1625.83,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 141283,
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
        "idx_scan": 12325628,
        "seq_scan": 994,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.5534,
        "n_dead_tup": 305098,
        "n_live_tup": 246168
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 307408
      }
    },
    "null_fills": {
      "permits": {
        "scope_classified_at": {
          "after": 0,
          "before": 0,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 127800,
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
  "permits_processed": 229702,
  "permits_with_tags": 215635,
  "propagated_companions": 77702
}
```

### stdout tail
```
  [classify-scope] 30,000 / 229,211 (13.1%) — 6.8s — 4383 rows/s
  [classify-scope] 40,000 / 229,211 (17.5%) — 8.8s — 4546 rows/s
  [classify-scope] 50,000 / 229,211 (21.8%) — 11.2s — 4452 rows/s
  [classify-scope] 60,000 / 229,211 (26.2%) — 13.2s — 4542 rows/s
  [classify-scope] 70,000 / 229,211 (30.5%) — 15.1s — 4621 rows/s
  [classify-scope] 80,000 / 229,211 (34.9%) — 17.8s — 4501 rows/s
  [classify-scope] 90,000 / 229,211 (39.3%) — 20.5s — 4400 rows/s
  [classify-scope] 100,000 / 229,211 (43.6%) — 22.9s — 4364 rows/s
  [classify-scope] 110,000 / 229,211 (48.0%) — 25.5s — 4311 rows/s
  [classify-scope] 120,000 / 229,211 (52.4%) — 27.6s — 4347 rows/s
  [classify-scope] 130,000 / 229,211 (56.7%) — 29.9s — 4346 rows/s
  [classify-scope] 140,000 / 229,211 (61.1%) — 32.9s — 4254 rows/s
  [classify-scope] 150,000 / 229,211 (65.4%) — 36.1s — 4153 rows/s
  [classify-scope] 160,000 / 229,211 (69.8%) — 39.1s — 4095 rows/s
  [classify-scope] 170,000 / 229,211 (74.2%) — 41.5s — 4093 rows/s
  [classify-scope] 180,000 / 229,211 (78.5%) — 44.2s — 4076 rows/s
  [classify-scope] 190,000 / 229,211 (82.9%) — 47.2s — 4023 rows/s
  [classify-scope] 200,000 / 229,211 (87.3%) — 51.2s — 3904 rows/s
  [classify-scope] 210,000 / 229,211 (91.6%) — 54.3s — 3867 rows/s
  [classify-scope] 220,000 / 229,211 (96.0%) — 57.4s — 3832 rows/s
{"level":"INFO","tag":"[classify-scope]","msg":"BLD→Companion scope propagation..."}
{"level":"INFO","tag":"[classify-scope]","msg":"Propagated: 77,691 companions, 4 DM tags restored"}
{"level":"INFO","tag":"[classify-scope]","msg":"Classification complete","context":{"processed":229211,"with_tags":215131,"propagated":77691,"dem_fixed":4,"duration":"105.0s"}}
{"level":"INFO","tag":"[classify-scope]","msg":"Type distribution","context":{"types":{"mechanical":108543,"renovation":38226,"other":28440,"addition":26640,"new_build":18702,"demolition":4365,"repair":4295}}}
{"level":"INFO","tag":"[classify-scope]","msg":"Top scope tags","context":{"tags":{"residential":140353,"commercial":87085,"plumbing":44891,"hvac":42029,"office":24220,"basement":21559,"alter:interior-alterations":19629,"new:addition":18737,"garage":17120,"drain":15950}}}
PIPELINE_SUMMARY:{"records_total":229211,"records_new":1207,"records_updated":228004,"records_meta":{"duration_ms":105026,"permits_processed":229211,"permits_with_tags":215131,"propagated_companions":77691,"demolitions_fixed":4,"audit_table":{"phase":3,"name":"Scope Classification","verdict":"PASS","rows":[{"metric":"permits_processed","value":229211,"threshold":null,"status":"INFO"},{"metric":"run_classified","value":215131,"threshold":null,"status":"INFO"},{"metric":"tags_coverage_rate","value":"100.0%","threshold":">= 50%","status":"PASS"},{"metric":"newly_classified","value":1207,"threshold":null,"status":"INFO"},{"metric":"scope_propagations","value":77691,"threshold":null,"status":"INFO"},{"metric":"dem_tag_fixes","value":4,"threshold":null,"status":"INFO"},{"metric":"top_project_type","value":"mechanical","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":2031.9,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":112806,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","work","description","current_use","proposed_use","storeys","housing_units","dwelling_units_created","scope_classified_at","last_seen_at"]},"writes":{"permits":["project_type","scope_tags","scope_classified_at","scope_source"]}}

[classify-scope] completed in 112.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=112928ms

### C2: PASS
**Evidence:** id=3142 status=completed completed_at=Fri May 08 2026 18:26:46 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=229702; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=229702 records_new=0 records_updated=229702; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=229702 records_new=0 records_updated=229702
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=229702; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229702 records_new=0 records_updated=229702; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
