// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-11: 20 a month;
//             FE-05, the server computes every count) and the queue MF-45 row ("an entitlement read contract")
//             docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the shape drives the client state machine)
//
// MF-45 · T11, the entitlement read contract GET /api/parcels/entitlement (plan section 3.5, section 12 fold 7; operator
// 2026-11-11 "4. will we need to build this later.. we have the tokens now"): a thin wrapper over readParcelToolUsage on the
// lookup route's own pattern (withApiEnvelope, getCurrentUserContext first, a per-uid rate bucket, the existing error
// classes, a .strict() Zod boundary). Mocked-route harness (the parcel-lookup-gate.infra.test.ts pattern):
//   401 no session; 429 rate limited; 200 all null with no parcel_tool row (a legal state, never an error); 200 with the
//   server-computed counts; a status outside the allowed set -> the status with null counts; a read failure -> 500 with no
//   data; the .strict() schema rejects an extra key; read-only (no lock, no write); the bucket is parcels-entitlement:{uid}.
// task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494 "register them"; Spec 128 Rule 3): the bucket's limit is the setting parcel_entitlement_read_per_min,
//   read through readSearchSettings before the limiter (a missing or out-of-bounds row is the generic 500); the route logs its success with uid and
//   duration (g3 GROUNDER-F D4); a 500 body carries no database text (g3 GROUNDER-E C1).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const poolQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) }, withTransaction: vi.fn() }));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
const logInfo = vi.fn();
vi.mock('@/lib/logger', () => ({ logInfo: (...a: unknown[]) => logInfo(...a), logWarn: vi.fn(), logError: vi.fn() }));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { REPORT_LIMIT_KEYS } from '@/lib/entitlements';
import { GET } from '@/app/api/parcels/entitlement/route';
import { ParcelToolEntitlementResponseSchema } from '@/app/api/parcels/entitlement/types';

const UID = '00000000-0000-0000-0000-0000000045e1';
type Body = { data: Record<string, unknown> | null; error: { code: string } | null };
const req = (): NextRequest => ({ url: 'https://x.test/api/parcels/entitlement', method: 'GET', nextUrl: { pathname: '/api/parcels/entitlement' }, headers: { get: () => null } } as unknown as NextRequest);
const call = async (): Promise<{ status: number; body: Body }> => {
  const res = await GET(req());
  return { status: res.status, body: (await res.json()) as Body };
};
/** task-454: the search settings rows (the seed defaults; a test sets a non-default value, or null for a missing row). */
const SEARCH_DEFAULTS: Record<string, string | null> = { parcel_lookup_search_per_min: '60', parcel_lookup_detail_per_min: '30', parcel_entitlement_read_per_min: '30', parcel_lookup_slow_query_ms: '500', maxbld_page_candidate_cap: '10' };
let settings: Record<string, string | null> = { ...SEARCH_DEFAULTS };
/** The settings read is told from the report-limit read by its bound keys (both are the shared ANY statement). */
const isSearchSettings = (text: string, params: unknown): boolean =>
  /FROM logic_variables WHERE variable_key = ANY/.test(text) && Array.isArray(params) && Array.isArray(params[0]) && (params[0] as unknown[]).includes('parcel_lookup_search_per_min');
const otherReads = () => poolQuery.mock.calls.filter((c) => !isSearchSettings(String(c[0]), c[1]));
function db(o: { status?: string | null; used?: number; throws?: boolean } = {}) {
  poolQuery.mockImplementation(async (text: string, params?: unknown) => {
    if (isSearchSettings(text, params)) {
      const rows = Object.entries(settings).filter(([, v]) => v !== null).map(([variable_key, variable_value]) => ({ variable_key, variable_value }));
      return { rows, rowCount: rows.length };
    }
    if (o.throws) throw new Error('db down');
    if (/FROM entitlements/.test(text)) {
      return o.status ? { rows: [{ status: o.status, plan_key: 'basic', current_period_end: '2026-12-05T10:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', now: '2026-11-20T12:00:00.000Z' }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM logic_variables/.test(text)) return { rows: [{ variable_key: REPORT_LIMIT_KEYS.plan, variable_value: '20' }, { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: '20' }, { variable_key: REPORT_LIMIT_KEYS.pro, variable_value: '25' }] };
    if (/FROM usage_events/.test(text)) return { rows: [{ used: o.used ?? 0, already: false }] };
    throw new Error(`unexpected query: ${text}`);
  });
}
const NULLS = { status: null, reportsUsed: null, reportsLimit: null, reportsLeft: null, reportsLimitReached: null, resetsOn: null, resetsOnDisplay: null };

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
  settings = { ...SEARCH_DEFAULTS };
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: null } as never);
  db();
});

