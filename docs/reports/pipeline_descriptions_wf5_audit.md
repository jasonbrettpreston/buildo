# WF5 Audit: Pipeline Step Descriptions
**Date**: March 7, 2026

This report constitutes a Workflow 5 (WF5) audit of the pipeline step descriptions presented in the Data Quality drill-down view, specifically assessing accuracy by cross-referencing the `STEP_DESCRIPTIONS` in `src/lib/admin/funnel.ts` against the actual database schema (`information_schema.columns`).

## Evaluation Rubric

| Evaluation Vector | Criteria for Grade 'A' | Grade Assessment | Finding |
| :--- | :--- | :--- | :--- |
| **Accuracy**| Field lists correctly reflect actual database column names. | **FAIL** | Multiple inaccuracies. `entities` lists `phone` and `email` instead of actual `primary_phone` and `primary_email`. `classify_permits` lists the table name `permit_trades` as a field instead of actual columns like `trade_id` and `tier`. |
| **Completeness**| Field lists include the most critical business data points. | **FAIL** | As noted by the user, Building Permits (`permits`) entirely omits critical fields like `builder_name`, `street_num`, `street_name`, `storeys`, and `building_type`. |
| **Consistency**| Descriptions align with the actual operations performed. | **B** | The `summary` strings accurately reflect the intention of the pipelines, but the `fields` metadata is too frequently out of sync with the underlying schema. |

## Bug Diagnosis: Schema Misalignment
**Finding: Stale UI Metadata**
The `STEP_DESCRIPTIONS` object driving the accordion descriptions in the UI is hardcoded and has drifted from the actual database schema it purports to describe. 

Specific instances of schema drift identified:

1.  **Building Permits (`permits`)**:
    *   *UI Lists*: `['permit_num', 'revision_num', 'permit_type', 'description', 'est_const_cost', 'issued_date', 'status']`
    *   *Missing (Actual DB)*: `builder_name`, `street_num`, `street_name`, `storeys`, `building_type`, `dwelling_units_created`
2.  **Extract Entities (`builders`)**:
    *   *UI Lists*: `['legal_name', 'phone', 'email', 'website']`
    *   *Actual DB*: Uses `primary_phone` and `primary_email`. It also maps `trade_name`.
3.  **Classify Trades (`classify_permits`)**:
# WF5 Audit: Pipeline Step Descriptions
**Date**: March 7, 2026

This report constitutes a Workflow 5 (WF5) audit of the pipeline step descriptions presented in the Data Quality drill-down view, specifically assessing accuracy by cross-referencing the `STEP_DESCRIPTIONS` in `src/lib/admin/funnel.ts` against the actual database schema (`information_schema.columns`).

## Evaluation Rubric

| Evaluation Vector | Criteria for Grade 'A' | Grade Assessment | Finding |
| :--- | :--- | :--- | :--- |
| **Accuracy**| Field lists correctly reflect actual database column names. | **FAIL** | Multiple inaccuracies. `entities` lists `phone` and `email` instead of actual `primary_phone` and `primary_email`. `classify_permits` lists the table name `permit_trades` as a field instead of actual columns like `trade_id` and `tier`. |
| **Completeness**| Field lists include the most critical business data points. | **FAIL** | As noted by the user, Building Permits (`permits`) entirely omits critical fields like `builder_name`, `street_num`, `street_name`, `storeys`, and `building_type`. |
| **Consistency**| Descriptions align with the actual operations performed. | **B** | The `summary` strings accurately reflect the intention of the pipelines, but the `fields` metadata is too frequently out of sync with the underlying schema. |

## Bug Diagnosis: Schema Misalignment
**Finding: Stale UI Metadata**
The `STEP_DESCRIPTIONS` object driving the accordion descriptions in the UI is hardcoded and has drifted from the actual database schema it purports to describe. 

Specific instances of schema drift identified:

