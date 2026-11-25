// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 and its dated note 2026-11-10, §2.9 (Toronto before the network),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c (recent searches, recorded only when a search opens a page),
//            docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated note 2026-11-10 (H9).
//
// MF-35 · the real search screen (mobile/app/(app)/parcel-tool/index.tsx) with a mocked useParcelSearch and expo-router, fake timers (plan v3 §9;
// must-survive rows 8, 10, 11, 22, 27, 28): the field shows typed text at once; 400 ms debounce; the mockHook gets '' outside Toronto; unique navigates
// once and records once; Back with the same query neither re-pushes nor re-records; a candidate tap selects and does not push; SELECT pushes and
// records; the map kinds push the disambiguate route; a miss, an error and outside Toronto record nothing; there is no in-bar account button (A.13).
require('react-native-css-interop/test');
import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

const mockPush = jest.fn();
// task-452 (SEARCHFIX.4): the wall's Go to Tracked Lots switches tab with router.navigate (never the search page's push, which records a recent search).
const mockNavigate = jest.fn();
// task-362 (AC5): the search page's "Report incorrect address match" reaches the in-app browser sheet, not Linking.
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (u: string) => mockOpenBrowser(u) }));
// Dated 2026-11-20 (task-354, MOBILE.CI-1; Mobile CI run 44741125636): since ace05ccee (2026-11-19, SRCH.A6) the screen calls useFocusEffect (index.tsx:56, the
// reports-left re-read on focus), reads useAuthStore (index.tsx:54, whose import chain loads @react-native-async-storage, a native module that is null under jest:
// "Test suite failed to run") and reads useParcelEntitlement (index.tsx:55). The mocks below supply the three, the signed-out shape (no token, so no re-read and no line);
// the reports-left line itself is pinned by the search goldens (reports_left) and the entitlement hook by its own tests, not here.
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return { useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) };
});
jest.mock('@/store/authStore', () => ({ useAuthStore: (select: (s: { accessToken: string | null }) => unknown) => select({ accessToken: null }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({ getString: () => null, set: () => undefined, remove: () => undefined }) }));
type Hook = { data?: unknown; isFetching: boolean; error: unknown; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
const mockCalls: string[] = [];
// task-452: the entitlement read the wall waits on and draws from (data, isFetching, isError; the search page and useWallState share the one query key).
type Read = { data?: unknown; isFetching: boolean; isError: boolean; refetch: jest.Mock };
let mockEntitlement: Read = { data: undefined, isFetching: false, isError: false, refetch: jest.fn() };
jest.mock('@/hooks/useParcelLookup', () => {
  class ParcelLookupSchemaError extends Error {}
  return {
    ParcelLookupSchemaError,
    useParcelSearch: (q: string) => { mockCalls.push(q); return mockHook; },
    useParcelEntitlement: () => mockEntitlement,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/index').default as React.ComponentType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRecentSearchesStore } = require('@/store/recentSearchesStore') as typeof import('@/store/recentSearchesStore');

// Dated 2026-11-24 (task-450 SEARCHFIX.2, Q19): the payloads carry the server's resolution; a payload without it now reads as no_match.
const hit = (parcelId: string) => ({ match: { parcelId, matchType: 'exact' }, candidates: [], warnings: [], parcel: null, resolution: 'unique' });
const list = { match: null, candidates: [{ parcelId: 'P1', address: '1 Bathurst St' }, { parcelId: 'P2', address: '2 Bathurst St' }], warnings: [], parcel: null, resolution: 'text_candidates' };
const type = (text: string) => { fireEvent.changeText(screen.getByTestId('parcel-search-input'), text); act(() => { jest.advanceTimersByTime(400); }); };

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
  mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockCalls.length = 0;
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
  mockNavigate.mockClear();
  mockEntitlement = { data: undefined, isFetching: false, isError: false, refetch: jest.fn() };
  useRecentSearchesStore.getState().reset();
});
afterEach(() => jest.useRealTimers());

describe('parcel search screen behaviour (rows 8, 10, 11, 22, 27, 28)', () => {
  it('the field shows typed text before the debounce; the hook gets the query only at 400 ms', () => {
    render(<Screen />);
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '26 Hurlingham Cres');
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('26 Hurlingham Cres');
    act(() => { jest.advanceTimersByTime(399); });
    expect(mockCalls).not.toContain('26 Hurlingham Cres');
    act(() => { jest.advanceTimersByTime(1); });
    expect(mockCalls).toContain('26 Hurlingham Cres');
  });
  it('outside Toronto: the hook gets "", the notice shows, nothing is pushed or recorded', () => {
    render(<Screen />);
    type('100 City Centre Dr, Mississauga');
    expect(mockCalls.at(-1)).toBe('');
    expect(screen.getByTestId('parcel-search-outside-toronto')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
  });
  it('unique navigates once and records once; a re-render with the same route does not re-push (Back)', () => {
    const { rerender } = render(<Screen />);
    mockHook = { ...mockHook, data: hit('100026') };
    type('26 Hurlingham Cres');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/100026');
    expect(useRecentSearchesStore.getState().recent).toEqual(['26 Hurlingham Cres']);
    rerender(<Screen />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it('no push while fetching; edit then retype pushes again', () => {
    const { rerender } = render(<Screen />);
    mockHook = { ...mockHook, data: hit('100026'), isFetching: true };
    type('26 Hurlingham Cres');
    expect(mockPush).not.toHaveBeenCalled();
    mockHook = { ...mockHook, isFetching: false };
    rerender(<Screen />);
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockHook = { ...mockHook, data: undefined };
    type('26 Hurlingham Cr');
    mockHook = { ...mockHook, data: hit('100026') };
    type('26 Hurlingham Cres');
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
  it('the address list: a tap selects (no push, no record); SELECT pushes the selected lot and records the query', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Bathurst St');
    expect(screen.getByTestId('parcel-search-select').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('parcel-candidate-P2'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
    fireEvent.press(screen.getByTestId('parcel-search-select'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/P2');
    expect(useRecentSearchesStore.getState().recent).toEqual(['Bathurst St']);
  });
  it('OUTPUT fold MEDIUM 1 (P35-D17 a, nothing pre-checked): a new debounced query clears the checked card, even when the same lot is listed again', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Bathurst St');
    fireEvent.press(screen.getByTestId('parcel-candidate-P2'));
    expect(screen.getByTestId('parcel-candidate-P2').props.accessibilityState).toMatchObject({ checked: true });
    type('Bathurst Street');
    expect(screen.getByTestId('parcel-candidate-P2').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId('parcel-search-select').props.accessibilityState).toMatchObject({ disabled: true });
  });
  it('an intersection pushes the map route (the list never renders) and records', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: { match: null, candidates: [], warnings: [], parcel: null } };
    type('Queen & Spadina');
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/disambiguate?q=Queen%20%26%20Spadina&kind=intersection');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(useRecentSearchesStore.getState().recent).toEqual(['Queen & Spadina']);
  });
  it('a miss and an error record nothing; Retry calls refetch with no argument', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: { match: null, candidates: [], warnings: [], parcel: null } };
    type('zzzz qqqq');
    expect(screen.getByTestId('parcel-search-empty')).toBeTruthy();
    mockHook = { ...mockHook, data: undefined, error: new Error('network') };
    type('zzzz qqqqq');
    fireEvent.press(screen.getByTestId('parcel-search-retry'));
    expect(mockHook.refetch).toHaveBeenCalledWith();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('a chip sets the input (the debounce still applies); there is no in-bar account button (A.13)', () => {
    useRecentSearchesStore.getState().add('Bathurst St');
    render(<Screen />);
    fireEvent.press(screen.getByTestId('parcel-search-suggestion-Bathurst St'));
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('Bathurst St');
    expect(mockCalls).not.toContain('Bathurst St');
    act(() => { jest.advanceTimersByTime(400); });
    expect(mockCalls).toContain('Bathurst St');
    expect(screen.queryByTestId('parcel-search-account')).toBeNull();
  });
  it('task-362 AC5: the address list report link opens Help in the in-app browser sheet with the topic and the typed address (search.html:235)', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Bathurst St');
    fireEvent.press(screen.getByTestId('parcel-search-report'));
    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    // task-450 AC6 (B.7, doc-2:49): the link opens the help topic "Wrong address or lot".
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://maxbld.ca/help#topic=wrong-lot&q=Bathurst%20St');
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('task-450 AC1 (ruled B): a street with no house number shows the refine line and keeps the rows', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Bathurst St');
    expect(screen.getByTestId('parcel-search-refine')).toBeTruthy();
    expect(screen.getByTestId('parcel-candidate-P1')).toBeTruthy();
    expect(screen.getByTestId('parcel-candidate-P2')).toBeTruthy();
    type('2 Bathurst St');
    expect(screen.queryByTestId('parcel-search-refine')).toBeNull();
  });
  it('task-450 AC4 (L5): the prompt carries the minimum length from the setting, not a typed 3', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SEARCH_MIN_QUERY_LEN } = require('@/components/surfaces/SearchBinding') as typeof import('@/components/surfaces/SearchBinding');
    render(<Screen />);
    type('12');
    expect(screen.getByText('Type at least ' + SEARCH_MIN_QUERY_LEN + ' characters to search.')).toBeTruthy();
  });
});

// task-452 SEARCHFIX.4 (AC2, AC3): a refused lookup shows the wall once the entitlement read has answered. The count and the date are the read's.
describe('the report-limit and reactivate wall (task-452)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReportLimitError, SubscriptionRequiredError } = require('@/lib/errors') as typeof import('@/lib/errors');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PARCEL_TAB_ROUTE } = require('@/lib/parcelSearchMatch') as typeof import('@/lib/parcelSearchMatch');
  const REACTIVATE = "Your subscription doesn't include the parcel tool right now. This isn't a missing address — reactivate to search lots again.";
  const active = { status: 'active', reportsUsed: 10, reportsLimit: 10, reportsLeft: 0, reportsLimitReached: true, resetsOn: '2026-12-09T05:00:00.000Z', resetsOnDisplay: '9 Dec 2026' };
  const lapsed = (status: string | null) => ({ status, reportsUsed: null, reportsLimit: null, reportsLeft: null, reportsLimitReached: null, resetsOn: null, resetsOnDisplay: null });
  const refused = (error: unknown, data: unknown, over: Partial<Read> = {}) => {
    mockEntitlement = { data, isFetching: false, isError: false, refetch: jest.fn(), ...over };
    mockHook = { ...mockHook, data: undefined, error };
  };
  const noSearchCopy = () => {
    expect(screen.queryByTestId('parcel-search-entitlement')).toBeNull();
    expect(screen.queryByTestId('parcel-search-empty')).toBeNull();
  };

  it('limit wall: the count, the reset date and the plan line from the read; not the notice, the miss or the reactivate copy; Go to Tracked Lots navigates and records nothing', () => {
    render(<Screen />);
    refused(new ReportLimitError(10, '2026-12-09T05:00:00.000Z'), active);
    type('26 Hurlingham Cres');
    expect(screen.getByTestId('parcel-wall-limit')).toBeTruthy();
    expect(screen.getByText('You’ve used all 10 reports')).toBeTruthy();
    expect(screen.getByText('Your count resets on 9 Dec 2026.')).toBeTruthy();
    // RR-0466 (MD:2410-2413): the two lead lines and the plan line as the operator reworded them.
    expect(screen.getByText('Lot reports you’ve opened this month stay available.')).toBeTruthy();
    expect(screen.getByText('Your Tracked Lots remain.')).toBeTruthy();
    expect(screen.getByText('Your plan is managed on the web for changes.')).toBeTruthy();
    expect(screen.queryByText(REACTIVATE)).toBeNull();
    noSearchCopy();
    fireEvent.press(screen.getByTestId('parcel-wall-tracked'));
    expect(mockNavigate).toHaveBeenCalledWith(PARCEL_TAB_ROUTE.tracked);
    expect(PARCEL_TAB_ROUTE.tracked).toBe('/(app)/parcel-tool/tracked');
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
  });
  it('wait: while the read is pending the loading state shows, neither the notice, the miss copy nor the wall', () => {
    render(<Screen />);
    refused(new ReportLimitError(10, '2026-12-09T05:00:00.000Z'), undefined, { isFetching: true });
    type('26 Hurlingham Cres');
    expect(screen.getByTestId('parcel-search-spinner')).toBeTruthy();
    expect(screen.queryByTestId('parcel-wall-screen')).toBeNull();
    noSearchCopy();
  });
  // Round 2 (dated 2026-11-24; RR-0468, Spec 128 rule 12; prior title "a failed read keeps today's notice"): a failed read of either refusal class shows the
  // wall's error notice (the one sentence, Go to Tracked Lots; no count, date or plan line); a plain 403 with a failed read keeps today's notice.
  it('a failed read shows the wall error notice for both classes (the 403 values are never drawn); a plain 403 with a failed read keeps the notice', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiError } = require('@/lib/errors') as typeof import('@/lib/errors');
    const clean = (): void => {
      mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
      mockEntitlement = { data: undefined, isFetching: false, isError: false, refetch: jest.fn() };
    };
    for (const error of [new ReportLimitError(10, '2026-12-09T05:00:00.000Z'), new SubscriptionRequiredError()]) {
      clean();
      const r = render(<Screen />);
      refused(error, undefined, { isError: true });
      type('26 Hurlingham Cres');
      expect(within(screen.getByTestId('parcel-wall-error')).getByText('Something went wrong on our side. Please try again.')).toBeTruthy();
      expect(screen.getByTestId('parcel-wall-tracked')).toBeTruthy();
      expect(screen.queryByText('Your plan is managed on the web for changes.')).toBeNull();
      expect(screen.queryByText('You’ve used all 10 reports')).toBeNull();
      noSearchCopy();
      r.unmount();
    }
    clean();
    render(<Screen />);
    refused(new ApiError(403, 'Forbidden'), undefined, { isError: true });
    type('26 Hurlingham Cres');
    expect(screen.getByTestId('parcel-search-entitlement')).toBeTruthy();
    expect(screen.queryByTestId('parcel-wall-screen')).toBeNull();
  });
  it('Spec 99 §8.3 gate stability: the wall and the wait state render the same tree with isFetching true and false', () => {
    const tree = (error: unknown, data: unknown, entFetching: boolean, searchFetching: boolean): string => {
      mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
      mockEntitlement = { data: undefined, isFetching: false, isError: false, refetch: jest.fn() };
      const r = render(<Screen />);
      refused(error, data, { isFetching: entFetching });
      mockHook = { ...mockHook, isFetching: searchFetching };
      type('26 Hurlingham Cres');
      const json = JSON.stringify(r.toJSON());
      r.unmount();
      return json;
    };
    const limit = new ReportLimitError(10, '2026-12-09T05:00:00.000Z');
    expect(tree(limit, active, true, true)).toBe(tree(limit, active, false, false));
    expect(tree(new SubscriptionRequiredError(), lapsed('expired'), true, false)).toBe(tree(new SubscriptionRequiredError(), lapsed('expired'), false, true));
    expect(tree(limit, undefined, true, true)).toBe(tree(limit, undefined, true, false));
  });
  it('expired: the reactivate state inside the wall, with the plan line and Go to Tracked Lots; no search notice or miss copy', () => {
    render(<Screen />);
    refused(new SubscriptionRequiredError(), lapsed('expired'));
    type('26 Hurlingham Cres');
    expect(within(screen.getByTestId('parcel-wall-reactivate')).getByText(REACTIVATE)).toBeTruthy();
    expect(within(screen.getByTestId('parcel-wall-reactivate')).getByText('Your plan is managed on the web for changes.')).toBeTruthy();
    expect(screen.getByTestId('parcel-wall-tracked')).toBeTruthy();
    expect(screen.getByText('Go to Tracked Lots')).toBeTruthy();
    expect(screen.queryByTestId('parcel-wall-limit')).toBeNull();
    noSearchCopy();
  });
  it('no plan yet (status null) and an active status keep today\'s notice (task-357 flips the status-null case to its no-plan page)', () => {
    for (const data of [lapsed(null), active]) {
      const r = render(<Screen />);
      refused(new SubscriptionRequiredError(), data);
      type('26 Hurlingham Cres');
      expect(screen.getByTestId('parcel-search-entitlement')).toBeTruthy();
      expect(screen.queryByTestId('parcel-wall-screen')).toBeNull();
      r.unmount();
    }
  });
});
