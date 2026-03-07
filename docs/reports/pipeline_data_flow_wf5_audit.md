# WF5 Audit: Pipeline Data Flow — Reads & Writes per Step
**Date**: March 7, 2026

This report audits every pipeline step across all 4 chains, documenting which columns each script **reads** and **writes**. The goal is to determine accurate data flow metadata for the admin drill-down UI.

## Evaluation Rubric

| Evaluation Vector | Criteria for Grade 'A' | Grade | Finding |
| :--- | :--- | :--- | :--- |
| **Write Accuracy** | UI shows only the columns each step actually writes | **FAIL** | Ingest steps show full table schema when they only write ~30 of 40+ columns. Enrichment steps show no read context. |
| **Read Context** | UI shows which columns a step reads to perform its work | **FAIL** | No read columns are shown at all. User cannot see what data feeds each transformation. |
| **Drift Risk** | Column metadata stays accurate as schema evolves | **B** | Current `writes` arrays are hardcoded and will drift. Reads are not tracked at all. |

## Recommendation: Script-Emitted Metadata

Hardcoding reads/writes arrays in `funnel.ts` will drift just like the old `fields` arrays did. Instead, each script should **emit its own metadata** via a `PIPELINE_META` stdout line (similar to existing `PIPELINE_SUMMARY`). The chain orchestrator already captures stdout — it can parse this line and write it to `pipeline_runs.records_meta`.

**Format:**
```
PIPELINE_META:{"reads":{"permits":["description","permit_type","scope_tags"]},"writes":{"permits":["project_type","scope_classified_at","scope_source"]}}
```

**Flow:**
1. Each script emits `PIPELINE_META:{...}` to stdout with its actual reads/writes
2. `run-chain.js` parses and stores in `pipeline_runs.records_meta` (alongside existing check results)
3. Stats API returns `records_meta` per step (already does this after our chain-mode fix)
4. UI renders reads/writes from live `records_meta` — zero hardcoding, zero drift

**Fallback:** Until a script emits `PIPELINE_META`, the UI falls back to showing the full target table schema (current behavior). Migration is incremental — each script can be updated independently.

---

## Complete Data Flow Audit

### Permits Chain (17 steps)

#### 1. `assert_schema` (pre-ingestion)
- **Reads:** CKAN API metadata endpoints (no DB reads)
- **Writes:** `pipeline_runs` (checks_passed, checks_failed)

#### 2. `permits` (ingest)
- **Source:** CKAN API
- **Writes to `permits`:** `permit_num`, `revision_num`, `permit_type`, `structure_type`, `work`, `street_num`, `street_name`, `street_type`, `street_direction`, `city`, `postal`, `geo_id`, `building_type`, `category`, `application_date`, `issued_date`, `completed_date`, `status`, `description`, `est_const_cost`, `builder_name`, `owner`, `dwelling_units_created`, `dwelling_units_lost`, `ward`, `council_district`, `current_use`, `proposed_use`, `housing_units`, `storeys`, `data_hash`, `raw_json`
- **ON CONFLICT updates:** `status`, `description`, `est_const_cost`, `data_hash`, `last_seen_at`, `raw_json`
- **Does NOT write:** `latitude`, `longitude`, `geocoded_at`, `neighbourhood_id`, `project_type`, `scope_tags`, `scope_classified_at`, `scope_source` (filled by later steps)

#### 3. `classify_scope_class` (via classify-scope.js)
- **Reads from `permits`:** `permit_num`, `revision_num`, `permit_type`, `structure_type`, `work`, `description`, `current_use`, `proposed_use`, `storeys`, `housing_units`, `dwelling_units_created`, `scope_classified_at`, `last_seen_at`
- **Writes to `permits`:** `project_type`, `scope_tags`, `scope_classified_at`, `scope_source`

#### 4. `classify_scope_tags` (same script: classify-scope.js)
- **Reads from `permits`:** same as step 3 (single script handles both)
- **Writes to `permits`:** same as step 3 (single script handles both)
- **Note:** Steps 3 and 4 are the same script execution. The pipeline registry treats them as separate conceptual steps.

