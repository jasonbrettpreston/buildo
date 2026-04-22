# Active Task: Buildo Mobile — Expo Application
**Status:** Implementation — Phase 0

## Context
* **Goal:** Build the tradesperson-facing Expo React Native application. The Next.js backend is already the API layer. The mobile app is a "Dumb Glass" client: captures device state, fetches pre-calculated JSON, renders at 60fps.
* **Target Specs:**
  * `docs/specs/03-mobile/90_mobile_engineering_protocol.md` — Master engineering protocol
  * `docs/specs/03-mobile/91_mobile_lead_feed.md` — Lead Feed (Phase 3)
  * `docs/specs/03-mobile/77_mobile_crm_flight_board.md` — CRM Flight Board (Phase 5)
  * `docs/specs/03-mobile/92_mobile_engagement_hardware.md` — Push Notifications & Hardware (Phase 6)
* **Key Files (New):** `mobile/` — entire Expo application
* **Key Files (Modified):**
  * `src/middleware.ts` — add Bearer token auth path alongside existing cookie auth
  * `src/features/leads/lib/get-lead-feed.ts` — add `target_window` computed field
  * `src/app/api/leads/flight-board/route.ts` — new (Phase 5)
  * `src/app/api/leads/search/route.ts` — new (Phase 5, FAB global search)
  * `src/app/api/notifications/register/route.ts` — new (Phase 6)
  * `src/app/api/notifications/preferences/route.ts` — new (Phase 6)
  * `scripts/classify-lifecycle-phase.js` — add push dispatch for LIFECYCLE_PHASE_CHANGED, LIFECYCLE_STALLED, START_DATE_URGENT

## Technical Implementation

### `mobile/` Directory Structure
```
mobile/
  app/
    _layout.tsx             # Root: Sentry.wrap + PostHog + QueryClient + MMKV persister + GestureHandlerRootView
    (auth)/
      login.tsx             # Firebase Auth (Google OAuth + email/password)
    (app)/
      _layout.tsx           # Authenticated: bottom tab navigator (Feed | Flight Board | Settings)
      index.tsx             # Lead Feed — FlashList + infinite scroll (Spec 91)
      map.tsx               # Map pane — react-native-maps + clustering (Spec 91 §4.2)
      flight-board.tsx      # CRM Flight Board — FlashList + temporal groups (Spec 77)
      [lead].tsx            # Lead detail — bottom sheet (Spec 91 §4.3)
      [flight-job].tsx      # Flight Board detail — investigation view (Spec 77 §3.3)
      settings.tsx          # Trade slug, radius, notification preferences (Spec 92 §2.3)
  src/
    components/
      ui/                   # React Native Reusables (copy-paste owned)
      feed/
        LeadCard.tsx             # PermitLeadCard per Spec 91 §4.1
        LeadCardSkeleton.tsx     # Exact-dimension skeleton (pulsing)
        OpportunityRing.tsx      # SVG circular progress — score → amber/green/gray
        LeadFilterSheet.tsx      # @gorhom/bottom-sheet filter overlay
        EmptyFeedState.tsx       # Three states: no_results / offline / unreachable
      flight-board/
        FlightCard.tsx           # Compact card: address, permit, predicted_start, badges
        FlightCardSkeleton.tsx
        TemporalSectionHeader.tsx  # "Action Required" / "Departing Soon" / "On the Horizon"
        FlightDetailView.tsx     # Investigation screen (p25/p75, stall badge, neighborhood)
        EmptyBoardState.tsx      # Radar graphic + "Find Jobs" CTA
      shared/
        SaveButton.tsx           # Optimistic heart — useMutation + haptic
        NotificationToast.tsx    # In-app foreground notification drop-down
        OfflineBanner.tsx        # "Offline mode. Last updated [time]."
    hooks/
      useLeadFeed.ts          # useInfiniteQuery → GET /api/leads/feed
      useLeadDetail.ts        # useQuery → POST /api/leads/view (records view, returns competition_count)
      useFlightBoard.ts       # useQuery → GET /api/leads/flight-board
      useSaveLead.ts          # useMutation + optimistic update + haptic
      useRemoveFromBoard.ts   # useMutation + optimistic remove + Heavy haptic
      useLocation.ts          # expo-location + 500m snapping distance + fallback
      useSearchPermits.ts     # useQuery → GET /api/leads/search?q=
    lib/
      apiClient.ts            # fetchWithAuth: injects Bearer token, handles 401/429/5xx
      mmkvPersister.ts        # TanStack Query MMKV persister adapter (AsyncStorage interface)
      queryClient.ts          # gcTime/staleTime config, retry logic
      schemas.ts              # Zod schemas mirroring Next.js API contracts
      pushTokens.ts           # expo-notifications token registration + MMKV storage
      haptics.ts              # Typed wrappers: lightImpact / mediumImpact / heavyImpact / successNotification
    store/
      filterStore.ts          # Zustand v5: radiusKm, tradeSlug, homeBaseLocation (MMKV persisted)
      authStore.ts            # Zustand v5: Firebase user + idToken
      notificationStore.ts    # Zustand v5: unread tab badge counts
    constants/
      tokens.ts               # NativeWind Industrial Utilitarian design tokens
      contracts.ts            # Mirror of docs/specs/_contracts.json values
  __tests__/
    useLeadFeed.test.ts       # Zod schema parsing, MMKV cache recovery
    useSaveLead.test.ts       # Optimistic update, rollback on error
    useFlightBoard.test.ts    # Temporal grouping logic, auto-archive filter
    schemas.test.ts           # Valid/invalid API payload parsing
  maestro/
    scroll-feed.yaml          # BDD: FlashList renders, swipe scrolls, save toggles (Spec 91 §5)
    map-view.yaml             # BDD: map loads, pin tap routes to detail
    flight-board.yaml         # BDD: temporal sections visible, swipe-to-remove
    notifications.yaml        # BDD: first save triggers permission, deep link routes (Spec 92 §5)
  app.json                    # EAS config, scheme: "buildo", permissions, Sentry DSN
  eas.json                    # EAS Build profiles: development / preview / production
  metro.config.js             # NativeWind v4 transformer
  tsconfig.json               # strict: true, noImplicitAny: true
  .cursorrules                # Contents of spec 90 (mobile engineering guardrail)
  package.json
```

