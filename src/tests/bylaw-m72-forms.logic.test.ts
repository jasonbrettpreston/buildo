// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-480 (the Layer 3 grammar gains refuse, flag and best_of, the
//            M-377 form of a note on M-72), M-72 (69a:132), M-64 (the closed reason list), M-385 / R3-01, M-386 / R3-02,
//            M-389 / R3-05, M-462 (no_cited_rafter_span), M-467 (Q-HEAD B), M-474 (setback_storey_not_built)
//
// MB-27 (M-72 forms) — the lock of M-480, red first. Three Layer 3 forms (Layer 1 is unchanged):
//   refuse(<reason word>)            -> not_evaluated:<word>; the word is from the catalogue's declared refuse_reasons.
//   flag(<word>; <expr>)             -> the value of <expr> with <word> added to its flags; the word is declared (flag_words).
//   best_of(<row>; <row>; …[; ceiling: <expr>])
//                                    -> the largest evaluated candidate, ties to the first in argument order (never sorted),
//                                       with headline:<row id>; a not_evaluated candidate adds headline_lower_bound:<row id>
//                                       unless its reason is a declared R3-05 drop reason (then dropped:<row id>, no lower
//                                       bound) or the result equals the ceiling. It keeps every flag of the winner and never a
//                                       losing candidate's own flags (the flag contract, F6h).
// No new DslError code. The rafter worked case uses the cited OBC 2024 Table 9.23.4.2.-F tiers (the increment 2 notes):
// spans 3.89 / 5.11 / 6.52 / 7.66 m, assembly depths 0.1622 / 0.2062 / 0.2572 / 0.3082 m.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const r9 = (x: number): number => Math.round(x * 1e9) / 1e9;
const ENV = { round9: r9, eps: 1e-9 };
const L3 = { layer: 'l3' };
const U0 = { lv: {}, l2: {}, names: {}, flags: [] };

const FLAT = 'gfa_flat_m2';
const PA = 'gfa_pitched_a_m2';
const PB = 'gfa_pitched_b_m2';
const HEAD = (id: string): string => `headline:${id}`;
const LOWER = (id: string): string => `headline_lower_bound:${id}`;
const DROP = (id: string): string => `dropped:${id}`;
const INTERIM = 'headline_lower_bound:main_wall_shares_not_resolved';

let D: Json;
let E: Json;
let CAT: Json;
beforeAll(async () => {
  D = await mod('scripts/analysis/bylaw/dsl.mjs');
  E = await mod('scripts/analysis/bylaw/evaluate-l3.mjs');
  CAT = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
});

const codeOf = (fn: () => unknown): string | null => {
  try { fn(); } catch (e: any) { return e.code ?? String(e); } // eslint-disable-line @typescript-eslint/no-explicit-any
  return null;
};
const staticOf = (src: string, U: Json = U0): Json => D.staticUnitL3(D.parseExpr(src, L3), U);
const canon = (src: string): string => D.canonExpr(D.parseExpr(src, L3));
/** Evaluate one Layer 3 source with candidate rows served by `rows` (id -> Layer 3 value). */
const runWith = (src: string, rows: Json = {}, over: Json = {}): Json =>
  E.evaluateL3Source(src, E.makeL3Env({ ...ENV, rowIds: Object.keys(rows), readRow: (id: string) => rows[id], ...over })).l3;
const N = (v: number, flags: string[] = []): Json => E.num(v, 'm2', flags);
const NE = (reason: string, flags: string[] = [], undecided?: Json[]): Json => E.ne(reason, undecided, flags);

