# Step 20: assert_engine_health
**Chain:** permits
**Validated:** 2026-05-19
**HEAD commit:** 8ef6509
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** 

## Pre-run state
- Output table counts: {"engine_health_snapshots":{"ok":true,"n":963}}
- Last 3 runs: [
  {
    "id": 3157,
    "status": "completed",
    "completed_at": "2026-05-08T22:35:05.941Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T22:34:52.202Z",
    "duration_ms": "13739"
  },
  {
    "id": 3129,
    "status": "completed",
    "completed_at": "2026-05-08T21:57:51.424Z",
    "verdict": "WARN",
    "started_at": "2026-05-08T21:57:31.577Z",
    "duration_ms": "19847"
  },
  {
    "id": 3092,
    "status": "completed",
    "completed_at": "2026-05-08T20:51:34.857Z",
    "verdict": "PASS",
    "started_at": "2026-05-08T20:51:34.720Z",
    "duration_ms": "137"
  }
]

## Execution
- Command: `node scripts/quality/assert-engine-health.js`
- Exit code: 0
- Duration: 9970ms
- New `pipeline_runs.id`: 3167

## Post-run state
- Output table counts: {"engine_health_snapshots":{"ok":true,"n":1020}}
- New run: {"id":3167,"status":"completed","verdict":"WARN","duration_ms":"9646","records_total":0,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 57,
    "metric": "tables_checked",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 4,
    "metric": "tables_vacuumed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 2,
    "metric": "high_dead_ratio_tables",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 2,
    "metric": "high_seq_scan_tables",
    "status": "WARN",
    "threshold": "== 0"
  }
]
```

### records_meta (minus audit_table)
```json
{
  "warnings": [
    "cost_estimates: 84.8% sequential scans (28 seq vs 5 idx)",
    "permit_trades: 154,643 dead tuples (11.8% of 1,313,528 live)",
    "permit_trades: update/insert ratio 234.8x (1,140,188 upd vs 4,857 ins)",
    "permits: 218,737 dead tuples (77.1% of 283,781 live)",
    "permits: update/insert ratio 977.6x (1,189,791 upd vs 1,217 ins)",
    "trade_forecasts: 100.0% sequential scans (27 seq vs 0 idx)"
  ],
  "checks_failed": 0,
  "checks_warned": 6,
  "engine_health": [
    {
      "idx_scan": 1,
      "seq_scan": 8,
      "seq_ratio": 0.8889,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "address_points"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "builder_contacts"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "builders"
    },
    {
      "idx_scan": 70797,
      "seq_scan": 4,
      "seq_ratio": 0.0001,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "building_footprints"
    },
    {
      "idx_scan": 37977,
      "seq_scan": 131,
      "seq_ratio": 0.0034,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 33052,
      "table_name": "coa_applications"
    },
    {
      "idx_scan": 5,
      "seq_scan": 28,
      "seq_ratio": 0.8485,
      "dead_ratio": 0.0051,
      "n_dead_tup": 1245,
      "n_live_tup": 243324,
      "table_name": "cost_estimates"
    },
    {
      "idx_scan": 1,
      "seq_scan": 2,
      "seq_ratio": 0.6667,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1,
      "table_name": "data_quality_snapshots"
    },
    {
      "idx_scan": 1,
      "seq_scan": 1,
      "seq_ratio": 0.5,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "device_tokens"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "engine_health_snapshots"
    },
    {
      "idx_scan": 3857,
      "seq_scan": 17,
      "seq_ratio": 0.0044,
      "dead_ratio": 1.3214,
      "n_dead_tup": 37,
      "n_live_tup": 28,
      "table_name": "entities"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "entity_contacts"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "entity_projects"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "inspection_stage_map"
    },
    {
      "idx_scan": 0,
      "seq_scan": 15,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_analytics"
    },
    {
      "idx_scan": 29719,
      "seq_scan": 10,
      "seq_ratio": 0.0003,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 29703,
      "table_name": "lead_parcels"
    },
    {
      "idx_scan": 1290213,
      "seq_scan": 18,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1143415,
      "table_name": "lead_trades"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_view_events"
    },
    {
      "idx_scan": 0,
      "seq_scan": 2,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_views"
    },
    {
      "idx_scan": 4245,
      "seq_scan": 9,
      "seq_ratio": 0.0021,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 4245,
      "table_name": "lifecycle_status_history"
    },
    {
      "idx_scan": 0,
      "seq_scan": 6,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lifecycle_transitions"
    },
    {
      "idx_scan": 375,
      "seq_scan": 21,
      "seq_ratio": 0.053,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 115,
      "table_name": "logic_variables"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "mv_monthly_permit_stats"
    },
    {
      "idx_scan": 33817,
      "seq_scan": 5,
      "seq_ratio": 0.0001,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "neighbourhoods"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "notifications"
    },
    {
      "idx_scan": 91348,
      "seq_scan": 4,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "parcel_buildings"
    },
    {
      "idx_scan": 137214,
      "seq_scan": 23,
      "seq_ratio": 0.0002,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "parcels"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_history"
    },
    {
      "idx_scan": 13,
      "seq_scan": 20,
      "seq_ratio": 0.6061,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_inspections"
    },
    {
      "idx_scan": 264740,
      "seq_scan": 6,
      "seq_ratio": 0,
      "dead_ratio": 0.0017,
      "n_dead_tup": 2,
      "n_live_tup": 1182,
      "table_name": "permit_parcels"
    },
    {
      "idx_scan": 2,
      "seq_scan": 2,
      "seq_ratio": 0.5,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_phase_transitions"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_products"
    },
    {
      "idx_scan": 1691562,
      "seq_scan": 16,
      "seq_ratio": 0,
      "dead_ratio": 0.1177,
      "n_dead_tup": 154643,
      "n_live_tup": 1313528,
      "table_name": "permit_trades"
    },
    {
      "idx_scan": 370236,
      "seq_scan": 21,
      "seq_ratio": 0.0001,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_type_classifications"
    },
    {
      "idx_scan": 1756419,
      "seq_scan": 106,
      "seq_ratio": 0.0001,
      "dead_ratio": 0.7708,
      "n_dead_tup": 218737,
      "n_live_tup": 283781,
      "table_name": "permits"
    },
    {
      "idx_scan": 132,
      "seq_scan": 6,
      "seq_ratio": 0.0435,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 136,
      "table_name": "phase_calibration"
    },
    {
      "idx_scan": 0,
      "seq_scan": 4,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "phase_stay_calibration"
    },
    {
      "idx_scan": 90,
      "seq_scan": 1,
      "seq_ratio": 0.011,
      "dead_ratio": 0.5,
      "n_dead_tup": 1,
      "n_live_tup": 2,
      "table_name": "pipeline_runs"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "pipeline_schedules"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "product_groups"
    },
    {
      "idx_scan": 34,
      "seq_scan": 7,
      "seq_ratio": 0.1707,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 26,
      "table_name": "schema_migrations"
    },
    {
      "idx_scan": 0,
      "seq_scan": 2,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "scope_intensity_matrix"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "scraper_queue"
    },
    {
      "idx_scan": 40,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "spatial_ref_sys"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "stripe_webhook_events"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "subscribe_nonces"
    },
    {
      "idx_scan": 0,
      "seq_scan": 2,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1,
      "table_name": "sync_runs"
    },
    {
      "idx_scan": 0,
      "seq_scan": 15,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "tracked_projects"
    },
    {
      "idx_scan": 0,
      "seq_scan": 20,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_configurations"
    },
    {
      "idx_scan": 0,
      "seq_scan": 27,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 654179,
      "table_name": "trade_forecasts"
    },
    {
      "idx_scan": 2,
      "seq_scan": 2,
      "seq_ratio": 0.5,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_mapping_rules"
    },
    {
      "idx_scan": 0,
      "seq_scan": 2,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_sqft_rates"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_suppliers"
    },
    {
      "idx_scan": 17,
      "seq_scan": 1399566,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 5,
      "table_name": "trades"
    },
    {
      "idx_scan": 1532,
      "seq_scan": 8,
      "seq_ratio": 0.0052,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 110,
      "table_name": "universal_stream_catalog"
    },
    {
      "idx_scan": 1422,
      "seq_scan": 3,
      "seq_ratio": 0.0021,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1422,
      "table_name": "universal_stream_trade_signals"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "user_profiles"
    },
    {
      "idx_scan": 35,
      "seq_scan": 36,
      "seq_ratio": 0.507,
      "dead_ratio": 0,
      "n_dead_tup": 20,
      "n_live_tup": 0,
      "table_name": "wsib_registry"
    }
  ],
  "tables_checked": 57,
  "tables_vacuumed": 4
}
```

### stdout tail
```
  OK: tracked_projects — dead tuple ratio 0.0%
  OK: trade_configurations — dead tuple ratio 0.0%
  OK: trade_forecasts — dead tuple ratio 0.0%
  WARN: trade_forecasts — seq scan ratio 100.0% exceeds 80%
  OK: trade_mapping_rules — dead tuple ratio 0.0%
  OK: trade_sqft_rates — dead tuple ratio 0.0%
  OK: trade_suppliers — dead tuple ratio 0.0%
  OK: trades — dead tuple ratio 0.0%
  OK: universal_stream_catalog — dead tuple ratio 0.0%
  OK: universal_stream_trade_signals — dead tuple ratio 0.0%
  OK: user_profiles — dead tuple ratio 0.0%
  OK: wsib_registry — dead tuple ratio 0.0%