1.  **Building Permits (`permits`)**:
    *   *UI Lists*: `['permit_num', 'revision_num', 'permit_type', 'description', 'est_const_cost', 'issued_date', 'status']`
    *   *Missing (Actual DB)*: `builder_name`, `street_num`, `street_name`, `storeys`, `building_type`, `dwelling_units_created`
2.  **Extract Entities (`builders`)**:
    *   *UI Lists*: `['legal_name', 'phone', 'email', 'website']`
    *   *Actual DB*: Uses `primary_phone` and `primary_email`. It also maps `trade_name`.
3.  **Classify Trades (`classify_permits`)**:
    *   *UI Lists*: `['permit_trades']` (This is the table name, not a column).
    *   *Actual DB*: Columns are `trade_id`, `tier`, `confidence`, `phase`, `lead_score`.
4.  **CoA Applications (`coa`)**:
    *   *UI Lists*: `['application_number', 'hearing_date', 'decision', 'ward', 'address']`
    *   *Missing (Actual DB)*: `applicant`, `description`, `status`.

## Conclusion & Next Steps
Hardcoding schema field definitions into arrays inherently leads to drift, as we verified in the report. We will implement dynamic database schema querying to guarantee 100% accuracy and permanently eliminate the need to manually patch arrays.

**Implementation Architecture:**
1. **API (`/api/admin/stats`)**: Dynamically query `information_schema.columns` to build a `db_schema_map` matching tables to their current live structure.
2. **`funnel.ts`**: Strip out the hardcoded and inaccurate fields arrays entirely.
3. **UI (`DataQualityDashboard.tsx` & `FreshnessTimeline.tsx`)**: Pass the schema map down, and render the exact, live DB column structure in each pipeline step's description, along with a "Live DB Schema" badge to inspire trust.

## Comprehensive Field Mapping

The following table cross-references every pipeline step with the fields currently listed in the UI versus the actual structural columns present in the target database table.

