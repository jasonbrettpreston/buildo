// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-25, task-267 LOAD.2 and task-317 LOAD.4: the loading screen and its endings),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 B1 (the parcel-checking key) and §6.5 (stable signals),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7 (dated note 2026-11-25: the app render of What we checked).
//
// task-267 + task-317 (PLAN-267-v2 section 5, C1-C11). The REAL lot route with the REAL hooks under a REAL QueryClient and fake timers; only the network
// (fetchWithAuth), expo-router, the auth store and Sentry are mocked. The fast read (fast=1) answers the What we checked view the server built (the
// committed loading-screen golden's `checked`, src/tests/fixtures/report-page/props/ready.mobile.json); the report read answers at the time each case sets.
// Rulings: RR-0176 (MD:785: the lines always run to completion; the button only when the report is in), RR-0491 (MD:2563: the approved mock), RR-0492
// item 3 (MD:2567: a failure shows right away), RR-0493 (MD:2571: 60 s from the pick is the failure limit), RR-0494 (MD:2575: no report shows at once),
// RR-0497 (MD:2588: after the 3 ruled retries or at 60 s).
require('react-native-css-interop/test');
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...jest.requireActual('@gorhom/bottom-sheet/mock') }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ parcelId: 'PIN-777' }),
}));
jest.mock('@/lib/apiClient', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(() => 'tok-1'), { getState: () => ({ accessToken: 'tok-1' }), setState: jest.fn() }),
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

import { fetchWithAuth } from '@/lib/apiClient';
import { ApiError, ReportLimitError } from '@/lib/errors';
import { reportClock } from '@/hooks/useParcelLookup';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/(app)/parcel-tool/[parcelId]').default as React.ComponentType;

type Json = Record<string, unknown>;
const REPO = path.resolve(__dirname, '..', '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'));
const CHECKED = rj('src/tests/fixtures/report-page/props/ready.mobile.json').checked as {
  groups: { key: string; lines: { key: string; text: string; verb: string; delay_ms: number; done_ms: number }[] }[]; ready: { text: string }; open: { text: string }; min_ms: number; summary: string;
};
const VIEW = rj('src/tests/fixtures/report-page/props/page_v21.mobile.json').view as Json;
const LIFE = (rj('scripts/surfaces/_schema/report-presentation.json').states as Json).lifecycle as Record<string, string>;
const OWN = rj('scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json') as Record<string, string>;
const MATCH = { parcelId: 'PIN-777', matchType: 'direct', address: '48 Larchmere Avenue' };
const answer = (o: Json) => ({ data: { match: MATCH, candidates: [], warnings: [], parcel: null, resolution: 'unique', map: null, page: null, lotForm: null, ...o } });
const FAST = answer({ whatWeChecked: CHECKED });
const PAGE = answer({ page: VIEW });
const MISS = answer({});
const ENTITLEMENT = { data: { status: 'active', reportsUsed: 10, reportsLimit: 10, reportsLeft: 0, reportsLimitReached: true, resetsOn: '2026-12-09T05:00:00.000Z', resetsOnDisplay: '9 Dec 2026' } };
const line = (g: number, l: number) => CHECKED.groups[g]!.lines[l]!;
const last = (): { g: number; l: number } => ({ g: CHECKED.groups.length - 1, l: CHECKED.groups[CHECKED.groups.length - 1]!.lines.length - 1 });

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;
type Report = () => Promise<unknown>;
let report: Report;
let fast: () => Promise<unknown>;
const calls = { fast: 0, report: 0 };
const after = <T,>(ms: number, v: T): Promise<T> => new Promise((res) => setTimeout(() => res(v), ms));
const failAfter = (ms: number, e: Error): Promise<never> => new Promise((_res, rej) => setTimeout(() => rej(e), ms));
const never = (): Promise<never> => new Promise(() => undefined);

let client: QueryClient;
const mount = () => render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
// Station fix (2026-11-25, 41fe484d3 C1-C11 red): one synchronous advance inside one act ran every timer before any promise settled and before React
// rendered, so the fast read's answer (a promise, then the library's notify timer, then a render, then the report read's start) never reached the screen
// inside a tick. The clock now advances in steps of the screen's redraw tick, each its own act with the microtasks flushed between timers
// (advanceTimersByTimeAsync), then three empty steps flush the last notify and render. A step is the hook's redraw tick (TICK_MS, 250 ms).
const STEP = 250;
const tick = async (ms: number): Promise<void> => {
  let left = ms;
  do {
    const s = Math.min(STEP, left);
    await act(async () => { await jest.advanceTimersByTimeAsync(s); });
    left -= s;
  } while (left > 0);
  for (let i = 0; i < 3; i += 1) await act(async () => { await jest.advanceTimersByTimeAsync(0); });
};

