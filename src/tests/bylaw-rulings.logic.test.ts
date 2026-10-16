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
    expect(refs.filter((e: Json) => ['REF-1', 'REF-2', 'REF-3'].includes(e.id))).toEqual(DEC.proposed_refs); // REF-4/5 are Spec 69a M-79; REF-6..23 are other_zone_category refs (M-56); neither is S12
  });
  it('external.json passes G-READ (external arm) incl. canonical bytes, with 35 refs counted (REF-4/5: M-79; REF-6..23: M-56 other_zone_category; REF-24..27: M-86 out_of_scope_section; REF-28..31: R5 Q6(d) needs_ref; REF-32..35: M-95)', () => {
    const r = X.checkExternalFile({ seeds: path.join(ROOT, 'scripts/seeds/bylaw') });
    expect([r.violations, r.counts.ref]).toEqual([[], 35]);
  });
  it('the REF reason set is phase2_exception · other_zone_category · dataset_documentation · other_instrument (M-79) · out_of_scope_section (R5 Q6b), closed', () => {
    const base = (reason: string): Json => ({ ...EXT, entries: [...EXT.entries.filter((e: Json) => e.kind !== 'ref'), { citation: 'c', id: 'REF-9', kind: 'ref', reason, url: 'https://www.toronto.ca/x' }] });
    for (const ok of ['phase2_exception', 'other_zone_category', 'dataset_documentation', 'out_of_scope_section']) expect([ok, X.checkExternal(base(ok)).violations]).toEqual([ok, []]);
    const pinned = (o: Json): Json => ({ ...EXT, entries: [...EXT.entries.filter((e: Json) => e.kind !== 'ref'), { citation: 'Chapter 363', id: 'REF-9', kind: 'ref', reason: 'other_instrument', url: 'https://www.toronto.ca/x', ...o }] });
    expect(X.checkExternal(pinned({ source_sha256: 'a'.repeat(64) })).violations).toEqual([]);
    expect(X.checkExternal(pinned({})).violations.map((v: string) => v.split(':')[0])).toEqual(['external_shape']); // M-79: the source sha is required
    expect(X.checkExternal(base('other_instrument')).violations.map((v: string) => v.split(':')[0])).toEqual(['external_shape']);
    // out_of_scope_section takes the plain REF_KEYS set: a source_sha256 on it is a shape violation (unlike other_instrument)
    const oos = (o: Json): Json => ({ ...EXT, entries: [...EXT.entries.filter((e: Json) => e.kind !== 'ref'), { citation: '600.20', id: 'REF-9', kind: 'ref', reason: 'out_of_scope_section', url: 'https://www.toronto.ca/x', ...o }] });
    expect(X.checkExternal(oos({ source_sha256: 'a'.repeat(64) })).violations.map((v: string) => v.split(':')[0])).toEqual(['external_shape']);
    expect(X.checkExternal(oos({})).violations).toEqual([]);
    expect(X.checkExternal(base('out_of_scope')).violations.map((v: string) => v.split(':')[0])).toEqual(['external_shape']); // closedness: 'out_of_scope' is not the name
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

// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-87..M-92 (operator rulings 2026-10-13, R5 landing)
describe('Spec 69a M-87..M-92 — R5 rulings (vocab members, rate_base, ref_target_absent)', () => {
  const XR = load('scripts/analysis/bylaw/xref.mjs');
  const AFX = load('scripts/analysis/bylaw/authored-fixtures.mjs');
  it('M-88: vocab.requirement gains comply_with_bylaw (own member, not the borrowed comply_or_minor_variance) and 27 members in all', () => {
    expect(PVOCAB.requirement).toEqual(expect.arrayContaining(['comply_or_minor_variance', 'comply_with_bylaw', 'identified_and_marked', 'fenced']));
    expect(PVOCAB.requirement).toHaveLength(27);
    expect(new Set(PVOCAB.requirement).size).toBe(27);
  });
  it('M-89: rate_base is a closed literal_not_expressed_reason; M-91: building_length_band is a threshold token reading building_length_m', () => {
    expect(PVOCAB.literal_not_expressed_reason).toContain('rate_base');
    expect(PVOCAB.lot_condition.building_length_band).toEqual({ threshold: true, reads: ['building_length_m'] });
    expect(Object.keys(PVOCAB.dsl_target)).toContain('building_length_m');
  });
  it('M-87: no licence pattern is shared by two dsl_targets (vocab_synonym), and the refused gfa_m2 "square metres" is absent', () => {
    const owner = new Map<string, string>();
    for (const [n, t] of Object.entries<Json>(PVOCAB.dsl_target)) for (const p of t.patterns) { expect([n, owner.get(p.toLowerCase())]).toEqual([n, undefined]); owner.set(p.toLowerCase(), n); }
    expect(PVOCAB.dsl_target.gfa_m2.patterns).toEqual(['gross floor area']);
    expect(PVOCAB.dsl_target.height_projection_m.patterns).toContain('above the permitted maximum height');
  });
  it('M-92: ref_target_absent is a vocab adjudication kind and source_defect kind; an adjudication of that kind turns ref_unresolved into a counted disclosure', async () => {
    expect(PVOCAB.adjudication_kind).toContain('ref_target_absent');
    expect(PVOCAB.disclosure_reason.source_defect).toContain('ref_target_absent');
    const { checkXref } = await XR;
    const { xrefFixtures } = await AFX;
    const f = xrefFixtures().find((x: Json) => x.name === 'ref_unresolved');
    const red = checkXref(f.input);
    expect(red.violations.map((v: Json) => v.code)).toEqual(['ref_unresolved']);
    const v = red.violations[0];
    const citation = /"([^"]+)"/.exec(v.detail)![1];
    const adj = [{ id: 'ADJ-fixture', kind: 'ref_target_absent', unit: v.id, citation, reason: 'fixture', rule: 'fixture', adjudicator: 'operator' }];
    const green = checkXref({ ...f.input, adjudications: adj });
    expect([green.violations, green.counts.refs_target_absent]).toEqual([[], 1]);
    expect(checkXref({ ...f.input, adjudications: [{ ...adj[0], citation: 'other' }] }).violations.map((x: Json) => x.code)).toEqual(['ref_unresolved']); // pinned to the exact unit + citation
  });
  it('M-132: the R-3 phrasing-variant licence patterns are on their own targets (M-87 style)', () => {
    const T = PVOCAB.dsl_target;
    expect(T.side_setback_m.patterns).toContain('from a side lot line');
    expect(T.height_m.patterns).toContain('maximum building height');
    expect(T.encroachment_m.patterns).toContain('permitted to project');
    expect(T.separation_m.patterns).toContain('from the main wall of the residential building');
    expect(T.ancillary_floor_area_m2.patterns).toContain('area of the ancillary');
    expect(T.parking_space_width_m.patterns).toContain('metres wide');
    expect(T.parking_space_length_m.patterns).toContain('metres long');
    expect(T.vertical_clearance_m.patterns).toContain('vertical dimension');
  });
  it('M-134: the round-2 licence patterns are on their own targets, and "for a side lot line" is licensed nowhere (option (b))', () => {
    const T = PVOCAB.dsl_target;
    expect(T.required_lot_frontage_m.patterns).toContain('minimum required lot frontage');
    expect(T.front_setback_m.patterns).toEqual(expect.arrayContaining(['from a front lot line', 'for a front lot line']));
    expect(T.lot_line_setback_m.patterns).toContain('rear yard lot line');
    expect(T.dwelling_units_max.patterns).toContain('dwelling unit per lot');
    for (const t of Object.values<Json>(T)) expect(t.patterns ?? []).not.toContain('for a side lot line');
  });
  it('M-142: storey_count_band / platform_height_band are threshold tokens reading existing dsl targets', () => {
    expect(PVOCAB.lot_condition.storey_count_band).toEqual({ threshold: true, reads: ['height_storeys'] });
    expect(PVOCAB.lot_condition.platform_height_band).toEqual({ threshold: true, reads: ['platform_height_m'] });
    for (const t of ['height_storeys', 'platform_height_m']) expect(Object.keys(PVOCAB.dsl_target)).toContain(t);
  });
  it('M-157: building_type detached_house is licensed by the former-by-law wording "detached dwelling" (M-132 style)', () => {
    expect(PVOCAB.building_type.detached_house.patterns).toEqual(expect.arrayContaining(['detached house', 'detached dwelling']));
  });
  it('M-158: lawfully_existing joins its declared user input; the caveat phrase map is closed and every entry is a dsl_target with a template direction', () => {
    expect(PVOCAB.lot_condition.lawfully_existing).toEqual({ user_input: 'lawfully_existing_status' });
    expect(PVOCAB.user_input).toEqual(expect.arrayContaining(['lawfully_existing_status', 'existing_footprint_sqm', 'current_stories']));
    const c = PVOCAB.lawfully_existing_caveat;
    expect(Object.keys(c.template).sort()).toEqual(['max', 'max_lot', 'min', 'min_building']);
    expect([c.token, c.default, c.inputs, c.m39_date]).toEqual(['lawfully_existing', false, { footprint: 'existing_footprint_sqm', storeys: 'current_stories' }, '2025-06-26']);
    expect(c.cutoff).toEqual({ default: '9 May 2013 (or a building permit issued before then)', m39: '26 June 2025' });
    expect(Object.keys(c.phrases).sort()).toEqual(['bicycle_parking_spaces', 'building_depth_m', 'building_length_m', 'building_width_m', 'driveway_width_m', 'entrance_height_m', 'front_landscaping_pct', 'front_setback_m', 'front_soft_landscaping_pct', 'fsi', 'gfa_m2', 'height_m', 'height_storeys', 'loading_spaces', 'lot_coverage_pct', 'main_wall_height_m', 'parking_rate', 'parking_spaces', 'rear_setback_m', 'required_lot_area_m2', 'required_lot_frontage_m', 'separation_m', 'side_setback_m']);
    for (const [t, dirs] of Object.entries<Json>(c.phrases)) {
      expect(Object.keys(PVOCAB.dsl_target)).toContain(t);
      for (const [dir, p] of Object.entries<Json>(dirs)) {
        expect(['max', 'min']).toContain(dir);
        expect(Object.keys(c.template)).toContain(p.template ?? dir);
        if (p.template) expect(p.template.startsWith(dir)).toBe(true);
        expect(p.phrase).toContain('{v}');
        expect(typeof p.measure).toBe('string');
      }
    }
  });
  it('M-159: the use sets are a partition of vocab.uses; each accessory / specific use carries its closed disclosure; zone_category_chapter maps chapters to vocab zones', () => {
    const keys = (o: Json) => Object.keys(o).filter((k) => k !== '$comment');
    const acc = keys(PVOCAB.accessory_structure_use); const spec = keys(PVOCAB.specific_use); const non = PVOCAB.non_accessory_use as string[];
    expect([...acc, ...spec, ...non].sort()).toEqual([...PVOCAB.uses].sort());
    expect(new Set([...acc, ...spec, ...non]).size).toBe(PVOCAB.uses.length);
    for (const k of acc) expect(PVOCAB.accessory_structure_use[k].disclosure).toMatch(/^rules for an? .+ on this lot are not part of this answer$/);
    for (const k of spec) expect(PVOCAB.specific_use[k].disclosure).toMatch(/^rules for an? .+ on this lot are not part of this answer$/);
    expect(PVOCAB.specific_use.school.section).toBe('150.48');
    for (const ch of keys(PVOCAB.zone_category_chapter)) for (const z of PVOCAB.zone_category_chapter[ch].zones) expect(PVOCAB.zone).toContain(z);
    expect(PVOCAB.zone_category_chapter['10'].zones).toEqual(PVOCAB.zone);
  });
  it('M-169: every non-threshold lot_condition token and every user_input is disclosed, data-filled, scenario-filled or M-158-specialised (closed, total)', () => {
    const b = PVOCAB.undetermined_condition_disclosure;
    const lc = Object.entries<Json>(PVOCAB.lot_condition).filter(([, x]) => !x.threshold && !x.generated).map(([k]) => k);
    const dc = PVOCAB.design_choice_disclosure;
    const cov = new Set([...Object.keys(b.lot_condition), ...b.data_filled, ...Object.keys(b.specialised), ...Object.keys(dc.lot_condition)]);
    expect(lc.filter((k) => !cov.has(k))).toEqual([]);
    const ucov = new Set([...Object.keys(b.user_input), ...b.scenario_filled, ...Object.keys(b.specialised), ...Object.keys(dc.user_input)]);
    expect((PVOCAB.user_input as string[]).filter((k) => !ucov.has(k))).toEqual([]);
    for (const k of [...Object.keys(b.lot_condition), ...b.data_filled]) expect(Object.keys(PVOCAB.lot_condition)).toContain(k);
    expect(b.template).toBe('If {condition}: {effect}.');
  });
  it('M-170: no_rear_lot_line is a lot_condition token with a disclosure phrase; DEFINE effects and condition overrides are closed per-unit sentences', () => {
    const b = PVOCAB.undetermined_condition_disclosure;
    expect(PVOCAB.lot_condition.no_rear_lot_line).toEqual({ patterns: ['has no rear lot line'] });
    expect(b.lot_condition.no_rear_lot_line).toBe('the lot has no rear lot line (a triangular lot)');
    expect(Object.keys(b.define_effect).filter((k) => k !== '$comment').sort()).toEqual(['5.10.40.40(1)#whole', '5.10.40.70(5)#whole']);
    expect(Object.keys(b.condition_override).filter((k) => k !== '$comment')).toEqual(['5.10.40.40(1)#whole']);
    expect(Object.keys(b.data_derivable_followup).sort()).toEqual(['no_rear_lot_line', 'shoreline_or_top_of_bank']);
  });
  it('M-171: GFA deductions that need building facts carry closed disclosure sentences (970.10.15.10(1) family)', () => {
    const b = PVOCAB.measure_deduction_disclosure;
    expect(b.measure).toBe('gfa_m2');
    const ids = Object.keys(b.sentences);
    expect(ids).toHaveLength(11);
    for (const id of ['970.10.15.10(1)#(1)(A)', '970.10.15.10(1)#(1)(B)', '970.10.15.10(1)#(1)(C)', '970.10.15.10(1)#(1)(D)']) expect(ids).toContain(id);
    for (const v of Object.values<string>(b.sentences)) expect(v).toMatch(/counted floor area may exclude .+.$/);
  });
  it('M-172: every undetermined token / input is in exactly one class (site fact or design choice); design choices carry achieved / restrictive templates', () => {
    const b = PVOCAB.undetermined_condition_disclosure; const dc = PVOCAB.design_choice_disclosure;
    const lc = Object.entries<Json>(PVOCAB.lot_condition).filter(([, x]) => !x.threshold && !x.generated).map(([k]) => k);
    for (const k of lc) {
      const n = [b.data_filled.includes(k), k in b.specialised, k in b.lot_condition, k in dc.lot_condition].filter(Boolean).length;
      expect([k, n]).toEqual([k, 1]);
    }
    for (const k of PVOCAB.user_input as string[]) {
      const n = [b.scenario_filled.includes(k), k in b.specialised, k in b.user_input, k in dc.user_input].filter(Boolean).length;
      expect([k, n]).toEqual([k, 1]);
    }
    expect(dc.achieved_template).toBe('{measure} {value} is achieved if: {conditions}.');
    expect(Object.keys(dc.lot_condition)).toEqual(expect.arrayContaining(['lowest_level_joists_1_0_to_1_5_m_for_80_pct', 'lowest_level_ceiling_2_4_m_for_80_pct', 'lowest_level_contains_dwelling_unit']));
  });
  it('M-173: houseplex 5–6 class gated on 600.60; driveway default override; main-wall-pair units disclosed; heritage / lane are data-filled', () => {
    const sc = PVOCAB.scenario_class_units.detached_houseplex_5_6;
    expect([sc.house_units, sc.ancillary_units, sc.outside_or_unheld]).toEqual([{ min: 5, max: 6, evaluated_at: 6 }, 0, 'not_evaluated:map_area_not_held']);
    const dc = PVOCAB.design_choice_disclosure;
    expect(dc.default_overrides.individual_private_driveway.taken_as).toBe(true);
    expect(dc.default_overrides.no_individual_private_driveway.disclosure).toBe('If the dwelling unit has no individual private driveway leading to its front: the minimum unit width is 5.0 m.');
    for (const rr of ['10.10.40.10(2)', '10.20.40.10(2)', '10.40.40.10(2)', '10.80.40.10(2)']) for (const c of ['(A)', '(B)']) expect(Object.keys(dc.unit_sentences)).toContain(`${rr}#(2)${c}`);
    // M-174: entrance height (4) + dormers (8) + 10.80.30.10(1)(B) (1)
    expect(Object.keys(dc.unit_sentences).filter((k) => k !== '$comment')).toHaveLength(21);
    expect(dc.unit_sentences['10.80.40.10(4)#whole']).toBe('The main pedestrian entrance may be no more than 1.2 m above established grade.');
    const b = PVOCAB.undetermined_condition_disclosure;
    expect(b.data_filled).toEqual(expect.arrayContaining(['heritage_property', 'abuts_lane']));
    expect(b.data_sources.heritage_property).toContain('parcels.is_heritage_designated');
    expect(b.data_sources.abuts_lane).toContain('parcels.abuts_laneway');
  });
  it('M-125: coa_mismatch is a vocab adjudication kind', () => {
    expect(PVOCAB.adjudication_kind).toContain('coa_mismatch');
  });
  it('M-128: side_yard_abuts_street is a lot_condition token licensed by the clause words, distinct from flanking_lot', () => {
    expect(PVOCAB.lot_condition.side_yard_abuts_street).toEqual({ patterns: ['side yard abuts a street'] });
    expect(PVOCAB.lot_condition.flanking_lot).toEqual({ patterns: ['flanking'] });
  });
  it('M-101: instrument_not_published_online is a vocab adjudication kind and source_defect kind', () => {
    expect(PVOCAB.adjudication_kind).toContain('instrument_not_published_online');
    expect(PVOCAB.disclosure_reason.source_defect).toContain('instrument_not_published_online');
  });
  it('M-94: a DISAPPLY whose cited regulation is absent is a counted refs_target_absent, not displaces_unresolved; "will prevent" is a backward trigger', async () => {
    const { checkXref, BACKWARD_TRIGGERS } = await XR;
    const { xrefFixtures } = await AFX;
    expect(PVOCAB.displacement_triggers.phrases).toContain('will prevent');
    expect(BACKWARD_TRIGGERS).toContain('will prevent');
    const f = xrefFixtures().find((x: Json) => x.name === 'displaces_unresolved');
    const red = checkXref(f.input);
    expect(red.violations.map((v: Json) => v.code)).toEqual(['displaces_unresolved']);
    const v = red.violations[0];
    const citation = /"[^"]*?\s?([0-9][^"\s]*)"/.exec(v.detail)![1];
    const reg = String(v.id).split('#')[0];
    const adj = [{ id: 'ADJ-fixture', kind: 'ref_target_absent', unit: reg, citation, reason: 'fixture', rule: 'fixture', adjudicator: 'operator' }];
    const green = checkXref({ ...f.input, adjudications: adj });
    expect([green.violations.map((x: Json) => x.code), green.counts.refs_target_absent]).toEqual([[], 1]);
    expect(checkXref({ ...f.input, adjudications: [{ ...adj[0], citation: 'other' }] }).violations.map((x: Json) => x.code)).toEqual(['displaces_unresolved']);
  });
});
