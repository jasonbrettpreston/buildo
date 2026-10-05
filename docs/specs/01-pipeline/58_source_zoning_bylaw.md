# Source: Toronto Zoning By-law (569-2013) — **v2.3**

**Version:** 2.3 — folds 5 CRITICAL + 14 HIGH + 10 MEDIUM findings from the v2.2 SPEC review (Gemini, DeepSeek, Independent, Observability).

## Cumulative design decisions (locked across v2 → v2.3)

- **D1 — Upsert key:** keep CKAN-assigned `_id` (mapped to `source_id`) with post-load orphan detection. Rationale: source updates annually (Phase 0 Q0.9); patch-not-rebuild is Toronto's convention.
- **D2 — Transaction architecture:** per-layer transactions (each of the 10 layer loads wrapped in its own `pipeline.withTransaction`). All queries within a layer MUST use the `client` parameter from `withTransaction` (F-C4).
- **D3 — Overlay fetch failure policy:** base-layer fetch failure halts the chain (FAIL verdict). Overlay fetch failure emits WARN + `<layer>_fetch_skipped: true` audit row + continues to next layer.
- **D4 — Overlay precedence (semantics):** overlay value REPLACES the base for parcels in the overlay. (The PER-ATTRIBUTE "most-restrictive" rule when multiple overlays overlap is deferred to WF2 per D7.)
- **D5 — Cross-WF atomicity:** simpler atomicity (no blue-green tables). Each layer commits independently; downstream consumers (WF2 enrich-parcels) must run AFTER `load_zoning` completes in the same chain. Within a single `chain_sources` run, steps are sequential — no concurrency risk. Concurrent chain runs are blocked by advisory locks.
- **D6 — Exception storage:** denormalized in `zoning_bylaw_areas` per Phase 0 finding. NO separate `zoning_exceptions` table.
- **D7 — Per-attribute most-restrictive rule:** OUT OF SCOPE for Spec 58. WF2 (`enrich-parcels.js`) defines the per-attribute logic when applying overlay overrides.

## v2.2 → v2.3 fold log (29 findings)

### CRITICAL folds (5)
- **F-C1 (DeepSeek):** Empty-set orphan delete → catastrophic data loss. **Added explicit count-guard** in §3 step 6: `IF loaded_count > 0 THEN DELETE` semantics. Skip the orphan delete when staging is empty.
- **F-C2 (DeepSeek):** `ST_DWithin` distance in degrees not meters (5° ≈ 555 km on SRID 4326). **Mandate `::geography` cast** for LineString overlay spatial joins. `ST_DWithin(parcels.geom::geography, road.geom::geography, road_overlay_distance_m)`.
- **F-C3 (Gemini):** Cross-WF transactional integrity → resolved per **D5** (simpler atomicity + operational caveat documented in §3 + §5).
- **F-C4 (Independent):** `client` scoping for staging temp table. **Added explicit mandate** in §3 step 6: ALL queries within a layer (CREATE TEMP TABLE, batched INSERT, UPSERT, DELETE) MUST use the `client` parameter passed by `withTransaction`. No `pool.query` within a layer.
- **F-C5 (Independent):** `ST_Contains` wrong predicate in §8c → **Changed to `ST_Intersects` + area-ranked dominant zone selection** for boundary parcels.

### HIGH folds (14)
- **F-H1 (Gemini):** Orphan threshold hardcoded `> 100 FAIL` brittle. **Changed to relative %**: `FAIL if orphans_removed_count > 2% of layer total record count`. Catches catastrophic drops without breaking on legitimate large rezonings.
- **F-H2 (Gemini → D7):** Per-attribute "most-restrictive" rule ambiguous → **deferred to WF2 per D7**. Spec 58 silent on per-attribute logic.
- **F-H3 (DeepSeek):** Schema drift policy overly strict. **Refined**: only abort on MISSING required columns; extra (unknown) columns emit WARN + continue.
- **F-H4 (Independent → D6):** `zoning_exceptions` table contradicts Phase 0 → **dropped per D6**. Denormalized exception_text returns to `zoning_bylaw_areas`.
- **F-H5 (Independent):** Parcels enrichment column naming → **renamed in §8a + §8c**: `parcels.coverage_max_pct` → `parcels.bylaw_max_coverage_pct`; `parcels.fsi_max` → `parcels.bylaw_max_fsi`; `parcels.height_max_m` → `parcels.bylaw_max_height_m`. Matches parent implementation plan + avoids column-name collision across 3 tables.
- **F-H6 (Independent):** GIST CONCURRENTLY clarification — **added explicit note** that migration creates indexes WITHOUT `CONCURRENTLY` (tables are empty at migration time; `CONCURRENTLY` fails inside migration-runner transaction blocks).
- **F-H7 (Independent):** `lead_parcels` mig 144 transitional status → **added note** in §8d: WF3 spec MUST verify which table exists (`lead_parcels` mirror vs direct `permit_parcels` join via `linked_permit_num`) before committing to a JOIN plan.
- **F-H8 (Independent):** §8e SQL silently excludes unclassified permits → **added comment** to the success-criterion SQL.
- **F-H9 (Observability):** Producer/Consumer Contract missing → **NEW §9** freezes the `records_meta.zoning_layers_loaded` key schema for downstream WFs.
- **F-H10 (Observability):** `dataset_version_age_days` semantics — measures publisher cadence not bylaw freshness → **added caveat** + threshold widened to `<= 450 INFO, 450-730 WARN, > 730 FAIL` (matches annual+slack cadence with backlog tolerance).
- **F-H11 (Observability):** Baseline window 14d incompatible with quarterly chain cadence → **widened to 400 days** for `_loaded_pct` comparisons. Excludes `no_op_refresh` rows from baseline lookup.
- **F-H12 (Observability):** Success-criterion enforcement gap → **mandate in §8d** that WF3 (`enrich-permits.js`) MUST emit `permits_zoning_class_coverage_pct` (FAIL `< 99` construction) and `coa_zoning_class_coverage_pct` (FAIL `< 95`) audit rows. End-objective gate now machine-enforced.
- **F-H13 (Observability):** OB-2 zero-coverage gate — `zoning_exceptions_loaded_count` removed (per D6); base-layer `zoning_areas_with_exceptions_count` becomes the relevant signal — added threshold `WARN if 50% below prior baseline`.
- **F-H14 (Observability):** Per-layer `<layer>_duration_ms` performance observability rows — **added 10 INFO rows** (1 per layer); WARN if `> 2× prior-load value`.
- **F-H15 (Observability):** Cross-WF tracing convention → **NEW §10** documents operator triage path across the 3-WF pipeline.

### MEDIUM folds (10)
- **F-M1 / F-M2 (Gemini):** `zoning_exceptions` orphan logic + FK policy → N/A per D6.
- **F-M3 (DeepSeek):** Partial-run sentinel for base-failure-after-committed-overlays. **Added** `records_meta.base_layer_committed_after_overlays_failed: true` flag when applicable.
- **F-M4 (DeepSeek):** HEAD skip-check robustness — **added fallback rule**: if cached `Last-Modified` value is older than `2× expected cadence` (730 days), force re-load anyway.
- **F-M5 (DeepSeek):** NULL-count baseline cascading — **added baseline-from-known-good rule**: compare against `_baseline_null_count` stored in `records_meta` on first successful production run (operator-acknowledged baseline).
- **F-M6 (Independent):** Staging double-write cost — **clarified in §3 step 6** that the implementation MAY use `RETURNING source_id` collection instead of interleaved staging INSERT (both within the same `client`/transaction).
- **F-M7 (DeepSeek):** `source_id` type validation — **added** explicit cast / validation in load loop; log skip with clear error if CKAN `_id` is not an integer.
- **F-M8 (Independent):** Column-name collision risk — addressed by F-H5 rename (`bylaw_max_*` on `parcels`).
- **F-M9 (Gemini LOW):** LineString validation explicit predicate — **specified**: `ST_Length(geom) > 0 AND ST_IsSimple(geom)`.
- **F-M10 (Gemini LOW):** `objectid TEXT` likely wrong type — **changed to** `objectid INTEGER` for the 4 tables where OBJECTID appears (Building Setback, Parking Zone, Priority Retail, QueenStW Eat). Phase 0 caveat retained for verification at implementation.

---

<requirements>
## 1. Goal & User Story

**End objective:** every permit and CoA application in our database is decorated with its applicable zoning data — zone class, coverage max, FSI max, height max, overlays (heritage, TRCA, etc.). When an operator opens a lead detail page, they see the full regulatory context for that property at a glance; when the cost model computes GFA estimates, it has bylaw-anchored coverage/FSI inputs available per permit.

**Data flow to achieve that objective:**
```
Toronto CKAN zoning-by-law (10 layers)
        ↓ THIS SPEC (Spec 58) — ingest layers into 10 tables (D6: NO separate exceptions table)
zoning_bylaw_areas + 9 overlay tables (one row per zone polygon)
        ↓ FUTURE SPEC: enrich-parcels.js — spatial join parcels.geom ↔ zone polygons
parcels.zoning_class, .bylaw_max_coverage_pct, .bylaw_max_fsi, .bylaw_max_height_m,
       .is_heritage (Spec 59), .in_trca_regulated (Spec 61), .on_major_street (Spec 63), etc.
        ↓ FUTURE SPEC: enrich-permits.js — JOIN through permit_parcels / lead_parcels
permits.zoning_class, permits.applicable_bylaws (jsonb), permits.overlay_summary (jsonb)
coa_applications.zoning_class, coa_applications.variance_context (jsonb)
        ↓ CONSUMERS
- Phase 3 cost model: reads bylaw_max_coverage_pct / bylaw_max_fsi from permits
- Lead detail UI: displays applicable_bylaws + overlay_summary per lead
- Reporting / analytics: filters by zone class, exception number, heritage status, etc.
```

**Spec 58's scope (this WF):** the FIRST arrow only — ingest Toronto's 10 zoning sub-layers into 10 dedicated tables. Pure data-loading spec.

**Out of scope (separate WFs that consume this spec's output):**
- `enrich-parcels.js` (parcels enrichment) — separate spec, FUTURE WF
- `enrich-permits.js` (permits + CoA enrichment via permit_parcels / lead_parcels JOINs) — separate spec, FUTURE WF
- Spec 64 (Toronto Design Standards constants) — parallel WF
- Phase 3 cost-model integration — separate WF, after enrichment lands

Phase 0 architecture discovery (`docs/reports/wf1-spec58-architecture-discovery.md`) confirmed the dataset publishes numeric bylaw rules (`COVERAGE`, `FSI_TOTAL`, etc.) directly per polygon; no bylaw-text parsing is required.

**Success criterion for the end-to-end objective:** after all 3 WFs land (Spec 58 ingest + enrich-parcels + enrich-permits), every active construction permit has a populated `zoning_class` + `bylaw_max_coverage_pct` + `bylaw_max_fsi` field. End-objective machine gates are mandated as WF3 audit rows (see §8d + F-H12).
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **CKAN package** | `zoning-by-law` (id `34927e44-fc11-4336-a8aa-a0dfb27658b7`) |
| **Publisher** | City of Toronto, City Planning Division |
| **Last refresh** | 2026-02-20 (covers amendments through June 18, 2023) |
| **Refresh policy** | "As available" — effectively annual; quarterly chain checks via `chain_sources` overfetch with skip-check (§3 step 0a) |
| **Formats** | CKAN publishes Shapefile ZIP / GeoJSON / GeoPackage / CSV — all **EPSG:4326** — but the loader acquires via the **CKAN DataStore API layers (`_id` upsert key)**, NOT a Shapefile/GeoJSON ZIP download (see D8). |
| **Script** | `scripts/load-zoning.js` (NEW — implemented in follow-up WF) |
| **Lock** | 58 (§A.5) |
| **Licence** | [Toronto Open Government Licence](https://open.toronto.ca/open-data-license/) |

### Sub-layer resource map

| Layer | CKAN resource id | Records | Geometry | Spec table |
|---|---|---|---|---|
| **Zoning Area** (base) | `76a2620f-a6b4-495d-8e41-c0ede1f8a928` | 11,719 | Polygon | `zoning_bylaw_areas` |
| Zoning Policy Area Overlay | `1a6469f8-1eaf-4ba6-a1f6-07179efbc2f2` | 352 | Polygon | `zoning_policy_area_overlay` |
| Zoning Policy Road Overlay | `4e2f9292-6082-4627-be8e-61b87a2cb273` | 8,913 | **LineString** | `zoning_policy_road_overlay` |
| Zoning Rooming House Overlay | `75b9805b-bc65-4c30-97fa-9c57c17233b2` | 558 | Polygon | `zoning_rooming_house_overlay` |
| Zoning Height Overlay | `f0a88d06-2430-4025-b15d-362cabd00f31` | 2,528 | Polygon | `zoning_height_overlay` |
| Zoning Lot Coverage Overlay | `58ad8814-ca4e-43d6-848d-d5fd8d873574` | 1,242 | Polygon | `zoning_lot_coverage_overlay` |
| Parking Zone Overlay | `8f969df7-9008-49fd-a50b-df53f1f680e6` | 913 | Polygon | `zoning_parking_zone_overlay` |
| Zoning Building Setback Overlay | `8d75cab6-ab97-4158-8ba5-8874860b26f7` | TBD-impl | Polygon | `zoning_building_setback_overlay` |
| Zoning Priority Retail Street Overlay | `499de5f6-194a-4da3-a18f-27a8e684721d` | 643 | **LineString** | `zoning_priority_retail_overlay` |
| Zoning QueenStW Eat Community Overlay | `1f18bd73-bbbc-4ad6-ac27-6c9cae7385b4` | 4 | Polygon | `zoning_queenstw_eat_overlay` |

Total ~27,000 records across all 10 layers. Per-layer transactions; no streaming required.

**Coverage caveat:** base zoning has gaps for parks, federal land, utility corridors, ravines. WF2 `enrich-parcels.js` MUST handle parcels not intersecting any base zoning.

### Target Table 1: `zoning_bylaw_areas` (base layer) — D6 denormalized exceptions

| Column | Type | Source | Constraints |
|---|---|---|---|
| `id` | SERIAL | n/a | PK |
| `source_id` | INTEGER UNIQUE NOT NULL | `_id` | Upsert key (D1) |
| `gen_zone` | INTEGER | `GEN_ZONE` | |
| `zn_zone` | TEXT NOT NULL | `ZN_ZONE` | CHECK length ≤ 20 |
| `zn_string` | TEXT NOT NULL | `ZN_STRING` | CHECK length ≤ 50 |
| `zn_holding` | TEXT | `ZN_HOLDING` | |
| `holding_id` | INTEGER | `HOLDING_ID` | |
| `frontage_min_m` | NUMERIC(8,2) | `FRONTAGE` | CHECK `>= 0` |
| `area_min_sqm` | INTEGER | `ZN_AREA` | CHECK `>= 0` |
| `units_max` | INTEGER | `UNITS` | CHECK `>= 0` |
| `density_max` | NUMERIC(10,2) | `DENSITY` | CHECK `>= 0` |
| **`coverage_max_pct`** | NUMERIC(5,2) | `COVERAGE` | CHECK `BETWEEN 0 AND 100`; Phase 3 input |
| **`fsi_max`** | NUMERIC(6,3) | `FSI_TOTAL` | CHECK `>= 0`; Phase 3 input |
| `pct_commercial_max` | NUMERIC(5,2) | `PRCNT_COMM` | CHECK `BETWEEN 0 AND 100` |
| `pct_residential_max` | NUMERIC(5,2) | `PRCNT_RES` | CHECK `BETWEEN 0 AND 100` |
| `pct_employment_max` | NUMERIC(5,2) | `PRCNT_EMMP` | CHECK `BETWEEN 0 AND 100` |
| `pct_office_max` | NUMERIC(5,2) | `PRCNT_OFFC` | CHECK `BETWEEN 0 AND 100` |
| `exception_number` | INTEGER | `EXCPTN_NO` | NULL if none. **No FK per D6 (denormalized)** |
| `exception_text` | TEXT | `ZN_EXCPTN` | NULL if none — D6 denormalized in base |
| `bylaw_chapter` | TEXT | `ZBL_CHAPT` | e.g., `"10.20"` |
| `bylaw_section` | TEXT | `ZBL_SECTN` | |
| `bylaw_exception_ref` | TEXT | `ZBL_EXCPTN` | |
| `standard_setback` | NUMERIC(8,2) | `STAND_SET` | CHECK `>= 0` (F-M10: future-proof) |
| `zone_status` | INTEGER | `ZN_STATUS` | |
| `area_units` | NUMERIC(10,2) | `AREA_UNITS` | |
| `geometry` | JSONB NOT NULL | source GeoJSON | Raw |
| `geom` | GEOMETRY(MultiPolygon, 4326) NOT NULL | `ST_Multi(ST_GeomFromGeoJSON(...))` (handles single-part) | GIST-indexed |
| `source_dataset_version` | TIMESTAMPTZ | CKAN `last_modified` | Sub-day precision |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | n/a | |

**PK:** `(id)`. **Upsert key:** `(source_id) DO UPDATE` per D1. **Orphan detection:** staging-table CTE pattern with empty-set guard (F-C1) — see §3 step 6.

### Target Tables 2-10: Overlay tables (each has `id`, `source_id`, `geometry`, `geom`, `source_dataset_version`, `created_at`)

| Table | Layer-specific columns | Constraints |
|---|---|---|
| `zoning_height_overlay` | `ht_stories INTEGER CHECK >= 0`, `ht_string TEXT`, `height_max_m NUMERIC(8,2) CHECK >= 0` (from `HT_LABEL`) | |
| `zoning_lot_coverage_overlay` | `coverage_max_pct_override NUMERIC(5,2) CHECK BETWEEN 0 AND 100` (from `PRCNT_CVER`) | |
| `zoning_building_setback_overlay` | `objectid INTEGER` (F-M10), `zn_string TEXT`, `ch600_area_type INTEGER`, `bylaw_section_link TEXT` | |
| `zoning_policy_area_overlay` | `policy_id TEXT`, `chapter_200_ref TEXT`, `exception_link TEXT` | |
| `zoning_policy_road_overlay` | `road_name TEXT` **— `geom GEOMETRY(MultiLineString, 4326) NOT NULL`** | |
| `zoning_rooming_house_overlay` | `rmh_area TEXT`, `rmg_hs_no INTEGER`, `rmg_string TEXT`, `chapter_150_25_ref TEXT` | |
| `zoning_parking_zone_overlay` | `objectid INTEGER` (F-M10), `zn_parkzone TEXT` | |
| `zoning_priority_retail_overlay` | `objectid INTEGER` (F-M10), `zn_string TEXT`, `ch600_line_type INTEGER`, `linear_name_full_legal TEXT`, `bylaw_section_link TEXT` **— `geom GEOMETRY(MultiLineString, 4326) NOT NULL`** | |
| `zoning_queenstw_eat_overlay` | `objectid INTEGER` (F-M10), `zn_string TEXT`, `ch600_area_type INTEGER`, `bylaw_section_link TEXT` | |

**Overlay field-name caveat:** field names derived from Phase 0 CKAN `datastore_search`. Implementation MUST re-fetch each overlay's schema before freezing `REQUIRED_ATTR_COLUMNS`.

### Indexing

All 10 tables get GIST indexes on `geom`. **F-H6: indexes created WITHOUT `CONCURRENTLY`** — new tables are empty at migration time; `CONCURRENTLY` fails inside migration-runner transactions.

```sql
CREATE INDEX idx_zoning_bylaw_areas_geom ON zoning_bylaw_areas USING GIST (geom);
-- + 9 overlay GIST indexes
```

Non-spatial indexes on base layer:
- `zoning_bylaw_areas (zn_zone)` — zone-class lookups
- `zoning_bylaw_areas (exception_number) WHERE exception_number IS NOT NULL` — Chapter 900 queries
- `zoning_bylaw_areas (bylaw_chapter)` — Spec 64 join path

### Overlay Precedence Rule (D4 + D7)

Where an overlay polygon spatially intersects a parcel, the overlay value REPLACES the base value for that attribute. **The per-attribute "most-restrictive" rule when multiple overlays overlap is deferred to WF2 (`enrich-parcels.js`) per D7.** Spec 58 ingests raw overlay data; precedence-resolution logic lives in the future enrichment spec.

### Cross-WF atomicity (D5)

Each layer commits independently. The chain sequencing in `chain_sources` (Spec 43) guarantees `load_zoning` completes before WF2 `enrich-parcels` runs. Concurrent chain runs are blocked by advisory locks (Spec 47 §R6). **Operational caveat:** if `chain_sources` is manually re-triggered while a `permits` chain (which consumes WF2 enriched parcels) is running, the consumer MAY see partial-load state. Mitigation: chain orchestrator should serialize chain runs that share producer/consumer dependencies.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic

**Step 0a: Fast skip-check.** ONE CKAN `package_show` (package `34927e44-fc11-4336-a8aa-a0dfb27658b7`) returns every resource's `last_modified` (falling back to the package's `metadata_modified`); each layer's version is compared with `records_meta.zoning_layer_versions[<layer>]` of the most-recent successful `load_zoning` run in chain `sources`. If all 10 are unchanged (and no stored version is older than the 730-day window, F-M4) → emit the gated-skip summary (`no_op_refresh: true`; the prior run's five §9 keys re-emitted) and exit. A `package_show` failure fails the step by name before any `datastore_search` (LZ-D6). *(Corrected as-built at batch-2 row 3.3 ②, LZ-D10: this step used to say "HEAD each CKAN resource URL"; the loader has always used one `package_show`.)*

