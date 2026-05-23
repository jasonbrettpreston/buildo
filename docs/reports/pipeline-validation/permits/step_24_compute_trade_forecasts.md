# Step 24: compute_trade_forecasts
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 56ebce1
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** INVESTIGATE
**Notes:** §11.7 invariants; Phase F.1

## Pre-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":657561}}
- Last 3 runs: [
  {
    "id": 3320,
    "status": "completed",
    "completed_at": "2026-05-20T20:50:58.789Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:49:58.614Z",
    "duration_ms": "60175"
  },
  {
    "id": 3274,
    "status": "completed",
    "completed_at": "2026-05-20T02:16:59.912Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:16:08.944Z",
    "duration_ms": "50968"
  },
  {
    "id": 3242,
    "status": "completed",
    "completed_at": "2026-05-20T01:54:25.278Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:52:52.551Z",
    "duration_ms": "92726"
  }
]

## Execution
- Command: `node scripts/compute-trade-forecasts.js`
- Exit code: 0
- Duration: 60377ms
- New `pipeline_runs.id`: 3320

## Post-run state
- Output table counts: {"trade_forecasts":{"ok":true,"n":657523}}
- New run: {"id":3320,"status":"completed","verdict":"WARN","duration_ms":"60175","records_total":801235,"records_new":0,"records_updated":619132}

