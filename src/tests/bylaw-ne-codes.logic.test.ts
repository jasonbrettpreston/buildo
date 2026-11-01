// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-339 ("Every NOT_EVALUATED code the evaluator can emit
//            has a test fixture that produces it"), M-232; docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5/§7.6.
//
// M-339 fixture table: one small fixture per NOT_EVALUATED code, run through the evaluator's own evaluate() (the
// expression-level codes) or effective() over the fixture units (the unit-level codes); each fixture names the reason
// the evaluator must return. The table and NOT_EVALUATED_CODES list the same codes (both ways) and no code may be
// declared unproducible: L1 compares all of them.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

const VOCAB = read('src/tests/fixtures/bylaw/eval-vocab.json');
const ALL_UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units;
const UNITS = ALL_UNITS.filter((u) => u.candidate);
const C: Json = E.makeContext ? E.makeContext(VOCAB, { enactments: {} }) : {};

// The real fixture unit shape (eval-units.json): every field the loader and the rules read, spread under the override.
const BASE = ALL_UNITS.find((u) => u.candidate && u.archetype === 'LIMIT');
const DIS = ALL_UNITS.find((u) => u.candidate && u.archetype === 'DISAPPLY') || BASE;
const U = (o: Json): Json => ({
  ...BASE, candidate: true, layer: 'base', archetype: 'LIMIT', bound: 'min', displaces: [], condition: 'none',
  applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, numeric_expression: 'none', ...o,
});
// A candidate set as the loader delivers it for the lot under test (no fallback to raw units).
const cands = (units: Json[], l: Json): Json[] => E.loadCandidates(l, units).candidates;
const lot = (o: Json = {}): Json => ({ zone: 'RD', label: {}, overlays: {}, vars: {}, flags: {}, building_type: 'detached_house', ...o });
// A fixture runs one call and returns its result; `reason` is what that call must answer (a code, or code:detail).
interface Fixture { reason: string; run: () => Json }
const ex = (reason: string, expr: string, l: Json = lot()): Fixture => ({ reason, run: () => (E.evaluate ? E.evaluate(expr, l, C) : {}) });
const eff = (reason: string, units: Json[], l: Json = lot(), target = 'side_setback_m'): Fixture => ({
  reason, run: () => (E.effective ? E.effective(l, target, cands(units, l), C) : {}),
});
// The stock DISAPPLY fixture unit applies to a houseplex only; the displacement fixtures need any building type.
const ANY = { zones: ['RD'], building_types: ['any'] };
const DISP = (o: Json): Json => ({ ...DIS, application: ANY, ...o });
const HC = U({
  unit_id: '10.20.40.10(1)#(C)', regulation_id: '10.20.40.10(1)', target: 'height_m', bound: 'max',
  numeric_expression: ['height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)'],
});