### Backend Changes Required

| Route / Script | Change | Phase |
|---|---|---|
| `src/middleware.ts` | Accept `Authorization: Bearer <token>` alongside `__session` cookie | Phase 1 |
| `src/features/leads/lib/get-lead-feed.ts` | Add `target_window: 'bid' \| 'work'` computed from `TRADE_BID_WORK_PHASES` | Phase 3 |
| `src/app/api/leads/flight-board/route.ts` | **New.** Returns user's saved permits filtered to active phases, enriched with `predicted_start / p25_days / p75_days`, temporal group computed | Phase 5 |
| `src/app/api/leads/search/route.ts` | **New.** Full-text search across all permits by address/permit_num for FAB | Phase 5 |
| `src/app/api/notifications/register/route.ts` | **New.** Upserts `device_tokens` row for authenticated user | Phase 6 |
| `src/app/api/notifications/preferences/route.ts` | **New.** GET/PATCH user notification preferences in `user_profiles.notification_prefs` | Phase 6 |
| `scripts/classify-lifecycle-phase.js` | After phase update: query saved leads for the permit, dispatch push to `device_tokens` via Expo Push API for LIFECYCLE_PHASE_CHANGED / LIFECYCLE_STALLED / START_DATE_URGENT triggers | Phase 6 |

## Database Impact: YES
New migrations (next after 106):
* `107_device_tokens.sql` — `CREATE TABLE device_tokens (id SERIAL PK, user_id VARCHAR(128) NOT NULL, push_token TEXT NOT NULL, platform VARCHAR(10) CHECK (platform IN ('ios', 'android')), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, push_token))`. DOWN: DROP TABLE.
* `108_notification_prefs.sql` — `ALTER TABLE user_profiles ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{"new_lead_min_cost_tier":"medium","phase_changed":true,"lifecycle_stalled":true,"start_date_urgent":true}'`. DOWN: ALTER TABLE DROP COLUMN.

## Standards Compliance
* **Try-Catch Boundary:** All three new API routes wrap full handler in try-catch with `logError(tag, err, context)`. `classify-lifecycle-phase.js` wraps the push dispatch in a standalone try-catch — failure MUST NOT abort the classification run.
* **Unhappy Path Tests:** flight-board: 401 (no auth), 200 with empty board, 500 (DB error). search: 400 (empty q), 200 with 0 results. register: 401, 400 (invalid token), 409 handled via upsert.
* **logError Mandate:** All new API catch blocks use `logError`. Pipeline push dispatch uses `pipeline.log.error()`.
* **Mobile-First:** N/A for backend routes. Mobile app uses NativeWind with no desktop breakpoints per spec 90 §9. All touch targets ≥ 44px.

---

## Execution Plan

