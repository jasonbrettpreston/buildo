# Spec 96 — Mobile Subscription & Paywall

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol), Spec 93 (Auth), Spec 91 (Lead Feed), Spec 95 (User Profiles)

## 1. Goal & User Story

**Goal:** Gate access to the lead feed and flight board behind a 14-day free trial and a Stripe-powered subscription, with zero Apple commission by keeping all payment on the web.
**User Story:** As a new user who just downloaded the app, I want to explore real leads for free before committing to a subscription — and when I'm ready to pay, I want it to be straightforward.

## 2. Subscription Status Model

`user_profiles.subscription_status` is checked on every app launch after auth. Four states:

| Status | Who | Experience |
|--------|-----|-----------|
| `trial` | New users, first 14 days | Full access — feed, flight board, all features |
| `active` | Paid subscribers | Full access |
| `past_due` | Payment failed, in Stripe dunning | Full access — Stripe retrying payment |
| `expired` | Trial ended / subscription cancelled | Paywall screen — no feed access |
| `admin_managed` | Manufacturers | Full access — no payment flow |
| `cancelled_pending_deletion` | Account deletion requested | No access — redirect to sign-in |

## 3. Discovery Paths

### Path A — App First (App Store discovery)

```
User downloads app
  → Signs up (Spec 93)
  → Completes onboarding (Spec 94)
  → Server writes trial_started_at + subscription_status = 'trial' on first /api/user-profile fetch post-onboarding
  → Full access for 14 days
  → [Phase 2] Day 10: reminder email — "4 days left on your trial"
  → [Phase 2] Day 13: reminder email + push — "Trial ends tomorrow"
  → Day 14: subscription_status computed as 'expired' on API read (Phase 1)
  → Paywall screen on next app open
  → User pays at buildo.com (browser, authenticated via signed link)
  → Stripe webhook → subscription_status = 'active'
  → Full access restored on next app open or foreground
```

**Phase 1 note:** Day 10/13 reminder emails are deferred to Phase 2 (Cloud Functions). Phase 1 ships without trial reminders — users whose trials expire will see the paywall without advance warning. This is a known UX gap for launch.

### Path B — Web First (website discovery)

```
User visits buildo.com
  → Signs up + pays (Stripe)
  → subscription_status = 'active' written immediately
  → Receives "Download the app" email with App Store link
  → Downloads app → signs in with same Firebase credentials
  → Full access immediately — no trial period
```

Firebase Auth is the bridge. Same UID on web and mobile — no second sign-up.

## 4. Free Trial Mechanics

- **Duration:** 14 days from `trial_started_at`
- **Credit card:** Not required to start trial
- **Access:** Full — no feature limitations during trial
- **Reminders:** Automated emails at day 10 and day 13 (triggered by Cloud Functions)
- **Day 13 push:** Single push notification — *"Your free trial ends tomorrow. Continue at buildo.com."*
- **No auto-renewal:** Trial ends cleanly. User must actively pay to continue.

## 5. Paywall Screen

Shown when `subscription_status = 'expired'` on app open or foreground resume.

```
┌──────────────────────────────────────┐
│                                      │
│   Your free trial has ended.         │
│                                      │
│   You saw [X] leads in 14 days.      │
│                                      │
│   [ Continue at buildo.com → ]       │
│                                      │
│   [ Maybe later ]                    │
│                                      │
└──────────────────────────────────────┘
```

**Lead count:** Fetched from `user_profiles` (tracked during trial — increment on each unique lead viewed). Makes the trial value concrete at the highest-friction moment.

**"Continue at buildo.com →":** The app requests a short-lived signed checkout URL from `POST /api/subscribe/session` (Firebase Bearer token required). The server generates a URL of the form `buildo.com/subscribe?token={signed_jwt}` where the JWT contains `{ uid, email, exp: +15min }`. The app opens this URL in `expo-web-browser`. The web checkout page reads the JWT to identify the Firebase user, pre-fills email in Stripe checkout, and links the resulting Stripe customer to the correct Firebase UID. On payment success, Stripe webhook updates `subscription_status = 'active'`.

