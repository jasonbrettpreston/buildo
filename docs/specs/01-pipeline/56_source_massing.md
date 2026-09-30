# Source: 3D Building Massing

<requirements>
## 1. Goal & User Story
As a spatial data dependency, this script ingests 3D building footprint volumes from Toronto Open Data shapefiles — enabling the system to understand existing building structures at permit locations and calculate construction scale.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **URL** | `ckan0.cf.opendata.inter.prod-toronto.ca/.../3dmassingshapefile_2025_wgs84.zip` |
| **Format** | Shapefile ZIP (filename says WGS84; the .prj and coordinates are EPSG:3857 Web Mercator) `[as-built 2026-09-27, row 3.6 ②]` |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-massing.js` (Spec 122 §5.1 frozen shell) + `scripts/load-massing.descriptor.json` + `scripts/lib/compute/load-massing.js` `[as-built 2026-09-27, row 3.6 ②]` |

### Target Table: `building_footprints`
| Column | Type | Notes |
|--------|------|-------|
| `source_id` | TEXT | PK — `'hash_' + md5(JSON.stringify(geometry)).slice(0,12)` — the DBF has no OBJECTID/ID; derived by compute `coerceKey` (0s) `[as-built 2026-09-27, row 3.6 ②]`. superseded: "from shapefile feature ID" |
| `geometry` | JSONB | GeoJSON polygon (EPSG:3857 Web Mercator — see "Geometry projection" below) |
| `geom` | GEOMETRY(Geometry, 4326) | PostGIS polygon for spatial linking — derived at load via `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry), 3857), 4326)` (same transform as the area columns). Consumed by `link-massing.js`'s fast path: **building-centroid-in-parcel** — `bf.geom && p.geom AND ST_Contains(parcels.geom, ST_SetSRID(ST_MakePoint(bf.centroid_lng, bf.centroid_lat), 4326))` (WF3 2026-06-22; the prior `ST_Contains(bf.geom, parcel_centroid)` was backwards — a house covers ~35% of its lot so the lot centroid lands in the yard, not under the building, missing ~42% of parcels; the JS fallback was already correct, the PostGIS path was an un-flipped oversight). Requires GiST on BOTH `building_footprints.geom` and `parcels.geom` (migration 039). (WF3 2026-06-10: prior to this, `geom` was populated by migrations 065/098 with `ST_SetSRID(...,4326)` WITHOUT transforming — mislabeling Mercator as WGS84 — and only ran on the empty table; `load-massing.js` now owns geom population, with `scripts/one-time/backfill-building-footprints-geom.js` for existing rows.) `[as-built 2026-09-27, row 3.6 ②]` as-built: computed AT INSERT by the library geometry validator from `geometry_srid: 3857` + `geometry_repair: "none"` (unrepaired, legacy parity; 17 invalid rows today, M-D2), `written: "insert_only"`. |
| `footprint_area_sqm` | DECIMAL(12,2) | Computed at load-time via PostGIS — see "Geometry projection" below. `[as-built 2026-09-27, row 3.6 ②]` As-built: computed AT INSERT by the validator (`derived_from_geometry` geodesic_area m2, scale 2, prerequisite 0u), `insert_only`. |
| `footprint_area_sqft` | DECIMAL(12,2) | sqm × 10.7639104167. `[as-built 2026-09-27, row 3.6 ②]` As-built: computed AT INSERT by the validator (`derived_from_geometry` geodesic_area ft2, scale 2, prerequisite 0u), `insert_only`. |
| `max_height_m` | DECIMAL(8,2) | Building max height in meters |
| `min_height_m` | DECIMAL(8,2) | Building min height in meters |
| `estimated_stories` | INTEGER | `max(1, round(max_height_m / massing_story_height_m))`, NULL when max height <= 0 (logic variable, default 3) `[as-built 2026-09-27, row 3.6 ②]`. superseded: "Derived from height / story-height-by-use-type" |
| `centroid_lat` | NUMERIC | Footprint centroid (WGS84) |
| `centroid_lng` | NUMERIC | Footprint centroid (WGS84) |
| `elev_z` | DECIMAL(8,2) | `[as-built 2026-09-27, row 3.6 ②]` `ELEVZ` else `SURF_ELEV`, 2 dp — written by the loader but previously missing from this table (`written: "step"`). |

**PK:** `(source_id)`
**Upsert:** `ON CONFLICT (source_id) DO UPDATE`
**Parameter safeguard:** `[as-built 2026-09-27, row 3.6 ②]` one step-scoped transaction; the library batches statements (`execution.batch` 1000). superseded: "Flushes INSERT at 30,000 params (§9.2)"

> **Geometry projection (WF2 #C 2026-05-09):** the shapefile's GeoJSON polygon is stored in EPSG:3857 (Web Mercator pseudo-meters), NOT WGS84. Coordinates look like `[-8821751.236, 5428977.45]` — values >> ±180 indicate projected. Area columns (`footprint_area_sqm`, `footprint_area_sqft`) are computed at the DB layer via PostGIS:
>
> ```sql
> ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography)
> ```
>
> Why DB-side: the JS-side `shoelaceArea` only handles WGS84 and was previously skipping Web Mercator inputs by emitting NULL — the 427K-NULL bug class fixed in mig 122. Skipping introduced the WF2 #C blast radius (Spec 83 §3 GFA Step A consumed NULL for every permit; Surgical Triangle silently fell back to lot-size). The DB-side path handles both projections uniformly without requiring a JS reprojection library (proj4 was the rejected alternative).
>
> `[as-built 2026-09-27, row 3.6 ②]` The post-INSERT UPDATE pass is retired: new rows are seeded at INSERT by the same expression (library geometry validator, `derived_from_geometry` + `geometry_srid: 3857`). M-D7: the heal-any-NULL half is retired and replaced by the FAIL invariants `footprint_area_null_count` / `geom_null_count` (both measured 0). superseded: "The post-INSERT UPDATE pass at the end of `load-massing.js` populates new rows; mig 122 covered the legacy 427K backfill. Idempotent (`WHERE footprint_area_sqm IS NULL`); safe to re-run."
>
> **Cross-spec dependency (Spec 83 §3 GFA Step A):** `compute-cost-estimates.js` reads `bf.footprint_area_sqm` for the Surgical Triangle's GFA primary path; lot-size is the documented fallback for permits without a building chain. Pre-WF2 #C, every permit was on the fallback path because the column was always NULL.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
`[as-built 2026-09-27, row 3.6 ②]` Runner phases: acquire (CKAN every run, `cache:"none"`, M-D10) -> parse shapefile + `coerceKey` -> `shapeRecord` (skip no-geometry / ring < 4) -> last-wins dedupe (M-D3) -> geometry validator (transform, area) -> class A guarded upsert (guard = the legacy five columns, M-D4 pinned; F2) -> checks + invariants + `execution.maintenance` VACUUM ANALYZE gated on `building_footprints_dead_tuple_ratio_warn_max` (M-D12).
superseded: "1. Download shapefile ZIP, extract to temp directory 2. Parse shapefile features, convert to GeoJSON 3. Calculate centroids for each footprint 4. Batch upsert with parameter flush threshold (30K params)"
`[as-built 2026-09-28, row 3.6 ③]` CUTOVER: `scripts/load-massing.js` is registered in `scripts/steps/_schema/converted.json` (22nd converted step, INGESTOR 5/9, class A); `massing -> link_massing` is now a live seam pair (both converted). Cloud prerequisite: seed the six massing logic variables (`scripts/seeds/apply-logic-variables.js`) before the first cloud sources run (LM-D15: a missing row throws).
5. `link-massing.js` runs as the next manifest chain step in the `sources` chain (a chain-step, not an auto-trigger fired from within the loader)

### `link-massing.js` `--full` gate (WF2 P11-2)
The `--full` chain_arg (added `0031f37` for the one-time b16c036 ghost-link cleanup + full re-link) was always-on in the `sources` chain, costing ~21.9 min every quarterly run even when nothing changed. `--full` now **permits** a full relink; a gate (`scripts/lib/massing-full-gate.js`) decides whether one is actually needed:
- **DATA signal:** the `building_footprints` corpus **count** changed vs the value the last completed `link_massing` run recorded (`records_meta.building_footprints_count`). A churn-free signal — `load-massing` carries no dataset-version in its meta and its `records_updated` is a constant 4-row churn.
- **CODE signal:** `LINK_MASSING_CODE_VERSION` (in the gate lib) — bump it on ANY change to the matching predicate / structure classification / ghost cleanup (the b16c036-class guard; a pure data gate would have silently skipped the predicate FLIP itself, leaving ghost links). Recorded in meta, compared next run.
- **Decision:** `FULL_MODE = LINK_MASSING_FORCE_FULL=1 || (--full && gate.changed)`. Missing pre-P11 signals are treated as UNCHANGED (the last completed sources run WAS a full relink with the current predicate, so an incremental run is correct). The `permits`-chain run (no `--full`) stays incremental regardless.
- **Full path is preserved:** a changed data/code signal still runs the full ghost-link cleanup (the `DELETE` gated on `FULL_MODE`) + full rescan. `LINK_MASSING_FORCE_FULL=1` is the manual escape hatch.
- **Interrupted-FULL failure mode (measured 2026-08-28):** the FULL-mode DELETE commits before the relink batch loop, so a forced FULL killed mid-rebuild leaves `parcel_buildings` partially empty (observed: 29,330 of 520,492 rows). Recovery is a forced re-run (`LINK_MASSING_FORCE_FULL=1`, ~14–27 min measured); this is documented behaviour, not a defect.

### Edge Cases
- Shapefile URL changes → `assert_schema` (Tier 1) checks URL accessibility
- Large parameter counts → flushed at 30K to stay under PostgreSQL 65,535 limit. `[as-built 2026-09-27, row 3.6 ②]` the library's own statement batching (`execution.batch`) owns this now.
- **Key-format change** `[as-built 2026-09-27, row 3.6 ②]` (non-`hash_` rows present) → invariant `building_footprints_foreign_key_space_rows` FAILs. The legacy auto-DELETE cleanup (S2–S5, including a cross-owner `parcel_buildings` DELETE against a no-cascade FK) is knowingly retired (M-D1: 0 such rows measured, unreachable once `coerceKey` derives the key from geometry only) — remediation is a runbook action, never an automatic DELETE.
- **Duplicate geometries** `[as-built 2026-09-27, row 3.6 ②]` (961 groups / 1,107 extra features in the 2025 file) → last occurrence wins (`source_key_policy.on_collision: "last_write_wins"`), counted by the INFO check `duplicate_key_count` (M-D3); an unchanged re-run now reads `records_updated` 0 (the legacy read a constant 4 from cross-batch self-overwrite).
- **Empty-source guard before the full-mode retraction (D-20, WF2 "Rules 10/11/12 mechanical checkers", C2, 2026-09-03).** The full-mode `DELETE FROM parcel_buildings ... WHERE parcel_id IN (SELECT id FROM parcels WHERE <baseFilter>)` carries no guard of its own against an empty or truncated `building_footprints` corpus — abort BEFORE the retraction runs whenever the upstream corpus is empty, or the run would delete all 520,492 links and rebuild nothing, leaving a junction table that is empty, a verdict that is PASS, and twelve derived parcel columns that go NULL one chain-step later. `link-massing.js`'s `empty_source_guard` check (`checks[].when:"pre_write"`) is the runtime enforcement — an unaccepted FAIL there means no DELETE statement is issued at all.
- **`borrowed_primary_links` plausibility row (WF3 S0.3, 2026-09-21).** `link-massing.descriptor.json` declares a new `plausibility[]` entry: a `match_type='nearest'` `parcel_buildings` primary link whose `building_id` is ALSO primary for >=1 OTHER parcel — the bounded fallback attributing a neighbour's building to this parcel as its own primary (a "borrowed primary"). WARN, `retighten_when:"zero rows"`; measured live 2026-09-21: **101,799**. This is `link_massing`'s OWN, producing-step-side visibility into the same population `assert_parcel_sanity`'s `existing_structure_borrowed_primary` observes downstream (Spec 43 §Core Logic items 16/25) — closes `review_followups.md:3123` ("0 of 42 rules reference `parcel_buildings`/`match_type`/`is_primary`") from the producer's side too. The fallback's own narrowing (overlap-only, retiring the disjoint `nearest` matches) is a separate, later WF (slice 1 of `.cursor/wf3_existing_structure_area_artifacts_active_task.md`), not this row.
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-massing.js`
- **Consumed by:** `chain_sources.md` (step 15 of 28 — `scripts/manifest.json` `chains.sources`; `[as-built 2026-09-27, row 3.6 ②]` superseded: "step 7"), `link_massing` (spatial matching), `compute-cost-estimates.js` (GFA Step A — `footprint_area_sqm`), and `enrich-parcels.js` Spec 65 §5 existing-structure pass (PRIMARY building footprint/stories/height/geom → `parcels.existing_*`, propagated to permits/coa)
- **Relies on:** `pipeline_system.md` (SDK)

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `massing` — INGESTOR · converted · owner specs: 56
  - `scripts/load-massing.js`
  - `scripts/load-massing.descriptor.json`
  - `scripts/load-massing.notes.json`
  - `scripts/lib/compute/load-massing.js`
  - `src/tests/steps/massing/violations.test.ts`
  - data: `building_footprints` writes (migrations/023_building_footprints.sql)
  - upstream: none
  - downstream: enrich_parcels · link_massing
  - consumers: massing (records_meta massing_load) · src/components/FreshnessTimeline.tsx (records_meta audit_table)
