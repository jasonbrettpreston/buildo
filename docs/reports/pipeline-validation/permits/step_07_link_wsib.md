# Step 07: link_wsib
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** 

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- Last 3 runs: [
  {
    "id": 3144,
    "status": "completed",
    "completed_at": "2026-05-08T22:28:56.193Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:26:47.251Z",
    "duration_ms": "128943"
  },
  {
    "id": 3116,
    "status": "skipped",
    "completed_at": "2026-05-08T21:51:14.006Z",
    "verdict": null,
    "started_at": "2026-05-08T21:51:14.006Z",
    "duration_ms": "0"
  },
  {
    "id": 3049,
    "status": "skipped",
    "completed_at": "2026-05-08T18:16:05.924Z",
    "verdict": null,
    "started_at": "2026-05-08T18:16:05.924Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-wsib.js`
- Exit code: 0
- Duration: 94403ms
- New `pipeline_runs.id`: 3144

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237}}
- New run: {"id":3144,"status":"completed","verdict":"PASS","duration_ms":"128943","records_total":107140,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 107140,
    "metric": "unlinked_start",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_1_trade_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_2_legal_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_3_fuzzy_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "run_matched",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "11.5%",
    "metric": "link_rate",
    "status": "PASS",
    "threshold": ">= 5%"
  },
  {
    "value": 107140,
    "metric": "no_match",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 832.6,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 128682,
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
      "entities": {
        "after": 3818,
        "delta": 0,
        "before": 3818
      }
    },
    "engine": {
      "entities": {
        "idx_scan": 18150,
        "seq_scan": 98,
        "seq_ratio": 0.0054,
        "dead_ratio": 0.0016,
        "n_dead_tup": 6,
        "n_live_tup": 3818
      }
    },
    "pg_stats": {
      "entities": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "duration_ms": 128510,
  "pipeline_meta": {
    "reads": {
      "entities": [
        "id",
        "name_normalized",
        "permit_count"
      ],
      "wsib_registry": [
        "id",
        "trade_name_normalized",
        "legal_name_normalized",
        "linked_entity_id"
      ]
    },
    "writes": {
      "entities": [
        "is_wsib_registered",
        "primary_phone",
        "primary_email",
        "website"
      ],
      "wsib_registry": [
        "linked_entity_id",
        "match_confidence",
        "matched_at"
      ]
    }
  },
  "no_match_count": 107140,
  "unlinked_start": 107140,
  "matches_tier_1_trade": 0,
  "matches_tier_2_legal": 0,
  "matches_tier_3_fuzzy": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-wsib]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[link-wsib]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[link-wsib]","msg":"Mode: LIVE"}
{"level":"INFO","tag":"[link-wsib]","msg":"Unlinked WSIB entries: 107,120"}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 1: Exact trade name matching..."}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 1 linked: 0 (confidence 0.95)"}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 2: Exact legal name matching..."}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 2 linked: 0 (confidence 0.90)"}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 3: Fuzzy name matching (pg_trgm)..."}
{"level":"INFO","tag":"[link-wsib]","msg":"Tier 3 linked: 0 (confidence 0.60)"}
{"level":"INFO","tag":"[link-wsib]","msg":"Linking complete","context":{"tier1":0,"tier2":0,"tier3":0,"totalLinked":0,"noMatch":107120,"rate":"0.0%","duration":"94.0s"}}
{"level":"INFO","tag":"[link-wsib]","msg":"DB stats: 121116 total | 13996 linked (317 high, 13679 med)"}
PIPELINE_SUMMARY:{"records_total":107120,"records_new":0,"records_updated":0,"records_meta":{"duration_ms":93988,"unlinked_start":107120,"matches_tier_1_trade":0,"matches_tier_2_legal":0,"matches_tier_3_fuzzy":0,"no_match_count":107120,"audit_table":{"phase":5,"name":"WSIB Registry Matching","verdict":"PASS","rows":[{"metric":"unlinked_start","value":107120,"threshold":null,"status":"INFO"},{"metric":"tier_1_trade_matches","value":0,"threshold":null,"status":"INFO"},{"metric":"tier_2_legal_matches","value":0,"threshold":null,"status":"INFO"},{"metric":"tier_3_fuzzy_matches","value":0,"threshold":null,"status":"INFO"},{"metric":"run_matched","value":0,"threshold":null,"status":"INFO"},{"metric":"link_rate","value":"11.6%","threshold":">= 5%","status":"PASS"},{"metric":"no_match","value":107120,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":1136.84,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":94226,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"wsib_registry":["id","trade_name_normalized","legal_name_normalized","linked_entity_id"],"entities":["id","name_normalized","permit_count"]},"writes":{"wsib_registry":["linked_entity_id","match_confidence","matched_at"],"entities":["is_wsib_registered","primary_phone","primary_email","website"]}}

[link-wsib] completed in 94.2s

```

### stderr tail
```
{"level":"WARN","tag":"[link-wsib]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=94403ms

### C2: PASS
**Evidence:** id=3144 status=completed completed_at=Fri May 08 2026 18:28:56 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 9 audit rows: [unlinked_start, tier_1_trade_matches, tier_2_legal_matches, tier_3_fuzzy_matches, run_matched, link_rate, no_match, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 8 records_meta keys: [telemetry, duration_ms, pipeline_meta, no_match_count, unlinked_start, matches_tier_1_trade, matches_tier_2_legal, matches_tier_3_fuzzy]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=107140 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=107140 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=107140 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
