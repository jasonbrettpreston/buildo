// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35, FE-05 (the server formats every value),
//            docs/specs/01-pipeline/60_shared_steps.md Refresh Snapshot (dated note 2026-11-11: the stored, dated citywide counts).
//
// MF-62 · McFrontend queue · lane E. The producer src/lib/parcels/what-we-checked.ts on a fake read-only handle (operator 2026-11-11
// "Mf-62 - yes"; "x-1 a of course, x-2 a x-3 a x-4 a - build this into McFront-end specs and rulings and handbook"):
//   P1 citywide from the stored row only (X-1 a): a missing row, a missing or zero value omits the whole group; the rules count equals the
//      catalogue (universe.lock.json rows == bylaw-provisions.json counts.rows); no live count of a source table in the producer's SQL.
//   P2 per lot: the evaluated limit count; exception_not_authored -> limits_gated; any other gate, no row or zero evaluated -> limits_not_evaluated
//      (X-3 a); ravine and heritage only when enriched (X-2 a); decisions only with a neighbourhood, decided values only.
//   P3 pace: the two logic_variables, bounds equal to the seed; out of bounds, missing or skip > minimum -> null (never a throw); delays rise and
//      stay below the minimum, the dates line last.
//   P4 the re-opened-lot rule (MF-45 meter kinds).
//   P5 every produced value builds a valid tree (the producer and the contract agree).
//   P7 the processing sequence (operator 2026-11-11, "Processing demo + choose-lot": no "Show report" mid-animation; a pause after the last
//      fact, then "The Building Possibilities Report for {address} is ready.", then the report opens by itself; slower; "Skip" from the start):
//      each fact shows its loading verb at delay_ms and resolves at done_ms; the ready line at ready_ms after a one-step pause; the report
//      opens at min_ms after the hold report_check_ready_hold_ms (admin data); the address is the lot's stored address, formatted here (FE-05);
//      a lot without one, or a hold that leaves no room, skips the screen.
// No DB, no network. The live read is run by the DB job.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CITYWIDE_SQL, DECIDED_COA_PATTERN, DECISIONS_SQL, LOT_SQL, REPORT_CHECK_BOUNDS, REPORT_CHECK_KEYS,
  citywideLines, lotLines, paced, readWhatWeChecked, showsWhatWeChecked,
} from '@/lib/parcels/what-we-checked';
import { assertTree, buildTree } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';

vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logInfo: vi.fn(), logError: vi.fn() }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- rows under test
const ROOT = process.cwd();
const SEED: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const CITY: Json = {
  parcels_total: 496536, building_footprints_total: 427077, permits_active_distinct: 160128, coa_total: 33982, map_areas_total: 27759,
  zoning_layer_version: '2026-02-20T21:29:42Z', permits_last_seen_at: '2026-10-25T12:00:00Z', coa_last_seen_at: '2026-10-23T02:24:17Z',
};
const LOT: Json = {
  lot_size_sqm: '246.40', neighbourhood_id: 144, is_in_ravine_protection_area: false, ravine_dataset_version_when_enriched: 'v1',
  is_heritage_designated: false, heritage_dataset_version_when_enriched: 'v1', has_resolution: true, lot_gate: null,
  resolved_at: '2026-11-10T18:53:31Z', limits_evaluated: '163', types_evaluated: '5', address_number: '100', linear_name_full: 'Example Ave',
};
const fakeDb = (o: { vars?: Json; lot?: Json | null; city?: Json | null; decisions?: number } = {}) => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const vars = o.vars ?? { report_check_min_ms: 23000, report_check_skip_after_ms: 0, report_check_ready_hold_ms: 1500 };
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM logic_variables')) return { rows: Object.entries(vars).map(([variable_key, variable_value]) => ({ variable_key, variable_value })) };
      if (sql === LOT_SQL) return { rows: o.lot === null ? [] : [o.lot ?? LOT] };
      if (sql === DECISIONS_SQL) return { rows: [{ n: String(o.decisions ?? 12) }] };
      if (sql === CITYWIDE_SQL) return { rows: o.city === null ? [] : [o.city ?? CITY] };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
};

