# Spec 31 -- Building Massing Integration

**Status:** Implemented
**Last Updated:** 2026-03-03

## 1. User Story

> As a contractor viewing a permit, I want to see the size and height of the
> existing building on the lot, plus whether there are accessory structures
> (garages, sheds), so I can better estimate the scope and complexity of the work.

## 2. Technical Logic

### Overview

Integrates Toronto's 3D Massing dataset, which maps the precise footprint polygon
and height of every building in the city. A single parcel can contain multiple
building polygons (main house + detached garage + shed). By spatially joining
parcel centroids to building footprint polygons, we display building size,
estimated stories, and accessory structures on the permit detail page.

### Data Source

**Toronto Open Data — 3D Massing (ESRI Shapefile, WGS84)**

- Updated annually (last refreshed 2025-12-05)
- Key attributes: `MAX_HEIGHT`, `MIN_HEIGHT`, `ELEVZ` (base elevation)
- Does NOT include story count (derived: `MAX_HEIGHT / 3.0m`)
- Does NOT include pools (above-ground structures only)
- Format: SHP (requires `shapefile` npm package to read)

### Matching Strategy

1. Take parcel centroid (`centroid_lat`/`centroid_lng`, already in DB)
2. BBOX pre-filter: find building footprints with centroids within ±0.003° (~333m)
3. Point-in-polygon: test if parcel centroid falls inside each building polygon
   (using `@turf/boolean-point-in-polygon`)
4. Classify: largest polygon = primary structure, smaller = accessory
   (garage/shed/other by area threshold)

### Structure Classification

| Area Range (sqm) | Classification |
|-------------------|----------------|
| Largest polygon   | `primary`      |
| 20–60 sqm         | `garage`       |
| < 20 sqm          | `shed`         |
| > 60 sqm (not largest) | `other`  |

### Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `STORY_HEIGHT_M` | 3.0 | Default floor-to-floor height (Tier 3 fallback) |
| `SHED_THRESHOLD_SQM` | 20 | Below this = shed |
| `GARAGE_MAX_SQM` | 60 | 20-60 sqm accessory = garage |
| `SQM_TO_SQFT` | 10.7639 | Metric to imperial conversion |
| `NEAREST_MAX_DISTANCE_M` | 50 | Haversine distance fallback for link-massing |

### 3-Tier Story Estimation

Stories are resolved via a 3-tier cascade rather than a flat 3.0m constant:

| Tier | Source | Method |
|------|--------|--------|
| 1 | `permit.storeys` | Use directly (most reliable) |
| 2 | `maxHeightM` + use-type coefficient | residential=2.9m, commercial=4.0m, industrial=4.5m, mixed-use=3.5m |
| 3 | `maxHeightM` / 3.0m | Default fallback |

Implemented in `resolveStories(permitStoreys, maxHeightM, useType)`. The `stories_source`
field tracks which tier was used: `'permit'`, `'height_typed'`, or `'height_default'`.

### Matching Strategy (Enhanced)

The `link-massing.js` script uses a multi-point approach:

1. **Centroid** point-in-polygon test (primary)
2. **4 bounding box edge midpoints** as fallback (north, south, east, west of parcel centroid)
3. **Haversine distance** fallback (≤50m) for parcels near but not inside any polygon

Each match records `match_type` (`polygon`, `multipoint`, `nearest`) and `confidence`
(0.90, 0.75, 0.60 respectively) in the `parcel_buildings` junction table.

### Geometry Functions

