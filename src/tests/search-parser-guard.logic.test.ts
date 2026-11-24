// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (line 33 dated note 2026-11-19, ONE-12 a)
// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-19, ONE-12 a)
//
// task-69 (1.4 Search parser, Increment 1·B, elements A.4 and A.5; RR-0166, operator "ONE-12 a"):
//   A.5  a trailing unit token ('Unit 4', '#4', 'Apt 4' ...) is stripped before the parse, so the address still matches;
//   A.4  a street direction the user types (E, W, N, S, East ...) is a GUARD AFTER the match: it narrows the rows the existing match
//        already returned. The JOIN key is untouched (the exact read is keyed on the stripped street name, address.ts:59-62).
// Real resolveAddress; the database client is mocked by statement text (the pattern of search-routing.logic.test.ts).
// The parity test (parcel-cost-tool.logic.test.ts) and the normalizers are not edited by this task.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Row = Record<string, unknown>;
const NO_ROWS: Row[] = [];
const state = {
  exact: {} as Record<string, Row[]>, // 'NUM|STREET' -> parcels rows
  typeahead: [] as Row[],
  unlinked: [] as Row[],
  fuzzy: [] as Row[],
};
const dbQuery = vi.fn(async (text: string, params: unknown[] = []): Promise<Row[]> => {
  if (/WHERE addr_num_normalized = \$1 AND street_name_normalized = \$2/.test(text)) return state.exact[`${params[0]}|${params[1]}`] ?? NO_ROWS;
  if (/levenshtein\(normalize_address\(street_name_normalized\)/.test(text)) return state.fuzzy;
  if (/NOT EXISTS \(SELECT 1 FROM parcel_address_points/.test(text)) return state.unlinked;
  if (/FROM address_points ap\s+JOIN parcel_address_points/.test(text)) return state.typeahead;
  throw new Error(`unexpected statement: ${text}`);
});
vi.mock('@/lib/db/client', () => ({
  query: (...a: [string, unknown[]?]) => dbQuery(...a),
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  withTransaction: vi.fn(async () => { throw new Error('no transaction here'); }),
}));
vi.mock('@/lib/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { resolveAddress, parseFreeTextAddress, typedDirection } from '@/lib/admin/parcel-lookup';
// D6 proof (task-449 plan open choice 4 a): the pure checker of the engineering standards §2.3 test; importing that module registers its suites here too.
import { findUndocumentedBangs } from './non-null-assertion-comment.logic.test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const opts = { classifyUnlinked: true, matchMistyped: true } as const; // the consumer route's call
const E = { parcel_id: 'E1', address: '100 Queen St E' };
const W = { parcel_id: 'W1', address: '100 Queen St W' };

beforeEach(() => {
  dbQuery.mockClear();
  state.exact = {};
  state.typeahead = [];
  state.unlinked = [];
  state.fuzzy = [];
});

describe('A.5 the unit strip (parseFreeTextAddress)', () => {
  it.each([
    ['100 Queen St E Unit 4'],
    ['100 Queen St E Unit #4'],
    ['100 Queen St E Unit#4'],
    ['100 Queen St E #4'],
    ['100 Queen St E # 4'],
    ['100 Queen St E Apt 4'],
    ['100 Queen St E Apt. 4B'],
    ['100 Queen St E Apartment 7'],
    ['100 Queen St E Suite 12'],
    ['100 Queen St E Ste 5'],
    ['100 queen st e unit 4'],
  ])('%s parses as the bare address', (q) => {
    expect(parseFreeTextAddress(q)).toEqual({ num: '100', streetName: 'QUEEN' });
  });

  it('a house number like 4A is a number, never a unit', () => {
    expect(parseFreeTextAddress('4A Queen St')).toEqual({ num: '4A', streetName: 'QUEEN' });
  });
  it('a street named Unit with no trailing number is untouched', () => {
    expect(parseFreeTextAddress('12 Unit St')).toEqual({ num: '12', streetName: 'UNIT' });
  });
  it('a house number with nothing else before the token is untouched (5 Unit 4)', () => {
    expect(parseFreeTextAddress('5 Unit 4')).toEqual({ num: '5', streetName: 'UNIT 4' });
  });
  it('a number-only query is untouched', () => {
    expect(parseFreeTextAddress('100')).toEqual({ num: '', streetName: '100' });
  });
  it('a street with no house number keeps a trailing unit word (not an address with a unit)', () => {
    expect(parseFreeTextAddress('Queen St Unit 4')).toEqual({ num: '', streetName: 'QUEEN UNIT 4' });
  });
});

describe('A.4 the typed direction (typedDirection)', () => {
  it.each([
    ['100 Queen St W', 'W'],
    ['100 Queen St East', 'E'],
    ['12 Main St North', 'N'],
    ['12 Main St south', 'S'],
    ['100 Queen St E, Toronto', 'E'],
    ['100 Queen St E Unit 4', 'E'],
    ['100 Queen St', null],
    ['100 W', null],
    ['Hurlingham Cres', null],
  ])('%s -> %s', (q, d) => {
    expect(typedDirection(q)).toBe(d);
  });
});

describe('A.4 the guard after the match (resolveAddress)', () => {
  it('Queen St E and W on one number: typed W returns the W lot only', async () => {
    state.exact['100|QUEEN'] = [E, W];
    const out = await resolveAddress('100 Queen St W', opts);
    expect(out.resolution).toBe('unique');
    expect(out.match).toEqual({ parcelId: 'W1', matchType: 'exact', address: '100 Queen St W' });
    expect(out.candidates).toEqual([]);
  });

  it('typed E returns the E lot only', async () => {
    state.exact['100|QUEEN'] = [E, W];
    const out = await resolveAddress('100 Queen Street East', opts);
    expect(out.resolution).toBe('unique');
    expect(out.match?.parcelId).toBe('E1');
  });

  it('the exact read is still keyed on the stripped street (the join key is untouched)', async () => {
    state.exact['100|QUEEN'] = [E, W];
    await resolveAddress('100 Queen St W', opts);
    expect(dbQuery.mock.calls[0]![1]).toEqual(['100', 'QUEEN']);
  });

  it("no direction typed: today's result exactly (both rows, the list)", async () => {
    state.exact['100|QUEEN'] = [E, W];
    const out = await resolveAddress('100 Queen St', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.match).toBeNull();
    expect(out.candidates).toEqual([{ parcelId: 'E1', address: '100 Queen St E' }, { parcelId: 'W1', address: '100 Queen St W' }]);
  });

  it('a row printed with the full word (Queen Street East) counts as E', async () => {
    state.exact['100|QUEEN'] = [{ parcel_id: 'E1', address: '100 Queen Street East' }, W];
    const out = await resolveAddress('100 Queen St E', opts);
    expect(out.match?.parcelId).toBe('E1');
  });

  it('label 1: one lot on the other side is the address list, not the unique answer (the lot is still shown)', async () => {
    state.exact['100|QUEEN'] = [E];
    const out = await resolveAddress('100 Queen St W', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.match).toBeNull();
    expect(out.candidates).toEqual([{ parcelId: 'E1', address: '100 Queen St E' }]);
    expect(out.lotMap).toBeNull();
  });

  it('one lot on the typed side stays the unique answer', async () => {
    state.exact['100|QUEEN'] = [E];
    const out = await resolveAddress('100 Queen St E', opts);
    expect(out.resolution).toBe('unique');
    expect(out.match?.parcelId).toBe('E1');
  });

  it('a row with no direction is not a conflict: unchanged', async () => {
    state.exact['41|DERWYN'] = [{ parcel_id: 'D1', address: '41 Derwyn Rd' }];
    const out = await resolveAddress('41 Derwyn Road N', opts);
    expect(out.resolution).toBe('unique');
    expect(out.match?.parcelId).toBe('D1');
  });

  it('mixed rows (one without a direction) are never narrowed: unchanged', async () => {
    state.exact['100|QUEEN'] = [E, W, { parcel_id: 'X1', address: '100 Queen St' }];
    const out = await resolveAddress('100 Queen St W', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.candidates.map((c) => c.parcelId)).toEqual(['E1', 'W1', 'X1']);
  });

  it('two lots printing one address on the typed side keep the lot map', async () => {
    state.exact['482|RICHMOND'] = [{ parcel_id: 'R1', address: '482 Richmond St W' }, { parcel_id: 'R2', address: '482 Richmond St W' }];
    const out = await resolveAddress('482 Richmond St W', opts);
    expect(out.resolution).toBe('multi_parcel');
    expect(out.lotMap).toEqual({ kind: 'multi_parcel', parcelIds: ['R1', 'R2'], num: '482', truncated: false });
  });

  it('two lots on the other side only (no row on the typed side): unchanged, the map as today', async () => {
    state.exact['482|RICHMOND'] = [{ parcel_id: 'R1', address: '482 Richmond St W' }, { parcel_id: 'R2', address: '482 Richmond St W' }];
    const out = await resolveAddress('482 Richmond St E', opts);
    expect(out.resolution).toBe('multi_parcel');
  });

  it('a truncated exact window (11 rows read) is never narrowed to a false unique', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ parcel_id: i === 0 ? 'E1' : 'W' + i, address: i === 0 ? '100 Queen St E' : '100 Queen St W' }));
    state.exact['100|QUEEN'] = rows;
    const out = await resolveAddress('100 Queen St E', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.truncated).toBe(true);
    expect(out.candidates).toHaveLength(10);
  });

  it('narrowing never empties a non-empty result', async () => {
    for (const typed of ['N', 'S', 'E', 'W']) {
      state.exact['100|QUEEN'] = [E, W];
      const out = await resolveAddress(`100 Queen St ${typed}`, opts);
      expect((out.match ? 1 : 0) + out.candidates.length).toBeGreaterThan(0);
    }
  });

  it('the typeahead path narrows the same way (exact empty)', async () => {
    state.typeahead = [{ parcel_id: 'E1', address: '100 Queen St E' }, { parcel_id: 'W1', address: '100 Queen St W' }];
    const out = await resolveAddress('100 Queen St W', opts);
    expect(out.resolution).toBe('unique');
    expect(out.match).toEqual({ parcelId: 'W1', matchType: 'typeahead', address: '100 Queen St W' });
  });

  it('a street-only typeahead with a typed direction keeps only that side', async () => {
    state.typeahead = [{ parcel_id: 'E1', address: '1 Queen St E' }, { parcel_id: 'E2', address: '2 Queen St E' }, { parcel_id: 'W1', address: '1 Queen St W' }];
    const out = await resolveAddress('Queen St E', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.candidates.map((c) => c.parcelId)).toEqual(['E1', 'E2']);
  });

  it('end to end with a unit: 100 Queen St W Unit 4 returns the W lot', async () => {
    state.exact['100|QUEEN'] = [E, W];
    const out = await resolveAddress('100 Queen St W Unit 4', opts);
    expect(dbQuery.mock.calls[0]![1]).toEqual(['100', 'QUEEN']);
    expect(out.match?.parcelId).toBe('W1');
  });

  it("a miss with a typed direction still reaches the matcher, in today's order (the guard does not change when it fires)", async () => {
    const out = await resolveAddress('41 Derwin Road E', opts);
    expect(dbQuery.mock.calls.map((c) => String(c[0]).includes('levenshtein('))).toEqual([false, false, false, true]);
    expect(out.resolution).toBe('no_match');
  });

  it('the admin call (no options) takes the same guard and reads only match, candidates, truncated', async () => {
    state.exact['100|QUEEN'] = [E, W];
    const out = await resolveAddress('100 Queen St W');
    expect(out.match?.parcelId).toBe('W1');
    expect(out.candidates).toEqual([]);
  });
});

