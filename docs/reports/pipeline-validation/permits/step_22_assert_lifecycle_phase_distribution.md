# Step 22: assert_lifecycle_phase_distribution
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Calculations
**Final status:** FAIL
**Notes:** §11.5 invariants; Phase E.4/E.5

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3159,
    "status": "completed",
    "completed_at": "2026-05-08T22:36:43.311Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T22:36:37.420Z",
    "duration_ms": "5891"
  },
  {
    "id": 3131,
    "status": "completed",
    "completed_at": "2026-05-08T22:00:34.180Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T22:00:26.153Z",
    "duration_ms": "8028"
  },
  {
    "id": 3064,
    "status": "completed",
    "completed_at": "2026-05-08T18:23:04.069Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T18:22:59.457Z",
    "duration_ms": "4612"
  }
]

## Execution
- Command: `node scripts/quality/assert-lifecycle-phase-distribution.js`
- Exit code: 1
- Duration: 5269ms
- New `pipeline_runs.id`: 3159

## Post-run state
- Output table counts: {}
- New run: {"id":3159,"status":"completed","verdict":"WARN","duration_ms":"5891","records_total":280082,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 865,
    "metric": "phase_P3_count",
    "status": "PASS",
    "threshold": "716..970"
  },
  {
    "value": 4064,
    "metric": "phase_P4_count",
    "status": "PASS",
    "threshold": "3471..4695"
  },
  {
    "value": 1502,
    "metric": "phase_P5_count",
    "status": "PASS",
    "threshold": "1247..1687"
  },
  {
    "value": 2908,
    "metric": "phase_P6_count",
    "status": "PASS",
    "threshold": "2491..3370"
  },
  {
    "value": 2042,
    "metric": "phase_P7a_count",
    "status": "PASS",
    "threshold": "1749..2367"
  },
  {
    "value": 2561,
    "metric": "phase_P7b_count",
    "status": "PASS",
    "threshold": "2154..2914"
  },
  {
    "value": 33283,
    "metric": "phase_P7c_count",
    "status": "PASS",
    "threshold": "28311..38303"
  },
  {
    "value": 1930,
    "metric": "phase_P7d_count",
    "status": "PASS",
    "threshold": "1674..2264"
  },
  {
    "value": 18953,
    "metric": "phase_P8_count",
    "status": "PASS",
    "threshold": "16117..21805"
  },
  {
    "value": 107154,
    "metric": "phase_P18_count",
    "status": "PASS",
    "threshold": "91112..123270"
  },
  {
    "value": 8203,
    "metric": "phase_P19_count",
    "status": "PASS",
    "threshold": "6748..9130"
  },
  {
    "value": 8653,
    "metric": "phase_P20_count",
    "status": "PASS",
    "threshold": "7355..9951"
  },
  {
    "value": 4426,
    "metric": "phase_P9-P17_count",
    "status": "PASS",
    "threshold": "0..80000"
  },
  {
    "value": 2996,
    "metric": "phase_O1_count",
    "status": "PASS",
    "threshold": "2549..3449"
  },
  {
    "value": 2912,
    "metric": "phase_O2_count",
    "status": "PASS",
    "threshold": "2461..3329"
  },
  {
    "value": 43378,
    "metric": "phase_O3_count",
    "status": "PASS",
    "threshold": "36913..49941"
  },
  {
    "value": 40,
    "metric": "phase_P1_count",
    "status": "PASS",
    "threshold": "30..80"
  },
  {
    "value": 147,
    "metric": "phase_P2_count",
    "status": "PASS",
    "threshold": "120..200"
  },
  {
    "value": 12,
    "metric": "unclassified_count",
    "status": "PASS",
    "threshold": "<= 100"
  },
  {
    "value": 41,
    "metric": "cross_check_stalled",
    "status": "WARN",
    "threshold": "< 1000 (WARN), >= 1000 (FAIL)"
  },
  {
    "value": 583,
    "metric": "cross_check_active_inspection",
    "status": "WARN",
    "threshold": "< 800 (WARN), >= 800 (FAIL)"
  },
  {
    "value": 201,
    "metric": "cross_check_permit_issued",
    "status": "WARN",
    "threshold": "< 500 (WARN), >= 500 (FAIL)"
  },
  {
    "value": 49240.86,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 5688,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "pipeline_meta": {
    "reads": {
      "permits": [
        "lifecycle_phase",
        "lifecycle_stalled",
        "enriched_status",
        "status"
      ],
      "coa_applications": [
        "lifecycle_phase",
        "linked_permit_num",
        "decision"
      ]
    },
    "writes": {}
  },
  "phase_distribution": {
    "O1": 2996,
    "O2": 2912,
    "O3": 43378,
    "P1": 40,
    "P2": 147,
    "P3": 865,
    "P4": 4064,
    "P5": 1502,
    "P6": 2908,
    "P8": 18953,
    "P9": 881,
    "P10": 612,
    "P11": 782,
    "P12": 88,
    "P13": 984,
    "P14": 481,
    "P15": 224,
    "P16": 186,
    "P17": 188,
    "P18": 107154,
    "P19": 8203,
    "P20": 8653,
    "P7a": 2042,
    "P7b": 2561,
    "P7c": 33283,
    "P7d": 1930,
    "null": 34065,
    "P9-P17": 4426
  },
  "unclassified_count": 12
}
```

### stdout tail
```
{"level":"INFO","tag":"[assert-lifecycle-phase-distribution]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[assert-lifecycle-phase-distribution]","msg":"Loaded 115 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":281289,"records_new":0,"records_updated":0,"records_meta":{"phase_distribution":{"O1":2900,"O2":2838,"O3":42372,"P10":612,"P11":782,"P12":86,"P13":984,"P14":481,"P15":224,"P16":186,"P17":188,"P18":106307,"P19":6623,"P20":13600,"P3":880,"P4":4050,"P5":1478,"P6":2929,"P7a":1987,"P7b":2729,"P7c":33102,"P7d":1892,"P8":18938,"P9":881,"null":34053,"P2":147,"P1":40,"P9-P17":4424},"unclassified_count":1,"seq_distribution":{},"seq_violations":[{"seq":1,"actual":0,"band_min":7,"band_max":33,"kind":"band_violation","posture":"warn"},{"seq":2,"actual":0,"band_min":195,"band_max":383,"kind":"band_violation","posture":"warn"},{"seq":3,"actual":0,"band_min":37,"band_max":91,"kind":"band_violation","posture":"warn"},{"seq":4,"actual":0,"band_min":51,"band_max":117,"kind":"band_violation","posture":"warn"},{"seq":5,"actual":0,"band_min":82,"band_max":174,"kind":"band_violation","posture":"warn"},{"seq":6,"actual":0,"band_min":221,"band_max":433,"kind":"band_violation","posture":"warn"},{"seq":8,"actual":0,"band_min":204,"band_max":400,"kind":"band_violation","posture":"warn"},{"seq":9,"actual":0,"band_min":189,"band_max":371,"kind":"band_violation","posture":"warn"},{"seq":10,"actual":0,"band_min":228,"band_max":444,"kind":"band_violation","posture":"warn"},{"seq":11,"actual":0,"band_min":172,"band_max":340,"kind":"band_violation","posture":"warn"},{"seq":12,"actual":0,"band_min":387,"band_max":741,"kind":"band_violation","posture":"warn"},{"seq":13,"actual":0,"band_min":41,"band_max":97,"kind":"band_violation","posture":"warn"},{"seq":15,"actual":0,"band_min":16,"band_max":52,"kind":"band_violation","posture":"warn"},{"seq":17,"actual":0,"band_min":242,"band_max":472,"kind":"band_violation","posture":"warn"},{"seq":18,"actual":0,"band_min":152,"band_max":304,"kind":"band_violation","posture":"warn"},{"seq":19,"actual":0,"band_min":632,"band_max":1196,"kind":"band_violation","posture":"warn"},{"seq":21,"actual":0,"band_min":5,"band_max":31,"kind":"band_violation","posture":"warn"},{"seq":24,"actual":0,"band_min":152,"band_max":304,"kind":"band_violation","posture":"warn"},{"seq":25,"actual":0,"band_min":325,"band_max":625,"kind":"band_violation","posture":"warn"},{"seq":26,"actual":0,"band_min":363,"band_max":695,"kind":"band_violation","posture":"warn"},{"seq":27,"actual":0,"band_min":16,"band_max":52,"kind":"band_violation","posture":"warn"},{"seq":29,"actual":0,"band_min":64,"band_max":140,"kind":"band_violation","posture":"warn"},{"seq":31,"actual":0,"band_min":21,"band_max":59,"kind":"band_violation","posture":"warn"},{"seq":32,"actual":0,"band_min":39,"band_max":95,"kind":"band_violation","posture":"warn"},{"seq":33,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":36,"actual":0,"band_min":81,"band_max":173,"kind":"band_violation","posture":"warn"},{"seq":38,"actual":0,"band_min":2,"band_max":26,"kind":"band_violation","posture":"warn"},{"seq":39,"actual":0,"band_min":305,"band_max":587,"kind":"band_violation","posture":"warn"},{"seq":40,"actual":0,"band_min":23,"band_max":63,"kind":"band_violation","posture":"warn"},{"seq":41,"actual":0,"band_min":16,"band_max":50,"kind":"band_violation","posture":"warn"},{"seq":42,"actual":0,"band_min":163,"band_max":323,"kind":"band_violation","posture":"warn"},{"seq":43,"actual":0,"band_min":2,"band_max":24,"kind":"band_violation","posture":"warn"},{"seq":45,"actual":0,"band_min":7,"band_max":33,"kind":"band_violation","posture":"warn"},{"seq":46,"actual":0,"band_min":2,"band_max":26,"kind":"band_violation","posture":"warn"},{"seq":49,"actual":0,"band_min":2,"band_max":24,"kind":"band_violation","posture":"warn"},{"seq":57,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":59,"actual":0,"band_min":618,"band_max":1168,"kind":"band_violation","posture":"warn"},{"seq":60,"actual":0,"band_min":621,"band_max":1175,"kind":"band_violation","posture":"warn"},{"seq":61,"actual":0,"band_min":637,"band_max":1205,"kind":"band_violation","posture":"warn"},{"seq":62,"actual":0,"band_min":637,"band_max":1203,"kind":"band_violation","posture":"warn"},{"seq":63,"actual":0,"band_min":623,"band_max":1177,"kind":"band_violation","posture":"warn"},{"seq":64,"actual":0,"band_min":622,"band_max":1176,"kind":"band_violation","posture":"warn"},{"seq":72,"actual":0,"band_min":639,"band_max":1209,"kind":"band_violation","posture":"warn"},{"seq":73,"actual":0,"band_min":618,"band_max":1168,"kind":"band_violation","posture":"warn"},{"seq":89,"actual":0,"band_min":18,"band_max":56,"kind":"band_violation","posture":"warn"},{"seq":90,"actual":0,"band_min":15,"band_max":49,"kind":"band_violation","posture":"warn"},{"seq":92,"actual":0,"band_min":341,"band_max":655,"kind":"band_violation","posture":"warn"},{"seq":97,"actual":0,"band_min":4,"band_max":28,"kind":"band_violation","posture":"warn"},{"seq":98,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":99,"actual":0,"band_min":670,"band_max":1266,"kind":"band_violation","posture":"warn"}],"seq_violations_truncated_count":66,"audit_table":{"phase":22,"name":"Assert Lifecycle Phase Distribution","verdict":"FAIL","rows":[{"metric":"phase_P3_count","value":880,"threshold":"716..970","status":"PASS"},{"metric":"phase_P4_count","value":4050,"threshold":"3471..4695","status":"PASS"},{"metric":"phase_P5_count","value":1478,"threshold":"1247..1687","status":"PASS"},{"metric":"phase_P6_count","value":2929,"threshold":"2491..3370","status":"PASS"},{"metric":"phase_P7a_count","value":1987,"threshold":"1749..2367","status":"PASS"},{"metric":"phase_P7b_count","value":2729,"threshold":"2154..2914","status":"PASS"},{"metric":"phase_P7c_count","value":33102,"threshold":"28311..38303","status":"PASS"},{"metric":"phase_P7d_count","value":1892,"threshold":"1674..2264","status":"PASS"},{"metric":"phase_P8_count","value":18938,"threshold":"16117..21805","status":"PASS"},{"metric":"phase_P18_count","value":106307,"threshold":"91112..123270","status":"PASS"},{"metric":"phase_P19_count","value":6623,"threshold":"6748..9130","status":"FAIL"},{"metric":"phase_P20_count","value":13600,"threshold":"7355..9951","status":"FAIL"},{"metric":"phase_P9-P17_count","value":4424,"threshold":"0..80000","status":"PASS"},{"metric":"phase_O1_count","value":2900,"threshold":"2549..3449","status":"PASS"},{"metric":"phase_O2_count","value":2838,"threshold":"2461..3329","status":"PASS"},{"metric":"phase_O3_count","value":42372,"threshold":"36913..49941","status":"PASS"},{"metric":"phase_P1_count","value":40,"threshold":"30..80","status":"PASS"},{"metric":"phase_P2_count","value":147,"threshold":"120..200","status":"PASS"},{"metric":"unclassified_count","value":1,"threshold":"<= 100","status":"PASS"},{"metric":"cross_check_stalled","value":42,"threshold":"< 1000 (WARN), >= 1000 (FAIL)","status":"WARN"},{"metric":"cross_check_active_inspection","value":583,"threshold":"< 800 (WARN), >= 800 (FAIL)","status":"WARN"},{"metric":"cross_check_permit_issued","value":195,"threshold":"< 500 (WARN), >= 500 (FAIL)","status":"WARN"},{"metric":"seq_bands_total","value":110,"threshold":"== 110 expected (dynamic from universal_stream_catalog; WARN on partial mig 148 apply)","status":"PASS"},{"metric":"seq_bands_passing","value":52,"threshold":null,"status":"INFO"},{"metric":"seq_bands_null_catalog_count","value":33,"threshold":null,"status":"INFO"},{"metric":"seq_bands_warn","value":116,"threshold":"== 0 PASS, > 0 WARN (E.4 first-deploy posture; E.5 tightens to FAIL)","status":"WARN"},{"metric":"seq_bands_failing","value":0,"threshold":"== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)","status":"PASS"},{"metric":"lifecycle_seq_band_promote_to_fail_band_violation","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `band_violation` kind. See Spec 84 §3.4.","status":"INFO"},{"metric":"lifecycle_seq_band_promote_to_fail_no_band_configured","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `no_band_configured` kind (operator config gap). See Spec 84 §3.4.","status":"INFO"},{"metric":"lifecycle_seq_band_promote_to_fail_expected_data_missing","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `expected_data_missing` kind (data deletion / classifier-skip signal). See Spec 84 §3.4.","status":"INFO"},{"metric":"seq_unclassified_count","value":274890,"threshold":"<= 5000 (WARN above)","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":55382.75,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":5079,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["lifecycle_phase","lifecycle_seq","lifecycle_stalled","enriched_status","status"],"coa_applications":["lifecycle_phase","lifecycle_seq","linked_permit_num","decision"],"universal_stream_catalog":["seq","rows_count"]},"writes":{}}

```

### stderr tail
```
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}
{"level":"ERROR","tag":"[assert-lifecycle-phase-distribution]","msg":"FAILURES","error_type":"unknown","context":{"failures":["P19: 6623 outside expected band [6748, 9130]","P20: 13600 outside expected band [7355, 9951]"]}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"WARNINGS","context":{"warnings":["42 permits have enriched_status=Stalled but lifecycle_stalled=false (Strangler Fig drift — legacy column is less accurate)","583 permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (Strangler Fig drift — legacy column is less accurate)","116 per-seq bands outside expected range (0 FAIL, 116 WARN) — first 10: [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 1: 0 outside [7, 33]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 2: 0 outside [195, 383]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 3: 0 outside [37, 91]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 4: 0 outside [51, 117]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 5: 0 outside [82, 174]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 6: 0 outside [221, 433]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 8: 0 outside [204, 400]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 9: 0 outside [189, 371]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 10: 0 outside [228, 444]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 11: 0 outside [172, 340] ... (+40 more in records_meta.seq_violations) (66 additional violations TRUNCATED — see records_meta.seq_violations_truncated_count)","[E.4 WARN-ONLY POSTURE] seq_unclassified_count 274890 exceeds 5000 — Phase D/E.2 first-run state likely; verify classifier coverage. (In steady state seq_unclassified_count >= unclassified_count; the two converge as E.5 ramps up.)"]}}
{"level":"ERROR","tag":"[assert-lifecycle-phase-distribution]","msg":"Distribution sanity check FAILED (2 failures):\nP19: 6623 outside expected band [6748, 9130]\nP20: 13600 outside expected band [7355, 9951]","error_type":"unknown","stack":"Error: Distribution sanity check FAILED (2 failures):\nP19: 6623 outside expected band [6748, 9130]\nP20: 13600 outside expected band [7355, 9951]\n    at pipeline.withAdvisoryLock.skipEmit (C:\\Users\\User\\Buildo\\scripts\\quality\\assert-lifecycle-phase-distribution.js:736:13)\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async Object.withAdvisoryLock (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:802:22)\n    at async C:\\Users\\User\\Buildo\\scripts\\quality\\assert-lifecycle-phase-distribution.js:111:22\n    at async Object.run (C:\\Users\\User\\Buildo\\scripts\\lib\\pipeline.js:350:5)","context":{"phase":"fatal"}}
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: Distribution sanity check FAILED (2 failures):
P19: 6623 outside expected band [6748, 9130]
P20: 13600 outside expected band [7355, 9951]
    at pipeline.withAdvisoryLock.skipEmit (C:\Users\User\Buildo\scripts\quality\assert-lifecycle-phase-distribution.js:736:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async Object.withAdvisoryLock (C:\Users\User\Buildo\scripts\lib\pipeline.js:802:22)
    at async C:\Users\User\Buildo\scripts\quality\assert-lifecycle-phase-distribution.js:111:22
    at async Object.run (C:\Users\User\Buildo\scripts\lib\pipeline.js:350:5)

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=5269ms

### C2: PASS
**Evidence:** id=3159 status=completed completed_at=Fri May 08 2026 18:36:43 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 24 audit rows: [phase_P3_count, phase_P4_count, phase_P5_count, phase_P6_count, phase_P7a_count, phase_P7b_count, phase_P7c_count, phase_P7d_count, phase_P8_count, phase_P18_count, phase_P19_count, phase_P20_count, phase_P9-P17_count, phase_O1_count, phase_O2_count, phase_O3_count, phase_P1_count, phase_P2_count, unclassified_count, cross_check_stalled, cross_check_active_inspection, cross_check_permit_issued, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 3 records_meta keys: [pipeline_meta, phase_distribution, unclassified_count]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=280082 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=280082 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=280082 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
