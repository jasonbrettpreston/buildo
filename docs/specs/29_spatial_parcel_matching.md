# Spec 29 -- Spatial Parcel Matching

## 1. Goal & User Story
As a system operator, I want permits that fail address-based parcel matching to fall back to spatial proximity matching using geocoded coordinates, so that ~53K unlinked permits gain parcel data and neighbourhood profiles.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend script) |

## 3. Behavioral Contract
- **Inputs:** Geocoded permits (lat/lng from address points via `geo_id`) that failed both address-matching strategies; parcels with pre-computed centroid coordinates.
- **Core Logic:**
  - 3-step matching cascade in `scripts/link-parcels.js`: Strategy 1 exact address (confidence 0.95), Strategy 2 name-only (0.80), Strategy 3 spatial proximity (0.65).
  - Strategy 3 fires only when both address strategies fail. For each unmatched permit with lat/lng: bounding box pre-filter at +/-0.001 degrees (~111m lat, ~82m lng), then haversine distance to each candidate parcel centroid, select nearest within 100m threshold. See `haversineDistance()` in `src/lib/parcels/geometry.ts`.
  - Confidence 0.65 reflects geocoding imprecision (10-50m) and centroid offset from street address.
  - Parcel centroids pre-computed by `scripts/compute-centroids.js` from outer ring of geometry polygons, stored in `centroid_lat`/`centroid_lng` columns (migration 016) with a compound index.
  - Free geocoding via Toronto Address Points dataset (~525K records, migration 018). `scripts/load-address-points.js` loads CSV, `scripts/geocode-permits.js` bulk-updates permits via `geo_id` join. 96.9% of permits have `geo_id`.
  - Spatial matches stored with `match_type = 'spatial'` in `permit_parcels` table. Re-runnable via `ON CONFLICT ... DO UPDATE`.
- **Outputs:** New rows in `permit_parcels` with `match_type='spatial'`, `confidence=0.65`; updated parcel coverage metrics in quality dashboard.
- **Edge Cases:**
  - Multiple parcels within threshold: pick nearest; if equidistant, pick lower `id` (deterministic).
  - Large parcels: permit may be 50-80m from centroid; 100m threshold accommodates this.
  - Corner lots: permit may be closer to adjacent parcel centroid; 0.65 confidence reflects this.
  - No parcel within 100m: no match recorded.
  - Re-running is idempotent (upsert, no duplicates).

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`parcels.logic.test.ts`): parseStatedArea; unit conversions; parseLinearName; normalizeAddressNumber; parseAddress; estimateLotDimensions; createMockParcel; computeCentroid; haversineDistance; findNearestParcel; Spatial matching constants; Strategy 3 cascade behavior; parseGeoId; shoelaceArea; rectangularityRatio; IRREGULARITY_THRESHOLD; estimateLotDimensions area correction
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/parcels/geometry.ts`
- `src/lib/parcels/types.ts`
- `scripts/load-parcels.js`
- `scripts/link-parcels.js`
- `scripts/load-address-points.js`
- `migrations/016_parcel_centroids.sql`
- `migrations/018_address_points.sql`
- `migrations/022_parcel_irregularity.sql`
- `src/tests/parcels.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/permits/geocode.ts`**: Governed by Spec 05. Geocoding is consumed, not modified.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/massing/`**: Governed by Spec 31. Building massing is a separate spec.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `parcels` and `permit_parcels` tables.
- Relies on **Spec 05 (Geocoding)**: Spatial matching uses geocoded permit coordinates.
- Consumed by **Spec 31 (Building Massing)**: Massing links buildings to parcels from this module.
- Consumed by **Spec 28 (Data Quality)**: Parcel coverage metrics tracked in quality dashboard.