--- Auto-VACUUM ANALYZE (4 tables above 10% dead ratio) ---
  VACUUM ANALYZE entities — done (was 132.1% dead)
  VACUUM ANALYZE permit_trades — done (was 11.8% dead)
  VACUUM ANALYZE permits — done (was 77.1% dead)
  VACUUM ANALYZE pipeline_runs — done (was 50.0% dead)

  Snapshot: 57 tables written to engine_health_snapshots (0 actually updated)
PIPELINE_SUMMARY:{"records_total":57,"records_new":null,"records_updated":0,"records_meta":{"checks_warned":6,"checks_failed":0,"tables_checked":57,"tables_vacuumed":4,"warnings":["cost_estimates: 84.8% sequential scans (28 seq vs 5 idx)","permit_trades: 154,643 dead tuples (11.8% of 1,313,528 live)","permit_trades: update/insert ratio 234.8x (1,140,188 upd vs 4,857 ins)","permits: 218,737 dead tuples (77.1% of 283,781 live)","permits: update/insert ratio 977.6x (1,189,791 upd vs 1,217 ins)","trade_forecasts: 100.0% sequential scans (27 seq vs 0 idx)"],"engine_health":[{"table_name":"address_points","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":8,"idx_scan":1,"seq_ratio":0.8889},{"table_name":"builder_contacts","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"builders","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"building_footprints","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":70797,"seq_ratio":0.0001},{"table_name":"coa_applications","n_live_tup":33052,"n_dead_tup":0,"dead_ratio":0,"seq_scan":131,"idx_scan":37977,"seq_ratio":0.0034},{"table_name":"cost_estimates","n_live_tup":243324,"n_dead_tup":1245,"dead_ratio":0.0051,"seq_scan":28,"idx_scan":5,"seq_ratio":0.8485},{"table_name":"data_quality_snapshots","n_live_tup":1,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":1,"seq_ratio":0.6667},{"table_name":"device_tokens","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":1,"seq_ratio":0.5},{"table_name":"engine_health_snapshots","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"entities","n_live_tup":28,"n_dead_tup":37,"dead_ratio":1.3214,"seq_scan":17,"idx_scan":3857,"seq_ratio":0.0044},{"table_name":"entity_contacts","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"entity_projects","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"inspection_stage_map","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"lead_analytics","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":15,"idx_scan":0,"seq_ratio":1},{"table_name":"lead_parcels","n_live_tup":29703,"n_dead_tup":0,"dead_ratio":0,"seq_scan":10,"idx_scan":29719,"seq_ratio":0.0003},{"table_name":"lead_trades","n_live_tup":1143415,"n_dead_tup":0,"dead_ratio":0,"seq_scan":18,"idx_scan":1290213,"seq_ratio":0},{"table_name":"lead_view_events","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"lead_views","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":0,"seq_ratio":1},{"table_name":"lifecycle_status_history","n_live_tup":4245,"n_dead_tup":0,"dead_ratio":0,"seq_scan":9,"idx_scan":4245,"seq_ratio":0.0021},{"table_name":"lifecycle_transitions","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":6,"idx_scan":0,"seq_ratio":1},{"table_name":"logic_variables","n_live_tup":115,"n_dead_tup":0,"dead_ratio":0,"seq_scan":21,"idx_scan":375,"seq_ratio":0.053},{"table_name":"mv_monthly_permit_stats","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"neighbourhoods","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":5,"idx_scan":33817,"seq_ratio":0.0001},{"table_name":"notifications","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"parcel_buildings","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":91348,"seq_ratio":0},{"table_name":"parcels","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":23,"idx_scan":137214,"seq_ratio":0.0002},{"table_name":"permit_history","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"permit_inspections","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":20,"idx_scan":13,"seq_ratio":0.6061},{"table_name":"permit_parcels","n_live_tup":1182,"n_dead_tup":2,"dead_ratio":0.0017,"seq_scan":6,"idx_scan":264740,"seq_ratio":0},{"table_name":"permit_phase_transitions","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":2,"seq_ratio":0.5},{"table_name":"permit_products","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"permit_trades","n_live_tup":1313528,"n_dead_tup":154643,"dead_ratio":0.1177,"seq_scan":16,"idx_scan":1691562,"seq_ratio":0},{"table_name":"permit_type_classifications","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":21,"idx_scan":370236,"seq_ratio":0.0001},{"table_name":"permits","n_live_tup":283781,"n_dead_tup":218737,"dead_ratio":0.7708,"seq_scan":106,"idx_scan":1756419,"seq_ratio":0.0001},{"table_name":"phase_calibration","n_live_tup":136,"n_dead_tup":0,"dead_ratio":0,"seq_scan":6,"idx_scan":132,"seq_ratio":0.0435},{"table_name":"phase_stay_calibration","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":0,"seq_ratio":1},{"table_name":"pipeline_runs","n_live_tup":2,"n_dead_tup":1,"dead_ratio":0.5,"seq_scan":1,"idx_scan":90,"seq_ratio":0.011},{"table_name":"pipeline_schedules","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"product_groups","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"schema_migrations","n_live_tup":26,"n_dead_tup":0,"dead_ratio":0,"seq_scan":7,"idx_scan":34,"seq_ratio":0.1707},{"table_name":"scope_intensity_matrix","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":0,"seq_ratio":1},{"table_name":"scraper_queue","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"spatial_ref_sys","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":40,"seq_ratio":0},{"table_name":"stripe_webhook_events","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"subscribe_nonces","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"sync_runs","n_live_tup":1,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":0,"seq_ratio":1},{"table_name":"tracked_projects","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":15,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_configurations","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":20,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_forecasts","n_live_tup":654179,"n_dead_tup":0,"dead_ratio":0,"seq_scan":27,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_mapping_rules","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":2,"seq_ratio":0.5},{"table_name":"trade_sqft_rates","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_suppliers","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"trades","n_live_tup":5,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1399566,"idx_scan":17,"seq_ratio":1},{"table_name":"universal_stream_catalog","n_live_tup":110,"n_dead_tup":0,"dead_ratio":0,"seq_scan":8,"idx_scan":1532,"seq_ratio":0.0052},{"table_name":"universal_stream_trade_signals","n_live_tup":1422,"n_dead_tup":0,"dead_ratio":0,"seq_scan":3,"idx_scan":1422,"seq_ratio":0.0021},{"table_name":"user_profiles","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"wsib_registry","n_live_tup":0,"n_dead_tup":20,"dead_ratio":0,"seq_scan":36,"idx_scan":35,"seq_ratio":0.507}],"audit_table":{"phase":16,"name":"Engine Health","verdict":"WARN","rows":[{"metric":"tables_checked","value":57,"threshold":null,"status":"INFO"},{"metric":"tables_vacuumed","value":4,"threshold":null,"status":"INFO"},{"metric":"high_dead_ratio_tables","value":2,"threshold":"== 0","status":"WARN"},{"metric":"high_seq_scan_tables","value":2,"threshold":"== 0","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":5.78,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":9856,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"pg_stat_user_tables":["relname","n_live_tup","n_dead_tup","seq_scan","idx_scan","n_tup_ins","n_tup_upd"]},"writes":{"engine_health_snapshots":["table_name","n_live_tup","n_dead_tup","dead_ratio","seq_scan","idx_scan","seq_ratio"]}}

  Warnings: 6

=== Engine Health: COMPLETED (9.7s) ===


[assert-engine-health] completed in 9.9s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=9970ms

### C2: PASS
**Evidence:** id=3167 status=completed completed_at=Tue May 19 2026 14:25:37 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 4 audit rows: [tables_checked, tables_vacuumed, high_dead_ratio_tables, high_seq_scan_tables]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 6 records_meta keys: [warnings, checks_failed, checks_warned, engine_health, tables_checked, tables_vacuumed]

### C8: N/A-MANUAL
**Evidence:** claimed records_new+records_updated=0; deltas={"engine_health_snapshots":{"pre":963,"post":1020,"delta":57}}

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=0 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C8:** claimed records_new+records_updated=0; deltas={"engine_health_snapshots":{"pre":963,"post":1020,"delta":57}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