// One table, one fixture per NOT_EVALUATED code (a code listed twice or missing reds the L1 lock below).
const FIXTURES: Record<string, Fixture> = {
  // max() of two tagged arguments, both removed by an applicable DISAPPLY (§7.4 argument-level displacement, M-48)
  all_arguments_displaced: eff('all_arguments_displaced', [
    HC,
    DISP({ unit_id: '10.20.40.10(7)#(A)', regulation_id: '10.20.40.10(7)', displaces: ['10.20.40.10(1)(C)(i)', '10.20.40.10(1)(C)(ii)'] }),
  ], lot({ overlays: { HT: 8.5 } }), 'height_m'),
  // max() whose every argument is an absent map / label value (M-48)
  all_map_arguments_absent: ex('all_map_arguments_absent', 'x_m = max(overlay(HT); label(f)) @x'),
  // band() with no matching arm
  band_no_match: ex('band_no_match', 'side_setback_m = band(lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m and < 12.0 m: 0.9 m) @(3)', lot({ vars: { lot_frontage_m: 13 } })),
  // by_type() with no arm for the lot's type and no `other`
  by_type_unlisted: ex('by_type_unlisted:detached_house', 'x_m = by_type(townhouse: 2 m) @x'),
  // an undecided lot-condition token whose two resolutions disagree
  condition_unknown: eff('condition_unknown:corner_lot', [
    U({ unit_id: '10.20.40.70(3)#(A)', regulation_id: '10.20.40.70(3)', target: 'side_setback_m', condition: { tokens: ['corner_lot'], if: 'none' }, numeric_expression: ['side_setback_m = 0.9 m @(3)(A)'] }),
  ], lot({ flags: {} })),
  // a displaces[] entry naming an argument path the named unit does not tag
  displaced_argument_not_found: eff('displaced_argument_not_found:(C)(iv)', [
    HC,
    DISP({ unit_id: '10.20.40.10(7)#(A)', regulation_id: '10.20.40.10(7)', displaces: ['10.20.40.10(1)(C)(iv)'] }),
  ], lot({ overlays: { HT: 8.5 } }), 'height_m'),
  // division by zero
  division_by_zero: ex('division_by_zero', 'x = lot_area_m2 ÷ lot_depth_m @x', lot({ vars: { lot_area_m2: 1, lot_depth_m: 0 } })),
  // existing(…; enacted(<by-law>)) with no enactment date in the context
  enactment_date_unknown: ex('enactment_date_unknown:569-2013', 'front_setback_m = existing(lot_frontage_m; enacted(569-2013)) @(4)(A)'),
  // the lot's exception is not authored for any target (ruling (d))
  exception_not_authored: eff('exception_not_authored:900.2.10(777)', UNITS, lot({ exception: '900.2.10(777)' })),
  // existing(…) with no as-built input for the variable (M-41)
  existing_building_facts: ex('existing_building_facts:lot_frontage_m', 'front_setback_m = existing(lot_frontage_m; 2013-05-09) @(4)(B)'),
  // a statement that does not parse is a named code, never a throw
  expression_error: ex('expression_error:bad_unit', 'x_m = 1.8 @(A)'),
  // a lot label letter outside vocab.label_letter (ruling (e))
  label_letter_unknown: eff('label_letter_unknown:q', [
    U({ unit_id: 'SYN#(3)(A)', regulation_id: 'SYN', target: 'side_setback_m', numeric_expression: ['side_setback_m = 0.9 m @(3)(A)'] }),
  ], lot({ label: { q: 5 } })),
  // label() at a letter the lot's label does not carry
  label_value_absent: ex('label_value_absent:f', 'required_lot_frontage_m = label(f) @(1)(A)', lot({ label: {} })),
  // a unit scoped to a map area the lot's map_areas are not held for (M-41)
  map_area_not_held: eff('map_area_not_held:Eglinton Avenue West', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', target: 'side_setback_m', applies_to: { part: 'map_area', refs: ['Eglinton Avenue West'] }, numeric_expression: ['side_setback_m = 7.5 m @(A)'] }),
  ]),
  // a bare overlay() the held map carries no value for (outside max/min: never dropped)
  map_value_absent: ex('map_value_absent:HT', 'height_m = overlay(HT) @(1)(D)', lot({ overlays: {} })),
  // a variable that is neither a target nor a declared user input and is not in the lot vector
  missing_input: ex('missing_input:lot_frontage_m', 'x = lot_frontage_m + 1 m @x', lot({ vars: {} })),
  // a lot-scoped unit (named addresses) on a lot with no address to match (M-41)
  named_lots_only: eff('named_lots_only', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', target: 'side_setback_m', applies_to: { part: 'named_addresses', refs: ['1160 and 1162 Pharmacy Ave.'] }, numeric_expression: ['side_setback_m = 5.4 m @(A)'] }),
  ]),
  // a declared user input (vocab.user_input) used as an arithmetic operand with no value (evaluate:345)
  needs_user_input: ex('needs_user_input:bedroom_count', 'x = bedroom_count + 1 units @x'),
  // rule 0: the lot carries no 569-2013 residential zone (M-27)
  no_569_2013_zone: eff('no_569_2013_zone', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', target: 'side_setback_m', numeric_expression: ['side_setback_m = 0.9 m @(A)'] }),
  ], lot({ zone: null })),
  // rule 7: the lot's zone has candidates but none of them applies to it
  no_candidate: eff('no_candidate', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', target: 'side_setback_m', numeric_expression: ['side_setback_m = 0.9 m @(A)'] }),
  ], lot({ zone: 'R' })),
  // a variable whose own effective() is an eval_conflict (two different exact values)
  referenced_target_conflict: eff('referenced_target_conflict:required_lot_frontage_m', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = 12.0 m @(A)'] }),
    U({ unit_id: 'SYN#(B)', regulation_id: 'SYN', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = 15.0 m @(B)'] }),
    U({ unit_id: 'SYN#(C)', regulation_id: 'SYN', target: 'side_setback_m', numeric_expression: ['side_setback_m = band(required_lot_frontage_m; < 13 m: 1.2 m; ≥ 13 m: 1.5 m) @(C)'] }),
  ]),
  // two targets that reference each other
  target_cycle: eff('target_cycle', [
    U({ unit_id: 'SYN#(A)', regulation_id: 'SYN', target: 'side_setback_m', bound: 'max', numeric_expression: ['side_setback_m = height_m + 1.0 m @(A)'] }),
    U({ unit_id: 'SYN#(B)', regulation_id: 'SYN', target: 'height_m', bound: 'max', numeric_expression: ['height_m = side_setback_m − 2.5 m @(B)'] }),
  ], lot(), 'height_m'),
  // `unlimited` (no cap) is terminal, never a number in arithmetic (M-54 note)
  unlimited_in_arithmetic: ex('unlimited_in_arithmetic', 'lot_coverage_pct = unlimited + 5 pct @x'),
  // `unregulated` is terminal, never a number in arithmetic (M-54)
  unregulated_in_arithmetic: ex('unregulated_in_arithmetic', 'lot_coverage_pct = unregulated + 5 pct @x'),
};
// No code may be declared unproducible: the table above must produce every code (M-339).
const UNPRODUCIBLE: Record<string, string> = {};

// The reason string of a result, wherever the module reports it, or a marker naming what it gave instead.
const reasonOf = (r: Json): string => {
  const s = r.not_evaluated ?? r.reason;
  return s === undefined || s === null ? `evaluated:${String(r.status)}` : String(s);
};

describe('M-339 — one fixture per NOT_EVALUATED code', () => {
  it.each(Object.keys(FIXTURES).sort())('%s: the fixture produces exactly that reason', (code) => {
    expect(E.importError).toBeUndefined();
    const f = FIXTURES[code]!;
    const got = reasonOf(f.run());
    expect(got.split(':')[0]).toBe(code);
    expect(got).toBe(f.reason); // the detail the code carries, pinned
  });
  it('LOCK L1: the fixture table and NOT_EVALUATED_CODES list the same codes, both ways', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...(E.NOT_EVALUATED_CODES || [])].sort());
    expect(Object.keys(FIXTURES)).toHaveLength(24);
  });
  it('no code is declared unproducible: the set stays empty', () => {
    expect(Object.keys(UNPRODUCIBLE)).toEqual([]);
  });
});
