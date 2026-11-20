# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile subscription (Spec 96, whole; governs the no-plan and limit states)
Source: docs/specs/03-mobile/96_mobile_subscription.md:1-370
Generator: hand-written
Rules in the whole list: 11 (counted by pattern /^## \d+\./) · this is part 2 of 2

### Build Sequence

**Step 1 — PaywallScreen component**
- File: `mobile/src/components/paywall/PaywallScreen.tsx`
- NativeWind classes and stagger animation sequence per §9. Lead count sourced from `user_profiles.lead_views_count` (passed as prop from the layout gate).
- **Stagger animation:** Five `useSharedValue(0)` instances (icon, headline, count, primaryCTA, secondary), each animated via `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`. `useAnimatedStyle` drives both `opacity` and `transform: [{ translateY: interpolate(sv, [0, 1], [12, 0]) }]` (8px for CTA, 0 for secondary).
- **`lead_views_count` display:** Rendered as `{count} leads` in `text-amber-400 font-mono text-4xl font-bold text-center` with a caption `text-zinc-500 text-sm text-center` below: "viewed in your 14-day trial". **Zero-count edge case:** When `lead_views_count === 0`, replace the number+caption block with a single line: `text-zinc-400 text-sm text-center mb-8` — "Explore real leads in your area." Do not display "0 leads" — that framing undermines the value proposition.
- "Continue at buildo.com →" calls `POST /api/subscribe/session` (Firebase Bearer token) to get the nonce-based checkout URL. Server creates a single-use nonce in `subscribe_nonces` table (TTL 15 minutes) and returns `{ url: "https://buildo.com/subscribe?nonce=..." }`. No UID or email in the URL. Opens via `WebBrowser.openBrowserAsync()` (not `openAuthSessionAsync` — Stripe checkout is a standard browser flow, not an OAuth redirect). Show an inline `ActivityIndicator size="small"` inside the button while the session request is in-flight; replace with "Continue at buildo.com →" text once the URL is received. On `POST /api/subscribe/session` failure: show toast `"Couldn't open checkout — try again"`, re-enable the button.
- "Maybe later" calls `paywallStore.dismiss()` — does not fully hide paywall, switches to inline-blur mode.
- **60-second Refresh link:** `useEffect(() => { const t = setTimeout(() => setShowRefresh(true), 60_000); return () => clearTimeout(t); }, [])`. Fades in via `withTiming(1, { duration: 400 })` on `useSharedValue(0)`. Tap: `queryClient.invalidateQueries(['user-profile'])`. See §9 for full interaction spec.

**Step 2 — Subscription gate in app layout**
- File: `mobile/app/(app)/_layout.tsx`
- On mount + on `AppState change` to `'active'`: call `queryClient.invalidateQueries(['user-profile'])` to re-fetch profile.
- **Loading guard (design-critical):** While `subscription_status` is `null` or `undefined` (initial fetch in progress), render a full-screen loading guard: `bg-zinc-950 flex-1 items-center justify-center` with `<ActivityIndicator size="large" color="#f59e0b" />`. Do NOT flash the paywall during this window. Only render `<PaywallScreen>` after the fetch resolves to `'expired'`. Loading guard → `<PaywallScreen>` transition: `opacity: 0 → 1` `withTiming(1, { duration: 200 })` on `useSharedValue(0)` on the `PaywallScreen` mount.
- **When `subscription_status` changes from `'expired'` to `'active'`** (post-payment webhook): call `paywallStore.reset()`, then `queryClient.invalidateQueries(['leads'])` so the feed reloads with real data. The paywall screen should fade out (opacity `1 → 0`, `withTiming(0, { duration: 200 })`) before unmounting.
**Gate execution order:** `(app)/_layout.tsx` is the SUBSCRIPTION gate. It executes AFTER the AuthGate in `_layout.tsx` (Spec 93) and BEFORE the onboarding gate in `(onboarding)/_layout.tsx` (Spec 94). The sequence is: Auth → Subscription → Onboarding. The subscription gate must handle `admin_managed` by granting full access and deferring to the onboarding gate to render the holding screen if `onboarding_complete = false`.

**Loading guard animation note:** Set `pointerEvents="none"` on the `<PaywallScreen>` wrapper during the mount fade-in (`opacity: 0 → 1`, `withTiming(1, { duration: 200 })`) to prevent accidental taps on the primary CTA before the screen is fully visible.

Six status values handled (all values from Spec 95 §2.3 enum):
  - `'trial'` → full access, no paywall
  - `'active'` → full access, no paywall; `paywallStore.reset()` called if previously dismissed
  - `'past_due'` → full access, no paywall (user is in Stripe dunning grace period)
  - `'expired'` → `<PaywallScreen>` (if `paywallStore.dismissed`, render feed with inline blur)
  - `'admin_managed'` → full access, no paywall, subscription section hidden in Settings; onboarding gate handles holding screen if `onboarding_complete = false`
  - `'cancelled_pending_deletion'` → call `firebase.auth().signOut()` and redirect to `/(auth)/sign-in`. This status means deletion is confirmed; the user must not be shown any app content. Add this case to `mobile/__tests__/subscriptionGate.test.ts`.

**Step 3 — Inline blur banners**
- Files: `mobile/app/(app)/(tabs)/index.tsx`, `mobile/app/(app)/(tabs)/flight-board.tsx`
- Rendered when `paywallStore.dismissed = true` AND `subscription_status === 'expired'`.
- **Banner layout (design per §9):** `bg-zinc-900/95 flex-row items-center justify-between px-4 py-3 border-b border-zinc-800`. Left: `text-zinc-300 text-sm flex-1` text "Trial ended — subscribe to see new leads." Right: `bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1` chip with `text-amber-400 text-xs font-semibold` "Subscribe →". Full row `onPress`: `paywallStore.show()`.
- **Lead card blur (design per §9):** Wrap each `LeadCard` in `<BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill}>` from `expo-blur`. The card content underneath gets `style={{ opacity: 0.1 }}`. Show at minimum 4 blurred card placeholders (`bg-zinc-900 rounded-2xl h-28 w-full opacity-[0.15]`) if the feed query returned no results or was blocked.
- **Flight board:** Same banner. Individual flight board rows blurred with same `BlurView intensity={8}` + `opacity: 0.1` on content.

**Step 4 — Trial started_at write (server-side)**
- File: `src/app/api/user-profile/route.ts` (PATCH handler — guarded field path in Spec 95 Step 3) + GET handler fallback
- The server, not the client, initiates the trial. **Preferred (race-condition-safe):** Write `{ trial_started_at: NOW(), subscription_status: 'trial' }` atomically within the same DB transaction as the `onboarding_complete = true` PATCH (i.e., at the end of onboarding, when the client sends `PATCH { onboarding_complete: true }`). The server checks: if `onboarding_complete` is being set to `true` AND `trial_started_at IS NULL` AND `account_preset != 'manufacturer'` → write both fields in the same transaction. This eliminates the race condition where a GET fires immediately after the onboarding PATCH commits but before the trial is written.
- **Fallback (GET handler):** If `onboarding_complete = true` AND `trial_started_at IS NULL` AND `subscription_status IS NULL` AND `account_preset != 'manufacturer'` on a GET — the trial write was missed (e.g., old client, app crash during PATCH). Write atomically using `UPDATE ... WHERE trial_started_at IS NULL RETURNING *` (idempotent — if two concurrent GETs race, only one write succeeds; the other reads the already-written value). The client always receives a profile with `subscription_status` set.
- **Phase 1 trial expiration logic (same PATCH/GET handlers):** When `subscription_status = 'trial'` AND `trial_started_at + INTERVAL '14 days' <= NOW()` (note: `<=` inclusive — user gets the full 14th day; `< NOW()` would expire at midnight of day 14, cutting the last day short): write `subscription_status = 'expired'` to the DB row (not just the response). A computed-only response that leaves DB state as `'trial'` creates a split where admin dashboards and analytics see the user as active when they are locked out.
- This prevents client-side gaming: a user cannot block the trial start or reset it by clearing app data.

**Step 4b — POST /api/subscribe/session**
- File: `src/app/api/subscribe/session/route.ts`
- Authenticated route. Wrap handler with `withApiEnvelope` (§00 §2.2). Extract Firebase UID via `getUserIdFromSession(request)` from `src/lib/auth/get-user.ts`. Return 401 if UID is null. Returns a single-use nonce URL for the Stripe checkout web flow.
- **Implementation:**
  ```typescript
  const nonce = crypto.randomUUID();
  await db.insert(subscribeNonces).values({
    nonce,
    user_id: uid,
    expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });
  return { url: `https://buildo.com/subscribe?nonce=${nonce}` };
  ```
- No UID or email in the URL — avoids PII in server logs, browser history, and referrer headers. The web checkout exchanges the nonce server-to-server to look up the Firebase UID.
- **Nonce expiry cleanup:** Expired nonces may be purged by a separate periodic job. The web checkout endpoint must `SELECT ... WHERE expires_at > NOW()` and reject expired nonces with 400.
- Returns 401 for unauthenticated request. Returns 400 if `subscription_status` is already `'active'` or `'admin_managed'` (no checkout needed). Try-catch + `logError`.
- **Route guard:** classify as `authenticated`. Add to `src/lib/auth/route-guard.ts`.
- **Test:** `src/tests/subscribe-session.infra.test.ts` (referenced in Testing Gates) — POST creates nonce row; URL contains nonce but no UID/email; unauthenticated request returns 401; already-active user returns 400.

**Phase 1 trial expiration:** When `subscription_status = 'trial'` AND `trial_started_at + 14 days < NOW()`: write `subscription_status = 'expired'` to the DB (not just the response). A computed-only response that leaves DB state as `'trial'` creates a split where customer support dashboards, analytics, and admin panels see a user as active when they are locked out. Writing to DB is the correct approach. The Phase 2 Cloud Function (Step 6) handles batch processing and reminder emails — Phase 1 just needs to write the expiry correctly on first detection.

**Step 5 — Stripe webhook handler**
- File: `src/app/api/webhooks/stripe/route.ts`
- **Install `stripe` backend package** (root, not `mobile/`): `npm install stripe`. Required by this handler and by Spec 95 Step 3a (deletion endpoint). Do this before implementing either.
- **Route guard:** Add `/api/webhooks/stripe` to `PUBLIC_PREFIXES` in `src/lib/auth/route-guard.ts`. Without this, the fail-closed default classifies the route as `'authenticated'` — every Stripe webhook call will receive 401 from middleware and be silently rejected. This is a required step before webhooks will function in any environment.
- Public route (no Firebase auth — Stripe calls it). Verify `Stripe-Signature` header via `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Invalid signature → 400.
- **Idempotency (must be in an explicit `db.transaction()`):** The deduplication INSERT and the `user_profiles` UPDATE must execute inside a single atomic transaction — not two separate auto-commit statements:
  ```typescript
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(stripeWebhookEvents)
      .values({ event_id: event.id })
      .onConflictDoNothing()
      .returning({ event_id: stripeWebhookEvents.event_id });
    if (!inserted) return; // Already processed — exit transaction, return 200
    await tx.update(userProfiles)
      .set({ subscription_status: newStatus, ... })
      .where(eq(userProfiles.stripe_customer_id, customerId));
  });
  ```
  Wrapping in `db.transaction()` prevents TOCTOU races under concurrent Stripe retries — two parallel webhook deliveries will race on the INSERT; only one will see a row returned; the other will exit without updating the profile.
- `customer.subscription.created` / `customer.subscription.updated` with `status: 'active'` → UPDATE `subscription_status = 'active'` + write `stripe_customer_id` to `user_profiles`.
- `invoice.payment_failed` → UPDATE `subscription_status = 'past_due'`. User retains access during Stripe's dunning retry period. Access revoked only on final `customer.subscription.deleted`.
- `customer.subscription.deleted` → UPDATE `subscription_status = 'expired'`.
- Unknown event types → 200 no-op.
- Wrap handler with `withApiEnvelope` for the outer try-catch boundary (§00 §2.2); note the response format for webhook handlers is plain `{ received: true }` rather than the standard data envelope — return it directly inside the handler. `logError` on unexpected errors.
- **`subscription_status` write ownership note:** `subscription_status` is NEVER written via `PATCH /api/user-profile`. It is written only by: (a) this webhook handler (direct DB UPDATE), (b) the GET/PATCH handler for trial initiation (Step 4 above), and (c) the reactivation PATCH in Spec 97 §3.2 (a separate guarded server action — not the same endpoint as the user-editable PATCH). If a developer needs to update `subscription_status` for testing, use a direct DB command or a dedicated admin endpoint.

**Step 6 — Day 10/13 reminders**
- **TODO: Phase 2** — Cloud Function daily sweep checks `trial_started_at` and sends reminder emails at day 10 and push + email at day 13. Cloud Functions infra not yet set up. Backend logic to implement: `NOW() - trial_started_at >= INTERVAL '10 days'` → trigger email; `>= INTERVAL '13 days'` → trigger email + push.

### Testing Gates

- **Unit:** `mobile/__tests__/subscriptionGate.test.ts` — gate passes (no paywall) for `'trial'`, `'active'`, `'past_due'`, `'admin_managed'`; shows `<PaywallScreen>` for `'expired'`; `cancelled_pending_deletion` triggers sign-out + redirect to sign-in; `admin_managed` never shows paywall; loading guard shown while `subscription_status = null`; AppState `'active'` event triggers re-fetch.
- **Infra:** `src/tests/stripe-webhook.infra.test.ts` — valid `subscription.created` event updates status to `'active'`; duplicate event ID returns 200 without re-processing; invalid signature returns 400; `subscription.deleted` sets `'expired'`; `invoice.payment_failed` sets `'past_due'`; unknown event type returns 200.
- **Security:** `src/tests/stripe-webhook.security.test.ts` — missing `Stripe-Signature` header returns 400; forged signature string returns 400; replayed event ID is rejected (idempotency); request without any payload returns 400; no raw Stripe error message leaked in 4xx/5xx response.
- **Infra:** `src/tests/subscribe-session.infra.test.ts` (new) — `POST /api/subscribe/session` creates nonce row in `subscribe_nonces`; returns URL with nonce parameter (no UID/email); expired nonce rejected by web checkout; unauthenticated request returns 401.
- **Security:** `src/tests/subscribe-session.security.test.ts` — nonce URL contains no UID or email; two requests from the same user produce two distinct nonces; nonce is single-use (second exchange attempt returns 400); already-active subscriber returns 400 without creating a nonce.

---

## 11. Operating Boundaries

**Target files:**
- `src/app/api/user-profile/route.ts` — subscription_status read + trial initiation
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook handler (new)
- `src/app/api/subscribe/session/route.ts` — nonce-based checkout URL endpoint (new, Step 4b)
- `mobile/app/(app)/_layout.tsx` — subscription_status gate on every screen
- `mobile/src/components/paywall/PaywallScreen.tsx` — new component
- `mobile/src/store/paywallStore.ts` — new store

**Out of scope:**
- In-app purchase (Apple IAP) — deliberately excluded
- Pricing tier display in-app — managed on web only
- Team/org subscription billing — Phase 2

**Cross-spec dependencies:**
- Spec 93 — Firebase UID links Stripe customer to app user
- Spec 91 — lead feed blocked when `subscription_status = 'expired'`
- Spec 77 — flight board blocked when `subscription_status = 'expired'`
- Spec 95 — `subscription_status`, `trial_started_at`, `stripe_customer_id` live in `user_profiles`


