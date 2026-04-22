# Spec 76 — Admin Test Feed Tool

<requirements>
## 1. Goal & User Story

**Goal:** Provide a lightweight, direct-access testing tool for the core Lead Feed algorithm without requiring a mobile simulator or dummy user accounts. 

**User Story:** As an admin, I need a "Test Feed" tool to simulate a user query — enter a location, trade, and radius, see the raw scored results, and verify the feed's geographic, timing, and sorting algorithms work end-to-end.
</requirements>

---

<architecture>
## 2. Technical Architecture

### 2.1 Backend Endpoint

**API endpoint:** `GET /api/admin/leads/test-feed`

An admin-only endpoint that bypasses the `trade_slug must match user profile` check. It accepts the same query params as the mobile feed but authenticates via admin auth (session cookie or X-Admin-Key) instead of a standard user context.

Returns the standard `{ data, meta }` envelope, plus a `_debug` block with scoring breakdown:

```typescript
interface TestFeedResponse {
  data: LeadFeedItem[];
  error: null;
  meta: { next_cursor: LeadFeedCursor | null; count: number; radius_km: number };
  _debug: TestFeedDebug;
}

interface TestFeedDebug {
  query_duration_ms: number;
  permits_in_results: number;
  builders_in_results: number;
  score_distribution: { min: number; max: number; median: number; p25: number; p75: number } | null;
  pillar_averages: { proximity: number; timing: number; value: number; opportunity: number } | null;
}
```

### 2.2 Shared Utilities (`test-feed-utils.ts`)
To prevent duplicating PostGIS checks between the production feed and the admin feed, a shared utility module houses:
* `isPostgisAvailable(pool)`
* `computeTestFeedDebug(leads, durationMs)`
* `sanitizePgErrorMessage(error)`

### 2.3 Admin UI
**Admin Page:** `/admin/lead-feed`
Renders a single `<TestFeedTool />` client component.
* **Input Form:** lat/lng (number inputs), trade_slug (native select), radius_km (native range slider).
* **Action:** "Run Test Query" button triggers the API.
* **Results Panel:** Displays the `_debug` stats in a summary grid, followed by a mapped list of the returned permits (showing permit_num and relevance_score).

### 2.4 File Map
| File | Action |
|------|--------|
| `src/app/api/admin/leads/test-feed/route.ts` | The admin API endpoint |
| `src/lib/admin/test-feed-utils.ts` | Shared logic for the debug block and PostGIS pre-flight |
| `src/components/admin/TestFeedTool.tsx` | The UI form and result renderer |
| `src/app/admin/lead-feed/page.tsx` | The page mounting the tool |

### 2.5 Database Impact

**NO** — all data already exists in:
- `data_quality_snapshots` (cost/timing columns from migration 080)
- `lead_views` (migration 069/070/076/079)
- `cost_estimates` (migration 071)
- `timing_calibration` (migration 073)
- `permit_trades`, `permits` (existing)

No new tables or columns needed. The health endpoint performs read-only aggregate queries.

### 2.6 Auth

Both new endpoints use admin auth (inherits from `/api/admin/**` route classification):
- Browser: `__session` cookie (Firebase session)
- Scripts/CI: `X-Admin-Key` header

The test-feed endpoint does NOT require a `user_profiles` entry — it constructs a synthetic `LeadFeedInput` directly from query params, bypassing `getCurrentUserContext()`.

</architecture>

---

<behavior>
## 3. Behavioral Contract

### 3.1 Lead Feed Health Endpoint

- **Inputs:** Admin auth (cookie or header). No query params.
- **Core Logic:**
  1. Query `data_quality_snapshots` for latest row (cost/timing columns)
  2. Run 4 lightweight aggregate queries against `permits`, `permit_trades`, `cost_estimates`, `lead_views`
  3. Compute `feed_ready_pct` = permits with ALL THREE of (geocoding + trade + cost) / active_permits
  4. Aggregate `lead_views` by day for 7-day engagement window
  5. Group `lead_views` by `trade_slug` for trade breakdown
- **Outputs:** `LeadFeedHealthResponse` JSON
- **Edge Cases:**
  - Zero lead_views → engagement section shows all zeros (not an error)
  - cost_estimates table empty → `cost_coverage.total = 0`, `feed_ready_pct` drops (cost pillar missing)
  - timing_calibration empty → `timing_types_calibrated = 0`, `timing_freshness_hours = null`

### 3.2 Test Feed Endpoint

- **Inputs:** Admin auth + query params: `lat`, `lng`, `trade_slug`, `radius_km` (default 10), `limit` (default 15)
- **Core Logic:**
  1. Validate params with Zod (same schema as `/api/leads/feed` minus the cursor)
  2. **Pre-flight:** verify PostGIS extension is installed via `isPostgisAvailable(pool)`. If missing (local dev without the extension), short-circuit to `503 DEV_ENV_MISSING_POSTGIS` with install instructions. Production Cloud SQL has PostGIS so this path is a cache hit in prod.
  3. Construct `LeadFeedInput` with a synthetic `user_id = 'admin-test'`
  4. Call `getLeadFeed(input, pool)` — same function the real feed uses
  5. Compute `_debug` block from results: score stats, pillar averages, coverage metrics
  6. Return full response with debug overlay