> **BDD Protocol (Corrections 2 & 6):** For Phases 3, 4, and 5, the Maestro YAML flow is written FIRST as the physical specification for the UI. The implementation builds to satisfy the YAML contract. The phase is not complete until `maestro test maestro/<flow>.yaml` passes. Elite "Industrial Utilitarian" UI is non-negotiable: dark mode, amber accents, monospace dates, pulsing skeleton loaders, Reanimated haptics at every state mutation.

---

### Phase 0 — Foundation & Guardrails (Days 1–2)

- [ ] **Guardrail First:** Create `mobile/.cursorrules` by copying the full contents of `docs/specs/03-mobile/90_mobile_engineering_protocol.md` verbatim. This file leashes every AI-assisted edit inside `mobile/` to the Dumb Glass contract, stack constraints, and anti-patterns before a single line of code exists.
- [ ] **Delete Superseded Rules:** Delete `mobile-rules.md` from the repo root. Spec 90 is the fully evolved master; `mobile-rules.md` is redundant and risks divergence. `git rm mobile-rules.md`.
- [ ] **Expo Project Init:** `npx create-expo-app mobile --template expo-template-blank-typescript` inside `/Buildo`. Verify `mobile/tsconfig.json` has `"strict": true, "noImplicitAny": true`.
- [ ] **EAS Bootstrap:** `cd mobile && npx eas-cli init`. Configure `eas.json` with three profiles: `development` (custom dev client), `preview` (internal distribution APK/IPA), `production` (App Store / Play Store). Set `expo.scheme: "buildo"` in `app.json`.
- [ ] **NativeWind v4:** Install `nativewind@^4 tailwindcss@3`. Add Metro transformer to `metro.config.js`. Configure `tailwind.config.js` with Industrial Utilitarian tokens: `bg-zinc-950` (base), `text-zinc-100` (primary), `text-zinc-400` (secondary), `text-amber-500` / `bg-amber-500` (accent), `border-zinc-800` (dividers), `font-mono` for dates/permit numbers.
- [ ] **Reanimated + Gesture Handler:** `expo install react-native-reanimated react-native-gesture-handler`. Add `react-native-reanimated/plugin` as the LAST babel plugin. Wrap `app/_layout.tsx` root in `<GestureHandlerRootView style={{flex:1}}>`.
- [ ] **Core Libraries:** `expo install @shopify/flash-list react-native-mmkv react-native-safe-area-context react-native-screens expo-location expo-haptics expo-image expo-font @react-native-community/netinfo react-native-svg`. `npm install @tanstack/react-query @tanstack/react-query-persist-client zustand react-hook-form @hookform/resolvers zod @gorhom/bottom-sheet react-native-maps`.
- [ ] **Observability Bootstrap:** `npx @sentry/wizard@latest -i reactNative`. Wire `Sentry.wrap(App)` in `app/_layout.tsx`. Configure EAS Build post-upload hook: `sentry-expo-upload-sourcemaps` in `eas.json` post-build hook. Install `posthog-react-native`; initialize with `distinctId = ''` (populated post-auth).
- [ ] **EAS Dev Client Build:** Run `eas build --profile development --platform ios` (or Android). This produces a `.app`/`.apk` capable of running Maestro tests. **This is the exit gate for Phase 0** — all subsequent BDD phases require a runnable dev client.
- [ ] **Maestro CI:** Add `.github/workflows/mobile-ci.yml` — `macos-latest` runner; installs Maestro CLI via `curl`; runs all `maestro/*.yaml` flows on iOS Simulator on every PR. Android flows run on `ubuntu-latest` (cheaper).

---

### Phase 1 — Auth Shell (Days 3–4)

- [ ] **Firebase Auth:** Implement `signInWithEmailAndPassword` and Google OAuth via `expo-auth-session` + `expo-crypto`. Store `idToken` in MMKV (NOT AsyncStorage — synchronous reads for cold boot). `onIdTokenChanged()` listener auto-refreshes; never cache beyond 55 minutes.
- [ ] **Auth Store (Zustand):** `authStore.ts` — `{ user, idToken, setAuth, clearAuth }`. Logout sequence: `signOut()` → `queryClient.clear()` → `authStore.clearAuth()` → `router.replace('/(auth)/login')`.
- [ ] **API Client:** `apiClient.ts` — `fetchWithAuth(url, options)` injects `Authorization: Bearer <idToken>`. Handles: `401` → force logout + `clearAuth()`; `429` → read `Retry-After` header, throw `RateLimitError(retryAfter)`, surface toast "Retrying in X seconds"; `5xx` → `Sentry.captureException()`, throw `ApiError`.
- [ ] **Backend: Bearer token middleware:** Update `src/middleware.ts` — parse `Authorization: Bearer <token>` header as an alternative to `__session` cookie. Both paths call Firebase Admin `verifyIdToken()`. Write `src/tests/middleware.security.test.ts` — three new cases: Bearer accepted, cookie still accepted, missing both → 401. **Red Light:** run test, confirm failure, then implement.
- [ ] **Auth screen UI:** `app/(auth)/login.tsx` — dark `bg-zinc-950` background, amber "Sign In" button, Google OAuth button. Logo treatment. Safe area insets via `useSafeAreaInsets()`.

