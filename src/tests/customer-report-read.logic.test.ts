// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the nullable `page`); docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7,
//            §11b.2 dated note 2026-11-11 (never a second resolver); docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-38, FE-39 (no legacy
//            value ever reaches a user), FE-27 (fe.27: parcels is a source in the closed binding set; a column the read does not select fails);
//            backlog/docs/doc-16 (McStorage policy v2: a stale record is never served).
//
// MB-44 W (task-123, 1.3) · the customer read module `readCustomerPageResponse` in src/lib/parcels/report-page.ts. Red first (Spec 08 08_agents.md:490),
// written from docs/reports/lanes/2026-11-19/BL-W/PLAN.md section 4 (T1 to T10). No database: the pool is a scripted fake, as in the tests beside this one.
//   T1 gate        MAXBLD_WEB_LIVE false: null, and no query of any kind
//   T2 miss        no parcel, no stamp, table absent, no rows: null (table absent also warns once); a thrown query propagates, never a miss
//   T3 stale       rows computed against an older catalogue, switchboard or Layer 2 table: null, never the page
//   T4 current     a response buildPage and the mobile view accept; the expected values are HAND-WRITTEN, not taken from the admin producer
//   T5 gated       a gated lot is a deliberate all-not-evaluated page, not a miss
//   T6 scope       W and the shared read import no meter, entitlement, usage, consumer-lookup or admin module and write nothing; the fence is not vacuous
//   T7 route       through the real lookup route: a current lot sends a page (compute never called); a stale lot computes (LOAD.1) and sends that page; a thrown compute is a 500; the switch off reads no lot table
//   T8 no legacy   no key outside the declared page fields, none inside `values` outside the declared bindings, no legacy column name anywhere
//   T9 parity      for the same scripted lot, W's page equals the admin preview's page (one resolver)
//   T10 importers  only the lookup route and the LOAD.1 compute entry import report-page.ts
//   T11 fe.27      (task-442, FINAL.7 plan section 3 T2) a parcels column the page binds but the one static parcels read does not select fails at load
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const live = { on: false };
vi.mock('@/lib/surfaces/maxbld-web', async (orig) => ({
  ...(await orig<typeof import('@/lib/surfaces/maxbld-web')>()),
  get MAXBLD_WEB_LIVE(): boolean { return live.on; },
}));
const poolQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({ query: vi.fn() })),
}));
const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();
vi.mock('@/lib/logger', () => ({ logInfo: (...a: unknown[]) => logInfo(...a), logWarn: (...a: unknown[]) => logWarn(...a), logError: (...a: unknown[]) => logError(...a) }));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/admin/parcel-lookup', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/parcel-lookup')>()),
  resolveAddress: vi.fn(),
  fetchParcelById: vi.fn(),
  fetchCoaProjects: vi.fn(async () => []),
}));
// LOAD.1 (task-266): the compute entry runs for real unless a test scripts it (the switch-off case below proves the real gate).
vi.mock('@/lib/parcels/report-compute', async (orig) => {
  const real = await orig<typeof import('@/lib/parcels/report-compute')>();
  return { ...real, computeCustomerPageResponse: vi.fn(real.computeCustomerPageResponse) };
});
vi.mock('@/lib/parcels/lot-form', async (orig) => ({
  ...(await orig<typeof import('@/lib/parcels/lot-form')>()),
  readLotForm: vi.fn(async () => ({ detected: 'detached', basis: 'o4_not_met', unsure: false })),
}));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { resolveAddress, fetchParcelById } from '@/lib/admin/parcel-lookup';
import { mobilePageView, readCustomerPageResponse } from '@/lib/parcels/report-page';
import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';
import { CONSUMER_WITHHELD_LEGACY_COLS } from '@/lib/parcels/consumer-lookup';
import { storedPageResponse } from '@/lib/admin/report-preview-live/stored-page';
import { pageBindings, type Binding } from '@/lib/report-projection/project';
import { CURRENT_SEED_SHAS } from '@/lib/report-projection/seed-shas';
import { buildPage } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { GET } from '@/app/api/parcels/lookup/route';
import type { StoredRow, LotStamp } from '@/lib/report-projection/project';
import { makeStoredScenarioRow, makeLotStamp, makeStoredParcelRow, type StoredParcelRow } from './factories';