**F-M4 fallback:** if cached `Last-Modified` is older than `2× expected cadence` (730 days), force re-load even if HEAD unchanged.

**Step 0b: Advisory lock.** Acquire lock 58 via `pipeline.withAdvisoryLock(pool, 58, async () => {...})`.

**Per-layer processing (D2 — each layer in its own `pipeline.withTransaction(client, async () => {...})`):**

**F-C4: ALL queries within a layer MUST use the `client` parameter from `withTransaction`** — never `pool.query`. The temp staging table is created on `client`'s connection and invisible to a different connection.

1. **Paginate the CKAN DataStore API** (`datastore_search` per layer `resourceId`; `_id` upsert key; EPSG:4326 GeoJSON geometry) — NOT a Shapefile ZIP download (D8). On HTTP error (404/503/truncated) → record `<layer>_fetch_error` audit row + emit `<layer>_fetch_skipped: true`. Base → FAIL+abort whole load (D3). Overlay → WARN+skip layer (D3).
2. **Schema drift check** via `scripts/lib/zoning-attr-drift.js`: compare the DataStore field schema against frozen `REQUIRED_ATTR_COLUMNS`. **F-H3: only abort if a REQUIRED column is missing**; unknown extra columns emit `<layer>_attr_drift` WARN but DO NOT abort the layer.
3. **Stream-parse polygons.** Validate per row:
   - Polygon layers: `ST_IsValid(geom)`. If invalid → attempt `ST_MakeValid`; if repaired → `<layer>_repaired_polygon_count` (INFO). If still invalid → skip + `<layer>_invalid_polygon_count`.
   - LineString layers (F-M9): `ST_Length(geom) > 0 AND ST_IsSimple(geom)`. Wrap in `ST_Multi`.
4. **F-M7: `source_id` type validation** — explicit cast to INTEGER; if CKAN `_id` is non-integer (unexpected), log skip with clear error.
5. **Batched UPSERT** via `ST_Multi(ST_GeomFromGeoJSON(...))` (handles single-part inputs) → `ON CONFLICT (source_id) DO UPDATE` with `IS DISTINCT FROM` guards (Spec 47 §6.4).
6. **Orphan detection — staging-table CTE pattern with empty-set guard (F-C1, F-C4):**

   ```sql
   -- Step 6a: create per-layer staging temp table on `client` (NOT `pool.query`)
   CREATE TEMP TABLE zoning_<layer>_staging (source_id INTEGER NOT NULL) ON COMMIT DROP;

   -- Step 6b: populate staging during UPSERT loop (interleaved INSERT)
   --   OR (F-M6 alternative): collect from UPSERT's RETURNING xmax + source_id
   INSERT INTO zoning_<layer>_staging VALUES ($1), ($2), ...;

   -- Step 6c: F-C1 EMPTY-SET GUARD — skip DELETE if staging is empty
   --   (prevents `WHERE source_id NOT IN (empty)` from wiping the entire table)
   DO $$
   BEGIN
     IF (SELECT COUNT(*) FROM zoning_<layer>_staging) > 0 THEN
       WITH loaded_ids AS (SELECT source_id FROM zoning_<layer>_staging)
       DELETE FROM zoning_<layer>
        WHERE source_id NOT IN (SELECT source_id FROM loaded_ids);
     ELSE
       -- emit `<layer>_orphan_delete_skipped: true` audit row
       NULL;
     END IF;
   END $$;
   ```

   Threshold for orphan count audit row (**F-H1 relative %**):
   - INFO if `orphans_removed_count ≤ 0.5%` of layer total record count
   - WARN if `0.5% < orphans_removed_count ≤ 2%`
   - FAIL if `> 2%` (catches catastrophic drops; legitimate large rezonings should bump it but not exceed 2% in a single quarter)

7. **NULL-column tracking** for BASE only: `coverage_max_pct_null_count`, `fsi_max_null_count`, `frontage_min_m_null_count`. **F-M5: compare against `_baseline_null_count` stored in `records_meta` on first known-good production run** (operator-acknowledged baseline) — not the immediately-prior run (avoids cascade).

**Cross-layer wrap-up:**
- Set `records_meta.zoning_partial_load`: `false` if all 10 layers loaded; `{ missing_layers: ["...", ...] }` if any overlay skipped.
- Set `records_meta.zoning_layers_loaded`: `{ base: true, height_overlay: true, lot_coverage_overlay: false, ... }` — full per-layer success map per §9 Producer/Consumer Contract.
- **F-M3 base-failure-after-overlay sentinel:** if base layer fails after one or more overlays already committed, set `records_meta.base_layer_committed_after_overlays_failed: true` so operator can identify the partial state.
- Emit `PIPELINE_SUMMARY` with verdict cascade across all audit rows (Spec 47 §8.2).

### Edge Cases

- **Polygon parcels split across multiple zones:** OUT OF SCOPE — `enrich-parcels.js` handles spatial join via `ST_Intersects` + area-ranked selection (NOT `ST_Contains` — F-C5).
- **Chapter 900 exceptions:** embedded in base via `EXCPTN_NO`, `exception_text`, `ZN_STRING` per D6.
- **Overlay overrides (D4):** overlay value REPLACES base in `enrich-parcels.js`; per-attribute resolution deferred to WF2 (D7).
- **LineString geometry layers (Policy Road, Priority Retail Street):** stored as `GEOMETRY(MultiLineString, 4326)`. **F-C2:** future `enrich-parcels.js` MUST use `ST_DWithin(parcels.geom::geography, road.geom::geography, road_overlay_distance_m)` — `::geography` cast is mandatory for meter-based distance. Without it, SRID 4326 interprets `road_overlay_distance_m = 5` as 5 DEGREES (≈ 555 km), completely breaking the spatial join.
- **CKAN HTTP 404 / 503 / truncated download (F-H4):** distinct `<layer>_fetch_error` audit row. Base → FAIL+abort chain; overlay → WARN+skip layer.
- **Source dataset version unchanged:** Step 0a `package_show` skip-check exits early (F-M4 force-reload after 730d if cache stale).
- **First deploy:** spike runbook artifact required per Spec 48 §3.7 — see §4.
- **Empty resource (CKAN returns 0 rows):** for base = FAIL via `zoning_areas_loaded_count == 0` OB-2 gate. For overlay = WARN. **F-C1 empty-set guard prevents orphan delete from wiping target table.**
- **Schema drift — unknown extra column (F-H3):** WARN, do not abort. Only missing REQUIRED columns abort.

### Observability (Spec 47 §8.2 row-derived cascade + Spec 48 §3.6 dual-pattern)

**Base layer rows (`zoning_bylaw_areas`):**

| metric | threshold | status semantics |
|---|---|---|
| `zoning_areas_loaded_count` | `> 1000` | FAIL if `== 0` (OB-2 zero-coverage gate); INFO otherwise |
| `zoning_areas_with_exceptions_count` | n/a + prior-baseline check | INFO; WARN if `50%` below prior baseline (F-H13) |
| `zoning_areas_distribution_top20` | n/a | INFO; capped at top-20 + `_truncated_class_count`, `_other_count` per Spec 47 §8.4 |
| `zoning_areas_invalid_polygon_count` | `== 0 / 1-50 OR ≤ 0.5% / > 50 OR > 0.5%` | INFO / WARN / FAIL |
| `zoning_areas_repaired_polygon_count` | n/a | INFO (F-H10 from v2; LineString attribute-loss caveat per F-M9-related) |
| `zoning_areas_unchanged_skipped` | n/a | INFO (UPSERT no-op via IS DISTINCT FROM) |
| `zoning_areas_orphans_removed_count` | INFO ≤ 0.5%; WARN ≤ 2%; FAIL > 2% (F-H1 relative) | |
| `zoning_areas_orphan_delete_skipped` | n/a | INFO if true (F-C1 — empty staging triggered skip; usually means upstream issue) |
| `zoning_areas_loaded_pct` (vs baseline within last 400 days, excluding `no_op_refresh` rows — F-H11) | PASS `>= 95%`; WARN `90-95%`; FAIL `< 90%`; first run / no baseline → INFO + `_no_baseline: true` | |
| `zoning_areas_attr_drift` | required-missing → FAIL on base; extra columns → WARN (F-H3) | |
| `zoning_areas_fetch_error` | n/a; FAIL on base (D3) | only emitted if fetch failed |
| `zoning_areas_duration_ms` (F-H14) | n/a + 2× prior comparison | INFO; WARN if `> 2× prior-load value` |
| `coverage_max_pct_null_count` (F-M5) | WARN if `> 10%` above `_baseline_null_count` | |
| `fsi_max_null_count` | same | |
| `frontage_min_m_null_count` | same | |
| `dataset_version_age_days` (F-H10: measures publisher cadence, not bylaw freshness — see caveat below) | INFO `<= 450`; WARN `450-730`; FAIL `> 730` | |
| `dataset_source_license` | n/a | INFO; one row per `load_zoning` step execution (M10); value = license URL |

**`dataset_version_age_days` semantics caveat (F-H10):** this metric measures CKAN publisher refresh cadence (`last_modified` timestamp), NOT semantic bylaw amendment freshness. Toronto's 2026-02-20 refresh covered June 2023 amendments — a ~2.5-year semantic backlog inside a fresh-looking technical timestamp. Operators MUST cross-reference the dataset description's `amendments through <date>` for true bylaw freshness.

**Per-overlay rows (×9, replacing `<layer>` with the overlay name):**

| metric (per overlay) | threshold | status |
|---|---|---|
| `<layer>_loaded_count` | INFO; no FAIL on zero (sparse by design) | |
| `<layer>_loaded_pct` (vs baseline within last 400 days — F-H11) | PASS `>= 95%`; WARN `90-95%`; FAIL `< 90%`; no baseline → INFO + `_no_baseline: true` | |
| `<layer>_invalid_polygon_count` | INFO if 0; WARN if > 0 |
| `<layer>_repaired_polygon_count` | n/a INFO |
| `<layer>_orphans_removed_count` | INFO ≤ 0.5%; WARN ≤ 2%; FAIL > 2% (F-H1 relative) |
| `<layer>_orphan_delete_skipped` | INFO if true (F-C1) |
| `<layer>_attr_drift` | required-missing → WARN+skip layer (D3); extras → WARN+continue (F-H3) |
| `<layer>_fetch_error` | WARN if fetch failed (D3) |
| `<layer>_fetch_skipped` | WARN if true (D3) |
| `<layer>_duration_ms` (F-H14) | INFO; WARN if `> 2× prior` |

**Total audit rows:** ~17 base + 9 × 10 = ~107 per run. Well within Spec 47 §8.4's 200-item cap for embedded arrays.

**Verdict cascade (Spec 47 §8.2):** `auditRows.some(r => r.status === 'FAIL') ? 'FAIL' : auditRows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'`.

**Counter compliance (Spec 47 §11.1/§11.2):**
- `records_total / _new / _updated` reflect ONLY base layer counts.
- Per-overlay counts emit as named audit_table rows per §11.2 Overflow Rule.

### emitMeta contract (per Spec 47 §R11)

Reads + writes column lists are concrete per Phase 0 confirmation. Implementation MUST re-verify overlay column names before freezing.

