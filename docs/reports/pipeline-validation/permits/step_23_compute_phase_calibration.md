# Step 23: compute_phase_calibration
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 56ebce1
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** INVESTIGATE
**Notes:** §11.6 invariants; Phase E.3

## Pre-run state
- Output table counts: {"phase_stay_calibration":{"ok":true,"n":191}}
- Last 3 runs: [
  {
    "id": 3319,
    "status": "completed",
    "completed_at": "2026-05-20T20:49:58.612Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:49:57.065Z",
    "duration_ms": "1547"
  },
  {
    "id": 3273,
    "status": "completed",
    "completed_at": "2026-05-20T02:16:08.942Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:16:06.914Z",
    "duration_ms": "2029"
  },
  {
    "id": 3241,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:52.546Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:52:50.179Z",
    "duration_ms": "2367"
  }
]

## Execution
- Command: `node scripts/compute-phase-calibration.js`
- Exit code: 0
- Duration: 1371ms
- New `pipeline_runs.id`: 3319

## Post-run state
- Output table counts: {"phase_stay_calibration":{"ok":true,"n":191}}
- New run: {"id":3319,"status":"completed","verdict":"WARN","duration_ms":"1547","records_total":119225,"records_new":189,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 189,
    "metric": "total_buckets",
    "status": "PASS",
    "threshold": ">= 1"
  },
  {
    "value": 20,
    "metric": "permit_types_calibrated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 23,
    "metric": "phases_calibrated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 101,
    "metric": "unreliable_buckets",
    "status": "WARN",
    "threshold": "< 30 sample_size triggers WARN; equals low+outlier by definition (do not sum)"
  },
  {
    "value": 189,
    "metric": "permit_cohort_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_cohort_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 33106,
    "metric": "coa_transition_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 57,
    "metric": "high_volume_buckets",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 31,
    "metric": "mid_volume_buckets",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 41,
    "metric": "low_volume_buckets",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 60,
    "metric": "outlier_buckets",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_cohort_presence",
    "status": "WARN",
    "threshold": ">= 1 (WARN = E.2 not yet run, OR Phase D fully incomplete, OR seq-range excludes all CoA transitions — see co-firing note)"
  },
  {
    "value": 89,
    "metric": "coa_project_type_coverage_pct",
    "status": "PASS",
    "threshold": ">= 50 PASS, < 50 WARN"
  },
  {
    "value": 0,
    "metric": "unknown_cohort_count",
    "status": "PASS",
    "threshold": "== 0 PASS, > 0 WARN"
  },
  {
    "value": 7769,
    "metric": "coa_type_class_null_transition_count",
    "status": "WARN",
    "threshold": "ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage"
  },
  {
    "value": 93951.93,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1269,
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
      "phase_stay_calibration": {
        "after": 189,
        "delta": 0,
        "before": 189
      }
    },
    "engine": {
      "phase_stay_calibration": {
        "idx_scan": 4,
        "seq_scan": 27,
        "seq_ratio": 0.871,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 189
      }
    },
    "pg_stats": {
      "phase_stay_calibration": {
        "del": 0,
        "ins": 189,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "pipeline_meta": {
    "reads": {
      "coa_applications": [
        "project_type"
      ],
      "lifecycle_transitions": [
        "lead_id",
        "from_phase",
        "to_phase",
        "from_seq",
        "to_seq",
        "transitioned_at",
        "project_type",
        "coa_type_class",
        "id"
      ],
      "permit_phase_transitions": [
        "permit_num",
        "revision_num",
        "from_phase",
        "to_phase",
        "transitioned_at",
        "permit_type",
        "id"
      ]
    },
    "writes": {
      "phase_stay_calibration": [
        "permit_type",
        "project_type",
        "coa_type_class",
        "from_seq",
        "to_seq",
        "phase",
        "median_days",
        "p25_days",
        "p75_days",
        "sample_size",
        "computed_at"
      ]
    }
  },
  "sample_size_distribution": {
    "low": 41,
    "mid": 31,
    "high": 57,
    "outlier": 60
  },
  "cohort_dimension_coverage": {
    "to_seq_non_null": 0,
    "from_seq_non_null": 0,
    "permit_type_non_null": 189,
    "project_type_non_null": 0,
    "coa_type_class_non_null": 0
  },
  "coa_project_type_coverage_pct": 89,
  "coa_lt_project_type_coverage_pct": 89
}
```

### stdout tail
```
{"level":"INFO","tag":"[compute-phase-calibration]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-phase-calibration]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[compute-phase-calibration]","msg":"lifecycle_transitions has 33,106 CoA-side rows; expecting CoA cohorts."}
PIPELINE_SUMMARY:{"records_total":122304,"records_new":191,"records_updated":0,"records_meta":{"audit_table":{"phase":84,"name":"Phase Calibration","verdict":"WARN","rows":[{"metric":"total_buckets","value":191,"threshold":">= 1","status":"PASS"},{"metric":"permit_types_calibrated","value":21,"threshold":null,"status":"INFO"},{"metric":"phases_calibrated","value":23,"threshold":null,"status":"INFO"},{"metric":"unreliable_buckets","value":93,"threshold":"< 30 sample_size triggers WARN; equals low+outlier by definition (do not sum)","status":"WARN"},{"metric":"permit_cohort_count","value":191,"threshold":null,"status":"INFO"},{"metric":"coa_cohort_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_transition_count","value":33106,"threshold":null,"status":"INFO"},{"metric":"high_volume_buckets","value":63,"threshold":null,"status":"INFO"},{"metric":"mid_volume_buckets","value":35,"threshold":null,"status":"INFO"},{"metric":"low_volume_buckets","value":32,"threshold":null,"status":"INFO"},{"metric":"outlier_buckets","value":61,"threshold":null,"status":"INFO"},{"metric":"coa_cohort_presence","value":0,"threshold":">= 1 (WARN = E.2 not yet run, OR Phase D fully incomplete, OR seq-range excludes all CoA transitions — see co-firing note)","status":"WARN"},{"metric":"coa_project_type_coverage_pct","value":89,"threshold":">= 50 PASS, < 50 WARN","status":"PASS"},{"metric":"unknown_cohort_count","value":0,"threshold":"== 0 PASS, > 0 WARN","status":"PASS"},{"metric":"coa_type_class_null_transition_count","value":7769,"threshold":"ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":105253.01,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":1162,"threshold":null,"status":"INFO"}]},"sample_size_distribution":{"high":63,"mid":35,"low":32,"outlier":61},"cohort_dimension_coverage":{"permit_type_non_null":191,"coa_type_class_non_null":0,"project_type_non_null":0,"from_seq_non_null":0,"to_seq_non_null":0},"coa_project_type_coverage_pct":89,"coa_lt_project_type_coverage_pct":89}}
PIPELINE_META:{"reads":{"permit_phase_transitions":["permit_num","revision_num","from_phase","to_phase","transitioned_at","permit_type","id"],"lifecycle_transitions":["lead_id","from_phase","to_phase","from_seq","to_seq","transitioned_at","project_type","coa_type_class","id"],"coa_applications":["project_type"]},"writes":{"phase_stay_calibration":["permit_type","project_type","coa_type_class","from_seq","to_seq","phase","median_days","p25_days","p75_days","sample_size","computed_at"]}}

[compute-phase-calibration] completed in 1.2s

```

### stderr tail
```
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=1371ms

### C2: PASS
**Evidence:** id=3319 status=completed completed_at=Wed May 20 2026 16:49:58 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 17 audit rows: [total_buckets, permit_types_calibrated, phases_calibrated, unreliable_buckets, permit_cohort_count, coa_cohort_count, coa_transition_count, high_volume_buckets, mid_volume_buckets, low_volume_buckets, outlier_buckets, coa_cohort_presence, coa_project_type_coverage_pct, unknown_cohort_count, coa_type_class_null_transition_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 6 records_meta keys: [telemetry, pipeline_meta, sample_size_distribution, cohort_dimension_coverage, coa_project_type_coverage_pct, coa_lt_project_type_coverage_pct]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=189; deltas={"phase_stay_calibration":{"pre":191,"post":191,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_phase_calibration

### C11: N/A-MANUAL
**Evidence:** records_total=119225 records_new=189 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=119225 records_new=189 records_updated=0
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
- **C8:** claimed records_new+records_updated=189; deltas={"phase_stay_calibration":{"pre":191,"post":191,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_phase_calibration
- **C11:** records_total=119225 records_new=189 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
