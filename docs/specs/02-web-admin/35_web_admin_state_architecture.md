# Spec 35 — Web Admin State Architecture & Ownership Protocol

**Status:** ACTIVE
**Cross-references:** Spec 33 (Web Admin Engineering Protocol), Spec 34 (Web Admin Testing Protocol), Spec 30 (App Health Dashboard), Spec 86 (Control Panel — establishes the admin-draft Zustand precedent)

**Numbering note:** Spec 35 in `docs/specs/02-web-admin/` parallels Spec 99 in `docs/specs/03-mobile/` (mobile state architecture). The 99 slot is taken by mobile; web-admin uses 35 to disambiguate.

## 1. Goal & Anti-Patterns This Prevents

**Goal:** define the canonical state-flow architecture for the web-admin app so contributors can ship admin features without reinventing where data lives, how it flows, or how draft state interacts with server-authoritative state.

**Anti-patterns this prevents:**
1. **Server-state mutation without invalidation.** Admin edits `logic_variables` via `setQueryData` but forgets `invalidateQueries`; the next page-load shows stale data.
2. **Cross-store leakage.** Admin draft state from one feature contaminates a sibling feature's store because they share a singleton.
3. **Render storms from object-valued selectors.** Spec 86's existing Zustand store had to be hardened against this (mirror of mobile Spec 99 §6).
4. **Inconsistent auth-state across the admin shell.** Admin claims hydrate at different cadences in different pages; a slow Firebase resolve silently causes 401s on mid-page mutations.

**Authority precedence:** Spec 35 governs admin-side state management. When Spec 86 (Control Panel) or any future feature spec describes a Zustand store or TanStack Query interaction, the patterns here are normative; the feature spec must conform.

## 2. Layer Hierarchy

State flows top-down. A lower layer NEVER initiates a write to an upper layer except via the bridges in §4.

```
┌───────────────────────────────────────────────────────────────┐
│  Layer 1 — SERVER (Postgres + Stripe + Sentry/PostHog APIs)   │  ← canonical for ALL admin-visible data
└───────────────────────────────────────────────────────────────┘
                         ↓ (Bridge B1: useQuery / RSC fetch)
┌───────────────────────────────────────────────────────────────┐
│  Layer 2 — TanStack Query cache (in-memory; per-admin-tab)    │  ← canonical for CACHED server state
└───────────────────────────────────────────────────────────────┘
                         ↓ (Bridge B2: hydrate-on-edit-start)
┌───────────────────────────────────────────────────────────────┐
│  Layer 3 — Zustand admin draft stores (typed, feature-scoped) │  ← canonical for UNCOMMITTED admin edits
└───────────────────────────────────────────────────────────────┘
                         ↓ (Bridge B3: commit + invalidate)
┌───────────────────────────────────────────────────────────────┐
│  Layer 4 — `localStorage` (UI preferences only)               │  ← persistence for non-sensitive UX state
│  Allowed: theme, table column visibility, last-active tab     │
│  BANNED: session tokens, API keys, user PII, payment data,    │
│           draft admin edits (those live in Layer 3 in-memory) │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Layer 5 — React component state (`useState`/`useReducer`)    │  ← orthogonal: ephemeral UI within a single component
│           Used for: dialog open/close, hover states, focus    │
│           NEVER used for: server data, draft edits, auth      │
└───────────────────────────────────────────────────────────────┘
```

### 2.1 Hard rules

- **Layer 4 (`localStorage`) is NEVER read directly outside the dedicated `src/lib/admin/preferences.ts` wrapper.** Direct `localStorage.getItem` in a component is BANNED. The wrapper enforces the allowlist.
- **Layer 4 is UNENCRYPTED.** Anything sensitive — admin session tokens, API keys, user PII, payment data — MUST NOT touch `localStorage`. The Layer 4 allowlist is enumerated in §3 and is normative.
- **Layer 3 (Zustand) NEVER mirrors a Layer 1 (server) field unless the Field Ownership Matrix §3 explicitly authorizes the mirror, with a declared bridge (§4) as the canonical writer.** Server-authoritative data passes through Layer 2 (TanStack Query) and is COPIED into Layer 3 only when an admin starts editing (Bridge B2).
- **Layer 5 (React component state) NEVER drives data persistence or auth.** A `useState` holding `currentUser` is BANNED — auth state lives in Layer 2 via TanStack Query.