- **Outputs:** Feed results + debug scoring breakdown
- **Edge Cases:**
  - No permits in radius → `data: []`, `_debug.permits_in_radius: 0`
  - Invalid trade_slug → 400 with field-level error
  - Trade has no permits → empty results (valid, shows feed gap)
  - `is_saved` field on LeadFeedItem always `false` for admin-test user (the `lead_views.saved` DB column has no rows for synthetic user_id)
  - **PostGIS missing (dev only):** 503 with `code: 'DEV_ENV_MISSING_POSTGIS'` and a message describing OS-level install steps. The production Cloud SQL instance has PostGIS by default.
  - **Runtime query error:** 500 with sanitized dev-mode message (via `sanitizePgErrorMessage`), production returns the canned `"Feed query failed"`. Added WF3 2026-04-11 to close the last opaque-500 in the Lead Feed Health endpoints.

### 3.3 Dashboard UI

- **Inputs:** Admin navigates to `/admin/lead-feed`
- **Core Logic:**
  - Polls `/api/admin/leads/health` every 10 seconds (same pattern as DataQualityDashboard)
  - Test Feed form is on-demand (no polling)
  - Traffic light logic:
    - **GREEN** = `feed_ready_pct > 80` AND `timing_freshness_hours !== null` AND `timing_freshness_hours < 48`
    - **YELLOW** = `50 <= feed_ready_pct <= 80` OR `timing_freshness_hours === null` OR `timing_freshness_hours > 48`
    - **RED** = `feed_ready_pct < 50` OR `cost_coverage.total === 0`
  - `timing_freshness_hours === null` MUST produce YELLOW, never GREEN. Null indicates the `timing_calibration` cron has never run OR the table was truncated — both are failure states that must be surfaced, not hidden behind a green light. (External review 2026-04-10 Antigravity flagged this as "Missing-Cron Green Light" bug.)
- **Cost Coverage (Section 2)** shows TWO percentages:
  - **Permit coverage** (headline) = `permits_with_cost / active_permits` — fraction of active permits that have a cost estimate. Computed in the route handler from values already fetched by `getLeadFeedReadiness`, no extra DB round-trip.
  - **Cache coverage** (secondary) = `(cost_estimates.total - cost_estimates.null_cost) / cost_estimates.total` — cleanliness of the estimate cache itself.
  - Both metrics are displayed to expose divergence (e.g., 94% cache + 60% permits means the cache is clean but sparse, pointing to incomplete cost computation runs).
- **Outputs:** 4-section dashboard + interactive test feed tool
- **Edge Cases:**
  - API timeout → show stale data with "Last updated X ago" badge
  - Test feed timeout (>10s) → show loading spinner, warn if >30s
  - `active_permits === 0` (fresh DB) → `coverage_pct_vs_active_permits === 0` (no division by zero)

</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `lead-feed-health.logic.test.ts` — readiness calculation (3-way intersection), engagement aggregation, cost coverage math, edge cases (empty tables, null values)
- **Infra:** `lead-feed-health.infra.test.ts` — API route shape (response envelope, auth enforcement, Zod validation on test-feed params)
- **UI:** `LeadFeedHealthDashboard.ui.test.tsx` — readiness gauge rendering, traffic light states, engagement chart data, test feed form interaction, loading/error states, mobile viewport (375px)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `src/app/api/admin/leads/health/route.ts` — health endpoint
- `src/app/api/admin/leads/test-feed/route.ts` — test feed endpoint
- `src/lib/admin/lead-feed-health.ts` — query functions
- `src/lib/quality/types.ts` — DataQualitySnapshot interface extension
- `src/app/api/admin/stats/route.ts` — lead_views additions
- `src/app/admin/lead-feed/page.tsx` — admin page
- `src/components/LeadFeedHealthDashboard.tsx` — dashboard component

### Out-of-Scope Files
- `src/features/leads/lib/get-lead-feed.ts` — the feed SQL is read-only consumed, not modified
- `src/app/api/leads/feed/route.ts` — user-facing feed unchanged
- `scripts/refresh-snapshot.js` — already writes cost/timing snapshot data
- `scripts/compute-cost-estimates.js` — pipeline step unchanged

### Cross-Spec Dependencies
- **Relies on:** `26_admin_dashboard.md` (admin auth, dashboard patterns, `/api/admin/stats`)
- **Relies on:** `70_lead_feed.md` (feed SQL, scoring pillars, LeadFeedItem types)
- **Relies on:** `72_lead_cost_model.md` (cost_estimates table, coverage metrics)
- **Relies on:** `71_lead_timing_engine.md` (timing_calibration table, freshness)
- **Relies on:** `41_chain_permits.md` (pipeline steps 14-15 that populate cost/timing data)
- **Consumed by:** Admin users monitoring lead feed production health

### Mobile & Responsive Behavior
- Dashboard sections stack vertically on mobile (base = single column)
- Test Feed form: full-width inputs on mobile, inline on desktop (`md:flex-row`)
- Results cards: same PermitLeadCard/BuilderLeadCard components from the feed (reused)
- Touch targets >= 44px on all interactive elements
</constraints>
