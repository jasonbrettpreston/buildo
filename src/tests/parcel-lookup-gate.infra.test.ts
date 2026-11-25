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
//   task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494 "register them"; Spec 128 Rule 3): the two rate limits, the slow-query mark and the candidate cap are
//   read from their settings rows (one read, readSearchSettings); a missing or out-of-bounds row is the generic 500 with no database text; a
//   non-default row moves the limiter, the cap and the warning. Every 500 body is checked for the raw error text (Std 2.1; g3 GROUNDER-E C1).

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
// MF-53: the map read is mocked here (its SQL is pinned in parcel-lookup-resolution.logic.test.ts); a map response must meter nothing.
vi.mock('@/lib/parcels/lot-map', async (orig) => ({ ...(await orig<typeof import('@/lib/parcels/lot-map')>()), resolveLotMap: vi.fn() }));
// SEMI-B: the lot-form read is mocked (its SQL is pinned in parcel-lot-form.logic.test.ts); a hit carries the block, a form never meters.
vi.mock('@/lib/parcels/lot-form', async (orig) => ({
  ...(await orig<typeof import('@/lib/parcels/lot-form')>()),
  readLotForm: vi.fn(async () => ({ detected: 'detached', basis: 'o4_not_met', unsure: false })),
}));
// SRCH.METER (task-334, RR-0278): the meter counts only when a report is produced, so the producer is mocked here; the default (beforeEach) is a
// produced page, the committed v21 mobile response (src/tests/fixtures/report-page/props/page_v21.mobile.json, the fixture of parcels-lookup-page.logic.test.ts).
vi.mock('@/lib/parcels/report-page', async (orig) => {
  const a = await orig<typeof import('@/lib/parcels/report-page')>();
  return { ...a, readCustomerPageResponse: vi.fn(a.readCustomerPageResponse) };
});
// SRCH.METER-2 (task-360): the one-lot compute at the pick (LOAD.1, task-266) is mocked so a test can prove it is NOT run for a held (unsure, unanswered) lot.
vi.mock('@/lib/parcels/report-compute', () => ({ computeCustomerPageResponse: vi.fn(async () => null) }));
const logInfo = vi.fn();
const logWarn = vi.fn();
vi.mock('@/lib/logger', () => ({ logInfo: (...a: unknown[]) => logInfo(...a), logWarn: (...a: unknown[]) => logWarn(...a), logError: vi.fn() }));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { resolveAddress, fetchParcelById } from '@/lib/admin/parcel-lookup';
import { REPORT_LIMIT_KEYS } from '@/lib/entitlements';
import { assembleConsumerPayload } from '@/lib/parcels/consumer-lookup';
import { resolveLotMap } from '@/lib/parcels/lot-map';
import { readLotForm } from '@/lib/parcels/lot-form';
import { readCustomerPageResponse } from '@/lib/parcels/report-page';
import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';
import fs from 'node:fs';
import path from 'node:path';
import { GET } from '@/app/api/parcels/lookup/route';

const GOLDEN = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/report-page/props/page_v21.mobile.json'), 'utf8')) as { response_fixture: Record<string, unknown> };
const UID = '00000000-0000-0000-0000-0000000045a1';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const PERIOD_END = new Date('2026-12-05T10:00:00.000Z');
const ROW = { parcel_id: 'P-45', lot_size_sqm: 400, neighbourhood_id: null, __display_address: '5 Elm St' };
const RAW_Q = '5 elm st secret-typed-text';

type Body = { data: { parcel: unknown; match: unknown; page?: unknown; lotForm?: unknown } | null; error: { code: string; details?: Record<string, unknown> } | null };
const req = (qs: string): NextRequest => ({ url: `https://x.test/api/parcels/lookup?${qs}`, nextUrl: { pathname: '/api/parcels/lookup' }, headers: { get: () => null } } as unknown as NextRequest);
const call = async (qs = 'parcelId=P-45'): Promise<{ status: number; body: Body }> => {
  const res = await GET(req(qs));
  return { status: res.status, body: (await res.json()) as Body };
};