```js
pipeline.emitMeta(
  {
    'ckan:zoning-area': ['_id', 'GEN_ZONE', 'ZN_ZONE', 'ZN_STRING', 'ZN_HOLDING', 'HOLDING_ID', 'FRONTAGE', 'ZN_AREA', 'UNITS', 'DENSITY', 'COVERAGE', 'FSI_TOTAL', 'PRCNT_COMM', 'PRCNT_RES', 'PRCNT_EMMP', 'PRCNT_OFFC', 'ZN_EXCPTN', 'EXCPTN_NO', 'STAND_SET', 'ZN_STATUS', 'AREA_UNITS', 'ZBL_CHAPT', 'ZBL_SECTN', 'ZBL_EXCPTN', 'geometry'],
    'ckan:zoning-height-overlay': ['_id', 'HT_STORIES', 'HT_STRING', 'HT_LABEL', 'geometry'],
    'ckan:zoning-lot-coverage-overlay': ['_id', 'PRCNT_CVER', 'geometry'],
    'ckan:zoning-building-setback-overlay': ['_id', 'OBJECTID', 'ZN_STRING', 'CH600_AREA_TYPE', 'BYLAW_SECTIONLINK', 'geometry'],
    'ckan:zoning-policy-area-overlay': ['_id', 'POLICY_ID', 'CHAPT_200', 'EXCPTN_LK', 'geometry'],
    'ckan:zoning-policy-road-overlay': ['_id', 'ROAD_NAME', 'geometry'],
    'ckan:zoning-rooming-house-overlay': ['_id', 'RMH_AREA', 'RMG_HS_NO', 'RMG_STRING', 'CHAP150_25', 'geometry'],
    'ckan:zoning-parking-zone-overlay': ['_id', 'OBJECTID', 'ZN_PARKZONE', 'geometry'],
    'ckan:zoning-priority-retail-overlay': ['_id', 'OBJECTID', 'ZN_STRING', 'CH600_LINE_TYPE', 'LINEAR_NAME_FULL_LEGAL', 'BYLAW_SECTIONLINK', 'geometry'],
    'ckan:zoning-queenstw-eat-overlay': ['_id', 'OBJECTID', 'ZN_STRING', 'CH600_AREA_TYPE', 'BYLAW_SECTIONLINK', 'geometry'],
  },
  {
    // D6: zoning_exceptions table dropped; exception_text embedded in base
    zoning_bylaw_areas: ['source_id', 'gen_zone', 'zn_zone', 'zn_string', 'zn_holding', 'holding_id', 'frontage_min_m', 'area_min_sqm', 'units_max', 'density_max', 'coverage_max_pct', 'fsi_max', 'pct_commercial_max', 'pct_residential_max', 'pct_employment_max', 'pct_office_max', 'exception_number', 'exception_text', 'bylaw_chapter', 'bylaw_section', 'bylaw_exception_ref', 'standard_setback', 'zone_status', 'area_units', 'geometry', 'geom', 'source_dataset_version'],
    zoning_height_overlay: ['source_id', 'ht_stories', 'ht_string', 'height_max_m', 'geometry', 'geom', 'source_dataset_version'],
    zoning_lot_coverage_overlay: ['source_id', 'coverage_max_pct_override', 'geometry', 'geom', 'source_dataset_version'],
    zoning_building_setback_overlay: ['source_id', 'objectid', 'zn_string', 'ch600_area_type', 'bylaw_section_link', 'geometry', 'geom', 'source_dataset_version'],
    zoning_policy_area_overlay: ['source_id', 'policy_id', 'chapter_200_ref', 'exception_link', 'geometry', 'geom', 'source_dataset_version'],
    zoning_policy_road_overlay: ['source_id', 'road_name', 'geometry', 'geom', 'source_dataset_version'],
    zoning_rooming_house_overlay: ['source_id', 'rmh_area', 'rmg_hs_no', 'rmg_string', 'chapter_150_25_ref', 'geometry', 'geom', 'source_dataset_version'],
    zoning_parking_zone_overlay: ['source_id', 'objectid', 'zn_parkzone', 'geometry', 'geom', 'source_dataset_version'],
    zoning_priority_retail_overlay: ['source_id', 'objectid', 'zn_string', 'ch600_line_type', 'linear_name_full_legal', 'bylaw_section_link', 'geometry', 'geom', 'source_dataset_version'],
    zoning_queenstw_eat_overlay: ['source_id', 'objectid', 'zn_string', 'ch600_area_type', 'bylaw_section_link', 'geometry', 'geom', 'source_dataset_version'],
  },
  ['CKAN'],
);
```

### Chain-failure propagation contract (D3)

- **Base layer failure** → FAIL → chain HALTS per Spec 43 stop-on-failure. Downstream `enrich-parcels.js` cannot run.
- **Overlay failure** → WARN → chain CONTINUES. `<layer>_fetch_skipped: true` audit row emitted. Downstream reads `records_meta.zoning_layers_loaded` (per §9) for which layers are stale.
</behavior>

---

<testing>
## 4. Testing Mandate

Implementation WF MUST produce:

- **Logic tests** (`src/tests/zoning.logic.test.ts`):
  - Polygon parsing (valid + invalid via `ST_IsValid` + `ST_MakeValid` repair)
  - LineString parsing + `ST_Multi` wrap + `ST_IsSimple` check (F-M9)
  - Attribute-schema drift detection — only abort on missing-required (F-H3)
  - Idempotent re-run (records_unchanged ≈ records_total)
  - Per-layer column mapping
  - `last_modified` HEAD skip-check + 730d fallback (F-M4)
  - **F-C1 empty-staging guard test:** simulate layer returning 0 rows; verify target table NOT wiped
- **Infra tests** (`src/tests/zoning-bylaw-areas.regression.test.ts`):
  - Migration applied (10 tables + GIST indexes + CHECK constraints) — NO `zoning_exceptions` per D6
  - `bylaw_chapter` non-spatial index present
  - GIST indexes on all 10 geom columns
- **DB integration test** (`src/tests/db/zoning.db.test.ts`, gated by `BUILDO_TEST_DB=1`):
  - Live `client.query(sql, [sampleRow])` for each table — **F-C4 verify temp-table visibility on same client**
  - Orphan detection: insert dummy, re-run, confirm orphan removed
  - **F-C1 verification:** orphan delete skipped when staging empty
- **First-deploy spike runbook** (`docs/runbook/58_zoning_first_deploy_spike.md`):
  - **Spike shape:** ~27K INSERT spike (base 11,719 + ~15K overlays); per-layer breakdown; `records_unchanged > 99%` steady-state target within 1 run.
  - **Pre-ack instrument:** template text for `docs/reports/observe-chain-acknowledgements.md`.
  - **Exit criteria SQL:** `SELECT count(*) FROM zoning_bylaw_areas WHERE coverage_max_pct IS NOT NULL` within ±5% of Phase 0's 11,719 (subject to legitimate null rate).

Every test file MUST include the SPEC LINK header.
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `load_zoning` — INGESTOR · converted · owner specs: 58
  - `scripts/load-zoning.js`
  - `scripts/load-zoning.descriptor.json`
  - `scripts/load-zoning.notes.json`
  - `scripts/lib/compute/load-zoning.js`
  - `src/tests/steps/load_zoning/violations.test.ts`
  - data (descriptor): `zoning_building_setback_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_bylaw_areas` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_height_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_lot_coverage_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_parking_zone_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_policy_area_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_policy_road_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_priority_retail_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_queenstw_eat_overlay` writes (migrations/164_zoning_bylaw_tables.sql); `zoning_rooming_house_overlay` writes (migrations/164_zoning_bylaw_tables.sql)
  - upstream: none
  - downstream: none
  - consumers: enrich_parcels (records_meta zoning_layers_loaded) · enrich_parcels (records_meta zoning_partial_load) · load_zoning (records_meta zoning_layer_versions)
<!-- /generated:target-files -->
- `scripts/lib/zoning-attr-drift.js`
- `scripts/lib/geometry-validator.js`
- `migrations/NNN_zoning_bylaw_tables.sql` (10 tables + GIST + CHECK + non-spatial indexes — NO `zoning_exceptions` per D6)
- `scripts/manifest.json` entry for `load_zoning`
- Edit to `docs/specs/01-pipeline/43_chain_sources.md` adding `load_zoning` step
- Edit to `scripts/seeds/logic_variables.json` adding `road_overlay_distance_m` (default 5; **MUST be used with `::geography` cast per F-C2**)
- `docs/runbook/58_zoning_first_deploy_spike.md`
- 3 test files per §4

### Out-of-Scope Files
- Any cost-model code — Phase 3 of cost-estimation roadmap
- Any UI code — Phase 2 of cost-estimation roadmap
- Other source loaders (Spec 55, 56, etc.)
- `scripts/enrich-parcels.js` — separate spec
- `parcel_zoning_intersections` join table — owned by future enrich-parcels spec
- `scripts/enrich-permits.js` — separate spec
- Toronto Design Standards — Spec 64
- `permit_parcels` / `lead_parcels` table modifications — owned by Spec 41 / 42 / 55

### Cross-Spec Dependencies
- **Spec 43** (`chain_sources`) — adds `load_zoning` step in implementation WF
- **Spec 47** (`pipeline_script_protocol`) — R1-R12; §6.4 IS DISTINCT FROM; §6.6 polygon pre-validation; §8.1/§8.2/§8.4 audit_table; §10/§11.1/§11.2 counters; §R6 advisory lock; §R11 emitMeta
- **Spec 48** (`pipeline_observability`) — §3.6 cascade; §3.7 spike runbook
- **Spec 56** (`source_massing`) — structural reference (Shapefile-from-CKAN-ZIP pattern). Phase 0 confirmed Spec 58 does NOT need `ST_Transform`.
- `scripts/load-permits.js` — chain-sequencing context only (`load_zoning` completes before WF2 `enrich-parcels` runs, §1); permits/coa columns are written by the future `enrich-permits.js` WF3, not this loader.
- `scripts/load-parcels.js` — join target only; `parcels` columns are written by the future `enrich-parcels.js` (already Out-of-Scope Files above), not this loader.
- **Spec 67** (`67_maxbuild_bylaw_derivation.md`) — MaxBuild derivation methodology + scenarios; traces every by-law input it uses back to this spec's tables (§2) and mirrors §13 (generator-asserted byte-equality).
- Edit to `scripts/quality/assert-schema.js` adding 10 zoning resource URL checks — moved from Target Files: owned by another spec (census `owner_specs`), which now lists it in its generated block

### Consumer Dep
- **Spec 55** (`source_parcels`) — `enrich-parcels.js` (future spec) spatially joins parcels against this spec's tables. Not a direct dep of Spec 58.
</constraints>

---

<copyright>
## 6. License & Attribution

- **Source license:** [Toronto Open Government Licence](https://open.toronto.ca/open-data-license/)
- **Attribution:** "Contains information licensed under the Open Government Licence – Toronto."
- **Audit traceability:** Spec 58 implementation MUST emit ONE `dataset_source_license` INFO row per `load_zoning` step execution.
- **CKAN caveat:** `package_show` API returns `license_title: null`; the dataset page is authoritative.
</copyright>

---

## 7. Discovery report cross-reference

Phase 0 discovery: `docs/reports/wf1-spec58-architecture-discovery.md` (2026-05-25). Source of all schema decisions in §2.

---

## 8. Implementation plan

### 8a. Three-WF sequence to reach the end objective

```
WF1: INGEST (this spec)                    WF2: PARCEL ENRICH                   WF3: PERMIT + COA ENRICH
─────────────────────────                  ───────────────────                  ────────────────────────
load-zoning.js                       →     enrich-parcels.js              →    enrich-permits.js
└─ 10 layer tables                         └─ adds columns to parcels:         └─ adds columns to permits:
                                              .zoning_class                       .zoning_class
                                              .bylaw_max_coverage_pct (F-H5)      .applicable_bylaws (jsonb)
                                              .bylaw_max_fsi (F-H5)               .overlay_summary (jsonb)
                                              .bylaw_max_height_m (F-H5)       └─ adds columns to coa_applications:
                                              .is_heritage (Spec 59)              .zoning_class
                                              .in_trca_regulated (Spec 61)        .variance_context (jsonb)
                                              .on_major_street (Spec 63)          (base_zoning_class DROPPED — Spec 66: redundant copy of .zoning_class)
                                              .corner_lot (Spec 62)
```

Each downstream WF is its own ceremony. WFs MUST be implemented in order; WF2 cannot run without WF1's tables; WF3 cannot run without WF2's enriched parcels.

### 8b. WF1 (this spec) — implementation deliverables

1. Migration creating all 10 layer tables + GIST + CHECK + non-spatial indexes (NO `zoning_exceptions` per D6; F-H6 no `CONCURRENTLY`)
2. `scripts/load-zoning.js` (per-layer transactions per D2; `client` scoping per F-C4; empty-set orphan guard per F-C1)
3. `scripts/lib/zoning-attr-drift.js` — only abort on missing-required (F-H3)
4. `scripts/lib/geometry-validator.js` — `ST_IsValid` + `ST_MakeValid` + LineString `ST_IsSimple` (F-M9)
5. All test files per §4
6. `docs/runbook/58_zoning_first_deploy_spike.md`
7. `scripts/manifest.json` entry for `load_zoning`
8. Edit to Spec 43 (`chain_sources`) adding `load_zoning` step
9. Edit to `scripts/quality/assert-schema.js` adding 10 zoning resource URL checks
10. Edit to `scripts/seeds/logic_variables.json` adding `road_overlay_distance_m` constant (used WITH `::geography` cast per F-C2)

### 8c. WF2 — `enrich-parcels.js` → **AUTHORED: `docs/specs/01-pipeline/65_enrich_parcels.md` (v1.0, 2026-05-31)**

Adds columns to `parcels` via spatial join. **F-C5: use `ST_Intersects(parcel.geom, zone.geom)` with area-ranked dominant-zone selection** — NOT `ST_Contains` (which only matches fully-contained parcels and misses boundary lots).

The full WF2 design now lives in **Spec 65**, which resolves D7 (the per-attribute precedence rule deferred from this spec) and consumes the §9/§11 producer contract below. Spec 65 highlights:
- Migration 165 maps the **full bylaw feed** onto `parcels` (F-H5 naming: `bylaw_max_coverage_pct`, `bylaw_max_fsi`, `bylaw_max_height_m`, …) — see Spec 65 §2 column map.
- **D7 resolved (Spec 65 DEC-1):** identity attrs ← area-dominant base zone; overlays REPLACE base per-attribute (D4); same-attribute overlaps → ceiling MIN / floor MAX + conflict audit row + candidates in `zoning_overlays` jsonb.
- **F-C2:** LineString overlays use `ST_DWithin(parcels.geom::geography, road.geom::geography, road_overlay_distance_m)` — `::geography` cast mandatory.
- Gap handling (parcels with no base zone) + ambiguity flag + the new `enrich_parcels` `chain_sources` step (after `load_zoning`).
- **Gate reality (Spec 65 DEC-4, profiled 2026-05-31):** `zoning_class` ≈ 96.8% (hard gate ≥95%); `fsi` ≈ 5.1% / `coverage` ≈ 56.7% / `height` ≈ 89.8% are sparse-by-design INFO rows (per D10), NOT ≥90% gates.

### 8d. WF3 (future spec — NOT this WF) — `enrich-permits.js`

Adds columns to `permits` and `coa_applications` via JOIN through `permit_parcels` / `lead_parcels` to enriched parcels.

**F-H7 — `lead_parcels` transitional check:** the CoA JOIN path via `lead_parcels` assumes Spec 42's mig 143-144 mirror triggers are still in place. If Spec 42's legacy-table drop phase has executed before WF3 is implemented, WF3 MUST use `permit_parcels` via `linked_permit_num` as primary path, with `lead_parcels` as fallback for CoA-only data. WF3 spec authoring MUST verify which tables exist.

**AUTHORED: `docs/specs/01-pipeline/66_enrich_permits.md` (v1.0, 2026-05-31).** Highlights (full design in Spec 66):
- Migration adding `permits.zoning_class`, `.bylaw_max_*`, `.exception_number`, `.applicable_bylaws jsonb`, `.overlay_summary jsonb` (+ provenance). `.lot_configuration` DEFERRED (corner-lot = Spec 62).
- Migration adding `coa_applications.zoning_class`, `.bylaw_max_*`, `.exception_number`, `.variance_context jsonb` (+ provenance). **`base_zoning_class` DROPPED** — a redundant copy of `zoning_class` with no variance-decision history; the full base snapshot lives in `variance_context`.
- `scripts/enrich-permits.js` — ONE script, two chain modes (`ENRICH_TARGET=permits|coa`, lock 66), **always-full relational join** (no incremental — the join is ~5 s).
- **DEC (Spec 66): join CoA on the stored `coa_applications.lead_id`** (not a re-derived `'coa:'||application_number`).
- **F-H12 gates calibrated (Spec 66 spike): permits/CoA `zoning_class` coverage is ~84% achievable, NOT 99/95** (5.5% no-link + ~10% gap-parcel). Gates FAIL below 80% (regression catch); thresholds in `_contracts.json`.
- JOIN paths verified per F-H7 transitional check
- Multi-parcel project handling — dominant zone by area; full zone list as jsonb
- **F-H12 — End-objective machine gates: WF3 MUST emit:**
  - `permits_zoning_class_coverage_pct` (FAIL `< 99` for construction permits) audit row
  - `coa_zoning_class_coverage_pct` (FAIL `< 95`) audit row
  These ARE the end-to-end success-criterion enforcement; they cannot be advisory text only.

### 8e. End-to-end success criterion

After WF1 + WF2 + WF3 all land in production:

```sql
-- All active construction permits have zoning data
-- F-H8 NOTE: this filter excludes permit_types not present in permit_type_classifications
--          (treated as non-construction). Run a separate audit if new unclassified
--          permit_types may exist:
--          SELECT permit_type, COUNT(*) FROM permits WHERE permit_type NOT IN
--            (SELECT permit_type FROM permit_type_classifications) GROUP BY 1;
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE zoning_class IS NOT NULL) / COUNT(*), 1) AS pct_with_zoning,
  ROUND(100.0 * COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NOT NULL) / COUNT(*), 1) AS pct_with_coverage,
  ROUND(100.0 * COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL) / COUNT(*), 1) AS pct_with_fsi
