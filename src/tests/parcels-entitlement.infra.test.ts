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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const poolQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) }, withTransaction: vi.fn() }));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

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
function db(o: { status?: string | null; used?: number; throws?: boolean } = {}) {
  poolQuery.mockImplementation(async (text: string) => {
    if (o.throws) throw new Error('db down');
    if (/FROM entitlements/.test(text)) {
      return o.status ? { rows: [{ status: o.status, current_period_end: '2026-12-05T10:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', now: '2026-11-20T12:00:00.000Z' }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/FROM logic_variables/.test(text)) return { rows: [{ variable_key: REPORT_LIMIT_KEYS.plan, variable_value: '20' }, { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: '20' }] };
    if (/FROM usage_events/.test(text)) return { rows: [{ used: o.used ?? 0, already: false }] };
    throw new Error(`unexpected query: ${text}`);
  });
}
const NULLS = { status: null, reportsUsed: null, reportsLimit: null, reportsLeft: null, reportsLimitReached: null, resetsOn: null };

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
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
  it('rate limited -> 429 on the parcels-entitlement:{uid} bucket, nothing read', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 } as never);
    const r = await call();
    expect(r.status).toBe(429);
    expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toMatchObject({ key: `parcels-entitlement:${UID}` });
    expect(poolQuery).not.toHaveBeenCalled();
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
    expect(r.body.data).toEqual({ status: 'active', reportsUsed: 5, reportsLimit: 20, reportsLeft: 15, reportsLimitReached: false, resetsOn: '2026-12-05T10:00:00.000Z' });
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
