# Spec 91 — Mobile Lead Feed (Discovery Engine)

**Status:** ACTIVE (Mobile Pivot)
**Purpose:** Dictates the exact UI, components, and logic for the primary discovery interface (tradesperson AND real estate agent personas — see §1.2), orchestrating the browsing of construction opportunities via high-performance native list rendering and geospatial map synchronization.

## 1. Goal & User Story

**Goal:** Provide a highly performant, memory-safe, and visually intuitive native interface for tradespeople and real estate agents to discover, filter, and interact with geographically relevant construction permits.

### 1.1 Tradesperson user story
As a tradesperson, I want to open the app and instantly see a map and feed of relevant jobs near my physical location. I need to seamlessly scroll through hundreds of leads without crashing my phone's RAM, filter by radius, and tap to save high-value opportunities instantly.

### 1.2 Real estate agent user story
As a real estate agent, I want the same map + feed UX as a tradesperson, surfacing permits that signal **listing-prospecting** opportunities (earliest possible — homeowners about to start a major build are about to need a listing agent or a new home for the duration) and **closing-prospecting** opportunities (latest possible — completed builds need a sale). I differ from a tradesperson only in WHICH lifecycle phases are calibrated as actionable for me; the algorithm, scoring, flight board, save flow, and detail screens are identical.

**Algorithmic invariant:** the §3 backend contract and §4 behavioral mechanisms are **persona-agnostic**. Both personas flow through the same `getLeadFeed` SQL, the same `target_window`, the same `opportunity_score`, the same `competition_count` JOIN, the same `is_saved` LATERAL gate. Persona-specific behavior is expressed via DB calibration only (the row in `trades` + the row in `trade_forecasts`), not via algorithm branching. This is enforced by Spec 95 §3.1.x (persona vs trade_slug separation of concerns).

### 1.3 Persona coverage matrix

The full set of `account_preset` values (Spec 95 §3.1):

| `account_preset` | `trade_slug` | Feed semantics | Onboarding | Subscription |
|---|---|---|---|---|
| `'tradesperson'` | one of 32 construction trades | This spec — calibrated to that trade's `work_phase` | Standard (Spec 94 §3) | Trial → paid (Spec 96) |
| `'realtor'` | `'realtor'` | This spec — calibrated to `'realtor'` `work_phase` (earliest + latest extremes) | Standard with realtor-specific radius default + always-fixed address (Spec 94 §3.1 trade list + §4 Path R) | Trial → paid (Spec 96) |
| `'manufacturer'` | `NULL` (uses `trade_slugs_override` array) | **Not customer-facing.** Admin-managed B2B; bypasses this spec entirely. | Onboarding bypass (Spec 94 §7) | Admin-managed (Spec 95 §3.1; Spec 96 §expiration excludes manufacturers) |

**Single source of truth:** `account_preset` is a UX hint (drives onboarding flow + welcome copy). **`trade_slug` is the authoritative input to this spec's algorithm.** A profile with `account_preset='realtor'` but `trade_slug='roofing'` would receive a roofer's feed — `trade_slug` wins. Onboarding (Spec 94) is the gate that ensures the two stay aligned per the matrix above.

> **Wire-up status (2026-05-06):** the `'realtor'` `trade_slug` is recognized by mobile onboarding (`mobile/src/lib/onboarding/tradeData.ts`, `mobile/app/(onboarding)/profession.tsx`, Spec 94 §3.1 trade list + §4 Path R) but is **NOT yet wired in the backend feed/data layer** — see §3.5 Wire-up dependencies for the complete list of what a follow-up cycle must ship before realtors get a non-empty feed end-to-end.

## 2. Technical Architecture (Expo / NativeWind)

**Directory Structure & Component Library**
Located primarily in `mobile/app/(app)/index.tsx` and `mobile/src/components/feed/`. It leverages React Native Reusables and NativeWind.

* `app/(app)/index.tsx` *(Container)*: The orchestrating screen. Uses `@shopify/flash-list` for native GPU memory recycling to allow infinite scrolling of 1,000+ cards without crashing. Integrates `<RefreshControl>` for pull-to-refresh mechanics.
* `components/feed/FilterTriggerRow.tsx`: Sticky `ListHeaderComponent` rendered above all FlashList items. Always visible. Contains a `"Filters"` pressable and the active radius chip. Tapping opens `LeadFilterSheet`. When filters are active the label reads `"Filters · {n}"` in amber. **This is the primary filter entry point** — the filter sheet must never be the only way to access filtering. Industry standard: Airbnb, LinkedIn, Zillow, and all discovery apps surface filters in a persistent header row.
* `components/feed/LeadFilterSheet.tsx`: A `@gorhom/bottom-sheet` (Reanimated) overlay to adjust TanStack Query parameters (trade type, radius). Snap points: `['50%', '85%']` — 50% for radius-only quick-filter, 85% for full trade chip grid.
* `components/feed/EmptyFeedState.tsx`: Native UI rendering three states: `no_results` (+5KM expand prompt), `offline` (Last synced MMKV cache warning), and `unreachable` (API error).