FROM permits p
LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
WHERE COALESCE(ptc.class, 'unclassified') = 'construction';

-- Target: pct_with_zoning >= 99% (matches F-H12 audit row); pct_with_coverage / pct_with_fsi >= 90%
```

For CoA:
```sql
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE zoning_class IS NOT NULL) / COUNT(*), 1) AS pct_with_zoning
FROM coa_applications;
-- Target: pct_with_zoning >= 95%
```

These targets are MACHINE-ENFORCED via the WF3 audit rows per F-H12 — not advisory text.

---

## 9. Producer/Consumer Contract (F-H9 NEW)

Frozen contract between Spec 58 (producer of zoning tables + `records_meta.zoning_layers_loaded`) and the future WF2 `enrich-parcels.js` (consumer).

### `records_meta` shape (Spec 58 writes; downstream reads)

```json
{
  "zoning_layers_loaded": {
    "base": true,
    "height_overlay": true,
    "lot_coverage_overlay": true,
    "building_setback_overlay": true,
    "policy_area_overlay": true,
    "policy_road_overlay": true,
    "rooming_house_overlay": true,
    "parking_zone_overlay": true,
    "priority_retail_overlay": true,
    "queenstw_eat_overlay": true
  },
  "zoning_partial_load": false,
  "source_dataset_version": "2026-02-20T21:25:57Z",
  "base_layer_committed_after_overlays_failed": false
}
```

When `zoning_partial_load` is truthy: `{ "missing_layers": ["height_overlay", "..." ] }`.

### Key naming convention (FROZEN)

The 10 keys in `zoning_layers_loaded` use snake_case matching the table name minus `zoning_` prefix:
- `base` — for `zoning_bylaw_areas`
- `height_overlay`, `lot_coverage_overlay`, `building_setback_overlay`, `policy_area_overlay`, `policy_road_overlay`, `rooming_house_overlay`, `parking_zone_overlay`, `priority_retail_overlay`, `queenstw_eat_overlay`

### Consumer read protocol (WF2 enrich-parcels.js MUST follow)

1. Read `pipeline_runs.records_meta` for most-recent successful `load_zoning` step in chain `sources`.
2. For each layer with `zoning_layers_loaded[<key>] === true`: perform spatial join.
3. For each layer with `zoning_layers_loaded[<key>] === false`: skip that overlay; degrade gracefully (use base value only OR emit a `<layer>_overlay_stale` audit row).
4. If `base === false`: HALT — WF2 cannot proceed without base zoning.
5. If `base_layer_committed_after_overlays_failed === true`: WF2 SHOULD emit operator-visible warning that base zoning is consistent but some overlays are stale from a partial load.

This contract is FROZEN — any future change requires a new spec version + producer/consumer coordination.

---

## 10. Cross-WF Tracing Convention (F-H15 NEW)

When an operator triages a permit missing `zoning_class` after WF3 lands, follow this triage path:

```
1. Query pipeline_runs for most-recent successful chain='sources' run.
2. Inspect step='load_zoning' (this spec):
     - records_meta.zoning_layers_loaded.base === false?  → root cause IS HERE (Spec 58 base failure)
     - records_meta.zoning_partial_load truthy?           → check which overlays missing
3. Inspect step='enrich_parcels' (WF2 — future):
     - audit row 'parcels_with_zone_class_pct' < 95%?     → root cause IS WF2 spatial-join failure
4. Inspect step='enrich_permits' (WF3 — future):
     - audit row 'permits_zoning_class_coverage_pct' FAIL → root cause IS WF3 JOIN failure (likely permit_parcels missing)
