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
| `expired` | Trial ended, not paid | Paywall screen — no feed access |
| `admin_managed` | Manufacturers | Full access — no payment flow |

## 3. Discovery Paths

### Path A — App First (App Store discovery)

```
User downloads app
  → Signs up (Spec 93)
  → Completes onboarding (Spec 94)
  → trial_started_at written → subscription_status = 'trial'
  → Full access for 14 days
  → Day 10: reminder email — "4 days left on your trial"
  → Day 13: reminder email + push — "Trial ends tomorrow"
  → Day 14: subscription_status = 'expired'
  → Paywall screen on next app open
  → User pays at buildo.com (browser)
  → Stripe webhook → subscription_status = 'active'
  → Full access restored on next app open or foreground
```

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

**"Continue at buildo.com →":** Opens `buildo.com/subscribe` in `expo-web-browser`. Stripe checkout on web. On payment success, Stripe webhook updates `subscription_status = 'active'`.

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
4. Maximum delay between payment and access: ~30 seconds (webhook latency + foreground poll)

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

## 9. Implementation

### Cross-Spec Build Order

This spec is step 4 of 5. **Spec 95 `user_profiles.subscription_status` column and GET endpoint must exist, and Spec 93 AuthGate must be operational** before the subscription gate can function.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — PaywallScreen component**
- File: `mobile/src/components/paywall/PaywallScreen.tsx`
- NativeWind classes per §5. Lead count sourced from `user_profiles.lead_views_count` (passed as prop from the layout gate).
- "Continue at buildo.com →" opens `expo-web-browser` with `buildo.com/subscribe`.
- "Maybe later" calls `paywallStore.dismiss()` — does not fully hide paywall, switches to inline-blur mode.

**Step 2 — Subscription gate in app layout**
- File: `mobile/app/(app)/_layout.tsx`
- On mount + on `AppState change` to `'active'`: call `queryClient.invalidateQueries(['user-profile'])` to re-fetch profile. If `subscription_status === 'expired'` → render `<PaywallScreen>` over content (absolute positioned, z-index above all tabs). Four status values handled:
  - `'trial'` → full access, no paywall
  - `'active'` → full access, no paywall
  - `'expired'` → `<PaywallScreen>`
  - `'admin_managed'` → full access, no paywall, subscription section hidden in Settings

**Step 3 — Inline blur banners**
- Files: `mobile/app/(app)/(tabs)/index.tsx`, `mobile/app/(app)/(tabs)/flight-board.tsx`
- Rendered when `paywallStore.dismissed = true` AND `subscription_status === 'expired'`. Banner: `"Trial ended — subscribe to see new leads."` Lead cards blurred via `style={{ opacity: 0.15 }}`. Tapping banner calls `paywallStore.show()`.

**Step 4 — Trial started_at write**
- File: `mobile/app/(app)/_layout.tsx` (same file, on-mount check)
- If `subscription_status === null` and `trial_started_at === null` after first post-onboarding launch: PATCH `{ subscription_status: 'trial', trial_started_at: new Date().toISOString() }`. Fire once and never again (guarded by `trial_started_at !== null` check).

**Step 5 — Stripe webhook handler**
- File: `src/app/api/webhooks/stripe/route.ts`
- Public route (no Firebase auth — Stripe calls it). Verify `Stripe-Signature` header via `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Invalid signature → 400.
- `customer.subscription.created` / `customer.subscription.updated` with `status: 'active'` → PATCH `subscription_status = 'active'` + write `stripe_customer_id`.
- `customer.subscription.deleted` → PATCH `subscription_status = 'expired'`.
- Unknown event types → 200 no-op (idempotent).
- Try-catch per §00 §2.2. `logError` on unexpected errors.

**Step 6 — Day 10/13 reminders**
- **TODO: Phase 2** — Cloud Function daily sweep checks `trial_started_at` and sends reminder emails at day 10 and push + email at day 13. Cloud Functions infra not yet set up. Backend logic to implement: `NOW() - trial_started_at >= INTERVAL '10 days'` → trigger email; `>= INTERVAL '13 days'` → trigger email + push.

### Testing Gates

- **Unit:** `mobile/__tests__/subscriptionGate.test.ts` — gate passes (no paywall) for `'trial'`, `'active'`, `'admin_managed'`; shows `<PaywallScreen>` for `'expired'`; `admin_managed` never shows paywall even if somehow `expired`; AppState `'active'` event triggers re-fetch.
- **Infra:** `src/tests/stripe-webhook.infra.test.ts` — valid `subscription.created` event updates status to `'active'`; invalid signature returns 400; `subscription.deleted` sets `'expired'`; unknown event type returns 200.

---

## 10. Operating Boundaries

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
