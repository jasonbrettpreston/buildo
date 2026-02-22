# Spec 29 -- Spatial Parcel Matching (Strategy 3)

## 1. User Story

> As a system operator, I want permits that fail address-based parcel matching
> to fall back to spatial proximity matching using geocoded coordinates, so that
> the ~53K currently unlinked permits can be matched to parcels and gain property
> data and neighbourhood profiles.

## 2. Background

The current `link-parcels.js` script uses a 2-step address-matching cascade:

| Strategy | Method | Confidence | Current Matches |
|----------|--------|------------|-----------------|
| 1 | Exact address (num + name + type) | 0.95 | ~170K |
| 2 | Name-only (num + name, ignore type) | 0.80 | ~14K |
| **Total** | | | **183,832 / 237,267 (77.5%)** |

~53,435 permits remain unmatched. Of those, 53,398 have valid street addresses
that simply don't correspond to any parcel address in the Toronto Property
Boundaries dataset. Common reasons:

- Street names differ between permit data and parcel data (e.g. "UNION ST" vs
  parcel records only having "PORT UNION RD").
- Address ranges or unit numbers that don't exactly match parcel records.
- Permits on public/institutional land where parcels aren't registered with
  residential-style addresses.

### Geocoding via Address Points (Free)

Permits carry a `geo_id` field which is the `ADDRESS_POINT_ID` from Toronto's
free Address Points dataset (~525K records with lat/lng). 229,840 permits
(96.9%) have `geo_id`, and of the 53,435 unmatched permits, 49,600 (92.8%)
have `geo_id`. This eliminates the need for any paid geocoding API.

**Migration 018** creates an `address_points` lookup table. The
`scripts/load-address-points.js` script downloads the Address Points CSV from
Toronto Open Data and populates the table. Then `scripts/geocode-permits.js`
performs a bulk UPDATE joining permits to address_points via `geo_id` to
populate `latitude`/`longitude`.

## 3. Technical Logic

### Strategy 3: Spatial Proximity Matching

For permits that fail both address strategies, use geocoded lat/lng coordinates
to find the nearest parcel by centroid distance.

**Prerequisites:**
- Permit must have `latitude IS NOT NULL AND longitude IS NOT NULL` (geocoded).
- Parcels must have pre-computed centroid coordinates.

**Matching Algorithm:**

```
1. Pre-compute centroid_lat / centroid_lng for all parcels from geometry JSONB
2. For each unmatched permit with lat/lng:
   a. Find all parcels within a bounding box of ±0.001° (~111m lat, ~82m lng)
   b. Compute haversine distance to each candidate parcel centroid
   c. Select the nearest parcel within MAX_DISTANCE_M (100 metres)
   d. If found: match_type = 'spatial', confidence = 0.65
   e. If none within threshold: no match
```

**Distance Threshold:** 100 metres. This is generous enough to account for
geocoding imprecision (~10-50m typical) and parcel centroid offset from street
address, but tight enough to avoid false positives from adjacent properties.

**Confidence: 0.65.** Lower than address matching because:
- Geocoding can place the point 10-50m from the actual building.
- Parcel centroids may not align with street-facing addresses.
- Nearest-parcel may not be the correct parcel for corner lots or large sites.

### Updated 3-Step Cascade

| Strategy | Method | match_type | Confidence | Priority |
|----------|--------|------------|------------|----------|
| 1 | Exact address (num + name + type) | `exact_address` | 0.95 | Highest |
| 2 | Name-only (num + name, ignore type) | `name_only` | 0.80 | Medium |
| 3 | Spatial proximity (nearest centroid ≤100m) | `spatial` | 0.65 | Lowest |

Strategy 3 only fires when strategies 1 and 2 both fail for a given permit.

### Centroid Pre-computation

**Migration 016** adds two columns to `parcels`:

```sql
ALTER TABLE parcels ADD COLUMN centroid_lat DECIMAL(10,7);
ALTER TABLE parcels ADD COLUMN centroid_lng DECIMAL(10,7);

CREATE INDEX idx_parcels_centroid
  ON parcels (centroid_lat, centroid_lng)
  WHERE centroid_lat IS NOT NULL;
```

**Population script** (`scripts/compute-centroids.js`): Iterates over all
parcels, computes centroid from the outer ring of each geometry polygon, and
writes `centroid_lat` / `centroid_lng`.

### Haversine Distance

The haversine formula computes great-circle distance between two lat/lng points:

```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
d = 2 × R × atan2(√a, √(1−a))
```

