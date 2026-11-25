// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §5.2 (`*.security.test.ts`, mandated for auth-guarded and externally reachable surfaces);
//              docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 (the auth call is the first call of a route).
//
// task-456 N3 (mcfixreborn-g3 GROUNDER-E.md:95; fold plan FIX.SEARCH-TESTS): the three customer parcel routes under src/app/api/parcels, as an attacker
// reaches them:
//   - no session: 401 UNAUTHORIZED, no pool query, no rate-limit call (the auth call comes first);
//   - a ?uid=<OTHER> parameter is ignored: every read, the rate-limit key and the lot-size insert carry the session uid only.
// Mocked-route harness, the mocks of parcels-entitlement.infra.test.ts, parcel-lookup-gate.infra.test.ts and parcels-lot-size-route.infra.test.ts.
// task-454: the lookup and entitlement routes read their limits through readSearchSettings (one shared ANY read on logic_variables, told from
// the other reads by its bound keys) and answer 500 when a row is missing, so the pool answers that read with the seed defaults, and every served
// case also asserts the status is not 500 (a missing settings answer cannot pass as a handled request). No database, no network.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const seed = vi.hoisted(() => ({ enabledMax: 1 }));
const poolQuery = vi.fn();
const txQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({ query: (...a: unknown[]) => txQuery(...a) })),
}));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
vi.mock('@/lib/admin/parcel-lookup', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/parcel-lookup')>()),
  resolveAddress: vi.fn(),
  fetchParcelById: vi.fn(async () => null),
  fetchCoaProjects: vi.fn(async () => []),
}));
vi.mock('@/lib/parcels/lot-map', async (orig) => ({ ...(await orig<typeof import('@/lib/parcels/lot-map')>()), resolveLotMap: vi.fn() }));
vi.mock('@/lib/parcels/lot-form', async (orig) => ({
  ...(await orig<typeof import('@/lib/parcels/lot-form')>()),
  readLotForm: vi.fn(async () => ({ detected: 'detached', basis: 'o4_not_met', unsure: false })),
}));
vi.mock('@/lib/parcels/report-page', async (orig) => ({
  ...(await orig<typeof import('@/lib/parcels/report-page')>()),
  readCustomerPageResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/parcels/report-compute', () => ({ computeCustomerPageResponse: vi.fn(async () => null) }));
// The lot-size switch is 0-0 in the committed seed; the route test lifts the bound the same way (parcels-lot-size-route.infra.test.ts).
vi.mock('../../scripts/seeds/logic_variables.json', async (orig) => {
  const real = ((await orig()) as { default: Record<string, Record<string, unknown>> }).default;
  return { default: new Proxy(real, { get: (t, k: string) => (k === 'user_lot_size_entry_enabled' ? { ...t[k], max: seed.enabledMax } : t[k]) }) };
});

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { REPORT_LIMIT_KEYS } from '@/lib/entitlements';
import { LOT_SIZE_SETTING_KEYS } from '@/lib/parcels/lot-size-entry';
import { GET as lookupGET } from '@/app/api/parcels/lookup/route';
import { GET as entitlementGET } from '@/app/api/parcels/entitlement/route';
import { POST as lotSizePOST } from '@/app/api/parcels/lot-size/route';

const UID = '00000000-0000-0000-0000-0000000456a1';
const OTHER = '00000000-0000-0000-0000-0000000456ff';

/** The seed defaults of the search settings (copied from parcels-entitlement.infra.test.ts SEARCH_DEFAULTS). */
const SEARCH_DEFAULTS: Record<string, string> = { parcel_lookup_search_per_min: '60', parcel_lookup_detail_per_min: '30', parcel_entitlement_read_per_min: '30', parcel_lookup_slow_query_ms: '500', maxbld_page_candidate_cap: '10' };
const isSearchSettings = (text: string, params: unknown): boolean =>
  /FROM logic_variables WHERE variable_key = ANY/.test(text) && Array.isArray(params) && Array.isArray(params[0]) && (params[0] as unknown[]).includes('parcel_lookup_search_per_min');
const LOT_SIZE_SETTINGS = [
  { variable_key: LOT_SIZE_SETTING_KEYS.enabled, variable_value: '1' },
  { variable_key: LOT_SIZE_SETTING_KEYS.min_sqm, variable_value: '46.45' },
  { variable_key: LOT_SIZE_SETTING_KEYS.max_sqm, variable_value: '4645.15' },
  { variable_key: LOT_SIZE_SETTING_KEYS.ratio_max, variable_value: '3' },
  { variable_key: LOT_SIZE_SETTING_KEYS.per_day, variable_value: '5' },
  { variable_key: LOT_SIZE_SETTING_KEYS.side_min_m, variable_value: '2' },
  { variable_key: LOT_SIZE_SETTING_KEYS.side_max_m, variable_value: '450' },
];

function db(): void {
  poolQuery.mockImplementation(async (text: string, params?: unknown) => {
    if (isSearchSettings(text, params)) {
      const rows = Object.entries(SEARCH_DEFAULTS).map(([variable_key, variable_value]) => ({ variable_key, variable_value }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM logic_variables WHERE variable_key = ANY/.test(text) && Array.isArray(params) && Array.isArray(params[0]) && (params[0] as unknown[]).includes(LOT_SIZE_SETTING_KEYS.enabled)) {
      return { rows: LOT_SIZE_SETTINGS, rowCount: LOT_SIZE_SETTINGS.length };
    }
    if (/FROM entitlements/.test(text)) {
      const row = { status: 'active', trial_started_at: null, plan_key: 'basic', current_period_end: '2026-12-05T10:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', now: '2026-11-20T12:00:00.000Z' };
      return { rows: [row], rowCount: 1 };
    }
    if (/FROM logic_variables/.test(text)) {
      return { rows: [{ variable_key: REPORT_LIMIT_KEYS.plan, variable_value: '20' }, { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: '20' }, { variable_key: REPORT_LIMIT_KEYS.pro, variable_value: '25' }, ...LOT_SIZE_SETTINGS] };
    }
    if (/FROM usage_events/.test(text)) return { rows: [{ used: 0, already: false }], rowCount: 1 };
    throw new Error(`unexpected pool query: ${text}`);
  });
  txQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    if (/FROM parcels p/.test(text)) return { rows: [{ parcel_pk: 77, city_sqm: '400', city_source: 'stated', entry_id: null, value_sqm: null, entered_at: null }] };
    if (/INSERT INTO parcel_user_inputs/.test(text)) return { rows: [{ value_sqm: String(params?.[1]), entered_at: '2026-11-10T19:00:00.000Z' }] };
    throw new Error(`unexpected tx query: ${text}`);
  });
}

const req = (pathname: string, qs: string, method: string, body?: unknown): NextRequest => ({
  url: `https://x.test${pathname}${qs ? `?${qs}` : ''}`, method, nextUrl: { pathname }, headers: { get: () => null },
  json: async () => body,
} as unknown as NextRequest);

const ROUTES: Array<[string, () => Promise<Response>, (qs: string) => Promise<Response>]> = [
  ['GET /api/parcels/lookup', () => lookupGET(req('/api/parcels/lookup', 'parcelId=GONE', 'GET')), (qs) => lookupGET(req('/api/parcels/lookup', `parcelId=GONE&${qs}`, 'GET'))],
  ['GET /api/parcels/entitlement', () => entitlementGET(req('/api/parcels/entitlement', '', 'GET')), (qs) => entitlementGET(req('/api/parcels/entitlement', qs, 'GET'))],
  ['POST /api/parcels/lot-size', () => lotSizePOST(req('/api/parcels/lot-size', '', 'POST', { parcel_id: 'P-1', lot_area_value: 3120, lot_area_unit: 'sqft' })),
    (qs) => lotSizePOST(req('/api/parcels/lot-size', qs, 'POST', { parcel_id: 'P-1', lot_area_value: 3120, lot_area_unit: 'sqft' }))],
];

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
  txQuery.mockReset();
  seed.enabledMax = 1;
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'active' } as never);
  db();
});

