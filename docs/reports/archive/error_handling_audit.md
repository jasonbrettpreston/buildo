# WF5 Error Handling Audit Report

**Date:** 2026-03-06
**Scope:** All API routes, lib modules, React components/pages, and scripts
**Method:** Static analysis across 4 parallel audits

---

## Rubric

Each finding is scored on a 6-point rubric across two dimensions:

| Dimension | Score | Meaning |
|-----------|-------|---------|
| **Severity** | Critical | Data loss, security hole, or crash in production |
| | High | Silent failure masking real problems, or missing error path on a hot code path |
| | Medium | Inconsistent handling, fragile pattern, or poor UX on error |
| | Low | Best-practice gap, cosmetic, or unlikely edge case |
| **Layer** | API | `src/app/api/` route handlers |
| | Lib | `src/lib/` business logic modules |
| | UI | `src/components/` and `src/app/*/page.tsx` |
| | Script | `scripts/` batch processing |

---

## Executive Summary

| Layer | Critical | High | Medium | Low | Total |
|-------|----------|------|--------|-----|-------|
| API Routes | 3 | 8 | 12 | 5 | **28** |
| Lib Modules | 3 | 7 | 5 | 5 | **20** |
| Components | 2 | 7 | 6 | 4 | **19** |
| Scripts | 4 | 6 | 5 | 5 | **20** |
| **Total** | **12** | **28** | **28** | **19** | **87** |

**Verdict: NO-GO** -- 12 critical issues must be resolved before any production deployment.

---

## Top 12 Critical Issues

### C1. Database Pool Hard Crash on Idle Error
**Layer:** Lib | **File:** `src/lib/db/client.ts`
`pool.on('error')` calls `process.exit(-1)` unconditionally. A transient network blip kills the entire process with no recovery.

### C2. Sync ROLLBACK Not Error-Guarded
**Layer:** Lib | **File:** `src/lib/sync/process.ts`
In the permit processing loop, `client.query('ROLLBACK')` inside a catch block is not itself wrapped in try-catch. If the client is dead, this throws an unhandled error.

### C3. CSV Export ROLLBACK Swallowed Silently
**Layer:** Lib | **File:** `src/lib/export/csv.ts`
Cursor-based streaming catches ROLLBACK errors with `.catch(() => {})` -- no logging. Real connection failures are indistinguishable from normal cleanup.

### C4. Pool Connections Not Released on Error (Multiple Scripts)
**Layer:** Script | **Files:** `scripts/link-parcels.js`, `scripts/enrich-builders.js`
Database pools created but never `pool.end()`-ed on error paths. Accumulating connection leaks can exhaust the pool.

### C5. Silent Fetch Timeout in Web Scraping
**Layer:** Script | **File:** `scripts/enrich-web-search.js`
Website scraping uses `AbortSignal.timeout(5000)` but catches all errors with empty `catch {}`. No logging of which URLs failed or why.

### C6. Silent Batch Errors After 5th Failure
**Layer:** Script | **File:** `scripts/load-parcels.js`
Batch errors logged only for first 5 occurrences, then silently incremented. Operator unaware if hundreds of records failed.

### C7. Process Exit Without Pool Cleanup
**Layer:** Script | **File:** `scripts/load-wsib.js`
`process.exit(1)` called on file-not-found without closing the database pool opened earlier.

### C8. Error Message Leakage to Clients
**Layer:** API | **File:** `src/app/api/admin/builders/route.ts` (and 4 others)
Raw `err.message` exposed in JSON responses: `{ error: '...', message: err.message }`. Leaks internal details (table names, constraint names, stack traces).

### C9. Missing Try-Catch on Public GET Routes
**Layer:** API | **Files:** `src/app/api/builders/route.ts`, `src/app/api/coa/route.ts`
Database queries executed with no try-catch wrapper. Any DB error returns an uncontrolled 500 with raw error body.

### C10. SQL Sort Column Interpolation Pattern
**Layer:** API | **Files:** `src/app/api/builders/route.ts`, `src/app/api/entities/route.ts`, `src/app/api/permits/route.ts`
Sort columns validated against a whitelist but interpolated directly into SQL via template literal (`ORDER BY ${sort}`). Safe today but fragile -- whitelist removal breaks security.

