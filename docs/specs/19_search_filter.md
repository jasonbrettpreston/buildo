# Feature: Search & Filter

## 1. User Story
"As a user, I want powerful search and filtering so I can find specific permits by address, description keywords, builder name, or any combination of criteria."

## 2. Technical Logic

### Overview
The search and filter feature provides full-text search and faceted filtering across the 237K+ permit dataset. It uses PostgreSQL's built-in `tsvector` full-text search (already indexed on the `permits` table) and the existing `GET /api/permits` endpoint which already supports text search and multiple filter parameters.

### Full-Text Search
* **Implementation:** PostgreSQL `to_tsvector('english', ...)` with `plainto_tsquery` (already implemented in `src/app/api/permits/route.ts`).
* **Indexed fields:** `description`, `street_name`, `builder_name` (combined into a single tsvector index, see `migrations/001_permits.sql`).
* **Search input:** Single text input at the top of the search page.
* **Debounce:** 300ms debounce on keystroke before issuing API request. Cancel in-flight request on new input.
* **Minimum characters:** 2 characters required before search executes.
* **Search examples:** "100 Queen Street", "plumbing renovation", "ACME Construction", "12 storey condo".

### Faceted Filters
Filters are applied alongside or independently from text search. All filters are passed as query parameters to `GET /api/permits`.

| Filter | UI Element | Query Param | Values |
|--------|-----------|-------------|--------|
| Status | Dropdown | `status` | Inspection, Permit Issued, Revision Issued, Under Review, Issuance Pending, Application On Hold, Work Not Started, Revocation Pending, Pending Cancellation, Abandoned |
| Permit Type | Dropdown | `permit_type` | Small Residential Projects, Plumbing(PS), Mechanical(MS), Building Additions/Alterations, Drain and Site Service, New Houses, Fire/Security Upgrade, Demolition Folder (DM), New Building, Residential Building Permit, Non-Residential Building Permit, Designated Structures, Temporary Structures, Partial Permit |
| Structure Type | Dropdown | `structure_type` | SFD - Detached, SFD - Semi-Detached, Office, Apartment Building, SFD - Townhouse, Retail Store, Multiple Unit Building, 2 Unit - Detached, Multiple Use/Non Residential, Other, Industrial, Laneway / Rear Yard Suite, Restaurant 30 Seats or Less, Stacked Townhouses, Mixed Use/Res w Non Res |
| Work | Dropdown | `work` | Building Permit Related(PS), Building Permit Related(MS), Interior Alterations, Multiple Projects, New Building, Building Permit Related (DR), Addition(s), Demolition, Fire Alarm, Garage, Garage Repair/Reconstruction, Porch, Deck, Underpinning, Sprinklers |
| Ward | Dropdown | `ward` | 01 through 25 |
| Trade | Dropdown + Info Tooltip | `trade_slug` | All 20 trades from `TRADES` constant. Info icon shows 3-tier classification table explaining that trades are inferred from permit metadata, not actual building plans. |
| Cost Range | Dropdown | `min_cost` | $10K+, $50K+, $100K+, $500K+, $1M+, $5M+ |
| Date Range | Date picker (from/to) | `issued_after`, `issued_before` | Any date range |
| Building Type | Dropdown | `building_type` | Residential, Commercial, Industrial, Institutional |

### URL-Based Filter State
All active filters are serialized into URL query parameters, enabling:
* Shareable search links (e.g. `/search?trade_slug=plumbing&ward=10&min_cost=100000`).
* Browser back/forward navigation preserves filter state.
* Bookmarkable searches.

**URL serialization rules:**
* Multi-select values joined with comma: `status=Issued,Application`.
* Empty/default values omitted from URL.
* Text search: `search=query+text`.
* Page number: `page=2`.

**Deserialization:** On page load, read all query params from URL and populate filter UI and trigger search.

### Active Filter Chips
Currently applied filters displayed as removable chips above results:
* Each chip shows filter name and value (e.g. "Ward: 10", "Trade: Plumbing").
* Click X on chip to remove that filter and re-query.
* "Clear All" button removes all filters and resets to default state.

### Result Count & Pagination
* Total result count displayed and updates dynamically as filters change.
* Format: "Showing 1-20 of 3,456 permits".
* Pagination: numbered page buttons at bottom, max 100 pages shown.
* Page size: 20 results (default), option for 50 or 100.

