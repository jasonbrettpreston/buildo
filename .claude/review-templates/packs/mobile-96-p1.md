# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile subscription (Spec 96, whole; governs the no-plan and limit states)
Source: docs/specs/03-mobile/96_mobile_subscription.md:1-370
Generator: hand-written
Rules in the whole list: 11 (counted by pattern /^## \d+\./) · this is part 1 of 2

<<< Spec 96 whole (docs/specs/03-mobile/96_mobile_subscription.md:1-370) >>>
# Spec 96 — Mobile Subscription & Paywall

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 2** of `.cursor/active_task.md`.

> Dated note 2026-11-09 (McFrontend Phase 2, MF-41; M-246, prior text kept; spec review R-4, `~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md`; product names per the operator ruling "MAxbld stays a seperate app ...", record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): this spec governs the lead-gen product's (Buildo) trial, paywall and subscription gate. The per-product entitlement model is Spec 116 §4 N2-N3; `user_profiles.subscription_status` is dropped (`migrations/229_uid_uuid_fk_conversion.sql:129`); product ownership is the Spec 116 §1 table (dated note 2026-11-09). Deferral, stated: Spec 116 (Cross-Spec Dependencies) binds a "Spec 96 rewrite (N2/N3)"; N3 is unmet today for the parcel shelf, which passes the Buildo app gate in `mobile/app/(app)/_layout.tsx` (the lead-gen status). The rewrite is owned by MF-45 and MF-49 and is in their done-conditions. Path B (§ "Path B — Web First", :49) was never built (Spec 20).

> Dated note 2026-11-11 (M-246, prior text kept; MF-45 · McFrontend queue · lane E; operator, verbatim: "a" (D-1), "all five a" (D-2..D-6) and "y" (the MB-44 wait dropped, build starts); record `~/Buildo-scratch/mcfrontend/MF-45/DECISIONS.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-45: operator \"y\""; plan `~/Buildo-scratch/mcfrontend/MF-45/plan.md` with its section 12 folds): the server half of the rewrite owned by MF-45 lands: the parcel lookup gate is per product. `GET /api/parcels/lookup` admits a `parcel_tool` entitlement in {trial, active, past_due, admin_managed} (metered, Spec 126 section 11b.7 dated note 2026-11-11), else the `lead_gen` status in the same set (the App A shelf, unmetered, a declared deviation MF-50 removes), else 403 `SUBSCRIPTION_REQUIRED`. The status set is the one constant of section 10. The app half (the App A gate in `mobile/app/(app)/_layout.tsx`) stays MF-49. Nothing in this spec's Buildo trial, paywall or lead-gen gate changes. The text above is unchanged.

> Dated note 2026-11-14 (M-246, prior text kept; MF-47 · McFrontend queue · lane B1; operator, verbatim: "I'll accept the recommendation for both WF-83 and MF-47 - as long as it complaint and the new ruling if required is recorded" (2026-11-14); record `~/Buildo-scratch/mcfrontend/MF-47/DECISIONS.md`, "Ruled 2026-11-14 under the operator's acceptance", and the seat `~/Buildo-scratch/mcfrontend/MF-47/reality-check-1114.md`; build plan `~/Buildo-scratch/mcfrontend/MF-47/build-plan.md`): the shared webhook mapping now reads Stripe `trialing` as `trial` (MaxBLD's card-up-front trial); Buildo sells no Stripe trial, so nothing changes for Buildo, whose trial stays the in-app `initTrialEntitlement`. Reconcile derives active > trial > past_due > expired, so a trialing-only customer no longer derives `expired`. Spec 20 note 2026-11-14 has the detail.

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
- **No auto-renewal (trial):** The 14-day trial ends cleanly. No credit card is required and no payment is automatically initiated.
- **Auto-renewal (paid subscription):** The paid subscription (post-trial, initiated via `buildo.com`) IS auto-renewing monthly by default. Cancellation is via the Stripe Customer Portal. This distinction must be communicated clearly on the `buildo.com` checkout page — not in-app. Users who cancel retain access through the end of their paid billing period (`cancel_at_period_end = true` configured in Stripe — see §7).

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

**"Continue at buildo.com →":** The app requests a checkout URL from `POST /api/subscribe/session` (Firebase Bearer token required). The server generates a **single-use, server-side nonce** and stores it as `subscribe_nonces(nonce TEXT PK, user_id TEXT, expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes')`. The URL is `buildo.com/subscribe?nonce={nonce}` — no UID or email in the URL (avoids PII exposure in server logs, browser history, and referrer headers). The web checkout page exchanges the nonce server-to-server to look up the Firebase UID, immediately invalidates the nonce (DELETE), then pre-fills email in Stripe checkout and links the resulting Stripe customer to the correct Firebase UID. On payment success, Stripe webhook updates `subscription_status = 'active'`. The app opens this URL via `WebBrowser.openBrowserAsync()` from `expo-web-browser`. (`openAuthSessionAsync` is for OAuth redirect flows only — it expects an auth callback URL scheme. Stripe checkout is a standard browser redirect, not an OAuth flow. Using `openAuthSessionAsync` here would cause the browser session to terminate incorrectly.)

**⚠️ App Store compliance note:** Apple App Store Review Guideline 3.1.1 restricts buttons or links that direct users to external purchasing mechanisms for digital content/services. The "Continue at buildo.com →" CTA may be flagged during App Store review. This is a known risk acknowledged at build time. Mitigation options include: (a) using Apple-approved neutral language like "Learn more" instead of "Continue at buildo.com →"; (b) relying on the App Store's reader app exemption if Buildo qualifies; (c) a separate iOS build variant that hides the CTA. This decision requires legal and product review before iOS submission — do NOT submit to App Store without resolving this.

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

The AppState listener is the primary access restoration path. A manual "Already paid? Refresh status" link is provided as a fallback (visible after 60 seconds on the paywall — see §9 Webhook Delay Refresh) for cases where the listener fires but the Stripe webhook has not yet been processed.

## 7. Subscription Management

All billing management occurs on the web — no in-app payment UI. This is intentional to avoid Apple's in-app purchase requirement and associated commission.

**In-app:** Settings → Subscription → *"Manage subscription at buildo.com →"* opens Stripe Customer Portal in `expo-web-browser`.

**Cancellation:** User cancels via Stripe Customer Portal on web. Subscriptions are configured with `cancel_at_period_end = true` — the user retains access through the end of their paid period, then `subscription_status = 'expired'` is written by the `customer.subscription.deleted` webhook. User sees paywall on next app open after the billing period ends.

**Resubscription:** User re-subscribes via `buildo.com` — same flow as initial payment. A returning subscriber gets a NEW Stripe customer id; the webhook's metadata-primary path re-activates authoritatively (the P26 re-subscriber fix — Spec 20 §4.2).

> **Canonical money-loop spec:** the full server route family (`/api/subscribe/session` → `/exchange` → `/portal-session`, the `/api/webhooks/stripe` event map, delete-time period-end cancel, the admin subscription-ops routes) is owned and kept-to-truth in **Spec 20 (Stripe Web Checkout)**; this spec covers the mobile-facing surface only. The mobile `usePortalSession` hook (26C) replaces the static billing URL with `POST /api/subscribe/portal-session`. Operator validation: `docs/runbook/stripe_webhook_smoke.md`.

## 8. Manufacturer Accounts

Manufacturers have `subscription_status = 'admin_managed'`. They:
- Never see the paywall screen
- Never see the trial countdown
- Never see subscription management in Settings
- Access is controlled entirely by Buildo admin

When Buildo admin deactivates a manufacturer account, the server sets `onboarding_complete = false` (not `subscription_status = 'expired'`). This is critical: setting `subscription_status = 'expired'` would route the manufacturer to the consumer paywall — an inappropriate screen for a B2B account. Instead, setting `onboarding_complete = false` triggers the Spec 94 `(onboarding)/_layout.tsx` gate, which detects `account_preset = 'manufacturer' AND onboarding_complete = false` and renders the holding screen. The manufacturer sees the holding screen (Spec 94 §7) on next app open. `subscription_status` remains `'admin_managed'` throughout — it is never changed by deactivation.

## 9. Design & Interface

### Design Language

Spec 96 presents the highest-stakes screen in the app: the paywall moment. The design must communicate value (what the user earned in their trial), create urgency without being hostile, and make the subscription path feel trustworthy and low-friction. The aesthetic stays within the established industrial-utilitarian dark mode language — `bg-zinc-950` screen, `text-zinc-100` headlines, `amber-500` primary CTA — but the layout is intentionally centred and breathable (unlike the dense feed). This is a deliberate tonal shift: the rest of the app is information-dense; the paywall gives the user space to make a decision.

---

### PaywallScreen Layout

**Container:** `<SafeAreaView className="bg-zinc-950 flex-1">` wrapping `<View className="flex-1 items-center justify-center px-8">`. SafeAreaView is required to prevent the headline from rendering behind the device notch on notched iPhones.

**Stagger sequence (Reanimated `withTiming`):**

| Element | Delay | Transform |
|---------|-------|-----------|
| Icon lock `text-amber-500` (`<Lock size={32} color="#f59e0b" />` from `lucide-react-native`) | 0ms | opacity 0→1 + `translateY: 12→0` |
| Headline "Your free trial has ended." | 80ms | opacity 0→1 + `translateY: 12→0` |
| Lead count `[X] leads in 14 days` | 160ms | opacity 0→1 + `translateY: 12→0` |
| Primary CTA button | 240ms | opacity 0→1 + `translateY: 8→0` |
| "Maybe later" secondary | 320ms | opacity 0→1 |

All: `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))` on `useSharedValue(0)` instances. `withTiming` first arg = target value (1), not duration. Secondary ("Maybe later") has **opacity only** — no `translateY` transform.

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

**Transition:** Once `subscription_status` resolves, the loading guard unmounts instantly. If status is `'trial'` / `'active'` / `'past_due'` / `'admin_managed'`, the feed renders. If `'expired'`, `<PaywallScreen>` fades in via a single `opacity: 0 → 1` `withTiming(1, { duration: 200 })` on `useSharedValue(0)` (no stagger needed — the spinner already provided the anticipatory pause).

---

### Inline Blur State (Dismissed Paywall)

When `paywallStore.dismissed = true` AND `subscription_status === 'expired'`, the feed and flight board enter inline blur mode — the paywall is dismissed but the content is locked.

**Banner:** Pinned at top of the tab content area.
- Container: `bg-zinc-900/95 flex-row items-center justify-between px-4 py-3 border-b border-zinc-800`
- Text: `text-zinc-300 text-sm flex-1` — "Trial ended — subscribe to see new leads."
- CTA chip: `bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1` with `text-amber-400 text-xs font-semibold` — "Subscribe →"
- Tapping anywhere on the banner: `paywallStore.show()` — reopens `<PaywallScreen>`

**Lead card blur:** `<BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill}>` from `expo-blur` placed as an **absolute sibling over the card content**, not as a parent wrapper. The card content `<View>` gets `style={{ opacity: 0.1 }}`. The combination makes cards visibly present but illegible. **Android degradation:** `BlurView` requires Android API level 31+ (Android 12). On API < 31, `expo-blur` silently renders a transparent view — apply a fallback `<View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,9,11,0.85)' }]}>` for Android API < 31, detected via `Platform.OS === 'android' && Platform.Version < 31`.

**Empty feel prevention:** Show at least 4 blurred card placeholders so the feed doesn't look broken. Use skeleton-shaped `bg-zinc-900 rounded-2xl h-28 w-full` blocks with a `style={{ opacity: 0.15 }}` inline prop (NativeWind v4 arbitrary `opacity-[0.15]` may not JIT-compile — use inline style for this value) if the actual feed query is also blocked.

**Scroll-to-top on entering blur mode:** When `paywallStore.dismiss()` is called (switching from `<PaywallScreen>` to inline-blur), call `feedScrollRef.current?.scrollToOffset({ offset: 0, animated: false })` so the banner is immediately visible at the top of the list.

---

### Webhook Delay Refresh (60-Second Reveal)

The "Already paid? Refresh status" link is hidden initially and revealed after 60 seconds on the paywall screen without a status change.

**Implementation:** `useEffect` with `setTimeout(60_000)` → set `showRefresh = true`. **The timeout must be cleared in the cleanup return:** `return () => clearTimeout(timerId)` — prevents `setState` on an unmounted component if the paywall unmounts before the 60s fires (e.g., user pays and paywall closes). The link fades in via `withTiming(1, { duration: 400 })` opacity transition on `useSharedValue(0)`. On tap: calls `queryClient.invalidateQueries(['user-profile'])` + shows `<ActivityIndicator size="small" color="#71717a" />` inline next to the link text while refetching. If status comes back `'active'`, paywall dismisses. If still `'expired'`, a `text-zinc-500 text-xs` message appears: "Still showing trial ended — please check buildo.com."

---

### `paywallStore` State Machine

File: `mobile/src/store/paywallStore.ts`

| State field | Type | Meaning |
|-------------|------|---------|
| `visible` | boolean | Full paywall screen is showing |
| `dismissed` | boolean | User tapped "Maybe later" — inline blur mode |
| `show()` | action | Set `visible: true`, `dismissed: false` |
| `dismiss()` | action | Set `visible: false`, `dismissed: true` |
| `reset()` | action | Set both false — called when `subscription_status` changes to `'active'` OR on sign-out (renamed from `clear()` on 2026-05-03 per Spec 99 §3.4 + §9.19 for §B5 naming uniformity) |

`paywallStore` is not persisted in MMKV — always starts fresh on app open so a returning subscriber is never stuck in inline blur mode.

**Sign-out reset (critical):** `paywallStore.reset()` MUST be called in the sign-out action (Spec 93 Step 2 `signOut()` action) alongside the other Zustand `.reset()` calls in the Spec 99 §B5 `clearLocalSessionState` fan-out. Without this, a User A who dismissed the paywall and then signed out on a shared device would leave `paywallStore.dismissed = true` in memory, causing User B to see the inline blur mode immediately on sign-in (before their status is even checked). Since `paywallStore` is not MMKV-persisted, this only affects same-session shared-device scenarios — but those occur with family or team phone hand-offs.

---

## 10. Implementation

### Cross-Spec Build Order

This spec is step 4 of 5. **Spec 95 `user_profiles.subscription_status` column and GET endpoint must exist, and Spec 93 AuthGate must be operational** before the subscription gate can function.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

