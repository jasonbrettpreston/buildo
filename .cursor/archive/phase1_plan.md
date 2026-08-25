# Active Task: Supabase Migration — Phase 1 (Web Admin Auth)
**Status:** Planning
**Domain Mode:** Cross-Domain (auth spans `src/lib/auth/`, `src/middleware.ts`, `src/app/api/**`, `migrations/`, new `src/lib/supabase/`)
**Workflow:** WF1 sub-phase plan-lock for `.cursor/active_task.md` Phase 1 (Execution Plan steps 1.1–1.6), authored per that document's instruction: *"Phase 1 plan-lock must define the session-establishment mechanism ... Spec 13 intentionally defers this to here."*
**Governing specs (binding, cited inline):** `docs/specs/00-architecture/13_authentication.md` (§3 architecture, §4 behavioral contract), `docs/specs/00-architecture/116_multi_product_architecture.md` §4 N1–N6, `docs/specs/00-architecture/113_supabase_infrastructure.md` §3, `docs/specs/00-architecture/114_rls_policy_catalog.md`, `docs/specs/00_engineering_standards.md` §11. Program authority: `.cursor/active_task.md` v2.2, Decisions D1/D6/D7/D16, Ground truths G2/G9/G10.

---

## Context

### Goal
Land the concrete, file-by-file implementation of program-plan Phase 1 (steps 1.1–1.6): swap the 7+1 auth chokepoint files from Firebase to Supabase (`@supabase/ssr`), decide and build the session-establishment mechanism Spec 13 explicitly deferred, land `profiles`+`entitlements`+D6-uuid+RLS migrations in sequence, re-point the Stripe webhook fan-out onto per-product `entitlements` (Spec 116 N2, OD3, OD5), and rewrite the G5 web-auth test surface — all before Phase 2 (mobile) touches anything.

### Ground truth — corrections and additions found during this plan's research (cite before acting on them)

