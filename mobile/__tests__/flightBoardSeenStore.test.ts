/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 (canonical contract)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §3.4 (engagement store row),
//             §B5 (sign-out reset), §6.6 (deep-equal-before-set), §8.1 (idempotency)
//
// Unit tests for `flightBoardSeenStore` — the per-user MMKV-persisted map
// that drives the FlightCard amber update flash. Spec 77 §3.2 prescribes
// the rule: `hasUpdate = item.updated_at !== mmkvSeen[permitId]`, with
// first-sight rows (no MMKV entry) suppressed by the `!== undefined` gate.

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

// Match the existing filterStore test pattern: pass-through `persist` so
// state mutations remain observable via `getState()` without round-tripping
// through a real storage adapter.
jest.mock('zustand/middleware', () => {
  const actual = jest.requireActual('zustand/middleware');
  return {
    ...actual,
    persist: (fn: Parameters<typeof actual.persist>[0]) => fn,
    createJSONStorage: jest.fn(),
  };
});

describe('flightBoardSeenStore — Spec 77 §3.2', () => {
  let store: ReturnType<
    typeof import('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState
  >;

  beforeEach(() => {
    jest.resetModules();
    const { useFlightBoardSeenStore } =
      require('@/store/flightBoardSeenStore') as typeof import('@/store/flightBoardSeenStore');
    store = useFlightBoardSeenStore.getState();
    store.reset();
  });

  it('initializes with empty seenMap', () => {
    expect(store.seenMap).toEqual({});
  });

  it('markSeen records the updated_at for a permitId', () => {
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    const s =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState() as typeof store;
    expect(s.seenMap['23-145678--01']).toBe('2026-05-01T12:00:00Z');
  });

  it('markSeen is idempotent — repeat call with same value does not change reference (Spec 99 §6.6)', () => {
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    const before =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState().seenMap;
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    const after =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState().seenMap;
    // §6.6: short-circuit when value would not change. The reference must be
    // identical so subscribed React components don't re-render spuriously.
    expect(after).toBe(before);
  });

  it('markSeen overwrites the previous timestamp when server publishes a newer one', () => {
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    store.markSeen('23-145678--01', '2026-05-02T08:30:00Z');
    const s =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState() as typeof store;
    expect(s.seenMap['23-145678--01']).toBe('2026-05-02T08:30:00Z');
  });

  it('markSeen records per-permit independently', () => {
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    store.markSeen('24-200000--00', '2026-05-03T09:00:00Z');
    const s =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState() as typeof store;
    expect(s.seenMap).toEqual({
      '23-145678--01': '2026-05-01T12:00:00Z',
      '24-200000--00': '2026-05-03T09:00:00Z',
    });
  });

  it('reset() clears the seenMap to empty object (Spec 99 §B5)', () => {
    store.markSeen('23-145678--01', '2026-05-01T12:00:00Z');
    store.markSeen('24-200000--00', '2026-05-03T09:00:00Z');
    store.reset();
    const s =
      require('@/store/flightBoardSeenStore').useFlightBoardSeenStore.getState() as typeof store;
    expect(s.seenMap).toEqual({});
  });
});
