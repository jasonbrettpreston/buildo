# Step 21: classify_lifecycle_phase
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** multi_domain
**Per-step agent:** Multi-domain
**Final status:** FAIL
**Notes:** §11.4 invariants; Phase I.1.1b; covers CoA step 12

## Pre-run state
- Output table counts: {"permits":{"ok":true,"n":248237},"coa_applications":{"ok":true,"n":33052},"lifecycle_status_history":{"ok":true,"n":4245},"lifecycle_transitions":{"ok":true,"n":0}}
- Last 3 runs: [
  {
    "id": 3158,
    "status": "completed",
    "completed_at": "2026-05-08T22:36:37.416Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:35:05.959Z",
    "duration_ms": "91457"
  },
  {
    "id": 3130,
    "status": "completed",
    "completed_at": "2026-05-08T22:00:26.138Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T21:57:51.431Z",
    "duration_ms": "154706"
  },
  {
    "id": 3063,
    "status": "completed",
    "completed_at": "2026-05-08T18:22:59.452Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:21:18.657Z",
    "duration_ms": "100795"
  }
]

## Execution
- Command: `node scripts/classify-lifecycle-phase.js`
- Exit code: 1
- Duration: 86441ms
- New `pipeline_runs.id`: 3158

## Post-run state
- Output table counts: {"permits":{"ok":true,"n":248237},"coa_applications":{"ok":true,"n":33052},"lifecycle_status_history":{"ok":true,"n":252480},"lifecycle_transitions":{"ok":true,"n":0}}
- New run: {"id":3158,"status":"completed","verdict":"PASS","duration_ms":"91457","records_total":229702,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 229702,
    "metric": "permits_dirty",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits_updated",
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
    "metric": "coa_phase_changes",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 38525,
    "metric": "stalled_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 12,
    "metric": "unclassified_count",
    "status": "PASS",
    "threshold": "<= 100"
  },
  {
    "value": 2586.71,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 88801,
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
        "after": 247030,
        "delta": 0,
        "before": 247030
      },
      "coa_applications": {
        "after": 33052,
        "delta": 0,
        "before": 33052
      }
    },
    "engine": {
      "permits": {
        "idx_scan": 13255530,
        "seq_scan": 1080,
        "seq_ratio": 0.0001,
        "dead_ratio": 0.4818,
        "n_dead_tup": 229702,
        "n_live_tup": 247017
      },
      "coa_applications": {
        "idx_scan": 15282,
        "seq_scan": 178,
        "seq_ratio": 0.0115,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 33052
      }
    },
    "pg_stats": {
      "permits": {
        "del": 0,
        "ins": 0,
        "upd": 229702
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
        "lifecycle_classified_at"
      ],
      "coa_applications": [
        "id",
        "decision",
        "linked_permit_num",
        "status",
        "last_seen_at",
        "lifecycle_classified_at"
      ],
      "permit_inspections": [
        "permit_num",
        "stage_name",
        "status",
        "inspection_date"
      ]
    },
    "writes": {
      "permits": [
        "lifecycle_phase",
        "lifecycle_stalled",
        "lifecycle_classified_at",
        "phase_started_at"
      ],
      "coa_applications": [
        "lifecycle_phase",
        "lifecycle_stalled",
        "lifecycle_classified_at"
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
  "stalled_count": 38525,
  "permits_updated": 0,
  "coa_distribution": {
    "P1": 40,
    "P2": 147,
    "null": 32865
  },
  "phase_distribution": {
    "O1": 2996,
    "O2": 2912,
    "O3": 43378,
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
    "null": 1200
  },
  "unclassified_count": 12,
  "phase_transitions_logged": 0,
  "phase_started_at_backfilled": 0,
  "initial_transitions_backfilled": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Building BLD/CMB prefix map..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"BLD/CMB prefixes tracked: 94,560"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Building inspection rollup map..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Inspection rollups built for 10,102 permits"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Streaming dirty permits..."}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Permits streaming complete: 248,237 dirty, 248,237 updated, 10,668 transitions"}
{"level":"INFO","tag":"[classify-lifecycle-phase]","msg":"Streaming dirty CoAs (stall threshold=30d)..."}

```

### stderr tail
```
    at parseErrorMessage (C:\Users\User\Buildo\node_modules\pg-protocol\dist\parser.js:305:11)
    at Parser.handlePacket (C:\Users\User\Buildo\node_modules\pg-protocol\dist\parser.js:143:27)
    at Parser.parse (C:\Users\User\Buildo\node_modules\pg-protocol\dist\parser.js:37:38)
    at Socket.<anonymous> (C:\Users\User\Buildo\node_modules\pg-protocol\dist\index.js:11:42)
    at Socket.emit (node:events:509:28)
    at addChunk (node:internal/streams/readable:563:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:514:3)
    at Readable.push (node:internal/streams/readable:394:5)
    at TCP.onStreamRead (node:internal/stream_base_commons:189:23) {
  length: 113,
  severity: 'ERROR',
  code: '42703',
  detail: undefined,
  hint: undefined,
  position: '310',
  internalPosition: undefined,
  internalQuery: undefined,
  where: undefined,
  schema: undefined,
  table: undefined,
  column: undefined,
  dataType: undefined,
  constraint: undefined,
  file: 'parse_relation.c',
  line: '3827',
  routine: 'errorMissingColumn'
}

Node.js v24.15.0

```

## Checklist evidence (C1-C12)

### C1: FAIL
**Evidence:** exit=1 duration=86441ms

### C2: PASS
**Evidence:** id=3158 status=completed completed_at=Fri May 08 2026 18:36:37 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 8 audit rows: [permits_dirty, permits_updated, coa_evaluated, coa_phase_changes, stalled_count, unclassified_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A-MANUAL
**Evidence:** grep audit_table push for *_inserted INFO row not gated by if(count>0)

### C7: PASS
**Evidence:** 11 records_meta keys: [telemetry, coas_updated, pipeline_meta, stalled_count, permits_updated, coa_distribution, phase_distribution, unclassified_count, phase_transitions_logged, phase_started_at_backfilled, initial_transitions_backfilled]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0},"coa_applications":{"pre":33052,"post":33052,"delta":0},"lifecycle_status_history":{"pre":4245,"post":252480,"delta":248235},"lifecycle_transitions":{"pre":0,"post":0,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for classify_lifecycle_phase

### C11: N/A-MANUAL
**Evidence:** records_total=229702 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: multi_domain)

- **T1:** PASS — no *_errors rows
- **T2:** N/A-MANUAL — source grep — verify in record post-hoc
- **T3:** INFO — records_total=229702 records_new=0 records_updated=0
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
- **C8:** claimed records_new+records_updated=0; deltas={"permits":{"pre":248237,"post":248237,"delta":0},"coa_applications":{"pre":33052,"post":33052,"delta":0},"lifecycle_status_history":{"pre":4245,"post":252480,"delta":248235},"lifecycle_transitions":{"pre":0,"post":0,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for classify_lifecycle_phase
- **C11:** records_total=229702 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Diagnosis (inline — user authorized 2026-05-19)

This step has TWO sequential bugs surfaced by the validation:

### Bug 1: TDZ ReferenceError on permit-side SAVEPOINT catch (Phase I.1.1b regression)

**Symptom:** `ReferenceError: Cannot access 'lifecycleStatusHistoryErrors' before initialization` at line 1019

**Root cause:** Phase I.1.1b (commit `73b257b`) introduced `let lifecycleStatusHistoryInserted/Errors` at line 1176-1177 (inside the CoA section). `flushPermitBatch` references them at line 1019 in the SAVEPOINT catch path, but flushPermitBatch is called from the permits streaming loop BEFORE the CoA section runs → temporal dead zone.

**Status:** Fixed via auto-unblock on validation branch — `closed_task_unblock_step21_classify_lifecycle_phase_2026-05-19T1330.md`. Independent reviewer APPROVED. Moved declarations to script scope (line 856-867). Cherry-pick to main as proper WF3.

**Validation:** post-fix, script ran 86s vs 4s pre-fix — TDZ was the blocker.

### Bug 2: SQL references nonexistent column `coa_applications.permit_type` (Phase E.2 regression)

**Symptom:** `column ca.permit_type does not exist` (PG `42703`, `errorMissingColumn`)

**Location:** `scripts/classify-lifecycle-phase.js:1331` — CoA dirty-rows SELECT:
```sql
SELECT ca.id, ca.lead_id, ca.decision, ca.linked_permit_num, ca.status,
       ca.last_seen_at, ca.lifecycle_phase AS old_phase, ca.lifecycle_seq AS old_seq,
       ca.matched_status AS old_matched_status,
       ca.permit_type,            -- LINE 1331 — column does not exist
       ca.project_type, ca.coa_type_class, ca.neighbourhood_id, ...
  FROM coa_applications ca
```

**Schema verification (information_schema):**
- coa_applications PRESENT: coa_type_class, lead_id, neighbourhood_id, project_type
- coa_applications ABSENT: **permit_type**

**Git blame:** introduced in commit `ad0c178` (Phase E.2 — classify-lifecycle-phase consumer rewrite). Phase E.3 (`9902860`) then introduced 5-tuple cohort `(permit_type, project_type, coa_type_class, from_seq, to_seq)` for `phase_stay_calibration` with `permit_type IS NULL` for CoA-side rows per mig 147. The SQL assumes `coa_applications` has a `permit_type` column to read — but **the design says CoA-side has NULL permit_type**, so the column was never added.

**Why it didn't fire pre-validation:** Phase E.2 + E.3 likely landed without integration run on real CoA-dirty data. Unit tests stub the SELECT result and don't hit the actual SQL.

### Proposed fix (3 options for SUMMARY.md)

| Option | Change | Effort |
|---|---|---|
| **A (recommended)** — literal NULL | `ca.permit_type` → `NULL::text AS permit_type` at line 1331 | XS (1 line) |
| B — JOIN to permits | Add `LEFT JOIN permits p ON p.lead_id = ca.linked_permit_num`; read `p.permit_type` (CoA-derives-from-permit per Phase D R5.6) | M (design conversation about which permit's type when multiple revisions exist) |
| C — schema change | Add `permit_type` column to `coa_applications` with backfill | L (new migration, downstream consumers) |

Option A is closest to apparent Phase E.3 design intent (CoA-side calibration has NULL permit_type per mig 147).

### Downstream impact

Script crashed during CoA-side dirty SELECT. **Permit-side flushPermitBatch ran successfully** for whatever batches processed before the crash (~86 seconds of work). **CoA-side was NOT processed.**

Steps 22-26 will run against partially-stale CoA-side lifecycle data:
- Step 22 distribution check: CoA-side band violations may be artifacts of stale phase data
- Step 23 calibration: lifecycle_transitions not freshly populated for CoA-side; cohorts stale
- Step 24 forecasts: UNION reads stale CoA anchor
- Steps 25-26 cascade

Per user direction (2026-05-19): continue to Step 22; findings for both bugs become headline items in SUMMARY.md.

## Specialized agent finding
See "Diagnosis (inline)" section above.
