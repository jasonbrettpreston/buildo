// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-229 (4) (the 5 % and 20 m² of 10.5.40.40(2) are clause literals, keyed in
//            Layer 2, never code constants), M-239 (the CHAT-9 form of the 10.5.40.40(1) attic test), M-472 (the mechanical-attic rows;
//            the headline GFA is unchanged), M-75 (corrections)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-27L2/plan-reader-and-mech.md §2.2-§2.4 (MK-1..MK-3); operator "Q-M1 b+" and "Q-M2 a"
//            (~/Buildo-scratch/mcbylaws/inc2/open-questions.md, 2026-11-04)
//
// MB-27 mechanical keying (lane MK). 10.5.40.40(2): "that area is not included in the gross floor area of the building if it is not
// more than 5% of the permitted maximum gross floor area of the building to a maximum of 20 square metres". Q-M1 b+: the two literals
// are keyed now in Layer 1 as mechanical_attic_share_pct (pct) and mechanical_attic_area_max_m2 (m2), in the CHAT-9 / M-239 form, with
// NO Layer 2 storage (stored on the increment-3 night). This supersedes the 2026-10-08 Q8 adjudication "→ none".
//   MK-1  Layer 1: the two targets resolve to 5 pct and 20 m2 from 10.5.40.40(2)#whole on the 25 golden lots; every other target and
//         permitted() cell of the 25 is byte-identical to the unit as it was before the keying; the absence rulings still pass.
//   MK-2  Layer 3: keyed but not stored, the four mechanical rows answer not_evaluated:missing_input:absent_target where they read the
//         targets, and gfa_max_m2 is unchanged (M-472).
//   MK-3  the P3-0 extension (Q-M2 a, lane P): the two oracle corpus walks leave the two new targets out.
// RED FIRST: run against the base tree (no vocab entries, the unit still DEFINE gfa_m2 with no expression), MK-1 / MK-2 / MK-3 fail.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js / .mjs module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Json);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmp).map((y) => [y, x[y]])) : x));

const UNIT = '10.5.40.40(2)#whole';
const SHARE = 'mechanical_attic_share_pct';
const AREA = 'mechanical_attic_area_max_m2';
const NEW = [SHARE, AREA];
const SUPERSEDED_ADJ = 'ADJ-disagreement-10.5.40.40(2)#whole-numeric_expression';
const OLD_CALC = 'COR-10.5.40.40(2)#whole/calculation_handling';
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];

const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const ADJ: Json[] = read('scripts/seeds/bylaw/adjudications.json').adjudications;
const SEALED_A = (read('scripts/seeds/bylaw/authored/ch10_5/10.5.40.40.a.json').units as Json[]).find((u) => u.unit_id === UNIT) as Json;
const G25 = 'src/tests/fixtures/layer3/golden-25';
const ROWS = read(`${G25}/parcels-rows.json`) as unknown as Json[];
const CASES = readJsonl(`${G25}/inputs.jsonl`);
const CASE_OF = new Map(readJsonl(`${G25}/expected.jsonl`).map((e) => [e.parcel_id as number, e.case as string]));
const unitIn = (units: Json[]): Json => units.find((u) => u.unit_id === UNIT) as Json;

/** The unit as the base tree held it: the sealed A draft's three fields and the superseded calculation_handling record's value. */
const preKeying = (u: Json): Json => ({
  ...u,
  target: SEALED_A.target,
  numeric_expression: SEALED_A.numeric_expression,
  literals_not_expressed: SEALED_A.literals_not_expressed,
  calculation_handling: (ADJ.find((a) => a.id === OLD_CALC) as Json).value,
});

describe('MK-1 (a): vocab declares the two targets in the CHAT-9 / M-239 form', () => {
  it('mechanical_attic_share_pct is pct and mechanical_attic_area_max_m2 is m2; both aspect measurement, bound exact, citing 10.5.40.40(2) and M-229', () => {
    for (const [t, unit] of [[SHARE, 'pct'], [AREA, 'm2']]) {
      const v = VOCAB.dsl_target[t as string] as Json;
      expect([t, v?.unit, v?.aspect, v?.bound]).toEqual([t, unit, 'measurement', 'exact']);
      expect(String(v.concept)).toMatch(/10\.5\.40\.40\(2\)/);
      expect(String(v.concept)).toMatch(/M-229/);
      expect(Array.isArray(v.patterns) && v.patterns.length > 0, `${t} patterns`).toBe(true);
    }
  });
  it('no Layer 2 storage (Q-M1 b+): neither target is a layer2-scope.json target or a lineage-registry Layer 2 target', () => {
    expect(JSON.stringify(SCOPE)).not.toMatch(/mechanical_attic_/);
    expect(JSON.stringify(read('docs/reference/maxbld-field-lineage.json'))).not.toMatch(/mechanical_attic_(share_pct|area_max_m2)/);
  });
});

