// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §5
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.2 + §6 + §8.1 (B2)
//
// Logic locks for useFlightCenterStore (Spec 35 §8.1 B2 idempotency +
// §6.2/§6.4 short-circuit hygiene): bulk-select add/remove/clear/selectAll,
// inspector open/close, searchQuery, reset. The store owns UI state ONLY —
// selectedIds / searchQuery / inspectorOpen / selectedLeadId (inspectorMode
// RETIRED [PF11]).

import { describe, it, expect, beforeEach } from 'vitest';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';

beforeEach(() => {
  useFlightCenterStore.getState().reset();
});

describe('useFlightCenterStore — bulk selection (B2)', () => {
  it('toggleSelected adds then removes', () => {
    const s = useFlightCenterStore.getState();
    s.toggleSelected(1);
    expect(useFlightCenterStore.getState().selectedIds.has(1)).toBe(true);
    useFlightCenterStore.getState().toggleSelected(1);
    expect(useFlightCenterStore.getState().selectedIds.has(1)).toBe(false);
  });

  it('toggle never mutates the previous Set in place (immutable replace, §6)', () => {
    useFlightCenterStore.getState().toggleSelected(1);
    const first = useFlightCenterStore.getState().selectedIds;
    useFlightCenterStore.getState().toggleSelected(2);
    const second = useFlightCenterStore.getState().selectedIds;
    expect(second).not.toBe(first);
    expect(first.has(2)).toBe(false); // the old reference is untouched
  });

  it('selectAll is idempotent — same membership keeps the same reference (§6.2)', () => {
    useFlightCenterStore.getState().selectAll([1, 2, 3]);
    const first = useFlightCenterStore.getState().selectedIds;
    useFlightCenterStore.getState().selectAll([3, 2, 1]); // same members, any order
    expect(useFlightCenterStore.getState().selectedIds).toBe(first);
  });

  it('selectAll replaces a differing selection', () => {
    useFlightCenterStore.getState().selectAll([1, 2]);
    useFlightCenterStore.getState().selectAll([2, 3]);
    const ids = useFlightCenterStore.getState().selectedIds;
    expect(ids.has(1)).toBe(false);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(true);
  });

  it('clearSelected empties; a second clear is a reference-stable no-op', () => {
    useFlightCenterStore.getState().selectAll([1, 2]);
    useFlightCenterStore.getState().clearSelected();
    const cleared = useFlightCenterStore.getState().selectedIds;
    expect(cleared.size).toBe(0);
    useFlightCenterStore.getState().clearSelected();
    expect(useFlightCenterStore.getState().selectedIds).toBe(cleared);
  });
});

describe('useFlightCenterStore — search + inspector', () => {
  it('setSearchQuery short-circuits on identical value (§6.4)', () => {
    useFlightCenterStore.getState().setSearchQuery('queen');
    const state1 = useFlightCenterStore.getState();
    useFlightCenterStore.getState().setSearchQuery('queen');
    expect(useFlightCenterStore.getState()).toBe(state1);
  });

  it('openInspector sets both fields; repeat open of the same lead is a no-op', () => {
    useFlightCenterStore.getState().openInspector('20-1--00');
    const state1 = useFlightCenterStore.getState();
    expect(state1.inspectorOpen).toBe(true);
    expect(state1.selectedLeadId).toBe('20-1--00');
    useFlightCenterStore.getState().openInspector('20-1--00');
    expect(useFlightCenterStore.getState()).toBe(state1);
  });

  it('openInspector switches leads without closing', () => {
    useFlightCenterStore.getState().openInspector('20-1--00');
    useFlightCenterStore.getState().openInspector('COA-A1/25');
    const s = useFlightCenterStore.getState();
    expect(s.inspectorOpen).toBe(true);
    expect(s.selectedLeadId).toBe('COA-A1/25');
  });

  it('closeInspector clears both fields; repeat close is a no-op', () => {
    useFlightCenterStore.getState().openInspector('20-1--00');
    useFlightCenterStore.getState().closeInspector();
    const state1 = useFlightCenterStore.getState();
    expect(state1.inspectorOpen).toBe(false);
    expect(state1.selectedLeadId).toBeNull();
    useFlightCenterStore.getState().closeInspector();
    expect(useFlightCenterStore.getState()).toBe(state1);
  });
});

describe('useFlightCenterStore — reset (B5 fan-out target)', () => {
  it('reset restores every owned field to initial', () => {
    const s = useFlightCenterStore.getState();
    s.selectAll([1, 2, 3]);
    s.setSearchQuery('king st');
    s.openInspector('20-1--00');
    useFlightCenterStore.getState().reset();
    const after = useFlightCenterStore.getState();
    expect(after.selectedIds.size).toBe(0);
    expect(after.searchQuery).toBe('');
    expect(after.inspectorOpen).toBe(false);
    expect(after.selectedLeadId).toBeNull();
  });

  it('reset on an already-initial store is a reference-stable no-op (§6.2)', () => {
    const state1 = useFlightCenterStore.getState();
    useFlightCenterStore.getState().reset();
    expect(useFlightCenterStore.getState()).toBe(state1);
  });
});