describe('M-480 declared data (layer3-catalogue.json)', () => {
  it('F0 the lexicon gains the three forms and the ceiling key; the three declared lists exist', () => {
    for (const w of ['refuse', 'flag', 'best_of', 'ceiling']) expect([w, CAT.lexicon.w[w]]).toEqual([w, w]);
    expect(CAT.lexicon.p.headline_).toBe('headline:');
    expect(CAT.lexicon.p.headline_lower_bound_).toBe('headline_lower_bound:');
    expect(CAT.lexicon.p.dropped_).toBe('dropped:');
    expect(CAT.refuse_reasons).toEqual(expect.arrayContaining(['no_cited_rafter_span', 'pitched_form_not_offered']));
    expect(CAT.drop_reasons).toEqual(['pitched_form_not_offered']);
    for (const r of CAT.drop_reasons) expect(CAT.refuse_reasons).toContain(r);
    expect(CAT.flag_words).toEqual(expect.arrayContaining(['setback_storey_not_built']));
    for (const list of [CAT.refuse_reasons, CAT.drop_reasons, CAT.flag_words]) expect(new Set(list).size).toBe(list.length);
  });
});

describe('M-480 the grammar (Layer 3 only)', () => {
  it('F1 Layer 1 is unchanged: refuse, flag and best_of are unknown functions there; no new DslError code', () => {
    for (const src of [
      'x = refuse(no_cited_rafter_span) @(A)',
      'x = flag(setback_storey_not_built; 0 m2) @(A)',
      'x = best_of(a_m2; b_m2) @(A)',
    ]) expect([src, codeOf(() => D.parseStatement(src))]).toEqual([src, 'unknown_function']);
    expect(D.DSL_ERROR_CODES).toEqual(['syntax', 'bad_literal', 'bad_unit', 'bad_target', 'bad_clause_path', 'unknown_function', 'mixed_and_or', 'band_arm_not_literal', 'min_max_arity', 'duplicate_by_type_key', 'value_form_mixed', 'too_deep']);
  });

  it('F2 each form parses in Layer 3 and has one canonical text; value form is formula', () => {
    expect(canon('refuse(no_cited_rafter_span)')).toBe('refuse(no_cited_rafter_span)');
    expect(canon('flag( setback_storey_not_built ; 0.0 m2 )')).toBe('flag(setback_storey_not_built;0m2)');
    expect(canon(`best_of(${FLAT}; ${PA}; ceiling: 360.0 m2)`)).toBe(`best_of(${FLAT};${PA};ceiling:360m2)`);
    for (const src of ['refuse(no_cited_rafter_span)', 'flag(setback_storey_not_built; 0 m2)', `best_of(${FLAT}; ${PA})`]) {
      expect([src, D.valueFormOf(D.parseExpr(src, L3))]).toEqual([src, 'formula']);
    }
  });

  it('F2 best_of keeps argument order in its canonical text (the order is the tie order); ceiling is optional', () => {
    expect(canon(`best_of(${FLAT}; ${PA})`)).toBe(`best_of(${FLAT};${PA})`);
    expect(canon(`best_of(${PA}; ${FLAT})`)).toBe(`best_of(${PA};${FLAT})`);
    expect(canon(`best_of(${FLAT}; ${PA})`)).not.toBe(canon(`best_of(${PA}; ${FLAT})`));
  });

  it('F2 arity and placement: refuse(), flag(w), best_of(a) and a ceiling that is not last are syntax errors', () => {
    for (const src of [
      'refuse()',
      'refuse(a; b)',
      'flag(setback_storey_not_built)',
      'flag(; 0 m2)',
      `best_of(${FLAT})`,
      `best_of(ceiling: 360 m2; ${FLAT}; ${PA})`,
      `best_of(${FLAT}; ceiling: 360 m2; ${PA})`,
      `best_of(${FLAT}; ${PA}; ceiling: 1 m2; ceiling: 2 m2)`,
      `best_of(${FLAT}; ceiling: 360 m2)`,
    ]) expect([src, codeOf(() => D.parseExpr(src, L3))]).toEqual([src, 'syntax']);
  });

  it('F2 l3RefsOf sees best_of candidates and the ceiling, never a reason or flag word as a name', () => {
    const refs = D.l3RefsOf(D.parseExpr(`best_of(${FLAT}; ${PA}; ceiling: l2(fsi) × lot_area_m2)`, L3));
    expect(refs.names).toEqual([FLAT, PA, 'lot_area_m2'].sort());
    expect(refs.l2).toEqual(['fsi']);
    const r2 = D.l3RefsOf(D.parseExpr('if(half_span_a_m > lv(rafter_span_4_m); refuse(no_cited_rafter_span); flag(setback_storey_not_built; 0 m))', L3));
    expect(r2.names).toEqual(['half_span_a_m']);
    expect(r2.lv).toEqual(['rafter_span_4_m']);
  });
});