## 3. Field Ownership Matrix

This table is **normative**. Adding a field to an admin store requires adding a row here. Modifying ownership requires a Spec 35 amendment.

### 3.1 Server-Authoritative Admin Reads (Layer 1 → Layer 2 only)

| Field / dataset | Source | Layer 2 query key | Stale time | Bridge writer |
|---|---|---|---|---|
| `market_metrics` | `GET /api/admin/market-metrics` | `['admin', 'market-metrics', period]` | 60s | B1 |
| `data_quality_snapshot` | `GET /api/admin/stats` | `['admin', 'data-quality']` | 5s (poll) | B1 |
| `pipeline_schedules` | `GET /api/admin/pipelines/schedules` | `['admin', 'pipeline-schedules']` | 60s | B1 |
| `logic_variables` | `GET /api/admin/control-panel/configs` | `['admin', 'control-panel', 'configs']` | 60s | B1 |
| `app_health` (Spec 30) | `GET /api/admin/app-health` | `['admin', 'app-health']` | 60s (poll) | B1 |
| `lead_feed_health` | `GET /api/admin/leads/health` | `['admin', 'lead-feed-health']` | 10s (poll) | B1 |
| `test_feed_results` | `GET /api/admin/leads/test-feed?<params>` | `['admin', 'test-feed', params]` | 0 (on-demand) | B1 |
| `flight_center_board` | `GET /api/leads/flight-board` | `['admin', 'flight-board']` (admin-uid scoped) | 30s | B1 |
| `lead_detail` (Spec 76 §3.5) | `GET /api/leads/detail/:id` | `['admin', 'lead-detail', id]` | 60s | B1 |
| `flight_job_detail` (Spec 76 §3.6) | `GET /api/leads/flight-board/detail/:id` | `['admin', 'flight-job-detail', id]` | 60s | B1 |

### 3.2 Admin Draft State (Layer 3 — Zustand stores)

| Store | Owned fields | Writer | Reader | Bridge to server |
|---|---|---|---|---|
| `useControlPanelStore` (Spec 86) | `draft.logic_variables`, `draft.trade_matrix`, `draft.scope_intensity_matrix`, `draft.pendingDeltas`, `isDraftDirty` | Component edit handlers (B2) | ControlPanelShell components | B3 (commit) → B1 invalidation |
| `useFlightCenterStore` (Spec 76 §3.4 — PENDING implementation) | `selectedLeadId`, `inspectorOpen`, `inspectorMode: 'lead' \| 'flight-job'` | FlightCenterTool component | FlightCenterTool + InspectorDrawer | None (UI state only — does NOT mirror server data) |
| `useAdminCommandStore` (Spec 33 §14 — PENDING implementation) | `commandPaletteOpen`, `recentCommands` | cmd+k handler | CommandPalette | None (UI state only) |

**Hard rules for admin draft stores:**
- Each store is feature-scoped (`useControlPanelStore`, `useFlightCenterStore`, etc.). A "kitchen sink" admin store is BANNED per Spec 33 §7.
- Draft fields use `null` to indicate "not yet edited" (read from Layer 2). Once edited, the draft holds the user's pending value.
- Every store has a `commitDraft(serverData)` action that resets the draft to match server-fetched state (called after successful B3 mutation).
- Every store has a `discardDraft()` action that clears all pending edits.
- **Selectors return primitives.** Object-valued selectors require `useShallow` from Zustand or a memoized `useMemo` wrapper. Mirror of mobile Spec 99 §6.1 atomic-selectors mandate.

### 3.3 UI Preferences (Layer 4 — localStorage allowlist)

| Key | Type | Purpose |
|---|---|---|
| `admin.theme` | `'light' \| 'dark'` (DARK NOT YET IMPLEMENTED — see Spec 33 §2) | Future-proof key reservation |
| `admin.dataQuality.columnVisibility` | `Record<string, boolean>` | Per-table column show/hide preferences |
| `admin.lastActiveTab` | `string` | Restore most-recent admin tab on cold-boot |
| `admin.controlPanel.expandedSections` | `string[]` | Spec 86 — which config groups are expanded |

**Anything not in this table is BANNED from `localStorage`.** Adding a new key requires a Spec 35 amendment + entry here.

## 4. The Five Bridge Patterns

These are the **only** allowed cross-layer flows. A sixth pattern requires a Spec 35 amendment.

