# Step 20: assert_engine_health
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** 

## Pre-run state
- Output table counts: {"engine_health_snapshots":{"ok":true,"n":1077}}
- Last 3 runs: [
  {
    "id": 3316,
    "status": "completed",
    "completed_at": "2026-05-20T20:48:22.021Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:48:06.229Z",
    "duration_ms": "15791"
  },
  {
    "id": 3270,
    "status": "completed",
    "completed_at": "2026-05-20T02:14:49.123Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:14:34.659Z",
    "duration_ms": "14464"
  },
  {
    "id": 3238,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:38.001Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:52:31.892Z",
    "duration_ms": "6109"
  }
]

## Execution
- Command: `node scripts/quality/assert-engine-health.js`
- Exit code: 0
- Duration: 15940ms
- New `pipeline_runs.id`: 3328

## Post-run state
- Output table counts: {"engine_health_snapshots":{"ok":true,"n":1134}}
- New run: {"id":3328,"status":"completed","verdict":"WARN","duration_ms":"15751","records_total":0,"records_new":0,"records_updated":0}

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
    "value": 5,
    "metric": "tables_vacuumed",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 3,
    "metric": "high_dead_ratio_tables",
    "status": "WARN",
    "threshold": "== 0"
  },
  {
    "value": 0,
    "metric": "high_seq_scan_tables",
    "status": "PASS",
    "threshold": "== 0"
  }
]
```

### records_meta (minus audit_table)
```json
{
  "warnings": [
    "lead_trades: 1,144,034 dead tuples (72.2% of 1,585,127 live)",
    "lead_trades: update/insert ratio 754.4x (1,142,967 upd vs 1,515 ins)",
    "permit_trades: 886,188 dead tuples (71.5% of 1,238,663 live)",
    "permit_trades: update/insert ratio 754.9x (1,142,968 upd vs 1,514 ins)",
    "permits: 315,372 dead tuples (126.0% of 250,382 live)",
    "permits: update/insert ratio 2177.0x (772,852 upd vs 355 ins)"
  ],
  "checks_failed": 0,
  "checks_warned": 6,
  "engine_health": [
    {
      "idx_scan": 1,
      "seq_scan": 7,
      "seq_ratio": 0.875,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "address_points"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "builder_contacts"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "builders"
    },
    {
      "idx_scan": 70846,
      "seq_scan": 3,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "building_footprints"
    },
    {
      "idx_scan": 29,
      "seq_scan": 21,
      "seq_ratio": 0.42,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "coa_applications"
    },
    {
      "idx_scan": 4,
      "seq_scan": 4,
      "seq_ratio": 0.5,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "cost_estimates"
    },
    {
      "idx_scan": 1,
      "seq_scan": 1,
      "seq_ratio": 0.5,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1,
      "table_name": "data_quality_snapshots"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "device_tokens"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "engine_health_snapshots"
    },
    {
      "idx_scan": 3844,
      "seq_scan": 8,
      "seq_ratio": 0.0021,
      "dead_ratio": 0.6923,
      "n_dead_tup": 9,
      "n_live_tup": 13,
      "table_name": "entities"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "entity_contacts"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "entity_projects"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "inspection_stage_map"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_analytics"
    },
    {
      "idx_scan": 343,
      "seq_scan": 2,
      "seq_ratio": 0.0058,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 343,
      "table_name": "lead_parcels"
    },
    {
      "idx_scan": 1144490,
      "seq_scan": 9,
      "seq_ratio": 0,
      "dead_ratio": 0.7217,
      "n_dead_tup": 1144034,
      "n_live_tup": 1585127,
      "table_name": "lead_trades"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_view_events"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lead_views"
    },
    {
      "idx_scan": 1716,
      "seq_scan": 13,
      "seq_ratio": 0.0075,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1715,
      "table_name": "lifecycle_status_history"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "lifecycle_transitions"
    },
    {
      "idx_scan": 342,
      "seq_scan": 10,
      "seq_ratio": 0.0284,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
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
      "idx_scan": 2087,
      "seq_scan": 1,
      "seq_ratio": 0.0005,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "neighbourhoods"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "notifications"
    },
    {
      "idx_scan": 91405,
      "seq_scan": 3,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "parcel_buildings"
    },
    {
      "idx_scan": 72150,
      "seq_scan": 9,
      "seq_ratio": 0.0001,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "parcels"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_history"
    },
    {
      "idx_scan": 13,
      "seq_scan": 19,
      "seq_ratio": 0.5938,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_inspections"
    },
    {
      "idx_scan": 262362,
      "seq_scan": 4,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 343,
      "table_name": "permit_parcels"
    },
    {
      "idx_scan": 2,
      "seq_scan": 1,
      "seq_ratio": 0.3333,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_phase_transitions"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_products"
    },
    {
      "idx_scan": 1690673,
      "seq_scan": 15,
      "seq_ratio": 0,
      "dead_ratio": 0.7154,
      "n_dead_tup": 886188,
      "n_live_tup": 1238663,
      "table_name": "permit_trades"
    },
    {
      "idx_scan": 229084,
      "seq_scan": 4,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "permit_type_classifications"
    },
    {
      "idx_scan": 1425528,
      "seq_scan": 83,
      "seq_ratio": 0.0001,
      "dead_ratio": 1.2596,
      "n_dead_tup": 315372,
      "n_live_tup": 250382,
      "table_name": "permits"
    },
    {
      "idx_scan": 131,
      "seq_scan": 3,
      "seq_ratio": 0.0224,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 136,
      "table_name": "phase_calibration"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "phase_stay_calibration"
    },
    {
      "idx_scan": 81,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 1,
      "n_dead_tup": 2,
      "n_live_tup": 2,
      "table_name": "pipeline_runs"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "pipeline_schedules"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "product_groups"
    },
    {
      "idx_scan": 3,
      "seq_scan": 1,
      "seq_ratio": 0.25,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 2,
      "table_name": "schema_migrations"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "scope_intensity_matrix"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "scraper_queue"
    },
    {
      "idx_scan": 6,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "spatial_ref_sys"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "stripe_webhook_events"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "subscribe_nonces"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 1,
      "table_name": "sync_runs"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "tracked_projects"
    },
    {
      "idx_scan": 0,
      "seq_scan": 10,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_configurations"
    },
    {
      "idx_scan": 35,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_forecasts"
    },
    {
      "idx_scan": 2,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_mapping_rules"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_sqft_rates"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trade_suppliers"
    },
    {
      "idx_scan": 0,
      "seq_scan": 251478,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "trades"
    },
    {
      "idx_scan": 0,
      "seq_scan": 1,
      "seq_ratio": 1,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "universal_stream_catalog"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "universal_stream_trade_signals"
    },
    {
      "idx_scan": 0,
      "seq_scan": 0,
      "seq_ratio": 0,
      "dead_ratio": 0,
      "n_dead_tup": 0,
      "n_live_tup": 0,
      "table_name": "user_profiles"
    },
    {
      "idx_scan": 9,
      "seq_scan": 17,
      "seq_ratio": 0.6538,
      "dead_ratio": 0,
      "n_dead_tup": 2,
      "n_live_tup": 0,
      "table_name": "wsib_registry"
    }
  ],
  "tables_checked": 57,
  "tables_vacuumed": 5
}
```

### stdout tail
```
  OK: tracked_projects — dead tuple ratio 0.0%
  OK: trade_configurations — dead tuple ratio 0.0%
  OK: trade_forecasts — dead tuple ratio 0.0%
  OK: trade_mapping_rules — dead tuple ratio 0.0%
  OK: trade_sqft_rates — dead tuple ratio 0.0%
  OK: trade_suppliers — dead tuple ratio 0.0%
  OK: trades — dead tuple ratio 0.0%
  OK: universal_stream_catalog — dead tuple ratio 0.0%
  OK: universal_stream_trade_signals — dead tuple ratio 0.0%
  OK: user_profiles — dead tuple ratio 0.0%
  OK: wsib_registry — dead tuple ratio 0.0%

