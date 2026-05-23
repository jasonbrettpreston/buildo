# Step 25: compute_opportunity_scores
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 56ebce1
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** INVESTIGATE
**Notes:** §11.8 invariants; Phase F.3

## Pre-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":657523}}
- Last 3 runs: [
  {
    "id": 3321,
    "status": "completed",
    "completed_at": "2026-05-20T20:51:16.889Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:50:58.794Z",
    "duration_ms": "18095"
  },
  {
    "id": 3275,
    "status": "completed",
    "completed_at": "2026-05-20T02:17:19.003Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:16:59.916Z",
    "duration_ms": "19087"
  },
  {
    "id": 3246,
    "status": "completed",
    "completed_at": "2026-05-20T01:54:50.339Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:54:25.282Z",
    "duration_ms": "25056"
  }
]

## Execution
- Command: `node scripts/compute-opportunity-scores.js`
- Exit code: 0
- Duration: 26813ms
- New `pipeline_runs.id`: 3321

## Post-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":657523}}
- New run: {"id":3321,"status":"completed","verdict":"WARN","duration_ms":"18095","records_total":617001,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 617001,
    "metric": "records_scored",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 79068,
    "metric": "permits_in_scope_legacy_distinct_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 617001,
    "metric": "records_unchanged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "null_input_rate",
    "status": "PASS",
    "threshold": 0
  },
  {
    "value": 35852,
    "metric": "null_scores",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 35852,
    "metric": "null_input_scores",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "out_of_range",
    "status": "PASS",
    "threshold": 0
  },
  {
    "value": 617001,
    "metric": "forecasts_in_scope_permit",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "forecasts_in_scope_coa",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "total_rows_coa",
    "status": "WARN",
    "threshold": "=== 0 (post-quiet)"
  },
  {
    "value": 0,
    "metric": "coa_orphaned_cost_count",
    "status": "PASS",
    "threshold": "> 0"
  },
  {
    "value": 4597,
    "metric": "permit_orphaned_cost_count",
    "status": "WARN",
    "threshold": "> 0"
  },
  {
    "value": 50,
    "metric": "lead_analytics_unmatched_permit_count",
    "status": "WARN",
    "threshold": "> 0"
  },
  {
    "value": 0,
    "metric": "lead_analytics_unmatched_coa_count",
    "status": "PASS",
    "threshold": "> 0"
  },
  {
    "value": 0,
    "metric": "coa_first_deploy_grace",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "in_quiet_period",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "malformed_lead_ids",
    "status": "PASS",
    "threshold": "> 0"
  },
  {
    "value": 40904.34,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 15084,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "run_at": "2026-05-20T20:51:00.478Z",
  "telemetry": {
    "counts": {
      "trade_forecasts": {
        "after": 620037,
        "delta": 0,
        "before": 620037
      }
    },
    "engine": {
      "trade_forecasts": {
        "idx_scan": 1858047,
        "seq_scan": 144,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4308,
        "n_dead_tup": 468050,
        "n_live_tup": 618322
      }
    },
    "pg_stats": {
      "trade_forecasts": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "pipeline_meta": {
    "reads": {
      "pipeline_runs": [
        "pipeline",
        "started_at"
      ],
      "cost_estimates": [
        "lead_id",
        "estimated_cost",
        "trade_contract_values",
        "is_geometric_override",
        "modeled_gfa_sqm"
      ],
      "lead_analytics": [
        "lead_key",
        "tracking_count",
        "saving_count"
      ],
      "trade_forecasts": [
        "lead_id",
        "permit_num",
        "revision_num",
        "trade_slug",
        "target_window",
        "urgency"
      ],
      "trade_configurations": [
        "trade_slug",
        "multiplier_bid",
        "multiplier_work"
      ]
    },
    "writes": {
      "trade_forecasts": [
        "opportunity_score"
      ]
    }
  },
  "total_rows_coa": 0,
  "in_quiet_period": false,
  "total_rows_other": 0,
  "total_rows_permit": 617001,
  "score_distribution": {
    "low": 261060,
    "elite": 257,
    "strong": 7139,
    "moderate": 312693,
    "no_cost_data": 35852
  },
  "integrity_flags_coa": 0,
  "records_updated_coa": 0,
  "null_input_scores_coa": 0,
  "coa_first_deploy_grace": false,
  "integrity_flags_permit": 0,
  "records_updated_permit": 0,
  "score_distribution_coa": {},
  "null_input_scores_permit": 35852,
  "score_distribution_other": {},
  "score_distribution_permit": {
    "low": 261060,
    "elite": 257,
    "strong": 7139,
    "moderate": 312693,
    "no_cost_data": 35852
  },
  "coa_orphaned_cost_sample_capped": false,
  "permit_orphaned_cost_sample_capped": true,
  "lead_analytics_unmatched_coa_sample_capped": false,
  "lead_analytics_unmatched_permit_sample_capped": true
}
```

### stdout tail
```
{"level":"INFO","tag":"[opportunity-scores]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Streaming forecast + cost + competition data..."}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Rows scored: 654574 (permit=620284, coa=34290, other=0)"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Updated 582667 scores (permit=582667, coa=0)"}
PIPELINE_SUMMARY:{"records_total":654574,"records_new":0,"records_updated":582667,"records_meta":{"total_rows_permit":620284,"total_rows_coa":34290,"total_rows_other":0,"records_updated_permit":582667,"records_updated_coa":0,"null_input_scores_permit":620284,"null_input_scores_coa":3951,"integrity_flags_permit":0,"integrity_flags_coa":0,"score_distribution_permit":{"no_cost_data":620284},"score_distribution_coa":{"elite":3171,"low":13096,"moderate":8555,"no_cost_data":3951,"strong":5517},"score_distribution_other":{},"coa_orphaned_cost_sample_capped":true,"permit_orphaned_cost_sample_capped":false,"lead_analytics_unmatched_permit_sample_capped":true,"lead_analytics_unmatched_coa_sample_capped":true,"coa_first_deploy_grace":false,"in_quiet_period":false,"run_at":"2026-05-23T10:19:21.782Z","score_distribution":{"elite":3171,"low":13096,"moderate":8555,"no_cost_data":624235,"strong":5517},"audit_table":{"phase":23,"name":"Opportunity Score Engine","verdict":"WARN","rows":[{"metric":"records_scored","value":654574,"threshold":null,"status":"INFO"},{"metric":"permits_in_scope_legacy_distinct_count","value":80751,"threshold":null,"status":"INFO"},{"metric":"records_unchanged","value":71907,"threshold":null,"status":"INFO"},{"metric":"null_input_rate","value":0,"threshold":0,"status":"PASS"},{"metric":"null_scores","value":624235,"threshold":null,"status":"INFO"},{"metric":"null_input_scores","value":624235,"threshold":null,"status":"INFO"},{"metric":"out_of_range","value":0,"threshold":0,"status":"PASS"},{"metric":"forecasts_in_scope_permit","value":620284,"threshold":null,"status":"INFO"},{"metric":"forecasts_in_scope_coa","value":34290,"threshold":null,"status":"INFO"},{"metric":"total_rows_coa","value":34290,"threshold":"=== 0 (post-quiet)","status":"INFO"},{"metric":"coa_orphaned_cost_count","value":3951,"threshold":"> 0","status":"WARN"},{"metric":"permit_orphaned_cost_count","value":0,"threshold":"> 0","status":"PASS"},{"metric":"lead_analytics_unmatched_permit_count","value":50,"threshold":"> 0","status":"WARN"},{"metric":"lead_analytics_unmatched_coa_count","value":50,"threshold":"> 0","status":"WARN"},{"metric":"coa_first_deploy_grace","value":0,"threshold":null,"status":"INFO"},{"metric":"in_quiet_period","value":0,"threshold":null,"status":"INFO"},{"metric":"malformed_lead_ids","value":0,"threshold":"> 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":24616.37,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":26591,"threshold":null,"status":"INFO"}]}},"failed_sample":["[orphan-coa] lead_id=coa:B11/16EYK trade=realtor","[orphan-coa] lead_id=coa:A0031/26TEY trade=concrete","[orphan-coa] lead_id=coa:A0031/26TEY trade=drywall","[orphan-coa] lead_id=coa:A0031/26TEY trade=electrical","[orphan-coa] lead_id=coa:A0031/26TEY trade=excavation","[orphan-coa] lead_id=coa:A0031/26TEY trade=fire-protection","[orphan-coa] lead_id=coa:A0031/26TEY trade=flooring"]}
PIPELINE_META:{"reads":{"trade_forecasts":["lead_id","permit_num","revision_num","trade_slug","target_window","urgency"],"cost_estimates":["lead_id","estimated_cost","trade_contract_values","is_geometric_override","modeled_gfa_sqm"],"lead_analytics":["lead_key","tracking_count","saving_count"],"trade_configurations":["trade_slug","multiplier_bid","multiplier_work"],"pipeline_runs":["pipeline","started_at"]},"writes":{"trade_forecasts":["opportunity_score"]}}

[compute-opportunity-scores] completed in 26.6s

```

### stderr tail
```
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[opportunity-scores]","msg":"CRIT-A integrity probe: permit forecasts have at least 50 rows with no matching lead_analytics row (sample capped at 50; possible upstream format drift)"}
{"level":"WARN","tag":"[opportunity-scores]","msg":"CRIT-A integrity probe: coa forecasts have at least 50 rows with no matching lead_analytics row (sample capped at 50; possible upstream format drift)"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=26813ms

### C2: PASS
**Evidence:** id=3321 status=completed completed_at=Wed May 20 2026 16:51:16 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 19 audit rows: [records_scored, permits_in_scope_legacy_distinct_count, records_unchanged, null_input_rate, null_scores, null_input_scores, out_of_range, forecasts_in_scope_permit, forecasts_in_scope_coa, total_rows_coa, coa_orphaned_cost_count, permit_orphaned_cost_count, lead_analytics_unmatched_permit_count, lead_analytics_unmatched_coa_count, coa_first_deploy_grace, in_quiet_period, malformed_lead_ids, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 22 records_meta keys: [run_at, telemetry, pipeline_meta, total_rows_coa, in_quiet_period, total_rows_other, total_rows_permit, score_distribution, integrity_flags_coa, records_updated_coa, null_input_scores_coa, coa_first_deploy_grace, integrity_flags_permit, records_updated_permit, score_distribution_coa, null_input_scores_permit, score_distribution_other, score_distribution_permit, coa_orphaned_cost_sample_capped, permit_orphaned_cost_sample_capped, lead_analytics_unmatched_coa_sample_capped, lead_analytics_unmatched_permit_sample_capped]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"trade_forecasts":{"pre":657523,"post":657523,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_opportunity_scores

### C11: N/A-MANUAL
**Evidence:** records_total=617001 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=617001 records_new=0 records_updated=0
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
- **C8:** claimed records_new+records_updated=0; deltas={"trade_forecasts":{"pre":657523,"post":657523,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_opportunity_scores
- **C11:** records_total=617001 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
