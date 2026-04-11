# Active Task: Leads page dev-mode auth bypass (3 bugs)
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `53dcb292` (docs(76_lead_feed_health_dashboard): defer PostGIS drift repair)
**Domain Mode:** Backend (middleware + server-side auth + Server Component page — no UI component changes)

## Context
User reports `http://localhost:3000/leads` redirects to `/login` in local dev with `NEXT_PUBLIC_DEV_MODE=true` and `DEV_MODE=true` set. Three compounding bugs break the dev-mode bypass end-to-end. The user's diagnosis (bugs #1 and #2) is correct, and I confirmed a latent bug #3 (empty `user_profiles` table) that would surface immediately after fixing the first two.

## Target Specs
- `docs/specs/13_auth.md` (if present — the middleware file references it in its SPEC LINK header)
- `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 5 (leads page auth flow)
- `docs/specs/00_engineering_standards.md` §4 (auth boundary), §10 (boundary)

## Key Files (read + confirmed)
- `src/middleware.ts:29-53` — the edge middleware with the dev-mode cookie injection
- `src/lib/auth/route-guard.ts:25-30` — `isDevMode()` + `DEV_SESSION_COOKIE = 'dev.buildo.local'`
- `src/lib/auth/get-user.ts:33-74` — `verifyIdTokenCookie` + `getUserIdFromSession` (Node runtime, calls Firebase Admin)
- `src/lib/auth/get-user-context.ts:30-72` — `getCurrentUserContext` (used by `/api/leads/feed`)
- `src/app/leads/page.tsx:34-74` — Server Component that reads the cookie via `next/headers` and looks up the profile
- `src/app/login/page.tsx:12-18` — "Continue as Dev" button (client-only, just calls `router.push(redirect)`)
- `src/app/onboarding/page.tsx` — client-only mockup that DOES NOT persist to `user_profiles`

## The Three Bugs

### Bug #1 — Middleware attaches dev cookie to RESPONSE, not REQUEST

**Location:** `src/middleware.ts:41-50`

**Current code:**
```ts
if (isDevMode()) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE, { ... });
    return response;
  }
  ...
}
```

**The bug:** `response.cookies.set(...)` tells the BROWSER to store this cookie for subsequent requests. The CURRENT request's downstream Server Components read cookies from the `NextRequest`, not the outgoing response. Since nothing mutated the incoming `NextRequest.cookies`, `cookies().get('__session')` in `/leads/page.tsx` returns `undefined` on the first navigation. Redirect to login fires.

**Fix:** Mutate the incoming request's cookies BEFORE calling `NextResponse.next()`, and forward the modified headers so Server Components see the cookie. Also set the cookie on the response so the browser persists it.

```ts
if (isDevMode()) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    // Mutate incoming request so downstream Server Components see the cookie
    request.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE);
    // Forward the modified request headers to the next handler
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    // Also set on the outgoing response so the browser persists it
    response.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    return response;
  }
  return NextResponse.next();
}
```

This is the canonical Next.js 15 pattern for in-middleware cookie injection visible to Server Components.

### Bug #2 — Verifier calls Firebase on the fake local cookie

**Location:** `src/lib/auth/get-user.ts:33-70` (`verifyIdTokenCookie`)

**Current flow when `cookie === 'dev.buildo.local'`:**
1. Shape check passes (3 segments) ✓
2. `admin.auth().verifyIdToken('dev.buildo.local')` calls Firebase Admin ✗
3. Firebase rejects the fake cookie
4. Catch block returns `null`
5. Caller redirects to `/login`

**The bug:** The verifier has no dev-mode branch. Even with `DEV_MODE=true` set, it tries to verify the fake local cookie against Google's real endpoints.

**Fix:** Add a short-circuit at the top of `verifyIdTokenCookie`:

```ts
import { isDevMode, DEV_SESSION_COOKIE } from './route-guard';

export async function verifyIdTokenCookie(
  cookie: string | undefined,
): Promise<string | null> {
  if (!cookie) return null;
  if (cookie.split('.').length !== 3) return null;

  // Dev-mode bypass: the middleware injects DEV_SESSION_COOKIE when
  // DEV_MODE=true. Skip Firebase verification entirely and return a
  // stable dev uid. NEVER enabled in production because isDevMode()
  // reads the server-only DEV_MODE env var.
  if (isDevMode() && cookie === DEV_SESSION_COOKIE) {
    return 'dev-user';
  }

  try {
    const admin = await import('firebase-admin');
    ...
  }
}
```

**Why `'dev-user'`:** stable, predictable uid that the dev profile seed (Bug #3 fix) targets. Not a real Firebase uid format (28 chars base64url), so it can never collide with a real user.

### Bug #3 — `user_profiles` is empty; leads page redirects to /onboarding

**Location:** `src/app/leads/page.tsx:69-71`

**Current flow after fixing #1 and #2:**
1. Middleware injects cookie → Server Component reads it ✓
2. Verifier returns `'dev-user'` ✓
3. `SELECT trade_slug FROM user_profiles WHERE user_id = 'dev-user'` → 0 rows (confirmed empty via psql)
4. `tradeSlug` is null → redirect to `/onboarding`
5. Onboarding page is a client-only mockup that doesn't persist → dead-end

**Fix:** Auto-seed a default `dev-user` profile in the leads page when dev mode is active and no row exists. Localized so the side effect is scoped.

```ts
import { isDevMode } from '@/lib/auth/route-guard';