type Json = Record<string, unknown>;
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- a scripted lot: the four stored reads W makes, answered by SQL text (no database) ----
const UID = '00000000-0000-0000-0000-000000000123';
const REF = 'P-123';
// task-456 D4 (Std §5.1, 00_engineering_standards.md:100): the lot's rows come from the typed builders in factories.ts.
interface Lot { parcel: StoredParcelRow | null; stamp: LotStamp | null; present: boolean; rows: StoredRow[] }
const PARCEL_ROW = makeStoredParcelRow({ parcel_id: REF });
const STAMP = makeLotStamp();
/** One stored scenario row, current by default (the shas the page core is checked against). */
const row = (field_id: string, status: string, value: string | null, extra: Partial<StoredRow> = {}): StoredRow => makeStoredScenarioRow({ field_id, status, value, ...CURRENT_SEED_SHAS, ...extra });
const ROWS = (extra: Partial<StoredRow> = {}): StoredRow[] => [
  row('permitted', 'permitted', null, extra), row('gfa_pitched_m2', 'computed', '248.05', extra), row('gfa_flat_m2', 'computed', '120', extra),
  row('storeys_max', 'computed', '3', extra), row('footprint_max_m2', 'computed', '120', extra), row('units_max', 'computed', '1', extra),
];
const CURRENT_LOT: Lot = { parcel: PARCEL_ROW, stamp: STAMP, present: true, rows: ROWS() };
const GATED_LOT: Lot = { ...CURRENT_LOT, stamp: makeLotStamp({ lot_gate: 'under_min_area' }), rows: [] };
/** task-454 SEARCHFIX.6: the lookup route reads its search settings rows first (readSearchSettings, the shared ANY read, told apart by its bound keys); the seed defaults. */
const SEARCH_SETTINGS = { rows: Object.entries({ parcel_lookup_search_per_min: '60', parcel_lookup_detail_per_min: '30', parcel_entitlement_read_per_min: '30', parcel_lookup_slow_query_ms: '500', maxbld_page_candidate_cap: '10' }).map(([variable_key, variable_value]) => ({ variable_key, variable_value })) };
const isSearchSettings = (text: string, params: unknown): boolean =>
  /FROM logic_variables WHERE variable_key = ANY/.test(text) && Array.isArray(params) && Array.isArray(params[0]) && (params[0] as unknown[]).includes('parcel_lookup_search_per_min');
const script = (lot: Lot, switchOn = true) => async (text: string, params?: unknown) => {
  if (isSearchSettings(text, params)) return SEARCH_SETTINGS;
  if (/FROM logic_variables/.test(text)) return { rows: switchOn ? [{ variable_value: '1' }] : [] };
  if (/FROM parcels WHERE parcel_id/.test(text)) return { rows: lot.parcel ? [lot.parcel] : [] };
  if (/FROM bylaw_resolution_lot_stamps/.test(text)) return { rows: lot.stamp ? [lot.stamp] : [] };
  if (/to_regclass\('public\.parcel_maxbld_scenarios'\)/.test(text)) return { rows: [{ present: lot.present }] };
  if (/FROM parcel_maxbld_scenarios WHERE parcel_id/.test(text)) return { rows: lot.rows };
  if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) return { rows: [], rowCount: 0 };
  throw new Error(`unexpected pool query: ${text}`);
};
const use = (lot: Lot): void => { poolQuery.mockImplementation(script(lot)); };

