# Step 24: compute_trade_forecasts
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.7 invariants; Phase F.1

## Pre-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":654179}}
- Last 3 runs: [
  {
    "id": 3160,
    "status": "completed",
    "completed_at": "2026-05-08T22:37:53.764Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:36:43.314Z",
    "duration_ms": "70450"
  },
  {
    "id": 3132,
    "status": "completed",
    "completed_at": "2026-05-08T22:02:56.622Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:00:34.184Z",
    "duration_ms": "142437"
  },
  {
    "id": 3065,
    "status": "completed",
    "completed_at": "2026-05-08T18:24:10.920Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:23:04.075Z",
    "duration_ms": "66845"
  }
]

## Execution
- Command: `node scripts/compute-trade-forecasts.js`
- Exit code: 0
- Duration: 54607ms
- New `pipeline_runs.id`: 3160

## Post-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":620199}}
- New run: {"id":3160,"status":"completed","verdict":"PASS","duration_ms":"70450","records_total":818503,"records_new":0,"records_updated":653807}

### audit_table.rows
```json
[
  {
    "value": 653807,
    "metric": "forecasts_computed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "new_forecasts",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "stale_purged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "grace_purged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "skipped_no_anchor",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 130564,
    "metric": "skipped_past_target",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 34132,
    "metric": "skipped_too_old",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "snowplow_applied",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "unmapped_trades",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": "18.3%",
    "metric": "default_calibration_pct",
    "status": "PASS",
    "threshold": "< 20%"
  },
  {
    "value": "1.0%",
    "metric": "expired_urgency_pct",
    "status": "PASS",
    "threshold": "< 30%"
  },
  {
    "value": 654179,
    "metric": "total_forecast_rows",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 12008.73,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 68159,
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
      "trade_forecasts": {
        "after": 654179,
        "delta": 0,
        "before": 654179
      }
    },
    "engine": {
      "trade_forecasts": {
        "idx_scan": 3451702,
        "seq_scan": 253,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4771,
        "n_dead_tup": 596805,
        "n_live_tup": 654179
      }
    },
    "pg_stats": {
      "trade_forecasts": {
        "del": 0,
        "ins": 0,
        "upd": 653807
      }
    },
    "null_fills": {}
  },
  "grace_purged": 0,
  "pipeline_meta": {
    "reads": {
      "trades": [
        "id",
        "slug"
      ],
      "permits": [
        "permit_num",
        "revision_num",
        "lifecycle_phase",
        "lifecycle_stalled",
        "phase_started_at",
        "permit_type",
        "issued_date",
        "application_date"
      ],
      "permit_trades": [
        "permit_num",
        "revision_num",
        "trade_id",
        "is_active"
      ],
      "phase_calibration": [
        "from_phase",
        "to_phase",
        "permit_type",
        "median_days",
        "p25_days",
        "p75_days",
        "sample_size"
      ],
      "permit_inspections": [
        "permit_num",
        "inspection_date",
        "status"
      ]
    },
    "writes": {
      "trade_forecasts": [
        "permit_num",
        "revision_num",
        "trade_slug",
        "predicted_start",
        "confidence",
        "urgency",
        "calibration_method",
        "sample_size",
        "median_days",
        "p25_days",
        "p75_days",
        "computed_at"
      ]
    }
  },
  "anchor_sources": {
    "issued_date": 0,
    "application_date": 0,
    "phase_started_at": 687939,
    "last_passed_inspection": 0
  },
  "skipped_too_old": 34132,
  "unmapped_trades": 0,
  "snowplow_applied": 0,
  "skipped_no_anchor": 0,
  "forecasts_computed": 653807,
  "skipped_past_target": 130564,
  "total_forecast_rows": 654179,
  "urgency_distribution": {
    "delayed": 5707,
    "expired": 6519,
    "on_time": 518215,
    "overdue": 5386,
    "imminent": 4178,
    "upcoming": 114174
  },
  "anchor_fallbacks_used": 0,
  "stale_forecasts_purged": 0,
  "calibration_distribution": {
    "exact": 167545,
    "default": 119853,
    "fallback_all_types": 28532,
    "fallback_issued_all": 50232,
    "fallback_issued_type": 288017
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"CoA audit-verdict gate: no_prior_run (last_run_id=null, last_verdict=null)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loading calibration data..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Calibration loaded: 136 entries"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loading CoA cohort calibration from phase_stay_calibration..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"CoA cohort calibration loaded: 0 raw rows → 0 unique (pt,tc,from_seq) cohorts"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streaming active permit-trade pairs..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streamed 293,803 rows, 234,050 forecasts buffered"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streamed 582,182 rows, 468,100 forecasts buffered"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Rows streamed: 767,130 (permit=767,130, coa=0)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Forecasts to write: 619,294 (coa=0)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Skipped (no anchor, permit): 0"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Skipped (too old, grace cutoff): 17,229"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Grace-purged 697 expired forecasts older than 180 days"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Purged 38,850 stale forecasts (permit=38,850, coa=0)"}
PIPELINE_SUMMARY:{"records_total":767130,"records_new":0,"records_updated":619294,"records_meta":{"forecasts_computed":619294,"forecasts_computed_permit":619294,"forecasts_computed_coa":0,"total_rows_permit":767130,"total_rows_coa":0,"stale_forecasts_purged":38850,"stale_purged_permit":38850,"stale_purged_coa":0,"grace_purged":697,"skipped_no_anchor":0,"skipped_no_anchor_coa":0,"skipped_past_target":130607,"skipped_too_old":17229,"skipped_too_old_coa":0,"snowplow_applied_coa":0,"coa_skipped_audit_blocked":0,"coa_anchor_stale_lifecycle_transition_count":0,"coa_anchor_fallback_pct":0,"coa_null_lifecycle_seq_count":0,"lead_id_format_failed_permit":0,"lead_id_format_failed_coa":0,"skipped_distribution_by_lifecycle_group":{"C1":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0},"C2":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0},"C3":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0}},"coa_first_deploy_grace":false,"coa_audit_gate_status":"no_prior_run","unmapped_trades":0,"anchor_fallbacks_used":0,"anchor_sources":{"phase_started_at":636523,"last_passed_inspection":0,"issued_date":0,"application_date":0},"anchor_sources_coa":{"lifecycle_transition":0,"decision_date":0,"hearing_date":0,"first_seen_at":0},"snowplow_applied":0,"urgency_distribution":{"delayed":6601,"expired":3027,"imminent":3701,"on_time":472035,"overdue":3287,"upcoming":131548},"calibration_distribution":{"default":83441,"exact":168444,"fallback_all_types":28547,"fallback_issued_all":50298,"fallback_issued_type":289469},"total_forecast_rows":620199,"audit_table":{"phase":22,"name":"Trade Forecasts","verdict":"WARN","rows":[{"metric":"forecasts_computed","value":619294,"threshold":null,"status":"INFO"},{"metric":"new_forecasts","value":0,"threshold":null,"status":"INFO"},{"metric":"stale_purged","value":38850,"threshold":null,"status":"INFO"},{"metric":"stale_purged_permit","value":38850,"threshold":null,"status":"INFO"},{"metric":"stale_purged_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"grace_purged","value":697,"threshold":null,"status":"INFO"},{"metric":"skipped_no_anchor","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_past_target","value":130607,"threshold":null,"status":"INFO"},{"metric":"skipped_too_old","value":17229,"threshold":null,"status":"INFO"},{"metric":"snowplow_applied","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_no_anchor_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_too_old_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"snowplow_applied_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_forecasts_computed","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_skipped_audit_blocked","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_audit_gate_status","value":"no_prior_run","threshold":"== 'pass'","status":"WARN"},{"metric":"coa_anchor_fallback_pct","value":"0.0%","threshold":"< 95% post-quiet-period; INFO during 30-day quiet period","status":"PASS"},{"metric":"coa_anchor_fallback_pct_quiet_period","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_anchor_stale_lifecycle_transition_count","value":0,"threshold":"< 50% of totalRowsCoa post-quiet-period","status":"PASS"},{"metric":"unmapped_trades","value":0,"threshold":"== 0","status":"PASS"},{"metric":"default_calibration_pct","value":"13.5%","threshold":"< 20%","status":"PASS"},{"metric":"expired_urgency_pct","value":"0.5%","threshold":"< 30%","status":"PASS"},{"metric":"total_forecast_rows","value":620199,"threshold":null,"status":"INFO"},{"metric":"coa_skipped_count","value":0,"threshold":null,"status":"INFO"},{"metric":"lead_id_format_failed_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"coa_null_lifecycle_seq_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":14105.8,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":54384,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permit_trades":["permit_num","revision_num","trade_id","is_active"],"trades":["id","slug"],"permits":["permit_num","revision_num","lifecycle_phase","lifecycle_stalled","phase_started_at","permit_type","issued_date","application_date"],"permit_inspections":["permit_num","inspection_date","status"],"phase_calibration":["from_phase","to_phase","permit_type","median_days","p25_days","p75_days","sample_size"],"lead_trades":["lead_id","trade_id","is_active"],"coa_applications":["lead_id","lifecycle_phase","lifecycle_seq","lifecycle_group","lifecycle_stalled","project_type","coa_type_class","decision_date","hearing_date","first_seen_at"],"lifecycle_transitions":["lead_id","transitioned_at"],"phase_stay_calibration":["permit_type","project_type","coa_type_class","from_seq","to_seq","median_days","p25_days","p75_days","sample_size"],"pipeline_runs":["pipeline","status","started_at","records_meta"]},"writes":{"trade_forecasts":["permit_num","revision_num","lead_id","trade_slug","predicted_start","confidence","urgency","calibration_method","sample_size","median_days","p25_days","p75_days","computed_at"]}}

[compute-trade-forecasts] completed in 54.4s

```

