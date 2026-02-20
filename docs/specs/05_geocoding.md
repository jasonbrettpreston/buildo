# Spec 05 -- Address Geocoding

## 1. User Story

> As a user, I want to see permits on a map, which requires geocoding the street
> addresses from the Toronto Open Data feed to latitude/longitude coordinates so
> that permits can be plotted on an interactive map and filtered by location.

## 2. Technical Logic

### Address Composition

The geocodable address is composed from multiple permit fields:

```
{street_num} {street_name} {street_type} {street_direction}, {city}, ON {postal}
```

Example: `"123 QUEEN ST W, TORONTO, ON M5V 2A1"`

**Rules:**
- Each component is trimmed; null/empty parts are omitted from the string.
- `street_direction` is optional (many permits lack it; `trimToNull()` already
  normalizes whitespace-only values to null).
- `city` defaults to `"TORONTO"` if missing.
- Province is always `"ON"` (Ontario) -- hardcoded, since this is a Toronto-only
  dataset.
- If `street_num` and `street_name` are both empty/null, the permit is skipped
  (not geocodable).

### Google Geocoding API Integration

- **API**: Google Maps Geocoding API (`https://maps.googleapis.com/maps/api/geocode/json`).
- **Parameters**: `address` (composed string), `key` (API key from env), optionally
  `components=country:CA` to bias results to Canada.
- **Response parsing**: Extract `results[0].geometry.location.lat` and `.lng`.
- **Error handling**:
  - `ZERO_RESULTS`: No match found. Skip the permit (leave lat/lng null).
  - `OVER_QUERY_LIMIT`: Back off and retry after delay.
  - `REQUEST_DENIED` / `INVALID_REQUEST`: Log error, skip permit.
  - Network errors: Retry with exponential backoff.

### Rate Limiting

- Google Geocoding API allows **50 requests per second** (standard tier).
- Implementation must throttle outgoing requests to stay under this limit.
- Strategy: process permits in batches with a delay between requests (e.g.,
  20ms between each request, or batch 50 at a time with 1-second pauses).

### Caching / Skip Logic

- Before geocoding, check whether the permit already has coordinates:
  - If `latitude IS NOT NULL AND longitude IS NOT NULL AND geocoded_at IS NOT NULL`,
    **skip** the permit.
- This avoids re-geocoding permits that have already been processed.
- If a permit's address fields change (detected by the change detection system
  in Spec 03), the `latitude`, `longitude`, and `geocoded_at` columns should
  be reset to NULL to trigger re-geocoding on the next pass.

### Database Storage

Geocoded coordinates are stored directly on the `permits` table:

| Column | Type | Description |
|--------|------|-------------|
| `latitude` | DECIMAL(10,7) | WGS84 latitude (e.g., 43.6532000) |
| `longitude` | DECIMAL(10,7) | WGS84 longitude (e.g., -79.3832000) |
| `geocoded_at` | TIMESTAMP | When the geocoding was performed |

Update query:

```sql
UPDATE permits
SET latitude = $1, longitude = $2, geocoded_at = NOW()
WHERE permit_num = $3 AND revision_num = $4
```

### Processing Flow

```
1. SELECT permits WHERE latitude IS NULL AND street_num IS NOT NULL
2. For each permit:
   a. Compose address string
   b. Call Google Geocoding API (with rate limiting)
   c. Parse lat/lng from response
   d. UPDATE permits SET latitude, longitude, geocoded_at
3. Log total geocoded, skipped, errored counts
```

## 3. Associated Files

| File | Role |
|------|------|
| `src/lib/permits/geocode.ts` | Geocoding logic: address composition, API call, batch processor (planned -- not yet implemented) |
| `migrations/001_permits.sql` | Defines `latitude DECIMAL(10,7)`, `longitude DECIMAL(10,7)`, `geocoded_at TIMESTAMP` columns |
| `src/lib/permits/types.ts` | `Permit` interface includes `latitude: number \| null`, `longitude: number \| null`, `geocoded_at: Date \| null` |
| `src/lib/permits/field-mapping.ts` | `trimToNull()` used for cleaning `street_direction` (affects address composition) |
| `src/lib/db/client.ts` | Database queries for reading un-geocoded permits and writing coordinates |

## 4. Constraints & Edge Cases

- **Missing address components**: If `street_num` and `street_name` are both
  null/empty, the permit cannot be geocoded. Skip it silently.
- **Missing `street_direction`**: Common in the dataset. The composed address
  omits the direction component; Google typically still resolves the address.
- **Missing `postal`**: Some permits lack postal codes. The composed address
  still includes city and province which are usually sufficient for Google to
  resolve.
