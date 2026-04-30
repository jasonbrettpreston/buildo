# Active Task: Spec 96 — Mobile Subscription & Paywall (WF1)
**Status:** Implementation
**Workflow:** WF1 — Genesis (new feature)
**Domain Mode:** Cross-Domain — Scenario A (Admin UI + API; Settings link → Stripe Customer Portal) AND Scenario B (Expo client consumes `POST /api/subscribe/session` + `GET /api/user-profile` for `subscription_status`). Read `.claude/domain-crossdomain.md` ✓ + `.claude/domain-admin.md` ✓ + `scripts/CLAUDE.md` ✓ + `docs/specs/03-mobile/90_mobile_engineering_protocol.md` ✓.

---

## Context

* **Goal:** Ship the subscription gate that controls access to the lead feed and flight board: 14-day free trial → Stripe-paid `'active'` → `'expired'` → paywall. All payment occurs on `buildo.com` (zero Apple commission). The gate must handle six `subscription_status` values, render a loading guard so the paywall never flashes during fetch, and degrade to inline-blur mode when dismissed.

* **Target Spec:** `docs/specs/03-mobile/96_mobile_subscription.md` (exhaustive implementation guide — §10 Build Sequence steps 1-6 map directly to the Execution Plan below).

* **Cross-spec dependencies:**
  - **Spec 95** — `user_profiles.subscription_status` enum, `trial_started_at`, `stripe_customer_id`, `lead_views_count`, `account_preset`; `subscribe_nonces` table; `stripe_webhook_events` table. **All shipped in migration 114** (validated). Spec 95 PATCH handler already writes `trial_started_at = NOW()` + `subscription_status = 'trial'` atomically when `onboarding_complete: true` is set on a non-manufacturer account. **No new migrations needed.**
  - **Spec 93** — AuthGate operational (committed `991afb9`). The subscription gate sits AFTER AuthGate, BEFORE the Spec 94 onboarding gate. Sign-out action in `mobile/src/store/authStore.ts` already resets filter/userProfile/notification/onboarding stores; line 89 has a TODO awaiting `paywallStore.clear()`.
  - **Spec 94** — Onboarding holding screen handles `account_preset = 'manufacturer' AND onboarding_complete = false`. The subscription gate must NOT route `'admin_managed'` to the paywall — it grants full access and defers to onboarding.
  - **Spec 91 / 77** — Lead feed and flight board are gated by the subscription state. When `'expired' AND paywallStore.dismissed`, both render inline-blur banner + locked cards.

* **Pre-flight validation findings (full report — see commit message):**
  - DB schema: ✅ all columns + tables present in migration 114
  - PATCH trial init: ✅ already in `user-profile/route.ts:243-250`
  - Mobile dependencies: ✅ `expo-web-browser` 15.0.11, `expo-blur` 15.0.8, `lucide-react-native` 1.8.0
  - **Missing pieces** (this task adds): `stripe` npm package (root); `paywallStore`; `PaywallScreen`; subscription gate in `_layout.tsx`; inline blur banners on index/flight-board; Settings subscription link; sign-out cleanup; GET fallback trial init + trial expiration in `user-profile/route.ts`; `POST /api/subscribe/session`; webhook handler; route-guard updates.
  - **Spec path correction:** spec references `mobile/app/(app)/(tabs)/index.tsx` and `mobile/app/(app)/(tabs)/flight-board.tsx`; actual repo layout has `(app)/index.tsx` and `(app)/flight-board.tsx` directly under `(app)/` with `(app)/_layout.tsx` providing the `<Tabs>` navigator. Plan uses the actual paths.

