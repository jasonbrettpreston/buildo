// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3, §5 and header item 2 (dated note 2026-11-11)
//             docs/specs/03-mobile/96_mobile_subscription.md §10 (the status set) and the header note 2026-11-11 (per-product gate)
//             docs/specs/02-web-admin/126_maxbld_surface_standard.md §7, §11b.7 rules 5-6 (dated note 2026-11-11, D-2..D-6 a)
//
// MF-45 · T8-T10, the mocked-route harness (plan section 12 fold 8; the subscribe-session.infra.test.ts pattern):
//   T8  product x status: parcel_tool {trial, active, past_due, admin_managed} -> 200 metered; parcel_tool {expired,
//       cancelled_pending_deletion} with no lead_gen -> 403; lead_gen allowed, no parcel_tool -> 200 with NO usage write
//       (the transitional App A path, removed by MF-50); both -> metered; neither -> 403; expired between gate and meter -> 403.
//   T9  a hit writes one property_view row keyed on the matched parcels.parcel_id; candidates / miss / dangling id write
//       none; a re-open in the window writes none and is served; a new lot at used = limit -> 403 REPORT_LIMIT_REACHED with
//       reportsLimit and resetsOn and no parcel; trial and plan limits told apart; a parse failure charges nothing; the raw
//       q never reaches the meter or the log.
//   T10 a limits-read failure or an insert failure -> 500 and no payload (fail closed).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const poolQuery = vi.fn();
const txQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({ query: txQuery })),
}));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/admin/parcel-lookup', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/parcel-lookup')>()),
  resolveAddress: vi.fn(),
  fetchParcelById: vi.fn(),
  fetchCoaProjects: vi.fn(async () => []),
}));
vi.mock('@/lib/parcels/consumer-lookup', async (orig) => {
  const a = await orig<typeof import('@/lib/parcels/consumer-lookup')>();
  return { ...a, assembleConsumerPayload: vi.fn(a.assembleConsumerPayload) };
});
const logInfo = vi.fn();
vi.mock('@/lib/logger', () => ({ logInfo: (...a: unknown[]) => logInfo(...a), logWarn: vi.fn(), logError: vi.fn() }));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { resolveAddress, fetchParcelById } from '@/lib/admin/parcel-lookup';
import { REPORT_LIMIT_KEYS } from '@/lib/entitlements';
import { assembleConsumerPayload } from '@/lib/parcels/consumer-lookup';
import { GET } from '@/app/api/parcels/lookup/route';

const UID = '00000000-0000-0000-0000-0000000045a1';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const PERIOD_END = new Date('2026-12-05T10:00:00.000Z');
const ROW = { parcel_id: 'P-45', lot_size_sqm: 400, neighbourhood_id: null, __display_address: '5 Elm St' };
const RAW_Q = '5 elm st secret-typed-text';

type Body = { data: { parcel: unknown; match: unknown } | null; error: { code: string; details?: Record<string, unknown> } | null };
const req = (qs: string): NextRequest => ({ url: `https://x.test/api/parcels/lookup?${qs}`, nextUrl: { pathname: '/api/parcels/lookup' }, headers: { get: () => null } } as unknown as NextRequest);
const call = async (qs = 'parcelId=P-45'): Promise<{ status: number; body: Body }> => {
  const res = await GET(req(qs));
  return { status: res.status, body: (await res.json()) as Body };
};

