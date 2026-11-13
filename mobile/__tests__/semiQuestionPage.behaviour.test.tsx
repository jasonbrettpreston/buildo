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
import { fireEvent, render, screen } from '@testing-library/react-native';

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
jest.mock('@/hooks/useParcelLookup', () => {
  class ParcelLookupSchemaError extends Error {}
  return { ParcelLookupSchemaError, useParcelLookup: (id: string | undefined) => { mockCalls.push(id); return mockHook; } };
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
  mockCalls.length = 0;
  mockParams = { parcelId: 'PCL-S1' };
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
});

describe('the question page (semi-question.tsx)', () => {
  it('asks the ruled question with exactly three answers; reads the report query; nothing selected; Continue disabled', () => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    expect(mockCalls.at(-1)).toBe('PCL-S1');
    expect(screen.getByText('Is this house one half of a semi-detached pair?')).toBeTruthy();
    expect(screen.getByText("Yes, it's one half of a semi")).toBeTruthy();
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
  ])('answer %s opens the report with the right param (not sure sends no override)', (answer, route) => {
    mockHook = { ...mockHook, data: data(form(true)) };
    render(<Question />);
    fireEvent.press(screen.getByTestId(`parcel-semi-answer-${answer}`));
    expect(screen.getByTestId(`parcel-semi-answer-${answer}`).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('parcel-semi-continue'));
    expect(mockReplace.mock.calls).toEqual([[route]]);
    expect(mockPush).not.toHaveBeenCalled();
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
  it('an error shows its notice and Retry refetches', () => {
    mockHook = { ...mockHook, error: new Error('boom') };
    render(<Question />);
    expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('parcel-semi-retry'));
    expect(mockHook.refetch).toHaveBeenCalledTimes(1);
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
