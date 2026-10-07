// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence; rule 4 provincial restraint, rule 7a
//            absence, undecided conditions, determinism), §6.1 (provincial units: scope, limits_bylaw), §7.6 (the
//            evaluator, trace); docs/specs/01-pipeline/69_mcbylaw_policy.md M-50, M-54 (+ note), M-55 (+ note), M-60
//
// McBylaw evaluator HARDENING (red-team .cursor/mcbylaw/phase2-check/REDTEAM.md A11–A13, A15, A16, A18, A25; oracle B
// classes C2/C3/C4). Each describe block reproduces one attack as a red test and pins the RULE that closes it:
//   1. absence (rule 7a) only when the lot's exception and its INCLUDE closure are authored for the target;
//      otherwise not_evaluated:exception_not_authored; a pending unit for the target blocks absence
//   2. provincial units (external.json) restrain a more restrictive by-law unit only, inside their scope; never
//      additional; loading them never switches absence off
//   3. results are independent of candidate order (and of the vocab's building-type order)
//   4. the result records every lot input read (conditions included), so a cell key can be derived from it
//   5. threshold lot-condition tokens are validated (declared reads, used by the unit's condition)
//   6. an undecided condition whose every resolution gives the same result returns that result (M-50 generalised)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const D = await load('scripts/analysis/bylaw/dsl.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const EXT = read('scripts/seeds/bylaw/external.json');
const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
const VECTORS: Json[] = read('scripts/seeds/bylaw/eval-vectors.json').vectors;
const EV = VO.evaluatorVocab ? VO.evaluatorVocab(PVOCAB) : {};
const ctx = (extra: Json = {}): Json => (E.makeContext ? E.makeContext(EV, { absences: ABS.rulings, ...extra }) : {});
const C = ctx();
const show = (r: Json): unknown => (r.status === 'value' ? r.value : `${r.status}:${r.reason}`);
const eff = (lot: Json, target: string, units: Json[], c: Json = C): Json => E.effective(lot, target, E.loadCandidates(lot, units).candidates, c);
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const rdLot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false, through_lot: false }, building_type: 'detached_house', exception: null };
const rLot: Json = { ...rdLot, zone: 'R', label: { f: 12, d: 0.6 } };

