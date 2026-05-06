# Spec 99 — Mobile State Architecture & Ownership Protocol

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol §7), Spec 93 (Auth & AuthGate routing), Spec 94 (Onboarding), Spec 95 (User Profiles — server is canonical), Spec 96 (Subscription gate)
**As-is audit:** `docs/reports/mobile_state_audit_2026-05-02.md`

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

### B4 — Auth Listener → Cache Invalidation

**Pattern:** (current implementation in `mobile/src/store/authStore.ts`)
```ts
auth().onAuthStateChanged((firebaseUser) => {
  if (firebaseUser) {
    const expectedUid = firebaseUser.uid;
    const isUidChange = lastKnownUid !== expectedUid;
    if (isUidChange) {
      lastKnownUid = expectedUid;
    }
    void firebaseUser.getIdToken().then((idToken) => {
      if (lastKnownUid !== expectedUid) return; // stale
      useAuthStore.getState().setAuth({...}, idToken);
      // Invalidate AFTER setAuth so the refetch uses the NEW bearer token.
      // Pre-§9.1-amend, invalidate fired synchronously and raced setAuth
      // (Gemini WF3-§9.1 review F7).
      if (isUidChange) {
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      }
    });
  }
});
```

**Rules:**
- Triggers: cold-boot first-fire (`lastKnownUid === null`) AND genuine UID change.
- `lastKnownUid` is NOT reset on sign-out (Spec 93 §3.4 fast-path preservation).
- Stale-resolution guard: `getIdToken().then()` MUST verify `lastKnownUid === expectedUid` before calling `setAuth` (race-prevention per WF3 review).
- Telemetry: emit `Sentry.addBreadcrumb({category:'auth', message:'uid_change_cache_invalidated'})` only on genuine UID change (not first-fire) per §7.
- **HMR caveat (DEV only):** `lastKnownUid` is module-scoped `let`, so Metro Fast Refresh resets it on hot reload of `authStore.ts` while in-flight `getIdToken().then()` closures from the OLD module retain the stale binding. The stale-resolution guard above mitigates the late-write race. The cache-invalidation re-fire is acceptable (extra refetch, not data loss). DO NOT move `lastKnownUid` into Zustand state to "fix" HMR — that would defeat the cold-boot first-fire detection (Zustand persist would rehydrate it from MMKV).

### B5 — Sign-out Reset (the global fan-out)

**Pattern:** (current implementation in `mobile/src/store/authStore.ts:signOut` after the §9.19 unification)
```ts
// Module-scope helper — shared between explicit signOut() and the
// onAuthStateChanged(null) listener branch (forced sign-outs). Both
// paths invoke this AFTER auth().signOut() resolves (or fails — see
// the try/finally in signOut below).
function clearLocalSessionState(): void {
  usePaywallStore.getState().reset();      // Spec 96 §9 — fast shared-device handoff
  queryClient.clear();                     // §9.10 — purge ALL TanStack queries
  mmkvPersister.removeClient();            // §9.18 — purge persister disk blob
  useFilterStore.getState().reset();
  useNotificationStore.getState().reset();
  useOnboardingStore.getState().reset();
  useUserProfileStore.getState().reset();
  useAuthStore.setState({ user: null, idToken: null, isLoading: false });
  resetIdentity();
}

signOut: async () => {
  track('signout_initiated');
  // §9.19 (also DeepSeek WF2 P2 review #11): try/finally guarantees the
  // PIPEDA-critical local cleanup runs even if Firebase signOut throws
  // (network blip, expired refresh token, Firebase unreachable). Pre-fix
  // a thrown signOut() left the user logged in locally with stale
  // Zustand + TanStack caches.
  try {
    await auth().signOut();
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: 'authStore.signOut: firebase signOut failed; running cleanup anyway' },
    });
  } finally {
    clearLocalSessionState();
  }
}
```

**Rules:**
- Order WAS normative (paywall reset BEFORE firebase signOut) but the §9.19 unification moved the entire fan-out into `clearLocalSessionState()` which runs in `finally` (i.e., AFTER `auth().signOut()` resolves or throws). This is intentional: the try/finally guarantees cleanup on Firebase failure (the PIPEDA-critical case), and the paywall reset still runs before any subsequent code observes the cleared session because both branches reach `finally` synchronously. The "BEFORE firebase signOut" rule for paywall reset (Spec 96 §9 anti-flicker) is preserved by Spec 96 §9's separate guard, not by the order in `signOut()`.
- All in-memory Zustand stores MUST be enumerated in `clearLocalSessionState()`. Adding a new store with user-scoped state requires adding a `.reset()` call there. **Enforcement:** §8.5 store-enumeration test grep-asserts that every `create<*Store>(` in `mobile/src/store/*.ts` has a corresponding `.getState().reset()` call in `clearLocalSessionState()` (or in `signOut()` directly for stores explicitly excluded from the helper — currently none).
- **`queryClient.clear()` MUST fire** as part of `clearLocalSessionState()`. Reason: `enabled: !!user` only stops *new* fetches — in-flight fetches resolve and write to the cache, attributing the previous user's data to the next sign-in. Additionally, the MMKV-persisted TanStack cache (`mmkvPersister`, 24h `maxAge`) survives the sign-out and rehydrates on next mount, leaking previous-user `['user-profile']` to a different user signing in on a shared device — a privacy violation under PIPEDA (the same reason `userProfileStore.partialize` strips PII). The B4 invalidate-on-uid-change is defense-in-depth; this `clear()` call is the primary fix. **§9.10 ✅ DONE** — implementation chose `queryClient.clear()` (broader purge) over the originally-specified scoped `removeQueries({queryKey: ['user-profile']})`; broader purge is defense-in-depth (cancels in-flight refetches across all queries, not just `['user-profile']`) and is stricter than the §B5 PIPEDA letter requires. Spec amended 2026-05-05 to match implementation. The MMKV blob is purged separately via `mmkvPersister.removeClient()` (added §9.18, consolidated into `clearLocalSessionState()` by §9.19) — orthogonal mechanism, both required.

