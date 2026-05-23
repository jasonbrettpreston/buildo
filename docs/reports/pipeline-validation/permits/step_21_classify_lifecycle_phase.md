# Step 21: classify_lifecycle_phase
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** multi_domain
**Per-step agent:** Multi-domain
**Final status:** PASS-pending-manual
**Notes:** §11.4 invariants; Phase I.1.1b; covers CoA step 12

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248447},"coa_applications":{"ok":true,"n":33106},"lifecycle_status_history":{"ok":true,"n":287805},"lifecycle_transitions":{"ok":true,"n":33106}}
- Last 3 runs: [
  {
    "id": 3317,
    "status": "completed",
    "completed_at": "2026-05-20T20:49:50.054Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:48:22.025Z",
    "duration_ms": "88029"
  },
  {
    "id": 3271,
    "status": "completed",
    "completed_at": "2026-05-20T02:16:02.354Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:14:49.127Z",
    "duration_ms": "73227"
  },
  {
    "id": 3239,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:42.795Z",
    "verdict": "UNKNOWN",
    "started_at": "2026-05-20T01:52:38.023Z",
    "duration_ms": "4772"
  }
]

## Execution
- Command: `node scripts/classify-lifecycle-phase.js`
- Exit code: 0
- Duration: 74411ms
- New `pipeline_runs.id`: 3317

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248447},"coa_applications":{"ok":true,"n":33106},"lifecycle_status_history":{"ok":true,"n":289429},"lifecycle_transitions":{"ok":true,"n":33106}}
- New run: {"id":3317,"status":"completed","verdict":"PASS","duration_ms":"88029","records_total":229206,"records_new":0,"records_updated":97}

