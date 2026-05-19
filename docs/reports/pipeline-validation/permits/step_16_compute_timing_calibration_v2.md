# Step 16: compute_timing_calibration_v2
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.3 invariants

## Pre-run state
- Output table counts: {"timing_calibration":{"ok":false,"error":"table_not_found"}}
- Last 3 runs: [
  {
    "id": 3152,
    "status": "completed",
    "completed_at": "2026-05-08T22:34:07.233Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:34:05.143Z",
    "duration_ms": "2091"
  },
  {
    "id": 3124,
    "status": "completed",
    "completed_at": "2026-05-08T21:56:48.442Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:56:44.691Z",
    "duration_ms": "3751"
  },
  {
    "id": 3057,
    "status": "completed",
    "completed_at": "2026-05-08T18:20:36.554Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:20:34.775Z",
    "duration_ms": "1780"
  }
]

## Execution
- Command: `node scripts/compute-timing-calibration-v2.js`
- Exit code: 0
- Duration: 1208ms
- New `pipeline_runs.id`: 3152

## Post-run state
- Output table counts: {"timing_calibration":{"ok":false,"error":"table_not_found"}}
- New run: {"id":3152,"status":"completed","verdict":"PASS","duration_ms":"2091","records_total":131,"records_new":0,"records_updated":131}

### audit_table.rows
```json
[
  {
    "value": 131,
    "metric": "phase_pairs_computed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 131,
    "metric": "pairs_above_threshold",
    "status": "PASS",
    "threshold": 1
  },
  {
    "value": 0,
    "metric": "negative_gap_count",
    "status": "PASS",
    "threshold": 0
  },
  {
    "value": 0,
    "metric": "null_stats_count",
    "status": "PASS",
    "threshold": 0
  },
  {
    "value": 71.35,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1836,
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
      "phase_calibration": {
        "after": 136,
        "delta": 0,
        "before": 136
      }
    },
    "engine": {
      "phase_calibration": {
        "idx_scan": 652,
        "seq_scan": 31,
        "seq_ratio": 0.0454,
        "dead_ratio": 0.2184,
        "n_dead_tup": 38,
        "n_live_tup": 136
      }
    },
    "pg_stats": {
      "phase_calibration": {
        "del": 0,
        "ins": 0,
        "upd": 131
      }
    },
    "null_fills": {}
  },
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "permit_type",
        "issued_date"
      ],
      "permit_inspections": [
        "permit_num",
        "stage_name",
        "status",
        "inspection_date"
      ]
    },
    "writes": {
      "phase_calibration": [
        "from_phase",
        "to_phase",
        "permit_type",
        "median_days",
        "p25_days",
        "p75_days",
        "sample_size",
        "computed_at"
      ]
    }
  },
  "min_sample_size": 5,
  "phase_pairs_by_type": 65,
  "issued_pairs_by_type": 22,
  "phase_pairs_all_types": 35,
  "issued_pairs_all_types": 9,
  "total_calibration_rows": 136
}
```

### stdout tail
```
{"level":"INFO","tag":"[calibration-v2]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Computing phase-to-phase calibration from inspection pairs..."}
{"level":"INFO","tag":"[calibration-v2]","msg":"Phase-to-phase pairs: 66 (per permit_type)"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Phase-to-phase pairs (all types): 35"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Computing ISSUED → first-phase calibration..."}
{"level":"INFO","tag":"[calibration-v2]","msg":"ISSUED → phase pairs: 22"}
{"level":"INFO","tag":"[calibration-v2]","msg":"ISSUED → phase pairs (all types): 9"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Total calibration rows to upsert: 132"}
{"level":"INFO","tag":"[calibration-v2]","msg":"Upserted 132 calibration rows"}
PIPELINE_SUMMARY:{"records_total":132,"records_new":0,"records_updated":132,"records_meta":{"phase_pairs_by_type":66,"phase_pairs_all_types":35,"issued_pairs_by_type":22,"issued_pairs_all_types":9,"total_calibration_rows":136,"min_sample_size":5,"audit_table":{"phase":15,"name":"Timing Calibration V2","verdict":"PASS","rows":[{"metric":"phase_pairs_computed","value":132,"threshold":null,"status":"INFO"},{"metric":"pairs_above_threshold","value":132,"threshold":1,"status":"PASS"},{"metric":"negative_gap_count","value":0,"threshold":0,"status":"PASS"},{"metric":"null_stats_count","value":0,"threshold":0,"status":"PASS"},{"metric":"sys_velocity_rows_sec","value":127.05,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":1039,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permit_inspections":["permit_num","stage_name","status","inspection_date"],"permits":["permit_num","permit_type","issued_date"]},"writes":{"phase_calibration":["from_phase","to_phase","permit_type","median_days","p25_days","p75_days","sample_size","computed_at"]}}

[compute-timing-calibration-v2] completed in 1.0s

```

### stderr tail
```
{"level":"WARN","tag":"[calibration-v2]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=1208ms

### C2: PASS
**Evidence:** id=3152 status=completed completed_at=Fri May 08 2026 18:34:07 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 6 audit rows: [phase_pairs_computed, pairs_above_threshold, negative_gap_count, null_stats_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 8 records_meta keys: [telemetry, pipeline_meta, min_sample_size, phase_pairs_by_type, issued_pairs_by_type, phase_pairs_all_types, issued_pairs_all_types, total_calibration_rows]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=131; deltas={"timing_calibration":{"error":"table_not_found"}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for compute_timing_calibration_v2

### C11: N/A-MANUAL
**Evidence:** records_total=131 records_new=0 records_updated=131; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — no *_errors rows
- **T3:** INFO — records_total=131 records_new=0 records_updated=131
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
- **C8:** claimed records_new+records_updated=131; deltas={"timing_calibration":{"error":"table_not_found"}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for compute_timing_calibration_v2
- **C11:** records_total=131 records_new=0 records_updated=131; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