#### 5. `classify_permits`
- **Reads from `permits`:** `permit_num`, `revision_num`, `permit_type`, `structure_type`, `work`, `description`, `status`, `est_const_cost`, `issued_date`, `current_use`, `proposed_use`, `scope_tags`, `last_seen_at`
- **Reads from `trade_mapping_rules`:** `id`, `trade_id`, `tier`, `match_field`, `match_pattern`, `confidence`, `phase_start`, `phase_end`, `is_active`
- **Writes to `permit_trades`:** `permit_num`, `revision_num`, `trade_id`, `tier`, `confidence`, `is_active`, `phase`, `lead_score`, `classified_at`

#### 6. `builders` (extract-builders.js)
- **Reads from `permits`:** `builder_name`
- **Writes to `entities`:** `legal_name`, `name_normalized`, `permit_count`, `last_seen_at`

#### 7. `geocode_permits`
- **Reads from `permits`:** `permit_num`, `revision_num`, `geo_id`, `latitude`, `longitude`
- **Reads from `address_points`:** `address_point_id`, `latitude`, `longitude`
- **Writes to `permits`:** `latitude`, `longitude`, `geocoded_at`

#### 8. `link_parcels`
- **Reads from `permits`:** `permit_num`, `revision_num`, `street_num`, `street_name`, `street_type`, `latitude`, `longitude`
- **Reads from `parcels`:** `id`, `addr_num_normalized`, `street_name_normalized`, `street_type_normalized`, `centroid_lat`, `centroid_lng`, `geometry`
- **Writes to `permit_parcels`:** `permit_num`, `revision_num`, `parcel_id`, `match_type`, `confidence`, `linked_at`

#### 9. `link_neighbourhoods`
- **Reads from `permits`:** `permit_num`, `revision_num`, `latitude`, `longitude`, `neighbourhood_id`
- **Reads from `neighbourhoods`:** `id`, `neighbourhood_id`, `name`, `geometry`
- **Reads from `parcels`:** `id`, `geometry` (fallback centroid when permit has no lat/lng)
- **Writes to `permits`:** `neighbourhood_id`

#### 10. `link_massing`
- **Reads from `parcels`:** `id`, `centroid_lat`, `centroid_lng`, `geometry`
- **Reads from `building_footprints`:** `id`, `geometry`, `footprint_area_sqm`, `centroid_lat`, `centroid_lng`
- **Writes to `parcel_buildings`:** `parcel_id`, `building_id`, `is_primary`, `structure_type`, `match_type`, `confidence`, `linked_at`

#### 11. `link_similar`
- **Reads from `permits`:** `permit_num`, `scope_tags`, `project_type`, `permit_type`
- **Writes to `permits`:** `scope_tags`, `project_type`, `scope_classified_at`, `scope_source`

#### 12. `link_coa`
- **Reads from `coa_applications`:** `id`, `application_number`, `street_num`, `street_name`, `ward`, `description`, `decision_date`, `linked_permit_num`
- **Reads from `permits`:** `permit_num`, `street_num`, `street_name`, `ward`, `issued_date`, `description` (FTS)
- **Writes to `coa_applications`:** `linked_permit_num`, `linked_confidence`, `last_seen_at`

#### 13. `link_wsib`
- **Reads from `wsib_registry`:** `id`, `trade_name_normalized`, `legal_name_normalized`, `linked_entity_id`
- **Reads from `entities`:** `id`, `name_normalized`, `permit_count`
- **Writes to `wsib_registry`:** `linked_entity_id`, `match_confidence`, `matched_at`
- **Writes to `entities`:** `is_wsib_registered`

#### 14. `enrich_wsib_builders`
- **Reads from `entities`:** `id`, `legal_name`, `primary_phone`, `primary_email`, `website`, `last_enriched_at`, `permit_count`
- **Reads from `wsib_registry`:** `trade_name`, `legal_name`, `mailing_address` (via JOIN)
- **Source:** Serper API (external web search)
- **Writes to `entities`:** `primary_phone`, `primary_email`, `website`, `last_enriched_at`
- **Writes to `builder_contacts`:** `builder_id`, `contact_type`, `contact_value`, `source`

#### 15. `enrich_named_builders` (same script: enrich-web-search.js with flag)
- Same reads/writes as step 14, filtered to non-WSIB entities

