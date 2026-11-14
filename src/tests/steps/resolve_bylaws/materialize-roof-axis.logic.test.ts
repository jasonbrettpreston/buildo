// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (option and threshold slots; the lot stamps), §7 I10, I12, I13, I14, I15
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-465 (1), (2), (6) (the option slots, share the cell, RC-1); M-400
// Handbook: Spec 132 §materializer.1 (R-EH); Spec 132 §core.9 (R-W: the core is pure)
//
// Test B of the MB-27.L2 roof axis (plan-roof-axis v2 §7 B1-B7, v5 RR-03) plus the Q-STOR a write and read boundaries (plan v8 §3): the
// pure core stores the option slots after the base pairs for the representative class, encodes the closed code shared, decodes it, audits
// the option slots, and the writer binds the three stamps as 32 bytes while Layer 3 reads them as hex through bylaw_resolution_lot_stamps.
// RED FIRST: run against the base tree (no option slots, no stampBytes, Layer 3 reading the lots table), every case fails.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const req = (rel: string): Json => require(path.join(ROOT, rel)) as Json;
const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const row = (id: number, o: Json = {}): Json => ({
  id, parcel_id: String(1000 + id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null,
  zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false,
  frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});

let mz: Json; let lr: Json; let rb: Json; let env: Json; let out: Json; let dicts: Json;
const mkEnv = (over: Json = {}): Json => mz.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ZONES, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version }, ...over });
beforeAll(() => {
  mz = req('scripts/lib/bylaw-materialize.js'); lr = req('scripts/lib/bylaw-lot-row.js'); rb = req('scripts/lib/bylaw-resolution.js');
  env = mkEnv();
  out = mz.materializeBatch([row(1), row(2, { zoning_is_ambiguous: true })], env);
  dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
});

describe('B1 / B2: the slot order and a 61-wide round trip', () => {
  // MB-27 increment 5 (named re-pin; migration 315): 55 base pairs (principal_coverage_path_b_pct joins at 22, so upper_storey_setback_m is base 27),
  // the 7 roof_form slots, then the 8 suite_height slots (low then tall) on the garden suite gfa_m2, height_m, rear_setback_m and separation_m
  it('B1: 55 base pairs, then flat and pitched for height_m, main_wall_height_m and upper_storey_setback_m, the threshold, then the suite height slots', () => {
    expect(env.pairs).toEqual(rb.scopePairs(SCOPE));
    expect(env.pairs).toHaveLength(57); // Part B, P2 a (named re-pin): the through-lot rear floor joins at base 37 (was 56); P1 b (migration 321): the corner floor side_setback_street_floor_m joins at base 41 (was 55 pairs)
    expect(env.optionPairs.map((p: Json) => [p.target, p.option, p.base_index])).toEqual([
      ['height_m', 'flat_or_shallow_roof', 14], ['height_m', 'pitched', 14],
      ['main_wall_height_m', 'flat_or_shallow_roof', 19], ['main_wall_height_m', 'pitched', 19],
      ['upper_storey_setback_m', 'flat_or_shallow_roof', 26], ['upper_storey_setback_m', 'pitched', 26],
      ['pitched_roof_slope_min', null, null],
      ['gfa_m2', 'suite_low', 30], ['gfa_m2', 'suite_tall', 30], ['height_m', 'suite_low', 31], ['height_m', 'suite_tall', 31],
      ['rear_setback_m', 'suite_low', 35], ['rear_setback_m', 'suite_tall', 35], ['separation_m', 'suite_low', 38], ['separation_m', 'suite_tall', 38], // P2 a (named re-pin): the through-lot rear floor joins after rear_setback_m, so separation_m moves from base 37 to 38
    ]);
    for (const p of env.optionPairs) if (p.base_index !== null) expect(env.pairs[p.base_index]).toEqual({ structure: p.structure, target: p.target });
  });
  it('B2: rows stays 54 pairs x 5 classes; option rows are the 7 slots for each listed class (RR-03; DL-7 a: the houseplex joins)', () => {
    const lot = out.rows.lots[0];
    expect(lot.codes).toHaveLength(72); // Part B, P2 a (named re-pin): was 71; P1 b, P1 b (named re-pin; migration 321): was 70
    expect(lr.decodeLotResults({ lot, pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs })).toHaveLength(57 * 5);
    const o = lr.decodeOptionResults({ lot, pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs }) as Json[];
    // MB-27 increment 4 (D-8 a named move; the scope lists house_with_secondary_suite third, migration 304): 3 listed classes x 7 slots; was 14
    expect(o).toHaveLength(45); // MB-27 increment 5 (named re-pin): 3 listed classes x 15 slots (7 roof_form + 8 suite_height); was 21
    expect(new Set(o.map((r) => r.class))).toEqual(new Set(['detached_house', 'detached_houseplex', 'house_with_secondary_suite']));
  });
  it('B2: a 61-wide lot decoded without the option slots, or a shared code at a base slot, throws (never decoded against the wrong positions)', () => {
    const lot = out.rows.lots[0];
    expect(() => lr.decodeLotResults({ lot, pairs: env.pairs, classes: env.classes, map: MAP, dicts })).toThrow(/length 72 != 57/);
    const bad = { ...lot, codes: lot.codes.map((c: number, i: number) => (i === 0 ? lr.sharedCode(MAP) : c)) };
    expect(() => lr.decodeLotResults({ lot: bad, pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs })).toThrow(/shared code at base slot 1/);
  });
});