**State Management & Core Logic**
* `store/filterStore.ts` (Zustand v5): Tracks `radiusKm`, `tradeSlug`, and `homeBaseLocation`. Persisted synchronously via `react-native-mmkv` so the app cold-boots exactly where the user left off.
* `hooks/useLeadFeed.ts` (TanStack Query v5): Wrapper over `useInfiniteQuery` connecting to `GET /api/leads/feed`. Uses `getNextPageParam` for infinite scrolling. Per **Spec 99 §B1** (canonical Server → TanStack Query bridge), all server fetches MUST go through TanStack Query — never raw `fetch()` in components — and the response is parsed through `LeadFeedResultSchema` (Spec 90 §13 Zod boundary) before TanStack stores it.
* `hooks/useLocation.ts`: Debounces `expo-location` updates. Query caches are only dropped and refetched when the user physically breaches a 500m "Snapping Distance" buffer to prevent relentless API thrashing while driving/walking.

**Tab Bar Scroll Behaviour**
The tab bar hides on downward scroll and reveals on upward scroll for the Feed and Flight Board screens, adding ~15-20% visible content area without sacrificing navigation access. Implementation: track `lastScrollY` via a module-level ref; on FlashList `onScroll` (throttled at 16ms), if `deltaY > 5` animate tab bar `translateY` to `80` (hidden); if `deltaY < -5` animate back to `0` (shown). Apply a Reanimated `useAnimatedStyle` to the tab navigator's wrapper view. **This behaviour applies only to Feed and Flight Board** — Map and Settings always show the tab bar.

**Scroll-to-Top on Active Tab Re-Tap**
Tapping an already-active Feed tab scrolls the FlashList back to offset 0 (animated). Implemented via the React Navigation `tabPress` listener: if `navigation.isFocused()` is already true, call `flashListRef.current?.scrollToOffset({ offset: 0, animated: true })`. Apple HIG standard behaviour, expected by power users.

## 3. The Backend Contract (Pipeline V2 Payload)

The feed acts as a "Dumb Glass" client. All heavy geospatial computations (Haversine) and algorithmic scoring are handled by the Next.js backend. The UI consumes the modernised pipeline payload:

* `opportunity_score`: `number` (0–100 bimodal score).
* `target_window`: `'bid' | 'work'` (The bimodal routing flag).
* `competition_count`: `number` (Tracks market saturation — count of other app users who have viewed or saved this permit). Zero means no tracked competition.
* `lifecycle_phase`: `string` (Unified P1–P20 stage).

All four fields are required in the Zod schema (`PermitLeadFeedItemSchema`). `competition_count` must be `z.number().int().nonnegative()`.

### 3.5 Wire-up dependencies for the realtor persona (Cycle 7 — pending)

The realtor persona's mobile UX is wired today (Spec 94 §3.1 trade list + §4 Path R; trade picker entry; onboarding path) but the backend feed/data layer for `trade_slug='realtor'` is incomplete. The follow-up cycle ("Cycle 7 — Realtor backend wire-up") MUST ship the following five items before the realtor feed returns non-empty results end-to-end:

1. **`TRADES` array entry.** Add `{ id: 33, slug: 'realtor', name: 'Real Estate Agent', icon: ..., color: ..., sort_order: 33 }` to `src/lib/classification/trades.ts`. Mobile already references `slug='realtor'` in `tradeData.ts:76`; the backend list is the missing half.
2. **DB `trades` table seed.** New migration appending the realtor row to the `trades` table (mirrors migration 028 / 029 patterns).
3. **`trade_forecasts` calibration row.** A row keyed by `trade_slug='realtor'` with a `work_phase` value. Product decision required at wire-up time: realtors care about TWO temporal extremes (earliest = P1-ish submission, latest = P20-ish occupancy). Options: (a) pick ONE work_phase (e.g., P1 for listing-prospecting; trade off the closing-prospecting use case to a separate flow), (b) split realtors into two trade slugs (`'realtor-listing'` + `'realtor-closing'`), or (c) extend `trade_forecasts` to support multi-phase calibration. Defer to wire-up cycle.
4. **`permit_trades` association strategy — MANDATED: every-active-permit row (option (a)).** The feed SQL JOINs `permits` to `permit_trades` via `trade_slug`. For realtors to see leads, every active permit must associate with `'realtor'` somehow. **The §1.2 algorithmic invariant resolves this: persona-specific behavior MUST be expressed via DB calibration, not algorithm branching. Therefore Cycle 7 MUST backfill `permit_trades` so every active permit gets a `(permit_id, 'realtor')` row** — handled by a recurring job or pipeline trigger; mechanical; idempotent. Acknowledged cost: ~doubles the `permit_trades` row count (at scale, this is significant — 50M permits → 50M new rows; storage + index + backup impact must be benchmarked during Cycle 7).
   - **Rejected alternative — SQL bypass:** modifying `getLeadFeed` to short-circuit the `permit_trades` JOIN when `trade_slug='realtor'` would be an algorithm branch. **Explicitly rejected** because it violates §1.2; documented here only so Cycle 7 doesn't re-discover and re-litigate. The rejection holds regardless of operational cost — if the row-count cost of (a) becomes truly infeasible, the right response is to amend §1.2 (a deliberate architectural change), not to silently break the invariant in `getLeadFeed`.
5. **Tests.** Logic + infra tests asserting `getLeadFeed({ trade_slug: 'realtor' })` returns leads (currently 0). UI test asserting the realtor feed renders cards (currently empty state). Maestro flow exercising realtor onboarding → feed → save end-to-end.

Until Cycle 7 ships, a profile with `trade_slug='realtor'` will receive an empty feed (the existing empty-state UI handles it gracefully but no leads are shown). The mobile onboarding flow is intentionally permissive about this gap — the assumption is that Cycle 7 lands before any realtor accounts go to production.

## 4. Behavioral Contract & UX Mechanisms

### 4.1 The Data Representation Cards (List View)

**`FilterTriggerRow.tsx` (always-visible sticky header)**
Rendered as the FlashList `ListHeaderComponent` so it scrolls with content but re-anchors at top when scrolled up. Container: `bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex-row items-center gap-3`. Left: `<Pressable>` with label `"Filters"` (or `"Filters · {n}"` in `text-amber-400` when n > 0 filters active). Right: radius chip showing current `radiusKm` in `font-mono text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded`. Fire `lightImpact()` haptic when opened.

**`PermitLeadCard.tsx`**
* *Display:* Address, Dynamic Proximity (calculated by backend), Expected Value (`cost_tier`), and current `lifecycle_phase`.
* *Layout:* `<Pressable className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3">`. `OpportunityRing` left-anchored (56×56). Address: `text-zinc-100 font-semibold text-base leading-tight flex-1`. Permit number: `font-mono text-zinc-400 text-xs tracking-wider`. Divider: `border-t border-zinc-800 my-3`. Badge row: `flex-row gap-2 flex-wrap items-center`.
* *Pressed state:* Reanimated `withSpring(0.97, { stiffness: 400, damping: 20, mass: 1 })` scale on `onPressIn`. Reset on `onPressOut`.
* *Badging:*
    * `target_window === 'bid'` → amber `"💎 Early Bid"` pill: `bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md text-amber-400 text-xs font-mono`
    * `target_window === 'work'` → green `"🚨 Rescue Mission"` pill: `bg-green-500/20 border border-green-500/40 px-2 py-0.5 rounded-md text-green-400 text-xs font-mono`
    * `competition_count > 0` → gray `"👁 {n} Tracking"` saturation pill: `bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md text-zinc-400 text-xs`
    * `cost_tier` → neutral zinc pill (always shown)
* *Touch target:* `min-h-[44px]` on outer Pressable. `testID="lead-card-{index}"`.
* *UX:* Tapping pushes route to Detailed Investigation View (`/(app)/[lead]?id=X`).

**`OpportunityRing.tsx`**
A custom React Native SVG circular progress indicator:
* Size: 56×56px. Stroke width: 4px. Radius: 24px. Circumference: 150.8px.
* Track (background ring): `#3f3f46` (zinc-700). `strokeLinecap: "round"`. Start at 12 o'clock (rotation −90°).
* Score ≥ 80: stroke `#f59e0b` (amber-500 — Hot).
* Score 50–79: stroke `#22c55e` (green-500 — Good).
* Score < 50: stroke `#71717a` (zinc-500 — Cold).
* Center text: score number in `font-mono text-xs text-zinc-200`.
* **Mount animation:** Ring fills from full circumference to final `strokeDashoffset` over 350ms, `Easing.out(Easing.cubic)`. Gives each card load a "gauge powering up" feel.

### 4.2 LeadMapPane.tsx (Spatio-Visualiser)