function ctx(leadGen: string | null) {
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: leadGen } as never);
}
/** task-454: the search settings rows the pool answers (the seed defaults; a test sets a non-default value, or null for a missing row). */
const SEARCH_DEFAULTS: Record<string, string | null> = { parcel_lookup_search_per_min: '60', parcel_lookup_detail_per_min: '30', parcel_entitlement_read_per_min: '30', parcel_lookup_slow_query_ms: '500', maxbld_page_candidate_cap: '10' };
let settings: Record<string, string | null> = { ...SEARCH_DEFAULTS };
/** The settings read is told from the other logic_variables reads by its bound keys (the statement text is the shared ANY read). */
const isSearchSettings = (text: string, params: unknown): boolean =>
  /FROM logic_variables WHERE variable_key = ANY/.test(text) && Array.isArray(params) && Array.isArray(params[0]) && (params[0] as unknown[]).includes('parcel_lookup_search_per_min');
const settingsRows = () => {
  const rows = Object.entries(settings).filter(([, v]) => v !== null).map(([variable_key, variable_value]) => ({ variable_key, variable_value }));
  return { rows, rowCount: rows.length };
};
/** pool.query: the gate's parcel_tool read (getEntitlementStatus) and the search settings read. */
function parcelTool(status: string | null) {
  poolQuery.mockImplementation(async (text: string, params?: unknown) => {
    if (isSearchSettings(text, params)) return settingsRows();
    if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) return { rows: status ? [{ status, trial_started_at: null }] : [], rowCount: status ? 1 : 0 };
    throw new Error(`unexpected pool query: ${text}`);
  });
}
/** The meter transaction: locked row, limits, the window count, then the insert. */
function meter(o: { status?: string | null; used?: number; already?: boolean; plan?: unknown; trial?: unknown; insertThrows?: boolean; limitsThrow?: boolean } = {}) {
  const status = o.status === undefined ? 'active' : o.status;
  txQuery.mockImplementation(async (text: string) => {
    if (/FROM entitlements[\s\S]*FOR UPDATE/.test(text)) {
      return status ? { rows: [{ status, plan_key: 'basic', current_period_end: PERIOD_END, created_at: new Date('2026-01-01T00:00:00Z'), now: NOW }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    // MF-47: the meter first reads its statement time limit (a setting) and sets it transaction-local, before the row lock.
    if (/set_config\('statement_timeout'/.test(text)) return { rows: [], rowCount: 1 };
    if (/FROM logic_variables WHERE variable_key = \$1/.test(text)) {
      if (o.limitsThrow) throw new Error('db down');
      return { rows: [{ variable_value: '5000' }], rowCount: 1 };
    }
    if (/FROM logic_variables/.test(text)) {
      if (o.limitsThrow) throw new Error('db down');
      return { rows: [
        { variable_key: REPORT_LIMIT_KEYS.plan, variable_value: o.plan === undefined ? '3' : o.plan },
        { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: o.trial === undefined ? '2' : o.trial },
        { variable_key: REPORT_LIMIT_KEYS.pro, variable_value: '25' },
      ], rowCount: 3 };
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

// Dated 2026-11-12 (operator, verbatim "1 b 2 a", item 1 (b); record ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, the
// "1 b 2 a" ruling under "Lot views v9"; Spec 100 §3.2 dated note): a lookup that returns no evaluated option is NOT counted.
// The real assembler sends no evaluated option today (EI-D1: the legacy menu is null), so the metering cases below run on a
// payload with one evaluated option line (EVALUATED), and the "1 b" block at the end runs the real assembler. Prior text: every
// hit was metered on the real assembler output.
const EVALUATED = { _schema_version: 1, 'scenario:detached_house/gfa_max_m2': { total: 1500000, per_sqm: 4844, area: 309.7 } };
const realAssemble = vi.mocked(assembleConsumerPayload).getMockImplementation()!;
const withEvaluatedOption = (...a: Parameters<typeof assembleConsumerPayload>) => {
  const r = realAssemble(...a);
  return { ...r, payload: { ...r.payload, costMenu: { menu: EVALUATED, scalars: null } } };
};

beforeEach(() => {
  vi.clearAllMocks();
  settings = { ...SEARCH_DEFAULTS };
  vi.mocked(assembleConsumerPayload).mockImplementation(withEvaluatedOption);
  vi.mocked(readCustomerPageResponse).mockResolvedValue(GOLDEN.response_fixture);
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
  it('a thrown gate read (entitlements read fails) -> 500, no payload, nothing read or metered', async () => {
    ctx('active');
    poolQuery.mockImplementation(async (text: string) => {
      if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) throw new Error('db down');
      throw new Error(`unexpected pool query: ${text}`);
    });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('db down');
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
  it('a hit writes one row: parcel_tool / property_view / parcel_ref, keyed on the matched parcels.parcel_id, meta {"extra": false} (MF-47 C-5: the flag is decided at insert) and the transaction clock', async () => {
    vi.mocked(resolveAddress).mockResolvedValue({ match: { parcelId: 'TYPED-ID', matchType: 'exact', address: '5 Elm St' }, candidates: [], truncated: false } as never);
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    const ins = inserts();
    expect(ins).toHaveLength(1);
    expect(String(ins[0]![0])).toMatch(/INSERT INTO usage_events \(user_id, product, event, subject_kind, subject_key, occurred_at, meta\)\s+VALUES \(\$1, 'parcel_tool', 'property_view', 'parcel_ref', \$2, \$3, '\{"extra": false\}'::jsonb\)/);
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
    ['candidates', () => vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [{ parcelId: 'A', address: 'a' }, { parcelId: 'B', address: 'b' }], truncated: false, resolution: 'text_candidates', lotMap: null } as never), `q=${encodeURIComponent(RAW_Q)}`],
    ['a miss', () => vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [], truncated: false, resolution: 'no_match', lotMap: null } as never), `q=${encodeURIComponent(RAW_Q)}`],
    // MF-53 (PLAN panel CR F-5, security M-2): a map response shows no report, so it meters nothing (MF-45 fold 12 carry).
    ['a multi_parcel map', () => {
      vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [{ parcelId: 'A', address: '5 Elm St' }, { parcelId: 'B', address: '5 Elm St' }], truncated: false, resolution: 'multi_parcel', lotMap: { kind: 'multi_parcel', parcelIds: ['A', 'B'], num: '5', truncated: false } } as never);
      vi.mocked(resolveLotMap).mockResolvedValue({ address: null, pin: { lat: 43.6, lng: -79.4 }, truncated: false, lots: [], neighbours: [] });
    }, `q=${encodeURIComponent(RAW_Q)}`],
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
    expect(JSON.stringify(r.body)).not.toContain('leaked'); // the parse error names the key: never in the body
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

describe(`SRCH.METER (task-334, RR-0278 "I should only be charged a report if I find the address and lot I'm looking for and a report is produced")`, () => {
  const meterLog = () => (logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')?.[2] ?? {}) as Record<string, unknown>;
  beforeEach(() => { ctx(null); parcelTool('active'); });
  it('a q lookup of one lot with NO report produced (page null) is served and counts nothing, no meter read', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(meterCalls()).toBe(0);
    expect(inserts()).toHaveLength(0);
    expect(meterLog()).toMatchObject({ access: 'parcel_tool', meter: 'not_produced', outcome: 'hit' });
  });
  it('the parcelId path with no report produced counts nothing either', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(meterCalls()).toBe(0);
  });
  // SRCH.METER-2 (task-360, RR-0278): a page that is sent must be a page that is counted, so an unsure lot's page is held (page null, not read, not computed)
  // until the semi answer; prior text: the page was sent and only the meter label said semi_pending.
  it('an unsure lot (the semi question comes first) is served with NO page and counts nothing, no meter read, neither the stored read nor the compute run', async () => {
    vi.mocked(readLotForm).mockResolvedValueOnce({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true });
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toBeNull();
    expect(r.body.data?.lotForm).toMatchObject({ unsure: true });
    expect(meterCalls()).toBe(0);
    expect(vi.mocked(readCustomerPageResponse)).not.toHaveBeenCalled();
    expect(vi.mocked(computeCustomerPageResponse)).not.toHaveBeenCalled();
    expect(meterLog()).toMatchObject({ meter: 'semi_pending', lot_form_unsure: true, page: false, page_source: 'none', compute_ms: null });
  });
  it('a held lot whose stored read misses never starts the compute either (the many-second compute is not spent on a page that is not sent)', async () => {
    vi.mocked(readLotForm).mockResolvedValueOnce({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true });
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    const r = await call('parcelId=P-45');
    expect(vi.mocked(readCustomerPageResponse)).not.toHaveBeenCalled();
    expect(r.body.data?.page).toBeNull();
    expect(vi.mocked(computeCustomerPageResponse)).not.toHaveBeenCalled();
  });
  it('a clear lot (not unsure) with a stored miss still reaches the compute, and the compute page is sent and counted (the hold is for unsure lots only)', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    vi.mocked(computeCustomerPageResponse).mockResolvedValueOnce(GOLDEN.response_fixture);
    const r = await call('parcelId=P-45');
    expect(vi.mocked(computeCustomerPageResponse)).toHaveBeenCalledTimes(1);
    expect(r.body.data?.page).not.toBeNull();
    expect(meterLog()).toMatchObject({ meter: 'counted', page_source: 'computed' });
  });
  it('a report produced for the found lot counts once: one row keyed on the lot, log meter counted', async () => {
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    expect(r.body.data?.page).not.toBeNull();
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]![1]).toEqual([UID, 'P-45', NOW]);
    expect(meterLog()).toMatchObject({ meter: 'counted', page: true });
  });
  it('a second report for the same lot in the month counts nothing more (already_counted, no insert)', async () => {
    meter({ used: 1, already: true });
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(0);
    expect(meterLog()).toMatchObject({ meter: 'already_counted' });
  });
  it('a new lot at the limit with no report produced is served, not refused (nothing to charge)', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    meter({ used: 3, already: false });
    const r = await call();
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(0);
  });
  it('the parcelId path of an unsure lot counts nothing either and sends no page (same lot, same rule on both entrances)', async () => {
    vi.mocked(readLotForm).mockResolvedValueOnce({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true });
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toBeNull();
    expect(meterCalls()).toBe(0);
    expect(meterLog()).toMatchObject({ meter: 'semi_pending' });
  });
  // SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): the semi page's Continue fetches the same lookup with the one flag semi=answered; an unsure lot
  // then counts like any lot, once, and only when its report is produced. Without the flag an unsure lot still counts nothing (cases above).
  const unsure = () => vi.mocked(readLotForm).mockResolvedValueOnce({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true });
  it('semi=answered on an unsure lot with a produced report counts once: one row keyed on the lot, log meter counted', async () => {
    unsure();
    const r = await call('parcelId=P-45&semi=answered');
    expect(r.status).toBe(200);
    expect(r.body.data?.page).not.toBeNull();
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]![1]).toEqual([UID, 'P-45', NOW]);
    expect(meterLog()).toMatchObject({ meter: 'counted', lot_form_unsure: true, semi_answered: true });
  });
  it('semi=answered on an unsure lot with NO report produced counts nothing (not_produced)', async () => {
    unsure();
    vi.mocked(readCustomerPageResponse).mockResolvedValue(null);
    const r = await call('parcelId=P-45&semi=answered');
    expect(r.status).toBe(200);
    expect(meterCalls()).toBe(0);
    expect(meterLog()).toMatchObject({ meter: 'not_produced', semi_answered: true });
  });
  it('semi=answered a second time in the month counts nothing more (already_counted, no insert)', async () => {
    unsure();
    meter({ used: 1, already: true });
    const r = await call('parcelId=P-45&semi=answered');
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(0);
    expect(meterLog()).toMatchObject({ meter: 'already_counted' });
  });
  it('an unsure lot WITHOUT the flag still counts nothing, and the log says the question is unanswered', async () => {
    unsure();
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toBeNull();
    expect(meterCalls()).toBe(0);
    expect(meterLog()).toMatchObject({ meter: 'semi_pending', semi_answered: false });
  });
  it('semi=answered on a lot with no evaluated option counts nothing (not_evaluated stays first)', async () => {
    unsure();
    vi.mocked(assembleConsumerPayload).mockImplementation(realAssemble as never);
    const r = await call('parcelId=P-45&semi=answered');
    expect(r.status).toBe(200);
    expect(meterCalls()).toBe(0);
    expect(meterLog()).toMatchObject({ meter: 'not_evaluated' });
  });
  it('the flag is validated: any value but answered, and the flag with q, are 400 with nothing read or counted', async () => {
    for (const qs of ['parcelId=P-45&semi=yes', 'parcelId=P-45&semi=', `q=${encodeURIComponent('5 elm st')}&semi=answered`]) {
      const r = await call(qs);
      expect([qs, r.status]).toEqual([qs, 400]);
    }
    expect(meterCalls()).toBe(0);
  });
  it('a lot map response (multi_parcel) never asks the producer and never reaches the meter', async () => {
    vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [{ parcelId: 'A', address: '5 Elm St' }, { parcelId: 'B', address: '5 Elm St' }], truncated: false, resolution: 'multi_parcel', lotMap: { kind: 'multi_parcel', parcelIds: ['A', 'B'], num: '5', truncated: false } } as never);
    vi.mocked(resolveLotMap).mockResolvedValue({ address: null, pin: { lat: 43.6, lng: -79.4 }, truncated: false, lots: [], neighbours: [] });
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).toBeNull();
    expect(vi.mocked(readCustomerPageResponse)).not.toHaveBeenCalled();
    expect(meterCalls()).toBe(0);
  });
  it('candidates, a miss, a lot map and a dangling id never ask the producer and never reach the meter (page null, parcel null)', async () => {
    vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [{ parcelId: 'A', address: 'a' }, { parcelId: 'B', address: 'b' }], truncated: false, resolution: 'text_candidates', lotMap: null } as never);
    expect((await call('q=x%20st')).body.data?.parcel).toBeNull();
    vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [], truncated: false, resolution: 'no_match', lotMap: null } as never);
    expect((await call('q=y%20st')).body.data?.parcel).toBeNull();
    vi.mocked(fetchParcelById).mockResolvedValue(null);
    expect((await call('parcelId=GONE')).body.data?.parcel).toBeNull();
    expect(vi.mocked(readCustomerPageResponse)).not.toHaveBeenCalled();
    expect(meterCalls()).toBe(0);
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
    expect(JSON.stringify(r.body)).not.toContain('db down');
    expect(JSON.stringify(r.body)).not.toContain('insert failed');
  });
});

