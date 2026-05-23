# Step 28: assert_global_coverage
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 61abe60
**Risk class:** cqa
**Per-step agent:** Compliance
**Final status:** INVESTIGATE
**Notes:** Spec 49 cap

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3324,
    "status": "completed",
    "completed_at": "2026-05-20T20:51:39.848Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:51:27.007Z",
    "duration_ms": "12841"
  },
  {
    "id": 3278,
    "status": "completed",
    "completed_at": "2026-05-20T02:17:39.958Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:17:26.886Z",
    "duration_ms": "13072"
  },
  {
    "id": 3249,
    "status": "failed",
    "completed_at": "2026-05-20T01:55:06.504Z",
    "verdict": null,
    "started_at": "2026-05-20T01:55:03.872Z",
    "duration_ms": "2631"
  }
]

## Execution
- Command: `node scripts/quality/assert-global-coverage.js`
- Exit code: 0
- Duration: 17782ms
- New `pipeline_runs.id`: 3324

## Post-run state
- Output table counts: {}
- New run: {"id":3324,"status":"completed","verdict":"WARN","duration_ms":"12841","records_total":1,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 64,
    "metric": "permits.columns_present (Step 1 — assert_schema)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.permit_type (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "99.6%",
    "metric": "permits.structure_type (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "99.8%",
    "metric": "permits.work (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.street_num (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.street_name (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "99.6%",
    "metric": "permits.street_name_normalized (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.street_type (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 35514,
    "metric": "permits.street_direction (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.city (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.postal (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "96.9%",
    "metric": "permits.geo_id (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 0,
    "metric": "permits.building_type (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits.category (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.application_date (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "93.5%",
    "metric": "permits.issued_date (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 18944,
    "metric": "permits.completed_date (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.status (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "99.8%",
    "metric": "permits.description (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 134346,
    "metric": "permits.est_const_cost (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 12574,
    "metric": "permits.builder_name (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits.owner (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.dwelling_units_created (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.dwelling_units_lost (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 48273,
    "metric": "permits.ward (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits.council_district (Step 2 — load_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "88.3%",
    "metric": "permits.current_use (Step 2 — load_permits)",
    "status": "WARN",
    "threshold": ">= 90%"
  },
  {
    "value": "88.3%",
    "metric": "permits.proposed_use (Step 2 — load_permits)",
    "status": "WARN",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.housing_units (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.storeys (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.data_hash (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.raw_json (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.last_seen_at (Step 2 — load_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 18949,
    "metric": "permits.status (stale total) (Step 3 — close_stale_permits)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.completed_date (Step 3 — close_stale_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 12861,
    "metric": "permits.enriched_status (Step 4 — classify_permit_phase)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.project_type (Step 5 — classify_scope)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.scope_tags (Step 5 — classify_scope)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.scope_classified_at (Step 5 — classify_scope)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.scope_source (Step 5 — classify_scope)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "80.4%",
    "metric": "entities.name_normalized (permit builders) (Step 6 — extract_builders)",
    "status": "WARN",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "entities.legal_name (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "entities.permit_count (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "entities.entity_type (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "entities.last_seen_at (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "13.2%",
    "metric": "entities.primary_phone (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 10%"
  },
  {
    "value": "8%",
    "metric": "entities.primary_email (Step 6 — extract_builders)",
    "status": "WARN",
    "threshold": ">= 10%"
  },
  {
    "value": "16.3%",
    "metric": "entities.website (Step 6 — extract_builders)",
    "status": "PASS",
    "threshold": ">= 10%"
  },
  {
    "value": "24%",
    "metric": "entities.is_wsib_registered (Step 7 — link_wsib)",
    "status": "PASS",
    "threshold": ">= 10%"
  },
  {
    "value": "11.6%",
    "metric": "wsib_registry.linked_entity_id (Step 7 — link_wsib)",
    "status": "PASS",
    "threshold": ">= 10%"
  },
  {
    "value": "100%",
    "metric": "wsib_registry.match_confidence (Step 7 — link_wsib)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "91.2%",
    "metric": "permits.latitude (Step 8 — geocode_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "91.2%",
    "metric": "permits.longitude (Step 8 — geocode_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "91.2%",
    "metric": "permits.location (Step 8 — geocode_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "91.2%",
    "metric": "permits.geocoded_at (Step 8 — geocode_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "93.2%",
    "metric": "permit_parcels.permits_linked (Step 9 — link_parcels)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "98.1%",
    "metric": "permit_parcels.match_type (geocoded) (Step 9 — link_parcels)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "98.1%",
    "metric": "permit_parcels.confidence (geocoded) (Step 9 — link_parcels)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "98.1%",
    "metric": "permit_parcels.linked_at (geocoded) (Step 9 — link_parcels)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "98.2%",
    "metric": "parcels.lot_size_sqm (Step 9 — link_parcels)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "94.8%",
    "metric": "permits.neighbourhood_id (Step 10 — link_neighbourhoods)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 486530,
    "metric": "parcels.with_centroid (Step 11 — link_massing)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 481194,
    "metric": "parcel_buildings.linked_parcels (Step 11 — link_massing)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "parcel_buildings.is_primary (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "parcel_buildings.structure_type (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "parcel_buildings.match_type (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "parcel_buildings.confidence (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "parcel_buildings.linked_at (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "building_footprints.footprint_area_sqm (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "building_footprints.max_height_m (Step 11 — link_massing)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.scope_tags (non-BLD) (Step 12 — link_similar)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "95.4%",
    "metric": "permit_trades.permits_with_active_trade (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.tier (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.confidence (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.is_active (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.phase (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.lead_score (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permit_trades.classified_at (Step 13 — classify_permits)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "99.1%",
    "metric": "cost_estimates.permits_covered (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.estimated_cost (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.cost_source (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.cost_tier (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.cost_range_low (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.cost_range_high (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.premium_factor (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.complexity_score (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.model_version (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.is_geometric_override (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.modeled_gfa_sqm (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "90.2%",
    "metric": "cost_estimates.effective_area_sqm (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.trade_contract_values (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "cost_estimates.computed_at (Step 14 — compute_cost_estimates)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 136,
    "metric": "phase_calibration.rows_with_median (Step 15 — compute_timing_calibration_v2)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "99.4%",
    "metric": "coa_applications.linked_permit_num (Step 16 — link_coa)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 1,
    "metric": "data_quality_snapshots.today (Step 18 — refresh_snapshot)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "permits.duplicate_pks (Step 19 — assert_data_bounds)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 113,
    "metric": "engine_health_snapshots.today (Step 20 — assert_engine_health)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "99.5%",
    "metric": "permits.lifecycle_phase (Step 21 — classify_lifecycle_phase)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "permits.phase_started_at (Step 21 — classify_lifecycle_phase)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 38535,
    "metric": "permits.lifecycle_stalled (Step 21 — classify_lifecycle_phase)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "permits.lifecycle_classified_at (Step 21 — classify_lifecycle_phase)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "coa_applications.lifecycle_phase (Step 21 — classify_lifecycle_phase)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 1188,
    "metric": "permits.unclassified_count (Step 22 — assert_lifecycle_phase_distribution)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 94993,
    "metric": "trade_forecasts.permits_covered (Step 23 — compute_trade_forecasts)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 94993,
    "metric": "trade_forecasts.predicted_start (Step 23 — compute_trade_forecasts)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 94993,
    "metric": "trade_forecasts.urgency (classified) (Step 23 — compute_trade_forecasts)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.trade_slug (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.target_window (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.confidence (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.calibration_method (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.sample_size (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.median_days (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.p25_days (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.p75_days (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "93.9%",
    "metric": "trade_forecasts.opportunity_score (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "100%",
    "metric": "trade_forecasts.computed_at (Step 23 — compute_trade_forecasts)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": "93.9%",
    "metric": "trade_forecasts.opportunity_score (>0) (Step 24 — compute_opportunity_scores)",
    "status": "PASS",
    "threshold": ">= 90%"
  },
  {
    "value": 0,
    "metric": "tracked_projects.active (Step 25 — update_tracked_projects)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "lead_analytics.rows (Step 25 — update_tracked_projects)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0,
    "metric": "entity_tracing.last_verdict (Step 26 — assert_entity_tracing)",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 0.08,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 12647,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "pipeline_meta": {
    "reads": {},
    "writes": {}
  }
}
```

### stdout tail
```
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Loaded 349 logic variables from control panel"}
{"level":"INFO","tag":"[assert-global-coverage]","msg":"Chain mode: permits (full profile)","context":{"pass_pct":90,"warn_pct":70}}
PIPELINE_SUMMARY:{"records_total":1,"records_new":0,"records_updated":0,"records_meta":{"audit_table":{"phase":111,"name":"Global Data Completeness Profile","verdict":"WARN","rows":[{"metric":"permits.columns_present (Step 1 — assert_schema)","value":64,"threshold":null,"status":"INFO"},{"metric":"permits.permit_type (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.structure_type (Step 2 — load_permits)","value":"99.6%","threshold":">= 90%","status":"PASS"},{"metric":"permits.work (Step 2 — load_permits)","value":"99.8%","threshold":">= 90%","status":"PASS"},{"metric":"permits.street_num (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.street_name (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.street_name_normalized (Step 2 — load_permits)","value":"99.6%","threshold":">= 90%","status":"PASS"},{"metric":"permits.street_type (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.street_direction (Step 2 — load_permits)","value":35544,"threshold":null,"status":"INFO"},{"metric":"permits.city (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.postal (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.geo_id (Step 2 — load_permits)","value":"96.9%","threshold":">= 90%","status":"PASS"},{"metric":"permits.building_type (Step 2 — load_permits)","value":0,"threshold":null,"status":"INFO"},{"metric":"permits.category (Step 2 — load_permits)","value":0,"threshold":null,"status":"INFO"},{"metric":"permits.application_date (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.issued_date (Step 2 — load_permits)","value":"93.5%","threshold":">= 90%","status":"PASS"},{"metric":"permits.completed_date (Step 2 — load_permits)","value":18942,"threshold":null,"status":"INFO"},{"metric":"permits.status (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.description (Step 2 — load_permits)","value":"99.8%","threshold":">= 90%","status":"PASS"},{"metric":"permits.est_const_cost (Step 2 — load_permits)","value":134519,"threshold":null,"status":"INFO"},{"metric":"permits.builder_name (Step 2 — load_permits)","value":12602,"threshold":null,"status":"INFO"},{"metric":"permits.owner (Step 2 — load_permits)","value":0,"threshold":null,"status":"INFO"},{"metric":"permits.dwelling_units_created (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.dwelling_units_lost (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.ward (Step 2 — load_permits)","value":48359,"threshold":null,"status":"INFO"},{"metric":"permits.council_district (Step 2 — load_permits)","value":0,"threshold":null,"status":"INFO"},{"metric":"permits.current_use (Step 2 — load_permits)","value":"88.4%","threshold":">= 90%","status":"WARN"},{"metric":"permits.proposed_use (Step 2 — load_permits)","value":"88.4%","threshold":">= 90%","status":"WARN"},{"metric":"permits.housing_units (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.storeys (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.data_hash (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.raw_json (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.last_seen_at (Step 2 — load_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.status (stale total) (Step 3 — close_stale_permits)","value":18947,"threshold":null,"status":"INFO"},{"metric":"permits.completed_date (Step 3 — close_stale_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.enriched_status (Step 4 — classify_permit_phase)","value":12862,"threshold":null,"status":"INFO"},{"metric":"permits.project_type (Step 5 — classify_scope)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.scope_tags (Step 5 — classify_scope)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.scope_classified_at (Step 5 — classify_scope)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.scope_source (Step 5 — classify_scope)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"entities.name_normalized (permit builders) (Step 6 — extract_builders)","value":"80.4%","threshold":">= 90%","status":"WARN"},{"metric":"entities.legal_name (Step 6 — extract_builders)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"entities.permit_count (Step 6 — extract_builders)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"entities.entity_type (Step 6 — extract_builders)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"entities.last_seen_at (Step 6 — extract_builders)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"entities.primary_phone (Step 6 — extract_builders)","value":"13.2%","threshold":">= 10%","status":"PASS"},{"metric":"entities.primary_email (Step 6 — extract_builders)","value":"8%","threshold":">= 10%","status":"WARN"},{"metric":"entities.website (Step 6 — extract_builders)","value":"16.3%","threshold":">= 10%","status":"PASS"},{"metric":"entities.is_wsib_registered (Step 7 — link_wsib)","value":"24%","threshold":">= 10%","status":"PASS"},{"metric":"wsib_registry.linked_entity_id (Step 7 — link_wsib)","value":"11.6%","threshold":">= 10%","status":"PASS"},{"metric":"wsib_registry.match_confidence (Step 7 — link_wsib)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.latitude (Step 8 — geocode_permits)","value":"91.2%","threshold":">= 90%","status":"PASS"},{"metric":"permits.longitude (Step 8 — geocode_permits)","value":"91.2%","threshold":">= 90%","status":"PASS"},{"metric":"permits.location (Step 8 — geocode_permits)","value":"91.2%","threshold":">= 90%","status":"PASS"},{"metric":"permits.geocoded_at (Step 8 — geocode_permits)","value":"91.2%","threshold":">= 90%","status":"PASS"},{"metric":"permit_parcels.permits_linked (Step 9 — link_parcels)","value":"93.2%","threshold":">= 90%","status":"PASS"},{"metric":"permit_parcels.match_type (geocoded) (Step 9 — link_parcels)","value":"98.1%","threshold":">= 90%","status":"PASS"},{"metric":"permit_parcels.confidence (geocoded) (Step 9 — link_parcels)","value":"98.1%","threshold":">= 90%","status":"PASS"},{"metric":"permit_parcels.linked_at (geocoded) (Step 9 — link_parcels)","value":"98.1%","threshold":">= 90%","status":"PASS"},{"metric":"parcels.lot_size_sqm (Step 9 — link_parcels)","value":"98.2%","threshold":">= 90%","status":"PASS"},{"metric":"permits.neighbourhood_id (Step 10 — link_neighbourhoods)","value":"94.8%","threshold":">= 90%","status":"PASS"},{"metric":"parcels.with_centroid (Step 11 — link_massing)","value":486530,"threshold":null,"status":"INFO"},{"metric":"parcel_buildings.linked_parcels (Step 11 — link_massing)","value":481194,"threshold":null,"status":"INFO"},{"metric":"parcel_buildings.is_primary (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"parcel_buildings.structure_type (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"parcel_buildings.match_type (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"parcel_buildings.confidence (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"parcel_buildings.linked_at (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"building_footprints.footprint_area_sqm (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"building_footprints.max_height_m (Step 11 — link_massing)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.scope_tags (non-BLD) (Step 12 — link_similar)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.permits_with_active_trade (Step 13 — classify_permits)","value":"95.4%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.tier (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.confidence (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.is_active (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.phase (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.lead_score (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permit_trades.classified_at (Step 13 — classify_permits)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.permits_covered (Step 14 — compute_cost_estimates)","value":"98.9%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.estimated_cost (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.cost_source (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.cost_tier (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.cost_range_low (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.cost_range_high (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.premium_factor (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.complexity_score (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.model_version (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.is_geometric_override (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.modeled_gfa_sqm (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.effective_area_sqm (Step 14 — compute_cost_estimates)","value":"90.2%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.trade_contract_values (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"cost_estimates.computed_at (Step 14 — compute_cost_estimates)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"phase_calibration.rows_with_median (Step 15 — compute_timing_calibration_v2)","value":136,"threshold":null,"status":"INFO"},{"metric":"coa_applications.linked_permit_num (Step 16 — link_coa)","value":"99.4%","threshold":">= 90%","status":"PASS"},{"metric":"data_quality_snapshots.today (Step 18 — refresh_snapshot)","value":1,"threshold":null,"status":"INFO"},{"metric":"permits.duplicate_pks (Step 19 — assert_data_bounds)","value":0,"threshold":null,"status":"INFO"},{"metric":"engine_health_snapshots.today (Step 20 — assert_engine_health)","value":57,"threshold":null,"status":"INFO"},{"metric":"permits.lifecycle_phase (Step 21 — classify_lifecycle_phase)","value":"99.5%","threshold":">= 90%","status":"PASS"},{"metric":"permits.phase_started_at (Step 21 — classify_lifecycle_phase)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.lifecycle_stalled (Step 21 — classify_lifecycle_phase)","value":38554,"threshold":null,"status":"INFO"},{"metric":"permits.lifecycle_classified_at (Step 21 — classify_lifecycle_phase)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"coa_applications.lifecycle_phase (Step 21 — classify_lifecycle_phase)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"permits.unclassified_count (Step 22 — assert_lifecycle_phase_distribution)","value":1197,"threshold":null,"status":"INFO"},{"metric":"trade_forecasts.permits_covered (Step 23 — compute_trade_forecasts)","value":96750,"threshold":null,"status":"INFO"},{"metric":"trade_forecasts.predicted_start (Step 23 — compute_trade_forecasts)","value":96750,"threshold":null,"status":"INFO"},{"metric":"trade_forecasts.urgency (classified) (Step 23 — compute_trade_forecasts)","value":96750,"threshold":null,"status":"INFO"},{"metric":"trade_forecasts.trade_slug (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.target_window (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.confidence (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.calibration_method (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.sample_size (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.median_days (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.p25_days (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.p75_days (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.opportunity_score (Step 23 — compute_trade_forecasts)","value":"93.6%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.computed_at (Step 23 — compute_trade_forecasts)","value":"100%","threshold":">= 90%","status":"PASS"},{"metric":"trade_forecasts.opportunity_score (>0) (Step 24 — compute_opportunity_scores)","value":"93.6%","threshold":">= 90%","status":"PASS"},{"metric":"tracked_projects.active (Step 25 — update_tracked_projects)","value":0,"threshold":null,"status":"INFO"},{"metric":"lead_analytics.rows (Step 25 — update_tracked_projects)","value":0,"threshold":null,"status":"INFO"},{"metric":"entity_tracing.last_verdict (Step 26 — assert_entity_tracing)","value":0,"threshold":null,"status":"INFO"},{"metric":"sys_velocity_rows_sec","value":0.06,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":17607,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{},"writes":{}}

[assert-global-coverage] completed in 17.6s

```

### stderr tail
```
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-global-coverage]","msg":"Coverage verdict: WARN","context":{"fail_count":0,"warn_count":4}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=17782ms

### C2: PASS
**Evidence:** id=3324 status=completed completed_at=Wed May 20 2026 16:51:39 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 122 audit rows: [permits.columns_present (Step 1 — assert_schema), permits.permit_type (Step 2 — load_permits), permits.structure_type (Step 2 — load_permits), permits.work (Step 2 — load_permits), permits.street_num (Step 2 — load_permits), permits.street_name (Step 2 — load_permits), permits.street_name_normalized (Step 2 — load_permits), permits.street_type (Step 2 — load_permits), permits.street_direction (Step 2 — load_permits), permits.city (Step 2 — load_permits), permits.postal (Step 2 — load_permits), permits.geo_id (Step 2 — load_permits), permits.building_type (Step 2 — load_permits), permits.category (Step 2 — load_permits), permits.application_date (Step 2 — load_permits), permits.issued_date (Step 2 — load_permits), permits.completed_date (Step 2 — load_permits), permits.status (Step 2 — load_permits), permits.description (Step 2 — load_permits), permits.est_const_cost (Step 2 — load_permits), permits.builder_name (Step 2 — load_permits), permits.owner (Step 2 — load_permits), permits.dwelling_units_created (Step 2 — load_permits), permits.dwelling_units_lost (Step 2 — load_permits), permits.ward (Step 2 — load_permits), permits.council_district (Step 2 — load_permits), permits.current_use (Step 2 — load_permits), permits.proposed_use (Step 2 — load_permits), permits.housing_units (Step 2 — load_permits), permits.storeys (Step 2 — load_permits), permits.data_hash (Step 2 — load_permits), permits.raw_json (Step 2 — load_permits), permits.last_seen_at (Step 2 — load_permits), permits.status (stale total) (Step 3 — close_stale_permits), permits.completed_date (Step 3 — close_stale_permits), permits.enriched_status (Step 4 — classify_permit_phase), permits.project_type (Step 5 — classify_scope), permits.scope_tags (Step 5 — classify_scope), permits.scope_classified_at (Step 5 — classify_scope), permits.scope_source (Step 5 — classify_scope), entities.name_normalized (permit builders) (Step 6 — extract_builders), entities.legal_name (Step 6 — extract_builders), entities.permit_count (Step 6 — extract_builders), entities.entity_type (Step 6 — extract_builders), entities.last_seen_at (Step 6 — extract_builders), entities.primary_phone (Step 6 — extract_builders), entities.primary_email (Step 6 — extract_builders), entities.website (Step 6 — extract_builders), entities.is_wsib_registered (Step 7 — link_wsib), wsib_registry.linked_entity_id (Step 7 — link_wsib), wsib_registry.match_confidence (Step 7 — link_wsib), permits.latitude (Step 8 — geocode_permits), permits.longitude (Step 8 — geocode_permits), permits.location (Step 8 — geocode_permits), permits.geocoded_at (Step 8 — geocode_permits), permit_parcels.permits_linked (Step 9 — link_parcels), permit_parcels.match_type (geocoded) (Step 9 — link_parcels), permit_parcels.confidence (geocoded) (Step 9 — link_parcels), permit_parcels.linked_at (geocoded) (Step 9 — link_parcels), parcels.lot_size_sqm (Step 9 — link_parcels), permits.neighbourhood_id (Step 10 — link_neighbourhoods), parcels.with_centroid (Step 11 — link_massing), parcel_buildings.linked_parcels (Step 11 — link_massing), parcel_buildings.is_primary (Step 11 — link_massing), parcel_buildings.structure_type (Step 11 — link_massing), parcel_buildings.match_type (Step 11 — link_massing), parcel_buildings.confidence (Step 11 — link_massing), parcel_buildings.linked_at (Step 11 — link_massing), building_footprints.footprint_area_sqm (Step 11 — link_massing), building_footprints.max_height_m (Step 11 — link_massing), permits.scope_tags (non-BLD) (Step 12 — link_similar), permit_trades.permits_with_active_trade (Step 13 — classify_permits), permit_trades.tier (Step 13 — classify_permits), permit_trades.confidence (Step 13 — classify_permits), permit_trades.is_active (Step 13 — classify_permits), permit_trades.phase (Step 13 — classify_permits), permit_trades.lead_score (Step 13 — classify_permits), permit_trades.classified_at (Step 13 — classify_permits), cost_estimates.permits_covered (Step 14 — compute_cost_estimates), cost_estimates.estimated_cost (Step 14 — compute_cost_estimates), cost_estimates.cost_source (Step 14 — compute_cost_estimates), cost_estimates.cost_tier (Step 14 — compute_cost_estimates), cost_estimates.cost_range_low (Step 14 — compute_cost_estimates), cost_estimates.cost_range_high (Step 14 — compute_cost_estimates), cost_estimates.premium_factor (Step 14 — compute_cost_estimates), cost_estimates.complexity_score (Step 14 — compute_cost_estimates), cost_estimates.model_version (Step 14 — compute_cost_estimates), cost_estimates.is_geometric_override (Step 14 — compute_cost_estimates), cost_estimates.modeled_gfa_sqm (Step 14 — compute_cost_estimates), cost_estimates.effective_area_sqm (Step 14 — compute_cost_estimates), cost_estimates.trade_contract_values (Step 14 — compute_cost_estimates), cost_estimates.computed_at (Step 14 — compute_cost_estimates), phase_calibration.rows_with_median (Step 15 — compute_timing_calibration_v2), coa_applications.linked_permit_num (Step 16 — link_coa), data_quality_snapshots.today (Step 18 — refresh_snapshot), permits.duplicate_pks (Step 19 — assert_data_bounds), engine_health_snapshots.today (Step 20 — assert_engine_health), permits.lifecycle_phase (Step 21 — classify_lifecycle_phase), permits.phase_started_at (Step 21 — classify_lifecycle_phase), permits.lifecycle_stalled (Step 21 — classify_lifecycle_phase), permits.lifecycle_classified_at (Step 21 — classify_lifecycle_phase), coa_applications.lifecycle_phase (Step 21 — classify_lifecycle_phase), permits.unclassified_count (Step 22 — assert_lifecycle_phase_distribution), trade_forecasts.permits_covered (Step 23 — compute_trade_forecasts), trade_forecasts.predicted_start (Step 23 — compute_trade_forecasts), trade_forecasts.urgency (classified) (Step 23 — compute_trade_forecasts), trade_forecasts.trade_slug (Step 23 — compute_trade_forecasts), trade_forecasts.target_window (Step 23 — compute_trade_forecasts), trade_forecasts.confidence (Step 23 — compute_trade_forecasts), trade_forecasts.calibration_method (Step 23 — compute_trade_forecasts), trade_forecasts.sample_size (Step 23 — compute_trade_forecasts), trade_forecasts.median_days (Step 23 — compute_trade_forecasts), trade_forecasts.p25_days (Step 23 — compute_trade_forecasts), trade_forecasts.p75_days (Step 23 — compute_trade_forecasts), trade_forecasts.opportunity_score (Step 23 — compute_trade_forecasts), trade_forecasts.computed_at (Step 23 — compute_trade_forecasts), trade_forecasts.opportunity_score (>0) (Step 24 — compute_opportunity_scores), tracked_projects.active (Step 25 — update_tracked_projects), lead_analytics.rows (Step 25 — update_tracked_projects), entity_tracing.last_verdict (Step 26 — assert_entity_tracing), sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 1 records_meta keys: [pipeline_meta]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=1 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=1 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=1 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Compliance agent to run separately and append findings here._
