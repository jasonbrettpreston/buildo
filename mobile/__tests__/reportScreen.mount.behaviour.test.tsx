// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 and §4 (dated notes 2026-11-12, MF-48 Stage B / MF-74),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7 dated note 2026-11-12 (Stage B), §0b item 11 (navigation is a route),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (loading is a gate state, not data),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-36, FE-38 (legacy values neither sent nor shown).
//
// MF-48 Stage B · T-B1 and T-B2 (operator 2026-11-12 "Ball y"; plan ~/Buildo-scratch/mcfrontend/MF-48/plan-stageB.md §3). The REAL lot route
// mobile/app/(app)/parcel-tool/[parcelId].tsx with a mocked lookup hook and expo-router:
//   T-B1 the route renders the REPORT host: a served page shows the page (the committed v21 mobile golden view); a settled lookup with page null,
//        a miss or a dangling id shows the approved miss text; pending with nothing cached shows loading; an error with nothing cached shows the
//        error text and Retry, whose press refetches once; an error WITH a cached page (offline, the persisted cache) still shows the page.
//        Carried over from the retired W-0 / EI-D1 lock (parcelDetailW0Hide.behaviour.test.tsx, retired with the old screen, MF-74 Q2 i): no
//        legacy size or cost label or value renders in any state, even when a server still sent a legacy menu and legacy headlines.
//   T-B2 Back: with history it goes back; on a cold open (deep link, no history) it replaces with the Lookup route; it has a role and a label.
require('react-native-css-interop/test');
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...jest.requireActual('@gorhom/bottom-sheet/mock') }));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn(), canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ parcelId: 'PIN-777' }),
}));
type Hook = { data: unknown; isError: boolean; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isError: false, refetch: jest.fn() };
const mockIds: unknown[] = [];
jest.mock('@/hooks/useParcelLookup', () => ({ useParcelLookup: (id: unknown) => { mockIds.push(id); return mockHook; } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/[parcelId]').default as React.ComponentType;

type Json = Record<string, unknown>;
const REPO = path.resolve(__dirname, '..', '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'));
const VIEW = rj('src/tests/fixtures/report-page/props/page_v21.mobile.json').view as Json;
const LIFE = (rj('scripts/surfaces/_schema/report-presentation.json').states as Json).lifecycle as Record<string, string>;
const OWN = rj('scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json') as Record<string, string>;
// A distinctive legacy payload: even if a server still sent these, nothing of them may render (EI-D1 / W-0, carried over).
const LEGACY_PARCEL = {
  costMenu: { menu: { _schema_version: 1, max_build: { total: 2503805, per_sqm: 6539, area: 382.9 }, kitchen: { per_sqm: 777 } }, scalars: { cost_fb_total: 2503805 } },
  areas: { lot_size_sqm: 400, opt_aor_gfa_sqm: 250, max_buildable_gfa_sqm: 999, max_build_stories: 3, max_build_fsi: 3.17, coa_fsi: 0.61, envelope_constrained: 'true', envelope_constraint_reason: 'setback-zq7' },
  neighbourhood: { summary: null, compStats: { compCount: null }, comparableBuilds: [], coaProjects: [] },
};
const hit = (page: Json | null) => ({ match: { parcelId: 'PIN-777', matchType: 'direct', address: '26 Hurlingham Cres' }, candidates: [], warnings: [], parcel: LEGACY_PARCEL, resolution: 'unique', map: null, page });
const LEGACY = /Max build FSI|Max buildable GFA|As-of-right GFA|Max build storeys|CoA FSI|What it costs|Envelope constrained|setback-zq7|maximum envelope|3\.17|10,753|2,503,805|\$0|Nearby examples|Committee of Adjustment/;

beforeEach(() => {
  mockReplace.mockClear(); mockBack.mockClear(); mockCanGoBack = true; mockIds.length = 0;
  mockHook = { data: undefined, isError: false, refetch: jest.fn() };
});
const noLegacy = (): void => expect(screen.queryAllByText(LEGACY)).toEqual([]);

describe('T-B1 the lot route mounts the REPORT host on the lookup query', () => {
  it('a served page: the v21 page renders (the golden view), the lookup is keyed on the route parcelId, no legacy text', () => {
    mockHook = { data: hit(VIEW), isError: false, refetch: jest.fn() };
    render(<Screen />);
    expect(mockIds).toContain('PIN-777');
    expect(screen.getByTestId('report-page')).toBeTruthy();
    for (const id of ['o1', 'o2', 'o3']) expect(screen.getByTestId(`report-${id}`)).toBeTruthy();
    expect(within(screen.getByTestId('report-o1-size-tile')).getByText('2,670')).toBeTruthy();
    noLegacy();
  });
  it.each([
    ['page null (every lot until MB-44)', hit(null)],
    ['an older server (no page key)', { ...hit(null), page: undefined }],
    ['a miss', { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match', map: null, page: null }],
  ])('%s: the approved miss text, no page, no legacy text', (_n, data) => {
    mockHook = { data, isError: false, refetch: jest.fn() };
    render(<Screen />);
    expect(screen.getByText(LIFE.miss!)).toBeTruthy();
    expect(screen.queryByTestId('report-page')).toBeNull();
    noLegacy();
  });
  it('pending with nothing cached: the loading text and spinner (a gate state, not data)', () => {
    render(<Screen />);
    expect(screen.getByText(LIFE.loading!)).toBeTruthy();
    expect(screen.getByTestId('report-spinner')).toBeTruthy();
  });
  it('an error with nothing cached: the error text and Retry ("Try again"); a press refetches once', () => {
    mockHook = { data: undefined, isError: true, refetch: jest.fn() };
    render(<Screen />);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
    expect(within(screen.getByTestId('report-retry')).getByText(OWN['retry.text']!)).toBeTruthy();
    fireEvent.press(screen.getByTestId('report-retry'));
    expect(mockHook.refetch).toHaveBeenCalledTimes(1);
  });
  it('offline: an error with a cached page still shows the page, never the error', () => {
    mockHook = { data: hit(VIEW), isError: true, refetch: jest.fn() };
    render(<Screen />);
    expect(screen.getByTestId('report-page')).toBeTruthy();
    expect(screen.queryByText(LIFE.error!)).toBeNull();
    expect(screen.queryByTestId('report-retry')).toBeNull();
  });
});

describe('T-B2 Back is a route (FE-36; NAV-AUDIT #3, the MF-53 rule)', () => {
  it('with history: router.back(); the control is a labelled button', () => {
    mockHook = { data: hit(null), isError: false, refetch: jest.fn() };
    render(<Screen />);
    const back = screen.getByTestId('report-back');
    expect(back.props.accessibilityRole).toBe('button');
    expect(within(back).getByText(OWN['back.text']!)).toBeTruthy();
    fireEvent.press(back);
    expect([mockBack.mock.calls.length, mockReplace.mock.calls.length]).toEqual([1, 0]);
  });
  it('a cold open (no history): replaces with the Lookup route', () => {
    mockCanGoBack = false;
    render(<Screen />);
    fireEvent.press(screen.getByTestId('report-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool']]);
  });
});