### C11. Unhandled Promise in Polling Loop
**Layer:** UI | **File:** `src/components/DataQualityDashboard.tsx`
`fetchData()` called inside `setInterval` without `.catch()`. Network failure during polling silently fails; dashboard shows stale data with no error indicator.

### C12. Market Metrics Error State Never Displayed
**Layer:** UI | **File:** `src/app/admin/market-metrics/page.tsx`
Error state is set but never rendered. Page shows "Loading" indefinitely if fetch fails.

---

## High-Severity Issues (28)

### API Routes (8)

| # | File | Issue |
|---|------|-------|
| H1 | `api/permits/geo/route.ts` | Geo coordinates not range-validated (lat/lng bounds) |
| H2 | `api/admin/rules/route.ts` + 3 others | Raw `err.message` in error responses |
| H3 | `api/notifications/route.ts` | PATCH handler has no try-catch; JSON parse can crash |
| H4 | `api/admin/pipelines/[slug]/route.ts` | Error response lists all allowed pipeline slugs (info disclosure) |
| H5 | `api/entities/[id]/route.ts` | `await params` outside try-catch; can throw unhandled |
| H6 | `api/builders/[id]/route.ts` | Same pattern as H5 |
| H7 | `api/coa/route.ts` | No try-catch wrapper around any query |
| H8 | `api/admin/pipelines/[slug]/route.ts` | Race condition: concurrent requests can start duplicate pipeline runs |

### Lib Modules (7)

| # | File | Issue |
|---|------|-------|
| H9 | `lib/builders/enrichment.ts` | Google Places API fetch has no timeout or retry logic |
| H10 | `lib/coa/repository.ts` | `rows[0]` returned without length check; undefined vs null mismatch |
| H11 | `lib/analytics/queries.ts` | `parseInt(r.count)` without null coalescing; NaN on undefined |
| H12 | `lib/quality/metrics.ts` | Silent catch swallows ALL errors, not just "table doesn't exist" |
| H13 | `lib/auth/session.ts` | Firebase auth operations have no try-catch; unhandled on quota/downtime |
| H14 | `lib/inspections/parser.ts` | Global regex with `.exec()` loop; fragile state management |
| H15 | `lib/sync/ingest.ts` | `flushBatch()` rejection handled but Promise not awaited by caller |

### Components (7)

| # | File | Issue |
|---|------|-------|
| H16 | `components/search/FilterPanel.tsx` | `.catch(() => {})` silently swallows trade fetch errors |
| H17 | `app/builders/page.tsx` | `.catch(console.error)` with no error state; infinite "Loading..." |
| H18 | `app/builders/[id]/page.tsx` | Same: no error state on fetch failure |
| H19 | `app/permits/[id]/page.tsx` | Same: no error state on fetch failure |
| H20 | `app/dashboard/page.tsx` | `.catch(() => {})` on stats fetch; silent failure |
| H21 | `app/map/page.tsx` | Map fetch error logged but no UI feedback |
| H22 | `components/permits/PermitFeed.tsx` | No error state; "No permits found" shown on network failure |

### Scripts (6)

| # | File | Issue |
|---|------|-------|
| H23 | `scripts/classify-permits.js` | Partial batch insert failure: earlier sub-batches committed, later ones lost |
| H24 | `scripts/load-coa.js` | Individual record upsert has no error handling; can't identify bad record |
| H25 | `scripts/run-chain.js` | Error message truncated to 200 chars in logs; root cause lost |
| H26 | `scripts/load-permits.js` | `fetch(url)` to CKAN API has no timeout; script hangs indefinitely |
| H27 | `scripts/load-coa.js` | Same: no fetch timeout |
| H28 | `scripts/enrich-web-search.js` | Missing API key exits without error code; chain orchestrator sees success |

---

## Medium-Severity Issues (28)

### API Routes (12)
- Inconsistent error response format (`{ error }` vs `{ error, message }`) across routes
- Missing pagination validation (negative offset, NaN limit fallback)
- Missing Content-Type validation on POST/PATCH bodies
- `user_id` accepted from query param without session validation (notifications)
- Silent `.catch(() => [{ count: '0' }])` in admin stats masks real failures
- Pipeline concurrency guard has TOCTOU race window
- Unvalidated enum values passed to SQL (`role` in entities)
- Optional data queries use catch-all that masks connection errors
- Dynamic JOIN clause construction via template literal (fragile pattern)
- Empty request body silently accepted with defaults
- No validation of cost filter ranges (negative, overflow)
- Quality refresh endpoint has edge case where sync error escapes try

