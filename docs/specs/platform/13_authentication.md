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
  - Route protection via middleware: `src/middleware.ts` uses `src/lib/auth/route-guard.ts` to classify routes as public, authenticated, or admin. Currently validates cookie presence (3-segment JWT shape check); full JWT verification via Firebase Admin SDK `verifyIdToken()` is planned but not yet wired
  - Admin API routes require either `__session` cookie or `X-Admin-Key` header
  - Dev mode: `NEXT_PUBLIC_DEV_MODE=true` bypasses all auth checks locally. Middleware auto-injects a dev session cookie (`dev.buildo.local`). Login page shows "Continue as Dev" button. Checked via `isDevMode()` in `route-guard.ts` -- only activates when env var is exactly `"true"`
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
- `src/app/login/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/middleware.ts`
- `src/tests/auth.logic.test.ts`
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
