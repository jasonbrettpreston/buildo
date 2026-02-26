# Spec 31 -- Building Massing Integration

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
| `STORY_HEIGHT_M` | 3.0 | Average floor-to-floor height |
| `PRIMARY_THRESHOLD_SQM` | 40 | Min area for primary classification |
| `SHED_THRESHOLD_SQM` | 20 | Below this = shed |
| `GARAGE_MAX_SQM` | 60 | 20-60 sqm accessory = garage |
| `BBOX_OFFSET` | 0.003 | ~333m pre-filter radius |

### Geometry Functions

- `estimateStories(maxHeightM)` → `number | null`
- `classifyStructure(areaSqm, allAreas)` → `StructureType`
- `pointInPolygon(point, ring)` → `boolean` (ray-casting)
- `computeFootprintArea(ring)` → `number | null` (Shoelace formula)
- `formatHeight(meters)` → `string` (e.g. "9.5 m (31.2 ft)")
- `formatArea(sqft)` → `string` (e.g. "1,500 sq ft")
- `computeBuildingCoverage(buildingAreaSqft, lotSizeSqft)` → `number | null`

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/massing/types.ts` | New | BuildingFootprint, ParcelBuilding, BuildingMassingInfo interfaces |
| `src/lib/massing/geometry.ts` | New | Geometry + classification functions |
| `src/tests/massing.logic.test.ts` | New | ~30 tests for massing functions |
| `src/tests/factories.ts` | Modify | Add createMockBuildingFootprint, createMockParcelBuilding |
| `src/tests/ui.test.tsx` | Modify | Add Building Massing display logic tests |
| `scripts/load-massing.js` | New | Download SHP, stream features, batch INSERT |
| `scripts/link-massing.js` | New | Point-in-polygon matching, classify structures |
| `src/components/permits/BuildingMassing.tsx` | New | UI component |
| `src/app/api/permits/[id]/route.ts` | Modify | Add massing JOIN query |
| `src/app/permits/[id]/page.tsx` | Modify | Render BuildingMassing component |
| `migrations/023_building_footprints.sql` | New | building_footprints table |
| `migrations/024_parcel_buildings.sql` | New | parcel_buildings junction table |
| `migrations/025_quality_massing.sql` | New | Quality snapshot columns |
| `src/lib/quality/metrics.ts` | Modify | Add massing coverage query |
| `src/lib/quality/types.ts` | Modify | Add massing snapshot fields |

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
      "max_height_m": 9.5
    },
    "accessory": [
      { "structure_type": "garage", "footprint_area_sqft": 387 }
    ],
    "building_coverage_pct": 34.2
  }
}
```

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