---

### Phase 2 — Zod Boundary & API Contracts (Day 5)

- [ ] **Zod schemas:** `mobile/src/lib/schemas.ts` — mirror `src/features/leads/types.ts`: `PermitLeadFeedItemSchema`, `BuilderLeadFeedItemSchema`, `LeadFeedResultSchema`, `FlightBoardItemSchema`, `SearchResultSchema`. Every `apiClient.ts` fetch parses through the relevant schema; a Zod error triggers Sentry capture + error boundary.
- [ ] **Contracts mirror:** `mobile/src/constants/contracts.ts` — typed constants from `docs/specs/_contracts.json` (rate limits, geo bounds, feed limits). Query key normalization rounds lat/lng to 3dp per `contracts.feed.coord_precision`.
- [ ] **Error boundary:** `mobile/src/components/ErrorBoundary.tsx` — class component (required for React Native error boundaries). Catches Zod parse failures and unhandled API errors. Shows Sentry event ID. Wraps `<Slot>` in `app/(app)/_layout.tsx`.
- [ ] **Jest unit tests:** `__tests__/schemas.test.ts` — feed valid payload → parses; feed with missing `opportunity_score` → throws with field-level Zod error; Zod parse failure → correct error shape.

---

### Phase 3 — Lead Feed Core (Spec 91) (Days 6–9)

> **BDD First.** Write `maestro/scroll-feed.yaml` before writing a single component.

- [ ] **Write Maestro YAML contract (`maestro/scroll-feed.yaml`):**
  ```yaml
  appId: com.buildo.app
  ---
  - launchApp
  - assertVisible: "Lead Feed"
  - assertVisible:
      id: "lead-card-0"      # FlashList first item
  - swipe:
      direction: UP
      duration: 800
  - assertVisible:
      id: "lead-card-10"     # Infinite scroll loaded next page
  - tapOn:
      id: "save-button-0"
  - assertVisible:
      id: "save-heart-filled-0"   # Optimistic UI filled
  - tapOn:
      id: "lead-card-0"
  - assertVisible: "Permit Details"   # Routes to detail sheet
  ```
  This YAML is the physical specification. The UI must satisfy every assertion.

