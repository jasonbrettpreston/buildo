# Spec 77 — Mobile CRM Flight Board (Pillar 2)

## 1. Goal & User Story

**Goal:** Provide an operational tracking view ("The Flight Board") separate from the discovery feed, allowing tradespeople to monitor the timeline, urgency, and phase-shifts of their claimed jobs.
**User Story:** As a tradesperson, I need a single screen that acts like an airport departure board. I want to see immediately which of my upcoming jobs are delayed, which are approaching their start date, and the best/worst-case timeline scenarios so I can schedule my crews efficiently.

**Design Benchmark:** The physical airport departure board is the primary metaphor. Delta Air Lines' app is the closest digital reference — temporal urgency grouping, high-contrast typography for hectic environments, right-anchored departure times, and real-time status signals (green/yellow/red). Our implementation applies this metaphor to construction permit tracking.

## 2. Mobile UI Architecture (Expo / NativeWind)

* **Navigation:** Accessed via the primary bottom Tab Bar (Tab 2). Tapping the already-active Flight Board tab scrolls back to the top of the FlashList (`scrollToOffset({ offset: 0, animated: true })`). Apple HIG standard.
* **The List Engine:** `@shopify/flash-list`. Critical for 60fps scrolling when tracking dozens of jobs.
* **Aesthetics:** Dark mode, high-contrast monospace fonts for dates and permit numbers. Follows the "Industrial Utilitarian" design language — validated by Delta's own UX principle of "high-contrast visuals and clear typography ensuring readability in hectic environments." Job sites are hectic environments.
* **Tab Bar Scroll Behaviour:** Tab bar hides on downward scroll, reveals on upward scroll (same as Lead Feed). Apply Reanimated `translateY` to tab navigator wrapper. Always shown on Map and Settings screens.

## 3. Behavioral Contract

### 3.1 The Global Search & Claim (FAB)

* **Action:** A floating action button (FAB) in the bottom-right corner launches the `SearchPermitsSheet` for manual job lookup — for jobs won outside the app.
* **FAB Visual Spec:** 56×56px, `rounded-2xl` (not `rounded-full` — more industrial), `bg-amber-500 active:bg-amber-600`. Icon: **search/magnifying glass** (NOT `+` — the action is lookup, not create). Amber glow shadow: `shadow-lg` + `shadowColor: rgba(245,158,11,0.25)`. Position: `absolute bottom-6 right-4` within SafeAreaView. Press animation: `withSpring(0.92, { stiffness: 400, damping: 20 })` on pressIn, `withSpring(1.0)` on pressOut.
* **API:** Hits `GET /api/leads/search?q={address_or_permit}`.
* **Result:** User taps a result and claims it. This sends a `POST` mutation via TanStack Query to attach the permit to their user profile's tracking board. Fire `successNotification()` haptic on successful claim.

### 3.2 The Main Flight Board View

The Next.js backend supplies tracking data. The UI groups by `temporal_group` then sorts by `predicted_start ASC` within each group.

**Temporal Grouping (The Departure Board Effect)**
Instead of a flat list, the UI groups jobs using section headers for immediate visual parsing. Each section header has a left-border accent colour that immediately signals urgency level:

| Section | Condition | Left Border | Label Colour |
|---------|-----------|-------------|--------------|
| **Action Required** | `lifecycle_stalled` OR urgency flag | `border-l-2 border-red-500` | `text-red-400` |
| **Departing Soon** | `predicted_start` ≤ 14 days | `border-l-2 border-amber-500` | `text-amber-400` |
| **On the Horizon** | `predicted_start` > 14 days | `border-l-2 border-zinc-600` | `text-zinc-400` |

Section header container: `flex-row items-center justify-between py-3 px-4 bg-zinc-950 border-b border-zinc-800/50`. Label: `font-mono text-xs tracking-widest uppercase pl-3`. Count (right-aligned): `font-mono text-xs text-zinc-600`.

**Card Layout (Compact — Airport Departure Board)**