describe('B3 / B4 / B6: no override at the option slots; the option flag is not a lot input; a gated lot shares nothing', () => {
  // MB-27 increment 4 (D-8 a named move): the wording is "for the representative class only"; a listed class other than the first
  // (the houseplex, DL-7 a; the suite, migration 304) may write its own option overrides at 55-61, an unlisted class never does
  it('B3: no class_results entry at slots 55-61 for the representative class or an unlisted class (RC-1 as amended by DL-7 a), and an option slot that omits the representative class is refused', () => {
    const listed = SCOPE.options.roof_form.classes.slice(1) as string[];
    for (const l of out.rows.lots) if (l.class_results) for (const [c, ov] of Object.entries(l.class_results as Json)) for (const k of Object.keys(ov as Json)) if (!listed.includes(c)) expect(Number(k)).toBeLessThan(54);
    const bad = { ...SCOPE, options: { ...SCOPE.options, roof_form: { ...SCOPE.options.roof_form, classes: ['detached_houseplex'] } } };
    expect(() => mkEnv({ scope: bad })).toThrow(/representative class/);
  });
  it('B4: I10 stays 0, and an option row\'s inputs_used leaves out the flag the option sets (kept in the cache key)', () => {
    expect(out.matched.inputs_defaulted).toBe(0);
    const v = mz.logicalRowsOf(row(1), out.rows.lots[0], dicts, env) as Json;
    for (const r of v.option_rows as Json[]) expect(r.inputs_used, `${r.target} ${r.option}`).not.toContain('flags.flat_or_shallow_roof');
    expect(env.optionInputs).toEqual(['flags.flat_or_shallow_roof', 'flags.suite_height_over_4m', 'flags.suite_one_storey']); // MB-27 increment 5 (named re-pin): the suite_height token and its sets
  });
  it('B6: a gated lot writes every option slot in full as the gate (code not_evaluated; never shared, the I4 CHECK)', () => {
    const g = out.rows.lots[1];
    expect(g.lot_gate).toBe('ambiguous_zone');
    expect(g.codes.slice(57)).toEqual(new Array(15).fill(lr.resultCodes(MAP).indexOf('not_evaluated')));
  });
});

describe('B5 / B7: the I12 / I15 audit covers the option slots; traceOption', () => {
  it('B5: the audit checks the 54 base pairs and the 7 option slots, and agrees with the uncached evaluator and itself reversed', () => {
    const o = mz.materializeBatch([row(1)], mkEnv({ audit: { everyNth: 1, offset: 0 } }));
    expect(o.matched.equivalence_checked).toBe(72); // MB-27 increment 5 (named re-pin, P2 a: 57 base pairs now): 55 base pairs + 15 option slots
    expect(o.matched.equivalence_disagreements).toBe(0);
    expect(o.matched.order_disagreements).toBe(0);
  });
  it('B7: traceOption recomputes one option row on read with the stored fields the slot decodes to', () => {
    const { lot } = rb.buildLotVector(row(1), env.lotEnv);
    const dec = lr.decodeOptionResults({ lot: out.rows.lots[0], pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs }) as Json[];
    env.optionPairs.forEach((p: Json, k: number) => {
      const t = mz.traceOption(lot, p, 'detached_house', env) as Json;
      for (const f of mz.STORED_RESULT_FIELDS as string[]) expect([p.target, p.option, f, t[f]]).toEqual([p.target, p.option, f, (dec[k] as Json)[f]]);
    });
  });
});

