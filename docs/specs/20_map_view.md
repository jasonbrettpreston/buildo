# Feature: Map View

## 1. User Story
"As a user, I want to see permits plotted on a map so I can find opportunities in my area and visualize construction activity geographically."

## 2. Technical Logic

### Overview
The map view plots building permits on a Google Map, enabling geographic discovery of construction opportunities. Given the dataset size (237K+ permits), performance is critical. The map uses marker clustering, viewport-based loading, and progressive enhancement with heat map and ward boundary overlays.

### Map Technology
* **Library:** Google Maps JavaScript API (loaded via `@googlemaps/js-api-loader`).
* **Marker clustering:** `@googlemaps/markerclusterer` library for grouping dense markers.
* **Default center:** Toronto City Hall (43.6532, -79.3832), zoom level 11 (shows all of Toronto).
* **Map style:** Light theme; permit markers must be clearly visible.

### Viewport-Based Loading
To handle 237K+ permits without loading all at once:

1. On initial load, determine the visible map bounding box (NE lat/lng, SW lat/lng).
2. Call `GET /api/permits/geo?ne_lat={}&ne_lng={}&sw_lat={}&sw_lng={}&limit=500` to fetch permits within the viewport.
3. On map `idle` event (fires after pan/zoom ends), recalculate bounding box and fetch new data.
4. Debounce viewport queries by 500ms to prevent rapid-fire calls during smooth panning.
5. Cache previously loaded tiles; do not re-fetch permits already displayed.

### API Extension: Geo Endpoint
New API route `GET /api/permits/geo` (extends existing permits API):

```
Parameters:
  ne_lat, ne_lng:  number    // Northeast corner of bounding box
  sw_lat, sw_lng:  number    // Southwest corner of bounding box
  limit:           number    // Max markers to return (default 500, max 1000)
  trade_slug:      string    // Optional: filter by trade
  status:          string    // Optional: filter by status
  min_cost:        number    // Optional: minimum cost
  max_cost:        number    // Optional: maximum cost
```

Response returns simplified permit data (fewer fields than full API, for performance):
```json
{
  "data": [
    {
      "permit_id": "21 234567--01",
      "latitude": 43.6519,
      "longitude": -79.3911,
      "status": "Issued",
      "est_const_cost": 25000000,
      "lead_score": 85,
      "address": "100 QUEEN ST W",
      "trade_slugs": ["concrete", "plumbing"]
    }
  ],
  "total_in_viewport": 1234,
  "showing": 500,
  "has_more": true
}
```

### Marker Display
* **Default markers:** Small colored circles, color-coded by status:
  * Issued: Green
  * Application: Blue
  * Under Inspection: Orange
  * Completed: Gray
  * Other: Light gray
* **Selected marker:** Larger marker with pulsing animation.
* **Marker size:** Scales with `est_const_cost` (larger cost = slightly larger marker).

### Marker Clustering
* At zoom levels 10-13: markers grouped into clusters showing count.
* Cluster color: gradient based on average lead score of contained markers (green = high avg, gray = low avg).
* Click cluster: map zooms in to expand cluster.
* At zoom level 14+: individual markers shown (no clustering).

### Marker Popup (Info Window)
Click on a marker opens an info window showing:
* Full address
* Status badge
* Estimated cost (formatted)
* Lead score badge
* Matching trades (icons)
* "View Details" link to `/permits/{id}`
* "Save Lead" button (if authenticated)

### Heat Map Overlay
Toggle-able heat map showing permit density:
* Uses Google Maps HeatmapLayer.
* Weight: `est_const_cost` (higher cost = more "heat").
* Gradient: blue (low) -> yellow (medium) -> red (high).
* Toggle button in map controls toolbar.
* Heat map and markers can display simultaneously or independently.

### Ward Boundary Overlay
Toggle-able polygon overlay showing Toronto's 25 ward boundaries:
* GeoJSON data for ward boundaries (sourced from Toronto Open Data).
* Semi-transparent fill with ward number label at centroid.
* Click ward polygon: filters map to show only that ward's permits.
* Toggle button in map controls toolbar.

### Radius Search
Draw-a-circle search mode:
1. User clicks "Radius Search" button in toolbar.
2. User clicks a point on the map to set center.
3. Draggable circle appears with radius handle (default 2km).
4. User adjusts radius (1-25km range).
5. Permits within the circle are highlighted; others dimmed.
6. Result count shown: "47 permits within 3.2km radius".
7. Click "Apply" to filter results to circle contents.