--- Auto-VACUUM ANALYZE (5 tables above 10% dead ratio) ---
  VACUUM ANALYZE entities — done (was 69.2% dead)
  VACUUM ANALYZE lead_trades — done (was 72.2% dead)
  VACUUM ANALYZE permit_trades — done (was 71.5% dead)
  VACUUM ANALYZE permits — done (was 126.0% dead)
  VACUUM ANALYZE pipeline_runs — done (was 100.0% dead)

  Snapshot: 57 tables written to engine_health_snapshots (0 actually updated)
PIPELINE_SUMMARY:{"records_total":57,"records_new":null,"records_updated":0,"records_meta":{"checks_warned":6,"checks_failed":0,"tables_checked":57,"tables_vacuumed":5,"warnings":["lead_trades: 1,144,034 dead tuples (72.2% of 1,585,127 live)","lead_trades: update/insert ratio 754.4x (1,142,967 upd vs 1,515 ins)","permit_trades: 886,188 dead tuples (71.5% of 1,238,663 live)","permit_trades: update/insert ratio 754.9x (1,142,968 upd vs 1,514 ins)","permits: 315,372 dead tuples (126.0% of 250,382 live)","permits: update/insert ratio 2177.0x (772,852 upd vs 355 ins)"],"engine_health":[{"table_name":"address_points","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":7,"idx_scan":1,"seq_ratio":0.875},{"table_name":"builder_contacts","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"builders","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"building_footprints","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":3,"idx_scan":70846,"seq_ratio":0},{"table_name":"coa_applications","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":21,"idx_scan":29,"seq_ratio":0.42},{"table_name":"cost_estimates","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":4,"seq_ratio":0.5},{"table_name":"data_quality_snapshots","n_live_tup":1,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":1,"seq_ratio":0.5},{"table_name":"device_tokens","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"engine_health_snapshots","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"entities","n_live_tup":13,"n_dead_tup":9,"dead_ratio":0.6923,"seq_scan":8,"idx_scan":3844,"seq_ratio":0.0021},{"table_name":"entity_contacts","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"entity_projects","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"inspection_stage_map","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"lead_analytics","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"lead_parcels","n_live_tup":343,"n_dead_tup":0,"dead_ratio":0,"seq_scan":2,"idx_scan":343,"seq_ratio":0.0058},{"table_name":"lead_trades","n_live_tup":1585127,"n_dead_tup":1144034,"dead_ratio":0.7217,"seq_scan":9,"idx_scan":1144490,"seq_ratio":0},{"table_name":"lead_view_events","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"lead_views","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"lifecycle_status_history","n_live_tup":1715,"n_dead_tup":0,"dead_ratio":0,"seq_scan":13,"idx_scan":1716,"seq_ratio":0.0075},{"table_name":"lifecycle_transitions","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"logic_variables","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":10,"idx_scan":342,"seq_ratio":0.0284},{"table_name":"mv_monthly_permit_stats","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"neighbourhoods","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":2087,"seq_ratio":0.0005},{"table_name":"notifications","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"parcel_buildings","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":3,"idx_scan":91405,"seq_ratio":0},{"table_name":"parcels","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":9,"idx_scan":72150,"seq_ratio":0.0001},{"table_name":"permit_history","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"permit_inspections","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":19,"idx_scan":13,"seq_ratio":0.5938},{"table_name":"permit_parcels","n_live_tup":343,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":262362,"seq_ratio":0},{"table_name":"permit_phase_transitions","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":2,"seq_ratio":0.3333},{"table_name":"permit_products","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"permit_trades","n_live_tup":1238663,"n_dead_tup":886188,"dead_ratio":0.7154,"seq_scan":15,"idx_scan":1690673,"seq_ratio":0},{"table_name":"permit_type_classifications","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":4,"idx_scan":229084,"seq_ratio":0},{"table_name":"permits","n_live_tup":250382,"n_dead_tup":315372,"dead_ratio":1.2596,"seq_scan":83,"idx_scan":1425528,"seq_ratio":0.0001},{"table_name":"phase_calibration","n_live_tup":136,"n_dead_tup":0,"dead_ratio":0,"seq_scan":3,"idx_scan":131,"seq_ratio":0.0224},{"table_name":"phase_stay_calibration","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"pipeline_runs","n_live_tup":2,"n_dead_tup":2,"dead_ratio":1,"seq_scan":0,"idx_scan":81,"seq_ratio":0},{"table_name":"pipeline_schedules","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"product_groups","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"schema_migrations","n_live_tup":2,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":3,"seq_ratio":0.25},{"table_name":"scope_intensity_matrix","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"scraper_queue","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"spatial_ref_sys","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":6,"seq_ratio":0},{"table_name":"stripe_webhook_events","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"subscribe_nonces","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"sync_runs","n_live_tup":1,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"tracked_projects","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"trade_configurations","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":10,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_forecasts","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":35,"seq_ratio":0},{"table_name":"trade_mapping_rules","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":2,"seq_ratio":0},{"table_name":"trade_sqft_rates","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"trade_suppliers","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"trades","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":251478,"idx_scan":0,"seq_ratio":1},{"table_name":"universal_stream_catalog","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":1,"idx_scan":0,"seq_ratio":1},{"table_name":"universal_stream_trade_signals","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"user_profiles","n_live_tup":0,"n_dead_tup":0,"dead_ratio":0,"seq_scan":0,"idx_scan":0,"seq_ratio":0},{"table_name":"wsib_registry","n_live_tup":0,"n_dead_tup":2,"dead_ratio":0,"seq_scan":17,"idx_scan":9,"seq_ratio":0.6538}],"audit_table":{"phase":16,"name":"Engine Health","verdict":"WARN","rows":[{"metric":"tables_checked","value":57,"threshold":null,"status":"INFO"},{"metric":"tables_vacuumed","value":5,"threshold":null,"status":"INFO"},{"metric":"high_dead_ratio_tables","value":3,"threshold":"== 0","status":"WARN"},{"metric":"high_seq_scan_tables","value":0,"threshold":"== 0","status":"PASS"},{"metric":"sys_velocity_rows_sec","value":3.6,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":15835,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"pg_stat_user_tables":["relname","n_live_tup","n_dead_tup","seq_scan","idx_scan","n_tup_ins","n_tup_upd"]},"writes":{"engine_health_snapshots":["table_name","n_live_tup","n_dead_tup","dead_ratio","seq_scan","idx_scan","seq_ratio"]}}

  Warnings: 6

=== Engine Health: COMPLETED (15.8s) ===


[assert-engine-health] completed in 15.8s

```

### stderr tail
```

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=15940ms

### C2: PASS
**Evidence:** id=3328 status=completed completed_at=Fri May 22 2026 21:00:59 GMT-0400 (Eastern Daylight Time)

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
**Evidence:** claimed records_new+records_updated=0; deltas={"engine_health_snapshots":{"pre":1077,"post":1134,"delta":57}}

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
- **C8:** claimed records_new+records_updated=0; deltas={"engine_health_snapshots":{"pre":1077,"post":1134,"delta":57}}
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=0 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