### audit_table.rows
```json
[
  {
    "value": 229206,
    "metric": "permits_dirty",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 97,
    "metric": "permits_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1,
    "metric": "permit_unmapped_status_count",
    "status": "INFO",
    "threshold": "INFO during first-deploy grace (7d)"
  },
  {
    "value": 1190,
    "metric": "permit_code_drift_count",
    "status": "INFO",
    "threshold": "INFO — Spec 84 §2.5.a documented drift"
  },
  {
    "value": {
      "rule_5": 47808,
      "rule_11": 18792,
      "rule_12": 37701,
      "rule_13": 4364,
      "rule_14": 105358
    },
    "metric": "permit_rule_distribution_top5",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1,
    "metric": "permit_first_deploy_grace",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_evaluated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_rows_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_phase_transitions_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 17,
    "metric": "lifecycle_status_history_inserted",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "lifecycle_status_history_errors",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 38535,
    "metric": "stalled_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_stalled_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "unmapped_status_count",
    "status": "PASS",
    "threshold": "<=3 WARN, <=1 PASS"
  },
  {
    "value": 0,
    "metric": "unmapped_decision_count",
    "status": "PASS",
    "threshold": "<=5 WARN, <=3 PASS"
  },
  {
    "value": 0,
    "metric": "catalog_status_missing_count",
    "status": "PASS",
    "threshold": "<=3 WARN, <=1 PASS"
  },
  {
    "value": 0,
    "metric": "catalog_invalid_phase_count",
    "status": "PASS",
    "threshold": "=0 PASS, >0 FAIL"
  },
  {
    "value": 8,
    "metric": "unclassified_count",
    "status": "PASS",
    "threshold": "<= 100"
  },
  {
    "value": 2659.87,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 86172,
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
      "permits": {
        "after": 248092,
        "delta": 0,
        "before": 248092
      },
      "coa_applications": {
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 8401028,
        "seq_scan": 727,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4801,
        "n_dead_tup": 229206,
        "n_live_tup": 248251
      },
      "coa_applications": {
        "idx_scan": 30622,
        "seq_scan": 233,
        "seq_ratio": 0.0076,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 29061
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 229206
      },
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "coas_updated": 0,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "status",
        "enriched_status",
        "issued_date",
        "last_seen_at",
        "lifecycle_classified_at",
        "matched_status",
        "lifecycle_seq"
      ],
      "coa_applications": [
        "id",
        "lead_id",
        "decision",
        "linked_permit_num",
        "status",
        "last_seen_at",
        "lifecycle_phase",
        "lifecycle_seq",
        "permit_type",
        "project_type",
        "coa_type_class",
        "neighbourhood_id",
        "matched_rule",
        "matched_status",
        "lifecycle_classified_at"
      ],
      "permit_inspections": [
        "permit_num",
        "stage_name",
        "status",
        "inspection_date"
      ],
      "universal_stream_catalog": [
        "seq",
        "lifecycle_group",
        "lifecycle_block",
        "lifecycle_stage",
        "phase",
        "bid_value",
        "source",
        "status"
      ]
    },
    "writes": {
      "permits": [
        "lifecycle_phase",
        "lifecycle_stalled",
        "lifecycle_classified_at",
        "phase_started_at",
        "matched_status",
        "matched_rule",
        "unmapped_status"
      ],
      "coa_applications": [
        "lifecycle_phase",
        "lifecycle_stalled",
        "lifecycle_classified_at",
        "lifecycle_seq",
        "lifecycle_group",
        "lifecycle_block",
        "lifecycle_stage",
        "bid_value",
        "matched_status",
        "matched_rule",
        "unmapped_status",
        "unmapped_decision"
      ],
      "lifecycle_transitions": [
        "lead_id",
        "from_phase",
        "to_phase",
        "from_seq",
        "to_seq",
        "transitioned_at",
        "permit_type",
        "project_type",
        "coa_type_class",
        "neighbourhood_id"
      ],
      "lifecycle_status_history": [
        "lead_id",
        "from_status",
        "to_status",
        "from_seq",
        "to_seq",
        "from_phase",
        "to_phase",
        "transitioned_at",
        "detected_by",
        "permit_type",
        "coa_type_class",
        "project_type"
      ],
      "permit_phase_transitions": [
        "permit_num",
        "revision_num",
        "from_phase",
        "to_phase",
        "transitioned_at",
        "permit_type",
        "neighbourhood_id"
      ]
    }
  },
  "stalled_count": 38535,
  "permits_updated": 97,
  "coa_distribution": {
    "P1": 276,
    "P2": 964,
    "P3": 1475,
    "P19": 1433,
    "P20": 28958
  },
  "phase_distribution": {
    "O1": 2902,
    "O2": 2828,
    "O3": 42382,
    "P3": 874,
    "P4": 4053,
    "P5": 1475,
    "P6": 2930,
    "P8": 18938,
    "P9": 881,
    "P10": 612,
    "P11": 782,
    "P12": 86,
    "P13": 984,
    "P14": 481,
    "P15": 224,
    "P16": 186,
    "P17": 188,
    "P18": 106307,
    "P19": 6622,
    "P20": 13454,
    "P7a": 1988,
    "P7b": 2675,
    "P7c": 33156,
    "P7d": 1896,
    "null": 1188
  },
  "unclassified_count": 8,
  "coa_rule_distribution": {},
  "coa_matched_status_top20": {},
  "permit_rule_distribution": {
    "rule_1": 2,
    "rule_2": 1178,
    "rule_3": 70,
    "rule_4": 2793,
    "rule_5": 47808,
    "rule_6": 4042,
    "rule_7": 1453,
    "rule_8": 2914,
    "rule_9": 854,
    "rule_10": 1876,
    "rule_11": 18792,
    "rule_12": 37701,
    "rule_13": 4364,
    "rule_14": 105358,
    "rule_15": 1
  },
  "phase_transitions_logged": 13,
  "permit_classifier_extended": "true",
  "coa_phase_distribution_live": {},
  "permit_matched_status_top20": {
    "Open": 529,
    "Abandoned": 122,
    "__other__": 428,
    "Inspection": 138131,
    "Not Started": 1037,
    "Under Review": 2102,
    "Permit Issued": 52318,
    "Refusal Notice": 950,
    "Revision Issued": 20657,
    "Issuance Pending": 2994,
    "Work Not Started": 1086,
    "Response Received": 463,
    "Ready for Issuance": 261,
    "Revocation Pending": 2326,
    "Application On Hold": 1656,
    "Application Received": 220,
    "Pending Cancellation": 464,
    "Not Started - Express": 97,
    "Application Acceptable": 505,
    "Examiner's Notice Sent": 2745,
    "Deficiency Notice Issued": 113
  },
  "phase_started_at_backfilled": 0,
  "initial_transitions_backfilled": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Building BLD/CMB prefix map..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"BLD/CMB prefixes tracked: 94,685"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Building inspection rollup map..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Inspection rollups built for 10,102 permits"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Streaming dirty permits..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Permits streaming complete: 229,060 dirty, 3,979 updated, 3,457 transitions"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Streaming dirty CoAs (stall threshold=30d)..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"CoAs streaming complete: 0 dirty, 0 updated"}
PIPELINE_SUMMARY:{"records_total":229060,"records_new":0,"records_updated":3979,"records_meta":{"permits_updated":3979,"phase_transitions_logged":3457,"phase_started_at_backfilled":0,"initial_transitions_backfilled":0,"coas_updated":0,"phase_distribution":{"O1":2812,"O2":2546,"O3":40782,"P10":613,"P11":782,"P12":87,"P13":984,"P14":486,"P15":224,"P16":186,"P17":193,"P18":107473,"P19":6626,"P20":13453,"P3":905,"P4":4082,"P5":1457,"P6":2926,"P7a":2039,"P7b":2826,"P7c":33857,"P7d":1924,"P8":19106,"P9":881,"null":1197},"coa_distribution":{"P20":28958,"P2":964,"P1":276,"P3":1475,"P19":1433},"stalled_count":38554,"unclassified_count":8,"permit_classifier_extended":"true","permit_rule_distribution":{"rule_14":106292,"rule_5":45725,"rule_12":38570,"rule_11":18925,"rule_9":869,"rule_7":1423,"rule_10":1894,"rule_2":1186,"rule_4":2793,"rule_13":4358,"rule_6":4065,"rule_3":69,"rule_8":2888,"rule_1":2,"rule_15":1},"permit_matched_status_top20":{"Inspection":138068,"Permit Issued":52323,"Revision Issued":20666,"Issuance Pending":2964,"Examiner's Notice Sent":2747,"Revocation Pending":2327,"Under Review":2088,"Application On Hold":1623,"Work Not Started":1088,"Not Started":1052,"Refusal Notice":957,"Open":530,"Application Acceptable":497,"Pending Cancellation":463,"Response Received":453,"Ready for Issuance":250,"Application Received":219,"Abandoned":123,"Deficiency Notice Issued":114,"Not Started - Express":94,"__other__":412},"coa_rule_distribution":{},"coa_phase_distribution_live":{},"coa_matched_status_top20":{},"audit_table":{"phase":21,"name":"Classify Lifecycle Phase","verdict":"PASS","rows":[{"metric":"permits_dirty","value":229060,"threshold":null,"status":"INFO"},{"metric":"permits_updated","value":3979,"threshold":null,"status":"INFO"},{"metric":"permit_unmapped_status_count","value":1,"threshold":"INFO during first-deploy grace (7d)","status":"INFO"},{"metric":"permit_code_drift_count","value":1202,"threshold":"INFO — Spec 84 §2.5.a documented drift","status":"INFO"},{"metric":"permit_rule_distribution_top5","value":{"rule_14":106292,"rule_5":45725,"rule_12":38570,"rule_11":18925,"rule_13":4358},"threshold":null,"status":"INFO"},{"metric":"permit_first_deploy_grace","value":1,"threshold":null,"status":"INFO"},{"metric":"coa_evaluated","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_rows_updated","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_phase_transitions_count","value":0,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_inserted","value":1624,"threshold":null,"status":"INFO"},{"metric":"lifecycle_status_history_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"stalled_count","value":38554,"threshold":null,"status":"INFO"},{"metric":"coa_stalled_count","value":0,"threshold":null,"status":"INFO"},{"metric":"unmapped_status_count","value":0,"threshold":"<=3 WARN, <=1 PASS","status":"PASS"},{"metric":"unmapped_decision_count","value":0,"threshold":"<=5 WARN, <=3 PASS","status":"PASS"},{"metric":"catalog_status_missing_count","value":0,"threshold":"<=3 WARN, <=1 PASS","status":"PASS"},{"metric":"catalog_invalid_phase_count","value":0,"threshold":"=0 PASS, >0 FAIL","status":"PASS"},{"metric":"unclassified_count","value":8,"threshold":"<= 100","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":3085.94,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":74227,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","status","enriched_status","issued_date","last_seen_at","lifecycle_classified_at","matched_status","lifecycle_seq"],"permit_inspections":["permit_num","stage_name","status","inspection_date"],"coa_applications":["id","lead_id","decision","linked_permit_num","status","last_seen_at","lifecycle_phase","lifecycle_seq","permit_type","project_type","coa_type_class","neighbourhood_id","matched_rule","matched_status","lifecycle_classified_at"],"universal_stream_catalog":["seq","lifecycle_group","lifecycle_block","lifecycle_stage","phase","bid_value","source","status"]},"writes":{"permits":["lifecycle_phase","lifecycle_stalled","lifecycle_classified_at","phase_started_at","matched_status","matched_rule","unmapped_status"],"permit_phase_transitions":["permit_num","revision_num","from_phase","to_phase","transitioned_at","permit_type","neighbourhood_id"],"coa_applications":["lifecycle_phase","lifecycle_stalled","lifecycle_classified_at","lifecycle_seq","lifecycle_group","lifecycle_block","lifecycle_stage","bid_value","matched_status","matched_rule","unmapped_status","unmapped_decision"],"lifecycle_transitions":["lead_id","from_phase","to_phase","from_seq","to_seq","transitioned_at","permit_type","project_type","coa_type_class","neighbourhood_id"],"lifecycle_status_history":["lead_id","from_status","to_status","from_seq","to_seq","from_phase","to_phase","transitioned_at","detected_by","permit_type","coa_type_class","project_type"]}}

[classify-lifecycle-phase] completed in 74.2s

```

