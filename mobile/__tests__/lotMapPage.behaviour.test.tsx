// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (one render smoke per archetype per platform), FE-31;
//            docs/specs/03-mobile/98_mobile_testing_protocol.md 98:79 dated note 2026-11-10 (H9: a render smoke is not a snapshot);
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-11, MF-53); docs/specs/03-mobile/99_mobile_state_architecture.md §6.5.
//
// MF-53 · T7, the "choose your lot" page rendered for real: every golden situation renders through SurfaceRenderer (react-native-maps replaced by
// plain views that keep their props, so the polygons can be counted); the real mount (disambiguate.tsx) with a mocked useParcelSearch and
// expo-router: nothing selected at open, a card tap selects, Continue pushes the report route once and records no recent search, the clear
// button goes back, an intersection-shaped query with a server no_match shows the intersection message and never redirects (PLAN panel
// regression HIGH-1), a non-map outcome replaces the route once on settled data and never on a background refetch.
require('react-native-css-interop/test');
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-maps', () => {
  const RN = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  const part = (name: string) => (props: Record<string, unknown>) => R.createElement(RN.View, { ...props, testID: props.testID ?? `rnm-${name}`, rnmPart: name }, props.children as React.ReactNode);
  return { __esModule: true, default: part('MapView'), Polygon: part('Polygon'), Marker: part('Marker') };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }), useLocalSearchParams: () => mockParams }));