### Filter Integration
The map respects all active filters from the search/filter panel (Spec 19):
* Shared filter state between map view and search view.
* URL params preserved when switching between list and map views.
* Filter changes trigger viewport re-query with updated filters.
* Toggle between map and list view preserves filter state.

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/map/page.tsx` | Planned | Map view page |
| `src/app/map/layout.tsx` | Planned | Map view layout (full-width) |
| `src/components/map/PermitMap.tsx` | Planned | Main map container component |
| `src/components/map/MapMarker.tsx` | Planned | Custom marker component |
| `src/components/map/MarkerCluster.tsx` | Planned | Cluster display component |
| `src/components/map/MarkerPopup.tsx` | Planned | Info window popup component |
| `src/components/map/HeatmapToggle.tsx` | Planned | Heat map layer toggle control |
| `src/components/map/WardOverlay.tsx` | Planned | Ward boundary polygon overlay |
| `src/components/map/RadiusSearch.tsx` | Planned | Radius search circle tool |
| `src/components/map/MapToolbar.tsx` | Planned | Map controls toolbar |
| `src/components/map/MapFilters.tsx` | Planned | Filter panel for map view |
| `src/lib/map/viewport.ts` | Planned | Bounding box calculation and caching |
| `src/lib/map/clustering.ts` | Planned | Cluster color/size calculation |
| `src/lib/map/radius.ts` | Planned | Haversine distance and circle intersection |
| `src/lib/map/ward-boundaries.ts` | Planned | Ward GeoJSON data and utilities |
| `src/app/api/permits/geo/route.ts` | Planned | Geo-filtered permit API endpoint |
| `src/tests/map.logic.test.ts` | Planned | Map logic unit tests |
| `src/tests/map.ui.test.tsx` | Planned | Map component tests |
| `src/tests/map.infra.test.ts` | Planned | Map integration tests |

## 4. Constraints & Edge Cases

### Constraints
* Google Maps JavaScript API pricing: $7 per 1,000 map loads (Dynamic Maps). Budget consideration for high traffic.
* Marker clustering library processes up to ~10,000 markers smoothly; beyond that, performance degrades. Viewport limit of 500-1000 markers mitigates this.
* Permits without lat/lng (not yet geocoded) cannot be plotted. Currently depends on Spec 05 (Geocoding) completion. Display count of "X permits not shown (pending geocoding)".
* Ward boundary GeoJSON is static data (~200KB); load once and cache.
* Radius search uses Haversine formula for distance calculation; accurate within Toronto's scale.

### Edge Cases
* **No permits in viewport:** Show "No permits in this area. Try zooming out or adjusting filters." message overlay.
* **All permits outside Toronto:** User pans away from Toronto; show "Permits are only available in Toronto" toast and offer "Return to Toronto" button.
* **Zoom level 18+ (street level):** Show individual markers with full address labels (no clustering needed).
* **Very dense area (1000+ permits in small viewport):** Clustering handles this; show cluster count badge. If limit exceeded, show "Showing 500 of 1,234 permits. Zoom in for more detail."
* **Permits at exact same coordinates (same building, multiple permits):** Stack markers with count badge; click opens list popup of all permits at that location.
* **Map fails to load (API key error, network):** Show fallback static image with error message and retry button.
* **Mobile viewport:** Map fills full screen; filter panel slides up from bottom as sheet. Marker popups are tap-activated instead of click.
* **Radius search circle crosses city boundary:** Only permits within Toronto boundary (from data) are returned; circle may extend beyond.
* **Browser geolocation:** Offer "Use my location" button to center map on user's position (requires permission).
* **Switching between map and list view:** Filter state preserved in URL; results are consistent between views.

## 5. Data Schema

### API Request: `GET /api/permits/geo` (new endpoint)
```
Query Parameters:
  ne_lat:       number    // Northeast latitude of bounding box
  ne_lng:       number    // Northeast longitude of bounding box
  sw_lat:       number    // Southwest latitude of bounding box
  sw_lng:       number    // Southwest longitude of bounding box
  limit:        number    // Max results (default 500, max 1000)
  trade_slug:   string    // Optional trade filter
  status:       string    // Optional status filter
  min_cost:     number    // Optional minimum cost
  max_cost:     number    // Optional maximum cost
  ward:         string    // Optional ward filter
```

### API Response: `GET /api/permits/geo`
```json
{
  "data": [
    {
      "permit_id":      "21 234567--01",
      "permit_num":     "21 234567",
      "revision_num":   "01",
      "latitude":       43.6519,
      "longitude":      -79.3911,
      "status":         "Issued",
      "est_const_cost": 25000000,
      "lead_score":     85,
      "address":        "100 QUEEN ST W",
      "ward":           "10",
      "trade_slugs":    ["concrete", "plumbing", "electrical"]
    }
  ],
  "total_in_viewport": 1234,
  "showing":           500,
  "has_more":          true,
  "not_geocoded":      4521
}
```

### PostgreSQL Query: Viewport Filter
```sql
SELECT
    p.permit_num || '--' || p.revision_num as permit_id,
    p.permit_num, p.revision_num,
    p.latitude, p.longitude,
    p.status, p.est_const_cost,
    p.street_num || ' ' || p.street_name || ' ' || COALESCE(p.street_type, '') as address,
    p.ward,
    COALESCE(
        ARRAY_AGG(DISTINCT t.slug) FILTER (WHERE t.slug IS NOT NULL),
        '{}'
    ) as trade_slugs,
    MAX(pt.lead_score) as lead_score