* **Key Files:**

  NEW — server:
  - `src/app/api/webhooks/stripe/route.ts`
  - `src/app/api/subscribe/session/route.ts`
  - `src/app/api/subscribe/session/types.ts` (Cross-Domain Scenario B contract)
  - `src/lib/subscription/expiration.ts` (shared trial-expiration helper used by GET handler)
  - `src/tests/stripe-webhook.infra.test.ts`
  - `src/tests/stripe-webhook.security.test.ts`
  - `src/tests/subscribe-session.infra.test.ts`
  - `src/tests/subscribe-session.security.test.ts`
  - `src/tests/user-profile-trial.infra.test.ts` (covers GET fallback + expiration write)

  NEW — mobile:
  - `mobile/src/store/paywallStore.ts`
  - `mobile/src/components/paywall/PaywallScreen.tsx`
  - `mobile/src/components/paywall/InlineBlurBanner.tsx` (shared by feed + flight board)
  - `mobile/src/components/paywall/SubscriptionLoadingGuard.tsx`
  - `mobile/src/hooks/useSubscribeCheckout.ts` (POST /api/subscribe/session + WebBrowser.openBrowserAsync)
  - `mobile/__tests__/subscriptionGate.test.ts`
  - `mobile/__tests__/paywallStore.test.ts`

  MODIFY — server:
  - `src/app/api/user-profile/route.ts` — GET handler: idempotent fallback trial-init for legacy paths + trial-expiration write (`trial + 14d <= NOW() → 'expired'`)
  - `src/lib/auth/route-guard.ts` — add `/api/webhooks/stripe` to `PUBLIC_PREFIXES`; add `/api/subscribe/session` explicitly to `AUTHENTICATED_API_ROUTES`

  MODIFY — mobile:
  - `mobile/app/(app)/_layout.tsx` — subscription gate (six status branches: `trial`/`active`/`past_due`/`admin_managed` → render Tabs; `expired` → `<PaywallScreen>` or inline-blur per `paywallStore.dismissed`; `cancelled_pending_deletion` → `firebase.auth().signOut()` + redirect to `/(auth)/sign-in`); loading guard while status is `null`/`undefined`; `AppState` listener that re-fetches profile on `'active'` transition.
  - `mobile/app/(app)/index.tsx` — render `<InlineBlurBanner>` + `<BlurView>` over each `LeadCard` when `paywallStore.dismissed && status === 'expired'`. Scroll-to-top on entering blur mode.
  - `mobile/app/(app)/flight-board.tsx` — same banner + blur over `FlightCard`.
  - `mobile/app/(app)/settings.tsx` — add "Manage subscription at buildo.com →" row that opens Stripe Customer Portal via `WebBrowser.openBrowserAsync()` (hidden when `account_preset === 'manufacturer'`).
  - `mobile/src/store/authStore.ts` — replace TODO at line 89 with `paywallStore.getState().clear()` in the sign-out flow.

  MODIFY — root:
  - `package.json` — add `stripe` as a dependency

---

## API Contract Note (Cross-Domain Scenario B)

| Method | Path | Auth | Status codes | Response |
|--------|------|------|--------------|----------|
| POST | `/api/subscribe/session` | Bearer (Firebase) | 200 (`{url}`), 400 (already-active or admin_managed), 401, 500 | `{ data: { url: string }, error: null, meta: null }` |
| POST | `/api/webhooks/stripe` | Stripe-Signature header (no Firebase) | 200 (`{received: true}`), 400 (signature invalid / payload missing), 500 | `{ received: true }` (NOT the standard data envelope — Stripe expects this shape) |
| GET | `/api/user-profile` (modified) | Bearer (existing) | unchanged | now writes `subscription_status = 'expired'` to DB when trial expired; idempotent fallback trial-init for legacy paths |