describe('M-480 the static unit rule', () => {
  const U = { ...U0, names: { half_span_a_m: 'm', [FLAT]: 'm2', [PA]: 'm2', a_m: 'm' } };

  it('F3 refuse has no unit of its own (it unifies with any branch); an undeclared reason word is refused', () => {
    expect(staticOf('if(half_span_a_m > 7.66 m; refuse(no_cited_rafter_span); 3 m)', U)).toEqual({ unit: 'm', errs: [] });
    expect(staticOf('refuse(pitched_form_not_offered)', U)).toEqual({ unit: null, errs: [] });
    const bad = staticOf('refuse(not_a_declared_reason)', U);
    expect(bad.errs.some((x: string) => x.startsWith('unknown_reason') && x.includes('not_a_declared_reason'))).toBe(true);
  });

  it('F3 flag takes the unit of its expression; an undeclared flag word is refused', () => {
    expect(staticOf('flag(setback_storey_not_built; 0 m2)', U)).toEqual({ unit: 'm2', errs: [] });
    const bad = staticOf('flag(not_a_declared_flag; 0 m2)', U);
    expect(bad.errs.some((x: string) => x.startsWith('unknown_flag') && x.includes('not_a_declared_flag'))).toBe(true);
  });

  it('F3 best_of unifies every candidate and the ceiling; a mix of units is unit_mismatch', () => {
    expect(staticOf(`best_of(${FLAT}; ${PA}; ceiling: 360 m2)`, U)).toEqual({ unit: 'm2', errs: [] });
    const mixed = staticOf(`best_of(${FLAT}; a_m)`, U);
    expect(mixed.errs.some((x: string) => x.startsWith('unit_mismatch'))).toBe(true);
    const ceil = staticOf(`best_of(${FLAT}; ${PA}; ceiling: 3 m)`, U);
    expect(ceil.errs.some((x: string) => x.startsWith('unit_mismatch'))).toBe(true);
  });

  it('F3 checkRowL3 refuses a row that names an undeclared reason word', () => {
    const errs = D.checkRowL3({ id: 'x_m', form: 'expr', unit: 'm', expression: 'if(half_span_a_m > 7.66 m; refuse(no_such_reason); 3 m)' }, U);
    expect(errs.some((x: string) => x.startsWith('unknown_reason'))).toBe(true);
  });
});