- **Ambiguous addresses**: Short street names (e.g., "QUEEN ST") without a
  direction could resolve to multiple locations. The `components=country:CA`
  bias helps but may not eliminate all ambiguity. The first result is used.
- **Rate limit enforcement**: Exceeding 50 QPS returns `OVER_QUERY_LIMIT`.
  The implementation must include a throttle and retry mechanism.
- **API cost**: Google Geocoding costs $5 per 1000 requests. Geocoding 237K
  permits = ~$1,185. The skip-already-geocoded logic is critical to control
  costs -- only new or address-changed permits need geocoding.
- **Precision**: `DECIMAL(10,7)` provides ~1.1 cm accuracy at the equator,
  which is far more than needed for building-level mapping.
- **Toronto bounding box**: Valid Toronto coordinates should fall within
  approximately lat 43.58-43.86, lng -79.64 to -79.12. Coordinates outside
  this range likely indicate a geocoding error.
- **`geocoded_at` as cache marker**: This timestamp serves as the "already
  processed" flag. If null, the permit needs geocoding.
- **Planned file**: `src/lib/permits/geocode.ts` does not exist yet. The
  database columns and TypeScript types are already in place.

## 5. Data Schema

### Geocoding Columns (on `permits` table)

```
latitude            DECIMAL(10,7)    -- WGS84, nullable
longitude           DECIMAL(10,7)    -- WGS84, nullable
geocoded_at         TIMESTAMP        -- when geocoded, nullable
```

### Permit Type (relevant fields)

```typescript
interface Permit {
  // ... other fields ...
  street_num: string;
  street_name: string;
  street_type: string;
  street_direction: string | null;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: Date | null;
}
```

### Google Geocoding API Response (subset)

```json
{
  "status": "OK",
  "results": [
    {
      "geometry": {
        "location": {
          "lat": 43.6532,
          "lng": -79.3832
        }
      },
      "formatted_address": "123 Queen St W, Toronto, ON M5V 2A1, Canada"
    }
  ]
}
```

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Google Geocoding API | Request/Response | `GET /maps/api/geocode/json?address=...&key=...` |
| PostgreSQL | Read | `SELECT` un-geocoded permits (`latitude IS NULL AND street_num IS NOT NULL`) |
| PostgreSQL | Write | `UPDATE permits SET latitude, longitude, geocoded_at` |
| Change detection (Spec 03) | Trigger | When address fields change, reset geocoding columns to NULL |
| Map UI (future) | Consumer | Frontend reads `latitude`/`longitude` for map rendering |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | Address composition with all parts | `"123 QUEEN ST W, TORONTO, ON M5V 2A1"` |
| L02 | Address composition without `street_direction` | `"123 QUEEN ST, TORONTO, ON M5V 2A1"` (no trailing space before comma) |
| L03 | Address composition without `postal` | `"123 QUEEN ST W, TORONTO, ON"` |
| L04 | Address composition without `city` | Defaults to `"TORONTO"` |
| L05 | Skip permits with null `street_num` and `street_name` | Returns early without API call |
| L06 | Skip already-geocoded permits | Permits with non-null `latitude`, `longitude`, and `geocoded_at` are excluded from processing |
| L07 | Parse Google API response | Extracts `lat` and `lng` from `results[0].geometry.location` |
| L08 | Handle `ZERO_RESULTS` status | Returns null coordinates, does not throw |
| L09 | Handle empty `results` array | Returns null coordinates, does not throw |
| L10 | Toronto bounding box validation | Lat outside 43.0-44.0 or lng outside -80.0 to -79.0 is flagged as suspicious |

### B. UI Layer

N/A -- geocoding is a backend batch process. The map UI that consumes the coordinates is a separate frontend concern.

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Rate limiting stays under 50 QPS | Monitor request timestamps; no two requests within 20ms of each other (or batched appropriately) |
| I02 | `geocoded_at` is set after successful geocoding | Timestamp is non-null and recent |
| I03 | `latitude` and `longitude` are stored with 7 decimal places | `DECIMAL(10,7)` precision verified |
| I04 | Already-geocoded permits are not re-processed | Running the geocoder twice on the same dataset only geocodes new permits |
| I05 | API errors do not crash the batch | `ZERO_RESULTS` or network errors are logged; processing continues to next permit |
| I06 | Google API key is loaded from environment | Not hardcoded; read from `process.env.GOOGLE_GEOCODING_API_KEY` or similar |
| I07 | Address-changed permits get re-geocoded | After change detection nulls the coordinates, the geocoder picks them up |
