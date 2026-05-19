# Step 27: assert_entity_tracing
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** FAIL
**Notes:** 

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3163,
    "status": "completed",
    "completed_at": "2026-05-08T22:38:40.450Z",
    "verdict": "FAIL",
    "started_at": "2026-05-08T22:38:25.837Z",
    "duration_ms": "14612"
  },
  {
    "id": 3135,
    "status": "completed",
    "completed_at": "2026-05-08T22:04:08.248Z",
    "verdict": "FAIL",
    "started_at": "2026-05-08T22:03:48.868Z",
    "duration_ms": "19379"
  },
  {
    "id": 3068,
    "status": "completed",
    "completed_at": "2026-05-08T18:25:01.148Z",
    "verdict": "FAIL",
    "started_at": "2026-05-08T18:24:47.417Z",
    "duration_ms": "13731"
  }
]

## Execution
- Command: `node scripts/quality/assert-entity-tracing.js`
- Exit code: 0
- Duration: 7320ms
- New `pipeline_runs.id`: 3163

## Post-run state
- Output table counts: {}
- New run: {"id":3163,"status":"completed","verdict":"FAIL","duration_ms":"14612","records_total":229705,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 98.4,
    "metric": "permit_trades_coverage_pct",
    "status": "PASS",
    "matched": 226114,
    "threshold": ">= 95%",
    "denominator": 229705,
    "denominator_type": "window_permits"
  },
  {
    "value": 100,
    "metric": "cost_estimates_coverage_pct",
    "status": "PASS",
    "matched": 229705,
    "threshold": ">= 90%",
    "denominator": 229705,
    "denominator_type": "window_permits"
  },
  {
    "value": 73,
    "metric": "trade_forecasts_coverage_pct",
    "status": "PASS",
    "matched": 95067,
    "threshold": ">= 30%",
    "denominator": 130160,
    "denominator_type": "eligible_permits"
  },
  {
    "value": 99.5,
    "metric": "lifecycle_phase_coverage_pct",
    "status": "PASS",
    "matched": 228516,
    "threshold": ">= 95%",
    "denominator": 229705,
    "denominator_type": "window_permits"
  },
  {
    "value": 76.8,
    "metric": "opportunity_score_coverage_pct",
    "status": "FAIL",
    "matched": 497378,
    "threshold": ">= 80% of forecast rows",
    "denominator": 647438,
    "denominator_type": "forecast_rows"
  },
  {
    "value": 15889.94,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 14456,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "window": "26 hours",
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "last_seen_at",
        "lifecycle_phase"
      ],
      "permit_trades": [
        "permit_num",
        "revision_num"
      ],
      "cost_estimates": [
        "permit_num",
        "revision_num"
      ],
      "trade_forecasts": [
        "permit_num",
        "revision_num",
        "opportunity_score"
      ]
    },
    "writes": {}
  },
  "eligible_permits": 130160
}
```

### stdout tail
```
PIPELINE_SUMMARY:{"records_total":229211,"records_new":0,"records_updated":0,"records_meta":{"window":"26 hours","eligible_permits":129919,"audit_table":{"phase":26,"name":"Assert Entity Tracing","verdict":"PASS","rows":[{"metric":"permit_trades_coverage_pct","value":98.4,"threshold":">= 95%","matched":225541,"denominator":229211,"denominator_type":"window_permits","status":"PASS"},{"metric":"cost_estimates_coverage_pct","value":99,"threshold":">= 90%","matched":226972,"denominator":229211,"denominator_type":"window_permits","status":"PASS"},{"metric":"trade_forecasts_coverage_pct","value":72.6,"threshold":">= 30%","matched":94267,"denominator":129919,"denominator_type":"eligible_permits","status":"PASS"},{"metric":"lifecycle_phase_coverage_pct","value":99.5,"threshold":">= 95%","matched":228030,"denominator":229211,"denominator_type":"window_permits","status":"PASS"},{"metric":"opportunity_score_coverage_pct","value":93.9,"threshold":">= 80% of forecast rows","matched":574981,"denominator":612483,"denominator_type":"forecast_rows","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":31799.53,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":7208,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","last_seen_at","lifecycle_phase"],"permit_trades":["permit_num","revision_num"],"cost_estimates":["permit_num","revision_num"],"trade_forecasts":["permit_num","revision_num","opportunity_score"]},"writes":{}}

[assert-entity-tracing] completed in 7.2s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=7320ms

### C2: PASS
**Evidence:** id=3163 status=completed completed_at=Fri May 08 2026 18:38:40 GMT-0400 (Eastern Daylight Time)

### C3: FAIL
**Evidence:** verdict='FAIL'

### C4: PASS
**Evidence:** 7 audit rows: [permit_trades_coverage_pct, cost_estimates_coverage_pct, trade_forecasts_coverage_pct, lifecycle_phase_coverage_pct, opportunity_score_coverage_pct, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 3 records_meta keys: [window, pipeline_meta, eligible_permits]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=229705 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=229705 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229705 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