describe('T11 GET /api/parcels/entitlement (the entitlement read contract)', () => {
  it('no session -> 401, nothing read', async () => {
    vi.mocked(getCurrentUserContext).mockResolvedValue(null);
    const r = await call();
    expect(r.status).toBe(401);
    expect(r.body.error?.code).toBe('UNAUTHORIZED');
    expect(poolQuery).not.toHaveBeenCalled();
  });
  it('rate limited -> 429 on the parcels-entitlement:{uid} bucket, nothing read but the settings', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 } as never);
    const r = await call();
    expect(r.status).toBe(429);
    expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toEqual({ key: `parcels-entitlement:${UID}`, limit: 30, windowSec: 60 });
    expect(otherReads()).toHaveLength(0);
  });
  it('task-454: a non-default row moves the limit (9 a minute, window 60 s)', async () => {
    settings = { ...SEARCH_DEFAULTS, parcel_entitlement_read_per_min: '9' };
    await call();
    expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toEqual({ key: `parcels-entitlement:${UID}`, limit: 9, windowSec: 60 });
  });
  it.each([
    ['a missing row', { parcel_entitlement_read_per_min: null }],
    ['a row below its bounds', { parcel_entitlement_read_per_min: '0' }],
    ['a row above its bounds', { parcel_entitlement_read_per_min: '301' }],
    ['another search row out of bounds', { parcel_lookup_search_per_min: '601' }],
  ])('task-454: %s -> 500 with no data and no database text, no limiter call, nothing else read', async (_l, over) => {
    settings = { ...SEARCH_DEFAULTS, ...over };
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    const flat = JSON.stringify(r.body);
    for (const leak of ['logic_variables', 'parcel_entitlement', 'parcel_lookup', 'bounds']) expect([leak, flat.includes(leak)]).toEqual([leak, false]);
    expect(vi.mocked(withRateLimit)).not.toHaveBeenCalled();
    expect(otherReads()).toHaveLength(0);
  });
  it('task-454 (g3 GROUNDER-F D4): a success logs uid and duration', async () => {
    db({ status: 'active', used: 1 });
    expect((await call()).status).toBe(200);
    expect(logInfo).toHaveBeenCalledWith('[api/parcel-entitlement]', 'parcel entitlement', { uid: UID, duration_ms: expect.any(Number) });
  });
  it('no parcel_tool row -> 200 with every field null (the no-plan state)', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual(NULLS);
  });
  it('active, 5 used -> 200 with the server-computed counts (FE-05)', async () => {
    db({ status: 'active', used: 5 });
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ status: 'active', reportsUsed: 5, reportsLimit: 20, reportsLeft: 15, reportsLimitReached: false, resetsOn: '2026-12-05T10:00:00.000Z', resetsOnDisplay: '5 Dec 2026' });
  });
  it('used at the limit -> reportsLeft 0, reportsLimitReached true', async () => {
    db({ status: 'trial', used: 20 });
    expect((await call()).body.data).toMatchObject({ reportsLeft: 0, reportsLimitReached: true });
  });
  it('a status outside the allowed set -> the status with null counts', async () => {
    db({ status: 'expired' });
    expect((await call()).body.data).toEqual({ ...NULLS, status: 'expired' });
  });
  it('a read failure -> 500 with no data', async () => {
    db({ throws: true });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('db down');
  });
  it('read-only: no lock and no write', async () => {
    db({ status: 'active', used: 1 });
    await call();
    const sql = poolQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).not.toMatch(/FOR UPDATE|INSERT|UPDATE\s+\w+\s+SET|DELETE FROM/);
  });
  it('the response schema is .strict(): an extra key is refused', () => {
    expect(ParcelToolEntitlementResponseSchema.safeParse(NULLS).success).toBe(true);
    expect(ParcelToolEntitlementResponseSchema.safeParse({ ...NULLS, access: 'lead_gen' }).success).toBe(false);
  });
  it('getCurrentUserContext is the first await in the handler (Spec 90 §11)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/api/parcels/entitlement/route.ts'), 'utf8');
    const h = src.indexOf('withApiEnvelope(async function GET');
    const auth = src.indexOf('await getCurrentUserContext(request, pool)');
    expect(h).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(h);
    const other = src.slice(h).search(/await\s+(?!getCurrentUserContext)/);
    expect(other === -1 || h + other > auth).toBe(true);
  });
});