describe('M-480 refuse at run time', () => {
  const SELECTOR = 'if(half_span_a_m > 7.66 m; refuse(no_cited_rafter_span); if(half_span_a_m > 6.52 m; 0.3082 m; if(half_span_a_m > 5.11 m; 0.2572 m; if(half_span_a_m > 3.89 m; 0.2062 m; 0.1622 m))))';

  it('F4 refuse(<word>) is not_evaluated with that word as its reason, never 0', () => {
    const v = runWith('refuse(no_cited_rafter_span)');
    expect([v.k, v.reason, v.v]).toEqual(['ne', 'no_cited_rafter_span', undefined]);
  });

  it('F4 the rafter selector through runRow: 7.70 m refused, 7.60 m gives 0.3082 m, 7.66 m (not more than) gives 0.3082 m', () => {
    const seedsOf = (): Json => {
      const catalogue = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
      catalogue.geometry_inputs = [...(catalogue.geometry_inputs || []), { id: 'half_span_a_m', unit: 'm' }];
      catalogue.rows = [...catalogue.rows, {
        id: 'roof_assembly_depth_a_m', building_type: 'detached_house', increment: '2', form: 'expr', unit: 'm', envelope: false,
        expression: SELECTOR, clauses: ['fixture'], rules: ['M-480'], example_ids: [], switch: 'formula:height_max_m',
      }];
      return {
        catalogue,
        switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
        buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
        logicVariables: readJson('scripts/seeds/logic_variables.json'),
        vocab: readJson('scripts/seeds/bylaw/vocab.json'),
        layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
      };
    };
    const R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const seeds = seedsOf();
    const at = (s: number): Json => R.runRow('roof_assembly_depth_a_m', { seeds, geometry: { half_span_a_m: s } });
    const refused = at(7.7);
    expect([refused.status, refused.reason, refused.value]).toEqual(['not_evaluated', 'no_cited_rafter_span', null]);
    const fits = at(7.6);
    expect([fits.status, fits.value]).toEqual(['computed', 0.3082]);
    expect(at(7.66).value).toBe(0.3082);
    expect(at(6.0).value).toBe(0.2572);
  });
});

describe('M-480 flag at run time', () => {
  it('F5 the word is added on every kind (num, ne, nb, unlimited); flags stay sorted and unique', () => {
    const W = 'setback_storey_not_built';
    const n = runWith(`flag(${W}; 0 m2)`);
    expect([n.k, n.v, n.u, n.flags]).toEqual(['num', 0, 'm2', [W]]);
    const e = runWith(`flag(${W}; lv(no_such_setting))`);
    expect([e.k, e.reason, e.flags]).toEqual(['ne', 'expression_error:unknown_variable', [W]]);
    const b = runWith(`flag(${W}; plate_m2)`, { plate_m2: E.nb(['c1'], ['z_last']) });
    expect([b.k, b.clauses, b.flags]).toEqual(['nb', ['c1'], [W, 'z_last']]);
    const u = runWith(`flag(${W}; unlimited)`);
    expect([u.k, u.flags]).toEqual(['unlimited', [W]]);
    const kept = runWith(`flag(${W}; plate_m2)`, { plate_m2: N(40, ['a_first', W]) });
    expect(kept.flags).toEqual(['a_first', W]);
  });

  it('F5 the M-474 plate: the flag is raised only when the set-back storey is not built', () => {
    const src = 'if(plate_m2 ≤ 0 m2; flag(setback_storey_not_built; 0 m2); plate_m2)';
    const none = runWith(src, { plate_m2: N(-3) });
    expect([none.k, none.v, none.flags]).toEqual(['num', 0, ['setback_storey_not_built']]);
    const built = runWith(src, { plate_m2: N(40) });
    expect([built.k, built.v, built.flags]).toEqual(['num', 40, []]);
  });
});