| Pipeline Step | Target Table | UI Fields (funnel.ts) | Actual DB Columns (information_schema) |
| :--- | :--- | :--- | :--- |
| **permits** | `permits` | permit_num, revision_num, permit_type, description, est_const_cost, issued_date, status | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **coa** | `coa_applications` | application_number, hearing_date, decision, ward, address | id, application_number, address, street_num, street_name, ward, status, decision, decision_date, hearing_date, description, applicant, linked_permit_num, linked_confidence, data_hash, first_seen_at, last_seen_at, sub_type |
| **builders** | `entities` | legal_name, phone, email, website | id, legal_name, trade_name, name_normalized, entity_type, primary_phone, primary_email, website, linkedin_url, google_place_id, google_rating, google_review_count, is_wsib_registered, permit_count, first_seen_at, last_seen_at, last_enriched_at |
| **address_points** | `address_points` | address_point_id, latitude, longitude | address_point_id, latitude, longitude |
| **parcels** | `parcels` | parcel_id, lot_size_sqm, frontage_m, depth_m, geom | id, parcel_id, feature_type, address_number, linear_name_full, addr_num_normalized, street_name_normalized, street_type_normalized, stated_area_raw, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, geometry, date_effective, date_expiry, created_at, centroid_lat, centroid_lng, is_irregular |
| **massing** | `building_footprints` | source_id, footprint_area_sqm, max_height_m, estimated_stories | id, source_id, geometry, footprint_area_sqm, footprint_area_sqft, max_height_m, min_height_m, elev_z, estimated_stories, centroid_lat, centroid_lng, created_at |
| **neighbourhoods** | `neighbourhoods` | neighbourhood_id, name, avg_household_income, geom | id, neighbourhood_id, name, geometry, avg_household_income, median_household_income, avg_individual_income, low_income_pct, tenure_owner_pct, tenure_renter_pct, period_of_construction, couples_pct, lone_parent_pct, married_pct, university_degree_pct, immigrant_pct, visible_minority_pct, english_knowledge_pct, top_mother_tongue, census_year, created_at |
| **load_wsib** | `wsib_registry` | legal_name, trade_name, mailing_address, naics_code | id, legal_name, trade_name, legal_name_normalized, trade_name_normalized, mailing_address, predominant_class, naics_code, naics_description, subclass, subclass_description, business_size, linked_builder_id, match_confidence, matched_at, first_seen_at, last_seen_at, linked_entity_id |
| **geocode_permits** | `permits` | latitude, longitude, geo_id | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **link_parcels** | `permit_parcels` | parcel_id, lot_size, frontage, depth | N/A (Table does not exist or not tracked) |
| **link_neighbourhoods** | `permits` | neighbourhood_id | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **link_massing** | `parcel_buildings` | parcel_id, building_id, match_type, confidence | N/A (Table does not exist or not tracked) |
| **link_coa** | `coa_applications` | linked_permit_num, linked_confidence | id, application_number, address, street_num, street_name, ward, status, decision, decision_date, hearing_date, description, applicant, linked_permit_num, linked_confidence, data_hash, first_seen_at, last_seen_at, sub_type |
| **link_wsib** | `entities` | is_wsib_registered, linked_entity_id, match_confidence | id, legal_name, trade_name, name_normalized, entity_type, primary_phone, primary_email, website, linkedin_url, google_place_id, google_rating, google_review_count, is_wsib_registered, permit_count, first_seen_at, last_seen_at, last_enriched_at |
| **enrich_wsib_builders** | `entities` | phone, email, website | id, legal_name, trade_name, name_normalized, entity_type, primary_phone, primary_email, website, linkedin_url, google_place_id, google_rating, google_review_count, is_wsib_registered, permit_count, first_seen_at, last_seen_at, last_enriched_at |
| **enrich_named_builders** | `entities` | phone, email, website | id, legal_name, trade_name, name_normalized, entity_type, primary_phone, primary_email, website, linkedin_url, google_place_id, google_rating, google_review_count, is_wsib_registered, permit_count, first_seen_at, last_seen_at, last_enriched_at |
| **link_similar** | `permits` | similar_permit_id | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **create_pre_permits** | `coa_applications` | application_number, decision, ward | id, application_number, address, street_num, street_name, ward, status, decision, decision_date, hearing_date, description, applicant, linked_permit_num, linked_confidence, data_hash, first_seen_at, last_seen_at, sub_type |
| **compute_centroids** | `parcels` | centroid_lat, centroid_lng | id, parcel_id, feature_type, address_number, linear_name_full, addr_num_normalized, street_name_normalized, street_type_normalized, stated_area_raw, lot_size_sqm, lot_size_sqft, frontage_m, frontage_ft, depth_m, depth_ft, geometry, date_effective, date_expiry, created_at, centroid_lat, centroid_lng, is_irregular |
| **classify_scope_class** | `permits` | project_type, scope_classified_at | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **classify_scope_tags** | `permits` | scope_tags | permit_num, revision_num, permit_type, structure_type, work, street_num, street_name, street_type, street_direction, city, postal, geo_id, building_type, category, application_date, issued_date, completed_date, status, description, est_const_cost, builder_name, owner, dwelling_units_created, dwelling_units_lost, ward, council_district, current_use, proposed_use, housing_units, storeys, latitude, longitude, geocoded_at, data_hash, first_seen_at, last_seen_at, raw_json, neighbourhood_id, project_type, scope_tags, scope_classified_at, scope_source |
| **classify_permits** | `permit_trades` | permit_trades | id, permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, classified_at |
| **refresh_snapshot** | `data_quality_snapshots` | active_permits, permits_geocoded, permits_with_trades, violations_total | N/A (Table does not exist or not tracked) |
| **assert_schema** | `pipeline_runs` | checks_passed, checks_failed, errors | N/A (Table does not exist or not tracked) |
| **assert_data_bounds** | `pipeline_runs` | checks_passed, checks_failed, checks_warned | N/A (Table does not exist or not tracked) |
| **inspections** | `permit_inspections` | stage_name, inspection_date, status | N/A (Table does not exist or not tracked) |
| **coa_documents** | `coa_documents` | document_url, document_type | N/A (Table does not exist or not tracked) |
