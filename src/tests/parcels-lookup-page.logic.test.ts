// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-12, MF-48 Stage B: the nullable `page`),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 dated note 2026-11-11 (MF-48 D-4 a: the page view is built by MF-57's
//            core on the server, never a second resolver), §11a.7 dated note 2026-11-12 (Stage B).
//
// MF-48 Stage B · T-B3 (operator 2026-11-12 "Ball y", B-3 a; plan ~/Buildo-scratch/mcfrontend/MF-48/plan-stageB.md §3). The mocked-route harness of
// parcel-lookup-gate.infra.test.ts (MF-45):
//   (1) today every customer hit answers `page: null` (no producer has a lot until MB-44), and candidates, a miss and a dangling id answer null;
//   (2) with a producer response (the committed synthetic v21 mobile response) the route answers exactly pageViewOf(buildPage(response)), equal to
//       the committed mobile golden view (src/tests/fixtures/report-page/props/page_v21.mobile.json, MF-48 Stage A), through the .strict() schema;
//   (3) a page never rides a response without a parcel, and a stray key in the view fails the boundary parse;
//   (4) a producer response the core refuses is a 500 with no payload (fail closed); the meter is unchanged by the page; the log says only
//       whether a page was sent, never its text;
//   (5) the route imports the producer from src/lib/parcels/report-page.ts only, and that module never imports the admin preview producer (L1).
import fs from 'node:fs';
import path from 'node:path';
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
vi.mock('@/lib/parcels/report-page', async (orig) => {
  const a = await orig<typeof import('@/lib/parcels/report-page')>();
  return { ...a, readCustomerPageResponse: vi.fn(a.readCustomerPageResponse) };
});
const logInfo = vi.fn();
vi.mock('@/lib/logger', () => ({ logInfo: (...a: unknown[]) => logInfo(...a), logWarn: vi.fn(), logError: vi.fn() }));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { resolveAddress, fetchParcelById } from '@/lib/admin/parcel-lookup';
import { mobilePageView, readCustomerPageResponse } from '@/lib/parcels/report-page';
import { CONSUMER_WITHHELD_LEGACY_COLS } from '@/lib/parcels/consumer-lookup';
import { ConsumerParcelLookupResponseSchema, ReportPageViewSchema } from '@/app/api/parcels/lookup/types';
import { GET } from '@/app/api/parcels/lookup/route';

type Json = Record<string, unknown>;
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GOLDEN = JSON.parse(read('src/tests/fixtures/report-page/props/page_v21.mobile.json')) as { response_fixture: Json; view: Json };
const UID = '00000000-0000-0000-0000-0000000048b3';
const ROW = { parcel_id: 'P-48', lot_size_sqm: 400, neighbourhood_id: null, __display_address: '5 Elm St' };

type Body = { data: (Json & { page: Json | null; parcel: unknown }) | null; error: { code: string } | null };
const req = (qs: string): NextRequest => ({ url: `https://x.test/api/parcels/lookup?${qs}`, nextUrl: { pathname: '/api/parcels/lookup' }, headers: { get: () => null } } as unknown as NextRequest);
const call = async (qs = 'parcelId=P-48'): Promise<{ status: number; body: Body }> => {
  const res = await GET(req(qs));
  return { status: res.status, body: (await res.json()) as Body };
};

beforeEach(() => {
  vi.clearAllMocks();
  // The transitional lead_gen path (unmetered): the page logic is the same on both access paths and needs no meter mock.
  vi.mocked(getCurrentUserContext).mockResolvedValue({ uid: UID, subscription_status: 'active' } as never);
  poolQuery.mockImplementation(async (text: string) => {
    if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) return { rows: [], rowCount: 0 };
    throw new Error(`unexpected pool query: ${text}`);
  });
  vi.mocked(fetchParcelById).mockResolvedValue({ ...ROW } as never);
  vi.mocked(resolveAddress).mockResolvedValue({ match: { parcelId: 'P-48', matchType: 'exact', address: '5 Elm St' }, candidates: [], truncated: false, resolution: 'unique', lotMap: null } as never);
});

describe('T-B3 (1) no customer producer today: every hit answers page null', () => {
  it('a hit: 200 with the parcel and page null; the producer was asked once with the matched parcels.parcel_id', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.parcel).not.toBeNull();
    expect(r.body.data?.page).toBeNull();
    expect(vi.mocked(readCustomerPageResponse).mock.calls).toEqual([['P-48']]);
  });
  it('candidates, a miss and a dangling id answer page null and never ask the producer', async () => {
    vi.mocked(resolveAddress).mockResolvedValueOnce({ match: null, candidates: [{ parcelId: 'A', address: '1 A St' }, { parcelId: 'B', address: '1 A Ave' }], truncated: false, resolution: 'text_candidates', lotMap: null } as never);
    expect((await call('q=1%20a%20st')).body.data?.page).toBeNull();
    vi.mocked(resolveAddress).mockResolvedValueOnce({ match: null, candidates: [], truncated: false, resolution: 'no_match', lotMap: null } as never);
    expect((await call('q=nowhere%20road')).body.data?.page).toBeNull();
    vi.mocked(fetchParcelById).mockResolvedValueOnce(null as never);
    const dangling = await call('parcelId=GONE');
    expect([dangling.status, dangling.body.data?.page, dangling.body.data?.parcel]).toEqual([200, null, null]);
    expect(vi.mocked(readCustomerPageResponse)).not.toHaveBeenCalled();
  });
});

describe('T-B3 (2) with a producer response: the view is MF-57 pageViewOf(buildPage(...)), equal to the committed mobile golden view', () => {
  it('the route answers the golden view exactly', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce(GOLDEN.response_fixture);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toEqual(GOLDEN.view);
  });
  it('the log says only that a page was sent, never a page text', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce(GOLDEN.response_fixture);
    await call();
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')?.[2] as Json;
    expect(log.page).toBe(true);
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain('By-law specifications');
  });
});

