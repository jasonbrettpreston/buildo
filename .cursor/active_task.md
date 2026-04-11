# Active Task: User feed PostGIS pre-flight + dev profile trade switcher
**Status:** Planning
**Workflow:** WF3 — Bug Fix (+ small dev UX add-on)
**Rollback Anchor:** `61b68bcf` (fix(13_authentication): dev-mode /leads end-to-end)
**Domain Mode:** Backend (API route + Server Component — no UI component changes)

## Context
User reports `http://localhost:3000/leads` now loads (per the prior WF3) but the `LeadFeed` component shows: *"Can't reach the server — Your connection looks fine, but we couldn't load leads."* Confirmed via dev server log: `/api/leads/feed` throws **`type "geography" does not exist`** at `getLeadFeed` (same PostGIS root cause as the admin test-feed endpoint fixed in commit `390a945`). The independent review of that earlier WF3 explicitly flagged at Gap #13 that the user-facing feed route had the same latent problem and deserved the same pre-flight treatment; I deferred it as LOW. It's now actively blocking the dev user's workflow, so it's in scope.

User also asks: "how do we change profiles?" — the prior WF3 hardcoded the dev-user `trade_slug = 'plumbing'` in both the page and `getCurrentUserContext` seed. The user needs a way to test other trade slugs without manual psql UPDATEs.

## Target Specs
- `docs/specs/product/future/70_lead_feed.md` §API Endpoints (status code matrix, error envelope shape)
- `docs/specs/product/admin/76_lead_feed_health_dashboard.md` §3.2 (the pattern this fix mirrors)
- `docs/specs/00_engineering_standards.md` §2 (error handling), §4 (auth boundary), §10 (boundary)

## Key Files (read + confirmed)
- `src/app/api/leads/feed/route.ts:35-119` — the GET handler with the current try/catch that routes all errors through `internalError()` (opaque 500)
- `src/features/leads/lib/get-lead-feed.ts:637` — `pool.query(LEAD_FEED_SQL, params)` — the throw site, confirmed via dev log
- `src/lib/admin/lead-feed-health.ts` — already exports `isPostgisAvailable(pool)` + `sanitizePgErrorMessage()` from the earlier WF3
- `src/features/leads/api/error-mapping.ts` — existing error helpers; 503 is in `ErrorStatus` union
- `src/features/leads/api/envelope.ts:34` — `ErrorStatus` includes 503
- `src/app/leads/page.tsx` — the Server Component with the dev-user seed (needs the `?trade_slug=X` switcher)
- `src/lib/auth/get-user-context.ts` — the API-side dev seed (keeps seeding `'plumbing'` — must respect the updated profile)
- `src/lib/classification/trades.ts` — the canonical 32-slug list for validation
- `psql SELECT slug FROM trades` — confirmed 32 active slugs, matches CLAUDE.md documentation

## Confirmed root cause

```
[lead-feed/get] error: type "geography" does not exist
    at async getLeadFeed (src/features/leads/lib/get-lead-feed.ts:637:17)
    at async GET (src/app/api/leads/feed/route.ts:84:20)
pg code 42704 (undefined_object), position 3306 of LEAD_FEED_SQL
```

Same `::geography` cast issue as the admin test-feed endpoint. Production Cloud SQL has PostGIS; local dev doesn't (deferred per commit `53dcb292`).

## The two fixes

### Fix 1 — PostGIS pre-flight on `/api/leads/feed` (API hardening)

**File:** `src/app/api/leads/feed/route.ts`

Mirror the exact pattern already shipped for the admin test-feed:

1. After `getCurrentUserContext` succeeds and Zod validates, call `isPostgisAvailable(pool)` BEFORE `getLeadFeed`
2. If false → return `err('DEV_ENV_MISSING_POSTGIS', '<install message>', 503)` using the existing envelope helper
3. Update the catch block to surface `sanitizePgErrorMessage(error.message)` in non-production via a new tiny helper in `error-mapping.ts` (or inline in the route)

**503 message** matches the admin test-feed message:
```
"PostGIS extension is not installed in this database. The lead feed query requires PostGIS for geography-based radius filtering. Install the postgis package at the OS level (e.g. scoop install postgresql-postgis on Windows, apt install postgresql-16-postgis-3 on Linux, brew install postgis on Mac) and then run `CREATE EXTENSION postgis;` against the buildo database. Cloud SQL has PostGIS by default."
```

