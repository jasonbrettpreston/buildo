// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, §3, §3.2 (dated note 2026-11-11, MF-53)
// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (the shared resolver; admin ignores `resolution`)
//
// MF-53 · T1 + T4. The resolver's outcome name and the map read, over a mocked `query` (live rows: src/tests/db/). One case per row of the
// plan v4 §2.1 truth table (~/Buildo-scratch/mcfrontend/MF-53/plan.v4.md): ONE rule on both paths — one printed address over 2+ lots is the
// map (`multi_parcel`), different printed addresses are the list (`text_candidates`), one row is the report (`unique`), a typeahead miss with
// a house number whose live address points have no lot link is `unlinked` (operator ruling 2026-09-16; DECISIONS-v3 Q1, Q5). `match`,
// `candidates` and `truncated` are unchanged on every outcome (admin parity, Spec 89). The display rules are the report's (Q8).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db/client', () => ({ query: (...a: unknown[]) => query(...a) }));

import { resolveAddress } from '@/lib/admin/parcel-lookup';
import { resolveLotMap, readLotMapLimits, LOT_MAP_LIMIT_KEYS, LotMapLimitsMissingError } from '@/lib/parcels/lot-map';
import { areaSqftM2Dot, len1 } from '@/lib/parcels/display-rules';
import seed from '../../scripts/seeds/logic_variables.json';

type Row = Record<string, unknown>;
/** Queue the rows each successive query returns. */
const rows = (...sets: Row[][]) => { for (const s of sets) query.mockResolvedValueOnce(s); };
const r = (parcel_id: string, address: string) => ({ parcel_id, address });

/** The consumer route's call: the unlinked read runs only when asked (admin never pays for it; PLAN panel regression MEDIUM-3). */
const CONSUMER = { classifyUnlinked: true } as const;

beforeEach(() => query.mockReset());