describe('the module surface: the ROOF-5 export for the Layer 3 reader (operator "Q-r2 a") and the read-side error classes stay exported', () => {
  it('withNotAbove and the three permission error classes are exported functions (a comment must never swallow an export)', () => {
    for (const k of ['withNotAbove', 'PermissionRecomputeStaleError', 'PermissionRecomputeDriftError', 'PermissionDisclosureError']) expect([k, typeof mz[k]]).toEqual([k, 'function']);
  });
});

describe('the run tallies count every result written, the option slots included (I3 conflict_cells is a FAIL check): OUTPUT panel S1-02', () => {
  it('a not_evaluated:conflict in an option slot is counted in not_evaluated_by_reason, and results_by_status sums to all 61 slots', () => {
    const ev = (lot: Json): Json => (lot.flags && typeof lot.flags.flat_or_shallow_roof === 'boolean'
      ? { status: 'conflict', value: null, reason: 'conflict', losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] }
      : { status: 'value', value: 1, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] });
    const o = mz.materializeBatch([row(1)], mkEnv({ hooks: { evaluate: ev, permitted: () => ({ status: 'permitted', winners: [] }) } }));
    expect(o.matched.not_evaluated_by_reason.conflict).toBe(6); // the six option slots; the threshold runs on the base lot
    expect(Object.values(o.matched.results_by_status as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(72); // MB-27 increment 5 (named re-pin, P2 a): width 70
  });
});

describe('Q-STOR a: the stamps cross the DB boundary as 32 bytes; JavaScript stays hex', () => {
  const step = (): Json => req('scripts/lib/compute/resolve-bylaws.js');
  it('the writer binds row_sha, table_version and evaluator_version as 32-byte Buffers equal to the hex the core stamped', () => {
    const cfg = { resolve_bylaws_population_zone_classes: ZONES, resolve_bylaws_equivalence_every_nth: 2000 };
    const o = step().materializeRows([{ ...row(1), run_day: 0 }], { config: cfg, lookups: {} }) as Json;
    const core = mz.materializeBatch([row(1)], env).rows.lots[0];
    for (const c of ['row_sha', 'table_version', 'evaluator_version']) {
      const v = o.rows.e4[0][c];
      expect(Buffer.isBuffer(v), c).toBe(true);
      expect([c, v.length, v.toString('hex')]).toEqual([c, 32, core[c]]);
    }
  });
  it('a stamp that is not a 64-hex sha256 is refused before any bind (never written loosely)', () => {
    expect(() => step().stampBytes('ab', 'row_sha')).toThrow(/64-hex/);
    expect(() => step().stampBytes('A'.repeat(64), 'row_sha')).toThrow(/64-hex/);
    expect(step().stampBytes('a'.repeat(64), 'row_sha')).toHaveLength(32);
  });
  it('Layer 3 reads the lot stamps through bylaw_resolution_lot_stamps (hex), never the bytea columns, and gets the input table_version text', () => {
    const CM = req('scripts/lib/compute/compute-maxbld-scenarios.js');
    expect(CM.READ_SQL.lots).toContain('FROM bylaw_resolution_lot_stamps l');
    expect(CM.READ_SQL.lots).not.toContain('bylaw_resolution_lots');
    const d = read('scripts/compute-maxbld-scenarios.descriptor.json');
    expect(JSON.stringify(d)).not.toContain('bylaw_resolution_lots.table_version');
    expect(d.staleness.pins.find((p: Json) => p.step === 'resolve_bylaws').stamp).toBe('bylaw_resolution_lot_stamps.table_version');
    expect(INPUT.table_version).toMatch(/^[0-9a-f]{64}$/); // the text the view gives back (encode(x, 'hex') of the bytes the writer bound)
  });
  it('the I14 recompute compares bytes (sha256(...)), with no hex encode', () => {
    const q = (mz.rowShaMismatchSql({ units: 'u', texts: 't', lots: 'l' }) as string[])[2] as string;
    expect(q).toContain('row_sha IS DISTINCT FROM sha256(convert_to(');
    expect(q).not.toContain("'hex'");
  });
});
