# Step 14: backfill_realtor_permit_trades
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Spec 84 §8.5

## Pre-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237132},"lead_trades":{"ok":true,"n":1145045}}
- Last 3 runs: []

## Execution
- Command: `node scripts/backfill-realtor-permit-trades.js`
- Exit code: 0
- Duration: 3679ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"permit_trades":{"ok":true,"n":1237132},"lead_trades":{"ok":true,"n":1145045}}
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
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Starting realtor permit_trades backfill"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Total realtor-eligible ACTIVE permits in scope: 69,063 (3-axis gate: construction class + REALTOR_RELEVANT_TYPES + non-commercial scope)"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Existing realtor rows in permit_trades: 74,777"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Backfill complete after 1 batch(es)"}
{"level":"INFO","tag":"[backfill-realtor-permit-trades]","msg":"Done. Inserted 0 new rows in 3391ms. Total realtor rows now: 74,777."}
PIPELINE_SUMMARY:{"records_total":69063,"records_new":0,"records_updated":0,"records_meta":{"backfill":{"phase":91,"name":"Backfill Realtor permit_trades","verdict":"PASS","rows":[{"metric":"realtor_rows_after_backfill","value":74777,"threshold":69063,"status":"PASS"},{"metric":"rows_inserted_this_run","value":0,"threshold":null,"status":"PASS"},{"metric":"completed_naturally","value":1,"threshold":1,"status":"PASS"},{"metric":"elapsed_ms","value":3391,"threshold":null,"status":"PASS"}]},"audit_table":{"phase":0,"name":"Auto","verdict":"UNKNOWN","rows":[{"metric":"sys_velocity_rows_sec","value":19329.14,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":3573,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","status","permit_type","scope_tags"],"trades":["id","slug"],"permit_type_classifications":["permit_type","class"]},"writes":{"permit_trades":["permit_num","revision_num","trade_id","tier","confidence","is_active","classified_at"]}}

[backfill-realtor-permit-trades] completed in 3.6s

```

### stderr tail
```
{"level":"WARN","tag":"[pipeline]","msg":"emitSummary called with no audit_table — admin UI will show UNKNOWN verdict. Wire a real audit_table for meaningful observability."}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=3679ms

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
**Evidence:** claimed records_new+records_updated=0; deltas={"permit_trades":{"pre":1237132,"post":1237132,"delta":0},"lead_trades":{"pre":1145045,"post":1145045,"delta":0}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"permit_trades":{"pre":1237132,"post":1237132,"delta":0},"lead_trades":{"pre":1145045,"post":1145045,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