**"Maybe later":** Dismisses paywall temporarily. User can browse the app but feed and flight board show an inline banner: `"Trial ended — subscribe to see new leads."` All lead cards blurred/locked. User can re-trigger the paywall by tapping the banner.

**NativeWind classes:**
- Container: `bg-zinc-950 flex-1 items-center justify-center px-8`
- Headline: `text-zinc-100 text-2xl font-bold text-center mb-2`
- Lead count: `text-amber-400 font-mono text-4xl font-bold text-center mb-6`
- Primary CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 px-8 w-full items-center`
- Secondary: `text-zinc-500 text-sm mt-4`

## 6. Post-Payment Access Restoration

After Stripe payment on web:

1. Stripe webhook fires → `subscription_status = 'active'`, `stripe_customer_id` written to `user_profiles`
2. On next app open or foreground (`AppState` change listener): app re-fetches `user_profiles`
3. If `subscription_status` changed to `active`: dismiss paywall, reload feed
4. **Typical delay:** ~30 seconds when app is in foreground (webhook latency + foreground poll). If app is backgrounded or Stripe webhook is delayed, access restoration may take several minutes.
5. **Webhook delay fallback:** The paywall screen includes a subtle "Refresh" link below "Maybe later" — visible only if the user has been on the paywall for > 60 seconds without status change. Tapping it re-fetches profile immediately. This is the user's self-recovery path for webhook delays.

No manual "I've paid, refresh" button required — the AppState listener handles it.

## 7. Subscription Management

All billing management occurs on the web — no in-app payment UI. This is intentional to avoid Apple's in-app purchase requirement and associated commission.

**In-app:** Settings → Subscription → *"Manage subscription at buildo.com →"* opens Stripe Customer Portal in `expo-web-browser`.

**Cancellation:** User cancels via Stripe Customer Portal on web. At end of billing period, `subscription_status = 'expired'`. User sees paywall on next app open.

**Resubscription:** User re-subscribes via `buildo.com` — same flow as initial payment.

## 8. Manufacturer Accounts

Manufacturers have `subscription_status = 'admin_managed'`. They:
- Never see the paywall screen
- Never see the trial countdown
- Never see subscription management in Settings
- Access is controlled entirely by Buildo admin

When Buildo admin deactivates a manufacturer account, `subscription_status` is updated server-side. The manufacturer sees the holding screen (Spec 94 §7) on next app open.

## 9. Design & Interface

### Design Language

Spec 96 presents the highest-stakes screen in the app: the paywall moment. The design must communicate value (what the user earned in their trial), create urgency without being hostile, and make the subscription path feel trustworthy and low-friction. The aesthetic stays within the established industrial-utilitarian dark mode language — `bg-zinc-950` screen, `text-zinc-100` headlines, `amber-500` primary CTA — but the layout is intentionally centred and breathable (unlike the dense feed). This is a deliberate tonal shift: the rest of the app is information-dense; the paywall gives the user space to make a decision.

---

### PaywallScreen Layout

**Container:** `bg-zinc-950 flex-1 items-center justify-center px-8`

**Stagger sequence (Reanimated `withTiming`):**

| Element | Delay | Transform |
|---------|-------|-----------|
| Icon lock `text-amber-500` (Feather `lock`, 32px) | 0ms | opacity 0→1 + `translateY: 12→0` |
| Headline "Your free trial has ended." | 80ms | opacity 0→1 + `translateY: 12→0` |
| Lead count `[X] leads in 14 days` | 160ms | opacity 0→1 + `translateY: 12→0` |
| Primary CTA button | 240ms | opacity 0→1 + `translateY: 8→0` |
| "Maybe later" secondary | 320ms | opacity 0→1 |

All: `withTiming(300, { easing: Easing.out(Easing.ease) })`.

**NativeWind classes by element:**

| Slot | Classes |
|------|---------|
| Lock icon container | `mb-8 items-center` |
| Headline | `text-zinc-100 text-2xl font-bold text-center mb-2` |
| Sub-headline (count) | `text-amber-400 font-mono text-4xl font-bold text-center mb-8` |
| Count caption | `text-zinc-500 text-sm text-center mb-10` — "viewed in your 14-day trial" |
| Primary CTA | `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 px-8 w-full items-center mb-3` |
| CTA label | `text-zinc-950 text-base font-bold` |
| Secondary ("Maybe later") | `text-zinc-500 text-sm mt-4` |
| Refresh link (60s reveal) | `text-zinc-600 text-xs mt-2` — "Already paid? Refresh status" |

**Accessibility:** `accessibilityRole="header"` on headline. Primary CTA: `accessibilityLabel="Continue subscription at buildo.com"`. Refresh link: `accessibilityLabel="Refresh subscription status"` (appears after 60s).

---

### Loading Guard (Before Status Resolves)

**Rule:** Never flash the paywall while `subscription_status` is `null` or `undefined`. The layout renders a full-screen loading guard instead.

**Loading guard:** `bg-zinc-950 flex-1 items-center justify-center` with `<ActivityIndicator size="large" color="#f59e0b" />` (amber-400 equivalent). No text, no logo — just the spinner. This matches the initial app boot spinner pattern (Spec 93) so the transition into the gate feels part of the same loading sequence.

**Transition:** Once `subscription_status` resolves, the loading guard unmounts instantly. If status is `'trial'` / `'active'` / `'past_due'` / `'admin_managed'`, the feed renders. If `'expired'`, `<PaywallScreen>` fades in via a single `opacity: 0 → 1` `withTiming(200)` (no stagger needed — the spinner already provided the anticipatory pause).

---

### Inline Blur State (Dismissed Paywall)

When `paywallStore.dismissed = true` AND `subscription_status === 'expired'`, the feed and flight board enter inline blur mode — the paywall is dismissed but the content is locked.

**Banner:** Pinned at top of the tab content area.
- Container: `bg-zinc-900/95 flex-row items-center justify-between px-4 py-3 border-b border-zinc-800`
- Text: `text-zinc-300 text-sm flex-1` — "Trial ended — subscribe to see new leads."
- CTA chip: `bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1` with `text-amber-400 text-xs font-semibold` — "Subscribe →"
- Tapping anywhere on the banner: `paywallStore.show()` — reopens `<PaywallScreen>`

**Lead card blur:** `<BlurView intensity={8} tint="dark">` from `expo-blur` wrapping each lead card + `style={{ opacity: 0.1 }}` on the card content beneath. The combination makes cards visibly present but illegible — communicating "there is content here, you just can't see it."

**Empty feel prevention:** Show at least 4 blurred card placeholders so the feed doesn't look broken. Use skeleton-shaped `bg-zinc-900 rounded-2xl h-28 w-full` blocks with `opacity: 0.15` if the actual feed query is also blocked.

---

### Webhook Delay Refresh (60-Second Reveal)

The "Already paid? Refresh status" link is hidden initially and revealed after 60 seconds on the paywall screen without a status change.

**Implementation:** `useEffect` with `setTimeout(60_000)` → set `showRefresh = true`. The link fades in via `withTiming(400)` opacity transition. On tap: calls `queryClient.invalidateQueries(['user-profile'])` + shows `<ActivityIndicator size="small" color="#71717a" />` inline next to the link text while refetching. If status comes back `'active'`, paywall dismisses. If still `'expired'`, a `text-zinc-500 text-xs` message appears: "Still showing trial ended — please check buildo.com."

---

### `paywallStore` State Machine

File: `mobile/src/store/paywallStore.ts`

| State field | Type | Meaning |
|-------------|------|---------|
| `visible` | boolean | Full paywall screen is showing |
| `dismissed` | boolean | User tapped "Maybe later" — inline blur mode |
| `show()` | action | Set `visible: true`, `dismissed: false` |
| `dismiss()` | action | Set `visible: false`, `dismissed: true` |
| `clear()` | action | Set both false — called when `subscription_status` changes to `'active'` |

`paywallStore` is not persisted in MMKV — always starts fresh on app open so a returning subscriber is never stuck in inline blur mode.

---

## 10. Implementation

### Cross-Spec Build Order

This spec is step 4 of 5. **Spec 95 `user_profiles.subscription_status` column and GET endpoint must exist, and Spec 93 AuthGate must be operational** before the subscription gate can function.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — PaywallScreen component**
- File: `mobile/src/components/paywall/PaywallScreen.tsx`
- NativeWind classes and stagger animation sequence per §9. Lead count sourced from `user_profiles.lead_views_count` (passed as prop from the layout gate).
- **Stagger animation:** Five `useSharedValue(0)` instances (icon, headline, count, primaryCTA, secondary), each animated via `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`. `useAnimatedStyle` drives both `opacity` and `transform: [{ translateY: interpolate(sv, [0, 1], [12, 0]) }]` (8px for CTA, 0 for secondary).
- **`lead_views_count` display:** Rendered as `{count} leads` in `text-amber-400 font-mono text-4xl font-bold text-center` with a caption `text-zinc-500 text-sm text-center` below: "viewed in your 14-day trial".
- "Continue at buildo.com →" calls `POST /api/subscribe/session` (Firebase Bearer token) to get the signed checkout URL, then opens it via `WebBrowser.openAuthSessionAsync()` from `expo-web-browser`. Show an inline `ActivityIndicator size="small"` inside the button while the session request is in-flight; replace with "Continue at buildo.com →" text once the URL is received.
- "Maybe later" calls `paywallStore.dismiss()` — does not fully hide paywall, switches to inline-blur mode.
- **60-second Refresh link:** `useEffect(() => { const t = setTimeout(() => setShowRefresh(true), 60_000); return () => clearTimeout(t); }, [])`. Fades in via `withTiming(400)`. Tap: `queryClient.invalidateQueries(['user-profile'])`. See §9 for full interaction spec.

**Step 2 — Subscription gate in app layout**
- File: `mobile/app/(app)/_layout.tsx`
- On mount + on `AppState change` to `'active'`: call `queryClient.invalidateQueries(['user-profile'])` to re-fetch profile.
- **Loading guard (design-critical):** While `subscription_status` is `null` or `undefined` (initial fetch in progress), render a full-screen loading guard: `bg-zinc-950 flex-1 items-center justify-center` with `<ActivityIndicator size="large" color="#f59e0b" />`. Do NOT flash the paywall during this window. Only render `<PaywallScreen>` after the fetch resolves to `'expired'`. Loading guard → `<PaywallScreen>` transition: `opacity: 0 → 1` `withTiming(200)` on the `PaywallScreen` mount.
- **When `subscription_status` changes from `'expired'` to `'active'`** (post-payment webhook): call `paywallStore.clear()`, then `queryClient.invalidateQueries(['leads'])` so the feed reloads with real data. The paywall screen should fade out (opacity `1 → 0`, `withTiming(200)`) before unmounting.
- Five status values handled:
  - `'trial'` → full access, no paywall
  - `'active'` → full access, no paywall; `paywallStore.clear()` called if previously dismissed
  - `'past_due'` → full access, no paywall (user is in Stripe dunning grace period)
  - `'expired'` → `<PaywallScreen>` (if `paywallStore.dismissed`, render feed with inline blur)
  - `'admin_managed'` → full access, no paywall, subscription section hidden in Settings

**Step 3 — Inline blur banners**
- Files: `mobile/app/(app)/(tabs)/index.tsx`, `mobile/app/(app)/(tabs)/flight-board.tsx`
- Rendered when `paywallStore.dismissed = true` AND `subscription_status === 'expired'`.
- **Banner layout (design per §9):** `bg-zinc-900/95 flex-row items-center justify-between px-4 py-3 border-b border-zinc-800`. Left: `text-zinc-300 text-sm flex-1` text "Trial ended — subscribe to see new leads." Right: `bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1` chip with `text-amber-400 text-xs font-semibold` "Subscribe →". Full row `onPress`: `paywallStore.show()`.
- **Lead card blur (design per §9):** Wrap each `LeadCard` in `<BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill}>` from `expo-blur`. The card content underneath gets `style={{ opacity: 0.1 }}`. Show at minimum 4 blurred card placeholders (`bg-zinc-900 rounded-2xl h-28 w-full opacity-[0.15]`) if the feed query returned no results or was blocked.
- **Flight board:** Same banner. Individual flight board rows blurred with same `BlurView intensity={8}` + `opacity: 0.1` on content.

**Step 4 — Trial started_at write (server-side)**
- File: `src/app/api/user-profile/route.ts` (GET handler extension)
- The server, not the client, initiates the trial. When the `GET /api/user-profile` response is constructed, if `onboarding_complete = true` AND `trial_started_at IS NULL` AND `subscription_status IS NULL` AND `account_preset != 'manufacturer'`: the server atomically writes `{ trial_started_at: NOW(), subscription_status: 'trial' }` before returning the profile. The client always receives a profile with `subscription_status` set.
- This prevents client-side gaming: a user cannot block the trial start PATCH or reset it by clearing app data.

**Phase 1 trial expiration (computed):** In Phase 1, `subscription_status` is not automatically flipped by a cron job. The `GET /api/user-profile` handler checks: if `subscription_status = 'trial'` AND `trial_started_at + 14 days < NOW()`: return the profile with `subscription_status` overridden to `'expired'` in the response (without writing to DB). This is a temporary computed response until the Phase 2 Cloud Function performs the real DB update. Do not return a stale `'trial'` status to the client after the window closes.

**Step 5 — Stripe webhook handler**
- File: `src/app/api/webhooks/stripe/route.ts`
- Public route (no Firebase auth — Stripe calls it). Verify `Stripe-Signature` header via `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Invalid signature → 400.
- **Idempotency:** deduplicate on Stripe event `id` field to prevent a retried `customer.subscription.deleted` from reverting a user who has already re-subscribed.
- `customer.subscription.created` / `customer.subscription.updated` with `status: 'active'` → PATCH `subscription_status = 'active'` + write `stripe_customer_id`.
- `invoice.payment_failed` → PATCH `subscription_status = 'past_due'`. User retains access during Stripe's dunning retry period. Access revoked only on final `customer.subscription.deleted`.
- `customer.subscription.deleted` → PATCH `subscription_status = 'expired'`.
- Unknown event types → 200 no-op.
- Try-catch per §00 §2.2. `logError` on unexpected errors.

