# Spec 31 -- Building Massing Integration

## 1. Goal & User Story
As a contractor viewing a permit, I want to see the size and height of the existing building on the lot, plus whether there are accessory structures (garages, sheds), so I can better estimate the scope and complexity of the work.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend script) |

## 3. Behavioral Contract
- **Inputs:** Toronto 3D Massing dataset (ESRI Shapefile, WGS84, ~500MB compressed, updated annually); parcel centroids already in DB from Spec 29; permit fields `storeys`, `scope_tags` for story estimation use-type.
- **Core Logic:**
  - `scripts/load-massing.js` downloads and streams the SHP file, batch-inserts into `building_footprints` table (migration 023) with source_id, geometry JSONB, footprint areas (sqm/sqft via Shoelace formula), max/min height, elevation, estimated stories, and centroid coordinates.
  - `scripts/link-massing.js` matches parcels to building footprints via multi-point approach: (1) centroid point-in-polygon test (confidence 0.90, match_type 'polygon'), (2) 4 bounding box edge midpoints as fallback (0.75, 'multipoint'), (3) haversine distance fallback within 50m (0.60, 'nearest'). BBOX pre-filter at +/-0.003 degrees (~333m). Results stored in `parcel_buildings` junction table (migration 024) with `is_primary`, `structure_type`, `match_type`, `confidence`.
  - Structure classification by area: largest polygon = primary, 20-60 sqm = garage, <20 sqm = shed, >60 sqm (not largest) = other. Solo building is always primary.
  - 3-tier story estimation via `resolveStories()`: Tier 1 uses `permit.storeys` directly, Tier 2 uses height divided by use-type coefficient (residential=2.9m, commercial=4.0m, industrial=4.5m, mixed-use=3.5m), Tier 3 falls back to height/3.0m. `stories_source` tracks which tier was used. See `src/lib/massing/geometry.ts`.
  - Permit detail API joins massing data and returns primary structure (area, stories, height, stories_source), accessory structures list, and building coverage percentage. UI component `BuildingMassing.tsx` renders this section.
  - Geometry helpers: `estimateStories()`, `resolveStories()`, `inferMassingUseType()`, `classifyStructure()`, `pointInPolygon()` (ray-casting), `computeFootprintArea()` (Shoelace), `computeBuildingCoverage()` (capped at 100%), formatting functions. See `src/lib/massing/geometry.ts` and types in `src/lib/massing/types.ts`.
- **Outputs:** Massing section on permit detail page showing primary structure footprint/stories/height, accessory structures, and building coverage %. API returns massing object or null. Quality dashboard tracks `building_footprints_total` and `permits_with_massing`.
- **Edge Cases:**
  - Parcel with no matched buildings shows "not available".
  - MultiPolygon geometry: each sub-polygon tested independently.
  - MAX_HEIGHT of 0, null, or negative treated as null for story estimation.
  - Building coverage can exceed 100% in rare cases; clamped to 100%.
  - Solo building always classified as primary regardless of area.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`massing.logic.test.ts`): estimateStories; classifyStructure; pointInPolygon; computeFootprintArea; formatHeight; formatArea; formatStories; formatCoverage; computeBuildingCoverage; resolveStories; STORY_HEIGHT_BY_USE_TYPE; inferMassingUseType
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

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