#### 16. `refresh_snapshot`
- **Reads from:** `permits`, `permit_trades`, `entities`, `permit_parcels`, `coa_applications`, `sync_runs`, `building_footprints`, `parcel_buildings`, `information_schema.columns`
- **Writes to `data_quality_snapshots`:** 56 columns (full table upsert)

#### 17. `assert_data_bounds` (post-ingestion)
- **Reads from:** `permits`, `parcels`, `address_points`, `building_footprints`, `neighbourhoods`, `coa_applications`
- **Writes:** `pipeline_runs` (checks_passed, checks_failed, checks_warned)

---

### CoA Chain (6 steps)

#### 1. `assert_schema` — same as permits chain step 1
#### 2. `coa` (load-coa.js)
- **Source:** CKAN API
- **Writes to `coa_applications`:** `application_number`, `address`, `street_num`, `street_name`, `ward`, `status`, `decision`, `decision_date`, `hearing_date`, `description`, `applicant`, `sub_type`, `data_hash`, `first_seen_at`, `last_seen_at`

#### 3. `link_coa` — same as permits chain step 12
#### 4. `create_pre_permits` — **read-only** (no writes)
- **Reads from `coa_applications`:** `decision`, `linked_permit_num`, `decision_date`, `ward`

#### 5. `refresh_snapshot` — same as permits chain step 16
#### 6. `assert_data_bounds` — same as permits chain step 17

---

### Entities Chain (2 steps + shared)

#### 1. `enrich_wsib_builders` — same as permits chain step 14
#### 2. `enrich_named_builders` — same as permits chain step 15

---

### Sources Chain (14 steps)

#### 1-2. `assert_schema` + `address_points`
- **Source:** CKAN API (CSV)
- **Writes to `address_points`:** `address_point_id`, `latitude`, `longitude`

#### 3-4. `parcels` + `compute_centroids`
- **parcels source:** CKAN API (CSV)
- **Writes to `parcels`:** `parcel_id`, `feature_type`, `address_number`, `linear_name_full`, `addr_num_normalized`, `street_name_normalized`, `street_type_normalized`, `stated_area_raw`, `lot_size_sqm`, `lot_size_sqft`, `frontage_m`, `frontage_ft`, `depth_m`, `depth_ft`, `geometry`, `date_effective`, `is_irregular`, `geom`
- **compute_centroids reads from `parcels`:** `id`, `geometry`
- **compute_centroids writes to `parcels`:** `centroid_lat`, `centroid_lng`

#### 5. `massing`
- **Source:** City Shapefile
- **Writes to `building_footprints`:** `source_id`, `geometry`, `footprint_area_sqm`, `footprint_area_sqft`, `max_height_m`, `min_height_m`, `elev_z`, `estimated_stories`, `centroid_lat`, `centroid_lng`

#### 6. `neighbourhoods`
- **Source:** City GeoJSON + Census XLSX
- **Writes to `neighbourhoods`:** `neighbourhood_id`, `name`, `geometry`, `geom`, `avg_household_income`, `median_household_income`, `avg_individual_income`, `low_income_pct`, `tenure_owner_pct`, `tenure_renter_pct`, `period_of_construction`, `couples_pct`, `lone_parent_pct`, `married_pct`, `university_degree_pct`, `immigrant_pct`, `visible_minority_pct`, `english_knowledge_pct`

#### 7. `load_wsib`
- **Source:** WSIB CSV
- **Writes to `wsib_registry`:** `legal_name`, `trade_name`, `legal_name_normalized`, `trade_name_normalized`, `mailing_address`, `predominant_class`, `naics_code`, `naics_description`, `subclass`, `subclass_description`, `business_size`, `last_seen_at`

#### 8-14. Remaining steps are shared with permits chain (geocode, link, classify steps)

---

## Conclusion

The current hardcoded approach cannot keep pace with schema evolution. The `PIPELINE_META` stdout approach is recommended: each script emits its own reads/writes metadata, the chain orchestrator stores it in `pipeline_runs.records_meta`, and the UI renders it live. This eliminates drift permanently and gives every step self-documenting data flow visibility.