function ctx(leadGen: string | null) {
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: leadGen } as never);
}
/** pool.query: the gate's parcel_tool read (getEntitlementStatus). */
function parcelTool(status: string | null) {
  poolQuery.mockImplementation(async (text: string) => {
    if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) return { rows: status ? [{ status, trial_started_at: null }] : [], rowCount: status ? 1 : 0 };
    throw new Error(`unexpected pool query: ${text}`);
  });
}
/** The meter transaction: locked row, limits, the window count, then the insert. */
function meter(o: { status?: string | null; used?: number; already?: boolean; plan?: unknown; trial?: unknown; insertThrows?: boolean; limitsThrow?: boolean } = {}) {
  const status = o.status === undefined ? 'active' : o.status;
  txQuery.mockImplementation(async (text: string) => {
    if (/FROM entitlements[\s\S]*FOR UPDATE/.test(text)) {
      return status ? { rows: [{ status, current_period_end: PERIOD_END, created_at: new Date('2026-01-01T00:00:00Z'), now: NOW }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM logic_variables/.test(text)) {
      if (o.limitsThrow) throw new Error('db down');
      return { rows: [
        { variable_key: REPORT_LIMIT_KEYS.plan, variable_value: o.plan === undefined ? '3' : o.plan },
        { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: o.trial === undefined ? '2' : o.trial },
      ], rowCount: 2 };
    }
    if (/FROM usage_events/.test(text)) return { rows: [{ used: o.used ?? 0, already: o.already ?? false }], rowCount: 1 };
    if (/INSERT INTO usage_events/.test(text)) {
      if (o.insertThrows) throw new Error('insert failed');
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected tx query: ${text}`);
  });
}
const inserts = () => txQuery.mock.calls.filter((c) => /INSERT INTO usage_events/.test(String(c[0])));
const meterCalls = () => txQuery.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
  txQuery.mockReset();
  vi.mocked(fetchParcelById).mockResolvedValue({ ...ROW });
  vi.mocked(resolveAddress).mockResolvedValue({ match: { parcelId: 'P-45', matchType: 'exact', address: '5 Elm St' }, candidates: [], truncated: false } as never);
  meter();
});

describe('T8 the gate: product x status (Spec 96 §10 status set; D-4 a)', () => {
  it.each(['trial', 'active', 'past_due', 'admin_managed'])('parcel_tool %s -> 200, metered (one property_view row)', async (s) => {
    ctx(null); parcelTool(s); meter({ status: s });
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(inserts()).toHaveLength(1);
  });
  it.each(['expired', 'cancelled_pending_deletion'])('parcel_tool %s with no lead_gen -> 403 SUBSCRIPTION_REQUIRED, nothing read or written', async (s) => {
    ctx(null); parcelTool(s);
    const r = await call();
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(vi.mocked(fetchParcelById)).not.toHaveBeenCalled();
    expect(meterCalls()).toBe(0);
  });
  it.each(['trial', 'active', 'past_due', 'admin_managed'])('lead_gen %s, no parcel_tool -> 200 on the transitional path, NO usage write', async (s) => {
    ctx(s); parcelTool(null);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(meterCalls()).toBe(0);
  });
  it('lead_gen active and parcel_tool expired -> the transitional path (unmetered), D-4 a', async () => {
    ctx('active'); parcelTool('expired');
    const r = await call();
    expect(r.status).toBe(200);
    expect(meterCalls()).toBe(0);
  });
  it('both held -> metered (D-4 a: a parcel_tool holder is metered everywhere)', async () => {
    ctx('active'); parcelTool('active');
    const r = await call();
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(1);
  });
  it.each([[null, null], ['expired', null], [null, 'expired'], ['expired', 'expired']])('neither allowed (lead_gen %s, parcel_tool %s) -> 403', async (lg, pt) => {
    ctx(lg); parcelTool(pt);
    const r = await call();
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
  });
  it('expired between the gate and the meter (re-tested under the row lock) -> 403, no insert, no payload (fold 1)', async () => {
    ctx(null); parcelTool('active'); meter({ status: 'expired' });
    const r = await call();
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(r.body.data).toBeNull();
    expect(inserts()).toHaveLength(0);
  });
  it('the row vanished between the gate and the meter -> 403, no insert', async () => {
    ctx(null); parcelTool('active'); meter({ status: null });
    const r = await call();
    expect(r.status).toBe(403);
    expect(inserts()).toHaveLength(0);
  });
});

describe('T9 the meter (D-2, D-3, D-5, D-6 a)', () => {
  beforeEach(() => { ctx(null); parcelTool('active'); });
  it('a hit writes one row: parcel_tool / property_view / parcel_ref, keyed on the matched parcels.parcel_id, meta {} and the transaction clock', async () => {
    vi.mocked(resolveAddress).mockResolvedValue({ match: { parcelId: 'TYPED-ID', matchType: 'exact', address: '5 Elm St' }, candidates: [], truncated: false } as never);
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    const ins = inserts();
    expect(ins).toHaveLength(1);
    expect(String(ins[0]![0])).toMatch(/INSERT INTO usage_events \(user_id, product, event, subject_kind, subject_key, occurred_at, meta\)\s+VALUES \(\$1, 'parcel_tool', 'property_view', 'parcel_ref', \$2, \$3, '\{\}'::jsonb\)/);
    // subject_key is the fetched row's parcel_id, not the resolver's or the request's text (fold 5); occurred_at = the DB clock (fold 2).
    expect(ins[0]![1]).toEqual([UID, 'P-45', NOW]);
    expect(JSON.stringify(txQuery.mock.calls)).not.toContain(RAW_Q);
  });
  it('the same lot via q and via parcelId counts once (the second open is already_counted, no insert)', async () => {
    await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(inserts()).toHaveLength(1);
    txQuery.mockClear();
    meter({ used: 1, already: true });
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(0);
  });
  it.each([
    ['candidates', () => vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [{ parcelId: 'A', address: 'a' }, { parcelId: 'B', address: 'b' }], truncated: false } as never), `q=${encodeURIComponent(RAW_Q)}`],
    ['a miss', () => vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [], truncated: false } as never), `q=${encodeURIComponent(RAW_Q)}`],
    ['a dangling id', () => vi.mocked(fetchParcelById).mockResolvedValue(null), 'parcelId=GONE'],
  ])('%s writes nothing and carries parcel: null (fold 12)', async (_l, arrange, qs) => {
    arrange();
    const r = await call(qs);
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).toBeNull();
    expect(meterCalls()).toBe(0);
  });
  it('a re-open of a counted lot at used = limit is served, no insert (D-3 a)', async () => {
    meter({ used: 3, already: true });
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(inserts()).toHaveLength(0);
  });
  it('a new lot at used = limit -> 403 REPORT_LIMIT_REACHED with reportsLimit and resetsOn, no parcel, no insert (D-6 a)', async () => {
    meter({ used: 3, already: false });
    const r = await call();
    expect(r.status).toBe(403);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe('REPORT_LIMIT_REACHED');
    expect(r.body.error?.details).toEqual({ reportsLimit: 3, resetsOn: PERIOD_END.toISOString() });
    expect(JSON.stringify(r.body)).not.toContain('lot_size');
    expect(inserts()).toHaveLength(0);
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup');
    expect(log?.[2]).toMatchObject({ uid: UID, access: 'parcel_tool', meter: 'limit_reached' });
  });
  it('a new lot at used = limit - 1 is counted (the last report of the period)', async () => {
    meter({ used: 2, already: false });
    const r = await call();
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(1);
  });
  it('trial and plan limits are told apart (fixture: trial 2, plan 3; D-5 a)', async () => {
    parcelTool('trial'); meter({ status: 'trial', used: 2 });
    expect((await call()).status).toBe(403);
    parcelTool('active'); meter({ status: 'active', used: 2 });
    expect((await call()).status).toBe(200);
  });
  it('a response that fails its .strict() parse charges nothing (meter last, fold 3)', async () => {
    vi.mocked(assembleConsumerPayload).mockReturnValueOnce({ payload: { leaked: true } as never, warnings: [] });
    const r = await call();
    expect(r.status).toBe(500);
    expect(meterCalls()).toBe(0);
  });
  it('the log line carries access and meter and never the raw q (Spec 100 §2.8)', async () => {
    await call(`q=${encodeURIComponent(RAW_Q)}`);
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup');
    expect(log?.[2]).toMatchObject({ access: 'parcel_tool', meter: 'counted', outcome: 'hit' });
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain(RAW_Q);
  });
  it('the transitional path logs access lead_gen_transitional, meter unmetered', async () => {
    ctx('active'); parcelTool(null);
    await call();
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup');
    expect(log?.[2]).toMatchObject({ access: 'lead_gen_transitional', meter: 'unmetered' });
  });
});

describe('T10 fail closed: the payload is never served unmetered', () => {
  beforeEach(() => { ctx(null); parcelTool('active'); });
  it.each([
    ['the limits read throws', { limitsThrow: true }],
    ['a limit is out of the seed bounds', { plan: '0' }],
    ['a limit is missing', { plan: null }],
    ['the insert throws', { insertThrows: true }],
  ])('%s -> 500 and no payload', async (_l, o) => {
    meter(o as Parameters<typeof meter>[0]);
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('lot_size');
  });
});
