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
| **Formats** | Shapefile ZIP, GeoJSON, GeoPackage, CSV — all in **EPSG:4326** |
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

**Step 0a: Fast skip-check.** HEAD each CKAN resource URL. Compare `Last-Modified` against `records_meta.source_dataset_version` for most-recent successful `load_zoning` step in chain `sources`. If all 10 unchanged → emit SKIP summary with `audit_table.rows: [{ metric: 'no_op_refresh', value: true, status: 'INFO' }]` and exit.

**F-M4 fallback:** if cached `Last-Modified` is older than `2× expected cadence` (730 days), force re-load even if HEAD unchanged.

**Step 0b: Advisory lock.** Acquire lock 58 via `pipeline.withAdvisoryLock(pool, 58, async () => {...})`.

**Per-layer processing (D2 — each layer in its own `pipeline.withTransaction(client, async () => {...})`):**

**F-C4: ALL queries within a layer MUST use the `client` parameter from `withTransaction`** — never `pool.query`. The temp staging table is created on `client`'s connection and invisible to a different connection.

1. **Download Shapefile ZIP** from CKAN (EPSG:4326). On HTTP error (404/503/truncated) → record `<layer>_fetch_error` audit row + emit `<layer>_fetch_skipped: true`. Base → FAIL+abort whole load (D3). Overlay → WARN+skip layer (D3).
2. **Schema drift check** via `scripts/lib/zoning-attr-drift.js`: parse shapefile `.dbf`, compare attribute fields against frozen `REQUIRED_ATTR_COLUMNS`. **F-H3: only abort if a REQUIRED column is missing**; unknown extra columns emit `<layer>_attr_drift` WARN but DO NOT abort the layer.
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
- **Source dataset version unchanged:** Step 0a HEAD skip-check exits early (F-M4 force-reload after 730d if cache stale).
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

### Target Files (future implementation WF)
- `scripts/load-zoning.js`
- `scripts/lib/zoning-attr-drift.js`
- `scripts/lib/geometry-validator.js`
- `migrations/NNN_zoning_bylaw_tables.sql` (10 tables + GIST + CHECK + non-spatial indexes — NO `zoning_exceptions` per D6)
- `scripts/manifest.json` entry for `load_zoning`
- Edit to `scripts/quality/assert-schema.js` adding 10 zoning resource URL checks
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
                                              .on_major_street (Spec 63)          .base_zoning_class
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

### 8c. WF2 (future spec — NOT this WF) — `enrich-parcels.js`

Adds columns to `parcels` via spatial join. **F-C5: use `ST_Intersects(parcel.geom, zone.geom)` with area-ranked dominant-zone selection** — NOT `ST_Contains` (which only matches fully-contained parcels and misses boundary lots).

Future-spec deliverables (placeholder for visibility — NOT in scope here):
- Migration adding `parcels.zoning_class`, `.bylaw_max_coverage_pct`, `.bylaw_max_fsi`, `.bylaw_max_height_m`, `.exception_number`, etc. (F-H5 naming)
- `scripts/enrich-parcels.js` running spatial joins
- **Overlay precedence implementation (D4 + D7):** per-attribute "most-restrictive" logic — for ceiling attributes (height, coverage, FSI, units) MIN wins; for floor attributes (frontage, area_min) MAX wins; for categorical attributes first-seen wins with audit row surfacing conflicts
- **F-C2:** for LineString overlays use `ST_DWithin(parcels.geom::geography, road.geom::geography, road_overlay_distance_m)` — `::geography` cast mandatory
- Audit rows for parcels-with-no-base-zone (gap handling)
- New chain step in `chain_sources` after `load_zoning`

### 8d. WF3 (future spec — NOT this WF) — `enrich-permits.js`

Adds columns to `permits` and `coa_applications` via JOIN through `permit_parcels` / `lead_parcels` to enriched parcels.

**F-H7 — `lead_parcels` transitional check:** the CoA JOIN path via `lead_parcels` assumes Spec 42's mig 143-144 mirror triggers are still in place. If Spec 42's legacy-table drop phase has executed before WF3 is implemented, WF3 MUST use `permit_parcels` via `linked_permit_num` as primary path, with `lead_parcels` as fallback for CoA-only data. WF3 spec authoring MUST verify which tables exist.

Future-spec deliverables:
- Migration adding `permits.zoning_class`, `.applicable_bylaws jsonb`, `.overlay_summary jsonb`, `.lot_configuration`
- Migration adding `coa_applications.zoning_class`, `.variance_context jsonb`, `.base_zoning_class`
- `scripts/enrich-permits.js` — handles both permits + CoA paths
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
