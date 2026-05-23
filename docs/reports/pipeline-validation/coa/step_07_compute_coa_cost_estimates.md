# Step 07: compute_coa_cost_estimates
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.10 invariants; geometric-only per Spec 83 §3.A

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119}}
- Last 3 runs: [
  {
    "id": 3290,
    "status": "completed",
    "completed_at": "2026-05-20T20:33:48.688Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:45.131Z",
    "duration_ms": "3557"
  },
  {
    "id": 3228,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:51.733Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:48.400Z",
    "duration_ms": "3333"
  },
  {
    "id": 3179,
    "status": "completed",
    "completed_at": "2026-05-20T01:04:42.054Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:04:38.872Z",
    "duration_ms": "3182"
  }
]

## Execution
- Command: `node scripts/compute-coa-cost-estimates.js`
- Exit code: 0
- Duration: 1044ms
- New `pipeline_runs.id`: 3290

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33119}}
- New run: {"id":3290,"status":"completed","verdict":"PASS","duration_ms":"3557","records_total":2486,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 2486,
    "metric": "coa_eligible",
    "status": "PASS",
    "threshold": "> 0"
  },
  {
    "value": 1760,
    "metric": "coa_with_cost",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 726,
    "metric": "coa_without_cost",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "70.8%",
    "metric": "cost_estimate_coverage_pct",
    "status": "PASS",
    "threshold": ">= 70%"
  },
  {
    "value": 337,
    "metric": "null_reason_no_parcel",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "null_reason_no_scope_tags",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 147,
    "metric": "null_reason_no_active_trades",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 242,
    "metric": "null_reason_no_matching_rate",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "0.0%",
    "metric": "cost_with_fallback_pct",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "N/A",
    "metric": "cost_distribution_p25_p50_p75",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": true,
    "metric": "phase_h_gap_active",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "records_new",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "records_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1760,
    "metric": "records_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2486,
    "metric": "coa_applications_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "total_cost_estimates_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 858.13,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2897,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "dry_run": false,
  "row_limit": null,
  "telemetry": {
    "counts": {
      "cost_estimates": {
        "after": 271073,
        "delta": 0,
        "before": 271073
      },
      "coa_applications": {
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "cost_estimates": {
        "idx_scan": 5316,
        "seq_scan": 72,
        "seq_ratio": 0.0134,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      },
      "coa_applications": {
        "idx_scan": 30575,
        "seq_scan": 195,
        "seq_ratio": 0.0063,
        "dead_ratio": 0.2397,
        "n_dead_tup": 10439,
        "n_live_tup": 33106
      }
    },
    "pg_stats": {
      "cost_estimates": {
        "del": 0,
        "ins": 0,
        "upd": 0
      },
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 2486
      }
    },
    "null_fills": {
      "coa_applications": {
        "estimated_cost": {
          "after": 7818,
          "before": 7818,
          "filled": 0
        },
        "cost_classified_at": {
          "after": 0,
          "before": 0,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 2852,
  "coa_processed": 2486,
  "coa_with_cost": 1760,
  "pipeline_meta": {
    "reads": {
      "trades": [
        "id",
        "slug"
      ],
      "parcels": [
        "id",
        "lot_size_sqm",
        "frontage_m"
      ],
      "lead_trades": [
        "lead_id",
        "trade_id",
        "is_active"
      ],
      "lead_parcels": [
        "lead_id",
        "parcel_id",
        "confidence"
      ],
      "neighbourhoods": [
        "id",
        "avg_household_income",
        "tenure_renter_pct"
      ],
      "coa_applications": [
        "id",
        "lead_id",
        "scope_tags",
        "structure_type",
        "neighbourhood_id",
        "trade_classified_at",
        "cost_classified_at"
      ],
      "parcel_buildings": [
        "parcel_id",
        "building_id",
        "is_primary"
      ],
      "trade_sqft_rates": [
        "trade_slug",
        "base_rate_sqft",
        "structure_complexity_factor"
      ],
      "building_footprints": [
        "id",
        "footprint_area_sqm",
        "estimated_stories"
      ],
      "scope_intensity_matrix": [
        "permit_type",
        "structure_type",
        "gfa_allocation_percentage"
      ]
    },
    "writes": {
      "cost_estimates": [
        "lead_id",
        "permit_num",
        "revision_num",
        "estimated_cost",
        "cost_source",
        "cost_tier",
        "cost_range_low",
        "cost_range_high",
        "premium_factor",
        "complexity_score",
        "model_version",
        "is_geometric_override",
        "modeled_gfa_sqm",
        "effective_area_sqm",
        "trade_contract_values",
        "computed_at"
      ],
      "coa_applications": [
        "modeled_gfa_sqm",
        "estimated_cost",
        "cost_source",
        "cost_classified_at"
      ]
    }
  },
  "coa_without_cost": 726,
  "coa_with_fallback": 0,
  "cost_distribution": {
    "p25": null,
    "p50": null,
    "p75": null
  },
  "null_cost_reasons": {
    "no_parcel": 337,
    "no_scope_tags": 0,
    "no_active_trades": 147,
    "no_matching_rate": 242
  },
  "coa_applications_updated": 2486,
  "null_cost_reasons_additive": {
    "no_parcel": 337,
    "no_scope_tags": 0,
    "no_active_trades": 212
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Loaded 32 trade rates + 18 scope matrix rows"}
PIPELINE_SUMMARY:{"records_total":2486,"records_new":0,"records_updated":0,"records_meta":{"duration_ms":823,"coa_processed":2486,"coa_with_cost":0,"coa_without_cost":2486,"coa_with_fallback":0,"null_cost_reasons":{"no_parcel":335,"no_scope_tags":9,"no_active_trades":145,"no_matching_rate":1997},"null_cost_reasons_additive":{"no_parcel":335,"no_scope_tags":10,"no_active_trades":220},"cost_distribution":{"p25":null,"p50":null,"p75":null},"coa_applications_updated":2486,"dry_run":false,"row_limit":null,"audit_table":{"phase":42,"name":"CoA Cost Estimation","verdict":"WARN","rows":[{"metric":"coa_eligible","value":2486,"threshold":"> 0","status":"PASS"},{"metric":"coa_with_cost","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_without_cost","value":2486,"threshold":null,"status":"INFO"},{"metric":"cost_estimate_coverage_pct","value":"0.0%","threshold":">= 70%","status":"WARN"},{"metric":"null_reason_no_parcel","value":335,"threshold":null,"status":"INFO"},{"metric":"null_reason_no_scope_tags","value":9,"threshold":null,"status":"INFO"},{"metric":"null_reason_no_active_trades","value":145,"threshold":null,"status":"INFO"},{"metric":"null_reason_no_matching_rate","value":1997,"threshold":null,"status":"INFO"},{"metric":"cost_with_fallback_pct","value":"N/A","threshold":null,"status":"INFO"},{"metric":"cost_distribution_p25_p50_p75","value":"N/A","threshold":null,"status":"INFO"},{"metric":"phase_h_gap_active","value":true,"threshold":null,"status":"INFO"},{"metric":"records_new","value":0,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"records_skipped","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_applications_updated","value":2486,"threshold":null,"status":"INFO"},{"metric":"total_cost_estimates_written","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":2860.76,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":869,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","lead_id","scope_tags","structure_type","neighbourhood_id","trade_classified_at","cost_classified_at"],"lead_parcels":["lead_id","parcel_id","confidence"],"parcels":["id","lot_size_sqm","frontage_m"],"parcel_buildings":["parcel_id","building_id","is_primary"],"building_footprints":["id","footprint_area_sqm","estimated_stories"],"neighbourhoods":["id","avg_household_income","tenure_renter_pct"],"lead_trades":["lead_id","trade_id","is_active"],"trades":["id","slug"],"trade_sqft_rates":["trade_slug","base_rate_sqft","structure_complexity_factor"],"scope_intensity_matrix":["permit_type","structure_type","gfa_allocation_percentage"]},"writes":{"cost_estimates":["lead_id","permit_num","revision_num","estimated_cost","cost_source","cost_tier","cost_range_low","cost_range_high","premium_factor","complexity_score","model_version","is_geometric_override","modeled_gfa_sqm","effective_area_sqm","trade_contract_values","computed_at"],"coa_applications":["modeled_gfa_sqm","estimated_cost","cost_source","cost_classified_at"]}}
{"level":"INFO","tag":"[compute-coa-cost-estimates]","msg":"Cost estimation complete","context":{"processed":2486,"coa_with_cost":0,"coa_without_cost":2486,"records_new":0,"records_updated":0,"coa_applications_updated":2486,"duration":"0.8s"}}

[compute-coa-cost-estimates] completed in 0.9s

```

### stderr tail
```
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-coa-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=1044ms

### C2: PASS
**Evidence:** id=3290 status=completed completed_at=Wed May 20 2026 16:33:48 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 18 audit rows: [coa_eligible, coa_with_cost, coa_without_cost, cost_estimate_coverage_pct, null_reason_no_parcel, null_reason_no_scope_tags, null_reason_no_active_trades, null_reason_no_matching_rate, cost_with_fallback_pct, cost_distribution_p25_p50_p75, phase_h_gap_active, records_new, records_updated, records_skipped, coa_applications_updated, total_cost_estimates_written, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 13 records_meta keys: [dry_run, row_limit, telemetry, duration_ms, coa_processed, coa_with_cost, pipeline_meta, coa_without_cost, coa_with_fallback, cost_distribution, null_cost_reasons, coa_applications_updated, null_cost_reasons_additive]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_coa_cost_estimates

### C11: N/A-MANUAL
**Evidence:** records_total=2486 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=2486 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T6:** N/A-MANUAL — table-specific; verify last_seen_at vs classified_at per step
- **T7:** N/A-MANUAL — sentinel-set specific per step
- **T8:** N/A-MANUAL — time-bucket boundaries per step
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T10:** N/A-MANUAL — calibration cohort thinning manual
- **T11:** N/A-MANUAL — catchall rule rate per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33119,"post":33119,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_coa_cost_estimates
- **C11:** records_total=2486 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
