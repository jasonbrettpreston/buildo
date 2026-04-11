# Lead Feed Health Dashboard — Admin Observability for the Lead Generation System

<requirements>
## 1. Goal & User Story

As an admin, I need full observability into the lead feed system — from pipeline data readiness through API performance to user engagement — so I can answer five questions from a single dashboard page:

1. **"Is the feed data ready?"** — What % of active permits are scoreable (geocoded + trade classified + cost estimated + timing calibrated)?
2. **"Is the feed responding?"** — What are the API latency and error rates?
3. **"Are users engaging?"** — How many views, saves, and returning users per day?
4. **"Which trades are healthy?"** — Is feed coverage and engagement balanced across trades?
5. **"What broke?"** — Which pipeline step failed, and what downstream data is stale?

As an admin, I also need a "Test Feed" tool to simulate a user query — enter a location, trade, and radius, see the raw scored results, and verify the feed works end-to-end without needing a real user account.
</requirements>

---

<architecture>
## 2. Technical Architecture

### 2.1 Phase A — Data Plumbing (Backend)

**New API endpoint:** `GET /api/admin/leads/health`

Returns a single JSON response aggregating all lead feed health metrics. The admin dashboard polls this endpoint alongside `/api/admin/stats`.

```typescript
interface LeadFeedHealthResponse {
  // Feed readiness (from data_quality_snapshots + live queries)
  readiness: {
    active_permits: number;
    permits_geocoded: number;         // has lat/lng — required for proximity scoring
    permits_classified: number;       // has trade in permit_trades — required to appear in feed
    permits_with_cost: number;        // has row in cost_estimates with non-null estimated_cost
    timing_types_calibrated: number;  // rows in timing_calibration
    timing_freshness_hours: number | null; // hours since last timing calibration
    feed_ready_pct: number;           // % of active permits with geocoding + trade + cost (3-way intersection)
    builders_total: number;
    builders_with_contact: number;    // has phone or email
    builders_wsib_verified: number;
  };

  // Cost estimate breakdown (from data_quality_snapshots or live query)
  cost_coverage: {
    total: number;
    from_permit: number;              // est_const_cost reported by City
    from_model: number;               // computed by cost model
    null_cost: number;                // model couldn't estimate
    coverage_pct: number;              // cache-scoped: (total - null_cost) / total
    coverage_pct_vs_active_permits: number; // headline: permits_with_cost / active_permits (computed in route handler from readiness values)
  };

  // User engagement (from lead_views table)
  engagement: {
    views_today: number;
    views_7d: number;
    saves_today: number;
    saves_7d: number;
    unique_users_7d: number;
    avg_competition_per_lead: number; // avg saves per lead_key
    top_trades: Array<{ trade_slug: string; views: number; saves: number }>;
  };

  // Feed API performance (from pipeline_runs or request_log table if available)
  performance: {
    // Populated from structured log aggregation or future metrics table
    // Phase A: null (not yet instrumented)
    // Phase B: populated from request metrics
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    error_rate_pct: number | null;
    avg_results_per_query: number | null;
  };
}
```

**New API endpoint:** `GET /api/admin/leads/test-feed`

Admin-only endpoint that bypasses the `trade_slug must match user profile` check. Accepts the same query params as `/api/leads/feed` but authenticates via admin auth (session cookie or X-Admin-Key) instead of user context.

```
GET /api/admin/leads/test-feed?lat=43.65&lng=-79.38&trade_slug=plumbing&radius_km=10&limit=15
```

Returns the same `{ data, meta }` envelope as the user-facing feed, plus a `_debug` block with scoring breakdown:

```typescript
interface TestFeedResponse {
  data: LeadFeedItem[];
  error: null;                        // always null on success (matches ApiSuccess envelope from envelope.ts)
  meta: { next_cursor: LeadFeedCursor | null; count: number; radius_km: number };
  _debug: {
    query_duration_ms: number;
    permits_in_results: number;       // permits in the returned results
    builders_in_results: number;      // builders in the returned results
    score_distribution: {
      min: number; max: number; median: number; p25: number; p75: number;
    } | null;                         // null when results are empty
    pillar_averages: {
      proximity: number; timing: number; value: number; opportunity: number;
    } | null;                         // null when results are empty
    // Phase B additions (requires LeadFeedItem to carry cost/timing tier data):
    // cost_coverage_in_results: number;
    // timing_tier_distribution: { tier1: number; tier2: number; tier3: number };
  };
}
```

### 2.2 Phase A — Existing Endpoint Updates

**`GET /api/admin/stats`** — Add to response:
- `lead_views_total` — COUNT from lead_views
- `lead_views_saved` — COUNT from lead_views WHERE saved = true
- Add `lead_views` to `live_table_counts` query list

**`DataQualitySnapshot` TypeScript interface** (`src/lib/quality/types.ts`) — Add 7 fields:
```typescript
cost_estimates_total: number | null;
cost_estimates_from_permit: number | null;
cost_estimates_from_model: number | null;
cost_estimates_null_cost: number | null;
timing_calibration_total: number | null;
timing_calibration_avg_sample: number | null;
timing_calibration_freshness_hours: number | null;
```

These columns already exist in the DB (migration 080) and are populated by `refresh-snapshot.js`. The TypeScript interface just needs to expose them.

### 2.3 Phase B — Admin UI

**New admin page:** `/admin/lead-feed`

Add a third tile to `/admin/page.tsx` linking to the new page. The page renders a `<LeadFeedHealthDashboard />` component with 4 sections:

**Section 1 — Feed Readiness Gauge**
- Large circular gauge showing `feed_ready_pct` (0-100%)
- Breakdown bar: geocoded | classified | cost estimated (stacked, showing where coverage drops)
- Builder readiness: total | with contact | WSIB verified
- Traffic light: GREEN (>80%), YELLOW (50-80%), RED (<50%)

**Section 2 — Cost & Timing Coverage**
- Cost source pie chart: permit-reported vs model-estimated vs null
- Timing calibration: N permit_types calibrated, freshness badge (green <24h, yellow <48h, red >48h)
- Trend sparkline from last 30 snapshot days

**Section 3 — User Engagement**
- Daily views/saves bar chart (7-day window)
- Unique users count
- Competition heat: avg saves per lead
- Trade breakdown table: views + saves + save_rate per trade_slug

**Section 4 — Test Feed Tool**
- Input form: lat/lng (with map picker or text input), trade_slug (dropdown from trades table), radius_km (slider 5-30)
- "Run Test" button → calls `/api/admin/leads/test-feed`
- Results panel: card list with score breakdown per lead
- Debug panel: query duration, score distribution, pillar averages, tier distribution
- Pre-populated with Toronto city center (43.6532, -79.3832) and "plumbing" as defaults

### 2.4 File Map

| File | Action | Phase |
|------|--------|-------|
| `src/lib/quality/types.ts` | Add 7 cost/timing fields to DataQualitySnapshot interface | A |
| `src/app/api/admin/stats/route.ts` | Add lead_views counts + live_table_counts entry | A |
| `src/app/api/admin/leads/health/route.ts` | NEW — aggregated lead feed health endpoint | A |
| `src/app/api/admin/leads/test-feed/route.ts` | NEW — admin test feed endpoint (bypasses user profile check) | A |
| `src/lib/admin/lead-feed-health.ts` | NEW — query functions for readiness, engagement, cost coverage | A |
| `src/app/admin/page.tsx` | Add "Lead Feed" tile | B |
| `src/app/admin/lead-feed/page.tsx` | NEW — lead feed health page | B |
| `src/components/LeadFeedHealthDashboard.tsx` | NEW — dashboard component with 4 sections | B |
| `src/tests/lead-feed-health.logic.test.ts` | NEW — health query logic tests | A |
| `src/tests/lead-feed-health.infra.test.ts` | NEW — API route shape tests | A |
| `src/tests/LeadFeedHealthDashboard.ui.test.tsx` | NEW — UI component tests | B |

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
