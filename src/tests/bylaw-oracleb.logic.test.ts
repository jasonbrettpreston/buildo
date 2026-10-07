// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (DSL, M-48, unlimited / unregulated / au),
//            §7.5 (precedence rules 0–7, 7a absence, M-49 tie-break, M-50 building type unknown),
//            §6.1 (provincial units, M-55); docs/specs/01-pipeline/69_mcbylaw_policy.md M-34, M-38, M-48..M-50, M-54, M-55;
//            .cursor/mcbylaw/phase2-plan-DRAFT.md §V-2 (oracle B)
//
// Oracle B unit tests. Every fixture here is synthetic and derived from the spec text only (oracle B is the
// independent cross-check of evaluate.mjs; it never reads that module, dsl.mjs or their tests). Each test names
// the spec sentence it locks.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const B = await load('scripts/analysis/bylaw/oracle-b/resolve.mjs');
const X = await load('scripts/analysis/bylaw/oracle-b/expr.mjs');

const J = (p: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8'));
const VOCAB = J('scripts/seeds/bylaw/vocab.json');
const ABS = J('scripts/seeds/bylaw/absence-rulings.json');
const EXT = J('scripts/seeds/bylaw/external.json');

interface UnitSpec {
  id: string; layer?: string; archetype?: string; target?: string; bound?: string; expr?: string;
  zones?: string[]; types?: string[]; cond?: Json | string; displaces?: string[]; ranks?: string;
  part?: string; refs?: string[]; exception?: string; include_ref?: string;
}
const mk = (u: UnitSpec): Json => {
  const [reg, clause] = u.id.split('#');
  return {
    unit_id: u.id, regulation_id: reg, clause_path: clause, layer: u.layer ?? 'base', archetype: u.archetype ?? 'LIMIT',
    target: u.target ?? 'none', bound: u.bound ?? 'none', numeric_expression: u.expr ? [u.expr] : 'none',
    application: { zones: u.zones ?? ['RD'], building_types: u.types ?? ['any'] }, condition: u.cond ?? 'none',
    displaces: u.displaces ?? [], ranks_layers: u.ranks ?? 'none', applies_to: { part: u.part ?? 'whole', refs: u.refs ?? [] },
    candidate: true, ...(u.exception ? { exception: u.exception } : {}), ...(u.include_ref ? { include_ref: u.include_ref } : {}),
  };
};
const lot = (o: Json = {}): Json => ({
  zone: 'RD', building_type: 'detached_house', exception: null, label: {}, overlays: {}, vars: {}, flags: {}, ...o,
});
const run = (units: Json[], l: Json, target: string, opts: Json = {}): Json =>
  B.createOracle({ units, vocab: VOCAB, absences: ABS, externals: opts.externals ?? null }).resolve(l, target);

describe('oracle B — expression parser (own Pratt parser, explicit precedence table)', () => {
  it('× binds tighter than +, operators are left-associative (§7.4 "usual precedence, left-associative")', () => {
    expect(X.importError).toBeUndefined();
    const v = X.evalStandalone('1.0 m + 2.0 m × 3 ratio', {});
    expect(v.k).toBe('num'); expect(v.v).toBeCloseTo(7); expect(v.u).toBe('m');
    expect(X.evalStandalone('10.0 m − 2.0 m − 3.0 m', {}).v).toBeCloseTo(5);
    expect(X.evalStandalone('12.0 m ÷ 2 ratio ÷ 2 ratio', {}).v).toBeCloseTo(3);
  });
  it('pct × metres scales by the percentage (25 pct × lot_depth_m)', () => {
    const v = X.evalStandalone('max(7.5 m; 25 pct × lot_depth_m)', { vars: { lot_depth_m: 33.56 } }, VOCAB);
    expect(v.v).toBeCloseTo(8.39, 6); expect(v.u).toBe('m');
  });
  it('a literal must carry a unit (literal := number unit)', () => {
    expect(X.evalStandalone('6.0', {}).reason).toBe('expression_error');
  });
  it('band keeps arm order and returns band_no_match when no arm holds (§7.4)', () => {
    const e = 'band(lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m and < 12.0 m: 0.9 m)';
    expect(X.evalStandalone(e, { vars: { lot_frontage_m: 9 } }, VOCAB).v).toBeCloseTo(0.9);
    expect(X.evalStandalone(e, { vars: { lot_frontage_m: 20 } }, VOCAB).reason).toBe('band_no_match');
  });
  it('unregulated is terminal: never an operand of max / min / arithmetic (M-54)', () => {
    expect(X.evalStandalone('max(unregulated; 10.0 m)', {}).reason).toBe('unregulated_in_arithmetic');
  });
  it('absent map arguments are dropped in max / min; all absent => all_map_arguments_absent (M-48)', () => {
    expect(X.evalStandalone('max(13.0 m; overlay(HT))', { overlays: {} }, VOCAB).v).toBeCloseTo(13);
    expect(X.evalStandalone('max(overlay(HT); label(f))', { overlays: {}, label: {} }, VOCAB).reason).toBe('all_map_arguments_absent');
  });
  it('label letter au is read in m2 (M-54)', () => {
    const v = X.evalStandalone('label(au)', { label: { au: 150 } }, VOCAB);
    expect(v.v).toBe(150); expect(v.u).toBe('m2');
  });
});

describe('oracle B — §7.5 precedence', () => {
  const side = (id: string, v: number, extra: Partial<UnitSpec> = {}) => mk({ id, target: 'side_setback_m', bound: 'min', expr: `side_setback_m = ${v} m @(3)`, ...extra });

  it('rule 0: a lot with no 569-2013 zone is not evaluated (M-27)', () => {
    expect(B.importError).toBeUndefined();
    const r = run([side('10.20.40.70(3)#(A)', 0.9)], lot({ zone: null }), 'side_setback_m');
    expect(r.status).toBe('not_evaluated'); expect(r.reason).toBe('no_569_2013_zone');
  });
  it('rule 4a: same layer, bound min => the largest', () => {
    const r = run([side('10.20.40.70(3)#(A)', 0.9), side('10.20.40.70(4)#(A)', 1.2)], lot(), 'side_setback_m');
    expect(r.status).toBe('value'); expect(r.value).toBeCloseTo(1.2); expect(r.winner).toBe('10.20.40.70(4)#(A)'); expect(r.evidence).toBe('clause');
  });
  it('rule 4a: two different exact values at one layer => conflict', () => {
    const u = (id: string, v: number) => mk({ id, archetype: 'DEFINE', target: 'required_lot_frontage_m', bound: 'exact', expr: `required_lot_frontage_m = ${v} m @(1)` });
    expect(run([u('10.20.30.20(1)#(A)', 9), u('10.20.30.20(1)#(B)', 12)], lot(), 'required_lot_frontage_m').status).toBe('conflict');
  });
  it('rule 4a: an applicable min above an applicable max => conflict', () => {
    const a = mk({ id: '10.20.40.10(1)#(A)', target: 'height_m', bound: 'max', expr: 'height_m = 8.0 m @(1)(A)' });
    const b = mk({ id: '10.20.40.10(9)#(A)', target: 'height_m', bound: 'min', expr: 'height_m = 9.0 m @(9)(A)' });
    expect(run([a, b], lot(), 'height_m').status).toBe('conflict');
  });
  it('rule 4: a higher layer replaces lower-layer units with the same bound direction (M-34)', () => {
    const exc = side('900.3.10(5)#SSP(A)', 0.6, { layer: 'exception', exception: '900.3.10(5)' });
    const r = run([side('10.20.40.70(3)#(A)', 0.9), exc], lot({ exception: '900.3.10(5)' }), 'side_setback_m');
    expect(r.value).toBeCloseTo(0.6); expect(r.winner).toBe('900.3.10(5)#SSP(A)');
  });
  it('rule 4: a different bound direction at a higher layer is additional', () => {
    const base = mk({ id: '10.20.40.10(1)#(A)', target: 'height_m', bound: 'max', expr: 'height_m = 10.0 m @(1)(A)' });
    const exc = mk({ id: '900.3.10(9)#SSP(A)', layer: 'exception', exception: '900.3.10(9)', target: 'height_m', bound: 'min', expr: 'height_m = 4.0 m @SSP(A)' });
    const r = run([base, exc], lot({ exception: '900.3.10(9)' }), 'height_m');
    expect(r.status).toBe('value'); expect(r.bounds).toEqual({ max: 10, min: 4 });
  });
  it('rule 2: a displacer with a target drops only units of its own target (M-48; corner-lot interior side yard)', () => {
    const interior = side('10.20.40.70(3)#(D)', 1.5);
    const street = mk({ id: '10.20.40.70(6)#whole', target: 'side_setback_street_m', bound: 'min', expr: 'side_setback_street_m = 3.0 m @#whole', displaces: ['10.20.40.70(3)'] });
    expect(run([interior, street], lot(), 'side_setback_m').value).toBeCloseTo(1.5);
  });
  it('rule 2: a DISAPPLY (no target) drops every unit it names', () => {
    const a = mk({ id: '10.20.40.40(1)#(A)', target: 'fsi', bound: 'max', expr: 'fsi = label(d) @(1)(A)' });
    const d = mk({ id: '10.20.40.40(1)#(C)', archetype: 'DISAPPLY', displaces: ['10.20.40.40(1)(A)'] });
    const r = run([a, d], lot({ label: { d: 0.6 } }), 'fsi');
    expect(r.status).toBe('not_evaluated'); expect(r.reason).toBe('no_candidate');
  });
  it('rule 2: an entry naming an argument path drops only that argument (M-48, 600.60.40(2)(A) vs (C)(ii))', () => {
    const c = mk({ id: '10.20.40.10(1)#(C)', target: 'height_m', bound: 'max', expr: 'height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)' });
    const disp = mk({ id: '10.20.40.10(7)#(A)', target: 'height_m', bound: 'min', expr: 'height_m = 1.0 m @(7)(A)', displaces: ['10.20.40.10(1)(C)(ii)'] });
    const r = run([c, disp], lot({ overlays: { HT: 8.5 } }), 'height_m');
    expect(r.bounds.max).toBeCloseTo(8.5);
  });
  it('rule 2: a displaced argument path that does not exist => displaced_argument_not_found', () => {
    const c = mk({ id: '10.20.40.10(1)#(C)', target: 'height_m', bound: 'max', expr: 'height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)' });
    const disp = mk({ id: '10.20.40.10(7)#(A)', archetype: 'DISAPPLY', displaces: ['10.20.40.10(1)(C)(iv)'] });
    expect(run([c, disp], lot({ overlays: { HT: 8.5 } }), 'height_m').reason).toBe('displaced_argument_not_found');
  });
  it('rule 3 + M-49: a unit displacing a ranking PROCEDURAL rule ranks just above the highest layer it ranks', () => {
    const proc = mk({ id: '900.1.10(3)#whole', archetype: 'PROCEDURAL', zones: ['any'], ranks: 'exception > base, overlay' });
    const exc = mk({ id: '900.3.10(9)#SSP(A)', layer: 'exception', exception: '900.3.10(9)', target: 'height_m', bound: 'max', expr: 'height_m = 9.0 m @SSP(A)' });
    const ov = mk({ id: '600.60.40(9)#(A)', layer: 'overlay', zones: ['RD'], target: 'height_m', bound: 'max', expr: 'height_m = 10.5 m @(9)(A)', displaces: ['900.1.10(3)'] });
    const r = run([proc, exc, ov], lot({ exception: '900.3.10(9)' }), 'height_m');
    expect(r.value).toBeCloseTo(10.5); expect(r.winner).toBe('600.60.40(9)#(A)');
    // without the displacement, the exception layer wins outright (rule 4)
    const ov2 = { ...ov, displaces: [] };
    expect(run([proc, exc, ov2], lot({ exception: '900.3.10(9)' }), 'height_m').value).toBeCloseTo(9);
  });
  it('rule 4a + M-48: unlimited loses to any finite max at the same layer', () => {
    const a = mk({ id: '10.20.40.40(1)#(B)', target: 'fsi', bound: 'max', expr: 'fsi = unlimited @(1)(B)' });
    const b = mk({ id: '10.20.40.40(2)#(A)', target: 'fsi', bound: 'max', expr: 'fsi = 0.6 ratio @(2)(A)' });
    expect(run([a], lot(), 'fsi').status).toBe('unlimited');
    expect(run([a, b], lot(), 'fsi').value).toBeCloseTo(0.6);
  });
  it('M-54: an unregulated result carries the clause that says so; a finite bound at the same layer beats it', () => {
    const a = mk({ id: '10.20.30.40(1)#(B)', target: 'lot_coverage_pct', bound: 'max', expr: 'lot_coverage_pct = unregulated @(1)(B)', cond: { if: 'not mapped(LC)', tokens: ['overlay_mapped'] } });
    const r = run([a], lot(), 'lot_coverage_pct');
    expect(r.status).toBe('unregulated'); expect(r.winner).toBe('10.20.30.40(1)#(B)'); expect(r.clause).toBe('(1)(B)'); expect(r.evidence).toBe('clause');
    const b = mk({ id: '10.20.30.40(2)#(A)', target: 'lot_coverage_pct', bound: 'max', expr: 'lot_coverage_pct = 40 pct @(2)(A)' });
    expect(run([a, b], lot(), 'lot_coverage_pct').value).toBe(40);
  });
  it('M-54: a higher layer replaces an unregulated lower layer', () => {
    const a = mk({ id: '10.20.30.40(1)#(B)', target: 'lot_coverage_pct', bound: 'max', expr: 'lot_coverage_pct = unregulated @(1)(B)' });
    const e = mk({ id: '900.3.10(9)#SSP(A)', layer: 'exception', exception: '900.3.10(9)', target: 'lot_coverage_pct', bound: 'max', expr: 'lot_coverage_pct = 35 pct @SSP(A)' });
    expect(run([a, e], lot({ exception: '900.3.10(9)' }), 'lot_coverage_pct').value).toBe(35);
  });
  it('rule 7a: R-zone coverage with no candidate of any layer => unregulated by absence (ABS-1), never a clause', () => {
    const r = run([], lot({ zone: 'R' }), 'lot_coverage_pct');
    expect(r.status).toBe('unregulated'); expect(r.evidence).toBe('absence'); expect(r.absence_id).toBe('ABS-1'); expect(r.winner).toBeNull();
  });
  it('rule 7a: an uncaptured exception keeps it no_candidate; other zones stay no_candidate (rule 7)', () => {
    expect(run([], lot({ zone: 'R', exception: '900.2.10(77)' }), 'lot_coverage_pct').reason).toBe('no_candidate');
    expect(run([], lot({ zone: 'RD' }), 'lot_coverage_pct').reason).toBe('no_candidate');
  });
  it('rule 5: a PREVAILING unit never changes the value; it adds "alternate path not evaluated"', () => {
    const e = '900.3.10(1463)';
    const p = mk({ id: `${e}#PBS(A)`, layer: 'exception', exception: e, archetype: 'PREVAILING' });
    const r = run([side('10.20.40.70(3)#(A)', 0.9), p], lot({ exception: e }), 'side_setback_m');
    expect(r.value).toBeCloseTo(0.9); expect(r.notes).toContain(`alternate_path_not_evaluated:${e}#PBS(A)`);
  });
  it('rule 1: INCLUDE expands the lot exception transitively (RD 254 (C) -> 1462)', () => {
    const inc = mk({ id: '900.3.10(254)#SSP(C)', layer: 'exception', exception: '900.3.10(254)', archetype: 'INCLUDE', include_ref: '900.3.10(1462)' });
    const g = mk({ id: '900.3.10(1462)#SSP(A)', layer: 'exception', exception: '900.3.10(1462)', target: 'gfa_m2', bound: 'max', expr: 'gfa_m2 = if(lot_area_m2 < 408 m2; min(0.6 ratio × lot_area_m2; 204 m2); 0.4 ratio × lot_area_m2) @SSP(A)' });
    const r = run([inc, g], lot({ exception: '900.3.10(254)', vars: { lot_area_m2: 300 } }), 'gfa_m2');
    expect(r.value).toBeCloseTo(180);
    expect(run([g], lot({ exception: '900.3.10(254)', vars: { lot_area_m2: 300 } }), 'gfa_m2').reason).toBe('no_candidate');
  });
  it('M-50: building type unknown — a value only when every residential type agrees', () => {
    const all = side('10.20.40.70(3)#(A)', 0.9);
    expect(run([all], lot({ building_type: null }), 'side_setback_m').value).toBeCloseTo(0.9);
    const det = side('10.20.40.70(3)#(B)', 1.2, { types: ['detached_house'] });
    const r = run([all, det], lot({ building_type: null }), 'side_setback_m');
    expect(r.status).toBe('not_evaluated'); expect(r.reason).toBe('needs_user_input:building_type'); expect(r.per_type.detached_house.value).toBeCloseTo(1.2);
  });
  it('building type parent: a unit for detached_houseplex applies to a triplex', () => {
    const u = side('10.20.40.70(3)#(A)', 0.9, { types: ['detached_houseplex'] });
    expect(run([u], lot({ building_type: 'triplex' }), 'side_setback_m').value).toBeCloseTo(0.9);
  });
  it('by_type: other arm; an unlisted type without other => by_type_unlisted (M-48)', () => {
    const h = mk({ id: '10.80.40.10(1)#(B)', zones: ['RM'], target: 'height_m', bound: 'max', expr: 'height_m = by_type(detached_house: 10.0 m; other: 12.0 m) @(1)(B)' });
    expect(run([h], lot({ zone: 'RM', building_type: 'townhouse' }), 'height_m').value).toBeCloseTo(12);
    const n = { ...h, numeric_expression: ['height_m = by_type(detached_house: 10.0 m) @(1)(B)'] };
    expect(run([n], lot({ zone: 'RM', building_type: 'townhouse' }), 'height_m').reason).toBe('by_type_unlisted');
  });
  it('a condition token with no lot value: the unit is evaluated both ways; differing results => not_evaluated', () => {
    const c = side('10.20.40.70(5)#(A)', 3.0, { cond: { if: 'none', tokens: ['corner_lot'] } });
    const base = side('10.20.40.70(3)#(A)', 0.9);
    expect(run([base, c], lot({ flags: { corner_lot: true } }), 'side_setback_m').value).toBeCloseTo(3);
    expect(run([base, c], lot({ flags: { corner_lot: false } }), 'side_setback_m').value).toBeCloseTo(0.9);
    const r = run([base, c], lot(), 'side_setback_m');
    expect(r.status).toBe('not_evaluated'); expect(r.reason).toBe('condition_unknown');
  });
  it('a user-input token with no value => needs_user_input:<input> (vocab lot_condition.user_input)', () => {
    const d = mk({ id: '10.20.40.40(1)#(C)', archetype: 'DISAPPLY', displaces: ['10.20.40.40(1)(A)'], cond: { if: 'none', tokens: ['has_secondary_suite'] } });
    const a = mk({ id: '10.20.40.40(1)#(A)', target: 'fsi', bound: 'max', expr: 'fsi = 0.6 ratio @(1)(A)' });
    expect(run([a, d], lot(), 'fsi').reason).toBe('needs_user_input:has_secondary_suite');
  });
  it('a variable that is a dsl_target resolves through effective() (required_lot_frontage_m from label f)', () => {
    const f = mk({ id: '10.20.30.20(1)#(A)', archetype: 'DEFINE', target: 'required_lot_frontage_m', bound: 'exact', expr: 'required_lot_frontage_m = label(f) @(1)(A)', cond: { if: 'labelled(f)', tokens: ['label_value'] } });
    const f2 = mk({ id: '10.20.30.20(1)#(B)', archetype: 'DEFINE', target: 'required_lot_frontage_m', bound: 'exact', expr: 'required_lot_frontage_m = 12.0 m @(1)(B)', cond: { if: 'not labelled(f)', tokens: ['label_value'] } });
    const s = side('10.20.40.70(3)#(B)', 0.9, { cond: { if: 'required_lot_frontage_m ≥ 6.0 m and required_lot_frontage_m < 12.0 m', tokens: ['required_frontage_band'] } });
    const s2 = side('10.20.40.70(3)#(C)', 1.2, { cond: { if: 'required_lot_frontage_m ≥ 12.0 m and required_lot_frontage_m < 15.0 m', tokens: ['required_frontage_band'] } });
    expect(run([f, f2, s, s2], lot({ label: { f: 9 } }), 'side_setback_m').value).toBeCloseTo(0.9);
    expect(run([f, f2, s, s2], lot(), 'side_setback_m').value).toBeCloseTo(1.2);
  });
  it('a target cycle is not_evaluated:target_cycle', () => {
    const a = mk({ id: '10.20.40.10(1)#(A)', target: 'height_m', bound: 'max', expr: 'height_m = main_wall_height_m + 1.0 m @(1)(A)' });
    const b = mk({ id: '10.20.40.10(2)#whole', target: 'main_wall_height_m', bound: 'max', expr: 'main_wall_height_m = height_m − 2.5 m @#whole' });
    expect(run([a, b], lot(), 'height_m').reason).toBe('target_cycle');
  });
  it('existing(var; enacted(569-2013)) needs as-built input; the enactment date resolves from the pinned page header', () => {
    const u = mk({ id: '900.3.10(587)#SSP(A)', layer: 'exception', exception: '900.3.10(587)', target: 'lot_frontage_min_m', bound: 'min', expr: 'lot_frontage_min_m = existing(lot_frontage_m; enacted(569-2013)) @SSP(A)' });
    const r = run([u], lot({ exception: '900.3.10(587)' }), 'lot_frontage_min_m');
    expect(r.reason).toBe('existing_building_facts');
    expect(r.trace.join(' ')).toContain('2013-05-09');
    const r2 = run([u], lot({ exception: '900.3.10(587)', existing: { lot_frontage_m: { '2013-05-09': 11.2 } } }), 'lot_frontage_min_m');
    expect(r2.value).toBeCloseTo(11.2);
  });
  it('a unit whose unit of measure differs from the target unit is never a candidate (rule 1, G-CLAUSE)', () => {
    const u = side('10.20.40.70(3)#(A)', 0.9);
    const bad = mk({ id: '10.20.40.70(3)#(B)', target: 'side_setback_m', bound: 'min', expr: 'side_setback_m = 5 pct @(3)(B)' });
    const r = run([u, bad], lot(), 'side_setback_m');
    expect(r.value).toBeCloseTo(0.9); expect(r.notes.join(' ')).toContain('unit_mismatch');
  });
});

describe('oracle B — provincial layer (Spec 68 §6.1, Spec 69 M-55)', () => {
  const lc = (v: string) => mk({ id: '10.20.30.40(1)#(A)', target: 'lot_coverage_pct', bound: 'max', expr: `lot_coverage_pct = ${v} @(1)(A)` });
  const aru = (o: Json = {}) => lot({ flags: { has_secondary_suite: true, has_garden_suite: false, has_laneway_suite: false }, ...o });
  const ext = { externals: EXT };

  it('coverage: a by-law permitting more prevails (s.5(2)); otherwise the provincial 45 % stands', () => {
    expect(run([lc('35 pct')], aru(), 'lot_coverage_pct', ext).value).toBe(45);
    expect(run([lc('50 pct')], aru(), 'lot_coverage_pct', ext).value).toBe(50);
    expect(run([lc('unregulated')], aru(), 'lot_coverage_pct', ext).status).toBe('unregulated');
  });
  it('FSI: "no limit" never yields (bylaw_prevails never) => unlimited', () => {
    const f = mk({ id: '10.20.40.40(1)#(A)', target: 'fsi', bound: 'max', expr: 'fsi = 0.6 ratio @(1)(A)' });
    const r = run([f], aru(), 'fsi', ext);
    expect(r.status).toBe('unlimited'); expect(r.winner).toBe('O.Reg.299/19 s.5(1)2'); expect(r.evidence).toBe('provincial');
  });
  it('out of scope (no additional residential unit, or not a house type) => the by-law value', () => {
    const noAru = lot({ flags: { has_secondary_suite: false, has_garden_suite: false, has_laneway_suite: false } });
    expect(run([lc('35 pct')], noAru, 'lot_coverage_pct', ext).value).toBe(35);
    expect(run([lc('35 pct')], aru({ building_type: 'apartment_building' }), 'lot_coverage_pct', ext).value).toBe(35);
  });
  it('separation: a provincial-only target is additional (rule 6), applied with an ancillary unit', () => {
    const l = lot({ flags: { has_secondary_suite: false, has_garden_suite: true, has_laneway_suite: false } });
    expect(run([], l, 'separation_m', ext).value).toBe(4);
  });
});

describe('oracle B — permitted() (§7.5, M-38 fixture shape)', () => {
  it('a PERMIT displacing 900.1.10(3) beats an exception PROHIBIT of the same type (rule 3 via permitted)', () => {
    const proc = mk({ id: '900.1.10(3)#whole', archetype: 'PROCEDURAL', zones: ['any'], ranks: 'exception > base, overlay' });
    const pro = mk({ id: '900.3.10(9)#SSP(A)', layer: 'exception', exception: '900.3.10(9)', archetype: 'PROHIBIT', types: ['detached_houseplex'] });
    const per = mk({ id: '600.60.40(1)#(B)', layer: 'overlay', archetype: 'PERMIT', types: ['detached_houseplex'], displaces: ['900.1.10(3)'] });
    const o = B.createOracle({ units: [proc, pro, per], vocab: VOCAB, absences: ABS });
    expect(o.permitted(lot({ exception: '900.3.10(9)' }), 'detached_houseplex').status).toBe('permitted');
    const o2 = B.createOracle({ units: [proc, pro, { ...per, displaces: [] }], vocab: VOCAB, absences: ABS });
    expect(o2.permitted(lot({ exception: '900.3.10(9)' }), 'detached_houseplex').status).toBe('prohibited');
  });
});

describe('oracle B harness — pairwise covering array (Phase 2 plan §V-1b)', () => {
  it('covers 100 % of value pairs, computed from the rows, and is deterministic for a seed', async () => {
    const P = await load('scripts/analysis/bylaw/oracle-b/pairwise.mjs');
    expect(P.importError).toBeUndefined();
    const dims = [{ name: 'a', values: [1, 2, 3] }, { name: 'b', values: ['x', 'y'] }, { name: 'c', values: [true, false, null, 0] }, { name: 'd', values: [0, 1] }];
    const r1 = P.pairwise(dims, P.seedOf('s'));
    const r2 = P.pairwise(dims, P.seedOf('s'));
    expect(r1.pairs_covered).toBe(r1.pairs_total);
    expect(r1.pairs_total).toBe(3 * 2 + 3 * 4 + 3 * 2 + 2 * 4 + 2 * 2 + 4 * 2);
    expect(r1.rows).toEqual(r2.rows);
    expect(r1.rows.length).toBeLessThan(3 * 2 * 4 * 2);
  });
});

describe('oracle B — fail closed on malformed units (DeepSeek review lenses, adjudicated)', () => {
  it('a statement that fails to parse stays a candidate (expression_error), never an absence-based unregulated', () => {
    const bad = mk({ id: '10.10.30.40(1)#(A)', zones: ['R'], target: 'lot_coverage_pct', bound: 'max', expr: 'lot_coverage_pct = 33' });
    const r = run([bad], lot({ zone: 'R' }), 'lot_coverage_pct');
    expect(r.status).toBe('not_evaluated'); expect(r.reason).toBe('expression_error');
  });
  it('a threshold token with no `if` is undecidable, never unconditional', () => {
    const base = mk({ id: '10.20.40.70(3)#(A)', target: 'side_setback_m', bound: 'min', expr: 'side_setback_m = 0.9 m @(3)(A)' });
    const t = mk({ id: '10.20.40.70(3)#(B)', target: 'side_setback_m', bound: 'min', expr: 'side_setback_m = 1.2 m @(3)(B)', cond: { if: 'none', tokens: ['frontage_band'] } });
    expect(run([base, t], lot(), 'side_setback_m').reason).toBe('expression_error');
  });
});