**`SubscribeSessionResponse` (in `src/app/api/subscribe/session/types.ts`):**
```ts
export interface SubscribeSessionResponse {
  /** `https://buildo.com/subscribe?nonce={uuid}` — single-use, server-side nonce, 15-minute TTL. No UID or email in URL. */
  url: string;
}
```

**Webhook events handled** (Stripe → server):
- `customer.subscription.created` / `customer.subscription.updated` (status `'active'`) → write `subscription_status = 'active'` + `stripe_customer_id`
- `invoice.payment_failed` → write `subscription_status = 'past_due'` (user retains access during dunning)
- `customer.subscription.deleted` → write `subscription_status = 'expired'`
- Unknown event types → 200 no-op

**Idempotency:** webhook handler wraps the `stripe_webhook_events` INSERT (`onConflictDoNothing`) and the `user_profiles` UPDATE in a single `db.transaction()` (per spec §Step 5 — required for TOCTOU safety under concurrent Stripe retries).

**`subscription_status` write ownership** (per spec §Step 5): only writable by (a) the webhook handler, (b) the `user-profile` GET/PATCH handler for trial init/expiration, (c) Spec 97 reactivation (deferred). Never via `PATCH /api/user-profile` user-editable fields — Spec 95 already strips it from the whitelist.

---

## Technical Implementation

### `paywallStore` (Zustand v5)

```ts
interface PaywallState {
  visible: boolean;       // full <PaywallScreen> rendering
  dismissed: boolean;     // user tapped "Maybe later" → inline-blur mode
  show(): void;           // visible: true, dismissed: false
  dismiss(): void;        // visible: false, dismissed: true
  clear(): void;          // both false — called by authStore.signOut + on status='active'
}
```
Not MMKV-persisted (spec §9 explicit). Always starts fresh so a returning subscriber is never stuck in inline-blur.

### `PaywallScreen` (mobile/src/components/paywall/PaywallScreen.tsx)

Stagger animation (5 sequential `useSharedValue(0)` instances animated via `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`): icon (0ms) → headline (80ms) → lead count (160ms) → primary CTA (240ms, translateY 8→0) → "Maybe later" (320ms, opacity-only). Refresh link revealed after 60s (`setTimeout` with cleanup in the `useEffect` return — required for unmount safety).

Lead count: `lead_views_count` from `user_profiles` (passed as prop). **Zero-count edge case** (spec §Step 1): replace number+caption block with single line "Explore real leads in your area." — never display "0 leads".

Primary CTA → `useSubscribeCheckout()` hook: POSTs to `/api/subscribe/session`, opens returned URL via `WebBrowser.openBrowserAsync()` (NOT `openAuthSessionAsync` — spec §5 explicitly: Stripe checkout is a standard browser flow, not OAuth). Inline `<ActivityIndicator size="small">` inside button while in-flight. On error: toast "Couldn't open checkout — try again", re-enable button.

`pointerEvents="none"` on the wrapper during the mount fade-in (spec §Step 2 — prevents accidental taps before the screen is fully visible).

### Subscription Gate (mobile/app/(app)/_layout.tsx)

```
On mount + AppState 'active' → queryClient.invalidateQueries(['user-profile'])
While status null/undefined → <SubscriptionLoadingGuard /> (full-screen amber spinner)
Switch on status:
  'trial' | 'active' | 'past_due' | 'admin_managed' → render <Tabs> (current behaviour)
  'expired' → paywallStore.dismissed
              ? render <Tabs> with inline-blur banners (children handle blur)
              : <PaywallScreen> with mount fade-in (200ms)
  'cancelled_pending_deletion' → firebase.auth().signOut() + router.replace('/(auth)/sign-in')
```

Status transition `'expired' → 'active'` (post-payment): call `paywallStore.clear()` + `queryClient.invalidateQueries(['leads'])` + fade `<PaywallScreen>` out (`opacity: 1 → 0`, 200ms) before unmount.

### Inline Blur (mobile/app/(app)/index.tsx + flight-board.tsx)

Banner pinned at top of tab content area: `bg-zinc-900/95 flex-row items-center justify-between px-4 py-3 border-b border-zinc-800` with text "Trial ended — subscribe to see new leads." + amber chip "Subscribe →". Full-row `onPress: paywallStore.show()`.

Card blur: `<BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill}>` as **absolute sibling** over the card content (not parent wrapper); content gets `style={{ opacity: 0.1 }}`. **Android API < 31 fallback:** `Platform.OS === 'android' && Platform.Version < 31` → render `<View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,9,11,0.85)' }]}>` instead (spec §9 explicit — `expo-blur` silently no-ops on older Android).

Empty-feel prevention: at minimum 4 blurred placeholder cards (`bg-zinc-900 rounded-2xl h-28 w-full` with inline `style={{ opacity: 0.15 }}` — NativeWind v4 arbitrary `opacity-[0.15]` may not JIT-compile, spec §9 explicit). Scroll-to-top on entering blur mode (`feedScrollRef.current?.scrollToOffset({ offset: 0, animated: false })`).