### Saved Searches
Authenticated users can save search configurations to Firestore:
* "Save Search" button stores current filter state with a user-provided name.
* Saved searches listed in a dropdown for quick re-application.
* Maximum 20 saved searches per user.
* Saved search stores: name, all filter values, created_at.

### Sort Options (Implemented)
| Sort | Query Param Value | Direction |
|------|------------------|-----------|
| Recently Issued | `issued_date` | DESC |
| Recently Applied | `application_date` | DESC |
| Highest Cost | `est_const_cost` | DESC |
| Lowest Cost | `est_const_cost` | ASC |

Default sort: `issued_date` DESC. Sort value is encoded as `sort_by:sort_order` (e.g. `est_const_cost:desc`) in the FilterPanel dropdown and split into separate `sort_by` and `sort_order` query params for the API.

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/search/page.tsx` | Planned | Search page |
| `src/app/search/layout.tsx` | Planned | Search layout |
| `src/components/search/SearchInput.tsx` | Planned | Debounced text search input |
| `src/components/search/FilterPanel.tsx` | **Implemented** | Filter panel: search, status, permit_type, sort, trade, ward, min_cost dropdowns |
| `src/components/search/FilterChips.tsx` | Planned | Active filter chip display |
| `src/components/search/StatusFilter.tsx` | Planned | Multi-select status checkboxes |
| `src/components/search/TradeFilter.tsx` | Planned | Multi-select trade filter |
| `src/components/search/CostSlider.tsx` | Planned | Dual-handle cost range slider |
| `src/components/search/DateRangeFilter.tsx` | Planned | Date range picker |
| `src/components/search/WardDropdown.tsx` | Planned | Ward selection dropdown |
| `src/components/search/SortSelect.tsx` | Planned | Sort option dropdown |
| `src/components/search/ResultCount.tsx` | Planned | Dynamic result count display |
| `src/components/search/SavedSearches.tsx` | Planned | Saved search dropdown |
| `src/components/search/Pagination.tsx` | Planned | Page navigation component |
| `src/lib/search/url-state.ts` | Planned | URL serialization/deserialization for filter state |
| `src/lib/search/debounce.ts` | Planned | Debounce utility for search input |
| `src/app/api/permits/route.ts` | Exists | Permit list API with search and filter support |
| `src/tests/search.logic.test.ts` | Planned | Search logic unit tests |
| `src/tests/search.ui.test.tsx` | Planned | Search component tests |
| `src/tests/search.infra.test.ts` | Planned | Search integration tests |

## 4. Constraints & Edge Cases

### Constraints
* PostgreSQL full-text search does not support fuzzy matching; misspellings will not match. Consider `pg_trgm` extension for similarity search in future.
* The existing API already validates `sort_by` against an allowlist (`ALLOWED_SORT` in route.ts) to prevent SQL injection.
* API pagination limit: 100 results per page maximum (enforced server-side).
* Text search across 237K+ records must respond within 500ms (tsvector GIN index ensures this).
* URL query string length limited to ~2000 characters by most browsers; filter combinations must stay within this.

### Edge Cases
* **Empty search with no filters:** Show all permits sorted by `issued_date` DESC (default feed).
* **Search with no results:** Display "No permits match your search" with suggestions: "Try broader keywords" or "Remove some filters".
* **Special characters in search:** `plainto_tsquery` handles most special characters safely; ampersands and quotes are stripped.
* **Very long search query:** Truncate to 200 characters before sending to API.
* **Filter produces 0 results:** Show empty state with current filter chips visible so user can remove filters.
* **URL with invalid filter values:** Ignore invalid params; apply valid ones. E.g. `ward=999` is ignored.
* **Concurrent filter changes:** Debounce prevents excessive API calls; latest request wins (AbortController cancels previous).
* **Saved search references deleted trade:** Load search but show warning that some filters may be outdated.
* **Date range with end before start:** Swap dates automatically; show correction notice.
* **Cost slider at maximum ($10M+):** Remove `max_cost` filter entirely (no upper bound).
* **Browser back button:** URL state restored; filters and results re-populated.

## 5. Data Schema

### API Request: `GET /api/permits` (existing endpoint, parameters)
```
Query Parameters:
  search:         string    // Full-text search query
  status:         string    // Comma-separated status values
  permit_type:    string    // Single permit type
  ward:           string    // Single ward number
  trade_slug:     string    // Single trade slug
  min_cost:       number    // Minimum est_const_cost
  max_cost:       number    // Maximum est_const_cost
  issued_after:   string    // ISO date (planned extension)
  issued_before:  string    // ISO date (planned extension)
  building_type:  string    // Building type filter (planned extension)
  sort_by:        string    // Sort column
  sort_order:     string    // "asc" or "desc"
  page:           number    // Page number (1-based)
  limit:          number    // Results per page (max 100)
