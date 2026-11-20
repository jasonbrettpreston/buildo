# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile state architecture (Spec 99, whole)
Source: docs/specs/03-mobile/99_mobile_state_architecture.md:1-784
Generator: hand-written
Rules in the whole list: 10 (counted by pattern /^## \d+\./) · this is part 1 of 3

<<< Spec 99 whole (docs/specs/03-mobile/99_mobile_state_architecture.md:1-784) >>>
# Spec 99 — Mobile State Architecture & Ownership Protocol

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 2** of `.cursor/active_task.md`.

> Dated note 2026-11-09 (McFrontend Phase 2, MF-41; M-246, prior text kept; operator, verbatim: "1. confirmed" (Part B incl. D-5), record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: Part B confirmed, Spec 126 standard section, MF-20 D-7"): the MaxBLD app (a separate Expo project, Spec 116 §3 dated note 2026-11-09; MF-49) owns its own state and routing: its own root layout and a `parcel_tool` gate, not `decideAuthGateRoute`. The §5 routing arms govern the Buildo app.

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol §7), Spec 93 (Auth & AuthGate routing), Spec 94 (Onboarding), Spec 95 (User Profiles — server is canonical), Spec 96 (Subscription gate)
**As-is audit:** `docs/reports/mobile_state_audit_2026-05-02.md`

> ⚠️ **AMENDMENT 2026-09-15 (WF1 "Spec 126/127/128 surface standard") — max-server-side impact. Additive: no rule below is rewritten, and §3 stays normative.**
>
> Spec 126 makes Spec 90 §3's "Dumb Glass" prime directive *enforceable* rather than merely stated: under max-server-side the client renders a **fetched projection** — the server owns section order, labels, formatting decisions and which lines render — and the archetype component set draws it. That moves the Layer-2 / Layer-3 boundary in §2, and it does so in a direction this spec already anticipates.
>
> **Sections affected, and how:**
>
> | §  | Effect |
> |---|---|
> | **§2** (the five layers) | Layer 1 **grows** — canonical for the *projection*, not only the data. Layer 2's role is unchanged, but the cached object becomes a projected screen rather than a raw payload. Layer 3 **shrinks to device + ephemeral state only**. Layers 4a/4b and 5 are untouched, and §2.1's hard rules all still hold. |
> | **§3** (the field ownership matrix) | Stays **normative**, and becomes **descriptor data**: the `Field / Server Type / Local Mirror / Owner Layer / Canonical Writer / Authorized Readers / Bridge` row is the SURFACE descriptor's `state` category verbatim (Spec 126 §4.1). Rows for fields that are Layer-3 *mirrors* of Layer-1 data retire as those mirrors collapse. Measured: **4 of the 7 stores are MMKV-persisted mirrors of server fields** — `filterStore` (139L) mirrors 6 `user_profiles` columns, `userProfileStore` (156L) mirrors 5 notification-preference columns. |
> | **§4** (the six bridge patterns) | **B2** (TanStack→Zustand) and **B3** (Zustand→Server) retire *for the mirrored fields only*. B1 is unchanged and its query-key hygiene rule becomes a schema constraint: `inputs.query_key` is single-param on the DETAIL archetype. The six patterns are not reduced to four — they are unused for fields that no longer have a Layer-3 home. |
> | **§7.7** (funnel ratio invariants) | Unchanged in substance; the per-method attempted/succeeded/failed contract becomes `emits.counters` with the ratio stated as a declared invariant, so the drift it warns about is checked rather than greppped. |
> | **§8.6** (the schema-vs-matrix drift check) | **The gap is confirmed, not closed, by this amendment.** `mobile/scripts/check-spec99-matrix.mjs` exists and **nothing runs it** — re-verified 2026-09-15: no match in `.husky/`, `.github/`, `mobile/package.json` or `package.json`; `mobile/__tests__/spec99.mandates.lint.test.ts:335-346` only asserts the file *exists*. Wiring it into `mobile-ci.yml` is Spec 126 §12 phase **P0b**. |
>
> **What deliberately stays client-side** — these five are the boundary, and each is declared per surface rather than assumed: device state (GPS, push token, permission status) · optimistic UI (Spec 90 §3 encourages it by name) · the 24 h MMKV offline cache · animation/gesture (Layer 5, §2.1's hard rule) · navigation position (`expo-router` owns it). Anything else computed on the client is a Spec 128 rule-2 violation needing a dated `deviations[]` row.
>
> **The three auth screens are out of scope entirely** (1,302 lines): they talk to the Supabase Auth SDK, not to our contracts.

## 1. Goal & Anti-Patterns This Prevents

**Goal:** A single normative document that, for every piece of mobile state, answers four questions:
1. **Who owns it?** (single layer)
2. **Who can write it?** (single function)
3. **Who can read it?** (typed contract)
4. **What bridges are allowed?** (enumerated patterns)

**This spec is the gate-keeper.** Adding a new Zustand store, a new MMKV blob, a new hydration bridge, or a new routing `useEffect` requires either matching an existing pattern in §3-§5 or amending this spec.

### 1.1 Three documented incidents this protocol prevents

| Incident | Date | Pattern | Spec rule that would have prevented it |
|----------|------|---------|----------------------------------------|
| `currentStep` selector subscription loop | 2026-05-02 (commit `3727ceb` → fixed `6c5d085`) | Routing `useEffect` subscribed to a Zustand field it ALSO mutated via `router.replace`-induced cascade | §6.4 (lazy `getState()` for state read in router effects) |
| Dual-router (AuthGate ↔ OnboardingLayout) loop | 2026-05-02 (fixed same day, WF3) | Two layout-level `router.replace` effects reading DIFFERENT sources of truth (server profile vs local store) for the same routing decision | §5.1 (one router per gate boundary) + §5.2 (read canonical source) |
| `isFetching` / Tabs flicker loop | 2026-05-02 (current — fix scheduled as §9.4a P0 BLOCKING) | Render gate condition included an unstable signal (`isFetching` toggles on every refetch); flips AppLayout between `<SubscriptionLoadingGuard/>` and `<Tabs>` ~80×/sec, mounting/unmounting LeadFeedScreen continuously | §6.5 (gate conditions must be stable; never gate on `isFetching`) |

### 1.2 The six user-stated quality goals (verbatim)

1. **Observability (maximum)** — every state mutation, every gate decision, every cache invalidation must leave a trace. Codified in §7.
2. **Clear ownership** — for every field, exactly ONE store owns the canonical value. Codified in §3.
3. **Where bridges are allowed** — only the patterns in §4. Anything else is a spec amendment.
4. **Canonical write path** — for every field, exactly one function writes it. Codified in §3 column "Canonical Writer".
5. **Clear structure / clear logic / similar approach / one approach** — codified in §2 (layer hierarchy), §6 (selector hygiene), §8 (test mandates).

---

## 2. Layer Hierarchy

State flows top-down. A lower layer NEVER initiates a write to an upper layer except via the bridges in §4.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — SERVER (Postgres user_profiles, Firebase Auth)   │  ← canonical for ALL account-scoped data
└─────────────────────────────────────────────────────────────┘
                         ↓ (Bridge B1: useQuery)
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 — TanStack Query cache (in-memory + MMKV persist)  │  ← canonical for CACHED server state
└─────────────────────────────────────────────────────────────┘
                         ↓ (Bridge B2: hydrate effect)
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — Zustand stores (typed, scoped, never reactive    │  ← canonical for LOCAL UX state
│           to themselves)                                     │
└─────────────────────────────────────────────────────────────┘
                         ↓ (Zustand `persist` middleware)
┌─────────────────────────────────────────────────────────────┐
│  Layer 4a — MMKV (UNENCRYPTED, plaintext on disk)           │  ← persistence for non-sensitive UX state
│           Persists Zustand stores + TanStack Query cache.   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Layer 4b — Expo SecureStore / iOS Keychain / Android       │  ← persistence for sensitive credentials
│            Keystore (ENCRYPTED, hardware-backed where avail)│
│            Currently used only by RNFirebase native module  │
│            for the Firebase auth session — no app code      │
│            touches it directly today.                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — Reanimated SharedValues (UI-only, never gated    │  ← orthogonal to layers 1-4
│           on for routing or business logic)                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Hard rules

- **Layer 4a (MMKV) is NEVER read directly outside Zustand `persist` middleware or TanStack `Persister`.** Direct `createMMKV().getString()` in component / hook code is BANNED. (Closes the `user-profile-cache` duplicate-blob anti-pattern.) The Zustand `persist` middleware's own rehydration read (via the configured `storage.getString`) is the sole exempt pathway — it is the canonical mechanism by which persisted Zustand state hydrates on cold boot. The TanStack `Persister`'s rehydration read is similarly exempt for the same reason.
- **Layer 4a (MMKV) is UNENCRYPTED.** Anything sensitive — Firebase ID tokens, refresh tokens, API keys, payment credentials, government IDs, photo content — MUST go into Layer 4b (SecureStore/Keychain), NEVER into MMKV. The current allowlist of sensitive-but-OK-in-MMKV items is empty. Adding a new persisted field with credential-like content requires a Spec 99 amendment naming it explicitly.
- **Layer 4b (SecureStore) is the ONLY place sensitive credentials may live on disk.** RNFirebase handles its own session storage natively (Keychain on iOS, EncryptedSharedPreferences on Android) — app code does NOT manage Firebase tokens directly. Adding any new app-managed credential (e.g., a third-party API key) requires using `expo-secure-store` + a Spec 99 amendment.
- **The `['user-profile']` TanStack query is excluded from MMKV persistence** via `dehydrateOptions.shouldDehydrateQuery` on the `PersistQueryClientProvider` (`mobile/app/_layout.tsx`). The query payload carries 5 PII identity fields (`full_name`, `phone_number`, `company_name`, `email`, `backup_email`); persisting it to Layer 4a would violate this section. The query stays in-memory normally; cold-boot mobile re-fetches from server (the canonical source) — adds ~50–200 ms to the first profile-dependent render but eliminates the on-disk PII surface. Other queries (`['lead-feed']`, `['flight-board']`, `['notification-prefs']`) carry only public permit data or non-PII toggles and continue to persist normally. The full encryption-at-rest path (passing `encryptionKey` to `createMMKV` in `mmkvPersister.ts`) is a future hardening that would let other PII-adjacent queries persist safely; the dehydrate filter is the immediate fix.
- **Layer 3 (Zustand) NEVER mirrors a Layer 1 (server) field unless the Field Ownership Matrix §3 explicitly authorizes the mirror, with a declared bridge (§4) as the canonical writer.**
- **Layer 5 (Reanimated SharedValues) NEVER drives routing, gating, or business logic.** SharedValues exist on the UI thread; reading them on the JS thread is racy.

---

## 3. Field Ownership Matrix

This table is **normative**. Adding a field to the mobile app requires adding a row here. Modifying ownership requires a spec amendment.

### 3.1 Server-Authoritative Profile Fields (Spec 95 §6)

| Field | Server Type | Local Mirror | Owner Layer | Canonical Writer | Authorized Readers | Bridge |
|-------|-------------|--------------|-------------|------------------|---------------------|--------|
| `user_id` | text PK | — (no mirror; equal to `authStore.user.uid`) | Server | Server insert on first PATCH | apiClient (Bearer routing), AuthGate | — |
| `trade_slug` | text (immutable post-set) | `filterStore.tradeSlug` | Server | Server PATCH `/api/user-profile` from `profession.tsx` | filterStore consumers (LeadFeedScreen, LeadFilterSheet, settings) | B2 |
| `default_tab` | enum | `filterStore.defaultTab` | Server | Server PATCH from settings | AppLayout default-route, settings | B2 |
| `location_mode` | enum | `filterStore.locationMode` | Server | Server PATCH from `address.tsx` or settings | useLocation, LeadFeedScreen | B2 |
| `home_base_lat` / `home_base_lng` | numeric | `filterStore.homeBaseLocation{lat,lng}` | Server | Server PATCH from `address.tsx` or settings | useLocation (fallback when GPS denied) | B2 |
| `radius_km` | int | `filterStore.radiusKm` | Server | `usePatchProfile()` mutation hook (Spec 99 §9.16, B3 with rollback) — called from LeadFilterSheet preset buttons, settings slider, `(app)/index.tsx` widen-radius shortcuts | useLeadFeed params, LeadFilterSheet UI | B2 read + B3 write |
| `supplier_selection` | text | `filterStore.supplierSelection` | Server | Server PATCH from `supplier.tsx` or settings | settings, future supplier-tagged feed | B2 |
| `full_name` / `company_name` / `phone_number` / `backup_email` | text | `userProfileStore.{fullName,companyName,phoneNumber,backupEmail}` | Server | Server PATCH from settings | settings forms, NotificationToast (display only) | B2 |
| `new_lead_min_cost_tier` | enum (`low`/`medium`/`high`) | `userProfileStore.newLeadMinCostTier` | Server | Server PATCH from settings notifications | settings cost-tier slider, push-notification dispatch (lifecycle classifier) | B2 |
| `phase_changed` | bool | `userProfileStore.phaseChanged` | Server | Server PATCH from settings notifications | settings toggle, push-notification dispatch | B2 |
| `lifecycle_stalled_pref` | bool | `userProfileStore.lifecycleStalled` | Server | Server PATCH from settings notifications | settings toggle, push-notification dispatch (suffix `_pref` on server side avoids collision with `permits.lifecycle_stalled`) | B2 |
| `start_date_urgent` | bool | `userProfileStore.startDateUrgent` | Server | Server PATCH from settings notifications | settings toggle, push-notification dispatch | B2 |
| `notification_schedule` | enum (`morning`/`anytime`/`evening`) | `userProfileStore.notificationSchedule` | Server | Server PATCH from settings notifications | settings segmented control, push-notification dispatch | B2 |
| `onboarding_complete` | bool | **NONE** (was `onboardingStore.isComplete` until 2026-05-02; see §3.5 deprecation) | Server | Server PATCH in `complete.tsx` | AuthGate (Branch 5), `IncompleteBanner` (read server profile directly per §9.2) | B2 |
| `tos_accepted_at` | timestamptz | — | Server | Server PATCH from `terms.tsx` | AuthGate fallback, audit | — |
| `account_preset` | enum | — | Server (admin-set) | Admin tool | AuthGate manufacturer branch (Branch 4.5) | — |
| `account_deleted_at` | timestamptz | — | Server | DELETE intent endpoint | apiClient → AccountDeletedError → AuthGate reactivation modal | — |
| `subscription_status` | enum | — | Server (Stripe webhook + admin) | Stripe webhook handler | AppLayout subscription gate, PaywallScreen | — |
| `lead_views_count` | int | — | Server (incremented on lead view API) | Lead view endpoint | PaywallScreen copy | — |
| `trial_started_at` | timestamptz | — | Server | server / admin | settings, internal logic | — |
<!-- WF3 2026-05-04 hardening (review_followups.md mobile-PII bundle + Phase 7 amendment): `stripe_customer_id`, `trade_slugs_override`, and `radius_cap_km` removed from this matrix and from `mobile/src/lib/userProfile.schema.ts`. All three are server-only / admin-internal — `stripe_customer_id` is PII (Spec 99 §2.1 violation if persisted to MMKV), the other two are admin-managed fields with no mobile consumer (verified by grep). The corresponding API route's `CLIENT_SAFE_COLUMNS` whitelist (Phase 2, commit 08ff823) excludes all three from GET / PATCH responses to mobile clients. The Phase 7 amendment caught a CRITICAL bug where the mobile schema still declared `trade_slugs_override` and `radius_cap_km` as required-but-nullable — Zod v4's `.nullable()` permits `null` but NOT a missing key, so every API response would have failed schema parse and broken every profile-dependent screen. -->

| `display_name` | text | — | Server | Server insert on first PATCH (typically derived from auth provider) | settings (display only) | — |
| `email` | text | — | Server (Firebase auth claim) | Server insert on first PATCH | settings (display only), notification dispatch | — |
| `created_at` / `updated_at` | timestamptz | — | Server (Postgres trigger) | Postgres `NOW()` on insert/update | observability only — never read by client routing | — |

### 3.2 Auth / Identity (Firebase + apiClient)

| Field | Owner Layer | Canonical Writer | Authorized Readers | Persistence |
|-------|-------------|------------------|---------------------|-------------|
| `user.uid` | `authStore` (Layer 3) | `authStore.setAuth()` — invoked ONLY from `initFirebaseAuthListener` | AuthGate (gate Branch 1), apiClient (Bearer Authorization), useUserProfile (`enabled` gate), settings/account screens (display) | MMKV `auth-store` (uid only — Spec 93 §3.4 partialize strips PII) |
| `user.email` | `authStore` | `authStore.setAuth()` | reactivation modal copy, settings | NOT persisted |
| `user.displayName` | `authStore` | `authStore.setAuth()` | settings | NOT persisted |
| `idToken` | `authStore` | `authStore.setAuth()` (init + 401 retry) | apiClient `Authorization: Bearer` only | NOT persisted (short-lived) |
| `isLoading` | `authStore` | `authStore.setAuth()` / `clearAuth()` / `setLoading()` (init defaults to `true`; cleared to `false` on first auth resolve) | AuthGate (initial-load gate before hydrate completes) | NOT persisted (process-local) |
| `_hasHydrated` | `authStore` | `onRehydrateStorage` callback (sole production writer); `setHasHydrated(true)` permitted ONLY in tests to bypass MMKV | AuthGate (Branch 0 — wait-for-hydrate gate) | NOT persisted (process-local) |

### 3.3 Onboarding-Local State (no server mirror)

After §9.3 deduplication, `onboardingStore` holds ONLY these two genuinely-local fields. `selectedTradeName` (display-only mirror) was removed — display sites derive the trade label from the canonical `filterStore.tradeSlug` via `getTradeLabel(slug)` in `mobile/src/lib/onboarding/tradeData.ts`.

| Field | Owner Layer | Canonical Writer | Authorized Readers |
|-------|-------------|------------------|---------------------|
| `currentStep` | `onboardingStore` | each onboarding screen calls `setStep('next')` AFTER its PATCH succeeds (Spec 94 §10 Step 11) | AuthGate `getResumePath()` — **MUST be read via `useOnboardingStore.getState().currentStep` inside the effect closure (NEVER subscribed via `useStore((s) => s.currentStep)` per §6.4)** |
| `selectedPath` | `onboardingStore` | `setPath()` in `path.tsx` | `address.tsx`, `supplier.tsx` (skip-suppliers branch), `terms.tsx` (Path L vs Path T branch), `complete.tsx` (display) |

### 3.4 Engagement (Zustand, in-memory)

| Field | Owner Layer | Writer | Readers |
|-------|-------------|--------|---------|
| `unreadFlightBoard` | `notificationStore` (in-memory) | `incrementUnread()` in `NotificationHandlers` foreground push handler; `clearUnread()` on Flight Board tab focus | AppLayout tab badge |
| `paywall.visible` | `paywallStore` (in-memory — Spec 96 §9 explicit) | `show()` — called by `InlineBlurBanner.tsx:12` on banner tap (verified 2026-05-03 §9.9 audit). The original §3.4 audit incorrectly flagged this as caller-less; the grep missed `usePaywallStore((s) => s.show)` selector usage. | AppLayout subscription gate, PaywallScreen |
| `paywall.dismissed` | `paywallStore` (in-memory) | `dismiss()` (PaywallScreen "Maybe later" tap), `reset()` (signOut per §B5; `expired→active` transition in AppLayout — renamed from `clear()` 2026-05-03 for §B5 naming uniformity) | AppLayout subscription gate, InlineBlurBanner |

### 3.4c Engagement (Zustand, MMKV-persisted)
<!-- Subsection number is `3.4c`, not `3.4b`, because §3.4a (UI-Only SharedValues, below) was already taken by an existing subsection. Document order in this section: §3.4 → §3.4a (existing) → §3.4c (this section). -->

These stores survive app close and are reset on sign-out via §B5. Spec 77 §3.2 prescribes the persistence — same-user re-sign-in re-seeds via the gate (no server source of truth to re-hydrate from, so first-sight semantics protect post-reset UX).

| Field | Owner Layer | Writer | Readers | Persistence | Sign-out reset |
|-------|-------------|--------|---------|-------------|----------------|
| `seenMap` (`Record<permitId, ISO8601>`) | `flightBoardSeenStore` (Zustand + persist→MMKV `flight-board-last-seen` blob) | `markSeen(permitId, updatedAt)` from `[flight-job].tsx` on detail-open | `flight-board.tsx` `renderItem` to compute `hasUpdate = updated_at !== seenMap[permitId]` per Spec 77 §3.2 | Layer 4a (MMKV plaintext — non-PII; just permit IDs + ISO timestamps) | Required (§B5) — `clearLocalSessionState` calls `useFlightBoardSeenStore.getState().reset()` |
| `recent` (`string[]`, newest first, at most `SEARCH_RECENT_MAX` = 3) | `recentSearchesStore` (Zustand + persist→MMKV `parcel-recent-searches` blob) | `add(query)` from `parcel-tool/index.tsx`, only when a search opens a page (the lot report, SELECT on the address list, the map page) | `parcel-tool/index.tsx` recent-search chips | Layer 4a (MMKV plaintext — a searched street address; not in the Layer 4b list above) | Required (§B5) — `clearLocalSessionState` calls `useRecentSearchesStore.getState().reset()` |

> Dated note 2026-11-10 (M-246, prior text kept; MF-35 · McFrontend queue · lane MF-35 build; operator, verbatim: "D15 b, D16 a, D17 a D18 a, D-2 a , D-9 a, D-1 a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-10: MF-35 v3 and MF-51 decisions"; plan `~/Buildo-scratch/mcfrontend/MF-35/plan.v3.md`): the `recentSearchesStore` row above is added by MF-35 (P35-D16 a: the MaxBLD search page's recent searches on the phone, max 3, newest first, duplicates ignoring case removed, saved only when a search opens a page, cleared at sign-out). A searched street address is none of the Layer 4b items (tokens, keys, payment credentials, government IDs, photo content; :97), so Layer 4a applies. `storeReset.coverage.test.ts` finds the new store with no count change (its guard is `>= 6`).

### 3.4a UI-Only SharedValues (Layer 5 — orthogonal to Layers 1-4)

These are NOT Zustand stores. They use `react-native-reanimated`'s `makeMutable()` and live exclusively on the UI thread. They are **never** read by router effects, hydrated from server, persisted to MMKV, or reset in §B5 sign-out — they are process-local UI state for animations.

| Field | File | Writer | Readers | Sign-out reset |
|-------|------|--------|---------|----------------|
| `tabBarScrollY` | `tabBarStore.ts` | `onScroll` worklets in `(app)/index.tsx`, `flight-board.tsx`, `map.tsx` | `AnimatedTabBar` `useDerivedValue` | NOT required (process-local, not user-scoped) |
| `tabBarVisible` | `tabBarStore.ts` | derived from `tabBarScrollY` direction | `AnimatedTabBar` `translateY` | NOT required |

### 3.5 Deprecated mirrors (migration targets per §9)

| Mirror | Replacement | Migration WF |
|--------|-------------|--------------|
| `onboardingStore.isComplete` | Read `useUserProfile().data.onboarding_complete` directly | WF2 §9.2a-c |
| `onboardingStore.locationMode` / `homeBaseLat` / `homeBaseLng` / `supplierSelection` (the duplicates) | Use `filterStore` exclusively (already populated by B2 hydration) | WF2 §9.3 |
| `onboardingStore.selectedTrade` (duplicate of `filterStore.tradeSlug`) | Use `filterStore.tradeSlug` | WF2 §9.3 |
| `onboardingStore.selectedTradeName` (display-only mirror of server `display_name` lookup) | Read from server profile or extract from trade catalog at display site | WF2 §9.3 |
| `useUserProfile.readCachedProfile` MMKV blob (`user-profile-cache`) | Eliminated — TanStack persister covers fast-hydration | WF3 §9.1 (✅ done — see `mobile/src/lib/migrations/userProfileCacheCleanup.ts` for the one-time orphan-file cleanup) |
| `userProfileStore.hydrate` non-idempotent set | Migrate to deep-equal-before-set per §6.6 | WF2 §9.8 |
| `filterStore.hydrate` non-idempotent set | Same | WF2 §9.8 |
| ~~`paywallStore.show()` action with no caller~~ | RESOLVED — §9.9 audit (2026-05-03) confirmed `InlineBlurBanner.tsx:12` calls it. The original audit grep missed the selector form. | WF3 §9.9 ✅ |

---

## 4. The Six Bridge Patterns

These are the **only** allowed cross-layer flows. A seventh pattern requires a spec amendment.

### B1 — Server → TanStack Query

**Pattern:**
```ts
const query = useQuery({
  queryKey: ['user-profile'],
  queryFn: fetchProfile,
  staleTime: 300_000,
  enabled: !!user,
});
```

**Rules:**
- Every server fetch MUST go through TanStack Query — never raw `fetch()` in components.
- `queryKey` MUST be a stable, parameterized array. Object literals with closure refs are BANNED (cache fragmentation).
- `enabled` gates: use `!!user` for user-scoped queries; never `enabled: someChangingValue` that toggles continuously.
- **`refetchOnReconnect` defaults to `true` and MUST stay enabled** for `['user-profile']` so a returning-from-offline user gets a fresh profile (Stripe webhook may have flipped `subscription_status` during the offline window). The 2026-05-02 incident #3 root cause is **not** `refetchOnReconnect` — it's that AppLayout's render gate gates on `isFetching` (per §6.5 BANNED). Surgical fix: strip `isFetching` from the gate condition (§9.4); `refetchOnReconnect` stays on.
- Validation: every response MUST be parsed through a Zod schema before TanStack stores it (Spec 90 §13 Zod Boundary).

**Query-key registry (the stable, parameterized keys in use).** Adding a new server query requires a row here:

| Query key | Owner hook | Notes |
|-----------|-----------|-------|
| `['user-profile']` | `useUserProfile` | PII — excluded from MMKV persistence (§2.1) |
| `['lead-feed', params]` | `useLeadFeed` | public permit data; persists normally |
| `['flight-board']` | `useFlightBoard` | saved-board rows |
| `['lead-detail', id]` | `useLeadDetail` | single lead |
| `['parcel-search', q]` | `useParcelSearch` (Spec 100) | debounced typeahead; public cadastral data; persists normally |
| `['parcel-lookup', parcelId]` | `useParcelLookup` (Spec 100) | the parcel detail; depends ONLY on `parcelId` (query-key hygiene — never on the search string) |

### B2 — TanStack → Zustand (server-to-local hydration)

**Pattern:**
```ts
useEffect(() => {
  if (query.data) {
    hydrateFilter(query.data);
    hydrateUserProfile(query.data);
  }
}, [query.data, hydrateFilter, hydrateUserProfile]);
```

**Rules:**
- The hydrate effect MUST live in exactly ONE hook (`useUserProfile` for the profile bridge). Multiple components calling that hook share the same TanStack cache, but each runs the effect once on mount — that's fine; the hydrate functions are idempotent.
- Hydrate functions MUST be **idempotent** — calling twice with identical data MUST result in zero observable state change. Specifically: object-valued fields MUST use deep-equal-before-set per §6.6.
- Hydrate MUST NOT call `router.replace` or trigger any navigation. Routing happens in §5 routers, not in hydrate effects.
- The `markComplete()` bridge call (currently in `useUserProfile.ts:101-103`) is DEPRECATED — see §9.2.

### B3 — Zustand → Server (mutation with optimistic update)

**Pattern:**
```ts
const mutation = useMutation({
  mutationFn: (patch) => fetchWithAuth('/api/user-profile', { method: 'PATCH', body: JSON.stringify(patch) }),
  onMutate: async (patch) => {
    // Optimistic update: write to filterStore immediately
    useFilterStore.getState().setRadiusKm(patch.radius_km);
    return { previous: prevValue };
  },
  onError: (_err, _patch, ctx) => {
    // Rollback
    useFilterStore.getState().setRadiusKm(ctx.previous);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
});
```

**Rules:**
- Optimistic local writes MUST go through the field's canonical writer per §3.
- Rollback MUST be paired with every optimistic write.
- `onSettled` MUST invalidate the relevant query so the next render reads server truth.

> **Rollback race acknowledgement 2026-05-05 (originally amended to mandate re-read; revised same day to match `usePatchProfile.ts` §9.16 implementation):** the naive rollback pattern above CAN overwrite legitimate concurrent writes when the same field is mutated more than once in flight. Concrete scenario: user adjusts the radius slider (mutation A starts; `onMutate` captures `previous = 10`, applies optimistic = 20). Before A's network call resolves, user adjusts again (mutation B starts; B's `onMutate` reads `useFilterStore.getState().radiusKm` = 20 — A's optimistic value — applies optimistic = 30). Mutation A errors. A's `onError` restores 10. The user's screen flips 30 → 10; B's eventual `onSettled` invalidate refetches and restores 30 from the server (B's PATCH succeeded), so the FINAL state is correct — but the user sees a one-frame flicker during the rollback.
>
> **Canonical pattern: naive rollback** (what `usePatchProfile.ts:onError` currently does — restore `previous` unconditionally on error). Acceptable for low-contention fields where the user is unlikely to fire a second mutation before the first resolves.
>
> **Recommended for high-contention fields: re-read-before-rollback.** When a field is prone to rapid concurrent user input (slider drags, type-ahead, multi-step forms), augment `onError` to read the current Zustand value first; only restore `previous` if it equals the optimistic value the mutation set:
> ```ts
> onError: (_err, patch, ctx) => {
>   const current = useFilterStore.getState().radiusKm;
>   if (current === patch.radius_km) {
>     useFilterStore.getState().setRadiusKm(ctx.previous);
>   }
>   // else: a newer write landed — do not clobber (last-write-wins).
> },
> ```
>
> **Alternative for stricter correctness: per-field version counter.** Each `onMutate` increments a counter; `onError` only restores if the counter at error-time matches. Handles the edge case where a concurrent write happens to set the same value as the optimistic (which the equality check above misses). More elaborate; only justified if the equality-miss case is observed in production.
>
> **For deep-equal fields** (e.g., `homeBaseLocation`), the equality check uses `fast-deep-equal/es6` per §6.6.
>
> **Per-field decision matrix:** review each existing `useMutation` site for contention. `usePatchProfile.ts` currently mutates `radius_km` only; user-facing surfaces are slider + preset buttons + settings page. Slider drag is a high-contention shape (multiple mutations in flight while the user holds + drags). Decision recorded here: **re-read-before-rollback IS recommended for `radius_km` if the slider's mutation cadence is observed to fire concurrent mutations in production.** Until that observation, the naive pattern is the canonical default — promoting re-read prematurely creates spec-vs-code drift the M1+M2+M3 batch was designed to close.