- `link_massing` — LINK · converted · owner specs: 56
  - `scripts/link-massing.js`
  - `scripts/link-massing.descriptor.json`
  - `scripts/link-massing.notes.json`
  - `scripts/lib/compute/link-massing.js`
  - `src/tests/steps/link_massing/metamorphic.test.ts`
  - `src/tests/steps/link_massing/nearest-determinism.test.ts`
  - `src/tests/steps/link_massing/rung1-inline-wkt.test.ts`
  - `src/tests/steps/link_massing/violations.test.ts`
  - data: `building_footprints` reads (migrations/023_building_footprints.sql); `parcel_buildings` writes (migrations/024_parcel_buildings.sql); `parcels` reads (migrations/011_parcels.sql)
  - upstream: compute_centroids · massing · parcels
  - downstream: compute_cost_estimates · enrich_parcels
  - consumers: link_massing (records_meta building_footprints_count) · link_massing (records_meta code_version) · src/components/FreshnessTimeline.tsx (audit_metric link_rate)
<!-- /generated:target-files -->
- `scripts/seeds/logic_variables.json` — the six massing keys: `massing_skip_rate_max_pct`, `massing_batch_error_rate_max_pct`, `massing_story_height_m`, `massing_download_timeout_ms`, `building_footprints_dead_tuple_ratio_warn_max`, `building_footprints_maintenance_timeout_minutes` (`sources_building_footprints_floor` is shared with assert_data_bounds).
- `scripts/analysis/probe-shapefile-acquire.mjs` — batch-2 row 3.6 P-M memory/key probe: measures the massing shapefile through the runner's own `acquire.js` acquisition seam (read-only; opt-in one SELECT under `--db`) ahead of the `load-massing.js` conversion (Fold SF-7, WF2 row 3.6).
- `scripts/analysis/massing-cohort-differential.js` — batch-2 row 3.6 R-AS forced-change cohort differential (Spec 124 R-AS): derives + commits the D/U/E forced-change cohort and runs the pre/post proof through `capture-step-golden.js`, restore-always (Fold SF-7, Fold SF-5).