**P1-G0 — `/api/auth/session` does not exist in the codebase.** Spec 13 §"Behavioral Contract" prose and `.cursor/active_task.md`'s Phase 1.1 line both refer to *"the old `POST /api/auth/session` 14-day httpOnly contract."* A directory listing of `src/app/api/` (confirmed via `find`) shows **no `auth/` subdirectory exists** — the live-tree occurrences of the literal `/api/auth/` are `route-guard.ts` (where the string appears **3 times, not the single `PUBLIC_PREFIXES` entry originally cited here** — verify all 3 call sites at implementation; none is a handler, all are classification-rule string literals) and two assertions in `middleware.logic.test.ts` (lines 34–35, 162–163) that only check `classifyRoute('/api/auth/session') === 'public'` — they never exercise a real route [panel-fold: Integration, line-cite correction]. **Conclusion: Phase 1 is not migrating a working session-bridge endpoint; none was ever built.** `LoginForm.tsx` today calls `signInWithEmail`/`signInWithGoogle` (`src/lib/auth/session.ts`), which return a client-side Firebase `User` object and write a Firestore profile — **nothing in the current code ever sets the `__session` cookie** that `middleware.ts`/`get-user.ts` check for, outside the `DEV_MODE` bypass. This is either (a) a real pre-existing gap — production web-admin login without `DEV_MODE` may never have worked end-to-end — or (b) a cookie-setting mechanism this search missed. **Action for the panel:** confirm (a) vs (b) before Phase 1 starts (e.g. `git log -p -- 'src/app/api/auth/**'`, or ask the operator whether they've ever logged into prod web admin without `DEV_MODE=true`). Either way, the Phase 1 design below (§Item 1) does not depend on the answer — but note Item 1 was subsequently redesigned [panel-fold: GT+Security BLOCKING] to build a REAL server-side sign-in path (a Route Handler/Server Action using the server Supabase client with httpOnly `cookieOptions`) precisely because the browser-writes-cookies alternative cannot produce an httpOnly cookie at all — see Item 1's rationale.

**P1-G1 — the subscription-status surface is materially richer than "active vs inactive."** `subscription_status` (`src/lib/userProfile.schema.ts:27-29`) is a 6-value enum — `trial | active | past_due | expired | cancelled_pending_deletion | admin_managed` — with a full state machine: trial-start-on-onboarding, GET-time fallback trial-init + expiration sweep, Stripe webhook-driven active/past_due/expired transitions with an anti-replay watermark (`last_stripe_event_at`) and a superseded-subscription fence, delete-time `cancelled_pending_deletion` (blocks re-subscribe), 30-day reactivate-with-live-Stripe-status-restore, and admin drift-reconcile against live Stripe truth. **Every one of these behaviors is a fence this plan must preserve**, not just the column rename N2 implies.

**P1-G2 — only ONE Stripe Price exists today, and only ONE route (`parcels/lookup`) hard-gates on `subscription_status`.** `migrations/219_stripe_price_id_default.sql` confirms "single-price v1" — `logic_variables.stripe_price_id_default` (JSONB string), consumed by `/api/subscribe/exchange/route.ts`. Grepping `ACTIVE_SUBSCRIPTION_STATUSES` finds it defined and used exactly once, in `parcels/lookup/route.ts:47,58`. `flight-board/route.ts` gates on `trade_slugs`, not `subscription_status` — **flight-center has no live subscription gate today.** `leads/view/route.ts:101` reads `subscription_status==='trial'` only to gate a view-**counter** (not a hard block). This matters for the price→product mapping design (Item 4): there is no existing flight-center paywall to "migrate" — N3's per-product gate is plumbing built ahead of a second product/price, not a retrofit of a second live gate.

**P1-G3 — the writer/reader inventory (task-supplied, verified against live files this session):**
| # | File | Writes/reads | Verified detail |
|---|---|---|---|
| W1 | `src/app/api/webhooks/stripe/route.ts` | writes | `classifyEvent` (L101-167) + the transactional UPDATE (L291-338): userId-primary / customer-id-fallback identification, out-of-order guard (`last_stripe_event_at`), superseded-sub fence, `cancelled_pending_deletion` fence |
| W2 | `src/lib/subscription/expiration.ts` | writes | `applyFallbackTrialInitIfNeeded` / `applyTrialExpirationIfNeeded`, both idempotent UPDATE-with-WHERE-guard |
| W3 | `src/app/api/user-profile/route.ts` PATCH | writes | trial-start block, L347-354 |
| W4 | `src/app/api/user-profile/reactivate/route.ts` | writes | live-Stripe-status restore via `deriveEffectiveStripeStatus`, L54-126 |
| W5 | `src/app/api/user-profile/delete/route.ts` | writes | `cancelled_pending_deletion` + Stripe cancel + `stripe_cancel_failed_at` marker, L48-86 |
| W6 | `src/app/api/admin/users/[uid]/route.ts` PATCH | writes | 4 mutation cases touch it: `extend_trial`, `revoke`, `suspend`, `delete` — each in its own `withTransaction` + `writeAdminAudit` |
| W7 | `src/app/api/admin/users/[uid]/subscription/reconcile/route.ts` | writes | GET (read-only drift) + POST (audited apply), `RECONCILE_PROTECTED_STATUSES` fence |
| W8 | `src/app/api/subscribe/exchange/route.ts` | writes (Stripe Customer) | **[panel-fold: GT HIGH]** creates the Stripe Customer for checkout — see Item 4's new "Stripe Customer reuse" sub-section; today creates a fresh Customer per checkout with no reuse check, added to this plan's file list because `stripe_customer_id` legitimately lives on `user_profiles` (customer-level, not product-level) and the invoice-event fallback identification path (W1) depends on it staying a stable 1:1 identity bridge |
| R1 | `src/lib/auth/get-user-context.ts` | reads | returns `subscription_status` in `UserContext`, used only by `leads/view` today (grep confirms) |
| R2 | `src/app/api/leads/view/route.ts` | reads | `ctx.subscription_status === 'trial'`, L101 |
| R3 | `src/app/api/subscribe/session/route.ts` | reads | `SELECT ... FOR UPDATE` row-lock, L92-111, TOCTOU-safe against the webhook |
| R4 | `src/app/api/parcels/lookup/route.ts` | reads | `ACTIVE_SUBSCRIPTION_STATUSES`, L47-58 |
| R5 | `src/app/api/admin/users/route.ts` (directory) | reads+writes | GET filter/column (L43-79); POST provisioning INSERTs `subscription_status='admin_managed'` (L181-197) |
| R6 (Phase 2, note only) | mobile `useUserProfile.ts` + `app/(app)/_layout.tsx` | reads | `GET /api/user-profile` → `UserProfileSchema.safeParse` (`src/lib/userProfile.schema.ts:27-29`) — **contract frozen this phase, see Item 4** [panel-fold: Integration, path corrected from `mobile/app/_layout.tsx`] |
| R7 | `src/app/api/admin/users/[uid]/route.ts` GET | reads | **[panel-fold: Integration]** `DETAIL_COLUMNS` selects `subscription_status`/`trial_started_at` directly off `user_profiles` — re-derived from `entitlements` post-229 (Item 4 readers) |
| R8 | `src/app/api/admin/users/[uid]/route.ts` PATCH (`revoke`/`suspend` cases) | reads | **[panel-fold: Integration]** L271's `oldValue` audit snapshot reads `subscription_status` off `user_profiles` before mutating — also re-derived from `entitlements` post-229 |

**P1-G4 — shared Stripe helpers that need product-awareness:** `src/lib/stripe/client.ts` exports `mapStripeSubStatus` (single-sub → status), `deriveEffectiveStripeStatus` (all-subs-for-a-customer → ONE status, used by W4 and W7), `cancelAllStripeSubscriptions` (customer-wide cancel, product-agnostic — stays as-is, see Item 4). `deriveEffectiveStripeStatus` collapses across products; it must become per-product before W4/W7 can write correct entitlement rows.

**P1-G5 — `firebase-admin.ts` has more additional call sites beyond the 7+1 chokepoint** that G2 didn't enumerate: `user-profile/delete/route.ts:92` (`revokeRefreshTokens`), `admin/users/[uid]/route.ts:285` (`deleteUser` in the `delete` mutation case) — **line cites corrected [panel-fold: Integration, off-by-2]: Integration's direct read of the live files found the originally-cited L90/L283 were each 2 lines short of the real call site (an intervening line inserted earlier in each file shifts everything below it) — L92/L285 above are the corrected values, re-verify against the live file at implementation since further edits before Phase 1 lands could shift them again.** `admin/users/route.ts` POST is now read this session and resolves to **4 Admin SDK call sites across 2 blocks, not 1** [panel-fold: Integration] — see fold 13/Item 2's Execution Plan for the full mapping (`createUser` L156, `getUserByEmail` L162, `generatePasswordResetLink` L169, rollback `deleteUser` L205). All of these are dynamic `await import('firebase-admin')` calls, not static imports of the deleted `firebase-admin.ts` wrapper file — they call the SDK's `admin.auth()` namespace directly. **They must be swapped to their Supabase Admin API equivalents in the SAME commit as the chokepoint swap** (`supabase.auth.admin.deleteUser(uid)`, session revocation via `supabase.auth.admin.signOut(uid, 'global')` or a targeted refresh-token invalidation — confirm exact GoTrue admin API method name against `@supabase/supabase-js` types at implementation time), or Phase 1.6's OUTPUT review will find live Firebase Admin calls surviving the "delete `firebase-admin.ts`" step while the underlying SDK dependency (`firebase-admin` npm package) is still imported dynamically from these routes.

### Key Files
**Chokepoint (7+1), read this session:** `src/lib/firebase-admin.ts`, `src/lib/auth/get-user.ts`, `src/lib/auth/verify-admin.ts`, `src/lib/auth/get-user-context.ts`, `src/lib/auth/config.ts`, `src/middleware.ts`, `src/instrumentation.ts`, `src/lib/auth/route-guard.ts` (KEEP verbatim), `src/components/auth/LoginForm.tsx`, `src/lib/auth/session.ts` (DELETE).
**Subscription surface, read this session:** `src/app/api/webhooks/stripe/route.ts`, `src/lib/subscription/expiration.ts`, `src/app/api/user-profile/route.ts`, `src/app/api/user-profile/reactivate/route.ts`, `src/app/api/user-profile/delete/route.ts`, `src/app/api/admin/users/[uid]/route.ts`, `src/app/api/admin/users/[uid]/subscription/reconcile/route.ts`, `src/app/api/leads/view/route.ts`, `src/app/api/subscribe/session/route.ts`, `src/app/api/subscribe/exchange/route.ts` (**added [panel-fold: GT HIGH]** — Stripe Customer reuse, W8/Item 4), `src/app/api/parcels/lookup/route.ts`, `src/app/api/admin/users/route.ts`, `src/lib/stripe/client.ts`, `src/lib/userProfile.schema.ts`, `mobile/src/hooks/useUserProfile.ts`, `mobile/app/(app)/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app/flight-board.tsx` (context only — see fold 16).
**New this phase:** `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/actions.ts` (**added [panel-fold: GT+Security BLOCKING]** — sign-in/sign-up Server Actions, Item 1), `src/lib/subscription/entitlement.ts`, `scripts/bootstrap-first-admin.js`, `scripts/wipe-supabase-auth-state.js`, `migrations/226-230_*.sql`, `supabase/tests/` (**added [panel-fold: Integration]** — pgTAP bootstrap, Item 3).

---

## Technical Implementation

### Item 1 — Session-establishment mechanism (the load-bearing decision Spec 13 deferred)

**Decision: server-side sign-in via a Route Handler/Server Action using the SERVER Supabase client — NOT `@supabase/ssr`'s browser-writes-cookies-directly model. [panel-fold: GT+Security BLOCKING]** The browser client is used ONLY to kick off the Google OAuth redirect (where the SDK's `signInWithOAuth` must run in the browser to navigate `window.location` to Google) — it is never the thing that writes the session into cookies. Email/password sign-in and sign-up post credentials to a server-side handler that calls `createServerClient(...).auth.signInWithPassword`/`.signUp` itself, and that SAME server client's `setAll` is what actually writes the `sb-*` session cookies onto the response — with `httpOnly: true` forced via explicit `cookieOptions`.

Rationale [panel-fold: GT+Security BLOCKING]: `@supabase/ssr`'s DEFAULT cookie options are `httpOnly: false` — the browser-writes-cookies pattern relies on `document.cookie`, and **JS-set cookies can never be `httpOnly` by definition** (httpOnly is a `Set-Cookie` response-header property; `document.cookie` cannot express it, no matter what options are passed to `createBrowserClient`). The OLD (never-built, P1-G0) `__session` contract was `httpOnly: true`. A readable-by-JS refresh token is not a lateral change from that — it is a **long-lived account-takeover primitive on any XSS**: script execution once lets an attacker read `sb-<ref>-auth-token` straight out of `document.cookie` and mint a working session indefinitely (refresh tokens are long-lived and rotate-on-use, so theft outlives the XSS payload itself). This plan therefore does NOT use `@supabase/ssr`'s own documented "simple" browser-writes-cookies path for the credential-bearing flows — that simplicity is the exact security regression this Item exists to avoid. **Every `createServerClient(...)` call site in this plan (`server.ts`, `middleware.ts`'s `updateSession`, and the new sign-in Server Action) passes explicit `cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' }`** — this is not implied by choosing `createServerClient` over `createBrowserClient`; it must be passed explicitly at every call site or the SDK's own non-httpOnly defaults silently win.

**Concrete file plan:**
- **`src/lib/supabase/browser.ts` (new)** — exports `createClient()` wrapping `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)` from `@supabase/ssr`. Singleton per module (matches `auth/config.ts`'s existing `let app` caching pattern — see fold 7/Item 2 for `config.ts`'s own disposition). **Scope narrowed by the session-flow redesign [panel-fold: GT+Security]: consumed ONLY by `LoginForm.tsx`'s Google-OAuth button**, to call `signInWithOAuth({provider:'google', options:{redirectTo: ...}})`, which navigates away and writes no session cookie itself — the session is written server-side when the OAuth callback route exchanges the code. **Never used for email/password sign-in/sign-up.**
- **`src/lib/supabase/server.ts` (new)** — exports `createClient()` for Route Handlers / Server Components / Server Actions: `createServerClient(url, publishableKey, { cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' }, cookies: { getAll: () => cookies().getAll(), setAll: (list) => { for (const {name, value, options} of list) cookies().set(name, value, options) } } })` using `next/headers`'s `cookies()`. **`cookieOptions` is mandatory here [panel-fold: GT+Security BLOCKING]** — see rationale above; every `createServerClient` call in this plan repeats it, it is not a one-time global default. **Note (Next.js 15+):** `cookies()` is async in Route Handlers/Server Components under the App Router's current API — the factory function itself must be `async` and callers must `await createClient()`. Verify the exact signature against the installed `next` version at implementation time (Context7 lookup mandated by CLAUDE.md Prime Directive #9 before writing this file).
- **`src/lib/supabase/actions.ts` (new) — the sign-in/sign-up Server Action(s) [panel-fold: GT+Security BLOCKING].** `signInAction(formData)` / `signUpAction(formData)`, both `'use server'`, both call `createClient()` from `server.ts` (the httpOnly-cookie-writing client) and invoke `.auth.signInWithPassword({email, password})` / `.auth.signUp({email, password, options:{data:{display_name, account_type}}})` server-side. `LoginForm.tsx` posts to these instead of calling a browser client directly for the credentialed paths; the Server Action's `setAll` (via `server.ts`'s `cookieOptions`) is what actually lands the `httpOnly` session cookie — the credentials themselves never produce a client-writable cookie at any point.
- **`src/lib/supabase/middleware.ts` (new)** — exports `updateSession(request: NextRequest): Promise<NextResponse>`, the `@supabase/ssr` canonical middleware helper: builds a `NextResponse`, constructs `createServerClient` (same explicit `cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax' }` as `server.ts` [panel-fold: GT+Security]) with `getAll` reading `request.cookies.getAll()` and `setAll` writing to BOTH `request.cookies.set(...)` (so the mutated request is visible downstream in the same middleware pass, matching the existing DEV_MODE pattern at `middleware.ts:43-58`) AND `response.cookies.set(...)` (so the browser persists it) — then calls `await supabase.auth.getClaims()` **once, wrapped in try/catch, FAIL-OPEN on error** — see the design note below.

**Design note — why middleware calls `getClaims()` at all, and why it fails open [panel-fold: Gm+DS CRITICAL, adjudicated GT]:**
1. *Why `getClaims()`, not `getUser()`* — Spec 13 §3.2's cost rules govern this choice, not a stylistic preference: `getClaims()` verifies the JWT's signature locally against a cached JWKS (asymmetric-key verification, no network round trip once the JWKS is cached), while `getUser()` makes a live network call to Supabase's Auth server on every invocation. Middleware runs on every matched request (per `middleware.ts`'s matcher config) — paying a network round trip there, on top of whatever the route handler does downstream, is exactly the double-cost Spec 13 §3.2 tells routes to avoid. The canonical `@supabase/ssr` Next.js template defaults to `getUser()` in middleware; this plan deliberately does NOT follow that template, because Spec 13 §3.2 predates and supersedes it for this codebase.
2. *Why `getClaims()` is called at all if its result isn't used for routing* — `@supabase/ssr`'s token-refresh mechanism is a *side effect* of calling `getClaims()`/`getUser()`: the SDK checks the access token's expiry, and if stale, uses the refresh token to mint a new session and invoke `setAll` with the new cookies, transparently, before your code sees the result. **If middleware never calls `getClaims()`/`getUser()`, refresh never happens** and a session silently goes stale until it hard-expires, producing a confusing "was logged in, now isn't" bug with no code change to blame.
3. *Why it must fail open* — `getClaims()` depends on a JWKS fetch (cached, but the cache can miss or the fetch can fail — network partition, Supabase Auth outage, DNS blip). **This call is wrapped in try/catch; on ANY error it logs a `logWarn` and passes the request through UNCHANGED** — it does not block, redirect to a login page, or mutate `classifyRoute`'s decision. The routing decision's source-of-truth stays `isValidSessionCookie`'s shape check / `classifyRoute` exactly as today (Item 2) — middleware's `getClaims()` call is refresh-plumbing, never an authorization gate, and a refresh-plumbing failure must not become a site-wide outage. Route handlers downstream re-verify the session themselves (`getClaimsUid`/`getVerifiedUid`, Item 2) and fail gracefully (401) on a still-bad session — the two failure domains are independent by design.
   ```ts
   // CONTRACT: this call exists ONLY to trigger @supabase/ssr's refresh side effect.
   // Its result is never read for authorization. On failure (JWKS fetch error,
   // network partition, Supabase Auth outage) this middleware pass MUST fail
   // OPEN — log and continue — never block or redirect. Route handlers are the
   // real authorization boundary and re-verify independently. See Spec 13 §3.5
   // and phase1_plan.md Item 1 design note.
   try {
     await supabase.auth.getClaims();
   } catch (err) {
     logWarn('[middleware/updateSession]', 'getClaims refresh check failed, failing open', { err });
   }
   ```
   A regression test (`middleware.security.test.ts`, Execution Plan P1-F5.1) asserts routing decisions are unaffected by a simulated `getClaims`/JWKS failure — same public/authenticated/admin classification with and without the throw.
4. *Pre-implementation check* — `getClaims()` was added to `@supabase/ssr` in a specific minor version; **P1-F1.1's Context7 lookup must confirm `getClaims()` exists with this signature in the exact `@supabase/ssr` version pinned in `package.json` before this file is written** — if the pinned version predates it, this plan's design collapses to `getUser()` and the cost-rules rationale in point 1 needs an explicit Spec 13 amendment noting the fallback.

This reconciles with Spec 13 §3.5 ("middleware does not perform cryptographic verification"): the verification happens as a refresh side effect, but the routing decision never consumes its result — the same split Spec 13 already draws between middleware and route handlers, now with an explicit fail-open contract instead of an implicit one.

- **Bearer-token API clients (mobile) coexistence:** middleware's `updateSession` only runs the cookie-refresh dance for the cookie-bearing (web browser) path. A request carrying `Authorization: Bearer <token>` and no `sb-*` cookie is unaffected by `getAll`/`setAll` (there's nothing to refresh in the cookie jar) and flows through to the same `extractBearerToken` → `getUserIdFromSession`-successor path that exists today (`get-user.ts:200-206`, kept verbatim, see Item 2) — mobile calls `getClaims()`/`getUser()` directly against the bearer token in the Node-runtime route handler, same as today's Firebase Bearer path, with no session-refresh expectation (mobile refresh is Spec 93's domain, Phase 2, using `supabase-js`'s `AsyncStorage`-backed auto-refresh via `startAutoRefresh`/`stopAutoRefresh` on `AppState` changes — out of scope here, cited so this plan doesn't silently assume mobile refreshes through middleware, which it never will). **Shape-check reconciliation [panel-fold: Gm MED]: `get-user.ts`'s 3-segment shape check (Item 2) REMAINS in force for this Bearer path only** — a Supabase-issued Bearer JWT is still a plain 3-segment JWT. **It does NOT apply to `sb-*` cookies** — those are `@supabase/ssr`'s own chunked, base64-prefixed cookie encoding (not a raw JWT string; a session can be split across `sb-<ref>-auth-token.0`/`.1`/… and isn't 3-segment-shaped at all), and the cookie path defers entirely to `updateSession`/`createServerClient`'s own parsing rather than any manual shape check. **Spec 13 §3.5 gets a one-line amendment at implementation** recording this split: middleware defers all cookie handling to `updateSession`; the Bearer-path 3-segment shape check in `get-user.ts` is unchanged.
- **Cookie name is NOT `__session` anymore.** `@supabase/ssr` owns its own cookie naming (`sb-<ref>-auth-token`) — Buildo does not choose or control the name, though it DOES control `cookieOptions` (httpOnly/secure/sameSite, fold above). Every place today that hardcodes `'__session'` (`route-guard.ts:217 SESSION_COOKIE_NAME`, `middleware.ts:41,55,59,71`, `get-user.ts` cookie read at `request.cookies.get('__session')`) must be replaced with a call into the `@supabase/ssr`-managed cookie jar (via `createServerClient`'s own cookie handling — you don't manually `.get()` a named cookie anymore, you call `supabase.auth.getClaims()`/`getUser()` and let the SDK read whichever chunked cookie set it wrote). **`SESSION_COOKIE_NAME`/`isValidSessionCookie` in `route-guard.ts` are repurposed, not deleted** — see Item 2's route-guard row.
- **Cookie lifetime/refresh semantics:** Supabase project default access-token lifetime is 1 hour, refresh-token lifetime configurable in the dashboard (default 30 days, sliding on use unless "reuse detection" settings say otherwise) — **this REPLACES the old spec's "14-day httpOnly contract"** (which, per P1-G0, was never actually built) with Supabase's own defaults, now genuinely httpOnly end-to-end per this Item's redesign. **Action:** confirm the target values in the Supabase dashboard Auth settings at Phase 1.2 (same step that configures SMTP/rate limits) and record them in Spec 13 as an amendment — this plan does not invent a Buildo-specific override; it inherits the platform default unless the operator decides otherwise at 1.2.

### Item 2 — Per-file swap plan, 7+1 chokepoint + instrumentation + session.ts

| File | Old responsibility | New responsibility | What stays verbatim |
|---|---|---|---|
| `src/lib/firebase-admin.ts` | Boots Firebase Admin SDK, resolves 3-tier credential source | **DELETED.** No successor file — no service-account, no boot-time singleton | — |
| `src/lib/auth/session.ts` | `signUpWithEmail`/`signInWithEmail`/`signInWithGoogle`, Firestore profile writes | **DELETED.** Email/password sign-in and sign-up move to the new `signInAction`/`signUpAction` Server Actions (`src/lib/supabase/actions.ts`, Item 1); `LoginForm.tsx` calls `src/lib/supabase/browser.ts`'s client ONLY for `signInWithOAuth` (Google redirect) — see fold 1's session-flow redesign | — |
| `src/lib/auth/config.ts` | Firebase `app`/`auth`/`firestore` singleton init, reads 6 `NEXT_PUBLIC_FIREBASE_*` | **DELETED outright, no shim. [panel-fold: Integration+GT convergent]** Exactly ONE consumer — `session.ts` — which is itself deleted this same phase (grep-confirmed this session); the earlier "32/59" figure cited against `config.ts` conflated its consumers with `get-user.ts`/`verify-admin.ts`'s ~32 consuming routes, which import THOSE files, not `config.ts`. Its role is split: browser init → `src/lib/supabase/browser.ts` (OAuth-redirect-only per fold 1), server init → `src/lib/supabase/server.ts` + the new `actions.ts` (Item 1). No import-path migration needed beyond `session.ts`'s own deletion — no re-export shim, no delete-vs-shim uncertainty remains (see the Panel Adjudication appendix: DS's shim proposal is refuted on this same "1 consumer" finding) | — |
| `src/lib/auth/get-user.ts` | `verifyIdTokenCookie` (Firebase `verifyIdToken(cookie, true)`), `getUserIdFromSession` (Bearer-then-cookie precedence) | `verifySupabaseSession` (name TBD at implementation — keep exported function COUNT and shape stable so the ~32 consuming routes need zero changes beyond the import): calls `createClient()` from `src/lib/supabase/server.ts`, then per Spec 13 §3.2 criteria calls `.auth.getClaims()` (read paths, default) or `.auth.getUser()` (money/account-mutation/admin-write paths — **the route, not this helper, decides which; the helper exports BOTH `getClaimsUid(request)` and `getVerifiedUid(request)` so call sites opt in explicitly, rather than one function silently picking for them** — this is a deliberate widening of the function surface from 1 exported verifier to 2, driven directly by Spec 13 §3.2's per-route criteria table). **Type-branded verification split [panel-fold: DS+Gm]:** `getVerifiedUid` returns a branded `VerifiedUid` type (e.g. `type VerifiedUid = string & { readonly __brand: 'VerifiedUid' }`), not a bare `string` — `getClaimsUid` continues to return a plain `string`. Every money/mutation helper downstream (Stripe checkout/portal creation, `withTransaction`-wrapped writes, admin mutations) is typed to accept ONLY `VerifiedUid`, never `string`, so passing a `getClaimsUid` result (or any other string) into a mutation path is a **compile-time error**, not a runtime trust bug waiting to happen | **8KB `MAX_TOKEN_BYTES` guard** (L40, re-applied to whatever raw token/cookie value is extracted before it reaches the SDK) · **3-segment shape check** (L99, still valid for the Bearer-token path — a Supabase Bearer JWT is still a 3-segment JWT, Spec 13 §3.3 row for `route-guard.ts` already establishes this; **does NOT apply to `sb-*` cookies**, see Item 1's shape-check reconciliation) · **Bearer-vs-cookie precedence** (L200-209 logic, rewritten to call the Supabase equivalents but keep the exact precedence order and the "Authorization header present → commit to Bearer, no fallthrough" fail-closed behavior) · **timing-safe dev-bypass compare** (`timingSafeStringEqual`, L61-67, byte-identical, still gated on `isDevMode()` + `NODE_ENV!=='production'`) |
| `src/lib/auth/verify-admin.ts` | Mode 3: `ADMIN_USER_IDS` env-allowlist against Firebase uid | Mode 3: `SELECT is_admin FROM profiles WHERE id = $1` (uuid param) — see Item 3 for the exact query + MFA gate added here (§3.6 successor design). Mode 2 (`X-Admin-Key`): re-evaluated per Item 5/1.3(c), not ported as-is | **Mode 1 dev bypass** (`isDevMode()` check, L80-82, byte-identical) · **CSRF Origin-allowlist gate** (L62-74, `isOriginAllowed`, unrelated to the auth provider, zero changes) · **timing-safe compare helper** (`timingSafeStringEqual`, L164-169, reused for the new CI-credential compare) |
| `src/lib/auth/get-user-context.ts` | `getUserIdFromSession` → `user_profiles.user_id` (Firebase-uid-string) lookup | Calls the new `getVerifiedUid`/`getClaimsUid` (read path → `getClaimsUid`, this function is read-only), `user_profiles.user_id` lookup unchanged in shape (uuid renders as string at the API boundary — Spec 13 §3.4) | **Entire trade_slugs-set-building logic (L87-122) untouched** — zero relationship to the auth provider. **`subscription_status` field REMOVED from `UserContext`** (Item 4 — moves to the new `getEntitlementStatus` helper; grep confirms only `leads/view` reads `ctx.subscription_status`, so removing it here is a 1-call-site blast radius, not a silent break) |
| `src/instrumentation.ts` | `register()` boots Firebase Admin via `getFirebaseAdmin()` in the nodejs runtime | Boot call **removed outright** — nothing to initialize; Sentry init (L11-22) is UNRELATED and stays byte-identical | Sentry init block |
| `src/middleware.ts` | `classifyRoute` + shape-check + DEV_MODE cookie injection + admin-API-key fallback inline (L81-85, a SECOND `X-Admin-Key` check duplicating `verify-admin.ts`'s — note this duplication exists TODAY, pre-migration; Item 5 must decide whether the successor CI-credential check stays duplicated in middleware or is removed from middleware and left solely to `verify-admin.ts`'s per-route check, since route handlers already re-check it — **recommend removing the middleware-level duplicate**, since Spec 33 §5 already establishes "middleware-only admin protection is insufficient" as the reason `verify-admin.ts` exists as defense-in-depth on TOP of middleware, not as a second independent gate that must also know the CI-credential secret) | Calls `updateSession` (Item 1) before/instead of the DEV_MODE cookie-injection block for the non-dev-mode path; DEV_MODE block itself is UNCHANGED (still injects a well-known cookie value bypassing Supabase entirely) | **`classifyRoute` call + all three route-class branches** (public/admin/authenticated dispatch, L30-121) · **DEV_MODE block** (L40-68) byte-identical · **matcher config** (L124-129) |
| `src/lib/auth/route-guard.ts` | Route classification, `isDevMode`, `DEV_SESSION_COOKIE`, `SESSION_COOKIE_NAME`/`isValidSessionCookie`, `extractBearerToken` | **UNCHANGED except two exports' role narrows:** `SESSION_COOKIE_NAME` (`'__session'`) and `isValidSessionCookie` remain **only for the `DEV_MODE` synthetic cookie path** (which still uses the literal string `'dev.buildo.local'` as a fake 3-segment-shaped value — Item 1's real Supabase cookies never go through `isValidSessionCookie` anymore, since middleware's non-dev-mode branch no longer manually reads a named cookie at all, it defers entirely to `updateSession`). **Post-swap grep gate [panel-fold: DS LOW], folded into P1-F2.8:** confirm `isValidSessionCookie` AND `SESSION_COOKIE_NAME` are referenced ONLY inside `DEV_MODE`-guarded code after the swap — grep both identifiers repo-wide, every hit must sit behind an `isDevMode()` check; a hit outside that guard is a live bug (a real Supabase cookie path still depending on the retired shape check), not stranded dead code. **CORRECTION (2026-07-19 Phase-1 OUTPUT panel — Guardian F2): the "referenced only inside DEV_MODE-guarded code" claim was a drafting error.** Middleware's NON-dev path intentionally calls `isValidSessionCookie(bearerToken)` as a transport-agnostic Bearer-token PRESENCE/shape check (`src/middleware.ts` real-session branch) — the intended design per program-plan G2 + Spec 13 §3.5 (middleware does presence checks only, never cryptographic verification; route handlers re-verify). That hit is NOT a live bug; the DEV_MODE-only constraint correctly applies to the `SESSION_COOKIE_NAME` cookie path, while the Bearer shape check is a legitimate non-dev consumer | `classifyRoute`, `PUBLIC_PATHS`/`PUBLIC_PREFIXES`/`PUBLIC_EXACT_API_PATHS`/`AUTHENTICATED_API_ROUTES`, `isDevMode`, `DEV_SESSION_COOKIE`, `extractBearerToken` — **all byte-identical, zero Supabase-specific logic per Spec 13 §3.3's Ground-truth-confirmed row** |
| `src/components/auth/LoginForm.tsx` | Calls `signInWithEmail`/`signUpWithEmail`/`signInWithGoogle` from `session.ts` | **[panel-fold: GT+Security, fold 1]** Email/password: submits to `signInAction`/`signUpAction` (`src/lib/supabase/actions.ts`, Server Actions using the httpOnly-cookie server client). Google: calls `createClient().auth.signInWithOAuth({provider:'google', options:{redirectTo: ...}})` directly from `src/lib/supabase/browser.ts` (client-side redirect only, writes no session cookie — the callback route's server-side exchange does) | Form markup, state hooks, error-message extraction pattern (`err instanceof Error ? err.message : ...`) — UI shape unchanged, only the 3 async calls' targets swap |

**DEV_MODE three-site preservation — exact line cites carried forward (verified this session against live files, superseding G2's line numbers which were pre-migration):**
1. `src/middleware.ts:40-68` — cookie-injection block, unchanged (still writes `DEV_SESSION_COOKIE` to both `request.cookies` and the outgoing `response.cookies`, still gated on `isDevMode()`).
2. `src/lib/auth/get-user.ts:120-126` — the current file's `timingSafeStringEqual(cookie, DEV_SESSION_COOKIE)` short-circuit inside `verifyIdTokenCookie`. **Post-swap location:** the same short-circuit, same guard order (`isDevMode() && NODE_ENV!=='production' && timingSafeStringEqual(...)`), lifted verbatim into whichever new function(s) replace `verifyIdTokenCookie` — both `getClaimsUid` and `getVerifiedUid` must carry this check (it can't live in only one, since either could be the first call on a fresh dev session).
3. `src/lib/auth/verify-admin.ts:80-82` — `isDevMode()` short-circuit in mode 1, unchanged (`{ uid: 'dev-user', authMethod: 'dev_bypass' }`).

**8KB guard** — currently `MAX_TOKEN_BYTES = 8*1024` at `get-user.ts:40`, applied before any cryptographic work. Supabase JWTs (asymmetric ES256/RS256) run larger than Firebase's ~1.5KB ID tokens due to the signature scheme and any custom claims — **verify the 8KB ceiling is still generous enough** (a raw Supabase access token is typically 800B-1.2KB; 8KB has ~6x headroom, likely fine, but confirm against an actual issued token at Phase 1.2 rather than assuming) and keep the guard's PLACEMENT (before shape check, before SDK call) identical — it exists specifically to bound CPU/memory on a pathological oversized input, a property independent of which provider issued the real tokens.

**Timing-safe compare** — `timingSafeStringEqual` (byte-identical implementation in both `get-user.ts` and `verify-admin.ts` today, mildly duplicated) carries forward unchanged in both files; the CI-credential successor (Item 5) reuses `verify-admin.ts`'s copy, not a new implementation.

### Item 3 — Migrations, in order

**Mapping to the task's requested m1–m4, expanded into 5 files per Spec 114 §7's own sequencing rule (Class C rides Phase 1.3's `profiles` migration; Class B is independent and can land any time; Class A rides Phase 1.4's D6 migration) and §8's "group by class, not table" rule:**

| Task's step | This plan's file(s) | Why split |
|---|---|---|
| m1 (`profiles` + bootstrap) | `226_profiles_admin_bootstrap.sql` | includes Class C RLS per Spec 114 §7 ("naturally authored in the same migration that creates the table") |
| — (RLS Class B, independent) | `227_rls_class_b_default_deny.sql` | Spec 114 §7: "no dependency... there is no reason to sequence it late" — lands right after `profiles` exists, before `entitlements`, so `entitlements` is born already inside the default-deny sweep in m2 rather than needing a follow-up |
| m2 (`entitlements`) | `228_entitlements.sql` | — |
| m3 (D6 uuid + FKs) | `229_uid_uuid_fk_conversion.sql` | — |
| m4 (Class A RLS incl. entitlements as 11th) | `230_rls_class_a_entitlements.sql` | Spec 114 §7: "the natural tail of Phase 1.4's D6 migration, since both touch the identical 10 tables in the identical window" |

Next migration number confirmed via `ls migrations/ | tail`: highest existing is `225_pin_function_search_path.sql` → **starts at `226`.**

---

**`226_profiles_admin_bootstrap.sql` (P1-F3a)**

```sql
-- UP
BEGIN;

CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard Supabase convention: every new auth.users row gets a profiles row
-- automatically, so verify-admin.ts's SELECT never has to special-case a
-- missing row for a freshly-signed-up (non-admin) user.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Spec 114 §5 — self-read/self-update-minus-is_admin, Class C.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- INERT BY DESIGN under D1/raw-pg [panel-fold: Security BLOCKING] — request.jwt.claims
-- is a PostgREST/Data-API setting; Buildo's app connects directly via pg (D1),
-- which never sets it, so current_setting(...) returns NULL and the IS DISTINCT
-- FROM check never raises for ANY caller, service-role or not. This trigger is
-- defense-in-depth for a FUTURE Data-API re-enable, not today's real control.
-- TODAY's real control is app-layer: any future admin-promotion route MUST
-- re-verify caller privilege itself (a service-role connection, or an explicit
-- is_admin check on the acting user) before writing is_admin — this migration
-- does not and cannot enforce that from the DB side while the app connects as
-- table owner. The proper DB-side fix (a dedicated non-owner elevated role with
-- `REVOKE UPDATE(is_admin) FROM app_role`) is recorded as the post-launch D5
-- hardening item — adding it today would be meaningless, since the app
-- connects as owner and bypasses column-level GRANT/REVOKE trivially.
CREATE OR REPLACE FUNCTION prevent_is_admin_self_escalation()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND current_setting('request.jwt.claims', true)::json ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'is_admin may only be changed via the service-role admin path';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- search_path pinned per Spec 114 §5's template [panel-fold: SF] (already
-- corrected this session — see migration 225 precedent for the same fix).

CREATE TRIGGER trg_prevent_is_admin_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_is_admin_self_escalation();

COMMIT;

-- DOWN — comment-only per Rule 6 (matches mig 212/213/215/217 convention).
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_prevent_is_admin_self_escalation ON profiles;
--   DROP FUNCTION IF EXISTS prevent_is_admin_self_escalation();
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP FUNCTION IF EXISTS handle_new_user();
--   DROP TABLE IF EXISTS profiles;
-- COMMIT;
```

**Bootstrap seed mechanism — REDESIGNED [panel-fold: Security HIGH].** The original design waited for the operator's own first PUBLIC sign-in, then matched their `profiles` row by bare email. That design leaves a race window: between 226 landing and the operator's first sign-in, ANY visitor who controls an account at the operator's exact email address (or, for OAuth, whichever Google account first authenticates as that address) can sign up FIRST and occupy the identity — a classic account-squatting attack surface, and a worse one than it sounds because the squatter would then legitimately BE the row `bootstrap-first-admin.js` promotes to `is_admin=true`. `scripts/bootstrap-first-admin.js` (new, one-off ops script per `docs/runbook/README.md`'s "one-off script index" convention) is redesigned to PROVISION the operator's account directly via the service-role Admin API — never raced through public signup:
```js
// One-off, service-role only. Provisions the operator's auth.users row
// directly rather than waiting for (and trusting) a public sign-up race.
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: OPERATOR_EMAIL,
  email_confirm: true, // no email-verification race either — the operator's
                        // identity is established by this script running with
                        // service-role trust, not by racing a public form
});
if (error) throw error; // do not silently continue on a create failure

// handle_new_user's trigger has already fired on the INSERT into auth.users,
// creating the profiles row automatically (same as any signup). Promote it:
UPDATE profiles SET is_admin = true, updated_at = NOW()
WHERE id = $1 AND is_admin = false   -- $1 = data.user.id, NOT an email lookup
RETURNING id;
// Matching by the id the Admin API just returned — not `WHERE email = $1` —
// is the point of this redesign: an email-lookup match reopens exactly the
// squatting risk being closed here (it trusts whichever row happens to hold
// that email, which could be the squatter's, not the operator's).
```
Operator sets their own password afterward via Supabase's password-reset flow (`supabaseAdmin.auth.admin.generateLink({type:'recovery', email: OPERATOR_EMAIL})`, link sent out-of-band) — the script itself never handles or stores a plaintext password. Script reads `OPERATOR_EMAIL` from `.env`, connects via the service-role key throughout, logs `data.user.id` and the `UPDATE`'s row count (0 = "already admin — investigate before re-running," 1 = success). **Recovery if this script fails or is skipped:** the exact same two-step sequence (create-if-absent, then promote) run manually via the Supabase dashboard/Admin API — documented as a runbook entry, not a lockout.

---

**`227_rls_class_b_default_deny.sql` (P1-F3b)** — per Spec 114 §4, one `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` per Class-B table, **zero `CREATE POLICY` statements** (absence = total deny for `anon`/`authenticated`; pipeline/admin connections are table-owner-exempt, D1). Table list = every table NOT in the 10 D6 tables and NOT `profiles`/`entitlements` — enumerate via `SELECT tablename FROM pg_tables WHERE schemaname='public'` MINUS the 12-table exclusion set, generated at authoring time (not hand-typed, to avoid drift against Spec 113 G1's "01_database_schema.md is stale" finding — script the exclusion, don't copy a list). DOWN is the same `ALLOW-DESTRUCTIVE` comment-only convention (disabling RLS is a security-posture rollback, treated like a `DROP TABLE`). **[panel-fold: SF] The literal SQL for this migration is still to be GENERATED, not hand-authored** (per its own stated method — script the table-list exclusion, don't copy one) — this is an explicit P1-F gate, not an open question left to implementation discretion: the generated file MUST be re-reviewed by Schema-Fidelity before it is applied, same as any other migration in this sequence. Folded into the Execution Plan as part of P1-F3b's step (see below).

---

**`228_entitlements.sql` (P1-F3c)**

```sql
-- UP
BEGIN;

-- Spec 116 §4 N2 base shape + two Phase-1 additions beyond N2's literal
-- 4-column list, both load-bearing (Regression Guardian fence — see the
-- Item 4 writer-by-writer walk for why each is required, not decorative):
--   * last_stripe_event_at — the anti-replay/out-of-order-event watermark
--     currently on user_profiles (webhook route L291-338); moving it
--     per-product is required because two DIFFERENT products' Stripe
--     events must not gate each other's replay window.
--   * trial_started_at — currently on user_profiles; per-product because
--     a user's trial clock for product A must be independent of product B.
CREATE TABLE entitlements (
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product               TEXT NOT NULL,
  status                TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_end    TIMESTAMPTZ,
  trial_started_at      TIMESTAMPTZ,
  last_stripe_event_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product),
  CONSTRAINT chk_entitlements_product
    CHECK (product IN ('lead_gen', 'flight_center')),
  CONSTRAINT chk_entitlements_status
    CHECK (status IN ('trial','active','past_due','expired','cancelled_pending_deletion','admin_managed'))
);

CREATE INDEX idx_entitlements_stripe_subscription
  ON entitlements (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Price -> product mapping (Item 4). Reuses the mig-219 pattern: a JSONB
-- logic_variable, operator-editable without a deploy, single source of
-- truth for both the webhook and the reconcile/reactivate routes.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('stripe_price_product_map', 0, '{}'::jsonb,
   'Spec 116 N2 / Phase 1 — maps a Stripe Price ID (price_...) to the Buildo product it entitles (one of entitlements.product''s CHECK values). Empty object = unconfigured; webhook/reconcile/reactivate fall back to lead_gen (OD5 default) and log a WARN when a price is unmapped. Operator sets real price->product pairs from the Stripe dashboard. CONSUMED by src/lib/stripe/client.ts resolvePriceProduct().')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key = 'stripe_price_product_map';
--   DROP TABLE IF EXISTS entitlements;
-- COMMIT;
```

`product` uses a `CHECK` constraint (not an enum type) so widening it for App B (`lot_opt`) later is an `ALTER TABLE ... DROP/ADD CONSTRAINT` (mig-217 rogue-value-precheck pattern), not an `ALTER TYPE ... ADD VALUE` (which can't run inside a transaction pre-PG12-hazard and is generally more friction). **Zero-row table at creation — no HALT precondition needed** (unlike m3/D6, this is a brand-new table, not a conversion of existing data).

---

**`229_uid_uuid_fk_conversion.sql` (P1-F3d)** — D6, the highest-risk migration in this phase. **Pre-condition, enforced IN the migration file via a `DO` block that `RAISE EXCEPTION`s (mirrors mig 217's rogue-value guard pattern) — never a blind proceed:**

```sql
-- UP
BEGIN;

DO $$
DECLARE tbl text; cnt integer; total integer := 0;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'user_profiles','lead_views','lead_view_events','subscribe_nonces',
    'device_tokens','tracked_projects','notifications',
    'notification_dispatches','admin_watchlist','admin_audit_log'
  ] LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO cnt;
    total := total + cnt;
    IF cnt > 0 THEN
      RAISE EXCEPTION 'migration 229 HALT: table % has % rows (expected 0 pre-launch, G10 pinned) — dump the rows, get human sign-off on delete-or-keep, then re-run. NEVER --force.', tbl, cnt;
    END IF;
  END LOOP;
END $$;

-- Per-table ALTER ... TYPE uuid USING <col>::uuid would fail on non-UUID-
-- shaped legacy Firebase uid strings if any row existed; the 0-row guard
-- above makes the USING cast a formality, not a real conversion, on every
-- one of the 10 tables (all currently VARCHAR(128)/TEXT/VARCHAR(100), G9).
ALTER TABLE user_profiles ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE user_profiles ADD CONSTRAINT fk_user_profiles_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- ... (repeat per table; CASCADE for the 8 user-owned tables per D6,
--      admin_watchlist gets SET NULL, admin_audit_log gets RESTRICT — see below)

ALTER TABLE admin_watchlist ALTER COLUMN admin_uid TYPE UUID USING admin_uid::uuid;
ALTER TABLE admin_watchlist ALTER COLUMN admin_uid DROP NOT NULL; -- SET NULL requires nullable
ALTER TABLE admin_watchlist ADD CONSTRAINT fk_admin_watchlist_admin
  FOREIGN KEY (admin_uid) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE admin_audit_log ALTER COLUMN admin_uid TYPE UUID USING admin_uid::uuid;
-- [panel-fold: SF] admin_uid stays NOT NULL (ADR-007 — an audit-log row with
-- no recorded actor is a broken audit trail, not a valid state, so it is
-- NEVER dropped here) and the FK is ON DELETE RESTRICT, not SET NULL: deleting
-- an auth.users row that authored an audit-log entry must fail loudly (the
-- operator has to explicitly decide what happens to that history first), not
-- silently null out who performed the audited action. This corrects the
-- original inline comment, which wrongly generalized admin_watchlist's
-- "SET NULL requires nullable" reasoning onto admin_audit_log.
ALTER TABLE admin_audit_log ADD CONSTRAINT fk_admin_audit_log_admin
  FOREIGN KEY (admin_uid) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Legacy-column disposition (Item 4 decision: DROP, not keep-and-mirror).
-- Folded into THIS migration (the "D6 window") because it touches the same
-- table in the same ALTER session, per the task's explicit instruction.
-- SAFE ONLY because Phase 1.3's code swap (Item 4, all 8 writers + 7
-- readers, W1-W8/R1-R5+R7-R8) has already landed and been tested BEFORE this migration runs —
-- 1.4 is sequenced after 1.3 for exactly this reason (see Execution Plan).
-- ALLOW-DESTRUCTIVE: dropping user_profiles.subscription_status/
-- trial_started_at/last_stripe_event_at — superseded by entitlements
-- (Spec 116 N2). All three columns' data has already been migrated by
-- Phase 1.3's writer/reader swap (Item 4) landing and passing tests BEFORE
-- this migration runs (see the Execution Plan's P1-F3 go/no-go gate) — there
-- is no live reader left on these columns at the moment this DROP executes.
-- [panel-fold: SF]
ALTER TABLE user_profiles DROP COLUMN subscription_status;
ALTER TABLE user_profiles DROP COLUMN trial_started_at;
ALTER TABLE user_profiles DROP COLUMN last_stripe_event_at;

COMMIT;

-- DOWN — comment-only. Reversing a uuid->varchar cast is lossy (original
-- Firebase uids are gone once auth.users itself has been cut over) and
-- the dropped columns cannot be un-dropped without their data (also gone).
-- This DOWN is a schema-shape-only reversal for emergency use, NOT a data
-- recovery path — pairs with the Phase 1 abort clause (Item 7).
-- BEGIN;
--   ALTER TABLE user_profiles ADD COLUMN last_stripe_event_at TIMESTAMPTZ;
--   ALTER TABLE user_profiles ADD COLUMN trial_started_at TIMESTAMPTZ;
--   ALTER TABLE user_profiles ADD COLUMN subscription_status TEXT;
--   ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS fk_admin_audit_log_admin;
--   ALTER TABLE admin_audit_log ALTER COLUMN admin_uid TYPE VARCHAR(128);
--   -- ... (repeat per table)
-- COMMIT;
```

**Contracts + factories same-commit (D6 requirement, task item 8):** `docs/specs/_contracts.json`'s `schema.firebase_uid_max: 128` key retires; `src/tests/contracts.infra.test.ts`'s two consumers (`migrations/075_user_profiles.sql` VARCHAR pattern, `migrations/076_lead_views_user_id_widen.sql` pattern) both retire in the SAME commit since the columns they assert against no longer exist as VARCHAR after 229 lands; `mobile/src/constants/contracts.ts`'s mirrored value retires; `src/tests/factories.ts:129,195`'s `user_id: 'firebase-uid-abc123'` literal becomes a real uuid literal (e.g. `'00000000-0000-0000-0000-000000000001'`) in the SAME commit — a factory still emitting a non-uuid string after 229 lands breaks every DB-integration test that inserts it.

---

**`230_rls_class_a_entitlements.sql` (P1-F3e)** — Spec 114 §3.1/§3.2 templates verbatim for the 10 D6 tables (owner-only `SELECT/INSERT/UPDATE/DELETE` per-table operation set per the table's real write pattern — e.g. `notification_dispatches` gets `SELECT`-only, matching the spec's own note), `admin_watchlist`/`admin_audit_log` per the `is_admin`-gated subtype-2 templates verbatim (copy from Spec 114 §3.2's SQL blocks — they're already implementation-ready), **plus `entitlements` as the 11th Class A owner-read table** (Spec 114 §3.1 amendment cited in `.cursor/active_task.md` Phase 1.4: *"the catalog's Class A is enumerated, not definitional"*):
```sql
CREATE POLICY entitlements_select_own ON entitlements
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy — entitlements is server-written only
-- (webhook, admin routes, trial-init helper), never client-writable, per
-- the same reasoning Spec 114 §3.1 gives for notification_dispatches.
```
pgTAP suite additions (`supabase/tests/rls_class_a.test.sql`): one positive (`auth.uid()` matching a row can SELECT) + one negative (a different `auth.uid()` gets zero rows) case for `entitlements`, per Spec 114 §10's "every `CREATE POLICY` gets a positive and a negative test" rule.

**pgTAP harness is greenfield [panel-fold: Integration].** There is no existing `supabase/tests/` directory or pgTAP suite in the repo to extend — this plan's `rls_class_a.test.sql` (and 230's Class-B introspection check, Item 3) is the FIRST pgTAP suite Buildo has ever authored. Treated as an explicit sub-step, not an assumed extension of an existing harness: (1) create `supabase/tests/` and its pgTAP bootstrap (schema, `pgtap` extension enablement, the project's test-runner conventions); (2) author the first suite against it; (3) wire `supabase test db` (or the CLI's current equivalent) into whatever invokes it — locally and, if applicable, CI; (4) document the release-gating cadence (when pgTAP runs relative to `npm run verify`/pre-commit/CI) in the runbook, since nothing today defines when this new test class is expected to run. Folded into the Execution Plan as P1-F3f.1 below.

---

### Item 4 — Webhook re-point + writer/reader swap (Spec 116 N2, OD3, OD5)

**Price→product mapping — concrete shape:** `logic_variables.stripe_price_product_map` (seeded in `228_entitlements.sql`, JSONB object `{"<price_id>": "<product>"}`). New helper in `src/lib/stripe/client.ts`, **with a module-level TTL cache [panel-fold: DS]** (~60s) so a webhook burst doesn't re-query `logic_variables` on every event — the map changes only when an operator edits it in the dashboard, so a short staleness window is an explicit, acceptable tradeoff, not an oversight:
```ts
let priceProductMapCache: { map: Record<string, string>; expiresAt: number } | null = null;
const PRICE_PRODUCT_MAP_TTL_MS = 60_000;

export async function resolvePriceProduct(pool: Pool, priceId: string | null): Promise<string> {
  if (!priceId) return 'lead_gen'; // OD5 default: unmapped/absent -> lead_gen
  if (!priceProductMapCache || Date.now() >= priceProductMapCache.expiresAt) {
    const rows = await pool.query<{ variable_value_json: Record<string, string> }>(
      `SELECT variable_value_json FROM logic_variables WHERE variable_key = 'stripe_price_product_map'`,
    );
    priceProductMapCache = {
      map: rows.rows[0]?.variable_value_json ?? {},
      expiresAt: Date.now() + PRICE_PRODUCT_MAP_TTL_MS,
    };
  }
  const product = priceProductMapCache.map[priceId];
  if (!product) {
    logWarn('[stripe/resolve-price-product]', 'unmapped Stripe price, defaulting to lead_gen', { priceId });
    return 'lead_gen';
  }
  return product;
}
```
**Where the price ID comes from per event type:** `customer.subscription.created`/`.updated`/`.deleted` carry `sub.items.data[0]?.price?.id` directly — these become the AUTHORITATIVE product-resolution events. `checkout.session.completed` does NOT carry price data without an extra `expand: ['line_items']` retrieve call (not requested in the current webhook's `constructEvent` payload) — **rather than adding a Stripe API round-trip inside the webhook handler** (a latency/reliability cost for a value the very-next `subscription.created` event will supply moments later), `checkout.session.completed` keeps writing the OD5-default product (`'lead_gen'`) and the authoritative product assignment corrects itself when `subscription.created` arrives (same "belt and suspenders, `subscription.created` is the real signal" relationship the code comments already describe for the current single-product design, L104-112).

**Net-new extraction (task-specified):** `sub.id` → `stripe_subscription_id`; `sub.current_period_end` (Unix seconds) → `current_period_end` (`new Date(sub.current_period_end * 1000)`). Both read directly off the `Stripe.Subscription` object already present in `classifyEvent`'s `customer.subscription.*` cases — no new Stripe API call.

**`deriveEffectiveStripeStatus` becomes per-product** (`src/lib/stripe/client.ts`, replaces the single-status version — both its call sites, W4 and W7, are rewritten in this same phase so nothing depends on the old signature surviving):
```ts
export async function deriveEffectiveStripeStatusByProduct(
  pool: Pool, subs: Stripe.Subscription[],
): Promise<Map<string, 'active' | 'past_due' | 'expired'>> {
  const byProduct = new Map<string, Stripe.Subscription[]>();
  for (const sub of subs) {
    const priceId = sub.items.data[0]?.price?.id ?? null;
    const product = await resolvePriceProduct(pool, priceId);
    byProduct.set(product, [...(byProduct.get(product) ?? []), sub]);
  }
  const result = new Map<string, 'active' | 'past_due' | 'expired'>();
  for (const [product, prodSubs] of byProduct) {
    result.set(product, deriveEffectiveStripeStatus(prodSubs)); // reuse the existing single-status priority logic per group
  }
  return result;
}
```

**Writer-by-writer swap (all 7 sites, W1–W7 from P1-G3):**

- **W1 (webhook)** — the transactional UPDATE (route.ts **L319-328** [panel-fold: Integration, line-cite corrected from L306-317/L318-327]) becomes an `INSERT ... ON CONFLICT (user_id, product) DO UPDATE`. **Ordering key is the STRIPE EVENT timestamp, not wall clock [panel-fold: DS MED]:** `$6`/`last_stripe_event_at` is populated from the inbound `event.created` (Stripe's own event timestamp, Unix seconds → `new Date(event.created * 1000)`), never from `NOW()`/wall-clock time at the moment the webhook happens to be processed — Stripe does not guarantee delivery order, so two events for the same `(user_id, product)` can arrive with their PROCESSING order reversed from their CREATION order (retry, queueing delay, webhook endpoint restart mid-backlog); keying the out-of-order guard on wall clock would let a late-arriving-but-actually-older event win. A new regression test (`stripe-webhook-resubscriber.regression.test.ts`, Execution Plan P1-F5.2) sends two `customer.subscription.updated` events for the same `(user_id, product)` in REVERSE chronological processing order (newer `event.created` processed first, older `event.created` processed second) and asserts the older event's `status`/`current_period_end` never overwrite the newer one's — the fence must hold when processing order and creation order disagree, not just when they happen to match:
  ```sql
  INSERT INTO entitlements (user_id, product, status, stripe_subscription_id, current_period_end, last_stripe_event_at, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
  ON CONFLICT (user_id, product) DO UPDATE
    SET status = EXCLUDED.status,
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, entitlements.stripe_subscription_id),
        current_period_end = EXCLUDED.current_period_end,
        last_stripe_event_at = EXCLUDED.last_stripe_event_at,
        updated_at = NOW()
  WHERE (entitlements.last_stripe_event_at IS NULL OR entitlements.last_stripe_event_at < EXCLUDED.last_stripe_event_at)
    AND entitlements.status IS DISTINCT FROM 'cancelled_pending_deletion'
    AND ($3 = 'active' OR entitlements.stripe_subscription_id IS NOT DISTINCT FROM EXCLUDED.stripe_subscription_id)
  ```
  preserving, in order: the out-of-order-event fence (now per `(user_id,product)` row), the deletion fence, the superseded-subscription fence (adapted from `stripe_customer_id` equality to `stripe_subscription_id` equality — **note this is a MEANING CHANGE from the original fence, flagged as high-uncertainty item below**: the original fence compared the CUSTOMER id (one customer, one implicit subscription); with per-product entitlements, a customer can hold MULTIPLE subscriptions (one per product) simultaneously, so the correct "is this the subscription I currently think is live for THIS product" fence must key on `stripe_subscription_id`, not `stripe_customer_id` — verify this reasoning against a live multi-subscription Stripe test fixture before trusting it in production). The **customer-id-fallback identification path** (W1's `outcome.userId === null` branch, used by `invoice.payment_succeeded`/`_failed`) still resolves `user_id` via `user_profiles.stripe_customer_id` (UNCHANGED — that column stays, see below) but then must resolve WHICH product via the invoice's associated subscription (`invoice.subscription` field, a subscription ID) → look up that subscription's price → `resolvePriceProduct`, rather than defaulting blindly — **an invoice with no resolvable subscription reference falls back to the OD5 default (`lead_gen`) and logs a WARN**, matching the pattern already used elsewhere in this design.
- **W2 (`expiration.ts`)** — both functions gain a `product: string` parameter. `applyFallbackTrialInitIfNeeded(pool, uid, product)`: `INSERT INTO entitlements (user_id, product, status, trial_started_at, created_at, updated_at) SELECT $1, $2, 'trial', NOW(), NOW(), NOW() WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id=$1 AND onboarding_complete=true AND (account_preset IS NULL OR account_preset != 'manufacturer')) AND NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id=$1 AND product=$2)` — the `NOT EXISTS` replaces the old `trial_started_at IS NULL AND subscription_status IS NULL` double-guard with a single existence check (a row existing AT ALL for that product means "already handled," matching the old intent that ANY non-null status meant "don't re-init"). `applyTrialExpirationIfNeeded(pool, uid, product)`: `UPDATE entitlements SET status='expired', updated_at=NOW() WHERE user_id=$1 AND product=$2 AND status='trial' AND trial_started_at IS NOT NULL AND trial_started_at + INTERVAL '14 days' <= NOW()`. Both callers (only `user-profile/route.ts` GET today) pass `'lead_gen'` explicitly.
- **W3 (`user-profile/route.ts` PATCH)** — trial-start block (L347-354) becomes `INSERT INTO entitlements (user_id, product, status, trial_started_at, created_at, updated_at) VALUES ($1,'lead_gen','trial',NOW(),NOW(),NOW()) ON CONFLICT (user_id, product) DO NOTHING`, guarded the same way (`fields.onboarding_complete===true && existing.account_preset!=='manufacturer'`), **run as a SEPARATE statement outside the existing dynamic `setClauses` SET-clause builder** (entitlements is a different table — can't ride the same `UPDATE user_profiles SET ...` statement), inside the SAME transaction boundary as the `user_profiles` UPDATE (this route doesn't currently use `withTransaction` — **adding one is a required change**, since a mid-write failure between the two statements must not leave onboarding-complete=true with no entitlement row).
- **W4 (reactivate)** — rewritten to iterate ALL of the customer's live Stripe subscriptions (not one derived scalar): call `deriveEffectiveStripeStatusByProduct`, then for each `(product, status)` pair, `UPDATE entitlements SET status=$3, last_stripe_event_at=NOW(), updated_at=NOW() WHERE user_id=$1 AND product=$2`; then a catch-all `UPDATE entitlements SET status='expired', updated_at=NOW() WHERE user_id=$1 AND status='cancelled_pending_deletion'` for any product with no live Stripe subscription found (so nothing is left stuck in the deletion state). The `manufacturer` special-case (`restoredStatus='admin_managed'`, no Stripe read) still applies to `lead_gen` specifically (the only product a manufacturer account plausibly has today) — **flag for panel: does a manufacturer's reactivation need to touch OTHER products' entitlement rows, or is `admin_managed` genuinely `lead_gen`-only at cutover?** This plan assumes the latter (zero users, single product live) but the code should not hardcode an assumption that breaks when App B ships.
- **W5 (delete)** — the single UPDATE (L48-55) becomes `UPDATE entitlements SET status='cancelled_pending_deletion', updated_at=NOW() WHERE user_id=$1` — **no `product=` filter, fans out to every entitlement row the user has**, matching the account-level nature of deletion. Runs in the SAME transaction as the `user_profiles.account_deleted_at` UPDATE (today they're two separate `await query(...)` calls, not wrapped in `withTransaction` — **adding one is required** for the same reason as W3).
- **W6 (admin PATCH)** — `AdminUserMutationSchema` (`src/lib/admin/user-management-schemas.ts`) gains `product: z.enum(['lead_gen','flight_center']).optional()` on the `extend_trial`/`revoke`/`suspend` mutation variants (default `'lead_gen'` in the route when omitted, for the single-product window); each case's `UPDATE user_profiles SET subscription_status=...` becomes an `entitlements` UPSERT scoped to the resolved product, still inside the SAME `withTransaction` + `writeAdminAudit` pattern (unchanged structurally — only the target table/column changes). `delete` case fans out like W5 (no product filter).
- **W7 (reconcile)** — GET becomes per-product: `SELECT product, status FROM entitlements WHERE user_id=$1`, cross-referenced against `deriveEffectiveStripeStatusByProduct`'s live-Stripe map, returning an ARRAY of `{product, stored_status, stripe_status, drift}` instead of one scalar triple — **this is a response-SHAPE change to an admin-only route** (no mobile/contract implications, confirmed by grep — only `admin-subscription-ops.infra.test.ts` and the admin UI consume it, both rewritten this phase). POST accepts an optional `product` field to reconcile one product, or reconciles every product with drift when omitted (loop, one `writeAdminAudit` row per product actually changed).
- **W8 (`subscribe/exchange/route.ts`) — Stripe Customer reuse, NEW [panel-fold: GT HIGH].** Adopts one-Customer-per-user rather than the current per-checkout create: before creating a Stripe Checkout Session, `subscribe/exchange/route.ts` looks up `user_profiles.stripe_customer_id`; if present, passes `customer: <id>` into the Checkout Session creation call so Stripe reuses the existing Customer; a NEW Stripe Customer is created ONLY when the column is absent (first-ever checkout for that user), and the returned Customer id is persisted back onto `user_profiles.stripe_customer_id` at that point. This makes the invoice-event fallback identification path (W1's `outcome.userId === null` branch) sound: it depends on `stripe_customer_id` being a stable 1:1 bridge to exactly one `user_id`, which only holds if checkout never mints a second Customer for the same user. `stripe_customer_id` legitimately stays a `user_profiles` column (customer-level, not product-level — see the Item 4 "Legacy column disposition" note below for why `entitlements` doesn't absorb it). **New test [panel-fold: GT HIGH]:** two separate product checkouts (`lead_gen` then `flight_center`) for the same user assert the SAME `stripe_customer_id` on both resulting Checkout Sessions — i.e., the second checkout reuses rather than duplicates the Customer.

**Readers (R1–R5, plus R7/R8 from P1-G3):**
- **R1 (`get-user-context.ts`)** — `subscription_status` field REMOVED from `UserContext` (P1-G3 confirms only R2 consumes it).
- **New helper `src/lib/subscription/entitlement.ts`:** `getEntitlementStatus(pool, uid, product): Promise<{status: string; trial_started_at: string|null} | null>` — a single indexed `SELECT status, trial_started_at FROM entitlements WHERE user_id=$1 AND product=$2`. **Deliberately NOT folded into `get-user-context.ts`** — that helper is called by routes (flight-board, leads/detail, leads/search) that have zero use for entitlement data; adding a JOIN there for 2 consumers out of ~6 call sites is unjustified query cost. This is a real architectural choice, not incidental — flagged for panel scrutiny.
- **R2 (`leads/view/route.ts`)** — `ctx.subscription_status==='trial'` → `(await getEntitlementStatus(pool, ctx.uid, 'lead_gen'))?.status === 'trial'`.
- **R3 (`subscribe/session/route.ts`)** — the single `FOR UPDATE` lock (L92-95) splits into TWO locks in the same transaction: `SELECT account_deleted_at FROM user_profiles WHERE user_id=$1 FOR UPDATE` (deletion-blocked check — genuinely account-level, doesn't need `entitlements` at all) and `SELECT status FROM entitlements WHERE user_id=$1 AND product=$2 FOR UPDATE` (portal-routed check, product supplied by the checkout request — defaults to `'lead_gen'` when the route doesn't yet accept a product param, which it doesn't today). **The second lock may find zero rows** (first-time subscriber, no entitlement row yet) — that's fine, `FOR UPDATE` on zero matching rows takes no lock and the route proceeds to mint a checkout nonce normally.
- **R4 (`parcels/lookup/route.ts`)** — `ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '')` → `ACTIVE_SUBSCRIPTION_STATUSES.has((await getEntitlementStatus(pool, ctx.uid, 'lead_gen'))?.status ?? '')` (OD5: parcel-tool reads `lead_gen`).
- **R5 (admin directory)** — GET: `LEFT JOIN entitlements e ON e.user_id = up.user_id AND e.product = 'lead_gen'` added to the directory query, `subscription_status` filter/column becomes `e.status`; POST provisioning: after the `user_profiles` INSERT, a second `INSERT INTO entitlements (user_id, product, status, created_at, updated_at) VALUES ($uid,'lead_gen','admin_managed',NOW(),NOW()) ON CONFLICT (user_id,product) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`, both inside the existing (or newly-added, if not already present) transaction.
- **R7 (`admin/users/[uid]/route.ts` GET) [panel-fold: Integration].** `DETAIL_COLUMNS` currently selects `subscription_status`/`trial_started_at` straight off `user_profiles` for the admin user-detail view — re-pointed to `getEntitlementStatus(pool, uid, 'lead_gen')` post-229, same as R2/R4's pattern (single-product window; the detail view gains a per-product breakdown only if/when a second product ships).
- **R8 (`admin/users/[uid]/route.ts` PATCH, `revoke`/`suspend` cases) [panel-fold: Integration].** L271's `oldValue` audit-log snapshot reads `subscription_status` off `user_profiles` immediately before the mutation, to record what changed. Also re-derived from `entitlements` post-229: `oldValue` is populated from the SAME `getEntitlementStatus` read (or an equivalent `SELECT status FROM entitlements WHERE user_id=$1 AND product=$2 FOR UPDATE`, since W6 already needs a row-lock here) rather than a stale `user_profiles` column that no longer exists after 229 lands.

**Legacy `user_profiles.subscription_status`/`trial_started_at`/`last_stripe_event_at` disposition: DROP** (not keep-and-mirror), executed in `229_uid_uuid_fk_conversion.sql` (the "D6 window," per task instruction), AFTER all 8 writers (W1-W8) + 7 readers (R1-R5, R7-R8) above have landed and passed tests in the SAME 1.3 execution step. `stripe_customer_id` and `stripe_cancel_failed_at` **STAY on `user_profiles`** — both are customer-level (not product-level) Stripe bookkeeping: `stripe_customer_id` is the identity bridge used to resolve `user_id` from webhook events lacking metadata, and `cancelAllStripeSubscriptions` cancels ALL of a customer's subscriptions regardless of product in one call (P26-26D design, unaffected by per-product entitlements) — retiring either would break the customer-id-fallback identification path and the delete-time/admin-delete cancel flow.

**Mobile contract freeze (task-specified, R6):** `GET /api/user-profile`'s `CLIENT_SAFE_SELECT_LIST`-based query (`user-profile/route.ts` GET, currently a flat `SELECT ... FROM user_profiles`) becomes:
```sql
SELECT up.user_id, up.trade_slug, /* ...unchanged columns... */,
       e.status AS subscription_status, e.trial_started_at
