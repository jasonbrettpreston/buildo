// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence: permitted(), rule 7a, the fail-closed
//            entry checks), §7.4 (label letters), §6.1 (external.json `ref` entries); docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-21 (S12 legacy map), M-29 (expert sample), M-60 (evaluator rules) and their dated
//            notes 2026-10-07 (operator rulings a, d, e, S12)
//
// Operator rulings 2026-10-07 ("yes to all"), each pinned red → green:
//   (a) PERMIT vs PROHIBIT at the same rank → PROHIBIT wins (never show a permission the law may forbid); the result
//       carries both clauses in the trace and is flagged for the M-29 expert sample
//   (d) an unauthored exception (or one in its INCLUDE closure) blocks EVERY target on the lot, base included:
//       not_evaluated:exception_not_authored:<id> (was: only the rule 7a absence path)
//   (e) a lot label letter outside the grammar (vocab.label_letter) fails closed: not_evaluated:label_letter_unknown:<l>
//   (S12) the 9 authored legacy decisions are operator-confirmed; REF-1..3 land in external.json; the REF reason set
//       gains other_zone_category + dataset_documentation
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const X = await load('scripts/analysis/bylaw/external.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const EV = VO.evaluatorVocab ? VO.evaluatorVocab(PVOCAB) : {};
const ctx = (extra: Json = {}): Json => (E.makeContext ? E.makeContext(EV, { absences: ABS.rulings, ...extra }) : {});
const C = ctx();
const show = (r: Json): unknown => (r.status === 'value' ? r.value : r.status === 'not_evaluated' ? `not_evaluated:${r.reason}` : r.status);
const eff = (lot: Json, target: string, units: Json[], c: Json = C): Json => E.effective(lot, target, E.loadCandidates(lot, units).candidates, c);
const perm = (lot: Json, type: string, units: Json[], c: Json = C): Json => E.permitted(lot, type, E.loadCandidates(lot, units).candidates, c);
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const rdLot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false, through_lot: false }, building_type: 'detached_house', exception: null };
const height = U({ unit_id: '10.20.40.10(1)#(B)', regulation_id: '10.20.40.10(1)', target: 'height_m', numeric_expression: ['height_m = 10.0 m @(1)(B)'] });
const front = U({ unit_id: '10.20.40.70(1)#whole', regulation_id: '10.20.40.70(1)', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 6.0 m @(1)'] });
const permitBase = U({ unit_id: '10.20.20.10(1)#whole', regulation_id: '10.20.20.10(1)', archetype: 'PERMIT', target: 'none', bound: 'none', numeric_expression: 'none' });
const BASE = [height, front, permitBase];
// exception units: EXQ keys only front_setback_m; EXA INCLUDEs EXB
const exq = U({ unit_id: 'EXQ#SSP(A)', regulation_id: 'EXQ', layer: 'exception', exception: 'EXQ', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 7.5 m @SSP(A)'] });
const exa = U({ unit_id: 'EXA#SSP(C)', regulation_id: 'EXA', layer: 'exception', exception: 'EXA', archetype: 'INCLUDE', include_ref: 'EXB', target: 'none', bound: 'none', numeric_expression: 'none' });
const exb = U({ unit_id: 'EXB#SSP(A)', regulation_id: 'EXB', layer: 'exception', exception: 'EXB', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 9.0 m @SSP(A)'] });

// ------------------------------------------------------------------ (a)
describe('ruling (a) 2026-10-07: PERMIT vs PROHIBIT at the same rank → PROHIBIT wins, both clauses traced, M-29 flag', () => {
  const p = U({ unit_id: 'P#1', archetype: 'PERMIT', target: 'none', bound: 'none', numeric_expression: 'none' });
  const q = U({ unit_id: 'Q#1', archetype: 'PROHIBIT', target: 'none', bound: 'none', numeric_expression: 'none' });
  it('the result is prohibited (never conflict, never permitted)', () => {
    expect(E.permitted(rdLot, 'detached_house', [p, q], C).status).toBe('prohibited');
  });
  it('the winners are the PROHIBIT units; the overruled PERMIT units are named; flagged for the expert sample', () => {
    const r = E.permitted(rdLot, 'detached_house', [p, q], C);
    expect([r.winners, r.overruled_permits, r.expert_sample, r.ruling]).toEqual([['Q#1'], ['P#1'], true, 'prohibit_over_permit_same_rank']);
  });
  it('the trace carries both clauses', () => {
    const t = E.permitted(rdLot, 'detached_house', [p, q], C).trace.join('\n');
    expect([t.includes('P#1'), t.includes('Q#1'), /PROHIBIT wins/.test(t)]).toEqual([true, true, true]);
  });
  it('order-free: the same result for either candidate order', () => {
    expect(E.permitted(rdLot, 'detached_house', [q, p], C)).toEqual(E.permitted(rdLot, 'detached_house', [p, q], C));
  });
  it('a lone PERMIT stays permitted and carries no expert-sample flag (the ruling only touches the tie)', () => {
    const r = E.permitted(rdLot, 'detached_house', [p], C);
    expect([r.status, r.expert_sample]).toEqual(['permitted', undefined]);
  });
  it('a higher-rank PERMIT still beats a lower-rank PROHIBIT (rule 4 untouched)', () => {
    const pe = { ...p, unit_id: 'PE#1', layer: 'overlay' };
    expect(E.permitted(rdLot, 'detached_house', [pe, q], C).status).toBe('permitted');
  });
});

// ------------------------------------------------------------------ (d)
describe('ruling (d) 2026-10-07: an unauthored exception blocks base resolution for every target on the lot', () => {
  it('no exception: the base values stand', () => {
    expect([show(eff(rdLot, 'height_m', BASE)), show(eff(rdLot, 'front_setback_m', BASE))]).toEqual([10, 6]);
  });
  it('an exception with no unit at all blocks a base-only target (was: the base 10.0 m)', () => {
    expect(show(eff({ ...rdLot, exception: '900.2.10(777)' }, 'height_m', BASE))).toBe('not_evaluated:exception_not_authored:900.2.10(777)');
  });
  it('an exception keyed on ANOTHER target, not authored, blocks this target too', () => {
    expect(show(eff({ ...rdLot, exception: 'EXQ' }, 'height_m', [...BASE, exq]))).toBe('not_evaluated:exception_not_authored:EXQ');
    expect(show(eff({ ...rdLot, exception: 'EXQ' }, 'front_setback_m', [...BASE, exq]))).toBe('not_evaluated:exception_not_authored:EXQ');
  });
  it('authored (whole): every target resolves — base where the exception is silent, the exception where it speaks', () => {
    const c = ctx({ authored: { EXQ: 'authored' } });
    expect([show(eff({ ...rdLot, exception: 'EXQ' }, 'height_m', [...BASE, exq], c)), show(eff({ ...rdLot, exception: 'EXQ' }, 'front_setback_m', [...BASE, exq], c))]).toEqual([10, 7.5]);
  });
  it('partial authorship resolves exactly the listed targets', () => {
    const c = ctx({ authored: { EXQ: { status: 'partial', targets: ['front_setback_m'] } } });
    expect(show(eff({ ...rdLot, exception: 'EXQ' }, 'front_setback_m', [...BASE, exq], c))).toBe(7.5);
    expect(show(eff({ ...rdLot, exception: 'EXQ' }, 'height_m', [...BASE, exq], c))).toBe('not_evaluated:exception_not_authored:EXQ');
  });
  it('the INCLUDE closure: an authored exception that INCLUDEs an unauthored one is blocked, naming the included one', () => {
    expect(show(eff({ ...rdLot, exception: 'EXA' }, 'height_m', [...BASE, exa, exb], ctx({ authored: { EXA: 'authored' } })))).toBe('not_evaluated:exception_not_authored:EXB');
    expect(show(eff({ ...rdLot, exception: 'EXA' }, 'height_m', [...BASE, exa, exb], ctx({ authored: { EXA: 'authored', EXB: 'authored' } })))).toBe(10);
  });
  it('building type unknown (M-50): the block is returned once, never enumerated per type', () => {
    const r = eff({ ...rdLot, building_type: null, exception: 'EXQ' }, 'height_m', [...BASE, exq]);
    expect([show(r), r.per_type]).toEqual(['not_evaluated:exception_not_authored:EXQ', undefined]);
  });
  it('the result records the exception as an input read', () => {
    expect(eff({ ...rdLot, exception: 'EXQ' }, 'height_m', [...BASE, exq]).inputs).toContain('exception');
  });
  it('permitted(): an unauthored exception blocks the use permission (target use_permission)', () => {
    expect(show(perm({ ...rdLot, exception: 'EXQ' }, 'detached_house', [...BASE, exq]))).toBe('not_evaluated:exception_not_authored:EXQ');
    expect(perm({ ...rdLot, exception: 'EXQ' }, 'detached_house', [...BASE, exq], ctx({ authored: { EXQ: 'authored' } })).status).toBe('permitted');
    expect(perm({ ...rdLot, exception: 'EXQ' }, 'detached_house', [...BASE, exq], ctx({ authored: { EXQ: { status: 'partial', targets: ['use_permission'] } } })).status).toBe('permitted');
  });
  it('the precedence self-test still passes (its exception fixtures are declared authored)', () => {
    const r = E.selfTest(EV);
    expect(r.violations).toEqual([]);
  });
});

// ------------------------------------------------------------------ (e)
describe('ruling (e) 2026-10-07: a label letter outside the grammar fails closed', () => {
  it('label_letter_unknown is a closed not_evaluated code, mirrored in vocab.json not_evaluated_reason', () => {
    expect(E.NOT_EVALUATED_CODES).toContain('label_letter_unknown');
    expect(PVOCAB.not_evaluated_reason).toContain('label_letter_unknown');
  });
  it('an unknown letter blocks every target, even one that never reads the label', () => {
    const lot = { ...rdLot, label: { ...rdLot.label, c: 40 } };
    expect([show(eff(lot, 'height_m', BASE)), show(eff(lot, 'front_setback_m', BASE))]).toEqual(['not_evaluated:label_letter_unknown:c', 'not_evaluated:label_letter_unknown:c']);
  });
  it('permitted() fails closed on it too', () => {
    expect(show(perm({ ...rdLot, label: { f: 9, zz: 1 } }, 'detached_house', BASE))).toBe('not_evaluated:label_letter_unknown:zz');
  });
  it('several unknown letters → the first in sorted order (deterministic)', () => {
    expect(show(eff({ ...rdLot, label: { z: 1, f: 9, b: 2 } }, 'height_m', BASE))).toBe('not_evaluated:label_letter_unknown:b');
  });
  it('every grammar letter (f, a, d, u, au) is accepted', () => {
    expect(show(eff({ ...rdLot, label: { f: 9, a: 280, d: 0.45, u: 4, au: 220 } }, 'height_m', BASE))).toBe(10);
  });
  it('the result records the label as an input read', () => {
    expect(eff({ ...rdLot, label: { q: 1 } }, 'height_m', BASE).inputs).toContain('label');
  });
});

// ------------------------------------------------------------------ (S12)
describe('ruling (S12) 2026-10-07: legacy decisions operator-confirmed; REF-1..3 land in external.json', () => {
  const DEC = read('scripts/seeds/bylaw/legacy-decisions.json');
  const EXT = read('scripts/seeds/bylaw/external.json');
  it('the 9 authored decisions (5 picks, 2 relocations, 2 C4 retirements) are marked operator-confirmed 2026-10-07', () => {
    const keys = [...Object.keys(DEC.picks), ...Object.keys(DEC.relocate), ...Object.keys(DEC.retire)].sort();
    expect(keys.length).toBe(9);
    expect(DEC.operator_confirmed.date).toBe('2026-10-07');
    expect([...DEC.operator_confirmed.decisions].sort()).toEqual(keys);
  });
  it('REF-1..3 are in external.json exactly as S12 proposed them', () => {
    const refs = EXT.entries.filter((e: Json) => e.kind === 'ref');
    expect(refs).toEqual(DEC.proposed_refs);
  });
  it('external.json passes G-READ (external arm) incl. canonical bytes, with 3 refs counted', () => {
    const r = X.checkExternalFile({ seeds: path.join(ROOT, 'scripts/seeds/bylaw') });
    expect([r.violations, r.counts.ref]).toEqual([[], 3]);
  });
  it('the REF reason set is phase2_exception · other_zone_category · dataset_documentation, closed', () => {
    const base = (reason: string): Json => ({ ...EXT, entries: [...EXT.entries.filter((e: Json) => e.kind !== 'ref'), { citation: 'c', id: 'REF-9', kind: 'ref', reason, url: 'https://www.toronto.ca/x' }] });
    for (const ok of ['phase2_exception', 'other_zone_category', 'dataset_documentation']) expect([ok, X.checkExternal(base(ok)).violations]).toEqual([ok, []]);
    expect(X.checkExternal(base('vibes')).violations.map((v: string) => v.split(':')[0])).toEqual(['external_shape']);
  });
});

// ------------------------------------------------------------------ (b) + (c): provincial scope (Spec 69 M-55 notes)
describe('rulings (b) + (c) 2026-10-07: provincial scope — houseplex ≤ 3 units maps; urban residential land default', () => {
  const EXT = read('scripts/seeds/bylaw/external.json');
  const P = E.provincialUnits ? E.provincialUnits(EXT, PVOCAB) : { units: [], violations: ['no export'] };
  const cov = (v: string): Json => U({ unit_id: `BY#cov${v}`, regulation_id: '10.20.30.40(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'lot_coverage_pct', numeric_expression: [`lot_coverage_pct = ${v} @x`] });
  const lot = (bt: string, h: number, a: number, extra: Json = {}): Json => ({ ...rdLot, building_type: bt, flags: { ...rdLot.flags, parcel_of_urban_residential_land: true }, vars: { ...rdLot.vars, house_units: h, ancillary_units: a }, ...extra });
  const covOn = (l: Json, v = '30 pct'): unknown => show(eff(l, 'lot_coverage_pct', [cov(v), ...P.units]));
  const SEPTIC = ['5058948', '5064862', '5065341', '5209894', '5212538', '5370105'];
  it('the vocab data converts with no violation; the conditional houseplex types ride on every provincial unit', () => {
    expect(P.violations).toEqual([]);
    for (const u of P.units) expect(u.provincial.conditional_types.map((c: Json) => [c.type, c.max_lot_units, c.children])).toEqual([['detached_houseplex', 3, ['duplex', 'triplex']], ['semi_detached_houseplex', 3, []]]);
  });
  it('(b) the conditional mapping is data with its evidence class, citations and the M-29 flag', () => {
    const m = PVOCAB.provincial_scope.building_type;
    const conds = ([...m.detached_house, ...m.semi_detached_house] as unknown[]).filter((x): x is Json => typeof x === 'object' && x !== null);
    expect(conds.length).toBe(2);
    for (const c of conds) expect([c.evidence, c.expert_sample, c.citations.length > 0]).toEqual(['inferred', true, true]);
  });
  it('(b) a detached / semi-detached houseplex, duplex or triplex of ≤ 3 lot units is in scope (30 % restrained to 45 %)', () => {
    expect([covOn(lot('detached_houseplex', 2, 1)), covOn(lot('semi_detached_houseplex', 3, 0)), covOn(lot('triplex', 3, 0)), covOn(lot('duplex', 2, 0))]).toEqual([45, 45, 45, 45]);
  });
  it('(b) above 3 lot units, or a 4–6-plex type, never maps: the by-law stands', () => {
    expect([covOn(lot('detached_houseplex', 3, 1)), covOn(lot('fourplex', 3, 0)), covOn(lot('fiveplex', 2, 0)), covOn(lot('sixplex', 2, 1))]).toEqual([30, 30, 30, 30]);
  });
  it('(b) a houseplex in scope is traced as the conditional mapping, flagged for the M-29 expert sample', () => {
    const t = eff(lot('triplex', 3, 0), 'lot_coverage_pct', [cov('30 pct'), ...P.units]).trace.join('\n');
    expect(t).toMatch(/conditional .*detached_houseplex.*M-29 expert sample/);
  });
  it('(b) malformed conditional data is a conversion violation, never assumed', () => {
    const v2 = JSON.parse(JSON.stringify(PVOCAB));
    v2.provincial_scope.building_type.detached_house = ['detached_house', { type: 'detached_houseplex', max_lot_units: 0, children: ['duplex'], evidence: 'inferred', expert_sample: true, citations: ['x'] }];
    expect(E.provincialUnits(EXT, v2).violations.join(' ')).toMatch(/max_lot_units/);
    v2.provincial_scope.building_type.detached_house = ['detached_house', { type: 'detached_houseplex', max_lot_units: 3, children: ['castle'], evidence: 'inferred', expert_sample: true, citations: ['x'] }];
    expect(E.provincialUnits(EXT, v2).violations.join(' ')).toMatch(/castle/);
  });
  it('(c) the land entry is a declared citywide default true citing Planning Act s. 1(1), with the 6 septic lots excluded as unknown', () => {
    const land = PVOCAB.provincial_scope.land.parcel_of_urban_residential_land;
    expect([land.default, land.evidence, /Planning Act.*s\. ?1\(1\)/.test(land.citation)]).toEqual([true, 'declared', true]);
    expect(land.exclusions.map((x: Json) => x.parcel_id)).toEqual(SEPTIC);
    for (const x of land.exclusions) expect([x.value, x.permits.length > 0, typeof x.address]).toEqual(['unknown', true, 'string']);
  });
  it('(c) no flag, a parcel id not excluded → the declared default applies (in scope: 45), and parcel_id is an input read', () => {
    const l = lot('detached_house', 2, 1, { parcel_id: '1234567', flags: { ...rdLot.flags } });
    const r = eff(l, 'lot_coverage_pct', [cov('30 pct'), ...P.units]);
    expect([r.value, r.inputs.includes('parcel_id')]).toEqual([45, true]);
    expect(r.trace.join('\n')).toMatch(/default/);
  });
  it('(c) an excluded septic lot is unknown → not_evaluated:missing_input when it matters, the value when it does not', () => {
    const l = lot('detached_house', 2, 1, { parcel_id: '5065341', flags: { ...rdLot.flags } });
    expect(covOn(l)).toBe('not_evaluated:missing_input:parcel_of_urban_residential_land');
    expect(covOn(l, '50 pct')).toBe(50);
  });
  it('(c) an explicit lot flag wins over the default and the exclusion; no parcel id and no flag stays undecided', () => {
    expect(covOn(lot('detached_house', 2, 1, { parcel_id: '5065341' }))).toBe(45);
    expect(covOn(lot('detached_house', 2, 1, { flags: { ...rdLot.flags } }))).toBe('not_evaluated:condition_unknown:parcel_of_urban_residential_land');
  });
});

// ------------------------------------------------------------------ DeepSeek lens findings (adjudicated by execution)
describe('DeepSeek lens findings on the rulings diff, each executed red → fixed', () => {
  const EXT = read('scripts/seeds/bylaw/external.json');
  it('spec lens: a malformed unit configuration is a conversion violation, never a TypeError', () => {
    const e2 = JSON.parse(JSON.stringify(EXT)); e2.entries.find((x: Json) => x.id === 'EXT-prov-1').provincial_units[0].scope.unit_configurations = [{}];
    expect(E.provincialUnits(e2, PVOCAB).violations.join(' ')).toMatch(/unit_configuration/);
  });
  it('error-paths lens: a land entry with no declared default is a violation (ruling (c) requires one)', () => {
    const v2 = JSON.parse(JSON.stringify(PVOCAB)); delete v2.provincial_scope.land.parcel_of_urban_residential_land.default;
    expect(E.provincialUnits(EXT, v2).violations.join(' ')).toMatch(/no declared default/);
  });
  it('spec lens: permitted() records each condition it read in the trace, like effective()', () => {
    const p = U({ unit_id: 'P#c', archetype: 'PERMIT', target: 'none', bound: 'none', condition: { tokens: ['corner_lot'], if: 'none' }, numeric_expression: 'none' });
    expect(E.permitted(rdLot, 'detached_house', [p], C).trace.join('\n')).toMatch(/condition P#c: corner_lot=false → not applicable/);
  });
});