describe('parcel routes: no session', () => {
  it.each(ROUTES)('%s: no session → 401, no pool query, no rate-limit call', async (_name, call) => {
    vi.mocked(getCurrentUserContext).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } | null }).error?.code).toBe('UNAUTHORIZED');
    expect(poolQuery).not.toHaveBeenCalled();
    expect(txQuery).not.toHaveBeenCalled();
    expect(vi.mocked(withRateLimit)).not.toHaveBeenCalled();
  });
});

describe('parcel routes: a uid parameter is ignored', () => {
  it.each(ROUTES)('%s: a ?uid=<OTHER> parameter is ignored', async (_name, _call, withQs) => {
    const res = await withQs(`uid=${OTHER}`);
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    const keys = vi.mocked(withRateLimit).mock.calls.map((c) => (c[1] as { key: string }).key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain(UID);
    expect(keys[0]).not.toContain(OTHER);
    expect(JSON.stringify(poolQuery.mock.calls)).not.toContain(OTHER);
    expect(JSON.stringify(txQuery.mock.calls)).not.toContain(OTHER);
  });
  it('POST /api/parcels/lot-size: the insert carries the session uid', async () => {
    const res = await ROUTES[2]![2](`uid=${OTHER}`);
    expect(res.status).toBe(200);
    const insert = txQuery.mock.calls.find((c) => /INSERT INTO parcel_user_inputs/.test(String(c[0])));
    expect(insert).toBeDefined();
    expect(JSON.stringify(insert)).toContain(UID);
    expect(JSON.stringify(insert)).not.toContain(OTHER);
  });
});
