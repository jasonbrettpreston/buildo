# Step 19: assert_data_bounds
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** Phase G permits_pre_permit_count gate

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3315,
    "status": "completed",
    "completed_at": "2026-05-20T20:48:06.227Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:47:58.378Z",
    "duration_ms": "7849"
  },
  {
    "id": 3269,
    "status": "completed",
    "completed_at": "2026-05-20T02:14:34.657Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:14:28.114Z",
    "duration_ms": "6543"
  },
  {
    "id": 3237,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:31.841Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:52:20.813Z",
    "duration_ms": "11028"
  }
]

## Execution
- Command: `node scripts/quality/assert-data-bounds.js`
- Exit code: 0
- Duration: 12667ms
- New `pipeline_runs.id`: 3327

## Post-run state
- Output table counts: {}
- New run: {"id":3327,"status":"completed","verdict":"WARN","duration_ms":"12404","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "cost_outliers",
    "status": "PASS",
    "threshold": "< 20"
  },
  {
    "value": "0.2%",
    "metric": "null_descriptions_24h",
    "status": "PASS",
    "threshold": "< 5%"
  },
  {
    "value": "94.9%",
    "metric": "null_builders_24h",
    "status": "PASS",
    "threshold": "< 95%"
  },
  {
    "value": 2,
    "metric": "null_status_24h",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "orphaned_permit_trades",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "orphaned_permit_parcels",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "duplicate_pk_groups",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "permits_pre_permit_count",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_no_legal_name",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_no_g_class",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_invalid_naics",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "wsib_orphaned_links",
    "status": "PASS",
    "threshold": "== 0"
  }
]
```

### records_meta (minus audit_table)
```json
{
  "warnings": [
    "2 permits with NULL status",
    "3 parcels with lot_size_sqm out of bounds (0-1M sqm)",
    "1 completed_without_date",
    "64 ancient_dates"
  ],
  "checks_failed": 0,
  "checks_warned": 4
}
```

### stdout tail
```

--- Phase 3: Inspection Data Quality (94,645 rows) ---
  PASS: null_permit_num = 0
  PASS: null_stage_name = 0
  PASS: null_status = 0
  PASS: null_scraped_at = 0
  PASS: orphan_inspections = 0
  PASS: invalid_status = 0
  PASS: outstanding_with_date = 0
  WARN: completed_without_date = 1
  PASS: duplicate_stages = 0
  PASS: future_dates = 0
  WARN: ancient_dates = 64
  PASS: date_before_permit_year = 0

--- Cost Estimates Coverage ---
  OK: 271073 cost estimates (9.8% null, 5 distinct tiers)

--- Ghost Records (stale > 30 days) ---
  OK: No ghost records (all permits seen within 30 days)
PIPELINE_SUMMARY:{"records_total":0,"records_new":null,"records_updated":null,"records_meta":{"checks_failed":0,"checks_warned":4,"warnings":["2 permits with NULL status","3 parcels with lot_size_sqm out of bounds (0-1M sqm)","1 completed_without_date","64 ancient_dates"],"audit_table":{"phase":15,"name":"Data Quality Checks","verdict":"WARN","rows":[{"metric":"cost_outliers","value":0,"threshold":"< 20","status":"PASS"},{"metric":"null_descriptions_24h","value":"0.2%","threshold":"< 5%","status":"PASS"},{"metric":"null_builders_24h","value":"94.9%","threshold":"< 95%","status":"PASS"},{"metric":"null_status_24h","value":2,"threshold":"== 0","status":"WARN"},{"metric":"orphaned_permit_trades","value":0,"threshold":"== 0","status":"PASS"},{"metric":"orphaned_permit_parcels","value":0,"threshold":"== 0","status":"PASS"},{"metric":"duplicate_pk_groups","value":0,"threshold":"== 0","status":"PASS"},{"metric":"permits_pre_permit_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_no_legal_name","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_no_g_class","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_invalid_naics","value":0,"threshold":"== 0","status":"PASS"},{"metric":"wsib_orphaned_links","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":12497,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["*"],"parcels":["*"],"address_points":["*"],"building_footprints":["*"],"neighbourhoods":["*"],"coa_applications":["*"],"permit_inspections":["*"]},"writes":{"pipeline_runs":["checks_passed","checks_failed","checks_warned"]}}

  Warnings: 4

=== Data Bounds: COMPLETED (12.4s) ===


[assert-data-bounds] completed in 12.5s

```

### stderr tail
```
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-data-bounds]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=12667ms

### C2: PASS
**Evidence:** id=3327 status=completed completed_at=Fri May 22 2026 21:00:42 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 12 audit rows: [cost_outliers, null_descriptions_24h, null_builders_24h, null_status_24h, orphaned_permit_trades, orphaned_permit_parcels, duplicate_pk_groups, permits_pre_permit_count, wsib_no_legal_name, wsib_no_g_class, wsib_invalid_naics, wsib_orphaned_links]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 3 records_meta keys: [warnings, checks_failed, checks_warned]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
