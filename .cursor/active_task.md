# Active Task: Test feed opaque 500 + PostGIS dev-env detection
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `5e519cc4` (5e519cc4b1b7425d3a9652f80c449b7da7881897)
**Domain Mode:** Backend (API route + server-side helper, no UI or schema)

## Context
* **Goal:** User reports `/api/admin/leads/test-feed` returns `{error:{code:"INTERNAL_ERROR",message:"Feed query failed"}}` in the dashboard's Test Feed tool. The message is opaque and the user can't tell why. Verified root cause via dev server log: **`type "geography" does not exist`** (pg code 42704) — `LEAD_FEED_SQL` in `get-lead-feed.ts` uses PostGIS `geography` casts, and PostGIS isn't installed in the local dev DB (`pg_available_extensions` has no `postgis` entry).
* **Target Specs:**
  * `docs/specs/product/admin/76_lead_feed_health_dashboard.md` §3.2 (test feed endpoint)
  * `docs/specs/00_engineering_standards.md` §2 (error handling), §10 (boundary)
* **Key Files:**
  * `src/app/api/admin/leads/test-feed/route.ts` — the handler with the canned 500
  * `src/features/leads/lib/get-lead-feed.ts:637` — the `pool.query(LEAD_FEED_SQL, params)` that throws
  * `src/lib/admin/lead-feed-health.ts` — already has `sanitizePgErrorMessage`; may add a PostGIS pre-flight helper here since it's the existing admin-health lib

## State Verification

**Confirmed via psql:**
- `pg_extension`: only `plpgsql`, `pg_trgm` installed. No `postgis`.
- `pg_available_extensions` WHERE name LIKE 'postgis%': zero rows — the OS-level package is NOT installed, so a plain `CREATE EXTENSION postgis` would fail too.
- `schema_migrations`: 039 + 067 + 077 + 078 all marked applied despite the extension being absent. Historical drift — either the DB was restored from a PostGIS-less dump, or the extension was uninstalled after migration time. Not Phase 3's concern to fix the historical state.

**Confirmed via curl:**
```
GET /api/admin/leads/test-feed?lat=43.6532&lng=-79.3832&trade_slug=plumbing&radius_km=10
→ 500 {"data":null,"error":{"code":"INTERNAL_ERROR","message":"Feed query failed"},"meta":null}
```

**Dev server log confirms the real error:**
```
[api/admin/leads/test-feed] error: type "geography" does not exist
    at getLeadFeed (get-lead-feed.ts:637) — pool.query(LEAD_FEED_SQL, params)
    pg code: 42704, position: 3306, routine: typenameType
```

## Why this is in scope for WF3 (not an env-setup doc change)

The user flagged this as a distinct class from the earlier "[object Object]" UI bug — they want it resolved by code. Two real code bugs land here:

1. **Opaque 500:** The route returns a canned `"Feed query failed"` message even in dev. This is the same class of bug we closed for `/api/admin/leads/health` in the first WF3 of this session — and we specifically said "opaque 500s in sibling admin routes" would be swept in a later WF6. Here it directly blocks dev diagnosis. Fix inline.
2. **No pre-flight detection of missing PostGIS:** Even with the real error surfaced, the user would see `type "geography" does not exist` with no guidance. A dev-env pre-flight check that returns a `503 DEV_ENV_MISSING_POSTGIS` with install instructions is much more actionable.

What this is NOT:
- Not an attempt to make the query work without PostGIS. The production code path requires PostGIS and that's correct. This WF3 improves the DEV experience, not the production code path.
- Not a migration. PostGIS installation is an OS-level concern handled by scoop/apt/brew, not migration 039.
- Not a refactor of `get-lead-feed.ts`. That file's SQL is production-correct.

## Technical Implementation

### Fix 1 — Dev-mode error transparency (same pattern as health route)
**File:** `src/app/api/admin/leads/test-feed/route.ts:72-78` (the catch block)

Current:
```ts
catch (err) {
  logError(TAG, err instanceof Error ? err : new Error(String(err)), { phase: 'handler' });
  return NextResponse.json(
    { data: null, error: { code: 'INTERNAL_ERROR', message: 'Feed query failed' }, meta: null },
    { status: 500 },
  );
}
```

New: surface `error.message` in non-production, sanitized via `sanitizePgErrorMessage` to strip any credential patterns. Keep `"Feed query failed"` in production. Follows the exact pattern landed in the health route catch block.

### Fix 2 — PostGIS pre-flight check (dev-env specific)
**File:** `src/lib/admin/lead-feed-health.ts` — add a new exported helper.

```ts
// Module-level cache: null = unchecked, true = present, false = missing
let postgisChecked: boolean | null = null;

export async function isPostgisAvailable(pool: Pool): Promise<boolean> {
  if (postgisChecked !== null) return postgisChecked;
  try {
    const res = await pool.query<{ installed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed`
    );
    postgisChecked = res.rows[0]?.installed ?? false;
  } catch {
    postgisChecked = false;
  }
  return postgisChecked;
}