FROM permits p
LEFT JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
LEFT JOIN trades t ON t.id = pt.trade_id
WHERE p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL
  AND p.latitude BETWEEN $1 AND $2    -- sw_lat, ne_lat
  AND p.longitude BETWEEN $3 AND $4   -- sw_lng, ne_lng
GROUP BY p.permit_num, p.revision_num, p.latitude, p.longitude, p.status,
         p.est_const_cost, p.street_num, p.street_name, p.street_type, p.ward
ORDER BY lead_score DESC NULLS LAST
LIMIT $5
```

### PostgreSQL Index (planned migration)
```sql
CREATE INDEX IF NOT EXISTS idx_permits_geo
    ON permits (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

### Ward Boundaries Data
Static GeoJSON file loaded at `/public/data/ward-boundaries.geojson`:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "ward_number": "01", "ward_name": "Etobicoke North" },
      "geometry": { "type": "Polygon", "coordinates": [ /* ... */ ] }
    }
  ]
}
```

## 6. Integrations

### Internal
* **Permit Data API (Spec 06):** New geo endpoint extends the permits API with bounding box filtering.
* **Geocoding (Spec 05):** Lat/lng data required for map plotting. Permits without coordinates shown in count but not plotted.
* **Search & Filter (Spec 19):** Shared filter state; map and search views use same filter components and URL state.
* **Permit Detail (Spec 18):** Marker popup "View Details" links to permit detail page.
* **Trade Classification (Spec 08):** Trade slugs shown on markers and used for trade filter on map.
* **Lead Scoring (Spec 10):** Lead score used for cluster coloring and marker popup display.
* **Dashboard (Specs 15/16/17):** "View on Map" action from permit cards opens map centered on that permit.
* **Supplier Dashboard (Spec 17):** Geographic demand map reuses `PermitMap` component.
* **Auth (Spec 13):** "Save Lead" in marker popup requires authenticated user.

### External
* **Google Maps JavaScript API:** Core map rendering, marker clustering, heat map layer, info windows.
* **Google Maps HeatmapLayer:** Heat map visualization of permit density.
* **Toronto Open Data:** Ward boundary GeoJSON (one-time download, stored as static asset).
* **PostgreSQL:** Geo-filtered queries with bounding box and spatial index.
* **Browser Geolocation API:** Optional "Use my location" feature.

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`map.logic.test.ts`)
* [ ] **Rule 1:** Bounding box calculation: viewport coordinates correctly converted to ne_lat/ne_lng/sw_lat/sw_lng query parameters.
* [ ] **Rule 2:** Cluster grouping: markers within close proximity grouped into a single cluster with correct count.
* [ ] **Rule 3:** Radius intersection: Haversine formula correctly identifies permits within X km of a center point.
* [ ] **Rule 4:** Viewport debounce: map idle events debounced by 500ms; only one API call per idle period.
* [ ] **Rule 5:** Marker color assignment: status-to-color mapping produces correct marker colors for each status.
* [ ] **Rule 6:** Cluster color calculation: average lead score of cluster members produces correct gradient color.

### B. UI Layer (`map.ui.test.tsx`)
* [ ] **Rule 1:** Map renders with Google Maps instance centered on Toronto.
* [ ] **Rule 2:** Markers display at correct lat/lng positions with status-colored icons.
* [ ] **Rule 3:** Marker popup renders address, status, cost, lead score, trade icons, and "View Details" link.
* [ ] **Rule 4:** Cluster markers expand on click, zooming into contained markers.
* [ ] **Rule 5:** Heat map toggle button shows/hides heat map overlay.
* [ ] **Rule 6:** Ward boundary toggle button shows/hides ward polygon overlay with labels.

### C. Infra Layer (`map.infra.test.ts`)
* [ ] **Rule 1:** Viewport-based API query: `GET /api/permits/geo` returns permits within specified bounding box.
* [ ] **Rule 2:** Google Maps API loads successfully with valid API key.
* [ ] **Rule 3:** Geo query performance: bounding box query with spatial index returns within 1 second for full dataset.
* [ ] **Rule 4:** Ward boundary GeoJSON loads from static file and parses correctly.
* [ ] **Rule 5:** Viewport cache: previously loaded markers are not re-fetched on minor pan adjustments.
