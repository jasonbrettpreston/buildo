# Spec 01 -- Database Schema

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
- **Core Logic:** The schema consists of 25 tables across five domains. **Core permits** (`permits` with composite PK `(permit_num, revision_num)`, `permit_history`, `sync_runs`, `pipeline_runs`, `pipeline_schedules`) store ingested data, field-level audit trails, and pipeline run metadata. **Classification** (`trades`, `trade_mapping_rules` with 3-tier CHECK, `permit_trades` junction, `product_groups`, `permit_products`) links permits to 32 trade categories and product groups with confidence scores. **Enrichment** (`entities` deduplicated by `name_normalized`, `entity_projects` junction, `builders` legacy alias, `builder_contacts`, `coa_applications` with optional permit linking, `wsib_registry`, `permit_inspections`) tracks entity profiles, WSIB records, inspection stages, and Committee of Adjustment data. **Spatial** (`parcels` with lot dimensions, `permit_parcels` junction, `neighbourhoods` with Census 2021 demographics, `building_footprints` with 3D massing, `parcel_buildings` junction, `address_points`, `data_quality_snapshots`) supports geocoding, parcel matching, and quality tracking. All DDL uses `IF NOT EXISTS` for idempotent re-runs; trade seeds use `ON CONFLICT DO NOTHING`. The `pg` Pool in `src/lib/db/client.ts` provides `query<T>()` and `getClient()` for typed access. See `Permit`, `Trade`, `Entity`, `Inspection`, and related interfaces in `src/lib/permits/types.ts`.
- **Outputs:** A fully indexed PostgreSQL database with 24+ B-tree, GIN, and GiST indexes supporting FTS, change detection (SHA-256 `data_hash`), spatial lookups (PostGIS `GEOMETRY` columns on `parcels` and `neighbourhoods`), and referential integrity (FK constraints on `permit_trades` and `permit_parcels`). Partial indexes on `permits` (needs geocode) and `builders` (needs enrich) accelerate worker queries.
- **Edge Cases:** Composite PK requires both `permit_num` AND `revision_num` in all queries; `tier` CHECK rejects values outside 1-3; `confidence` CHECK rejects values outside 0-1; `est_const_cost` DECIMAL(15,2) overflows beyond 13 integer digits; migration runner is forward-only with no rollback. CoA FK to permits is intentionally omitted (composite PK incompatible with single-column reference) — enforced via CQA Tier 2 referential audit instead. PostgreSQL ENUMs deferred for `status` columns to accommodate upstream Toronto Open Data changes.

<!-- DB_SCHEMA_START -->
### Tables (19)

| Table | Columns | Indexes |
|-------|---------|--------|
| `address_points` | 3 | 0 |
| `builder_contacts` | 8 | 2 |
| `builders` | 15 | 3 |
| `building_footprints` | 12 | 3 |
| `coa_applications` | 18 | 6 |
| `data_quality_snapshots` | 59 | 2 |
| `neighbourhoods` | 21 | 2 |
| `notifications` | 12 | 2 |
| `parcel_buildings` | 8 | 3 |
| `parcels` | 22 | 5 |
| `permit_history` | 8 | 2 |
| `permit_parcels` | 7 | 3 |
| `permit_trades` | 10 | 5 |
| `permits` | 42 | 10 |
| `pipeline_runs` | 10 | 1 |
| `pipeline_schedules` | 4 | 0 |
| `sync_runs` | 12 | 0 |
| `trade_mapping_rules` | 10 | 2 |
| `trades` | 7 | 1 |

### Materialized Views (1)

- `mv_monthly_permit_stats`

### Column Detail

#### `address_points` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `address_point_id` | INTEGER | NO | - |
| `latitude` | NUMERIC(10,7) | NO | - |
| `longitude` | NUMERIC(10,7) | NO | - |

#### `builder_contacts` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(builder_contacts_id_seq) |
| `builder_id` | INTEGER | NO | - |
| `contact_type` | CHARACTER VARYING(20) | YES | - |
| `contact_value` | CHARACTER VARYING(500) | YES | - |
| `source` | CHARACTER VARYING(50) | NO | user |
| `contributed_by` | CHARACTER VARYING(100) | YES | - |
| `verified` | BOOLEAN | NO | false |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `builders` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(builders_id_seq) |
| `name` | CHARACTER VARYING(500) | NO | - |
| `name_normalized` | CHARACTER VARYING(500) | NO | - |
| `phone` | CHARACTER VARYING(50) | YES | - |
| `email` | CHARACTER VARYING(200) | YES | - |
| `website` | CHARACTER VARYING(500) | YES | - |
| `google_place_id` | CHARACTER VARYING(200) | YES | - |
| `google_rating` | NUMERIC(2,1) | YES | - |
| `google_review_count` | INTEGER | YES | - |
| `obr_business_number` | CHARACTER VARYING(50) | YES | - |
| `wsib_status` | CHARACTER VARYING(50) | YES | - |
| `permit_count` | INTEGER | NO | 0 |
| `first_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `enriched_at` | TIMESTAMP WITHOUT TIME ZONE | YES | - |

#### `building_footprints` (12 columns)

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
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `coa_applications` (18 columns)

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
| `first_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `sub_type` | TEXT | YES | - |