- [ ] **Backend prerequisite — `target_window` field:** Before building the feed UI, add `target_window: 'bid' | 'work'` to the feed API response. In `src/features/leads/lib/get-lead-feed.ts`, compute from `TRADE_BID_WORK_PHASES[tradeSlug]`: if permit's `lifecycle_phase` integer ≤ `bid_phase` integer → `'bid'`; else if ≤ `work_phase` integer → `'work'`; else exclude (auto-archive in feed too). Add to `PermitLeadFeedItem` type and Zod schema in `mobile/src/lib/schemas.ts`. Write test: `npx vitest run src/tests/lead-feed.logic.test.ts`.
- [ ] **MMKV Persister:** `mobile/src/lib/mmkvPersister.ts` — MMKV instance wrapped as AsyncStorage-compatible interface (`getItem/setItem/removeItem`). Wire into `PersistQueryClientProvider` in `app/_layout.tsx` with `maxAge: 86400000` (24h). On cold boot, stale cache renders instantly; fresh fetch happens silently in background.
- [ ] **QueryClient config:** `mobile/src/lib/queryClient.ts` — feeds: `gcTime: 86400000, staleTime: 300000`; detail: `gcTime: 3600000, staleTime: 30000`. `retry: (count, err) => err instanceof RateLimitError ? false : count < 3`. `retryDelay: (_, err) => err instanceof RateLimitError ? err.retryAfter * 1000 : exponentialDelay`.
- [ ] **`useLeadFeed` hook:** `useInfiniteQuery` — key `['lead-feed', tradeSlug, normLat, normLng, radiusKm]`. `getNextPageParam: (last) => last.meta.next_cursor`. Parses with `LeadFeedResultSchema`. `useLocation` hook supplies debounced coords with 500m snapping distance.
- [ ] **Elite UI — `PermitLeadCard.tsx`:** Dark card: `className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3"`. Address in `text-zinc-100 font-semibold`. Permit number in `font-mono text-zinc-400 text-xs`. `OpportunityRing` left-anchored (react-native-svg circular progress, stroke color: `>=80` amber, `>=50` green, `<50` zinc). Badge row: `target_window === 'bid'` → amber `💎 Early Bid` pill; `=== 'work'` → green `🚨 Work Window` pill. If `competition_count > 0` → gray `👁 {n} Tracking` saturation pill. Touch target `min-h-[44px]`. `testID="lead-card-{index}"` on outer `<Pressable>`.
- [ ] **Elite UI — `LeadCardSkeleton.tsx`:** Exact physical dimensions of `LeadCard`. NativeWind `animate-pulse bg-zinc-800` rectangles. Renders 6 skeletons during initial load — eliminates layout shift.
- [ ] **FlashList screen (`app/(app)/index.tsx`):** `estimatedItemSize={120}`. `renderItem` defined outside component (no anonymous arrow functions). `onEndReachedThreshold={0.5}` triggers next page. `<RefreshControl onRefresh={refetch} refreshing={isFetching} tintColor="#f59e0b"/>` (amber spinner). `EmptyFeedState` rendered when `data.pages[0].data.length === 0`.
- [ ] **`LeadFilterSheet.tsx`:** `@gorhom/bottom-sheet` with snap points `['50%']`. Dark `bg-zinc-900` background. Radius slider (10–50km, sourced from `_contracts.json geo.max_radius_km`). Trade selector. Every interaction fires `lightImpact` haptic + `captureEvent('filter_applied')`.
- [ ] **`SaveButton.tsx`:** `useSaveLead` mutation — `onMutate`: cancel queries, snapshot, flip `is_saved` optimistically, fire `mediumImpact` haptic. `onError`: restore snapshot, show error toast. `onSuccess`: fire `successNotification` haptic. `testID="save-button-{index}"` / `testID="save-heart-filled-{index}"`.
- [ ] **Lead Detail sheet (`app/(app)/[lead].tsx`):** Full-screen `@gorhom/bottom-sheet`. Header: address (`text-zinc-100 text-xl font-bold`), street view via `expo-image` with `contentFit="cover"`, `OpportunityRing` overlay. Core data: description, `lifecycle_phase` badge, `cost_tier` pill, `sq_footage`, `predicted_start` in `font-mono text-amber-500`. Neighborhood profile section. `SaveButton` fixed at bottom.
- [ ] **Verify:** Run `maestro test maestro/scroll-feed.yaml` against dev client. All assertions pass before phase is marked complete.
- [ ] **Jest:** `__tests__/useLeadFeed.test.ts` — corrupted MMKV cache gracefully clears and recovers (tests the `onError` deserialize callback on `PersistQueryClientProvider`). Zod parse of V2 payload with `target_window: 'bid'` passes. Zod parse with missing `opportunity_score` → Sentry capture called.

---

### Phase 4 — Map View (Spec 91 §4.2) (Days 10–11)

> **BDD First.** Write `maestro/map-view.yaml` before building the map screen.

- [ ] **Write Maestro YAML contract (`maestro/map-view.yaml`):**
  ```yaml
  appId: com.buildo.app
  ---
  - launchApp
  - tapOn: "Map"             # Bottom tab
  - assertVisible: "Map View"
  - swipe:
      direction: LEFT        # Pan the map
      duration: 500
  - tapOn:
      id: "map-marker-0"
  - assertVisible: "Permit Details"   # Detail sheet pushed
  ```

- [ ] **`react-native-maps` config:** Add Google Maps API key to `app.json` `expo.android.config.googleMaps.apiKey` and iOS `GMSApiKey` in `expo.ios.infoPlist`. Install `react-native-maps-super-cluster` for clustering.
- [ ] **`LeadMapPane.tsx`:** `<MapView>` dark map style (`mapType="mutedStandard"` on iOS, custom dark JSON style on Android). `onRegionChangeComplete` debounced 400ms — updates Zustand `mapRegion` → `useLeadFeed` picks up new center. Cluster markers for ≥5 leads. Individual markers use lifecycle-phase icons (SVG assets, NOT default red pins) — e.g., concrete bucket for P10, framing icon for P11. `testID="map-marker-{index}"` on each `<Marker>`.
- [ ] **Map screen (`app/(app)/map.tsx`):** Full-screen `<LeadMapPane>`. Floating `<LeadFilterSheet>` trigger button in bottom-right safe area (44px × 44px amber FAB). Marker tap → `router.push('/(app)/[lead]?id=X')`.
- [ ] **`useLocation` hook:** `expo-location.requestForegroundPermissionsAsync()` — foreground only, no background. On deny: `filterStore.homeBase` fallback. Movement threshold: 500m before query key updates (snapping distance from spec 91 §2).
- [ ] **Verify:** Run `maestro test maestro/map-view.yaml`. All assertions pass.

