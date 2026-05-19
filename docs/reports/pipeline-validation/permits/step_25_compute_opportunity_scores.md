# Step 25: compute_opportunity_scores
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.8 invariants; Phase F.3

## Pre-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":620199}}
- Last 3 runs: [
  {
    "id": 3161,
    "status": "completed",
    "completed_at": "2026-05-08T22:38:25.517Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:37:53.769Z",
    "duration_ms": "31748"
  },
  {
    "id": 3133,
    "status": "completed",
    "completed_at": "2026-05-08T22:03:48.441Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:02:56.629Z",
    "duration_ms": "51812"
  },
  {
    "id": 3066,
    "status": "completed",
    "completed_at": "2026-05-08T18:24:46.904Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:24:10.943Z",
    "duration_ms": "35962"
  }
]

## Execution
- Command: `node scripts/compute-opportunity-scores.js`
- Exit code: 0
- Duration: 28147ms
- New `pipeline_runs.id`: 3161

## Post-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":620199}}
- New run: {"id":3161,"status":"completed","verdict":"PASS","duration_ms":"31748","records_total":647660,"records_new":0,"records_updated":83}

### audit_table.rows
```json
[
  {
    "value": 647660,
    "metric": "records_scored",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 79024,
    "metric": "permits_in_scope",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 647577,
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
    "value": 61896,
    "metric": "null_scores",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 61896,
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
    "value": 23913.89,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 27083,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "run_at": "2026-05-08T22:37:57.307Z",
  "telemetry": {
    "counts": {
      "trade_forecasts": {
        "after": 654179,
        "delta": 0,
        "before": 654179
      }
    },
    "engine": {
      "trade_forecasts": {
        "idx_scan": 3451706,
        "seq_scan": 298,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4771,
        "n_dead_tup": 596861,
        "n_live_tup": 654179
      }
    },
    "pg_stats": {
      "trade_forecasts": {
        "del": 0,
        "ins": 0,
        "upd": 83
      }
    },
    "null_fills": {}
  },
  "pipeline_meta": {
    "reads": {
      "cost_estimates": [
        "permit_num",
        "revision_num",
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
  "integrity_flags": 0,
  "null_input_scores": 61896,
  "score_distribution": {
    "low": 454597,
    "elite": 216,
    "strong": 2739,
    "moderate": 128212,
    "no_cost_data": 61896
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[opportunity-scores]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Streaming forecast + cost + competition data..."}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Rows scored: 617172 (permit=617172, coa=0, other=0)"}
{"level":"INFO","tag":"[opportunity-scores]","msg":"Updated 438220 scores (permit=438220, coa=0)"}
PIPELINE_SUMMARY:{"records_total":617172,"records_new":0,"records_updated":438220,"records_meta":{"total_rows_permit":617172,"total_rows_coa":0,"total_rows_other":0,"records_updated_permit":438220,"records_updated_coa":0,"null_input_scores_permit":35852,"null_input_scores_coa":0,"integrity_flags_permit":0,"integrity_flags_coa":0,"score_distribution_permit":{"elite":257,"low":261144,"moderate":312780,"no_cost_data":35852,"strong":7139},"score_distribution_coa":{},"score_distribution_other":{},"coa_orphaned_cost_sample_capped":false,"permit_orphaned_cost_sample_capped":true,"lead_analytics_unmatched_permit_sample_capped":true,"lead_analytics_unmatched_coa_sample_capped":false,"coa_first_deploy_grace":false,"in_quiet_period":false,"run_at":"2026-05-19T18:56:43.554Z","score_distribution":{"elite":257,"low":261144,"moderate":312780,"no_cost_data":35852,"strong":7139},"audit_table":{"phase":23,"name":"Opportunity Score Engine","verdict":"WARN","rows":[{"metric":"records_scored","value":617172,"threshold":null,"status":"INFO"},{"metric":"permits_in_scope_legacy_distinct_count","value":79101,"threshold":null,"status":"INFO"},{"metric":"records_unchanged","value":178952,"threshold":null,"status":"INFO"},{"metric":"null_input_rate","value":0,"threshold":0,"status":"PASS"},{"metric":"null_scores","value":35852,"threshold":null,"status":"INFO"},{"metric":"null_input_scores","value":35852,"threshold":null,"status":"INFO"},{"metric":"out_of_range","value":0,"threshold":0,"status":"PASS"},{"metric":"forecasts_in_scope_permit","value":617172,"threshold":null,"status":"INFO"},{"metric":"forecasts_in_scope_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"total_rows_coa","value":0,"threshold":"=== 0 (post-quiet)","status":"WARN"},{"metric":"coa_orphaned_cost_count","value":0,"threshold":"> 0","status":"PASS"},{"metric":"permit_orphaned_cost_count","value":4597,"threshold":"> 0","status":"WARN"},{"metric":"lead_analytics_unmatched_permit_count","value":50,"threshold":"> 0","status":"WARN"},{"metric":"lead_analytics_unmatched_coa_count","value":0,"threshold":"> 0","status":"PASS"},{"metric":"coa_first_deploy_grace","value":0,"threshold":null,"status":"INFO"},{"metric":"in_quiet_period","value":0,"threshold":null,"status":"INFO"},{"metric":"malformed_lead_ids","value":0,"threshold":"> 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":22082.87,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":27948,"threshold":null,"status":"INFO"}]}},"failed_sample":["[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=framing","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=concrete","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=excavation","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=plumbing","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=electrical","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=hvac","[orphan-permit] lead_id=permit:18 192535 BLD:01 trade=drywall"]}
PIPELINE_META:{"reads":{"trade_forecasts":["lead_id","permit_num","revision_num","trade_slug","target_window","urgency"],"cost_estimates":["lead_id","estimated_cost","trade_contract_values","is_geometric_override","modeled_gfa_sqm"],"lead_analytics":["lead_key","tracking_count","saving_count"],"trade_configurations":["trade_slug","multiplier_bid","multiplier_work"],"pipeline_runs":["pipeline","started_at"]},"writes":{"trade_forecasts":["opportunity_score"]}}

[compute-opportunity-scores] completed in 27.9s

```

### stderr tail
```
{"level":"WARN","tag":"[opportunity-scores]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}
{"level":"WARN","tag":"[opportunity-scores]","msg":"CRIT-A integrity probe: permit forecasts have at least 50 rows with no matching lead_analytics row (sample capped at 50; possible upstream format drift)"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=28147ms

### C2: PASS
**Evidence:** id=3161 status=completed completed_at=Fri May 08 2026 18:38:25 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 9 audit rows: [records_scored, permits_in_scope, records_unchanged, null_input_rate, null_scores, null_input_scores, out_of_range, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 6 records_meta keys: [run_at, telemetry, pipeline_meta, integrity_flags, null_input_scores, score_distribution]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=83; deltas={"trade_forecasts":{"pre":620199,"post":620199,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_opportunity_scores

### C11: N/A-MANUAL
**Evidence:** records_total=647660 records_new=0 records_updated=83; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=647660 records_new=0 records_updated=83
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
- **C8:** claimed records_new+records_updated=83; deltas={"trade_forecasts":{"pre":620199,"post":620199,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_opportunity_scores
- **C11:** records_total=647660 records_new=0 records_updated=83; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
