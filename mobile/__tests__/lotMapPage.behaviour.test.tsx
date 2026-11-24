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
// task-362 (AC1, AC5): the lot map page's Help link reaches the in-app browser sheet (small-pages-v8 choose-lot.html:279, search.html:235), not Linking.
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (u: string) => mockOpenBrowser(u) }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }), useLocalSearchParams: () => mockParams }));
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
const { ApiError, RateLimitError } = require('@/lib/errors') as typeof import('@/lib/errors');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Page = require('../app/(app)/parcel-tool/disambiguate').default as React.ComponentType;

type Input = { query: string; data?: unknown; error?: string; isFetching?: boolean; selectedParcelId?: string | null };
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/lotMap.situations.json'), 'utf8')) as { goldens: Record<string, { situation: string }>; inputs: Record<string, Input> };
const input = (k: string): Input => fixture.inputs[k]!;
// Dated 2026-11-20 (task-354; Mobile CI run 44741125636): + open_help. Since d20ddec5e (2026-11-19, SRCH.C12) the help link of the lot map is the action
// open_help, and SurfaceRenderer throws on an action the host does not list (SurfaceRenderer.tsx:113); the real mount lists it (disambiguate.tsx:51).
const actions = () => ({ change_input: jest.fn(), set_input: jest.fn(), retry: jest.fn(), select: jest.fn(), push: jest.fn(), back: jest.fn(), open_help: jest.fn() });
/** SEARCHFIX.3 X1 (task-451; GROUNDER-F :93, GROUNDER-G :83): the same error construction as lotMapScreens.golden.test.ts errorOf (and
 * scripts/surfaces/lotmap-golden-capture.ts), so the smoke renders the four error inputs as errors, not as the redirect tree. */
const errorOf = (kind: string | undefined, name: string): unknown =>
  kind === 'rate_limited' ? new RateLimitError(name === 'rate_limited_zero' ? 0 : 30)
    : kind === 'entitlement' ? new ApiError(403, 'forbidden')
      : kind === 'unexpected' || kind === 'schema_drift' ? new Error('boom') : null;
const parts = (name: string) => screen.UNSAFE_root.findAll((n: { props: Record<string, unknown>; type: unknown }) => n.props.rnmPart === name && typeof n.type !== 'string');

beforeEach(() => {
  mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockPush.mockClear(); mockReplace.mockClear(); mockBack.mockClear(); mockCanGoBack = true;
  mockCalls.length = 0;
  mockHook = { data: undefined, isFetching: false, error: null, refetch: jest.fn() };
});

