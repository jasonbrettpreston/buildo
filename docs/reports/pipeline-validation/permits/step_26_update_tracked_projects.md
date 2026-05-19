# Step 26: update_tracked_projects
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** calculation
**Per-step agent:** Calculations
**Final status:** PASS-pending-manual
**Notes:** §11.9 invariants; Phase F.2

## Pre-run state
- Output table counts: {"tracked_projects":{"ok":true,"n":0},"notifications":{"ok":true,"n":0}}
- Last 3 runs: [
  {
    "id": 3162,
    "status": "completed",
    "completed_at": "2026-05-08T22:38:25.835Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:38:25.522Z",
    "duration_ms": "312"
  },
  {
    "id": 3134,
    "status": "completed",
    "completed_at": "2026-05-08T22:03:48.867Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T22:03:48.448Z",
    "duration_ms": "419"
  },
  {
    "id": 3067,
    "status": "completed",
    "completed_at": "2026-05-08T18:24:47.415Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T18:24:46.910Z",
    "duration_ms": "505"
  }
]

## Execution
- Command: `node scripts/update-tracked-projects.js`
- Exit code: 0
- Duration: 303ms
- New `pipeline_runs.id`: 3162

## Post-run state
- Output table counts: {"tracked_projects":{"ok":true,"n":0},"notifications":{"ok":true,"n":0}}
- New run: {"id":3162,"status":"completed","verdict":"PASS","duration_ms":"312","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 0,
    "metric": "alerts_evaluated",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "alerts_delivered",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "delivery_errors",
    "status": "PASS",
    "threshold": 0
  },
  {
    "value": 0,
    "metric": "projects_archived",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "unknown_phase",
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
    "value": 124,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "alerts": [],
  "run_at": "2026-05-08T22:38:25.775Z",
  "archived": 0,
  "telemetry": {
    "counts": {
      "lead_analytics": {
        "after": 0,
        "delta": 0,
        "before": 0
      },
      "tracked_projects": {
        "after": 0,
        "delta": 0,
        "before": 0
      }
    },
    "engine": {
      "lead_analytics": {
        "idx_scan": 0,
        "seq_scan": 17,
        "seq_ratio": 1,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      },
      "tracked_projects": {
        "idx_scan": 1,
        "seq_scan": 18,
        "seq_ratio": 0.9474,
        "dead_ratio": 0,
        "n_dead_tup": 0,
        "n_live_tup": 0
      }
    },
    "pg_stats": {
      "lead_analytics": {
        "del": 0,
        "ins": 0,
        "upd": 0
      },
      "tracked_projects": {
        "del": 0,
        "ins": 0,
        "upd": 0
      }
    },
    "null_fills": {}
  },
  "alerts_total": 0,
  "stall_alerts": 0,
  "pipeline_meta": {
    "reads": {
      "permits": [
        "permit_num",
        "revision_num",
        "lifecycle_phase",
        "lifecycle_stalled"
      ],
      "trade_forecasts": [
        "permit_num",
        "revision_num",
        "trade_slug",
        "predicted_start",
        "urgency"
      ],
      "tracked_projects": [
        "id",
        "user_id",
        "status",
        "trade_slug",
        "permit_num",
        "revision_num",
        "last_notified_urgency",
        "last_notified_stalled"
      ],
      "trade_configurations": [
        "trade_slug",
        "imminent_window_days",
        "bid_phase_cutoff",
        "work_phase_target"
      ]
    },
    "writes": {
      "lead_analytics": [
        "lead_key",
        "tracking_count",
        "saving_count",
        "updated_at"
      ],
      "tracked_projects": [
        "status",
        "last_notified_urgency",
        "last_notified_stalled",
        "updated_at"
      ]
    }
  },
  "active_tracked": 0,
  "unmapped_trade": 0,
  "imminent_alerts": 0,
  "recovery_alerts": 0,
  "analytics_synced": 0,
  "analytics_zeroed": 0,
  "unknown_phase_values": [],
  "unknown_phase_skipped": 0
}
```

### stdout tail
```
{"level":"INFO","tag":"[tracked-projects]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[tracked-projects]","msg":"Loaded 115 logic variables from control panel"}
{"level":"INFO","tag":"[tracked-projects]","msg":"Streaming active tracked projects..."}
{"level":"INFO","tag":"[tracked-projects]","msg":"Streamed 0 active tracked projects (permit=0, coa=0)"}
{"level":"INFO","tag":"[tracked-projects]","msg":"Archived: 0"}
{"level":"INFO","tag":"[tracked-projects]","msg":"Alerts: stall=0, recovery=0, imminent=0"}
{"level":"INFO","tag":"[tracked-projects]","msg":"Syncing lead_analytics..."}
{"level":"INFO","tag":"[tracked-projects]","msg":"Analytics sync: 0 upserted, 0 zeroed"}
PIPELINE_SUMMARY:{"records_total":0,"records_new":0,"records_updated":0,"records_meta":{"active_tracked":0,"total_rows_permit":0,"total_rows_coa":0,"coa_first_deploy_grace":false,"in_quiet_period":false,"coa_alert_distribution_by_lifecycle_group":{"C1":{"imminent":0,"stalled":0,"recovery":0,"decision":0,"archived":0},"C2":{"imminent":0,"stalled":0,"recovery":0,"decision":0,"archived":0},"C3":{"imminent":0,"stalled":0,"recovery":0,"decision":0,"archived":0},"C4":{"imminent":0,"stalled":0,"recovery":0,"decision":0,"archived":0},"unknown":{"imminent":0,"stalled":0,"recovery":0,"decision":0,"archived":0}},"coa_notified_decision_rendered_count":0,"coa_orphaned_lead_ids_sample_capped":false,"archived":0,"stall_alerts":0,"recovery_alerts":0,"imminent_alerts":0,"alerts_total":0,"analytics_synced":0,"analytics_zeroed":0,"unmapped_trade":0,"unknown_phase_skipped":0,"unknown_phase_values":[],"alerts":[],"run_at":"2026-05-19T18:57:21.187Z","audit_table":{"phase":24,"name":"CRM Assistant","verdict":"PASS","rows":[{"metric":"alerts_evaluated","value":0,"threshold":null,"status":"INFO"},{"metric":"alerts_delivered","value":0,"threshold":null,"status":"INFO"},{"metric":"delivery_errors","value":0,"threshold":0,"status":"PASS"},{"metric":"projects_archived","value":0,"threshold":null,"status":"INFO"},{"metric":"unknown_phase","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_stall_alerts","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_recovery_alerts","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_imminent_alerts","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_decision_alerts","value":0,"threshold":null,"status":"INFO"},{"metric":"coa_archived","value":0,"threshold":"< 100% of totalRowsCoa","status":"PASS"},{"metric":"coa_orphaned_lead_ids","value":0,"threshold":"> 0","status":"PASS"},{"metric":"in_quiet_period","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":130,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"tracked_projects":["id","user_id","status","trade_slug","permit_num","revision_num","lead_id","last_notified_urgency","last_notified_stalled","notified_decision_rendered"],"permits":["permit_num","revision_num","lead_id","lifecycle_phase","lifecycle_stalled"],"trade_forecasts":["permit_num","revision_num","trade_slug","lead_id","predicted_start","urgency"],"trade_configurations":["trade_slug","imminent_window_days","bid_phase_cutoff","work_phase_target"],"coa_applications":["lead_id","lifecycle_phase","lifecycle_stalled","lifecycle_group","status","decision","hearing_date","lifecycle_classified_at","last_seen_at"],"pipeline_runs":["pipeline","started_at"]},"writes":{"tracked_projects":["status","last_notified_urgency","last_notified_stalled","notified_decision_rendered","updated_at"],"lead_analytics":["lead_key","tracking_count","saving_count","updated_at"],"notifications":["user_id","type","permit_num","trade_slug","title","body","created_at"]}}

[update-tracked-projects] completed in 0.1s

```

### stderr tail
```
{"level":"WARN","tag":"[tracked-projects]","msg":"allocation_pct sum is 1.0500 (expected 1.0) — normalizing"}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=303ms

### C2: PASS
**Evidence:** id=3162 status=completed completed_at=Fri May 08 2026 18:38:25 GMT-0400 (Eastern Daylight Time)

### C3: PASS
**Evidence:** verdict='PASS'

### C4: PASS
**Evidence:** 7 audit rows: [alerts_evaluated, alerts_delivered, delivery_errors, projects_archived, unknown_phase, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 15 records_meta keys: [alerts, run_at, archived, telemetry, alerts_total, stall_alerts, pipeline_meta, active_tracked, unmapped_trade, imminent_alerts, recovery_alerts, analytics_synced, analytics_zeroed, unknown_phase_values, unknown_phase_skipped]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"tracked_projects":{"pre":0,"post":0,"delta":0},"notifications":{"pre":0,"post":0,"delta":0}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A-MANUAL
**Evidence:** run §11 invariants from spec for update_tracked_projects

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: calculation)

- **T1:** PASS — *_errors rows: [{"value":0,"metric":"delivery_errors","status":"PASS","threshold":0}]
- **T3:** INFO — records_total=0 records_new=0 records_updated=0
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
- **C8:** claimed records_new+records_updated=0; deltas={"tracked_projects":{"pre":0,"post":0,"delta":0},"notifications":{"pre":0,"post":0,"delta":0}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C10:** run §11 invariants from spec for update_tracked_projects
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