beforeEach(() => {
  jest.useFakeTimers();
  reportClock.reset();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }); // no garbage-collection timer left behind a test
  mockBack.mockClear(); mockReplace.mockClear();
  calls.fast = 0; calls.report = 0;
  fast = () => Promise.resolve(FAST);
  report = never;
  mockFetch.mockReset();
  mockFetch.mockImplementation(((url: string) => {
    if (url.startsWith('/api/parcels/entitlement')) return Promise.resolve(ENTITLEMENT);
    if (url.includes('fast=1')) { calls.fast += 1; return fast(); }
    calls.report += 1;
    return report();
  }) as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => { client.clear(); jest.useRealTimers(); jest.restoreAllMocks(); });

describe('C1 the lines play from the pick', () => {
  it('each line shows its verb at delay_ms and its finding at done_ms; the label Checks for this lot and the address in the bar', async () => {
    mount();
    await tick(0);
    expect(screen.getByText(OWN['checks.label']!)).toBeTruthy();
    expect(screen.getByText(MATCH.address)).toBeTruthy();
    expect(screen.getByText(line(0, 0).verb)).toBeTruthy();
    expect(screen.queryByText(line(0, 0).text)).toBeNull();
    expect(screen.queryByTestId(`report-line-${CHECKED.groups[0]!.key}-${line(0, 1).key}`)).toBeNull();
    await tick(line(0, 0).done_ms + STEP); // the screen redraws on its tick: a line turns within one tick of its time
    expect(screen.getByText(line(0, 0).text)).toBeTruthy();
    expect(screen.getByText(line(0, 1).verb)).toBeTruthy();
    expect(calls).toEqual({ fast: 1, report: 1 }); // the report read is sent once the fast read settles with no page
  });
});

describe('C2 a report in at 5 s waits for the lines (RR-0176)', () => {
  it('no View report and no ready sentence before the minimum; then both; no auto-open; no Skip; a press opens the page', async () => {
    report = () => after(5000, PAGE);
    mount();
    await tick(5000);
    expect(screen.queryByText(CHECKED.open.text)).toBeNull();
    expect(screen.queryByText(CHECKED.ready.text)).toBeNull();
    await tick(CHECKED.min_ms - 5000 - 500);
    expect(screen.queryByText(CHECKED.open.text)).toBeNull();
    await tick(1000);
    expect(screen.getByText(CHECKED.ready.text)).toBeTruthy();
    expect(screen.getByText(CHECKED.open.text)).toBeTruthy();
    await tick(10000);
    expect(screen.queryByTestId('report-page')).toBeNull(); // no auto-open
    expect(screen.queryByText('Skip')).toBeNull();
    fireEvent.press(screen.getByTestId('report-open'));
    await tick(0);
    expect(screen.getByTestId('report-page')).toBeTruthy();
  });
});

describe('C3 still building (RR-0491)', () => {
  it('no page at 30 s: the lines stay, the centred spinner and Loading the report…', async () => {
    mount();
    await tick(30000);
    expect(screen.getByTestId('report-holding')).toBeTruthy();
    expect(screen.getByText(LIFE.loading!)).toBeTruthy();
    const { g, l } = last();
    expect(screen.getByText(line(g, l).text)).toBeTruthy();
  });
});

describe('C4 the give-up at 60 s from the pick (RR-0493)', () => {
  it('no page at 60 s: the failure sentence and Try again, with the lines kept', async () => {
    mount();
    await tick(60500);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
    expect(screen.getByText(OWN['retry.text']!)).toBeTruthy();
    expect(screen.getByText(line(0, 0).text)).toBeTruthy();
  });
});

describe('C5 a failure shows right away (RR-0492 item 3; RR-0497 Q-a A)', () => {
  it('a 500 with the three retries spent shows the failure at once, the lines as far as they got', async () => {
    report = () => Promise.reject(new ApiError(500, 'boom'));
    mount();
    await tick(8000); // attempts at about 0, 1, 3 and 7 s (the library delays 1, 2 and 4 s)
    expect(calls.report).toBe(4);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
    const { g, l } = last();
    expect(screen.queryByTestId(`report-line-${CHECKED.groups[g]!.key}-${line(g, l).key}`)).toBeNull(); // the last line never started
    await tick(20000);
    expect(screen.queryByTestId(`report-line-${CHECKED.groups[g]!.key}-${line(g, l).key}`)).toBeNull(); // and never does: the reveal stopped
  });
  it('a compute that fails at 20 s each try: the failure at 60 s and no further retry afterwards', async () => {
    report = () => failAfter(20000, new ApiError(500, 'slow failure'));
    mount();
    await tick(59000);
    expect(screen.queryByText(LIFE.error!)).toBeNull();
    await tick(1500);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
    await tick(60000);
    expect(calls.report).toBe(3); // 0, 21 and 43 s; the third fails at 63 s, after the give-up, and is not retried
  });
});

