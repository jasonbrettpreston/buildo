// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, §3.2 (dated notes 2026-11-11, MF-53; 2026-11-13, SEMI-B)
// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3
//
// SRCH.ROUTE (task-318, Increment 1·B) · the routing test: one search box, one route per case, on the addresses of the availability sweep
// (~/Buildo-scratch/lanes-20261117/avail-search/SAMPLES.md rows 1, 5, 5b, 9, 10, 12) as database rows. Real code from the request to the route
// string: the GET handler of /api/parcels/lookup, resolveAddress, fetchParcelById, readLotForm, then the client's route function parcelSearchPath
// (mobile/src/lib/parcelSearchCore.ts, import-free, read by relative path as the web search binding does). The client's deriveMatchType and the
// semi helpers (parcelSearchMatch.ts, lotForm.ts) import `@/lib/...` of the app, which the root typecheck cannot resolve, so they are NOT loaded
// here: the outcome is the server's resolution (deriveMatchType step 0, parcelSearchMatch.ts:183-186) and the report mount's redirect is locked by
// reading [parcelId].tsx (their own locks are jest tests in mobile/__tests__, not run by the commit hook: UNVERIFIED here).
// Mocked: the database client, answering by statement text and asserting the bound params (the pattern of parcel-lookup-resolution.logic.test.ts;
// an unknown statement throws); the map read (its SQL is pinned there); the auth and limiter edges (parcel-lookup-gate.infra.test.ts).
//   two or more lots at one address -> the lot map (C.14: .../disambiguate?kind=multi_parcel)
//   an unlinked address -> the same map page with the pin (B.6: kind=unlinked)
//   an unclear address (a street, no number) -> the candidates list (B.1, in place: no navigation)
//   a possible semi lot (lotForm.unsure) -> the report route, whose mount replaces it with the semi question page (D.1; the page is task-319)
//   the plain one-lot case -> the report route, no question
// A MIS-TYPED street (sample 7, "41 Derwin Road") routes to the candidates list through the permit pipeline's address matcher (task-333, last describe). The intersection (B.4/B.10, LS.11) is not one of the four cases of this task.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const NO_ROWS: Row[] = [];
const state = {
  exact: {} as Record<string, Row[]>, // 'NUM|STREET' -> parcels rows
  typeahead: [] as Row[],
  unlinked: [] as Row[],
  fuzzy: [] as Row[], // the permit pipeline's address matcher read (miss case only), keyed by nothing: the case sets the rows
  lotForm: {} as Record<string, Row>, // parcel_id -> parcel_lot_form row
};
const dbQuery = vi.fn(async (text: string, params: unknown[] = []): Promise<Row[]> => {
  if (/WHERE addr_num_normalized = \$1 AND street_name_normalized = \$2/.test(text)) return state.exact[`${params[0]}|${params[1]}`] ?? NO_ROWS;
  if (/levenshtein\(normalize_address\(street_name_normalized\)/.test(text)) return state.fuzzy;
  if (/NOT EXISTS \(SELECT 1 FROM parcel_address_points/.test(text)) return state.unlinked;
  if (/FROM address_points ap\s+JOIN parcel_address_points/.test(text)) return state.typeahead;
  if (/FROM parcel_lot_form/.test(text)) return state.lotForm[String(params[0])] ? [state.lotForm[String(params[0])]!] : NO_ROWS;
  if (/FROM parcels WHERE parcel_id = \$1/.test(text)) return [{ parcel_id: params[0], lot_size_sqm: 327.12, neighbourhood_id: null, __display_address: 'row address' }];
  throw new Error(`unexpected statement: ${text}`);
});
vi.mock('@/lib/db/client', () => ({
  query: (...a: [string, unknown[]?]) => dbQuery(...a),
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }, // no parcel_tool entitlement: the unmetered lead_gen path, no meter write
  withTransaction: vi.fn(async () => { throw new Error('the search routes meter nothing here'); }),
}));
vi.mock('@/lib/auth/get-user-context', () => ({ getCurrentUserContext: vi.fn(async () => ({ uid: 'u-318', subscription_status: 'active' })) }));
vi.mock('@/lib/auth/rate-limit', () => ({ withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/parcels/lot-map', async (orig) => ({
  ...(await orig<typeof import('@/lib/parcels/lot-map')>()),
  resolveLotMap: vi.fn(async () => ({
    address: null, pin: { lat: 43.6622885, lng: -79.456814 }, truncated: false,
    lots: [
      { parcel_id: '5112332', lot_size_sqm: 76.19, frontage_m: 5.01, zoning_zn_string: null, centroid_lat: 43.6623, centroid_lng: -79.4568, outline: null },
      { parcel_id: '5427844', lot_size_sqm: 235.83, frontage_m: 6.62, zoning_zn_string: 'R (d0.6) (x737)', centroid_lat: 43.6624, centroid_lng: -79.4569, outline: null },
    ],
    neighbours: [],
  })),
}));

import { GET } from '@/app/api/parcels/lookup/route';
import { resolveAddress } from '@/lib/admin/parcel-lookup';
import { parcelSearchPath, type SearchOutcome } from '../../mobile/src/lib/parcelSearchCore';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = '/(app)/parcel-tool'; // the app's base path (parcelSearchRoute in parcelSearchMatch.ts passes it)
/** The report mount's semi decision as lotForm.ts needsSemiQuestion states it (:24-27), on the lookup data. */
const asksSemi = (d: Data): boolean => d.lotForm?.unsure === true;
const MOUNT = path.resolve(__dirname, '../../mobile/app/(app)/parcel-tool/[parcelId].tsx');
type Data = {
  resolution: string;
  match: { parcelId: string } | null;
  candidates: { parcelId: string; address: string }[];
  map: { lots: { parcelId: string }[] } | null;
  lotForm: { detected: string; basis: string; unsure: boolean } | null;
};
const search = async (q: string): Promise<{ data: Data; route: string | null }> => {
  const url = `https://x.test/api/parcels/lookup?q=${encodeURIComponent(q)}`;
  const res = await GET({ url, nextUrl: { pathname: '/api/parcels/lookup' }, headers: { get: () => null } } as unknown as NextRequest);
  expect(res.status).toBe(200);
  const data = ((await res.json()) as { data: Data }).data;
  const route = parcelSearchPath(data.resolution as SearchOutcome, { parcelId: data.match?.parcelId ?? null, query: q }, BASE);
  return { data, route };
};
const readParams = (n: number) => dbQuery.mock.calls[n]?.[1];

beforeEach(() => {
  dbQuery.mockClear();
  state.exact = {};
  state.typeahead = [];
  state.unlinked = [];
  state.fuzzy = [];
  state.lotForm = {};
});

describe('SRCH.ROUTE: one route per case', () => {
  it('two lots printing one address (26 Kenneth Ave, sample 9) -> the lot map', async () => {
    state.exact['26|KENNETH'] = [{ parcel_id: '5112332', address: '26 Kenneth Ave' }, { parcel_id: '5427844', address: '26 Kenneth Ave' }];
    const { data, route } = await search('26 Kenneth Ave');
    expect(readParams(0)).toEqual(['26', 'KENNETH']); // the exact read ran on the parsed keys
    expect(data.resolution).toBe('multi_parcel');
    expect(data.match).toBeNull();
    expect(data.map?.lots.map((l: { parcelId: string }) => l.parcelId)).toEqual(['5112332', '5427844']);
    expect(route).toBe(`${BASE}/disambiguate?q=${encodeURIComponent('26 Kenneth Ave')}&kind=multi_parcel`);
  });

  it('two lots printing DIFFERENT addresses is the candidates list, not the map (the one-address rule)', async () => {
    state.exact['32|ACACIA'] = [{ parcel_id: 'A1', address: '32 Acacia Ave' }, { parcel_id: 'A2', address: '32 Acacia Rd' }];
    const { data, route } = await search('32 Acacia');
    expect(data.resolution).toBe('text_candidates');
    expect(data.map).toBeNull();
    expect(route).toBeNull();
  });

  it('an address with no lot link (76R Abbott Ave, sample 10) -> the same map page, kind unlinked', async () => {
    state.unlinked = [{ address_point_id: 14198374, address: '76R Abbott Ave', latitude: 43.6607746, longitude: -79.4581974 }];
    const { data, route } = await search('76R Abbott Ave');
    expect(data.resolution).toBe('unlinked');
    expect(data.match).toBeNull();
    expect(route).toBe(`${BASE}/disambiguate?q=${encodeURIComponent('76R Abbott Ave')}&kind=unlinked`);
  });

  it('an unclear address, a street with no number (Derwyn Road, sample 12) -> the candidates list, in place', async () => {
    state.typeahead = [
      { parcel_id: '1001', address: '1 Derwyn Rd' }, { parcel_id: '1010', address: '10 Derwyn Rd' }, { parcel_id: '1011', address: '11 Derwyn Rd' },
    ];
    const { data, route } = await search('Derwyn Road');
    expect(dbQuery.mock.calls.some((c: unknown[]) => JSON.stringify(c[1]) === JSON.stringify(['DERWYN%', null]))).toBe(true); // the typeahead prefix, no number
    expect(data.resolution).toBe('text_candidates');
    expect(data.map).toBeNull();
    expect(data.candidates.map((c) => c.address)).toEqual(['1 Derwyn Rd', '10 Derwyn Rd', '11 Derwyn Rd']);
    expect(data.candidates.map((c) => c.parcelId)).toEqual(['1001', '1010', '1011']); // the id a pick opens
    expect(route).toBeNull(); // the list renders on the search page itself
  });

  it('a possible semi lot (49 Canoe Cres, sample 5, unsure true) -> the report route, which opens the semi question page', async () => {
    state.exact['49|CANOE'] = [{ parcel_id: '5002012', address: '49 Canoe Cres' }];
    state.lotForm['5002012'] = { lot_form_detected: 'semi_half', lot_form_basis: 'o4_two_parcel_abut', unsure: true };
    const { data, route } = await search('49 Canoe Cres');
    expect(data.resolution).toBe('unique');
    expect(data.lotForm).toEqual({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true });
    expect(route).toBe(`${BASE}/5002012`);
    expect(asksSemi(data)).toBe(true);
    // the report mount sends an unsure lot to the question page once: its source holds the decision and the target
    const mount = fs.readFileSync(MOUNT, 'utf8');
    expect(mount).toContain('needsSemiQuestion(data');
    expect(mount).toContain('useSettledRedirect(ask && parcelId ? semiQuestionRoute(parcelId) : null, isFetching)'); // task-381: the shared hook does the one router.replace
  });

  it('an absent view (the lot has no parcel_lot_form row: lotForm null) never asks the semi question', async () => {
    state.exact['49|CANOE'] = [{ parcel_id: '5002012', address: '49 Canoe Cres' }];
    const { data, route } = await search('49 Canoe Cres');
    expect(data.lotForm).toBeNull();
    expect(route).toBe(`${BASE}/5002012`);
    expect(asksSemi(data)).toBe(false);
  });

  it('a clear semi (33 Rockbank Cres, sample 5b, unsure false) -> straight to the report', async () => {
    state.exact['33|ROCKBANK'] = [{ parcel_id: '5208359', address: '33 Rockbank Cres' }];
    state.lotForm['5208359'] = { lot_form_detected: 'semi_half', lot_form_basis: 'o4_two_parcel_abut', unsure: false };
    const { data, route } = await search('33 Rockbank Cres');
    expect(route).toBe(`${BASE}/5208359`);
    expect(asksSemi(data)).toBe(false);
  });

  it('the plain one-lot case (41 Derwyn Road, Toronto, sample 1) -> the report, no question', async () => {
    state.exact['41|DERWYN'] = [{ parcel_id: '5293897', address: '41 Derwyn Rd' }];
    state.lotForm['5293897'] = { lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false };
    const { data, route } = await search('41 Derwyn Road, Toronto');
    expect(readParams(0)).toEqual(['41', 'DERWYN']); // the city suffix after the comma is dropped
    expect(data.resolution).toBe('unique');
    expect(dbQuery.mock.calls.some((c) => /FROM parcels WHERE parcel_id = \$1/.test(String(c[0])) && c[1]?.[0] === '5293897')).toBe(true); // the report read is for the matched lot
    expect(data.map).toBeNull();
    expect(data.candidates).toEqual([]);
    expect(route).toBe(`${BASE}/5293897`);
    expect(asksSemi(data)).toBe(false);
  });
});

describe('SRCH.FUZZY: a mis-typed street (task-333, RR-0277: the permit pipeline address matcher, same function)', () => {
  // The matcher is the pipeline's own pair: normalize_address() + levenshtein() <= the logic variable enrich_heritage_address_levenshtein_threshold
  // (Spec 61 L13; scripts/lib/compute/enrich-heritage.js:121, :174). It runs only after exact, typeahead and unlinked returned nothing.
  it('41 Derwin Road (sample 7) -> the candidates page with 41 Derwyn Rd, through the matcher read', async () => {
    state.fuzzy = [{ parcel_id: '5293897', address: '41 Derwyn Rd' }];
    const { data, route } = await search('41 Derwin Road');
    expect(dbQuery.mock.calls.map((c) => String(c[0]).includes('levenshtein('))).toEqual([false, false, false, true]); // exact, typeahead, unlinked, then the matcher
    expect(readParams(3)).toEqual(['41', 'DERWIN']);
    const sql = String(dbQuery.mock.calls[3]![0]);
    expect(sql).toContain("variable_key = 'enrich_heritage_address_levenshtein_threshold'"); // the threshold is the pipeline's variable, no literal
    expect(sql).toContain('LIMIT 10');
    expect(data.resolution).toBe('text_candidates');
    expect(data.match).toBeNull();
    expect(data.map).toBeNull();
    expect(data.candidates).toEqual([{ parcelId: '5293897', address: '41 Derwyn Rd' }]);
    expect(route).toBeNull(); // candidates in place (B.1), the same route outcome as the other candidates cases
  });

  it('a nonsense street matches nothing and stays no_match', async () => {
    const { data, route } = await search('41 Qzxqzx Road');
    expect(readParams(3)).toEqual(['41', 'QZXQZX']);
    expect(data.resolution).toBe('no_match');
    expect(data.candidates).toEqual([]);
    expect(route).toBe(parcelSearchPath('no_match' as SearchOutcome, { parcelId: null, query: '41 Qzxqzx Road' }, BASE));
  });

  it('no house number: the matcher never runs (street-only stays today\'s typeahead path)', async () => {
    await search('Derwin Road');
    expect(dbQuery.mock.calls.some((c) => String(c[0]).includes('levenshtein('))).toBe(false);
  });

  it('the admin call (no options) never runs the matcher: a mis-typed street stays no_match there', async () => {
    const out = await resolveAddress('41 Derwin Road');
    expect(out.resolution).toBe('no_match');
    expect(dbQuery.mock.calls.some((c) => String(c[0]).includes('levenshtein('))).toBe(false);
  });

  it('an exact hit never reaches the matcher (hot path unchanged)', async () => {
    state.exact['41|DERWYN'] = [{ parcel_id: '5293897', address: '41 Derwyn Rd' }];
    await search('41 Derwyn Road');
    expect(dbQuery.mock.calls.some((c) => String(c[0]).includes('levenshtein('))).toBe(false);
  });
});