**Ordering:** The pre-flight MUST fire AFTER Zod validation (so garbage params still return 400 first and don't leak the dev-env message to bots fuzzing the endpoint), BEFORE rate limiting (so the pre-flight doesn't count against the user's limit), and BEFORE `getLeadFeed`. Concretely: between steps 4 and 5 in the existing handler flow.

Wait — actually, re-reading the existing handler: steps are `ctx → Zod → trade_slug authz → rate limit → cursor → getLeadFeed`. The pre-flight should fire AFTER `ctx` (so an unauthenticated request still returns 401) and AFTER Zod (so garbage returns 400), but BEFORE rate limit (so the pre-flight doesn't exhaust the user's rate limit window in dev). Place it right after step 2 (Zod).

### Fix 2 — Dev profile trade_slug switcher (query param)

**File:** `src/app/leads/page.tsx`

Accept `?trade_slug=<slug>` as a searchParam. When present AND `isDevMode() && uid === 'dev-user'`:
1. Validate the slug against the canonical 32-slug allowlist from `TRADES` (imported from `src/lib/classification/trades.ts`) — rejects typos/XSS attempts at the server boundary
2. UPSERT the dev profile with the new slug via `INSERT ... ON CONFLICT (user_id) DO UPDATE SET trade_slug = EXCLUDED.trade_slug`
3. Use the new slug as `tradeSlug` for the render

Example usage once deployed:
- `/leads?trade_slug=electrical` → updates dev profile to electrical, renders feed
- `/leads?trade_slug=invalid` → rejected, falls through to the existing dev seed (plumbing) as the safe default
- `/leads` (no param) → existing behavior

Non-dev users are unaffected because the `isDevMode() && uid === 'dev-user'` gate excludes them. Production path is untouched.

### Signature update

The existing Server Component is declared as `export default async function LeadsPage()` — no props. For searchParams access in Next.js 15 App Router, the signature becomes `export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> })`. Next.js 15 changed searchParams to async/await.

### What this does NOT do

- ❌ Make `/api/leads/feed` return actual lead data (that requires PostGIS install, deferred per `53dcb292`)
- ❌ Thread the structured 503 message through to `EmptyLeadState` UI — the client will still show "Can't reach the server" text even though the API response now carries the install instructions. Surfacing the structured error in the UI requires touching `useLeadFeed`, `LeadFeed`, `EmptyLeadState` — too many files for this WF3. Deferred as LOW. The dev user can see the real message by curling the endpoint directly, same as the admin test-feed user.
- ❌ Add a UI picker for trade_slug — the query param approach is the minimum viable dev tool. A UI picker is scope creep for something only dev-users need.
- ❌ Migrate off the placeholder `display_name = 'Dev User'` — cosmetic, irrelevant to the reported problem
- ❌ PostGIS install (still deferred per `53dcb292`)

## Technical Implementation

* **Modified Files:**
  - `src/app/api/leads/feed/route.ts` — pre-flight + sanitized catch
  - `src/app/leads/page.tsx` — searchParams prop + trade_slug switcher UPSERT
  - `src/features/leads/api/error-mapping.ts` — new helper `devEnvMissingPostgis()` that wraps `err('DEV_ENV_MISSING_POSTGIS', ..., 503)` for reuse + tidy route code
  - `src/tests/api-leads-feed.infra.test.ts` — new file-shape tests asserting pre-flight + 503 + ordering
  - `src/tests/middleware.logic.test.ts` — extend Leads Page dev seed block with query-param switcher assertions (same file-shape pattern used earlier)
* **Database Impact:** NO schema change. UPSERTs use existing `user_profiles` columns.

## Standards Compliance

* **Try-Catch Boundary:** Existing `internalError()` catch in `feed/route.ts` becomes dev-aware — surfaces `sanitizePgErrorMessage(cause.message)` in non-production, canned 500 message in production. Matches the pattern already shipped for `/api/admin/leads/health` and `/api/admin/leads/test-feed`.
* **Unhappy Path Tests:**
  - `isPostgisAvailable` returns false → route returns 503 with `DEV_ENV_MISSING_POSTGIS` (file-shape)
  - Pre-flight ordering: `isPostgisAvailable(pool)` appears BEFORE `getLeadFeed(` in source (file-shape positional)
  - Leads page with `?trade_slug=electrical` in dev mode → UPSERTs new slug (file-shape grep)
  - Leads page with `?trade_slug=not_a_real_slug` in dev mode → rejected, falls back to 'plumbing' (file-shape: presence of allowlist check)
* **logError Mandate:** Existing `internalError()` helper already calls `logError` internally. The pre-flight 503 is a happy-path early return that does NOT go through the catch, so no logError call needed (matches admin pattern).
* **Mobile-First:** N/A — backend only, no UI changes.
* **Auth Boundary §4:** Trade slug switcher gated on `isDevMode() && uid === 'dev-user'` — both false in prod, path unreachable. Same defense-in-depth as the existing dev seed. Regression tests will lock this.

## Execution Plan

- [x] **Rollback Anchor:** `61b68bcf`
- [x] **State Verification:** confirmed via dev log + psql trades count
- [ ] **Spec Review:** read spec 70 §API Endpoints for 503 semantics (is 503 in the documented matrix or is this an extension?)
- [ ] **Red Light tests:**
  - `api-leads-feed.infra.test.ts`: file-shape asserts `isPostgisAvailable` imported + called + 503 + position-before-`getLeadFeed`
  - `middleware.logic.test.ts` (Leads page describe): file-shape asserts `searchParams` prop + allowlist validation + UPSERT DO UPDATE
  - `error-mapping` file-shape: new `devEnvMissingPostgis` helper exported
- [ ] **Red Light run:** all new tests fail
- [ ] **Fix 1 — error-mapping:** add `devEnvMissingPostgis()` helper
- [ ] **Fix 2 — feed route:** import + call pre-flight + sanitized catch
- [ ] **Fix 3 — leads page:** searchParams prop + allowlist validation + UPSERT DO UPDATE
- [ ] **Green Light:** typecheck + lint + full test suite
- [ ] **Collateral Check:** `npx vitest related src/app/api/leads/feed/route.ts src/app/leads/page.tsx src/features/leads/api/error-mapping.ts --run`
- [ ] **Pre-Review Self-Checklist (5 items):**
  1. Does the pre-flight fire for production users too? (Yes, but in prod `isPostgisAvailable` returns `true` on the first call and caches forever — net cost ~1ms on the first request of the process lifetime.)
  2. Can the dev slug switcher be abused by a non-dev user? (No — gated on `isDevMode() && uid === 'dev-user'`. Prod users are `isDevMode()=false` so the branch never fires.)
  3. Is the allowlist validation complete? (32 slugs from TRADES, matching the canonical CLAUDE.md list. A real-but-obscure slug like `stone-countertops` works; typos fail closed.)
  4. Does the UPSERT race with `getCurrentUserContext`'s dev seed? (No — both UPSERTs use `ON CONFLICT (user_id)` on the same row; one wins, both converge to the same `trade_slug` eventually. The leads page's UPDATE happens inside the Server Component render, so by the time the client issues the first feed API call, the row is settled.)
  5. Is `searchParams` the right Next.js 15 prop shape? (Yes — `Promise<Record<string, string | string[] | undefined>>` per Next.js 15 breaking change. Must `await` before reading.)