describe('C6 no report for this lot (RR-0490 4 B, RR-0494)', () => {
  it('a miss at 0.1 s shows No report for this lot yet. and Back to search at once; one press goes back, a second does not', async () => {
    report = () => after(100, MISS);
    mount();
    await tick(500); // the fast read, then the report read answering at 0.1 s, then the render: well under a second (RR-0494)
    expect(screen.getByText(LIFE.miss!)).toBeTruthy();
    expect(screen.getByText(OWN['back_to_search.text']!)).toBeTruthy();
    fireEvent.press(screen.getByTestId('report-back-to-search'));
    fireEvent.press(screen.getByTestId('report-back-to-search'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('C7 Try again after the give-up', () => {
  it('a late page after the give-up: Try again shows it with no new read', async () => {
    report = () => after(70000, PAGE);
    mount();
    await tick(61000);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
    await tick(10000);
    expect(screen.getByText(LIFE.error!)).toBeTruthy(); // the late page waits in the cache
    const before = calls.report;
    fireEvent.press(screen.getByTestId('report-retry'));
    await tick(0);
    expect(screen.getByTestId('report-page')).toBeTruthy();
    expect(calls.report).toBe(before);
  });
  it('with no page: Try again shows still building with the lines in full; a second read that never answers ends on the failure at a fresh 60 s', async () => {
    mount();
    await tick(61000);
    fireEvent.press(screen.getByTestId('report-retry'));
    await tick(0);
    expect(screen.getByTestId('report-holding')).toBeTruthy();
    const { g, l } = last();
    expect(screen.getByText(line(g, l).text)).toBeTruthy();
    await tick(59000);
    expect(screen.queryByText(LIFE.error!)).toBeNull();
    await tick(1500);
    expect(screen.getByText(LIFE.error!)).toBeTruthy();
  });
});

describe('C8 Reduce Motion', () => {
  it('all lines at once and one announcement; the button still waits for the minimum', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    report = () => after(1000, PAGE);
    mount();
    await tick(100);
    const { g, l } = last();
    expect(screen.getByText(line(g, l).text)).toBeTruthy();
    await tick(5000);
    expect(screen.queryByText(CHECKED.open.text)).toBeNull();
    await tick(CHECKED.min_ms);
    expect(screen.getByText(CHECKED.open.text)).toBeTruthy();
    expect(announce.mock.calls).toEqual([[CHECKED.summary]]);
  });
});

describe('C9 Back during the compute, then the lot opened again', () => {
  it('the lines come back from the pick mark and the report read in flight is not sent again (an abandoned open is counted once)', async () => {
    report = () => after(15000, PAGE);
    const first = mount();
    await tick(5000);
    first.unmount();
    await tick(1000);
    mount();
    await tick(0);
    expect(screen.getByText(line(0, 0).text)).toBeTruthy(); // 6 s from the pick: the first line is done, not restarted
    expect(calls.report).toBe(1);
  });
});

describe('C10 the fast read fails', () => {
  it('no lines and the spinner with Loading the report…; the report read is still sent', async () => {
    fast = () => Promise.reject(new ApiError(500, 'fast down'));
    mount();
    await tick(10);
    expect(screen.queryByText(OWN['checks.label']!)).toBeNull();
    expect(screen.getByTestId('report-spinner')).toBeTruthy();
    expect(screen.getByText(LIFE.loading!)).toBeTruthy();
    expect(calls).toEqual({ fast: 1, report: 1 });
  });
});

describe('C11 a refused report read shows the wall, not the failure screen', () => {
  it('a 403 limit refusal shows the report-limit wall', async () => {
    report = () => Promise.reject(new ReportLimitError(10, '2026-12-09T05:00:00.000Z'));
    mount();
    await tick(100);
    expect(screen.getByTestId('parcel-wall-limit')).toBeTruthy();
    expect(screen.queryByText(LIFE.error!)).toBeNull();
  });
});