The web-admin has 5 bridges, parallel to mobile's 6. The omitted bridge is mobile-specific Spec 99 §B6 (mid-session 401 token refresh) — web admin uses Firebase session cookies which auto-refresh server-side at the `next-auth` / Firebase Admin SDK layer; no client-side bridge needed.

### B1 — Server → TanStack Query

**Pattern:**
```ts
const query = useQuery({
  queryKey: ['admin', 'market-metrics', period],
  queryFn: () => fetchAdminMarketMetrics(period),
  staleTime: 60_000,
  enabled: !!adminClaim,
});
```

**Rules:**
- Every server fetch MUST go through TanStack Query when called from a client component — never raw `fetch()` in render. (Server components access the DB directly per Spec 33 §3 — that's a different layer.)
- `queryKey` MUST be a stable, parameterized array. Object literals with closure refs are BANNED (cache fragmentation). Use the `['admin', '<feature>', ...params]` namespace pattern.
- `enabled: !!adminClaim` — every admin query gates on the admin auth claim being present. Prevents the admin-shell from firing reads before auth resolves.
- Validation: every response MUST be parsed through a Zod schema before TanStack stores it (Spec 33 §13 Zod Boundary).

### B2 — TanStack → Zustand (server-to-draft hydration)

**Pattern:** when the admin starts editing (e.g., clicking a `logic_variable` value):

```ts
useEffect(() => {
  // First-edit hydration: copy server value into draft store.
  if (!draftStore.isDraftDirty && serverData) {
    draftStore.commitDraft(serverData);
  }
}, [serverData, draftStore.isDraftDirty]);
```

**Rules:**
- The draft store NEVER subscribes directly to the TanStack cache. Hydration is explicit via `commitDraft(serverData)`.
- Hydration is idempotent — calling `commitDraft` with identical data is a no-op (Spec 86 precedent).
- On query refetch (e.g., poll fires), the draft is NOT clobbered if `isDraftDirty === true`. The admin's pending edits win until they `commit` or `discard`.

### B3 — Zustand → Server (mutation with optimistic update + rollback)

**Pattern:** Spec 86 commit-config is the canonical example.

```ts
const mutation = useMutation({
  mutationFn: (delta: ConfigDelta) => fetchAdminCommitConfig(delta),
  onMutate: async (delta) => {
    // Optimistic mirror in TanStack cache:
    const previous = queryClient.getQueryData(['admin', 'control-panel', 'configs']);
    queryClient.setQueryData(['admin', 'control-panel', 'configs'], applyDelta(previous, delta));
    return { previous };
  },
  onError: (_err, _delta, context) => {
    // Rollback the optimistic update.
    if (context?.previous) {
      queryClient.setQueryData(['admin', 'control-panel', 'configs'], context.previous);
    }
    // Rollback the draft store optimistic state (admin sees their edit reverted with an error toast).
    draftStore.discardDraft();
  },
  onSettled: () => {
    // Reconcile via server fetch.
    void queryClient.invalidateQueries({ queryKey: ['admin', 'control-panel'] });
  },
});
```

**Rules:**
- Every B3 mutation MUST emit:
  1. A `Sentry.addBreadcrumb({ category: 'admin_action', message: <action>, data: { target } })` (Spec 33 §11 mandate).
  2. A `track('admin_action_performed', { action, target })` PostHog event (Spec 33 §11 mandate).
  3. A toast on success/error via `sonner` (Spec 33 §14).
- Optimistic updates MUST be paired with rollback in `onError`.
- `onSettled` MUST invalidate the relevant TanStack query keys to reconcile. Spec 99 §B3 mobile equivalent.

### B4 — Auth Listener → Cache Invalidation

**Pattern:** when the admin signs in / signs out / claims change:

```ts
// In src/app/admin/layout.tsx (server component):
const session = await getAdminSession();
if (!session?.isAdmin) redirect('/sign-in?next=/admin');

// In a client provider mounted in the admin layout:
useEffect(() => {
  if (adminUid !== lastKnownAdminUid.current) {
    queryClient.clear();   // purge previous admin's cached data
    Sentry.setUser({ id: adminUid });
    lastKnownAdminUid.current = adminUid;
  }
}, [adminUid]);
```

**Rules:**
- Admin uid CHANGE (admin A signs out, admin B signs in on the same device) MUST trigger `queryClient.clear()`. Same PIPEDA reasoning as mobile §B5.
- Admin uid REFRESH (same admin, claim refresh) MUST NOT clear the cache — that's a wasteful round-trip.
- `Sentry.setUser({ id })` set/clear pair mirrors mobile Spec 99 §7.5 + Spec 33 §11.

### B5 — Logout → Local Reset (the global fan-out)

**Pattern:**
```ts
function clearAdminSession(): void {
  queryClient.clear();                               // Layer 2 purge
  useControlPanelStore.getState().discardDraft();    // Layer 3 fan-out
  useFlightCenterStore.getState().reset();           // Layer 3 fan-out (PENDING implementation)
  useAdminCommandStore.getState().reset();           // Layer 3 fan-out (PENDING implementation)
  // Layer 4 (localStorage) UI prefs are PRESERVED — they're admin-account-agnostic.
  Sentry.setUser(null);
  resetPostHogIdentity();
}
```

**Rules:**
- All Zustand admin draft stores MUST be enumerated in `clearAdminSession()`. Adding a new store with admin-scoped state requires adding a `.discardDraft()` (or `.reset()`) call there. **Enforcement: §8.5 mandates-lint test.**
- `queryClient.clear()` MUST fire as part of `clearAdminSession()`. Same PIPEDA reasoning as mobile §B5.
- Layer 4 `localStorage` UI prefs (theme, column visibility) are PRESERVED through logout — they're admin-account-agnostic. A new admin signing in on the same browser inherits the previous admin's table-column preferences (acceptable; no PII).

## 5. Routing Authority Rules

### 5.1 One auth gate per route boundary

Every `/api/admin/**` route handler MUST call `verifyAdminAuth(request)` as the FIRST line. Per Spec 33 §8. Page-level redirect in `src/app/admin/layout.tsx` is convenience UX; the security boundary is the per-route guard.

### 5.2 Server components don't bypass auth

A server component fetching `pool.query` directly is still subject to `verifyAdminAuth`. Use the shared `getAdminContext()` helper at `src/lib/admin/context.ts` (TBD when first server-component admin page lands) — it wraps `verifyAdminAuth` + returns the admin claim or redirects.

### 5.3 Route-level cache invalidation MUST log

Every `queryClient.invalidateQueries({ queryKey: [...] })` from admin code MUST be paired with a Sentry breadcrumb via `logAdminQueryInvalidate(key)` helper (TBD; mirrors mobile `logQueryInvalidate` from Spec 99 §7.2). Closes the silent-cache-mutation observability gap.

## 6. Render-Stability Rules (selector hygiene)

### 6.1 Atomic selectors MANDATE

Mirror of mobile Spec 99 §6.1.

```ts
// ✅ ALLOWED — selects a primitive
const isDirty = useControlPanelStore((s) => s.isDraftDirty);

// ❌ BANNED — returns object reference; causes re-render on every set
const draft = useControlPanelStore((s) => s.draft);
```

For object selectors, use `useShallow` from `zustand/shallow`:

```ts
const { isDraftDirty, pendingDeltas } = useControlPanelStore(
  useShallow((s) => ({ isDraftDirty: s.isDraftDirty, pendingDeltas: s.pendingDeltas }))
);
```

### 6.2 Hydrate functions MUST be idempotent

Mirror of mobile Spec 99 §6.2. `commitDraft(serverData)` MUST short-circuit when the draft already matches the server (deep-equal pre-set).

### 6.3 Gate conditions MUST be stable signals

`enabled: query.isFetching` is BANNED. `query.isFetching` is `true` even on background refetches; gating on it causes flicker and incorrect render branches. Use `query.isLoading` (only `true` on initial fetch) or derived stable booleans. Mirror of mobile Spec 99 §6.5.

### 6.4 Object-valued store fields MUST be deep-compared before set

Mirror of mobile Spec 99 §6.6. `setDraft({...newDraft})` MUST short-circuit when the new object deep-equals the current.

## 7. Observability Mandates

### 7.1 Admin action telemetry

Every state-mutating admin action (B3 mutation) MUST emit:
1. `Sentry.addBreadcrumb({ category: 'admin_action', message: <action>, data: { target } })` — synchronous; fires before the network call.
2. `track('admin_action_performed', { action, target })` — PostHog event; the `action` and `target` keys are whitelisted in admin analytics (parallel to mobile `analytics.ts` `ALLOWED_KEYS`).

### 7.2 Cache invalidation telemetry

Every `queryClient.invalidateQueries({ queryKey: [...] })` outside a `onSettled` of a B3 mutation MUST emit `logAdminQueryInvalidate(key)` (TBD helper). Mutation-`onSettled` invalidations are exempt because the B3 mutation already produced an `admin_action_performed` event for the user-initiated cause.

### 7.3 Admin session telemetry

`admin_session_started` fires on layout mount when admin claim resolves. `admin_session_ended` fires on logout. Both are PostHog events with `{ admin_uid_hashed }` only — never the raw uid in product analytics (uid sentinel is fine for Sentry, but PostHog is broader-access).

### 7.4 App Health Dashboard cross-reference

Spec 30 (`docs/specs/02-web-admin/30_app_health_dashboard.md`) is the consumer surface for the events emitted under §7.1–§7.3. This spec mandates the EMISSION; Spec 30 mandates the CONSUMPTION.

## 8. Test Mandates

### 8.1 Idempotency tests for every bridge

- **B1** (server → TanStack): `*.infra.test.ts` per route handler asserts response Zod parse + `staleTime` honored.
- **B2** (TanStack → Zustand draft): `*.logic.test.ts` per draft store asserts `commitDraft(serverData)` is idempotent (calling twice with identical data does NOT change reference).
- **B3** (Zustand → Server with rollback): `*.logic.test.ts` per mutation asserts optimistic update + rollback path.
- **B4** (auth listener → cache invalidation): `*.logic.test.ts` asserts `queryClient.clear()` fires on uid change but NOT on uid refresh.
- **B5** (logout fan-out): `*.logic.test.ts` enumerates every Zustand admin store and asserts each has its `.discardDraft()` / `.reset()` called by `clearAdminSession()`.

### 8.2 Admin route auth-gate tests

Every `src/app/api/admin/**/route.ts` handler MUST have a paired `*.infra.test.ts` that asserts:
- 401 on missing session/header.
- 403 on authenticated-but-not-admin.
- 200 on valid admin claim.

### 8.3 Zod boundary tests

Every admin endpoint MUST have a Zod-parse test:
- Request: invalid params → 400 with field-level error.
- Response: server returns malformed payload → schema parse fails (asserted via mocked `pool.query` returning bad shape).

### 8.4 Action telemetry tests

Every B3 mutation MUST have a `*.logic.test.ts` asserting:
- `Sentry.addBreadcrumb({ category: 'admin_action', ... })` fires.
- `track('admin_action_performed', ...)` fires.
- Both fire BEFORE the network call (intent capture) per Spec 33 §11.

### 8.5 Store-enumeration test

`src/tests/admin-store-reset.coverage.test.ts` (TBD) walks `src/components/admin/` and `src/app/admin/` for `create<*Store>(` regex; asserts each has a corresponding `.discardDraft()` or `.reset()` call in `clearAdminSession()`. Mirror of mobile Spec 99 §8.5 (`storeReset.coverage.test.ts`).

### 8.6 Render-stability tests

Spec 35 §6.3 mandates `isFetching` NOT in render gates. A mandates-lint test (TBD: `src/tests/spec35-render-stability.lint.test.ts`) greps `src/app/admin/**` and `src/components/admin/**` for `isFetching` inside JSX render gates and fails if found.

## 9. Out of Scope

- Implementation of any §8.x mandates-lint test (TBD when first admin code lands that needs the guard).
- Server-component-side state management primitives (RSC state is ephemeral per request; no client-state architecture needed there).
- Theme switching (Spec 33 §2 defers; `dark:` Tailwind variants BANNED until amended).
- Cross-tab synchronization (admin tabs are independent; no `BroadcastChannel` mandate at this stage).

---

**Cross-spec dependencies:**
- **Authoritative for:** state architecture across `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`.
- **Relies on:** Spec 33 (engineering protocol), Spec 34 (testing protocol).
- **Consumed by:** Spec 21, 26, 30, 76, 86 (every web-admin feature spec must conform to this state architecture).
- **Mobile parallel:** `docs/specs/03-mobile/99_mobile_state_architecture.md`. Most rules transfer 1:1 (atomic selectors, B5 fan-out, gate-stability, action telemetry); the omission is mobile §B6 (mid-session 401 refresh) — web admin's session-cookie auth handles that server-side.
