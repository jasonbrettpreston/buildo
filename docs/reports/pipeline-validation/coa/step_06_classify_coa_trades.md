# Step 06: classify_coa_trades
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Phase D

## Pre-run state
- Output table counts: {"lead_trades":{"ok":true,"n":1145045}}
- Last 3 runs: []

## Execution
- Command: `node scripts/classify-coa-trades.js`
- Exit code: 0
- Duration: 24749ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"lead_trades":{"ok":true,"n":1584824}}
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
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Loaded 115 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":31214,"records_new":439779,"records_updated":0,"records_meta":{"duration_ms":24493,"coa_processed":31214,"coa_with_trades":29923,"coa_zero_trades":1291,"residential_count":23651,"realtor_append_count":23651,"slug_resolution_miss_count":0,"slug_resolution_misses":[],"trade_slug_distribution":{"drywall":28502,"electrical":28598,"flooring":27366,"framing":27983,"hvac":27441,"insulation":27435,"painting":27492,"plumbing":28083,"waterproofing":26299,"realtor":23651,"concrete":27884,"excavation":26449,"glazing":26333,"landscaping":26375,"masonry":26375,"roofing":27694,"fire-protection":2789,"demolition":2534,"elevator":496},"coa_trades_per_lead_histogram":{"0":1291,"1":1317,"2":6,"4":71,"5":248,"6":213,"7":843,"8":366,"9":54,"10":175,"11":160,"12":66,"13":22,"14":11,"15":3867,"16":19323,"17":2857,"18":307,"19":17},"audit_table":{"phase":42,"name":"CoA Trade Classification","verdict":"PASS","rows":[{"metric":"coa_eligible","value":31214,"threshold":"> 0","status":"PASS"},{"metric":"coa_with_trades","value":29923,"threshold":null,"status":"INFO"},{"metric":"coa_zero_trades","value":1291,"threshold":null,"status":"INFO"},{"metric":"unmapped_scope_pct","value":"4.1%","threshold":"<= 20%","status":"PASS"},{"metric":"realtor_inclusion_pct","value":"100.0%","threshold":null,"status":"INFO"},{"metric":"avg_trades_per_lead","value":"14.70","threshold":null,"status":"INFO"},{"metric":"slug_resolution_miss_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"records_new","value":439779,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"total_lead_trades_written","value":439779,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1271.91,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":24541,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","lead_id","scope_tags","coa_type_class","scope_classified_at","trade_classified_at"],"trades":["id","slug"]},"writes":{"lead_trades":["lead_id","trade_id","tier","confidence","is_active","phase","lead_score","classified_at"],"coa_applications":["trade_classified_at"]}}
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Classification complete","context":{"processed":31214,"coa_with_trades":29923,"coa_zero_trades":1291,"records_new":439779,"records_updated":0,"slug_resolution_miss_count":0,"duration":"24.5s"}}

[classify-coa-trades] completed in 24.5s

```

### stderr tail
```
{"level":"WARN","tag":"[classify-coa-trades]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=24749ms

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
**Evidence:** claimed records_new+records_updated=0; deltas={"lead_trades":{"pre":1145045,"post":1584824,"delta":439779}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"lead_trades":{"pre":1145045,"post":1584824,"delta":439779}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