// ---- the expected page, HAND-WRITTEN (not read from the admin producer): 248.05 m2 = 2,670 sq ft, 120 m2 = 1,292 sq ft, 395.6 m2 = 4,258 sq ft ----
// (the same strings as the committed report goldens under src/tests/fixtures/report-page/ and the formatter pins in admin-report-preview-live.logic.test.ts)
const EXPECTED_CURRENT = {
  page: 'v21',
  values: {
    'o1.size.value': '2,670', 'o1.size.unit': 'sq ft', 'o1.size.m2': '248 m²', 'o1.row.max': '2,670 sq ft (248 m²)',
    'o1.row.storeys': '3', 'o1.row.footprint': '1,292 sq ft (120 m²)', 'o1.row.homes': '1',
    'o2.size.value': '1,292', 'o2.size.unit': 'sq ft', 'o2.size.m2': '120 m²', 'o2.row.max': '1,292 sq ft (120 m²)',
    'o2.row.storeys': '3', 'o2.row.footprint': '1,292 sq ft (120 m²)', 'o2.row.homes': '1',
    'lot.size': '4,258 sq ft · 396 m²', 'lot.corner.value': 'No', 'sheet.record': '4,258 sq ft · 396 m²',
  },
  hidden: [],
  not_evaluated: ['o3'],
};
const EXPECTED_GATED = {
  page: 'v21',
  values: {
    'o1.panel.reason': 'Not yet evaluated', 'o2.panel.reason': 'Not yet evaluated', 'o3.panel.reason': 'Not yet evaluated',
    'lot.size': '4,258 sq ft · 396 m²', 'lot.corner.value': 'No', 'sheet.record': '4,258 sq ft · 396 m²',
  },
  hidden: [],
  not_evaluated: ['o1', 'o2', 'o3'],
};
const OLD_SHA = 'f'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  live.on = false;
  poolQuery.mockReset();
});

describe('T1 the gate: MAXBLD_WEB_LIVE false returns null and reads no lot data', () => {
  it('a current lot is still a miss, and the pool is never touched', async () => {
    use(CURRENT_LOT);
    expect(await readCustomerPageResponse(REF)).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
  });
  it('the gate is the first statement of the function (source order)', () => {
    const src = read('src/lib/parcels/report-page.ts');
    const body = src.slice(src.indexOf('export async function readCustomerPageResponse'));
    expect(body).toMatch(/\{\s*\n\s*if \(!MAXBLD_WEB_LIVE\) return null;/);
  });
});

describe('T2 the miss: no current stored result is a null, never a half page; a thrown query is not a miss', () => {
  beforeEach(() => { live.on = true; });
  it('no such parcel: null after the one parcels read', async () => {
    use({ ...CURRENT_LOT, parcel: null });
    expect(await readCustomerPageResponse(REF)).toBeNull();
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
  it('no Layer 2 stamp: null', async () => {
    use({ ...CURRENT_LOT, stamp: null });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
  it('no scenario rows: null', async () => {
    use({ ...CURRENT_LOT, rows: [] });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
  it('the scenario table absent: null, and one warning line names it (an environment without migration 309 must be visible)', async () => {
    use({ ...CURRENT_LOT, present: false, rows: [] });
    expect(await readCustomerPageResponse(REF)).toBeNull();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logWarn.mock.calls[0])).toContain('table_absent');
  });
  it('a thrown query propagates to the route catch (a 500), it is not turned into a miss', async () => {
    poolQuery.mockRejectedValue(new Error('db down'));
    await expect(readCustomerPageResponse(REF)).rejects.toThrow('db down');
  });
  it('the other misses do not warn', async () => {
    use({ ...CURRENT_LOT, stamp: null });
    await readCustomerPageResponse(REF);
    use({ ...CURRENT_LOT, rows: [] });
    await readCustomerPageResponse(REF);
    expect(logWarn).not.toHaveBeenCalled();
  });
});

describe('T3 stale: a record computed against an older catalogue, switchboard or Layer 2 table is never served', () => {
  beforeEach(() => { live.on = true; });
  it('an older catalogue sha: null', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ catalogue_sha: OLD_SHA }) });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
  it('an older switchboard sha: null', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ switchboard_sha: OLD_SHA }) });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
  it('a Layer 2 table version that is not the stamp: null', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ layer2_table_version: 'T0' }) });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
  it('one stale row among current rows is enough: null', async () => {
    const rows = ROWS();
    rows[2] = { ...(rows[2] as StoredRow), catalogue_sha: OLD_SHA };
    use({ ...CURRENT_LOT, rows });
    expect(await readCustomerPageResponse(REF)).toBeNull();
  });
});