describe('render smoke (FE-33 mobile LIST case): every golden situation renders through SurfaceRenderer', () => {
  it.each(['multi_parcel_2', 'multi_parcel_3plus', 'unlinked', 'too_many_lots', 'intersection', 'loading', 'error', 'rate_limited', 'unauthorized', 'schema_drift'])('%s', (k) => {
    const i = input(k);
    // SEARCHFIX.3 X1 (task-451, dated 2026-11-24; prior text passed error: null and schemaDrift: false for every input, so the four error inputs rendered the redirect tree).
    const s = buildLotMapSituation({ query: i.query, data: i.data as never, error: errorOf(i.error, k), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selectedParcelId: i.selectedParcelId ?? null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(screen.getByTestId('parcel-lotmap-screen')).toBeTruthy();
    expect(screen.getByTestId('parcel-lotmap-query').props.children).toEqual([i.query]);
  });
  // SEARCHFIX.3 X1 (task-451 AC5): each error input renders its own notice; only the unexpected error offers Retry (schema drift is our problem, retry will not help).
  it.each([['error', 'parcel-lotmap-error', true], ['rate_limited', 'parcel-lotmap-ratelimit', false], ['unauthorized', 'parcel-lotmap-entitlement', false], ['schema_drift', 'parcel-lotmap-error', false]] as const)('%s renders as an error (%s)', (k, id, retry) => {
    const i = input(k);
    const s = buildLotMapSituation({ query: i.query, data: i.data as never, error: errorOf(i.error, k), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selectedParcelId: i.selectedParcelId ?? null });
    expect([k, s.state]).toEqual([k, 'error']);
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(screen.getByTestId(id)).toBeTruthy();
    expect([k, screen.queryByTestId('parcel-lotmap-retry') !== null]).toEqual([k, retry]);
  });
  // Dated 2026-11-20 (task-354): the title said "dark props". The map is light since fdb6cd266 (2026-11-19, SRCH.DAYLIGHT: userInterfaceStyle 'light', LotMapBinding.tsx);
  // the same commit removed the card facts line (C.9), so the frontage and zoning facts reach the screen through the card's accessibility label, and the card title
  // is the lead line the card reads since 56e96eed5 (SRCH.LOTCARD, RR-0289: "Lot A · has the house · faces Dunmore Lane", "Lot B · no building").
  it('2 lots: two polygons, two letter markers and the pin; the map is hidden from screen readers with light props and no camera control', () => {
    const s = buildLotMapSituation({ query: '5 Elm St', data: input('multi_parcel_2').data as never, error: null, isFetching: false, schemaDrift: false, selectedParcelId: null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(parts('Polygon')).toHaveLength(2);
    expect(parts('Marker')).toHaveLength(3);
    const map = parts('MapView')[0]!;
    expect([map.props.userInterfaceStyle, Array.isArray(map.props.customMapStyle), map.props.rotateEnabled, map.props.pitchEnabled, 'region' in map.props]).toEqual(['light', true, false, false, false]);
    expect(map.props.initialRegion).toEqual(s.region);
    expect(screen.queryByTestId('parcel-lotmap-map')).toBeNull(); // hidden from the accessibility tree (RNTL's default query)
    const frame = screen.getByTestId('parcel-lotmap-map', { includeHiddenElements: true });
    expect([frame.props.importantForAccessibility, frame.props.accessibilityElementsHidden]).toEqual(['no-hide-descendants', true]);
    expect(screen.getByText('Lot A · has the house · faces Dunmore Lane')).toBeTruthy();
    // SEARCHFIX.3 V1 (task-451 AC2, dated 2026-11-24; MD:776 and doc-2 C.7 "Lot B · no building · at the back"; prior text: 'Lot B · no building'): a lot with no fronting street reads "at the back".
    expect(screen.getByText('Lot B · no building · at the back')).toBeTruthy();
    expect(screen.getByText('3,052 sq ft · 284 m²')).toBeTruthy();
    // SEARCHFIX.3 V3 (task-451 AC4, dated 2026-11-24; GROUNDER-H D1 "the spoken name is the visible text"; prior labels: 'Lot A, 3,052 sq ft · 284 m², frontage 7.6 m,
    // zoning RD (f12.0; a370)' and 'Lot B, 2,153 sq ft · 200 m², frontage 6.1 m, zoning —'): the label is the card's lead line and its area, nothing the card does not show.
    const labelA = screen.getByTestId('parcel-lotmap-card-PCL-A1').props.accessibilityLabel as string;
    const labelB = screen.getByTestId('parcel-lotmap-card-PCL-B2').props.accessibilityLabel as string;
    expect(labelA).toBe('Lot A · has the house · faces Dunmore Lane, 3,052 sq ft · 284 m²');
    expect(labelB).toBe('Lot B · no building · at the back, 2,153 sq ft · 200 m²');
    for (const l of [labelA, labelB]) expect(l).not.toMatch(/frontage|zoning/i);
    expect(screen.getByText('Choose a lot')).toBeTruthy();
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityLabel).toBe('Choose a lot'); // the spoken name is the visible text
  });
  it('SEARCHFIX.3 V1 (task-451 AC2): 3 lots: a house with no fronting street reads "at the back"; a lot that faces a street keeps "faces"', () => {
    const s = buildLotMapSituation({ query: '5 Elm St', data: input('multi_parcel_3plus').data as never, error: null, isFetching: false, schemaDrift: false, selectedParcelId: null });
    render(<SurfaceRenderer tree={lotMapProps(s) as never} content={LOT_MAP_SLICE.content} data={lotMapData(s)} actions={actions()} />);
    expect(screen.getByText('Lot A · has the house · at the back')).toBeTruthy();
    expect(screen.getByText('Lot B · no building · faces Dunmore Lane')).toBeTruthy();
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
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityLabel).toBe('Continue with Lot B'); // SEARCHFIX.3 V3: the label follows the visible text
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
    // SEARCHFIX.3 V2 (task-451 AC3, dated 2026-11-24; doc-2 B.6 "Try a nearby address or report it."; prior text ended "Try a nearby address."): the body, the link, the stop.
    expect(screen.getByText("We found 12 Laneway Rear, but the City's data doesn't link it to a lot yet. Try a nearby address or report it.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('parcel-lotmap-report'));
    expect(mockOpenBrowser.mock.calls).toEqual([['https://maxbld.ca/help#topic=wrong-lot&q=12%20Laneway%20Rear']]);
    // Dated 2026-11-20 (task-354; Mobile CI run 44741125636): the unlinked state draws no Continue since fdb6cd266 (2026-11-19, SRCH.DAYLIGHT, B.8 removed); nothing
    // is picked and there is nothing to press. The Help link is drawn (SRCH.C12).
    expect(screen.queryByTestId('parcel-lotmap-continue')).toBeNull();
    expect(screen.getByTestId('parcel-lotmap-help')).toBeTruthy();
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
  it('the Clear (X) button goes back when there is history, and replaces with the Lookup route on a cold open (NAV-AUDIT #64)', () => {
    mockParams = { q: '5 Elm St' };
    mockHook = { data: input('multi_parcel_2').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    const clear = screen.getByTestId('parcel-lotmap-clear');
    expect([clear.props.accessibilityRole, clear.props.accessibilityLabel]).toEqual(['button', 'Back to search']);
    fireEvent.press(clear);
    expect([mockBack.mock.calls.length, mockReplace.mock.calls]).toEqual([1, []]);
    mockCanGoBack = false;
    fireEvent.press(clear);
    expect([mockBack.mock.calls.length, mockReplace.mock.calls]).toEqual([1, [['/(app)/parcel-tool']]]);
  });
  it('the error notice Retry calls refetch', () => {
    mockParams = { q: '5 Elm St' };
    const refetch = jest.fn();
    mockHook = { data: undefined, isFetching: false, error: new Error('boom'), refetch };
    render(<Page />);
    fireEvent.press(screen.getByTestId('parcel-lotmap-retry'));
    expect(refetch).toHaveBeenCalled();
  });
  it('task-362 AC2 (choose-lot.html:278 <p class="small" id="pick-hint">): "Pick a lot on the map or in the list." shows while Choose a lot is disabled and is gone after a pick', () => {
    mockParams = { q: '5 Elm St' };
    mockHook = { data: input('multi_parcel_2').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('parcel-lotmap-pick-hint')).toBeTruthy();
    expect(screen.getByText('Pick a lot on the map or in the list.')).toBeTruthy();
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityHint).toBe('Pick a lot on the map or in the list.'); // aria-describedby="pick-hint"
    fireEvent.press(screen.getByTestId('parcel-lotmap-card-PCL-A1'));
    expect(screen.queryByTestId('parcel-lotmap-pick-hint')).toBeNull();
    expect(screen.queryByText('Pick a lot on the map or in the list.')).toBeNull();
    expect(screen.getByTestId('parcel-lotmap-continue').props.accessibilityHint).toBeUndefined();
  });
  // SEARCHFIX.3 B.7 (task-451, dated 2026-11-24; doc-2 B.7 "to /help?topic=wrong-lot"; prior title and URL: "with the lot_match topic", topic=lot_match).
  it('task-362 AC1, AC5: Get help with an address opens Help in the in-app browser sheet with the wrong-lot topic and the typed address', () => {
    mockParams = { q: '5 Elm St' };
    mockHook = { data: input('multi_parcel_2').data, isFetching: false, error: null, refetch: jest.fn() };
    render(<Page />);
    fireEvent.press(screen.getByTestId('parcel-lotmap-help'));
    expect(mockOpenBrowser.mock.calls).toEqual([['https://maxbld.ca/help#topic=wrong-lot&q=5%20Elm%20St']]);
  });
});
