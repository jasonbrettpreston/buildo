/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c (the recentSearchesStore row, dated note 2026-11-10), §B5 (sign-out reset),
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 dated note 2026-11-10 (the chips are the user's recent searches)
//
// MF-35 (P35-D16 a): the MaxBLD search page's recent searches, on the phone (Zustand + MMKV, Layer 4a): newest first, de-duplicated ignoring
// case, at most the recent_max setting, a blank query never saved, reset() empties, persisted under `parcel-recent-searches`.
// task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494 "register them"; Spec 128 Rule 3): the count is the registered setting maxbld_page_recent_max, read from the
// generated slice through sliceNumber (bounds 0 to 10, clamp); a slice with recent_max 2 keeps two.

const persistNames: string[] = [];
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: jest.fn().mockReturnValue(null), set: jest.fn(), remove: jest.fn() }),
}));
jest.mock('zustand/middleware', () => {
  const actual = jest.requireActual('zustand/middleware');
  return {
    ...actual,
    persist: (fn: Parameters<typeof actual.persist>[0], opts: { name: string }) => { persistNames.push(opts.name); return fn; },
    createJSONStorage: jest.fn(),
  };
});

type Store = ReturnType<typeof import('@/store/recentSearchesStore').useRecentSearchesStore.getState>;
const fresh = (): { get: () => Store } => {
  jest.resetModules();
  const { useRecentSearchesStore } = require('@/store/recentSearchesStore') as typeof import('@/store/recentSearchesStore');
  return { get: () => useRecentSearchesStore.getState() };
};

describe('recentSearchesStore (P35-D16 a)', () => {
  it('starts empty and is persisted under parcel-recent-searches', () => {
    const s = fresh();
    expect(s.get().recent).toEqual([]);
    expect(persistNames).toContain('parcel-recent-searches');
  });
  it('adds the trimmed query, newest first, capped at the recent_max setting (3)', () => {
    const s = fresh();
    const slice = require('@/generated/surfaces/mobile_parcel_search.json') as { config: Record<string, number> };
    expect(slice.config.recent_max).toBe(3);
    for (const q of ['  26 Hurlingham Cres ', 'Queen & Spadina', 'Bathurst St', '100 Queen St W']) s.get().add(q);
    expect(s.get().recent).toEqual(['100 Queen St W', 'Bathurst St', 'Queen & Spadina']);
  });
  it('de-duplicates ignoring case: a repeat moves to the front with its newest spelling', () => {
    const s = fresh();
    s.get().add('26 Hurlingham Cres');
    s.get().add('Bathurst St');
    s.get().add('26 HURLINGHAM cres');
    expect(s.get().recent).toEqual(['26 HURLINGHAM cres', 'Bathurst St']);
  });
  it('a blank query is never saved; the same newest query is a no-op (no new array)', () => {
    const s = fresh();
    s.get().add('   ');
    expect(s.get().recent).toEqual([]);
    s.get().add('Bathurst St');
    const before = s.get().recent;
    s.get().add('Bathurst St');
    expect(s.get().recent).toBe(before);
  });
  it('task-454: the count is the setting, not a typed number: a slice with recent_max 2 keeps two', () => {
    jest.resetModules();
    jest.doMock('@/generated/surfaces/mobile_parcel_search.json', () => {
      const real = jest.requireActual('@/generated/surfaces/mobile_parcel_search.json') as { config: Record<string, number> };
      return { ...real, config: { ...real.config, recent_max: 2 } };
    });
    const { useRecentSearchesStore } = require('@/store/recentSearchesStore') as typeof import('@/store/recentSearchesStore');
    for (const q of ['Bathurst St', 'Queen & Spadina', '100 Queen St W']) useRecentSearchesStore.getState().add(q);
    expect(useRecentSearchesStore.getState().recent).toEqual(['100 Queen St W', 'Queen & Spadina']);
    jest.dontMock('@/generated/surfaces/mobile_parcel_search.json');
  });
  it('reset() empties the list (Spec 99 §B5)', () => {
    const s = fresh();
    s.get().add('Bathurst St');
    s.get().reset();
    expect(s.get().recent).toEqual([]);
  });
});