describe('T4 current: the page the renderer takes, with hand-written values', () => {
  beforeEach(() => { live.on = true; });
  it('returns exactly the expected response', async () => {
    use(CURRENT_LOT);
    expect(await readCustomerPageResponse(REF)).toEqual(EXPECTED_CURRENT);
  });
  it('reads the lot by its varchar id, then the stamp and the rows by the integer id (parameterised, static text)', async () => {
    use(CURRENT_LOT);
    await readCustomerPageResponse(REF);
    const calls = poolQuery.mock.calls as Array<[string, unknown[] | undefined]>;
    expect(calls).toHaveLength(4);
    expect(calls[0]?.[1]).toEqual([REF]);
    expect(calls[1]?.[1]).toEqual([7]);
    expect(calls[3]?.[1]).toEqual([7]);
    for (const [sql] of calls) expect(sql).not.toContain(REF);
  });
  it('buildPage accepts it and the mobile view parses through the strict view schema', async () => {
    use(CURRENT_LOT);
    const r = (await readCustomerPageResponse(REF)) as Json;
    expect(() => buildPage(r, reportCtx)).not.toThrow();
    expect(() => mobilePageView(r)).not.toThrow();
  });
});

describe('T5 gated: a gated lot is the deliberate all-not-evaluated page, not a miss', () => {
  beforeEach(() => { live.on = true; });
  it('returns the page with every option not evaluated and no number', async () => {
    use(GATED_LOT);
    const r = (await readCustomerPageResponse(REF)) as Json;
    expect(r).toEqual(EXPECTED_GATED);
    expect(() => mobilePageView(r)).not.toThrow();
  });
});

describe('T5b gated with stored rows that are stale or absent: still no option number (review r2 finding 2)', () => {
  beforeEach(() => { live.on = true; });
  it('stale rows on a gated lot serve the all-not-evaluated page, with no option number', async () => {
    use({ ...GATED_LOT, rows: ROWS({ catalogue_sha: OLD_SHA }) });
    const r = (await readCustomerPageResponse(REF)) as { values: Json; not_evaluated: string[] };
    expect(r.not_evaluated).toEqual(['o1', 'o2', 'o3']);
    expect(Object.keys(r.values).filter((k) => /^o\d\./.test(k) && !k.endsWith('.panel.reason'))).toEqual([]);
  });
  it('an absent scenario table on a gated lot serves the same page', async () => {
    use({ ...GATED_LOT, present: false, rows: [] });
    const r = (await readCustomerPageResponse(REF)) as Json;
    expect(r).toEqual(EXPECTED_GATED);
  });
});

