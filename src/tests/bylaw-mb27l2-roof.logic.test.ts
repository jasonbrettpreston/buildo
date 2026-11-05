// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-465 (the roof form, M-400's first design option: (1) the option, (2) share
//            the cell, (3) the pitched step-back, (4) the threshold, (6) the class), M-400, M-183; ROOF-5 (operator "roof 5- confirmed")
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (option and threshold slots), §7 I13
//
// Test A of the MB-27.L2 roof axis (plan-roof-axis v2 §7 R1-R10, v4 R11, v6 R12; v7 §2), through the real evaluator, the generated Layer 1
// input (docs/reference/bylaw-layer2-input.json) and the Layer 2 pure core, on the 25 golden lots (src/tests/fixtures/layer3/golden-25).
// R4's 1:4 cases (one lot each in exceptions 69 and 893, synthetic: no lot of the 25 is in those exceptions) read the 1:4 re-key (D-RK a,
// M-484..M-486) and the 0.25 threshold units it generates (operator "pushing RP-7xa").
// RED FIRST: run against the base tree (no design option, no option slots), every case fails.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js / .mjs module surface
const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Json);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const req = (rel: string): Json => require(path.join(ROOT, rel)) as Json;
const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const G25 = 'src/tests/fixtures/layer3/golden-25';
const ROWS = read(`${G25}/parcels-rows.json`) as unknown as Json[];
const CASE = new Map(readJsonl(`${G25}/expected.jsonl`).map((e) => [e.parcel_id as number, e.case as string]));
const RF = VOCAB.design_options?.roof_form as Json;
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const T = { h: 'height_m', mw: 'main_wall_height_m', us: 'upper_storey_setback_m', thr: 'pitched_roof_slope_min' };

let mz: Json; let lr: Json; let E: Json; let env: Json; let out: Json; let dicts: Json;
const opt = (lot: Json): Json[] => lr.decodeOptionResults({ lot, pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs }) as Json[];
const base = (lot: Json): Json[] => lr.decodeLotResults({ lot, pairs: env.pairs, classes: env.classes, map: MAP, dicts, optionPairs: env.optionPairs }) as Json[];
const one = (rows: Json[], target: string, option: string | null): Json => {
  const r = rows.filter((x) => x.target === target && x.option === option && x.class === 'detached_house');
  expect(r, `${target} ${option}`).toHaveLength(1);
  return r[0] as Json;
};
const lotOf = (name: string): Json => {
  const id = [...CASE.entries()].find(([, c]) => c.startsWith(name))![0];
  return out.rows.lots.find((l: Json) => l.parcel_id === id) as Json;
};
const zoneOf = (lot: Json): string => (ROWS.find((r) => r.id === lot.parcel_id) as Json).zoning_class as string;
const exOf = (lot: Json): number | null => (ROWS.find((r) => r.id === lot.parcel_id) as Json).exception_number as number | null;
const mkEnv = (scope: Json = SCOPE): Json => mz.makeEnv({ body: INPUT.body, map: MAP, scope, vocab: VOCAB, zoneList: ZONES, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });

beforeAll(async () => {
  mz = req('scripts/lib/bylaw-materialize.js'); lr = req('scripts/lib/bylaw-lot-row.js');
  E = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')).href);
  env = mkEnv();
  out = mz.materializeBatch(ROWS, env);
  dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
});

