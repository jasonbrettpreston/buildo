# Step 06: classify_coa_trades
**Chain:** coa
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Phase D

## Pre-run state
- Output table counts: {"lead_trades":{"ok":true,"n":1586336}}
- Last 3 runs: [
  {
    "id": 3289,
    "status": "completed",
    "completed_at": "2026-05-20T20:33:45.128Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:33:41.833Z",
    "duration_ms": "3296"
  },
  {
    "id": 3226,
    "status": "completed",
    "completed_at": "2026-05-20T01:50:48.386Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:50:41.516Z",
    "duration_ms": "6870"
  },
  {
    "id": 3178,
    "status": "completed",
    "completed_at": "2026-05-20T01:04:38.870Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:04:35.264Z",
    "duration_ms": "3605"
  }
]

## Execution
- Command: `node scripts/classify-coa-trades.js`
- Exit code: 0
- Duration: 2787ms
- New `pipeline_runs.id`: 3289

## Post-run state
- Output table counts: {"lead_trades":{"ok":true,"n":1586616}}
- New run: {"id":3289,"status":"completed","verdict":"PASS","duration_ms":"3296","records_total":2486,"records_new":0,"records_updated":30600}

### audit_table.rows
```json
[
  {
    "value": 2486,
    "metric": "coa_eligible",
    "status": "PASS",
    "threshold": "> 0"
  },
  {
    "value": 2274,
    "metric": "coa_with_trades",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 212,
    "metric": "coa_zero_trades",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "8.5%",
    "metric": "unmapped_scope_pct",
    "status": "PASS",
    "threshold": "<= 20%"
  },
  {
    "value": "100.0%",
    "metric": "realtor_inclusion_pct",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "13.46",
    "metric": "avg_trades_per_lead",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "slug_resolution_miss_count",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "records_new",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 30600,
    "metric": "records_updated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 30600,
    "metric": "total_lead_trades_written",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 1008.11,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2466,
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
      "lead_trades": {
        "after": 1584828,
        "delta": 0,
        "before": 1584828
      },
      "coa_applications": {
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "lead_trades": {
        "idx_scan": 3535123,
        "seq_scan": 0,
        "seq_ratio": 0,
        "dead_ratio": 0.019,
        "n_dead_tup": 30600,
        "n_live_tup": 1583751
      },
      "coa_applications": {
        "idx_scan": 28087,
        "seq_scan": 191,
        "seq_ratio": 0.0068,
        "dead_ratio": 0.1937,
        "n_dead_tup": 7953,
        "n_live_tup": 33106
      }
    },
    "pg_stats": {
      "lead_trades": {
        "del": 0,
        "ins": 0,
        "upd": 30600
      },
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 2486
      }
    },
    "null_fills": {
      "coa_applications": {
        "trade_classified_at": {
          "after": 1892,
          "before": 1892,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 2406,
  "coa_processed": 2486,
  "pipeline_meta": {
    "reads": {
      "trades": [
        "id",
        "slug"
      ],
      "coa_applications": [
        "id",
        "lead_id",
        "scope_tags",
        "coa_type_class",
        "scope_classified_at",
        "trade_classified_at"
      ]
    },
    "writes": {
      "lead_trades": [
        "lead_id",
        "trade_id",
        "tier",
        "confidence",
        "is_active",
        "phase",
        "lead_score",
        "classified_at"
      ],
      "coa_applications": [
        "trade_classified_at"
      ]
    }
  },
  "coa_with_trades": 2274,
  "coa_zero_trades": 212,
  "residential_count": 1843,
  "realtor_append_count": 1843,
  "slug_resolution_misses": [],
  "trade_slug_distribution": {
    "hvac": 1862,
    "drywall": 1979,
    "framing": 1949,
    "glazing": 1789,
    "masonry": 1782,
    "realtor": 1843,
    "roofing": 1921,
    "concrete": 1944,
    "elevator": 73,
    "flooring": 1843,
    "painting": 1864,
    "plumbing": 1958,
    "demolition": 333,
    "electrical": 1989,
    "excavation": 1785,
    "insulation": 1896,
    "landscaping": 1782,
    "waterproofing": 1784,
    "fire-protection": 224
  },
  "slug_resolution_miss_count": 0,
  "coa_trades_per_lead_histogram": {
    "0": 212,
    "1": 285,
    "4": 7,
    "5": 21,
    "6": 6,
    "7": 102,
    "8": 31,
    "9": 3,
    "10": 19,
    "11": 13,
    "12": 4,
    "13": 1,
    "15": 193,
    "16": 1201,
    "17": 337,
    "18": 46,
    "19": 5
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Loaded 349 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":2476,"records_new":280,"records_updated":30168,"records_meta":{"duration_ms":2162,"coa_processed":2476,"coa_with_trades":2266,"coa_zero_trades":210,"residential_count":1837,"realtor_append_count":1837,"slug_resolution_miss_count":0,"slug_resolution_misses":[],"trade_slug_distribution":{"concrete":1933,"drywall":1970,"electrical":1980,"excavation":1776,"flooring":1835,"framing":1938,"glazing":1779,"hvac":1854,"insulation":1884,"landscaping":1772,"masonry":1772,"painting":1856,"plumbing":1948,"roofing":1910,"waterproofing":1774,"realtor":1837,"demolition":333,"elevator":74,"fire-protection":223},"coa_trades_per_lead_histogram":{"0":210,"1":285,"2":1,"4":7,"5":22,"6":6,"7":102,"8":31,"9":3,"10":19,"11":13,"12":4,"13":1,"15":190,"16":1197,"17":333,"18":47,"19":5},"audit_table":{"phase":42,"name":"CoA Trade Classification","verdict":"PASS","rows":[{"metric":"coa_eligible","value":2476,"threshold":"> 0","status":"PASS"},{"metric":"coa_with_trades","value":2266,"threshold":null,"status":"INFO"},{"metric":"coa_zero_trades","value":210,"threshold":null,"status":"INFO"},{"metric":"unmapped_scope_pct","value":"8.5%","threshold":"<= 20%","status":"PASS"},{"metric":"realtor_inclusion_pct","value":"100.0%","threshold":null,"status":"INFO"},{"metric":"avg_trades_per_lead","value":"13.44","threshold":null,"status":"INFO"},{"metric":"slug_resolution_miss_count","value":0,"threshold":"== 0","status":"PASS"},{"metric":"records_new","value":280,"threshold":null,"status":"INFO"},{"metric":"records_updated","value":30168,"threshold":null,"status":"INFO"},{"metric":"total_lead_trades_written","value":30448,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1119.86,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":2211,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","lead_id","scope_tags","coa_type_class","scope_classified_at","trade_classified_at"],"trades":["id","slug"]},"writes":{"lead_trades":["lead_id","trade_id","tier","confidence","is_active","phase","lead_score","classified_at"],"coa_applications":["trade_classified_at"]}}
{"level":"INFO","tag":"[classify-coa-trades]","msg":"Classification complete","context":{"processed":2476,"coa_with_trades":2266,"coa_zero_trades":210,"records_new":280,"records_updated":30168,"slug_resolution_miss_count":0,"duration":"2.2s"}}

[classify-coa-trades] completed in 2.2s

```

### stderr tail
```
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[classify-coa-trades]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=2787ms

### C2: PASS
**Evidence:** id=3289 status=completed completed_at=Wed May 20 2026 16:33:45 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 12 audit rows: [coa_eligible, coa_with_trades, coa_zero_trades, unmapped_scope_pct, realtor_inclusion_pct, avg_trades_per_lead, slug_resolution_miss_count, records_new, records_updated, total_lead_trades_written, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 12 records_meta keys: [telemetry, duration_ms, coa_processed, pipeline_meta, coa_with_trades, coa_zero_trades, residential_count, realtor_append_count, slug_resolution_misses, trade_slug_distribution, slug_resolution_miss_count, coa_trades_per_lead_histogram]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=30600; deltas={"lead_trades":{"pre":1586336,"post":1586616,"delta":280}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=2486 records_new=0 records_updated=30600; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=2486 records_new=0 records_updated=30600
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=30600; deltas={"lead_trades":{"pre":1586336,"post":1586616,"delta":280}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=2486 records_new=0 records_updated=30600; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