describe('T6 scope: W holds no user check, meters nothing and writes nothing', () => {
  const FILES = ['src/lib/parcels/report-page.ts', 'src/lib/parcels/report-compute.ts', ...fs.readdirSync(path.join(ROOT, 'src/lib/report-projection')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/report-projection/${f}`)];
  const BAD_IMPORT = /entitlement|usage|openReport|consumer-lookup|api\/parcels\/lookup(?!\/types)|parcel-tool|report-preview-live|@\/lib\/admin|@\/app\/admin|@\/app\/api\/admin|auth\//;
  const BAD_IMPORT_IN = (src: string): string[] => [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1] as string).filter((i) => BAD_IMPORT.test(i));
  it('imports no meter, entitlement, usage, consumer lookup, auth or admin module (report-page.ts, and every file of src/lib/report-projection/)', () => {
    expect(FILES.length).toBeGreaterThan(4);
    for (const f of FILES) expect(BAD_IMPORT_IN(read(f)), f).toEqual([]);
  });
  it('contains no write verb', () => {
    for (const f of FILES) expect(read(f), f).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s/);
  });
  it('the only db import of report-page.ts is the pool', () => {
    const imports = [...read('src/lib/parcels/report-page.ts').matchAll(/from '(@\/lib\/db\/[^']*)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['@/lib/db/client']);
    expect(read('src/lib/parcels/report-page.ts')).toMatch(/import \{ pool \} from '@\/lib\/db\/client';/);
  });
  it('the fence is not vacuous: planted imports are caught', () => {
    expect(BAD_IMPORT_IN("import { storedPageResponse } from '@/lib/admin/report-preview-live/stored-page';")).toHaveLength(1);
    expect(BAD_IMPORT_IN("import { openReport } from '@/lib/entitlements';")).toHaveLength(1);
    expect(BAD_IMPORT_IN("import { getCurrentUserContext } from '@/lib/auth/get-user-context';")).toHaveLength(1);
    expect(BAD_IMPORT_IN("import { pool } from '@/lib/db/client';")).toEqual([]);
  });
});

describe('T7 the route: the real lookup route over the real read module', () => {
  const req = (qs: string): NextRequest => ({ url: `https://x.test/api/parcels/lookup?${qs}`, nextUrl: { pathname: '/api/parcels/lookup' }, headers: { get: () => null } } as unknown as NextRequest);
  const call = async (): Promise<{ status: number; body: { data: (Json & { page: Json | null }) | null } }> => {
    const res = await GET(req('parcelId=P-123'));
    return { status: res.status, body: (await res.json()) as { data: (Json & { page: Json | null }) | null } };
  };
  const meterLog = (): Json => (logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')?.[2] ?? {}) as Json;
  beforeEach(() => {
    live.on = true;
    // the transitional lead_gen path (unmetered), as parcels-lookup-page.logic.test.ts does: the page logic is the same on both access paths
    vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'active' } as never);
    vi.mocked(fetchParcelById).mockResolvedValue({ parcel_id: REF, lot_size_sqm: 400, neighbourhood_id: null, __display_address: '1 Test St' } as never);
    vi.mocked(resolveAddress).mockResolvedValue({ match: { parcelId: REF, matchType: 'exact', address: '1 Test St' }, candidates: [], truncated: false, resolution: 'unique', lotMap: null } as never);
  });
  it('a current lot: 200, the page is the mobile view of the stored page, and the log says a page was sent', async () => {
    use(CURRENT_LOT);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toEqual(mobilePageView(EXPECTED_CURRENT));
    expect(meterLog().page).toBe(true);
  });
  it('a current lot is read, never computed (W first)', async () => {
    use(CURRENT_LOT);
    await call();
    expect(computeCustomerPageResponse).not.toHaveBeenCalled();
    expect(meterLog().page_source).toBe('stored');
  });
  it('a stale lot computes (LOAD.1): 200, the page is the mobile view of the computed response, and the log says computed', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ catalogue_sha: OLD_SHA }) });
    vi.mocked(computeCustomerPageResponse).mockResolvedValueOnce(EXPECTED_CURRENT);
    const r = await call();
    expect(r.status).toBe(200);
    expect(computeCustomerPageResponse).toHaveBeenCalledWith(REF);
    expect(r.body.data?.page).toEqual(mobilePageView(EXPECTED_CURRENT));
    expect(meterLog().page).toBe(true);
    expect(meterLog().page_source).toBe('computed');
    expect(typeof meterLog().compute_ms).toBe('number');
  });
  it('a stale lot the engine cannot compute (null): 200 with page null, and the log says no page', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ catalogue_sha: OLD_SHA }) });
    vi.mocked(computeCustomerPageResponse).mockResolvedValueOnce(null);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toBeNull();
    expect(meterLog().page).toBe(false);
    expect(meterLog().page_source).toBe('none');
  });
  it('a thrown compute is a 500 with no payload and nothing logged as a lookup (no meter), not a miss', async () => {
    use({ ...CURRENT_LOT, rows: ROWS({ catalogue_sha: OLD_SHA }) });
    vi.mocked(computeCustomerPageResponse).mockRejectedValueOnce(new Error('compute down'));
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')).toBeUndefined();
  });
  it('the switch off: 200 with page null, the real compute gate answers null and the lot tables are never read', async () => {
    live.on = false;
    use(CURRENT_LOT);
    const r = await call();
    expect(r.body.data?.page).toBeNull();
    expect((poolQuery.mock.calls as Array<[string]>).filter(([t]) => /parcel_maxbld_scenarios|bylaw_resolution_lot_stamps/.test(t))).toEqual([]);
  });
  it('a thrown read is a 500 with no payload, not a miss', async () => {
    poolQuery.mockImplementation(async (text: string, params?: unknown) => {
      if (isSearchSettings(text, params)) return SEARCH_SETTINGS;
      if (/FROM entitlements/.test(text)) return { rows: [], rowCount: 0 };
      throw new Error('db down');
    });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('db down');
  });
  it('the route meters only a produced page: its meter branch is guarded by page === null (source pin)', () => {
    expect(read('src/app/api/parcels/lookup/route.ts')).toMatch(/body\.page === null\) meter = 'not_produced'/);
  });
});