describe('M-480 best_of at run time (Q-HEAD B, the McProof cases)', () => {
  const BEST = `best_of(${FLAT}; ${PA}; ${PB})`;

  it('F6a all candidates computed: the largest wins; a tie goes to the first in argument order', () => {
    const big = runWith(BEST, { [FLAT]: N(250), [PA]: N(280), [PB]: N(260) });
    expect([big.k, big.v, big.flags]).toEqual(['num', 280, [HEAD(PA)]]);
    const tie = runWith(BEST, { [FLAT]: N(300), [PA]: N(280), [PB]: N(300) });
    expect([tie.v, tie.flags]).toEqual([300, [HEAD(FLAT)]]);
    const order = runWith(`best_of(${PB}; ${FLAT}; ${PA})`, { [FLAT]: N(300), [PA]: N(280), [PB]: N(300) });
    expect(order.flags).toEqual([HEAD(PB)]);
  });

  it('F6b one arm not_evaluated (no_cited_rafter_span): the evaluated larger wins with a lower-bound flag naming the arm', () => {
    const v = runWith(BEST, { [FLAT]: N(250), [PA]: N(280), [PB]: NE('no_cited_rafter_span') });
    expect([v.k, v.v, v.flags]).toEqual(['num', 280, [HEAD(PA), LOWER(PB)].sort()]);
  });

  it('F6c a pitched_form_not_offered candidate is dropped with its reason and raises no lower bound (R3-05)', () => {
    const v = runWith(BEST, { [FLAT]: N(250), [PA]: NE('pitched_form_not_offered'), [PB]: NE('pitched_form_not_offered') });
    expect([v.k, v.v, v.flags]).toEqual(['num', 250, [DROP(PA), DROP(PB), HEAD(FLAT)].sort()]);
    expect(v.flags.some((f: string) => f.startsWith('headline_lower_bound:'))).toBe(false);
  });

  it('F6d the result equals the ceiling: no lower-bound flag; below it, or an undecided ceiling, keeps the flag', () => {
    const rows = { [FLAT]: N(360), [PA]: N(280), [PB]: NE('no_cited_rafter_span') };
    const atCap = runWith(`best_of(${FLAT}; ${PA}; ${PB}; ceiling: 360 m2)`, rows);
    expect([atCap.v, atCap.flags]).toEqual([360, [HEAD(FLAT)]]);
    const rounding = runWith(`best_of(${FLAT}; ${PA}; ${PB}; ceiling: cap_m2)`, { ...rows, cap_m2: N(359.9999999999) });
    expect(rounding.flags).toEqual([HEAD(FLAT)]);
    const below = runWith(`best_of(${FLAT}; ${PA}; ${PB}; ceiling: 400 m2)`, rows);
    expect([below.v, below.flags]).toEqual([360, [HEAD(FLAT), LOWER(PB)].sort()]);
    const undecided = runWith(`best_of(${FLAT}; ${PA}; ${PB}; ceiling: cap_m2)`, { ...rows, cap_m2: NE('missing_input:l2(fsi)') });
    expect([undecided.k, undecided.v, undecided.flags]).toEqual(['num', 360, [HEAD(FLAT), LOWER(PB)].sort()]);
  });

  it('F6e every candidate not_evaluated: the first one\'s reason, never a number, every undecided list kept (R3-01)', () => {
    const v = runWith(BEST, {
      [FLAT]: NE('missing_input:l2(upper_storey_setback_m)', [], [{ id: 'l2(upper_storey_setback_m)', reason: 'missing_input:l2(upper_storey_setback_m)' }]),
      [PA]: NE('no_cited_rafter_span'),
      [PB]: NE('pitched_form_not_offered'),
    });
    expect([v.k, v.reason, v.v]).toEqual(['ne', 'missing_input:l2(upper_storey_setback_m)', undefined]);
    expect(v.undecided.map((d: Json) => d.reason)).toEqual(['missing_input:l2(upper_storey_setback_m)', 'no_cited_rafter_span', 'pitched_form_not_offered']);
  });

  it('F6e (M-480 text) every candidate not_evaluated and the first is a dropped one: the first one\'s reason', () => {
    const v = runWith(BEST, { [FLAT]: NE('pitched_form_not_offered'), [PA]: NE('no_cited_rafter_span'), [PB]: NE('no_cited_rafter_span') });
    expect([v.k, v.reason]).toEqual(['ne', 'pitched_form_not_offered']);
  });

  it('F6f not_buildable is dropped as max drops it, unless every candidate is not_buildable', () => {
    const one = runWith(BEST, { [FLAT]: E.nb(['c_flat']), [PA]: N(200), [PB]: N(100) });
    expect([one.k, one.v, one.flags]).toEqual(['num', 200, [HEAD(PA)]]);
    const all = runWith(BEST, { [FLAT]: E.nb(['c1']), [PA]: E.nb(['c2']), [PB]: E.nb(['c1']) });
    expect([all.k, [...all.clauses].sort()]).toEqual(['nb', ['c1', 'c2']]);
  });

  it('F6g the max preference: unlimited beats a number, then unregulated, then the largest number', () => {
    const u = runWith(BEST, { [FLAT]: N(900), [PA]: { k: 'unlimited', clause: null, flags: [] }, [PB]: N(100) });
    expect([u.k, u.flags]).toEqual(['unlimited', [HEAD(PA)]]);
    const g = runWith(BEST, { [FLAT]: N(900), [PA]: N(100), [PB]: { k: 'unregulated', clause: null, flags: [] } });
    expect([g.k, g.flags]).toEqual(['unregulated', [HEAD(PB)]]);
  });

  it('F6h the flag contract: every flag of the winner is kept, never a losing candidate\'s own flags', () => {
    const v = runWith(BEST, {
      [FLAT]: N(300, [INTERIM, 'shape_box_assumed']),
      [PA]: N(280, ['setback_storey_not_built']),
      [PB]: NE('no_cited_rafter_span', ['roof_thickness_smallest_code_rafter']),
    });
    expect([v.v, v.flags]).toEqual([300, [HEAD(FLAT), INTERIM, LOWER(PB), 'shape_box_assumed'].sort()]);
    const loserWins = runWith(BEST, { [FLAT]: N(250, [INTERIM]), [PA]: N(280, ['setback_storey_not_built']), [PB]: N(100, ['z_pb']) });
    expect(loserWins.flags).toEqual([HEAD(PA), 'setback_storey_not_built'].sort());
    const tie = runWith(BEST, { [FLAT]: N(300, [INTERIM]), [PA]: N(300, ['setback_storey_not_built']), [PB]: N(10) });
    expect(tie.flags).toEqual([HEAD(FLAT), INTERIM].sort());
    const dropped = runWith(BEST, { [FLAT]: N(250), [PA]: NE('pitched_form_not_offered', ['z_dropped_own']), [PB]: N(10) });
    expect(dropped.flags).toEqual([DROP(PA), HEAD(FLAT)].sort());
  });
});

