# Step 04: link_coa_to_parcels
**Chain:** coa
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** Phase D §6.6.X

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"lead_parcels":{"ok":true,"n":29703}}
- Last 3 runs: []

## Execution
- Command: `node scripts/link-coa-to-parcels.js`
- Exit code: 0
- Duration: 692ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"lead_parcels":{"ok":true,"n":29752}}
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
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"PostGIS detected — neighbourhood lookup will use ST_Contains"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Loaded 158 neighbourhoods with geometry"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Unprocessed CoAs to process: 54"}
  [link-coa-to-parcels] 54 / 54 (100.0%) — 0.4s — 121 rows/s
PIPELINE_SUMMARY:{"records_total":54,"records_new":0,"records_updated":49,"records_meta":{"duration_ms":472,"coa_processed":54,"tier_1a_exact":49,"tier_1b_name_only":0,"no_address_data":0,"no_parcel_match":5,"neighbourhood_matched":49,"neighbourhood_no_match":0,"lat_lng_written":49,"centroid_outside_polygon":0,"ghost_deleted":0,"per_row_errors":0,"audit_table":{"phase":42,"name":"CoA Parcel Linking","verdict":"PASS","rows":[{"metric":"coa_processed","value":54,"threshold":null,"status":"INFO"},{"metric":"tier_1a_exact","value":49,"threshold":null,"status":"INFO"},{"metric":"tier_1b_name_only","value":0,"threshold":null,"status":"INFO"},{"metric":"no_address_data","value":0,"threshold":null,"status":"INFO"},{"metric":"no_parcel_match","value":5,"threshold":null,"status":"INFO"},{"metric":"coa_parcels_linked_pct","value":"90.7%","threshold":">= 90%","status":"PASS"},{"metric":"unmatched_coa_count","value":5,"threshold":"<= 10%","status":"PASS"},{"metric":"coa_neighbourhood_coverage_pct","value":"100.0%","threshold":">= 95%","status":"PASS"},{"metric":"coa_geocoded_pct","value":"100.0%","threshold":null,"status":"INFO"},{"metric":"centroid_outside_polygon_count","value":0,"threshold":"<= 1% of matches","status":"PASS"},{"metric":"ghost_orphans_cleaned","value":0,"threshold":null,"status":"INFO"},{"metric":"per_row_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":104.45,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":517,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","lead_id","street_num","street_name_normalized","parcel_linked_at"],"parcels":["id","addr_num_normalized","street_name_normalized","centroid_lat","centroid_lng","geom"],"neighbourhoods":["id","geom"]},"writes":{"lead_parcels":["lead_id","parcel_id","match_type","confidence","matched_at"],"coa_applications":["neighbourhood_id","latitude","longitude","parcel_linked_at"]}}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Linking complete","context":{"processed":54,"tier_1a_exact":49,"tier_1b_name_only":0,"no_address_data":0,"no_parcel_match":5,"neighbourhood_matched":49,"lat_lng_written":49,"centroid_outside_polygon":0,"ghost_deleted":0,"per_row_errors":0,"duration":"0.5s"}}

[link-coa-to-parcels] completed in 0.5s

```

### stderr tail
```
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=692ms

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
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0},"lead_parcels":{"pre":29703,"post":29752,"delta":49}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0},"lead_parcels":{"pre":29703,"post":29752,"delta":49}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