### Lib Modules (5)
- `parseInt()` with `|| 0` silently converts invalid data to zero (`field-mapping.ts`)
- Non-null assertion `!` on trade lookup without guard (`classifier.ts`)
- Invalid Date objects not detected in CoA pre-permit qualification
- GeoJSON geometry not validated before spatial operations
- Massing geometry type-cast without structure validation

### Components (6)
- DataQualityDashboard `fetchData` in `Promise.all` with no error state
- ScheduleEditModal error from async callback not propagated
- Search page shows "Searching..." forever on fetch failure
- Onboarding page navigates away even if preference save failed
- LoginForm shows generic "Authentication failed" without specifics
- `scope_tags` parsing via string slicing with no try-catch

### Scripts (5)
- Inconsistent `process.exit(1)` without ensuring `pool.end()` completes
- Early return paths skip `pool.end()` (link-coa.js)
- CSV parser `destroy()` doesn't immediately stop data events (race condition)
- No retry/backoff on transient network failures (assert-schema.js)
- `result.rows[0]` access without empty check (refresh-snapshot.js)

---

## Systemic Patterns

### Pattern 1: Silent `.catch(() => {})` (14 occurrences)
Errors swallowed with no logging across API routes, components, and scripts. Masks real failures and makes debugging impossible.

**Fix:** Replace with `.catch(err => console.error('[context]', err))` at minimum. Add error state for UI components.

### Pattern 2: Missing Try-Catch on Route Handlers (6 routes)
Public GET routes execute database queries without any try-catch. Any DB error returns raw 500.

**Fix:** Wrap all route handler bodies in top-level try-catch returning `{ error: 'Internal server error' }` with status 500.

### Pattern 3: No Fetch Timeouts (8 occurrences)
External API calls (CKAN, Google Places, AIC portal) have no timeout configuration. Scripts and enrichment pipelines can hang indefinitely.

**Fix:** Add `AbortSignal.timeout(30000)` to all external fetch calls.

### Pattern 4: Error Message Leakage (6 routes)
Admin routes expose raw `err.message` in JSON responses, leaking table names, constraint names, and implementation details.

**Fix:** Return generic error messages. Log details server-side only.

### Pattern 5: No Error Boundaries (0 exist)
No React error boundaries anywhere. Any component render error crashes the entire page.

**Fix:** Add `error.tsx` files in key route segments.

### Pattern 6: Pool Connection Leaks (5 scripts)
Scripts that `process.exit(1)` or return early without calling `pool.end()`.

**Fix:** Use try/finally pattern: `try { await run(); } finally { await pool.end(); }`.

---

## Recommended Fix Priority

### Phase 1: Critical (Immediate)
1. Replace `process.exit(-1)` in pool error handler with reconnect logic
2. Wrap ROLLBACK calls in their own try-catch
3. Add try-catch to all unguarded public API routes
4. Remove `err.message` from all client-facing error responses
5. Add `.catch()` to polling interval in DataQualityDashboard
6. Add `pool.end()` to all script error/exit paths

### Phase 2: High (This Sprint)
7. Add `AbortSignal.timeout()` to all external fetch calls
8. Add error state to all data-fetching components (6 pages)
9. Add error boundaries (`error.tsx`) to key route segments
10. Fix pipeline concurrency race condition with DB constraint
11. Add null coalescing to all `parseInt()` on query results

### Phase 3: Medium (Next Sprint)
12. Standardize error response format across all API routes
13. Add input validation (geo bounds, pagination, cost ranges)
14. Replace global regex `.exec()` loops with `.matchAll()`
15. Use `Promise.allSettled()` for parallel optional queries
16. Add structured error logging with error type classification

### Phase 4: Low (Backlog)
17. Add rate limiting at middleware level
18. Add query timeouts in database client config
19. Add request audit logging
20. Add retry/backoff for transient network errors in scripts
