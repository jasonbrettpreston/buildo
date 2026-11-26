// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §8.3 (gate-stability tests) and §6.5 (gate conditions must be stable signals);
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 and §4 (dated notes 2026-11-12, MF-48 Stage B / MF-74)
//
// FIX.SEMI (task-373, grounder D12). Spec 99 §8.3: "Each render gate condition (per §6.5) MUST have a test asserting that toggling `isFetching` does NOT flip the gate.
// Pattern: render the layout twice (once with isFetching=true, once with =false) - both must produce the same JSX." The gate here is the report route's state choice
// (mobile/app/(app)/parcel-tool/[parcelId].tsx: reportScreenState over data and isError; `isFetching` only holds the semi redirect effect, never a render branch).
// For each state the route can show, the route is rendered twice on the same lookup state, isFetching true then false; the two trees must be equal. The states
// are compared with themselves, never with each other (loading, miss, served page and error stay four different screens).
// task-267 (dated 2026-11-25, PLAN-267-v2 step 7): the route reads useReportScreen (the fast read, the report read and the clock); reportScreenState reads no
// isFetching. + the loading screen states with the lines (checking, ready, holding, and the endings with the lines).
require('react-native-css-interop/test');
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react-native';

jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...jest.requireActual('@gorhom/bottom-sheet/mock') }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ parcelId: 'PIN-777' }),
}));
type Hook = { data: unknown; isError: boolean; isFetching: boolean; refetch: jest.Mock };
let mockHook: Hook = { data: undefined, isError: false, isFetching: false, refetch: jest.fn() };
// task-452: the route also reads the entitlement read through useWallState (no refusal here, so no wall).
let mockExtra: Record<string, unknown> = {};
jest.mock('@/hooks/useParcelLookup', () => ({ useReportScreen: () => ({ ...{ checked: null, elapsedMs: 0, lineElapsedMs: 0, gaveUp: false, answeredThisVisit: true, opened: false, linesFull: false, open: jest.fn(), retry: jest.fn(), address: null, isError: false, isFetching: false, error: null }, ...mockHook, ...mockExtra }), useParcelEntitlement: () => ({ data: undefined, isFetching: false, isError: false }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/[parcelId]').default as React.ComponentType;

const REPO = path.resolve(__dirname, '..', '..');
const VIEW = (JSON.parse(fs.readFileSync(path.join(REPO, 'src/tests/fixtures/report-page/props/page_v21.mobile.json'), 'utf8')) as { view: unknown }).view;
const CHECKED = (JSON.parse(fs.readFileSync(path.join(REPO, 'src/tests/fixtures/report-page/props/ready.mobile.json'), 'utf8')) as { checked: unknown }).checked;
const hit = (page: unknown) => ({ match: { parcelId: 'PIN-777', matchType: 'direct', address: '26 Hurlingham Cres' }, candidates: [], warnings: [], parcel: null, resolution: 'unique', map: null, page });

describe('Spec 99 §8.3: toggling isFetching does not flip the report route gate', () => {
  it.each<[string, unknown, boolean]>([
    ['loading (pending, nothing cached)', undefined, false],
    ['the miss text (settled, page null)', hit(null), false],
    ['the served page', hit(VIEW), false],
    ['the error text (error, nothing cached)', undefined, true],
    ['the served page while a refetch runs after an error (offline cache)', hit(VIEW), true],
    // task-456 X5 (mcfixreborn-g3 GROUNDER-B.md:89, D4): the held unsure lot (SRCH.METER-2: `data && !ask`); basis as reportScreen.mount.behaviour.test.tsx:108.
    ['the held unsure lot (semi question owed)', { ...hit(null), lotForm: { detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true } }, false],
  ])('%s: the same tree with isFetching true and false', (_name, data, isError) => {
    mockExtra = {};
    mockHook = { data, isError, isFetching: true, refetch: jest.fn() };
    const fetching = render(<Screen />);
    const treeFetching = JSON.stringify(fetching.toJSON());
    fetching.unmount();
    mockHook = { data, isError, isFetching: false, refetch: jest.fn() };
    const settled = render(<Screen />);
    const treeSettled = JSON.stringify(settled.toJSON());
    settled.unmount();
    expect(treeFetching).not.toBe('null');
    expect(treeFetching).toBe(treeSettled);
  });
});

describe('task-267: the loading screen states hold under an isFetching toggle too', () => {
  it.each<[string, unknown, Record<string, unknown>]>([
    ['checking (the lines playing)', undefined, { checked: CHECKED, elapsedMs: 5000, lineElapsedMs: 5000 }],
    ['ready (the lines done, the report in)', hit(VIEW), { checked: CHECKED, elapsedMs: 23000, lineElapsedMs: 23000 }],
    ['holding (the lines done, no report)', undefined, { checked: CHECKED, elapsedMs: 30000, lineElapsedMs: 30000 }],
    ['the failure with the lines (the give-up)', undefined, { checked: CHECKED, elapsedMs: 60000, lineElapsedMs: 60000, gaveUp: true }],
    ['no report with the lines', hit(null), { checked: CHECKED, elapsedMs: 100, lineElapsedMs: 100 }],
  ])('%s: the same tree with isFetching true and false', (_name, data, extra) => {
    mockExtra = extra;
    mockHook = { data, isError: false, isFetching: true, refetch: jest.fn() };
    const fetching = render(<Screen />);
    const a = JSON.stringify(fetching.toJSON());
    fetching.unmount();
    mockHook = { data, isError: false, isFetching: false, refetch: jest.fn() };
    const settled = render(<Screen />);
    const b = JSON.stringify(settled.toJSON());
    settled.unmount();
    expect(a).not.toBe('null');
    expect(a).toBe(b);
  });
});
