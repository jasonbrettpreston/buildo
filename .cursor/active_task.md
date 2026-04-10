# Active Task: Debug lead feed health 500 regression
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `8528f164` (8528f164534fd3ebb8fd4f3a9d349f43547dcb03)

## Context
* **Goal:** User reports `/admin/lead-feed` dashboard shows "Failed to load lead feed health: Internal server error". Previous WF3 commit `8528f164` added 7 new queries to `getLeadFeedReadiness`; all pass unit tests but the live endpoint returns 500.
* **Target Specs:**
  - `docs/specs/product/admin/76_lead_feed_health_dashboard.md` §3.1
* **Key Files:**
  - `src/app/api/admin/leads/health/route.ts` — handler with try/catch
  - `src/lib/admin/lead-feed-health.ts` — `getLeadFeedReadiness`, `getCostCoverage`, `getEngagement`
  - `src/lib/db/client.ts` — shared pool (no explicit `max`, defaults to 10)
  - `src/lib/logger.ts` — `logError` that the route uses

## State Verification (completed during investigation)

Curl results against `http://localhost:3000` with dev server (PID 28416) running:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/admin/stats` | **200 OK** | 173KB response — data quality dashboard source works |
| `/api/quality` | **200 OK** | Quality snapshots work |
| `/api/admin/leads/health` | **500** | `{error:"Internal server error"}` — THE BUG |
| `/api/admin/leads/test-feed?lat=43.6532&lng=-79.3832&trade_slug=plumbing` | **500** | `{error:{code:"INTERNAL_ERROR",message:"Feed query failed"}}` — expected, PostGIS not installed locally |

All 14 SQL queries from `getLeadFeedReadiness` were tested individually against the DB via `psql`. Every one of them returns valid data:
- feed_active: 234,842
- classified_active: 103,014
- with_phase: 103,014
- with_timing_calibration_match: 143,997
- opportunity breakdown: permit_issued=52687, inspection=140493, application=0, other_active=41662
- feed_eligible: 92,485
- builders_feed_eligible: 618
- neighbourhoods: total=158, active_with_nbhd=222,751
- engagement (`avg_competition_per_lead`): 0 (empty lead_views table)
- cost_coverage: (verified in previous WF3)

**Conclusion:** the underlying SQL works. Something in the Next.js runtime path is failing — this is NOT a schema or query bug.

## Hypotheses (ranked by likelihood)

### H1 — Next.js dev server is serving stale compiled code (HIGH likelihood, ~50%)
The previous commit changed the module interface (`LeadFeedReadiness` got 8 new required fields). If the dev server's HMR hot-reloaded the lib but not the route handler (or vice-versa), the route may be running a stale version that references a removed path, OR the response serializer fails because the return shape doesn't match the `LeadFeedHealthResponse` type. **Test:** kill the dev server and restart it. If 500 goes away, we need no code change — but we should still investigate why HMR failed.

### H2 — Response payload contains invalid JSON (BigInt, Infinity, NaN) (MED likelihood, ~20%)
`NextResponse.json(...)` uses `JSON.stringify`, which throws on BigInt or non-finite numbers. `COUNT(DISTINCT (pt.permit_num, pt.revision_num))` returns a Postgres `bigint` type — `parseInt` at the read site coerces it to a number, but what if one of the new queries returns a bigger-than-`Number.MAX_SAFE_INTEGER` value, or what if a query returns `null` for an aggregate that `parseInt` then coerces to `NaN`? The `timing_freshness_hours` NULL path is already guarded, but the other new fields may not be.

### H3 — Pool exhaustion (MED likelihood, ~15%)
With 14 concurrent queries against a default pool size of 10, the 4 excess queries queue. If the dashboard is actively polling (10s interval), TWO simultaneous `getLeadFeedReadiness` invocations = 28 connections queued on a 10-slot pool. The `connectionTimeoutMillis: 5000` in `src/lib/db/client.ts` would cause excess waits to throw `timeout exceeded when trying to connect`. The route's top-level catch returns 500.

### H4 — A new query references a column that exists in schema but is NULL-only (LOW likelihood, ~10%)
`permit_trades.phase` has 0 NULL values (verified earlier: `null_phase: 0`), but what if a column referenced in a JOIN implicitly NULL-propagates and causes a `parseInt(null)` → `NaN` that then gets serialized? The `.c` reads assume the column is always present with a valid integer.

### H5 — Something unrelated — `lead_views_schema.infra.test.ts` or a cross-import broke (LOW likelihood, ~5%)
Some test or module may have locked state that breaks at runtime but not at test time.

## Investigation Plan (before making any fix)

**Phase 1 — Get the real error (MUST be done first):**
1. Read the current dev server's terminal output directly (ask user to paste the last 30 lines from the Next.js terminal after hitting the endpoint), OR
2. Add temporary `console.error` in `src/app/api/admin/leads/health/route.ts` catch block that prints `err.stack` and the specific `err.message`, then curl the endpoint and read the dev server logs
3. Alternative: write a tiny `scripts/probe-health.mjs` that imports the module via `tsx` / `ts-node` and calls `getLeadFeedReadiness(pool)` directly with verbose logging — isolates the runtime bug from Next.js

**Phase 2 — Reproduce in a test:**
1. Once the error is known, add a regression test to `src/tests/lead-feed-health.logic.test.ts` that reproduces the failure mode (mock pool returning the exact shape that trips it up)
2. Red light

**Phase 3 — Fix:**
1. Based on which hypothesis proves correct:
   - H1: kill/restart dev server is the "fix" but we should also harden the route response to fail more gracefully (better error message, less generic "Internal server error")
   - H2: add a `safeParseInt` helper that rejects NaN and throws with a descriptive message naming the field + query
   - H3: either reduce query count via CTE consolidation, add a 30s server-side cache, or explicitly set `max: 20` on the pool
   - H4: add field presence validation on each query result
   - H5: whatever the specific cause is

**Phase 4 — Prevent regressions:**
- Make the route return a MORE DESCRIPTIVE error (not just "Internal server error"). The spec at §3.1 says "500 on unexpected error" but nothing requires the message to be an opaque string. Use the `extractErrorMessage` helper on the client side to render whatever the server sends. This is the real lesson from this session + the last one: opaque 500s hide bugs for days.
- Add a logic-level test that exercises `getLeadFeedReadiness` against a mock pool returning realistic shapes, catching serialization issues at test time instead of runtime.

## Technical Implementation (placeholder — depends on Phase 1 diagnosis)

* **New/Modified Files:** TBD — either `src/app/api/admin/leads/health/route.ts` (better error message), `src/lib/admin/lead-feed-health.ts` (safer parsing), or `src/lib/db/client.ts` (pool size)
* **Database Impact:** NO

## Standards Compliance

* **Try-Catch Boundary:** Existing catch in `route.ts` — will REFINE to log stack + message. Still return 500 but with descriptive body per §10.3
* **Unhappy Path Tests:** Will add a `logic.test.ts` case that mocks pool returning a `null` count or a non-finite aggregate, asserts the route returns a clear error
* **logError Mandate:** Already in route. Will augment with phase context (e.g., `logError(TAG, err, { phase: 'readiness_query' })`)
* **Mobile-First:** N/A — server-side fix

## Execution Plan

- [x] **Rollback Anchor:** `8528f164` recorded
- [x] **State Verification:** curl matrix done, SQL queries verified
- [ ] **Diagnose actual error (Phase 1):**
  - Option A: add a temporary `console.error(err.stack)` to the route handler's catch, curl the endpoint, read the dev server terminal output (via user paste), remove the temp log
  - Option B: write `scripts/probe-health.mjs` that imports + calls the function directly, bypassing Next.js
- [ ] **Confirm or reject H1 (stale dev server):** ask user to kill + restart dev server FIRST. If the 500 persists, H1 is ruled out. If gone, still harden error path in case of future HMR flakes.
- [ ] **Red Light:** Add reproduction test in `src/tests/lead-feed-health.logic.test.ts` (or augment existing)
- [ ] **Fix:** based on Phase 1 diagnosis
- [ ] **Harden error message:** update `src/app/api/admin/leads/health/route.ts` to return `{ error: err.message }` (still 500) in dev mode, still return generic message in prod. Use NODE_ENV gate.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **Collateral Check:** `npx vitest related src/lib/admin/lead-feed-health.ts src/app/api/admin/leads/health/route.ts --run`
- [ ] **Pre-Review Self-Checklist (3-5 sibling bugs):**
  1. Does `getCostCoverage` have the same fragility?
  2. Does `getEngagement` have the same fragility?
  3. Does the test-feed route need the same error-message hardening?
  4. Are there other admin routes that return opaque 500s and would benefit from the same treatment?
- [ ] **Reviews:** adversarial + independent after fix is applied
- [ ] **Atomic Commit:** `git commit -m "fix(76_lead_feed_health_dashboard): health endpoint 500 regression + better error messages"`

## Why This Isn't Purely a "restart the dev server" Fix

Even if H1 is correct and restarting fixes the symptom, two follow-on fixes are needed:
1. The client shows an **opaque** "Internal server error" message, which hides real bugs for days (this is the SECOND time this session we've debugged an opaque 500). The `extractErrorMessage` helper added last WF3 is USELESS when the server returns a canned string. The server should return the actual error in dev, and the spec already allows it.
2. `getLeadFeedReadiness` has no logic-level tests that exercise the real return shape — a mock-pool test would have caught this at test time.

## Scope Discipline

- NOT in scope: adding a route-level cache (deferred to perf WF)
- NOT in scope: converting all 14 queries to a single CTE (perf optimization, not a bug fix)
- NOT in scope: fixing the test-feed endpoint to work without PostGIS (install PostGIS locally)