describe('T8 no legacy value anywhere: FE-38 and FE-39 (Spec 135)', () => {
  beforeEach(() => { live.on = true; });
  const DECLARED_TOP = ['page', 'values', 'hidden', 'not_evaluated'];
  const DECLARED_VALUE_KEYS = new Set(pageBindings().map((b) => b.key));
  const keysDeep = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keysDeep) : v !== null && typeof v === 'object' ? Object.entries(v as Json).flatMap(([k, x]) => [k, ...keysDeep(x)]) : []);
  it('the closed top-level keys, for a current page and a gated page', async () => {
    for (const lot of [CURRENT_LOT, GATED_LOT]) {
      use(lot);
      const r = (await readCustomerPageResponse(REF)) as Json;
      expect(Object.keys(r).sort()).toEqual([...DECLARED_TOP].sort());
    }
  });
  it('every key inside `values` is a declared binding key', async () => {
    use(CURRENT_LOT);
    const r = (await readCustomerPageResponse(REF)) as { values: Json };
    expect(DECLARED_VALUE_KEYS.size).toBeGreaterThan(20);
    for (const k of Object.keys(r.values)) expect(DECLARED_VALUE_KEYS.has(k), `values key ${k}`).toBe(true);
  });
  it('no key at any depth is a legacy column name (the consumer withheld set), and no legacy column rides on the parcels row into the page', async () => {
    // a parcels row that carries legacy columns (a SELECT * leak) must not reach the page: the read selects declared columns only
    use({ ...CURRENT_LOT, parcel: makeStoredParcelRow({ parcel_id: REF, estimated_cost_max: 999999, variance_prediction: 1.7 }) });
    const r = await readCustomerPageResponse(REF);
    const found = keysDeep(r).filter((k) => CONSUMER_WITHHELD_LEGACY_COLS.has(k) || /variance|estimated_cost|legacy/i.test(k));
    expect(found).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/999999|1\.7/);
    expect(CONSUMER_WITHHELD_LEGACY_COLS.size).toBeGreaterThan(5);
  });
});

describe('T9 parity: one resolver for the admin preview and the customer read', () => {
  beforeEach(() => { live.on = true; });
  it('for the same scripted lot, W returns the page the admin preview projects (current and gated)', async () => {
    for (const lot of [CURRENT_LOT, GATED_LOT]) {
      use(lot);
      const admin = await storedPageResponse({ query: poolQuery as never }, REF);
      expect(admin.outcome).toBe('ok');
      use(lot);
      const w = await readCustomerPageResponse(REF);
      expect(w).toEqual((admin as { response: unknown }).response);
    }
  });
});

