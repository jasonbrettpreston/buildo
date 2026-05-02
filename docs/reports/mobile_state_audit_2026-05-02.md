# Mobile State Ownership Audit — 2026-05-02

**Purpose:** Single-source-of-truth inventory of every state field in the Buildo mobile app, the layer that owns it, who reads it, who writes it, and where it crosses layers ("bridges"). Feeds Spec 99 §3 (Field Ownership Matrix). Produced as part of WF1 after three render-loop incidents this session traced to undeclared dual-source-of-truth state.

**Scope:** Mobile app only (`mobile/`). Server-side ownership noted where mobile mirrors a server-authoritative field.

**Methodology:** Read every file under `mobile/src/store/`; greppped every consumer of `useFilterStore|useUserProfileStore|useOnboardingStore|useAuthStore|useNotificationStore|usePaywallStore` (34 files); inspected every `useEffect` + `router.replace` in `mobile/app/**/_layout.tsx` and onboarding/app screens.

---

## 1. Storage Layer Inventory

| Layer | Owner | Stores / Blobs | Persisted? | Notes |
|-------|-------|----------------|------------|-------|
| Server | Postgres | `user_profiles` table | ∞ | Spec 95 §6 — canonical for all account / profile state |
| Server cache | TanStack Query | `['user-profile']`, `['lead-feed', params]`, `['leads']`, `['flight-board']` | MMKV `react-query` blob, 24h `gcTime`, 5m `staleTime` | `mobile/src/lib/queryClient.ts` |
| Auth | `authStore` (Zustand) | `user{uid,email,displayName}`, `idToken`, `isLoading`, `_hasHydrated` | MMKV `auth-store` (uid only — partialize strips email/displayName as PII) | `mobile/src/store/authStore.ts` |
| Filter (feed-scoped) | `filterStore` (Zustand) | `radiusKm`, `tradeSlug`, `homeBaseLocation{lat,lng}`, `locationMode`, `defaultTab`, `supplierSelection` | MMKV `filter-store` | Hydrated from server profile via `useUserProfile.hydrate` |
| Profile (account-scoped) | `userProfileStore` (Zustand) | `fullName`, `companyName`, `phoneNumber`, `backupEmail`, `notificationPrefs` | MMKV `user-profile` | Hydrated from server profile via same bridge |
| **Profile fast-path** | `useUserProfile.readCachedProfile` (raw MMKV) | full profile JSON blob | MMKV `user-profile-cache` | **DUPLICATE of TanStack Query persisted cache — see §4 cleanup item** |
| Onboarding | `onboardingStore` (Zustand) | `currentStep`, `selectedTrade`, `selectedTradeName`, `selectedPath`, `locationMode`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`, `isComplete` | MMKV `onboarding-store` | Local-only; some fields mirror filterStore + server (see §3 overlap table) |
| Notification | `notificationStore` (Zustand) | `unreadFlightBoard` | (in-memory) | Cleared on Flight Board tab focus |
| Paywall | `paywallStore` (Zustand) | `visible`, `dismissed` | (in-memory — Spec 96 §9 explicit) | Reset on sign-out + on `expired→active` transition |
| Tab bar | `tabBarStore` (Reanimated `makeMutable`) | `tabBarScrollY`, `tabBarVisible` | N/A (UI-only) | Drives hide-on-scroll animation |

**Total:** 9 distinct state layers. **5 of them persist user-profile-derived fields** (TanStack Query cache, filterStore MMKV, userProfileStore MMKV, profile fast-path MMKV, onboardingStore MMKV).

---

## 2. Field Ownership Matrix

Notation:
- **Server field** = column in `user_profiles` (Spec 95)
- **Owner** = layer where the canonical write happens
- **Mirrors** = local copies that drift if not bridged correctly
- **Readers** = component / hook contracts (not file enumeration — count of distinct callsites)

### 2.1 Account / Identity Fields

| Field | Server | Owner | Mirrors | Canonical Writer | Readers | Bridge / Risk |
|-------|--------|-------|---------|------------------|---------|---------------|
| `user.uid` | (Firebase Auth) | `authStore.user.uid` | server `user_profiles.user_id` (FK) | `authStore.setAuth()` (only via `initFirebaseAuthListener`) | AuthGate, apiClient (Bearer token), useUserProfile (query enabled gate) | UID change → cache invalidation (added 2026-05-02 in `initFirebaseAuthListener`) |
| `user.email` | Firebase Auth | `authStore.user.email` | not persisted (PII partialize) | `authStore.setAuth()` | reactivation modal text, settings | None |
| `user.displayName` | Firebase Auth | `authStore.user.displayName` | not persisted (PII partialize) | `authStore.setAuth()` | settings | None |
| `idToken` | Firebase Auth | `authStore.idToken` | not persisted (short-lived) | `authStore.setAuth()` (init + 401-retry path in `apiClient`) | `apiClient.fetchWithAuth` Bearer header | 401 retry refreshes via `auth().currentUser.getIdToken(true)` |
| `_hasHydrated` | — | `authStore._hasHydrated` | (in-memory) | `onRehydrateStorage` callback | AuthGate (gate Branch 1) | None |

### 2.2 Profile Fields (Server-Authoritative — Spec 95 §6)

| Server Field | Local Mirror(s) | Canonical Writer | Bridge IN | Bridge OUT (write-back) | Drift Risk |
|--------------|-----------------|------------------|-----------|------------------------|------------|
| `trade_slug` | `filterStore.tradeSlug` AND `onboardingStore.selectedTrade` | server PATCH `/api/user-profile` | `useUserProfile.hydrate` → `filterStore.hydrate` | `onboardingStore.setTrade()` writes local; `profession.tsx` PATCHes server | **HIGH** — three names for same field; PATCH is immutable post-first-set (Spec 95 §6) |
| `default_tab` | `filterStore.defaultTab` | server PATCH | `useUserProfile.hydrate` → `filterStore.hydrate` | settings screen PATCHes server | LOW |
| `location_mode` | `filterStore.locationMode` AND `onboardingStore.locationMode` | server PATCH | `useUserProfile.hydrate` → `filterStore.hydrate` | onboarding `address.tsx` writes local + PATCHes; `setLocation` action | **MED** — two local mirrors; onboarding mirror is write-only, never read post-onboarding |
| `home_base_lat` / `home_base_lng` | `filterStore.homeBaseLocation{lat,lng}` AND `onboardingStore.homeBaseLat` + `homeBaseLng` (separate fields) | server PATCH | `useUserProfile.hydrate` → `filterStore.hydrate` (combines lat+lng into object) | onboarding `address.tsx` writes local + PATCHes | **MED** — different shape (object vs separate fields); same drift class as `location_mode` |
| `radius_km` | `filterStore.radiusKm` | server PATCH | `useUserProfile.hydrate` → `filterStore.hydrate` | `LeadFilterSheet` PATCHes | LOW |
| `supplier_selection` | `filterStore.supplierSelection` AND `onboardingStore.supplierSelection` | server PATCH | `useUserProfile.hydrate` → `filterStore.hydrate` | onboarding `supplier.tsx` writes local + PATCHes | **MED** — same pattern as `location_mode` |
| `full_name` / `company_name` / `phone_number` / `backup_email` | `userProfileStore.{fullName,companyName,phoneNumber,backupEmail}` | server PATCH | `useUserProfile.hydrate` → `userProfileStore.hydrate` | settings PATCHes | LOW |
| `notification_prefs` | `userProfileStore.notificationPrefs` | server PATCH | `useUserProfile.hydrate` → `userProfileStore.hydrate` | settings PATCHes | **MED — observed render-loop noise** (object recreated on every hydrate; new ref triggers Zustand notify even when content identical) |
| `onboarding_complete` | `onboardingStore.isComplete` | server PATCH (in `complete.tsx`) | `useUserProfile.hydrate` → `useOnboardingStore.markComplete()` (conditional) | `markComplete()` writes local; `complete.tsx` PATCHes server | **CRITICAL** — was the dual-router loop source (2026-05-02). AuthGate now reads server `profile.onboarding_complete` only; `IncompleteBanner` is the sole remaining `isComplete` reader |
| `tos_accepted_at` | (not mirrored) | server PATCH | — | terms.tsx PATCHes | None — read only from server |
| `account_preset` | (not mirrored) | server PATCH (admin-set) | — | — | Read by AuthGate (manufacturer routing branch added 2026-05-02) |
| `account_deleted_at` | (not mirrored) | server PATCH (DELETE intent) | — | — | Triggers AccountDeletedError in apiClient → AuthGate reactivation modal |
| `subscription_status` | (not mirrored) | server (Stripe webhook + admin) | — | — | AppLayout subscription gate; PaywallScreen |
| `lead_views_count` | (not mirrored) | server (incremented on lead view API call) | — | — | PaywallScreen renders |

### 2.3 Onboarding-Local Fields (No Server Mirror)

| Field | Owner | Canonical Writer | Readers | Notes |
|-------|-------|------------------|---------|-------|
| `currentStep` | `onboardingStore.currentStep` | each onboarding screen calls `setStep('next')` after PATCH success | AuthGate `getResumePath()` (lazy `getState()` read — Spec 94 §10 Step 11) | **AT-RISK** — lazy-read pattern only works because Spec 94 §10 specifies it. Subscription pattern `useStore((s) => s.currentStep)` would re-introduce 2026-05-02 incident #1 |
| `selectedTradeName` | `onboardingStore.selectedTradeName` | `setTrade()` in `profession.tsx` | `path.tsx` for display | Local only; not sent to server |
| `selectedPath` | `onboardingStore.selectedPath` | `setPath()` in `path.tsx` | `address.tsx`, `supplier.tsx` (skip-suppliers branch) | Local only; not on server schema |

### 2.4 Engagement / UI-Only Fields

| Field | Owner | Writer | Readers | Notes |
|-------|-------|--------|---------|-------|
| `unreadFlightBoard` | `notificationStore.unreadFlightBoard` | `incrementUnread()` in NotificationHandlers (foreground push) | AppLayout (badge); cleared by Flight Board tab focus | LOW risk |
| `paywall.visible` / `paywall.dismissed` | `paywallStore` | `show()` / `dismiss()` / `clear()` | AppLayout (gate Branch 5), PaywallScreen, InlineBlurBanner | In-memory only; reset on sign-out + on `expired→active` transition |
| `tabBarScrollY` / `tabBarVisible` | `tabBarStore` (Reanimated) | feed/board/map screens via `onScroll` | AppLayout `AnimatedTabBar` | UI-only; never gated on for routing |

---

## 3. Field Duplication Summary (the spaghetti)

**Six fields** are mirrored across **two or more** local stores in addition to the server:

| Field | Locations | Semantic |
|-------|-----------|----------|
| `trade_slug` (server) | `filterStore.tradeSlug` + `onboardingStore.selectedTrade` (different name) | Same value, two stores, two names |
| `location_mode` (server) | `filterStore.locationMode` + `onboardingStore.locationMode` | Same name, two stores |
| `home_base` (server lat/lng) | `filterStore.homeBaseLocation{lat,lng}` + `onboardingStore.homeBaseLat` + `homeBaseLng` | Same value, two stores, different shape (object vs separate fields) |
| `supplier_selection` (server) | `filterStore.supplierSelection` + `onboardingStore.supplierSelection` | Same value, two stores |
| `onboarding_complete` (server) | `onboardingStore.isComplete` | Same value, two layers |
| Profile JSON (TanStack cache) | `user-profile-cache` MMKV blob (`useUserProfile.readCachedProfile`) | Full duplicate of TanStack persister blob |

---

## 4. Bridge Inventory (the implicit cross-layer flows)

**Five bridges** currently exist. None are spec'd today.

| # | Direction | Code | Trigger | Risk |
|---|-----------|------|---------|------|
| B1 | Server → TanStack | `useQuery(['user-profile'], fetchProfile)` in `useUserProfile.ts:79` | mount + `staleTime` expiry + `refetchOnReconnect` | NetInfo flap → continuous refetch (current emulator-flicker hypothesis) |
| B2 | TanStack → Zustand (filter + userProfile + onboarding) | `useUserProfile.ts:91-105` data effect | every change of `query.data` | Object recreation in `notificationPrefs` triggers store notify even on identical content |
| B3 | TanStack → Zustand (`isComplete` mirror) | `useUserProfile.ts:101-103` `markComplete()` call | `query.data.onboarding_complete && !isComplete` | The dual-router loop source — now safe only because AuthGate no longer reads `isComplete` |
| B4 | MMKV fast-path → Zustand | `useUserProfile.ts:69-77` mount-only effect | every `useUserProfile()` instance mount | Duplicate of B2; redundant since TanStack persister already hydrates instantly |
| B5 | Auth listener → cache invalidation | `authStore.ts:initFirebaseAuthListener` UID-change branch | Firebase UID change OR cold-boot first-fire | New (2026-05-02). Race-guarded via `expectedUid` capture. |

**Sign-out fan-out** (a sixth implicit bridge):
- `authStore.signOut()` resets: `paywallStore`, `filterStore`, `notificationStore`, `onboardingStore`, `userProfileStore` + clears `user-profile-cache` MMKV blob + Firebase signOut.
- TanStack Query cache is NOT cleared — relies on `enabled: !!user` to stop reads. **Open question:** should `queryClient.clear()` also fire?

---

## 5. Routing Authority Inventory

**Two router boundaries** exist; one was previously triple-occupied (the 2026-05-02 incident).

| Boundary | Authority | Source of Truth | File | Spec Reference |
|----------|-----------|-----------------|------|----------------|
| (auth) ↔ (onboarding) ↔ (app) | **AuthGate** (sole) | Server `profile.onboarding_complete` + `profile.account_preset` (manufacturer branch) + segments + `_hasHydrated` + `user` + `profileError` | `mobile/app/_layout.tsx:68` | Spec 93 §5 Step 6 |
| (app) trial vs expired vs paywall | **AppLayout** (sole) | Server `profile.subscription_status` + `paywallStore.dismissed` | `mobile/app/(app)/_layout.tsx:111` | Spec 96 §10 Step 2 |

**Removed routers** (the loop sources):
- `(onboarding)/_layout.tsx` — had its own `if (isComplete) router.replace('/(app)/')` reading `onboardingStore.isComplete`. Stripped 2026-05-02 (commit pending).

**Lazy reads (the safe pattern):**
- AuthGate reads `useOnboardingStore.getState().currentStep` inside its routing effect closure — NOT via selector subscription. Subscribing would re-run the effect on every `setStep` call, re-introducing incident #1.

---

## 6. Three Documented Incidents — Audit-Row Mapping

### Incident 1 — currentStep subscription loop (commit `3727ceb`, fixed in `6c5d085`)
- **Audit row:** §2.3 `currentStep` "AT-RISK" cell.
- **Root pattern:** routing effect subscribed to `useOnboardingStore((s) => s.currentStep)`; every `setStep` re-fired the effect; effect called `router.replace`; `markComplete()` wrote `currentStep=null`; effect re-fired on null; loop.
- **Fix:** lazy `getState()` read in effect closure.
- **Spec rule that would have prevented it:** §6.4 (router useEffect deps lint).

### Incident 2 — Dual router loop (fixed today via WF3)
- **Audit row:** §2.2 `onboarding_complete` "CRITICAL" cell + §5 "removed routers".
- **Root pattern:** AuthGate read server `profile.onboarding_complete`; `OnboardingLayout` read local `onboardingStore.isComplete`. Stale dev-user profile + `markComplete()`-set local store → permanent disagreement → ping-pong.
- **Fix:** stripped OnboardingLayout's effect; AuthGate is sole authority.
- **Spec rule:** §5.1 (one router per gate boundary) + §5.2 (read canonical source).

### Incident 3 — isFetching / Tabs flicker loop (CURRENT — not yet fixed)
- **Audit row:** §4 B1 row "NetInfo flap → continuous refetch" + §2.2 `notification_prefs` "MED" cell.
- **Root pattern:** `useUserProfile.isFetching` toggles → AppLayout's gate condition `isLoading || isFetching || profile == null || subscription_status == null` flips between true/false → AppLayout re-renders, alternating `<SubscriptionLoadingGuard/>` and `<Tabs>` → child screen mount/unmount churn → diagnostic shows AppLayout count = 2× SubscriptionLoadingGuard count.
- **Suspected cause:** `refetchOnReconnect: true` (TanStack default) + emulator NetInfo flap, OR `focusManager.setEventListener` cascading on AppState ticks.
- **Spec rule that would have prevented it:** §6.1 (selector returns must be stable; gating on `isFetching` is unstable by design).

---

## 7. Open Questions for Spec 99

1. **Should `queryClient.clear()` fire on sign-out** or is the current `enabled: !!user` gate sufficient?
2. **Should the `user-profile-cache` MMKV blob be eliminated** in favor of TanStack persister exclusively?
3. **Should `isComplete` / `currentStep` move to derived-from-server** (no local mirror)? `IncompleteBanner` is the only remaining `isComplete` reader; could read server profile directly.
4. **Should onboarding-local mirrors** (`onboardingStore.locationMode`, `homeBaseLat/Lng`, `supplierSelection`) be eliminated in favor of writing directly to `filterStore` after server PATCH success?
5. **Should `notificationPrefs` move to a stable representation** (e.g., 5 separate boolean fields instead of nested object) to eliminate Zustand-notify-on-identical-content?

---

## 8. Audit Conclusion

The mobile app has **9 storage layers**, **5 of them persisting overlapping profile data**, **6 fields duplicated across 2-3 stores**, and **5 implicit bridges** with no formal contract. Three render-loop incidents in 2026-05-02 alone all map to this audit's HIGH/CRITICAL cells. Spec 99 codifies the rules; the §9 migration plan eliminates the duplication.