### audit_table.rows
```json
[
  {
    "value": 619132,
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
    "value": 145,
    "metric": "stale_purged",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 145,
    "metric": "stale_purged_permit",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "stale_purged_coa",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 17,
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
    "value": 130567,
    "metric": "skipped_past_target",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 17246,
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
    "metric": "skipped_no_anchor_coa",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "skipped_too_old_coa",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "snowplow_applied_coa",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_forecasts_computed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 34290,
    "metric": "coa_skipped_audit_blocked",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "blocked_by_warn",
    "metric": "coa_audit_gate_status",
    "status": "WARN",
    "threshold": "== 'pass'"
  },
  {
    "value": "0.0%",
    "metric": "coa_anchor_fallback_pct",
    "status": "PASS",
    "threshold": "< 95% post-quiet-period; INFO during 30-day quiet period"
  },
  {
    "value": 0,
    "metric": "coa_anchor_fallback_pct_quiet_period",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_anchor_stale_lifecycle_transition_count",
    "status": "PASS",
    "threshold": "< 50% of totalRowsCoa post-quiet-period"
  },
  {
    "value": 0,
    "metric": "unmapped_trades",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": "13.5%",
    "metric": "default_calibration_pct",
    "status": "PASS",
    "threshold": "< 20%"
  },
  {
    "value": "0.5%",
    "metric": "expired_urgency_pct",
    "status": "PASS",
    "threshold": "< 30%"
  },
  {
    "value": 620037,
    "metric": "total_forecast_rows",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_skipped_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "lead_id_format_failed_count",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "coa_null_lifecycle_seq_count",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 13950.05,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 57436,
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
        "after": 620037,
        "delta": -162,
        "before": 620199
      }
    },
    "engine": {
      "trade_forecasts": {
        "idx_scan": 1858036,
        "seq_scan": 109,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4308,
        "n_dead_tup": 468050,
        "n_live_tup": 618322
      }
    },
    "pg_stats": {
      "trade_forecasts": {
        "del": 162,
        "ins": 0,
        "upd": 619132
      }
    },
    "null_fills": {}
  },
  "grace_purged": 17,
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
      "lead_trades": [
        "lead_id",
        "trade_id",
        "is_active"
      ],
      "permit_trades": [
        "permit_num",
        "revision_num",
        "trade_id",
        "is_active"
      ],
      "pipeline_runs": [
        "pipeline",
        "status",
        "started_at",
        "records_meta"
      ],
      "coa_applications": [
        "lead_id",
        "lifecycle_phase",
        "lifecycle_seq",
        "lifecycle_group",
        "lifecycle_stalled",
        "project_type",
        "coa_type_class",
        "decision_date",
        "hearing_date",
        "first_seen_at"
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
      ],
      "lifecycle_transitions": [
        "lead_id",
        "transitioned_at"
      ],
      "phase_stay_calibration": [
        "permit_type",
        "project_type",
        "coa_type_class",
        "from_seq",
        "to_seq",
        "median_days",
        "p25_days",
        "p75_days",
        "sample_size"
      ]
    },
    "writes": {
      "trade_forecasts": [
        "permit_num",
        "revision_num",
        "lead_id",
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
    "phase_started_at": 636378,
    "last_passed_inspection": 0
  },
  "total_rows_coa": 34290,
  "skipped_too_old": 17246,
  "unmapped_trades": 0,
  "snowplow_applied": 0,
  "stale_purged_coa": 0,
  "skipped_no_anchor": 0,
  "total_rows_permit": 766945,
  "anchor_sources_coa": {
    "hearing_date": 0,
    "decision_date": 0,
    "first_seen_at": 0,
    "lifecycle_transition": 0
  },
  "forecasts_computed": 619132,
  "skipped_past_target": 130567,
  "skipped_too_old_coa": 0,
  "stale_purged_permit": 145,
  "total_forecast_rows": 620037,
  "snowplow_applied_coa": 0,
  "urgency_distribution": {
    "delayed": 6561,
    "expired": 3036,
    "on_time": 471998,
    "overdue": 3226,
    "imminent": 3798,
    "upcoming": 131418
  },
  "anchor_fallbacks_used": 0,
  "coa_audit_gate_status": "blocked_by_warn",
  "skipped_no_anchor_coa": 0,
  "coa_first_deploy_grace": false,
  "forecasts_computed_coa": 0,
  "stale_forecasts_purged": 145,
  "coa_anchor_fallback_pct": 0,
  "calibration_distribution": {
    "exact": 168394,
    "default": 83397,
    "fallback_all_types": 28531,
    "fallback_issued_all": 50298,
    "fallback_issued_type": 289417
  },
  "coa_skipped_audit_blocked": 34290,
  "forecasts_computed_permit": 619132,
  "lead_id_format_failed_coa": 0,
  "coa_null_lifecycle_seq_count": 0,
  "lead_id_format_failed_permit": 0,
  "skipped_distribution_by_lifecycle_group": {
    "C1": {
      "upserted": 0,
      "skipped_too_old": 0,
      "snowplow_applied": 0,
      "skipped_no_anchor": 0
    },
    "C2": {
      "upserted": 0,
      "skipped_too_old": 0,
      "snowplow_applied": 0,
      "skipped_no_anchor": 0
    },
    "C3": {
      "upserted": 0,
      "skipped_too_old": 0,
      "snowplow_applied": 0,
      "skipped_no_anchor": 0
    }
  },
  "coa_anchor_stale_lifecycle_transition_count": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"CoA audit-verdict gate: blocked_by_warn (last_run_id=3319, last_verdict=WARN)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loading calibration data..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Calibration loaded: 136 entries"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Loading CoA cohort calibration from phase_stay_calibration..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"CoA cohort calibration loaded: 0 raw rows → 0 unique (pt,tc,from_seq) cohorts"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streaming active permit-trade pairs..."}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streamed 293,823 rows, 234,050 forecasts buffered"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Streamed 583,126 rows, 468,100 forecasts buffered"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Rows streamed: 804,941 (permit=770,408, coa=34,533)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Forecasts to write: 622,171 (coa=0)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Skipped (no anchor, permit): 0"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"CoA audit-gate blocked: 34,533 rows (gate=blocked_by_warn)"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Skipped (too old, grace cutoff): 17,306"}
{"level":"INFO","tag":"[trade-forecasts]","msg":"Grace-purged 38 expired forecasts older than 180 days"}
PIPELINE_SUMMARY:{"records_total":804941,"records_new":0,"records_updated":622171,"records_meta":{"forecasts_computed":622171,"forecasts_computed_permit":622171,"forecasts_computed_coa":0,"total_rows_permit":770408,"total_rows_coa":34533,"stale_forecasts_purged":0,"stale_purged_permit":0,"stale_purged_coa":0,"grace_purged":38,"skipped_no_anchor":0,"skipped_no_anchor_coa":0,"skipped_past_target":130931,"skipped_too_old":17306,"skipped_too_old_coa":0,"snowplow_applied_coa":0,"coa_skipped_audit_blocked":34533,"coa_anchor_stale_lifecycle_transition_count":0,"coa_anchor_fallback_pct":0,"coa_null_lifecycle_seq_count":0,"lead_id_format_failed_permit":0,"lead_id_format_failed_coa":0,"skipped_distribution_by_lifecycle_group":{"C1":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0},"C2":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0},"C3":{"skipped_no_anchor":0,"skipped_too_old":0,"snowplow_applied":0,"upserted":0}},"coa_first_deploy_grace":false,"coa_audit_gate_status":"blocked_by_warn","unmapped_trades":0,"anchor_fallbacks_used":0,"anchor_sources":{"phase_started_at":639477,"last_passed_inspection":0,"issued_date":0,"application_date":0},"anchor_sources_coa":{"lifecycle_transition":0,"decision_date":0,"hearing_date":0,"first_seen_at":0},"snowplow_applied":0,"urgency_distribution":{"delayed":6210,"expired":2949,"imminent":78478,"on_time":474993,"overdue":3308,"upcoming":91585},"calibration_distribution":{"default":117984,"exact":168940,"fallback_all_types":29112,"fallback_issued_all":51131,"fallback_issued_type":290356},"total_forecast_rows":657523,"audit_table":{"phase":22,"name":"Trade Forecasts","verdict":"WARN","rows":[{"metric":"forecasts_computed","value":622171,"threshold":null,"status":"INFO"},{"metric":"new_forecasts","value":0,"threshold":null,"status":"INFO"},{"metric":"stale_purged","value":0,"threshold":null,"status":"INFO"},{"metric":"stale_purged_permit","value":0,"threshold":null,"status":"INFO"},{"metric":"stale_purged_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"grace_purged","value":38,"threshold":null,"status":"INFO"},{"metric":"skipped_no_anchor","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_past_target","value":130931,"threshold":null,"status":"INFO"},{"metric":"skipped_too_old","value":17306,"threshold":null,"status":"INFO"},{"metric":"snowplow_applied","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_no_anchor_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"skipped_too_old_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"snowplow_applied_coa","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_forecasts_computed","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_skipped_audit_blocked","value":34533,"threshold":null,"status":"INFO"},{"metric":"coa_audit_gate_status","value":"blocked_by_warn","threshold":"== 'pass'","status":"WARN"},{"metric":"coa_audit_gate_grace_bypass","value":0,"threshold":"== 0; if 1, calibration unhealthy and cold-start grace is allowing writes — verify by re-running compute_phase_calibration after 7d","status":"INFO"},{"metric":"coa_audit_gate_force_active","value":0,"threshold":"== 0; if 1, operator has manually overridden the gate — set coa_gate_force_active=0 once root cause is resolved","status":"INFO"},{"metric":"coa_anchor_fallback_pct","value":"0.0%","threshold":"< 95% post-quiet-period; INFO during 30-day quiet period","status":"PASS"},{"metric":"coa_anchor_fallback_pct_quiet_period","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_anchor_stale_lifecycle_transition_count","value":0,"threshold":"< 50% of totalRowsCoa post-quiet-period","status":"PASS"},{"metric":"unmapped_trades","value":0,"threshold":"== 0","status":"PASS"},{"metric":"default_calibration_pct","value":"17.9%","threshold":"< 20%","status":"PASS"},{"metric":"expired_urgency_pct","value":"0.4%","threshold":"< 30%","status":"PASS"},{"metric":"total_forecast_rows","value":657523,"threshold":null,"status":"INFO"},{"metric":"coa_skipped_count","value":0,"threshold":null,"status":"INFO"},{"metric":"lead_id_format_failed_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"coa_null_lifecycle_seq_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":13387.35,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":60127,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permit_trades":["permit_num","revision_num","trade_id","is_active"],"trades":["id","slug"],"permits":["permit_num","revision_num","lifecycle_phase","lifecycle_stalled","phase_started_at","permit_type","issued_date","application_date"],"permit_inspections":["permit_num","inspection_date","status"],"phase_calibration":["from_phase","to_phase","permit_type","median_days","p25_days","p75_days","sample_size"],"lead_trades":["lead_id","trade_id","is_active"],"coa_applications":["lead_id","lifecycle_phase","lifecycle_seq","lifecycle_group","lifecycle_stalled","project_type","coa_type_class","decision_date","hearing_date","first_seen_at"],"lifecycle_transitions":["lead_id","transitioned_at"],"phase_stay_calibration":["permit_type","project_type","coa_type_class","from_seq","to_seq","median_days","p25_days","p75_days","sample_size"],"pipeline_runs":["pipeline","status","started_at","records_meta"]},"writes":{"trade_forecasts":["permit_num","revision_num","lead_id","trade_slug","predicted_start","confidence","urgency","calibration_method","sample_size","median_days","p25_days","p75_days","computed_at"]}}

[compute-trade-forecasts] completed in 60.1s

```