FROM user_profiles up
LEFT JOIN entitlements e ON e.user_id = up.user_id AND e.product = 'lead_gen'
WHERE up.user_id = $1
```
— the response JSON keeps the exact field names `subscription_status`/`trial_started_at` mobile's `UserProfileSchema` (`src/lib/userProfile.schema.ts:27-30`) already parses, sourced now from `entitlements` instead of `user_profiles`. **Zero mobile code changes required in Phase 1** — Phase 2 (2.2) is where mobile's OWN gate logic moves to a genuine per-product lookup (Spec 116 N3); until then it keeps reading one flattened field exactly as today. Confirmed no other mobile file reads `subscription_status` beyond `useUserProfile`'s Zod-parsed response (grep scope: `mobile/src/hooks/useUserProfile.ts`, `mobile/app/(app)/_layout.tsx` — read for context this session, not modified [panel-fold: Integration, path corrected]).

**Null-contract breadth [panel-fold: Integration].** The `LEFT JOIN` above MUST yield `subscription_status: null` (never `undefined`, never a JOIN error) for any user with no `entitlements` row at all — not just the already-covered "has a row, status is some string" case. This is a wider blast radius than a single hook: mobile consumers of this exact field are `useUserProfile` itself, `app/(app)/_layout.tsx` (13 separate reads of the profile object across its gating logic), `app/index.tsx:70`, and `flight-board.tsx:277` — four call sites, not one, all of which must tolerate `null` without throwing or mis-gating. **New explicit test:** a response-shape assertion (added to `user-profile-trial.infra.test.ts` or a new case in the P1-F5.2 rewrite) that a user with zero `entitlements` rows gets back `subscription_status: null, trial_started_at: null` from `GET /api/user-profile` — not an omitted key, not a 500 — since a LEFT JOIN with no match naturally produces `NULL` columns and the API layer must pass that through as JSON `null` rather than accidentally coalescing it to `undefined` (which `JSON.stringify` would drop, silently changing the response shape mobile's Zod schema depends on for its "entitlement-less user" path).

### Item 5 — Auth dashboard config checklist (human, Phase 1.2)
- [ ] Email provider enabled; Google OAuth provider enabled (client id/secret from Google Cloud Console — reuse or rotate the existing Firebase-era OAuth client, operator decision).
- [ ] Custom SMTP configured (D7) — Supabase's built-in sender's default rate limit is documented as unsuitable even for test-account creation; set BEFORE any 1.3 test sign-in.
- [ ] Email rate limits raised in the dashboard to a pre-launch-testing-appropriate value.
- [ ] Redirect URL allowlist: production web URL(s), Vercel preview wildcard, **`com.buildo://`** (mobile deep-link scheme — needed by Phase 2, configured here per the program plan's explicit note that this is "the rest of the dashboard auth work").
- [ ] Confirm/record access-token and refresh-token lifetimes (Item 1) — write the confirmed values into Spec 13 as an amendment.
- [ ] TOTP MFA enrollment enabled for the auth project; **enrollment itself happens per-admin at 1.3(b)**, not a global dashboard toggle beyond "MFA is available."
- [ ] Break-glass validation: with MFA NOT yet enrolled, confirm the successor CI-credential path (Item 6 below) still reaches admin routes — this is the state Phase 1.3(a)/(b) runs in before (c) retires `ADMIN_USER_IDS`.

