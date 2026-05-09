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
5. After load, automatically triggers `link-massing.js`

### Edge Cases
- Shapefile URL changes → `assert_schema` (Tier 1) checks URL accessibility
- Large parameter counts → flushed at 30K to stay under PostgreSQL 65,535 limit
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Script:** `scripts/load-massing.js`
- **Consumed by:** `chain_sources.md` (step 7), `link_massing` (spatial matching)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