describe('M-480 propagation through the runner (R3-01, R3-02)', () => {
  it('F7 a missing candidate never counts as 0, and the headline row keeps its winner\'s flags', () => {
    const catalogue = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
    const cand = (id: string): Json => ({ id, building_type: 'detached_house', increment: '2', form: 'expr', unit: 'm2', envelope: false, expression: '0 m2', clauses: ['fixture'], rules: ['M-480'], example_ids: [], switch: 'formula:gfa_max_m2' });
    catalogue.rows = [...catalogue.rows, cand(FLAT), cand(PA), cand(PB), {
      id: 'gfa_headline_m2', building_type: 'detached_house', increment: '2', form: 'expr', unit: 'm2', envelope: false,
      expression: `best_of(${FLAT}; ${PA}; ${PB})`, clauses: ['fixture'], rules: ['M-480'], example_ids: [], switch: 'formula:gfa_max_m2',
    }];
    const seeds = {
      catalogue,
      switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
      buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
      logicVariables: readJson('scripts/seeds/logic_variables.json'),
      vocab: readJson('scripts/seeds/bylaw/vocab.json'),
      layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
    };
    const R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const out = R.runRow('gfa_headline_m2', {
      seeds,
      rows: {
        [FLAT]: { value: 120, flags: [INTERIM] },
        [PA]: { status: 'not_evaluated', reason: 'no_cited_rafter_span' },
        [PB]: { status: 'not_evaluated', reason: 'pitched_form_not_offered' },
      },
    });
    expect([out.status, out.value]).toEqual(['computed', 120]);
    expect(out.flags).toEqual([DROP(PB), HEAD(FLAT), INTERIM, LOWER(PA)].sort());
    const none = R.runRow('gfa_headline_m2', {
      seeds,
      rows: {
        [FLAT]: { status: 'not_evaluated', reason: 'missing_input:l2(fsi)' },
        [PA]: { status: 'not_evaluated', reason: 'no_cited_rafter_span' },
        [PB]: { status: 'not_evaluated', reason: 'no_cited_rafter_span' },
      },
    });
    expect([none.status, none.value, none.reason]).toEqual(['not_evaluated', null, 'missing_input:l2(fsi)']);
  });
});