- `estimateStories(maxHeightM)` → `number | null` — basic height/3.0 estimation
- `resolveStories(permitStoreys, maxHeightM, useType)` → `{ stories, source }` — 3-tier cascade
- `inferMassingUseType(permit)` → `string` — detect residential/commercial/industrial from permit
- `classifyStructure(areaSqm, allAreas)` → `StructureType`
- `pointInPolygon(point, ring)` → `boolean` (ray-casting)
- `computeFootprintArea(ring)` → `number | null` (Shoelace formula with equirectangular projection)
- `formatHeight(meters)` → `string` (e.g. "9.5 m (31.2 ft)")
- `formatArea(sqft)` → `string` (e.g. "1,500 sq ft")
- `formatStories(stories)` → `string`
- `formatCoverage(pct)` → `string`
- `computeBuildingCoverage(buildingAreaSqft, lotSizeSqft)` → `number | null` (caps at 100%)

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/massing/types.ts` | BuildingFootprint, ParcelBuilding, BuildingMassingInfo interfaces | Implemented |
| `src/lib/massing/geometry.ts` | Geometry + classification functions, 3-tier story cascade | Implemented |
| `src/tests/massing.logic.test.ts` | 86 tests covering all geometry, classification, and formatting | Implemented |
| `src/tests/factories.ts` | Mock factories for BuildingFootprint, ParcelBuilding | Implemented |
| `scripts/load-massing.js` | Download SHP, stream features, batch INSERT | Implemented |
| `scripts/link-massing.js` | Multi-point matching + haversine fallback, classify structures | Implemented |
| `src/components/permits/BuildingMassing.tsx` | UI component for permit detail page | Implemented |
| `src/app/api/permits/[id]/route.ts` | Massing JOIN query with 3-tier story cascade | Implemented |
| `src/app/permits/[id]/page.tsx` | Render BuildingMassing section | Implemented |
| `migrations/023_building_footprints.sql` | building_footprints table (12 columns) | Implemented |
| `migrations/024_parcel_buildings.sql` | parcel_buildings junction table | Implemented |
| `migrations/025_quality_massing.sql` | Quality snapshot massing columns | Implemented |
| `migrations/026_parcel_buildings_confidence.sql` | Add match_type + confidence columns | Implemented |
| `src/lib/quality/metrics.ts` | Massing coverage query | Implemented |
| `src/lib/quality/types.ts` | Massing snapshot fields | Implemented |

## 4. Constraints & Edge Cases

- Parcel may have no matched buildings → section shows "not available"
- Building polygon may be MultiPolygon → test each sub-polygon
- MAX_HEIGHT of 0 or null → estimated_stories = null
- Negative height values → treated as null
- Solo building is always classified as primary regardless of area
- Building coverage can exceed 100% in rare cases (clamp to 100%)
- SHP file is ~500MB compressed; streaming is essential

## 5. Data Schema

### building_footprints

```
id                  SERIAL          PRIMARY KEY
source_id           VARCHAR(50)
geometry            JSONB           NOT NULL
footprint_area_sqm  DECIMAL(12,2)
footprint_area_sqft DECIMAL(12,2)
max_height_m        DECIMAL(8,2)
min_height_m        DECIMAL(8,2)
elev_z              DECIMAL(8,2)
estimated_stories   INTEGER
centroid_lat        DECIMAL(10,7)
centroid_lng        DECIMAL(10,7)
created_at          TIMESTAMP       NOT NULL DEFAULT NOW()
```

### parcel_buildings

```
id              SERIAL          PRIMARY KEY
parcel_id       INTEGER         NOT NULL FK -> parcels(id)
building_id     INTEGER         NOT NULL FK -> building_footprints(id)
is_primary      BOOLEAN         NOT NULL DEFAULT false
structure_type  VARCHAR(20)     NOT NULL DEFAULT 'other'
match_type      VARCHAR(30)                                -- polygon, multipoint, nearest (migration 026)
confidence      DECIMAL(3,2)                               -- 0.60-0.90 (migration 026)
linked_at       TIMESTAMP       NOT NULL DEFAULT NOW()
UNIQUE (parcel_id, building_id)
```

### API Response Addition

```json
{
  "massing": {
    "primary": {
      "footprint_area_sqft": 1297,
      "estimated_stories": 3,
      "max_height_m": 9.5,
      "stories_source": "height_typed"
    },
    "accessory": [
      { "structure_type": "garage", "footprint_area_sqft": 387 }
    ],
    "building_coverage_pct": 34.2
  }
}
```

`stories_source` tracks the 3-tier cascade tier used: `"permit"`, `"height_typed"`, or `"height_default"`.

## 6. Integrations

### Internal
- **Parcel Linking (Spec 25):** Uses parcel centroids for spatial matching
- **Permit Detail (Spec 18):** New section between Property Details and Neighbourhood
- **Data Quality (Spec 26):** Tracks building_footprints_total, parcels_with_buildings

### External
- **Toronto Open Data — 3D Massing:** Annual SHP download

## 7. Triad Test Criteria

### A. Logic Layer (`massing.logic.test.ts`)
- estimateStories: 3m→1, 6m→2, 9.5m→3, 2.5m→1, null→null, 0→null, negative→null
- classifyStructure: largest=primary, 20-60sqm=garage, <20sqm=shed, solo=primary, >60sqm=other
- pointInPolygon: inside=true, outside=false, far=false, boundary
- computeFootprintArea: known rectangle area, null for invalid, <4 points
- formatHeight/formatArea: metric+imperial, null=N/A
- computeBuildingCoverage: 50% case, null lot, null building, 0 area, caps at 100%

### B. UI Layer (`ui.test.tsx`)
- Primary structure formatting, accessory list, coverage %, empty state

### C. Infra Layer
- API route returns massing data when linked
- API route returns massing=null when not linked

---

## Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/massing/geometry.ts`
- `src/lib/massing/types.ts`
- `src/components/permits/BuildingMassing.tsx`
- `scripts/load-massing.js`
- `scripts/link-massing.js`
- `migrations/023_building_footprints.sql`
- `migrations/024_parcel_buildings.sql`
- `migrations/025_quality_massing.sql`
- `migrations/026_parcel_buildings_confidence.sql`
- `src/tests/massing.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/parcels/address.ts`**: Governed by Spec 05/29. Parcel address matching is consumed, not modified.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/parcels/geometry.ts`**: Governed by Spec 29. Parcel geometry is consumed, not modified.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `building_footprints` and `parcel_buildings` tables.
- Relies on **Spec 29 (Spatial Parcel Matching)**: Links buildings to parcels using parcel data.
- Consumed by **Spec 18 (Permit Detail)**: Permit detail page displays building massing data.
- Consumed by **Spec 28 (Data Quality)**: Massing coverage tracked in quality dashboard.
