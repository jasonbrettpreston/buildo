# Step 04: link_coa_to_parcels
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** Phase D §6.6.X

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119},"lead_parcels":{"ok":true,"n":30097}}
- Last 3 runs: [
  {
    "id": 3287,
    "status": "skipped",
    "completed_at": "2026-05-20T20:33:40.950Z",
    "verdict": null,
    "started_at": "2026-05-20T20:33:40.950Z",
    "duration_ms": "0"
  },
  {
    "id": 3223,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:39.716Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:37.094Z",
    "duration_ms": "2622"
  },
  {
    "id": 3176,
    "status": "skipped",
    "completed_at": "2026-05-20T01:04:34.198Z",
    "verdict": null,
    "started_at": "2026-05-20T01:04:34.198Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-coa-to-parcels.js`
- Exit code: 0
- Duration: 756ms
- New `pipeline_runs.id`: 3287

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119},"lead_parcels":{"ok":true,"n":30109}}
- New run: {"id":3287,"status":"skipped","verdict":null,"duration_ms":"0","records_total":0,"records_new":0,"records_updated":0}

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
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"PostGIS detected — neighbourhood lookup will use ST_Contains"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Loaded 158 neighbourhoods with geometry"}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Unprocessed CoAs to process: 13"}
  [link-coa-to-parcels] 13 / 13 (100.0%) — 0.4s — 29 rows/s
PIPELINE_SUMMARY:{"records_total":13,"records_new":0,"records_updated":12,"records_meta":{"duration_ms":467,"coa_processed":13,"tier_1a_exact":12,"tier_1b_name_only":0,"no_address_data":0,"no_parcel_match":1,"neighbourhood_matched":12,"neighbourhood_no_match":0,"lat_lng_written":12,"centroid_outside_polygon":0,"ghost_deleted":0,"per_row_errors":0,"audit_table":{"phase":42,"name":"CoA Parcel Linking","verdict":"PASS","rows":[{"metric":"coa_processed","value":13,"threshold":null,"status":"INFO"},{"metric":"tier_1a_exact","value":12,"threshold":null,"status":"INFO"},{"metric":"tier_1b_name_only","value":0,"threshold":null,"status":"INFO"},{"metric":"no_address_data","value":0,"threshold":null,"status":"INFO"},{"metric":"no_parcel_match","value":1,"threshold":null,"status":"INFO"},{"metric":"coa_parcels_linked_pct","value":"92.3%","threshold":">= 90%","status":"PASS"},{"metric":"unmatched_coa_count","value":1,"threshold":"<= 10%","status":"PASS"},{"metric":"coa_neighbourhood_coverage_pct","value":"100.0%","threshold":">= 95%","status":"PASS"},{"metric":"coa_geocoded_pct","value":"100.0%","threshold":null,"status":"INFO"},{"metric":"centroid_outside_polygon_count","value":0,"threshold":"<= 1% of matches","status":"PASS"},{"metric":"ghost_orphans_cleaned","value":0,"threshold":null,"status":"INFO"},{"metric":"per_row_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":24.48,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":531,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","lead_id","street_num","street_name_normalized","parcel_linked_at"],"parcels":["id","addr_num_normalized","street_name_normalized","centroid_lat","centroid_lng","geom"],"neighbourhoods":["id","geom"]},"writes":{"lead_parcels":["lead_id","parcel_id","match_type","confidence","matched_at"],"coa_applications":["neighbourhood_id","latitude","longitude","parcel_linked_at"]}}
{"level":"INFO","tag":"[link-coa-to-parcels]","msg":"Linking complete","context":{"processed":13,"tier_1a_exact":12,"tier_1b_name_only":0,"no_address_data":0,"no_parcel_match":1,"neighbourhood_matched":12,"lat_lng_written":12,"centroid_outside_polygon":0,"ghost_deleted":0,"per_row_errors":0,"duration":"0.5s"}}

[link-coa-to-parcels] completed in 0.5s

```

### stderr tail
```
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa-to-parcels]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=756ms

### C2: INVESTIGATE
**Evidence:** id=3287 status=skipped completed_at=Wed May 20 2026 16:33:40 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0},"lead_parcels":{"pre":30097,"post":30109,"delta":12}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0},"lead_parcels":{"pre":30097,"post":30109,"delta":12}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
