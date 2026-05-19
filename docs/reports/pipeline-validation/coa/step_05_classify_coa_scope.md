# Step 05: classify_coa_scope
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Phase D

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106}}
- Last 3 runs: []

## Execution
- Command: `node scripts/classify-coa-scope.js`
- Exit code: 0
- Duration: 640ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106}}
- New run: {}

### audit_table.rows
```json
null
```

### records_meta (minus audit_table)
```json
null
```

### stdout tail
```
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Loaded 115 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":2611,"records_new":0,"records_updated":2611,"records_meta":{"duration_ms":409,"coa_processed":2611,"scope_classified":2486,"unmapped_scope":125,"no_class":623,"no_project_type":255,"project_type_distribution":{"NewConstruction":797,"Mixed":722,"Severance":471,"(null)":255,"Alteration":122,"Addition":241,"Demolition":3},"coa_type_class_distribution":{"residential":1843,"mixed":68,"(null)":623,"commercial":58,"institutional":19},"audit_table":{"phase":42,"name":"CoA Scope Classification","verdict":"PASS","rows":[{"metric":"coa_processed","value":2611,"threshold":null,"status":"INFO"},{"metric":"scope_classified","value":2486,"threshold":null,"status":"INFO"},{"metric":"unmapped_scope_count","value":"4.8%","threshold":"<= 10%","status":"PASS"},{"metric":"scope_classified_pct","value":"95.2%","threshold":">= 90%","status":"PASS"},{"metric":"no_class","value":623,"threshold":null,"status":"INFO"},{"metric":"no_project_type","value":255,"threshold":null,"status":"INFO"},{"metric":"project_type_distribution","value":{"NewConstruction":797,"Mixed":722,"Severance":471,"(null)":255,"Alteration":122,"Addition":241,"Demolition":3},"threshold":null,"status":"INFO"},{"metric":"coa_type_class_distribution","value":{"residential":1843,"mixed":68,"(null)":623,"commercial":58,"institutional":19},"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":5713.35,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":457,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","description","status","decision","last_seen_at","scope_classified_at"]},"writes":{"coa_applications":["coa_type_class","project_type","scope_tags","scope_classified_at","scope_source"]}}
{"level":"INFO","tag":"[classify-coa-scope]","msg":"Classification complete","context":{"processed":2611,"scope_classified":2486,"unmapped_scope":125,"no_class":623,"no_project_type":255,"duration":"0.4s"}}

[classify-coa-scope] completed in 0.5s

```

### stderr tail
```
{"level":"WARN","tag":"[classify-coa-scope]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=640ms

### C2: FAIL
**Evidence:** no new pipeline_runs row found

### C3: INVESTIGATE
**Evidence:** verdict=null (missing or unexpected)

### C4: INVESTIGATE
**Evidence:** audit_table.rows empty or missing

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: INVESTIGATE
**Evidence:** records_meta empty or audit_table-only

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: INVESTIGATE
**Evidence:** no pipeline_runs row

### C12: INVESTIGATE
**Evidence:** tripwire(s) INVESTIGATE

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INVESTIGATE — undefined
- **T4:** INVESTIGATE — undefined
- **T5:** INVESTIGATE — undefined
- **T12:** INVESTIGATE — undefined

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