describe('T-B3 (3) the boundary: a page only with a parcel; every view level is .strict()', () => {
  const base = { match: null, candidates: [], warnings: [], resolution: 'no_match' as const, map: null };
  it('a page on a response with no parcel fails the parse; page null passes', () => {
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, parcel: null, page: null }).success).toBe(true);
    expect(ConsumerParcelLookupResponseSchema.safeParse({ ...base, parcel: null, page: GOLDEN.view }).success).toBe(false);
  });
  it('the response schema checks `page` with this view schema: the route own hit (a parcel present) passes, and a stray view key alone fails it', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce(GOLDEN.response_fixture);
    const hit = (await call()).body.data as Json;
    expect(hit.parcel).not.toBeNull();
    expect(ConsumerParcelLookupResponseSchema.safeParse(hit).success).toBe(true);
    const bad = ConsumerParcelLookupResponseSchema.safeParse({ ...hit, page: { ...(hit.page as Json), groups: [] } });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => [i.code, i.path.join('.')])).toEqual([['unrecognized_keys', 'page']]);
  });
  it('RED (planted): a stray key at the view, a section or a part, and a non-mobile target each fail', () => {
    const shape = ReportPageViewSchema;
    expect(shape.safeParse(GOLDEN.view).success).toBe(true);
    const v = JSON.parse(JSON.stringify(GOLDEN.view)) as { sections: Array<Json & { parts: Json[] }> } & Json;
    expect(shape.safeParse({ ...v, groups: [] }).success).toBe(false);
    expect(shape.safeParse({ ...v, target: 'web' }).success).toBe(false);
    const sec = JSON.parse(JSON.stringify(v)) as typeof v;
    sec.sections[0]!.lineage = 'x';
    expect(shape.safeParse(sec).success).toBe(false);
    const part = JSON.parse(JSON.stringify(v)) as typeof v;
    part.sections[0]!.parts[0]!.raw_value = 1;
    expect(shape.safeParse(part).success).toBe(false);
  });
});

describe('T-B3 (4) fail closed', () => {
  it('a producer response the core refuses is a 500 with no payload', async () => {
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce({ ...GOLDEN.response_fixture, page: 'not_a_page_table' });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.data).toBeNull();
  });
});

// OUTPUT panel fold (regression guardian item 1): the EI-D1 / W-0 hide was a screen lock (parcelDetailW0Hide, retired with the old screen). The
// screen now draws only the page, so the fence moves to the page producer path: a producer response that carries any legacy column the lookup
// withholds (CONSUMER_WITHHELD_LEGACY_COLS) is refused by MF-57's core (not a key of the page table), and the route answers 500, never a page.
describe('T-B3 (6) EI-D1 at the producer: a legacy value can never ride the page', () => {
  it.each([...CONSUMER_WITHHELD_LEGACY_COLS])('a producer response carrying %s is refused (500, no payload)', async (col) => {
    expect(() => mobilePageView({ ...GOLDEN.response_fixture, values: { ...(GOLDEN.response_fixture.values as Json), [col]: '3.17' } })).toThrow(/not a key of the page table/);
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce({ ...GOLDEN.response_fixture, values: { ...(GOLDEN.response_fixture.values as Json), [col]: '3.17' } });
    const r = await call();
    expect([r.status, r.body.data]).toEqual([500, null]);
  });
});

// OUTPUT panel fold (regression guardian item 2): the meter still keys on the legacy payload ("1 b": hasEvaluatedOption), so today a served page
// is NOT what counts. Pinned as it is, with its owner: when MB-44 (or the MB-94 part (f) tester feed, which is unmetered by EI-D2) serves real pages
// to customers, the MB-94 part (c) / MB-44 change must make a hit whose page carries an evaluated option count (MF-45 "a report shown counts"),
// and flip this pin (Spec 100 §3.2 dated note 2026-11-12, MF-48 Stage B).
describe('T-B3 (7) the meter is unchanged by a page today (owner MB-94 c / MB-44)', () => {
  it('a parcel_tool hit with a served page and no evaluated legacy option is served and not counted', async () => {
    poolQuery.mockImplementation(async (text: string) => {
      if (/FROM entitlements WHERE user_id = \$1 AND product = \$2/.test(text)) return { rows: [{ status: 'active', trial_started_at: null }], rowCount: 1 };
      throw new Error(`unexpected pool query: ${text}`);
    });
    vi.mocked(readCustomerPageResponse).mockResolvedValueOnce(GOLDEN.response_fixture);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.data?.page).toEqual(GOLDEN.view);
    expect(txQuery).not.toHaveBeenCalled();
    const log = logInfo.mock.calls.find((c) => c[1] === 'consumer parcel lookup')?.[2] as Json;
    expect([log.access, log.meter, log.page]).toEqual(['parcel_tool', 'not_evaluated', true]);
  });
});

describe('T-B3 (5) the imports', () => {
  it('the route reads the page through src/lib/parcels/report-page.ts; that module uses MF-57 core and never the admin preview producer (L1)', () => {
    expect(read('src/app/api/parcels/lookup/route.ts')).toContain("import { mobilePageView, readCustomerPageResponse } from '@/lib/parcels/report-page';");
    const lib = read('src/lib/parcels/report-page.ts');
    expect(lib).toContain("import { buildPage, pageViewOf } from '@/lib/surfaces/report/core';");
    expect(lib).not.toMatch(/from '[^']*report-preview-live/);
    expect(lib).not.toMatch(/from '@\/lib\/db\//); // no read until a producer lands (MB-44)
  });
});