The defining visual rule: **the date is right-anchored**, mirroring a physical departure board's departure time column. This creates immediate visual scanning rhythm.

```
┌──────────────────────────────────────────────────┐
│ 123 Main St, Annex                     MAR 15 →  │
│ 23-145678-BLD                  Structural         │
│ ────────────────────────────────────────────────   │
│ [⚠ DELAYED]                       [⚡ 7 DAYS]   │
└──────────────────────────────────────────────────┘
```

NativeWind classes:
* Outer `<Pressable>`: `bg-zinc-900 border border-zinc-800 rounded-xl p-4`
* Address row: `flex-row items-start justify-between`
* Address: `text-zinc-100 font-semibold text-sm flex-1 mr-3`
* Date: `font-mono text-amber-500 text-base font-bold text-right` (right-anchored — non-negotiable)
* Permit row: `flex-row items-center justify-between mt-0.5`
* Permit number: `font-mono text-zinc-400 text-xs tracking-wider`
* Phase: `text-zinc-300 text-xs`
* Stalled badge: `bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-md text-red-400 text-xs font-mono`
* Urgent badge: `bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md text-amber-400 text-xs font-mono`
* `testID="flight-card-{index}"` on outer Pressable.

**Amber Update Flash (card-level unread indicator, from Spec 92 §4.4)**
When a card's permit was updated while the app was backgrounded, overlay an animated view inside the card:
```
// Reanimated:
bgOpacity.value = withSequence(
  withTiming(1, { duration: 0 }),
  withDelay(500, withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }))
);
// AnimatedView: backgroundColor = rgba(245, 158, 11, opacity * 0.12)
// Positioned absolute inset-0 rounded-xl, pointerEvents="none"
```
The flash draws the eye to what changed without obscuring card content.

**Backend signal:** the `GET /api/leads/flight-board` list response includes `updated_at: string` (ISO 8601) per item, sourced from `permits.updated_at` (added in migration 115). `permits.updated_at` is auto-maintained by the `set_updated_at` BEFORE-UPDATE trigger from migration 100, so any change in the ingestion pipeline propagates without code changes.

**Client tracking:** the mobile client maintains `{ [permitId]: lastSeenUpdatedAt }` in MMKV (key `flight-board-last-seen`) via `mobile/src/store/flightBoardSeenStore.ts` (Zustand + persist middleware; per Spec 99 §3.4b, reset on sign-out via §B5). On every list render, the parent passes `hasUpdate={item.updated_at !== mmkvSeen[permitId]}` to `FlightCard`; first-sight rows (no MMKV entry) do NOT flash. After the user opens the detail screen for a permit, the parent writes the current `updated_at` back to MMKV so subsequent renders are quiet until the next backend change. Cross-reference: Spec 92 §4.4 (animation contract — defers here for the trigger rule). Spec 98 §3.2 testID: `flight-card-update-flash` on the AnimatedView overlay.

### 3.3 The Detailed Investigation View

Tapping a flight board card pushes a new detail screen to the navigation stack.

**Header**
* Full Address (`address`) — `text-zinc-100 text-xl font-bold`
* Street View Image (cached via `expo-image`, `contentFit="cover"`)

**Timeline Engine Data**
* Target Date: `predicted_start` — `font-mono text-amber-500 text-2xl font-bold`
* **Best Case / Worst Case gauge:** Full-width horizontal visualisation. Validates the Uber Eats "best case / worst case" pattern — users understand the framing instinctively.
    * Track: `bg-zinc-800 h-2 rounded-full w-full`
    * Range bar (p25 → p75 proportional positions): `bg-amber-500/40 h-2` spanning the range
    * Median dot: `bg-amber-500 w-3 h-3 rounded-full` positioned at 50th percentile
    * Labels: `"Best Case"` (`font-mono text-xs text-zinc-400`) below left edge; `"Worst Case"` below right edge; median date in `font-mono text-amber-500 text-sm font-bold` above dot
    * Animation: Reanimated `withSpring` on bar width and dot `translateX` on mount

