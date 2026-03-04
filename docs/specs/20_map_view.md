# Spec 20 -- Map View

## 1. Goal & User Story
As a user, I want to see permits plotted on a map so I can find opportunities in my area and visualize construction activity geographically across Toronto's 237K+ permits.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read |
| Authenticated | Read |
| Admin | Read |

## 3. Behavioral Contract
- **Inputs:** Map viewport (bounding box as NE/SW lat/lng), optional filters (trade_slug, status, min_cost, max_cost, ward), radius search center + radius. Default center: Toronto City Hall (43.6532, -79.3832), zoom 11.
- **Core Logic:**
  - Viewport-based loading via `GET /api/permits/geo` (see `src/app/api/permits/geo/route.ts`): fetches permits within bounding box, limit 500 (max 1000). Re-fetches on map `idle` event with 500ms debounce. Caches previously loaded tiles.
  - Marker display: color-coded by status (Issued=green, Application=blue, Under Inspection=orange, Completed=gray), size scales with `est_const_cost`. Selected marker pulses.
  - Marker clustering at zoom 10-13 via `@googlemaps/markerclusterer`. Cluster color reflects average lead score (green=high, gray=low). Individual markers shown at zoom 14+.
  - Marker popup (info window): address, status badge, formatted cost, lead score, trade icons, "View Details" link to `/permits/{id}`, "Save Lead" button (authenticated).
  - Heat map overlay (toggleable): Google Maps HeatmapLayer weighted by `est_const_cost`, gradient blue-yellow-red.
  - Ward boundary overlay (toggleable): GeoJSON polygons from static file with semi-transparent fill and ward labels. Click ward to filter.
  - Radius search: click to set center, draggable circle (1-25km, default 2km), shows count of permits within radius, "Apply" filters to circle contents.
  - Filter state shared with Search (Spec 19) via URL params; switching between map and list preserves filters.
- **Outputs:** Interactive Google Map with clustered markers, info window popups, optional heat map and ward overlays. Response from geo API includes `total_in_viewport`, `showing`, `has_more`, and `not_geocoded` counts. Primary page: `src/app/map/page.tsx`.
- **Edge Cases:**
  - No permits in viewport: overlay message with "zoom out or adjust filters" suggestion.
  - User pans outside Toronto: toast with "Return to Toronto" button.
  - Multiple permits at same coordinates: stacked markers with count badge; click opens list.
  - Map fails to load (API key error): fallback static image with retry button.
  - Permits without lat/lng: counted in `not_geocoded` but not plotted.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`map.ui.test.tsx`): Geocoded Permit Filtering; Map Center and Defaults; Marker Title Generation; Map Filter State; Map Display State; Selected Permit Sidebar
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/map/page.tsx`
- `src/app/api/permits/geo/route.ts`
- `src/tests/map.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`src/lib/permits/geocode.ts`**: Governed by Spec 05. Geocoding is consumed, not modified.

### Cross-Spec Dependencies
- Relies on **Spec 05 (Geocoding)**: Uses `permits.latitude` / `permits.longitude` for map plotting.
- Relies on **Spec 06 (Data API)**: Consumes `GET /api/permits/geo` endpoint.
- Relies on **Spec 13 (Auth)**: Reads user preferences for default map filters.
