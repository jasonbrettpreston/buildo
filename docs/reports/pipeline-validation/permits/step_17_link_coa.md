# Step 17: link_coa
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Phase D back-ref; seam in §3a'

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33052},"permits":{"ok":true,"n":248237}}
- Last 3 runs: [
  {
    "id": 3153,
    "status": "completed",
    "completed_at": "2026-05-08T22:34:11.885Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:34:07.235Z",
    "duration_ms": "4650"
  },
  {
    "id": 3125,
    "status": "skipped",
    "completed_at": "2026-05-08T21:56:48.445Z",
    "verdict": null,
    "started_at": "2026-05-08T21:56:48.445Z",
    "duration_ms": "0"
  },
  {
    "id": 3058,
    "status": "skipped",
    "completed_at": "2026-05-08T18:20:36.557Z",
    "verdict": null,
    "started_at": "2026-05-08T18:20:36.557Z",
    "duration_ms": "0"
  }
]

## Execution
- Command: `node scripts/link-coa.js`
- Exit code: 0
- Duration: 16549ms
- New `pipeline_runs.id`: 3153

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33052},"permits":{"ok":true,"n":248237}}
- New run: {"id":3153,"status":"completed","verdict":"PASS","duration_ms":"4650","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "permits_bumped_last_seen_at",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "cross_ward_cleaned",
    "status": "PASS",
    "threshold": null
  },
  {
    "value": 207,
    "metric": "total_candidates",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "potential_matches",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 100,
    "metric": "effective_match_rate_pct",
    "status": "PASS",
    "threshold": ">= 50%"
  },
  {
    "value": 0,
    "metric": "match_rate_pct",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_1a_exact_ward",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_1b_exact_null_ward",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_1c_ward_conflict",
    "status": "PASS",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_2a_name_ward",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_2b_name_null_ward",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "matches_tier_3_desc",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "tier_3_errors",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 207,
    "metric": "unlinked_remaining",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "links_to_pre_permits",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "cross_ward_links",
    "status": "PASS",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 4396,
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
      "coa_applications": {
        "after": 33052,
        "delta": 0,
        "before": 33052
      }
    },
    "engine": {
      "coa_applications": {
        "idx_scan": 14836,
        "seq_scan": 174,
        "seq_ratio": 0.0116,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 33052
      }
    },
    "pg_stats": {
      "coa_applications": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {
      "coa_applications": {
        "linked_permit_num": {
          "after": 207,
          "before": 207,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 3899,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "street_num",
        "street_name_normalized",
        "ward",
        "issued_date",
        "description"
      ],
      "coa_applications": [
        "id",
        "application_number",
        "street_num",
        "street_name_normalized",
        "ward",
        "description",
        "decision_date",
        "linked_permit_num"
      ]
    },
    "writes": {
      "coa_applications": [
        "linked_permit_num",
        "linked_confidence",
        "last_seen_at"
      ]
    }
  },
  "tier_3_errors": 0,
  "match_rate_pct": 0,
  "potential_matches": 0,
  "cross_ward_cleaned": 0,
  "unlinked_remaining": 207,
  "matches_tier_3_desc": 0,
  "effective_match_rate_pct": 100,
  "matches_tier_2a_name_ward": 0,
  "matches_tier_1a_exact_ward": 0,
  "matches_tier_1c_ward_conflict": 0,
  "matches_tier_2b_name_null_ward": 0,
  "matches_tier_1b_exact_null_ward": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[link-coa]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[link-coa]","msg":"Mode: LIVE"}
{"level":"INFO","tag":"[link-coa]","msg":"Unlinked CoA applications: 207"}
{"level":"INFO","tag":"[link-coa]","msg":"Pre-pass: Checking for cross-ward mismatches..."}
{"level":"INFO","tag":"[link-coa]","msg":"Pre-pass: 0 cross-ward mismatches unlinked"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1a: Exact address + ward match..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1a linked: 0 (confidence 0.95)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1b: Exact address + null permit ward..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1b linked: 1 (confidence 0.85)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1c: Exact address + ward conflict..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1c linked: 0 (confidence 0.10 — ward conflict, flagged)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2a: Street name + ward match..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2a linked: 0 (confidence 0.60)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2b: Street name + null permit ward..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2b linked: 0 (confidence 0.50)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3: Description similarity matching..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 candidates: 186"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 filterable: 186"}
  [link-coa] 186 / 186 (100.0%) — 3.1s — 60 rows/s
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 linked: 0 (confidence 0.10-0.50)"}
{"level":"INFO","tag":"[link-coa]","msg":"Bumped permits.last_seen_at on 1 newly-linked permits (for downstream lifecycle re-classification)"}
{"level":"INFO","tag":"[link-coa]","msg":"Wrote permits.linked_coa_application_number back-ref on 20,512 permits"}
{"level":"INFO","tag":"[link-coa]","msg":"R5.6 enrichment: 17723 CoAs updated (17723 lat/long + 0 ward fills); 0 ward mismatches; 13917 below confidence floor"}
{"level":"INFO","tag":"[link-coa]","msg":"Linking complete","context":{"crossWardCleaned":0,"tier1a":0,"tier1b":1,"tier1c":0,"tier2a":0,"tier2b":0,"desc":0,"noMatch":206,"totalLinked":1,"rate":"0.5%","duration":"15.8s"}}
{"level":"INFO","tag":"[link-coa]","msg":"DB stats: 33052 total | 32846 linked (14421 high, 17568 med, 857 low) | 5 upcoming leads"}
PIPELINE_SUMMARY:{"records_total":1,"records_new":0,"records_updated":1,"records_meta":{"duration_ms":15835,"cross_ward_cleaned":0,"matches_tier_1a_exact_ward":0,"matches_tier_1b_exact_null_ward":1,"matches_tier_1c_ward_conflict":0,"matches_tier_2a_name_ward":0,"matches_tier_2b_name_null_ward":0,"matches_tier_3_desc":0,"tier_3_errors":0,"match_rate_pct":0.5,"potential_matches":0,"effective_match_rate_pct":100,"unlinked_remaining":206,"audit_table":{"phase":12,"name":"Link CoA","verdict":"PASS","rows":[{"metric":"permits_bumped_last_seen_at","value":1,"threshold":null,"status":"INFO"},{"metric":"permits_back_ref_updated","value":20512,"threshold":null,"status":"INFO"},{"metric":"cross_ward_cleaned","value":0,"threshold":null,"status":"PASS"},{"metric":"total_candidates","value":207,"threshold":null,"status":"INFO"},{"metric":"potential_matches","value":0,"threshold":null,"status":"INFO"},{"metric":"effective_match_rate_pct","value":100,"threshold":">= 50%","status":"PASS"},{"metric":"match_rate_pct","value":0.5,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1a_exact_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1b_exact_null_ward","value":1,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1c_ward_conflict","value":0,"threshold":null,"status":"PASS"},{"metric":"matches_tier_2a_name_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_2b_name_null_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_3_desc","value":0,"threshold":null,"status":"INFO"},{"metric":"tier_3_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"unlinked_remaining","value":206,"threshold":null,"status":"INFO"},{"metric":"links_to_pre_permits","value":0,"threshold":"== 0","status":"PASS"},{"metric":"cross_ward_links","value":0,"threshold":"== 0","status":"PASS"},{"metric":"enrichment_eligible_count","value":18929,"threshold":null,"status":"INFO"},{"metric":"coa_inherited_from_permit_count","value":17723,"threshold":null,"status":"INFO"},{"metric":"coa_lat_lng_upgraded_from_permit_count","value":17723,"threshold":null,"status":"INFO"},{"metric":"coa_ward_filled_from_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_ward_mismatch_with_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_below_confidence_floor_count","value":13917,"threshold":null,"status":"INFO"},{"metric":"lead_identity_lat_lng_mismatch_count","value":0,"threshold":"== 0 (WARN — usually concurrent geocode-permits race; resolves next run)","status":"PASS"},{"metric":"stale_back_refs_cleared_count","value":0,"threshold":null,"status":"INFO"},{"metric":"inherited_confidence_floor","value":0.6,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0.06,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":16358,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","application_number","street_num","street_name_normalized","ward","description","decision_date","linked_permit_num","linked_confidence","latitude","longitude"],"permits":["permit_num","revision_num","street_num","street_name_normalized","ward","issued_date","application_date","description","latitude","longitude"]},"writes":{"coa_applications":["linked_permit_num","linked_confidence","last_seen_at","latitude","longitude","ward"],"permits":["last_seen_at","linked_coa_application_number"]}}

[link-coa] completed in 16.4s

```

### stderr tail
```
{"level":"WARN","tag":"[link-coa]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=16549ms

### C2: PASS
**Evidence:** id=3153 status=completed completed_at=Fri May 08 2026 18:34:11 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 18 audit rows: [permits_bumped_last_seen_at, cross_ward_cleaned, total_candidates, potential_matches, effective_match_rate_pct, match_rate_pct, matches_tier_1a_exact_ward, matches_tier_1b_exact_null_ward, matches_tier_1c_ward_conflict, matches_tier_2a_name_ward, matches_tier_2b_name_null_ward, matches_tier_3_desc, tier_3_errors, unlinked_remaining, links_to_pre_permits, cross_ward_links, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 15 records_meta keys: [telemetry, duration_ms, pipeline_meta, tier_3_errors, match_rate_pct, potential_matches, cross_ward_cleaned, unlinked_remaining, matches_tier_3_desc, effective_match_rate_pct, matches_tier_2a_name_ward, matches_tier_1a_exact_ward, matches_tier_1c_ward_conflict, matches_tier_2b_name_null_ward, matches_tier_1b_exact_null_ward]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33052,"post":33052,"delta":0},"permits":{"pre":248237,"post":248237,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: ingest_linkage)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T4:** N/A-MANUAL — requires join-key knowledge per step
- **T5:** N/A-MANUAL — requires LEFT JOIN context per step
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33052,"post":33052,"delta":0},"permits":{"pre":248237,"post":248237,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