```

This convention is FROZEN: any modification requires updating the admin lead detail page debug surface so operators can follow the triage path interactively.

---

## 11. Implementation deltas (WF6 — 2026-05-30; supersede earlier text where they conflict)

Landed during implementation + 4 adversarial review rounds + the first-deploy spike.

- **D8 — Acquisition = CKAN DataStore API, NOT Shapefile ZIP (R-C1).** The D1 upsert key `_id` is injected only by `datastore_search`; shapefiles lack it. `load-zoning.js` paginates `datastore_search` per the §2 resource-map `resourceId`s. §2's "downloads SHP ZIP" / `Script` rows are superseded. `geometry` arrives as a GeoJSON string → `ST_GeomFromGeoJSON` (downstream geom handling unchanged).
- **D9 — Out-of-range = null-the-cell, NOT reject-the-row (refines P-H5).** Toronto encodes "not regulated" as a pervasive `-1` sentinel (`FSI_TOTAL`, `PRCNT_*`, `STAND_SET`, `FRONTAGE`…); the §2 CHECK constraints forbid it. Policy: null the offending cell (faithful "no value" — neither clamp nor row-drop), keep the row, count `<layer>_out_of_range_nulled_count` (INFO). Reject-the-row would discard ~100% of base rows.
- **D10 — §4 exit-criterion correction.** `coverage_max_pct` is **null on every base row** in the live source (Toronto leaves `COVERAGE` blank; coverage lives in `zoning_lot_coverage_overlay.coverage_max_pct_override`). The end-objective gate must assert `fsi_max` (the populated base cost input, ~2,835 non-null) + `lot_coverage_overlay` rows, NOT base `coverage_max_pct`. See runbook §2.
- **§3 new audit rows (declared for Spec 79 C4):** `<layer>_out_of_range_nulled_count` (INFO), `<layer>_null_geometry_count` (WARN if >0), `<layer>_non_integer_source_id_count` (WARN if >0).
- **§9 additive key:** `records_meta.zoning_layer_versions` `{ <key>: last_modified }` — per-layer skip-check baseline (the single `source_dataset_version` is base-only). Additive; the frozen 4 keys unchanged. Skip-runs forward the full §9 contract from the prior successful run.

### 11.1 batch-2 row 3.3 ② (2026-10-03) — `load-zoning.js` converted onto the Spec 122 INGESTOR runner (multi-primary 0x + all-primaries CKAN gate 0y)

What was a 753-line `pipeline.run` loader is now the frozen shell `scripts/load-zoning.js` (`ADVISORY_LOCK_ID = 58` kept as a §5.4 source-text constant) + `scripts/load-zoning.descriptor.json` (declared data) + `scripts/lib/compute/load-zoning.js` (the column vocabulary, the coercions, the §9 block, one observer per check) + `scripts/load-zoning.notes.json`. The legacy text survives verbatim as the oracle `src/tests/steps/load_zoning/fixtures/legacy-load-zoning.js.txt` that the red suite executes. Assessment: `docs/reports/2026-10-02-batch2-p3-3-load-zoning-assessment.md`.

- **Ten primaries → ten targets (0x, RE-FREEZE #29; 0y, RE-FREEZE #30).** `inputs.reads.externals[]` = the ten layers, `id` = the legacy layer key (so the §9 sub-keys match), `kind: "http_api"`, `format: "ckan_datastore"`, `ckan.{resource_id, package_url, page_size_from_config}`, `key_property: "_id"`. ONE unscoped `staleness.trigger` (`style: "ckan_metadata"`, `emit_key: "zoning_layer_versions"`, `max_age_days_from_config: "load_zoning_force_reload_max_age_days"`) with `skip_scope: "all_primaries"` reproduces R2-12 + F-M4; `recovery.interrupted: "force_full_on_next_run"` forces the next run to load after a kill between two layer transactions. The base declares no `on_failure` (abort_step — D3), every overlay `warn_row_continue` (a failed overlay is the library row `primary_failed:<layer>` WARN and the run continues).
- **Writes.** Per layer a class-B `upsert_scoped_departure_delete` keyed on `source_id` (`INTEGER`), guard = the data columns + `geometry` + `geom` — NOT `source_dataset_version` (H5; LZ-D2 carried); policy_road + priority_retail declare `geometry_kind: "multiline"` + `line_validity: "length_and_simple"` (F-M9, 0z1). One transaction per layer (`execution.txn_scope: "batch"`, ten per load). The reject-all dedupe (R2-17), D9 null-the-cell and the strict HT_LABEL parse (R2-16) are compute; the geometry validation is the library's (one statement per layer, LZ-D18).
- **Layer dispatch (② decision Q1).** The runner's `shapeRecord` seam carries no external id, so one `shapeRecord` tells a record's layer by its own CKAN fields (the first layer whose column set has a field no other layer's has); building_setback and queenstw_eat share an identical field set and shape identically.
- **Attribute drift (② decision Q2).** Drift is read from each layer's first raw record (`acquired.record_fields`, 0y; LZ-D3 carried); a missing required field is a pre_write gate — `zoning_areas_attr_drift` FAIL aborts before any overlay, `zoning_overlay_attr_drift` WARN with `on_warn: "skip_write"` skips that overlay; a later record missing a mapped field loads with that cell NULL. Extra columns WARN (`zoning_attr_drift_extra_columns`) and never abort (F-H3). An empty (or all-discarded) base fails the pre_write gate `zoning_areas_loaded_count` (OB-2).
- **Contract unchanged.** The five §9 keys (`zoning_layers_loaded`, `zoning_partial_load`, `source_dataset_version`, `zoning_layer_versions`, `base_layer_committed_after_overlays_failed`) keep their shapes; counters stay base-only (P-C1) from `written.by_target.zoning_bylaw_areas`. A gated skip re-emits the prior run's five keys; a re-emitted key that is missing, null or not its declared type (incl. a prior `zoning_partial_load` object) now LOADS (LZ-D17).
- **Audit rows.** The legacy metric names are kept (`zoning_areas_*` for the base, `<layer>_*` for an overlay) and every declared check emits on every run. Changed: the conditional per-layer rows for extra columns, non-integer `_id`, null geometry, overlay duplicates and orphan-delete skips are one aggregate row each with per-layer detail; the ten `<layer>_duration_ms` rows are one run-level `zoning_duration_ms`; the invalid-polygon band gains its percentage row `zoning_areas_invalid_polygon_pct`; the distribution's truncation counters ride the context row `zoning_areas_distribution_top20_truncation`; a passing bounded row reads PASS (legacy INFO).
- **Fifteen logic variables (LZ-D5 closed; Spec 124 Rule 3, all `on_invalid: "fail"`, admin group "Source Ingestion"):** `load_zoning_datastore_page_size` 10000, `load_zoning_http_timeout_ms` 60000 (a whole-request deadline replacing the 30 s socket-idle timeout, LZ-D15), `load_zoning_orphan_warn_pct` 0.5, `load_zoning_orphan_fail_pct` 2, `load_zoning_loaded_pct_warn_below` 95, `load_zoning_loaded_pct_fail_below` 90, `load_zoning_dataset_age_warn_days` 450, `load_zoning_dataset_age_fail_days` 730, `load_zoning_force_reload_max_age_days` 730, `load_zoning_null_count_warn_over_pct` 10, `load_zoning_with_exceptions_warn_below_pct` 50, `load_zoning_duration_warn_factor` 2, `load_zoning_base_invalid_polygon_warn_max_count` 50, `load_zoning_base_invalid_polygon_warn_max_pct` 0.5, `load_zoning_distribution_top_n` 20. The legacy redirect cap is struck, not registered (LZ-D14).
- **Declared deviations / limitations (descriptor).** Deviations: LZ-D11 standalone ledger name, LZ-D13 dropped `?? storedVersion` fallback, LZ-D14 redirect cap, LZ-D15 deadline, LZ-D16 millisecond clock, LZ-D17 re-emit type check, LZ-D18 single validation statement, LZ-D12 on the thrown-overlay path (null version, fail-safe), LZ-D6 package_show fails by name, LZ-D19 base failure through the runner's failure terminal, LZ-D1 measured `unchanged`, the audit-row set, the base empty / all-discarded gate, the shaped-row distribution. Limitations: LZ-D2, LZ-D3, LZ-D4, LZ-D7, LZ-D8, LZ-D20.
- **Force seam parity.** The ① legacy seam `ZONING_FORCE_RELOAD=1` (15d69d04) is the converted `override.force_run`; the WARN check `zoning_override_force_reload_present` reproduces the legacy row, so the forced PRE and POST captures carry the same row.

### 11.2 batch-2 row 3.3 ③ (2026-10-05) — `load_zoning` CUTOVER

`[as-built 2026-10-05, row 3.3 ③]` CUTOVER (`npm run cutover -- --step=load_zoning`): `scripts/load-zoning.js` is registered in
`scripts/steps/_schema/converted.json` (27th converted step; its `pending[]` entry deleted in the same commit, leaving `pending[]`
empty) and the census row is RETAINED with `status: converted`, `converted_at: commit-3`, `batch: "pending"` kept verbatim
(Spec 124 R-K, R-AO). It is the **9th** converted INGESTOR and the first multi-primary CKAN DataStore one (10 primaries → 10 targets).

- **No seam pairs.** `inputs.reads.steps` is `[]`; the seam-pair registry does not move.
- **Consumer registry (gate D)** gains the generated producer rows for the §9 contract: `load_zoning → enrich_parcels`
  (`records_meta zoning_layers_loaded`, `records_meta zoning_partial_load`) and `load_zoning → load_zoning`
  (`records_meta zoning_layer_versions`, self-read by the all-primaries gate, 0y).
- **assert_schema probe lists** gain the 15 `load_zoning_*` logic variables (probe_presence +
  `declared_logic_variables_present.expect`), so the assert_schema POST goldens are recaptured with this commit.
- **`step_timeout` stays declared-not-wired.** The descriptor declares `execution.step_timeout "15m"`;
  `manifest.scripts.load_zoning` carries no `step_timeout_minutes`, so the slug stays in
  `execution-budget-disposition.json` `step_timeout.pending` until a cloud run measures the converted step (Spec 124 R-AQ).
- **Class lock (pct checks report a value).** `src/tests/steps/pct-checks-evaluate.logic.test.ts` resolves this step's
  observer-TABLE dispatch (`observerFor` → `named(id, fn)`); every pct observer reports `value` (or the INERT constant), never a
  `violations` flag.

## 12. Known Failure Modes

- **-1 sentinel mass-rejection** (caught: spike 2026-05-30). Reject-the-row on out-of-range nukes all base rows because `-1` is pervasive. Guard: D9 null-the-cell + `zoning.logic.test.ts` range tests.
- **Chain-step registration cascade** (caught: review + full suite). Adding a step to `manifest.chains.sources` MUST also update `FreshnessTimeline.tsx` (`PIPELINE_REGISTRY` + sources steps), `funnel.ts` (`STEP_DESCRIPTIONS`, `PIPELINE_TABLE_MAP`, `LOADER_SLUGS`), the §A.5 advisory-lock registry test, the `LOGIC_VAR_DEFAULTS`/`EXPECTED_LOGIC_VAR_KEYS` parity (if a logic-var is added), and the count assertions in `chain.logic.test.ts`/`quality.logic.test.ts` — else the suite goes red. Guard: those tests pin the coupling.
- **DataStore `_id` vs shapefile** (caught: review R2). A loader built against DataStore field semantics must acquire via DataStore, not shapefiles. Guard: D8.

## 13. By-law envelope provisions — PLANNED, NOT IMPLEMENTED

> **Status: PLANNED (QUEUED, not authorized).** Nothing in this section is built. It records the by-law-exact envelope fields that `enrich_parcels` (Spec 65) will derive from this spec's zoning tables once `.cursor/wf2_bylaw_formula_fixes_active_task.md` passes its plan ceremony. Today's `enrich_parcels` still uses the flat `SETBACK_DEFAULTS`/`COVERAGE_DEFAULTS` zone-class constants. The tables below are copied verbatim from that plan (2026-09-29); the plan stays the source of record for the numeric test vectors (V1–V25), the execution plan and the open operator decisions. Research: `docs/reports/parcel-columns-buyer-lot-report-derivation.md`. Prerequisite for the major-street branches (NF-10/NF-11): `.cursor/wf3_policy_road_overlay_distance_fix_active_task.md` (`parcels.on_policy_road`, fed by this spec's `zoning_policy_road_overlay`, is near-dead at `road_overlay_distance_m = 5`).

> **Derivation methodology:** how these provisions turn into MaxBuild figures (as-built vs planned, worked scenarios, by-law claim verification, Spec 58 source tracing) is in `docs/specs/01-pipeline/67_maxbuild_bylaw_derivation.md` (Spec 67), whose generator asserts this section stays byte-identical to the plan.

### New fields to add — FULL TABLE, ported verbatim from the source report (not summarized)

| ID | Field | By-law claim (exact citation) | Type | Formula / source | Constraints | Basis companion |
|---|---|---|---|---|---|---|
| NF-1 | `bylaw_min_front_setback_m` | §10.20.40.70(1)/§10.40.40.70/§10.60.40.70/§10.80.40.70(1) — "the required minimum front yard setback... is 6.0 metres"; §10.5.40.70(1) — averaging when a qualifying neighbour exists | numeric | **PRECEDENCE — RESOLVED WITH REASONING, 2026-09-28 (a distinct, lower confidence tier than this report's verbatim-quoted findings — see caveat).** `COALESCE(STAND_SET, averaging_result, 6.0)` — this ordering is now grounded, not a guess: confirmed via search that Chapter 900 exceptions in this by-law use explicit "despite" language to override general provisions (e.g. *"Despite Regulations 15.5.40.10, the height of a building or structure is..."* — the standard, confirmed drafting pattern for a site-specific exception in 569-2013). `STAND_SET` sits in the base zoning-area schema immediately after `EXCPTN_NO`/`ZN_EXCPTN`, strongly suggesting it is populated precisely when a Chapter 900 exception modifies the front setback. Since §10.5.40.70(1) (averaging) is itself just another general provision with no stated immunity from being overridden, "specific overrides general" supports a real Chapter 900 `STAND_SET` value winning over the averaging calculation. **Caveat, stated honestly:** no direct clause was found saying "averaging does not apply when a Chapter 900 exception governs" — this is resolved by a confirmed general mechanism plus a reasonable schema-position inference, not a verbatim override sentence. Treat as resolved-enough-to-implement but flag for a final human/legal sanity check before shipping. | Averaging applies only when an abutting lot's building fronts the SAME street AND is within 15.0m of the subject lot; all four zones (RD/RS/RT/RM) | `'stand_set'` \| `'bylaw_default_6m'` \| `'averaged_neighbour'` |
| NF-2 | `bylaw_min_rear_setback_m` | RD §10.20.40.70(2), RS §10.40.40.70, RM §10.80.40.70(2) — "the greater of: (A) 7.5 metres; or (B) 25% of the lot depth"; RT §10.60.40.70 — "the required minimum rear yard setback in the RT zone is 7.5 metres" (flat, no depth term) | numeric | `GREATEST(7.5, 0.25 × depth_m)` for RD/RS/RM; `7.5` flat for RT | Zone-specific — RT does NOT use the depth-percentage term (verbatim-confirmed absence) | `'bylaw_formula_floor'` \| `'bylaw_formula_pct_depth'` \| `'bylaw_formula_rt_flat'` |
| NF-3 | `bylaw_min_side_setback_m` | RD §10.20.40.70(3)(A)-(G) 7-band table; RS §10.40.40.70(3)(A)-(E); RT §10.60.40.70(3)(A)(B)(i-iv,vi) — clause (v) verbatim-confirmed as "(Deleted by By-law 648-2025)", the (iv)→(vi) jump is correct as written; RM §10.80.40.70(3)(A)(B)(C) for detached/semi/apartment, PLUS §10.80.40.70(4)(C) for townhouse | numeric | RD: 7-band `CASE` on `frontage_m` (0.6→3.0m). RS: 4-band `CASE` flattening at 1.5m for `frontage_m ≥ 15`, else 1.8m if non-residential use. RT: `CASE WHEN building_type IN ('detached','semi_detached','houseplex') OR (building_type='townhouse' AND all_units_front_street) THEN 0.9 ELSE 7.5 END`. RM (CORRECTED — reality-check caught the original formula lumping townhouse into the 2.4m apartment bucket with no citation): `CASE building_type WHEN 'detached' THEN 1.2 WHEN 'semi_detached' THEN 1.5 WHEN 'townhouse' THEN (CASE WHEN all_units_front_street THEN 0.9 ELSE 7.5 END) ELSE 2.4 END`. **Open question surfaced by this correction: §10.80.40.70(4) is headed "...for Residential Buildings on Major Streets" — the 0.9m/7.5m townhouse value may be confirmed ONLY for RM lots abutting a major street; an off-major-street RM townhouse's side setback was not found in any fetch. Do not assume without re-checking.** | RT/RM branches require `building_type` (NF-15) populated — NULL means this formula cannot resolve. **Fallback-philosophy decision required before implementation: match EF-5's "NULL, don't guess" approach (recommended) rather than silently falling back to the old flat constant** — since NF-15 has no auto-population path, this fix will likely be inert for the large majority of RT/RM parcels in practice; state that plainly in any consuming UI. | `'bylaw_formula_tier_<band>'` (RD/RS) \| `'bylaw_formula_by_type_<type>'` (RT/RM) \| `'bylaw_nonresidential_1.8m'` (RS) |
| NF-4 | `bylaw_min_flankage_setback_m` | **RESOLVED, 2026-09-28: not a separate provision.** §10.20.40.70(6) verbatim: "Despite regulation 10.20.40.70(3) and (4), for a corner lot in the RD zone, the required minimum side yard setback from a side lot line abutting a street is 3.0 metres, if: (A) the required minimum lot frontage... is 12.0 metres or more; and (B) there is an adjacent lot fronting on the street abutting the side lot line." Confirmed for RD; RS/RT/RM presumed to carry an analogous corner-lot clause, NOT yet independently verified. | numeric | `CASE WHEN is_corner_lot AND frontage_m >= 12.0 AND <adjacent-lot-on-flanking-street condition> THEN 3.0 ELSE bylaw_min_side_setback_m (NF-3) END` — "flankage" is not its own formula, it's a corner-lot override of the side-setback formula, falling back to NF-3 when the two conditions don't both hold | Condition (B) ("an adjacent lot fronting the street") needs its own derivation — likely `EXISTS` a neighbouring parcel on that flanking street, not yet traced to an existing column | `'corner_flankage_3m'` \| same basis as NF-3 when the override doesn't apply |
| NF-5 | `bylaw_setback_averaging_applied` | §10.5.40.70(1) — same citation as NF-1's averaging branch | boolean | `TRUE` when NF-1 resolved via the averaging branch, else `FALSE` | Must be consistent with NF-1's basis companion (`'averaged_neighbour'` ⟺ `TRUE`) — a mechanical cross-check | — |
| NF-6 | `existing_front_setback_m` | Not a by-law citation — an engineering prerequisite FOR §10.5.40.70(1) (NF-1): averaging requires reading a neighbour's actual built setback, which nothing currently measures | numeric | `ST_Distance(primary_building_front_wall, front_lot_line)`, same `ST_OrientedEnvelope`/EPSG:2952 projected-metres technique as `existing_width_m`/`existing_length_m` (Spec 65 §5 existing-structure pass) | Requires a linked primary building (same gate as the existing-structure pass); inherits its mislink guard | `'massing_measured'` — inherits the existing-structure pass's ±20-38% imagery error band |
| NF-7 | `bylaw_max_height_basis` | §10.20.40.10(1)/§10.40.40.10(1)/§10.60.40.10(1) — "...10.0 metres"; §10.80.40.10(1)(B) — "(i) 10.0 metres, for a detached house or semi-detached house; and (ii) 12.0 metres, for any other building" | text | Records which branch of the EF-5 height fix fired | RD/RS/RT can only be `'overlay'` or `'bylaw_default_10m'`; RM can additionally be `'bylaw_default_12m'` — a `'bylaw_default_12m'` value on a non-RM zone is a contradiction, should never occur | ∈ `{'overlay','bylaw_default_10m','bylaw_default_12m'}` |
| NF-8 | `bylaw_max_coverage_basis` | §10.20.30.40(1)(B)/§10.40.30.40/§10.60.30.40/§10.80.30.40 — "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | text | `CASE WHEN bylaw_max_coverage_pct IS NOT NULL THEN 'overlay_mapped' ELSE 'unregulated' END` | Purely derived from an already-existing column — no new join required | ∈ `{'overlay_mapped','unregulated'}` |
| NF-9 | `bylaw_max_fsi_basis` | §10.20.40.40(1)(B)/§10.40.40.40(1)/§10.60.40.40(1)/§10.80.40.40(1) — "the floor space index is not limited by this regulation" | text | `CASE WHEN bylaw_max_fsi IS NOT NULL THEN 'zone_label_mapped' ELSE 'unregulated' END` | Same as NF-8 | ∈ `{'zone_label_mapped','unregulated'}` |
| NF-10 | `bylaw_max_building_length_m` | RD §10.20.40.20(1) "17.0 metres"; RS §10.40.40.20 (same); RM §10.80.40.20 (same + major-street exceptions); RT §10.60.40.20(1) — "If a lot abuts a major street, the permitted maximum building length is: (A) 19.0... (B) 25.0..." (no base-case clause exists, confirmed via full section-number enumeration) | numeric | RD/RS/RM: `17.0` baseline, `19.0` (townhouse)/`25.0` (apartment) if `on_major_street`. RT: `NULL` unless `on_major_street`, then `19.0`/`25.0` — RT has no base-case value, confirmed absence | **`on_major_street` — RESOLVED to a specific existing signal, blocked on a prerequisite fix (2026-09-28, orchestrator-grounded).** By-law §800.50(457) verbatim: "'Major Street' = any street identified as 'Major Streets' on the Policy Areas Overlay Map found in Section 995.10." That exact map is already ingested as `zoning_policy_road_overlay` (Spec 58, 8,913 lines) and already surfaced as `parcels.on_policy_road` (`enrich-parcels.js#buildEnrichmentSql`, `ST_DWithin` against `road_overlay_distance_m`). **But the flag is currently dead**: only 8 of 331,684 RD/RS/RT/RM parcels read `true`, because `road_overlay_distance_m=5` while road centrelines sit ~10m+ from lot lines (the laneway-detection code elsewhere uses 20m for the same kind of proximity test). See `wf3_policy_road_overlay_distance_fix_active_task.md` — a prerequisite WF3, not this WF2 — for the fix. `on_major_street` = `parcels.on_policy_road` once that lands. | `'bylaw_default_17m'` \| `'major_street_19m'` \| `'major_street_25m'` \| `'rt_no_base_cap'` |
| NF-11 | `bylaw_max_building_depth_m` | RD §10.20.40.30(1); RS §10.40.40.30; RM §10.80.40.30 — all three: "rear main wall... no more than 19.0 metres from the required minimum front yard setback"; RT: no section found in the full 10.60.40.10–.80 enumeration — confirmed absence | numeric | RD/RS/RM: `19.0`, measured from the front-setback line. RT: `NULL` always — confirmed absence, no major-street exception exists for depth | `on_major_street` dependency does not apply here (no major-street exception found for depth) | `'bylaw_default_19m'` \| `'rt_no_cap'` |
| NF-12 | `bylaw_min_front_landscaping_pct` | §10.5.50.10(1) — "a minimum of 50 percent of the front yard must be landscaping" (6–15m frontage), "...60 percent..." (≥15m); under-6.0m figure not captured in any fetch | numeric | `CASE WHEN frontage_m < 6.0 THEN <UNVERIFIED> WHEN frontage_m < 15.0 THEN 50 ELSE 60 END` | **The under-6.0m-frontage figure was never captured — verify before implementing. The 15.0m tier boundary's inclusive/exclusive direction was also never explicitly stated — do not assume the setback tiers' convention applies.** | `'tier_50pct'` \| `'tier_60pct'` \| `'tier_under6m_UNVERIFIED'` |
| NF-13 | `bylaw_min_rear_soft_landscaping_pct` | §10.5.50.10(3) — "a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres... a minimum of 25%... if... 6.0 metres or less" | numeric | `CASE WHEN frontage_m > 6.0 THEN 50 ELSE 25 END` | Single-step, direct percentage of rear yard — no 75%-multiplier layer (unlike NF-12/NF-14) | `'tier_50pct'` \| `'tier_25pct'` |
| NF-14 | `bylaw_min_corner_side_landscaping_pct` | §10.5.50.10(2) — "a minimum of 60 percent of the side yard abutting a street for landscaping" | numeric | `60` flat, corner lots only | `NULL` when `is_corner_lot = false` (existing column) | `'corner_60pct'` \| `NULL` |
| — | *(formula constant, not a column)* | §10.5.50.10(1)/(2) — "a minimum of 75 percent of the front/side yard landscaping... must be soft landscaping" | — | The 75%-soft-of-landscaped-area multiplier applies uniformly to NF-12 and NF-14 (front/corner only, NOT NF-13/rear) — keep as a read-time constant, not persisted pre-multiplied, so a future by-law amendment is a one-constant change | — | — |
| NF-15 | `building_type` | Not a by-law citation — a modeling prerequisite: NF-3/NF-7's building-type branches need a value this report found no automated source for | text | NULL by default; manual/future viewer input only — **NOT auto-derived from `permits.building_type`** (permits are a subset of parcels and can be stale — corrected from an earlier flawed proposal) | Required (non-NULL) for NF-3/NF-7 to resolve their RT/RM branches; **owned by a separate WF1 (viewer-input UI, Admin/Cross-Domain), not this WF2** — this WF2 only needs the column to exist and be read defensively (NULL-safe) | — (always manual when populated) |
| NF-16 | `current_stories` | Not a by-law citation — a data-quality fix for the retired `existing_stories` column, unrelated to any zoning formula in this WF2 | integer | NULL by default; manual/future viewer input only | **Owned by the same separate WF1 as NF-15** — out of this WF2's scope, listed here only because it shares the viewer-input mechanism | — |
| NF-17 | `max_footprint_setback_sqm` | Setback envelope only: NF-1 front, NF-2 rear, NF-3/NF-4 side/flankage, NF-10 length cap, NF-11 depth cap (citations as those rows) | numeric | `LEAST(buffer_area, box_area)`, box = `MIN(frontage_m − side_count × NF-3, NF-10) × MIN(depth_m − NF-1 − NF-2, NF-11)`, buffer = lot polygon inset by the same setbacks. **No coverage term.** | NULL when the box cannot be computed (width/length NULL); never back-filled from coverage. The setback answer the report user sees beside NF-18 | `'setback_box'` | `'setback_buffer'` | `'length_cap'` | `'depth_cap'` | NULL |
| NF-18 | `max_footprint_coverage_sqm` | §10.20.30.40(1)/§10.40.30.40/§10.60.30.40/§10.80.30.40 — Lot Coverage Overlay Map percentage; "if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" | numeric | `lot_size_sqm × bylaw_max_coverage_pct / 100` when NF-8 = `'overlay_mapped'` | NULL when NF-8 = `'unregulated'`: **no zone-median default** (the by-law applies no coverage limit there). The coverage answer the report user sees beside NF-17 | same as NF-8 |
| NF-19 | `max_footprint_binding` | Not a by-law citation — tells the report user which limit decides | text | `'setback'` when NF-17 < NF-18 or NF-18 is NULL; `'coverage'` when NF-18 < NF-17; `'tie'` when equal; `'coverage_only_unchecked'` when NF-17 is NULL and NF-18 is not | Cross-check against EF-2 pending research item R1 below (whether EF-2 keeps the zone-median coverage default) | ∈ `{'setback','coverage','tie','coverage_only_unchecked'}` |
| NF-20 | `bylaw_min_front_soft_landscaping_pct` | §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; §10.20.80.1(1)(D) (same text §10.40.80.1(1)(D), §10.60.80.1(1)(D), §10.80.80.1(1)(D)) — "(D) the area of the removed driveway in the front yard must be landscaping, but may continue to be considered a permitted driveway for the purposes of calculating required soft landscaping under regulation 10.5.50.10(1)(D);" [L18] | numeric (% of front yard area) | `CASE WHEN existing_driveway_type = 'none' THEN 75` (L8 no-driveway branch: 75% of the whole front yard) `WHEN existing_driveway_type = 'private' AND tier IN ('tier_50pct','tier_60pct') THEN 0.75 × bylaw_min_front_landscaping_pct` (NF-12 × 75% → 37.5 or 45) `WHEN existing_driveway_type = 'private' AND tier = 'under6m_all_but_driveway' THEN 0.75 × (front_yard_area − driveway_area − parking_pad_area) / front_yard_area × 100` (needs NF-27/NF-28 and a front-yard area; else NULL) `ELSE NULL END`; tier = NF-22; driveway state = NF-26 | 0–75. NULL when NF-26 is NULL / 'unknown' / 'shared' ('shared' = MORE RESEARCH REQUIRED), when NF-22 is NULL (building type outside L4 scope), or when the under-6 m branch lacks NF-27. A driveway removed under the zone-chapter §.80.1(1) conversion still counts as a permitted driveway for this row (L18). Depends on NF-26. | `bylaw_front_soft_landscaping_basis` ∈ `'with_driveway_75pct_of_required'` \| `'no_driveway_75pct_of_front_yard'` \| `NULL` |
| NF-21 | `bylaw_max_front_hard_landscaping_pct` | NOT STATED IN THE BY-LAW — DERIVED by subtraction. The by-law defines landscaping and soft landscaping and sets only soft-landscaping minimums; it sets no hard-landscaping maximum. §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; §800.50(780) — "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements." [L2]; §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; Chapter 800 (absence) — The phrase "hard landscaping" does not occur in Chapter 800 (Definitions), nor in any other fetched chapter. (generator count: hard landscaping@ch800=0, hard landscaping@ch10_5=0, hard landscaping@ch10_20=0, hard landscaping@ch10_40=0, hard landscaping@ch10_60=0, hard landscaping@ch10_80=0, hard landscaping@ch150_7=0, hard landscaping@ch150_8=0, hard landscaping@ch200=0) [L3] | numeric (% of front yard area) | `100 − NF-20` = the share of the front yard not required to be soft. When NF-27 is known the hard-landscaping ceiling is `100 − NF-20 − driveway_pct`, because a driveway is neither soft nor hard landscaping (L1) | NULL when NF-20 is NULL. ≥ 0. Hard landscaping still counts toward the NF-12 landscaping minimum (L1 includes stonework, retaining walls and walkways). Must be labelled "derived" in the report, never "by-law maximum". | inherits NF-20 basis, suffixed `'_derived_subtraction'` |
| NF-22 | `bylaw_front_landscaping_basis` | §10.5.50.10(1) — "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:" [L4]; §10.5.50.10(1)(A) — "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" [L5]; §10.5.50.10(1)(B) — "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;" [L6]; §10.5.50.10(1)(C) — "(C) for lots with a lot frontage of 15.0 metres or greater, a minimum of 60 percent of the front yard must be landscaping; and" [L7] | text | `CASE WHEN building_type NOT IN (detached, semi-detached, detached houseplex, semi-detached houseplex, townhouse) THEN NULL WHEN w < 6.0 THEN 'under6m_all_but_driveway' WHEN w < 15.0 THEN 'tier_50pct' ELSE 'tier_60pct' END`, where `w` = the townhouse dwelling-unit width for a townhouse, else `frontage_m`. A townhouse unit at least 6.0 m wide is `'tier_50pct'` (L7 names no townhouse substitution) | `'under6m_all_but_driveway'` = the whole front yard minus a permitted driveway / permitted parking pad must be landscaping (L5), not a percentage. 6.0 exactly → `'tier_50pct'`; 15.0 exactly → `'tier_60pct'` (L7 "15.0 metres or greater"). NULL when frontage is NULL or NF-15 is NULL / out of scope (apartment buildings use L11 instead). | is itself the basis companion for NF-12 and NF-20 |
| NF-23 | `bylaw_max_front_driveway_width_m` | §10.5.100.1(1)(A)-(D) — "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard." [L15]; §200.5.1.10(2)(A) — "(2) Parking Space Dimensions - Minimum A parking space is subject to the following: (A) A parking space must have the following minimum dimensions: (i) length of 5.6 metres; (ii) width of 2.6 metres; (iii) vertical clearance of 2.0 metres; and (iv) the minimum width in (ii) must be increased by 0.3 metres for each side of the parking space that is obstructed according to (D) below;" [L25]; §200.5.1.10(3) — "(3) Parking Space Dimensions - Maximum The maximum dimensions for a parking space are: (A) length of 6.0 metres (B) width of 3.2 metres" [L26] | numeric (m) | `CASE WHEN w < 6.0 THEN 2.6 WHEN w <= 23.0 THEN LEAST(6.0, parking_width) WHEN w > 23.0 THEN LEAST(9.0, parking_width) END` (w as NF-22). `parking_width` = cumulative width of side-by-side parking spaces behind the front main wall (not in the rear yard); for a single space its width, which Chapter 200 bounds at 2.6 m minimum (+0.3 m per obstructed side) and 3.2 m maximum (L25/L26); 2.6 when all parking is in the rear yard. Parking layout is not a column → emit the 6.0 / 9.0 cap with basis `'cap_only_parking_layout_unknown'` | Minimum 2.0 m (L15(A)). Scope: detached house, semi-detached house, duplex, or a townhouse unit with its own private driveway (L15 lead-in); NULL otherwise. NF-26 decides use: `'private'` → compared against NF-27; `'none'` → shown as "if a driveway is added"; `'shared'` → comparison withheld, MORE RESEARCH REQUIRED. | `'under6m_2_6'` \| `'mid_lesser_of_6_0'` \| `'wide_lesser_of_9_0'` \| `'cap_only_parking_layout_unknown'` \| `NULL` |
| NF-24 | `bylaw_min_soft_garden_suite_pct` | §150.7.50.10(1)(A)(B) — "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]" [L20] | numeric (% of the area behind the rear main walls) | `CASE WHEN frontage_m > 6.0 THEN 50 ELSE 25 END`, measured over the area between all rear main walls and the rear lot line, extended across the full lot width from where the rear main wall meets the side main walls | Only when the lot has a garden suite (no source column → NULL unless known). Replaces NF-13 ("Despite regulation 10.5.50.10(3)"). 6.0 exactly → 25. | `'garden_suite_50pct'` \| `'garden_suite_25pct'` \| `NULL` |
| NF-25 | `bylaw_min_soft_laneway_suite_pct` | §150.8.50.10(1)(A)(B)(C) — "(1) Landscaping Requirements for a Laneway Suite Despite regulation 10.5.50.10 (3), for a lot with a residential building and an ancillary building containing a laneway suite: (A) with a lot frontage of 6.0 metres or less, a minimum of 60 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping; (B) with a lot frontage of greater than 6.0 metres, a minimum of 85 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping, excluding a pedestrian walkway which may have a maximum width of 1.5 metres; and (C) the area between the ancillary building containing a laneway suite and the lot line abutting a lane, excluding a permitted driveway, and a pedestrian walkway which may have a maximum width of 1.5 metres, must be landscaping, of which a minimum of 75 percent must be soft landscaping. [ By-law: 1107-2021 ]" [L21] | numeric (% of the area between the rear main walls and the suite front wall) | `CASE WHEN frontage_m > 6.0 THEN 85 ELSE 60 END`; the 85% case excludes a pedestrian walkway up to 1.5 m wide. Plus (C): the area between the suite and the lane lot line, excluding a permitted driveway and a walkway up to 1.5 m, must be landscaping, at least 75% of it soft | Only when the lot has a laneway suite (no source column → NULL unless known). Replaces NF-13 ("Despite regulation 10.5.50.10 (3)"). 6.0 exactly → 60. The (C) lane-side 75% rule is reported alongside, not folded into this number. | `'laneway_suite_85pct'` \| `'laneway_suite_60pct'` \| `NULL` |
| NF-26 | `existing_driveway_type` | NOT A BY-LAW CITATION — USER INPUT (entered by the viewer). It supplies the fact L8 branches on: §10.5.50.10(1)(D) — "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" [L8]; All fetched chapters (absence) — The phrases "shared driveway" and "mutual driveway" do not occur in any fetched chapter (800, 10.5, 10.20, 10.40, 10.60, 10.80, 150.7, 150.8, 200). (generator count: shared driveway@ch800=0, shared driveway@ch10_5=0, shared driveway@ch10_20=0, shared driveway@ch10_40=0, shared driveway@ch10_60=0, shared driveway@ch10_80=0, shared driveway@ch150_7=0, shared driveway@ch150_8=0, shared driveway@ch200=0, mutual driveway@ch800=0, mutual driveway@ch10_5=0, mutual driveway@ch10_20=0, mutual driveway@ch10_40=0, mutual driveway@ch10_60=0, mutual driveway@ch10_80=0, mutual driveway@ch150_7=0, mutual driveway@ch150_8=0, mutual driveway@ch200=0) [L27] | text | USER INPUT, `NULL` default, same mechanism as NF-15/NF-16, never auto-derived. Values ∈ `'none'` \| `'private'` \| `'shared'` \| `'unknown'` | Drives NF-20's branch (L8 "does not have a permitted driveway") and NF-23's use. "Shared driveway" is not a by-law-defined term: the generator counted 0 occurrences of "shared driveway"/"mutual driveway" across 9 fetched chapters. How a shared driveway is treated under L8/L15 is MORE RESEARCH REQUIRED; until then 'shared' yields NULL in NF-20/NF-21. | `'user_input'` \| `NULL` |
| NF-27 | `existing_driveway_width_m` | NOT A BY-LAW CITATION — USER INPUT. Needed because a driveway is neither soft nor hard landscaping: §800.50(395) — "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." [L1]; bounds from §10.5.100.1(1)(A)-(D) [L15] | numeric (m) | USER INPUT, `NULL` default, never auto-derived. Actual front-yard landscaping area = front_yard_area − NF-27 × front-yard depth (− parking pad area, NF-28) | NULL default. Values below 2.0 m or above NF-23 are flagged as non-conforming, not rejected. Only meaningful when NF-26 = 'private'. | `'user_input'` \| `NULL` |
| NF-28 | `existing_front_parking_pad` | NOT A BY-LAW CITATION — USER INPUT. §10.5.50.10(1)(A) — "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" [L5]; §10.5.80.10(3) — "(3) Street Yard Parking Space In the Residential Zone category, a parking space may not be in a front yard or a side yard abutting a street. This regulation does not apply if a parking space in the front yard is permitted by the City of Toronto under the authority of the City of Toronto Act, 2006, or its predecessor." [L16]; Chapter 800 (absence) — "parking pad" does not occur in Chapter 800 (Definitions) or Chapter 200; in Chapter 10.5 it occurs once, inside L5. (generator count: parking pad@ch800=0, parking pad@ch200=0, parking pad@ch10_5=1) [L28] | boolean | USER INPUT, `NULL` default, never auto-derived. When true, the pad area is excluded from the under-6 m landscaping requirement (L5) | L5 excludes a "permitted parking pad", while L16 bars a parking space in a front yard unless the City permits it under the City of Toronto Act, 2006; "parking pad" is not defined in Chapter 800 (L28). How the two interact is MORE RESEARCH REQUIRED. | `'user_input'` \| `NULL` |
| NF-29 | `has_secondary_suite` | NOT A BY-LAW CITATION — USER INPUT. It supplies the fact the coverage and FSI clauses key on: §800.50(735) — "(735) Secondary Suite means self-contained living accommodation for an additional person or persons living together as a separate single housekeeping unit, in which both food preparation and sanitary facilities are provided for the exclusive use of the occupants of the suite, located in and subordinate to a dwelling unit." [H3]; §800.50(181) — "(181) Detached Houseplex means a building that has multiple dwelling units, and where: (A) the building has no more than four dwelling units; (B) the building is situated entirely on one lot; (C) the building is not attached to a building on an abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex. [ By-law: 648-2025 ]" [H1]; §800.50(746) — "(746) Semi-detached Houseplex means a portion of a building that has multiple dwelling units, and where: (A) the portion of the building has no more than four dwelling units; (B) the entire building is situated on two abutting lots; (C) the portion of the building is separated by party walls from any attached portions of the building on the abutting lot; and (D) at least one dwelling unit is entirely or partially above another. (E) Semi-detached houseplex includes the following types of building: a duplex, triplex or fourplex that complies with (A) to (D) above. (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a semi-detached houseplex. [ By-law: 648-2025 ]" [H2]; §10.20.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H7]; §10.20.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H8]; RS/RT/RM carry the same two rules: §10.40.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H9]; §10.40.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H10]; §10.60.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H11]; §10.60.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H12]; §10.80.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex, semi-detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent; [ By-law: 1062-2025(OLT); 608-2024; 848-2025 ]" [H13]; §10.80.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H14] (texts generator-extracted, Spec 67 Appendix E) | boolean | USER INPUT, `NULL` default, same mechanism as NF-15/NF-16/NF-26..NF-28, never auto-derived. TRUE when the main residential building contains a secondary suite (H3: inside and subordinate to a dwelling unit — a garden suite or laneway suite in an ancillary building is not a secondary suite). The houseplex/suite rule set applies when `building_type = 'houseplex'` (NF-15 already carries that value) OR `has_secondary_suite = TRUE` | **Rationale:** the MaxBuild answer changes with this fact. (1) Coverage: where the Lot Coverage Overlay value is under 45 %, the limit becomes 45 % "for all buildings and structures on the lot" (H7/H9/H11/H13); where the lot is unmapped, clause (D) keys on a numerical value that does not exist, so no coverage applies either way (G7(B)). (2) FSI: the zone-label `d` FSI does not apply (H8/H10/H12/H14). (3) So a different limit can bind — 41 Derwyn Rd (RD, overlay 35 %): detached 114.49 m² (coverage binds); with a suite 147.20 m² under the plan formulas, or 135.15 m² with the length cap on the front-to-rear axis (the setback envelope then binds); GFA 294.40 / 270.30 m² with no FSI cap versus 147.20 m² for a detached house once the label FSI is read (Spec 67 worked examples). A house with a secondary suite is not a houseplex (H1(F)/H2(F)), so this is a separate flag, not a `building_type` value; TRUE together with `building_type = 'houseplex'` is a contradiction to flag. NULL: nothing is assumed; both answers are still shown (NF-30..NF-32 beside EF-2/EF-8). | `'user_input'` \| `NULL` |
| NF-30 | `max_buildable_footprint_suite_sqm` | Houseplex / secondary-suite coverage rules: §10.20.30.40(1)(D) — "(D) Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains a detached houseplex or a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent;" [H7] (RS/RT/RM: H9/H11/H13, quoted in NF-29); §800.50(435) — "(435) Lot Coverage means the portion of the lot that is covered by any part of any building or structure on or above the surface of the lot." [H4] | numeric | `LEAST(buffer_area, NF-17 box, suite_coverage_cap)`, suite_coverage_cap = `lot_size_sqm × (CASE WHEN bylaw_max_coverage_pct IS NULL THEN NULL WHEN bylaw_max_coverage_pct < 45 THEN 45 ELSE bylaw_max_coverage_pct END) / 100` (LEAST skips NULL, so an unmapped lot = NF-17). Always computed, whatever NF-15/NF-29 hold, so the report shows the detached answer and the houseplex/suite answer side by side | The base field `max_buildable_footprint_sqm` (EF-2) keeps its current meaning (detached-house rules). The 45 % covers all buildings and structures (H7) and lot coverage counts any building or structure (H4), so ancillary buildings draw on the same allowance. Houseplex-only length/depth relief on deep lots (H17/H18: 19.0 m) is not applied — research. NULL rules as NF-17 (R2). | NF-32 |
| NF-31 | `max_buildable_gfa_suite_sqm` | §10.20.40.40(1)(C) — "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and [ By-law: 848-2025 ]" [H8] (RS/RT/RM: H10/H12/H14, quoted in NF-29); detached houseplex height, not applied here: §10.20.40.10(1)(C) — "(C) despite (A) above, the permitted maximum height for a detached houseplex is the greater of ... (ii) 10.0 metres" [H15, excerpt] | numeric | `NF-30 × max_build_stories` (EF-6 storeys); no FSI term (H8/H10/H12/H14) | The base field `max_buildable_gfa_sqm` (EF-8) keeps its current meaning (FSI cap applies). The detached-houseplex height (H15: the greater of the HT value or 10.0 m) and storey rule (H16) do not apply to a secondary suite and are not applied here — research. NULL when NF-30 or EF-6 is NULL. | `'suite_no_fsi'` \| `NULL` |
| NF-32 | `max_buildable_suite_binding` | Not a by-law citation — names the limit that decides NF-30, as NF-19 does for the base footprint | text | `'setback'` when NF-17 < suite_coverage_cap or the cap is NULL; `'coverage'` when the cap < NF-17; `'tie'` when equal; `'coverage_only_unchecked'` when NF-17 is NULL and the cap is not | Compare with NF-19: a flip from `'coverage'` to `'setback'` tells the report user that adding a suite moves the binding limit to the setbacks and length/depth caps. | ∈ `{'setback','coverage','tie','coverage_only_unchecked'}` |