### `POST /api/subscribe/session`

```ts
withApiEnvelope → getUserIdFromSession → 401 if null
→ fetch user_profiles.subscription_status
→ if 'active' || 'admin_managed' → 400 (no checkout needed)
→ nonce = crypto.randomUUID()
→ INSERT subscribe_nonces (nonce, user_id=uid, expires_at=NOW()+15min)
→ return ok({ url: `https://buildo.com/subscribe?nonce=${nonce}` })
```

Per spec §Step 4b: no UID or email in URL (PII boundary). Web checkout exchanges nonce server-to-server.

### `POST /api/webhooks/stripe`

```ts
withApiEnvelope (try-catch boundary)
→ verify Stripe-Signature via stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
→ invalid → 400
→ db.transaction(async (tx) => {
    const [inserted] = await tx.insert(stripeWebhookEvents)
      .values({ event_id: event.id })
      .onConflictDoNothing()
      .returning({ event_id });
    if (!inserted) return;  // duplicate event — exit transaction, 200
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        if (event.data.object.status === 'active') → UPDATE active + stripe_customer_id
      case 'invoice.payment_failed' → UPDATE past_due
      case 'customer.subscription.deleted' → UPDATE expired
      default → no-op
    }
  })
→ return NextResponse.json({ received: true })
```

Webhook responses are `{ received: true }` not the standard envelope (spec §Step 5 explicit — Stripe expects this shape).

### GET `/api/user-profile` modifications

Two additive behaviours inside the existing handler:

1. **Idempotent fallback trial-init** (race-condition safe): if `onboarding_complete = true AND trial_started_at IS NULL AND subscription_status IS NULL AND account_preset != 'manufacturer'` → `UPDATE user_profiles SET trial_started_at = NOW(), subscription_status = 'trial' WHERE user_id = $1 AND trial_started_at IS NULL RETURNING *`. The `WHERE trial_started_at IS NULL` clause makes concurrent GETs converge on a single write.

2. **Trial expiration write** (spec §Step 4 explicit DB write, not response-only): if `subscription_status = 'trial' AND trial_started_at + INTERVAL '14 days' <= NOW()` → `UPDATE user_profiles SET subscription_status = 'expired' WHERE user_id = $1 AND subscription_status = 'trial' AND trial_started_at + INTERVAL '14 days' <= NOW()`. Inclusive `<=` (user gets full 14th day per spec). The double-check in the WHERE clause prevents double-writes under concurrent GETs. Extracted to `src/lib/subscription/expiration.ts` so a future Phase 2 Cloud Function batch sweep can reuse the same predicate.

* **Database Impact:** NO. All schema lives in migration 114 (Spec 95). This task is purely application logic + new API routes + mobile UI.

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** Both new routes wrapped with `withApiEnvelope`. Webhook handler also has explicit signature-verify try-catch returning 400 on invalid signature (Stripe never receives a 5xx for a malformed payload). `logError` on unexpected errors.

* **Unhappy Path Tests (§2.1):** `stripe-webhook.infra` covers duplicate event ID (200 no-op via transaction), invalid signature (400), unknown event type (200 no-op), DB write failure (transaction rollback, 500 sanitized). `subscribe-session.infra` covers unauthenticated (401), already-active subscriber (400), nonce uniqueness, no PII in URL. `user-profile-trial.infra` covers fallback init idempotency under concurrent GET, expiration race (only one write succeeds), manufacturer account NEVER gets trial fields written.

* **logError Mandate (§6.1):** `withApiEnvelope` already wires logError via `internalError`. Webhook handler adds explicit `logError('[stripe-webhook]', err, { event_id, event_type })` on per-event failures so support can debug specific Stripe events without sifting through generic 500 logs.

* **Pagination (§3.2):** N/A — no list endpoints.

* **Parameterization (§4.2):** Drizzle parameterized queries throughout. No string concatenation in SQL.

* **Migration Safety (§3.1):** N/A — no new migrations. All schema is from migration 114.

* **Route Export Rule (§8.1):** route.ts files export only `POST`. Helpers go to `src/lib/subscription/`.

* **Mobile-First (§1.1, §1.3):** PaywallScreen container `bg-zinc-950 flex-1 items-center justify-center px-8`; primary CTA `min-h-[44px]` enforced via `py-4` (16px padding × 2 = 32px + ~24px line-height = ~56px tappable). Inline banner row `min-h-[44px]` via `py-3` + ~24px line-height. Settings subscription link wraps in `Pressable min-h-[52px]` matching existing rows. All Pressables include either visual `min-h-[44px]` or `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`.

* **Mobile Dumb Glass (Spec 90 §3):** Subscription gate is pure rendering — all state computation (status determination, expiration logic) lives server-side in `user-profile` route. Mobile only branches on the returned `subscription_status` enum. **Optimistic UI exception** (Spec 90 §3 explicit): `paywallStore.dismiss()` is local-only ephemeral state — does not require server confirmation.

* **Zod Boundary (Spec 90 §13):** `useUserProfile` already parses through `UserProfileSchema` (Spec 95). New `useSubscribeCheckout` hook parses the `{url}` response through a fresh Zod schema — Stripe URL responses MUST be validated to prevent a malformed URL from `WebBrowser.openBrowserAsync()` crashing the JS bridge.

* **App Store compliance note (§5):** Apple Guideline 3.1.1 risk on "Continue at buildo.com →" CTA is documented in spec §5 as a known risk requiring legal/product review before iOS submission. **Implementation default uses spec-prescribed copy verbatim.** A `EXPO_PUBLIC_PAYWALL_CTA_NEUTRAL=1` env flag is added to `app.json` extra section so a future build variant can flip the copy to "Learn more" without a code change. NOT submitting to App Store as part of this task.

* **§10 note:** Cross-Domain Scenario B types are defined for `POST /api/subscribe/session` (Expo client) — the webhook endpoint is Stripe-internal, no client-facing types needed beyond the response shape `{received: true}`.

---

## Execution Plan

This plan mirrors Spec 96 §10 Build Sequence steps 1-6 + supporting work (route guard, sign-out cleanup, mobile dependency wiring, tests, review).

- [ ] **Step 0 — Pre-flight:** `node scripts/ai-env-check.mjs`. Confirm migration 114 applied. Confirm `subscribe_nonces`, `stripe_webhook_events` tables exist in schema.ts. Add `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` to local `.env.example` (placeholders). Run `npm install stripe` at root. Confirm no breaking change to `package-lock.json`.

- [ ] **Step 1 — `paywallStore.ts`:** `mobile/src/store/paywallStore.ts`. Zustand state machine per §9. SPEC LINK header. Not MMKV-persisted (spec explicit). Test: `mobile/__tests__/paywallStore.test.ts` — `show()` / `dismiss()` / `clear()` transitions; initial state is `{ visible: false, dismissed: false }`.

- [ ] **Step 2 — Sign-out cleanup:** `mobile/src/store/authStore.ts` line 89. Replace TODO with `paywallStore.getState().clear()` alongside the existing store resets. Critical per spec §9 — prevents same-device user-handoff bleed.

- [ ] **Step 3 — `<SubscriptionLoadingGuard>`:** `mobile/src/components/paywall/SubscriptionLoadingGuard.tsx`. `bg-zinc-950 flex-1 items-center justify-center` with `<ActivityIndicator size="large" color="#f59e0b">`. SPEC LINK.

- [ ] **Step 4 — `<PaywallScreen>`:** `mobile/src/components/paywall/PaywallScreen.tsx`. SPEC LINK. Stagger animation per spec §9 table (5 sequential `useSharedValue(0)` + `withDelay`/`withTiming`). Lead count from prop with zero-count edge case. 60-second Refresh link with cleanup `setTimeout`. Primary CTA delegates to `useSubscribeCheckout`. `pointerEvents="none"` during mount fade.

- [ ] **Step 5 — `useSubscribeCheckout` hook:** `mobile/src/hooks/useSubscribeCheckout.ts`. POSTs to `/api/subscribe/session` via `fetchWithAuth`, Zod-parses response, calls `WebBrowser.openBrowserAsync(url)`. Returns `{ openCheckout, isLoading, error }`. SPEC LINK.

- [ ] **Step 6 — Subscription gate in `_layout.tsx`:** `mobile/app/(app)/_layout.tsx`. Six-branch switch on `subscription_status`. Loading guard while null/undefined. AppState listener for foreground re-fetch. `'cancelled_pending_deletion'` → sign-out + redirect. `'expired' → 'active'` transition: `paywallStore.clear()` + invalidate `['leads']` + fade out. SPEC LINK ref.

- [ ] **Step 7 — `<InlineBlurBanner>`:** `mobile/src/components/paywall/InlineBlurBanner.tsx`. Shared component for index + flight-board. Banner per spec §9. Full-row `onPress: paywallStore.show()`. SPEC LINK.

- [ ] **Step 8 — Inline blur in feed + flight board:** `mobile/app/(app)/index.tsx` and `mobile/app/(app)/flight-board.tsx`. Render `<InlineBlurBanner>` when `paywallStore.dismissed && status === 'expired'`. Wrap each card in `<BlurView intensity={8} tint="dark">` (with Android < 31 fallback). 4 placeholder cards minimum. Scroll-to-top on entering blur mode.

- [ ] **Step 9 — Settings subscription link:** `mobile/app/(app)/settings.tsx`. New row "Manage subscription" + sub-label "Opens buildo.com" → `WebBrowser.openBrowserAsync('https://buildo.com/account/billing')`. Hidden when `account_preset === 'manufacturer'`.

- [ ] **Step 10 — `src/lib/subscription/expiration.ts`:** Export `applyTrialExpirationIfNeeded(profile, db)` and `applyFallbackTrialInitIfNeeded(profile, db)` — both idempotent, both use `UPDATE ... WHERE <predicate> RETURNING *` pattern for race safety. Pure helpers (no Next.js dependencies) so a future Phase 2 Cloud Function can import directly.

- [ ] **Step 11 — Modify `user-profile/route.ts` GET:** Wire the two helpers above into the GET handler. Both run BEFORE the response is composed, so the returned profile reflects the post-write state. Existing PATCH handler unchanged (Spec 95 already covers PATCH trial init). SPEC LINK comment updated.

- [ ] **Step 12 — `POST /api/subscribe/session/route.ts`:** Per spec §Step 4b. Validates `subscription_status` (400 on already-active or admin_managed). Creates nonce in `subscribe_nonces` (TTL 15 min). Returns `{ url }`. SPEC LINK.

- [ ] **Step 13 — `POST /api/webhooks/stripe/route.ts`:** Per spec §Step 5. Stripe signature verify. `db.transaction()` wrapping the dedup INSERT + status UPDATE. All four event types handled. Return `{ received: true }`. SPEC LINK.

- [ ] **Step 14 — `route-guard.ts` updates:** Add `/api/webhooks/stripe` to `PUBLIC_PREFIXES` (Stripe calls without Firebase auth — fail-closed default would 401 every webhook). Add `/api/subscribe/session` explicitly to `AUTHENTICATED_API_ROUTES` for clarity (currently relies on fail-closed default). Update existing `route-guard.logic.test.ts` if present.

- [ ] **Step 15 — Server tests:**
  - `src/tests/stripe-webhook.infra.test.ts` — valid `subscription.created` → status `'active'`; duplicate event ID → 200 no UPDATE; invalid signature → 400; `subscription.deleted` → `'expired'`; `invoice.payment_failed` → `'past_due'`; unknown type → 200 no-op; DB throw → transaction rollback + sanitized 500.
  - `src/tests/stripe-webhook.security.test.ts` — missing `Stripe-Signature` → 400; forged signature string → 400; replayed event ID → idempotent reject; empty payload → 400; no raw Stripe error message in any 4xx/5xx body.
  - `src/tests/subscribe-session.infra.test.ts` — happy path inserts nonce + returns URL with nonce param; URL contains no UID or email; unauthenticated → 401; already-active → 400; admin_managed → 400.
  - `src/tests/subscribe-session.security.test.ts` — two requests from same user produce distinct nonces; nonce single-use; nonce not in any log line (audit grep).
  - `src/tests/user-profile-trial.infra.test.ts` — fallback init idempotent under concurrent GET (only one row UPDATE wins); expiration write fires at exactly day-14 (not day-13); manufacturer account is NEVER touched by either helper.

- [ ] **Step 16 — Mobile tests:**
  - `mobile/__tests__/paywallStore.test.ts` — state transitions covered.
  - `mobile/__tests__/subscriptionGate.test.ts` — gate passes (no paywall) for `'trial'`, `'active'`, `'past_due'`, `'admin_managed'`; renders `<PaywallScreen>` for `'expired'`; `cancelled_pending_deletion` triggers sign-out + redirect; loading guard while `null`; AppState `'active'` event triggers re-fetch.

- [ ] **Step 17 — Multi-agent review (WF1 gate — adversarial included per memory feedback):** Three parallel agents, `isolation: "worktree"`. Spec input: `docs/specs/03-mobile/96_mobile_subscription.md`. **Code Reviewer** (logic, missing telemetry, type safety) + **Gemini adversarial** (silent failure paths, IS DISTINCT FROM races, off-by-one) + **DeepSeek adversarial** (spec gaps, downstream consumers). Triage → fix FAIL items inline. Deferred → `docs/reports/review_followups.md`.

- [ ] **Step 18 — Test gate:**
  - `npm run typecheck` (root)
  - `cd mobile && npm run typecheck`
  - `npx vitest run src/tests/stripe-webhook.infra.test.ts src/tests/stripe-webhook.security.test.ts src/tests/subscribe-session.infra.test.ts src/tests/subscribe-session.security.test.ts src/tests/user-profile-trial.infra.test.ts`
  - `cd mobile && npx jest --testPathPatterns="paywallStore|subscriptionGate" --ci`
  - `npm run lint -- --fix`
  - All must pass before commit.

- [ ] **Step 19 — Commit:** `feat(96_mobile_subscription): paywall + Stripe webhook + nonce checkout flow`

---

## Out of Scope / Deferred

- **Day 10 / Day 13 reminder emails** — Phase 2 Cloud Function (spec §Step 6 explicit). Cloud Functions infra not yet stood up.
- **Trial expiration batch sweep** — Phase 2 Cloud Function. Phase 1 expires lazily on GET (acceptable: only users who don't open the app for >14 days get a delayed `'expired'` write, and they see the paywall the first time they DO open it).
- **App Store iOS submission** — Apple Guideline 3.1.1 risk on `"Continue at buildo.com →"` requires legal/product review (spec §5 explicit). The `EXPO_PUBLIC_PAYWALL_CTA_NEUTRAL` flag scaffolds the future build variant.
- **Web checkout endpoint** (`buildo.com/subscribe?nonce=…` page) — separate task on the web admin side. Out of scope for this WF1; the nonce contract is published in the API contract note.
- **Stripe Customer Portal deep-link from Settings** — placeholder URL `https://buildo.com/account/billing`. Real portal session creation is a separate task (Spec 97 territory).
- **Periodic nonce purge job** — `subscribe_nonces` rows accumulate until expiry. Cron sweep deferred to Phase 2.
- **Webhook signing secret rotation** — operational task, not a code change.
- **Team / org billing** — Phase 2 (spec §11 Out of Scope).

---

> **PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**
>
> §10 note: PATCH trial-init logic already lives in Spec 95's PATCH handler (line 243-250) — this task only adds the GET fallback + expiration write. No new migrations needed; all schema is from migration 114. Cross-Domain Scenario B types live in `src/app/api/subscribe/session/types.ts`. App Store Guideline 3.1.1 risk is acknowledged via the `EXPO_PUBLIC_PAYWALL_CTA_NEUTRAL` env flag scaffold; spec-prescribed copy is the implementation default.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