#### `data_quality_snapshots` (59 columns)

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

#### `neighbourhoods` (21 columns)

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
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `notifications` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(notifications_id_seq) |
| `user_id` | CHARACTER VARYING(100) | NO | - |
| `type` | CHARACTER VARYING(50) | NO | - |
| `title` | CHARACTER VARYING(200) | YES | - |
| `body` | TEXT | YES | - |
| `permit_num` | CHARACTER VARYING(30) | YES | - |
| `trade_slug` | CHARACTER VARYING(50) | YES | - |
| `channel` | CHARACTER VARYING(20) | NO | in_app |
| `is_read` | BOOLEAN | NO | false |
| `is_sent` | BOOLEAN | NO | false |
| `sent_at` | TIMESTAMP WITHOUT TIME ZONE | YES | - |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `parcel_buildings` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(parcel_buildings_id_seq) |
| `parcel_id` | INTEGER | NO | - |
| `building_id` | INTEGER | NO | - |
| `is_primary` | BOOLEAN | NO | false |
| `structure_type` | CHARACTER VARYING(20) | NO | other |
| `linked_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `match_type` | CHARACTER VARYING(30) | NO | polygon |
| `confidence` | NUMERIC(3,2) | NO | 0.85 |

#### `parcels` (22 columns)

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
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `centroid_lat` | NUMERIC(10,7) | YES | - |
| `centroid_lng` | NUMERIC(10,7) | YES | - |
| `is_irregular` | BOOLEAN | YES | false |

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
| `changed_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `permit_parcels` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(permit_parcels_id_seq) |
| `permit_num` | CHARACTER VARYING(30) | NO | - |
| `revision_num` | CHARACTER VARYING(10) | NO | - |
| `parcel_id` | INTEGER | NO | - |
| `match_type` | CHARACTER VARYING(30) | NO | - |
| `confidence` | NUMERIC(3,2) | NO | - |
| `linked_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `permit_trades` (10 columns)

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
| `classified_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `permits` (42 columns)

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
| `geocoded_at` | TIMESTAMP WITHOUT TIME ZONE | YES | - |
| `data_hash` | CHARACTER VARYING(64) | YES | - |
| `first_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `last_seen_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `raw_json` | JSONB | YES | - |
| `neighbourhood_id` | INTEGER | YES | - |
| `project_type` | CHARACTER VARYING(20) | YES | - |
| `scope_tags` | ARRAY | YES | - |
| `scope_classified_at` | TIMESTAMP WITH TIME ZONE | YES | - |
| `scope_source` | CHARACTER VARYING(20) | YES | classified |

#### `pipeline_runs` (10 columns)

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

#### `pipeline_schedules` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `pipeline` | TEXT | NO | - |
| `cadence` | TEXT | NO | Daily |
| `cron_expression` | TEXT | YES | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | YES | now() |

#### `sync_runs` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(sync_runs_id_seq) |
| `started_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |
| `completed_at` | TIMESTAMP WITHOUT TIME ZONE | YES | - |
| `status` | CHARACTER VARYING(20) | NO | running |
| `records_total` | INTEGER | NO | 0 |
| `records_new` | INTEGER | NO | 0 |
| `records_updated` | INTEGER | NO | 0 |
| `records_unchanged` | INTEGER | NO | 0 |
| `records_errors` | INTEGER | NO | 0 |
| `error_message` | TEXT | YES | - |
| `snapshot_path` | CHARACTER VARYING(500) | YES | - |
| `duration_ms` | INTEGER | YES | - |

#### `trade_mapping_rules` (10 columns)

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
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

#### `trades` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| `id` | INTEGER | NO | nextval(trades_id_seq) |
| `slug` | CHARACTER VARYING(50) | NO | - |
| `name` | CHARACTER VARYING(100) | NO | - |
| `icon` | CHARACTER VARYING(50) | YES | - |
| `color` | CHARACTER VARYING(7) | YES | - |
| `sort_order` | INTEGER | YES | - |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE | NO | now() |

<!-- DB_SCHEMA_END -->

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
