# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile state architecture (Spec 99, whole)
Source: docs/specs/03-mobile/99_mobile_state_architecture.md:1-784
Generator: hand-written
Rules in the whole list: 10 (counted by pattern /^## \d+\./) · this is part 2 of 3

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

### 7.5 User attribution for Sentry crash reports

`Sentry.setUser({ id: firebaseUser.uid })` MUST be called in the auth listener's signed-in branch (immediately after `identifyUser(uid)` for symmetry with the PostHog distinctId mechanism). `Sentry.setUser(null)` MUST be called inside `clearLocalSessionState()` (the §B5 fan-out — NOT in `signOut()` directly, so the listener-driven forced-signout path also clears the attribution; same lesson as `paywallStore.reset()` from commits `381a0c9` + `f2f7147`).

**Rationale:** without user attribution, individual user reports of crashes cannot be correlated with Sentry events. Anonymous JS stack traces are unactionable for support workflows.

**PII boundary:** Firebase `uid` is opaque (server-generated, not personally identifying alone). The `Sentry.setUser` payload is restricted to `{ id }` only — `email`, `username`, `ip_address` are NEVER sent. Same precedent as PostHog distinctId per `mobile/src/lib/analytics.ts`.

**Enforcement:** `mobile/__tests__/useAuth.test.ts` asserts `Sentry.setUser` calls match the auth state machine — set on signed-in, null on signed-out, null on forced-signout. A regression that drops `Sentry.setUser` on the signout fan-out fails CI.

### 7.6 Product funnel events

A fixed enumeration of product flow events MUST fire at canonical sites so the funnel ratios (`% of lead-detail-views that save`, `% of paywall-shows that convert`) are measurable in PostHog without manual instrumentation diff against the codebase.

**Production events (low-frequency, high-signal, fire in both DEV and PROD):**

| Event | Site | Trigger | Payload |
|---|---|---|---|
| `lead_detail_viewed` | `mobile/app/(app)/[lead].tsx` | `useEffect` on `detail.lead_id` resolve (per-navigation, NOT per-render) | `{ lead_id, lead_type }` |
| `flight_job_detail_viewed` | `mobile/app/(app)/[flight-job].tsx` | `useEffect` on `item.permit_num` + `item.revision_num` resolve | `{ lead_id, lead_type: 'permit' }` |
| `lead_saved` / `lead_unsaved` | `mobile/src/hooks/useSaveLead.ts` `onMutate` | User tap (BEFORE server confirms — measures intent) | `{ lead_id, lead_type }` |
| `paywall_shown` | `mobile/src/components/paywall/PaywallScreen.tsx` | Mount `useEffect` (component only mounts when `subscription_status='expired'` AND `!paywallStore.dismissed`) | `{ subscription_status: 'expired' }` |
| `subscribe_button_clicked` | `PaywallScreen.tsx` `handlePrimary` | User tap on the primary CTA, BEFORE `openCheckout` resolves | none |

**DEV-only events (high-frequency; emit per `__DEV__` gate per §7.3 split — too noisy for production):**

| Event | Site | Reason for DEV-only |
|---|---|---|
| `paywall_dismissed` | `PaywallScreen.tsx` "Maybe later" press | A user can dismiss → reopen → dismiss repeatedly per session; per-tap PostHog events would flood. |
| `flight_board_viewed` | `mobile/app/(app)/flight-board.tsx` mount `useEffect` | Tab toggles (Feed ↔ FlightBoard) are unbounded per session. |

**Rejected (per §7.3 frequency-split rule — would flood production):**
- `lead_card_viewed` per FlashList `renderItem` (covered by `lead_detail_viewed` on tap).

**PII boundary** (whitelisted in `mobile/src/lib/analytics.ts` `ALLOWED_KEYS`):
- `lead_id` is `${permit_num}--${revision_num}` for permits or `COA-${application_number}` for CoA — public city-of-record data, NOT PII.
- `lead_type`, `subscription_status`, `tier` are categorical enums, NOT PII.
- `email`, `phone_number`, `displayName`, etc. are NEVER passed to `track()` and would be dropped by the whitelist if accidentally added.

**Enforcement (§8.7 — see §8 Test Mandates):** the `mobile/__tests__/spec99.mandates.lint.test.ts` test greps each canonical site for the matching `track()` call. A regression that removes a funnel event from its canonical site fails CI.

### 7.7 Auth funnel ratio invariants

For the `auth_method_attempted` / `auth_method_succeeded` / `auth_method_failed` ratio to be measurable in PostHog, every auth method MUST emit at least one outcome event (`succeeded` XOR `failed`) per attempt. Drift here corrupts the ratio silently — a regression that drops `auth_method_failed` on a specific error path makes the conversion rate look better than it is.

**Per-method contract (verified at `mobile/app/(auth)/sign-in.tsx`):**

| Method | Attempted site | Succeeded site | Failed site(s) |
|---|---|---|---|
| Apple | `handleAppleSignIn` (line ~258) | `handleAppleSignIn` success branch (line ~281) | `handleAppleSignIn` catch (line ~287; skip on `ERR_REQUEST_CANCELED`) |
| Google | `handleGoogleSignIn` (line ~296) | googleResponse useEffect success branch (line ~236) | googleResponse useEffect (3 sites: oauth_response_error line ~217, no_id_token line ~226, signInWithCredential catch line ~241) |
| Email | `handleEmailSignIn` (line ~312) | `handleEmailSignIn` success branch (line ~319) | `handleEmailSignIn` catch (line ~322) |
| Phone (SMS) | `handleSendCode` (line ~335) | (no synchronous succeeded — SMS-request success transitions to OTP entry) | `handleSendCode` catch (line ~348) |
| Phone (OTP) | (implicit: continuation of phone-attempted from SMS step) | `handleVerifyOtp` success branch (line ~372) | `handleVerifyOtp` catch (line ~377) |

**Phone exception explained:** the phone flow is 2-step (SMS request + OTP verify). `auth_method_attempted: phone` fires at the SMS step. The outcome can fire at:
1. SMS request error (`handleSendCode` catch) → `auth_method_failed`.
2. OTP verify success (`handleVerifyOtp` success) → `auth_method_succeeded`.
3. OTP verify failure (`handleVerifyOtp` catch) → `auth_method_failed`.

If the user abandons between SMS-success and OTP-entry, the attempted has no outcome — UX dropout, not a code bug. PostHog dashboards should account for this with a "phone-attempted with no outcome" funnel step.

**Apple `ERR_REQUEST_CANCELED` exception:** Apple sign-in's user-cancellation is handled BEFORE the `auth_method_failed` track call (sign-in.tsx around line 285). User-cancelled attempts deliberately produce no outcome event because cancellation is not a "failure" — the user actively chose not to authenticate. PostHog dashboards should treat Apple-cancelled the same as phone-abandoned.

**Enforcement (§8.8 — see §8 Test Mandates):** the `mobile/__tests__/spec99.mandates.lint.test.ts` test greps `sign-in.tsx` for each method's `auth_method_attempted/succeeded/failed` triple. A regression that removes any outcome event from sign-in.tsx fails CI.

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