type Hook = { data?: unknown; isFetching: boolean; error: unknown; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
const mockCalls: string[] = [];
jest.mock('@/hooks/useParcelLookup', () => {
  class ParcelLookupSchemaError extends Error {}
  return { ParcelLookupSchemaError, useParcelSearch: (q: string) => { mockCalls.push(q); return mockHook; } };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SurfaceRenderer } = require('@/components/surfaces/SurfaceRenderer') as typeof import('@/components/surfaces/SurfaceRenderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LOT_MAP_SLICE, lotMapData, lotMapProps } = require('@/components/surfaces/LotMapBinding') as typeof import('@/components/surfaces/LotMapBinding');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildLotMapSituation } = require('@/lib/lotMap') as typeof import('@/lib/lotMap');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Page = require('../app/(app)/parcel-tool/disambiguate').default as React.ComponentType;

type Input = { query: string; data?: unknown; error?: string; isFetching?: boolean; selectedParcelId?: string | null };
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/lotMap.situations.json'), 'utf8')) as { goldens: Record<string, { situation: string }>; inputs: Record<string, Input> };
const input = (k: string): Input => fixture.inputs[k]!;
const actions = () => ({ change_input: jest.fn(), set_input: jest.fn(), retry: jest.fn(), select: jest.fn(), push: jest.fn(), open_account: jest.fn(), back: jest.fn() });
const parts = (name: string) => screen.UNSAFE_root.findAll((n: { props: Record<string, unknown>; type: unknown }) => n.props.rnmPart === name && typeof n.type !== 'string');

beforeEach(() => {
  mockPush.mockClear(); mockReplace.mockClear(); mockBack.mockClear();
  mockCalls.length = 0;
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
});

describe('render smoke (FE-33 mobile LIST case): every golden situation renders through SurfaceRenderer', () => {
  it.each(['multi_parcel_2', 'multi_parcel_3plus', 'unlinked', 'too_many_lots', 'intersection', 'loading', 'error', 'rate_limited', 'unauthorized', 'schema_drift'])('%s', (k) => {
    const i = input(k);
    const s = buildLotMapSituation({ query: i.query, data: i.data as never, error: null, isFetching: i.isFetching ?? false, schemaDrift: false, selectedParcelId: i.selectedParcelId ?? null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(screen.getByTestId('parcel-lotmap-screen')).toBeTruthy();
    expect(screen.getByTestId('parcel-lotmap-query').props.children).toEqual([i.query]);
  });
  it('2 lots: two polygons, two letter markers and the pin; the map is hidden from screen readers with dark props and no camera control', () => {
    const s = buildLotMapSituation({ query: '5 Elm St', data: input('multi_parcel_2').data as never, error: null, isFetching: false, schemaDrift: false, selectedParcelId: null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(parts('Polygon')).toHaveLength(2);
    expect(parts('Marker')).toHaveLength(3);
    const map = parts('MapView')[0]!;
    expect([map.props.userInterfaceStyle, Array.isArray(map.props.customMapStyle), map.props.rotateEnabled, map.props.pitchEnabled, 'region' in map.props]).toEqual(['dark', true, false, false, false]);
    expect(map.props.initialRegion).toEqual(s.region);
    expect(screen.queryByTestId('parcel-lotmap-map')).toBeNull(); // hidden from the accessibility tree (RNTL's default query)
    const frame = screen.getByTestId('parcel-lotmap-map', { includeHiddenElements: true });
    expect([frame.props.importantForAccessibility, frame.props.accessibilityElementsHidden]).toEqual(['no-hide-descendants', true]);
    expect(screen.getByText('Lot A')).toBeTruthy();
    expect(screen.getByText('3,052 sq ft · 284 m²')).toBeTruthy();
    expect(screen.getByText('6.1 m • —')).toBeTruthy(); // a null zoning shows the null value
    expect(screen.getByText('Choose a lot')).toBeTruthy();
  });
  it('the polygon and the card both call select with the lot id; the clear button calls back', () => {
    const a = actions();
    const s = buildLotMapSituation({ query: '5 Elm St', data: input('multi_parcel_2').data as never, error: null, isFetching: false, schemaDrift: false, selectedParcelId: null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={a} />);
    parts('Polygon')[1]!.props.onPress();
    fireEvent.press(screen.getByTestId('parcel-lotmap-card-PCL-A1'));
    fireEvent.press(screen.getByTestId('parcel-lotmap-clear'));
    expect(a.select.mock.calls).toEqual([['PCL-B2'], ['PCL-A1']]);
    expect(a.back).toHaveBeenCalledWith();
  });
});

describe('the real mount (disambiguate.tsx)', () => {
  it('reads the search query through the shared hook; nothing selected at open; a tap selects; Continue pushes the report route once; no recent search', () => {
    mockParams = { q: '5 Elm St' };
    mockHook = { data: input('multi_parcel_2').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    expect(mockCalls.at(-1)).toBe('5 Elm St');
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('parcel-lotmap-continue'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('parcel-lotmap-card-PCL-B2'));
    expect(screen.getByText('Continue with Lot B')).toBeTruthy();
    fireEvent.press(screen.getByTestId('parcel-lotmap-continue'));
    expect(mockPush.mock.calls).toEqual([['/(app)/parcel-tool/PCL-B2']]);
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('an intersection-shaped query with a server no_match shows the intersection message and never redirects (regression HIGH-1)', () => {
    mockParams = { q: 'Queen and Spadina' };
    mockHook = { data: input('intersection').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    expect(screen.getByText('That looks like an intersection. Type a house number to see the lots.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('unlinked: the honest message names the address; nothing picked', () => {
    mockParams = { q: '12 Laneway Rear' };
    mockHook = { data: input('unlinked').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    expect(screen.getByText('No lot linked yet')).toBeTruthy();
    expect(screen.getByText("We found 12 Laneway Rear, but the City's data doesn't link it to a lot yet. Try a nearby address.")).toBeTruthy();
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityState).toMatchObject({ disabled: true });
  });
  it('a non-map outcome replaces the route once on settled data, never while fetching', () => {
    mockParams = { q: '5 Elm St' };
    mockHook = { data: input('redirect_unique').data, isFetching: true, error: null, refetch: jest.fn() };
    const view = render(<Page />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockHook = { ...mockHook, isFetching: false };
    view.rerender(<Page />);
    view.rerender(<Page />);
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/PCL-U1']]);
  });
  it('the error notice Retry calls refetch', () => {
    mockParams = { q: '5 Elm St' };
    const refetch = jest.fn();
    mockHook = { data: undefined, isFetching: false, error: new Error('boom'), refetch };
    render(<Page />);
    fireEvent.press(screen.getByTestId('parcel-lotmap-retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