describe('MK-1 (b): the generated Layer 1 unit and its four corrections', () => {
  it('10.5.40.40(2)#whole carries the two targets, the 5 pct and 20 m2 expression, no unexpressed literal, and stays partially modelled', () => {
    const u = unitIn(INPUT.body.units as Json[]);
    expect(u.target).toEqual(NEW);
    expect(u.numeric_expression).toEqual([`${SHARE} = 5 pct @(2)`, `${AREA} = 20 m2 @(2)`]);
    expect(u.literals_not_expressed).toEqual([]);
    expect(u.calculation_handling.status).toBe('partially_modelled');
    // bylaw-answers-batch-5.logic.test.ts reads this gap (M-229)
    expect(u.calculation_handling.gaps).toMatch(/M-229 .*min\(5 % × permitted maximum GFA, 20 m²\)/);
  });
  it('four corrections: target, numeric_expression, literals_not_expressed (new) and calculation_handling (~s1, superseding the 2026-10-20 record)', () => {
    const mine = ADJ.filter((a) => a.kind === 'correction' && a.unit === UNIT && !['COR-' + UNIT + '/disclosure', OLD_CALC].includes(a.id));
    expect(mine.map((a) => a.id).sort(cmp)).toEqual([`${OLD_CALC}~s1`, `COR-${UNIT}/literals_not_expressed`, `COR-${UNIT}/numeric_expression`, `COR-${UNIT}/target`].sort(cmp));
    for (const a of mine) {
      expect([a.id, a.adjudicator]).toEqual([a.id, 'operator']);
      expect(String(a.rule)).toMatch(/M-229/);
      expect(String(a.rule)).toMatch(/Q-M1 b\+/);
    }
    expect((mine.find((a) => a.field === 'calculation_handling') as Json).supersedes).toBe(OLD_CALC);
  });
  it('the conflict note: the numeric_expression correction names the 2026-10-08 Q8 record it supersedes; that record stays as history', () => {
    const ne = ADJ.find((a) => a.id === `COR-${UNIT}/numeric_expression`) as Json;
    expect(String(ne.reason)).toContain(SUPERSEDED_ADJ);
    const old = ADJ.find((a) => a.id === SUPERSEDED_ADJ) as Json;
    expect([old.kind, old.decision, old.adjudicated_on, old.field]).toEqual(['disagreement', 'a', '2026-10-08', 'numeric_expression']);
    expect(String(old.reason)).toMatch(/Q8: 0\.05 not in the clause and B subtracts from gfa_m2 → none/);
  });
});

