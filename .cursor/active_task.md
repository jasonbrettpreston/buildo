# Active Task: Phase 6 step 2 — Debounced map-pan refetch + click-to-deselect
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Frontend**
**Rollback Anchor:** `d9f2789` (HEAD after Phase 6 step 1 commit)

## Context
* **Goal:** Add two deferred features from Phase 6 step 1: (1) debounced map-pan refetch — when the user pans/zooms the desktop map, after a 500ms debounce the new map center updates `snappedLocation` in Zustand, which naturally triggers a TanStack Query refetch via the existing queryKey mechanism in `useLeadFeed`; (2) click-to-deselect — clicking the map background (not a marker) clears `selectedLeadId` so the hover preview resumes. Both are desktop-only (`lg:`) behaviors; mobile is unchanged.
* **Target Spec:** `docs/specs/product/future/75_lead_feed_implementation_guide.md` §4.10 (LeadMapPane — `onMapPan` debounced callback, active-state clearing), `docs/specs/00_engineering_standards.md` §12 (Frontend Foundation Tooling)
* **Key Files:**
  - MODIFY: `src/features/leads/components/LeadMapPane.tsx` — add `onCameraChanged` handler (debounced), `onClick` handler (deselect)
  - MODIFY: `src/lib/observability/capture.ts` — add `lead_feed.map_panned` event name
  - MODIFY: `src/tests/LeadMapPane.ui.test.tsx` — add tests for pan-refetch and click-to-deselect
  - NEW: `src/tests/map-pan-debounce.logic.test.ts` — isolated test for the debounce + snap-advance logic

## Technical Implementation

### Architecture decisions for step 2
1. **Use `onCameraChanged` from `@vis.gl/react-google-maps` v1.8.3.** The callback fires on every camera change (pan, zoom, tilt) with a `MapCameraChangedEvent` containing `detail.center`, `detail.bounds`, `detail.zoom`. We debounce at 500ms per spec §4.10 to avoid cache thrashing.
2. **Update `snappedLocation` in Zustand, NOT a separate "mapCenter" field.** The existing `useLeadFeed` hook already builds its queryKey from `snappedLocation`. Updating the snap is the minimal change that naturally refetches the feed. This means: map pan → debounce 500ms → `setSnappedLocation({ lat, lng })` → queryKey changes → TanStack refetches.
3. **Distinguish user-initiated pans from programmatic moves.** The `onCameraChanged` fires when the map re-centers from a prop change too (e.g., initial load). Gate the debounced handler on a `userInteractedRef` flag that flips `true` on the first `dragstart` or `mousedown`/`touchstart` on the map. Alternatively, use the simpler approach: only update the snap when the new center is >500m from the current snap (the same threshold `useLeadFeed` already uses). This way, the initial center prop matching the snap is a no-op, and only real user pans that move >500m trigger a refetch. This is simpler and reuses existing logic.
4. **Click-to-deselect** — `Map`'s `onClick` fires when clicking the map background (NOT when clicking a marker — marker clicks are handled by `AdvancedMarker`'s own `onClick` which stops propagation). Set `selectedLeadId` to `null` and fire `captureEvent('lead_feed.map_deselected')`.
5. **Telemetry** — `lead_feed.map_panned` fires once per debounced pan that actually triggers a refetch (i.e., center moved >500m). Payload: `{ delta_m }` (distance from old snap to new snap). This is naturally deduplicated by the debounce — no additional ref-based dedupe needed.
6. **No new dependencies.** The debounce uses a `useRef` + `setTimeout` pattern (same as existing hover telemetry dedupe). No need for `useDebouncedCallback` from an external library — the handler is simple enough. Alternatively, `useCallback` + `setTimeout`/`clearTimeout` in a ref is the standard React pattern.

### Component changes — `LeadMapPane.tsx`

```tsx
// New: debounced camera-changed handler
const panTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const handleCameraChanged = useCallback(
  (event: MapCameraChangedEvent) => {
    if (panTimerRef.current) clearTimeout(panTimerRef.current);
    panTimerRef.current = setTimeout(() => {
      const { lat, lng } = event.detail.center;
      // Only update snap if moved >500m from current snap
      const currentSnap = useLeadFeedState.getState().snappedLocation;
      if (!currentSnap) return;
      const delta = haversineMeters(currentSnap.lat, currentSnap.lng, lat, lng);
      if (delta > FORCED_REFETCH_THRESHOLD_M) {
        setSnappedLocation({ lat, lng });
        captureEvent('lead_feed.map_panned', { delta_m: Math.round(delta) });
      }
    }, 500);
  },
  [setSnappedLocation],
);

// New: click-to-deselect handler
const handleMapClick = useCallback(() => {
  if (selectedLeadId !== null) {
    setSelectedLeadId(null);
    captureEvent('lead_feed.map_deselected', {});
  }
}, [selectedLeadId, setSelectedLeadId]);
```

Wire into `<GoogleMap>`:
```tsx
<GoogleMap
  ...existing props...
  onCameraChanged={handleCameraChanged}
  onClick={handleMapClick}
>
```

### New imports needed in `LeadMapPane.tsx`
- `useCallback` from React (already importing `useEffect, useMemo, useRef`)
- `haversineMeters` from `@/features/leads/lib/haversine`
- Need to read `setSnappedLocation` from Zustand
- Need to import `FORCED_REFETCH_THRESHOLD_M` — currently a private constant in `useLeadFeed.ts`. Either export it or import from `_contracts.json`. Check if it's in contracts.

### Cleanup on unmount
Add a `useEffect` cleanup to clear the debounce timer on unmount:
```tsx
useEffect(() => {
  return () => {
    if (panTimerRef.current) clearTimeout(panTimerRef.current);
  };
}, []);
```