export function __resetPostgisCacheForTests(): void {
  postgisChecked = null;
}
```

**Cache rationale:** cheap query but runs on every test-feed click. Cache is process-lifetime only — a user installing PostGIS mid-session would need a restart, which is acceptable for a dev tool.

### Fix 3 — Use the pre-flight in the test-feed route
**File:** `src/app/api/admin/leads/test-feed/route.ts`

At the top of the handler, after Zod validation, before the `getLeadFeed` call:

```ts
const postgisReady = await isPostgisAvailable(pool);
if (!postgisReady) {
  return NextResponse.json(
    {
      data: null,
      error: {
        code: 'DEV_ENV_MISSING_POSTGIS',
        message:
          'PostGIS extension is not installed in this database. The lead feed query requires PostGIS for geography-based distance filtering. Install with: `CREATE EXTENSION postgis;` (requires the postgis package at the OS level — e.g. scoop install postgis, apt install postgresql-postgis, or Cloud SQL has it by default).',
      },
      meta: null,
    },
    { status: 503 },
  );
}
```

Why **503** not 500: the service is unavailable due to a missing dependency, not because of a code bug. The distinction matters for dev because:
- `500` implies "your code broke" — debugger bait
- `503` with a descriptive code says "service not ready, and here's why"

### Fix 4 — Apply the same pattern to the health endpoint's OTHER query paths?
**Decision: out of scope.** The health endpoint doesn't use PostGIS — only `getLeadFeed` does. Spot-checked `getLeadFeedReadiness`, `getCostCoverage`, `getEngagement`: none reference PostGIS types or functions.

## Database Impact
**NO.** No schema changes. PostGIS installation is OS-level, handled outside migrations.

## Standards Compliance

* **Try-Catch Boundary:** Catch block refined to surface `sanitizePgErrorMessage(error.message)` in non-production. Still logs via `logError`. Pre-flight 503 is a happy-path early return, not in the catch.
* **Unhappy Path Tests:** 
  - Logic test: `isPostgisAvailable` with mock pool returning `{installed: true}`, `{installed: false}`, and rejection.
  - Infra test: file-shape grep for `isPostgisAvailable` import + call in test-feed route.
  - Logic test for the sanitized dev-mode error: same mock-pool rejection pattern used in the existing sanitizePgErrorMessage tests.
* **logError Mandate:** Already present. Retained with added phase context.
* **Mobile-First:** N/A — backend only. The dashboard UI already handles the error shape via `extractErrorMessage` helper (Phase 1 from earlier session), so the new `DEV_ENV_MISSING_POSTGIS` message will render cleanly in the red error box.

## Execution Plan

- [x] **Rollback Anchor:** `5e519cc4`
- [x] **State Verification:** psql + dev log confirmed root cause = `type "geography" does not exist`
- [ ] **Spec Review:** Read spec 76 §3.2 (test feed) to ensure 503 + DEV_ENV_MISSING_POSTGIS doesn't violate the documented response contract
- [ ] **Red Light tests:**
  - `isPostgisAvailable` — mock pool returns `{installed: false}` → helper returns false, returns true on `{installed: true}`, cache is sticky across calls
  - `__resetPostgisCacheForTests` — after reset, helper re-queries the pool
  - Route infra test (file-shape): test-feed route imports `isPostgisAvailable` and uses `sanitizePgErrorMessage` in the catch
- [ ] **Implementation:**
  - Add `isPostgisAvailable` + `__resetPostgisCacheForTests` to `lead-feed-health.ts`
  - Update test-feed route handler: pre-flight check + dev-mode sanitize pattern
- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`
- [ ] **Collateral Check:** `npx vitest related src/app/api/admin/leads/test-feed/route.ts src/lib/admin/lead-feed-health.ts --run`
- [ ] **Pre-Review Self-Checklist (5 sibling-bug items):**
  1. Does the pre-flight cache correctly handle the "PostGIS was just installed" case? (Answer: no — requires restart, documented)
  2. Does the sanitized error leak any credentials from `get-lead-feed.ts` errors? (The existing sanitizer handles postgres:// patterns; pg errors typically don't include the connection string but the regex catches them if they do)
  3. Does the 503 confuse monitoring / alerting in production? (Production has PostGIS, so this path NEVER fires in prod — the early return is a no-op)
  4. Is `isPostgisAvailable` cache shared across multiple requests safely? (JS single-threaded + module-level = safe)
  5. Does the helper need single-flight protection? (Query is one-shot, ~2ms, not worth the complexity)
- [ ] **Independent review agent (worktree isolation NOT used — changes uncommitted)**
- [ ] **Adversarial review agent (user explicitly requested both in prior WF3s; continuing the pattern)**
- [ ] **Triage review findings**
- [ ] **Full test suite + manual curl verification through the dashboard**
- [ ] **Atomic Commit:** `fix(76_lead_feed_health_dashboard): test-feed pre-flights PostGIS + surfaces dev-mode errors`
- [ ] **Update `review_followups.md`** with any deferred items

## Scope Discipline — EXPLICITLY OUT

- ❌ Rewriting `LEAD_FEED_SQL` to not need PostGIS — production code is correct
- ❌ New migration for PostGIS — it's OS-level, not DB-schema-level
- ❌ Sweeping opaque 500s across OTHER admin routes (deferred WF6)
- ❌ Installing PostGIS in the user's local env — I can't run OS package managers; the dev env setup is user-managed
- ❌ Changing the health endpoint — test-feed is the only route using PostGIS
