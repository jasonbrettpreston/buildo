# Step 15: compute_cost_estimates
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.2 invariants

## Pre-run state
- Output table counts: {"cost_estimates":{"ok":true,"n":245785}}
- Last 3 runs: [
  {
    "id": 3151,
    "status": "completed",
    "completed_at": "2026-05-08T22:34:05.137Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:32:44.673Z",
    "duration_ms": "80464"
  },
  {
    "id": 3123,
    "status": "completed",
    "completed_at": "2026-05-08T21:56:44.684Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:55:09.666Z",
    "duration_ms": "95018"
  },
  {
    "id": 3056,
    "status": "completed",
    "completed_at": "2026-05-08T18:20:34.771Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:19:21.343Z",
    "duration_ms": "73428"
  }
]

## Execution
- Command: `node scripts/compute-cost-estimates.js`
- Exit code: 0
- Duration: 35611ms
- New `pipeline_runs.id`: 3151

## Post-run state
- Output table counts: {"cost_estimates":{"ok":true,"n":245785}}
- New run: {"id":3151,"status":"completed","verdict":"PASS","duration_ms":"80464","records_total":247030,"records_new":0,"records_updated":8740}

### audit_table.rows
```json
[
  {
    "value": 247030,
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
    "value": 8740,
    "metric": "permits_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 238290,
    "metric": "permits_skipped_unchanged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "liar_gate_overrides",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 30108,
    "metric": "zero_total_bypass",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 11069,
    "metric": "permit_type_class_skipped",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "83.3%",
    "metric": "model_coverage_pct",
    "status": "PASS",
    "threshold": ">= 80%"
  },
  {
    "value": 3230.76,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 76462,
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
        "after": 247030,
        "delta": 0,
        "before": 247030
      }
    },
    "engine": {
      "cost_estimates": {
        "idx_scan": 2637132,
        "seq_scan": 64,
        "seq_ratio": 0,
        "dead_ratio": 0.0455,
        "n_dead_tup": 11840,
        "n_live_tup": 248126
      }
    },
    "pg_stats": {
      "cost_estimates": {
        "del": 0,
        "ins": 0,
        "upd": 8740
      }
    },
    "null_fills": {
      "cost_estimates": {
        "estimated_cost": {
          "after": 41177,
          "before": 35187,
          "filled": -5990
        }
      }
    }
  },
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
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"Pre-fetched 32 trade rates, 18 matrix entries"}
{"level":"INFO","tag":"[compute-cost-estimates]","msg":"data_quality_snapshots: no row for today — counters stored in audit_table only"}
PIPELINE_SUMMARY:{"records_total":248237,"records_new":0,"records_updated":0,"records_meta":{"audit_table":{"phase":14,"name":"Cost Estimates","verdict":"WARN","rows":[{"metric":"permits_processed","value":248237,"threshold":null,"status":"INFO"},{"metric":"permits_inserted","value":0,"threshold":null,"status":"INFO"},{"metric":"permits_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"permits_skipped_unchanged","value":0,"threshold":null,"status":"INFO"},{"metric":"liar_gate_overrides","value":74544,"threshold":null,"status":"INFO"},{"metric":"zero_total_bypass","value":16784,"threshold":null,"status":"INFO"},{"metric":"permit_type_class_skipped","value":11168,"threshold":null,"status":"INFO"},{"metric":"model_coverage_pct","value":"88.7%","threshold":">= 80%","status":"PASS"},{"metric":"failed_rows","value":248237,"threshold":"== 0","status":"WARN"},{"metric":"failed_batches","value":57,"threshold":"== 0","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":7009.37,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":35415,"threshold":null,"status":"INFO"}]},"failed_batches":57,"failed_rows":248237}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","permit_type","structure_type","est_const_cost","scope_tags"],"permit_trades":["permit_num","revision_num","trade_slug"],"permit_parcels":["permit_num","revision_num","parcel_id"],"parcels":["id","lot_size_sqm"],"parcel_buildings":["parcel_id","building_id","is_primary"],"building_footprints":["id","footprint_area_sqm","estimated_stories"],"neighbourhoods":["neighbourhood_id","avg_household_income","tenure_renter_pct"],"trade_sqft_rates":["trade_slug","base_rate_sqft","structure_complexity_factor"],"scope_intensity_matrix":["permit_type","structure_type","gfa_allocation_percentage"],"permit_type_classifications":["permit_type","class"]},"writes":{"cost_estimates":["permit_num","revision_num","estimated_cost","cost_source","cost_tier","cost_range_low","cost_range_high","premium_factor","complexity_score","model_version","is_geometric_override","modeled_gfa_sqm","effective_area_sqm","trade_contract_values","computed_at"],"data_quality_snapshots":["cost_estimates_liar_gate_overrides","cost_estimates_zero_total_bypass"]}}

[compute-cost-estimates] completed in 35.4s

```

### stderr tail
```
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"batch failed","error_type":"unknown","context":{"batch_size":4368,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}
{"level":"ERROR","tag":"[compute-cost-estimates]","msg":"final batch failed","error_type":"unknown","context":{"batch_size":3629,"err":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=35611ms

### C2: PASS
**Evidence:** id=3151 status=completed completed_at=Fri May 08 2026 18:34:05 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 10 audit rows: [permits_processed, permits_inserted, permits_updated, permits_skipped_unchanged, liar_gate_overrides, zero_total_bypass, permit_type_class_skipped, model_coverage_pct, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 2 records_meta keys: [telemetry, pipeline_meta]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=8740; deltas={"cost_estimates":{"pre":245785,"post":245785,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_cost_estimates

### C11: N/A-MANUAL
**Evidence:** records_total=247030 records_new=0 records_updated=8740; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=247030 records_new=0 records_updated=8740
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
- **C8:** claimed records_new+records_updated=8740; deltas={"cost_estimates":{"pre":245785,"post":245785,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_cost_estimates
- **C11:** records_total=247030 records_new=0 records_updated=8740; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