### B6 — API Client → Auth Listener (mid-session token refresh on 401)

Spec 99 amendment 2026-05-05 (resolves WF2 M1+M2+M3 #6, DeepSeek): Firebase ID tokens expire after ~1 hour. `onAuthStateChanged` does NOT fire on token expiry — Firebase only fires it on USER state changes (sign-in / sign-out / forced revocation). Pre-amend, B4 covered cold-boot/UID-change invalidation but the spec said nothing about mid-session refresh; the apiClient's existing 401 interceptor was implicit. A future contributor removing the interceptor "because it's not in the spec" would silently break the app at the 1-hour mark. B6 documents the interceptor as a normative bridge.

**Pattern:** (current implementation in `mobile/src/lib/apiClient.ts:65-84`)
```ts
async function fetchWithAuthInternal<T>(path, options, isRetry = false): Promise<T> {
  const { idToken } = useAuthStore.getState();
  const headers = { Authorization: `Bearer ${idToken}`, ... };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  // 401 intercept: force-refresh idToken and retry once.
  if (response.status === 401 && !isRetry) {
    try {
      const { user } = useAuthStore.getState();
      const newToken = await auth().currentUser?.getIdToken(true);
      if (newToken && user) {
        useAuthStore.getState().setAuth(user, newToken);
        return fetchWithAuthInternal<T>(path, options, /* isRetry */ true);
      }
    } catch {
      // Token refresh failed (Firebase unreachable, refresh token revoked) —
      // fall through to throw ApiError(401).
    }
    throw new ApiError(401, 'Unauthorized');
  }
  // ...
}
```

**Rules:**
- 401 from server MUST trigger `auth().currentUser?.getIdToken(true)` (force-refresh) exactly once. The `isRetry` boolean parameter is the cycle guard — recursive call sets `isRetry: true`, the second 401 propagates `ApiError(401)` instead of looping.
- Refreshed token MUST be written to `useAuthStore` via `setAuth(user, newToken)` BEFORE the retry. The retry uses the new bearer because `fetchWithAuthInternal` re-reads `idToken` from the store at line 20.
- Refresh failure (Firebase unreachable, `currentUser` null, `getIdToken` rejection) MUST propagate as `ApiError(401)` — the apiClient does NOT call `clearAuth()` directly. The error propagates to TanStack Query → consumer → AuthGate, which routes via Branch 4 (other profileError) to the retry UI per §5.3. A second 401 after the user-initiated retry would mean the refresh token itself is invalid — at that point the user is effectively signed out, and the next foreground/AppState event would let the listener detect the broken session.
- This bridge is mid-session ONLY. Cold-boot UID-change invalidation belongs to B4; sign-out cleanup belongs to B5. B6 fires when the app already has a logged-in `user` and just needs a fresh `idToken`.
- This section is the canonical (and sole) normative source for the 401 interceptor contract; `mobile/src/lib/apiClient.ts:65-84` is the implementation site. Removing the interceptor without a corresponding B6 spec amendment is forbidden.
- **Known limitation:** concurrent 401s each call `getIdToken(true)` independently. Firebase deduplicates the network refresh internally, but the store receives two `setAuth` writes. Low risk in practice (Zustand `set` is sync; second write is a no-op if newToken is identical). Tracked in `docs/reports/review_followups.md` as "concurrent 401 mutex" for future hardening.

---

## 5. Routing Authority Rules

### 5.1 One router per gate boundary

The mobile app has exactly TWO routing boundaries:

| Boundary | Sole Authority | File | Spec |
|----------|----------------|------|------|
| `(auth)` ↔ `(onboarding)` ↔ `(app)` | **AuthGate** | `mobile/app/_layout.tsx` AuthGate component | Spec 93 §5 Step 6 + Spec 94 §10 |
| `(app)` trial / expired / paywall | **AppLayout** | `mobile/app/(app)/_layout.tsx` | Spec 96 §10 Step 2 |

**Other layouts (`(auth)/_layout.tsx`, `(onboarding)/_layout.tsx`, `(app)/[lead]`/`[flight-job]` modals) MUST NOT have routing `useEffect`s.** They render their `<Stack/>` and let AuthGate / AppLayout govern transitions.

### 5.2 Routers MUST read from the canonical source

For each routing decision, the router MUST read from the field's owner per §3:

| Decision | Read from |
|----------|-----------|
| Is user authenticated? | `authStore.user` (canonical) |
| Has onboarding completed? | `useUserProfile().data.onboarding_complete` (canonical = server profile) — NEVER `useOnboardingStore.isComplete` |
| Which onboarding step to resume? | `useOnboardingStore.getState().currentStep` (lazy read per §6.4) |
| Account in deletion window? | `profileError instanceof AccountDeletedError` |
| Subscription status? | `useUserProfile().data.subscription_status` (canonical) — NEVER mirrored locally |

**Stale-profile guard (CRITICAL):** Routers MUST NOT make a routing decision against a `profile` whose `user_id !== authStore.user?.uid`. When the UID changes (B4 cache invalidation in flight), TanStack returns the previous user's `query.data` until the new fetch resolves; using it would route the new user based on the old user's `onboarding_complete` / `subscription_status`. AuthGate's existing `profileLoading && !profile` guard only defends the cold-boot case — it does NOT defend the UID-change-mid-fetch case. Implementation: `if (profile && (!profile.user_id || profile.user_id !== user?.uid)) return;` placed after the `profileLoading` guard.

**Hardening beyond spec letter (Gemini WF2 §9.6 F1 + DeepSeek #2 consensus, landed in `mobile/src/lib/auth/decideAuthGateRoute.ts`):** the falsy-uid pre-check (`!profile.user_id`) is stricter than the §5.2 `!==` letter required and rejects a corrupted/poisoned cache where `user_id` is `null` / `''` / `undefined` while attesting to `onboarding_complete: true`. Without the falsy guard, `null !== 'real-uid'` evaluates `true` so the inequality check ALSO returns `wait` for this case — *but only by accident*: a future cache-shape change that surfaced `user_id: ''` (empty string, not null) coupled with the same falsy assertion would still bypass the inequality (empty string `!== 'real-uid'` is also `true`, so the path appears safe — but a future predicate that read `profile.user_id` for routing would see the empty string and fail open). The explicit `!profile.user_id` falsy guard rejects the entire "corrupted cache" attack class regardless of which falsy value the corruption produces. AuthGate's caller emits a Sentry `stale_profile_missing_user_id` breadcrumb in this branch (caller-side side effect) so cache corruption is observable without routing on it. **§9.11 ✅ DONE.**

### 5.3 The 9 routing arms (AuthGate, Spec 93 §5 Step 6)

This subsection is the canonical AuthGate matrix. Any change to AuthGate's branches requires updating this section. **Counting convention:** 9 distinct routing arms (1, 2, 3, 4, 4.5, 5a, 5b, 5c, 5d). §8.2 test mandate covers all 9. Branch 5 has 4 sub-cases (5a-5d) because the destination depends on which group the user is currently in × `onboarding_complete`; collapsing them in tests would mask sub-case-specific bugs.

```
1.   !user                                           → /(auth)/sign-in
2.   AccountDeletedError                             → reactivation modal (no nav)
3.   ApiError 404                                    → /(onboarding)/profession
4.   profileError (other)                            → retry UI (no nav)
4.5. profile.account_preset='manufacturer' && !complete  → /(onboarding)/manufacturer-hold
5a.  profile && inAuthGroup && !complete             → getResumePath(profile, currentStep)
5b.  profile && inAuthGroup && complete              → /(app)/ + registerPushToken
5c.  profile && inOnboardingGroup && complete        → /(app)/
5d.  profile && !auth && !onboarding && !complete    → getResumePath(profile, currentStep)
```

### 5.4 Lint rule: router useEffect dependency hygiene

Router `useEffect` dependency arrays MUST NOT contain Zustand fields read inside the effect body. Use lazy `useStore.getState().field` instead. **Exception:** the dep array MUST contain values that — when changed — should cause the routing decision to be re-evaluated (e.g., `segments`, `user`, `profile`). The distinction: `user.uid` is a routing input (in deps); `currentStep` is informational for the destination (lazy read).

---

## 6. Render-Stability Rules (selector hygiene)

### 6.1 Atomic selectors MANDATE — no whole-store reads, no object-returning selectors without `useShallow`

Components MUST select only the primitives or stable references they need. As stores grow, bad selectors destroy frame rate by triggering re-renders on every mutation regardless of whether the component cared about the changed field. Zustand without a selector returns the WHOLE state object — a new reference produced on every `set()` — guaranteeing a re-render of the consumer on every store mutation anywhere in the store.

```ts
// BANNED — returns the WHOLE state on every render → re-renders on EVERY store mutation
//          even if the component only consumes one field. UI thread blocking risk.
const store = useFilterStore();
const { tradeSlug } = useFilterStore();   // destructure of whole state — same problem

// BANNED — returns a NEW object every render → re-renders on every store mutation
const { hydrate, reset } = useFilterStore((s) => ({ hydrate: s.hydrate, reset: s.reset }));

// REQUIRED — atomic primitive selectors
const tradeSlug = useFilterStore((s) => s.tradeSlug);
const hydrate = useFilterStore((s) => s.hydrate);
const reset = useFilterStore((s) => s.reset);
```

**`useShallow` escape hatch:** Zustand v5 ships `useShallow` exactly to opt into shallow-equality checks for object-returning selectors. Permitted for selectors returning arrays/objects of primitives (e.g., `useShallow((s) => s.tags)` or `useShallow((s) => ({ lat: s.lat, lng: s.lng }))`). BANNED for selectors returning store-action objects (`useShallow((s) => ({ hydrate: s.hydrate, reset: s.reset }))`) — separate selectors per action are simpler and shallow-equal still allocates a new array per render. Each `useShallow` site MUST include a one-line comment justifying why a primitive selector is insufficient.

**Enforcement:** §9.15 (router-hygiene lint vitest) is extended in this amendment to also flag whole-store reads (`useFilterStore()` with no selector) anywhere in `mobile/app/**` and `mobile/src/components/**`.

### 6.2 Hydrate functions MUST be idempotent

```ts
// REQUIRED idempotent pattern
hydrate: (profile) => {
  const next = { tradeSlug: profile.trade_slug ?? '', radiusKm: profile.radius_km ?? 10, ... };
  set((prev) => {
    // Only update keys that changed — Zustand's set bails out only on full-state Object.is
    const diff = computeDiff(prev, next);
    return diff.empty ? prev : { ...prev, ...diff.changed };
  });
}
```

### 6.3 IS DISTINCT FROM gate on mutation

```ts
// REQUIRED — don't write the same value back
setTradeSlug: (slug) => set((s) => s.tradeSlug === slug ? s : { tradeSlug: slug }),
```

### 6.4 Lazy `getState()` in router effects

```ts
// REQUIRED inside AuthGate's routing effect
useEffect(() => {
  // ... routing decision ...
  const currentStep = useOnboardingStore.getState().currentStep;  // ← lazy
  router.replace(getResumePath(profile, currentStep));
}, [user, segments, profile, ...]);  // ← currentStep NOT in deps
```

### 6.5 Gate conditions MUST be stable signals

A render gate condition (`if (X) return <Loading/>`) MUST evaluate to the same value across consecutive renders unless an *intentional* state transition occurred.

```ts
// BANNED — isFetching toggles on every refetch → AppLayout flickers between guard and Tabs
if (isLoading || isFetching || profile == null) return <SubscriptionLoadingGuard/>;

// REQUIRED — gate only on stable signals
if (isLoading || profile == null || profile.subscription_status == null) {
  return <SubscriptionLoadingGuard/>;
}
// Background refetches (isFetching=true with profile already loaded) are silent —
// the existing rendered tree stays mounted; refetch updates data when it resolves.
```

> **Amendment 2026-05-05 (resolves WF5 H1, audit `audit_spec99_2026-05-04.md`):** narrow `isFetching` carve-outs ARE permitted in render gates ONLY when ALL three conditions hold:
>
> 1. The carve-out pairs `isFetching` with a **stable status field** — a server-canonical enum that doesn't toggle on every refetch (e.g., `subscription_status`). Coupling with transient signals (`isError`, `isPaused`, `fetchStatus`) is BANNED.
> 2. The carve-out branch returns the **same `<Loading*/>` element** as the parent stable-signal gate. Returning a different element introduces a new flicker surface and is BANNED.
> 3. The carve-out is **explicitly enumerated below** by spec amendment in the SAME commit that adds the code. Implicit / grandfathered carve-outs are BANNED — reviewers MUST reject any unenumerated carve-out.
>
> **Permitted carve-outs (enumerated):**
>
> - **`mobile/app/(app)/_layout.tsx` — `isFetching && profile.subscription_status === 'expired'` returning `<SubscriptionLoadingGuard/>`.**
>   *Rationale:* Protects the post-payment `expired → active` transition (Spec 96 §9 anti-flicker). After Stripe's webhook flips `subscription_status` from `'expired'` to `'active'`, the next AppState→active or `refetchOnReconnect` fires a `['user-profile']` refetch; without the carve-out the gate would briefly render `<PaywallScreen>` for one frame before the new status arrives. The `'expired'` value is a server-canonical enum — it doesn't flip on refetch — so this branch fires ONLY while the cached status is already `'expired'` AND a refetch is in flight. Trial / active / past_due / admin_managed users never enter this branch (status mismatch), so background refetches stay silent for them and the tab tree stays mounted.
>   *Why this carve-out instead of a `useMutation`-backed flag refactor:* A flag refactor narrows the protection to AppState→active-initiated refetches only, leaving `refetchOnReconnect` and other automatic refetch paths exposed to the one-frame flash. The carve-out covers all refetch sources for the same UX cost.
>
> Adding a new permitted carve-out requires extending this enumeration in the same commit; reviewers MUST reject any unenumerated carve-out.

**Current violations being remediated** (do not soften this rule because the live code violates it — these are tracked):
- _Previously-tracked §6.5 violations all resolved_: line 202 broad gate removed by §9.4a (✅ DONE); line 216 narrow `expired` carve-out permitted by 2026-05-05 amendment above (now an enumerated exception).

### 6.6 Object-valued store fields MUST be deep-compared before set

> **§9.14 update (2026-05-04):** the original `notificationPrefs` JSONB blob — the canonical example for this rule — was flattened to 5 sibling primitive fields on `userProfileStore` (migration 117 + Phase B). Primitives compare via `Object.is` for free (Zustand's own equality), so deep-equal is no longer needed for that field. **Field-by-field comparison is the preferred shape going forward** (see Rules below); deep-equal remains required only for the few legitimately composite fields like `filterStore.homeBaseLocation` (`{lat, lng}` always travels together).

```ts
// REQUIRED for nested object fields (homeBaseLocation; was notificationPrefs pre-§9.14)
import equal from 'fast-deep-equal/es6';

hydrate: (profile) => set((prev) => {
  const nextLoc = { lat: profile.home_base_lat, lng: profile.home_base_lng };
  return equal(prev.homeBaseLocation, nextLoc) ? prev : { homeBaseLocation: nextLoc };
});
```

**Rules:**
- MUST use `fast-deep-equal/es6` (npm-installed, ~80 lines, no deps). Hand-rolled deep-equal is BANNED — easy to get wrong, hard to test, slow on cold paths.
- For schemas with stable shape (Zod-validated), **prefer field-by-field comparison** over deep-equal. The §9.14 flatten of `notification_prefs` is the canonical example: 5 atomic primitives + 5 `Object.is` gates replaced 1 JSONB blob + 1 `fast-deep-equal` call.
- New composite fields MUST justify the deep-equal cost in the spec PR (decision tree: would 2-3 atomic fields work? if yes, prefer flatten).

---

## 7. Observability Mandates

### 7.1 Permanent state-debug hub

Promote `mobile/src/lib/debug/loopDetector.ts` (currently temporary) to `mobile/src/lib/debug/stateDebug.ts`. In **DEV builds only** (`__DEV__` guard), it MUST:
- Subscribe to every Zustand store and log every mutation with field-level diffs (current loopDetector behavior — keep)
- Track render counts per component using `trackRender(tag)` (keep)
- Track effect fires with dep diffs via `useDepsTracker(tag, deps)` (keep)
- Detect render storms (>30 renders/sec) and log `[LOOP-DETECTED]` once with the offending tag (keep)

In **production builds** (`!__DEV__`), the hub is a no-op stub (zero overhead). Implemented in §9.5 (commit `af52c75`) — every export early-returns; `useDepsTracker` is exported as `__DEV__ ? useDepsTrackerDev : useDepsTrackerNoop` (module-scope ternary) so the production noop has zero hook calls (Hermes/Metro constant-folds the ternary at build time).

### 7.2 Cache invalidation telemetry

Every `queryClient.invalidateQueries` call MUST be paired with:
- `Sentry.addBreadcrumb({ category: 'query', message: 'invalidate', data: { key } })` for non-trivial invalidations (anything not in a user-initiated mutation's `onSettled`)
- A `track('query_invalidate', { key })` PostHog event in DEV only (production volume too high)

### 7.3 Router decision telemetry

In **DEV builds**, every `router.replace` / `router.push` from AuthGate or AppLayout MUST emit `track('route_decision', { authority, branch, from, to, reason })`.

In **production**, ONLY these four routing events emit telemetry (low frequency, high signal):
1. `signOut → /(auth)/sign-in` — fires once per session end; churn / engagement signal.
2. AuthGate Branch 2 (AccountDeletedError) → reactivation modal **shown** — compliance-critical (proves users saw the 30-day window prompt).
3. `cancelled_pending_deletion` → forced sign-out (AppLayout deletion handler) — revenue / churn signal.
4. AppLayout `expired → active` transition (paywall clears) — subscription conversion event.

The high-frequency onboarding routing arms (5a-5d) MUST NOT emit production telemetry — too noisy, no actionable signal.

### 7.4 React Strict Mode visibility

`stateDebug.trackRender(tag)` MUST count Strict Mode double-fires (counter increments on each), not suppress them. The `[LOOP-DETECTED]` threshold (30/sec) is high enough to ignore Strict Mode noise but catch genuine loops.

---

## 8. Test Mandates

### 8.1 Idempotency tests for every bridge

Each bridge in §4 MUST have a Jest test asserting that calling it twice with identical input produces zero observable mutations on the second call. Pattern:

> **B6 carve-out (added with §4 B6, 2026-05-05):** B6 is a one-shot 401-retry interceptor — by design, two consecutive 401s with identical input fire `getIdToken(true)` on each call (Firebase deduplicates the network refresh internally; the per-request `isRetry` guard limits each call chain to exactly one retry). The B1-B5 idempotency mandate does NOT apply to B6 in the hydration-equality sense. B6's test contract is enforced separately by the §4.B6 rules (exactly-once retry per call chain via `isRetry`; identical-token short-circuit at the Firebase SDK layer).

```ts
it('hydrate is idempotent — second call with same profile produces no notify', () => {
  const listener = jest.fn();
  useFilterStore.subscribe(listener);
  useFilterStore.getState().hydrate(profile);
  useFilterStore.getState().hydrate(profile);
  expect(listener).toHaveBeenCalledTimes(1);  // not 2
});
```

### 8.2 Router branch coverage

Each branch in §5.3 (5 + 4.5 manufacturer = 6 branches) MUST have a Jest test verifying its specific (segments + profile + error) input combination produces the correct `router.replace` call. Pattern: `mobile/__tests__/authGate.test.ts` (to be created in WF2).

### 8.3 Gate-stability tests

Each render gate condition (per §6.5) MUST have a test asserting that toggling `isFetching` does NOT flip the gate. Pattern: render the layout twice (once with isFetching=true, once with =false) — both must produce the same JSX.

### 8.4 The stateDebug hub as CI regression guard

**Prerequisite:** §9.5 ✅ done (commit `af52c75` promoted `loopDetector.ts` → `stateDebug.ts` with `__DEV__` guards).

`stateDebug.dumpDiagnostics()` is permitted in CI integration tests as an assertion — `expect(maxRendersPerSecond).toBeLessThan(20)`. **Not yet actionable as written:** `dumpDiagnostics()` returns a `string` (human-readable snapshot), not a structured object. Tracked as **§9.5b** (NEW followup): add a `getDiagnosticsSnapshot(): { renders: Array<{tag, total, last1s}>, effects: Array<...> }` accessor for parse-free CI assertions (Gemini WF3-§9.5 review #4).

### 8.5 Store-enumeration test (§B5 reset coverage)

A vitest at `mobile/__tests__/storeReset.coverage.test.ts` MUST glob `mobile/src/store/*.ts`, parse each file for `export const use<Name>Store = create<...>(`, and assert that `signOut()` in `mobile/src/store/authStore.ts` calls `use<Name>Store.getState().reset()` for every discovered store (or that the store is explicitly excluded with a `// signOut-exempt: <reason>` comment). Adding a store without a reset call OR exemption fails CI.

### 8.6 Schema-vs-matrix drift check

A pre-commit script `mobile/scripts/check-spec99-matrix.mjs` MUST parse the Zod object keys from `mobile/src/lib/userProfile.schema.ts` and the §3.1 markdown table, asserting setEqual (every server field has exactly one §3.1 row). A future migration that adds a new server field without a §3.1 row fails the check. Pattern matches existing `scripts/ai-env-check.mjs`.

---

## 9. Migration Plan (followup WFs)

The following items eliminate the duplication identified in the audit and resolve the spec-vs-code drift surfaced by adversarial review. Each is a separate WF — this Spec 99 only authorizes the work; it does not perform it.

**Priority legend:**
- **P0/BLOCKING** — closes an active incident or spec-code drift visible in production code. Spec 99's normative rules are violated until landed.
- **P1** — duplication / structural cleanup; required for the spec to fully apply but not actively breaking users today.
- **P2** — observability / tooling / future-proofing.

**Sequencing:** items with explicit `depends on:` lines MUST land in order.

| # | Priority | Item | WF type | Files |
|---|----------|------|---------|-------|
| 9.4a | **P0** | Strip `isFetching` from AppLayout loading gate (§6.5 violation; root cause of incident #3 emulator flicker loop) | WF3 | `mobile/app/(app)/_layout.tsx:202` |
| 9.4b | P2 | (Optional) keep `refetchOnReconnect: true` decision documented; no code change needed | — | — |
| 9.8 | **P0** | Add deep-equal-before-set to `filterStore.hydrate` and `userProfileStore.hydrate` (§6.6 violation; required before §9.7 tests can pass) | WF3 | `mobile/src/store/filterStore.ts:78`, `mobile/src/store/userProfileStore.ts:59`. Install `fast-deep-equal`. |
| 9.10 | ✅ DONE | Implemented as `queryClient.clear()` in `mobile/src/store/authStore.ts` (`clearLocalSessionState` helper per §9.19) — broader-than-spec purge for defense-in-depth (cancels in-flight refetches across all queries, not just `['user-profile']`). Originally specified as scoped `removeQueries({queryKey: ['user-profile']})`; spec amended 2026-05-05 to match implementation (see §B5 rule body). | WF3 | `mobile/src/store/authStore.ts:signOut()` |
| 9.11 | ✅ DONE | Implemented in `mobile/src/lib/auth/decideAuthGateRoute.ts:100` as part of the §9.6 pure-function extraction. Hardened beyond spec letter with `!profile.user_id` falsy pre-check (Gemini WF2 §9.6 F1 + DeepSeek #2 consensus — rejects corrupted-cache attack class where `user_id` is null/empty while attesting to `onboarding_complete: true`). Spec §5.2 amended 2026-05-05 to document the falsy guard. | WF3 | `mobile/src/lib/auth/decideAuthGateRoute.ts` |
| 9.2a | P1 | Migrate `IncompleteBanner` to read `useUserProfile().data.onboarding_complete` (NOT `useOnboardingStore.isComplete`) | WF2 | `mobile/src/components/onboarding/IncompleteBanner.tsx` |
| 9.2b | P1 | depends on 9.2a — Remove `markComplete()` bridge from `useUserProfile.ts:101-103` AND update direct callers in `mobile/app/(onboarding)/complete.tsx:69` and `terms.tsx:91` to PATCH `onboarding_complete=true` directly to server (no local state mirror) | WF2 | `mobile/src/hooks/useUserProfile.ts`, `mobile/app/(onboarding)/complete.tsx`, `mobile/app/(onboarding)/terms.tsx` |
| 9.2c | P1 | depends on 9.2b — Remove `isComplete` field + `markComplete()` action from `onboardingStore`. Add `persist` `migrate` function (version bump 0→1) to drop the legacy MMKV key for existing users. | WF2 | `mobile/src/store/onboardingStore.ts` |
| 9.3 | P1 | Remove `selectedTrade`, `selectedTradeName`, `locationMode`, `homeBaseLat`, `homeBaseLng`, `supplierSelection` duplicates from `onboardingStore`. Add `persist` `migrate` function (version bump) to drop legacy MMKV keys. Update onboarding screens to write to `filterStore` after server PATCH success (no local mirror). | WF2 | `mobile/src/store/onboardingStore.ts`, `mobile/app/(onboarding)/profession.tsx`, `address.tsx`, `supplier.tsx` |
| 9.1 | ✅ DONE | Eliminated `user-profile-cache` MMKV blob. TanStack persister is now sole canonical profile cache (verified sync via `mmkvPersister.restoreClient` — no cold-boot regression). §B5 dropped the `clearUserProfileCache()` call. One-time `cleanupLegacyUserProfileCache()` migration in `mobile/src/lib/migrations/` purges the orphaned blob on existing installs (gated by `legacyStorage.contains('profile')` to avoid materializing an empty file on fresh installs per Gemini WF3-§9.1 review F2). | WF3 | `mobile/src/hooks/useUserProfile.ts`, `mobile/src/store/authStore.ts`, `mobile/src/lib/migrations/userProfileCacheCleanup.ts` |
| 9.5 | ✅ DONE | Promoted `loopDetector.ts` → `mobile/src/lib/debug/stateDebug.ts` (commit `af52c75`). Every export `__DEV__`-guarded. `useDepsTracker` exported as module-scope ternary (`__DEV__ ? useDepsTrackerDev : useDepsTrackerNoop`) so production noop calls ZERO hooks (Hermes/Metro DCEs the dev impl). `wired` flag persisted on `globalThis` so HMR re-fires of `wireStoreLogging()` don't multiply subscriptions. Production-path test at `mobile/__tests__/stateDebug.prod.test.ts` exercises the `__DEV__ === false` path. | WF3 | `mobile/src/lib/debug/stateDebug.ts`, 5 import-site updates, `mobile/__tests__/stateDebug.prod.test.ts` (NEW) |
| 9.5b | ✅ DONE | Added `getDiagnosticsSnapshot(): {renders: DiagnosticsCounter[], effects: DiagnosticsCounter[]}` to `stateDebug.ts`; both arrays sorted by total desc; production returns empty arrays via `__DEV__` guard. `dumpDiagnostics()` refactored to format the snapshot. CI assertions can now read counters structurally. | WF2 P2 batch | `mobile/src/lib/debug/stateDebug.ts` |
| 9.6 | P1 | Add AuthGate router branch tests (9 arms per §5.3) | WF2 | `mobile/__tests__/authGate.test.ts` (NEW) |
| 9.7 | P1 | depends on 9.8 — Idempotency tests for all bridges per §8.1 | WF2 | `mobile/__tests__/bridges.test.ts` (NEW) |
| 9.9 | ✅ DONE | Audited `paywallStore.show()` — caller is `mobile/src/components/paywall/InlineBlurBanner.tsx:12` (`usePaywallStore((s) => s.show)`). The original §3.4 audit grep missed the selector usage; row updated with verified caller. | WF2 P2 batch | `docs/specs/03-mobile/99_mobile_state_architecture.md` §3.4 |
| 9.12 | ✅ DONE | Added `mobile/__tests__/storeReset.coverage.test.ts`. Discovers all Zustand stores in `mobile/src/store/` via regex, asserts each has a matching `.getState().reset()` call in `signOut()` OR a `// signOut-exempt: <reason>` comment. Catches the silent-leak bug where adding a new store and forgetting the signOut entry leaves stale data on shared devices (PIPEDA leak class). | WF2 P2 batch | `mobile/__tests__/storeReset.coverage.test.ts` (NEW) |
| 9.13 | ✅ DONE | Added `mobile/scripts/check-spec99-matrix.mjs`. Parses Zod schema field names + §3.1 table column 1; asserts setEqual. Brace-depth tracker in schema parser skips nested `notification_prefs` keys; multi-line `z\s*\.` allows `subscription_status` (split across 3 lines). Currently 0 drift across 27 fields. Discovered & fixed 4 missing §3.1 rows (`created_at`, `updated_at`, `display_name`, `email`) as part of close-out. | WF2 P2 batch | `mobile/scripts/check-spec99-matrix.mjs` (NEW), `docs/specs/03-mobile/99_mobile_state_architecture.md` §3.1 |
| 9.14 | ✅ DONE | Flattened `notification_prefs` JSONB → 5 sibling columns (3 booleans + 2 enums) via migration 117. Server (`userProfile.schema.ts` + 2 API routes + `classify-lifecycle-phase.js` push-dispatch script) and mobile (`userProfile.schema.ts`, `userProfileStore`, `settings.tsx`, 4 test files) updated in coordinated phases. Cost-tier enum reconciled from divergent `['small','medium','large','major','mega']` (one-off in `notifications/preferences/route.ts`) to canonical `['low','medium','high']`. `lifecycle_stalled_pref` server-column suffix avoids collision with `permits.lifecycle_stalled` in pipeline joins. `userProfileStore` persist `version: 1` + migrate drops orphan JSONB blob from existing MMKV. `fast-deep-equal` no longer called from `userProfileStore` — primitive `Object.is` per field replaces the deep-equal hot path that §6.6 was written to mitigate. | WF2 cross-domain | migration 117, `src/lib/userProfile.schema.ts`, `src/app/api/user-profile/route.ts`, `src/app/api/notifications/preferences/route.ts`, `scripts/classify-lifecycle-phase.js`, 4 server test files; `mobile/src/lib/userProfile.schema.ts`, `mobile/src/store/userProfileStore.ts`, `mobile/app/(app)/settings.tsx`, 4 mobile test files |
| 9.15 | ✅ DONE | Added `mobile/__tests__/routerHygiene.lint.test.ts`. Two static-analysis rules: (1) router-effect hygiene — extracts every `useEffect(() => { BODY }, [DEPS])` block via brace-depth tracking; if `router` is in DEPS, scans BODY for `useXStore(` hook calls (lazy `.getState()` reads remain permitted). (2) atomic-selector mandate — globs `mobile/app/**/*.tsx` + `mobile/src/components/**/*.tsx`; flags any `useXStore()` zero-arg whole-store read per §6.1. 51 tests pass against current code. | WF2 P2 batch | `mobile/__tests__/routerHygiene.lint.test.ts` (NEW) |
| 9.16 | ✅ DONE | Migrated the 3 lossy local-only `setRadiusKm` call sites (`(app)/index.tsx` ×2 widen-radius shortcuts + `(app)/settings.tsx` slider + `LeadFilterSheet.tsx` preset buttons) to canonical Bridge B3 via the new `usePatchProfile` hook. Each invocation now: cancels in-flight `['user-profile']` refetches → optimistically applies via `setRadiusKm` (the canonical setter per §3.1) → PATCHes `/api/user-profile` → rolls back on error → invalidates the query on settle. No new B6 pattern was added; the prior partial implementation was a bug, not a deliberate design. The `usePatchProfile` options-builder is exported separately so `mobile/__tests__/usePatchProfile.test.ts` can construct a `MutationObserver` directly without a React renderer (6 lifecycle tests cover all 4 §4.B3 contract obligations). The hook is intentionally extensible — adding `location_mode`/`home_base_lat`/`home_base_lng`/`supplier_selection`/`default_tab` to `ProfilePatch` plus snapshot/apply branches in `onMutate`/`onError` is a straightforward future expansion. | WF2 §9.16 | `mobile/src/hooks/usePatchProfile.ts` (NEW), `mobile/__tests__/usePatchProfile.test.ts` (NEW), `mobile/app/(app)/index.tsx`, `mobile/app/(app)/settings.tsx`, `mobile/src/components/feed/LeadFilterSheet.tsx` |
| 9.17 | ✅ DONE | Cursor backward-compat — accept pre-deploy bare-int builder `lead_ids` in lead-feed cursor parser at the Phase 6 deploy moment (server-side fix). Closes deferred CRITICAL from the WF3 Phase 7 adversarial review (Gemini): cursor wire-format break for in-flight clients during the lead_id-to-string Phase 6 transition. The `get-lead-feed.ts` row-tuple comparison was extended with a `CASE WHEN $7::text = 'builder' THEN LPAD($8::text, 20, '0') ELSE $8::text END` pattern so cursors emitted before deploy (bare int) and after deploy (zero-padded string) both decode against the canonical lead_id shape. Existing logic test relaxed to match the new shape while still asserting row-tuple comparison structure. | WF3 (Spec 70 cursor work, recorded here for §9 catalog completeness) | `src/features/leads/lib/get-lead-feed.ts`, `src/tests/get-lead-feed.logic.test.ts` |
| 9.18 | ✅ DONE | Strip `['user-profile']` query from MMKV persister to comply with §2.1 PII layer boundary. Closes deferred CRITICAL from WF3 Phase 7 Gemini review: the mobile `UserProfileSchema` includes 5 PII identity fields (full_name, phone_number, company_name, email, backup_email) that landed unencrypted on disk via the TanStack persister; `mmkvPersister` is Layer 4a UNENCRYPTED while §2.1 mandates Layer 4b SecureStore for PII. Two-commit landing: `671aa87` (initial fix via `dehydrateOptions.shouldDehydrateQuery` filter excluding the user-profile query — only filters WRITES to MMKV) + `202a9aa` (code-reviewer CRITICAL amendment: bumped persister `buster` to `'wf3-pii-strip-1'` to flush the pre-WF3 persisted blob from existing clients on cold-boot, since `shouldDehydrateQuery` does NOT filter rehydration READS; also extracted `persistFilter.ts` helper for the dehydrate predicate). | WF3 | `mobile/src/lib/persistFilter.ts` (NEW), `mobile/app/_layout.tsx` (PersistQueryClientProvider config), `mobile/src/store/authStore.ts` (`mmkvPersister.removeClient()` call), `mobile/__tests__/offline.test.ts` |
| 9.19 | ✅ DONE | Unify forced-signout cleanup with explicit-signout path (§B5 listener-null branch). Pre-WF3 the `signOut()` finally block did the global fan-out (queryClient.clear + 4 peer-store resets + persister blob purge) but the `onAuthStateChanged(null)` listener branch only called `clearAuth()` — leaving stale data on shared devices for forced sign-outs (admin disable, password change on another device, project token revocation per Spec 93 §3.1). The asymmetry was the PROMOTED CRITICAL from §9.14 Phase D Gemini review, made more visible in §9.18 (which added `mmkvPersister.removeClient()` to `signOut()` but not the listener path). Resolution: extracted `clearLocalSessionState()` module-scope helper containing the full fan-out; both paths now invoke it. Added `forced_signout` PostHog event distinct from `signout_initiated` so analytics distinguishes the two trigger paths. `lastKnownUid !== null` guard prevents the cleanup from firing on every cold-boot first-fire (when the listener legitimately fires `null` before Firebase resolves the cached session). Two-commit landing: `381a0c9` (initial unification with helper extraction + telemetry) + `f2f7147` (code-reviewer amendments — deterministic mock-call assertions in `useAuth.test.ts`). | WF3 | `mobile/src/store/authStore.ts` (`clearLocalSessionState` helper + listener wiring), `mobile/__tests__/storeReset.coverage.test.ts`, `mobile/__tests__/useAuth.test.ts` |
| 9.20 | ✅ DONE | Dead-code sweep across cumulative §9 + WF3 changes (16+ commits across mobile state + auth + push dispatch + mobile schema + cursor backward-compat + PII strip). Conservative posture: only items with NO consumers AND NO upgrade-path obligation removed. Knip baseline reduced from 4 unused exports to 3 — the removed export was `CLIENT_SAFE_COLUMNS` in the SERVER `userProfile.schema.ts` (consumers were since-deleted server-shape lookup helpers). Persist `migrate` functions and one-time MMKV cleanup helpers KEPT for upgrader safety (existing v0 clients still need them; removing would silently corrupt v0 state on upgraders). | WF3 | `src/lib/userProfile.schema.ts` (server-side `CLIENT_SAFE_COLUMNS` removal) |
| 9.23 | ✅ DONE | B6 — API Client → Auth Listener (mid-session token refresh on 401) bridge spec amendment per WF2 M1+M2+M3 #6 (DeepSeek). Documents the existing `mobile/src/lib/apiClient.ts:65-84` 401 interceptor as a normative bridge — Firebase ID tokens expire after ~1 hour but `onAuthStateChanged` does NOT fire on expiry, so without this bridge a future contributor could remove the interceptor "because it's not in the spec" and silently break the app at the 1-hour mark. §4 header renamed Five → Six Bridge Patterns. No code change — implementation existed; this is normative documentation. | WF2 doc-only | `docs/specs/03-mobile/99_mobile_state_architecture.md` §4 (B6 section + header rename) |
| 9.24 | ✅ DONE (spec amendment + 2026-05-05 same-day revision) | B3 rollback race documentation per WF2 M1+M2+M3 #7 (DeepSeek). Initial amendment mandated re-read-before-rollback as the recommended default; revised same day to match `usePatchProfile.ts` §9.16 implementation — naive rollback is the canonical pattern for low-contention fields, re-read-before-rollback is recommended for high-contention fields if/when production observation justifies it. Closes the spec-vs-code drift the M1+M2+M3 batch was designed to prevent. No code change needed. | WF2 doc-only | `docs/specs/03-mobile/99_mobile_state_architecture.md` §4 B3 Rules subsection |
| 9.21 | ✅ DONE | Pattern A class-level fix per audit Phase 5 (`audit_spec99_2026-05-04.md` line 161-168) — `mobile/__tests__/spec99.mandates.lint.test.ts` statically asserts every §7 + §8 mandate has implementation evidence. 10 mandate cases (§7.1-§7.4, §8.1-§8.6) + 1 sanity case + 1 meta-count guard. Hardcoded `MANDATES` array means adding a new spec mandate requires explicitly adding a row (the meta-count guard catches accidental drops). Source-grep style consistent with `routerHygiene.lint.test.ts` (§5.4+§6.1 enforcement) and `storeReset.coverage.test.ts` (§8.5). The lint test surfaced a NEW gap: §7.2 (`Sentry.addBreadcrumb({category:'query'})` paired with `invalidateQueries`) has zero implementation evidence at HEAD — audit Phase 4 verified §7.1/§7.3 but not §7.2; that case is `it.skip` with `pendingReason` until a follow-up WF3 wires the telemetry. | WF1 | `mobile/__tests__/spec99.mandates.lint.test.ts` (NEW) |

---

## 10. Operating Boundaries

### Target Files (this spec authorizes — actual edits happen in §9 followup WFs)
- `docs/specs/03-mobile/99_mobile_state_architecture.md` (this file — the spec)
- `docs/reports/mobile_state_audit_2026-05-02.md` (the audit feeding §3)
- `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §7 (replaced with pointer to this spec)

### Out-of-Scope Files (cleanup is gated on §9 followup WFs)
- All `mobile/src/store/*.ts` — modified in §9.3 / §9.5 followups, not here
- All `mobile/app/**/_layout.tsx` — already fixed in prior WF3; further changes per §9.4
- All `mobile/app/(onboarding)/*.tsx` — modified in §9.3 followup
- `mobile/src/hooks/useUserProfile.ts` — modified in §9.1 / §9.2 / §9.4
- `mobile/src/lib/debug/stateDebug.ts` (renamed from `loopDetector.ts` in §9.5) — modify only via §9.5b structured-snapshot followup

### Cross-Spec Dependencies
- **This spec is a dependency of:** every future mobile WF that adds state, a store, or a router.
- **This spec depends on:** Spec 90 (engineering stack), Spec 93 (auth + AuthGate), Spec 94 (onboarding flow), Spec 95 (server profile = canonical), Spec 96 (subscription gate).
- **Authorized amendment process:** any change to §3 (Field Ownership Matrix), §4 (Bridge Patterns), or §5 (Routing Authority Rules) requires a WF1 amendment with adversarial review.
