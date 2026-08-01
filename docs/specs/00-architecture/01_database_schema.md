# Spec 01 -- Database Schema

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 1.4** of `.cursor/active_task.md`.

## 1. Goal & User Story
Provide a normalized PostgreSQL schema storing 237K+ building permits with change tracking, trade classification, builder enrichment, and spatial data so that every downstream feature queries a single authoritative data store.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read (via API) |
| Admin | Read/Write |

## 3. Behavioral Contract
- **Inputs:** SQL migration files executed sequentially by `scripts/migrate.js` against a PostgreSQL database.
- **Core Logic:** The schema consists of 85 tables across six domains (generated listing below is authoritative). **Core permits** (`permits` with composite PK `(permit_num, revision_num)`, `permit_history`, `sync_runs`, `pipeline_runs`, `pipeline_schedules`) store ingested data, field-level audit trails, and pipeline run metadata. **Classification** (`trades`, `trade_mapping_rules` with 3-tier CHECK, `permit_trades` junction, `product_groups`, `permit_products`) links permits to 32 trade categories and product groups with confidence scores. **Enrichment** (`entities` deduplicated by `name_normalized`, `entity_projects` junction, `coa_applications` with optional permit linking, `wsib_registry`, `permit_inspections`) tracks entity profiles, WSIB records, inspection stages, and Committee of Adjustment data. **Spatial** (`parcels` with lot dimensions, `permit_parcels` junction, `neighbourhoods` with Census 2021 demographics, `building_footprints` with 3D massing, `parcel_buildings` junction, `address_points`, `data_quality_snapshots`) supports geocoding, parcel matching, and quality tracking. **Cost modelling** (`cost_estimates`, `scope_intensity_matrix` with GFA allocation percentages by permit+structure type, `trade_sqft_rates` with base $/sqft by trade slug, `trade_configurations` with per-trade LoS multipliers) drives the cost estimation pipeline (Spec 83/86). **Operations** (`logic_variables`, `scraper_queue`, `permit_scrape_outcomes` + `permit_scrape_outcome_rollup` — the append-only per-permit scrape-outcome ledger and its 90-day rollup, Spec 44 §3, migrations 236/237 — `engine_health_snapshots`, `lead_analytics`, `lead_views`, `tracked_projects`, `notifications`, `user_profiles`, `schema_migrations`) supports runtime configuration, scraping, and user activity tracking. All DDL uses `IF NOT EXISTS` for idempotent re-runs; trade seeds use `ON CONFLICT DO NOTHING`. The `pg` Pool in `src/lib/db/client.ts` provides `query<T>()` and `getClient()` for typed access. See `Permit`, `Trade`, `Entity`, `Inspection`, and related interfaces in `src/lib/permits/types.ts`.
- **Outputs:** A fully indexed PostgreSQL database with 120+ B-tree, GIN, and GiST indexes supporting FTS, change detection (SHA-256 `data_hash`), spatial lookups (PostGIS `GEOMETRY` columns on `parcels`, `neighbourhoods`, and `building_footprints`), cost/date filter queries (`est_const_cost`, `application_date`, `hearing_date`), and referential integrity (FK constraints on 23 relationships — all Tier 1 as of migration 109, 2026-04-24). Partial indexes on `permits` (needs geocode) and `builders` (needs enrich) accelerate worker queries. **FK Hardening (migration 109, 2026-04-24):** All Tier 2 relationships are now enforced: `permit_history→permits` (CASCADE), `permit_history→sync_runs` (SET NULL), `tracked_projects→permits` (CASCADE), `permits→neighbourhoods` (SET NULL), `permit_products→permits` (CASCADE). `permit_products.permit_num` widened from VARCHAR(20)→VARCHAR(30) to match permits PK. 13 orphaned `permits.neighbourhood_id` rows nulled before constraint addition.
- **Edge Cases:** Composite PK requires both `permit_num` AND `revision_num` in all queries; `tier` CHECK rejects values outside 1-3; `confidence` CHECK rejects values outside 0-1; `est_const_cost` DECIMAL(15,2) overflows beyond 13 integer digits; migration runner is forward-only with no rollback. CoA FK to permits is intentionally omitted (composite PK incompatible with single-column reference) — enforced via CQA Tier 2 referential audit instead. PostgreSQL ENUMs deferred for `status` columns to accommodate upstream Toronto Open Data changes.

<!-- DB_SCHEMA_START -->
### Tables (85)

| Table | Columns | Indexes |
|-------|---------|--------|
| `address_points` | 16 | 3 |
| `admin_audit_log` | 8 | 2 |
| `admin_backup_codes` | 6 | 1 |
| `admin_watchlist` | 9 | 2 |
| `archetype_cost_rates` | 7 | 0 |
| `building_footprints` | 13 | 4 |
| `coa_applications` | 146 | 23 |
| `cost_estimates` | 16 | 1 |
| `data_quality_snapshots` | 73 | 2 |
| `device_tokens` | 6 | 2 |
| `engine_health_snapshots` | 10 | 1 |
| `entities` | 19 | 4 |
| `entitlements` | 9 | 1 |
| `entity_contacts` | 8 | 3 |
| `entity_projects` | 7 | 5 |
| `heritage_districts` | 11 | 2 |
| `heritage_properties` | 14 | 4 |
| `inspection_stage_map` | 8 | 2 |
| `lead_analytics` | 5 | 1 |
| `lead_parcels` | 5 | 2 |
| `lead_products` | 5 | 3 |
| `lead_trades` | 10 | 5 |
| `lead_view_events` | 4 | 0 |
| `lead_views` | 11 | 5 |
| `lifecycle_status_history` | 17 | 5 |
| `lifecycle_transitions` | 11 | 5 |
| `logic_variables` | 5 | 0 |
| `neighbourhood_build_norms` | 30 | 2 |
| `neighbourhood_storey_norms` | 8 | 2 |
| `neighbourhoods` | 22 | 3 |
| `notification_dispatches` | 11 | 4 |
| `notifications` | 13 | 3 |
| `parcel_address_points` | 3 | 1 |
| `parcel_buildings` | 8 | 4 |
| `parcels` | 158 | 6 |
| `permit_history` | 8 | 2 |
| `permit_inspections` | 7 | 3 |
| `permit_parcels` | 7 | 3 |
| `permit_phase_transitions` | 8 | 4 |
| `permit_products` | 7 | 1 |
| `permit_scrape_outcome_rollup` | 6 | 0 |
| `permit_scrape_outcomes` | 8 | 2 |
| `permit_trades` | 11 | 5 |
| `permit_type_classifications` | 4 | 0 |
| `permits` | 171 | 27 |
| `phase_calibration` | 9 | 2 |
| `phase_stay_calibration` | 11 | 3 |
| `pipeline_runs` | 11 | 1 |
| `pipeline_schedules` | 6 | 1 |
| `product_groups` | 6 | 2 |
| `profiles` | 4 | 0 |
| `ravines` | 6 | 3 |
| `schema_migrations` | 4 | 0 |
| `scope_intensity_matrix` | 4 | 0 |
| `scraper_queue` | 8 | 1 |
| `spatial_ref_sys` | 5 | 0 |
| `stripe_webhook_events` | 4 | 1 |
| `subscribe_nonces` | 3 | 0 |
| `supplier_products` | 3 | 1 |
| `supplier_trades` | 3 | 0 |
| `suppliers` | 5 | 0 |
| `sync_runs` | 12 | 0 |
| `toronto_centreline` | 21 | 3 |
| `tracked_projects` | 12 | 5 |
| `trade_configurations` | 8 | 0 |
| `trade_forecasts` | 15 | 2 |
| `trade_mapping_rules` | 11 | 2 |
| `trade_products` | 3 | 1 |
| `trade_sqft_rates` | 4 | 0 |
| `trade_suppliers` | 5 | 1 |
| `trades` | 10 | 1 |
| `universal_stream_catalog` | 20 | 2 |
| `universal_stream_trade_signals` | 3 | 2 |
| `user_profiles` | 30 | 1 |
| `wsib_registry` | 22 | 9 |
| `zoning_building_setback_overlay` | 10 | 2 |
| `zoning_bylaw_areas` | 29 | 5 |
| `zoning_height_overlay` | 9 | 2 |
| `zoning_lot_coverage_overlay` | 7 | 2 |
| `zoning_parking_zone_overlay` | 8 | 2 |
| `zoning_policy_area_overlay` | 9 | 2 |
| `zoning_policy_road_overlay` | 7 | 2 |
| `zoning_priority_retail_overlay` | 11 | 2 |
| `zoning_queenstw_eat_overlay` | 10 | 2 |
| `zoning_rooming_house_overlay` | 10 | 2 |

### Materialized Views (1)

- `mv_monthly_permit_stats`

### Column Detail

#### `address_points` (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `address_point_id` | INTEGER | NO | - |
| `latitude` | NUMERIC(10,7) | NO | - |
| `longitude` | NUMERIC(10,7) | NO | - |
| `address_number` | TEXT | YES | - |
| `linear_name_full` | TEXT | YES | - |
| `address_full` | TEXT | YES | - |
| `lo_num` | INTEGER | YES | - |
| `hi_num` | INTEGER | YES | - |
| `maint_stage` | TEXT | YES | - |
| `address_status` | TEXT | YES | - |
| `address_class_desc` | TEXT | YES | - |
| `class_family_desc` | TEXT | YES | - |
| `place_name` | TEXT | YES | - |
| `addr_num_normalized` | TEXT | YES | - |
| `linear_name_normalized` | TEXT | YES | - |
| `geom` | USER-DEFINED | YES | - |

