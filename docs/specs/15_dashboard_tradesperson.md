# Feature: Tradesperson Dashboard

## 1. User Story
"As a tradesperson (e.g. plumber), I want a dashboard showing building permits that need my trade, sorted by lead score, so I can find work opportunities."

## 2. Technical Logic

### Permit Feed
The dashboard displays a filtered feed of permits that match the user's selected trades (from onboarding, stored in `/users/{uid}/preferences/trades`). The feed is the primary view and loads immediately on dashboard mount.

* **Data Source:** `GET /api/permits?trade_slug={slug}&sort_by=lead_score&sort_order=desc`
* **Multi-trade handling:** If user selected multiple trades (e.g. plumbing + HVAC), the API is called with each trade slug and results are merged client-side, deduplicated by `permit_num--revision_num`, and sorted by highest `lead_score`.
* **Pagination:** Infinite scroll with 20 permits per page. Load next page when user scrolls within 200px of bottom.
* **Default sort:** `lead_score` DESC (highest opportunity first).
* **Refresh:** Pull-to-refresh on mobile; refresh button on desktop. Auto-refresh every 5 minutes.

### Permit Card
Each permit in the feed renders as a card with the following fields:

| Field | Source | Display |
|-------|--------|---------|
| Address | `street_num + street_name + street_type` | Primary heading |
| Status | `status` | Badge (color-coded) |
| Cost | `est_const_cost` | Formatted as `$XXX,XXX` |
| Lead Score | `lead_score` from `permit_trades` | Score badge (0-100, color gradient) |
| Phase | `phase` from classification | Phase badge (early/structural/finishing/landscaping) |
| Days Since Issued | `issued_date` | "X days ago" or "Issued: MMM DD, YYYY" |
| Ward | `ward` | Small label |
| Trade Match | `trade_name` from matched trade | Trade icon + name |
| Confidence | `confidence` from `permit_trades` | Percentage |