describe('task-454 SEARCHFIX.6 the search settings rows (readSearchSettings; Spec 128 Rule 3)', () => {
  beforeEach(() => { ctx(null); parcelTool('active'); });
  it.each([
    ['a missing row', { parcel_lookup_search_per_min: null }],
    ['a row below its bounds', { parcel_lookup_detail_per_min: '0' }],
    ['a row above its bounds', { maxbld_page_candidate_cap: '51' }],
    ['a row that is not a whole number', { parcel_lookup_slow_query_ms: '500.5' }],
  ])('%s -> 500 on both paths, no data, no database text, nothing resolved or metered', async (_l, over) => {
    settings = { ...SEARCH_DEFAULTS, ...over };
    for (const qs of [`q=${encodeURIComponent(RAW_Q)}`, 'parcelId=P-45']) {
      const r = await call(qs);
      expect([qs, r.status, r.body.data]).toEqual([qs, 500, null]);
      const flat = JSON.stringify(r.body);
      for (const leak of ['logic_variables', 'parcel_lookup', 'maxbld_page', 'bounds']) expect([qs, leak, flat.includes(leak)]).toEqual([qs, leak, false]);
    }
    expect(vi.mocked(resolveAddress)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchParcelById)).not.toHaveBeenCalled();
    expect(vi.mocked(withRateLimit)).not.toHaveBeenCalled();
    expect(meterCalls()).toBe(0);
  });
  it('the settings are read once per request, after the gate (a 403 reads none)', async () => {
    await call();
    expect(poolQuery.mock.calls.filter((c) => isSearchSettings(String(c[0]), c[1]))).toHaveLength(1);
    poolQuery.mockClear();
    ctx(null); parcelTool('expired');
    expect((await call()).status).toBe(403);
    expect(poolQuery.mock.calls.filter((c) => isSearchSettings(String(c[0]), c[1]))).toHaveLength(0);
  });
  it('non-default rows move the code: search 7 and detail 8 a minute (window 60 s), cap 12 into the resolver (the cap bounds are 10 to 50), the slow mark at 50 ms', async () => {
    settings = { ...SEARCH_DEFAULTS, parcel_lookup_search_per_min: '7', parcel_lookup_detail_per_min: '8', parcel_lookup_slow_query_ms: '50', maxbld_page_candidate_cap: '12' };
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 60));
    try {
      await call(`q=${encodeURIComponent(RAW_Q)}`);
      expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toEqual({ key: `parcels-search:${UID}`, limit: 7, windowSec: 60 });
      expect(vi.mocked(resolveAddress).mock.calls[0]?.[1]).toMatchObject({ candidateCap: 12 });
      expect(logWarn.mock.calls.some((c) => c[1] === 'slow_query')).toBe(true);
      await call('parcelId=P-45');
      expect(vi.mocked(withRateLimit).mock.calls[1]?.[1]).toEqual({ key: `parcels-lookup:${UID}`, limit: 8, windowSec: 60 });
    } finally {
      clock.mockRestore();
    }
  });
  it('the default rows: search 60 and detail 30 a minute; the q path passes the cap 10; a fast lookup logs no slow_query', async () => {
    await call(`q=${encodeURIComponent(RAW_Q)}`);
    await call('parcelId=P-45');
    expect(vi.mocked(withRateLimit).mock.calls.map((c) => c[1])).toEqual([
      { key: `parcels-search:${UID}`, limit: 60, windowSec: 60 },
      { key: `parcels-lookup:${UID}`, limit: 30, windowSec: 60 },
    ]);
    expect(vi.mocked(resolveAddress).mock.calls[0]?.[1]).toMatchObject({ candidateCap: 10 });
    expect(logWarn.mock.calls.some((c) => c[1] === 'slow_query')).toBe(false);
  });
});

