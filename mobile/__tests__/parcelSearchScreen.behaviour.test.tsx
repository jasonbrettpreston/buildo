// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 and its dated note 2026-11-10, §2.9 (Toronto before the network),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c (recent searches, recorded only when a search opens a page),
//            docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated note 2026-11-10 (H9).
//
// MF-35 · the real search screen (mobile/app/(app)/parcel-tool/index.tsx) with a mocked useParcelSearch and expo-router, fake timers (plan v3 §9;
// must-survive rows 8, 10, 11, 22, 27, 28): the field shows typed text at once; 400 ms debounce; the mockHook gets '' outside Toronto; unique navigates
// once and records once; Back with the same query neither re-pushes nor re-records; a candidate tap selects and does not push; SELECT pushes and
// records; the map kinds push the disambiguate route; a miss, an error and outside Toronto record nothing; the account button opens Account.
require('react-native-css-interop/test');
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({ getString: () => null, set: () => undefined, remove: () => undefined }) }));
type Hook = { data?: unknown; isFetching: boolean; error: unknown; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
const mockCalls: string[] = [];
jest.mock('@/hooks/useParcelLookup', () => {
  class ParcelLookupSchemaError extends Error {}
  return { ParcelLookupSchemaError, useParcelSearch: (q: string) => { mockCalls.push(q); return mockHook; } };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/index').default as React.ComponentType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRecentSearchesStore } = require('@/store/recentSearchesStore') as typeof import('@/store/recentSearchesStore');

const hit = (parcelId: string) => ({ match: { parcelId, matchType: 'exact' }, candidates: [], warnings: [], parcel: null });
const list = { match: null, candidates: [{ parcelId: 'P1', address: '1 Bathurst St' }, { parcelId: 'P2', address: '2 Bathurst St' }], warnings: [], parcel: null };
const type = (text: string) => { fireEvent.changeText(screen.getByTestId('parcel-search-input'), text); act(() => { jest.advanceTimersByTime(400); }); };

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
  mockCalls.length = 0;
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
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
  it('a chip sets the input (the debounce still applies); the account button opens Account', () => {
    useRecentSearchesStore.getState().add('Bathurst St');
    render(<Screen />);
    fireEvent.press(screen.getByTestId('parcel-search-suggestion-Bathurst St'));
    expect(screen.getByTestId('parcel-search-input').props.value).toBe('Bathurst St');
    expect(mockCalls).not.toContain('Bathurst St');
    act(() => { jest.advanceTimersByTime(400); });
    expect(mockCalls).toContain('Bathurst St');
    fireEvent.press(screen.getByTestId('parcel-search-account'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/parcel-tool/account');
  });
});