### Lead Score Badge Colors
| Range | Color | Label |
|-------|-------|-------|
| 80-100 | Green (#4CAF50) | Hot Lead |
| 60-79 | Orange (#FF9800) | Warm Lead |
| 40-59 | Yellow (#FFC107) | Moderate |
| 0-39 | Gray (#9E9E9E) | Cool |

### Save & Track Actions
Each permit card has action buttons:
* **Save Lead:** Saves permit to `/users/{uid}/savedPermits/{permitId}` with initial status `saved`.
* **Mark Status:** Status transitions for saved permits follow this pipeline:

```
saved -> contacted -> quoted -> won
                            -> lost
Any state -> archived
```

### Filters
Applied on top of the trade-based feed:

| Filter | Type | Values |
|--------|------|--------|
| Ward | Dropdown | Toronto wards 1-25 |
| Cost Range | Slider | $0 - $10,000,000+ |
| Status | Multi-select | Application, Issued, Under Inspection, Completed, etc. |
| Date Range | Date picker | issued_date range |
| Phase | Multi-select | early_construction, structural, finishing, landscaping |

### Dashboard Stats Bar
Top of dashboard shows summary stats:
* Total matching permits (current filters)
* New permits this week (matching user's trades)
* Saved leads count
* Leads contacted / conversion rate

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/dashboard/page.tsx` | Planned | Dashboard page (tradesperson default) |
| `src/app/dashboard/layout.tsx` | Planned | Dashboard layout with sidebar navigation |
| `src/components/permits/PermitCard.tsx` | Planned | Individual permit card component |
| `src/components/permits/PermitFeed.tsx` | Planned | Scrollable permit feed with infinite scroll |
| `src/components/permits/LeadScoreBadge.tsx` | Planned | Color-coded lead score badge |
| `src/components/permits/PhaseBadge.tsx` | Planned | Construction phase indicator |
| `src/components/permits/StatusBadge.tsx` | Planned | Permit status badge |
| `src/components/permits/PermitActions.tsx` | Planned | Save/track action buttons |
| `src/components/dashboard/DashboardFilters.tsx` | Planned | Filter panel component |
| `src/components/dashboard/DashboardStats.tsx` | Planned | Stats summary bar |
| `src/lib/dashboard/merge-feeds.ts` | Planned | Multi-trade feed merge and dedup logic |
| `src/app/api/permits/route.ts` | Exists | Permit list API (already supports trade_slug filter) |
| `src/tests/dashboard.logic.test.ts` | Planned | Dashboard logic unit tests |
| `src/tests/dashboard.ui.test.tsx` | Planned | Dashboard component tests |
| `src/tests/dashboard.infra.test.ts` | Planned | Dashboard integration tests |

## 4. Constraints & Edge Cases

### Constraints
* API pagination capped at 100 permits per request (enforced in `src/app/api/permits/route.ts`).
* Lead score is pre-calculated and stored in `permit_trades.lead_score`; no client-side recalculation.
* Saved permits are per-user in Firestore; no cross-user visibility for tradesperson accounts.
* Maximum 500 saved permits per user (Firestore subcollection query limit consideration).

### Edge Cases
* **No matching permits:** Display empty state with message "No permits match your trades yet. New permits are synced daily." and link to edit trade preferences.
* **User has no trades selected:** Redirect to onboarding (should not happen if onboarding completed, but defensive).
* **Permit appears in multiple trades:** Show once in feed with highest lead_score; show all matching trades on the card.
* **Very old permits (5+ years):** Lead score will be low (staleness penalty); they sink to bottom of default sort.
* **Network error on feed load:** Show error state with retry button; preserve any cached data.
* **Rapid filter changes:** Debounce API calls by 300ms; cancel in-flight requests on new filter change.
* **Saved permit status goes from "won" back:** Disallow; "won" and "lost" are terminal states. Allow "archived" from any state.

## 5. Data Schema

### API Response: `GET /api/permits` (existing, extended)
The existing API response is used. When `trade_slug` is provided, the response includes trade match data via the JOIN on `permit_trades` and `trades` tables.

### Firestore: `/users/{uid}/savedPermits/{permitId}`
```
{
  permit_num:      string       // e.g. "21 234567"
  revision_num:    string       // e.g. "01"
  permit_id:       string       // Composite: "21 234567--01"
  trade_slug:      string       // Primary trade match that led to saving
  lead_score:      number       // Score at time of saving (snapshot)
  status:          string       // "saved" | "contacted" | "quoted" | "won" | "lost" | "archived"
  notes:           string       // User's notes on this lead
  saved_at:        timestamp    // When user saved this permit
  status_updated:  timestamp    // When status was last changed
}
```

### Firestore: `/users/{uid}/preferences/trades` (read by dashboard)
```
{
  selected_trade_slugs:  string[]   // e.g. ["plumbing", "hvac"]
  updated_at:            timestamp
}
```

## 6. Integrations

### Internal
* **Auth (Spec 13):** Dashboard requires authenticated user. `uid` from session used for Firestore reads/writes.
* **Onboarding (Spec 14):** Trade preferences loaded from `/users/{uid}/preferences/trades` to build API queries.
* **Permit Data API (Spec 06):** `GET /api/permits` with `trade_slug`, `ward`, `min_cost`, `max_cost`, `status`, `sort_by`, `sort_order` query params.
* **Trade Classification (Spec 08):** `permit_trades` table provides trade matches and lead scores for each permit.
* **Lead Scoring (Spec 10):** `lead_score` field on `permit_trades` used for sort and badge display.
* **Construction Phases (Spec 09):** `phase` field used for phase badge and phase filter.
* **Permit Detail (Spec 18):** Clicking a permit card navigates to `/permits/{permitNum}--{revisionNum}`.
* **Search & Filter (Spec 19):** Dashboard filters share components with search page.
* **Map View (Spec 20):** "View on Map" action on permit card.

### External
* **Cloud Firestore:** Saved permits stored at `/users/{uid}/savedPermits/`.
* **PostgreSQL (via API):** Permit data, trade matches, lead scores read from PostgreSQL via Next.js API routes.

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`dashboard.logic.test.ts`)
* [ ] **Rule 1:** Filter application: API query string correctly constructed from active filters (ward, cost range, status, date range).
* [ ] **Rule 2:** Sort ordering: permits sorted by `lead_score` DESC by default; other sort options produce correct order.
* [ ] **Rule 3:** Saved permit status transitions: `saved -> contacted -> quoted -> won` are valid; `won -> contacted` is invalid.
* [ ] **Rule 4:** Multi-trade feed merge: permits from multiple trade queries are deduplicated by `permit_num--revision_num` and sorted by highest `lead_score`.
* [ ] **Rule 5:** Lead score badge color assignment: 80-100=green, 60-79=orange, 40-59=yellow, 0-39=gray.
* [ ] **Rule 6:** "Archived" status is reachable from any other status.

### B. UI Layer (`dashboard.ui.test.tsx`)
* [ ] **Rule 1:** Permit card renders address, status badge, cost, lead score badge, phase badge, and days since issued.
* [ ] **Rule 2:** Lead score badge displays correct color based on score range.
* [ ] **Rule 3:** Empty state renders when no permits match user's trades.
* [ ] **Rule 4:** Loading skeleton renders during API fetch.
* [ ] **Rule 5:** Filter panel renders all filter options (ward, cost, status, date, phase).
* [ ] **Rule 6:** Save lead button toggles between "Save" and "Saved" states.

### C. Infra Layer (`dashboard.infra.test.ts`)
* [ ] **Rule 1:** API call with user's trade filters returns permits matching those trades.
* [ ] **Rule 2:** Firestore save: saving a permit creates document at `/users/{uid}/savedPermits/{permitId}`.
* [ ] **Rule 3:** Firestore load: saved permits for user are loaded and their status reflected on permit cards.
* [ ] **Rule 4:** Infinite scroll: next page loads when scroll threshold is reached.
* [ ] **Rule 5:** Filter change cancels in-flight API request and issues new one.