describe('P1 citywide: the stored row only (X-1 a)', () => {
  it('the five lines, in order, server-formatted; builds = active permits + CoA applications', () => {
    expect(citywideLines(CITY as never, 4356)).toEqual([
      { key: 'lots', value: '496,536' }, { key: 'regulations', value: '4,356' }, { key: 'buildings', value: '427,077' },
      { key: 'builds', value: '194,110' }, { key: 'map_areas', value: '27,759' },
    ]);
  });
  it('a missing row, a null value or a zero value omits the whole group (never a partial set, never a literal)', () => {
    expect(citywideLines(undefined, 4356)).toEqual([]);
    for (const k of ['parcels_total', 'building_footprints_total', 'permits_active_distinct', 'coa_total', 'map_areas_total']) {
      expect(citywideLines({ ...CITY, [k]: null } as never, 4356)).toEqual([]);
      expect(citywideLines({ ...CITY, [k]: 0 } as never, 4356)).toEqual([]);
    }
    expect(citywideLines(CITY as never, 0)).toEqual([]);
  });
  it('the rules count is the catalogue count: universe.lock.json rows equals bylaw-provisions.json counts.rows', () => {
    const universe = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/universe.lock.json'), 'utf8'));
    const provisions = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-provisions.json'), 'utf8'));
    expect(universe.rows).toBe(provisions.counts.rows);
  });
  it('the producer never counts a source table live: its citywide SQL reads data_quality_snapshots only', () => {
    expect(CITYWIDE_SQL).toMatch(/FROM data_quality_snapshots/);
    expect(CITYWIDE_SQL).not.toMatch(/COUNT\(|FROM (parcels|permits|coa_applications|building_footprints|zoning_)/i);
    expect(CITYWIDE_SQL).not.toMatch(/NOW\(\)|CURRENT_DATE/i);
  });
});

describe('P2 per lot', () => {
  it('a resolved lot: area, the evaluated limit count, ravine, heritage, decisions', () => {
    expect(lotLines(LOT as never, 12)).toEqual([
      { key: 'area', value: '246 m²' }, { key: 'limits', value: '163', types: '5' }, { key: 'ravine_out' }, { key: 'heritage_out' }, { key: 'decisions', value: '12' },
    ]);
  });
  it('the limits line is the evaluated count, never the 270 rows: LOT_SQL excludes not_evaluated', () => {
    expect(LOT_SQL).toMatch(/r\.status <> 'not_evaluated'/);
  });
  it('N-1 (b, operator 2026-11-11): the limits line names the house types it counts across, from data (distinct evaluated classes); none -> not evaluated', () => {
    expect(LOT_SQL).toMatch(/COUNT\(DISTINCT r\.class\) FROM bylaw_resolution_results r WHERE r\.parcel_id = p\.id AND r\.status <> 'not_evaluated'\) AS types_evaluated/);
    expect(lotLines({ ...LOT, types_evaluated: '0' } as never, 1).map((l) => l.key)).toContain('limits_not_evaluated');
  });
  it('exception_not_authored -> limits_gated (no count)', () => {
    expect(lotLines({ ...LOT, lot_gate: 'exception_not_authored', limits_evaluated: '0' } as never, 12).map((l) => l.key)).toContain('limits_gated');
  });
  for (const [why, lot] of [
    ['another gate', { ...LOT, lot_gate: 'ambiguous_zone' }],
    ['no resolution row', { ...LOT, has_resolution: false, lot_gate: null, limits_evaluated: '0' }],
    ['zero evaluated', { ...LOT, limits_evaluated: '0' }],
  ] as Array<[string, Json]>) {
    it(`${why} -> limits_not_evaluated (X-3 a), never a count`, () => {
      const lines = lotLines(lot as never, 12);
      expect(lines.map((l) => l.key)).toContain('limits_not_evaluated');
      expect(lines.map((l) => l.key)).not.toContain('limits');
    });
  }
  it('ravine and heritage: in/out by the flag, omitted when that enrichment never ran (X-2 a)', () => {
    expect(lotLines({ ...LOT, is_in_ravine_protection_area: true, is_heritage_designated: true } as never, 1).map((l) => l.key)).toEqual(['area', 'limits', 'ravine_in', 'heritage_in', 'decisions']);
    expect(lotLines({ ...LOT, ravine_dataset_version_when_enriched: null, heritage_dataset_version_when_enriched: null } as never, 1).map((l) => l.key)).toEqual(['area', 'limits', 'decisions']);
  });
  it('no lot area -> no area line; no neighbourhood -> no decisions line (never "0")', () => {
    expect(lotLines({ ...LOT, lot_size_sqm: null } as never, null).map((l) => l.key)).toEqual(['limits', 'ravine_out', 'heritage_out']);
  });
  it('decisions: decided values only (approved in any wording, refused); withdrawn, deferred and blank are not', () => {
    const re = new RegExp(DECIDED_COA_PATTERN, 'i');
    for (const d of ['Approved', 'Approved with Conditions', 'conditional approval', 'Refused', 'modified approval']) expect(re.test(d)).toBe(true);
    for (const d of ['Withdrawn', 'Deferred', 'application withdrawn', '']) expect(re.test(d)).toBe(false);
    expect(DECISIONS_SQL).toMatch(/neighbourhood_id = \$1 AND decision ~\* \$2/);
  });
  it('readWhatWeChecked: no neighbourhood -> no decisions query and no decisions line', async () => {
    const db = fakeDb({ lot: { ...LOT, neighbourhood_id: null } });
    const w = await readWhatWeChecked(db as never, 'P1');
    expect(db.calls.some((c) => c.sql === DECISIONS_SQL)).toBe(false);
    expect(w?.groups.find((g) => g.key === 'lot')?.lines.map((l) => l.key)).not.toContain('decisions');
  });
});

