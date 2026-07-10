// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.2 + §6
//
// Flight Center UI-state store (Spec 35 §3.2 row — re-homed from the Spec 76
// PENDING entry to Spec 36). UI state ONLY — no server mirror: the drawer's
// initialData row is looked up from the TanStack cache by the selected
// watchlist id at render time ([PF14]), never copied here.
//
// Owned fields: selectedIds (bulk selection), searchQuery, inspectorOpen,
// selectedLeadId. `inspectorMode` from the Spec 76 draft is RETIRED [PF11] —
// the drawer is a single inspect-endpoint surface.
//
// Spec 35 §6 hygiene: immutable replace on the Set (never in-place mutation);
// setters short-circuit when the value is unchanged (§6.2/§6.4) so repeat
// calls do not change references; selectors in components stay atomic or
// useShallow.
//
// Reset contract (Spec 35 §B5 + [PF13]): `reset()` is fanned out from
// `clearAdminSession()` AND the B4 uid-change handler in
// src/lib/admin/session.ts — enforced by the §8.5 store-enumeration
// coverage test (same commit as this store).

import { create } from 'zustand';

interface FlightCenterState {
  /** Bulk-selected admin_watchlist row ids (multi-select table). */
  selectedIds: Set<number>;
  /** The search box's raw query (SearchPermitsModal input). */
  searchQuery: string;
  /** Detail drawer open flag. */
  inspectorOpen: boolean;
  /** Inspect URL-segment id of the opened lead (`NUM--REV` / `COA-APP`); null when closed. */
  selectedLeadId: string | null;

  toggleSelected: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clearSelected: () => void;
  setSearchQuery: (q: string) => void;
  openInspector: (leadId: string) => void;
  closeInspector: () => void;
  reset: () => void;
}

const INITIAL = {
  selectedIds: new Set<number>(),
  searchQuery: '',
  inspectorOpen: false,
  selectedLeadId: null as string | null,
};

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export const useFlightCenterStore = create<FlightCenterState>((set, get) => ({
  ...INITIAL,
  selectedIds: new Set<number>(),

  toggleSelected(id: number) {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },

  selectAll(ids: number[]) {
    const next = new Set(ids);
    // §6.2 idempotency — same membership keeps the same reference.
    if (setsEqual(next, get().selectedIds)) return;
    set({ selectedIds: next });
  },

  clearSelected() {
    if (get().selectedIds.size === 0) return; // already clear — no-op
    set({ selectedIds: new Set<number>() });
  },

  setSearchQuery(q: string) {
    if (get().searchQuery === q) return; // §6.4 short-circuit
    set({ searchQuery: q });
  },

  openInspector(leadId: string) {
    const s = get();
    if (s.inspectorOpen && s.selectedLeadId === leadId) return; // idempotent
    set({ inspectorOpen: true, selectedLeadId: leadId });
  },

  closeInspector() {
    const s = get();
    if (!s.inspectorOpen && s.selectedLeadId === null) return;
    set({ inspectorOpen: false, selectedLeadId: null });
  },

  reset() {
    const s = get();
    if (
      s.selectedIds.size === 0 &&
      s.searchQuery === '' &&
      !s.inspectorOpen &&
      s.selectedLeadId === null
    ) {
      return; // already initial — keep references stable
    }
    set({ ...INITIAL, selectedIds: new Set<number>() });
  },
}));
