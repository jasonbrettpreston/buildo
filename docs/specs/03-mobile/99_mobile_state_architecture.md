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
│  Layer 4 — MMKV (persistence only — never read directly     │  ← persistence backing store
│           outside persist middleware or B5)                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — Reanimated SharedValues (UI-only, never gated    │  ← orthogonal to layers 1-4
│           on for routing or business logic)                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Hard rules

- **Layer 4 (MMKV) is NEVER read directly outside Zustand `persist` middleware or TanStack `Persister`.** Direct `createMMKV().getString()` in component / hook code is BANNED. (Closes the `user-profile-cache` duplicate-blob anti-pattern.)
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
| `radius_km` | int | `filterStore.radiusKm` | Server | Server PATCH from LeadFilterSheet | useLeadFeed params, LeadFilterSheet UI | B2 |
| `supplier_selection` | text | `filterStore.supplierSelection` | Server | Server PATCH from `supplier.tsx` or settings | settings, future supplier-tagged feed | B2 |
| `full_name` / `company_name` / `phone_number` / `backup_email` | text | `userProfileStore.{fullName,companyName,phoneNumber,backupEmail}` | Server | Server PATCH from settings | settings forms, NotificationToast (display only) | B2 |
| `notification_prefs` | jsonb (5-key shape) | `userProfileStore.notificationPrefs` | Server | Server PATCH from settings notifications | settings notification toggles | B2 — **MUST use deep-equal gate per §6.6** |
| `onboarding_complete` | bool | **NONE** (was `onboardingStore.isComplete` until 2026-05-02; see §3.5 deprecation) | Server | Server PATCH in `complete.tsx` | AuthGate (Branch 5), `IncompleteBanner` (read server profile directly per §9.2) | B2 |
| `tos_accepted_at` | timestamptz | — | Server | Server PATCH from `terms.tsx` | AuthGate fallback, audit | — |
| `account_preset` | enum | — | Server (admin-set) | Admin tool | AuthGate manufacturer branch (Branch 4.5) | — |
| `account_deleted_at` | timestamptz | — | Server | DELETE intent endpoint | apiClient → AccountDeletedError → AuthGate reactivation modal | — |
| `subscription_status` | enum | — | Server (Stripe webhook + admin) | Stripe webhook handler | AppLayout subscription gate, PaywallScreen | — |
| `lead_views_count` | int | — | Server (incremented on lead view API) | Lead view endpoint | PaywallScreen copy | — |
| `trial_started_at` / `stripe_customer_id` / `trade_slugs_override` / `radius_cap_km` | various | — | Server | server / admin | settings, internal logic | — |

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

| Field | Owner Layer | Canonical Writer | Authorized Readers |
|-------|-------------|------------------|---------------------|
| `currentStep` | `onboardingStore` | each onboarding screen calls `setStep('next')` AFTER its PATCH succeeds (Spec 94 §10 Step 11) | AuthGate `getResumePath()` — **MUST be read via `useOnboardingStore.getState().currentStep` inside the effect closure (NEVER subscribed via `useStore((s) => s.currentStep)` per §6.4)** |
| `selectedTradeName` | `onboardingStore` | `setTrade()` in `profession.tsx` | `path.tsx` for display |
| `selectedPath` | `onboardingStore` | `setPath()` in `path.tsx` | `address.tsx`, `supplier.tsx` (skip-suppliers branch) |

### 3.4 Engagement (Zustand, in-memory)