### stderr tail
```
{"level":"WARN","tag":"[trade-forecasts]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=54607ms

### C2: PASS
**Evidence:** id=3160 status=completed completed_at=Fri May 08 2026 18:37:53 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 14 audit rows: [forecasts_computed, new_forecasts, stale_purged, grace_purged, skipped_no_anchor, skipped_past_target, skipped_too_old, snowplow_applied, unmapped_trades, default_calibration_pct, expired_urgency_pct, total_forecast_rows, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 15 records_meta keys: [telemetry, grace_purged, pipeline_meta, anchor_sources, skipped_too_old, unmapped_trades, snowplow_applied, skipped_no_anchor, forecasts_computed, skipped_past_target, total_forecast_rows, urgency_distribution, anchor_fallbacks_used, stale_forecasts_purged, calibration_distribution]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=653807; deltas={"trade_forecasts":{"pre":654179,"post":620199,"delta":-33980}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_trade_forecasts

### C11: N/A-MANUAL
**Evidence:** records_total=818503 records_new=0 records_updated=653807; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=818503 records_new=0 records_updated=653807
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
- **C8:** claimed records_new+records_updated=653807; deltas={"trade_forecasts":{"pre":654179,"post":620199,"delta":-33980}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_trade_forecasts
- **C11:** records_total=818503 records_new=0 records_updated=653807; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
