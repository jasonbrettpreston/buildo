# Spec 13 -- Authentication

<requirements>

## 1. Goal & User Story
Users sign up and log in with Google OAuth or email/password so they can save preferences, track leads, and access role-appropriate features across the app. Auth is provided by **Supabase Auth (GoTrue)**, replacing Firebase Authentication (Decision D7, `.cursor/active_task.md` v2.1, 2026-07-18 program plan). This spec is application-level: it governs how Buildo verifies a Supabase session and gates routes on top of it. The platform/connection layer (project topology, key contract, TLS) is Spec 113's domain — see `docs/specs/00-architecture/113_supabase_infrastructure.md` §3, referenced not restated below.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Login and signup pages only (`/login`, `/signup`, `/api/auth/*`) |
| Authenticated | Full app access (dashboard, permits, map, search, onboarding) |
| Admin | Full app access + admin panel and admin API routes (`profiles.is_admin = true`, TOTP MFA required) |

</security>

---

<architecture>

## 3. Technical Architecture — GoTrue & Key Verification

### 3.1 GoTrue architecture

Supabase Auth is **GoTrue**: a standalone auth server co-located with the Postgres project, issuing and verifying JWTs against `auth.users`. Buildo's project is provisioned with **asymmetric JWT signing keys from day one** (Decision D7) — GoTrue signs tokens with an ES256/RS256 private key and publishes the corresponding public key(s) at a **JWKS endpoint** (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`). This is a deliberate choice over the legacy shared-HS256-secret model: asymmetric keys let a server verify a token **locally**, without a network round-trip to GoTrue and without ever holding a secret capable of *signing* tokens — the server only ever holds public verification material.

`supabase-js`'s server client fetches and caches the JWKS internally; callers never touch it directly. See Spec 113 §3 for which key (`sb_publishable_*` vs `sb_secret_*`) each environment reads and where those variables live — that contract is not restated here.

### 3.2 Server verification model — `getClaims()` vs `getUser()`

Supabase's server SDK exposes two verification calls with different cost/freshness tradeoffs, and Decision D7 sets a **concrete, non-negotiable criterion** for which one a route uses:

| Call | Mechanism | Cost | Freshness | Use when |
|---|---|---|---|---|
| `supabase.auth.getClaims()` | Verifies the JWT signature locally against the cached JWKS public key | No network round-trip; fast | Reflects the token's claims **as of issuance** — a revoked/banned user's still-live token verifies successfully until it expires | **Read paths.** The default. Any route whose failure mode is "an already-authenticated user reads slightly-stale data" |
| `supabase.auth.getUser()` | Verifies the JWT **and** round-trips to GoTrue to re-check the user's current state (banned, deleted, session revoked) | One network call per verification | Live — reflects revocation immediately | **Money movement, account mutation, admin writes.** Any route whose failure mode is "a just-revoked user completes a state-changing action before the revocation takes effect" |