### stderr tail
```
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-lifecycle-phase]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=74411ms

### C2: PASS
**Evidence:** id=3317 status=completed completed_at=Wed May 20 2026 16:49:50 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 20 audit rows: [permits_dirty, permits_updated, permit_unmapped_status_count, permit_code_drift_count, permit_rule_distribution_top5, permit_first_deploy_grace, coa_evaluated, coa_rows_updated, coa_phase_transitions_count, lifecycle_status_history_inserted, lifecycle_status_history_errors, stalled_count, coa_stalled_count, unmapped_status_count, unmapped_decision_count, catalog_status_missing_count, catalog_invalid_phase_count, unclassified_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 17 records_meta keys: [telemetry, coas_updated, pipeline_meta, stalled_count, permits_updated, coa_distribution, phase_distribution, unclassified_count, coa_rule_distribution, coa_matched_status_top20, permit_rule_distribution, phase_transitions_logged, permit_classifier_extended, coa_phase_distribution_live, permit_matched_status_top20, phase_started_at_backfilled, initial_transitions_backfilled]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=97; deltas={"permits":{"pre":248447,"post":248447,"delta":0},"coa_applications":{"pre":33106,"post":33106,"delta":0},"lifecycle_status_history":{"pre":287805,"post":289429,"delta":1624},"lifecycle_transitions":{"pre":33106,"post":33106,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for classify_lifecycle_phase

### C11: N/A-MANUAL
**Evidence:** records_total=229206 records_new=0 records_updated=97; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: multi_domain)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"lifecycle_status_history_errors","status":"PASS","threshold":"== 0"}]
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T3:** INFO — records_total=229206 records_new=0 records_updated=97
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
- **C6:** grep audit_table push for *_inserted INFO row not gated by if(count>0)
- **C8:** claimed records_new+records_updated=97; deltas={"permits":{"pre":248447,"post":248447,"delta":0},"coa_applications":{"pre":33106,"post":33106,"delta":0},"lifecycle_status_history":{"pre":287805,"post":289429,"delta":1624},"lifecycle_transitions":{"pre":33106,"post":33106,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for classify_lifecycle_phase
- **C11:** records_total=229206 records_new=0 records_updated=97; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Multi-domain agent to run separately and append findings here._