```

### API Response: `GET /api/permits` (existing)
```json
{
  "data": [ /* array of Permit objects */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3456,
    "total_pages": 173
  }
}
```

### Firestore: `/users/{uid}/savedSearches/{searchId}`
```
{
  name:           string       // User-provided name, e.g. "Plumbing in Ward 10"
  filters:        map          // { search, status, permit_type, ward, trade_slug, min_cost, max_cost, ... }
  sort_by:        string       // Sort column
  sort_order:     string       // "asc" or "desc"
  created_at:     timestamp
  last_used_at:   timestamp
}
```

### URL State Example
```
/search?search=renovation&status=Issued,Application&ward=10&trade_slug=plumbing&min_cost=50000&max_cost=500000&sort_by=est_const_cost&sort_order=desc&page=1
```

## 6. Integrations

### Internal
* **Permit Data API (Spec 06):** `GET /api/permits` is the primary data source; already supports search, status, permit_type, ward, trade_slug, min_cost, max_cost, sort_by, sort_order, page, limit.
* **Dashboard (Specs 15/16/17):** Dashboard filter components are shared with search page (`DashboardFilters` and search `FilterPanel` use same sub-components).
* **Permit Detail (Spec 18):** Search result rows/cards link to `/permits/{id}` detail page.
* **Map View (Spec 20):** "View on Map" button sends current search filters to map view.
* **Trade Taxonomy (Spec 07):** Trade filter options populated from `TRADES` constant.
* **Auth (Spec 13):** Saved searches require authenticated user.
* **Onboarding (Spec 14):** User's location and trade preferences can pre-populate default search filters.

### External
* **PostgreSQL:** Full-text search via tsvector/GIN index on permits table.
* **Cloud Firestore:** Saved searches stored at `/users/{uid}/savedSearches/`.

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`search.logic.test.ts`)
* [ ] **Rule 1:** Query construction: filter state object correctly serialized to API query string with proper parameter names and values.
* [ ] **Rule 2:** Debounce timing: search input waits 300ms after last keystroke before triggering API call.
* [ ] **Rule 3:** URL serialization: filter state correctly encoded to URL query params; special characters escaped.
* [ ] **Rule 4:** URL deserialization: URL query params correctly parsed into filter state object; invalid values ignored.
* [ ] **Rule 5:** Multi-select serialization: multiple status values joined with comma; deserialized back to array.
* [ ] **Rule 6:** Sort default logic: `relevance` used when search text present; `issued_date` used when no search text.

### B. UI Layer (`search.ui.test.tsx`)
* [ ] **Rule 1:** Filter panel renders all filter options: status, permit_type, ward, trade, cost range, date range.
* [ ] **Rule 2:** Search input renders with placeholder text and search icon.
* [ ] **Rule 3:** Active filter chips display for each applied filter with remove (X) button.
* [ ] **Rule 4:** "Clear All" button removes all active filters and chips.
* [ ] **Rule 5:** Result count updates dynamically: "Showing X-Y of Z permits".
* [ ] **Rule 6:** Pagination renders with correct page numbers and highlights current page.

### C. Infra Layer (`search.infra.test.ts`)
* [ ] **Rule 1:** Full-text search: API returns permits matching search query "renovation" within 500ms.
* [ ] **Rule 2:** Filter combination: API correctly applies multiple simultaneous filters (ward + status + cost range).
* [ ] **Rule 3:** Pagination: page 2 returns different results than page 1; total count is consistent.
* [ ] **Rule 4:** Saved search write: saving a search creates document in Firestore at `/users/{uid}/savedSearches/`.
* [ ] **Rule 5:** Saved search load: loading a saved search populates filter state and triggers search.
* [ ] **Rule 6:** AbortController: new search request cancels previous in-flight request.