describe('P3 pace', () => {
  it('the bounds equal the seed and the seed lists the three keys in the "MaxBLD Report" admin group (sequence ruling 2026-11-11: 23000, 0, 1500)', () => {
    expect(Object.values(REPORT_CHECK_KEYS).sort()).toEqual(['report_check_min_ms', 'report_check_ready_hold_ms', 'report_check_skip_after_ms']);
    for (const k of Object.values(REPORT_CHECK_KEYS)) {
      expect(SEED[k].min).toBe(REPORT_CHECK_BOUNDS[k]?.min);
      expect(SEED[k].max).toBe(REPORT_CHECK_BOUNDS[k]?.max);
      expect(SEED[k].admin.group).toBe('MaxBLD Report');
    }
    expect(SEED.report_check_min_ms.default).toBe(23000); // operator 2026-11-11 D-6, verbatim "1 acutally think it needs longer" (about 23 s)
    expect(SEED.report_check_min_ms.max).toBe(30000);
    expect(SEED.report_check_skip_after_ms.default).toBe(0); // "Skip" from the start (WCAG 2.2.2)
    expect(SEED.report_check_ready_hold_ms.default).toBe(1500);
  });
  for (const [why, vars] of [
    ['a missing minimum', { report_check_skip_after_ms: 0, report_check_ready_hold_ms: 1500 }],
    ['a minimum below its bound', { report_check_min_ms: 10, report_check_skip_after_ms: 0, report_check_ready_hold_ms: 1500 }],
    ['a non-integer skip', { report_check_min_ms: 23000, report_check_skip_after_ms: 1.5, report_check_ready_hold_ms: 1500 }],
    ['a skip above the minimum', { report_check_min_ms: 3000, report_check_skip_after_ms: 5000, report_check_ready_hold_ms: 1500 }],
    ['a missing hold', { report_check_min_ms: 23000, report_check_skip_after_ms: 0 }],
    ['a hold below its bound', { report_check_min_ms: 23000, report_check_skip_after_ms: 0, report_check_ready_hold_ms: 10 }],
    ['a hold not below the minimum', { report_check_min_ms: 3000, report_check_skip_after_ms: 0, report_check_ready_hold_ms: 3000 }],
  ] as Array<[string, Json]>) {
    it(`${why}: null (the screen is skipped, the report still opens), never a throw`, async () => {
      await expect(readWhatWeChecked(fakeDb({ vars }) as never, 'P1')).resolves.toBeNull();
    });
  }
  it('an unknown lot: null', async () => {
    await expect(readWhatWeChecked(fakeDb({ lot: null }) as never, 'nope')).resolves.toBeNull();
  });
  it('the delays rise from 0, stay below the minimum, and the dates line is last', async () => {
    const w = await readWhatWeChecked(fakeDb() as never, 'P1');
    const ds = [...(w?.groups.flatMap((g) => g.lines.map((l) => l.delay_ms)) ?? []), w?.dates?.delay_ms as number];
    expect(ds[0]).toBe(0);
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1] as number);
    expect(ds[ds.length - 1]).toBeLessThan(23000);
    expect(w?.min_ms).toBe(23000);
    expect(w?.skip_after_ms).toBe(0);
  });
  it('paced drops an empty group', () => {
    expect(paced([{ key: 'citywide', lines: [] }, { key: 'lot', lines: [{ key: 'ravine_out' }] }], [], { minMs: 23000, skipAfterMs: 0, readyHoldMs: 1500 }, '1 A St').groups.map((g) => g.key)).toEqual(['lot']);
  });
});