* *Engine:* `react-native-maps` with `react-native-maps-super-cluster` to prevent rendering thousands of raw `<Marker>` elements.
* *Phase-Based Marker Icons (V1):* Individual map markers do NOT use standard Google/Apple red pins. V1 uses phase-colour-coded circle markers: amber fill for early phases (P1–P7), green fill for mid phases (P8–P14), zinc fill for late phases (P15–P20). This lets the tradesperson read the map's timeline at a glance. V2 scope: custom SVG icon set (foundation bucket, framing icon, occupancy icon etc.) — deferred until post-launch.
* *Pan Debouncing:* Uses a 400ms `onRegionChangeComplete` buffer before updating the map's bounding box state and refetching leads.
* *Tap Interaction:* Tapping a marker instantly brings up a localised preview card or routes directly to the Detailed Investigation View.

### 4.3 The Detailed Investigation View (`/[lead]?id=X`)

Whether tapped from the feed or the map, the user is routed to a comprehensive, full-screen detail view powered by a discrete TanStack Query (`useLeadDetail`).

* **Header:** Full Address, `OpportunityRing` score, and a Street View Image (cached via `expo-image`).
* **Core Project Intelligence:**
    * **Project Details:** Full permit description and builder/applicant entity (if unmasked).
    * **Cost Estimate:** The algorithmic `estimated_cost` and designated `cost_tier`.
    * **Square Footage Projection:** The calculated geometric footprint (`sq_footage`) of the target build.
    * **Target Start Date:** The `predicted_start` date derived from the V2 backend pipeline. Displayed in `font-mono text-amber-500`.
    * **Neighborhood Profile:** Macro-data about the build location (e.g., income tier, neighborhood development trends, surrounding active permits).
* **Primary Call to Action:**
    * `SaveButton.tsx` floating fixed at the bottom of the screen.

#### 4.3.1 API Contract — `GET /api/leads/detail/:id`

| | |
|---|---|
| **Auth** | Bearer token (mobile) or session cookie (web) — same as `/api/leads/feed`. |
| **Path param** | `id` — `${permit_num}--${revision_num}` for permits, `COA-${application_number}` for CoA leads. |
| **Status codes** | 200 success · 400 `INVALID_LEAD_ID` (malformed) · 401 `UNAUTHORIZED` · 404 `NOT_FOUND` (no permit row, or CoA — currently unimplemented) · 500 `INTERNAL_ERROR`/`DATABASE_ERROR` (sanitized, no raw `err.message` leaked) |
| **Response shape** | `{ data: LeadDetail, error: null, meta: null }` |

`LeadDetail` is defined in `src/app/api/leads/detail/[id]/types.ts` and includes:
`lead_id`, `lead_type`, `permit_num`, `revision_num`, `address`, `location: { lat, lng } | null`, `work_description`, `applicant` (reserved — currently null), `lifecycle_phase`, `lifecycle_stalled`, `target_window` (`'bid' | 'work' | null`), `opportunity_score`, `competition_count`, `predicted_start`, `p25_days`, `p75_days`, `cost: { estimated, tier, range_low, range_high, modeled_gfa_sqm } | null`, `neighbourhood: { name, avg_household_income, median_household_income, period_of_construction } | null`, `updated_at` (ISO 8601), `is_saved: boolean` (per-user save state — `lead_views.saved=true AND user_id=ctx.uid`; always non-null).

The handler joins `permits + cost_estimates + neighbourhoods + trade_forecasts` plus two LATERAL subqueries over `lead_views`: a `COUNT(DISTINCT user_id)` excluding the viewer for `competition_count`, and an `EXISTS` scoped to the viewer for `is_saved`. `target_window` and `opportunity_score` are read directly from `trade_forecasts` (already persisted there — not recomputed in JS).

### 4.4 Interactive Primitives

**`SaveButton.tsx` (Optimistic Database Persister)**
* Implements strict Optimistic Updates per **Spec 99 §B3** (Zustand → Server mutation with rollback): `onMutate` snapshots cached query data and applies the optimistic UI; `onError` restores from snapshot; `onSettled` invalidates to reconcile server state. WF1-A extended this to mirror state across both `['lead-feed']` and `['lead-detail', leadId]` cache keys (`mobile/src/hooks/useSaveLead.ts`) so the detail screen renders correctly on cold-boot deep-link.
* Tapping instantly fills the heart icon and fires a `successNotification()` haptic (NOT medium impact — the save is a successful state mutation, not a physical force).
* Scale pulse on fill: Reanimated `withSequence(withSpring(1.3), withSpring(1.0))`.
* If the TanStack `useMutation` fails, rolls the UI backward and triggers a NativeWind error toast. Successful saves route the lead to the CRM Flight Board (Spec 77) for timeline tracking.
* `testID="save-button-{index}"` (unfilled) / `testID="save-heart-filled-{index}"` (filled, optimistic). The `SaveButton` derives the filled-state inner-View testID by `.replace('save-button-', 'save-heart-filled-')` — callers MUST pass a testID matching the `save-button-{slot}` convention so the replace produces the canonical filled testID (e.g., the detail screen passes `save-button-detail` → `save-heart-filled-detail`).

