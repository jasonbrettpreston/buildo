// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 and its dated note 2026-11-10, §2.9 (Toronto before the network),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c (recent searches, recorded only when a search opens a page),
//            docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated note 2026-11-10 (H9).
//
// MF-35 · the real search screen (mobile/app/(app)/parcel-tool/index.tsx) with a mocked useParcelSearch and expo-router, fake timers (plan v3 §9;
// must-survive rows 8, 10, 11, 22, 27, 28): the field shows typed text at once; 400 ms debounce; the mockHook gets '' outside Toronto; unique navigates
// once and records once; Back with the same query neither re-pushes nor re-records; a candidate tap selects and does not push; SELECT pushes and
// records; the map kinds push the disambiguate route; a miss, an error and outside Toronto record nothing; there is no in-bar account button (A.13).
// Dated 2026-11-25 (task-465 McFixV2.1; RR-0483 MORNING-DECISIONS.md:2523, RR-0485 :2533 item 6, RR-0487 :2543, RR-0495; prior text above kept):
// nothing opens while typing. Enter (submitEditing) or a tap on a drop-down row opens a lot; the miss and the outside-Toronto line show after Enter
// only; the first delete clears the rows; the box is empty when the screen regains focus after it opened a page. The old cases that typed without
// Enter and expected a page are rewritten below with their prior titles kept in a dated note.
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
// task-465 T9: the focus callbacks are captured so a test can fire "the screen gained focus again" (focusAgain below); each still runs on mount.
const mockFocus = new Set<() => void>();
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return { useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useFocusEffect: (cb: () => void) => { mockFocus.add(cb); R.useEffect(cb, [cb]); } };
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
const list = { match: null, candidates: [{ parcelId: 'P1', address: '1 Bathurst St' }, { parcelId: 'P2', address: '2 Bathurst St' }], warnings: [], parcel: null, resolution: 'text_candidates' };
const type = (text: string) => { fireEvent.changeText(screen.getByTestId('parcel-search-input'), text); act(() => { jest.advanceTimersByTime(400); }); };
/** task-465: the Enter key of the search field. */
const enter = () => { act(() => { fireEvent(screen.getByTestId('parcel-search-input'), 'submitEditing'); }); };
/** task-465 T9: the screen gains focus again (every captured focus callback runs, as expo-router does on focus). */
const focusAgain = () => { act(() => { for (const cb of [...mockFocus]) cb(); }); };
const rows = (...r: [string, string][]) => ({ match: null, candidates: r.map(([parcelId, address]) => ({ parcelId, address })), warnings: [], parcel: null, resolution: 'text_candidates' });
const elm = rows(['5106944', '383 Elm Ave'], ['5461541', '383 Elmwood Ave'], ['5191692', '383 Elm Grove Ave']);
const hitAt = (parcelId: string, address: string) => ({ match: { parcelId, matchType: 'exact', address }, candidates: [], warnings: [], parcel: null, resolution: 'unique' });

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
  mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockCalls.length = 0;
  mockFocus.clear();
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
  // Dated 2026-11-25 (task-465 T7; prior title kept: "outside Toronto: the hook gets "", the notice shows, nothing is pushed or recorded").
  it('T7 outside Toronto inside the box: nothing while typing; after Enter the line shows in the drop-down; the hook gets "" throughout; no push or record', () => {
    render(<Screen />);
    type('100 City Centre Dr, Mississauga');
    expect(mockCalls.at(-1)).toBe('');
    expect(screen.queryByTestId('parcel-search-outside-toronto')).toBeNull();
    enter();
    expect(mockCalls.at(-1)).toBe('');
    expect(within(screen.getByTestId('parcel-search-drop')).getByTestId('parcel-search-outside-toronto')).toBeTruthy();
    expect(screen.getByText('Outside Toronto')).toBeTruthy();
    expect(mockCalls.filter((q) => q !== '')).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
  });
  it('T1 typing an exact address never navigates; its one row shows under the box', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: hitAt('5293897', '41 Derwyn Rd') };
    type('41 Derwyn Rd');
    act(() => { jest.advanceTimersByTime(400); });
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('parcel-candidate-5293897')).toBeTruthy();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
  });
  // Dated 2026-11-25 (task-465 T2; prior title kept: "unique navigates once and records once; a re-render with the same route does not re-push (Back)").
  it('T2 Enter on a unique opens the lot once and records it; a re-render does not re-push (Back)', () => {
    const { rerender } = render(<Screen />);
    mockHook = { ...mockHook, data: hitAt('5293897', '41 Derwyn Rd') };
    type('41 Derwyn Rd');
    enter();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/5293897');
    expect(useRecentSearchesStore.getState().recent).toEqual(['41 Derwyn Rd']);
    rerender(<Screen />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it('T3 Enter before the debounce queries the typed text at once', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: hitAt('5476455', '679 Queen St W') };
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '679 Queen St W');
    act(() => { jest.advanceTimersByTime(100); });
    enter();
    expect(mockCalls).toContain('679 Queen St W');
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/5476455');
    expect(useRecentSearchesStore.getState().recent).toEqual(['679 Queen St W']);
  });
  // Dated 2026-11-25 (task-465 T16; prior title kept: "no push while fetching; edit then retype pushes again").
  it('T16 Enter does not push while fetching; edit then retype and Enter pushes again', () => {
    const { rerender } = render(<Screen />);
    mockHook = { ...mockHook, data: hitAt('100026', '26 Hurlingham Cres'), isFetching: true };
    type('26 Hurlingham Cres');
    enter();
    expect(mockPush).not.toHaveBeenCalled();
    mockHook = { ...mockHook, isFetching: false };
    rerender(<Screen />);
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockHook = { ...mockHook, data: undefined };
    type('26 Hurlingham Cr');
    mockHook = { ...mockHook, data: hitAt('100026', '26 Hurlingham Cres') };
    type('26 Hurlingham Cres');
    expect(mockPush).toHaveBeenCalledTimes(1);
    enter();
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
  // Dated 2026-11-25 (task-465 T4; prior titles kept: "the address list: a tap selects (no push, no record); SELECT pushes the selected lot and records the
  // query" and "OUTPUT fold MEDIUM 1 (P35-D17 a, nothing pre-checked): a new debounced query clears the checked card, even when the same lot is listed again").
  it('T4 a tap on a row opens that lot and records the query; there is no Select button and no radio card', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: elm };
    type('383 El');
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId('parcel-search-select')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('parcel-candidate-5191692'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/5191692');
    expect(useRecentSearchesStore.getState().recent).toEqual(['383 El']);
  });
  it('T5 Enter on several matches keeps the rows and shows the hint; a capped list shows the refine line instead', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: elm };
    type('383 El');
    expect(screen.queryByTestId('parcel-search-hint')).toBeNull();
    enter();
    expect(screen.getByTestId('parcel-search-hint')).toBeTruthy();
    expect(screen.getByTestId('parcel-candidate-5106944')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    const ten = rows(...Array.from({ length: 10 }, (_, i): [string, string] => [`P${i}`, `12 Elm ${['Ave', 'St', 'Rd', 'Cres', 'Dr', 'Blvd', 'Crt', 'Pl', 'Way', 'Ln'][i]}`]));
    mockHook = { ...mockHook, data: ten };
    type('12 Elm');
    enter();
    expect(screen.getByTestId('parcel-search-refine')).toBeTruthy();
    expect(screen.queryByTestId('parcel-search-hint')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
  // Dated 2026-11-25 (task-465 T6; prior title kept: "a miss and an error record nothing; Retry calls refetch with no argument").
  it('T6 a miss shows only after Enter, as "No lot found for ..."; a miss and an error record nothing; Retry calls refetch with no argument', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match' } };
    type('108 Zzzz St');
    expect(screen.queryByTestId('parcel-search-empty')).toBeNull();
    enter();
    expect(within(screen.getByTestId('parcel-search-drop')).getByText('No lot found for 108 Zzzz St')).toBeTruthy();
    expect(screen.getByTestId('parcel-search-empty')).toBeTruthy();
    expect(screen.getByText('Check the house number and street name.')).toBeTruthy();
    mockHook = { ...mockHook, data: undefined, error: new Error('network') };
    type('108 Zzzz Str');
    fireEvent.press(screen.getByTestId('parcel-search-retry'));
    expect(mockHook.refetch).toHaveBeenCalledWith();
    expect(useRecentSearchesStore.getState().recent).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('T17 a short Enter shows the miss line: No lot found for 26, nothing fetched, no push (RR-0495)', () => {
    render(<Screen />);
    type('26');
    enter();
    expect(screen.getByTestId('parcel-search-empty')).toBeTruthy();
    expect(screen.getByText('No lot found for 26')).toBeTruthy();
    expect(mockHook.refetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId('parcel-search-prompt')).toBeNull();
  });
  it('T8 the first delete clears the list', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: elm };
    type('383 El');
    expect(screen.getByTestId('parcel-candidate-5106944')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '383 E');
    expect(screen.queryByTestId('parcel-candidate-5106944')).toBeNull();
    expect(screen.queryByTestId('parcel-search-drop')).toBeNull();
  });
  it('T9 the box is empty when the screen regains focus after it opened a page; a focus with no earlier push leaves the box alone', () => {
    render(<Screen />);
    type('41 Derw');
    focusAgain();
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('41 Derw');
    mockHook = { ...mockHook, data: hitAt('5293897', '41 Derwyn Rd') };
    type('41 Derwyn Rd');
    enter();
    expect(mockPush).toHaveBeenCalledTimes(1);
    focusAgain();
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('');
    expect(screen.getByTestId('parcel-search-suggestion-41 Derwyn Rd')).toBeTruthy();
    focusAgain();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  // Dated 2026-11-25 (task-465 T10; prior title kept: "an intersection pushes the map route (the list never renders) and records").
  it('T10 the map kinds open only on Enter: multi_parcel and an intersection push the disambiguate route with its kind', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: { match: null, candidates: [{ parcelId: '5259138', address: '78 Robert St' }, { parcelId: '5438421', address: '78 Robert St' }], warnings: [], parcel: null, resolution: 'multi_parcel' } };
    type('78 Robert St');
    expect(mockPush).not.toHaveBeenCalled();
    enter();
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/parcel-tool/disambiguate?q=78%20Robert%20St&kind=multi_parcel');
    mockHook = { ...mockHook, data: { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match' } };
    type('King and Bay');
    expect(mockPush).toHaveBeenCalledTimes(1);
    enter();
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/parcel-tool/disambiguate?q=King%20and%20Bay&kind=intersection');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(useRecentSearchesStore.getState().recent).toEqual(['King and Bay', '78 Robert St']);
  });
  it('T11 a held unsure lot opens its lot route on Enter (the report screen redirects to the semi page)', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: hitAt('5334051', '14 Norwood Ter') };
    type('14 Norwood Ter');
    enter();
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/5334051');
  });
  // Dated 2026-11-25 (task-465 T12; prior title kept: "task-450 AC1 (ruled B): a street with no house number shows the refine line and keeps the rows").
  it('T12 a street with no number: the refine line shows with the rows while typing and after Enter; no push (task-450 AC1, ruled B)', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Gerrard St');
    expect(screen.getByTestId('parcel-search-refine')).toBeTruthy();
    expect(screen.getByTestId('parcel-candidate-P1')).toBeTruthy();
    enter();
    expect(screen.getByTestId('parcel-search-refine')).toBeTruthy();
    expect(screen.getByTestId('parcel-candidate-P2')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    type('2 Gerrard St');
    expect(screen.queryByTestId('parcel-search-refine')).toBeNull();
  });
  // Dated 2026-11-25 (task-465 T13; prior title kept: "a chip sets the input (the debounce still applies); there is no in-bar account button (A.13)").
  it('T13 a chip tap runs its address at once (one push, no Enter); there is no in-bar account button (A.13)', () => {
    useRecentSearchesStore.getState().add('41 Derwyn Rd');
    mockHook = { ...mockHook, data: hitAt('5293897', '41 Derwyn Rd') };
    render(<Screen />);
    fireEvent.press(screen.getByTestId('parcel-search-suggestion-41 Derwyn Rd'));
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('41 Derwyn Rd');
    expect(mockCalls).toContain('41 Derwyn Rd');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/5293897');
    expect(screen.queryByTestId('parcel-search-account')).toBeNull();
  });
  it('T14 a blank Enter does nothing', () => {
    render(<Screen />);
    const before = JSON.stringify(screen.toJSON());
    enter();
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '   ');
    enter();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId('parcel-search-drop')).toBeNull();
    fireEvent.changeText(screen.getByTestId('parcel-search-input'), '');
    expect(JSON.stringify(screen.toJSON())).toBe(before);
  });
  it('T15 a row label is the address, else the parcel id', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: rows(['100114', ''], ['100116', '116 Bathurst St']) };
    type('11 Bathurst');
    expect(screen.getByLabelText('100114')).toBeTruthy();
    expect(screen.getByLabelText('116 Bathurst St')).toBeTruthy();
  });
  it('task-362 AC5: the drop-down report link opens Help in the in-app browser sheet with the topic and the typed address (search.html:235)', () => {
    render(<Screen />);
    mockHook = { ...mockHook, data: list };
    type('Bathurst St');
    fireEvent.press(screen.getByTestId('parcel-search-report'));
    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    // task-450 AC6 (B.7, doc-2:49): the link opens the help topic "Wrong address or lot".
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://maxbld.ca/help#topic=wrong-lot&q=Bathurst%20St');
    expect(mockPush).not.toHaveBeenCalled();
  });
  // Dated 2026-11-25 (task-465, RR-0495; prior title kept: "task-450 AC4 (L5): the prompt carries the minimum length from the setting, not a typed 3"):
  // the prompt line is dropped; the setting still fills {min} in the field's accessibility hint.
  it('task-450 AC4 (L5): the field hint carries the minimum length from the setting, not a typed 3', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SEARCH_MIN_QUERY_LEN } = require('@/components/surfaces/SearchBinding') as typeof import('@/components/surfaces/SearchBinding');
    render(<Screen />);
    expect(screen.getByTestId('parcel-search-input').props.accessibilityHint).toBe('Enter at least ' + SEARCH_MIN_QUERY_LEN + ' characters to search for a lot');
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