### Step-file notes
*Moved out of Target Files by the generated-Target-Files WF2 (2026-09-30): the step-owned files are listed by the generated block under Target Files; each note below is the annotation its bullet carried, verbatim.*
- `scripts/load-massing.js` — this spec defines the massing loader's contract (§2/§3). `[as-built 2026-09-27, row 3.6 ②]` Spec 122 §5.1 frozen shell, lock 56.
- `scripts/load-massing.descriptor.json` — the step declared as data (class A `guarded_upsert`, `geometry_srid`/`geometry_repair`/`derived_from_geometry`, checks, invariants, maintenance).
- `scripts/load-massing.notes.json` — the prose sidecar (8 entries + fences).
- `scripts/lib/compute/load-massing.js` — the domain logic only (`coerceKey`, `shapeRecord`, dedupe, checks).
- `src/tests/steps/massing/**` — the row-3.6 violations suite + fixtures.
- `scripts/link-massing.js` — this spec defines the `--full` gate's DATA/CODE signals, decision logic and empty-source guard (§3).

### Cross-Spec Dependencies
- `scripts/load-permits.js` — the `permits`-chain run (no `--full`) is referenced only as context for the gate decision (§3); this spec does not define its contract.
- `scripts/enrich-parcels.js` — consumes massing/`building_footprints` data for its Spec 65 §5 existing-structure pass (§4 Consumed by); this spec does not define its contract.
- `scripts/compute-cost-estimates.js` — reads `bf.footprint_area_sqm` as a cross-spec dependency (§3 note, Spec 83 §3 GFA Step A); this spec does not define its contract.
- `scripts/lib/step/acquire.js`, `scripts/lib/step/write.js`, `scripts/lib/step/index.js`, `scripts/lib/step/plausibility.js` — the step library that executes this descriptor (acquisition, the validator + guarded upsert, the ingest runner, invariants + maintenance); Spec 122 owns their contract.
- `scripts/lib/safe-math.js` — `safeParseFloat` used by the massing compute; Spec 55 owns its contract.
- `scripts/quality/assert-schema.js` — Tier 1 shapefile-URL-accessibility gate referenced as context (§3 Edge Cases); its threshold is owned by its own step spec.
</constraints>
