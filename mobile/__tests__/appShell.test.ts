/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (stable gate signals), §8.3 (toggling isFetching does not flip a gate),
//            docs/specs/00-architecture/116_multi_product_architecture.md §3 (dated note 2026-11-26: the MaxBLD app inside the one project).
//
// task-313 McApp card 1, the front door (PLAN-313-v1 M1, T4; RR-0499 "1a", MORNING-DECISIONS.md:2598). decideMaxbldGate is pure (mobile/src/lib/appShell.ts,
// a leaf module): loading, offline, error, redirect and enter in their cases; once the read has data the answer never returns to the Opening; every lead
// route file under mobile/app/(app), read from disk, redirects, so a lead screen added later is covered without a new case.
import fs from 'node:fs';
import path from 'node:path';
import { APP_PRODUCT, MAXBLD_LOOKUP_ROUTE, decideMaxbldGate, shouldHideAppTabBar, type MaxbldGateInput } from '@/lib/appShell';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

const GIVE_UP = 60_000;
const base: MaxbldGateInput = {
  hydrated: true,
  signedIn: true,
  read: { status: 'pending', fetchStatus: 'fetching', hasData: false },
  segments: ['(app)', 'parcel-tool'],
  pendingMs: 0,
  giveUpMs: GIVE_UP,
};
const gate = (o: Partial<Omit<MaxbldGateInput, 'read'>> & { read?: Partial<MaxbldGateInput['read']> } = {}) =>
  decideMaxbldGate({ ...base, ...o, read: { ...base.read, ...(o.read ?? {}) } });
const DATA = { status: 'success', fetchStatus: 'idle', hasData: true } as const;

/** The (app) child route names on disk, other than parcel-tool and the layout: the lead app's screens kept in the code (RR-0499). */
const APP_DIR = path.resolve(__dirname, '../app/(app)');
const leadRoutes = (): string[] =>
  fs.readdirSync(APP_DIR).filter((f) => f !== '_layout.tsx' && f !== 'parcel-tool').map((f) => f.replace(/\.tsx$/, ''));

describe('decideMaxbldGate (task-313 M1)', () => {
  it('loading: the first read is pending (retries included), or the store is not hydrated, or nobody is signed in yet', () => {
    expect(gate()).toBe('loading');
    expect(gate({ hydrated: false })).toBe('loading');
    expect(gate({ signedIn: false, read: { fetchStatus: 'idle' } })).toBe('loading');
    expect(gate({ pendingMs: GIVE_UP - 1 })).toBe('loading');
  });
  it('offline: no data and the read is paused (the device reports no network); no failure count is read', () => {
    expect(gate({ read: { fetchStatus: 'paused' } })).toBe('offline');
    expect(gate({ read: { status: 'error', fetchStatus: 'paused' } })).toBe('offline');
  });
  it('error: the read is in error with no data, or still pending at REPORT_GIVE_UP_MS', () => {
    expect(gate({ read: { status: 'error', fetchStatus: 'idle' } })).toBe('error');
    expect(gate({ pendingMs: GIVE_UP })).toBe('error');
  });
  it('enter: data and a parcel-tool route; a nested parcel-tool route ([parcelId]) enters too', () => {
    expect(gate({ read: DATA })).toBe('enter');
    expect(gate({ read: DATA, segments: ['(app)', 'parcel-tool', '[parcelId]'] })).toBe('enter');
    expect(gate({ read: DATA, segments: ['(app)', 'parcel-tool', 'tracked'] })).toBe('enter');
  });
  it('redirect: data and the (app) root', () => {
    expect(gate({ read: DATA, segments: ['(app)'] })).toBe('redirect');
  });
  it('every lead route file under mobile/app/(app), read from disk, redirects', () => {
    const names = leadRoutes();
    expect(names.sort()).toEqual(expect.arrayContaining(['index', 'map', 'flight-board', 'settings', '[lead]', '[flight-job]']));
    for (const n of names) expect([n, gate({ read: DATA, segments: ['(app)', n] })]).toEqual([n, 'redirect']);
  });
  it('stable gate (Spec 99 §6.5): once there is data a failed refetch keeps enter, a 401 included (the server is the fence)', () => {
    expect(gate({ read: { status: 'error', fetchStatus: 'idle', hasData: true } })).toBe('enter');
    expect(gate({ read: { status: 'error', fetchStatus: 'paused', hasData: true } })).toBe('enter');
    expect(gate({ read: { ...DATA, fetchStatus: 'fetching' }, pendingMs: GIVE_UP * 2 })).toBe('enter');
  });
  it('Spec 99 §8.3: toggling isFetching does not change the answer (the input has no isFetching; fetchStatus fetching and idle answer alike)', () => {
    expect(Object.keys(base.read).sort()).toEqual(['fetchStatus', 'hasData', 'status']);
    expect(gate({ read: { fetchStatus: 'fetching' } })).toBe(gate({ read: { fetchStatus: 'idle' } }));
    expect(gate({ read: { ...DATA, fetchStatus: 'fetching' } })).toBe(gate({ read: DATA }));
  });
  it('a settled read with no data cannot occur: useParcelEntitlement parses through Zod and throws first (error-paths#2)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useParcelLookup.ts'), 'utf8');
    expect(src).toMatch(/ParcelToolEntitlementSchema\.safeParse\(raw\.data\)[\s\S]{0,300}throw new ParcelLookupSchemaError/);
  });
});

describe('the switch and the route constants', () => {
  it('APP_PRODUCT is parcel_tool in this build', () => {
    expect(APP_PRODUCT).toBe('parcel_tool');
  });
  it('MAXBLD_LOOKUP_ROUTE equals PARCEL_TAB_ROUTE.lookup, so the two cannot drift', () => {
    expect(MAXBLD_LOOKUP_ROUTE).toBe(PARCEL_TAB_ROUTE.lookup);
  });
  it('the existing tab-bar rule is unchanged', () => {
    expect([shouldHideAppTabBar('parcel-tool'), shouldHideAppTabBar('index'), shouldHideAppTabBar(undefined)]).toEqual([true, false, false]);
  });
  it('appShell.ts stays a leaf: no import of any kind', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/appShell.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\b/m);
  });
});

describe('planted (fe.56): each break turns a case red', () => {
  /** The rule of the redirect case above, run on a planted tree and a planted switch. */
  const redirectProblems = (names: string[], product: string): string[] => {
    const out: string[] = [];
    if (product !== 'parcel_tool') out.push('APP_PRODUCT is not parcel_tool');
    for (const n of names) if (gate({ read: DATA, segments: ['(app)', n] }) !== 'redirect') out.push(`${n} does not redirect`);
    return out;
  };
  it('the real tree and switch have no problem', () => {
    expect(redirectProblems(leadRoutes(), APP_PRODUCT)).toEqual([]);
  });
  it('planted: a lead route named parcel-tool in the list is found (it enters)', () => {
    expect(redirectProblems([...leadRoutes(), 'parcel-tool'], APP_PRODUCT)).toEqual(['parcel-tool does not redirect']);
  });
  it('planted: APP_PRODUCT flipped to lead_gen is found', () => {
    expect(redirectProblems(leadRoutes(), 'lead_gen')).toEqual(['APP_PRODUCT is not parcel_tool']);
  });
});