describe('R1 / R8: the option and its threshold are data (vocab.design_options, layer2-scope.json options)', () => {
  it('R1: the option targets are the targets of every Layer 1 unit carrying the token, and equal scope options.roof_form.targets', () => {
    const tokenUnits = (INPUT.body.units as Json[]).filter((u) => Array.isArray(u.condition?.tokens) && u.condition.tokens.includes(RF.token));
    expect(tokenUnits.length).toBeGreaterThan(0);
    expect([...new Set(tokenUnits.map((u) => u.target as string))].sort()).toEqual([...SCOPE.options.roof_form.targets.principal].sort());
    expect(SCOPE.options.roof_form.threshold.principal).toBe(RF.threshold_target);
    expect(VOCAB.dsl_target[RF.threshold_target]).toMatchObject({ unit: 'ratio', bound: 'min' });
  });
  it('R8: every token unit matches exactly one threshold pattern in its own wording, except the listed flat-roof clauses (which match none)', async () => {
    const A = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href) as Json;
    const tokenUnits = (INPUT.body.units as Json[]).filter((u) => Array.isArray(u.condition?.tokens) && u.condition.tokens.includes(RF.token));
    for (const u of tokenUnits) {
      const n = (A.thresholdMatches(u, RF) as Json[]).length;
      expect([u.unit_id, n], u.unit_id).toEqual([u.unit_id, (RF.no_threshold_units as string[]).includes(u.unit_id) ? 0 : 1]);
    }
    expect(RF.thresholds.map((t: Json) => t.value)).toEqual([0.1, 0.25]);
  });
  it('R8: a token unit whose wording matches no pattern (and is not listed) or two patterns stops the assembly (red both ways)', async () => {
    const A = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href) as Json;
    const u = (INPUT.body.units as Json[]).find((x) => x.unit_id === '10.20.40.10(4)#(4)(A)') as Json;
    const none = { ...u, application: { ...u.application, evidence: { ...u.application.evidence, [RF.token]: 'a flat roof' } } };
    expect(() => A.thresholdUnits([none], VOCAB)).toThrow(/matches 0/);
    const two = { ...u, application: { ...u.application, evidence: { ...u.application.evidence, [RF.token]: `${RF.thresholds[0].pattern}; ${RF.thresholds[1].pattern}` } } };
    expect(() => A.thresholdUnits([two], VOCAB)).toThrow(/matches 2/);
  });
  it('a generated threshold unit id that an existing unit already carries stops the assembly (never two units with one id): OUTPUT panel S1-05', async () => {
    const A = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href) as Json;
    const u = (INPUT.body.units as Json[]).find((x) => x.unit_id === '10.20.40.10(4)#(4)(A)') as Json;
    const clash = { ...u, unit_id: '10.20.40.10(4)#threshold(4)', condition: 'none' };
    expect(() => A.thresholdUnits([u, clash], VOCAB)).toThrow(/already/);
  });
  it('the generated threshold units: one per token regulation (the flat-roof clauses generate none), bound min, no roof condition', () => {
    const g = (INPUT.body.units as Json[]).filter((u) => u.target === RF.threshold_target);
    expect(g.map((u) => u.unit_id)).toEqual(['10.10.40.10(11)#threshold(11)', '10.10.40.10(12)#threshold(12)', '10.20.40.10(4)#threshold(4)', '10.40.40.10(6)#threshold(6)', '10.80.40.10(6)#threshold(6)', '900.3.10(69)#threshold(69)', '900.3.10(70)#threshold(70)', '900.3.10(893)#threshold(893)', '900.3.10(971)#threshold(971)', '900.3.10(975)#threshold(975)']);
    for (const u of g) expect([u.bound, u.condition, u.numeric_expression[0]]).toEqual(['min', 'none', `${RF.threshold_target} = ${u.layer === 'exception' ? 0.25 : 0.1} ratio @${u.unit_id.split('#threshold')[1]}`]);
  });
});

describe('R2 / R3 / R9: on the 25, every option row is decided and agrees with the row without an option where the worlds agree', () => {
  it('R2: no option row carries condition_unknown:flat_or_shallow_roof (or needs_user_input on it)', () => {
    for (const lot of out.rows.lots) for (const r of opt(lot)) expect([CASE.get(lot.parcel_id), r.target, r.option, r.reason]).not.toContainEqual(`condition_unknown:${RF.token}`);
    for (const lot of out.rows.lots) for (const r of opt(lot)) expect(String(r.reason)).not.toMatch(new RegExp(`(condition_unknown|needs_user_input):${RF.token}`));
  });
  it('R3: a decided base row means both option rows are shared and read it; a roof-NE base row means two full rows', () => {
    for (const lot of out.rows.lots) {
      const b = base(lot).filter((x) => x.class === 'detached_house' && x.structure === 'principal');
      for (const t of [T.h, T.mw, T.us]) {
        const br = b.find((x) => x.target === t) as Json;
        const flat = one(opt(lot), t, 'flat_or_shallow_roof'); const pit = one(opt(lot), t, 'pitched');
        const roofNE = br.status === 'not_evaluated' && br.reason === `condition_unknown:${RF.token}`;
        const sameAs = (r: Json): boolean => ['status', 'reason', 'value', 'winner_unit_id'].every((k) => r[k] === br[k]);
        if (roofNE) expect([t, flat.shared_with_base, pit.shared_with_base]).toEqual([t, false, false]);
        if (flat.shared_with_base) expect(sameAs(flat), `${CASE.get(lot.parcel_id)} ${t} flat`).toBe(true);
        if (pit.shared_with_base) expect(sameAs(pit), `${CASE.get(lot.parcel_id)} ${t} pitched`).toBe(true);
      }
    }
  });
  it('R9: the threshold is decided on every ungated lot (a number, unregulated or not_applicable; never not_evaluated, R3-01)', () => {
    for (const lot of out.rows.lots.filter((l: Json) => l.lot_gate === null)) {
      const thr = one(opt(lot), T.thr, null);
      expect([CASE.get(lot.parcel_id), thr.status === 'not_evaluated']).toEqual([CASE.get(lot.parcel_id), false]);
    }
  });
});