### Item 6 — `X-Admin-Key` successor + MFA (Phase 1.3(b)/(c))
Per Spec 13 §3.7: scoped token, never `service_role`, IP-restricted, same `timingSafeStringEqual` mechanics. Concrete design: new env var `CI_ADMIN_TOKEN` (Vault-stored per the D8 `CRON_SECRET` precedent — not a plain `.env` value in the target state, though `.env` is acceptable for local dev), checked in `verify-admin.ts` mode 2 alongside a new `CI_ADMIN_ALLOWED_IPS` allowlist evaluated against **`request.ip` [panel-fold: DS+Gm] — the Vercel-set request property — never `x-forwarded-for` directly.** `x-forwarded-for` is a raw header a client can set on its own request to a proxy hop before Vercel's edge normalizes it; `request.ip` is what Vercel's platform itself populates after that normalization and is the documented trustworthy source for the caller's real IP on Vercel deployments, whereas trusting `x-forwarded-for`'s "first hop" directly re-opens exactly the spoofing risk an IP allowlist exists to close. (This also resolves the earlier open trust-caveat on this header — see the Panel Adjudication note that this fold's `request.ip` design is now the settled answer, not a question deferred to implementation.) MFA: after `profiles.is_admin` resolves true in mode 3, ADD a check via the request-scoped Supabase server client: `const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if (data?.currentLevel !== 'aal2') return null /* → 401, admin UI shows an MFA-challenge prompt distinct from plain unauthenticated */`. Sequencing (task-mandated, load-bearing): (a) `profiles`+bootstrap lands → (b) MFA enrolled + break-glass verified end-to-end (an admin can still reach admin routes via the `CI_ADMIN_TOKEN` path if their MFA is lost) → **only then** (c) `ADMIN_USER_IDS` env-var allowlist code path is deleted from `verify-admin.ts` mode 3. Reversing (b) and (c) is the MFA-lockout failure mode Spec 13 §4a names explicitly.

**MFA enrollment — minimal requirements for 1.3(b) [panel-fold: DS].** Full enrollment-UI detail is deferred to implementation, but the design is bound by three minimum requirements, not left open: (1) enrollment is gated behind an already-authenticated admin session — an unauthenticated visitor can never reach the enrollment flow; (2) the TOTP secret is server-generated (via `supabase.auth.mfa.enroll({factorType:'totp'})`, which returns the QR-encodable secret) and shown to the admin exactly ONCE at enrollment time — it is never re-displayed or logged after that screen; (3) backup/recovery codes are generated at enrollment, shown to the admin exactly once (same one-time-display rule as the TOTP secret), and stored server-side only in HASHED form — never persisted in plaintext, matching the timing-safe/no-plaintext-secret posture already used elsewhere in this plan (`timingSafeStringEqual`).

---

## Standards Compliance (§11 walk)

**Database Impact = YES:**
- [x] UP+DOWN for all 5 migrations (226-230) — DOWN is comment-only per the repo's `ALLOW-DESTRUCTIVE` convention for 229/230 (security/data-loss reversals), executable for 227/228 where safe.
- [x] Backfill strategy for 100K+ row ALTERs: N/A — all 10 D6 tables are pinned 0-row (G10, re-verified via 229's own `DO` block HALT precondition); `entitlements`/`profiles` are new empty tables. No backfill.
- [x] `src/tests/factories.ts` updated same-commit as 229 (uuid literal swap, L129/195) + a new `EntitlementFactory` for the `entitlements` table shape.
- [x] **`npm run db:generate` DECIDED [panel-fold: SF] — no open question remains.** `npm run db:generate` + `npm run typecheck` run in the SAME commit as `229_uid_uuid_fk_conversion.sql` (and, transitively, 226-230's other new tables). The earlier Spec 88-era deferral ("repo-wide drizzle drift + user's 7 checksum-changed migrations") is handled explicitly rather than left as an at-implementation-time confirmation: if `db:generate` reproduces that same pre-existing repo-wide drift when run against 226-230, the commit is SCOPED to only the new/changed table types this phase actually touches (`profiles`, `entitlements`, the 10 D6 tables' FK/type changes) — the unrelated drizzle-drift diff is explicitly excluded from this commit and filed as its own separate item (not silently absorbed, not blocking this phase on an unrelated pre-existing problem).

**API Route Created/Modified** (8 writers + 7 readers, W1-W8/R1-R5+R7-R8, + `LoginForm.tsx`'s implicit new auth calls):
- [x] Response envelope `{data, error, meta}` — unchanged everywhere; only internals swap.
- [x] `logError(tag, err, context)` — every new/touched catch block keeps this pattern (verified present in all files read this session; carried forward, no new bare catches introduced by the entitlements swap).
- [x] Unhappy-path test cases: bad/missing Supabase session cookie/Bearer token → 401 (mirrors today's Firebase 401 paths); JWKS fetch failure → 500 with distinguishable `logError` (Spec 13 §4a); expired/malformed 3-segment shape → null/401; MFA `aal2` not reached → 401 with MFA-challenge signal; unmapped Stripe price → WARN + `lead_gen` fallback (not an error path, but must be asserted in the webhook test rewrite); `entitlements` row absent for a first-time subscriber → treated as `expired`/no-access, not a 500.
- [x] Route guarded in `src/middleware.ts` — `classifyRoute` table unchanged (no new route paths introduced this phase).
- [x] No `.env` secrets exposed client-side — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only in `src/lib/supabase/browser.ts`; `SUPABASE_SECRET_KEY`/`CI_ADMIN_TOKEN` never referenced outside `src/lib/db/`, `src/lib/supabase/server.ts`, `scripts/` (Spec 113 §3 rule).
- [x] Projected fields only — `entitlements` reads use explicit column lists (`getEntitlementStatus`'s `SELECT status, trial_started_at`), never `SELECT *`.
- [x] **W3 (`user-profile/route.ts` PATCH) `withTransaction` addition — explicit verification line [panel-fold: DS].** Item 4's W3 adds a `withTransaction` wrapper around the `user_profiles` UPDATE + the new `entitlements` trial-start INSERT that didn't exist before this phase; verify at implementation (and assert in the rewritten test) that a forced failure of the SECOND statement (the `entitlements` INSERT) rolls back the FIRST (the `user_profiles` UPDATE) — i.e. `onboarding_complete=true` is never left committed with no corresponding entitlement row. This is called out explicitly because it's new transactional surface, not an existing pattern being carried forward untouched.

**Contracts:** `firebase_uid_max` retirement + `contracts.infra.test.ts` update, same commit as `229_uid_uuid_fk_conversion.sql` (Item 3).

**Cross-Layer Contracts Check — BINDING, not a recommendation [panel-fold: Gm NIT].** `_contracts.json` gains two new keys, same commit as `228_entitlements.sql`: `schema.entitlement_products` (`['lead_gen','flight_center']`) and `schema.entitlement_statuses` (`['trial','active','past_due','expired','cancelled_pending_deletion','admin_managed']`), mirroring the migration's two `CHECK` clauses exactly. `contracts.infra.test.ts` gains a row asserting the migration's `CHECK` clause values match these two keys. The Zod schemas this plan introduces — `AdminUserMutationSchema`'s new `product` field (Item 4, W6) and any `entitlements`-shaped response schema — are written to CONSUME these two `_contracts.json` keys (e.g. `z.enum(CONTRACTS.schema.entitlement_products)`), not to hand-roll their own literal union, so a future product/status addition can't silently drift between the DB constraint, the contracts file, and the Zod validation.

**UI:** `LoginForm.tsx` layout unchanged (desktop-first `md:`, matches Admin domain rule) — only the 3 async call bodies change.

**Migration/SQLFluff/`validate-migration.js`:** all 5 new files run through the existing gate before landing; `229`'s `DROP COLUMN` statements require the repo's "explicit user confirmation comment" convention (`validate-migration.js` flags bare `DROP COLUMN`) — include the confirmation comment citing this plan + the task's explicit DROP ruling.

---

## Execution Plan

**P1-F1 — Item 1 build (session mechanism):**
- [ ] P1-F1.1: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/actions.ts` — Context7 lookup on `@supabase/ssr`'s current API (`createBrowserClient`/`createServerClient` signatures, `cookieOptions` shape, `getAll`/`setAll` shape, Next.js 15 async-`cookies()` interaction) BEFORE writing, per CLAUDE.md Prime Directive #9. **This lookup MUST also confirm `getClaims()` exists with the expected signature in the exact `@supabase/ssr` version pinned in `package.json`** [panel-fold: Gm+DS, Item 1 design-note point 4] — if it doesn't, the middleware design falls back to `getUser()` and Spec 13 needs an amendment before P1-F2.6 proceeds.
- [ ] P1-F1.2: Confirm P1-G0 (does a working `/api/auth/session` predecessor exist anywhere in git history or a branch this search missed?) — does not block P1-F1.1, but must be answered before Phase 1.6's OUTPUT review closes.
- [ ] P1-F1.3: **RESOLVED by panel adjudication [panel-fold: Gm+DS CRITICAL, adjudicated GT]** — no longer an open design question. Item 1's design note now specifies the concrete resolution: `getClaims()` stays (Spec 13 §3.2 cost rules), wrapped in try/catch, FAIL-OPEN on error (log + pass through unchanged), with a code-comment contract and a regression test (`middleware.security.test.ts`, P1-F5.1) asserting routing decisions are unaffected by a simulated `getClaims`/JWKS failure. This step is now "implement per the design note," not "resolve with a reviewer."

**P1-F2 — Item 2 (7+1 chokepoint swap), maps to program-plan 1.1:**
- [ ] P1-F2.1: `firebase-admin.ts` deleted; the additional dynamic-import/Admin-SDK call sites (P1-G5, corrected line cites [panel-fold: Integration]) swapped to Supabase Admin API equivalents in the SAME commit: `user-profile/delete/route.ts:92` (`revokeRefreshTokens` → `supabase.auth.admin.signOut(uid,'global')` or a targeted refresh-token invalidation, confirm exact GoTrue method name at implementation), `admin/users/[uid]/route.ts:285` (`deleteUser` in the `delete` mutation case → `supabase.auth.admin.deleteUser(uid)`), and **`admin/users/route.ts` POST's 4-method block across 2 code blocks [panel-fold: Integration, fold 13]:** `createUser` (L156 → `supabase.auth.admin.createUser({email, email_confirm:true, ...})`), `getUserByEmail` (L162 → `supabase.auth.admin.listUsers()` filtered client-side, or the SDK's dedicated by-email lookup if `@supabase/supabase-js`'s pinned version exposes one — confirm at implementation), `generatePasswordResetLink` (L169 → `supabase.auth.admin.generateLink({type:'recovery', email})`), rollback `deleteUser` (L205 → `supabase.auth.admin.deleteUser(uid)`, same as the mutation-case swap above).
- [ ] P1-F2.2: `get-user.ts` rewrite — `getClaimsUid`/`getVerifiedUid` split (the latter returning the branded `VerifiedUid` type per fold 18), 8KB guard + shape check (Bearer-path only, per Item 1's shape-check reconciliation) + Bearer/cookie precedence + DEV_MODE bypass all preserved per the Item 2 table.
- [ ] P1-F2.3: `verify-admin.ts` mode-3 swap to `profiles.is_admin`; MFA gate added (Item 6, minimal-requirements per fold 22) — **but MFA enforcement itself is NOT turned on until 1.3(b)**, so this step lands the CODE PATH behind a check that's a no-op (or dev-mode-equivalent) until 1.3. Mode 2 (`X-Admin-Key` successor) uses `request.ip`, not `x-forwarded-for` (fold 19).
- [ ] P1-F2.4: `get-user-context.ts` — `subscription_status` removed from `UserContext`; auth-provider swap only, trade_slugs logic untouched.
- [ ] P1-F2.5: `auth/config.ts` **DELETED outright — decision settled, no shim [panel-fold: Integration+GT convergent].** Exactly 1 consumer (`session.ts`, deleted this same phase); no import-path migration beyond that single deletion. No delete-vs-shim ambiguity remains to resolve at implementation time.
- [ ] P1-F2.6: `middleware.ts` — `updateSession` wired in with explicit `cookieOptions: {httpOnly:true, secure:true, sameSite:'lax'}` (fold 1) and the try/catch fail-open `getClaims()` contract (fold 2); DEV_MODE block untouched; **decide and implement the middleware-level `X-Admin-Key` duplicate removal** (Item 2's `verify-admin.ts` row recommendation).
- [ ] P1-F2.7: `instrumentation.ts` — Firebase boot call removed, Sentry untouched.
- [ ] P1-F2.8: `route-guard.ts` — confirmed zero required changes beyond the narrowed-role note; **grep-verify BOTH `isValidSessionCookie` AND `SESSION_COOKIE_NAME`** are referenced only inside `DEV_MODE`-guarded code post-swap (fold 24) — a hit outside that guard is a live bug, not stranded dead code. *CORRECTION (2026-07-19, Guardian F2): drafting error — middleware's non-dev `isValidSessionCookie(bearerToken)` Bearer-presence use is the intended transport-agnostic design (program-plan G2 + Spec 13 §3.5); the DEV_MODE-only constraint applies to the `SESSION_COOKIE_NAME` cookie path only. See the Item 2 route-guard row's correction note.*
- [ ] P1-F2.9: `src/lib/supabase/actions.ts` built — `signInAction`/`signUpAction` Server Actions using the httpOnly server client (fold 1).
- [ ] P1-F2.10: `LoginForm.tsx` — email/password calls swapped to post to `actions.ts`'s Server Actions; Google OAuth call stays on `browser.ts`'s client (redirect-only); `session.ts` deleted.
- [ ] **Go/no-go:** all 25 existing G5 web-auth tests either pass unmodified (route-guard's untouched exports) or are rewritten and passing (Item 2's files) before proceeding to P1-F3.

**P1-F3 — Item 3 (migrations), maps to program-plan 1.3(a)+1.4, SEQUENCED as written above (226→227→228, code swap, THEN 229→230):**
- [ ] P1-F3a: `226_profiles_admin_bootstrap.sql` lands; `scripts/bootstrap-first-admin.js` written **and RUN as part of this step [panel-fold: Security HIGH, fold 5 — sequencing change]** — the redesigned script PROVISIONS the operator's account via `supabase.auth.admin.createUser({email, email_confirm:true})` and promotes it to `is_admin=true` immediately, it does NOT wait for a prior sign-in. The operator's own sign-in now happens AFTER this step, via a `generateLink({type:'recovery'})` password-set link.
- [ ] P1-F3b: `227_rls_class_b_default_deny.sql` — SQL is script-generated, not hand-authored (Spec 114 §7's own method); **explicit gate [panel-fold: SF]: the generated file is re-reviewed by Schema-Fidelity BEFORE it is applied**, same bar as every other migration in this sequence, not skipped because it's "just RLS enablement, no policies."
- [ ] P1-F3c: `228_entitlements.sql` lands (additive, zero risk to existing tables).
- [ ] **Go/no-go [panel-fold: Security HIGH, fold 5 — reordered]:** `scripts/bootstrap-first-admin.js`'s output (`data.user.id`) confirmed promoted (`is_admin=true` via a direct `SELECT`); operator then completes their FIRST real sign-in using the recovery link the script's follow-up step sends, against the configured providers.
- [ ] P1-F3d: Item 4's full writer/reader swap (**8 writers W1-W8 + 7 readers R1-R5,R7-R8**, including the new Stripe-Customer-reuse writer (W8, fold 4) and the two `withTransaction` additions to W3/W5) implemented and tested AGAINST the now-live `profiles`+`entitlements` schema, BEFORE 229 touches `user_profiles`'s columns.
- [ ] **Go/no-go:** every one of the ~10 subscription-surface test files (P1-G3's writer/reader files' corresponding tests) green against `entitlements`, zero remaining code references to `user_profiles.subscription_status`/`trial_started_at`/`last_stripe_event_at` (grep-verified) — this is the precondition for 229's DROP COLUMN statements being safe.
- [ ] P1-F3e: `229_uid_uuid_fk_conversion.sql` — HALT precondition re-verified live (0-row on all 10 tables) immediately before running; on any nonzero count, STOP, dump rows, human sign-off per the D6 HALT procedure, do NOT `--force`. FK dispositions per fold 8: 8 user-owned tables CASCADE, `admin_watchlist` SET NULL, `admin_audit_log` RESTRICT with `admin_uid` staying NOT NULL (ADR-007).
- [ ] P1-F3f: `230_rls_class_a_entitlements.sql` — Class A policies + entitlements' 11th-table policy + pgTAP suite additions.
- [ ] P1-F3f.1: **pgTAP harness bootstrap, NEW explicit sub-step [panel-fold: Integration, fold 15]** — create `supabase/tests/`, author the FIRST pgTAP suite (no existing harness to extend), wire `supabase test db` (or current CLI equivalent) into the local/CI invocation path, document the release-gating cadence in the runbook. Runs BEFORE P1-F3f's suite additions depend on it existing.
- [ ] P1-F3g: Contracts/factories same-commit as 229 (Standards Compliance), including the new `schema.entitlement_products`/`schema.entitlement_statuses` `_contracts.json` keys (fold 23).

**P1-F4 — Item 5+6 (dashboard config + CI-credential + MFA), maps to program-plan 1.2+1.3(b)/(c):**
- [ ] P1-F4.1: Dashboard checklist (Item 5) completed by the operator.
- [ ] P1-F4.2: `CI_ADMIN_TOKEN`/`CI_ADMIN_ALLOWED_IPS` implemented in `verify-admin.ts` mode 2, evaluated against **`request.ip`, decided [panel-fold: DS+Gm, fold 19] — not `x-forwarded-for`.**
- [ ] P1-F4.3: MFA enrollment flow (admin UI, new — not in the original 7+1 file list, a genuinely new screen) built per fold 22's minimum requirements (authenticated-session-gated, server-generated TOTP secret shown once, hashed backup codes shown once); TOTP enrolled for the operator's admin account.
- [ ] **Go/no-go:** break-glass (`CI_ADMIN_TOKEN` path) proven to reach an admin route with MFA NOT yet enrolled; THEN MFA proven end-to-end (enroll, sign out, sign in, MFA challenge, admin route reachable); ONLY THEN:
- [ ] P1-F4.4: `ADMIN_USER_IDS` allowlist code deleted from `verify-admin.ts` mode 3.

**P1-F5 — Item 6 test rewrite (program-plan 1.5):**
- [ ] P1-F5.1: G5 web-auth files rewritten: `auth.logic.test.ts`, `auth-get-user.logic.test.ts`, `verify-admin.logic.test.ts`, `get-user-context.logic.test.ts`, `middleware.logic.test.ts`, `middleware.security.test.ts` — Firebase mocks replaced with `@supabase/ssr`/`supabase-js` mocks; `firebase-admin.logic.test.ts` DELETED (no successor, per Spec 13 Operating Boundaries).
- [ ] P1-F5.2: Subscription-surface tests rewritten against `entitlements`: `subscription.logic.test.ts`, `subscribe-session.security.test.ts`, `subscribe-session.infra.test.ts`, `subscribe-exchange.infra.test.ts`, `subscribe-routes.logic.test.ts`, `subscribe-portal-session.infra.test.ts`, `subscription-ops.logic.test.ts`, `admin-subscription-ops.infra.test.ts`, `stripe-webhook-resubscriber.regression.test.ts`, `stripe-webhook.security.test.ts`, `stripe-webhook-realsig.infra.test.ts`, `stripe-webhook.infra.test.ts`, `admin-users.infra.test.ts`, `user-profiles.infra.test.ts`, `user-profiles.security.test.ts`, `user-profile-trial.infra.test.ts`, `user-profiles-schema.infra.test.ts`.
- [ ] P1-F5.3: New tests: entitlement-gate unit test (`getEntitlementStatus` against seeded rows, all 6 status values × 2 products), webhook price→product fan-out test (mapped/unmapped price, OD5 default), `profiles`+`entitlements` infra test (table shape, CHECK constraints, FK behavior), RLS pgTAP additions (Item 3's `230` positive/negative pair for `entitlements`, Class B introspection query per Spec 114 §11's "table added without default-deny" guard).
- [ ] P1-F5.4: §11 unhappy paths (Standards Compliance list above) each get an explicit test case, not just incidental coverage.
- [ ] P1-F5.5: **Fold-driven new tests, folded in from the panel:** (a) `middleware.security.test.ts` — routing decisions unaffected by a simulated `getClaims`/JWKS failure, fail-open asserted [fold 2]; (b) `subscribe-exchange.infra.test.ts` — two product checkouts for one user reuse the same `stripe_customer_id` [fold 4]; (c) `stripe-webhook-resubscriber.regression.test.ts` — two subscription-updated events processed in REVERSE `event.created` order, older event never overwrites newer [fold 17]; (d) `user-profile-trial.infra.test.ts` (or new case) — `GET /api/user-profile` for a zero-`entitlements` user returns `subscription_status: null, trial_started_at: null`, not omitted/undefined/500 [fold 16].

**P1-F6 — OUTPUT review, maps to program-plan 1.6:**
- [ ] P1-F6.1: Admin panel + Regression Guardian + Security review against the live diff.
- [ ] P1-F6.2: P1-G0 (session-route history question) resolved and documented before sign-off.
- [ ] P1-F6.3: P1-G5 (the additional firebase-admin call sites — 2 dynamic-import sites plus `admin/users/route.ts` POST's 4-method block, corrected count per fold 13) verified swapped, not just the 7+1.
- [ ] **Go/no-go for Phase 2.**

---

## Item 7 — Rollback/abort + go/no-go gates

**Per-sub-step gates** are listed inline above (P1-F2's end-of-swap gate, P1-F3's two mid-sequence gates, P1-F4's break-glass-then-MFA gate). **Program-level abort clause** (`.cursor/active_task.md` Phase 1 header, unchanged by this plan, restated for this document's self-containedness):
- **Abort BEFORE P1-F3e (229/D6) lands:** `git revert` the code changes AND run `scripts/wipe-supabase-auth-state.js` (new — `DELETE FROM auth.users` cascades through nothing yet, since no FK exists pre-229; the script must ALSO explicitly `TRUNCATE profiles, entitlements` and, if 226-228 already landed, `DELETE FROM auth.users` directly) — the 10 D6 tables are untouched (still Firebase-uid-keyed) since 229 hasn't run, so no orphan risk there.
- **Abort AFTER P1-F3e (229/D6) has landed:** `git revert` the code changes AND run the same wipe script — now `DELETE FROM auth.users` CASCADES through the D6 FKs to all 8 user-owned tables automatically (CASCADE per D6) and SETs NULL on `admin_watchlist` (its D6 policy) — no manual truncation needed there, the FK design itself handles cleanup. **`admin_audit_log` is the one exception, updated per fold 8 [panel-fold: SF]:** its FK is `ON DELETE RESTRICT`, not `SET NULL` (ADR-007 — an audit-log row must always name its actor) — a bare `DELETE FROM auth.users` will FAIL with a foreign-key-violation for any user who authored an audit-log row, which is the correct behavior (an abort script must not silently erase who-did-what history). `scripts/wipe-supabase-auth-state.js` must account for this: either it accepts that `auth.users` rows with `admin_audit_log` history cannot be deleted by this script (an abort-time human decision, not automated), or it explicitly truncates `admin_audit_log` first with its own confirmation gate — do not have the wipe script silently `TRUNCATE admin_audit_log` as a side effect of an unrelated abort.
- **Firebase env vars remain valid and untouched throughout Phase 1** (retired Phase 5.1) — an abort at any point can, in principle, fall back to re-enabling the deleted Firebase files via `git revert` alone for the CODE side; only the Supabase-side state needs the wipe script, since Firebase-side state was never touched.

---

## Top 3 highest-uncertainty calls for the panel

1. **RESOLVED by panel adjudication [panel-fold: Gm+DS CRITICAL, adjudicated GT] — no longer open.** ~~Middleware calling `getClaims()` purely to trigger `@supabase/ssr`'s refresh side-effect, while Spec 13 §3.5 says middleware "does not perform cryptographic verification."~~ Settled: `getClaims()` stays (Spec 13 §3.2 cost rules, stated explicitly in Item 1's design note), wrapped in try/catch, FAIL-OPEN on any error (log + pass through unchanged, never block/redirect), with a code-comment contract and a regression test (`middleware.security.test.ts`, P1-F5.1/P1-F5.5a) asserting routing decisions are unaffected by a simulated `getClaims`/JWKS failure. The refactor-blurring risk this item warned about is addressed by the explicit CONTRACT comment in Item 1, not left to convention.

2. **STILL OPEN — not addressed by any adjudicated fold.** The `stripe_subscription_id`-equality "superseded subscription" fence (W1) is a meaning change from the original `stripe_customer_id`-equality fence, not a mechanical find-replace. The original fence assumed one customer ⇒ one live subscription; per-product entitlements make "one customer ⇒ up to N concurrent subscriptions" the normal case. This plan's rewritten fence (Item 4, W1) is reasoned from first principles, not verified against a live Stripe test fixture with two simultaneous subscriptions on one customer going through a delete→reactivate→re-subscribe cycle for ONE product while the OTHER product's subscription stays untouched. This is exactly the kind of interaction P1-G1 warns is easy to get subtly wrong, and it's the highest-consequence correctness risk in this plan (a wrong fence either leaks paid access or wrongly revokes it). Note fold 17 (event-timestamp ordering) and fold 4 (Stripe Customer reuse) both tighten adjacent parts of the webhook/Stripe design but neither resolves this specific fence's correctness — it remains this plan's single largest unverified assumption.

3. **RESOLVED by panel adjudication [panel-fold: Integration+GT convergent] — no longer open.** ~~`auth/config.ts`'s disposition — delete-and-rename-imports vs. delete-and-shim.~~ Settled: DELETE outright, no shim. Exactly 1 consumer (`session.ts`, deleted the same phase) — the earlier "32/59" figure conflated `config.ts`'s consumers with `get-user.ts`/`verify-admin.ts`'s much larger consumer set. See Item 2's `config.ts` row and the Panel Adjudication appendix below (DS's shim proposal is refuted on this same finding).

---

## Panel Adjudication appendix

**Rejected items** (adjudicated against, not folded in):
- **DS's `config.ts` re-export shim proposal — REFUTED.** The shim was proposed to preserve import-path stability across a feared ~32/59-route blast radius. Integration + GT's convergent finding (fold 7) established `config.ts` has exactly ONE consumer (`session.ts`), which is itself deleted in the same phase — the "32/59" figure was a conflation with `get-user.ts`/`verify-admin.ts`'s consumer count, files that are NOT being renamed. With a 1-consumer blast radius and that consumer being deleted outright, a shim adds a file with zero remaining purpose the moment it's created. Decision: delete `config.ts` outright, no shim.
- **Gm's trigger-hardcode note — SUPERSEDED by fold 6.** Gm's original finding (that `prevent_is_admin_self_escalation`'s `current_setting('request.jwt.claims', ...)` check hardcodes a PostgREST-specific mechanism the app doesn't use under D1/raw-pg) is correct as far as it goes, but fold 6's Security-adjudicated resolution goes further: rather than treating this as a hardcoding nitpick to fix, it reframes the trigger as INERT BY DESIGN — explicitly documented as defense-in-depth for a future Data-API re-enable, with the real control stated as app-layer. Gm's note is folded into (not separately applied on top of) fold 6's migration-226 comment block.
- Nothing else was rejected — all other panel findings map to one of the 25 numbered folds above.
