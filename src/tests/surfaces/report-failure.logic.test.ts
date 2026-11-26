// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-25, task-267 LOAD.2 and task-317 LOAD.4: the loading screen and its endings),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (gate conditions are stable signals) and §8.3 (toggling isFetching never flips a gate),
//            docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.56 (a lock has a planted defect).
//
// task-267 + task-317 (PLAN-267-v2 section 5; 317 R2): reportScreenState (mobile/src/components/surfaces/ReportBinding.tsx) is total over the report screen's
// stable signals and picks one of view, checking, ready, holding, error, miss. Rulings: RR-0176 (MD:785: the lines always run to completion, the button only
// when the report is in), RR-0492 item 3 (MD:2567: a failure shows right away), RR-0493 (MD:2571: 60 s from the pick is the failure limit), RR-0494
// (MD:2575: no report shows at once), RR-0485 item 5 (MD:2533: no lines for an opened or stored lot). The table has a planted-defect test (fe.56).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The binding imports two mobile-alias modules (`@/` is the mobile tsconfig's); mocked for this file only, from the real files (the precedent:
// admin-lead-schemas.contract.test.ts). The binding is loaded by a dynamic import so the web tsconfig never traces the mobile alias.
vi.mock('@/constants/reportPage', async () => import('../../../mobile/src/constants/reportPage'));
vi.mock('@/generated/surfaces/mobile_parcel_detail.json', () => ({
  default: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mobile/src/generated/surfaces/mobile_parcel_detail.json'), 'utf8')),
}));

type Json = Record<string, unknown>;
type Signals = {
  data: { page?: Json | null } | undefined; checked: Json | null; isError: boolean; elapsedMs: number; gaveUp: boolean;
  answeredThisVisit: boolean; opened: boolean; linesFull: boolean;
};
type State = (q: Signals) => { view: unknown; lifecycle: string; screen: string };
let reportScreenState: State;
const BINDING = '../../../mobile/src/components/surfaces/ReportBinding';
beforeAll(async () => {
  const m = (await import(/* @vite-ignore */ BINDING)) as { reportScreenState: State };
  reportScreenState = m.reportScreenState;
});

const PAGE = { target: 'mobile', layout: { details: 'collapsed' }, sections: [] };
const CHECKED = { summary: 's', groups: [], skip: { text: 'Skip', after_ms: 0 }, ready: { text: 'r', at_ms: 21494 }, open: { text: 'View report' }, min_ms: 23000, paced: true, href: null };
const base: Signals = { data: undefined, checked: CHECKED, isError: false, elapsedMs: 0, gaveUp: false, answeredThisVisit: false, opened: false, linesFull: false };
const at = (o: Partial<Signals>): Signals => ({ ...base, ...o });

// [name, signals, expected screen, expected lifecycle]
const ROWS: Array<[string, Signals, string, string]> = [
  ['a cached page (opened on this phone): view at once, no lines', at({ data: { page: PAGE }, checked: null }), 'view', 'loading'],
  ['a page with no checked view (a stored lot, or the fast read gave none): view at once', at({ data: { page: PAGE }, checked: null, answeredThisVisit: true }), 'view', 'loading'],
  ['the lines playing with no page: checking', at({ elapsedMs: 5000 }), 'checking', 'loading'],
  ['a page in at 5 s with the lines not done: checking (no ready sentence before the lines end)', at({ data: { page: PAGE }, elapsedMs: 5000, answeredThisVisit: true }), 'checking', 'loading'],
  ['the lines done (23 s) and the page in: ready (View report; no auto-open)', at({ data: { page: PAGE }, elapsedMs: 23000, answeredThisVisit: true }), 'ready', 'loading'],
  ['View report pressed: view', at({ data: { page: PAGE }, elapsedMs: 24000, answeredThisVisit: true, opened: true }), 'view', 'loading'],
  ['the lines done with no page and under 60 s: holding', at({ elapsedMs: 30000 }), 'holding', 'loading'],
  ['an error during the lines (after the retries): error at once, the lines as far as they got', at({ elapsedMs: 8000, isError: true }), 'error', 'error'],
  ['60 s passed (the give-up): error', at({ elapsedMs: 60000, gaveUp: true }), 'error', 'error'],
  ['a late page after the give-up stays an error until Try again', at({ data: { page: PAGE }, elapsedMs: 61000, gaveUp: true, answeredThisVisit: true }), 'error', 'error'],
  ['Try again with the late page in the cache: view (no new compute)', at({ data: { page: PAGE }, elapsedMs: 61000, answeredThisVisit: true, opened: true }), 'view', 'loading'],
  ['Try again with no page: holding, the lines in full', at({ elapsedMs: 100, linesFull: true }), 'holding', 'loading'],
  ['a miss during the lines (this visit): miss at once, the lines as far as they got', at({ data: { page: null }, elapsedMs: 100, answeredThisVisit: true }), 'miss', 'miss'],
  ['no checked view with a miss: miss at once', at({ data: { page: null }, checked: null, answeredThisVisit: true }), 'miss', 'miss'],
  ['a cached miss from an earlier visit while the report read runs: checking, never the miss text', at({ data: { page: null }, elapsedMs: 3000, answeredThisVisit: false }), 'checking', 'loading'],
  ['no checked view, nothing answered: holding (the spinner and Loading the report)', at({ checked: null }), 'holding', 'loading'],
  ['an error with a cached page (offline): view', at({ data: { page: PAGE }, checked: null, isError: true }), 'view', 'loading'],
];

describe('task-267 / task-317: reportScreenState is total over the stable signals', () => {
  it.each(ROWS)('%s', (_n, q, screen, lifecycle) => {
    const r = reportScreenState(q);
    expect([r.screen, r.lifecycle]).toEqual([screen, lifecycle]);
    expect(r.view).toBe(screen === 'view' ? q.data?.page : null);
  });
  it('Spec 99 §8.3: an isFetching toggle gives the same output for every row (the signals carry no isFetching; a stray key is ignored)', () => {
    for (const [n, q] of ROWS) {
      const a = reportScreenState({ ...q, isFetching: true } as Signals);
      const b = reportScreenState({ ...q, isFetching: false } as Signals);
      expect([n, a]).toEqual([n, b]);
    }
  });
  it('every screen is reached by some row (the table is total over the six outputs)', () => {
    expect([...new Set(ROWS.map((r) => r[2]))].sort()).toEqual(['checking', 'error', 'holding', 'miss', 'ready', 'view']);
  });
  it('fe.56 planted defect: a reportScreenState that ignores gaveUp, or one that reads isFetching, is caught by the table', () => {
    const ignoresGaveUp: State = (q) => reportScreenState({ ...q, gaveUp: false });
    const readsFetching: State = (q) => ((q as Signals & { isFetching?: boolean }).isFetching ? { view: null, lifecycle: 'loading', screen: 'holding' } : reportScreenState(q));
    const failures = (fn: State) => ROWS.filter(([, q, screen]) => fn(q).screen !== screen).length;
    expect(failures(ignoresGaveUp)).toBeGreaterThan(0);
    expect(ROWS.some(([, q]) => readsFetching({ ...q, isFetching: true } as Signals).screen !== readsFetching({ ...q, isFetching: false } as Signals).screen)).toBe(true);
    expect(failures(reportScreenState)).toBe(0);
  });
});