---

### Phase 5 — CRM Flight Board (Spec 77) (Days 12–16)

> **BDD First.** Write `maestro/flight-board.yaml` before building the Flight Board screen.

- [ ] **Write Maestro YAML contract (`maestro/flight-board.yaml`):**
  ```yaml
  appId: com.buildo.app
  ---
  - launchApp
  - tapOn: "Flight Board"           # Bottom tab
  - assertVisible: "Action Required"     # Temporal section header
  - assertVisible: "Departing Soon"
  - assertVisible: "On the Horizon"
  - swipeLeft:
      id: "flight-card-0"
  - assertVisible: "Remove"              # Swipe-to-remove action
  - tapOn: "Remove"
  - assertNotVisible:
      id: "flight-card-0"                # Optimistic removal
  - tapOn:
      id: "flight-card-1"
  - assertVisible: "Best Case"           # Investigation detail view
  - assertVisible: "Worst Case"
  ```

- [ ] **Backend — `GET /api/leads/flight-board` route:** Query: `lead_views` WHERE `user_id = $1 AND saved = true AND lead_type = 'permit'` JOIN `permits` JOIN `trade_forecasts` (LEFT) JOIN `cost_estimates` (LEFT). Auto-archive filter: compute `work_phase` for the user's `trade_slug` using `TRADE_BID_WORK_PHASES` in `lifecycle-phase.ts`; exclude any permit where its `lifecycle_phase` integer index > `work_phase` integer index. Compute `temporal_group` per spec 77 §3.2: `action_required` (stalled or urgency flag), `departing_soon` (predicted_start ≤ 14 days), `on_the_horizon` (otherwise). Response sorted by `temporal_group ASC, predicted_start ASC NULLS LAST`. Write `src/tests/flight-board.infra.test.ts` — 401 gate, empty board (user has no saves), stalled permit appears in `action_required`, auto-archive filter excludes completed-phase permits.
- [ ] **Backend — `GET /api/leads/search?q=` route:** Full-text search across `permits` table by `street_num || ' ' || street_name` and `permit_num` using PostgreSQL `ILIKE`. Returns max 20 results: `{ permit_num, revision_num, address, lifecycle_phase, status }`. Zod validates `q` is non-empty string (400 on missing/empty). Write `src/tests/search.infra.test.ts` — 400 (empty q), 200 with results, 200 with empty results.
- [ ] **`useFlightBoard` hook:** `useQuery` (not infinite — personal board fits in memory per spec 77 §5). Key `['flight-board', userId, tradeSlug]`. Parses with `FlightBoardResultSchema`. `staleTime: 30000`, `gcTime: 3600000`.
- [ ] **Elite UI — `FlightCard.tsx`:** Compact card `className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"`. Address `text-zinc-100 font-semibold text-sm`. Permit number `font-mono text-zinc-400 text-xs`. `predicted_start` prominent: `font-mono text-amber-500 text-lg font-bold` (right-anchored like a departure time). `lifecycle_phase` badge: neutral zinc pill. Status signals: `lifecycle_stalled` → red `text-red-500` "⚠ Delayed" badge; urgency (within 7 days) → amber `text-amber-500` "⚡ Urgent" badge. Newly updated cards (post-notification) → 2-second ease-out from `bg-amber-500/20` to `transparent` (Reanimated `useSharedValue` + `withTiming`). `testID="flight-card-{index}"`. `useRemoveFromBoard` swipe handler via `react-native-gesture-handler` `Swipeable` — swipe left reveals red "Remove" action.
- [ ] **`TemporalSectionHeader.tsx`:** Section titles per spec 77 §3.2 — monospace uppercase, amber left-border accent. `testID` matching Maestro assertions.
- [ ] **Flight Board screen (`app/(app)/flight-board.tsx`):** `<FlashList>` with section data (three temporal groups). `<RefreshControl>`. Floating FAB (bottom-right, amber, `+` icon) — opens `<SearchPermitsSheet>` for global job claim (spec 77 §3.1). `EmptyBoardState` when no saves.
- [ ] **`EmptyBoardState.tsx`:** Faint radar SVG graphic. `text-zinc-500` body copy. Amber "Find Jobs on the Lead Feed" `<Pressable>` → switches bottom tab to Feed.
- [ ] **Flight Board detail (`app/(app)/[flight-job].tsx`):** Header: full address + street view (`expo-image`). Timeline engine section: `predicted_start` (monospace, large), `p25_days` labeled "Best Case", `p75_days` labeled "Worst Case" — horizontal gauge visualization (Reanimated animated bar from p25 to p75, marker at median). Status section: `lifecycle_phase` + `lifecycle_stalled` delay flag. Contextual: description, `estimated_cost`, `cost_tier`, neighborhood profile. Actions: "Remove from Board" button.
- [ ] **`SearchPermitsSheet.tsx` (FAB):** `@gorhom/bottom-sheet` full-height. `React Hook Form + Zod` input (address or permit number). `useSearchPermits` hook drives results list. Tap result → `useSaveLead` mutation claims it → routes to investigation detail. Haptic: `mediumImpact` on search submit, `successNotification` on claim.
- [ ] **`useRemoveFromBoard` mutation:** Optimistic: snapshot board state, remove card immediately (`queryClient.setQueryData`), fire `heavyImpact` haptic. On error: restore snapshot, show error toast. On success: `captureEvent('job_removed_from_board')`.
- [ ] **Verify:** Run `maestro test maestro/flight-board.yaml`. All assertions pass.
- [ ] **Jest:** `__tests__/useFlightBoard.test.ts` — temporal grouping logic, auto-archive filter, optimistic remove, rollback on error.

