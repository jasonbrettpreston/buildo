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
| `isFetching` / Tabs flicker loop | 2026-05-02 (current — followup WF3 to apply §6.5 fix) | Render gate condition included an unstable signal (`isFetching` toggles on every refetch); `refetchOnReconnect` cascade on flaky NetInfo amplified | §6.5 (gate conditions must be stable; never gate on `isFetching`) |

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
| `_hasHydrated` | `authStore` | `onRehydrateStorage` callback | AuthGate (Branch 0 — wait-for-hydrate gate) | NOT persisted (process-local) |

### 3.3 Onboarding-Local State (no server mirror)

| Field | Owner Layer | Canonical Writer | Authorized Readers |
|-------|-------------|------------------|---------------------|
| `currentStep` | `onboardingStore` | each onboarding screen calls `setStep('next')` AFTER its PATCH succeeds (Spec 94 §10 Step 11) | AuthGate `getResumePath()` — **MUST be read via `useOnboardingStore.getState().currentStep` inside the effect closure (NEVER subscribed via `useStore((s) => s.currentStep)` per §6.4)** |
| `selectedTradeName` | `onboardingStore` | `setTrade()` in `profession.tsx` | `path.tsx` for display |
| `selectedPath` | `onboardingStore` | `setPath()` in `path.tsx` | `address.tsx`, `supplier.tsx` (skip-suppliers branch) |

### 3.4 Engagement / UI

| Field | Owner Layer | Writer | Readers |
|-------|-------------|--------|---------|
| `unreadFlightBoard` | `notificationStore` (in-memory) | `incrementUnread()` in `NotificationHandlers` foreground push handler; `clearUnread()` on Flight Board tab focus | AppLayout tab badge |
| `paywall.visible` / `paywall.dismissed` | `paywallStore` (in-memory — Spec 96 §9 explicit) | `show()` / `dismiss()` / `clear()` (also from `signOut()` per §4.5 and from `expired→active` transition in AppLayout) | AppLayout subscription gate, PaywallScreen, InlineBlurBanner |
| `tabBarScrollY` / `tabBarVisible` | `tabBarStore` (Layer 5 SharedValues) | feed/board/map screens via `onScroll` worklet | AppLayout `AnimatedTabBar` |

### 3.5 Deprecated mirrors (migration targets per §9)

| Mirror | Replacement | Migration WF |
|--------|-------------|--------------|
| `onboardingStore.isComplete` | Read `useUserProfile().data.onboarding_complete` directly | WF2 §9.2 |
| `onboardingStore.locationMode` / `homeBaseLat` / `homeBaseLng` / `supplierSelection` (the duplicates) | Use `filterStore` exclusively (already populated by B2 hydration) | WF2 §9.3 |
| `onboardingStore.selectedTrade` (duplicate of `filterStore.tradeSlug`) | Use `filterStore.tradeSlug` | WF2 §9.3 |
| `useUserProfile.readCachedProfile` MMKV blob (`user-profile-cache`) | Eliminated — TanStack persister covers fast-hydration | WF3 §9.1 |

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
- **`refetchOnReconnect` MUST be set to `false` for `['user-profile']` and other gate-relevant queries** (the 2026-05-02 incident #3 root cause). Other queries may opt in.
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
- All in-memory Zustand stores MUST be enumerated in this function. Adding a new store with user-scoped state requires adding a `.reset()` call here.
- `queryClient.clear()` is **NOT** called — TanStack queries are gated by `enabled: !!user` and naturally stop reading. **Open question** flagged for review: should it be called?

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

### 5.3 The 5 routing branches (AuthGate, Spec 93 §5 Step 6)

This subsection is the canonical AuthGate matrix. Any change to AuthGate's branches requires updating this section.

```
1. !user                                           → /(auth)/sign-in
2. AccountDeletedError                             → reactivation modal (no nav)
3. ApiError 404                                    → /(onboarding)/profession
4. profileError (other)                            → retry UI (no nav)
4.5. profile.account_preset='manufacturer' && !complete  → /(onboarding)/manufacturer-hold
5a. profile && inAuthGroup && !complete            → getResumePath(profile, currentStep)
5b. profile && inAuthGroup && complete             → /(app)/ + registerPushToken
5c. profile && inOnboardingGroup && complete       → /(app)/
5d. profile && !auth && !onboarding && !complete   → getResumePath(profile, currentStep)
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

### 6.6 Object-valued store fields MUST be deep-compared before set

```ts
// REQUIRED for nested object fields (notificationPrefs, homeBaseLocation)
hydrate: (profile) => set((prev) => {
  const nextPrefs = profile.notification_prefs;
  const prefsChanged = !deepEqual(prev.notificationPrefs, nextPrefs);
  return prefsChanged ? { notificationPrefs: nextPrefs } : prev;
});
```

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

Every `router.replace` / `router.push` from AuthGate or AppLayout MUST emit `track('route_decision', { authority, branch, from, to, reason })` in DEV builds. In production, only branch transitions that fire at low frequency (sign-out, account deletion) are tracked.

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

### 8.4 The loopDetector as CI regression guard

`stateDebug.dumpDiagnostics()` is permitted in CI integration tests as an assertion — `expect(maxRendersPerSecond).toBeLessThan(20)`. This catches loop regressions before merge.

---

## 9. Migration Plan (followup WFs)

The following items eliminate the duplication identified in the audit. Each is a separate WF — this Spec 99 only authorizes the work; it does not perform it.

| # | Item | Type | Files | Notes |
|---|------|------|-------|-------|
| 9.1 | Eliminate `user-profile-cache` MMKV blob | WF3 | `mobile/src/hooks/useUserProfile.ts` | Remove `readCachedProfile` / `writeCachedProfile` / `clearUserProfileCache` (use TanStack persister exclusively). Update B5 (sign-out reset) to remove `clearUserProfileCache()` call. |
| 9.2 | Move `isComplete` reads from `onboardingStore` to server profile | WF2 | `mobile/src/components/onboarding/IncompleteBanner.tsx`, then delete `markComplete()` bridge in `useUserProfile.ts`, then remove `isComplete` field from `onboardingStore` | IncompleteBanner reads `useUserProfile().data.onboarding_complete` directly |
| 9.3 | Remove duplicate fields from `onboardingStore` | WF2 | `mobile/src/store/onboardingStore.ts`, all onboarding screens that call `setLocation()`, `setSupplier()` | Use `filterStore` exclusively after the field's PATCH succeeds. `selectedTrade` → use `filterStore.tradeSlug`. `locationMode` / `homeBaseLat` / `homeBaseLng` / `supplierSelection` → write to filterStore via dedicated setter, then PATCH server. |
| 9.4 | Disable `refetchOnReconnect` for `['user-profile']` | WF3 | `mobile/src/hooks/useUserProfile.ts` | Add `refetchOnReconnect: false` per §B1. Also remove `isFetching` from AppLayout's gate condition per §6.5. |
| 9.5 | Replace `loopDetector` with permanent `stateDebug` hub | WF3 | `mobile/src/lib/debug/loopDetector.ts` → `stateDebug.ts` | Add `__DEV__` guard. Drop `useDepsTracker` mirroring effects on production paths (DEV-only). |
| 9.6 | Add 5-branch + manufacturer router branch tests | WF2 | `mobile/__tests__/authGate.test.ts` (NEW) | Per §8.2 |
| 9.7 | Idempotency tests for all bridges | WF2 | `mobile/__tests__/bridges.test.ts` (NEW) | Per §8.1 |

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