| Field | Owner Layer | Writer | Readers |
|-------|-------------|--------|---------|
| `unreadFlightBoard` | `notificationStore` (in-memory) | `incrementUnread()` in `NotificationHandlers` foreground push handler; `clearUnread()` on Flight Board tab focus | AppLayout tab badge |
| `paywall.visible` | `paywallStore` (in-memory — Spec 96 §9 explicit) | `show()` — currently has NO callers (verified by grep 2026-05-02); reserved for InlineBlurBanner tap once wired. Until then, this field is ALWAYS `false`. **Audit obligation per §9.9: confirm caller exists before next release, or delete the field.** | AppLayout subscription gate, PaywallScreen |
| `paywall.dismissed` | `paywallStore` (in-memory) | `dismiss()` (PaywallScreen "Maybe later" tap), `clear()` (signOut per §B5; `expired→active` transition in AppLayout) | AppLayout subscription gate, InlineBlurBanner |

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
| `useUserProfile.readCachedProfile` MMKV blob (`user-profile-cache`) | Eliminated — TanStack persister covers fast-hydration | WF3 §9.1 |
| `userProfileStore.hydrate` non-idempotent set | Migrate to deep-equal-before-set per §6.6 | WF2 §9.8 |
| `filterStore.hydrate` non-idempotent set | Same | WF2 §9.8 |
| `paywallStore.show()` action with no caller | Delete OR wire InlineBlurBanner caller | WF3 §9.9 |

---

## 4. The Five Bridge Patterns

These are the **only** allowed cross-layer flows. A sixth pattern requires a spec amendment.

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

### B4 — Auth Listener → Cache Invalidation

