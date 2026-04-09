// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §3 + §11 Phase 3
//
// Zustand store for the lead feed UI. Holds BOTH ephemeral state
// (`hoveredLeadId`, `selectedLeadId` — not persisted) and filter state
// (`radiusKm`, `location` — persisted to localStorage via `partialize`).
//
// Why Zustand and not React Context: CLAUDE.md §12.4 Frontend Mode rule 3
// bans `useContext` inside `src/features/leads/` because Context triggers
// re-renders on every consumer for any state change. Zustand subscribes
// per-selector, avoiding the cascade.
//
// Persistence contract (spec 75 §11 Phase 3 step 1):
//   - Only `radiusKm` + `location` are persisted via `partialize`. Hover/select
//     state is ephemeral and would cause stale cursors on reload.
//   - `version: 1` — bump whenever the persisted shape changes.
//   - `migrate` defensively validates the stored shape on load. Catches
//     localStorage tampering and cross-deploy schema drift.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Default radius in kilometres. Matches `geo.default_radius_km` in
 * `docs/specs/_contracts.json` — verified by `contracts.infra.test.ts`.
 */
export const DEFAULT_RADIUS_KM = 10;

export interface LeadLocation {
  lat: number;
  lng: number;
}

export interface LeadFeedState {
  // Hydration gate — true after the persist middleware has rehydrated
  // from localStorage. Consumers that render UI based on `radiusKm`
  // or `location` MUST gate on this to avoid a flash of default
  // values during the async rehydration window. Phase 3-i review
  // flagged the architectural gap; landing the signal now so 3-ii
  // consumers don't have to retrofit it.
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  // Ephemeral — NOT persisted
  hoveredLeadId: string | null;
  selectedLeadId: string | null;

  // Persisted filter state
  radiusKm: number;
  location: LeadLocation | null;

  // Actions
  setHoveredLeadId: (id: string | null) => void;
  setSelectedLeadId: (id: string | null) => void;
  setRadius: (km: number) => void;
  setLocation: (loc: LeadLocation | null) => void;
}

/**
 * Persisted slice shape. Kept explicit so the `migrate` function can
 * validate each field individually.
 */
interface PersistedSlice {
  radiusKm: number;
  location: LeadLocation | null;
}

function defaultPersistedSlice(): PersistedSlice {
  return { radiusKm: DEFAULT_RADIUS_KM, location: null };
}

/**
 * Defensive shape guard. Called by the `migrate` callback on every load.
 * Accepts `unknown` because localStorage can contain anything a
 * malicious/buggy extension wrote — trusting the shape is how you crash
 * an app on mount. Returns the validated slice or a fresh default.
 */
function validatePersistedSlice(raw: unknown): PersistedSlice {
  if (!raw || typeof raw !== 'object') return defaultPersistedSlice();
  const r = raw as { radiusKm?: unknown; location?: unknown };
  const radiusKm =
    typeof r.radiusKm === 'number' && Number.isFinite(r.radiusKm) && r.radiusKm > 0
      ? r.radiusKm
      : DEFAULT_RADIUS_KM;
  const locRaw = r.location;
  const location =
    locRaw &&
    typeof locRaw === 'object' &&
    typeof (locRaw as { lat?: unknown }).lat === 'number' &&
    typeof (locRaw as { lng?: unknown }).lng === 'number' &&
    Number.isFinite((locRaw as { lat: number }).lat) &&
    Number.isFinite((locRaw as { lng: number }).lng)
      ? { lat: (locRaw as { lat: number }).lat, lng: (locRaw as { lng: number }).lng }
      : null;
  return { radiusKm, location };
}

export const useLeadFeedState = create<LeadFeedState>()(
  persist(
    (set) => ({
      // Hydration gate (NOT persisted — reset on every mount, flipped
      // to true by `onRehydrateStorage` below once the middleware
      // finishes loading from storage).
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      // Ephemeral state
      hoveredLeadId: null,
      selectedLeadId: null,

      // Persisted state (initial values; rehydrated on mount)
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,

      // Actions
      setHoveredLeadId: (id) => set({ hoveredLeadId: id }),
      setSelectedLeadId: (id) => set({ selectedLeadId: id }),
      setRadius: (km) => set({ radiusKm: km }),
      setLocation: (loc) => set({ location: loc }),
    }),
    {
      name: 'buildo-lead-feed',
      storage: createJSONStorage(() => localStorage),
      // Only persist filter state. Hover/select + _hasHydrated are
      // per-session and must NOT be persisted (persisting _hasHydrated
      // would serialize `true`, then on reload skip the rehydration
      // gate entirely).
      partialize: (state): PersistedSlice => ({
        radiusKm: state.radiusKm,
        location: state.location,
      }),
      version: 1,
      migrate: (persistedState, version) => {
        // v0 had no `location` field (hypothetical). Add default.
        if (version === 0) {
          const v0 = (persistedState ?? {}) as Record<string, unknown>;
          return validatePersistedSlice({ ...v0, location: null });
        }
        // v1+: validate shape regardless — catches tampering.
        return validatePersistedSlice(persistedState);
      },
      // Flip the hydration gate after the rehydrated state is merged
      // into the store. Consumers can now trust `radiusKm` + `location`.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Exported for unit tests only. Production code uses the hook.
 */
export const __validatePersistedSliceForTests = validatePersistedSlice;
