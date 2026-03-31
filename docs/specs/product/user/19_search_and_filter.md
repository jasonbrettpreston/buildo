# Spec 19 -- Search & Filter

---

<requirements>

## 1. Goal & User Story
As a user, I want powerful search and filtering so I can find specific permits by address, description keywords, builder name, or any combination of criteria across the 237K+ permit dataset.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read (search) |
| Authenticated | Read + saved searches |
| Admin | Read |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** Text query (min 2 chars, 300ms debounce, max 200 chars), faceted filters (status, permit_type, structure_type, work, ward, trade_slug, min_cost, date range, building_type), source toggle (building permits or pre-permits), sort selection, page number. All filters serialized as URL query params for shareable/bookmarkable links.
- **Core Logic:**
  - Full-text search uses PostgreSQL `tsvector` GIN index on description, street_name, builder_name (see `src/app/api/permits/route.ts`). No fuzzy matching; misspellings will not match.
  - Source toggle switches between `permits` table (default) and CoA pre-permits (`source=pre_permits`). When pre-permits is active, inapplicable filters (permit_type, structure_type, work, trade, cost, sort) are hidden; only search text and ward remain.
  - Pre-permit results display `applicant` (CKAN CONTACT_NAME) in the builder field. Hidden when no contact name exists.
  - Sort options: issued_date DESC (default), application_date DESC, est_const_cost DESC/ASC. Default switches to relevance when search text is present.
  - URL-based state: multi-select values comma-joined, empty/default values omitted, browser back/forward restores filter state.
  - Saved searches (authenticated only): stored in Firestore at `/users/{uid}/savedSearches/`, max 20 per user, stores all filter values plus sort.
  - Active filter chips displayed above results with individual remove and "Clear All".
  - Pagination: 20 results default (options 50, 100), max 100 per page server-side.
- **Outputs:** Paginated permit list with result count ("Showing X-Y of Z permits"), active filter chips, sort controls. Consumed by `src/app/search/page.tsx` and `src/components/search/FilterPanel.tsx`.
- **Edge Cases:**
  - Empty search with no filters: show all permits sorted by issued_date DESC.
  - No results: "No permits match your search" with filter removal suggestions.
  - Invalid URL params (e.g. ward=999): silently ignored; valid params applied.
  - Date range end before start: auto-swap with correction notice.
  - Concurrent filter changes: AbortController cancels in-flight requests; latest wins.

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`search.logic.test.ts`): Search URL Parameter Parsing; Search Pagination Logic; Sort Option Parsing; Search API Request Building; CoA Source Toggle; Permit URL Generation
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/search/page.tsx`
- `src/components/search/FilterPanel.tsx`
- `src/tests/search.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/app/api/permits/route.ts`**: Governed by Spec 06. API is consumed, not modified.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.

### Cross-Spec Dependencies
- Relies on **Spec 06 (Data API)**: Consumes `GET /api/permits` with filter parameters.
- Relies on **Spec 12 (CoA Integration)**: Pre-permit source toggle uses CoA data.
- Relies on **Spec 13 (Auth)**: Reads user preferences for default filters.

</constraints>