#### `admin_audit_log` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(admin_audit_log_id_seq) |
| `admin_uid` | UUID | NO | - |
| `action` | TEXT | NO | - |
| `target_uid` | TEXT | YES | - |
| `old_value` | JSONB | YES | - |
| `new_value` | JSONB | YES | - |
| `reason` | TEXT | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `admin_backup_codes` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | - |
| `user_id` | UUID | NO | - |
| `code_hash` | TEXT | NO | - |
| `code_salt` | TEXT | NO | - |
| `used_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `admin_watchlist` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(admin_watchlist_id_seq) |
| `admin_uid` | UUID | YES | - |
| `lead_type` | TEXT | NO | - |
| `lead_key` | TEXT | NO | - |
| `permit_num` | TEXT | YES | - |
| `revision_num` | TEXT | YES | - |
| `coa_application_number` | TEXT | YES | - |
| `address_snapshot` | TEXT | YES | - |
| `saved_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `archetype_cost_rates` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `archetype` | TEXT | NO | - |
| `cost_per_sqm` | NUMERIC(10,2) | NO | - |
| `cost_adjustment_factor` | NUMERIC(5,3) | NO | 1.000 |
| `escalation_index_base` | NUMERIC(8,3) | NO | - |
| `source` | TEXT | YES | - |
| `as_of_date` | DATE | NO | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `building_footprints` (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(building_footprints_id_seq) |
| `source_id` | CHARACTER VARYING(50) | NO | - |
| `geometry` | JSONB | NO | - |
| `footprint_area_sqm` | NUMERIC(12,2) | YES | - |
| `footprint_area_sqft` | NUMERIC(12,2) | YES | - |
| `max_height_m` | NUMERIC(8,2) | YES | - |
| `min_height_m` | NUMERIC(8,2) | YES | - |
| `elev_z` | NUMERIC(8,2) | YES | - |
| `estimated_stories` | INTEGER | YES | - |
| `centroid_lat` | NUMERIC(10,7) | YES | - |
| `centroid_lng` | NUMERIC(10,7) | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `geom` | USER-DEFINED | YES | - |

#### `coa_applications` (146 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(coa_applications_id_seq) |
| `application_number` | CHARACTER VARYING(50) | YES | - |
| `address` | CHARACTER VARYING(500) | YES | - |
| `street_num` | CHARACTER VARYING(20) | YES | - |
| `street_name` | CHARACTER VARYING(200) | YES | - |
| `ward` | CHARACTER VARYING(10) | YES | - |
| `status` | CHARACTER VARYING(50) | YES | - |
| `decision` | CHARACTER VARYING(50) | YES | - |
| `decision_date` | DATE | YES | - |
| `hearing_date` | DATE | YES | - |
| `description` | TEXT | YES | - |
| `applicant` | CHARACTER VARYING(500) | YES | - |
| `linked_permit_num` | CHARACTER VARYING(30) | YES | - |
| `linked_confidence` | NUMERIC(3,2) | YES | - |
| `data_hash` | CHARACTER VARYING(64) | YES | - |
| `first_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `sub_type` | TEXT | YES | - |
| `street_name_normalized` | CHARACTER VARYING | YES | - |
| `lifecycle_phase` | CHARACTER VARYING(10) | YES | NULL |
| `lifecycle_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `lifecycle_stalled` | BOOLEAN | NO | false |
| `lead_id` | TEXT | YES | - |
| `coa_type_class` | CHARACTER VARYING(30) | YES | - |
| `project_type` | CHARACTER VARYING(50) | YES | - |
| `scope_tags` | ARRAY | YES | - |
| `scope_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `scope_source` | CHARACTER VARYING(30) | YES | - |
| `structure_type` | CHARACTER VARYING(30) | YES | - |
| `neighbourhood_id` | BIGINT | YES | - |
| `latitude` | NUMERIC(10,7) | YES | - |
| `longitude` | NUMERIC(10,7) | YES | - |
| `modeled_gfa_sqm` | NUMERIC | YES | - |
| `estimated_cost` | NUMERIC | YES | - |
| `cost_source` | CHARACTER VARYING(30) | YES | - |
| `cost_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `lifecycle_seq` | INTEGER | YES | - |
| `lifecycle_group` | CHARACTER VARYING(10) | YES | - |
| `lifecycle_block` | CHARACTER VARYING(10) | YES | - |
| `lifecycle_stage` | CHARACTER VARYING(5) | YES | - |
| `bid_value` | NUMERIC(3,2) | YES | - |
| `parcel_linked_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `trade_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `matched_status` | TEXT | YES | - |
| `matched_rule` | SMALLINT | YES | - |
| `unmapped_status` | BOOLEAN | NO | false |
| `unmapped_decision` | BOOLEAN | NO | false |
| `zoning_class` | TEXT | YES | - |
| `bylaw_max_coverage_pct` | NUMERIC(5,2) | YES | - |
| `bylaw_max_fsi` | NUMERIC(6,3) | YES | - |
| `bylaw_max_height_m` | NUMERIC(8,2) | YES | - |
| `exception_number` | INTEGER | YES | - |
| `variance_context` | JSONB | YES | - |
| `zoning_parcel_count` | INTEGER | YES | - |
| `zoning_dominant_parcel_id` | INTEGER | YES | - |
| `zoning_dominant_parcel_method` | TEXT | YES | - |
| `zoning_enriched_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `is_in_ravine_protection_area` | BOOLEAN | NO | false |
| `ravine_distance_m` | DOUBLE PRECISION | YES | - |
| `is_heritage_designated` | BOOLEAN | NO | false |
| `heritage_designation_type` | TEXT | YES | - |
| `heritage_designation_date` | DATE | YES | - |
| `is_corner_lot` | BOOLEAN | NO | false |
| `is_through_lot` | BOOLEAN | NO | false |
| `primary_frontage_street_name` | TEXT | YES | - |
| `lot_size_sqm` | NUMERIC(12,2) | YES | - |
| `frontage_m` | NUMERIC(8,2) | YES | - |
| `depth_m` | NUMERIC(8,2) | YES | - |
| `lot_size_confidence` | TEXT | YES | - |
| `lot_size_basis` | TEXT | YES | - |
| `max_build_setback_basis` | TEXT | YES | - |
| `max_buildable_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_width_m` | NUMERIC(8,2) | YES | - |
| `max_build_length_m` | NUMERIC(8,2) | YES | - |
| `max_build_height_m` | NUMERIC(8,2) | YES | - |
| `max_build_stories` | INTEGER | YES | - |
| `max_build_basis` | TEXT | YES | - |
| `max_buildable_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_buildable_gfa_basis` | TEXT | YES | - |
| `max_build_confidence` | TEXT | YES | - |
| `max_garden_suite_gfa_sqm` | NUMERIC(8,2) | YES | - |
| `garden_suite_fits` | BOOLEAN | NO | false |
| `envelope_constrained` | BOOLEAN | NO | false |
| `envelope_constraint_reason` | TEXT | YES | - |
| `imagery_roof_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `existing_stories` | INTEGER | YES | - |
| `existing_height_m` | NUMERIC(8,2) | YES | - |
| `imagery_roof_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `existing_width_m` | NUMERIC(8,2) | YES | - |
| `existing_length_m` | NUMERIC(8,2) | YES | - |
| `existing_structure_confidence` | TEXT | YES | - |
| `existing_other_structures_count` | INTEGER | YES | - |
| `existing_other_structures_sqm` | NUMERIC(12,2) | YES | - |
| `existing_greenspace_sqm` | NUMERIC(12,2) | YES | - |
| `max_newbuild_coa_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_basement_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_storey_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_interior_reno_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_kitchen_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_bath_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_stories_basis` | TEXT | YES | - |
| `abuts_laneway` | BOOLEAN | NO | false |
| `max_garage_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `garage_capacity_cars` | INTEGER | YES | - |
| `garage_constraint_reason` | TEXT | YES | - |
| `garage_permission` | TEXT | YES | - |
| `max_laneway_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_rear_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `rear_suite_type` | TEXT | YES | - |
| `rear_suite_permission` | TEXT | YES | - |
| `cur_floor_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_2story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_3story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_gfa_range_basis` | TEXT | YES | - |
| `existing_data_quality_flag` | TEXT | YES | - |
| `max_build_stories_aggressive` | INTEGER | YES | - |
| `market_exceeds_bylaw` | BOOLEAN | NO | false |
| `neighbourhood_cost_premium` | NUMERIC(4,2) | YES | - |
| `opt_aor_storeys` | INTEGER | YES | - |
| `opt_aor_gfa_sqm` | NUMERIC | YES | - |
| `opt_aor_units` | INTEGER | YES | - |
| `opt_coa_storeys` | INTEGER | YES | - |
| `opt_coa_gfa_sqm` | NUMERIC | YES | - |
| `opt_suite_type` | TEXT | YES | - |
| `opt_suite_fits_full` | BOOLEAN | YES | - |
| `opt_binding_constraint` | TEXT | YES | - |
| `opt_config_confidence` | TEXT | YES | - |
| `comp_count` | INTEGER | YES | - |
| `comp_dominant_build` | TEXT | YES | - |
| `comp_build_ratio_p50` | NUMERIC | YES | - |
| `comp_fsi_p50` | NUMERIC | YES | - |
| `cost_fb_total` | NUMERIC(12,2) | YES | - |
| `cost_coa_total` | NUMERIC(12,2) | YES | - |
| `cost_solar_total` | NUMERIC(12,2) | YES | - |
| `cost_garden_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_laneway_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_garage_total` | NUMERIC(12,2) | YES | - |
| `cost_gut_total` | NUMERIC(12,2) | YES | - |
| `cost_addition_total` | NUMERIC(12,2) | YES | - |
| `cost_kitchen_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_bath_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_underpin_per_sqm` | NUMERIC(10,2) | YES | - |
| `max_build_fsi` | NUMERIC(6,3) | YES | - |
| `coa_fsi` | NUMERIC(6,3) | YES | - |
| `realized_fsi_p90` | NUMERIC(6,3) | YES | - |

#### `cost_estimates` (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `revision_num` | CHARACTER VARYING(10) | YES | - |
| `estimated_cost` | NUMERIC(15,2) | YES | - |
| `cost_source` | CHARACTER VARYING(30) | NO | - |
| `cost_tier` | CHARACTER VARYING(20) | YES | - |
| `cost_range_low` | NUMERIC(15,2) | YES | - |
| `cost_range_high` | NUMERIC(15,2) | YES | - |
| `premium_factor` | NUMERIC(3,2) | YES | - |
| `complexity_score` | INTEGER | YES | - |
| `model_version` | INTEGER | NO | 1 |
| `computed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `trade_contract_values` | JSONB | NO | {} |
| `is_geometric_override` | BOOLEAN | NO | false |
| `modeled_gfa_sqm` | NUMERIC | YES | - |
| `effective_area_sqm` | NUMERIC(12,2) | YES | - |
| `lead_id` | TEXT | NO | - |

#### `data_quality_snapshots` (73 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(data_quality_snapshots_id_seq) |
| `snapshot_date` | DATE | NO | CURRENT_DATE |
| `total_permits` | INTEGER | NO | - |
| `active_permits` | INTEGER | NO | - |
| `permits_with_trades` | INTEGER | NO | - |
| `trade_matches_total` | INTEGER | NO | - |
| `trade_avg_confidence` | NUMERIC(4,3) | YES | - |
| `trade_tier1_count` | INTEGER | NO | - |
| `trade_tier2_count` | INTEGER | NO | - |
| `trade_tier3_count` | INTEGER | NO | - |
| `permits_with_builder` | INTEGER | NO | - |
| `builders_total` | INTEGER | NO | - |
| `builders_enriched` | INTEGER | NO | - |
| `builders_with_phone` | INTEGER | NO | - |
| `builders_with_email` | INTEGER | NO | - |
| `builders_with_website` | INTEGER | NO | - |
| `builders_with_google` | INTEGER | NO | - |
| `builders_with_wsib` | INTEGER | NO | - |
| `permits_with_parcel` | INTEGER | NO | - |
| `parcel_exact_matches` | INTEGER | NO | - |
| `parcel_name_matches` | INTEGER | NO | - |
| `parcel_avg_confidence` | NUMERIC(4,3) | YES | - |
| `permits_with_neighbourhood` | INTEGER | NO | - |
| `permits_geocoded` | INTEGER | NO | - |
| `coa_total` | INTEGER | NO | - |
| `coa_linked` | INTEGER | NO | - |
| `coa_avg_confidence` | NUMERIC(4,3) | YES | - |
| `coa_high_confidence` | INTEGER | NO | - |
| `coa_low_confidence` | INTEGER | NO | - |
| `permits_updated_24h` | INTEGER | NO | - |
| `permits_updated_7d` | INTEGER | NO | - |
| `permits_updated_30d` | INTEGER | NO | - |
| `last_sync_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `last_sync_status` | CHARACTER VARYING(20) | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | YES | now() |
| `parcel_spatial_matches` | INTEGER | YES | 0 |
| `permits_with_scope` | INTEGER | YES | 0 |
| `scope_project_type_breakdown` | JSONB | YES | - |
| `building_footprints_total` | INTEGER | NO | 0 |
| `parcels_with_buildings` | INTEGER | NO | 0 |
| `permits_with_scope_tags` | INTEGER | YES | 0 |
| `scope_tags_top` | JSONB | YES | - |
| `permits_with_detailed_tags` | INTEGER | YES | 0 |
| `trade_residential_classified` | INTEGER | YES | 0 |
| `trade_residential_total` | INTEGER | YES | 0 |
| `trade_commercial_classified` | INTEGER | YES | 0 |
| `trade_commercial_total` | INTEGER | YES | 0 |
| `null_description_count` | INTEGER | YES | 0 |
| `null_builder_name_count` | INTEGER | YES | 0 |
| `null_est_const_cost_count` | INTEGER | YES | 0 |
| `null_street_num_count` | INTEGER | YES | 0 |
| `null_street_name_count` | INTEGER | YES | 0 |
| `null_geo_id_count` | INTEGER | YES | 0 |
| `violation_cost_out_of_range` | INTEGER | YES | 0 |
| `violation_future_issued_date` | INTEGER | YES | 0 |
| `violation_missing_status` | INTEGER | YES | 0 |
| `violations_total` | INTEGER | YES | 0 |
| `schema_column_counts` | JSONB | YES | - |
| `sla_permits_ingestion_hours` | NUMERIC(8,2) | YES | NULL |
| `inspections_total` | INTEGER | YES | 0 |
| `inspections_permits_scraped` | INTEGER | YES | 0 |
| `inspections_outstanding_count` | INTEGER | YES | 0 |
| `inspections_passed_count` | INTEGER | YES | 0 |
| `inspections_not_passed_count` | INTEGER | YES | 0 |
| `cost_estimates_total` | INTEGER | YES | - |
| `cost_estimates_from_permit` | INTEGER | YES | - |
| `cost_estimates_from_model` | INTEGER | YES | - |
| `cost_estimates_null_cost` | INTEGER | YES | - |
| `timing_calibration_total` | INTEGER | YES | - |
| `timing_calibration_avg_sample` | INTEGER | YES | - |
| `timing_calibration_freshness_hours` | NUMERIC(6,1) | YES | - |
| `cost_estimates_liar_gate_overrides` | INTEGER | YES | - |
| `cost_estimates_zero_total_bypass` | INTEGER | YES | - |

#### `device_tokens` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(device_tokens_id_seq) |
| `user_id` | UUID | NO | - |
| `push_token` | TEXT | NO | - |
| `platform` | CHARACTER VARYING(10) | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `engine_health_snapshots` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(engine_health_snapshots_id_seq) |
| `table_name` | TEXT | NO | - |
| `snapshot_date` | DATE | NO | CURRENT_DATE |
| `n_live_tup` | BIGINT | NO | 0 |
| `n_dead_tup` | BIGINT | NO | 0 |
| `dead_ratio` | NUMERIC(6,4) | NO | 0 |
| `seq_scan` | BIGINT | NO | 0 |
| `idx_scan` | BIGINT | NO | 0 |
| `seq_ratio` | NUMERIC(6,4) | NO | 0 |
| `captured_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `entities` (19 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(entities_id_seq) |
| `legal_name` | CHARACTER VARYING(500) | NO | - |
| `trade_name` | CHARACTER VARYING(500) | YES | - |
| `name_normalized` | CHARACTER VARYING(750) | NO | - |
| `entity_type` | USER-DEFINED | YES | - |
| `primary_phone` | CHARACTER VARYING(50) | YES | - |
| `primary_email` | CHARACTER VARYING(200) | YES | - |
| `website` | CHARACTER VARYING(500) | YES | - |
| `linkedin_url` | CHARACTER VARYING(500) | YES | - |
| `google_place_id` | CHARACTER VARYING(200) | YES | - |
| `google_rating` | NUMERIC(2,1) | YES | - |
| `google_review_count` | INTEGER | YES | - |
| `is_wsib_registered` | BOOLEAN | YES | false |
| `permit_count` | INTEGER | NO | 0 |
| `first_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_enriched_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `photo_url` | CHARACTER VARYING(500) | YES | - |
| `photo_validated_at` | TIMESTAMP WITH TIME ZONE | YES | - |

#### `entitlements` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `user_id` | UUID | NO | - |
| `product` | TEXT | NO | - |
| `status` | TEXT | NO | - |
| `stripe_subscription_id` | TEXT | YES | - |
| `current_period_end` | TIMESTAMP WITH TIME ZONE | YES | - |
| `trial_started_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `last_stripe_event_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `entity_contacts` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(entity_contacts_id_seq) |
| `entity_id` | INTEGER | NO | - |
| `contact_type` | CHARACTER VARYING(20) | YES | - |
| `contact_value` | CHARACTER VARYING(500) | YES | - |
| `source` | CHARACTER VARYING(50) | NO | user |
| `contributed_by` | CHARACTER VARYING(100) | YES | - |
| `verified` | BOOLEAN | NO | false |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `entity_projects` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(entity_projects_id_seq) |
| `entity_id` | INTEGER | NO | - |
| `permit_num` | CHARACTER VARYING(50) | YES | - |
| `revision_num` | CHARACTER VARYING(10) | YES | - |
| `coa_file_num` | CHARACTER VARYING(50) | YES | - |
| `role` | USER-DEFINED | NO | - |
| `observed_at` | TIMESTAMP WITH TIME ZONE | YES | now() |

#### `heritage_districts` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(heritage_districts_id_seq) |
| `source_id` | BIGINT | NO | - |
| `name` | TEXT | NO | - |
| `hcd_type` | TEXT | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `designated_date` | DATE | YES | - |
| `bylaw_no` | TEXT | YES | - |
| `wards` | TEXT | YES | - |
| `source_dataset_version` | TEXT | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `heritage_properties` (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(heritage_properties_id_seq) |
| `source_id` | BIGINT | NO | - |
| `status` | TEXT | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `designated_date` | DATE | YES | - |
| `bylaw_no` | TEXT | YES | - |
| `htg_conser_name` | TEXT | YES | - |
| `building_type` | TEXT | YES | - |
| `reason` | TEXT | YES | - |
| `address_text` | TEXT | NO | - |
| `construction_year` | INTEGER | YES | - |
| `source_dataset_version` | TEXT | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `inspection_stage_map` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(inspection_stage_map_id_seq) |
| `stage_name` | TEXT | NO | - |
| `stage_sequence` | INTEGER | NO | - |
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `relationship` | CHARACTER VARYING(20) | NO | - |
| `min_lag_days` | INTEGER | NO | - |
| `max_lag_days` | INTEGER | NO | - |
| `precedence` | INTEGER | NO | 100 |

#### `lead_analytics` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `lead_key` | CHARACTER VARYING(100) | NO | - |
| `tracking_count` | INTEGER | NO | 0 |
| `saving_count` | INTEGER | NO | 0 |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `lead_id` | TEXT | NO | - |

#### `lead_parcels` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `lead_id` | TEXT | NO | - |
| `parcel_id` | INTEGER | NO | - |
| `match_type` | CHARACTER VARYING(20) | NO | - |
| `confidence` | NUMERIC(3,2) | NO | - |
| `matched_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `lead_products` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(lead_products_id_seq) |
| `lead_id` | TEXT | NO | - |
| `product_id` | INTEGER | NO | - |
| `confidence` | NUMERIC(3,2) | YES | - |
| `classified_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `lead_trades` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(lead_trades_id_seq) |
| `lead_id` | TEXT | NO | - |
| `trade_id` | INTEGER | NO | - |
| `tier` | INTEGER | YES | - |
| `confidence` | NUMERIC(3,2) | YES | - |
| `is_active` | BOOLEAN | NO | true |
| `phase` | CHARACTER VARYING(20) | YES | - |
| `lead_score` | INTEGER | NO | 0 |
| `classified_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `attachment_basis` | TEXT | YES | - |

#### `lead_view_events` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `user_id` | UUID | NO | - |
| `permit_num` | TEXT | NO | - |
| `revision_num` | TEXT | NO | - |
| `viewed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `lead_views` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(lead_views_id_seq) |
| `user_id` | UUID | NO | - |
| `lead_key` | CHARACTER VARYING(100) | NO | - |
| `lead_type` | CHARACTER VARYING(20) | NO | - |
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `revision_num` | CHARACTER VARYING(10) | YES | - |
| `entity_id` | INTEGER | YES | - |
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `viewed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `saved` | BOOLEAN | NO | false |
| `saved_at` | TIMESTAMP WITH TIME ZONE | YES | - |

#### `lifecycle_status_history` (17 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(lifecycle_status_history_id_seq) |
| `lead_id` | TEXT | NO | - |
| `from_status` | CHARACTER VARYING(60) | YES | - |
| `to_status` | CHARACTER VARYING(60) | NO | - |
| `from_seq` | INTEGER | YES | - |
| `to_seq` | INTEGER | YES | - |
| `from_phase` | CHARACTER VARYING(20) | YES | - |
| `to_phase` | CHARACTER VARYING(20) | YES | - |
| `decision` | CHARACTER VARYING(60) | YES | - |
| `decision_date` | DATE | YES | - |
| `transitioned_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `detected_by` | CHARACTER VARYING(60) | NO | - |
| `permit_type` | CHARACTER VARYING(50) | YES | - |
| `project_type` | CHARACTER VARYING(50) | YES | - |
| `coa_type_class` | CHARACTER VARYING(30) | YES | - |
| `neighbourhood_id` | BIGINT | YES | - |
| `event_date` | DATE | YES | - |

#### `lifecycle_transitions` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(lifecycle_transitions_id_seq) |
| `lead_id` | TEXT | NO | - |
| `from_phase` | CHARACTER VARYING(20) | YES | - |
| `to_phase` | CHARACTER VARYING(20) | NO | - |
| `from_seq` | INTEGER | YES | - |
| `to_seq` | INTEGER | YES | - |
| `transitioned_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `permit_type` | CHARACTER VARYING(50) | YES | - |
| `project_type` | CHARACTER VARYING(50) | YES | - |
| `coa_type_class` | CHARACTER VARYING(30) | YES | - |
| `neighbourhood_id` | BIGINT | YES | - |

#### `logic_variables` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `variable_key` | CHARACTER VARYING(100) | NO | - |
| `variable_value` | NUMERIC | YES | - |
| `description` | TEXT | YES | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `variable_value_json` | JSONB | YES | - |

#### `neighbourhood_build_norms` (30 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(neighbourhood_build_norms_id_seq) |
| `neighbourhood_id` | INTEGER | YES | - |
| `window_start` | DATE | YES | - |
| `window_end` | DATE | YES | - |
| `new_builds_5yr` | INTEGER | NO | 0 |
| `additions_5yr` | INTEGER | NO | 0 |
| `renos_5yr` | INTEGER | NO | 0 |
| `suites_5yr` | INTEGER | NO | 0 |
| `demos_5yr` | INTEGER | NO | 0 |
| `realized_fsi_p50` | NUMERIC | YES | - |
| `realized_fsi_p90` | NUMERIC | YES | - |
| `realized_coverage_p50` | NUMERIC | YES | - |
| `realized_coverage_p90` | NUMERIC | YES | - |
| `build_ratio_p50` | NUMERIC | YES | - |
| `existing_build_ratio_p25` | NUMERIC | YES | - |
| `existing_build_ratio_p50` | NUMERIC | YES | - |
| `reno_kitchen_pct` | NUMERIC | YES | - |
| `reno_bath_pct` | NUMERIC | YES | - |
| `storeys_p50` | INTEGER | YES | - |
| `storeys_p90` | INTEGER | YES | - |
| `coa_approved` | INTEGER | NO | 0 |
| `coa_refused` | INTEGER | NO | 0 |
| `coa_total` | INTEGER | NO | 0 |
| `coa_approval_rate` | NUMERIC | YES | - |
| `reno_mix` | JSONB | YES | - |
| `sample_n` | INTEGER | NO | 0 |
| `low_sample` | BOOLEAN | NO | false |
| `data_provenance` | TEXT | NO | market_realized_5yr |
| `computed_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `structure_family` | TEXT | NO | all |

#### `neighbourhood_storey_norms` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(neighbourhood_storey_norms_id_seq) |
| `neighbourhood_id` | INTEGER | YES | - |
| `storeys_p50` | INTEGER | YES | - |
| `storeys_p90` | INTEGER | YES | - |
| `sample_count` | INTEGER | NO | - |
| `low_sample` | BOOLEAN | NO | false |
| `data_provenance` | TEXT | NO | market_realized_new_builds |
| `computed_at` | TIMESTAMP WITH TIME ZONE | YES | - |

#### `neighbourhoods` (22 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(neighbourhoods_id_seq) |
| `neighbourhood_id` | INTEGER | NO | - |
| `name` | CHARACTER VARYING(100) | NO | - |
| `geometry` | JSONB | YES | - |
| `avg_household_income` | INTEGER | YES | - |
| `median_household_income` | INTEGER | YES | - |
| `avg_individual_income` | INTEGER | YES | - |
| `low_income_pct` | NUMERIC(5,2) | YES | - |
| `tenure_owner_pct` | NUMERIC(5,2) | YES | - |
| `tenure_renter_pct` | NUMERIC(5,2) | YES | - |
| `period_of_construction` | CHARACTER VARYING(50) | YES | - |
| `couples_pct` | NUMERIC(5,2) | YES | - |
| `lone_parent_pct` | NUMERIC(5,2) | YES | - |
| `married_pct` | NUMERIC(5,2) | YES | - |
| `university_degree_pct` | NUMERIC(5,2) | YES | - |
| `immigrant_pct` | NUMERIC(5,2) | YES | - |
| `visible_minority_pct` | NUMERIC(5,2) | YES | - |
| `english_knowledge_pct` | NUMERIC(5,2) | YES | - |
| `top_mother_tongue` | CHARACTER VARYING(50) | YES | - |
| `census_year` | INTEGER | YES | 2021 |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `geom` | USER-DEFINED | YES | - |

#### `notification_dispatches` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(notification_dispatches_id_seq) |
| `user_id` | UUID | NO | - |
| `lead_id` | CHARACTER VARYING(120) | NO | - |
| `type` | CHARACTER VARYING(50) | NO | - |
| `toronto_date` | DATE | NO | - |
| `push_token` | CHARACTER VARYING(200) | YES | - |
| `expo_ticket_id` | CHARACTER VARYING(200) | YES | - |
| `status` | CHARACTER VARYING(20) | NO | sent |
| `detail` | TEXT | YES | - |
| `dispatched_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `receipt_checked_at` | TIMESTAMP WITH TIME ZONE | YES | - |

#### `notifications` (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(notifications_id_seq) |
| `user_id` | UUID | NO | - |
| `type` | CHARACTER VARYING(50) | NO | - |
| `title` | CHARACTER VARYING(200) | YES | - |
| `body` | TEXT | YES | - |
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `trade_slug` | CHARACTER VARYING(50) | YES | - |
| `channel` | CHARACTER VARYING(20) | NO | in_app |
| `is_read` | BOOLEAN | NO | false |
| `is_sent` | BOOLEAN | NO | false |
| `sent_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `lead_id` | CHARACTER VARYING(120) | YES | - |

#### `parcel_address_points` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `parcel_id` | INTEGER | NO | - |
| `address_point_id` | INTEGER | NO | - |
| `computed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `parcel_buildings` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(parcel_buildings_id_seq) |
| `parcel_id` | INTEGER | NO | - |
| `building_id` | INTEGER | NO | - |
| `is_primary` | BOOLEAN | NO | false |
| `structure_type` | CHARACTER VARYING(20) | NO | other |
| `linked_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `match_type` | CHARACTER VARYING(30) | NO | polygon |
| `confidence` | NUMERIC(3,2) | NO | 0.85 |

#### `parcels` (158 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(parcels_id_seq) |
| `parcel_id` | CHARACTER VARYING(20) | NO | - |
| `feature_type` | CHARACTER VARYING(20) | YES | - |
| `address_number` | CHARACTER VARYING(20) | YES | - |
| `linear_name_full` | CHARACTER VARYING(200) | YES | - |
| `addr_num_normalized` | CHARACTER VARYING(20) | YES | - |
| `street_name_normalized` | CHARACTER VARYING(200) | YES | - |
| `street_type_normalized` | CHARACTER VARYING(20) | YES | - |
| `stated_area_raw` | CHARACTER VARYING(100) | YES | - |
| `lot_size_sqm` | NUMERIC(12,2) | YES | - |
| `lot_size_sqft` | NUMERIC(12,2) | YES | - |
| `frontage_m` | NUMERIC(8,2) | YES | - |
| `frontage_ft` | NUMERIC(8,2) | YES | - |
| `depth_m` | NUMERIC(8,2) | YES | - |
| `depth_ft` | NUMERIC(8,2) | YES | - |
| `geometry` | JSONB | YES | - |
| `date_effective` | DATE | YES | - |
| `date_expiry` | DATE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `centroid_lat` | NUMERIC(10,7) | YES | - |
| `centroid_lng` | NUMERIC(10,7) | YES | - |
| `is_irregular` | BOOLEAN | YES | false |
| `geom` | USER-DEFINED | YES | - |
| `zoning_class` | TEXT | YES | - |
| `zoning_zn_string` | TEXT | YES | - |
| `zoning_gen_zone` | INTEGER | YES | - |
| `zoning_holding` | TEXT | YES | - |
| `zone_status` | INTEGER | YES | - |
| `bylaw_max_fsi` | NUMERIC(6,3) | YES | - |
| `bylaw_max_coverage_pct` | NUMERIC(5,2) | YES | - |
| `bylaw_max_height_m` | NUMERIC(8,2) | YES | - |
| `bylaw_max_stories` | INTEGER | YES | - |
| `bylaw_max_units` | INTEGER | YES | - |
| `bylaw_max_density` | NUMERIC(10,2) | YES | - |
| `bylaw_min_frontage_m` | NUMERIC(8,2) | YES | - |
| `bylaw_min_area_sqm` | INTEGER | YES | - |
| `bylaw_standard_setback_m` | NUMERIC(8,2) | YES | - |
| `bylaw_pct_commercial_max` | NUMERIC(5,2) | YES | - |
| `bylaw_pct_residential_max` | NUMERIC(5,2) | YES | - |
| `bylaw_pct_employment_max` | NUMERIC(5,2) | YES | - |
| `bylaw_pct_office_max` | NUMERIC(5,2) | YES | - |
| `exception_number` | INTEGER | YES | - |
| `exception_text` | TEXT | YES | - |
| `bylaw_chapter` | TEXT | YES | - |
| `bylaw_section` | TEXT | YES | - |
| `bylaw_exception_ref` | TEXT | YES | - |
| `in_policy_area` | BOOLEAN | YES | - |
| `on_policy_road` | BOOLEAN | YES | - |
| `in_rooming_house_overlay` | BOOLEAN | YES | - |
| `in_parking_zone_overlay` | BOOLEAN | YES | - |
| `in_building_setback_overlay` | BOOLEAN | YES | - |
| `on_priority_retail` | BOOLEAN | YES | - |
| `in_queenstw_eat_overlay` | BOOLEAN | YES | - |
| `zoning_overlays` | JSONB | YES | - |
| `zoning_base_source_id` | INTEGER | YES | - |
| `zoning_dominant_area_share` | NUMERIC(5,4) | YES | - |
| `zoning_is_ambiguous` | BOOLEAN | YES | - |
| `zoning_base_source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `zoning_enriched_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `is_in_ravine_protection_area` | BOOLEAN | NO | false |
| `ravine_distance_m` | DOUBLE PRECISION | YES | - |
| `ravine_dataset_version_when_enriched` | TEXT | YES | - |
| `is_heritage_designated` | BOOLEAN | NO | false |
| `heritage_designation_type` | TEXT | YES | - |
| `heritage_designation_date` | DATE | YES | - |
| `heritage_dataset_version_when_enriched` | TEXT | YES | - |
| `is_corner_lot` | BOOLEAN | NO | false |
| `is_through_lot` | BOOLEAN | NO | false |
| `primary_frontage_street_name` | TEXT | YES | - |
| `centreline_dataset_version_when_enriched` | TEXT | YES | - |
| `lot_size_confidence` | TEXT | YES | - |
| `lot_size_basis` | TEXT | YES | - |
| `max_build_setback_basis` | TEXT | YES | - |
| `max_buildable_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_width_m` | NUMERIC(8,2) | YES | - |
| `max_build_length_m` | NUMERIC(8,2) | YES | - |
| `max_build_height_m` | NUMERIC(8,2) | YES | - |
| `max_build_stories` | INTEGER | YES | - |
| `max_build_basis` | TEXT | YES | - |
| `max_buildable_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_buildable_gfa_basis` | TEXT | YES | - |
| `max_build_confidence` | TEXT | YES | - |
| `max_garden_suite_gfa_sqm` | NUMERIC(8,2) | YES | - |
| `garden_suite_fits` | BOOLEAN | NO | false |
| `envelope_constrained` | BOOLEAN | NO | false |
| `envelope_constraint_reason` | TEXT | YES | - |
| `imagery_roof_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `existing_stories` | INTEGER | YES | - |
| `existing_height_m` | NUMERIC(8,2) | YES | - |
| `imagery_roof_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `existing_width_m` | NUMERIC(8,2) | YES | - |
| `existing_length_m` | NUMERIC(8,2) | YES | - |
| `existing_structure_confidence` | TEXT | YES | - |
| `existing_other_structures_count` | INTEGER | YES | - |
| `existing_other_structures_sqm` | NUMERIC(12,2) | YES | - |
| `existing_greenspace_sqm` | NUMERIC(12,2) | YES | - |
| `max_newbuild_coa_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_basement_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_storey_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_interior_reno_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_kitchen_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_bath_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_stories_basis` | TEXT | YES | - |
| `abuts_laneway` | BOOLEAN | NO | false |
| `max_garage_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `garage_capacity_cars` | INTEGER | YES | - |
| `garage_constraint_reason` | TEXT | YES | - |
| `garage_permission` | TEXT | YES | - |
| `max_laneway_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_rear_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `rear_suite_type` | TEXT | YES | - |
| `rear_suite_permission` | TEXT | YES | - |
| `cur_floor_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_2story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_3story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_gfa_range_basis` | TEXT | YES | - |
| `existing_data_quality_flag` | TEXT | YES | - |
| `max_build_stories_aggressive` | INTEGER | YES | - |
| `market_exceeds_bylaw` | BOOLEAN | NO | false |
| `neighbourhood_id` | INTEGER | YES | - |
| `neighbourhood_cost_premium` | NUMERIC(4,2) | YES | - |
| `opt_aor_storeys` | INTEGER | YES | - |
| `opt_aor_gfa_sqm` | NUMERIC | YES | - |
| `opt_aor_units` | INTEGER | YES | - |
| `opt_coa_storeys` | INTEGER | YES | - |
| `opt_coa_gfa_sqm` | NUMERIC | YES | - |
| `opt_suite_type` | TEXT | YES | - |
| `opt_suite_fits_full` | BOOLEAN | YES | - |
| `opt_binding_constraint` | TEXT | YES | - |
| `opt_config_confidence` | TEXT | YES | - |
| `optimal_config` | JSONB | YES | - |
| `nearby_builds_summary` | JSONB | YES | - |
| `comparable_builds` | JSONB | YES | - |
| `comp_count` | INTEGER | YES | - |
| `comp_dominant_build` | TEXT | YES | - |
| `comp_build_ratio_p50` | NUMERIC | YES | - |
| `comp_fsi_p50` | NUMERIC | YES | - |
| `cur_gfa_low_sqm` | NUMERIC | YES | - |
| `cur_gfa_high_sqm` | NUMERIC | YES | - |
| `cur_storeys_range` | TEXT | YES | - |
| `cur_gfa_band_basis` | TEXT | YES | - |
| `parcel_cost_menu` | JSONB | YES | - |
| `cost_fb_total` | NUMERIC(12,2) | YES | - |
| `cost_coa_total` | NUMERIC(12,2) | YES | - |
| `cost_solar_total` | NUMERIC(12,2) | YES | - |
| `cost_garden_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_laneway_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_garage_total` | NUMERIC(12,2) | YES | - |
| `cost_gut_total` | NUMERIC(12,2) | YES | - |
| `cost_addition_total` | NUMERIC(12,2) | YES | - |
| `cost_kitchen_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_bath_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_underpin_per_sqm` | NUMERIC(10,2) | YES | - |
| `max_build_fsi` | NUMERIC(6,3) | YES | - |
| `coa_fsi` | NUMERIC(6,3) | YES | - |
| `realized_fsi_p90` | NUMERIC(6,3) | YES | - |
| `lot_size_source` | TEXT | YES | - |

#### `permit_history` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_history_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `sync_run_id` | INTEGER | YES | - |
| `field_name` | CHARACTER VARYING(100) | NO | - |
| `old_value` | TEXT | YES | - |
| `new_value` | TEXT | YES | - |
| `changed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permit_inspections` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_inspections_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `stage_name` | TEXT | NO | - |
| `status` | CHARACTER VARYING(20) | NO | - |
| `inspection_date` | DATE | YES | - |
| `scraped_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permit_parcels` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_parcels_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `parcel_id` | INTEGER | NO | - |
| `match_type` | CHARACTER VARYING(30) | NO | - |
| `confidence` | NUMERIC(3,2) | NO | - |
| `linked_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permit_phase_transitions` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_phase_transitions_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `from_phase` | CHARACTER VARYING(10) | YES | - |
| `to_phase` | CHARACTER VARYING(10) | NO | - |
| `transitioned_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `permit_type` | CHARACTER VARYING(100) | YES | - |
| `neighbourhood_id` | INTEGER | YES | - |

#### `permit_products` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `product_id` | INTEGER | NO | - |
| `product_slug` | CHARACTER VARYING(50) | NO | - |
| `product_name` | CHARACTER VARYING(100) | NO | - |
| `confidence` | NUMERIC(3,2) | NO | 0.75 |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permit_scrape_outcome_rollup` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `outcome` | TEXT | NO | - |
| `transport` | TEXT | NO | - |
| `occurrences` | BIGINT | NO | 0 |
| `first_at` | TIMESTAMP WITH TIME ZONE | NO | - |
| `last_at` | TIMESTAMP WITH TIME ZONE | NO | - |

#### `permit_scrape_outcomes` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | - |
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `year_seq` | CHARACTER VARYING(30) | YES | - |
| `outcome` | TEXT | NO | - |
| `detail` | CHARACTER VARYING(500) | YES | - |
| `transport` | TEXT | NO | - |
| `run_id` | TEXT | YES | - |
| `observed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permit_trades` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_trades_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `trade_id` | INTEGER | NO | - |
| `tier` | INTEGER | YES | - |
| `confidence` | NUMERIC(3,2) | YES | - |
| `is_active` | BOOLEAN | NO | true |
| `phase` | CHARACTER VARYING(20) | YES | - |
| `lead_score` | INTEGER | NO | 0 |
| `classified_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `attachment_basis` | TEXT | YES | - |

#### `permit_type_classifications` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_type` | TEXT | NO | - |
| `class` | USER-DEFINED | NO | unclassified |
| `notes` | TEXT | YES | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `permits` (171 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `permit_type` | CHARACTER VARYING(100) | YES | - |
| `structure_type` | CHARACTER VARYING(100) | YES | - |
| `work` | CHARACTER VARYING(200) | YES | - |
| `street_num` | CHARACTER VARYING(20) | YES | - |
| `street_name` | CHARACTER VARYING(200) | YES | - |
| `street_type` | CHARACTER VARYING(20) | YES | - |
| `street_direction` | CHARACTER VARYING(10) | YES | - |
| `city` | CHARACTER VARYING(100) | YES | - |
| `postal` | CHARACTER VARYING(10) | YES | - |
| `geo_id` | CHARACTER VARYING(30) | YES | - |
| `building_type` | CHARACTER VARYING(100) | YES | - |
| `category` | CHARACTER VARYING(100) | YES | - |
| `application_date` | DATE | YES | - |
| `issued_date` | DATE | YES | - |
| `completed_date` | DATE | YES | - |
| `status` | CHARACTER VARYING(50) | YES | - |
| `description` | TEXT | YES | - |
| `est_const_cost` | NUMERIC(15,2) | YES | - |
| `builder_name` | CHARACTER VARYING(500) | YES | - |
| `owner` | CHARACTER VARYING(500) | YES | - |
| `dwelling_units_created` | INTEGER | YES | - |
| `dwelling_units_lost` | INTEGER | YES | - |
| `ward` | CHARACTER VARYING(20) | YES | - |
| `council_district` | CHARACTER VARYING(50) | YES | - |
| `current_use` | CHARACTER VARYING(200) | YES | - |
| `proposed_use` | CHARACTER VARYING(200) | YES | - |
| `housing_units` | INTEGER | YES | - |
| `storeys` | INTEGER | YES | - |
| `latitude` | NUMERIC(10,7) | YES | - |
| `longitude` | NUMERIC(10,7) | YES | - |
| `geocoded_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `data_hash` | CHARACTER VARYING(64) | YES | - |
| `first_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `raw_json` | JSONB | YES | - |
| `neighbourhood_id` | INTEGER | YES | - |
| `project_type` | CHARACTER VARYING(20) | YES | - |
| `scope_tags` | ARRAY | YES | - |
| `scope_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `scope_source` | CHARACTER VARYING(20) | YES | classified |
| `enriched_status` | CHARACTER VARYING(30) | YES | NULL |
| `street_name_normalized` | CHARACTER VARYING | YES | - |
| `last_scraped_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `trade_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `parcel_linked_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `location` | USER-DEFINED | YES | - |
| `photo_url` | TEXT | YES | - |
| `lifecycle_phase` | CHARACTER VARYING(10) | YES | NULL |
| `lifecycle_stalled` | BOOLEAN | NO | false |
| `lifecycle_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `phase_started_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `lead_id` | TEXT | YES | - |
| `linked_coa_application_number` | CHARACTER VARYING(50) | YES | - |
| `lifecycle_seq` | INTEGER | YES | - |
| `lifecycle_group` | CHARACTER VARYING(10) | YES | - |
| `lifecycle_block` | CHARACTER VARYING(10) | YES | - |
| `lifecycle_stage` | CHARACTER VARYING(5) | YES | - |
| `bid_value` | NUMERIC(3,2) | YES | - |
| `matched_status` | TEXT | YES | - |
| `matched_rule` | SMALLINT | YES | - |
| `unmapped_status` | BOOLEAN | NO | false |
| `zoning_class` | TEXT | YES | - |
| `bylaw_max_coverage_pct` | NUMERIC(5,2) | YES | - |
| `bylaw_max_fsi` | NUMERIC(6,3) | YES | - |
| `bylaw_max_height_m` | NUMERIC(8,2) | YES | - |
| `exception_number` | INTEGER | YES | - |
| `applicable_bylaws` | JSONB | YES | - |
| `overlay_summary` | JSONB | YES | - |
| `zoning_parcel_count` | INTEGER | YES | - |
| `zoning_dominant_parcel_id` | INTEGER | YES | - |
| `zoning_dominant_parcel_method` | TEXT | YES | - |
| `zoning_enriched_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `is_in_ravine_protection_area` | BOOLEAN | NO | false |
| `ravine_distance_m` | DOUBLE PRECISION | YES | - |
| `is_heritage_designated` | BOOLEAN | NO | false |
| `heritage_designation_type` | TEXT | YES | - |
| `heritage_designation_date` | DATE | YES | - |
| `is_corner_lot` | BOOLEAN | NO | false |
| `is_through_lot` | BOOLEAN | NO | false |
| `primary_frontage_street_name` | TEXT | YES | - |
| `lot_size_sqm` | NUMERIC(12,2) | YES | - |
| `frontage_m` | NUMERIC(8,2) | YES | - |
| `depth_m` | NUMERIC(8,2) | YES | - |
| `lot_size_confidence` | TEXT | YES | - |
| `lot_size_basis` | TEXT | YES | - |
| `max_build_setback_basis` | TEXT | YES | - |
| `max_buildable_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_width_m` | NUMERIC(8,2) | YES | - |
| `max_build_length_m` | NUMERIC(8,2) | YES | - |
| `max_build_height_m` | NUMERIC(8,2) | YES | - |
| `max_build_stories` | INTEGER | YES | - |
| `max_build_basis` | TEXT | YES | - |
| `max_buildable_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_buildable_gfa_basis` | TEXT | YES | - |
| `max_build_confidence` | TEXT | YES | - |
| `max_garden_suite_gfa_sqm` | NUMERIC(8,2) | YES | - |
| `garden_suite_fits` | BOOLEAN | NO | false |
| `envelope_constrained` | BOOLEAN | NO | false |
| `envelope_constraint_reason` | TEXT | YES | - |
| `imagery_roof_footprint_sqm` | NUMERIC(12,2) | YES | - |
| `existing_stories` | INTEGER | YES | - |
| `existing_height_m` | NUMERIC(8,2) | YES | - |
| `imagery_roof_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `existing_width_m` | NUMERIC(8,2) | YES | - |
| `existing_length_m` | NUMERIC(8,2) | YES | - |
| `existing_structure_confidence` | TEXT | YES | - |
| `existing_other_structures_count` | INTEGER | YES | - |
| `existing_other_structures_sqm` | NUMERIC(12,2) | YES | - |
| `existing_greenspace_sqm` | NUMERIC(12,2) | YES | - |
| `max_newbuild_coa_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_basement_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_storey_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_interior_reno_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_kitchen_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_est_bath_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_build_stories_basis` | TEXT | YES | - |
| `abuts_laneway` | BOOLEAN | NO | false |
| `max_garage_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `garage_capacity_cars` | INTEGER | YES | - |
| `garage_constraint_reason` | TEXT | YES | - |
| `garage_permission` | TEXT | YES | - |
| `max_laneway_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `max_rear_suite_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `rear_suite_type` | TEXT | YES | - |
| `rear_suite_permission` | TEXT | YES | - |
| `cur_floor_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_2story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_pot_3story_gfa_sqm` | NUMERIC(12,2) | YES | - |
| `cur_gfa_range_basis` | TEXT | YES | - |
| `existing_data_quality_flag` | TEXT | YES | - |
| `max_build_stories_aggressive` | INTEGER | YES | - |
| `market_exceeds_bylaw` | BOOLEAN | NO | false |
| `neighbourhood_cost_premium` | NUMERIC(4,2) | YES | - |
| `residential_sqm` | NUMERIC | YES | - |
| `interior_alterations_sqm` | NUMERIC | YES | - |
| `assembly_sqm` | NUMERIC | YES | - |
| `institutional_sqm` | NUMERIC | YES | - |
| `mercantile_sqm` | NUMERIC | YES | - |
| `industrial_sqm` | NUMERIC | YES | - |
| `business_personal_services_sqm` | NUMERIC | YES | - |
| `opt_aor_storeys` | INTEGER | YES | - |
| `opt_aor_gfa_sqm` | NUMERIC | YES | - |
| `opt_aor_units` | INTEGER | YES | - |
| `opt_coa_storeys` | INTEGER | YES | - |
| `opt_coa_gfa_sqm` | NUMERIC | YES | - |
| `opt_suite_type` | TEXT | YES | - |
| `opt_suite_fits_full` | BOOLEAN | YES | - |
| `opt_binding_constraint` | TEXT | YES | - |
| `opt_config_confidence` | TEXT | YES | - |
| `comp_count` | INTEGER | YES | - |
| `comp_dominant_build` | TEXT | YES | - |
| `comp_build_ratio_p50` | NUMERIC | YES | - |
| `comp_fsi_p50` | NUMERIC | YES | - |
| `cost_fb_total` | NUMERIC(12,2) | YES | - |
| `cost_coa_total` | NUMERIC(12,2) | YES | - |
| `cost_solar_total` | NUMERIC(12,2) | YES | - |
| `cost_garden_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_laneway_suite_total` | NUMERIC(12,2) | YES | - |
| `cost_garage_total` | NUMERIC(12,2) | YES | - |
| `cost_gut_total` | NUMERIC(12,2) | YES | - |
| `cost_addition_total` | NUMERIC(12,2) | YES | - |
| `cost_kitchen_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_bath_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_per_sqm` | NUMERIC(10,2) | YES | - |
| `cost_basement_underpin_per_sqm` | NUMERIC(10,2) | YES | - |
| `max_build_fsi` | NUMERIC(6,3) | YES | - |
| `coa_fsi` | NUMERIC(6,3) | YES | - |
| `realized_fsi_p90` | NUMERIC(6,3) | YES | - |

#### `phase_calibration` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(phase_calibration_id_seq) |
| `from_phase` | CHARACTER VARYING(10) | NO | - |
| `to_phase` | CHARACTER VARYING(10) | NO | - |
| `permit_type` | CHARACTER VARYING(100) | YES | - |
| `median_days` | INTEGER | NO | - |
| `p25_days` | INTEGER | NO | - |
| `p75_days` | INTEGER | NO | - |
| `sample_size` | INTEGER | NO | - |
| `computed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `phase_stay_calibration` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_type` | CHARACTER VARYING(100) | YES | - |
| `phase` | CHARACTER VARYING(20) | YES | - |
| `median_days` | INTEGER | YES | - |
| `p25_days` | INTEGER | YES | - |
| `p75_days` | INTEGER | YES | - |
| `sample_size` | INTEGER | NO | - |
| `computed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `from_seq` | INTEGER | YES | - |
| `to_seq` | INTEGER | YES | - |
| `project_type` | CHARACTER VARYING(50) | YES | - |
| `coa_type_class` | CHARACTER VARYING(30) | YES | - |

#### `pipeline_runs` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(pipeline_runs_id_seq) |
| `pipeline` | TEXT | NO | - |
| `started_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `completed_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `status` | TEXT | NO | running |
| `records_total` | INTEGER | YES | 0 |
| `records_new` | INTEGER | YES | 0 |
| `records_updated` | INTEGER | YES | 0 |
| `error_message` | TEXT | YES | - |
| `duration_ms` | INTEGER | YES | - |
| `records_meta` | JSONB | YES | - |

#### `pipeline_schedules` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `pipeline` | TEXT | NO | - |
| `cadence` | TEXT | NO | Daily |
| `cron_expression` | TEXT | YES | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | YES | now() |
| `enabled` | BOOLEAN | NO | true |
| `chain_id` | TEXT | YES | - |

#### `product_groups` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(product_groups_id_seq) |
| `slug` | CHARACTER VARYING(50) | NO | - |
| `name` | CHARACTER VARYING(100) | NO | - |
| `sort_order` | INTEGER | NO | 0 |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `type` | TEXT | NO | material |

#### `profiles` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | UUID | NO | - |
| `is_admin` | BOOLEAN | NO | false |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `ravines` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(ravines_id_seq) |
| `source_id` | BIGINT | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TEXT | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `schema_migrations` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `filename` | TEXT | NO | - |
| `applied_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `checksum` | TEXT | NO | - |
| `duration_ms` | INTEGER | NO | - |

#### `scope_intensity_matrix` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_type` | CHARACTER VARYING(100) | NO | - |
| `structure_type` | CHARACTER VARYING(100) | NO | - |
| `gfa_allocation_percentage` | NUMERIC(5,4) | NO | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `scraper_queue` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `year_seq` | CHARACTER VARYING(20) | NO | - |
| `permit_type` | TEXT | NO | - |
| `claimed_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `claimed_by` | TEXT | YES | - |
| `completed_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `status` | CHARACTER VARYING(20) | NO | pending |
| `error_msg` | TEXT | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `spatial_ref_sys` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `srid` | INTEGER | NO | - |
| `auth_name` | CHARACTER VARYING(256) | YES | - |
| `auth_srid` | INTEGER | YES | - |
| `srtext` | CHARACTER VARYING(2048) | YES | - |
| `proj4text` | CHARACTER VARYING(2048) | YES | - |

#### `stripe_webhook_events` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `event_id` | TEXT | NO | - |
| `processed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `event_type` | TEXT | YES | - |
| `stripe_customer_id` | TEXT | YES | - |

#### `subscribe_nonces` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `nonce` | TEXT | NO | - |
| `user_id` | UUID | NO | - |
| `expires_at` | TIMESTAMP WITH TIME ZONE | NO | (now() + 00:15:00) |

#### `supplier_products` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `supplier_id` | INTEGER | NO | - |
| `product_id` | INTEGER | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `supplier_trades` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `supplier_id` | INTEGER | NO | - |
| `trade_id` | INTEGER | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `suppliers` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(suppliers_id_seq) |
| `name` | TEXT | NO | - |
| `account_type` | TEXT | NO | - |
| `status` | TEXT | NO | active |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `sync_runs` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(sync_runs_id_seq) |
| `started_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `completed_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `status` | CHARACTER VARYING(20) | NO | running |
| `records_total` | INTEGER | NO | 0 |
| `records_new` | INTEGER | NO | 0 |
| `records_updated` | INTEGER | NO | 0 |
| `records_unchanged` | INTEGER | NO | 0 |
| `records_errors` | INTEGER | NO | 0 |
| `error_message` | TEXT | YES | - |
| `snapshot_path` | CHARACTER VARYING(500) | YES | - |
| `duration_ms` | INTEGER | YES | - |

#### `toronto_centreline` (21 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | BIGINT | NO | nextval(toronto_centreline_id_seq) |
| `source_id` | BIGINT | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `linear_name_full` | TEXT | YES | - |
| `linear_name` | TEXT | YES | - |
| `linear_name_type` | TEXT | YES | - |
| `linear_name_dir` | TEXT | YES | - |
| `feature_code_desc` | TEXT | NO | - |
| `jurisdiction` | TEXT | NO | - |
| `from_intersection_id` | BIGINT | YES | - |
| `to_intersection_id` | BIGINT | YES | - |
| `lo_num_l` | TEXT | YES | - |
| `hi_num_l` | TEXT | YES | - |
| `lo_num_r` | TEXT | YES | - |
| `hi_num_r` | TEXT | YES | - |
| `parity_l` | TEXT | YES | - |
| `parity_r` | TEXT | YES | - |
| `oneway_dir_code_desc` | TEXT | YES | - |
| `source_dataset_version` | TEXT | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `tracked_projects` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(tracked_projects_id_seq) |
| `user_id` | UUID | NO | - |
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `revision_num` | CHARACTER VARYING(10) | YES | - |
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `status` | CHARACTER VARYING(50) | NO | claimed_unverified |
| `claimed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_notified_urgency` | CHARACTER VARYING(50) | YES | - |
| `last_notified_stalled` | BOOLEAN | YES | false |
| `lead_id` | TEXT | YES | - |
| `notified_decision_rendered` | BOOLEAN | NO | false |

#### `trade_configurations` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `bid_phase_cutoff` | CHARACTER VARYING(10) | NO | - |
| `work_phase_target` | CHARACTER VARYING(10) | NO | - |
| `imminent_window_days` | INTEGER | NO | 14 |
| `allocation_pct` | NUMERIC(5,4) | NO | 0.0500 |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `multiplier_bid` | NUMERIC(4,2) | NO | 2.5 |
| `multiplier_work` | NUMERIC(4,2) | NO | 1.5 |

#### `trade_forecasts` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `revision_num` | CHARACTER VARYING(10) | YES | - |
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `predicted_start` | DATE | YES | - |
| `confidence` | CHARACTER VARYING(10) | NO | low |
| `urgency` | CHARACTER VARYING(20) | NO | unknown |
| `calibration_method` | CHARACTER VARYING(30) | YES | - |
| `sample_size` | INTEGER | YES | - |
| `median_days` | INTEGER | YES | - |
| `p25_days` | INTEGER | YES | - |
| `p75_days` | INTEGER | YES | - |
| `computed_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `opportunity_score` | INTEGER | YES | - |
| `target_window` | CHARACTER VARYING(20) | YES | - |
| `lead_id` | TEXT | NO | - |

#### `trade_mapping_rules` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(trade_mapping_rules_id_seq) |
| `trade_id` | INTEGER | NO | - |
| `tier` | INTEGER | NO | - |
| `match_field` | CHARACTER VARYING(50) | NO | - |
| `match_pattern` | CHARACTER VARYING(500) | NO | - |
| `confidence` | NUMERIC(3,2) | NO | - |
| `phase_start` | INTEGER | YES | - |
| `phase_end` | INTEGER | YES | - |
| `is_active` | BOOLEAN | NO | true |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `trade_products` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `trade_id` | INTEGER | NO | - |
| `product_id` | INTEGER | NO | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `trade_sqft_rates` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `base_rate_sqft` | NUMERIC(10,2) | NO | - |
| `structure_complexity_factor` | NUMERIC(4,2) | NO | 1.00 |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `trade_suppliers` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(trade_suppliers_id_seq) |
| `trade_slug` | CHARACTER VARYING(64) | NO | - |
| `name` | TEXT | NO | - |
| `display_order` | INTEGER | NO | 0 |
| `active` | BOOLEAN | NO | true |

#### `trades` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(trades_id_seq) |
| `slug` | CHARACTER VARYING(50) | NO | - |
| `name` | CHARACTER VARYING(100) | NO | - |
| `icon` | CHARACTER VARYING(50) | YES | - |
| `color` | CHARACTER VARYING(7) | YES | - |
| `sort_order` | INTEGER | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `kind` | TEXT | NO | construction |
| `seq` | INTEGER | YES | - |
| `cost_basis` | TEXT | NO | per_sqft |

#### `universal_stream_catalog` (20 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `seq` | INTEGER | NO | - |
| `source_row_num` | INTEGER | NO | - |
| `lifecycle_group` | CHARACTER VARYING(10) | NO | - |
| `group_label` | CHARACTER VARYING(60) | NO | - |
| `lifecycle_block` | CHARACTER VARYING(10) | NO | - |
| `block_label` | CHARACTER VARYING(60) | NO | - |
| `lifecycle_stage` | CHARACTER VARYING(5) | NO | - |
| `stage_label` | CHARACTER VARYING(120) | NO | - |
| `source` | CHARACTER VARYING(30) | NO | - |
| `status` | CHARACTER VARYING(60) | NO | - |
| `phase` | CHARACTER VARYING(40) | YES | - |
| `bid_value` | NUMERIC(3,2) | YES | - |
| `loop_marker` | CHARACTER VARYING(80) | YES | - |
| `group_color` | CHARACTER VARYING(7) | YES | - |
| `group_icon` | CHARACTER VARYING(8) | YES | - |
| `block_color` | CHARACTER VARYING(7) | YES | - |
| `block_icon` | CHARACTER VARYING(8) | YES | - |
| `stage_color` | CHARACTER VARYING(7) | YES | - |
| `stage_icon` | CHARACTER VARYING(8) | YES | - |
| `rows_count` | INTEGER | YES | - |

#### `universal_stream_trade_signals` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `seq` | INTEGER | NO | - |
| `trade_slug` | CHARACTER VARYING(50) | NO | - |
| `signal_type` | CHARACTER VARYING(20) | NO | - |

#### `user_profiles` (30 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `user_id` | UUID | NO | - |
| `trade_slug` | CHARACTER VARYING(50) | YES | - |
| `display_name` | CHARACTER VARYING(200) | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `full_name` | TEXT | YES | - |
| `phone_number` | TEXT | YES | - |
| `company_name` | TEXT | YES | - |
| `email` | TEXT | YES | - |
| `backup_email` | TEXT | YES | - |
| `default_tab` | TEXT | YES | - |
| `location_mode` | TEXT | YES | - |
| `home_base_lat` | NUMERIC(9,6) | YES | - |
| `home_base_lng` | NUMERIC(9,6) | YES | - |
| `radius_km` | INTEGER | YES | - |
| `supplier_selection` | TEXT | YES | - |
| `lead_views_count` | INTEGER | YES | 0 |
| `stripe_customer_id` | TEXT | YES | - |
| `onboarding_complete` | BOOLEAN | YES | false |
| `tos_accepted_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `account_deleted_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `account_preset` | TEXT | YES | - |
| `trade_slugs_override` | ARRAY | YES | - |
| `radius_cap_km` | INTEGER | YES | - |
| `new_lead_min_cost_tier` | TEXT | NO | medium |
| `phase_changed` | BOOLEAN | NO | true |
| `lifecycle_stalled_pref` | BOOLEAN | NO | true |
| `start_date_urgent` | BOOLEAN | NO | true |
| `notification_schedule` | TEXT | NO | anytime |
| `stripe_cancel_failed_at` | TIMESTAMP WITH TIME ZONE | YES | - |

#### `wsib_registry` (22 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(wsib_registry_id_seq) |
| `legal_name` | CHARACTER VARYING(500) | NO | - |
| `trade_name` | CHARACTER VARYING(500) | YES | - |
| `legal_name_normalized` | CHARACTER VARYING(500) | NO | - |
| `trade_name_normalized` | CHARACTER VARYING(500) | YES | - |
| `mailing_address` | CHARACTER VARYING(500) | YES | - |
| `predominant_class` | CHARACTER VARYING(10) | NO | - |
| `naics_code` | CHARACTER VARYING(20) | YES | - |
| `naics_description` | CHARACTER VARYING(500) | YES | - |
| `subclass` | CHARACTER VARYING(50) | YES | - |
| `subclass_description` | TEXT | YES | - |
| `business_size` | CHARACTER VARYING(100) | YES | - |
| `match_confidence` | NUMERIC(3,2) | YES | - |
| `matched_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `first_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITH TIME ZONE | NO | now() |
| `linked_entity_id` | INTEGER | YES | - |
| `primary_phone` | CHARACTER VARYING(50) | YES | - |
| `primary_email` | CHARACTER VARYING(200) | YES | - |
| `website` | CHARACTER VARYING(500) | YES | - |
| `last_enriched_at` | TIMESTAMP WITHOUT TIME ZONE | YES | - |
| `is_gta` | BOOLEAN | YES | false |

#### `zoning_building_setback_overlay` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_building_setback_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `objectid` | INTEGER | YES | - |
| `zn_string` | TEXT | YES | - |
| `ch600_area_type` | INTEGER | YES | - |
| `bylaw_section_link` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_bylaw_areas` (29 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_bylaw_areas_id_seq) |
| `source_id` | INTEGER | NO | - |
| `gen_zone` | INTEGER | YES | - |
| `zn_zone` | TEXT | NO | - |
| `zn_string` | TEXT | NO | - |
| `zn_holding` | TEXT | YES | - |
| `holding_id` | INTEGER | YES | - |
| `frontage_min_m` | NUMERIC(8,2) | YES | - |
| `area_min_sqm` | INTEGER | YES | - |
| `units_max` | INTEGER | YES | - |
| `density_max` | NUMERIC(10,2) | YES | - |
| `coverage_max_pct` | NUMERIC(5,2) | YES | - |
| `fsi_max` | NUMERIC(6,3) | YES | - |
| `pct_commercial_max` | NUMERIC(5,2) | YES | - |
| `pct_residential_max` | NUMERIC(5,2) | YES | - |
| `pct_employment_max` | NUMERIC(5,2) | YES | - |
| `pct_office_max` | NUMERIC(5,2) | YES | - |
| `exception_number` | INTEGER | YES | - |
| `exception_text` | TEXT | YES | - |
| `bylaw_chapter` | TEXT | YES | - |
| `bylaw_section` | TEXT | YES | - |
| `bylaw_exception_ref` | TEXT | YES | - |
| `standard_setback` | NUMERIC(8,2) | YES | - |
| `zone_status` | INTEGER | YES | - |
| `area_units` | NUMERIC(10,2) | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_height_overlay` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_height_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `ht_stories` | INTEGER | YES | - |
| `ht_string` | TEXT | YES | - |
| `height_max_m` | NUMERIC(8,2) | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_lot_coverage_overlay` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_lot_coverage_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `coverage_max_pct_override` | NUMERIC(5,2) | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_parking_zone_overlay` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_parking_zone_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `objectid` | INTEGER | YES | - |
| `zn_parkzone` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_policy_area_overlay` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_policy_area_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `policy_id` | TEXT | YES | - |
| `chapter_200_ref` | TEXT | YES | - |
| `exception_link` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_policy_road_overlay` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_policy_road_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `road_name` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_priority_retail_overlay` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_priority_retail_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `objectid` | INTEGER | YES | - |
| `zn_string` | TEXT | YES | - |
| `ch600_line_type` | INTEGER | YES | - |
| `linear_name_full_legal` | TEXT | YES | - |
| `bylaw_section_link` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_queenstw_eat_overlay` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_queenstw_eat_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `objectid` | INTEGER | YES | - |
| `zn_string` | TEXT | YES | - |
| `ch600_area_type` | INTEGER | YES | - |
| `bylaw_section_link` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

#### `zoning_rooming_house_overlay` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(zoning_rooming_house_overlay_id_seq) |
| `source_id` | INTEGER | NO | - |
| `rmh_area` | TEXT | YES | - |
| `rmg_hs_no` | INTEGER | YES | - |
| `rmg_string` | TEXT | YES | - |
| `chapter_150_25_ref` | TEXT | YES | - |
| `geometry` | JSONB | NO | - |
| `geom` | USER-DEFINED | NO | - |
| `source_dataset_version` | TIMESTAMP WITH TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | NO | now() |

<!-- DB_SCHEMA_END -->

## 3.A. Planned Schema Additions — WF1 #coa-pipeline-parity-phase-a (Spec 42 §6.6)

The following tables and columns are **planned for Phase B migrations** as part of the CoA pipeline parity work. Definitions sourced from Spec 42 §6.6 — those definitions are the canonical source-of-truth. This section indexes them in the global schema document so future spec readers can locate them.

Reading order: the new tables described below are introduced by Spec 42; the column additions extend existing tables documented above. None are live yet — these are forward-looking schema commitments.

### New tables

#### `lead_trades` (9 columns) — REPLACES `permit_trades`
Universal trade-classification ledger keyed on `lead_id` (Option C from Spec 42 §6.6). Handles both permit-side and CoA-side trade tagging.
- `id SERIAL PRIMARY KEY` (matches Spec 42 §6.6.B canonical DDL; mirrors `permit_trades.id` from migration 006)
- `lead_id TEXT NOT NULL` — `'permit:<num>:<rev>'` or `'coa:<application_number>'`
- `trade_id INTEGER NOT NULL REFERENCES trades(id)`
- `tier INTEGER` — 1/2/3 for permits, always 3 for CoAs (description-only matching)
- `confidence DECIMAL(3,2)`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `phase VARCHAR(20)` — P-code at classification time (legacy, kept for backward compat)
- `lead_score INTEGER NOT NULL DEFAULT 0`
- `classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `UNIQUE (lead_id, trade_id)`
- Indexes: `(trade_id)`, `(is_active)`, `(lead_id)`

#### `lead_parcels` (5 columns) — REPLACES `permit_parcels`
Universal spatial-linkage table keyed on `lead_id`.
- `lead_id TEXT NOT NULL`
- `parcel_id INTEGER NOT NULL REFERENCES parcels(id)` — type matches `parcels.id SERIAL` (INTEGER); BIGINT mismatch would cause FK rejection
- `match_type VARCHAR(20) NOT NULL`
- `confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1)`
- `matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `PRIMARY KEY (lead_id, parcel_id)`
- Indexes: `(parcel_id)`, `(lead_id)`

#### `lifecycle_transitions` (12 columns) — REPLACES `permit_phase_transitions`
Universal lifecycle ledger keyed on `lead_id`. Records phase-level transitions with both legacy P-codes AND new granular Universal Stream seq references.
- `id SERIAL PRIMARY KEY`
- `lead_id TEXT NOT NULL`
- `from_phase VARCHAR(20)` — legacy P-code (current authoritative)
- `to_phase VARCHAR(20) NOT NULL`
- `from_seq INTEGER` — granular Universal Stream row reference; populated in Phase E
- `to_seq INTEGER` — granular Universal Stream row reference; populated in Phase E
- `transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `permit_type VARCHAR(50)` — denormalized for cohort queries
- `project_type VARCHAR(50)` — new cohort-key dimension
- `coa_type_class VARCHAR(30)` — new cohort-key dimension
- `neighbourhood_id BIGINT`
- Indexes: `(lead_id)`, `(from_phase, to_phase)`, `(from_seq, to_seq) WHERE from_seq IS NOT NULL`

#### `lifecycle_status_history` (16 columns) — NEW
Status-level ledger paralleling `lifecycle_transitions`. Captures every status change (not just phase changes) plus CoA decision snapshots at each transition. Three writers: `load-permits.js`, `load-coa.js`, `classify-lifecycle-phase.js`. Critical for forecast cohort segmentation by traversal pattern. See Spec 42 §6.6.B for the "How lifecycle history works across CoA + Permit (unified)" rationale.
- `id BIGSERIAL PRIMARY KEY`
- `lead_id TEXT NOT NULL`
- `from_status VARCHAR(60)` — previous source status (NULL on first observation)
- `to_status VARCHAR(60) NOT NULL` — new source status
- `from_seq INTEGER`, `to_seq INTEGER` — granular row references
- `from_phase VARCHAR(20)`, `to_phase VARCHAR(20)` — legacy P-code (kept for backward compat)
- `decision VARCHAR(60)` — CoA decision snapshot at time of status change (NULL for permits)
- `decision_date DATE` — CoA decision_date snapshot
- `transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `detected_by VARCHAR(60) NOT NULL` — enum of three writers above
- `permit_type VARCHAR(50)`, `project_type VARCHAR(50)`, `coa_type_class VARCHAR(30)`, `neighbourhood_id BIGINT` — denormalized cohort dims
- Indexes: `(lead_id)`, `(from_seq, to_seq) WHERE from_seq IS NOT NULL`, `(decision) WHERE decision IS NOT NULL`, `(transitioned_at)`
- **Uniqueness:** `UNIQUE (lead_id, to_status, date_trunc('second', transitioned_at))` — idempotency guard against re-run duplicates from ingest scripts. Ingest writes use `ON CONFLICT DO NOTHING`.

#### `universal_stream_catalog` (20 columns) — NEW
Read-only reference table seeded from Spec 84 §2.5.h.2 (110 rows). The lifecycle classifier JOINs against this table to derive granular columns; the front-end JOINs through `lifecycle_seq` for rendering group/block/stage labels + colors + icons.
- `seq INTEGER PRIMARY KEY` — 1-110
- `source_row_num INTEGER NOT NULL`
- `lifecycle_group VARCHAR(10) NOT NULL`, `group_label VARCHAR(60) NOT NULL`
- `lifecycle_block VARCHAR(10) NOT NULL`, `block_label VARCHAR(60) NOT NULL`
- `lifecycle_stage VARCHAR(5) NOT NULL`, `stage_label VARCHAR(120) NOT NULL`
- `source VARCHAR(30) NOT NULL` — `'coa.status'` / `'permits.status'` / `'insp.stage'`
- `status VARCHAR(60) NOT NULL`
- `phase VARCHAR(40)` — legacy P-code
- `bid_value DECIMAL(3,2)` — 0-1 importance score
- `loop_marker VARCHAR(60)`
- `group_color VARCHAR(7)`, `group_icon VARCHAR(8)`, `block_color VARCHAR(7)`, `block_icon VARCHAR(8)`, `stage_color VARCHAR(7)`, `stage_icon VARCHAR(8)` — Color & Icon Strategy per Spec 84 §2.5.h
- `rows_count INTEGER` — snapshot count from §2.5.h.2 (informational)
- Indexes: `(lifecycle_group)`, `(lifecycle_block)`

#### `universal_stream_trade_signals` (3 columns) — NEW
Decomposes the 152 per-trade × per-row signal columns from Spec 84 §2.5.h.2 into queryable relational form (~1,500 rows). Forecast engine queries this for granular bimodal routing per `(current_seq, trade)`.
- `seq INTEGER NOT NULL REFERENCES universal_stream_catalog(seq)`
- `trade_slug VARCHAR(50) NOT NULL REFERENCES trades(slug)`
- `signal_type VARCHAR(20) NOT NULL CHECK (signal_type IN ('bid','work','fallback','last_minute'))`
- `PRIMARY KEY (seq, trade_slug, signal_type)`
- Indexes: `(trade_slug, signal_type)`, `(seq, signal_type)`

### Column additions to existing tables

#### `permits` — add 7 columns
- `lead_id TEXT` — generated from `permit_num` + `revision_num` via trigger; promoted NOT NULL + UNIQUE after Phase C backfill
- `linked_coa_application_number VARCHAR(50)` — back-reference to `coa_applications`; indexed; NOT FK (CoA may be retired before permit)
- `lifecycle_seq INTEGER` — granular Universal Stream row reference; populated in Phase E
- `lifecycle_group VARCHAR(10)`, `lifecycle_block VARCHAR(10)`, `lifecycle_stage VARCHAR(5)` — granular hierarchy
- `bid_value DECIMAL(3,2)` — 0-1 importance score

#### `coa_applications` — add 13 columns
- `lead_id TEXT` — generated from `application_number` via trigger; NOT NULL + UNIQUE after Phase C backfill
- `coa_type_class VARCHAR(30)` — residential / commercial / institutional / mixed
- `project_type VARCHAR(50)` — Addition / NewConstruction / Alteration / Demolition / Severance / Mixed
- `scope_tags TEXT[]`
- `scope_classified_at TIMESTAMPTZ`, `scope_source VARCHAR(30)` — provenance
- `structure_type VARCHAR(30)` — dwelling-use archetype keyword-classified from `description` by `classify-coa-scope.js` into the Spec 83 §3.A `scope_intensity_matrix` vocab (corrected 2026-06-20: NOT denormalized from `parcel_buildings` — that holds physical-role `primary`/`shed`/`garage`, a different vocabulary)
- `neighbourhood_id BIGINT`
- `latitude DECIMAL(10,7)`, `longitude DECIMAL(10,7)` — geocoded
- `modeled_gfa_sqm NUMERIC`, `estimated_cost NUMERIC`, `cost_source VARCHAR(20)` — geometric cost path
- `cost_classified_at TIMESTAMPTZ`
- `lifecycle_seq INTEGER`, `lifecycle_group VARCHAR(10)`, `lifecycle_block VARCHAR(10)`, `lifecycle_stage VARCHAR(5)`, `bid_value DECIMAL(3,2)` — granular hierarchy mirroring `permits`

#### `cost_estimates`, `trade_forecasts`, `tracked_projects` — add `lead_id TEXT`
Backfilled in Phase C from `permit_num` + `revision_num`. Eventually replaces legacy keys after Phase H legacy column drop. PKs migrate to `(lead_id, ...)`.

#### `phase_stay_calibration` — add 4 columns for granular cohort key
- `from_seq INTEGER`, `to_seq INTEGER` — granular cohort key dimensions
- `project_type VARCHAR(50)`, `coa_type_class VARCHAR(30)` — new cohort-key dimensions

#### `logic_variables` — add new keys
- `lifecycle_band_block_<block_id>_min/max` (~15 keys) — per-block distribution bands replacing the legacy `lifecycle_band_p{N}_min/max` namespace
- `lifecycle_band_seq_<seq>_min/max` (×110, optional diagnostic-only)
- `lifecycle_status_history_retention_days` (default 1825 = 5 years)
- `coa_stall_threshold_p2_days` (default 90), `coa_imminent_window_days` (default 7) — CoA CRM alert tuning

### Retired tables (Phase H)

After Phase G PRE-permit retirement + Phase H legacy-column cleanup, these tables/aliases are dropped:
- `permit_trades` → replaced by `lead_trades`
- `permit_parcels` → replaced by `lead_parcels`
- `permit_phase_transitions` → replaced by `lifecycle_transitions`
- `lifecycle_band_p{N}_min/max` keys (36) → replaced by `lifecycle_band_block_<block_id>_min/max`

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** Verify constraint enforcement -- NOT NULL on PK columns, CHECK constraints on tier/confidence, UNIQUE on slugs/normalized names/junction composites, and FK integrity across all junction tables.
- **UI:** N/A -- no visual component.
- **Infra:** Run `scripts/migrate.js` against empty DB (all migrations pass), run twice (idempotent), verify all indexes exist in `pg_indexes`, confirm 20 seeded trades with idempotent re-seed, and validate connection pool handles concurrent queries.
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/db/client.ts`
- `src/lib/permits/types.ts`
- `migrations/*.sql`
- `scripts/migrate.js`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification logic.
- **`src/app/`**: Governed by Specs 06, 13, 15-20, 26. Do not modify API routes or pages.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.

### Cross-Spec Dependencies
- Foundation schema for all downstream specs. All other specs may import and read types from `src/lib/permits/types.ts` but may not alter them without updating this spec first.