**Pattern:** (current implementation in `mobile/src/store/authStore.ts`)
```ts
auth().onAuthStateChanged((firebaseUser) => {
  if (firebaseUser) {
    const expectedUid = firebaseUser.uid;
    if (lastKnownUid !== expectedUid) {
      clearUserProfileCache();
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      lastKnownUid = expectedUid;
    }
    // ... setAuth
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

**Pattern:** (current implementation in `mobile/src/store/authStore.ts:signOut`)
```ts
signOut: async () => {
  track('signout_initiated');
  usePaywallStore.getState().clear();   // BEFORE firebase signOut — Spec 96 §9 critical
  await auth().signOut();
  useFilterStore.getState().reset();
  useNotificationStore.getState().reset();
  useOnboardingStore.getState().reset();
  useUserProfileStore.getState().reset();
  clearUserProfileCache();
  set({ user: null, idToken: null, isLoading: false });
  resetIdentity();
}
```

**Rules:**
- Order is normative: paywall reset BEFORE firebase signOut (prevents shared-device handoff race per Spec 96 §9).
- All in-memory Zustand stores MUST be enumerated in this function. Adding a new store with user-scoped state requires adding a `.reset()` call here. **Enforcement:** §8.5 store-enumeration test grep-asserts that every `create<*Store>(` in `mobile/src/store/*.ts` has a corresponding `.getState().reset()` call in `signOut()`.
- **`queryClient.removeQueries({queryKey: ['user-profile']})` MUST fire** in `signOut()` AFTER `await auth().signOut()` and BEFORE the Zustand resets. Reason: `enabled: !!user` only stops *new* fetches — in-flight fetches resolve and write to the cache, attributing the previous user's data to the next sign-in. Additionally, the MMKV-persisted TanStack cache (`mmkvPersister`, 24h `maxAge`) survives the sign-out and rehydrates on next mount, leaking previous-user `['user-profile']` to a different user signing in on a shared device — a privacy violation under PIPEDA (the same reason `userProfileStore.partialize` strips PII). The B4 invalidate-on-uid-change is defense-in-depth; this `removeQueries` call is the primary fix. **Tracked as §9.10 followup.**

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

**Stale-profile guard (CRITICAL):** Routers MUST NOT make a routing decision against a `profile` whose `user_id !== authStore.user?.uid`. When the UID changes (B4 cache invalidation in flight), TanStack returns the previous user's `query.data` until the new fetch resolves; using it would route the new user based on the old user's `onboarding_complete` / `subscription_status`. AuthGate's existing `profileLoading && !profile` guard only defends the cold-boot case — it does NOT defend the UID-change-mid-fetch case. Implementation: `if (profile && profile.user_id !== user?.uid) return;` placed after the `profileLoading` guard. **Tracked as §9.11 followup.**

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

### 6.1 Zustand selectors MUST return primitives or stable references

```ts
// BANNED — returns a NEW object every render → re-renders on every store mutation
const { hydrate, reset } = useFilterStore((s) => ({ hydrate: s.hydrate, reset: s.reset }));

// REQUIRED — separate selectors, each returning a stable function reference
const hydrate = useFilterStore((s) => s.hydrate);
const reset = useFilterStore((s) => s.reset);
```

**`useShallow` escape hatch:** Zustand v5 ships `useShallow` exactly to opt into shallow-equality checks for object-returning selectors. Permitted ONLY for selectors returning arrays of primitives (e.g., `useShallow((s) => s.tags)`). BANNED for selectors returning store-action objects (`useShallow((s) => ({ hydrate: s.hydrate, reset: s.reset }))`) — separate selectors per action are simpler and shallow-equal still allocates a new array per render. Each `useShallow` site MUST include a one-line comment justifying why a primitive selector is insufficient.

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

**Current violations being remediated** (do not soften this rule because the live code violates it — these are tracked):
- `mobile/app/(app)/_layout.tsx:202` includes `isFetching` in the loading gate — **§9.4 P0/BLOCKING removes it**.

### 6.6 Object-valued store fields MUST be deep-compared before set

```ts
// REQUIRED for nested object fields (notificationPrefs, homeBaseLocation)
import equal from 'fast-deep-equal/es6';

hydrate: (profile) => set((prev) => {
  const nextPrefs = profile.notification_prefs;
  return equal(prev.notificationPrefs, nextPrefs) ? prev : { notificationPrefs: nextPrefs };
});
```

**Rules:**
- MUST use `fast-deep-equal/es6` (npm-installed, ~80 lines, no deps). Hand-rolled deep-equal is BANNED — easy to get wrong, hard to test, slow on cold paths.
- For schemas with stable shape (Zod-validated), prefer **field-by-field comparison** over deep-equal. `notification_prefs` (5 known keys) is a candidate — and §9.8 followup proposes flattening it to 5 separate boolean fields on `userProfileStore` so each one becomes a primitive comparison (no deep-equal needed).
- **Current violations being remediated:** `mobile/src/store/filterStore.ts:78-89` and `mobile/src/store/userProfileStore.ts:59-66` both call bare `set({...})` unconditionally. **§9.8 P0/BLOCKING fixes both.**

---

## 7. Observability Mandates

### 7.1 Permanent state-debug hub

Promote `mobile/src/lib/debug/loopDetector.ts` (currently temporary) to `mobile/src/lib/debug/stateDebug.ts`. In **DEV builds only** (`__DEV__` guard), it MUST:
- Subscribe to every Zustand store and log every mutation with field-level diffs (current loopDetector behavior — keep)
- Track render counts per component using `trackRender(tag)` (keep)
- Track effect fires with dep diffs via `useDepsTracker(tag, deps)` (keep)
- Detect render storms (>30 renders/sec) and log `[LOOP-DETECTED]` once with the offending tag (keep)

In **production builds** (`!__DEV__`), the hub is a no-op stub (zero overhead). The current `loopDetector` does NOT have this guard — must add per §9.5.

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

**Prerequisite:** §9.5 must complete first (currently `loopDetector.ts` exposes `dumpDiagnostics` but lacks `__DEV__` guards; promotion to `stateDebug.ts` happens in §9.5).

`stateDebug.dumpDiagnostics()` is permitted in CI integration tests as an assertion — `expect(maxRendersPerSecond).toBeLessThan(20)`. This catches loop regressions before merge.

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
| 9.10 | **P0** | Add `queryClient.removeQueries({queryKey: ['user-profile']})` to `signOut()` (§B5 PIPEDA leak risk on shared device) | WF3 | `mobile/src/store/authStore.ts:signOut()` |
| 9.11 | **P0** | Add stale-profile guard to AuthGate (§5.2 — `if (profile && profile.user_id !== user?.uid) return;`) | WF3 | `mobile/app/_layout.tsx` AuthGate routing effect |
| 9.2a | P1 | Migrate `IncompleteBanner` to read `useUserProfile().data.onboarding_complete` (NOT `useOnboardingStore.isComplete`) | WF2 | `mobile/src/components/onboarding/IncompleteBanner.tsx` |
| 9.2b | P1 | depends on 9.2a — Remove `markComplete()` bridge from `useUserProfile.ts:101-103` AND update direct callers in `mobile/app/(onboarding)/complete.tsx:69` and `terms.tsx:91` to PATCH `onboarding_complete=true` directly to server (no local state mirror) | WF2 | `mobile/src/hooks/useUserProfile.ts`, `mobile/app/(onboarding)/complete.tsx`, `mobile/app/(onboarding)/terms.tsx` |
| 9.2c | P1 | depends on 9.2b — Remove `isComplete` field + `markComplete()` action from `onboardingStore`. Add `persist` `migrate` function (version bump 0→1) to drop the legacy MMKV key for existing users. | WF2 | `mobile/src/store/onboardingStore.ts` |
| 9.3 | P1 | Remove `selectedTrade`, `selectedTradeName`, `locationMode`, `homeBaseLat`, `homeBaseLng`, `supplierSelection` duplicates from `onboardingStore`. Add `persist` `migrate` function (version bump) to drop legacy MMKV keys. Update onboarding screens to write to `filterStore` after server PATCH success (no local mirror). | WF2 | `mobile/src/store/onboardingStore.ts`, `mobile/app/(onboarding)/profession.tsx`, `address.tsx`, `supplier.tsx` |
| 9.1 | P1 | depends on cold-boot perf benchmark — Eliminate `user-profile-cache` MMKV blob (use TanStack persister exclusively). Update §B5 to remove `clearUserProfileCache()` call. Add `profileStorage.clearAll()` migration to purge orphaned blob from existing installs. | WF3 | `mobile/src/hooks/useUserProfile.ts` |
| 9.5 | P1 | Promote `loopDetector.ts` → `mobile/src/lib/debug/stateDebug.ts` with `__DEV__` guard. Production builds compile to no-op. | WF3 | `mobile/src/lib/debug/` |
| 9.6 | P1 | Add AuthGate router branch tests (9 arms per §5.3) | WF2 | `mobile/__tests__/authGate.test.ts` (NEW) |
| 9.7 | P1 | depends on 9.8 — Idempotency tests for all bridges per §8.1 | WF2 | `mobile/__tests__/bridges.test.ts` (NEW) |
| 9.9 | P2 | Audit `paywallStore.show()` — verify caller exists OR delete the action | WF3 | `mobile/src/store/paywallStore.ts` |
| 9.12 | P2 | Add §8.5 store-enumeration test | WF3 | `mobile/__tests__/storeReset.coverage.test.ts` (NEW) |
| 9.13 | P2 | Add §8.6 schema-vs-matrix drift check | WF3 | `mobile/scripts/check-spec99-matrix.mjs` (NEW) |
| 9.14 | P2 | Flatten `notification_prefs` to 5 separate boolean fields on `userProfileStore` (eliminates the deep-equal hot path entirely) | WF2 | `mobile/src/store/userProfileStore.ts`, settings notification screens, server schema migration coordinated with web admin |
| 9.15 | P2 | Add §5.4 lint rule (vitest AST-parses AuthGate/AppLayout, asserts no Zustand selector subscription used inside router useEffect closures) | WF3 | `mobile/__tests__/routerHygiene.lint.test.ts` (NEW) |
| 9.16 | P2 | Codify or ban Bridge B6 (LeadFilterSheet/settings PATCH+local-set without B3 ceremony). Grep `getState().set*` in `LeadFilterSheet.tsx` and `settings.tsx`; either standardize as B6 in §4 or migrate to B3. | WF1 amendment | TBD |

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
- `mobile/src/lib/debug/loopDetector.ts` — modified in §9.5

### Cross-Spec Dependencies
- **This spec is a dependency of:** every future mobile WF that adds state, a store, or a router.
- **This spec depends on:** Spec 90 (engineering stack), Spec 93 (auth + AuthGate), Spec 94 (onboarding flow), Spec 95 (server profile = canonical), Spec 96 (subscription gate).
- **Authorized amendment process:** any change to §3 (Field Ownership Matrix), §4 (Bridge Patterns), or §5 (Routing Authority Rules) requires a WF1 amendment with adversarial review.