// SEARCHFIX.1 (task-449; fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md task 1 with amendment A1). The rule, operator verbatim:
//   RR-0442 (MORNING-DECISIONS.md:2276): "It should open on an exact match and we have a different process for address mistakes"
//   RR-0443 c (:2284): "What happens with a partial address? Similar to an address mistake they need to select from the available addresses that are close"
// A lot opens (`unique`) only on an exact match: the exact read, or a one-row typeahead that is the typed address in full. Every other
// one-row leftover is the list. The fixtures are the rows the typed-address seat recorded on the local test stack
// (docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md:66-95); where the seat recorded fewer rows than the window holds, the
// extra rows are placeholders and say so.
describe('SEARCHFIX.1 exact opens, the rest lists', () => {
  const row = (parcel_id: string, address: string) => ({ parcel_id, address });
  /** The first 10 typeahead rows for "Gerrard St" (no number), sorted by printed address, read on the local test stack (the window repeats two ids). */
  const GERRARD = [
    row('5440777', '1 Gerrard St W'), row('10640216', '1000 Gerrard St E'), row('5402856', '1001 Gerrard St E'), row('5402735', '1005 Gerrard St E'),
    row('5402655', '1007 Gerrard St E'), row('5436541', '101 Gerrard St E'), row('10640216', '1010 Gerrard St E'), row('5402535', '1011 Gerrard St E'),
    row('5400679', '1012 Gerrard St E'), row('5400679', '1014 Gerrard St E'),
  ];

  it('T1 (ST1): "Gerrard St W" with a full 10-row window is the list of 10, not the one W row', async () => {
    state.typeahead = GERRARD;
    const out = await resolveAddress('Gerrard St W', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.match).toBeNull();
    expect(out.candidates).toHaveLength(10);
  });

  it('T1 boundary: the same window cut to 9 rows narrows to the W row, shown as a list of one (no number typed, so it never opens)', async () => {
    state.typeahead = GERRARD.slice(0, 9);
    const out = await resolveAddress('Gerrard St W', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.match).toBeNull();
    expect(out.candidates).toEqual([{ parcelId: '5440777', address: '1 Gerrard St W' }]);
  });

  it('T2 (2a): a partial address that leaves one typeahead row is the list, never unique ("100 Que")', async () => {
    state.typeahead = [W];
    const out = await resolveAddress('100 Que', opts);
    expect(out.resolution).toBe('text_candidates');
    expect(out.match).toBeNull();
    expect(out.candidates).toEqual([{ parcelId: 'W1', address: '100 Queen St W' }]);
  });

  const typeaheadPrefix = (): unknown => dbQuery.mock.calls.find((c) => /FROM address_points ap\s+JOIN parcel_address_points/.test(String(c[0])))?.[1]?.[0];
  it('T3 (D1): a typed % is escaped in the typeahead prefix', async () => {
    await resolveAddress('100 %', opts);
    expect(typeaheadPrefix()).toBe('\\%%');
  });
  it('T3 (D1): a typed _ is escaped in the typeahead prefix', async () => {
    await resolveAddress('12 Ma_n St', opts);
    expect(typeaheadPrefix()).toBe('MA\\_N%');
  });

  it('T4 (D6): every non-null assertion in parcel-lookup.ts carries a why-comment on its line or the line above', () => {
    const rel = 'src/lib/admin/parcel-lookup.ts';
    expect(findUndocumentedBangs(rel, readFileSync(join(process.cwd(), rel), 'utf8'))).toEqual([]);
  });

  type Case = {
    q: string;
    exact?: Record<string, Row[]>;
    typeahead?: Row[];
    fuzzy?: Row[];
    unlinked?: Row[];
    resolution: string;
    match?: string | null; // the opened parcel id, or null
    candidates?: string[]; // the listed parcel ids, in order
    count?: number; // the number of listed rows, when the ids are not all recorded
  };
  const Q679 = { '679|QUEEN': [row('5476455', '679 Queen St W')] };
  const Q100 = { '100|QUEEN': [row('5456212', '100 Queen St W')] };
  const GLEN = { '6|GLENADEN': [row('5484745', '6 Glenaden Ave E'), row('5485663', '6 Glenaden Ave W')] };
  const Y123 = [row('5179889', '123 Yonge Blvd'), row('5464983', '123 Yonge St')];
  const Y2760 = [row('5229356', '2760 Yonge St')];
  const CLAIR = { '2750|CLAIR AVE': [row('5260587', '2750 St Clair Ave E')] };
  const ELM12 = [
    row('5492668', '12 Elm Grove Ave'), row('5264433', '12 Elm Ridge Dr'), row('5510910', '12 Elma St'), row('5017163', '12 Elmartin Dr'),
    // placeholders: the seat recorded the first four of the ten rows only
    row('X5', '12 Elm X5 St'), row('X6', '12 Elm X6 St'), row('X7', '12 Elm X7 St'), row('X8', '12 Elm X8 St'), row('X9', '12 Elm X9 St'), row('X10', '12 Elm X10 St'),
  ];
  const cases: [string, Case][] = [
    ['1 679 Queen St W', { q: '679 Queen St W', exact: Q679, resolution: 'unique', match: '5476455' }],
    ['2 679 queen street west', { q: '679 queen street west', exact: Q679, resolution: 'unique', match: '5476455' }],
    ['3 679  QUEEN  ST  W', { q: '679  QUEEN  ST  W', exact: Q679, resolution: 'unique', match: '5476455' }],
    ['4 679 Queen', { q: '679 Queen', exact: Q679, resolution: 'unique', match: '5476455' }],
    ['5 679 Queen St E', { q: '679 Queen St E', exact: Q679, resolution: 'text_candidates', match: null, candidates: ['5476455'] }],
    ['6 100 Queen St E', { q: '100 Queen St E', exact: Q100, resolution: 'text_candidates', match: null, candidates: ['5456212'] }],
    ['7 100 Queen St W', { q: '100 Queen St W', exact: Q100, resolution: 'unique', match: '5456212' }],
    ['8 6 Glenaden Ave', { q: '6 Glenaden Ave', exact: GLEN, resolution: 'text_candidates', match: null, candidates: ['5484745', '5485663'] }],
    ['9 6 Glenaden Ave E', { q: '6 Glenaden Ave E', exact: GLEN, resolution: 'unique', match: '5484745' }],
    ['10 32 Fulham Dr', { q: '32 Fulham Dr', exact: { '32|FULHAM': [row('5067128', '32 Fulham St'), row('5514141', '32 Fulham Dr')] }, resolution: 'unique', match: '5514141' }],
    ['11 123 Yonge St', { q: '123 Yonge St', exact: { '123|YONGE': Y123 }, resolution: 'unique', match: '5464983' }],
    ['12 2760 Yon', { q: '2760 Yon', typeahead: Y2760, resolution: 'text_candidates', match: null, candidates: ['5229356'] }],
    ['13 14 Norwood', { q: '14 Norwood', typeahead: [row('5334051', '14 Norwood Ter')], resolution: 'text_candidates', match: null, candidates: ['5334051'] }],
    ['14 383 El', { q: '383 El', typeahead: [row('5106944', '383 Ellerslie Ave'), row('5461541', '383 Ellis Park Rd'), row('5191692', '383 Elm Rd')], resolution: 'text_candidates', match: null, candidates: ['5106944', '5461541', '5191692'] }],
    ['15 12 Elm', { q: '12 Elm', typeahead: ELM12, resolution: 'text_candidates', match: null, count: 10 }],
    ['16 Gerrard St W', { q: 'Gerrard St W', typeahead: GERRARD, resolution: 'text_candidates', match: null, count: 10 }],
    ['17 Gerrard St', { q: 'Gerrard St', typeahead: GERRARD, resolution: 'text_candidates', match: null, count: 10 }],
    ['18 123 Yongee St', { q: '123 Yongee St', fuzzy: Y123, resolution: 'text_candidates', match: null, candidates: ['5179889', '5464983'] }],
    ['19 2760 Yongee St', { q: '2760 Yongee St', fuzzy: Y2760, resolution: 'text_candidates', match: null, candidates: ['5229356'] }],
    ['20 78 Robert St', { q: '78 Robert St', exact: { '78|ROBERT': [row('5259138', '78 Robert St'), row('5438421', '78 Robert St')] }, resolution: 'multi_parcel', match: null, candidates: ['5259138', '5438421'] }],
    // case 21's latitude and longitude are placeholders (UNVERIFIED: the seat could not run it live); the test checks only the pin it was given
    ['21 2 Lake Cres', { q: '2 Lake Cres', unlinked: [{ address_point_id: 1, address: '2 Lake Cres', latitude: '43.6', longitude: '-79.5' }], resolution: 'unlinked', match: null }],
    ['22 2750 St Clair Ave W', { q: '2750 St Clair Ave W', exact: CLAIR, resolution: 'text_candidates', match: null, candidates: ['5260587'] }],
    ['23 King and Bay', { q: 'King and Bay', resolution: 'no_match', match: null, candidates: [] }],
    ['25 123 Main St Mississauga', { q: '123 Main St Mississauga', resolution: 'no_match', match: null, candidates: [] }],
    ['26 2760 Yonge St Unit 4', { q: '2760 Yonge St Unit 4', exact: { '2760|YONGE': Y2760 }, resolution: 'unique', match: '5229356' }],
    ['27a Unit 4, 123 Yonge St', { q: 'Unit 4, 123 Yonge St', exact: { '123|YONGE': Y123 }, resolution: 'unique', match: '5464983' }],
    ['27b 2760-4 Yonge St', { q: '2760-4 Yonge St', exact: { '2760|YONGE': Y2760 }, resolution: 'text_candidates', match: null, candidates: ['5229356'] }],
    ['27c 2760A Yonge St', { q: '2760A Yonge St', exact: { '2760|YONGE': Y2760 }, resolution: 'text_candidates', match: null, candidates: ['5229356'] }],
    ['28 14 Norwood Ter', { q: '14 Norwood Ter', exact: { '14|NORWOOD TER': [row('5334051', '14 Norwood Ter')] }, resolution: 'unique', match: '5334051' }],
    ['extra 2e 679 Queen St. W', { q: '679 Queen St. W', exact: Q679, resolution: 'unique', match: '5476455' }],
    ['extra 2750 St. Clair Ave W', { q: '2750 St. Clair Ave W', exact: CLAIR, resolution: 'text_candidates', match: null, candidates: ['5260587'] }],
    ['extra 383 Elm St, one exact row printed Elm Rd', { q: '383 Elm St', exact: { '383|ELM': [row('5191692', '383 Elm Rd')] }, resolution: 'text_candidates', match: null, candidates: ['5191692'] }],
    ['extra 5 Elm St, a row with no printed type stops the narrowing', { q: '5 Elm St', exact: { '5|ELM': [row('P1', '5 Elm St'), row('P2', '')] }, resolution: 'text_candidates', match: null, candidates: ['P1', 'P2'] }],
    ['extra 123 Yonge St, Toronto ON', { q: '123 Yonge St, Toronto ON', exact: { '123|YONGE': Y123 }, resolution: 'unique', match: '5464983' }],
    ['extra 21 Langden Ave, a full address found only through its address point', { q: '21 Langden Ave', typeahead: [row('L1', '21 Langden Ave')], resolution: 'unique', match: 'L1' }],
    ['extra 7 Oak, one typeahead row printed 7 Oakwood Ave', { q: '7 Oak', typeahead: [row('O1', '7 Oakwood Ave')], resolution: 'text_candidates', match: null, candidates: ['O1'] }],
    ['extra 383 Elm St, one typeahead row printed 383 Elm Rd', { q: '383 Elm St', typeahead: [row('5191692', '383 Elm Rd')], resolution: 'text_candidates', match: null, candidates: ['5191692'] }],
    ['extra 21 St. Gaspar Crt, a stored key with a period', { q: '21 St. Gaspar Crt', exact: { '21|. GASPAR CRT': [row('G1', '21 St. Gaspar Crt')] }, resolution: 'unique', match: 'G1' }],
  ];
  it.each(cases)('T5 (AC #6) case %s', async (_n, c) => {
    state.exact = c.exact ?? {};
    state.typeahead = c.typeahead ?? [];
    state.fuzzy = c.fuzzy ?? [];
    state.unlinked = c.unlinked ?? [];
    const out = await resolveAddress(c.q, opts);
    expect(out.resolution).toBe(c.resolution);
    if (c.match !== undefined) expect(out.match?.parcelId ?? null).toBe(c.match);
    if (c.candidates) expect(out.candidates.map((x) => x.parcelId)).toEqual(c.candidates);
    if (c.count !== undefined) expect(out.candidates).toHaveLength(c.count);
    if (c.resolution === 'unlinked') expect(out.lotMap).toEqual({ kind: 'unlinked', address: '2 Lake Cres', pin: { lat: 43.6, lng: -79.5 } });
  });

  it.each([['Suite 12 Elm St'], ['#12 Elm St']])('T5 extra: %s never parses to house number 2 (the leading-unit strip needs a separator)', (q) => {
    expect(parseFreeTextAddress(q).num).not.toBe('2');
  });
  // Cases 24 (outside Toronto), 29 (two characters) and the phone half of 23 are existing phone tests (mobile/__tests__ parcelSearchMatch), cited, not re-written.
});