describe('T10 importers: report-page.ts is server code, imported by the lookup flow file and the LOAD.1 compute entry only', () => {
  const walkIn = (root: string, d: string): string[] => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walkIn(root, path.join(d, e.name))) : /\.(ts|tsx|js|mjs)$/.test(e.name) ? [path.join(d, e.name)] : [])) : []);
  const IMPORTS = (src: string): boolean => /from '[^']*lib\/parcels\/report-page'/.test(src);
  /** The real walk and filter over a tree root (the plant runs it on a planted tree). */
  const pageImporters = (root: string): { n: number; list: string[] } => {
    const files = [...walkIn(root, 'src'), ...walkIn(root, 'mobile/src'), ...walkIn(root, 'mobile/app')].filter((f) => !f.startsWith('src/tests/') && f !== 'src/lib/parcels/report-page.ts');
    return { n: files.length, list: files.filter((f) => IMPORTS(fs.readFileSync(path.join(root, f), 'utf8'))) };
  };
  const EXPECTED = ['src/lib/parcels/lookup-flow.ts', 'src/lib/parcels/report-compute.ts']; // STD.ROUTE (task-383): the lookup flow file, not the route, reads the page; LOAD.1 (task-266): the compute entry applies the same miss rule (pageForVerdict), the one place
  it('no component, mobile source or other lib file imports it; the non-test importers are the flow file and the compute entry', () => {
    const r = pageImporters(ROOT);
    expect(r.n).toBeGreaterThan(500);
    expect(r.list).toEqual(EXPECTED);
  });
  it('RED plant: a planted route importing report-page fails the lock; the control tree passes it (same walk and filter)', () => {
    const mk = (extra: boolean): string => {
      const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'std-route-'));
      const put = (rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
      for (const f of EXPECTED) put(f, "import { readCustomerPageResponse } from '@/lib/parcels/report-page';\n");
      if (extra) put('src/app/api/parcels/lookup/route.ts', "import { readCustomerPageResponse } from '@/lib/parcels/report-page';\n");
      return tmp;
    };
    const control = mk(false); const planted = mk(true);
    expect(pageImporters(control).list).toEqual(EXPECTED);
    expect(pageImporters(planted).list).not.toEqual(EXPECTED);
    fs.rmSync(control, { recursive: true, force: true }); fs.rmSync(planted, { recursive: true, force: true });
  });
  it('the fence is not vacuous', () => {
    expect(IMPORTS("import { readCustomerPageResponse } from '@/lib/parcels/report-page';")).toBe(true);
  });
});

// T11 stays the LAST describe of this file: case (a) resets the module registry and plants a mock of the projection module; its finally undoes
// both, and every describe above uses static imports bound at load (the doMock form of src/tests/maxbld-web-pages.logic.test.ts:113-119).
// Gates 4 and 5 of the task-442 plan section 0 (the src SQL ledger catalog membership, consumer-registry declared writers) are not repeated here.
describe('T11 fe.27: a parcels column the page binds but the static parcels read does not select fails at load (task-442)', () => {
  const PROJECT = '@/lib/report-projection/project';
  const PLANTED: Binding = { section: 'lot', building_type: null, key: 'lot.fsi', unitPart: false, rule: 'int', field: 'max_build_fsi', source: { kind: 'parcels', column: 'max_build_fsi' } };
  const parcelsColumns = (): string[] => [...new Set(pageBindings().flatMap((b) => (b.source.kind === 'parcels' ? [b.source.column] : [])))].sort();
  it('(a) planted binding: importing the read module throws, naming the column', async () => {
    try {
      expect(parcelsColumns()).not.toContain('max_build_fsi'); // the planted column is not one of the four selected columns (read-stored.ts:28)
      vi.resetModules();
      vi.doMock(PROJECT, async (orig) => {
        const real = await orig<typeof import('@/lib/report-projection/project')>();
        return { ...real, pageBindings: () => [...real.pageBindings(), PLANTED] };
      });
      await expect(import('@/lib/report-projection/read-stored')).rejects.toThrow('MB-93: page field source parcels:max_build_fsi is not in the static parcels read');
    } finally {
      vi.doUnmock('@/lib/report-projection/project');
      vi.resetModules();
    }
  });
  it('(b) control: the real module imports, and the scripted read returns exactly the parcels columns the page binds', async () => {
    const mod = await import('@/lib/report-projection/read-stored');
    expect(typeof mod.readLotFacts).toBe('function');
    const lot = await mod.readLotFacts({ query: script(CURRENT_LOT) as never }, REF);
    expect(parcelsColumns().length).toBeGreaterThan(0);
    expect(Object.keys(lot?.columns ?? {}).sort()).toEqual(parcelsColumns());
  });
});
