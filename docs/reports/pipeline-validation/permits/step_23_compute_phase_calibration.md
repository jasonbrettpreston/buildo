# Step 23: compute_phase_calibration
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** FAIL
**Notes:** §11.6 invariants; Phase E.3

## Pre-run state
- Output table counts: {"phase_stay_calibration":{"ok":true,"n":164}}
- Last 3 runs: []

## Execution
- Command: `node scripts/compute-phase-calibration.js`
- Exit code: 0
- Duration: 2569ms
- New `pipeline_runs.id`: NONE

## Post-run state
- Output table counts: {"phase_stay_calibration":{"ok":true,"n":191}}
- New run: {}

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
{"level":"INFO","tag":"[compute-phase-calibration]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[compute-phase-calibration]","msg":"Loaded 115 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":119361,"records_new":191,"records_updated":0,"records_meta":{"audit_table":{"phase":84,"name":"Phase Calibration","verdict":"WARN","rows":[{"metric":"total_buckets","value":191,"threshold":">= 1","status":"PASS"},{"metric":"permit_types_calibrated","value":21,"threshold":null,"status":"INFO"},{"metric":"phases_calibrated","value":23,"threshold":null,"status":"INFO"},{"metric":"unreliable_buckets","value":102,"threshold":"< 30 sample_size triggers WARN; equals low+outlier by definition (do not sum)","status":"WARN"},{"metric":"permit_cohort_count","value":191,"threshold":null,"status":"INFO"},{"metric":"coa_cohort_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_transition_count","value":0,"threshold":null,"status":"INFO"},{"metric":"high_volume_buckets","value":58,"threshold":null,"status":"INFO"},{"metric":"mid_volume_buckets","value":31,"threshold":null,"status":"INFO"},{"metric":"low_volume_buckets","value":41,"threshold":null,"status":"INFO"},{"metric":"outlier_buckets","value":61,"threshold":null,"status":"INFO"},{"metric":"coa_cohort_presence","value":0,"threshold":">= 1 (WARN = E.2 not yet run, OR Phase D fully incomplete, OR seq-range excludes all CoA transitions — see co-firing note)","status":"WARN"},{"metric":"coa_project_type_coverage_pct","value":89,"threshold":">= 50 PASS, < 50 WARN","status":"PASS"},{"metric":"unknown_cohort_count","value":0,"threshold":"== 0 PASS, > 0 WARN","status":"PASS"},{"metric":"coa_type_class_null_transition_count","value":0,"threshold":"ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":49754.48,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":2399,"threshold":null,"status":"INFO"}]},"sample_size_distribution":{"high":58,"mid":31,"low":41,"outlier":61},"cohort_dimension_coverage":{"permit_type_non_null":191,"coa_type_class_non_null":0,"project_type_non_null":0,"from_seq_non_null":0,"to_seq_non_null":0},"coa_project_type_coverage_pct":89,"coa_lt_project_type_coverage_pct":0}}
PIPELINE_META:{"reads":{"permit_phase_transitions":["permit_num","revision_num","from_phase","to_phase","transitioned_at","permit_type","id"],"lifecycle_transitions":["lead_id","from_phase","to_phase","from_seq","to_seq","transitioned_at","project_type","coa_type_class","id"],"coa_applications":["project_type"]},"writes":{"phase_stay_calibration":["permit_type","project_type","coa_type_class","from_seq","to_seq","phase","median_days","p25_days","p75_days","sample_size","computed_at"]}}

[compute-phase-calibration] completed in 2.4s

```

### stderr tail
```
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"lifecycle_transitions has zero CoA-side rows — E.2 first run has not yet produced CoA transitions. coa_cohort_count will be 0 (expected pre-E.2 first-run state)."}
{"level":"WARN","tag":"[compute-phase-calibration]","msg":"lifecycle_transitions.project_type coverage 0% lags coa_applications by >10% — old transitions predate Phase D. CoA cohort buckets may be sparse until E.2 reclassifies all CoA rows (next dirty run)."}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=2569ms

### C2: FAIL
**Evidence:** no new pipeline_runs row found

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
**Evidence:** claimed records_new+records_updated=0; deltas={"phase_stay_calibration":{"pre":164,"post":191,"delta":27}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_phase_calibration

### C11: INVESTIGATE
**Evidence:** no pipeline_runs row

### C12: INVESTIGATE
**Evidence:** tripwire(s) INVESTIGATE

## Tripwires (per-risk-class profile: calculation)

- **T1:** INVESTIGATE — undefined
- **T3:** INVESTIGATE — undefined
- **T4:** INVESTIGATE — undefined
- **T5:** INVESTIGATE — undefined
- **T6:** INVESTIGATE — undefined
- **T7:** INVESTIGATE — undefined
- **T8:** INVESTIGATE — undefined
- **T9:** INVESTIGATE — undefined
- **T10:** INVESTIGATE — undefined
- **T11:** INVESTIGATE — undefined
- **T12:** INVESTIGATE — undefined

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"phase_stay_calibration":{"pre":164,"post":191,"delta":27}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_phase_calibration

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