---

### Phase 6 — Push Notifications & Hardware (Spec 92) (Days 17–19)

- [ ] **Write Maestro BDD contract (`maestro/notifications.yaml`):** Per spec 92 §5:
  ```yaml
  appId: com.buildo.app
  ---
  - launchApp
  - tapOn: "Save Lead"
  - assertVisible: "Want us to alert you"
  - tapOn: "Allow"
  - openLink: "buildo://(app)/lead?id=permit_test_123"
  - assertVisible: "Permit Details"
  ```

- [ ] **Migrations:** Run `npm run migrate` with `107_device_tokens.sql` and `108_notification_prefs.sql`. `npm run db:generate`. `npm run typecheck`.
- [ ] **`/api/notifications/register` route:** `POST { push_token, platform }`. Zod validates token format + platform enum. Upserts into `device_tokens` (`ON CONFLICT (user_id, push_token) DO UPDATE SET updated_at = NOW()`). Test: `src/tests/notifications.infra.test.ts` — 401 (no auth), 400 (bad token format), 200 (new registration), 200 (duplicate → upsert not 409).
- [ ] **`/api/notifications/preferences` route:** `GET` returns `user_profiles.notification_prefs`. `PATCH { prefs }` validates with Zod and updates. Test: 401 (no auth), 400 (invalid prefs shape), 200 roundtrip.
- [ ] **`pushTokens.ts` (mobile):** On successful auth, `expo-notifications.getExpoPushTokenAsync({ projectId })`. Compare with MMKV-stored token — skip re-registration if unchanged. `POST /api/notifications/register`. Request logic: `expo-notifications.setNotificationChannelAsync` (Android channel config). **Contextual permission prompt (spec 92 §4.1):** Do NOT request on cold boot. `SaveButton.tsx` checks `hasAskedPermission` in MMKV — if false and this is first save, shows a pre-prompt `<Modal>` ("Want us to alert you?") before the system prompt. After user taps "Allow", fire `requestPermissionsAsync()`.
- [ ] **Settings screen (`app/(app)/settings.tsx`):** Trade slug display. `radiusKm` slider (10–50km). Notification preferences section (spec 92 §2.3): cost tier slider (small/medium/large/major/mega), toggle switches for `phase_changed`, `lifecycle_stalled`, `start_date_urgent`. On change: PATCH `/api/notifications/preferences`. `useQuery` for current prefs, `useMutation` for update.
- [ ] **Deep linking config (spec 92 §3.2):** `app.json` `expo.scheme: "buildo"`. `Notifications.addNotificationResponseReceivedListener` handler: read `notification.request.content.data` → determine `route_domain`; switch bottom tab first (`router.push('/(app)'` or `'/(app)/flight-board'`); then push detail `router.push('/(app)/[lead]?id=${entity_id}')`. Fallback on dismiss: user remains on correct contextual tab.
- [ ] **Foreground handler (spec 92 §4.2):** `Notifications.addNotificationReceivedListener` → renders `<NotificationToast>` dropping from safe-area top. NativeWind: `bg-zinc-800 border border-amber-500/30 rounded-xl`. Fire `successNotification` haptic. Auto-dismisses after 4 seconds. Does NOT auto-navigate.
- [ ] **Tab bar badge (spec 92 §4.4):** `notificationStore.ts` (Zustand) tracks `unreadFlightBoard: number`. When a `LIFECYCLE_PHASE_CHANGED` or `LIFECYCLE_STALLED` notification arrives in foreground, increment. Bottom tab badge: NativeWind `bg-red-500 w-2.5 h-2.5 rounded-full` dot when `unreadFlightBoard > 0`. Clears on tab focus.
- [ ] **Backend push dispatch (`classify-lifecycle-phase.js`):** After updating `lifecycle_phase`, query `device_tokens` for users who have the permit saved (`lead_views.saved = true AND permit_num = $1`). For each token, check `notification_prefs` to confirm the trigger is enabled. Call Expo Push API (`https://exp.host/--/api/v2/push/send`) with schema from spec 92 §3.1 (no PII — routing IDs only). Wrap entire dispatch in try-catch; failure logs via `pipeline.log.error()` and MUST NOT abort the classification run. **NEW_HIGH_VALUE_LEAD** trigger fires from the feed pipeline when a new permit is ingested and its `cost_tier` meets the user's threshold.
- [ ] **Haptics architecture (spec 92 §4.3):** `mobile/src/lib/haptics.ts` — typed wrappers: `lightImpact()` (tab changes, filter open), `mediumImpact()` (pull-to-refresh activation, save lead), `heavyImpact()` (swipe-to-remove), `successNotification()` (claim/save confirmed). Import from this module everywhere — no raw `expo-haptics` calls in components.
- [ ] **Verify:** Run `maestro test maestro/notifications.yaml`. All assertions pass.

