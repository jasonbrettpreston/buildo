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
| **Format** | Shapefile (ZIP archive, WGS84) |
| **Schedule** | Quarterly (via `chain_sources`) |
| **Script** | `scripts/load-massing.js` |

### Target Table: `building_footprints`
| Column | Type | Notes |
|--------|------|-------|
| `source_id` | TEXT | PK — from shapefile feature ID |
| `geometry` | JSONB | GeoJSON polygon (EPSG:3857 Web Mercator — see "Geometry projection" below) |
| `geom` | GEOMETRY(Geometry, 4326) | PostGIS polygon for spatial linking — derived at load via `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry), 3857), 4326)` (same transform as the area columns). Consumed by `link-massing.js`'s fast path: **building-centroid-in-parcel** — `bf.geom && p.geom AND ST_Contains(parcels.geom, ST_SetSRID(ST_MakePoint(bf.centroid_lng, bf.centroid_lat), 4326))` (WF3 2026-06-22; the prior `ST_Contains(bf.geom, parcel_centroid)` was backwards — a house covers ~35% of its lot so the lot centroid lands in the yard, not under the building, missing ~42% of parcels; the JS fallback was already correct, the PostGIS path was an un-flipped oversight). Requires GiST on BOTH `building_footprints.geom` and `parcels.geom` (migration 039). (WF3 2026-06-10: prior to this, `geom` was populated by migrations 065/098 with `ST_SetSRID(...,4326)` WITHOUT transforming — mislabeling Mercator as WGS84 — and only ran on the empty table; `load-massing.js` now owns geom population, with `scripts/one-time/backfill-building-footprints-geom.js` for existing rows.) |
| `footprint_area_sqm` | DECIMAL(12,2) | Computed at load-time via PostGIS — see "Geometry projection" below |
| `footprint_area_sqft` | DECIMAL(12,2) | sqm × 10.7639104167 |
| `max_height_m` | DECIMAL(8,2) | Building max height in meters |
| `min_height_m` | DECIMAL(8,2) | Building min height in meters |
| `estimated_stories` | INTEGER | Derived from height / story-height-by-use-type |
| `centroid_lat` | NUMERIC | Footprint centroid (WGS84) |
| `centroid_lng` | NUMERIC | Footprint centroid (WGS84) |

**PK:** `(source_id)`
**Upsert:** `ON CONFLICT (source_id) DO UPDATE`
**Parameter safeguard:** Flushes INSERT at 30,000 params (§9.2)

> **Geometry projection (WF2 #C 2026-05-09):** the shapefile's GeoJSON polygon is stored in EPSG:3857 (Web Mercator pseudo-meters), NOT WGS84. Coordinates look like `[-8821751.236, 5428977.45]` — values >> ±180 indicate projected. Area columns (`footprint_area_sqm`, `footprint_area_sqft`) are computed at the DB layer via PostGIS:
>
> ```sql
> ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography)
> ```
>
> Why DB-side: the JS-side `shoelaceArea` only handles WGS84 and was previously skipping Web Mercator inputs by emitting NULL — the 427K-NULL bug class fixed in mig 122. Skipping introduced the WF2 #C blast radius (Spec 83 §3 GFA Step A consumed NULL for every permit; Surgical Triangle silently fell back to lot-size). The DB-side path handles both projections uniformly without requiring a JS reprojection library (proj4 was the rejected alternative).
>
> The post-INSERT UPDATE pass at the end of `load-massing.js` populates new rows; mig 122 covered the legacy 427K backfill. Idempotent (`WHERE footprint_area_sqm IS NULL`); safe to re-run.
>
> **Cross-spec dependency (Spec 83 §3 GFA Step A):** `compute-cost-estimates.js` reads `bf.footprint_area_sqm` for the Surgical Triangle's GFA primary path; lot-size is the documented fallback for permits without a building chain. Pre-WF2 #C, every permit was on the fallback path because the column was always NULL.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Download shapefile ZIP, extract to temp directory
2. Parse shapefile features, convert to GeoJSON
3. Calculate centroids for each footprint
4. Batch upsert with parameter flush threshold (30K params)
5. `link-massing.js` runs as the next manifest chain step in the `sources` chain (a chain-step, not an auto-trigger fired from within the loader)

### `link-massing.js` `--full` gate (WF2 P11-2)
The `--full` chain_arg (added `0031f37` for the one-time b16c036 ghost-link cleanup + full re-link) was always-on in the `sources` chain, costing ~21.9 min every quarterly run even when nothing changed. `--full` now **permits** a full relink; a gate (`scripts/lib/massing-full-gate.js`) decides whether one is actually needed:
- **DATA signal:** the `building_footprints` corpus **count** changed vs the value the last completed `link_massing` run recorded (`records_meta.building_footprints_count`). A churn-free signal — `load-massing` carries no dataset-version in its meta and its `records_updated` is a constant 4-row churn.
- **CODE signal:** `LINK_MASSING_CODE_VERSION` (in the gate lib) — bump it on ANY change to the matching predicate / structure classification / ghost cleanup (the b16c036-class guard; a pure data gate would have silently skipped the predicate FLIP itself, leaving ghost links). Recorded in meta, compared next run.
- **Decision:** `FULL_MODE = LINK_MASSING_FORCE_FULL=1 || (--full && gate.changed)`. Missing pre-P11 signals are treated as UNCHANGED (the last completed sources run WAS a full relink with the current predicate, so an incremental run is correct). The `permits`-chain run (no `--full`) stays incremental regardless.
- **Full path is preserved:** a changed data/code signal still runs the full ghost-link cleanup (the `DELETE` gated on `FULL_MODE`) + full rescan. `LINK_MASSING_FORCE_FULL=1` is the manual escape hatch.

### Edge Cases
- Shapefile URL changes → `assert_schema` (Tier 1) checks URL accessibility
- Large parameter counts → flushed at 30K to stay under PostgreSQL 65,535 limit
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-massing.js`
- **Consumed by:** `chain_sources.md` (step 7), `link_massing` (spatial matching), `compute-cost-estimates.js` (GFA Step A — `footprint_area_sqm`), and `enrich-parcels.js` Spec 65 §5 existing-structure pass (PRIMARY building footprint/stories/height/geom → `parcels.existing_*`, propagated to permits/coa)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