describe('MK-1 (c): on the 25 golden lots, through the generated Layer 1 input and the real evaluator', () => {
  let mz: Json; let E: Json; let env: Json; let plainEnv: Json; let ungated: Json[];
  beforeAll(async () => {
    mz = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
    E = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')).href)) as Json;
    const mk = (units: Json[]): Json => mz.makeEnv({ body: { ...INPUT.body, units }, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ZONES, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
    env = mk(INPUT.body.units as Json[]);
    plainEnv = mk((INPUT.body.units as Json[]).map((u) => (u.unit_id === UNIT ? preKeying(u) : u)));
    const out = mz.materializeBatch(ROWS, env);
    const gate = new Map((out.rows.lots as Json[]).map((l) => [l.parcel_id, l.lot_gate]));
    ungated = ROWS.filter((r) => gate.get(r.id) === null);
  });
  const evalAll = (e: Json, row: Json, cls: string, target: string): Json => {
    const lot = mz.classLotFor(row, 'principal', cls, e);
    return E.effective(lot, target, E.loadCandidates(lot, e.units).candidates, e.ctx) as Json;
  };

  it('every golden lot is ungated, and the R and RD lots are among them', () => {
    expect(ungated).toHaveLength(25);
    const zones = new Set(ungated.map((r) => r.zoning_class));
    expect(zones.has('R') && zones.has('RD')).toBe(true);
  });
  it('every class: the share is 5 and the cap 20, winner 10.5.40.40(2)#whole', () => {
    for (const row of ungated) for (const cls of SCOPE.classes as string[]) {
      for (const [t, v] of [[SHARE, 5], [AREA, 20]] as const) {
        const r = evalAll(env, row, cls, t);
        const winner = typeof r.winner === 'string' ? r.winner : r.winner?.unit_id;
        expect([CASE_OF.get(row.id), cls, t, r.status, r.value, winner]).toEqual([CASE_OF.get(row.id), cls, t, 'value', v, UNIT]);
      }
    }
  });
  it('every other target and every permitted() cell is byte-identical to the unit before the keying', () => {
    const targets = Object.keys(VOCAB.dsl_target).filter((t) => !NEW.includes(t)).sort(cmp);
    const moved: string[] = [];
    for (const row of ungated) for (const cls of SCOPE.classes as string[]) {
      for (const t of targets) if (stable(evalAll(env, row, cls, t)) !== stable(evalAll(plainEnv, row, cls, t))) moved.push(`${CASE_OF.get(row.id)} ${cls} ${t}`);
      const bt = VOCAB.scenario_class_units[cls].building_type;
      const p = (e: Json): string => { const lot = mz.classLotFor(row, 'principal', cls, e); return stable(E.permitted(lot, bt, E.loadCandidates(lot, e.units).candidates, e.ctx)); };
      if (p(env) !== p(plainEnv)) moved.push(`${CASE_OF.get(row.id)} ${cls} permitted()`);
    }
    expect(moved).toEqual([]);
  }, 240_000);
  it('the absence rulings are still executed equal to their rulings (checkAbsenceRulings passes on the keyed vocab)', () => {
    const rs = INPUT.body.absences as Json[];
    const page = (id: string): string => fs.readFileSync(path.join(ROOT, `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
    const res = E.checkAbsenceRulings({ rulings: rs, pages: Object.fromEntries(rs.map((r) => [r.checked_page, page(r.checked_page)])), vocab: VOCAB });
    expect({ pass: res.pass, violations: res.violations }).toEqual({ pass: true, violations: [] });
  });
});

// MK-2. The four rows are lane K's increment-2 catalogue rows (M-472, with the R1 design_option tags and the Q-MECH0 (a) form), copied
// here verbatim from that tree; they land after this commit (queue order: P3-0 -> P3 -> mechanical keying -> lane K rows). Until then the
// copy stands in, with a guard that each expression equals the catalogue's wherever the catalogue holds the row; once lane K lands, MK-2
// reads the rows from the catalogue by id (lane K's commit retires the copy). The geometry rows they read (attic_counted_*, gfa_pitched_*)
// are P3 / lane K rows, injected here as computed values; the Q-MECH0 (a) reason word is declared here as lane K's catalogue declares it.
const MECH_ROWS: Json[] = [
  {id: 'mechanical_attic_outside_gfa_a_m2', design_option: {roof_form: 'pitched'}, building_type: 'detached_house', increment: '2', form: 'expr', switch: 'formula:mechanical_attic_outside_gfa_a_m2', unit: 'm2', envelope: false, expression: 'if(attic_counted_a_m2 ≤ 0 m2; 0 m2; if(regulated(fsi); min(l2(mechanical_attic_share_pct) × 1 ratio × l2(fsi) × lot_area_m2; l2(mechanical_attic_area_max_m2); attic_counted_a_m2); refuse(no_permitted_gfa_base)))', clauses: ['10.5.40.40(2)'], rules: ['M-229', 'M-472', 'M-397', 'M-229', 'Q-MECH0 a'], example_ids: ['ATTIC-17', 'ATTIC-18', 'ATTIC-19', 'ATTIC-20', 'ATTIC-21', 'ATTIC-22', 'ATTIC-23', 'ROOF-10', 'ROOF-16'], input_flags: {'l2(mechanical_attic_area_max_m2)':['mechanical_attic_excluded']}},
  {id: 'total_floor_area_pitched_a_m2', design_option: {roof_form: 'pitched'}, building_type: 'detached_house', increment: '2', form: 'expr', switch: 'formula:total_floor_area_pitched_a_m2', unit: 'm2', envelope: false, expression: 'gfa_pitched_a_m2 + mechanical_attic_outside_gfa_a_m2', clauses: ['10.5.40.40(2)'], rules: ['M-472'], example_ids: ['ROOF-16']},
  {id: 'mechanical_attic_outside_gfa_b_m2', design_option: {roof_form: 'pitched'}, building_type: 'detached_house', increment: '2', form: 'expr', switch: 'formula:mechanical_attic_outside_gfa_b_m2', unit: 'm2', envelope: false, expression: 'if(attic_counted_b_m2 ≤ 0 m2; 0 m2; if(regulated(fsi); min(l2(mechanical_attic_share_pct) × 1 ratio × l2(fsi) × lot_area_m2; l2(mechanical_attic_area_max_m2); attic_counted_b_m2); refuse(no_permitted_gfa_base)))', clauses: ['10.5.40.40(2)'], rules: ['M-229', 'M-472', 'M-397', 'M-229', 'Q-MECH0 a'], example_ids: ['ATTIC-17', 'ATTIC-18', 'ATTIC-19', 'ATTIC-20', 'ATTIC-21', 'ATTIC-22', 'ATTIC-23', 'ROOF-10', 'ROOF-16'], input_flags: {'l2(mechanical_attic_area_max_m2)':['mechanical_attic_excluded']}},
  {id: 'total_floor_area_pitched_b_m2', design_option: {roof_form: 'pitched'}, building_type: 'detached_house', increment: '2', form: 'expr', switch: 'formula:total_floor_area_pitched_b_m2', unit: 'm2', envelope: false, expression: 'gfa_pitched_b_m2 + mechanical_attic_outside_gfa_b_m2', clauses: ['10.5.40.40(2)'], rules: ['M-472'], example_ids: ['ROOF-16']},
];
const MECH_REFUSE = 'no_permitted_gfa_base';
const GEOMETRY_ROWS = ['attic_counted_a_m2', 'attic_counted_b_m2', 'gfa_pitched_a_m2', 'gfa_pitched_b_m2'];
const INJECTED: Json = { attic_counted_a_m2: { value: 30 }, attic_counted_b_m2: { value: 12 }, gfa_pitched_a_m2: { value: 250 }, gfa_pitched_b_m2: { value: 240 } };

describe('MK-2: keyed but not stored, the four mechanical rows are pending and the headline is unchanged (M-472)', () => {
  let rows: Json; let baseSeeds: Json; let withSeeds: Json;
  beforeAll(() => {
    rows = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    baseSeeds = {
      catalogue: read('scripts/seeds/bylaw/layer3-catalogue.json'),
      switchboard: read('scripts/seeds/bylaw/switchboard.json'),
      buildingTypes: read('scripts/seeds/bylaw/building-types.json'),
      logicVariables: read('scripts/seeds/logic_variables.json'),
      vocab: VOCAB,
      layer2Classes: SCOPE.classes,
    };
    const have = new Set((baseSeeds.catalogue.rows as Json[]).map((r) => r.id));
    const stubs = GEOMETRY_ROWS.filter((id) => !have.has(id)).map((id) => ({ id, building_type: 'detached_house', increment: '2', form: 'expr', unit: 'm2', envelope: false, expression: '0 m2', clauses: [], rules: [] }));
    const refuse = [...new Set([...(baseSeeds.catalogue.refuse_reasons ?? []), MECH_REFUSE])];
    withSeeds = { ...baseSeeds, catalogue: { ...baseSeeds.catalogue, refuse_reasons: refuse, rows: [...(baseSeeds.catalogue.rows as Json[]).filter((r) => !MECH_ROWS.some((m) => m.id === r.id)), ...stubs, ...MECH_ROWS] } };
  });
  /** One golden-25 line -> the Layer 3 inputs, the Layer 2 cells as stored (the two new targets are not among them). */
  const inputsOf = (line: Json, seeds: Json, injected: Json = INJECTED): Json => {
    const l2: Json = {};
    for (const [t, c] of Object.entries(line.phase2 || {}) as [string, Json][]) {
      l2[t] = c.status === 'not_evaluated' ? { s: 'not_evaluated', kind: null, value: null, clause: null, reason: c.reason }
        : c.status === 'not_applicable' ? { s: 'not_applicable', clause: c.clause, reason: null }
          : { s: 'applies', kind: c.kind, value: c.value, clause: c.clause, reason: null };
    }
    const p = line.parcel || {};
    return { seeds, l2, perm: { code: line.permitted_word.code, gate: line.permitted_word.gate }, geometry: { lot_frontage_m: p.frontage, lot_depth_m: p.depth, lot_area_m2: p.area }, flags: { corner_lot: p.corner }, settings: {}, rows: injected, switches: { 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' }, buildingType: 'detached_house' };
  };
  const byId = (list: Json[]): Map<string, Json> => new Map(list.map((r) => [r.row, r]));
  const fsiNumber = (line: Json): boolean => line.phase2?.fsi?.status === 'applies' && line.phase2.fsi.kind === 'number';

  it('guard: each copied expression equals the catalogue\'s wherever the catalogue holds the row', () => {
    const real = baseSeeds.catalogue.rows as Json[];
    for (const r of MECH_ROWS) { const c = real.find((x: Json) => x.id === r.id); if (c) expect(c.expression, r.id).toBe(r.expression); }
  });
  it('the stored cells of the 25 hold neither target (no storage, Q-M1 b+)', () => {
    for (const line of CASES) for (const t of NEW) expect([line.case, t, Object.hasOwn(line.phase2 || {}, t)]).toEqual([line.case, t, false]);
  });
  it('a counted attic and an FSI cap: the four rows are not_evaluated:missing_input:absent_target (Q-M1 b+, "not yet stored")', () => {
    const capped = CASES.filter(fsiNumber);
    expect(capped.length).toBeGreaterThan(0);
    for (const line of capped) {
      const out = byId(rows.runAllRows(inputsOf(line, withSeeds)) as Json[]);
      for (const id of MECH_ROWS.map((r) => r.id)) expect([line.case, id, out.get(id)?.status, out.get(id)?.reason]).toEqual([line.case, id, 'not_evaluated', 'missing_input:absent_target']);
    }
  });
  it('a counted attic and no FSI cap: not_evaluated:no_permitted_gfa_base, never a number, and no mechanical target is read (M-472, ATTIC-23, Q-MECH0 a)', () => {
    const open = CASES.filter((l) => !fsiNumber(l));
    expect(open.length).toBeGreaterThan(0);
    for (const line of open) {
      const out = byId(rows.runAllRows(inputsOf(line, withSeeds)) as Json[]);
      for (const id of MECH_ROWS.map((r) => r.id)) {
        const r = out.get(id) as Json;
        expect([line.case, id, r.status, String(r.reason).includes(MECH_REFUSE), r.value]).toEqual([line.case, id, 'not_evaluated', true, null]);
      }
      for (const s of ['a', 'b']) expect(JSON.stringify(out.get(`mechanical_attic_outside_gfa_${s}_m2`)?.trace ?? [])).not.toMatch(/mechanical_attic_(share_pct|area_max_m2)/);
    }
  });
  it('no counted attic: the outside-GFA rows are 0 m2 on every lot and read no mechanical target (M-229 (3), ATTIC-22)', () => {
    const noAttic = { ...INJECTED, attic_counted_a_m2: { value: 0 }, attic_counted_b_m2: { value: 0 } };
    for (const line of CASES) {
      const out = byId(rows.runAllRows(inputsOf(line, withSeeds, noAttic)) as Json[]);
      for (const s of ['a', 'b']) {
        const r = out.get(`mechanical_attic_outside_gfa_${s}_m2`) as Json;
        expect([line.case, s, r.status, r.value]).toEqual([line.case, s, 'computed', 0]);
        expect(JSON.stringify(r.trace ?? [])).not.toMatch(/mechanical_attic_(share_pct|area_max_m2)/);
      }
    }
  });
  it('gfa_max_m2 is the same with and without the four rows in the catalogue (the headline is unchanged)', () => {
    for (const line of CASES) {
      const a = byId(rows.runAllRows(inputsOf(line, baseSeeds)) as Json[]).get('gfa_max_m2') as Json;
      const b = byId(rows.runAllRows(inputsOf(line, withSeeds)) as Json[]).get('gfa_max_m2') as Json;
      expect([line.case, stable(b)]).toEqual([line.case, stable(a)]);
    }
  });
});

describe('MK-3 (the P3-0 extension, Q-M2 a; lane P owns those two files): both oracle corpus walks leave the two new targets out', () => {
  const src = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  it('bylaw-eval-perf SINCE_PIN holds both names', () => {
    const m = /const SINCE_PIN = new Set\(\[([^\]]*)\]\)/.exec(src('src/tests/bylaw-eval-perf.logic.test.ts'));
    expect(m, 'SINCE_PIN declaration').not.toBeNull();
    for (const t of NEW) expect([t, String((m as RegExpExecArray)[1]).includes(`'${t}'`)]).toEqual([t, true]);
  });
  it('the bylaw-permission-disclosure corpus filter holds both names', () => {
    const m = /Object\.keys\(PVOCAB\.dsl_target\)\.filter\(\(k\) => !\[([^\]]*)\]\.includes\(k\)\)/.exec(src('src/tests/bylaw-permission-disclosure.logic.test.ts'));
    expect(m, 'corpus filter declaration').not.toBeNull();
    for (const t of NEW) expect([t, String((m as RegExpExecArray)[1]).includes(`'${t}'`)]).toEqual([t, true]);
  });
});