describe('P4 the re-opened-lot rule (MF-45 meter kinds)', () => {
  it('shown for counted and unmetered; never for already_counted, limit_reached, not_entitled or none', () => {
    expect(showsWhatWeChecked('counted')).toBe(true);
    expect(showsWhatWeChecked('unmetered')).toBe(true);
    for (const k of ['already_counted', 'limit_reached', 'not_entitled', 'none']) expect(showsWhatWeChecked(k)).toBe(false);
  });
});

describe('P5 the producer and the contract agree', () => {
  it('a full read builds and asserts a loading tree; dates are Toronto calendar dates', async () => {
    const w = await readWhatWeChecked(fakeDb() as never, 'P1');
    const tree = buildTree({ lifecycle: 'loading', what_we_checked: w }, reportCtx);
    expect(() => assertTree(tree, reportCtx)).not.toThrow();
    expect(tree.checked.dates.text).toContain('2026-11-10');
    expect(tree.checked.dates.text).toContain('2026-02-20');
    expect(tree.checked.groups[0].lines[3].text).toContain('194,110');
    expect(tree.checked.groups[1].lines[1].text).toBe('163 by-law checks across 5 house types');
  });
  it('no stored row: the tree carries the lot group only, still valid', async () => {
    const w = await readWhatWeChecked(fakeDb({ city: null }) as never, 'P1');
    expect(w?.groups.map((g) => g.key)).toEqual(['lot']);
    expect(() => assertTree(buildTree({ lifecycle: 'loading', what_we_checked: w }, reportCtx), reportCtx)).not.toThrow();
  });
});

// OUTPUT panel folds (2026-11-11): N-5 / CR-2 a DB error never fails the lookup; N-2 no "Lot: 0 m²"; N-4 the by-law date only beside a counted limits line.
describe('P6 OUTPUT panel folds', () => {
  it('N-5: a DB error returns null (logged), never a throw', async () => {
    const { logError } = await import('@/lib/logger');
    const db = { query: async () => { throw new Error('boom'); } };
    await expect(readWhatWeChecked(db as never, 'P1')).resolves.toBeNull();
    expect(logError).toHaveBeenCalled();
  });
  it('N-2: an area that rounds below 1 m² is omitted', () => {
    expect(lotLines({ ...LOT, lot_size_sqm: '0.4' } as never, 1).map((l) => l.key)).not.toContain('area');
    expect(lotLines({ ...LOT, lot_size_sqm: '0.6' } as never, 1)[0]).toEqual({ key: 'area', value: '1 m²' });
  });
  it('N-4: the by-law date is sent only with a counted limits line', async () => {
    const counted = await readWhatWeChecked(fakeDb() as never, 'P1');
    expect(counted?.dates?.lines.map((d) => d.key)).toContain('bylaw');
    for (const lot of [{ ...LOT, lot_gate: 'exception_not_authored' }, { ...LOT, lot_gate: 'ambiguous_zone' }, { ...LOT, limits_evaluated: '0' }]) {
      const w = await readWhatWeChecked(fakeDb({ lot }) as never, 'P1');
      expect(w?.dates?.lines.map((d) => d.key)).not.toContain('bylaw');
    }
  });
});