describe('M-480 dated note (Q-K5 a): flag() takes the parameterised word headline_lower_bound: <reason>', () => {
  const SRC = 'flag(headline_lower_bound: main_wall_shares_not_resolved; flat_m2)';
  const U = { ...U0, names: { flat_m2: 'm2' } };

  it('K0 the reason is a closed declared word (flag_params, data)', () => {
    expect(CAT.flag_params.headline_lower_bound).toEqual(expect.arrayContaining(['main_wall_shares_not_resolved']));
    for (const [word, reasons] of Object.entries(CAT.flag_params) as [string, string[]][]) {
      expect([word, CAT.flag_words.includes(word)]).toEqual([word, false]); // only ever written with its reason
      expect(new Set(reasons).size).toBe(reasons.length);
    }
  });

  it('K1 it parses in Layer 3 only, with one canonical text; arity and placement are syntax errors', () => {
    expect(canon(SRC)).toBe('flag(headline_lower_bound:main_wall_shares_not_resolved;flat_m2)');
    expect(canon('flag( headline_lower_bound :main_wall_shares_not_resolved ; 0.0 m2 )')).toBe('flag(headline_lower_bound:main_wall_shares_not_resolved;0m2)');
    expect(codeOf(() => D.parseStatement('x = flag(headline_lower_bound: main_wall_shares_not_resolved; 0 m2) @(A)'))).toBe('unknown_function');
    for (const src of [
      'flag(headline_lower_bound: ; 0 m2)',
      'flag(headline_lower_bound: main_wall_shares_not_resolved)',
      'flag(headline_lower_bound: main_wall_shares_not_resolved: x; 0 m2)',
    ]) expect([src, codeOf(() => D.parseExpr(src, L3))]).toEqual([src, 'syntax']);
  });

  it('K2 static: the unit of its expression; an unknown reason word is refused; the word needs its reason and only it takes one', () => {
    expect(staticOf(SRC, U)).toEqual({ unit: 'm2', errs: [] });
    const reason = staticOf('flag(headline_lower_bound: not_a_declared_reason; flat_m2)', U);
    expect(reason.errs.some((x: string) => x.startsWith('unknown_reason') && x.includes('not_a_declared_reason'))).toBe(true);
    const bare = staticOf('flag(headline_lower_bound; flat_m2)', U);
    expect(bare.errs.some((x: string) => x.startsWith('unknown_flag') && x.includes('headline_lower_bound'))).toBe(true);
    const other = staticOf('flag(setback_storey_not_built: main_wall_shares_not_resolved; flat_m2)', U);
    expect(other.errs.some((x: string) => x.startsWith('unknown_flag') && x.includes('setback_storey_not_built'))).toBe(true);
    const errs = D.checkRowL3({ id: 'x_m2', form: 'expr', unit: 'm2', expression: 'flag(headline_lower_bound: no_such_reason; flat_m2)' }, U);
    expect(errs.some((x: string) => x.startsWith('unknown_reason'))).toBe(true);
  });

  it('K3 run time: exactly that one flag is raised, and the best_of winner carries it to the headline', () => {
    const v = runWith(SRC, { flat_m2: N(120) });
    expect([v.k, v.v, v.flags]).toEqual(['num', 120, [INTERIM]]);
    const e = runWith(SRC, { flat_m2: NE('no_cited_rafter_span') });
    expect([e.k, e.reason, e.flags]).toEqual(['ne', 'no_cited_rafter_span', [INTERIM]]);
    const head = runWith(`best_of(${FLAT}; ${PA})`, { [FLAT]: runWith(SRC, { flat_m2: N(300) }), [PA]: N(280) });
    expect([head.v, head.flags]).toEqual([300, [HEAD(FLAT), INTERIM].sort()]);
  });
});
