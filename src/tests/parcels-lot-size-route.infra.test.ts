// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (user inputs; dated note 2026-11-11), §11a.4 (provenance)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-19, FE-20; migrations/305_parcel_user_inputs.sql
//
// MF-19 · POST /api/parcels/lot-size and PUT /api/admin/parcels/lot-size/revert (operator 2026-11-11, D-1..D-8 "all as recommmended"), on the
// mocked-route harness of parcels-entitlement.infra.test.ts:
//   THE LOCK (D-6): with the switch off — and with a DB value of 1 while the seed bound is 0-0 — the route answers 403 ENTRY_OFF after its ONE
//     settings read: no parcel read, no transaction, no rate-limit call, whatever the body. No write path is reachable while off.
//   With the switch on (the seed bound raised in a test copy only): 401 first; 403 inactive before the body; strict 400s (NaN, Infinity, string,
//     zero, negative, 3 decimals, an extra entered_by key, a bad unit); the parse runs before the rate limit; 429 on parcels-lot-size:{uid} with the
//     admin per-day setting over a day window; 404; 409 with the stored entry (also from a 23505 race); D-2 shown edges pass and one past fails in
//     both units; D-3 the City ratio both ways; 200 stores m² rounded to 2 decimals (3,120 sq ft -> 289.86, shown "3,120 sq ft · 290 m²"); a 23:30
//     Toronto entry shows that day; 500 sanitised with a whitelisted log context (never the body).
//   The revert (D-4): verifyAdminAuth first, session only, 404 no entry, one UPDATE and one admin_audit_log row in the transaction.
//   Contract pins: route_request = entry_request + parcel_id (fold F5); the two m²/ft² constants agree (fold F8); the loader never writes the table.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const seed = vi.hoisted(() => ({ enabledMax: 0 }));
const poolQuery = vi.fn();
const clientQuery = vi.fn();
const txCalls = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => { txCalls(); return fn({ query: (...a: unknown[]) => clientQuery(...a) }); },
}));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/verify-admin', () => ({ verifyAdminAuth: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4 })) }));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
// The switch's seed bound is 0-0 (off). The "on" cases raise it in this test's copy of the seed only, never in the repo.
vi.mock('../../scripts/seeds/logic_variables.json', async (orig) => {
  const real = ((await orig()) as { default: Record<string, Record<string, unknown>> }).default;
  return { default: new Proxy(real, { get: (t, k: string) => (k === 'user_lot_size_entry_enabled' ? { ...t[k], max: seed.enabledMax } : t[k]) }) };
});

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { logError, logInfo } from '@/lib/logger';
import { POST } from '@/app/api/parcels/lot-size/route';
import { PUT } from '@/app/api/admin/parcels/lot-size/revert/route';
import { CONTRACT, LOT_SIZE_SETTING_KEYS } from '@/lib/parcels/lot-size-entry';
import { SQM_TO_SQFT } from '@/lib/parcels/geometry';

const ROOT = path.resolve(__dirname, '../..');
const UID = '00000000-0000-0000-0000-0000000019e1';
type Body = { data: Record<string, unknown> | null; error: { code: string; message: string; details?: Record<string, unknown> } | null };
const req = (body: unknown, raw = false): NextRequest => ({
  url: 'https://x.test/api/parcels/lot-size', method: 'POST', nextUrl: { pathname: '/api/parcels/lot-size' }, headers: { get: () => null },
  json: async () => { if (raw) throw new SyntaxError('bad json'); return body; },
} as unknown as NextRequest);
const post = async (body: unknown, raw = false): Promise<{ status: number; body: Body }> => {
  const res = await POST(req(body, raw));
  return { status: res.status, body: (await res.json()) as Body };
};
const put = async (body: unknown): Promise<{ status: number; body: Body }> => {
  const res = await PUT(req(body));
  return { status: res.status, body: (await res.json()) as Body };
};