describe('operator "1 b": a lookup with no evaluated option is served and NOT counted', () => {
  beforeEach(() => { ctx(null); parcelTool('active'); vi.mocked(assembleConsumerPayload).mockImplementation(realAssemble); });
  it('a hit on the real assembler (no evaluated option) -> 200 with the payload, no meter read, no insert, log meter not_evaluated', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(meterCalls()).toBe(0);
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup');
    expect(log?.[2]).toMatchObject({ access: 'parcel_tool', meter: 'not_evaluated', outcome: 'hit' });
  });
  it('at used = limit, a lookup with no evaluated option is still served (it costs nothing)', async () => {
    meter({ used: 3, already: false });
    const r = await call();
    expect(r.status).toBe(200);
    expect(inserts()).toHaveLength(0);
  });
  it('a menu line with no number (a not_evaluated scenario line) is not an evaluated option', async () => {
    vi.mocked(assembleConsumerPayload).mockImplementation((...a) => {
      const r = realAssemble(...a);
      return { ...r, payload: { ...r.payload, costMenu: { menu: { _schema_version: 1, 'scenario:detached_house/gfa_max_m2': { total: null } }, scalars: null } } };
    });
    const r = await call();
    expect(r.status).toBe(200);
    expect(meterCalls()).toBe(0);
  });
});