describe('P7 the processing sequence (operator 2026-11-11)', () => {
  const PACE = { minMs: 23000, skipAfterMs: 0, readyHoldMs: 1500 };
  it('one step s = floor((min - hold) / (facts + 1)): fact i shows its verb at i*s and resolves at (i+1)*s; the dates with the last fact; the ready line one step later', () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}` }));
    const w = paced([{ key: 'citywide', lines: lines.slice(0, 5) }, { key: 'lot', lines: lines.slice(5) }], [{ key: 'bylaw', value: '2026-01-02' }], PACE, '100 Example Ave');
    const s = Math.floor((23000 - 1500) / 11);
    const all = w.groups.flatMap((g) => g.lines);
    all.forEach((l, i) => { expect(l.delay_ms).toBe(i * s); expect(l.done_ms).toBe((i + 1) * s); });
    expect(w.dates?.delay_ms).toBe(10 * s);
    expect(w.ready_ms).toBe(11 * s);
    expect(w.min_ms - w.ready_ms).toBeGreaterThanOrEqual(1500); // the hold before the report opens by itself
    expect(w.skip_after_ms).toBe(0);
    expect(w.address).toBe('100 Example Ave');
  });
  it('a step below 1 ms: null (never a tree the contract refuses; code-reviewer CR-5)', async () => {
    const vars = { report_check_min_ms: 1000, report_check_skip_after_ms: 0, report_check_ready_hold_ms: 995 };
    await expect(readWhatWeChecked(fakeDb({ vars }) as never, 'P1')).resolves.toBeNull();
  });
  it('skip 0 is a real value, not a missing one: the screen is shown with Skip from the start', async () => {
    const w = await readWhatWeChecked(fakeDb() as never, 'P1');
    expect(w).not.toBeNull();
    expect(w?.skip_after_ms).toBe(0);
  });
  it('a full read: the address is the stored number and street, server-formatted; the ready line before the minimum', async () => {
    const w = await readWhatWeChecked(fakeDb() as never, 'P1');
    expect(w?.address).toBe('100 Example Ave');
    expect(LOT_SQL).toMatch(/p\.address_number, p\.linear_name_full/);
    expect(w?.ready_ms).toBeLessThan(w?.min_ms as number);
    const last = Math.max(...(w?.groups.flatMap((g) => g.lines.map((l) => l.done_ms)) ?? []));
    expect(w?.ready_ms).toBeGreaterThan(last);
  });
  for (const [why, lot] of [
    ['no house number', { ...LOT, address_number: null }],
    ['no street', { ...LOT, linear_name_full: '  ' }],
    ['the stored literal None', { ...LOT, address_number: 'None', linear_name_full: 'None' }],
  ] as Array<[string, Json]>) {
    it(`${why}: null (the screen is skipped, never a sentence without an address)`, async () => {
      await expect(readWhatWeChecked(fakeDb({ lot }) as never, 'P1')).resolves.toBeNull();
    });
  }
  it('the producer and the contract agree on the new keys: the tree carries the ready line with the address and the view text', async () => {
    const w = await readWhatWeChecked(fakeDb() as never, 'P1');
    const tree = buildTree({ lifecycle: 'loading', what_we_checked: w }, reportCtx);
    expect(() => assertTree(tree, reportCtx)).not.toThrow();
    expect(tree.checked.ready.text).toBe('The Building Possibilities Report for 100 Example Ave is ready.');
    expect(tree.checked.ready.at_ms).toBe(w?.ready_ms);
    expect(tree.checked.groups[0].lines[1].verb).toBe('Pulling by-law results…');
  });
});