### Coverage vs setback — the report shows both (operator 2026-09-29) — MORE RESEARCH REQUIRED

* **Operator challenge (2026-09-29):** a coverage percentage gives a maximum footprint, but the owner must still meet every setback. The coverage-implied footprint may not fit inside the setbacks, so the real maximum may be set by the setbacks.
* **Where the model already agrees:** EF-2 takes `LEAST(buffer, box, coverage_cap)`, so setbacks win whenever they are smaller. V25 shows the real setbacks plus the NF-11 depth cap deciding (≈573 → ≈312 m²) with no coverage term.
* **Decision: show both, not one number.** NF-17 (setback-only footprint) and NF-18 (coverage-only footprint) are exposed side by side, and NF-19 names the one that binds. EF-2 (the headline footprint) is unchanged here.
* **MORE RESEARCH REQUIRED before implementation:**
  * **R1 — zone-median coverage default.** `scripts/lib/compute/enrich-parcels.js` computes `coverage_cap = COALESCE(bylaw_max_coverage_pct, zone median)`. On NF-8 `'unregulated'` lots the by-law applies no coverage limit, yet the median still enters EF-2's `LEAST` and can bind. The median was added (comment at the `coverage_cap` CTE: "else LEAST drops the term and the footprint balloons to the setback box (~67% coverage)") when setbacks were flat 0.9 / 7.5 m with no length/depth caps. Whether it retires once NF-1..4, NF-10 and NF-11 land needs a Reality-Check measurement (how often the median binds today, and by how much) and a Regression Guardian fence ruling.
  * **R2 — coverage-only fallback (EF-11).** When width/length is NULL the footprint is coverage alone, with no setback check. Decide what the report shows; interim: NF-17 NULL and NF-19 `'coverage_only_unchecked'`.
  * **R3 — shape feasibility.** A footprint inside both limits can still be unbuildable (minimum dwelling width, irregular polygons); the buffer's minimum-dimension floor is the only current guard.
  * **R4 — binding distribution.** Measure, per zone on real lots, how often setback vs coverage vs the length/depth caps bind before choosing any headline rule.