// MF-53 (PLAN panel security M-2, L-4): the map is read only from the resolver's seed, never on the parcelId path; the log line carries the
// outcome name and the map counts, never q, the map address, the pin or the start view.
describe('MF-53 the map block on the route', () => {
  beforeEach(() => {
    vi.mocked(resolveLotMap).mockReset();
    logInfo.mockClear();
    ctx(null); parcelTool('active');
  });
  it('the parcelId path never reads the map and answers map: null, resolution unique', async () => {
    const r = await call('parcelId=P-45');
    expect(r.status).toBe(200);
    expect(vi.mocked(resolveLotMap)).not.toHaveBeenCalled();
    expect((r.body.data as unknown as { map: unknown; resolution: string }).map).toBeNull();
    expect((r.body.data as unknown as { resolution: string }).resolution).toBe('unique');
  });
  it('an unlinked q: map from the seed; the log carries resolution and counts, never q / address / pin / fit', async () => {
    const seed = { kind: 'unlinked', address: '12 Secret St', pin: { lat: 43.6111, lng: -79.4222 } } as const;
    vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [], truncated: false, resolution: 'unlinked', lotMap: seed } as never);
    vi.mocked(resolveLotMap).mockResolvedValue({ address: '12 Secret St', pin: seed.pin, truncated: false, lots: [], neighbours: [{ parcel_id: 'N1', outline: '{"type":"Polygon","coordinates":[[[-79.4,43.6],[-79.39,43.6],[-79.4,43.6]]]}' }] });
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(200);
    expect(vi.mocked(resolveLotMap)).toHaveBeenCalledWith(seed);
    const data = r.body.data as unknown as { resolution: string; map: { address: string; neighbours: unknown[] } };
    expect([data.resolution, data.map.address, data.map.neighbours.length]).toEqual(['unlinked', '12 Secret St', 1]);
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')?.[2] as Record<string, unknown>;
    expect(log).toMatchObject({ resolution: 'unlinked', map_lots: 0, map_neighbours: 1, meter: 'none' });
    expect(inserts()).toHaveLength(0); // a map response never reaches openReport (OUTPUT panel security L-1)
    expect(meterCalls()).toBe(0);
    const flat = JSON.stringify(logInfo.mock.calls);
    for (const leak of ['secret-typed-text', '12 Secret St', '43.6111', '-79.4222', 'north']) expect(flat).not.toContain(leak);
  });
  it('a map-read failure is a 500 (no silent fallback to the list)', async () => {
    vi.mocked(resolveAddress).mockResolvedValue({ match: null, candidates: [], truncated: false, resolution: 'unlinked', lotMap: { kind: 'unlinked', address: 'x', pin: { lat: 1, lng: 1 } } } as never);
    vi.mocked(resolveLotMap).mockRejectedValue(new Error('logic_variables missing'));
    const r = await call(`q=${encodeURIComponent(RAW_Q)}`);
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('logic_variables missing');
  });
});