if (!tradeSlug) {
  if (isDevMode() && uid === 'dev-user') {
    // Dev-mode convenience seed: /leads is usable out of the box
    // without completing the onboarding wizard (client-only mockup).
    // Idempotent via ON CONFLICT DO NOTHING. Gated on both
    // isDevMode() AND uid === 'dev-user' so the production path is
    // unreachable.
    await pool.query(
      `INSERT INTO user_profiles (user_id, trade_slug, display_name)
       VALUES ('dev-user', 'plumbing', 'Dev User')
       ON CONFLICT (user_id) DO NOTHING`,
    );
    tradeSlug = 'plumbing';
  } else {
    redirect('/onboarding');
  }
}
```

Idempotent + dev-gated + safe in production.

## Technical Implementation Summary

* **Modified Files:**
  - `src/middleware.ts` — dev-mode branch mutates `request.cookies` + `NextResponse.next({ request })`
  - `src/lib/auth/get-user.ts` — imports `isDevMode` + `DEV_SESSION_COOKIE`, adds bypass early return
  - `src/app/leads/page.tsx` — imports `isDevMode`, auto-seeds when tradeSlug missing in dev
  - `src/tests/middleware.logic.test.ts` — new test(s) asserting request.cookies visibility after middleware
  - `src/tests/auth-get-user.logic.test.ts` — new test for dev bypass branch (and prod-mode regression guard)
* **Database Impact:** NO schema change. One `INSERT ... ON CONFLICT DO NOTHING` runs only in dev when the profile is missing.

## Standards Compliance

* **Try-Catch Boundary:** Unchanged. Dev bypass returns before the existing try block. Page-level seed runs without try/catch — any DB error propagates through `src/app/leads/error.tsx`.
* **Unhappy Path Tests:**
  - Middleware: dev-mode + no incoming cookie → `request.cookies.get(SESSION_COOKIE_NAME)` returns the dev cookie AFTER middleware runs
  - verifyIdTokenCookie: `cookie === DEV_SESSION_COOKIE` in dev → returns `'dev-user'` without importing firebase-admin
  - verifyIdTokenCookie: `cookie === DEV_SESSION_COOKIE` in PROD mode → still calls Firebase Admin (security regression guard)
  - verifyIdTokenCookie: `cookie === 'some.other.token'` in dev → still calls Firebase Admin (bypass scoped to exact DEV_SESSION_COOKIE value)
  - Leads page: file-shape test asserting dev-seed branch present with `isDevMode()` gate
* **logError Mandate:** Unchanged — no new API routes or catch blocks.
* **Mobile-First:** N/A — server-side only.
* **Fail-Closed Security §4:** Dev bypass ONLY active when `DEV_MODE=true` (server-only env var, never `NEXT_PUBLIC_*`). Route-guard.ts:15-23 documents the server-only design for exactly this class of risk. A prod build without `DEV_MODE` set takes the normal Firebase path. Verified by the prod-mode regression test.

## Execution Plan

- [x] **Rollback Anchor:** `53dcb292`
- [x] **State Verification:** confirmed all 3 bugs via file reads + psql query
- [ ] **Spec Review:** read spec 13 / spec 75 §11 Phase 5 if they exist
- [ ] **Red Light tests** (middleware + verifyIdTokenCookie + leads page file-shape)
- [ ] **Red Light run** — all new tests fail
- [ ] **Fix 1 — middleware.ts**
- [ ] **Fix 2 — get-user.ts**
- [ ] **Fix 3 — leads/page.tsx**
- [ ] **Green Light:** typecheck + lint + full test suite
- [ ] **Collateral Check:** vitest related on the 3 modified files + route-guard
- [ ] **Pre-Review Self-Checklist (5 sibling-bug items):**
  1. Does the middleware fix break the non-dev path? (Non-dev branch unchanged — passes through or redirects to login as before.)
  2. Does `verifyIdTokenCookie` dev bypass fire in production? (No — `isDevMode()` reads server-only `DEV_MODE`. Regression test locks this.)
  3. Does the dev-user seed match `user_profiles` schema? (Yes — `user_id varchar(128)`, `trade_slug varchar(50)`, `display_name varchar(200)` verified via psql `\d user_profiles`.)
  4. Does the seed leak a dev-user row into production? (No — gated on `isDevMode() && uid === 'dev-user'`; both false in prod.)
  5. Does "Continue as Dev" login button still work? (Yes — it just `router.push(redirect)`; the redirect now succeeds because middleware correctly injects the visible cookie.)
- [ ] **Live verification:** navigate to `http://localhost:3000/leads`, confirm page renders (not redirect)
- [ ] **Independent review agent**
- [ ] **Adversarial review agent** — attack vectors: fail-closed bypass, cookie ordering, prod regression, data contamination
- [ ] **Triage + apply fixes**
- [ ] **Full test suite re-run**
- [ ] **Atomic Commit:** `fix(13_auth): dev-mode leads page end-to-end — middleware + verifier + profile seed`
- [ ] **Update `review_followups.md`** with any deferred items

## Scope Discipline — EXPLICITLY OUT

- ❌ Making the onboarding flow actually persist to user_profiles (separate concern, different WF)
- ❌ Firebase service account setup for dev (orthogonal — the whole point of dev mode is to avoid this)
- ❌ Seeding multiple dev users (one is enough for the reported bug)
- ❌ Restructuring route-guard or `DEV_SESSION_COOKIE` (existing design is sound; it just wasn't wired end-to-end)
- ❌ PostGIS drift repair (deferred per `53dcb292`)
- ❌ Opaque-500 sweep on other admin routes (separate WF6)

## Why This Is One WF3, Not Three

All 3 bugs are on the same code path and must be fixed together to make the reported symptom go away. Fixing only #1 leaves the page redirecting (verifier rejects fake cookie). Fixing #1+#2 leaves it redirecting to the onboarding dead-end. The user's reported goal — "localhost:3000/leads doesn't work" — is only resolved when all three land. Bundling also lets the review cycle audit the dev-mode auth path as a coherent whole.
