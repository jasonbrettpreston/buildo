-- 227_rls_class_b_default_deny.sql
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B
--   — pipeline/enrichment tables, default deny) + §8 (migration mechanics:
--   grouped by class, not by table).
--
-- GENERATED, not hand-authored, per §4/§7's own stated method: this file's
-- table list is the output of a scratchpad generator script
-- (scripts run once against the live dev DB per .cursor/phase1_plan.md Item 3
-- P1-F3b) querying `pg_tables` and subtracting the exclusion set below — a
-- hand-typed Class B list would inherit the known staleness of
-- `01_database_schema.md`'s table inventory (Spec 114 §2 rationale) as a
-- live RLS gap. Re-generate rather than hand-edit if the table list drifts.
--
-- Exclusion set (13 tables, computed at generation time against the live
-- dev DB — 82 total public tables, 69 Class B):
--   * 10 D6 UID tables (ADR-007) — get owner-scoped Class A policies in
--     migration 230, strictly AFTER 229's uuid conversion (Spec 114 §7):
--     user_profiles, lead_views, lead_view_events, subscribe_nonces, device_tokens, tracked_projects, notifications, notification_dispatches, admin_watchlist, admin_audit_log
--   * profiles — Class C, self-read/self-update policies already landed in
--     migration 226 (Spec 114 §5).
--   * entitlements — Class A's 11th table (owner-read-only), gets its policy
--     in migration 230 alongside the D6 tables (Spec 114 §7); does not exist
--     yet at this migration's authoring time (228 lands after 227) but is
--     excluded by name as a forward-guard.
--   * spatial_ref_sys — Spec 114 §2 "Flagged, not classified": a PostGIS
--     extension-owned system table (SRID reference data), out of this
--     catalog's scope entirely, not assigned a default-deny policy.
--
-- Per Spec 114 §4: `ENABLE ROW LEVEL SECURITY` with ZERO `CREATE POLICY`
-- statements denies ALL access (every operation, every row) to any role the
-- policy engine applies to (`anon`/`authenticated`) — the deny is total and
-- uniform by construction. This does NOT affect the pipeline or Next.js
-- admin API's raw `pg` connections (table owner, RLS-exempt by ordinary
-- Postgres semantics, Decision D1) — see Spec 114 §4's "who this deny does
-- not apply to" note. Zero-behavior-change, zero-risk migration: Data API
-- (PostgREST) is disabled (D10) and no anon/authenticated Postgres role is
-- granted anything on these tables today.

-- UP
BEGIN;

ALTER TABLE address_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE archetype_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE building_footprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE coa_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_stage_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE logic_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_build_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_storey_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_address_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_phase_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_type_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_stay_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ravines ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_intensity_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE toronto_centreline ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_sqft_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE universal_stream_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE universal_stream_trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE wsib_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_building_setback_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_bylaw_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_height_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_lot_coverage_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_parking_zone_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_policy_area_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_policy_road_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_priority_retail_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_queenstw_eat_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoning_rooming_house_overlay ENABLE ROW LEVEL SECURITY;

COMMIT;

-- DOWN — comment-only per the ALLOW-DESTRUCTIVE convention (migrations 215,
-- 217): disabling RLS is a security-posture rollback, treated like a
-- DROP TABLE even though no data is destroyed (Spec 114 §8). Manual
-- rollback only.

-- BEGIN;
--   ALTER TABLE address_points DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE archetype_cost_rates DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE building_footprints DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE coa_applications DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE cost_estimates DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE data_quality_snapshots DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE engine_health_snapshots DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE entity_contacts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE entity_projects DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE heritage_districts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE heritage_properties DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE inspection_stage_map DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_analytics DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_parcels DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_products DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_trades DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lifecycle_status_history DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lifecycle_transitions DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE logic_variables DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE neighbourhood_build_norms DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE neighbourhood_storey_norms DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE neighbourhoods DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE parcel_address_points DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE parcel_buildings DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE parcels DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_history DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_inspections DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_parcels DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_phase_transitions DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_products DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_trades DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permit_type_classifications DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE permits DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE phase_calibration DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE phase_stay_calibration DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE pipeline_runs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE pipeline_schedules DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE product_groups DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE ravines DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE schema_migrations DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scope_intensity_matrix DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scraper_queue DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE stripe_webhook_events DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE supplier_products DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE supplier_trades DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE sync_runs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE toronto_centreline DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_configurations DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_forecasts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_mapping_rules DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_products DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_sqft_rates DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trade_suppliers DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE trades DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE universal_stream_catalog DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE universal_stream_trade_signals DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE wsib_registry DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_building_setback_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_bylaw_areas DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_height_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_lot_coverage_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_parking_zone_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_policy_area_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_policy_road_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_priority_retail_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_queenstw_eat_overlay DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE zoning_rooming_house_overlay DISABLE ROW LEVEL SECURITY;
-- COMMIT;
