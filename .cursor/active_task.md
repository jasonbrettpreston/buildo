# Active Task: Lead Feed Health Dashboard — Phase A (Backend Plumbing)
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Cross-Domain** (backend first, then frontend)
**Rollback Anchor:** `aca8f41`

## Context
* **Goal:** Wire lead feed observability into the admin dashboard. Phase A = backend endpoints + TypeScript interface updates. Phase B (next session) = admin UI components.
* **Target Spec:** `docs/specs/product/admin/76_lead_feed_health_dashboard.md`
* **Key Files:** See §2.4 File Map in the spec

## Technical Implementation

### New Files
1. **`src/lib/admin/lead-feed-health.ts`** — Query functions:
   - `getLeadFeedReadiness(pool)` — 5 parallel queries: active permits, geocoded, classified, with cost, timing calibration state
   - `getCostCoverage(pool)` — cost_estimates breakdown
   - `getEngagement(pool)` — lead_views aggregation (7-day window, by trade)
   - `computeFeedReadyPct(readiness)` — 3-way intersection: geocoded AND classified AND cost estimated / active_permits

2. **`src/app/api/admin/leads/health/route.ts`** — GET handler:
   - Admin auth (inherits from `/api/admin/**` classification)
   - try-catch with logError
   - Calls 3 query functions in parallel
   - Returns `LeadFeedHealthResponse` via NextResponse.json

3. **`src/app/api/admin/leads/test-feed/route.ts`** — GET handler:
   - Admin auth
   - Zod validation on query params (lat, lng, trade_slug, radius_km, limit)
   - Constructs synthetic `LeadFeedInput` with `user_id: 'admin-test'`
   - Calls `getLeadFeed(input, pool)` directly
   - Computes `_debug` block from results (score stats, pillar averages)
   - Returns `{ data, error: null, meta, _debug }`

4. **`src/tests/lead-feed-health.logic.test.ts`** — Logic tests for query functions
5. **`src/tests/lead-feed-health.infra.test.ts`** — API route shape tests

### Modified Files
6. **`src/lib/quality/types.ts`** — Add 7 cost/timing fields to DataQualitySnapshot interface
7. **`src/app/api/admin/stats/route.ts`** — Add `lead_views` to live_table_counts + lead_views count queries
8. **`src/app/admin/page.tsx`** — Add "Lead Feed" navigation tile (3rd tile)

## Database Impact
**NO** — read-only queries against existing tables

## Standards Compliance
* **Try-Catch Boundary:** Both routes wrapped in try-catch with `logError(tag, err, context)` (§2.2)
* **Unhappy Path Tests:** 400 (bad params on test-feed), 500 (DB error), empty lead_views, empty cost_estimates
* **logError Mandate:** Both routes use logError in catch blocks
* **Mobile-First:** Phase B concern — page.tsx tile addition only in Phase A
* **Response Envelope:** Test-feed uses `{ data, error: null, meta, _debug }` matching ApiSuccess pattern. Health endpoint uses plain NextResponse.json (admin-only, not consumer-facing).

## Execution Plan
- [ ] **Contract Definition:** Define `LeadFeedHealthResponse` and `TestFeedDebug` TypeScript interfaces in `src/lib/admin/lead-feed-health.ts`
- [ ] **Spec & Registry Sync:** Spec 76 already committed. Run `npm run system-map` after.
- [ ] **Schema Evolution:** N/A — no migration needed
- [ ] **Test Scaffolding:** Create test files with failing tests
- [ ] **Red Light:** Run tests, must see failures
- [ ] **Implementation:** Write query functions, route handlers, TypeScript interface updates
- [ ] **Auth Boundary & Secrets:** Verify routes classified as 'admin' by route-guard. No env secrets in responses.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `/api/admin/leads/health` return all fields from the spec's LeadFeedHealthResponse?
  2. Does `/api/admin/leads/test-feed` bypass getCurrentUserContext (no Firebase UID needed)?
  3. Does the test-feed Zod schema match the feed's leadFeedQuerySchema minus cursor fields?
  4. Are lead_views queries using `saved` (DB column) not `is_saved` (TS field)?
  5. Does the 3-way intersection for feed_ready_pct use a single SQL query (not 3 separate counts)?
  6. Are both routes' error responses using logError, not bare console.error?
  7. Is `_debug` computed from the result data (not a separate DB query)?
  8. Does adding "Lead Feed" tile to page.tsx match the existing tile pattern?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Output ✅/⬜ summary. → WF6.
