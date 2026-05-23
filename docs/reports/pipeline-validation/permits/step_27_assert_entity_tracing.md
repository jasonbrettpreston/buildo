# Step 27: assert_entity_tracing
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3323,
    "status": "completed",
    "completed_at": "2026-05-20T20:51:27.004Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:51:17.224Z",
    "duration_ms": "9780"
  },
  {
    "id": 3277,
    "status": "completed",
    "completed_at": "2026-05-20T02:17:26.884Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:17:19.337Z",
    "duration_ms": "7547"
  },
  {
    "id": 3248,
    "status": "completed",
    "completed_at": "2026-05-20T01:55:03.860Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:54:50.813Z",
    "duration_ms": "13047"
  }
]

## Execution
- Command: `node scripts/quality/assert-entity-tracing.js`
- Exit code: 0
- Duration: 11657ms
- New `pipeline_runs.id`: 3323

## Post-run state
- Output table counts: {}
- New run: {"id":3323,"status":"completed","verdict":"PASS","duration_ms":"9780","records_total":229213,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 98.4,
    "metric": "permit_trades_coverage_pct",
    "status": "PASS",
    "matched": 225541,
    "threshold": ">= 95%",
    "denominator": 229213,
    "denominator_type": "window_permits"
  },
  {
    "value": 99,
    "metric": "cost_estimates_coverage_pct",
    "status": "PASS",
    "matched": 226972,
    "threshold": ">= 90%",
    "denominator": 229213,
    "denominator_type": "window_permits"
  },
  {
    "value": 72.5,
    "metric": "trade_forecasts_coverage_pct",
    "status": "PASS",
    "matched": 94235,
    "threshold": ">= 30%",
    "denominator": 129919,
    "denominator_type": "eligible_permits"
  },
  {
    "value": 99.5,
    "metric": "lifecycle_phase_coverage_pct",
    "status": "PASS",
    "matched": 228032,
    "threshold": ">= 95%",
    "denominator": 229213,
    "denominator_type": "window_permits"
  },
  {
    "value": 93.9,
    "metric": "opportunity_score_coverage_pct",
    "status": "PASS",
    "matched": 574812,
    "threshold": ">= 80% of forecast rows",
    "denominator": 612314,
    "denominator_type": "forecast_rows"
  },
  {
    "value": 23708.42,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 9668,
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
  "eligible_permits": 129919
}
```

### stdout tail
```
PIPELINE_SUMMARY:{"records_total":229060,"records_new":0,"records_updated":0,"records_meta":{"window":"26 hours","eligible_permits":131758,"audit_table":{"phase":26,"name":"Assert Entity Tracing","verdict":"PASS","rows":[{"metric":"permit_trades_coverage_pct","value":98.4,"threshold":">= 95%","matched":225393,"denominator":229060,"denominator_type":"window_permits","status":"PASS"},{"metric":"cost_estimates_coverage_pct","value":98.9,"threshold":">= 90%","matched":226500,"denominator":229060,"denominator_type":"window_permits","status":"PASS"},{"metric":"trade_forecasts_coverage_pct","value":72.7,"threshold":">= 30%","matched":95769,"denominator":131758,"denominator_type":"eligible_permits","status":"PASS"},{"metric":"lifecycle_phase_coverage_pct","value":99.5,"threshold":">= 95%","matched":227871,"denominator":229060,"denominator_type":"window_permits","status":"PASS"},{"metric":"opportunity_score_coverage_pct","value":93.6,"threshold":">= 80% of forecast rows","matched":575117,"denominator":614328,"denominator_type":"forecast_rows","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":19847.5,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":11541,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["permit_num","revision_num","last_seen_at","lifecycle_phase"],"permit_trades":["permit_num","revision_num"],"cost_estimates":["permit_num","revision_num"],"trade_forecasts":["permit_num","revision_num","opportunity_score"]},"writes":{}}

[assert-entity-tracing] completed in 11.5s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=11657ms

### C2: PASS
**Evidence:** id=3323 status=completed completed_at=Wed May 20 2026 16:51:27 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

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
**Evidence:** records_total=229213 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=229213 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=229213 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
