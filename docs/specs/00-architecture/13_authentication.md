# Spec 13 -- Authentication

<requirements>

## 1. Goal & User Story
Users sign up and log in with Google OAuth or email/password so they can save preferences, track leads, and access role-appropriate features across the app.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Login and signup pages only (`/login`, `/signup`, `/api/auth/*`) |
| Authenticated | Full app access (dashboard, permits, map, search, onboarding) |
| Admin | Full app access + admin panel and admin API routes |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** Firebase Authentication (Google OAuth 2.0 and email/password providers); `__session` cookie on subsequent requests; `X-Admin-Key` header for script/CI access to admin APIs
- **Core Logic:**
  - Firebase client SDK handles sign-up, sign-in, Google popup, and sign-out. See `src/lib/auth/session.ts`
  - Token flow (planned): Firebase issues JWT on auth; client POSTs to `/api/auth/session` which verifies via Firebase Admin SDK and sets `httpOnly` secure cookie (`__session`, 14-day expiry). Background refresh via `onIdTokenChanged` listener
  - Route protection via middleware: `src/middleware.ts` uses `src/lib/auth/route-guard.ts` to classify routes as public, authenticated, or admin. Middleware validates cookie presence (3-segment JWT shape check) at the edge runtime. Full JWT verification via Firebase Admin SDK `verifyIdToken()` runs in route handlers' Node runtime via `getUserIdFromSession` → `verifyIdTokenCookie` (`src/lib/auth/get-user.ts`). The Admin SDK is initialized at backend boot from `src/lib/firebase-admin.ts` (called by `src/instrumentation.ts` `register()` hook). Init source resolution priority: (1) `FIREBASE_SERVICE_ACCOUNT_KEY` env var with raw JSON for production; (2) `FIREBASE_ADMIN_KEY_PATH` env var with filesystem path for dev override; (3) default `./secrets/firebase-admin-sdk.json`; (4) none in dev → null + logWarn (DEV_MODE bypass below still works); (5) none in production → throw + logError.
  - Admin API routes require either `__session` cookie or `X-Admin-Key` header
  - Dev mode: `DEV_MODE=true` (server-only, NOT `NEXT_PUBLIC_*` — prevents a misconfigured production build from bypassing auth for all users) enables local-only auth bypass. Middleware mutates the incoming request cookies with `dev.buildo.local` so the current-request Server Components see it, AND sets it on the outgoing response so the browser persists it. `verifyIdTokenCookie` short-circuits for this exact cookie value in dev mode and returns the stable uid `'dev-user'` without calling Firebase Admin. `src/app/leads/page.tsx` and `getCurrentUserContext` both auto-seed a default `dev-user` row in `user_profiles` on each visit when missing (idempotent via `ON CONFLICT (user_id) DO NOTHING`). Login page still reads `NEXT_PUBLIC_DEV_MODE` to show the cosmetic "Continue as Dev" button, but the security-critical middleware + verifier checks read the server-only `DEV_MODE`. Regression tests in `middleware.logic.test.ts` and `auth-get-user.logic.test.ts` lock each step of the bypass in place.
  - Account types stored in Firestore `/users/{uid}`: tradesperson, company, or supplier. See `src/lib/auth/types.ts`
  - State machine: UNAUTHENTICATED -> AUTHENTICATING -> AUTHENTICATED -> ONBOARDING -> ACTIVE; AUTHENTICATED -> LOGGING_OUT -> UNAUTHENTICATED
- **Outputs:** Authenticated session with `__session` cookie; user profile in Firestore; route-level access control via middleware
- **Edge Cases:**
  - Email/Google account collision: Firebase links accounts automatically if email verified; handle `auth/account-exists-with-different-credential`
  - Cookie expired but Firebase token valid: middleware rejects, client listener should have refreshed, fallback redirects to login
  - Concurrent tabs share same cookie; token refresh in one tab updates for all
  - Static assets excluded from middleware matcher (`/_next/*`, `/favicon.ico`, `/public/*`)

</behavior>

---

<failure_modes>

## 4a. Known Failure Modes

- **Firebase Admin SDK not initialized → silent 401 on all authenticated API routes.** Before WF2 [pending commit], `verifyIdTokenCookie` would lazy-import `firebase-admin`, see `admin.apps.length === 0`, log a warning, and return null — every Bearer-token verification would fail closed and return 401. Mobile clients hitting `/api/user-profile` would receive 401, the AuthGate would route to sign-in, and onboarding would never be reached. Guard: `src/lib/firebase-admin.ts` initialized in `src/instrumentation.ts` at backend boot; production throws if no credentials are found, dev logs a warning and continues (DEV_MODE cookie bypass remains available); regression test `src/tests/firebase-admin.logic.test.ts` covers all 5 init-resolution paths plus idempotency.

</failure_modes>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`auth.logic.test.ts, middleware.logic.test.ts`): Auth Types; Route Classification; Route Guard Constants; Session Cookie Validation; Dev Mode; Security Files
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/auth/config.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/types.ts`
- `src/lib/auth/route-guard.ts`
- `src/lib/auth/get-user.ts`
- `src/lib/firebase-admin.ts`
- `src/instrumentation.ts`
- `src/app/login/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/middleware.ts`
- `src/tests/auth.logic.test.ts`
- `src/tests/auth-get-user.logic.test.ts`
- `src/tests/firebase-admin.logic.test.ts`
- `src/tests/middleware.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Foundation for all authenticated features. All specs requiring auth import from `src/lib/auth/` (read-only).
- Consumed by **Spec 14 (Onboarding)**: Onboarding reads user profile after auth.
- Consumed by **Spec 26 (Admin)**: Admin routes use route-guard for access control.

</constraints>