- [ ] **Live verification:** curl `/api/leads/feed` → 503 with structured message; curl `/leads?trade_slug=electrical` → 200, then psql confirms `dev-user.trade_slug = 'electrical'`
- [ ] **Independent review agent**
- [ ] **Adversarial review agent** — attack vectors: query-param injection, allowlist bypass, prod regression, trade-authz conflict (`/api/leads/feed` has a separate trade authz that compares requested slug to profile slug)
- [ ] **Triage + apply fixes**
- [ ] **Full test suite re-run**
- [ ] **Atomic Commit:** `fix(70_lead_feed): feed route PostGIS pre-flight + dev profile trade switcher`

## Scope Discipline — EXPLICITLY OUT

- ❌ Installing PostGIS locally (deferred per `53dcb29`)
- ❌ Threading structured 503 message through `LeadFeed` → `EmptyLeadState` UI (scope creep; deferred)
- ❌ UI picker for trade_slug (query param is sufficient for dev)
- ❌ Backfill the 237K `permits.location` column (that's the full drift repair, deferred)
- ❌ Rewriting `LEAD_FEED_SQL` to use haversine math without PostGIS (changes production code for dev convenience; architecturally wrong)

## Why One WF3

Both fixes are on the same `/leads` flow. The user reported the bug AND asked about profile switching in the same message. Bundling:
1. Avoids two review cycles for a tightly related dev UX surface
2. The reviews can audit the full dev-mode /leads path coherently
3. Single commit captures the user's complete ask