### stderr tail
```
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[trade-forecasts]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=60377ms

### C2: PASS
**Evidence:** id=3320 status=completed completed_at=Wed May 20 2026 16:50:58 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 28 audit rows: [forecasts_computed, new_forecasts, stale_purged, stale_purged_permit, stale_purged_coa, grace_purged, skipped_no_anchor, skipped_past_target, skipped_too_old, snowplow_applied, skipped_no_anchor_coa, skipped_too_old_coa, snowplow_applied_coa, coa_forecasts_computed, coa_skipped_audit_blocked, coa_audit_gate_status, coa_anchor_fallback_pct, coa_anchor_fallback_pct_quiet_period, coa_anchor_stale_lifecycle_transition_count, unmapped_trades, default_calibration_pct, expired_urgency_pct, total_forecast_rows, coa_skipped_count, lead_id_format_failed_count, coa_null_lifecycle_seq_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 34 records_meta keys: [telemetry, grace_purged, pipeline_meta, anchor_sources, total_rows_coa, skipped_too_old, unmapped_trades, snowplow_applied, stale_purged_coa, skipped_no_anchor, total_rows_permit, anchor_sources_coa, forecasts_computed, skipped_past_target, skipped_too_old_coa, stale_purged_permit, total_forecast_rows, snowplow_applied_coa, urgency_distribution, anchor_fallbacks_used, coa_audit_gate_status, skipped_no_anchor_coa, coa_first_deploy_grace, forecasts_computed_coa, stale_forecasts_purged, coa_anchor_fallback_pct, calibration_distribution, coa_skipped_audit_blocked, forecasts_computed_permit, lead_id_format_failed_coa, coa_null_lifecycle_seq_count, lead_id_format_failed_permit, skipped_distribution_by_lifecycle_group, coa_anchor_stale_lifecycle_transition_count]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=619132; deltas={"trade_forecasts":{"pre":657561,"post":657523,"delta":-38}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_trade_forecasts

### C11: N/A-MANUAL
**Evidence:** records_total=801235 records_new=0 records_updated=619132; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=801235 records_new=0 records_updated=619132
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
- **C8:** claimed records_new+records_updated=619132; deltas={"trade_forecasts":{"pre":657561,"post":657523,"delta":-38}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_trade_forecasts
- **C11:** records_total=801235 records_new=0 records_updated=619132; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