**Step 6 — Day 10/13 reminders**
- **TODO: Phase 2** — Cloud Function daily sweep checks `trial_started_at` and sends reminder emails at day 10 and push + email at day 13. Cloud Functions infra not yet set up. Backend logic to implement: `NOW() - trial_started_at >= INTERVAL '10 days'` → trigger email; `>= INTERVAL '13 days'` → trigger email + push.

### Testing Gates

- **Unit:** `mobile/__tests__/subscriptionGate.test.ts` — gate passes (no paywall) for `'trial'`, `'active'`, `'admin_managed'`; shows `<PaywallScreen>` for `'expired'`; `admin_managed` never shows paywall even if somehow `expired`; AppState `'active'` event triggers re-fetch.
- **Infra:** `src/tests/stripe-webhook.infra.test.ts` — valid `subscription.created` event updates status to `'active'`; invalid signature returns 400; `subscription.deleted` sets `'expired'`; unknown event type returns 200.

---

## 11. Operating Boundaries

**Target files:**
- `src/app/api/user-profile/route.ts` — subscription_status read
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook handler (new)
- `mobile/app/(app)/_layout.tsx` — subscription_status gate on every screen
- `mobile/src/components/paywall/PaywallScreen.tsx` — new component

**Out of scope:**
- In-app purchase (Apple IAP) — deliberately excluded
- Pricing tier display in-app — managed on web only
- Team/org subscription billing — Phase 2

**Cross-spec dependencies:**
- Spec 93 — Firebase UID links Stripe customer to app user
- Spec 91 — lead feed blocked when `subscription_status = 'expired'`
- Spec 77 — flight board blocked when `subscription_status = 'expired'`
- Spec 95 — `subscription_status`, `trial_started_at`, `stripe_customer_id` live in `user_profiles`
