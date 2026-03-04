# Spec 05 -- Address Geocoding

## 1. Goal & User Story
Geocode permit street addresses to latitude/longitude coordinates so that permits can be plotted on an interactive map and filtered by location.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts) |

## 3. Behavioral Contract
- **Inputs:** Permits with `latitude IS NULL AND street_num IS NOT NULL` selected from the database.
- **Core Logic:** Address composition in `src/lib/permits/geocode.ts` builds a geocodable string from permit fields: `{street_num} {street_name} {street_type} {street_direction}, {city}, ON {postal}`. Null/empty parts are omitted; `city` defaults to `"TORONTO"`; province is hardcoded to `"ON"`. Permits missing both `street_num` and `street_name` are skipped as non-geocodable. The Google Maps Geocoding API is called with `components=country:CA` bias, extracting `results[0].geometry.location.lat/.lng`. Rate limiting throttles to under 50 QPS (Google standard tier). Already-geocoded permits (non-null `latitude`, `longitude`, `geocoded_at`) are skipped to control API costs (~$5/1000 requests). When address fields change (via Spec 03 change detection), geocoding columns are reset to NULL to trigger re-geocoding on the next pass. Coordinates are stored as `DECIMAL(10,7)` on the `permits` table. Valid Toronto coordinates fall approximately within lat 43.58-43.86, lng -79.64 to -79.12. See `Permit` in `src/lib/permits/types.ts`.
- **Outputs:** Updated `permits.latitude`, `permits.longitude`, and `permits.geocoded_at` for each successfully geocoded permit.
- **Edge Cases:** `ZERO_RESULTS` or empty results array returns null coordinates without throwing; `OVER_QUERY_LIMIT` triggers backoff and retry; `REQUEST_DENIED`/`INVALID_REQUEST` are logged and skipped; missing `street_direction` or `postal` still resolves via Google; ambiguous short street names use first result; `geocode.ts` is planned but not yet fully implemented.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`geocoding.logic.test.ts, parcels.logic.test.ts`): Address Formatting for Geocoding; Geocode Result Validation; Batch Geocode Rate Limiting; parseStatedArea; unit conversions; parseLinearName; normalizeAddressNumber; parseAddress; estimateLotDimensions; createMockParcel; computeCentroid; haversineDistance; findNearestParcel; Spatial matching constants; Strategy 3 cascade behavior; parseGeoId; shoelaceArea; rectangularityRatio; IRREGULARITY_THRESHOLD; estimateLotDimensions area correction
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/permits/geocode.ts`
- `src/lib/parcels/address.ts`
- `scripts/geocode-permits.js`
- `src/tests/geocoding.logic.test.ts`
- `src/tests/parcels.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Writes to `permits.latitude`, `permits.longitude`, `permits.geocoded_at`.
- Consumed by **Spec 20 (Map View)**: Map uses geocoded coordinates for plotting.
- Consumed by **Spec 27 (Neighbourhood Profiles)**: Point-in-polygon matching uses geocoded coordinates.