**Current Status**
* Current Stage: `lifecycle_phase` badge
* Delay Flag: `lifecycle_stalled` → red `"⚠ DELAYED"` badge
* Urgency Signal: `predicted_start` ≤ 7 days → amber `"⚡ URGENT"` badge

**Contextual Data**
* Full permit description, `estimated_cost`, `cost_tier`, `sq_footage`
* Neighborhood profile (`income_tier`, area trends)

**Actions & Lifecycle**
* **"Remove from Board":** Manual override. See §4.1 for undo behaviour.
* **Auto-Archiving:** Jobs automatically remove when the backend detects the target `lifecycle_phase` for this trade has been completed.

#### 3.3.1 API Contract — `GET /api/leads/flight-board/detail/:id`

Powers the cold-boot path on `/(app)/[flight-job]` when a push notification opens the app from a closed state: `useFlightBoard()` cache is empty, so the screen calls this endpoint with the permit id from the deep link instead of failing with "Job not found".

| | |
|---|---|
| **Auth** | Bearer token (mobile) or session cookie (web). |
| **Path param** | `id` — `${permit_num}--${revision_num}`. CoA ids return 400 (flight board only tracks permits). |
| **Status codes** | 200 success · 400 `INVALID_LEAD_ID` · 401 `UNAUTHORIZED` · 404 `NOT_FOUND` (permit not on user's saved board) · 500 sanitized |
| **Response shape** | `{ data: FlightBoardDetail, error: null, meta: null }` |

`FlightBoardDetail` (defined in `src/app/api/leads/flight-board/detail/[id]/types.ts`) matches a single item from the list endpoint plus `updated_at`. Authorization is implicit in the SQL: the row is only returned when `lead_views.user_id = ctx.uid AND saved = true AND lead_type = 'permit'`. A permit the user has unsaved between push and tap returns 404 — by the natural WHERE filter, no separate auth branch.

## 4. Mobile-Native User Experience (UX)

### 4.1 Native Gestures

**Swipe-to-Remove (with Undo Window)**
Industry standard (Gmail, iOS Mail, WhatsApp): never fire a destructive action immediately — give the user a 3-second undo window.

1. User swipes left on a card. Red "Remove" action panel revealed: `bg-red-600 w-20 items-center justify-center rounded-r-xl`. Label: `"Remove"` in `text-white font-mono text-xs`. Full swipe threshold: 80px.
2. On full swipe: fire `heavyImpact()` haptic immediately. Card disappears (optimistic removal via `queryClient.setQueryData`).
3. **Undo snackbar appears** at bottom of screen, above tab bar: `bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex-row justify-between items-center`. Left: `"Job removed."` in `text-zinc-300 text-sm`. Right: `"UNDO"` `<Pressable>` in `text-amber-400 font-mono text-sm`. 44px touch target.
4. After 3 seconds: snackbar dismisses, DELETE mutation fires. On API error: restore card via snapshot, show error toast.
5. If user taps UNDO before 3 seconds: `clearTimeout`, restore card via `queryClient.setQueryData`, dismiss snackbar with no mutation.

*Rationale:* Accidental swipes are common on job sites (work gloves, vibration, phone in pocket). The cost of an accidental deletion is high — user must find and re-claim the permit. Undo is the correct pattern. References: Gmail, iOS Mail research confirms undo availability significantly reduces complaint rates.

**Pull-to-Refresh:** Standard rubber-band pull. Fire `mediumImpact()` haptic at activation threshold. `<RefreshControl tintColor="#f59e0b"/>` (amber spinner).

### 4.2 Empty & Edge States

**The Empty Board (Radar State)**
If the user has no claimed jobs, render a purposeful empty state — not a blank screen.

SVG radar graphic spec (react-native-svg):
* Canvas: 200×200px, centred in the screen
* 3 concentric circles: radii 30, 65, 100px. Stroke: `#3f3f46`, opacity 0.4 / 0.25 / 0.15 (outer rings fade more)
* Crosshair: 2 perpendicular lines, stroke `#3f3f46`, opacity 0.2, `strokeDasharray="4 4"`
* Centre dot: `r=4`, fill `#71717a`
* Sweep arm: line from centre to (0, −100), stroke `#f59e0b`, opacity 0.5, with gradient fade to transparent toward centre
* **Sweep animation:** `withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1)` via Reanimated rotation on the sweep arm group
* All elements at ≤30% opacity — this is ambient texture, not a dominant illustration

Below the radar:
* Body copy: `text-zinc-500 text-sm text-center` — `"No jobs tracked yet."`
* CTA: `"Find Jobs on the Lead Feed"` — `font-mono text-amber-400 text-sm` with `→` arrow, `<Pressable>` switches bottom tab to Feed

**Offline Resilience (Basement Mode)**
If the device loses connection, the Flight Board MUST NOT show a generic error screen. It renders the last known MMKV-cached state and adds a subtle top banner: `bg-zinc-800 border-b border-amber-500/30 py-2 px-4` — `"Offline mode. Last updated [time]."` in `text-zinc-400 text-xs font-mono`. Banner fades in/out with Reanimated `withTiming`. Validated by Flightradar24's offline display pattern — professionals expect their data to remain visible even without connectivity.

## 5. State & API Flow (TanStack Query)

* **Data Fetching:** Uses `useQuery` (not infinite scroll — the personal board fits in memory). `staleTime: 30000`, `gcTime: 3600000`.
* **Optimistic Updates with Undo:** See §4.1 for the complete undo-window pattern. The DELETE mutation is deferred 3 seconds to allow user-initiated cancellation. Error rollback restores the TanStack Query snapshot.
* **`captureEvent`:** `'job_removed_from_board'` fired on successful DELETE mutation (not on optimistic remove, in case of undo).

## 6. Design System Directives

These directives are locked from the design audit and competitive UX review. Deviating requires a spec update.

### 6.1 Colour Contract
Inherits from Spec 91 §6.1. Flight Board-specific additions:

| State | Colour | NativeWind |
|-------|--------|-----------|
| Stalled/Delayed badge | `#f87171` on `rgba(248,113,113,0.2)` | `text-red-400 bg-red-500/20 border-red-500/40` |
| Urgent badge | `#f59e0b` on `rgba(245,158,11,0.2)` | `text-amber-400 bg-amber-500/20 border-amber-500/40` |
| Amber update flash | `rgba(245,158,11,0.12)` animated → transparent | Reanimated AnimatedView overlay |
| Undo snackbar border | `#3f3f46` | `border-zinc-700` |

### 6.2 FlightCard Component Rules
* Date column is **always right-anchored** — this is the departure board convention, validated by every airline app and physical departure board. Never centre the date.
* Permit number is **always monospace** — it is data, not prose.
* Both status badges (stalled + urgent) may appear simultaneously on the same card.

### 6.3 Temporal Section Header Rules
Section headers use three distinct left-border accent colours — red, amber, zinc-600. This creates an immediate urgency hierarchy without any text labels needing to be read first. The colour alone communicates the tier.

### 6.4 `FlightCardSkeleton.tsx`
Exact same spec as `LeadCardSkeleton` (Spec 91 §4.4): Reanimated pulse, `bg-zinc-800` fill, same dimensional contract as the populated card.

## 7. Future Enhancements (Phase 2 Scope)

**iOS Live Activities & Dynamic Island**
Delta Air Lines uses iOS Live Activities for real-time gate change tracking — an independently validated approach that produced 50% more app sessions than baseline. For `START_DATE_URGENT` permits (≤7 days to predicted start), a persistent Lock Screen widget showing `"23 Main St → Framing Phase — 5 days"` would provide continuous awareness without requiring the user to open the app. Expo SDK 52+ has experimental Live Activities support. This is not in scope for Phase 5 but should be the first post-launch enhancement.

**Android Dynamic Notifications**
Equivalent to iOS Live Activities: persistent notification with expandable timeline gauge. Same deferred scope as Live Activities.
