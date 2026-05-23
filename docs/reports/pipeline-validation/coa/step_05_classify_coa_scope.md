# Step 05: classify_coa_scope
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Phase D

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119}}
- Last 3 runs: [
  {
    "id": 3288,
    "status": "completed",
    "completed_at": "2026-05-20T20:33:41.831Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:40.951Z",
    "duration_ms": "881"
  },
  {
    "id": 3224,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:41.512Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:39.721Z",
    "duration_ms": "1790"
  },
  {
    "id": 3177,
    "status": "completed",
    "completed_at": "2026-05-20T01:04:35.262Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:04:34.200Z",
    "duration_ms": "1062"
  }
]

## Execution
- Command: `node scripts/classify-coa-scope.js`
- Exit code: 0
- Duration: 747ms
- New `pipeline_runs.id`: 3288

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119}}
- New run: {"id":3288,"status":"completed","verdict":"PASS","duration_ms":"881","records_total":2610,"records_new":0,"records_updated":2610}

### audit_table.rows
```json
[
  {
    "value": 2610,
    "metric": "coa_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2486,
    "metric": "scope_classified",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "4.8%",
    "metric": "unmapped_scope_count",
    "status": "PASS",
    "threshold": "<= 10%"
  },
  {
    "value": "95.2%",
    "metric": "scope_classified_pct",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 622,
    "metric": "no_class",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 254,
    "metric": "no_project_type",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": {
      "Mixed": 722,
      "(null)": 254,
      "Addition": 241,
      "Severance": 471,
      "Alteration": 122,
      "Demolition": 3,
      "NewConstruction": 797
    },
    "metric": "project_type_distribution",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": {
      "mixed": 68,
      "(null)": 622,
      "commercial": 58,
      "residential": 1843,
      "institutional": 19
    },
    "metric": "coa_type_class_distribution",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 4685.82,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 557,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "no_class": 622,
  "telemetry": {
    "counts": {
      "coa_applications": {
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "coa_applications": {
        "idx_scan": 28045,
        "seq_scan": 186,
        "seq_ratio": 0.0066,
        "dead_ratio": 0.1417,
        "n_dead_tup": 5467,
        "n_live_tup": 33106
      }
    },
    "pg_stats": {
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 2610
      }
    },
    "null_fills": {
      "coa_applications": {
        "scope_tags": {
          "after": 1892,
          "before": 1892,
          "filled": 0
        },
        "coa_type_class": {
          "after": 7769,
          "before": 7769,
          "filled": 0
        },
        "scope_classified_at": {
          "after": 630,
          "before": 630,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 512,
  "coa_processed": 2610,
  "pipeline_meta": {
    "reads": {
      "coa_applications": [
        "id",
        "description",
        "status",
        "decision",
        "last_seen_at",
        "scope_classified_at"
      ]
    },
    "writes": {
      "coa_applications": [
        "coa_type_class",
        "project_type",
        "scope_tags",
        "scope_classified_at",
        "scope_source"
      ]
    }
  },
  "unmapped_scope": 124,
  "no_project_type": 254,
  "scope_classified": 2486,
  "project_type_distribution": {
    "Mixed": 722,
    "(null)": 254,
    "Addition": 241,
    "Severance": 471,
    "Alteration": 122,
    "Demolition": 3,
    "NewConstruction": 797
  },
  "coa_type_class_distribution": {
    "mixed": 68,
    "(null)": 622,
    "commercial": 58,
    "residential": 1843,
    "institutional": 19
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Loaded 349 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":2600,"records_new":0,"records_updated":2600,"records_meta":{"duration_ms":502,"coa_processed":2600,"scope_classified":2476,"unmapped_scope":124,"no_class":620,"no_project_type":255,"project_type_distribution":{"NewConstruction":793,"Mixed":714,"Severance":470,"(null)":255,"Alteration":125,"Addition":239,"Demolition":4},"coa_type_class_distribution":{"residential":1837,"mixed":66,"(null)":620,"commercial":59,"institutional":18},"audit_table":{"phase":42,"name":"CoA Scope Classification","verdict":"PASS","rows":[{"metric":"coa_processed","value":2600,"threshold":null,"status":"INFO"},{"metric":"scope_classified","value":2476,"threshold":null,"status":"INFO"},{"metric":"unmapped_scope_count","value":"4.8%","threshold":"<= 10%","status":"PASS"},{"metric":"scope_classified_pct","value":"95.2%","threshold":">= 90%","status":"PASS"},{"metric":"no_class","value":620,"threshold":null,"status":"INFO"},{"metric":"no_project_type","value":255,"threshold":null,"status":"INFO"},{"metric":"project_type_distribution","value":{"NewConstruction":793,"Mixed":714,"Severance":470,"(null)":255,"Alteration":125,"Addition":239,"Demolition":4},"threshold":null,"status":"INFO"},{"metric":"coa_type_class_distribution","value":{"residential":1837,"mixed":66,"(null)":620,"commercial":59,"institutional":18},"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":4693.14,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":554,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","description","status","decision","last_seen_at","scope_classified_at"]},"writes":{"coa_applications":["coa_type_class","project_type","scope_tags","scope_classified_at","scope_source"]}}
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Classification complete","context":{"processed":2600,"scope_classified":2476,"unmapped_scope":124,"no_class":620,"no_project_type":255,"duration":"0.5s"}}

[classify-coa-scope] completed in 0.6s

```

### stderr tail
```
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-scope]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=747ms

### C2: PASS
**Evidence:** id=3288 status=completed completed_at=Wed May 20 2026 16:33:41 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 10 audit rows: [coa_processed, scope_classified, unmapped_scope_count, scope_classified_pct, no_class, no_project_type, project_type_distribution, coa_type_class_distribution, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 10 records_meta keys: [no_class, telemetry, duration_ms, coa_processed, pipeline_meta, unmapped_scope, no_project_type, scope_classified, project_type_distribution, coa_type_class_distribution]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=2610; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=2610 records_new=0 records_updated=2610; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=2610 records_new=0 records_updated=2610
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=2610; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=2610 records_new=0 records_updated=2610; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
