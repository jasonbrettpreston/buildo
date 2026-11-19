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