const SETTINGS = (enabled: number) => [
  { variable_key: LOT_SIZE_SETTING_KEYS.enabled, variable_value: String(enabled) },
  { variable_key: LOT_SIZE_SETTING_KEYS.min_sqm, variable_value: '46.45' },
  { variable_key: LOT_SIZE_SETTING_KEYS.max_sqm, variable_value: '4645.15' },
  { variable_key: LOT_SIZE_SETTING_KEYS.ratio_max, variable_value: '3' },
  { variable_key: LOT_SIZE_SETTING_KEYS.per_day, variable_value: '5' },
];
type Lot = { city?: number | null; entry?: { value_sqm: number; entered_at: string } | null; missing?: boolean };
function db(o: { enabled?: number; lot?: Lot; insertThrows?: unknown; enteredAt?: string; updateRows?: number; parcelTool?: string | null } = {}) {
  poolQuery.mockImplementation(async (text: string) => {
    if (/FROM logic_variables/.test(text)) return { rows: SETTINGS(o.enabled ?? 1) };
    if (/FROM entitlements/.test(text)) return { rows: o.parcelTool ? [{ status: o.parcelTool, trial_started_at: null }] : [] };
    throw new Error(`unexpected pool query: ${text}`);
  });
  clientQuery.mockImplementation(async (text: string, params: unknown[]) => {
    if (/FROM parcels p/.test(text)) {
      const lot = o.lot ?? { city: 400 };
      if (lot.missing) return { rows: [] };
      return { rows: [{ parcel_pk: 77, city_sqm: lot.city === null ? null : String(lot.city ?? 400), city_source: 'stated', entry_id: lot.entry ? '5' : null, value_sqm: lot.entry ? String(lot.entry.value_sqm) : null, entered_at: lot.entry?.entered_at ?? null }] };
    }
    if (/INSERT INTO parcel_user_inputs/.test(text)) {
      if (o.insertThrows) throw o.insertThrows;
      return { rows: [{ value_sqm: String(params[1]), entered_at: o.enteredAt ?? '2026-11-10T19:00:00.000Z' }] };
    }
    if (/UPDATE parcel_user_inputs/.test(text)) return { rowCount: o.updateRows ?? 1, rows: [] };
    if (/INSERT INTO admin_audit_log/.test(text)) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected client query: ${text}`);
  });
}
const writes = () => clientQuery.mock.calls.filter(([t]) => /INSERT|UPDATE|DELETE/.test(String(t)));
const OK = { parcel_id: 'P-1', lot_area_value: 3120, lot_area_unit: 'sqft' };

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
  clientQuery.mockReset();
  seed.enabledMax = 1;
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'active' } as never);
  vi.mocked(verifyAdminAuth).mockResolvedValue({ uid: 'admin-uid', authMethod: 'session' } as never);
  db();
});

describe('THE LOCK (D-6): no write path is reachable while the switch is off', () => {
  const bodies: unknown[] = [OK, { parcel_id: 'P-1', lot_area_value: 46.45, lot_area_unit: 'm2' }, { junk: true }, null];
  for (const [label, enabled, max] of [['the DB value 0', 0, 1], ['the DB value 1 with the seed bound 0-0 (as committed)', 1, 0], ['a value other than 1', 2, 2]] as const) {
    it(`${label}: 403 ENTRY_OFF after one settings read; no parcel read, no transaction, no rate call, for every body`, async () => {
      seed.enabledMax = max;
      for (const b of bodies) {
        vi.clearAllMocks();
        db({ enabled });
        const r = await post(b);
        expect([r.status, r.body.error?.code]).toEqual([403, 'ENTRY_OFF']);
        expect(poolQuery).toHaveBeenCalledTimes(1);
        expect(String(poolQuery.mock.calls[0]?.[0])).toMatch(/FROM logic_variables/);
        expect(clientQuery).not.toHaveBeenCalled();
        expect(txCalls).not.toHaveBeenCalled();
        expect(withRateLimit).not.toHaveBeenCalled();
      }
    });
  }
  it('the committed seed keeps the switch off: default 0, bounds 0-0, hidden from the Admin Control Panel', () => {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'))[LOT_SIZE_SETTING_KEYS.enabled];
    expect([s.default, s.min, s.max, s.admin]).toEqual([0, 0, 0, { hidden: 'internal' }]);
    const mig = fs.readFileSync(path.join(ROOT, 'migrations/305_parcel_user_inputs.sql'), 'utf8');
    expect(mig).toMatch(/\('user_lot_size_entry_enabled', 0,/);
  });
});

describe('POST /api/parcels/lot-size with the switch on (test copy of the seed bound)', () => {
  it('no session -> 401 before the switch is read', async () => {
    vi.mocked(getCurrentUserContext).mockResolvedValue(null);
    const r = await post(OK);
    expect(r.status).toBe(401);
    expect(poolQuery).not.toHaveBeenCalled();
  });
  it('D-4 the MF-45 gate: a parcel_tool plan in an active status passes with no lead_gen status; a lapsed parcel_tool with no lead_gen is 403', async () => {
    vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: null } as never);
    db({ parcelTool: 'active' });
    expect((await post(OK)).status).toBe(200);
    db({ parcelTool: 'cancelled' });
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([403, 'SUBSCRIPTION_REQUIRED']);
    expect(String(poolQuery.mock.calls.find(([q]) => /FROM entitlements/.test(String(q)))?.[1])).toBe(`${UID},parcel_tool`);
  });
  it('an inactive subscription -> 403 SUBSCRIPTION_REQUIRED before the body is read or the bucket used', async () => {
    vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'cancelled' } as never);
    const r = await post(null, true);
    expect([r.status, r.body.error?.code]).toEqual([403, 'SUBSCRIPTION_REQUIRED']);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });
  const bad: Array<[string, unknown]> = [
    ['NaN', { ...OK, lot_area_value: Number.NaN }], ['Infinity', { ...OK, lot_area_value: Number.POSITIVE_INFINITY }], ['a string', { ...OK, lot_area_value: '3120' }],
    ['zero', { ...OK, lot_area_value: 0 }], ['negative', { ...OK, lot_area_value: -5 }], ['3 decimals', { ...OK, lot_area_value: 3120.123 }],
    ['an extra entered_by', { ...OK, entered_by: UID }], ['a bad unit', { ...OK, lot_area_unit: 'acres' }], ['no parcel_id', { lot_area_value: 3120, lot_area_unit: 'sqft' }],
  ];
  for (const [label, b] of bad) {
    it(`400 ${label}, before the rate limit and with no DB work`, async () => {
      const r = await post(b);
      expect(r.status).toBe(400);
      expect(withRateLimit).not.toHaveBeenCalled();
      expect(clientQuery).not.toHaveBeenCalled();
    });
  }
  it('invalid JSON -> 400 INVALID_JSON', async () => {
    expect((await post(null, true)).body.error?.code).toBe('INVALID_JSON');
    expect(vi.mocked(logInfo).mock.calls.at(-1)?.[2]).toMatchObject({ outcome: 'bad_request', parcel_id: null }); // OUTPUT fold CR-2
  });
  it('429 on the parcels-lot-size:{uid} bucket, the admin per-day setting over a one-day window; nothing read or written', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 } as never);
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([429, 'RATE_LIMITED']);
    expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toEqual({ key: `parcels-lot-size:${UID}`, limit: 5, windowSec: 86_400 });
    expect(clientQuery).not.toHaveBeenCalled();
  });
  it('404 PARCEL_NOT_FOUND, nothing written', async () => {
    db({ lot: { missing: true } });
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([404, 'PARCEL_NOT_FOUND']);
    expect(writes()).toEqual([]);
  });
  it('409 LOT_SIZE_ALREADY_ENTERED with the stored entry (entered once), nothing written', async () => {
    db({ lot: { city: 400, entry: { value_sqm: 289.86, entered_at: '2026-11-10T19:00:00.000Z' } } });
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([409, 'LOT_SIZE_ALREADY_ENTERED']);
    expect(r.body.error?.details).toEqual({ lot_size: { sqm: 289.86, display: '3,120 sq ft · 290 m²', entered_at: '2026-11-10T19:00:00.000Z', entered_at_display: '10 Nov 2026', source: 'user' } });
    expect(writes()).toEqual([]);
  });
  it('a lost race (23505 on the partial unique index) is 409, never 500', async () => {
    db({ insertThrows: Object.assign(new Error('duplicate key'), { code: '23505' }) });
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([409, 'LOT_SIZE_ALREADY_ENTERED']);
  });
  // D-2: the shown edges (500 and 50,000 sq ft; 46.45 and 4,645.15 m²) pass; one past each fails, with the message in the typed unit.
  const edges: Array<[number, 'sqft' | 'm2', number]> = [
    [500, 'sqft', 200], [499, 'sqft', 400], [50000, 'sqft', 200], [50001, 'sqft', 400],
    [46.45, 'm2', 200], [46.44, 'm2', 400], [4645.15, 'm2', 200], [4645.16, 'm2', 400],
  ];
  for (const [v, unit, status] of edges) {
    it(`D-2 ${v} ${unit} -> ${status}`, async () => {
      db({ lot: { city: null } }); // no City record: the ratio check does not apply
      const r = await post({ parcel_id: 'P-1', lot_area_value: v, lot_area_unit: unit });
      expect(r.status).toBe(status);
      if (status === 400) {
        expect(r.body.error?.code).toBe('OUT_OF_RANGE');
        expect(r.body.error?.message).toBe(unit === 'sqft' ? 'Enter a lot size between 500 and 50,000 sq ft.' : 'Enter a lot size between 46.45 and 4,645.15 m².');
      }
    });
  }
  it('D-3: a sq ft number typed as m² (10.76x the City record) is refused with the server message; 1/3 and 3x pass, beyond fails', async () => {
    db({ lot: { city: 290 } });
    const slip = await post({ parcel_id: 'P-1', lot_area_value: 3120, lot_area_unit: 'm2' });
    expect([slip.status, slip.body.error?.code]).toEqual([400, 'FAR_FROM_CITY_RECORD']);
    expect(vi.mocked(logInfo).mock.calls.at(-1)?.[2]).toMatchObject({ outcome: 'far_from_city_record' }); // OUTPUT fold CR-2
    expect(slip.body.error?.message).toBe('This is far from the City lot record of 3,122 sq ft · 290 m². Check the number and the unit.');
    for (const [v, s] of [[870, 200], [870.01, 400], [96.67, 200], [96.66, 400]] as const) {
      db({ lot: { city: 290 } });
      expect((await post({ parcel_id: 'P-1', lot_area_value: v, lot_area_unit: 'm2' })).status).toBe(s);
    }
  });
  it('200 stores m² rounded to 2 decimals with source user; shows the server format; never the author or the typed value', async () => {
    const r = await post(OK);
    expect(r.status).toBe(200);
    const ins = clientQuery.mock.calls.find(([t]) => /INSERT INTO parcel_user_inputs/.test(String(t)))!;
    expect(String(ins[0])).toMatch(/'lot_area'[\s\S]*'user'/);
    expect(ins[1]).toEqual([77, 289.86, 3120, 'sqft', UID]);
    expect(r.body.data).toEqual({ lot_size: { sqm: 289.86, display: '3,120 sq ft · 290 m²', entered_at: '2026-11-10T19:00:00.000Z', entered_at_display: '10 Nov 2026', source: 'user' } });
    expect(JSON.stringify(r.body)).not.toMatch(/entered_by|typed_value|00000000-0000-0000-0000-0000000019e1/);
    expect(vi.mocked(logInfo).mock.calls.at(-1)?.[2]).toMatchObject({ uid: UID, outcome: 'stored', parcel_id: 'P-1' });
    expect(JSON.stringify(vi.mocked(logInfo).mock.calls)).not.toMatch(/3120/);
  });
  it('the m²-typed path end to end: 289.856 is refused (3 decimals) and 289.86 m² stores as typed', async () => {
    expect((await post({ parcel_id: 'P-1', lot_area_value: 289.856, lot_area_unit: 'm2' })).status).toBe(400);
    db();
    const r = await post({ parcel_id: 'P-1', lot_area_value: 289.86, lot_area_unit: 'm2' });
    expect(r.status).toBe(200);
    expect(clientQuery.mock.calls.find(([t]) => /INSERT INTO parcel_user_inputs/.test(String(t)))?.[1]).toEqual([77, 289.86, 289.86, 'm2', UID]);
  });
  it('a 23:30 Toronto entry (04:30 UTC the next day) shows the Toronto date', async () => {
    db({ enteredAt: '2026-11-11T04:30:00.000Z' });
    expect(((await post(OK)).body.data?.lot_size as Record<string, string>).entered_at_display).toBe('10 Nov 2026');
  });
  it('a settings value outside its seed bounds while on -> 500, sanitised; the log context is a whitelist (no body)', async () => {
    poolQuery.mockImplementation(async () => ({ rows: SETTINGS(1).map((r) => (r.variable_key === LOT_SIZE_SETTING_KEYS.max_sqm ? { ...r, variable_value: '999999' } : r)) }));
    const r = await post(OK);
    expect([r.status, r.body.error?.code]).toEqual([500, 'INTERNAL_ERROR']);
    expect(JSON.stringify(r.body)).not.toMatch(/user_lot_size/);
    const ctx = vi.mocked(logError).mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(Object.keys(ctx).sort()).toEqual(['route', 'uid']);
  });
});

describe('PUT /api/admin/parcels/lot-size/revert (D-4: the audited admin revert)', () => {
  it('no admin -> 401; a bearer admin -> 403 SESSION_REQUIRED; nothing read', async () => {
    vi.mocked(verifyAdminAuth).mockResolvedValueOnce(null as never);
    expect((await put({ parcel_id: 'P-1' })).status).toBe(401);
    vi.mocked(verifyAdminAuth).mockResolvedValueOnce({ uid: 'admin-uid', authMethod: 'bearer' } as never);
    expect((await put({ parcel_id: 'P-1' })).status).toBe(403);
    expect(clientQuery).not.toHaveBeenCalled();
  });
  it('400 on a bad body; 404 NO_ACTIVE_ENTRY with nothing written', async () => {
    expect((await put({ parcel_id: 'P 1; drop' })).status).toBe(400);
    expect((await put({ parcel_id: 'P-1', extra: 1 })).status).toBe(400);
    db({ lot: { city: 400, entry: null } });
    const r = await put({ parcel_id: 'P-1' });
    expect([r.status, r.body.error?.code]).toEqual([404, 'NO_ACTIVE_ENTRY']);
    expect(writes()).toEqual([]);
  });
  it('one UPDATE to reverted (the row stays) and one admin_audit_log row lot_size_revert, in one transaction', async () => {
    db({ lot: { city: 400, entry: { value_sqm: 289.86, entered_at: '2026-11-10T19:00:00.000Z' } } });
    const r = await put({ parcel_id: 'P-1' });
    expect(r.status).toBe(200);
    expect(txCalls).toHaveBeenCalledTimes(1);
    const w = writes().map(([t]) => String(t).replace(/\s+/g, ' ').trim());
    expect(w.length).toBe(2);
    expect(w[0]).toMatch(/^UPDATE parcel_user_inputs SET status = 'reverted', reverted_at = NOW\(\), reverted_by = \$2 WHERE id = \$1::bigint AND status = 'active'$/);
    expect(w[1]).toMatch(/^INSERT INTO admin_audit_log /);
    expect(writes().some(([t]) => /DELETE/.test(String(t)))).toBe(false);
    const audit = writes()[1]![1] as unknown[];
    expect([audit[0], audit[1], audit[2]]).toEqual(['admin-uid', 'lot_size_revert', 'P-1']);
    expect(String(audit[3])).not.toMatch(new RegExp(UID));
  });
  it('a revert that lost the row (0 rows updated) is 409 STALE_ENTRY and writes no audit row', async () => {
    db({ lot: { city: 400, entry: { value_sqm: 289.86, entered_at: '2026-11-10T19:00:00.000Z' } }, updateRows: 0 });
    const r = await put({ parcel_id: 'P-1' });
    expect([r.status, r.body.error?.code]).toEqual([409, 'STALE_ENTRY']);
    expect(writes().filter(([t]) => /admin_audit_log/.test(String(t)))).toEqual([]);
  });
  it('the revert does not read the switch (a bad entry must be fixable while the switch is off)', async () => {
    db({ enabled: 0, lot: { city: 400, entry: { value_sqm: 289.86, entered_at: '2026-11-10T19:00:00.000Z' } } });
    expect((await put({ parcel_id: 'P-1' })).status).toBe(200);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('contract and boundary pins', () => {
  it('OUTPUT fold S-2: the City-ratio seed max stays under the sq ft-as-m2 slip (10.7639), so no admin value can let it through', () => {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'))[LOT_SIZE_SETTING_KEYS.ratio_max];
    expect(s.max).toBeLessThan(SQM_TO_SQFT);
  });
  it('OUTPUT fold S-3: the route types never import the server library (the seed stays out of any client bundle)', () => {
    const types = fs.readFileSync(path.join(ROOT, 'src/app/api/parcels/lot-size/types.ts'), 'utf8');
    expect(types).not.toMatch(/from '@\/lib\/parcels\/lot-size-entry'/);
    expect(types).not.toMatch(/logic_variables\.json/);
  });
  it('fold F5: route_request = entry_request + parcel_id; revert_request is parcel_id only', () => {
    const e = CONTRACT.entry_request as { properties: Record<string, unknown>; required: string[] };
    const r = CONTRACT.route_request as { properties: Record<string, unknown>; required: string[] };
    expect(r.properties).toEqual({ parcel_id: CONTRACT.revert_request.properties.parcel_id, ...e.properties });
    expect([...r.required].sort()).toEqual(['parcel_id', ...e.required].sort());
    expect(Object.keys(CONTRACT.revert_request.properties)).toEqual(['parcel_id']);
  });
  it('fold F8: the two m²/ft² constants agree (src/lib/parcels/geometry.ts and scripts/lib/units.js)', async () => {
    const units = (await import('../../scripts/lib/units.js')) as unknown as { SQM_TO_SQFT?: number; default?: { SQM_TO_SQFT: number } };
    expect(units.SQM_TO_SQFT ?? units.default?.SQM_TO_SQFT).toBe(SQM_TO_SQFT);
  });
  it('D-1 a: the City loader never writes parcel_user_inputs, and nothing in src writes parcels.lot_size_sqm', () => {
    expect(fs.readFileSync(path.join(ROOT, 'scripts/load-parcels.descriptor.json'), 'utf8')).not.toMatch(/parcel_user_inputs/);
    expect(fs.readFileSync(path.join(ROOT, 'scripts/load-parcels.js'), 'utf8')).not.toMatch(/parcel_user_inputs/);
    const lib = fs.readFileSync(path.join(ROOT, 'src/lib/parcels/lot-size-entry.ts'), 'utf8');
    expect(lib).not.toMatch(/UPDATE\s+parcels\b|INSERT INTO parcels\b/);
  });
  it('the entry route reads the switch before any other DB call and before the body', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/api/parcels/lot-size/route.ts'), 'utf8');
    const i = (s: string) => src.indexOf(s);
    expect(i('await getCurrentUserContext')).toBeGreaterThan(-1);
    expect(i('await getCurrentUserContext')).toBeLessThan(i('await readLotSizeSettings'));
    expect(i('await readLotSizeSettings')).toBeLessThan(i("'ENTRY_OFF'"));
    expect(i("'ENTRY_OFF'")).toBeLessThan(i('request.json()'));
    expect(i('request.json()')).toBeLessThan(i('await withRateLimit'));
    expect(i('await withRateLimit')).toBeLessThan(i('withTransaction('));
  });
});