describe('R4: the answer key on the 25 (McProof; plan v2 §7 R4)', () => {
  it('upper storey set-back: flat 1.4 m by the zone flat-roof clause, pitched not_applicable:<that clause>', () => {
    for (const lot of out.rows.lots) {
      const flat = one(opt(lot), T.us, 'flat_or_shallow_roof'); const pit = one(opt(lot), T.us, 'pitched');
      expect([CASE.get(lot.parcel_id), flat.value, pit.status, pit.reason]).toEqual([CASE.get(lot.parcel_id), 1.4, 'not_applicable', flat.winner_unit_id]);
    }
  });
  it('main wall on the RD lots whose base row is roof-NE: flat 7.2 [10.20.40.10(4)(A)], pitched 7.0 [10.20.40.10(2)(A)]', () => {
    const rd = out.rows.lots.filter((l: Json) => zoneOf(l) === 'RD' && base(l).some((x) => x.class === 'detached_house' && x.target === T.mw && x.reason === `condition_unknown:${RF.token}`));
    expect(rd).toHaveLength(7);
    for (const lot of rd) {
      expect([one(opt(lot), T.mw, 'flat_or_shallow_roof').value, one(opt(lot), T.mw, 'flat_or_shallow_roof').winner_unit_id]).toEqual([7.2, '10.20.40.10(4)#(4)(A)']);
      expect([one(opt(lot), T.mw, 'pitched').value, one(opt(lot), T.mw, 'pitched').winner_unit_id]).toEqual([7, '10.20.40.10(2)#(2)(A)']);
    }
  });
  it('A0166 (RD, exception 21): height flat 6.5 [900.3.10(21)[SSP](A)], pitched the zone height', () => {
    const lot = lotOf('A0166');
    expect(exOf(lot)).toBe(21);
    const flat = one(opt(lot), T.h, 'flat_or_shallow_roof'); const pit = one(opt(lot), T.h, 'pitched');
    expect([flat.value, flat.winner_unit_id]).toEqual([6.5, '900.3.10(21)#(21)[SSP](A)']);
    expect(pit.winner_unit_id).toMatch(/^10\.20\.40\.10\(1\)/);
  });
  it('the threshold is 0.1 on the 25, its winner the zone flat-or-shallow clause', () => {
    const zoneClause: Record<string, RegExp> = { R: /^10\.10\.40\.10\(1[12]\)#/, RD: /^10\.20\.40\.10\(4\)#threshold\(4\)$/, RS: /^10\.40\.40\.10\(6\)#/, RM: /^10\.80\.40\.10\(6\)#/ };
    for (const lot of out.rows.lots) {
      const thr = one(opt(lot), T.thr, null);
      expect([CASE.get(lot.parcel_id), thr.value]).toEqual([CASE.get(lot.parcel_id), 0.1]);
      expect(thr.winner_unit_id, CASE.get(lot.parcel_id)).toMatch(zoneClause[zoneOf(lot)] as RegExp);
    }
  });
});

describe('R4: the 1:4 lots (exceptions 69 and 893; v7 section 2, reading (ii) (a))', () => {
  const lot = (ex: number, flags: Json): Json => ({ zone: 'RD', zone_label: 'RD', label: { f: 12, a: 370 }, overlays: { HT: 10, ST: 3 }, vars: { lot_frontage_m: 12, lot_depth_m: 35, lot_area_m2: 420, dwelling_units: 1, house_units: 1, ancillary_units: 0, height_storeys: 3 }, flags: { lawfully_existing: false, ...flags }, exception: `900.3.10(${ex})`, building_type: 'detached_house' });
  const eff = (ex: number, flags: Json, t: string): Json => { const l = lot(ex, flags); return E.effective(l, t, E.loadCandidates(l, INPUT.body.units).candidates, env.ctx) as Json; };
  const winner = (r: Json): string | null => (r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null);
  for (const [ex, flat, clause] of [[69, 9.5, '900.3.10(69)#(69)[SSP](C)'], [893, 11, '900.3.10(893)#(893)[SSP](F)']] as Array<[number, number, string]>) {
    it(`exception ${ex}: flat ${flat} m by its clause, pitched the zone height, threshold 0.25 by the exception's own clause`, () => {
      const f = eff(ex, { [RF.token]: true }, T.h); const p = eff(ex, { [RF.token]: false }, T.h); const thr = eff(ex, {}, T.thr);
      expect([f.value, winner(f)]).toEqual([flat, clause]);
      expect(winner(p)).toMatch(/^10\.20\.40\.10\(1\)/);
      expect([thr.value, winner(thr)]).toEqual([0.25, `900.3.10(${ex})#threshold(${ex})`]);
    });
  }
});

describe('R5 / R6 / R7: nothing else moves; RT; I13', () => {
  it('R5: the 54 base slots are byte-identical to a run of the same tree with no option declared (the option never moves a base row)', () => {
    const { options: _o, ...noOpt } = SCOPE; // eslint-disable-line @typescript-eslint/no-unused-vars
    const plain = mz.materializeBatch(ROWS, mkEnv(noOpt));
    const n = env.pairs.length;
    plain.rows.lots.forEach((p: Json, i: number) => {
      const l = out.rows.lots[i];
      for (const k of ['codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids']) expect(l[k] === null ? null : l[k].slice(0, n), `${p.parcel_id} ${k}`).toEqual(p[k]);
      expect(l.class_results, `${p.parcel_id} class_results`).toEqual(p.class_results);
      expect(l.permitted).toEqual(p.permitted);
    });
  });
  it('R6: on an RT lot the options are shared and the threshold is unregulated by its absence ruling', () => {
    const rt = { ...(ROWS[0] as Json), id: 999001, parcel_id: '999001', zoning_class: 'RT', zoning_zn_string: 'RT (f10.0; a245)', exception_number: null };
    const o = mz.materializeBatch([rt], env);
    const d = lr.makeDecodeDicts({ units: o.rows.units, texts: o.rows.texts });
    const rows = lr.decodeOptionResults({ lot: o.rows.lots[0], pairs: env.pairs, classes: env.classes, map: MAP, dicts: d, optionPairs: env.optionPairs }) as Json[];
    for (const r of rows.filter((x) => x.option !== null)) expect([r.target, r.option, r.shared_with_base]).toEqual([r.target, r.option, true]);
    const thr = rows.find((x) => x.option === null) as Json;
    expect([thr.status, thr.value_kind, thr.evidence_kind]).toEqual(['applies', 'unregulated', 'absence']);
  });
  it('R7 (I13): roof_type is not a legal user input; an option row undecided on its own token is counted in scenario_axis_results (0 on the 25)', () => {
    expect(mz.LEGAL_USER_INPUT).not.toContain('roof_type');
    expect(out.matched.scenario_axis_results).toBe(0);
  });
});

describe('R10: the pitched step-back (M-465 (3), a dated note on M-183)', () => {
  const lotFor = (zone: string, flags: Json): Json => ({ zone, zone_label: zone, label: {}, overlays: {}, vars: { lot_frontage_m: 10, lot_depth_m: 35, lot_area_m2: 350, dwelling_units: 1, house_units: 1, ancillary_units: 0 }, flags: { lawfully_existing: false, ...flags }, exception: null, building_type: 'detached_house' });
  const eff = (zone: string, flags: Json, target: string): Json => { const lot = lotFor(zone, flags); return E.effective(lot, target, E.loadCandidates(lot, INPUT.body.units).candidates, env.ctx) as Json; };
  it('the token false: every value unit is out only because of it, so the target does not apply (not_applicable:<the first such unit>)', () => {
    for (const [zone, unit] of [['R', '10.10.40.10(11)#(11)(A)'], ['RD', '10.20.40.10(4)#(4)(B)'], ['RS', '10.40.40.10(6)#(6)(A)'], ['RM', '10.80.40.10(6)#(6)(A)']]) {
      const r = eff(zone as string, { [RF.token]: false }, T.us);
      expect([zone, r.status, r.reason]).toEqual([zone, 'not_applicable', `not_applicable:${unit}`]);
    }
  });
  it('the token absent (undecided): the row without an option is unchanged (never false, M-60)', () => {
    expect(eff('RD', {}, T.us)).toMatchObject({ status: 'not_evaluated', reason: `condition_unknown:${RF.token}` });
  });
  it('a unit out for another reason keeps today\'s rules: RT has no step-back unit (no_candidate), an RM houseplex is outside 10.80.40.10(6)\'s subject', () => {
    expect(eff('RT', { [RF.token]: false }, T.us)).toMatchObject({ status: 'not_evaluated', reason: 'no_candidate' });
    const lot = { ...lotFor('RM', { [RF.token]: false }), building_type: 'detached_houseplex' };
    expect(E.effective(lot, T.us, E.loadCandidates(lot, INPUT.body.units).candidates, env.ctx)).toMatchObject({ status: 'not_evaluated', reason: 'no_candidate' });
  });
  it('the "only because" re-check keeps its reads in the result\'s inputs (hardened inputs[]; the cell cache keys on them): OUTPUT panel S1-01', () => {
    const u = (INPUT.body.units as Json[]).find((x) => x.unit_id === '10.20.40.10(4)#(4)(B)') as Json;
    const two = { ...u, condition: { tokens: [RF.token, 'corner_lot'] } };
    const units = (INPUT.body.units as Json[]).map((x) => (x.unit_id === u.unit_id ? two : x));
    for (const corner of [false, true]) {
      const lot = lotFor('RD', { [RF.token]: false, corner_lot: corner });
      const r = E.effective(lot, T.us, E.loadCandidates(lot, units).candidates, env.ctx) as Json;
      expect([corner, r.inputs]).toEqual([corner, expect.arrayContaining(['flags.corner_lot'])]);
      expect([corner, r.status]).toEqual([corner, corner ? 'not_applicable' : 'not_evaluated']);
    }
  });
  it('a token outside design_options known false (major_street) is unaffected: the rule reads design-option tokens only', () => {
    expect(env.ctx.designOptionTokens).toEqual(new Set([RF.token]));
    expect([...env.ctx.designOptionTokens]).not.toContain('major_street');
  });
});

describe('R11 / R12: the class and ROOF-5', () => {
  it('R11: another class decodes no option row (R3-11: never a neighbouring class\'s option)', () => {
    for (const lot of out.rows.lots) expect(new Set(opt(lot).map((r) => r.class))).toEqual(new Set(['detached_house']));
    for (const lot of out.rows.lots) if (lot.class_results) for (const ov of Object.values(lot.class_results as Json)) for (const k of Object.keys(ov as Json)) expect(Number(k)).toBeLessThan(env.pairs.length);
  });
  it('R12: on A0166 the flat main-wall row (7.2 m) above the flat height (6.5 m) carries main_wall_limit_above_height; no other row of the 25 does', () => {
    for (const lot of out.rows.lots) {
      const row = ROWS.find((r) => r.id === lot.parcel_id) as Json;
      const v = mz.logicalRowsOf(row, lot, dicts, env) as Json;
      for (const r of v.option_rows as Json[]) {
        const has = (r.disclosures || []).includes('main_wall_limit_above_height');
        const want = CASE.get(lot.parcel_id)!.startsWith('A0166') && r.target === T.mw && r.option === 'flat_or_shallow_roof';
        expect([CASE.get(lot.parcel_id), r.target, r.option, has]).toEqual([CASE.get(lot.parcel_id), r.target, r.option, want]);
      }
    }
  });
});
