// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (one render smoke per archetype per platform), FE-31;
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (a redirect fires on the first settled data only);
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B); docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4.
//
// SEMI-B · the one-question page rendered for real (operator "semi ask a", 2026-11-13: ask ONLY in the unsure band; "Is this house one half of a
// semi-detached pair?" with three answers). The real mounts with a mocked useParcelLookup and expo-router:
//   - the question page: exactly three answers, nothing selected at open, Continue disabled until one is chosen, each answer opens the report
//     with the right route param (not sure sends no override), a lot that is not unsure goes straight to the report, a settled redirect fires once;
//   - the report mount: an unsure lot replaces the route with the question ONCE, a `semi` param or an older server (no block) never redirects.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-css-interop/test');
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SEMI_CONTINUE_WAIT_MS } from '@/lib/semiQuestion';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockParams: { parcelId?: string; semi?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }), useLocalSearchParams: () => mockParams }));
type Hook = { data?: unknown; isFetching: boolean; isError?: boolean; error: unknown; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
const mockCalls: Array<string | undefined> = [];
const mockFetchLookup = jest.fn();
// FIX.SEMI (task-373, D5): Continue's lookup runs through the mutation hook useAnswerParcelLookup (Spec 99 99:219); here its mutateAsync is the same bounded wait over
// the same mocked fetch (the real boundedWait), so every case below asserts what it asserted before.
const mockAnswerCalls: string[] = [];
// SRCH.SEMI stage 2 (task-319): Continue stores the answered lookup in the report's cache entry (through useSetParcelLookup since task-353; same key and value).
const mockSetQueryData = jest.fn();
jest.mock('@/hooks/useParcelLookup', () => {
  class ParcelLookupSchemaError extends Error {}
  const { boundedWait, SEMI_CONTINUE_WAIT_MS } = jest.requireActual('@/lib/semiQuestion');
  return { ParcelLookupSchemaError, useAnswerParcelLookup: () => ({ mutateAsync: (parcelId: string) => { mockAnswerCalls.push(parcelId); return boundedWait(mockFetchLookup({ parcelId, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS); } }), fetchParcelLookup: (...a: unknown[]) => mockFetchLookup(...a), useParcelLookup: (id: string | undefined) => { mockCalls.push(id); return mockHook; }, useSetParcelLookup: () => (id: string, result: unknown) => mockSetQueryData(['parcel-lookup', id], result) };
});
jest.mock('@/components/surfaces/ReportPageHost', () => {
  const { View } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return { ReportPageHost: () => R.createElement(View, { testID: 'report-host' }) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Question = require('../app/(app)/parcel-tool/semi-question').default as React.ComponentType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Report = require('../app/(app)/parcel-tool/[parcelId]').default as React.ComponentType;

const form = (unsure: boolean) => ({ detected: 'semi_half', basis: 'doubt_multi_parcel_abut', unsure });
const data = (lotForm?: unknown) => ({ match: { parcelId: 'PCL-S1', matchType: 'exact', address: '5 Elm St' }, candidates: [], warnings: [], parcel: null, page: null, ...(lotForm === undefined ? {} : { lotForm }) });

beforeEach(() => {
  mockPush.mockClear(); mockReplace.mockClear(); mockBack.mockClear(); mockCanGoBack = true;
  mockCalls.length = 0; mockAnswerCalls.length = 0;
  mockFetchLookup.mockReset(); mockSetQueryData.mockReset();
  mockFetchLookup.mockResolvedValue(data(form(true)));
  mockParams = { parcelId: 'PCL-S1' };
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
});

describe('the question page (semi-question.tsx)', () => {
  it('asks the ruled question with exactly three answers; reads the report query; nothing selected; Continue disabled', () => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    expect(mockCalls.at(-1)).toBe('PCL-S1');
    expect(screen.getByText('Is this house one half of a semi-detached pair?')).toBeTruthy();
    expect(screen.getByText('Yes, it’s one half of a semi')).toBeTruthy(); // task-450 Q8: the curly apostrophe
    expect(screen.getByText("No, it's detached")).toBeTruthy();
    expect(screen.getByText('Not sure')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByRole('radio').filter((n) => n.props.accessibilityState?.checked === true)).toHaveLength(0);
    expect(screen.getByTestId('parcel-semi-continue').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it.each([
    ['yes', '/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=semi_half'],
    ['no', '/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=detached'],
    ['not_sure', '/(app)/parcel-tool/PCL-S1?semi=answered'],
  ])('answer %s: Continue fetches the lookup with semi=answered, stores it in the report cache entry, then opens the report once', async (answer, route) => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId(`parcel-semi-answer-${answer}`));
    expect(screen.getByTestId(`parcel-semi-answer-${answer}`).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await waitFor(() => expect(mockReplace.mock.calls).toEqual([[route]]));
    expect(mockFetchLookup.mock.calls).toEqual([[{ parcelId: 'PCL-S1', semi: 'answered' }]]);
    expect(mockSetQueryData.mock.calls).toEqual([[['parcel-lookup', 'PCL-S1'], data(form(true))]]);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('FIX.SEMI (task-373, D5): Continue asks the answered lookup of the mutation hook, once, with the page id; the page imports no raw fetch of its own', async () => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-no'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockAnswerCalls).toEqual(['PCL-S1']);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = (require('node:fs') as typeof import('node:fs')).readFileSync(`${__dirname}/../app/(app)/parcel-tool/semi-question.tsx`, 'utf8');
    expect(src).not.toMatch(/fetchParcelLookup/);
  });
  it('a double press while the fetch runs sends one fetch and one replace', async () => {
    let done: (v: unknown) => void = () => undefined;
    mockFetchLookup.mockReturnValue(new Promise((r) => { done = r; }));
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-yes'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await act(async () => { done(data(form(true))); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockFetchLookup).toHaveBeenCalledTimes(1);
  });
  // SRCH.SEMI-3 (task-361; findings UX-4, CR-1, LX-R2, LX-E1 of BL-TRIAGE/VERDICTS.md).
  // Dated 2026-11-20 (task-354; Mobile CI run 44741125636): "idle" is read as busy === undefined, not as "no busy key". React Native's Pressable always builds
  // accessibilityState with the keys busy, checked, disabled, expanded and selected (node_modules/react-native/Libraries/Components/Pressable/Pressable.js:221,
  // `busy: ariaBusy ?? accessibilityState?.busy`), so an idle Continue carries `busy: undefined` and toHaveProperty('busy') is true for it. The binding itself
  // sends no busy key when idle (SemiQuestionBinding.tsx:99; pinned in semiQuestionScreens.golden.test.ts:151).
  it('semi-question.html:130 `.btn.p[aria-busy="true"]`: while Continue is pending the Continue node is busy; it is idle again after the report opens', async () => {
    let done: (v: unknown) => void = () => undefined;
    mockFetchLookup.mockReturnValue(new Promise((r) => { done = r; }));
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-yes'));
    expect(screen.getByTestId('parcel-semi-continue').props.accessibilityState.busy).toBeUndefined();
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    expect(screen.getByTestId('parcel-semi-continue').props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => { done(data(form(true))); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('parcel-semi-continue').props.accessibilityState.busy).toBeUndefined();
  });
  it('a screen whose effects ran cleanup and then again (Fast Refresh, StrictMode) still opens the report after the lookup resolves', async () => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<React.StrictMode><Question /></React.StrictMode>);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-no'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await waitFor(() => expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=detached']]));
  });
  it('leaving the page while the lookup runs opens nothing', async () => {
    let done: (v: unknown) => void = () => undefined;
    mockFetchLookup.mockReturnValue(new Promise((r) => { done = r; }));
    mockHook = { ...mockHook, data: data(form(true)) };
    const view = render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-yes'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    view.unmount();
    await act(async () => { done(data(form(true))); });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetQueryData).not.toHaveBeenCalled();
  });
  it('an empty parcel id never calls the lookup and never navigates', async () => {
    mockParams = {};
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-yes'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await act(async () => { await Promise.resolve(); });
    expect(mockFetchLookup).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('a Continue whose lookup never settles ends in the built error state after the bounded wait, and the next Continue works', async () => {
    jest.useFakeTimers();
    try {
      mockFetchLookup.mockReturnValueOnce(new Promise(() => undefined));
      mockHook = { ...mockHook, data: data(form(true)) };
      render(<Question />);
      fireEvent.press(screen.getByTestId('parcel-semi-answer-yes'));
      fireEvent.press(screen.getByTestId('parcel-semi-continue'));
      await act(async () => { jest.advanceTimersByTime(SEMI_CONTINUE_WAIT_MS - 1); });
      expect(screen.queryByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeNull();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
      fireEvent.press(screen.getByTestId('parcel-semi-retry'));
      expect(screen.getByTestId('parcel-semi-answer-yes').props.accessibilityState).toMatchObject({ checked: true });
      expect(screen.getByTestId('parcel-semi-continue').props.accessibilityState.busy).toBeUndefined();
      fireEvent.press(screen.getByTestId('parcel-semi-continue'));
      await waitFor(() => expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=semi_half']]));
      expect(mockFetchLookup).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
  it('a failed fetch at Continue shows the built error state, does not navigate, and Try again brings the question back with the answer still chosen', async () => {
    mockFetchLookup.mockRejectedValue(new Error('boom'));
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-answer-no'));
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    await waitFor(() => expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetQueryData).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('parcel-semi-retry'));
    expect(mockHook.refetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('parcel-semi-answer-no').props.accessibilityState).toMatchObject({ checked: true });
  });
  it('a lot that is not unsure goes straight to the report, once, on settled data only', () => {
    mockHook = { ...mockHook, data: data(form(false)), isFetching: true };
    const view = render(<Question />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockHook = { ...mockHook, isFetching: false };
    view.rerender(<Question />);
    view.rerender(<Question />);
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/PCL-S1']]);
  });
  it('an older server (no lotForm) goes straight to the report', () => {
    mockHook = { ...mockHook, data: data() };
    render(<Question />);
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/PCL-S1']]);
  });
  it('the back button goes back with history, else to the Lookup route', () => {
    mockHook = { ...mockHook, data: data(form(true)) };
    const view = render(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    view.rerender(<Question />);
    fireEvent.press(screen.getByTestId('parcel-semi-back'));
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool']]);
  });
  it('task-450 AC5 (V5): opened cold and offline (no data, not fetching, no error) the page shows loading and does not redirect', () => {
    mockHook = { ...mockHook, data: undefined, isFetching: false, error: null };
    const view = render(<Question />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Searching')).toBeTruthy();
    mockHook = { ...mockHook, isFetching: true };
    view.rerender(<Question />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Searching')).toBeTruthy();
    mockHook = { ...mockHook, isFetching: false };
    view.rerender(<Question />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('task-450 AC5 (V5): an empty parcel id with no data still goes to the Lookup route', () => {
    mockParams = {};
    mockHook = { ...mockHook, data: undefined, isFetching: false, error: null };
    render(<Question />);
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool']]);
  });
  it('an error shows its notice and Retry refetches', () => {
    mockHook = { ...mockHook, error: new Error('boom') };
    render(<Question />);
    expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('parcel-semi-retry'));
    expect(mockHook.refetch).toHaveBeenCalledTimes(1);
  });
  // task-457 AC1 (RR-0456 Q4, MORNING-DECISIONS.md:2362 "Q4 add a limit"): the opening wait is bounded by the page's own wait limit (continue_wait_ms).
  it('task-457 AC1: opened with no connection, the page stops waiting after the limit and shows the could-not-load message with Try again; Try again fetches again and waits again', async () => {
    jest.useFakeTimers();
    try {
      mockHook = { ...mockHook, data: undefined, isFetching: false, error: null };
      render(<Question />);
      await act(async () => { jest.advanceTimersByTime(SEMI_CONTINUE_WAIT_MS - 1); });
      expect(screen.getByText('Searching')).toBeTruthy();
      expect(screen.queryByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeNull();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
      expect(screen.queryByText('Searching')).toBeNull();
      expect(mockReplace).not.toHaveBeenCalled();
      fireEvent.press(screen.getByTestId('parcel-semi-retry'));
      expect(mockHook.refetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Searching')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(SEMI_CONTINUE_WAIT_MS); });
      expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
  it('task-457: data arriving after the limit opens the question', async () => {
    jest.useFakeTimers();
    try {
      mockHook = { ...mockHook, data: undefined, isFetching: false, error: null };
      const view = render(<Question />);
      await act(async () => { jest.advanceTimersByTime(SEMI_CONTINUE_WAIT_MS); });
      expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
      mockHook = { ...mockHook, data: data(form(true)) };
      view.rerender(<Question />);
      expect(screen.getByText('Is this house one half of a semi-detached pair?')).toBeTruthy();
      expect(screen.queryByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the report mount (the redirect)', () => {
  it('an unsure lot replaces the route with the question once, on the first settled data', () => {
    mockHook = { ...mockHook, data: data(form(true)), isFetching: true };
    const view = render(<Report />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockHook = { ...mockHook, isFetching: false };
    view.rerender(<Report />);
    view.rerender(<Report />);
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/semi-question?parcelId=PCL-S1']]);
  });
  it('a `semi` param (answered) never asks again', () => {
    mockParams = { parcelId: 'PCL-S1', semi: 'answered' };
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Report />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('a clear lot, an older server (no block) and a null block never redirect', () => {
    for (const d of [data(form(false)), data(), data(null)]) {
      mockReplace.mockClear();
      mockHook = { ...mockHook, data: d };
      const view = render(<Report />);
      expect(mockReplace).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});