---

### Phase 7 — Offline Hardening (Day 20)

- [ ] **Persisted mutation queue:** Enable `@tanstack/react-query-persist-client` mutation cache persistence in `mmkvPersister.ts`. On app foreground, `queryClient.resumePausedMutations()` replays any queued saves/removes from offline session.
- [ ] **`OfflineBanner.tsx`:** `@react-native-community/netinfo` `useNetInfo()` hook. When `isConnected === false`: render top banner `className="bg-zinc-800 border-b border-amber-500/30 py-2 px-4"` — `"Offline mode. Last updated [time]."`. Fade in/out with Reanimated `withTiming`. Flight Board and Feed both show this — do NOT show an error screen.
- [ ] **Staleness behavior:** TanStack Query `refetchOnReconnect: true` (default) handles the auto-refresh. `OfflineBanner` disappears as soon as `isConnected` returns true and the background fetch completes.
- [ ] **Jest:** `__tests__/offline.test.ts` — MMKV persister serializes/deserializes query cache correctly; mutation queue survives simulated app restart.

---

### Phase 8 — Testing & Release Readiness (Days 21–22)

- [ ] **Jest coverage gate:** `jest --coverage`. Enforce in `jest.config.js`: `coverageThreshold: { global: { lines: 80, functions: 80 } }` for `src/hooks/` and `src/lib/`. Fix any gaps.
- [ ] **Maestro suite complete:** All four flows pass: `scroll-feed.yaml`, `map-view.yaml`, `flight-board.yaml`, `notifications.yaml`.
- [ ] **EAS Preview Build:** `eas build --profile preview --platform all`. Confirm iOS `.ipa` and Android `.apk` build clean. Verify Sentry source maps appear in Sentry dashboard (crash report shows human-readable stack trace, not minified).
- [ ] **EAS Update wired:** `eas.json` production profile sets `channel: "production"`. Add to CI (`mobile-ci.yml`): on merge to `main`, run `eas update --branch production --message "OTA: ${{ github.event.head_commit.message }}"`. This is the fast-fix lane that bypasses App Store review for JS-only patches (addresses spec 90 §13).
- [ ] **Bundle size check:** `npx expo-bundle-analyzer`. Main JS bundle must be < 2MB (per `mobile-rules.md` §8 release checklist). Flag any unexpectedly large dependencies.
- [ ] **Backend Green Light:** `npm run test && npm run lint -- --fix` in the Next.js repo — all tests pass with the new middleware Bearer path, flight-board route, search route, and notification routes.
- [ ] **Pre-Review Self-Checklist:** Before WF6, generate a 10-item checklist covering spec 90 Behavioral Contract (Dumb Glass violations?), spec 91 §4 (all card fields rendered?), spec 77 §3 (all temporal groups present, auto-archive works?), spec 92 §2 (all 4 triggers implemented?). Walk each item against the diff. Output PASS/FAIL per item.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` (Next.js repo) + `jest --coverage` + all Maestro flows pass → WF6.