Where R = 6,371,000 metres (Earth's mean radius).

This is already implemented in `src/lib/parcels/geometry.ts` as
`haversineDistance()`.

### Bounding Box Pre-filter

To avoid computing haversine distance against all 486K parcels for each
unmatched permit, apply a rough bounding box filter first:

```sql
SELECT id, centroid_lat, centroid_lng
FROM parcels
WHERE centroid_lat BETWEEN $1 - 0.001 AND $1 + 0.001
  AND centroid_lng BETWEEN $2 - 0.001 AND $2 + 0.001
```

At Toronto's latitude (~43.7°N):
- 0.001° latitude ≈ 111 metres
- 0.001° longitude ≈ 82 metres

This reduces candidates to typically 1-20 parcels per query.

## 4. Associated Files

| File | Role |
|------|------|
| `migrations/016_parcel_centroids.sql` | Add centroid_lat/centroid_lng columns + index |
| `migrations/018_address_points.sql` | Create address_points lookup table |
| `scripts/compute-centroids.js` | Populate centroid columns from geometry JSONB |
| `scripts/load-address-points.js` | Download + load Toronto Address Points CSV |
| `scripts/geocode-permits.js` | Bulk UPDATE permits lat/lng from address_points via geo_id |
| `scripts/link-parcels.js` | Add Strategy 3 spatial matching after address strategies |
| `src/lib/parcels/types.ts` | Add `'spatial'` to `ParcelMatchResult.match_type` |
| `src/lib/parcels/geometry.ts` | `haversineDistance()` already exists (currently unused) |
| `src/lib/quality/metrics.ts` | Add `parcel_spatial_matches` count to quality snapshot |
| `src/lib/quality/types.ts` | Add `parcel_spatial_matches` field to `DataQualitySnapshot` |
| `migrations/012_permit_parcels.sql` | No change -- `match_type VARCHAR(30)` already supports `'spatial'` |

## 5. Constraints & Edge Cases

- **Geocoding via Address Points**: Strategy 3 requires permits to have lat/lng.
  Permits are geocoded for free by looking up `geo_id` against Toronto's Address
  Points dataset (~525K records). 96.9% of permits have `geo_id`, so nearly all
  can be geocoded at zero cost.
- **Multiple parcels within threshold**: Always pick the nearest one. If two
  parcels are equidistant, pick the one with the lower `id` (deterministic).
- **Large parcels**: A permit on a large commercial parcel may be 50-80m from
  the centroid. The 100m threshold accommodates this.
- **Corner lots**: A permit may be closer to an adjacent parcel's centroid than
  its own. The 0.65 confidence reflects this uncertainty.
- **Re-runnability**: Like strategies 1 and 2, strategy 3 uses `ON CONFLICT ...
  DO UPDATE` so re-running the script is safe.
- **Centroid computation**: Uses arithmetic mean of outer ring coordinates
  (excluding closing point). Same algorithm as `link-neighbourhoods.js`.

## 6. Data Schema

### New Columns on `parcels` table (Migration 016)

```
centroid_lat    DECIMAL(10,7)    -- WGS84 latitude of polygon centroid
centroid_lng    DECIMAL(10,7)    -- WGS84 longitude of polygon centroid
```

### Updated `match_type` values in `permit_parcels`

| Value | Meaning | Confidence |
|-------|---------|------------|
| `exact_address` | Num + name + type all match | 0.95 |
| `name_only` | Num + name match, type ignored | 0.80 |
| `spatial` | Nearest parcel centroid within 100m | 0.65 |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | `findNearestParcel` returns nearest centroid within 100m | Returns parcel with correct id and distance |
| L02 | `findNearestParcel` returns null when no parcel within 100m | Returns null for isolated point |
| L03 | `findNearestParcel` picks closest when multiple within range | Returns parcel with shortest haversine distance |
| L04 | Spatial match confidence is 0.65 | Hardcoded to 0.65 |
| L05 | Spatial match type is `'spatial'` | match_type string check |
| L06 | Strategy 3 only fires when strategies 1 and 2 fail | No spatial match attempted if address match found |
| L07 | Centroid computation from Polygon geometry | [lng, lat] from arithmetic mean of outer ring |
| L08 | Centroid computation from MultiPolygon geometry | Uses first polygon's outer ring |
| L09 | Centroid returns null for invalid/missing geometry | Null geometry → null centroid |
| L10 | Bounding box filter at ±0.001° captures 100m radius | Point at edge of box is within ~111m |
| L11 | `haversineDistance` accuracy for Toronto-scale distances | 100m between two known Toronto points |

### B. UI Layer

N/A -- parcel linking is a backend batch process.

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | Migration 016 adds centroid columns | `centroid_lat` and `centroid_lng` exist on parcels |
| I02 | Centroid index is created | Index on `(centroid_lat, centroid_lng)` |
| I03 | `permit_parcels.match_type` accepts `'spatial'` | VARCHAR(30) insert succeeds |
| I04 | Spatial matches appear in quality metrics | `parcel_spatial_matches` count > 0 after linking |
| I05 | Re-running spatial linking is idempotent | ON CONFLICT updates confidence, doesn't create duplicates |

## 8. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Address Points (Migration 018) | Prerequisite | Free geocoding via geo_id → address_points lookup |
| Parcels (Migration 011) | Read | Parcel centroid coordinates for distance calculation |
| Permit-Parcels (Migration 012) | Write | New rows with match_type='spatial' |
| Quality Dashboard (Spec 28) | Display | Shows spatial match count alongside exact/name-only |
| Neighbourhood Linker | Downstream | More parcel links → more neighbourhood links via centroid |

## 9. Execution Order

```
1. Run migration 016 (add centroid columns)
2. Run migration 018 (create address_points table)
3. Run scripts/compute-centroids.js (populate centroids from geometry)
4. Run scripts/load-address-points.js (download + load ~525K address points)
5. Run scripts/geocode-permits.js (bulk UPDATE permits lat/lng via geo_id)
6. Run scripts/link-parcels.js (now includes Strategy 3 spatial matching)
7. Run scripts/link-neighbourhoods.js (picks up newly linked permits)
8. POST /api/quality/refresh (capture updated metrics)
```

Note: Steps 4-5 use Toronto's free Address Points dataset to geocode permits
via their `geo_id` field (ADDRESS_POINT_ID), eliminating the need for any paid
geocoding API. ~96.9% of permits have `geo_id` and can be geocoded at zero cost.