**Concrete criteria (D7, binding — apply this test to every route, don't eyeball it):**
- Does the route move money (subscription/billing mutation, Stripe-adjacent) → `getUser()`.
- Does the route mutate the account itself (profile PII, password/email change, RTBF scrub, admin-status change) → `getUser()`.
- Is the route an **admin write** (any state-mutating `/api/admin/**` route) → `getUser()`.
- Everything else — reads, including admin reads — → `getClaims()`.

This mirrors the previous Firebase-era asymmetry (`get-user.ts`'s WF3 2026-05-04 hardening required `checkRevoked: true` specifically for revocation-sensitive paths) with a cleaner mechanism: instead of one call with a revocation flag, there are two calls and the route picks the one matching its blast radius.

### 3.3 Chokepoint files — new responsibilities

Auth remains a chokepoint (G2, `.cursor/active_task.md`): 7 shared files + 1 UI file. ~32/59 API routes consume the shared helpers; swapping the provider changes these files and leaves consuming routes' error-handling contract unchanged.

| File | Old (Firebase) | New (Supabase) |
|---|---|---|
| `src/lib/firebase-admin.ts` | Admin SDK init from a service-account file/env JSON, called from `instrumentation.ts` boot | **DELETED.** No service-account file, no boot-time SDK init — `getClaims()`/`getUser()` verify against the JWKS/GoTrue directly through the request-scoped Supabase server client |
| `src/lib/auth/session.ts` | Client SDK sign-up/sign-in/sign-out orchestration, writes Firestore `/users/{uid}` | **DELETED.** Firestore profile duplication is dead weight (already duplicated by Postgres `user_profiles`, G2); `LoginForm.tsx` calls `supabase-js` directly |
| `src/lib/auth/get-user.ts` | `admin.auth().verifyIdToken(cookie, true)` | Calls `supabase.auth.getClaims()` (default) or `getUser()` (per §3.2 criteria) against the bearer token or `__session` cookie. **Kept verbatim: the 8KB length guard (`MAX_TOKEN_BYTES`), the 3-segment shape check, Bearer-vs-cookie precedence order, and the timing-safe dev-bypass comparison** — all transport-agnostic, all load-bearing (§4a) |
| `src/lib/auth/verify-admin.ts` | `ADMIN_USER_IDS` env-var allowlist checked against a Firebase uid | `profiles.is_admin` boolean checked against the Supabase `auth.uid()` (uuid). `X-Admin-Key` CI bypass **re-evaluated**, not ported as-is — see §3.6 |
| `src/lib/auth/get-user-context.ts` | `user_profiles.user_id` keyed on a Firebase uid string | `user_profiles.user_id` keyed on a Supabase `auth.uid()` — see §3.4 for why the API-boundary type is unaffected |
| `src/lib/auth/config.ts` | `firebase/app` + `firebase/auth` + `firebase/firestore` client init, reads 6 `NEXT_PUBLIC_FIREBASE_*` vars | **Supabase client factory** — a thin wrapper around `createBrowserClient`/`createServerClient` (`@supabase/ssr`); Firestore init deleted outright, no port (Spec 113 §3.1) |
| `src/middleware.ts` | Edge-runtime cookie shape pre-check only (Firebase Admin can't run at the edge) | Edge-runtime shape pre-check **plus** `@supabase/ssr`'s `getAll`/`setAll` cookie interface for session refresh — see §3.5 |
| `src/instrumentation.ts` | `register()` hook calls `getFirebaseAdmin()` to boot the Admin SDK in the nodejs runtime | Boot call **removed** — nothing to initialize; GoTrue verification is per-request via the server client factory, not a singleton SDK instance |
| `src/lib/auth/route-guard.ts` | Transport-agnostic 3-segment JWT shape check, `PUBLIC_PATHS`/`PUBLIC_PREFIXES`/`AUTHENTICATED_API_ROUTES` classification, dev-mode flag, Bearer extraction | **UNCHANGED, verbatim.** Ground-truth-confirmed (G2 panel review): zero Firebase-specific logic. A Supabase JWT is still a 3-segment base64 JWT — `isValidSessionCookie`'s shape check and `classifyRoute`'s route table need no edit |
| `src/components/auth/LoginForm.tsx` | Firebase client SDK popup/redirect flow via `session.ts` | `supabase-js` `signInWithPassword`/`signUp`/`signInWithOAuth('google')` called directly (no intermediary session module) |

### 3.4 `uid` type — `auth.uid()` uuid, API boundary unchanged

Supabase's `auth.uid()` returns a **uuid**, not the Firebase uid string format. Internally, the 10 tables carrying a user-id column (D6, G9: `user_profiles`, `lead_views`, `lead_view_events`, `subscribe_nonces`, `device_tokens`, `tracked_projects`, `notifications`, `notification_dispatches`, `admin_watchlist`, `admin_audit_log`) convert from `VARCHAR(128)`/`TEXT` to native `uuid` with real FKs to `auth.users(id)` — see D6 for the per-table `ON DELETE` policy (CASCADE for user-owned rows, SET NULL/RESTRICT for the two admin audit tables).

**At the API boundary, nothing changes.** `getUserIdFromSession`/`getClaims()`/`getUser()` all return the uid as a **string** (a uuid renders as a string) — every consuming route, response envelope, and mobile client already treats `uid` as an opaque string and does zero Firebase-specific parsing on it. The type change is confined to the database column definition and its `pg` query parameter binding; no route handler signature changes.

### 3.5 Middleware — `@supabase/ssr` cookie interface

`src/middleware.ts` keeps its two-layer split (edge shape pre-check vs Node-runtime full verification) — GoTrue verification still cannot run inside the edge runtime's constraints the same way Firebase Admin couldn't. The edge layer adopts `@supabase/ssr`'s **current `getAll`/`setAll`** cookie interface (the deprecated `get`/`set`/`remove` triplet is not used) to refresh the Supabase session cookie transparently on each request, matching the shape-check-only philosophy: middleware still does not perform cryptographic verification — that stays in the Node-runtime route handlers via `get-user.ts`. Route classification (`classifyRoute`) and the public/authenticated/admin matcher table are untouched.

### 3.6 Admin authorization — `profiles.is_admin`, Custom Access Token Hook DEFERRED

Admin authorization moves from the `ADMIN_USER_IDS` env-var allowlist to a **server-side `profiles.is_admin` boolean check inside `verify-admin.ts`** — the same one-line-swap seam the original `verify-admin.ts` comment anticipated ("When Spec 21 lands its admin column, this helper is a one-line swap"). `verifyAdminAuth()` keeps its existing three-mode structure (dev bypass → admin-key/CI bypass → session), only mode 3's allowlist lookup changes from an env-var `.includes()` check to a `SELECT is_admin FROM profiles WHERE id = $1` query.

**Custom Access Token Hook — explicitly DEFERRED (D7, Gemini NIT folded into v2 plan).** Supabase supports a Postgres function ("Auth Hook") that injects custom claims (e.g. `is_admin`) directly into the issued JWT, letting RLS policies and edge logic read the claim without a database round-trip. Buildo does not adopt this now: admin authorization is enforced **entirely server-side** inside Next.js route handlers (`verify-admin.ts`), which already have a database connection and pay one query per admin request regardless. A claims-hook only pays for itself when a claim needs to be readable *inside* a JWT for RLS or edge-runtime decisioning — Buildo's Data API is disabled (Spec 113 §10) and admin routes never run at the edge, so there is no consumer for an in-token claim today. Revisit if either of those premises changes.

### 3.7 `X-Admin-Key` CI bypass successor

The Firebase-era `X-Admin-Key` header (constant-time-compared against `ADMIN_API_KEY`) let CI/pipeline scripts hit admin routes without a real session. This bypass is **re-evaluated, not deleted outright** — Phase 1.3 (`.cursor/active_task.md`) replaces it with a **scoped token or role, IP-restricted, never the Supabase `service_role` key.** The `service_role` key is root-equivalent over the entire project (bypasses RLS, can read/write any table) — using it as a CI credential would mean a leaked CI secret compromises the whole database, not just admin-route access. The successor credential is scoped to exactly the operations CI needs and constant-time-compared exactly as `ADMIN_API_KEY` was, preserving the existing timing-safe-compare discipline (`verify-admin.ts`'s `timingSafeStringEqual`) — only the credential's *scope* changes, not the comparison mechanics.

</architecture>

---

<behavior>

## 4. Behavioral Contract
- **Inputs:** Supabase Auth (GoTrue) — Google OAuth 2.0 and email/password providers on web; `__session` cookie on subsequent browser requests; `Authorization: Bearer <token>` from mobile (Expo) clients; scoped CI token (successor to `X-Admin-Key`, §3.7) for script/CI access to admin APIs
- **Core Logic:**
  - `supabase-js` (`@supabase/ssr` on web, AsyncStorage-adapted client on mobile) handles sign-up, sign-in, Google OAuth, and sign-out. Web: `src/components/auth/LoginForm.tsx` calls `supabase-js` directly (no intermediary `session.ts` — deleted, §3.3)
  - Token flow: GoTrue issues a JWT on auth (asymmetric-signed, §3.1). The client persists the session (cookie on web via `@supabase/ssr`, secure storage on mobile) and sends it as either the `__session` cookie or a `Bearer` header. Route protection via middleware: `src/middleware.ts` uses `src/lib/auth/route-guard.ts` (UNCHANGED, §3.3) to classify routes as public, authenticated, or admin. Middleware validates cookie presence (3-segment JWT shape check, transport-agnostic — Supabase JWTs are still 3-segment base64 JWTs) at the edge runtime. Full verification runs in route handlers' Node runtime via `getUserIdFromSession` → `getClaims()`/`getUser()` (`src/lib/auth/get-user.ts`, criteria in §3.2)
  - Admin API routes require either `__session` cookie, `Bearer` token, or the scoped CI credential (§3.7)
  - **Dev mode — all three call sites preserved verbatim (G2):** `DEV_MODE=true` (server-only, NOT `NEXT_PUBLIC_*` — prevents a misconfigured production build from bypassing auth for all users) enables local-only auth bypass, unchanged from the Firebase-era design:
    1. **`src/middleware.ts:40-68`** — cookie-injection. Mutates the incoming request cookies with `dev.buildo.local` so the current-request Server Components see it, AND sets it on the outgoing response so the browser persists it.
    2. **`src/lib/auth/get-user.ts:120-126`** — timing-safe bypass. `verifyIdTokenCookie`/its Supabase successor short-circuits for the exact `DEV_SESSION_COOKIE` value and returns the stable uid `'dev-user'` without calling GoTrue, via `timingSafeStringEqual` (not `===` — a distinguishable timing channel is a real attack surface even on a dev-only comparison, per the original WF3 2026-05-04 hardening).
    3. **`src/lib/auth/verify-admin.ts:80-82`** — admin bypass. `isDevMode()` short-circuits mode 1 of `verifyAdminAuth()`.

    All three retain the **two-flag defense**: `isDevMode()` requires BOTH `process.env.NODE_ENV !== 'production'` AND `process.env.DEV_MODE === 'true'` — a single operator mistake cannot silently disable auth. `src/app/leads/page.tsx` and `getCurrentUserContext` continue to auto-seed a default `dev-user` row in `user_profiles` on each visit when missing (idempotent via `ON CONFLICT (user_id) DO NOTHING`). Login page still reads `NEXT_PUBLIC_DEV_MODE` to show the cosmetic "Continue as Dev" button; the security-critical checks read the server-only `DEV_MODE`. Regression tests lock each step of the bypass in place (rewritten under G5, `.cursor/active_task.md` Phase 1.5).
  - **Admin MFA + break-glass:** admin accounts (`profiles.is_admin = true`) require **TOTP MFA**, configured via Supabase's built-in MFA enrollment. Until MFA is verified end-to-end (Phase 1.3(b) precedes 1.3(c) — sequencing is load-bearing, not incidental), an **IP-restricted break-glass bypass** (successor to today's `X-Admin-Key` mechanism) stays operational as the only path to admin routes if MFA enrollment fails or an admin is locked out. Break-glass is not removed until MFA is proven working, not merely shipped. **Abort procedure** if the auth swap needs to be rolled back mid-Phase-1: `git revert` the code changes **AND** run the scripted Supabase auth-state wipe (`auth.users`/`profiles` cleanup) — code revert alone leaves orphaned Supabase-side auth state, since Firebase env vars remain valid and untouched until Phase 5, but Supabase-side state created during the aborted attempt does not self-clean.
  - Account types stored in Postgres `user_profiles` (not Firestore — Firestore is deleted outright, §3.3): tradesperson, company, or supplier. See `src/lib/auth/types.ts`
  - State machine: UNAUTHENTICATED -> AUTHENTICATING -> AUTHENTICATED -> ONBOARDING -> ACTIVE; AUTHENTICATED -> LOGGING_OUT -> UNAUTHENTICATED
  - **Email delivery:** custom SMTP configured and email rate limits raised in the Supabase dashboard **before** any test-account provisioning — Supabase's default built-in email sender has low rate limits unsuitable even for pre-launch test-account creation (D7)
- **Outputs:** Authenticated session with `__session` cookie (web) or persisted mobile session; user profile in Postgres `user_profiles`; route-level access control via middleware; **client-facing `{ data, error, meta }` envelope and `Authorization: Bearer` semantics are UNCHANGED** — clients (mobile, admin UI) see no contract difference beyond which token they now hold and where it verifies
- **Edge Cases:**
  - Email/Google account collision: GoTrue links accounts automatically if email verified, same behavior class as the Firebase-era `auth/account-exists-with-different-credential` handling
  - Cookie expired but Supabase session still valid: middleware rejects the stale cookie shape, client-side session listener should have refreshed via `@supabase/ssr`, fallback redirects to login
  - Concurrent tabs share the same cookie; token refresh in one tab updates for all
  - Static assets excluded from middleware matcher (`/_next/*`, `/favicon.ico`, `/public/*`)
  - Mobile: nonce rule for Google native sign-in — SHA-256 hash sent to the OAuth provider, **raw** nonce sent to Supabase (`signInWithIdToken`) — a mismatch here silently fails Google sign-in on native

</behavior>

---

<failure_modes>

## 4a. Known Failure Modes

- **JWKS fetch failure** — `getClaims()`'s local verification depends on the server SDK having a cached, valid JWKS public key. If the initial JWKS fetch fails (network partition to the Supabase auth endpoint at cold start, or the cache expires and refetch fails), every `getClaims()`/`getUser()` call fails closed — the correct behavior (fail-closed, matching the Firebase-era "silent 401 storm" hardening's spirit) but with no diagnostic signal unless logged explicitly. Guard: the swapped `get-user.ts` MUST log a distinguishable error (via `logError`) on JWKS-fetch failure specifically, not just a generic verification failure, so an operator can distinguish "every token is genuinely invalid" from "the verifier itself can't reach GoTrue" — the same class of diagnosability gap the original Firebase Admin uninitialized-in-production throw (`FirebaseAdminNotInitializedError`) was built to close.
- **MFA lockout without break-glass** — if admin TOTP MFA is enforced before the break-glass bypass (§4) is verified working, or break-glass is retired prematurely (violating the Phase 1.3 sequencing: profiles+bootstrap admin → MFA+break-glass verified end-to-end → only then retire the old bypass), a lost/misconfigured authenticator device locks every admin out of the admin panel with no recovery path. Guard: Phase 1.3's explicit ordering — the IP-restricted break-glass bypass stays operational until MFA is proven end-to-end, not merely shipped in code.
- **Service-role key exposure** — the Supabase `service_role` key is root-equivalent (bypasses RLS, full read/write on every table). Unlike a Firebase Admin SDK service-account file (which required filesystem/env access to a specific server), the `service_role` key is a single bearer credential — if it leaks into a `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` variable, client bundle, log line, or a CI secret used as an admin bypass, the blast radius is the entire database. Guard: Spec 113 §3's naming/placement rule (secret keys never appear outside `src/lib/db/`, `src/lib/supabase/` server factory, or `scripts/`) plus this spec's §3.7 rule that the CI admin-bypass successor is a scoped token, never `service_role`.
- **Dev-bypass leaking to production via single-flag check** — if a future refactor collapses the two-flag `isDevMode()` guard (`NODE_ENV !== 'production'` AND `DEV_MODE === 'true'`) down to checking only `DEV_MODE`, a single misconfigured environment variable in production silently disables auth for every route across all three call sites (middleware injection, `get-user.ts` bypass, `verify-admin.ts` bypass) simultaneously — because all three read the same `isDevMode()` function in `route-guard.ts`, one collapsed guard compromises all three at once. Guard: `isDevMode()` remains the single source of truth for the two-flag check (route-guard.ts, UNCHANGED per §3.3) — no call site re-implements its own dev-mode condition; any new call site MUST import and call `isDevMode()` rather than reading `process.env.DEV_MODE` directly.

</failure_modes>

---

<testing>

## 4b. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`auth.logic.test.ts, middleware.logic.test.ts`): Auth Types; Route Classification; Route Guard Constants; Session Cookie Validation; Dev Mode; Security Files; `getClaims`/`getUser` routing per §3.2 criteria
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/auth/config.ts` — rewritten as Supabase client factory
- `src/lib/auth/types.ts`
- `src/lib/auth/route-guard.ts` — kept verbatim (no Firebase-specific logic to remove)
- `src/lib/auth/get-user.ts` — swapped to `getClaims()`/`getUser()`, guards preserved
- `src/lib/auth/verify-admin.ts` — `profiles.is_admin` swap, CI-bypass re-evaluation
- `src/lib/auth/get-user-context.ts` — uid type only, logic unchanged
- `src/lib/supabase/` (new) — server client factory (governed jointly with Spec 113 §3, which owns the key contract)
- `src/app/login/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/middleware.ts` — `@supabase/ssr` `getAll`/`setAll`
- `src/tests/auth.logic.test.ts`
- `src/tests/auth-get-user.logic.test.ts`
- `src/tests/middleware.logic.test.ts`

### Files DELETED by this spec
- `src/lib/firebase-admin.ts` — no successor file; verification is per-request, not a booted SDK singleton
- `src/lib/auth/session.ts` — no successor file; `LoginForm.tsx` calls `supabase-js` directly
- `src/tests/firebase-admin.logic.test.ts` — no successor test file (nothing left to test at that seam)
- `src/instrumentation.ts`'s `getFirebaseAdmin()` boot call (file itself is not deleted — Sentry init remains)

### Out-of-Scope Files (DO NOT TOUCH)
- **`docs/specs/00-architecture/113_supabase_infrastructure.md`**: owns the platform/connection layer (project topology, env/key contract, TLS, pooling, extensions) this spec's verification calls ride on top of. Do not restate its §3 key contract here — reference it.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`migrations/`**: Governed by Spec 01 for schema shape; the D6 uid→uuid conversion migration itself is Phase 1.4 (`.cursor/active_task.md`), tracked there, not authored inline against this spec.
- **`mobile/`**: Spec 93 (mobile auth) rewrite is a separate Phase S3 deliverable — this spec's mobile references (nonce rule, `@supabase/ssr` mobile-adjacent behavior) are context, not authority; Spec 93 governs `mobile/src/lib/supabase.ts`, `authStore.ts`, `sign-in.tsx`/`sign-up.tsx`.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 (env/key contract — which key each environment reads, where `sb_publishable_*`/`sb_secret_*`/local demo keys live).
- Foundation for all authenticated features. All specs requiring auth import from `src/lib/auth/` (read-only).
- Consumed by **Spec 14 (Onboarding)**: Onboarding reads user profile after auth.
- Consumed by **Spec 26 (Admin)**: Admin routes use route-guard for access control.
- Consumed by **Spec 93 (Mobile Auth, Phase S3 sibling rewrite)**: mobile client factory follows the same `getClaims()`/`getUser()` server-side verification this spec defines; mobile owns only its client-side session handling.
- Consumed by the new RLS Policy Catalog spec (Phase S4): reads this spec's `auth.uid()` conventions when defining `auth.uid() = user_id`-shaped policies, though Buildo's Data API stays disabled (Spec 113 §10) so RLS is a defense-in-depth layer, not the primary authorization mechanism (which remains route-handler-based, §3.6).

</constraints>
</output>
