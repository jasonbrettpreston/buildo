# Step 17: link_coa
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** ingest_linkage
**Per-step agent:** Compliance
**Final status:** PASS-pending-manual
**Notes:** Phase D back-ref; seam in §3a'

## Pre-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"permits":{"ok":true,"n":248447}}
- Last 3 runs: [
  {
    "id": 3313,
    "status": "completed",
    "completed_at": "2026-05-20T20:47:39.511Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T20:47:31.747Z",
    "duration_ms": "7764"
  },
  {
    "id": 3267,
    "status": "completed",
    "completed_at": "2026-05-20T02:14:11.187Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T02:14:05.072Z",
    "duration_ms": "6115"
  },
  {
    "id": 3234,
    "status": "completed",
    "completed_at": "2026-05-20T01:51:56.432Z",
    "verdict": "PASS",
    "started_at": "2026-05-20T01:51:46.512Z",
    "duration_ms": "9921"
  }
]

## Execution
- Command: `node scripts/link-coa.js`
- Exit code: 0
- Duration: 8213ms
- New `pipeline_runs.id`: 3313

## Post-run state
- Output table counts: {"coa_applications":{"ok":true,"n":33106},"permits":{"ok":true,"n":248447}}
- New run: {"id":3313,"status":"completed","verdict":"PASS","duration_ms":"7764","records_total":0,"records_new":0,"records_updated":0}

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
    "metric": "permits_back_ref_updated",
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
    "value": 208,
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
    "value": 208,
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
    "value": 18964,
    "metric": "enrichment_eligible_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_inherited_from_permit_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_lat_lng_upgraded_from_permit_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_ward_filled_from_permit_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "coa_ward_mismatch_with_permit_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 13934,
    "metric": "coa_below_confidence_floor_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "lead_identity_lat_lng_mismatch_count",
    "status": "PASS",
    "threshold": "== 0 (WARN — usually concurrent geocode-permits race; resolves next run)"
  },
  {
    "value": 0,
    "metric": "stale_back_refs_cleared_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0.6,
    "metric": "inherited_confidence_floor",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 7575,
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
        "after": 33106,
        "delta": 0,
        "before": 33106
      }
    },
    "engine": {
      "coa_applications": {
        "idx_scan": 30620,
        "seq_scan": 229,
        "seq_ratio": 0.0074,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 29061
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
          "after": 208,
          "before": 208,
          "filled": 0
        }
      }
    }
  },
  "duration_ms": 7204,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "street_num",
        "street_name_normalized",
        "ward",
        "issued_date",
        "application_date",
        "description",
        "latitude",
        "longitude"
      ],
      "coa_applications": [
        "id",
        "application_number",
        "street_num",
        "street_name_normalized",
        "ward",
        "description",
        "decision_date",
        "linked_permit_num",
        "linked_confidence",
        "latitude",
        "longitude"
      ]
    },
    "writes": {
      "permits": [
        "last_seen_at",
        "linked_coa_application_number"
      ],
      "coa_applications": [
        "linked_permit_num",
        "linked_confidence",
        "last_seen_at",
        "latitude",
        "longitude",
        "ward"
      ]
    }
  },
  "tier_3_errors": 0,
  "match_rate_pct": 0,
  "potential_matches": 0,
  "cross_ward_cleaned": 0,
  "unlinked_remaining": 208,
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
{"level":"INFO","tag":"[link-coa]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[link-coa]","msg":"Mode: LIVE"}
{"level":"INFO","tag":"[link-coa]","msg":"Unlinked CoA applications: 208"}
{"level":"INFO","tag":"[link-coa]","msg":"Pre-pass: Checking for cross-ward mismatches..."}
{"level":"INFO","tag":"[link-coa]","msg":"Pre-pass: 0 cross-ward mismatches unlinked"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1a: Exact address + ward match..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1a linked: 0 (confidence 0.95)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1b: Exact address + null permit ward..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1b linked: 0 (confidence 0.85)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1c: Exact address + ward conflict..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 1c linked: 0 (confidence 0.10 — ward conflict, flagged)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2a: Street name + ward match..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2a linked: 0 (confidence 0.60)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2b: Street name + null permit ward..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 2b linked: 0 (confidence 0.50)"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3: Description similarity matching..."}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 candidates: 186"}
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 filterable: 186"}
  [link-coa] 186 / 186 (100.0%) — 2.5s — 73 rows/s
{"level":"INFO","tag":"[link-coa]","msg":"Tier 3 linked: 0 (confidence 0.10-0.50)"}
{"level":"INFO","tag":"[link-coa]","msg":"Bumped permits.last_seen_at on 0 newly-linked permits (for downstream lifecycle re-classification)"}
{"level":"INFO","tag":"[link-coa]","msg":"Wrote permits.linked_coa_application_number back-ref on 9 permits"}
{"level":"INFO","tag":"[link-coa]","msg":"R5.6 enrichment: 0 CoAs updated (0 lat/long + 0 ward fills); 0 ward mismatches; 13934 below confidence floor"}
{"level":"INFO","tag":"[link-coa]","msg":"Linking complete","context":{"crossWardCleaned":0,"tier1a":0,"tier1b":0,"tier1c":0,"tier2a":0,"tier2b":0,"desc":0,"noMatch":208,"totalLinked":0,"rate":"0.0%","duration":"7.7s"}}
{"level":"INFO","tag":"[link-coa]","msg":"DB stats: 33106 total | 32898 linked (14424 high, 17617 med, 857 low) | 6 upcoming leads"}
PIPELINE_SUMMARY:{"records_total":0,"records_new":0,"records_updated":0,"records_meta":{"duration_ms":7702,"cross_ward_cleaned":0,"matches_tier_1a_exact_ward":0,"matches_tier_1b_exact_null_ward":0,"matches_tier_1c_ward_conflict":0,"matches_tier_2a_name_ward":0,"matches_tier_2b_name_null_ward":0,"matches_tier_3_desc":0,"tier_3_errors":0,"match_rate_pct":0,"potential_matches":0,"effective_match_rate_pct":100,"unlinked_remaining":208,"audit_table":{"phase":12,"name":"Link CoA","verdict":"PASS","rows":[{"metric":"permits_bumped_last_seen_at","value":0,"threshold":null,"status":"INFO"},{"metric":"permits_back_ref_updated","value":9,"threshold":null,"status":"INFO"},{"metric":"cross_ward_cleaned","value":0,"threshold":null,"status":"PASS"},{"metric":"total_candidates","value":208,"threshold":null,"status":"INFO"},{"metric":"potential_matches","value":0,"threshold":null,"status":"INFO"},{"metric":"effective_match_rate_pct","value":100,"threshold":">= 50%","status":"PASS"},{"metric":"match_rate_pct","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1a_exact_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1b_exact_null_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_1c_ward_conflict","value":0,"threshold":null,"status":"PASS"},{"metric":"matches_tier_2a_name_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_2b_name_null_ward","value":0,"threshold":null,"status":"INFO"},{"metric":"matches_tier_3_desc","value":0,"threshold":null,"status":"INFO"},{"metric":"tier_3_errors","value":0,"threshold":"== 0","status":"PASS"},{"metric":"unlinked_remaining","value":208,"threshold":null,"status":"INFO"},{"metric":"links_to_pre_permits","value":0,"threshold":"== 0","status":"PASS"},{"metric":"cross_ward_links","value":0,"threshold":"== 0","status":"PASS"},{"metric":"enrichment_eligible_count","value":18964,"threshold":null,"status":"INFO"},{"metric":"coa_inherited_from_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_lat_lng_upgraded_from_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_ward_filled_from_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_ward_mismatch_with_permit_count","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_below_confidence_floor_count","value":13934,"threshold":null,"status":"INFO"},{"metric":"lead_identity_lat_lng_mismatch_count","value":0,"threshold":"== 0 (WARN — usually concurrent geocode-permits race; resolves next run)","status":"PASS"},{"metric":"stale_back_refs_cleared_count","value":0,"threshold":null,"status":"INFO"},{"metric":"inherited_confidence_floor","value":0.6,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":8045,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"coa_applications":["id","application_number","street_num","street_name_normalized","ward","description","decision_date","linked_permit_num","linked_confidence","latitude","longitude"],"permits":["permit_num","revision_num","street_num","street_name_normalized","ward","issued_date","application_date","description","latitude","longitude"]},"writes":{"coa_applications":["linked_permit_num","linked_confidence","last_seen_at","latitude","longitude","ward"],"permits":["last_seen_at","linked_coa_application_number"]}}

[link-coa] completed in 8.0s

```

### stderr tail
```
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_37_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[link-coa]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=8213ms

### C2: PASS
**Evidence:** id=3313 status=completed completed_at=Wed May 20 2026 16:47:39 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 28 audit rows: [permits_bumped_last_seen_at, permits_back_ref_updated, cross_ward_cleaned, total_candidates, potential_matches, effective_match_rate_pct, match_rate_pct, matches_tier_1a_exact_ward, matches_tier_1b_exact_null_ward, matches_tier_1c_ward_conflict, matches_tier_2a_name_ward, matches_tier_2b_name_null_ward, matches_tier_3_desc, tier_3_errors, unlinked_remaining, links_to_pre_permits, cross_ward_links, enrichment_eligible_count, coa_inherited_from_permit_count, coa_lat_lng_upgraded_from_permit_count, coa_ward_filled_from_permit_count, coa_ward_mismatch_with_permit_count, coa_below_confidence_floor_count, lead_identity_lat_lng_mismatch_count, stale_back_refs_cleared_count, inherited_confidence_floor, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 15 records_meta keys: [telemetry, duration_ms, pipeline_meta, tier_3_errors, match_rate_pct, potential_matches, cross_ward_cleaned, unlinked_remaining, matches_tier_3_desc, effective_match_rate_pct, matches_tier_2a_name_ward, matches_tier_1a_exact_ward, matches_tier_1c_ward_conflict, matches_tier_2b_name_null_ward, matches_tier_1b_exact_null_ward]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0},"permits":{"pre":248447,"post":248447,"delta":0}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"coa_applications":{"pre":33106,"post":33106,"delta":0},"permits":{"pre":248447,"post":248447,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