### Test strategy
- `LeadMapPane.ui.test.tsx` (modify): 3 new tests:
  1. **Pan refetch:** simulate `onCameraChanged` with a center >500m from current snap → assert `setSnappedLocation` was called after 500ms debounce (use `vi.useFakeTimers`)
  2. **Pan no-op:** simulate `onCameraChanged` with a center <500m → assert snap NOT updated
  3. **Click-to-deselect:** set `selectedLeadId` in Zustand → simulate map `onClick` → assert `selectedLeadId` is now `null` AND `lead_feed.map_deselected` event fired
- `map-pan-debounce.logic.test.ts` (new): 4 tests for the debounce behavior in isolation:
  1. Multiple rapid pans → only the last one fires after 500ms
  2. Pan below threshold → no snap update
  3. Pan above threshold → snap updated
  4. Cleanup clears pending timeout

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified.
* **Unhappy Path Tests:** pan below threshold no-op test, deselect when already null is a no-op.
* **logError Mandate:** N/A — no API routes touched.
* **Mobile-First:** all new behaviors are desktop-only (map is `hidden lg:block`). Mobile unchanged.

## Execution Plan
- [ ] **Contract Definition:** N/A — no new API contracts. The `FORCED_REFETCH_THRESHOLD_M` constant may need exporting from `useLeadFeed.ts` (or sourcing from `_contracts.json`).
- [ ] **Spec & Registry Sync:** add a "Phase 6 step 2 — implementation note" in spec 75 §4.10 documenting the debounced pan refetch and click-to-deselect. Run `npm run system-map` after.
- [ ] **Schema Evolution:** N/A — no DB or migration changes.
- [ ] **Test Scaffolding:**
  - Add 3 tests to `src/tests/LeadMapPane.ui.test.tsx`
  - Create `src/tests/map-pan-debounce.logic.test.ts` (4 tests)
- [ ] **Red Light:** `npx vitest run src/tests/LeadMapPane.ui.test.tsx src/tests/map-pan-debounce.logic.test.ts` — must see failing tests.
- [ ] **Implementation:**
  - Export `FORCED_REFETCH_THRESHOLD_M` from `useLeadFeed.ts` (or source from contracts)
  - Add `lead_feed.map_panned` + `lead_feed.map_deselected` to the `EventName` enum in `src/lib/observability/capture.ts`
  - Add `onCameraChanged` debounced handler to `LeadMapPane.tsx`
  - Add `onClick` deselect handler to `LeadMapPane.tsx`
  - Add unmount cleanup for debounce timer
- [ ] **Auth Boundary & Secrets:** N/A — no new env vars or secrets. Same `NEXT_PUBLIC_GOOGLE_MAPS_KEY` as step 1.
- [ ] **Pre-Review Self-Checklist:** generate a 5-item self-skeptical checklist:
  1. Does the debounced pan handler fire ONLY after 500ms of no camera changes (not on every intermediate frame)?
  2. Does the 500m threshold gate prevent refetches from minor pans (sub-neighbourhood scale)?
  3. Does the map `onClick` NOT fire when clicking a marker (Google Maps event propagation)?
  4. Is the debounce timer cleaned up on unmount to prevent state updates on an unmounted component?
  5. Does the telemetry use bounded cardinality (`delta_m` rounded integer, not raw float)?
  Walk each item against the actual diff before Green Light.
- [ ] **Green Light:** `npm run typecheck && npm run test && npm run lint -- --fix`. All pass. Output visible execution summary using ✅/⬜ for every step. → WF6.

---

## §10 Plan Compliance Checklist

### ⬜ DB: N/A — no migration, no schema, no SQL touched.

### ⬜ API: N/A — no route touched.

### ✅ UI (LeadMapPane modifications)
- ✅ **Mobile-first Tailwind:** no new classes — existing `hidden lg:block` unchanged. Mobile bit-identical.
- ✅ **Touch targets ≥ 44px:** N/A — desktop-only map interaction (mouse/trackpad)
- ✅ **375px viewport test:** N/A — map is hidden on mobile; no test needed
- ✅ **No secrets in `use client`:** no new env vars read
- ✅ **User input escaped:** N/A — no user text displayed

### ⬜ Shared Logic: N/A — no dual-code-path logic touched.

### ⬜ Pipeline: N/A — no pipeline scripts touched.

### ✅ Frontend Boundary Check
- ✅ No modifications to `scripts/`, `migrations/`, or `scripts/lib/`
- ✅ API route returns stable field names — N/A (no route change)
- ✅ Business logic in `src/lib/` — haversine helper already in `src/features/leads/lib/haversine.ts`

### ✅ Frontend Foundation Check
- ✅ Biome check passes — will verify
- ✅ No `useEffect` for data fetching — data via `useLeadFeed` (TanStack Query). The debounce uses `setTimeout` for timing control, not data fetching.
- ✅ No `useState` for form fields — N/A
- ✅ No React Context inside `src/features/leads/` — Zustand selectors only
- ✅ All `onClick`/`onSubmit` handlers call `captureEvent()` — map click fires `map_deselected`, pan fires `map_panned`
- ✅ Centered modals → Drawer — N/A
- ✅ Lists >50 items wrapped in TanStack Virtual — N/A
- ✅ Toast notifications via Sonner — N/A

### ✅ Pre-Review Self-Checklist
- ✅ 5-item self-skeptical checklist planned (see Execution Plan above)

### ✅ Cross-Layer Contracts Check
- ✅ `FORCED_REFETCH_THRESHOLD_M` (500m) — already sourced from `useLeadFeed.ts`; will check if it's in `_contracts.json`. If not, will add it and wire a contracts test row.

---

**PLAN LOCKED. Do you authorize this WF1 (Phase 6 step 2) plan? (y/n)**