// ------------------------------------------------------------------ 1. absence (rule 7a)
describe('1. absence (Spec 68 §7.5 rule 7a): exception authored, INCLUDE closure, pending units', () => {
  const pendExc = U({ unit_id: 'EXP#SSP(A)', regulation_id: 'EXP', layer: 'exception', exception: 'EXP', target: 'lot_coverage_pct', numeric_expression: null, row_status: 'pending' });
  const partial = U({ unit_id: 'EXQ#SSP(A)', regulation_id: 'EXQ', layer: 'exception', exception: 'EXQ', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 7.5 m @SSP(A)'] });
  const inc = U({ unit_id: 'EXA#SSP(C)', regulation_id: 'EXA', layer: 'exception', exception: 'EXA', archetype: 'INCLUDE', include_ref: 'EXB', target: 'none', bound: 'none', numeric_expression: 'none' });
  it('exception_not_authored is a closed not_evaluated code', () => {
    expect(E.NOT_EVALUATED_CODES).toContain('exception_not_authored');
  });
  it('the R lot with no exception stays unregulated by absence (ABS-1)', () => {
    const r = eff(rLot, 'lot_coverage_pct', UNITS);
    expect([r.status, r.value, r.evidence && r.evidence.kind]).toEqual(['value', 'unregulated', 'absence']);
  });
  it('A13(a): the lot exception has a PENDING coverage unit → not_evaluated:exception_not_authored, never unregulated', () => {
    expect(show(eff({ ...rLot, exception: 'EXP' }, 'lot_coverage_pct', [...UNITS, pendExc]))).toBe('not_evaluated:exception_not_authored:EXP');
  });
  it('A13(a, base): a PENDING base unit for the target blocks absence (a unit for the target exists, keyed or not)', () => {
    const pendBase = U({ unit_id: '10.10.30.45(1)#whole', regulation_id: '10.10.30.45(1)', target: 'lot_coverage_pct', numeric_expression: null, row_status: 'pending' });
    expect(show(eff(rLot, 'lot_coverage_pct', [...UNITS, pendBase]))).toBe('not_evaluated:no_candidate');
  });
  it('A13(b): a PARTIALLY keyed exception (one unit on another target, no authored record) → exception_not_authored', () => {
    expect(show(eff({ ...rLot, exception: 'EXQ' }, 'lot_coverage_pct', [...UNITS, partial]))).toBe('not_evaluated:exception_not_authored:EXQ');
  });
  it('A13(c): an exception that INCLUDEs an unauthored one → exception_not_authored names the included exception', () => {
    const c = ctx({ authored: { EXA: 'authored' } });
    expect(show(eff({ ...rLot, exception: 'EXA' }, 'lot_coverage_pct', [...UNITS, inc], c))).toBe('not_evaluated:exception_not_authored:EXB');
  });
  it('A14: an exception with no unit at all → exception_not_authored (was no_candidate)', () => {
    expect(show(eff({ ...rLot, exception: '900.2.10(777)' }, 'lot_coverage_pct', UNITS))).toBe('not_evaluated:exception_not_authored:900.2.10(777)');
  });
  it('good twin: an AUTHORED exception (whole, or partial with the target listed) whose units are all keyed → unregulated by absence', () => {
    for (const a of ['authored', { status: 'authored' }, { status: 'partial', targets: ['lot_coverage_pct'] }]) {
      const r = eff({ ...rLot, exception: 'EXQ' }, 'lot_coverage_pct', [...UNITS, partial], ctx({ authored: { EXQ: a } }));
      expect([r.value, r.evidence && r.evidence.kind]).toEqual(['unregulated', 'absence']);
    }
  });
  it('partial authorship that does not list the target, or an authored exception holding a pending unit → exception_not_authored', () => {
    expect(show(eff({ ...rLot, exception: 'EXQ' }, 'lot_coverage_pct', [...UNITS, partial], ctx({ authored: { EXQ: { status: 'partial', targets: ['front_setback_m'] } } })))).toBe('not_evaluated:exception_not_authored:EXQ');
    const pend2 = U({ unit_id: 'EXQ#SSP(B)', regulation_id: 'EXQ', layer: 'exception', exception: 'EXQ', target: 'rear_setback_m', bound: 'min', numeric_expression: null, row_status: 'pending' });
    expect(show(eff({ ...rLot, exception: 'EXQ' }, 'lot_coverage_pct', [...UNITS, partial, pend2], ctx({ authored: { EXQ: 'authored' } })))).toBe('not_evaluated:exception_not_authored:EXQ');
  });
});

describe('1. absence rulings are verified structurally and case-insensitively against the pinned page; every entry executed', () => {
  const page = (id: string): string => fs.readFileSync(path.join(ROOT, `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
  const pages = (rs: Json[]): Json => Object.fromEntries(rs.map((r) => [r.checked_page, fs.existsSync(path.join(ROOT, `scripts/seeds/bylaw/pages/${r.checked_page}.txt`)) ? page(r.checked_page) : null]));
  it('every ruling in absence-rulings.json is executed and passes (executed === rulings.length)', () => {
    const r = E.checkAbsenceRulings({ rulings: ABS.rulings, pages: pages(ABS.rulings), vocab: PVOCAB });
    expect({ pass: r.pass, violations: r.violations, executed: r.executed }).toEqual({ pass: true, violations: [], executed: ABS.rulings.length });
  });
  it.each([
    ['lower case', 'The maximum lot coverage for a principal building is 33 percent of the lot area.'],
    ['title case', '10.10.30.41 Maximum Lot Coverage (1) In the R zone the Maximum Lot Coverage is 33 percent.'],
    ['upper case', 'MAXIMUM LOT COVERAGE 33 PERCENT'],
    ['other wording', 'buildings may cover no more than 33 percent of the lot (lot coverage).'],
  ])('A12: a new principal coverage clause on the page (%s) reds ABS-1', (_k, clause) => {
    const r1 = ABS.rulings.find((x: Json) => x.id === 'ABS-1');
    const text = page(r1.checked_page).replace('10.10.30.10 Lot Area', `${clause} 10.10.30.10 Lot Area`);
    expect(text).not.toBe(page(r1.checked_page));
    expect(E.verifyAbsence(r1, text, PVOCAB).pass).toBe(false);
  });
  it('A11: an added ruling nobody can verify (ABS-2, RD height) fails the executed check', () => {
    const bad = { ...ABS.rulings[0], id: 'ABS-2', zone: 'RD', target: 'height_m', checked_page: 'ch10_20', absent_phrases: ['10.20.40.10'], present_phrases: [], accounted_occurrences: [] };
    const rs = [...ABS.rulings, bad];
    const r = E.checkAbsenceRulings({ rulings: rs, pages: pages(rs), vocab: PVOCAB });
    expect(r.pass).toBe(false);
    expect(r.executed).toBe(rs.length);
    expect(r.violations.join(' ')).toMatch(/ABS-2/);
  });
  it('a ruling without the structural fields, or with a duplicate id, is malformed', () => {
    const { accounted_occurrences: _drop, ...noAcc } = ABS.rulings[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(E.checkAbsenceRulings({ rulings: [noAcc], pages: pages([noAcc]), vocab: PVOCAB }).pass).toBe(false);
    const dup = [ABS.rulings[0], ABS.rulings[0]];
    expect(E.checkAbsenceRulings({ rulings: dup, pages: pages(dup), vocab: PVOCAB }).violations.join(' ')).toMatch(/duplicate/);
  });
  it('an absent phrase is matched case-insensitively ("10.10.30.40" in any case/spacing reds)', () => {
    const r1 = ABS.rulings.find((x: Json) => x.id === 'ABS-1');
    expect(E.verifyAbsence(r1, `${page(r1.checked_page)} 10.10.30.40`, PVOCAB).pass).toBe(false);
  });
});

// ------------------------------------------------------------------ 2. provincial units
describe('2. provincial units (Spec 68 §6.1, §7.5 rule 4; Spec 69 M-55 + note): scope, limits_bylaw, never additional', () => {
  const P = E.provincialUnits ? E.provincialUnits(EXT, PVOCAB) : { units: [], violations: ['no export'] };
  const inScope: Json = { flags: { parcel_of_urban_residential_land: true }, vars: { house_units: 2, ancillary_units: 1 } };
  const lot = (base: Json, extra: Json = inScope): Json => ({ ...base, flags: { ...base.flags, ...extra.flags }, vars: { ...base.vars, ...extra.vars } });
  const cov = (v: string, o: Json = {}): Json => U({ unit_id: `BY#cov${v}`, regulation_id: '10.20.30.40(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'lot_coverage_pct', numeric_expression: [`lot_coverage_pct = ${v} @x`], ...o });
  const sep = (v: string): Json => U({ unit_id: `BY#sep${v}`, regulation_id: '10.20.40.80(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'separation_m', bound: 'min', numeric_expression: [`separation_m = ${v} m @x`] });
  const fsi = (v: string): Json => U({ unit_id: `BY#fsi${v}`, regulation_id: '10.20.40.40(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'fsi', numeric_expression: [`fsi = ${v} @x`] });
  it('external.json converts to three provincial units with scope inputs resolved through vocab (rowhouse mapped explicitly)', () => {
    expect(P.violations).toEqual([]);
    expect(P.units.map((u: Json) => u.unit_id).sort()).toEqual(['O.Reg.299/19 s.4(1)2', 'O.Reg.299/19 s.5(1)1', 'O.Reg.299/19 s.5(1)2']);
    for (const u of P.units) expect([u.layer, u.provincial.limits_bylaw !== undefined]).toEqual(['provincial', true]);
    expect(P.units[0].provincial.building_types).toContain('townhouse');
  });
  it('a provincial building type the vocab does not map is a conversion violation (never assumed)', () => {
    const v2 = JSON.parse(JSON.stringify(PVOCAB));
    delete v2.provincial_scope.building_type.rowhouse;
    expect(E.provincialUnits(EXT, v2).violations.join(' ')).toMatch(/rowhouse/);
  });
  it('A15: coverage — a more permissive by-law (50 %) stands; a more restrictive one (30 %) is restrained to 45 %', () => {
    expect(show(eff(lot(rdLot), 'lot_coverage_pct', [cov('50 pct'), ...P.units]))).toBe(50);
    const r = eff(lot(rdLot), 'lot_coverage_pct', [cov('30 pct'), ...P.units]);
    expect([r.value, r.winner]).toEqual([45, 'O.Reg.299/19 s.5(1)1']);
  });
  it('A15: a silent by-law stays unregulated (the clause-stated unregulated is not replaced by 45)', () => {
    expect(show(eff(lot(rdLot), 'lot_coverage_pct', [cov('unregulated'), ...P.units]))).toBe('unregulated');
  });
  it('A15: separation — by-law 3.0 m (more permissive) stands; by-law 5.0 m is capped at 4 m (max_requirement)', () => {
    expect(show(eff(lot(rdLot), 'separation_m', [sep('3.0'), ...P.units]))).toBe(3);
    expect(show(eff(lot(rdLot), 'separation_m', [sep('5.0'), ...P.units]))).toBe(4);
  });
  it('FSI — a by-law cap is lifted to unlimited in scope; out of scope it stands', () => {
    expect(show(eff(lot(rdLot), 'fsi', [fsi('0.6 ratio'), ...P.units]))).toBe('unlimited');
    expect(show(eff({ ...lot(rdLot), building_type: 'apartment_building' }, 'fsi', [fsi('0.6 ratio'), ...P.units]))).toBe(0.6);
  });
  it('never ADDITIONAL: with no by-law unit for the target the provincial unit does not create a value', () => {
    expect(show(eff(lot({ ...rdLot, zone: 'RT' }), 'separation_m', P.units))).toBe('not_evaluated:no_candidate');
  });
  it('loading provincial units does not switch ABS-1 off: an in-scope R lot stays unregulated by absence', () => {
    const r = eff(lot(rLot), 'lot_coverage_pct', [...UNITS, ...P.units]);
    expect([r.value, r.evidence && r.evidence.kind]).toEqual(['unregulated', 'absence']);
    const r2 = eff(lot(rLot, { flags: {}, vars: {} }), 'lot_coverage_pct', [...UNITS, ...P.units]);
    expect([r2.value, r2.evidence && r2.evidence.kind]).toEqual(['unregulated', 'absence']);
  });
  it('scope: building type, land and unit configuration out of scope → the by-law value stands', () => {
    expect(show(eff({ ...lot(rdLot), building_type: 'apartment_building' }, 'lot_coverage_pct', [cov('30 pct'), ...P.units]))).toBe(30);
    expect(show(eff(lot(rdLot, { flags: { parcel_of_urban_residential_land: false }, vars: { house_units: 2, ancillary_units: 1 } }), 'lot_coverage_pct', [cov('30 pct'), ...P.units]))).toBe(30);
    expect(show(eff(lot(rdLot, { flags: { parcel_of_urban_residential_land: true }, vars: { house_units: 4, ancillary_units: 0 } }), 'lot_coverage_pct', [cov('30 pct'), ...P.units]))).toBe(30);
  });
  it('scope undecided: not_evaluated when it matters (by-law 30 %), the value when it does not (by-law 50 %)', () => {
    const unknown = lot(rdLot, { flags: { parcel_of_urban_residential_land: true }, vars: {} });
    expect(show(eff(unknown, 'lot_coverage_pct', [cov('30 pct'), ...P.units]))).toBe('not_evaluated:needs_user_input:house_units');
    expect(show(eff(unknown, 'lot_coverage_pct', [cov('50 pct'), ...P.units]))).toBe(50);
  });
  it('a provincial-layer unit that does not come from external.json (no limits_bylaw) is never a candidate', () => {
    const raw = U({ unit_id: 'RAWPROV', layer: 'provincial', target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = 45 pct @x'] });
    expect(show(eff(lot(rdLot), 'lot_coverage_pct', [cov('30 pct'), raw]))).toBe(30);
  });
});

// ------------------------------------------------------------------ 3. determinism
const seeded = (seed: number) => { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; };
const shuffle = <T,>(xs: T[], R: () => number): T[] => { const b = [...xs]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = b[i] as T; b[i] = b[j] as T; b[j] = t; } return b; };
const canon = (r: Json): string => JSON.stringify({ s: r.status, v: r.value, r: r.reason, w: r.winner, b: r.bounds, i: r.inputs, t: r.trace });
describe('3. determinism: results do not depend on candidate order (red-team A16: 650 / 9,156 pairs moved)', () => {
  const P = E.provincialUnits ? E.provincialUnits(EXT, PVOCAB).units : [];
  const all = [...UNITS, ...P];
  const targets = [...new Set(UNITS.map((u) => u.target).filter((t: string) => t && t !== 'none'))].sort() as string[];
  const lots: Json[] = [];
  for (const v of VECTORS) if (v.lot) { lots.push(v.lot); lots.push({ ...v.lot, building_type: null }); lots.push({ ...v.lot, flags: {} }); lots.push({ ...v.lot, vars: {}, flags: {} }); }
  it('permutation property: every vector lot (×4 variants) × target, reversed + 2 seeded shuffles, identical result incl. winner, reason, inputs and trace', () => {
    const R = seeded(7); let moved = 0; let pairs = 0; const sample: string[] = [];
    for (const lot of lots) for (const t of targets) {
      pairs++;
      const { candidates } = E.loadCandidates(lot, all);
      const base = canon(E.effective(lot, t, candidates, C));
      for (let k = 0; k < 3; k++) {
        const got = canon(E.effective(lot, t, k === 0 ? [...candidates].reverse() : shuffle(candidates, R), C));
        if (got !== base) { moved++; if (sample.length < 3) sample.push(`${lot.zone}/${lot.building_type}/${t}`); break; }
      }
    }
    expect({ moved, sample, pairs_checked: pairs > 9000 }).toEqual({ moved: 0, sample: [], pairs_checked: true });
  });
  it('M-50: reversing the vocab building-type order changes nothing (E8)', () => {
    const a1 = U({ unit_id: 'M#(A)', application: { zones: ['RD'], building_types: ['detached_house'] }, target: 'height_m', numeric_expression: ['height_m = 10.0 m @(A)'] });
    const a2 = U({ unit_id: 'M#(B)', application: { zones: ['RD'], building_types: EV.building_type_residential.filter((t: string) => t !== 'detached_house') }, target: 'height_m', numeric_expression: ['height_m = 10.0 m @(B)'] });
    const C2 = E.makeContext({ ...EV, building_type_residential: [...EV.building_type_residential].reverse() }, { absences: ABS.rulings });
    expect(canon(E.effective({ ...rdLot, building_type: null }, 'height_m', [a1, a2], C))).toBe(canon(E.effective({ ...rdLot, building_type: null }, 'height_m', [a1, a2], C2)));
  });
  it('equal-valued units at the same layer report the same winner in any order (the lowest unit id)', () => {
    const x = U({ unit_id: 'Z#b', target: 'height_m', numeric_expression: ['height_m = 9.0 m @b'] });
    const y = U({ unit_id: 'A#a', target: 'height_m', numeric_expression: ['height_m = 9.0 m @a'] });
    expect([E.effective(rdLot, 'height_m', [x, y], C).winner, E.effective(rdLot, 'height_m', [y, x], C).winner]).toEqual(['A#a', 'A#a']);
  });
});

// ------------------------------------------------------------------ 4. inputs read
describe('4. the result records every lot input read, conditions included (red-team A25 / E6)', () => {
  const u = U({ unit_id: 'T#(1)', regulation_id: '10.20.40.99(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', condition: { tokens: ['corner_lot'], if: 'lot_frontage_m ≥ 12.0 m' }, numeric_expression: ['height_m = 9.0 m @(1)'] });
  const v = U({ unit_id: 'T#(2)', regulation_id: '10.20.40.99(2)', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', numeric_expression: ['height_m = 10.0 m @(2)'] });
  it('corner_lot and lot_frontage_m appear in inputs and in the trace whichever way they resolve', () => {
    const cases: Array<[Json, Json]> = [[{ corner_lot: true }, { lot_frontage_m: 15 }], [{ corner_lot: false }, { lot_frontage_m: 15 }], [{ corner_lot: true }, { lot_frontage_m: 9 }]];
    for (const [flags, vars] of cases) {
      const r = E.effective({ ...rdLot, flags, vars }, 'height_m', [u, v], C);
      expect(r.inputs).toContain('flags.corner_lot');
      expect(r.trace.join(' ')).toMatch(/corner_lot/);
      if (flags.corner_lot) expect(r.inputs).toContain('vars.lot_frontage_m');
    }
  });
  it('inputs are sufficient: changing any lot input NOT listed never changes the result (vector lots × fixture targets)', () => {
    const targets = [...new Set(UNITS.map((x) => x.target).filter((t: string) => t && t !== 'none'))].sort() as string[];
    const perturb = (lot: Json, key: string): Json => {
      const [k, name = ''] = key.split('.');
      if (k === 'flags') return { ...lot, flags: { ...lot.flags, [name]: !(lot.flags || {})[name] } };
      if (k === 'vars') return { ...lot, vars: { ...lot.vars, [name]: ((lot.vars || {})[name] ?? 1) * 3 + 7 } };
      if (k === 'label') return { ...lot, label: { ...lot.label, [name]: ((lot.label || {})[name] ?? 1) * 3 + 7 } };
      if (k === 'overlays') return { ...lot, overlays: { ...lot.overlays, [name]: ((lot.overlays || {})[name] ?? 1) * 3 + 7 } };
      return lot;
    };
    const keysOf = (lot: Json): string[] => [...Object.keys(lot.flags || {}).map((x) => `flags.${x}`), ...Object.keys(lot.vars || {}).map((x) => `vars.${x}`), ...Object.keys(lot.label || {}).map((x) => `label.${x}`), ...Object.keys(lot.overlays || {}).map((x) => `overlays.${x}`), 'flags.corner_lot', 'flags.has_secondary_suite', 'vars.dwelling_units', 'label.u', 'overlays.LC'];
    const bad: string[] = [];
    for (const vx of VECTORS.filter((x) => x.lot)) for (const t of targets) {
      const r = eff(vx.lot, t, UNITS);
      const key = JSON.stringify([r.status, r.value, r.reason]);
      for (const k of [...new Set(keysOf(vx.lot))]) {
        if ((r.inputs || []).includes(k)) continue;
        const r2 = eff(perturb(vx.lot, k), t, UNITS);
        if (JSON.stringify([r2.status, r2.value, r2.reason]) !== key && bad.length < 5) bad.push(`${vx.id}/${t}: ${k} not in inputs but moves ${key} → ${JSON.stringify([r2.status, r2.value, r2.reason])}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ------------------------------------------------------------------ 5. threshold tokens
describe('5. threshold lot-condition tokens are validated (red-team A18)', () => {
  it('production vocab + fixture units pass', () => {
    const r = E.checkThresholdTokens(PVOCAB, UNITS);
    expect({ pass: r.pass, violations: r.violations }).toEqual({ pass: true, violations: [] });
  });
  it('corner_lot wrongly flagged threshold reds the check', () => {
    const v2 = JSON.parse(JSON.stringify(PVOCAB));
    v2.lot_condition.corner_lot = { threshold: true };
    expect(E.checkThresholdTokens(v2, UNITS).pass).toBe(false);
  });
  it('corner_lot flagged threshold with forged reads still reds: its units\' conditions do not read them', () => {
    const v2 = JSON.parse(JSON.stringify(PVOCAB));
    v2.lot_condition.corner_lot = { threshold: true, reads: ['lot_depth_m'] };
    expect(E.checkThresholdTokens(v2, UNITS).pass).toBe(false);
  });
  it('a threshold token whose unit has no condition.if reds; a flag token declaring reads reds', () => {
    const bad = U({ unit_id: 'TH#x', target: 'height_m', condition: { tokens: ['frontage_band'], if: 'none' }, numeric_expression: ['height_m = 9.0 m @x'] });
    expect(E.checkThresholdTokens(PVOCAB, [...UNITS, bad]).pass).toBe(false);
    const v2 = JSON.parse(JSON.stringify(PVOCAB));
    v2.lot_condition.through_lot = { reads: ['lot_depth_m'] };
    expect(E.checkThresholdTokens(v2, UNITS).pass).toBe(false);
  });
});

// ------------------------------------------------------------------ 6. undecided conditions
describe('6. an undecided condition whose every resolution gives the same result returns it (M-50 generalised, M-60)', () => {
  const a = U({ unit_id: 'K#(A)', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', condition: { tokens: ['major_street'], if: 'none' }, numeric_expression: ['height_m = 10.0 m @(A)'] });
  const b = U({ unit_id: 'K#(B)', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', numeric_expression: ['height_m = 10.0 m @(B)'] });
  const lot = { ...rdLot, flags: {} };
  it('immaterial: same value whether major_street holds or not → the value', () => {
    expect(show(E.effective(lot, 'height_m', [a, b], C))).toBe(10);
  });
  it('material: different values → not_evaluated with the undecided reason', () => {
    expect(show(E.effective(lot, 'height_m', [{ ...a, numeric_expression: ['height_m = 8.0 m @(A)'] }, b], C))).toBe('not_evaluated:condition_unknown:major_street');
  });
  it('the reported reason does not depend on order (declared priority, never first-seen)', () => {
    const c = U({ unit_id: 'K#(C)', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', condition: { tokens: ['corner_lot'], if: 'none' }, numeric_expression: ['height_m = 7.0 m @(C)'] });
    const x = { ...a, numeric_expression: ['height_m = 8.0 m @(A)'] };
    expect(show(E.effective(lot, 'height_m', [x, c, b], C))).toBe(show(E.effective(lot, 'height_m', [c, b, x], C)));
  });
  it('PERMIT vs PROHIBIT at the same rank → PROHIBIT wins (operator ruling (a) 2026-10-07; was HELD as conflict)', () => {
    const p = U({ unit_id: 'P#1', archetype: 'PERMIT', target: 'none', bound: 'none', numeric_expression: 'none' });
    const q = U({ unit_id: 'Q#1', archetype: 'PROHIBIT', target: 'none', bound: 'none', numeric_expression: 'none' });
    expect(E.permitted(rdLot, 'detached_house', [q, p], C).status).toBe('prohibited');
  });
});

// ------------------------------------------------------------------ DeepSeek lens findings (adjudicated by execution)
describe('DeepSeek lens findings on evaluate.mjs, each executed red → fixed', () => {
  it('error-paths: a threshold token with no condition.if is undecided at run time, never unconditional', () => {
    const t = U({ unit_id: 'TH#a', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', condition: { tokens: ['frontage_band'], if: 'none' }, numeric_expression: ['height_m = 9.0 m @a'] });
    const v = U({ unit_id: 'TH#b', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', numeric_expression: ['height_m = 10.0 m @b'] });
    expect(show(E.effective(rdLot, 'height_m', [t, v], C))).toBe('not_evaluated:condition_unknown:frontage_band');
  });
  it('spec / idempotency: two units sharing a unit_id load the same one in any input order (logged)', () => {
    const x = U({ unit_id: 'DUP#a', application: { zones: ['RD'], building_types: ['any'] }, target: 'height_m', numeric_expression: ['height_m = 9.0 m @a'] });
    const y = { ...x, numeric_expression: ['height_m = 11.0 m @a'] };
    const r1 = eff(rdLot, 'height_m', [x, y]); const r2 = eff(rdLot, 'height_m', [y, x]);
    expect(r1.value).toBe(r2.value);
    expect(E.loadCandidates(rdLot, [x, y]).log.join(' ')).toMatch(/duplicate unit_id DUP#a/);
  });
  it('spec: a provincial unit whose target or unit the vocab does not declare is a violation, never silently inert', () => {
    const ext = JSON.parse(JSON.stringify(EXT));
    const row = ext.entries.find((e: Json) => e.precedence === 'active');
    row.provincial_units[0].target = 'not_a_target';
    row.provincial_units[1].unit = 'm';
    const v = E.provincialUnits(ext, PVOCAB).violations.join(' ');
    expect(v).toMatch(/not_a_target/);
    expect(v).toMatch(/unit m ≠ target unit pct/);
  });
});

// ------------------------------------------------------------------ S6g proposed patches
describe('S6g patches: dsl.mjs checkStatement reads vocab.building_type as an object; vocab additions', () => {
  it('checkStatement accepts the vocab.json building_type object (no false unknown_building_type)', () => {
    expect(D.checkStatement('height_m = by_type(detached_house: 10.0 m; other: 12.0 m) @(1)(B)', PVOCAB)).toEqual([]);
    expect(D.checkStatement('height_m = by_type(castle: 10.0 m) @(1)(B)', PVOCAB)).toContain('unknown_building_type: castle');
  });
  it('overlay codes HT / ST / LC are declared held (Spec 58); instrument_kind is a closed vocab list', () => {
    for (const c of ['HT', 'ST', 'LC']) expect([c, PVOCAB.overlay_code[c].held]).toEqual([c, true]);
    expect([...PVOCAB.instrument_kind].sort()).toEqual(['former_bylaw', 'former_section', 'schedule_map']);
  });
});