describe('T1 resolveAddress: the outcome name (one rule, both paths)', () => {
  it('exact, 1 row -> unique; match as today', async () => {
    rows([r('P1', '5 Elm St')]);
    const out = await resolveAddress('5 Elm St');
    expect(out.resolution).toBe('unique');
    expect(out.match).toEqual({ parcelId: 'P1', matchType: 'exact', address: '5 Elm St' });
    expect(out.lotMap).toBeNull();
  });

  it('exact, 2 rows printing ONE address -> multi_parcel (the map); candidates unchanged for admin', async () => {
    rows([r('P1', '5 Elm St'), r('P2', '5 Elm St')]);
    const out = await resolveAddress('5 Elm St');
    expect(out.resolution).toBe('multi_parcel');
    expect(out.candidates).toEqual([{ parcelId: 'P1', address: '5 Elm St' }, { parcelId: 'P2', address: '5 Elm St' }]);
    expect(out.truncated).toBe(false);
    expect(out.lotMap).toEqual({ kind: 'multi_parcel', parcelIds: ['P1', 'P2'], num: '5', truncated: false });
  });

  it('exact, 2 rows printing DIFFERENT addresses -> text_candidates (the list, today)', async () => {
    rows([r('P1', '32 Acacia Ave'), r('P2', '32 Acacia Rd')]);
    const out = await resolveAddress('32 Acacia');
    expect(out.resolution).toBe('text_candidates');
    expect(out.lotMap).toBeNull();
    expect(out.candidates).toHaveLength(2);
  });

  it('exact, 11 rows printing one address -> multi_parcel with truncated (too many lots); no lot ids sent', async () => {
    rows(Array.from({ length: 11 }, (_, i) => r(`P${i}`, '1 Big Rd')));
    const out = await resolveAddress('1 Big Rd');
    expect(out.resolution).toBe('multi_parcel');
    expect(out.truncated).toBe(true);
    expect(out.candidates).toHaveLength(10);
    expect(out.lotMap).toEqual({ kind: 'multi_parcel', parcelIds: [], num: '1', truncated: true });
  });

  it('typeahead, 1 row -> unique', async () => {
    rows([], [r('P9', '7 Oak Ave')]);
    const out = await resolveAddress('7 Oak');
    expect(out.resolution).toBe('unique');
    expect(out.match?.matchType).toBe('typeahead');
  });

  it('typeahead, 2+ rows printing one address with a house number -> multi_parcel', async () => {
    rows([], [r('P1', '7 Oak Ave'), r('P2', '7 Oak Ave'), r('P3', '7 Oak Ave')]);
    const out = await resolveAddress('7 Oak');
    expect(out.resolution).toBe('multi_parcel');
    expect(out.lotMap).toEqual({ kind: 'multi_parcel', parcelIds: ['P1', 'P2', 'P3'], num: '7', truncated: false });
  });

  it('typeahead, 2+ rows printing one address WITHOUT a house number -> text_candidates (never a map without a number)', async () => {
    rows([r('P1', 'Oak Ave'), r('P2', 'Oak Ave')]);
    const out = await resolveAddress('Oak Ave');
    expect(out.resolution).toBe('text_candidates');
    expect(query).toHaveBeenCalledTimes(1); // no exact read without a number, no unlinked read
  });

  it('typeahead, rows printing different addresses -> text_candidates', async () => {
    rows([], [r('P1', '7 Oak Ave'), r('P2', '7 Oakdale Rd')]);
    expect((await resolveAddress('7 Oak')).resolution).toBe('text_candidates');
  });

  it('typeahead miss + one unlinked live point -> unlinked with its pin', async () => {
    rows([], [], [{ address_point_id: 77, address: '12 Main St', latitude: '43.65', longitude: '-79.38' }]);
    const out = await resolveAddress('12 Main St', CONSUMER);
    expect(out.resolution).toBe('unlinked');
    expect(out.match).toBeNull();
    expect(out.candidates).toEqual([]);
    expect(out.lotMap).toEqual({ kind: 'unlinked', address: '12 Main St', pin: { lat: 43.65, lng: -79.38 } });
  });

  it('typeahead miss + several unlinked addresses -> unlinked, no pin (Q5 i: the honest message, no map)', async () => {
    rows([], [], [
      { address_point_id: 1, address: '12 Main Ave', latitude: '43.6', longitude: '-79.3' },
      { address_point_id: 2, address: '12 Main St', latitude: '43.7', longitude: '-79.4' },
    ]);
    const out = await resolveAddress('12 Main', CONSUMER);
    expect(out.resolution).toBe('unlinked');
    expect(out.lotMap).toEqual({ kind: 'unlinked', address: '12 Main Ave', pin: null });
  });

  it('typeahead miss + no unlinked point -> no_match (NEVER unlinked on zero points: the anti-guess rule)', async () => {
    rows([], [], []);
    const out = await resolveAddress('12 Nowhere St', CONSUMER);
    expect(out.resolution).toBe('no_match');
    expect(out.lotMap).toBeNull();
  });

  it('a miss with no house number never reads the unlinked statement', async () => {
    rows([]);
    expect((await resolveAddress('Nowhere St', CONSUMER)).resolution).toBe('no_match');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('the unlinked read repeats the live-point filters and asks for points with NO lot link', async () => {
    rows([], [], []);
    await resolveAddress('12 Main St', CONSUMER);
    const sql = String(query.mock.calls[2]![0]);
    expect(sql).toMatch(/address_status IS NULL OR UPPER\(ap\.address_status\) IN \('CURRENT', 'NONE'\)/);
    expect(sql).toMatch(/UPPER\(ap\.maint_stage\) = 'REGULAR'/);
    expect(sql).toMatch(/ap\.retired_at IS NULL/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM parcel_address_points/);
    expect(sql).toMatch(/LIMIT 11/);
    expect(query.mock.calls[2]![1]).toEqual(['MAIN%', '12']);
  });

  it('a street carrying a LIKE wildcard (% or _) never runs the unlinked read (security L-1)', async () => {
    rows([], []);
    expect((await resolveAddress('12 Ma_n St', CONSUMER)).resolution).toBe('no_match');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('the admin call (no option) never reads the unlinked statement: a miss stays no_match with two reads, as today', async () => {
    rows([], []);
    const out = await resolveAddress('12 Main St');
    expect(out.resolution).toBe('no_match');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rows whose printed address is empty never count as one address (legacy columns; regression MEDIUM-5) -> text_candidates', async () => {
    rows([r('P1', ''), r('P2', '')]);
    expect((await resolveAddress('5 Elm St')).resolution).toBe('text_candidates');
  });

  it('10 typeahead rows on one printed address -> multi_parcel without truncated (the typeahead LIMIT 10 has no overflow probe)', async () => {
    rows([], Array.from({ length: 10 }, (_, i) => r(`P${i}`, '7 Oak Ave')));
    const out = await resolveAddress('7 Oak');
    expect([out.resolution, out.truncated, (out.lotMap as { truncated: boolean }).truncated]).toEqual(['multi_parcel', undefined, false]);
  });

  it('the WF3 city-suffix strip still runs on the new path ("..., Toronto")', async () => {
    rows([r('P1', '482 Richmond St W'), r('P2', '482 Richmond St W')]);
    const out = await resolveAddress('482 Richmond St W, Toronto');
    expect(out.resolution).toBe('multi_parcel');
    expect(query.mock.calls[0]![1]).toEqual(['482', 'RICHMOND']);
  });

  it('an unparseable query is no_match with no read', async () => {
    expect((await resolveAddress('   ')).resolution).toBe('no_match');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('T1 resolveLotMap: the map read (consumer only)', () => {
  const lot = (id: string, extra: Row = {}) => ({
    parcel_id: id, lot_size_sqm: '283.5', frontage_m: '7.62', zoning_zn_string: 'RD (f12.0; a370)',
    centroid_lat: '43.65', centroid_lng: '-79.38', outline: '{"type":"MultiPolygon","coordinates":[[[[-79.38,43.65],[-79.37,43.65],[-79.37,43.66],[-79.38,43.65]]]]}',
    ...extra,
  });

  it('multi_parcel: the lots in parcel_id order and the pin of the typed house number; no limits read', async () => {
    rows([lot('P1'), lot('P2')], [{ latitude: '43.651', longitude: '-79.381' }]);
    const out = await resolveLotMap({ kind: 'multi_parcel', parcelIds: ['P1', 'P2'], num: '5', truncated: false });
    expect(out.lots.map((l) => l.parcel_id)).toEqual(['P1', 'P2']);
    expect(out.pin).toEqual({ lat: 43.651, lng: -79.381 });
    expect(out.neighbours).toEqual([]);
    expect(query.mock.calls[0]![1]).toEqual([['P1', 'P2']]);
    expect(String(query.mock.calls[0]![0])).toMatch(/ST_AsGeoJSON\(geom, 6\)/);
    expect(String(query.mock.calls[0]![0])).toMatch(/ORDER BY parcel_id/);
    expect(query.mock.calls[1]![1]).toEqual([['P1', 'P2'], '5']);
    expect(String(query.mock.calls[1]![0])).toMatch(/ap\.retired_at IS NULL/);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('multi_parcel with no linked point carrying the number -> pin null', async () => {
    rows([lot('P1'), lot('P2')], []);
    expect((await resolveLotMap({ kind: 'multi_parcel', parcelIds: ['P1', 'P2'], num: '5', truncated: false })).pin).toBeNull();
  });

  it('multi_parcel truncated (more than 10 lots) reads nothing', async () => {
    const out = await resolveLotMap({ kind: 'multi_parcel', parcelIds: [], num: '1', truncated: true });
    expect(out).toEqual({ address: null, pin: null, truncated: true, lots: [], neighbours: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('unlinked with a pin: the two limits from logic_variables, then the neighbours within the radius, nearest first, capped', async () => {
    rows(
      [{ variable_key: 'parcel_map_neighbour_radius_m', variable_value: '25' }, { variable_key: 'parcel_map_neighbour_limit', variable_value: '30' }],
      [{ parcel_id: 'N1', outline: '{"type":"Polygon","coordinates":[]}' }],
    );
    const out = await resolveLotMap({ kind: 'unlinked', address: '12 Main St', pin: { lat: 43.65, lng: -79.38 } });
    expect(out.neighbours).toEqual([{ parcel_id: 'N1', outline: '{"type":"Polygon","coordinates":[]}' }]);
    expect(out.pin).toEqual({ lat: 43.65, lng: -79.38 });
    expect(out.address).toBe('12 Main St');
    const sql = String(query.mock.calls[1]![0]);
    expect(sql).not.toMatch(/address_points/); // the pin arrives as parameters: no second address_points read to filter
    expect(sql).toMatch(/ST_DWithin\(p\.geom::geography, ST_SetSRID\(ST_MakePoint\(\$1, \$2\), 4326\)::geography, \$3\)/);
    expect(sql).toMatch(/p\.geom && ST_Envelope\(ST_Buffer\(ST_SetSRID\(ST_MakePoint\(\$1, \$2\), 4326\)::geography, \$3\)::geometry\)/);
    expect(sql).toMatch(/ORDER BY ST_Distance\(.*\), p\.parcel_id/);
    expect(sql).toMatch(/LIMIT \$4/);
    expect(query.mock.calls[1]![1]).toEqual([-79.38, 43.65, 25, 30]);
  });

  it('an outline over the byte cap is sent as null (security L-3)', async () => {
    rows([lot('P1', { outline: 'x'.repeat(65537) }), lot('P2')], []);
    const out = await resolveLotMap({ kind: 'multi_parcel', parcelIds: ['P1', 'P2'], num: '5', truncated: false });
    expect(out.lots.map((l) => l.outline === null)).toEqual([true, false]);
  });

  it('unlinked without a pin (several addresses) reads nothing', async () => {
    const out = await resolveLotMap({ kind: 'unlinked', address: '12 Main Ave', pin: null });
    expect(out).toEqual({ address: '12 Main Ave', pin: null, truncated: false, lots: [], neighbours: [] });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('T4 the neighbour limits are admin-editable logic variables that fail closed (DECISIONS-v3 item 2 b)', () => {
  const lv = (radius: unknown, limit: unknown) => [
    ...(radius === undefined ? [] : [{ variable_key: 'parcel_map_neighbour_radius_m', variable_value: radius }]),
    ...(limit === undefined ? [] : [{ variable_key: 'parcel_map_neighbour_limit', variable_value: limit }]),
  ];
  it('the keys and their seed entries (25 m, 30 lots; group Parcel Lookup)', () => {
    expect(LOT_MAP_LIMIT_KEYS).toEqual({ radius_m: 'parcel_map_neighbour_radius_m', limit: 'parcel_map_neighbour_limit' });
    const s = seed as unknown as Record<string, { default: number; min: number; max: number; admin?: { group?: string } }>;
    expect([s.parcel_map_neighbour_radius_m?.default, s.parcel_map_neighbour_limit?.default]).toEqual([25, 30]);
    expect([s.parcel_map_neighbour_radius_m?.admin?.group, s.parcel_map_neighbour_limit?.admin?.group]).toEqual(['Parcel Lookup', 'Parcel Lookup']);
  });
  it('reads both values', async () => {
    rows(lv('25', '30'));
    expect(await readLotMapLimits()).toEqual({ radius_m: 25, limit: 30 });
  });
  it.each([
    ['a missing row', lv('25', undefined)],
    ['a null value', lv(null, '30')],
    ['above the seed max', lv('1000', '30')],
    ['below the seed min', lv('25', '0')],
    ['a fractional limit', lv('25', '2.5')],
    ['a limit above 50 (security L-3)', lv('25', '51')],
    ['an empty string', lv('', '30')],
    ['a word', lv('abc', '30')],
  ])('fails closed on %s', async (_n, set) => {
    rows(set);
    await expect(readLotMapLimits()).rejects.toBeInstanceOf(LotMapLimitsMissingError);
  });
});

describe('T4 the report display rules on the card (Q8: the card cannot differ from the report)', () => {
  it('area_sqft_m2_dot', () => {
    expect(areaSqftM2Dot('283.5')).toBe('3,052 sq ft · 284 m²');
    expect(areaSqftM2Dot(1000)).toBe('10,764 sq ft · 1,000 m²');
    expect(areaSqftM2Dot(null)).toBeNull();
    expect(areaSqftM2Dot('n/a')).toBeNull();
  });
  it('len1 keeps one decimal', () => {
    expect(len1('7.62')).toBe('7.6 m');
    expect(len1(7)).toBe('7.0 m');
    expect(len1(12345.67)).toBe('12345.7 m');
    expect(len1(null)).toBeNull();
  });
});