**`LeadCardSkeleton.tsx`**
* Exact physical dimensions of `LeadCard`. Same `bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3` container.
* `bg-zinc-800` rectangles for all text placeholders. 56×56 `bg-zinc-800 rounded-full` for the ring.
* Pulse animation: Reanimated `withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1.0, { duration: 700 })), -1, false)` opacity. Do NOT use NativeWind `animate-pulse` — it does not work in React Native.
* Render 6 skeletons on initial load to eliminate layout shift.

## 5. Behavior-Driven Design & Testing Mandate

Development of this feature is strictly Maestro-first.

**Maestro E2E (`maestro/scroll-feed.yaml`)**
```yaml
appId: com.buildo.app
---
- launchApp
- assertVisible: "Lead Feed"
- assertVisible:
    id: "lead-card-0"
- assertVisible: "Filters"         # FilterTriggerRow always visible
- swipe:
    direction: UP
    duration: 800
- assertVisible:
    id: "lead-card-10"             # Infinite scroll loaded next page
- tapOn:
    id: "save-button-0"
- assertVisible:
    id: "save-heart-filled-0"      # Optimistic UI filled
- tapOn: "Lead Feed"               # Tap already-active tab
- assertVisible:
    id: "lead-card-0"              # Scrolled back to top
- tapOn:
    id: "lead-card-0"
- assertVisible: "Permit Details"  # Routes to detail sheet
```

**Jest (Unit/Logic):** `__tests__/useLeadFeed.test.ts`
* Zod schema parsing of V2 payload (including `competition_count`, `target_window`).
* Corrupted MMKV cache states gracefully wipe and recover (`onError` deserialise callback).
* `competition_count > 0` renders "Tracking" pill.
* `target_window === 'work'` renders "🚨 Rescue Mission" (not "Work Window").

## 6. Design System Directives

These directives are locked from the design audit and competitive UX review. Deviating requires a spec update.

### 6.1 Industrial Utilitarian Colour Contract
| Token | Value | Usage |
|-------|-------|-------|
| `bg-zinc-950` | `#09090b` | Screen base |
| `bg-zinc-900` | `#18181b` | Cards, sheets |
| `bg-zinc-800` | `#27272a` | Interactive elements, skeleton fill |
| `text-zinc-100` | `#f4f4f5` | Primary body copy — always on zinc-900 |
| `text-zinc-400` | `#a1a1aa` | Secondary / permit numbers |
| `text-amber-500` / `bg-amber-500` | `#f59e0b` | Primary accent — dates, scores ≥80, active filters |
| `text-green-400` | `#4ade80` | Rescue Mission badge, score 50–79 |
| `text-red-400` | `#f87171` | Stall/error states only |
| `border-zinc-800` | `#27272a` | Card borders, dividers |

**Rule:** `text-zinc-300` on `bg-zinc-800` is the minimum contrast permitted for secondary text. Never use zinc-400 on zinc-700 — fails WCAG AA for field-use sunlight readability.

### 6.2 Typography Contract
* All numbers, dates, permit numbers, scores, distances: `font-mono`
* Body / address text: default (system sans-serif via NativeWind)
* Badge labels: `font-mono text-xs`
* Section labels in sheets: `font-mono text-xs uppercase tracking-wider`

### 6.3 Touch Target Minimum
All interactive elements: `min-h-[44px] min-w-[44px]`. This is Apple HIG and Android Material minimum. Non-negotiable for field use with work gloves.

### 6.4 Filter Sheet Spec
* Snap points: `['50%', '85%']`
* Handle bar: `bg-zinc-700 w-10 h-1 rounded-full self-center mt-3 mb-4`
* Top accent: `border-t-2 border-amber-500/20` (signals draggability)
* Background: `bg-zinc-900` (not zinc-950)
* Backdrop: `rgba(0, 0, 0, 0.7)`
* Slider tint: `#f59e0b`
* Active trade chip: `bg-amber-500/20 border border-amber-500 text-amber-300 rounded-lg px-3 py-2`
* Inactive trade chip: `bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg px-3 py-2`
