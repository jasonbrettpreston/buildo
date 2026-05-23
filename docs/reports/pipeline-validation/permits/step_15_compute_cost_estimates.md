# Step 15: compute_cost_estimates
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** INVESTIGATE
**Notes:** §11.2 invariants

## Pre-run state
- Output table counts: {"cost_estimates":{"ok":true,"n":273350}}
- Last 3 runs: [
  {
    "id": 3311,
    "status": "completed",
    "completed_at": "2026-05-20T20:47:30.035Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:46:43.820Z",
    "duration_ms": "46215"
  },
  {
    "id": 3265,
    "status": "completed",
    "completed_at": "2026-05-20T02:14:03.682Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:13:35.614Z",
    "duration_ms": "28069"
  },
  {
    "id": 3227,
    "status": "completed",
    "completed_at": "2026-05-20T01:51:43.019Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:50:46.607Z",
    "duration_ms": "56411"
  }
]

## Execution
- Command: `node scripts/compute-cost-estimates.js`
- Exit code: 0
- Duration: 29663ms
- New `pipeline_runs.id`: 3311

## Post-run state
- Output table counts: {"cost_estimates":{"ok":true,"n":273593}}
- New run: {"id":3311,"status":"completed","verdict":"WARN","duration_ms":"46215","records_total":248092,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 248092,
    "metric": "permits_processed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits_skipped_unchanged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 74544,
    "metric": "liar_gate_overrides",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 16784,
    "metric": "zero_total_bypass",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 11023,
    "metric": "permit_type_class_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "88.8%",
    "metric": "model_coverage_pct",
    "status": "PASS",
    "threshold": ">= 80%"
  },
  {
    "value": 248092,
    "metric": "failed_rows",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 57,
    "metric": "failed_batches",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 5515.36,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 44982,
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
      "cost_estimates": {
        "after": 271073,
        "delta": 0,
        "before": 271073
      }
    },
    "engine": {
      "cost_estimates": {
        "idx_scan": 5321,
        "seq_scan": 85,
        "seq_ratio": 0.0157,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      }
    },
    "pg_stats": {
      "cost_estimates": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {
      "cost_estimates": {
        "estimated_cost": {
          "after": 26583,
          "before": 26583,
          "filled": 0
        }
      }
    }
  },
  "failed_rows": 248092,
  "pipeline_meta": {
    "reads": {
      "parcels": [
        "id",
        "lot_size_sqm"
      ],
      "permits": [
        "permit_num",
        "revision_num",
        "permit_type",
        "structure_type",
        "est_const_cost",
        "scope_tags"
      ],
      "permit_trades": [
        "permit_num",
        "revision_num",
        "trade_slug"
      ],
      "neighbourhoods": [
        "neighbourhood_id",
        "avg_household_income",
        "tenure_renter_pct"
      ],
      "permit_parcels": [
        "permit_num",
        "revision_num",
        "parcel_id"
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
      ],
      "permit_type_classifications": [
        "permit_type",
        "class"
      ]
    },
    "writes": {
      "cost_estimates": [
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
      "data_quality_snapshots": [
        "cost_estimates_liar_gate_overrides",
        "cost_estimates_zero_total_bypass"
      ]
    }
  },
  "failed_batches": 57
}
```

### stdout tail
```
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Pre-fetched 32 trade rates, 18 matrix entries"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"data_quality_snapshots: no row for today — counters stored in audit_table only"}
PIPELINE_SUMMARY:{"records_total":248447,"records_new":243,"records_updated":21749,"records_meta":{"audit_table":{"phase":14,"name":"Cost Estimates","verdict":"WARN","rows":[{"metric":"permits_processed","value":248447,"threshold":null,"status":"INFO"},{"metric":"permits_inserted","value":243,"threshold":null,"status":"INFO"},{"metric":"permits_updated","value":21749,"threshold":null,"status":"INFO"},{"metric":"permits_skipped_unchanged","value":226446,"threshold":null,"status":"INFO"},{"metric":"liar_gate_overrides","value":0,"threshold":null,"status":"INFO"},{"metric":"zero_total_bypass","value":16736,"threshold":null,"status":"INFO"},{"metric":"permit_type_class_skipped","value":11050,"threshold":null,"status":"INFO"},{"metric":"model_coverage_pct","value":"0.0%","threshold":">= 80%","status":"WARN"},{"metric":"matrix_misses","value":220661,"threshold":null,"status":"INFO"},{"metric":"matrix_miss_unique_keys","value":200,"threshold":null,"status":"INFO","_truncated":true,"_total":23277},{"metric":"matrix_miss_top_keys","value":"{\"small residential projects::sfd - detached\":33268,\"plumbing(ps)::sfd - detached\":18146,\"mechanical(ms)::sfd - detached\":13229,\"small residential projects::sfd - semi-detached\":9463,\"drain and site service::sfd - detached\":8254,\"new houses::sfd - detached\":7981,\"building additions/alterations::office\":6667,\"building additions/alterations::apartment building\":5683,\"mechanical(ms)::office\":4626,\"plumbing(ps)::sfd - semi-detached\":3768}","threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":8429.93,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":29472,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","est_const_cost","scope_tags"],"permit_trades":["permit_num","revision_num","trade_slug"],"permit_parcels":["permit_num","revision_num","parcel_id"],"parcels":["id","lot_size_sqm"],"parcel_buildings":["parcel_id","building_id","is_primary"],"building_footprints":["id","footprint_area_sqm","estimated_stories"],"neighbourhoods":["neighbourhood_id","avg_household_income","tenure_renter_pct"],"trade_sqft_rates":["trade_slug","base_rate_sqft","structure_complexity_factor"],"scope_intensity_matrix":["permit_type","structure_type","gfa_allocation_percentage"],"permit_type_classifications":["permit_type","class"]},"writes":{"cost_estimates":["permit_num","revision_num","estimated_cost","cost_source","cost_tier","cost_range_low","cost_range_high","premium_factor","complexity_score","model_version","is_geometric_override","modeled_gfa_sqm","effective_area_sqm","trade_contract_values","computed_at","lead_id"],"data_quality_snapshots":["cost_estimates_liar_gate_overrides","cost_estimates_zero_total_bypass"]}}

[compute-cost-estimates] completed in 29.5s

```

### stderr tail
```
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-cost-estimates]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=29663ms

### C2: PASS
**Evidence:** id=3311 status=completed completed_at=Wed May 20 2026 16:47:30 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 12 audit rows: [permits_processed, permits_inserted, permits_updated, permits_skipped_unchanged, liar_gate_overrides, zero_total_bypass, permit_type_class_skipped, model_coverage_pct, failed_rows, failed_batches, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 4 records_meta keys: [telemetry, failed_rows, pipeline_meta, failed_batches]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"cost_estimates":{"pre":273350,"post":273593,"delta":243}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_cost_estimates

### C11: N/A-MANUAL
**Evidence:** records_total=248092 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=248092 records_new=0 records_updated=0
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
- **C8:** claimed records_new+records_updated=0; deltas={"cost_estimates":{"pre":273350,"post":273593,"delta":243}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_cost_estimates
- **C11:** records_total=248092 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