### Landscaping — soft vs hard, driveways — provision ledger (generator-verified 2026-09-29)

Generated by a ledger-driven generator (`landscaping-gen/gen.js` + `ledger.json`, session scratchpad, not in the repo). It fetched 9 by-law pages with curl, normalized them (tags stripped, HTML entities decoded incl. `&nbsp;`, whitespace collapsed) and checked that every verbatim quote below is a substring of its page. Absence claims were checked by regex count. Result: 28 rows, 0 misses. Section numbers are the by-law's; the text is copied from the fetched pages, not paraphrased.

| ID | Topic | Section | Verbatim text | URL | Verified |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L1 | Landscaping (definition) | §800.50(395) | "(395) Landscaping means an area used for trees, plants, decorative stonework, retaining walls, walkways, or other landscape or architectural elements. Driveways and areas for loading, parking or storing of vehicles are not landscaping." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | substring found in ch800 — PASS (fetched 2026-09-29) |
| L2 | Soft landscaping (definition) | §800.50(780) | "(780) Soft Landscaping means landscaping excluding hard-surfaced areas such as decorative stonework, retaining walls, walkways, or other hard-surfaced landscape-architectural elements." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | substring found in ch800 — PASS (fetched 2026-09-29) |
| L3 | Hard landscaping is not a defined term | Chapter 800 (absence) | *(absence claim)* The phrase "hard landscaping" does not occur in Chapter 800 (Definitions), nor in any other fetched chapter. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `hard landscaping` in ch800 = 0 (expect 0); `hard landscaping` in ch10_5 = 0 (expect 0); `hard landscaping` in ch10_20 = 0 (expect 0); `hard landscaping` in ch10_40 = 0 (expect 0); `hard landscaping` in ch10_60 = 0 (expect 0); `hard landscaping` in ch10_80 = 0 (expect 0); `hard landscaping` in ch150_7 = 0 (expect 0); `hard landscaping` in ch150_8 = 0 (expect 0); `hard landscaping` in ch200 = 0 (expect 0) — PASS |
| L4 | Front-yard landscaping scope (building types) | §10.5.50.10(1) | "(1) Front Yard Landscaping for Certain Types of Residential Buildings In the Residential Zone category, on a lot with a detached house, semi-detached house, detached houseplex, semi-detached houseplex or townhouse, the following front yard landscaping regulations apply:" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L5 | Front landscaping, frontage < 6.0 m | §10.5.50.10(1)(A) | "(A) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, the front yard, excluding a permitted driveway or permitted parking pad must be landscaping; [By-law: 1429-2017]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L6 | Front landscaping, 6.0 to < 15.0 m | §10.5.50.10(1)(B) | "(B) for lots with a lot frontage of 6.0 metres to less than 15.0 metres, or a townhouse dwelling unit at least 6.0 metres wide, a minimum of 50 percent of the front yard must be landscaping;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L7 | Front landscaping, >= 15.0 m | §10.5.50.10(1)(C) | "(C) for lots with a lot frontage of 15.0 metres or greater, a minimum of 60 percent of the front yard must be landscaping; and" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L8 | Front soft landscaping 75% (with / without driveway) | §10.5.50.10(1)(D) | "(D) a minimum of 75 percent of the front yard landscaping required in (A), (B), and (C) above, must be soft landscaping, and if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L9 | Corner-lot side yard landscaping | §10.5.50.10(2)(A)(B) | "(2) Side Yard Landscaping for Certain Types of Residential Buildings on Corner Lots In the Residential Zone category, a corner lot with a detached house, semi- detached house, detached houseplex, semi-detached houseplex or townhouse must have: (A) a minimum of 60 percent of the side yard abutting a street for landscaping; and (B) a minimum of 75 percent of the side yard landscaping required in (A), above, must be soft landscaping. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L10 | Rear yard soft landscaping | §10.5.50.10(3)(A)(B) | "(3) Rear Yard Soft Landscaping for Residential Buildings Other Than an Apartment Building In the Residential Zone category, a lot with a residential building, other than an apartment building, must have: (A) a minimum of 50% of the rear yard for soft landscaping, if the lot frontage is greater than 6.0 metres; and (B) a minimum of 25% of the rear yard for soft landscaping, if the lot frontage is 6.0 metres or less." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L11 | Apartment building landscaping | §10.5.50.10(4) | "(4) Landscaping Requirements for an Apartment Building In the Residential Zone category, a lot with an apartment building must have: (A) a minimum of 50 percent of the area of the lot for landscaping; (B) a minimum of 50 percent of the landscaping area required in (A), above, must be soft landscaping; and (C) despite (A) and (B) above, if an apartment building has 60 dwelling units or less and is located on a lot abutting a major street, a minimum of 30 percent of the area of the lot must be for landscaping, of which 50 percent of the required landscaping area must be comprised of soft landscaping. [ By-law: 1062-2025(OLT); 608-2024 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L12 | Apartment soft strip | §10.5.50.10(5) | "(5) Landscaping Requirement for an Apartment Building Abutting Another Residential Lot In the Residential Zone category, a lot with an apartment building must have a minimum 1.5 metre wide strip of soft landscaping along any part of a lot line abutting another lot in the Residential Zone category." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L13 | Exclusion: permitted encroachments, utility equipment | §10.5.50.10(6)(A) | "(6) Landscaping Exclusion for Permitted Encroachments and Public Utility Equipment (A) In the Residential Zone category, the calculation of landscaping or soft landscaping in regulations 10.5.50.10(1), (2), (3) and (4) excludes: (i) the area of the required minimum building setback covered by any part of a building or structure which is permitted to encroach into a required minimum building setback by Clause 10.5.40.60; and (ii) the area covered by public utility equipment essential for the functional operation of the building, such as an electrical transformer and associated pads, or other equipment necessary to connect to public utility services. [ By-law: 648-2025 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L14 | Pools deemed soft (rear/apartment only) | §10.5.50.10(7) | "(7) Swimming Pools or Similar Ancillary Structures Containing Water Deemed to be Soft Landscaping for Specified Regulations In the Residential Zone category, for the calculation of soft landscaping required by regulation 10.5.50.10(3) and (4), the area of soft landscaping includes the water surface area of outdoor swimming pools or other ancillary structures used to hold water, such as fountains or artificial ponds." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L15 | Front-yard driveway width | §10.5.100.1(1)(A)-(D) | "(1) Driveway Width in the Front Yard for Certain Residential Building Types In the Residential Zone category, in addition to meeting the landscaping requirements in regulation 10.5.50.10, for a detached house, semi-detached house, or duplex, and for an individual townhouse dwelling unit if an individual private driveway leads directly to the dwelling unit, a driveway that is in the front yard or passes through the front yard may have the following dimensions in the front yard: (A) a minimum width of 2.0 metres; (B) for lots with a lot frontage less than 6.0 metres, or a townhouse dwelling unit less than 6.0 metres wide, a maximum width of 2.6 metres; (C) for lots with a lot frontage of 6.0 metres to 23.0 metres inclusive, or a townhouse dwelling unit at least 6.0 metres wide, a maximum driveway width the lesser of: (i) 6.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall, but not in the rear yard; or (iii) the width of a single parking spaces behind the front main wall, but not in the rear yard; or (iv) 2.6 metres if all parking spaces are in the rear yard; and (D) for lots with a lot frontage greater than 23.0 metres, a maximum driveway width the lesser of: (i) 9.0 metres; (ii) the cumulative width of side-by-side parking spaces behind the front main wall if there is at least one parking space behind the front main wall but not in the rear yard; or (iii) 2.6 metres if all parking spaces are in the rear yard." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L16 | No parking space in a street yard | §10.5.80.10(3) | "(3) Street Yard Parking Space In the Residential Zone category, a parking space may not be in a front yard or a side yard abutting a street. This regulation does not apply if a parking space in the front yard is permitted by the City of Toronto under the authority of the City of Toronto Act, 2006, or its predecessor." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L17 | Two-access driveway needs landscaping compliance | §10.5.100.1(6) | "(6) Driveway with Two Points of Access to the Same Street A lot in the Residential Zone category may have a driveway with two points of vehicle access to the same street, if: (A) the lot has a lot frontage greater than 18.0 metres; and (B) the front yard landscaping complies with Clause 10.5.50.10." | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L18 | Removed driveway still counts as permitted driveway for (1)(D) | §10.20.80.1(1)(D) (same text §10.40.80.1(1)(D), §10.60.80.1(1)(D), §10.80.80.1(1)(D)) | "(D) the area of the removed driveway in the front yard must be landscaping, but may continue to be considered a permitted driveway for the purposes of calculating required soft landscaping under regulation 10.5.50.10(1)(D);" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_40.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_60.htm<br>https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_80.htm | substring found in ch10_20, ch10_40, ch10_60, ch10_80 — PASS (fetched 2026-09-29) |
| L19 | Zone chapters have no own landscaping article | Chapters 10.20/10.40/10.60/10.80 (absence) | *(absence claim)* No 10.20.50 / 10.40.50 / 10.60.50 / 10.80.50 article exists, and every occurrence of "landscap" in each zone chapter lies inside the L18 clause (count on page equals count inside the L18 text). | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_20.htm | absence: `10\.20\.50` in ch10_20 = 0 (expect 0); `10\.40\.50` in ch10_40 = 0 (expect 0); `10\.60\.50` in ch10_60 = 0 (expect 0); `10\.80\.50` in ch10_80 = 0 (expect 0); `landscap` in ch10_20 = 2 (expect 2); `landscap` in ch10_40 = 2 (expect 2); `landscap` in ch10_60 = 2 (expect 2); `landscap` in ch10_80 = 2 (expect 2) — PASS |
| L20 | Garden suite soft landscaping (overrides rear) | §150.7.50.10(1)(A)(B) | "(1) Landscaping Requirements for a Garden Suite Despite regulation 10.5.50.10(3), for a lot with a residential building and an ancillary building containing a garden suite: (A) with a lot frontage of greater than 6.0 metres, a minimum of 50 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping; (B) with a lot frontage of 6.0 metres or less, a minimum of 25 percent of the area: (i) between all rear main walls of the residential building on the lot and the rear lot line, and (ii) extending parallel to the rear lot line across the full width of the lot from the point where the rear main wall of the residential building meets the residential building's side main walls closest to the respective side lot lines, must be for soft landscaping. [ By-law: 101-2022 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_7.htm | substring found in ch150_7 — PASS (fetched 2026-09-29) |
| L21 | Laneway suite soft landscaping (overrides rear) | §150.8.50.10(1)(A)(B)(C) | "(1) Landscaping Requirements for a Laneway Suite Despite regulation 10.5.50.10 (3), for a lot with a residential building and an ancillary building containing a laneway suite: (A) with a lot frontage of 6.0 metres or less, a minimum of 60 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping; (B) with a lot frontage of greater than 6.0 metres, a minimum of 85 percent of the area between all rear main walls of the residential building and the front main wall of the ancillary building containing a laneway suite must be for soft landscaping, excluding a pedestrian walkway which may have a maximum width of 1.5 metres; and (C) the area between the ancillary building containing a laneway suite and the lot line abutting a lane, excluding a permitted driveway, and a pedestrian walkway which may have a maximum width of 1.5 metres, must be landscaping, of which a minimum of 75 percent must be soft landscaping. [ By-law: 1107-2021 ]" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter150_8.htm | substring found in ch150_8 — PASS (fetched 2026-09-29) |
| L22 | Ancillary buildings article has no landscaping text | §10.5.60 (absence) | *(absence claim)* The body of Article 10.5.60 (from "10.5.60 Ancillary Buildings and Structures 10.5.60.1 General (1)" up to "10.5.75 Energy Regulations") contains no occurrence of "landscap". | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | absence: `landscap` in ch10_5 = 0 (expect 0) — PASS |
| L23 | Decks/porches (platforms) as permitted encroachments | §10.5.40.60(1)(A)-(D) | "(1) Platforms Despite regulation 10.5.40.50(2), in the Residential Zone category, a platform without main walls, such as a deck, porch, balcony or similar structure, attached to or less than 0.3 metres from a building, are subject to the following: (A) in a front yard, a platform with a floor no higher than the first storey of the building above established grade: (i) may encroach into the required front yard setback the lesser of 2.5 metres or 50% of the required front yard setback, if it is no closer to a side lot line than the required side yard setback; and (ii) there may be enclosed space below this platform; (B) in a front yard, a platform with a floor higher than the first storey of the building above established grade may encroach into the required front yard setback the lesser of 1.5 metres or 50% of the required front yard setback, if it is no closer to a side lot line than the required side yard setback; (C) in a rear yard, a platform with a floor no higher than the first storey of the building above established grade may encroach into the required rear yard setback the lesser of 2.5 metres or 50% of the required rear yard setback, if it is no closer to a side lot line than the greater of: (i) 0.3 metres; or (ii) a distance equal to the vertical distance between the highest part of the floor of the platform and the average elevation of the ground at the side of the platform; (D) in a rear yard, a platform with a floor higher than the first storey of the building above established grade may encroach into the required rear yard setback the lesser of 1.5 metres or 50% of the required rear yard setback, if it is no closer to a side lot line than the required side yard setback plus the vertical distance between the first floor of the building and the average elevation of the ground along the building's rear main wall;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | substring found in ch10_5 — PASS (fetched 2026-09-29) |
| L24 | At-grade patios are not addressed in Chapter 10.5 | Chapter 10.5 (absence) | *(absence claim)* The word "patio" does not occur in Chapter 10.5; in the zone chapters it occurs only as the commercial "Outdoor Patio" use. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter10_5.htm | absence: `\bpatios?\b` in ch10_5 = 0 (expect 0); `\bpatios?\b` in ch10_20 = 6 (expect 6); `\bpatios?\b` in ch10_40 = 6 (expect 6); `\bpatios?\b` in ch10_60 = 6 (expect 6); `\bpatios?\b` in ch10_80 = 6 (expect 6) — PASS |
| L25 | Parking space minimum dimensions | §200.5.1.10(2)(A) | "(2) Parking Space Dimensions - Minimum A parking space is subject to the following: (A) A parking space must have the following minimum dimensions: (i) length of 5.6 metres; (ii) width of 2.6 metres; (iii) vertical clearance of 2.0 metres; and (iv) the minimum width in (ii) must be increased by 0.3 metres for each side of the parking space that is obstructed according to (D) below;" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm | substring found in ch200 — PASS (fetched 2026-09-29) |
| L26 | Parking space maximum dimensions | §200.5.1.10(3) | "(3) Parking Space Dimensions - Maximum The maximum dimensions for a parking space are: (A) length of 6.0 metres (B) width of 3.2 metres" | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter200.htm | substring found in ch200 — PASS (fetched 2026-09-29) |
| L27 | "Shared driveway" is not a by-law term | All fetched chapters (absence) | *(absence claim)* The phrases "shared driveway" and "mutual driveway" do not occur in any fetched chapter (800, 10.5, 10.20, 10.40, 10.60, 10.80, 150.7, 150.8, 200). | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `shared driveway` in ch800 = 0 (expect 0); `shared driveway` in ch10_5 = 0 (expect 0); `shared driveway` in ch10_20 = 0 (expect 0); `shared driveway` in ch10_40 = 0 (expect 0); `shared driveway` in ch10_60 = 0 (expect 0); `shared driveway` in ch10_80 = 0 (expect 0); `shared driveway` in ch150_7 = 0 (expect 0); `shared driveway` in ch150_8 = 0 (expect 0); `shared driveway` in ch200 = 0 (expect 0); `mutual driveway` in ch800 = 0 (expect 0); `mutual driveway` in ch10_5 = 0 (expect 0); `mutual driveway` in ch10_20 = 0 (expect 0); `mutual driveway` in ch10_40 = 0 (expect 0); `mutual driveway` in ch10_60 = 0 (expect 0); `mutual driveway` in ch10_80 = 0 (expect 0); `mutual driveway` in ch150_7 = 0 (expect 0); `mutual driveway` in ch150_8 = 0 (expect 0); `mutual driveway` in ch200 = 0 (expect 0) — PASS |
| L28 | "Parking pad" is not a defined term | Chapter 800 (absence) | *(absence claim)* "parking pad" does not occur in Chapter 800 (Definitions) or Chapter 200; in Chapter 10.5 it occurs once, inside L5. | https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter800.htm | absence: `parking pad` in ch800 = 0 (expect 0); `parking pad` in ch200 = 0 (expect 0); `parking pad` in ch10_5 = 1 (expect 1) — PASS |

**Soft vs hard, in plain language (derived from the ledger):**
* **Landscaping** is trees, plants, decorative stonework, retaining walls, walkways and similar elements. Driveways and parking areas are never landscaping (L1).
* **Soft landscaping** is landscaping minus the hard-surfaced parts: stonework, retaining walls, walkways (L2). The by-law never defines "hard landscaping" (L3). In this report "hard" means landscaping that is not soft, which is a derived term.
* **Front yard, two steps:** first, a minimum share must be landscaping, set by frontage (L5 under 6.0 m, L6 50%, L7 60%). Second, at least 75% of that required landscaping must be soft (L8). If there is **no** permitted front-yard driveway, at least 75% of the **whole** front yard must be soft (L8). A driveway removed under the zone-chapter conversion rule still counts as a driveway for this test (L18).
* **Rear yard, one step:** a direct soft share (L10). Pool water surface counts as soft for the rear-yard rule, not the front-yard rule (L14). A garden suite (L20) or laneway suite (L21) replaces the rear rule.
* **Decks/porches:** where a platform encroaches into a required setback as allowed by 10.5.40.60 (L23), that area is excluded from the landscaping calculation (L13(A)(i)).

**Worked example (computed by the generator):** the front yard is 10 m frontage × 6 m deep = 60 m². 10.0 m is in the 6.0 to less-than-15.0 m tier, so 50% must be landscaping (L6).
* **With a 3.0 m private driveway** (within L15(C)'s 6.0 m cap, and at least one 2.6 m parking-space width, L25): driveway = 3.0 × 6 = 18 m², which is neither soft nor hard (L1). Landscaping ≥ 30 m² (L6). Soft ≥ 75% × 30 = 22.5 m² (L8). Up to 7.5 m² of the required landscaping may be hard (derived, L2/L3). The other 12 m² is unconstrained by 10.5.50.10 but may not be a parking space (L16).
* **With no driveway:** landscaping ≥ 30 m² (L6), but the no-driveway branch requires soft ≥ 75% × 60 = 45 m² (L8), so the soft rule governs. At most 15 m² may be non-soft.

**Corrections/additions to existing rows (append-only notes; the rows above are unchanged):**

| Existing row | What the ledger adds | Ledger ids |
| :--- | :--- | :--- |
| NF-12 `bylaw_min_front_landscaping_pct` | The under-6.0 m tier is not a percentage: the whole front yard, minus a permitted driveway or permitted parking pad, must be landscaping. A 15.0 m frontage is in the **60%** tier ("15.0 metres or greater"; the 50% tier is "to less than 15.0"). A townhouse dwelling-unit width replaces lot frontage in (A) and (B), so a townhouse unit at least 6.0 m wide is in the 50% tier. Tier recorded in NF-22. | L5, L6, L7, L4 |
| NF-13 `bylaw_min_rear_soft_landscaping_pct` | Pool, fountain and pond water surface counts as soft landscaping for 10.5.50.10(3). A garden suite or laneway suite replaces this rule ("Despite regulation 10.5.50.10(3)"); see NF-24/NF-25. | L14, L20, L21 |
| NF-14 `bylaw_min_corner_side_landscaping_pct` | Applies only to a corner lot with a detached house, semi-detached house, detached/semi-detached houseplex or townhouse. The front-yard rules have the same building-type scope (L4); apartment buildings follow L11/L12. | L9, L4, L11 |
| *(formula constant)* 75% soft multiplier | Missing the no-driveway branch: "if a lot does not have a permitted driveway in the front yard, a minimum of 75 percent of the front yard must be soft landscaping" (75% of the whole yard, not of the required portion). The same 75% also applies to the laneway-suite lane-side area (L21(C)). Cite precisely as §10.5.50.10(1)(D) and §10.5.50.10(2)(B). A removed driveway still counts as a driveway (L18). | L8, L9, L21, L18 |

**MORE RESEARCH REQUIRED:**
1. **Shared driveways.** Not a by-law term: the generator counted 0 occurrences of "shared driveway"/"mutual driveway" across 9 fetched chapters (L27). Open questions: is a mutual driveway on the lot line a "permitted driveway in the front yard" for L8 on each lot, and how does L15's width apply to each owner's part? NF-26 = 'shared' yields NULL in NF-20/NF-21 until this is resolved.
2. **Parking pad vs L16.** "Parking pad" is not defined in Chapter 800 (L28). L5 excludes a "permitted parking pad", but L16 bars front-yard parking spaces unless the City permits them under the City of Toronto Act, 2006. The permit source (probably a municipal-code front-yard parking licence, not the zoning by-law) has not been verified.
3. **Decks/patios.** Decks and porches are **CLOSED (verified)** for the part inside a required setback: 10.5.40.60(1) makes them permitted encroachments (L23), and 10.5.50.10(6)(A)(i) excludes that area from the landscaping calculation (L13). **Still open:** at-grade patios. The word "patio" does not appear in Chapter 10.5 (L24), so it is unresolved whether a patio is hard-surfaced landscaping (L1/L2) or neither. Also open: platforms that sit outside the required setback.
4. **Driveway area.** Width is **CLOSED (verified)**: L15 sets the tiers, and Chapter 200 bounds a single parking space at 2.6 m minimum width (+0.3 m per obstructed side) and 3.2 m maximum (L25/L26). **Still open:** the by-law sets no driveway length, so driveway area needs NF-27 × the front-yard depth, and front-yard depth depends on where the front wall actually sits, which is not a column. Whether the 200.5.1.10(2) exceptions apply to private residential garages was not checked.

### STAND_SET / `bylaw_standard_setback_m` — CRITICAL finding (2026-09-29, pending panel + operator ruling)

The field is kept. The City's data dictionary defines it as STAND_SET = (Set of standards referred to in the Commercial-Residential mixed use zone, based on three different design typologies. The "standard set" number is prefaced by the letters "SS" in the zone label.) [H28] — a Commercial-Residential Development Standard Set selector (Chapter 40: H26/H27, Spec 67 Appendix E), not a distance. Values are only 1.00 (1,925), 2.00 (17,124), 3.00 (3,602); 2164 of 2173 CR source rows carry it. 2,341 residential parcels carry it only because the zoning pass sources it with MAX across base candidates (2338 have no STAND_SET on their own base row; 2333 touch a CR polygon with ~0 area share). The max-build pass uses it as a front setback in metres. See `.cursor/wf2_bylaw_formula_fixes_active_task.md` "Scope additions" (c) and EF-25/EF-26 for the proposed rule and the impact counts.

### Existing fields changed — FULL TABLE, ported verbatim

| ID | Existing field | Current calculation | New calculation | Constraints | Direction | Affected population |
|---|---|---|---|---|---|---|
| EF-1 | `max_build_setback_basis` | `CASE WHEN bylaw_standard_setback_m IS NOT NULL THEN 'bylaw' ELSE 'zone_default' END` | Same CASE structure, but `'zone_default'` now means "verified universal formula, evaluated with this parcel's own frontage/depth" — a meaning change, no value/structure change | None — pure semantic reinterpretation | Confidence label upgrades; no value change | Every parcel currently on `'zone_default'` |
| EF-2 | `max_buildable_footprint_sqm` | `LEAST(buffer, box, coverage_cap)`, `box` built from flat 6.0m front / 0.9m side / 7.5m rear constants | Same `LEAST()`, but `box`/`buffer` use NF-1/NF-2/NF-3 (real front/side/rear) AND are additionally `MIN()`-capped against NF-10/NF-11 (length/depth) | Requires NF-1, NF-2, NF-3, NF-10, NF-11 all landed; NF-3's RT/RM branch additionally requires NF-15 non-NULL | **Decreases in the common case — but NOT guaranteed, see EF-4** | `frontage_m ≥ 12` (side) or `depth_m > 30` (rear) or NF-10/11 binds, or NF-1's averaging branch (direction not fixed) |
| EF-3 | `max_build_width_m` | `frontage_m − side_count × 0.9` (flat) | `frontage_m − side_count × bylaw_min_side_setback_m` (NF-3), then `MIN(result, bylaw_max_building_length_m)` (NF-10) | Same NF-3/NF-15 dependency as EF-2; NF-10's `on_major_street` dependency unverified | **Decreases** | `frontage_m ≥ 12` (setback effect) or NF-10 binds (length-cap effect) |
| EF-4 | `max_build_length_m` | `depth_m − front_setback − 7.5` (flat rear, flat 6.0m front) | `depth_m − bylaw_min_front_setback_m (NF-1) − bylaw_min_rear_setback_m (NF-2)`, then `MIN(result, bylaw_max_building_depth_m)` (NF-11) | Requires NF-1, NF-2, NF-11 | **CROSS-FIELD INVARIANT — CONFIRMED REAL, NOT JUST A RISK (re-verified 2026-09-28): explicitly searched §10.20.40.70(1) and the surrounding averaging provisions for a floor clause — none exists.** *"No explicit minimum floor value is stated for averaged or reduced front yard setbacks... the provision permits reductions through averaging... but contains no language establishing a floor below which the setback cannot be reduced."* The rear-setback effect (NF-2) decreases this field on deep lots. NF-1's averaging branch, confirmed floor-free, CAN and WILL legitimately produce a front setback below 6.0m when a neighbour is built closer to the street — which INCREASES this field. **This is a genuine, by-law-permitted outcome, not a theoretical edge case — treat "may increase" as a real, expected population in the sanity-audit bounds (Execution Plan step 6), not a rare exception to guard against.** Breaks "decreases only" for every downstream field inheriting from EF-4 (EF-8, EF-13, EF-19-22) on any such parcel. | `depth_m > 30` (rear-setback effect, decreases) or NF-11 binds (decreases, RD/RS/RM only) or NF-1 averaging active with a closer-built neighbour (CONFIRMED possible — increases) |
| EF-5 | `max_build_height_m` | `bylaw_max_height_m` pass-through, NULL when overlay absent | `COALESCE(bylaw_max_height_m, NF-7-resolved-default)` — RD/RS/RT → 10.0; RM → 10.0/12.0 by `building_type` (NF-15) | RM branch requires NF-15 non-NULL or falls back to NULL (do not guess) | **NULL → populated** | The ~10% currently height-NULL |
| EF-6 | `max_build_stories` | `LEAST(pocket_p50, height_implied)`, `height_implied` NULL when `bylaw_max_height_m` NULL — cap silently absent | Same formula, `height_implied` now derives from EF-5's post-fix value | Inherits EF-5's dependency | **Decreases, only where pocket estimate > ~3 storeys** | The ~10% currently height-NULL, where empirical storeys exceed the legal cap |
| EF-7 | `max_build_stories_basis` | No `'bylaw'` value possible for the height-NULL slice | Gains a legitimate value for that slice | Inherits EF-5's dependency | Coverage increase | Same ~10% slice |
| EF-8 | `max_buildable_gfa_sqm` | `LEAST(footprint×stories, lot×FSI)` | Same formula, inherits EF-2's footprint and EF-6's stories | Inherits EF-2 + EF-6 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Union of EF-2/EF-3/EF-4/EF-6's populations |
| EF-9 | `max_build_confidence` | `CASE ... setback_is_bylaw ...` (front only) | Same CASE — should be revisited given NF-2/NF-3 make side/rear equally verified (a judgment call, not prescribed here) | Flagged, not prescribed | Confidence label upgrades (if revised) | Wherever other CASE conditions already held |
| EF-10 | `envelope_constrained`/`envelope_constraint_reason` | Ordered CASE on the old (smaller) setback consumption | Same ordered CASE, evaluated against the new (larger) setback consumption | Needs the existing D-C viability-floor guard to hold under the new, larger inputs | **New edge case** | Narrow, small, wide-frontage or deep lots near the margin |
| EF-11 | `max_buildable_gfa_basis` | `'coverage_box'` when width/length non-NULL | Could flip to `'coverage_only'` under the same margin cases as EF-10 | Same as EF-10 | **New edge case** | Same population as EF-10 |
| EF-12 | `market_exceeds_bylaw` | `pocket_p90 > height_implied`, uncomparable when `height_implied` NULL | Same formula, now genuinely comparable via EF-5's fix | Inherits EF-5's dependency | **Newly meaningful** (was silently uncomparable) | The ~10% currently height-NULL |
| EF-13 | `garden_suite_fits`, `max_garden_suite_gfa_sqm` | `rear_yard_depth = depth − front_setback − 7.5` (flat) | `rear_yard_depth = depth − NF-1 − NF-2` | Inherits NF-1 + NF-2 | **Decreases when NF-2 drives it — inherits EF-4's unresolved-direction caveat if NF-1 drives it instead** | `depth_m > 30` |
| EF-14 | `max_laneway_suite_gfa_sqm` | Same `rear_yard_depth` gate as EF-13 | Same gate, NF-1/NF-2-derived | Inherits NF-1 + NF-2 | **Decreases** | `depth_m > 30`, `abuts_laneway` |
| EF-15 | `rear_suite_type` | Chosen `'laneway'`/`'garden'`/NULL based on EF-13/EF-14 fit | Could flip to NULL at the margin | Inherits EF-13/EF-14 | **New edge case** | Deep lots near the suite-fit margin |
| EF-16 | `max_rear_suite_gfa_sqm`, `rear_suite_permission` | Chosen type's GFA + greenspace permission | Shrinks/nulls in lockstep with EF-15 | Inherits EF-15 | **Decreases / new edge case** | Same population |
| EF-17 | `max_garage_gfa_sqm`, `garage_capacity_cars`, `garage_constraint_reason`, `garage_permission` | `LEAST(garage_max_gfa, pct × rear_yard_area)`, old `rear_yard_area` | Same formula, new (smaller) `rear_yard_area` from NF-1/NF-2 | Inherits NF-1 + NF-2 | **Decreases / new edge case** | `depth_m > 30` |
| EF-18 | `cost_laneway_suite_total` | Prices old `max_laneway_suite_gfa_sqm` | Prices EF-14's post-fix value | Inherits EF-14 | **Decreases** | `depth_m > 30`, `abuts_laneway` |
| EF-19 | `opt_aor_gfa_sqm`/`opt_aor_storeys`/`opt_aor_units` | Reads pre-fix `max_buildable_footprint_sqm`/`max_build_stories` | Reads EF-2/EF-6 post-fix values | Inherits EF-2 + EF-6 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations as EF-2/EF-6 |
| EF-20 | `opt_coa_gfa_sqm`/`opt_coa_storeys` | Same feed, CoA tier | Same feed, post-fix | Inherits EF-19 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations |
| EF-21 | `max_build_fsi`/`coa_fsi` | `GFA ÷ lot`, pre-fix GFA | `GFA ÷ lot`, post-fix (smaller) GFA | Inherits EF-8/EF-20 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations |
| EF-22 | `cost_fb_total`, `cost_coa_total`, `cost_solar_total`, `cost_garden_suite_total`, `cost_garage_total` | Priced off pre-fix area fields | Priced off post-fix (smaller) area fields | Inherits EF-2/EF-8/EF-16/EF-17 | **Decreases in the common case — inherits EF-4's unresolved-direction caveat** | Same populations, proportionally |

### Additional by-law provisions in scope (ported verbatim)

| Provision | By-law citation | Requirement | Handling today |
|---|---|---|---|
| Front yard setback averaging | §10.5.40.70(1) | If an abutting lot's building fronts the same street within 15.0m: required front setback = neighbour's actual setback, or average of both neighbours' | Not implemented — the common case on a built-up street, not an edge case. See NF-1/NF-6. |
| Building length | §10.20.40.20(1) (+ RS/RM equivalents) | Max 17.0m baseline, 19.0m/25.0m major-street exceptions | Not implemented — see NF-10 |
| Building depth | §10.20.40.30(1) (+ RS/RM equivalents) | Max 19.0m from front-setback line | Not implemented — see NF-11 |
| Soft landscaping | §10.5.50 | Two-tier: front/corner = landscaping-coverage % THEN 75% of that must be soft; rear = direct single-step % | Not implemented at all for the main house — see NF-12/13/14 |
| Narrow-lot side setback reduction | §10.5.40.71(3-4) | Reduced side setbacks for additions on narrow lots | Not implemented — informational, out of this WF2's numbered-field scope |
| Existing-building setback grandfathering | §10.5.40.71 | Lawfully-existing building retains its original setback | Informational only, not a "max buildable" input |
| Parking placement | §10.5.80.10(3)/(5) | Parking cannot be located in a front yard abutting a street | Entirely new category, not modeled — out of this WF2's scope |
