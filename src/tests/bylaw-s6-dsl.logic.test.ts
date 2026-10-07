// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (DSL grammar + S1 additions), §7.2 (value_form),
//            §7.3 (per-archetype shape; archetype × value_form fixtures from real text); docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-48; docs/reports/mcbylaw-phase1-plan.md S6 (DSL parser + canonicalizer part)
//
// S6 (DSL part) unit tests: every §7.4 construct and every M-48 addition parses; each closed error code has a
// known-bad input; the canonical form sorts exactly max / min / + / × / by_type keys and keeps if / band order;
// value_form derives from the outermost head; the static unit check binds literal units to their variable or target;
// and the archetype × value_form fixtures from the §7.3 clauses (S0.5 units, promoted) parse with every literal
// present in the cited clause text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const D = await load('scripts/analysis/bylaw/dsl.mjs');
const FIX = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/bylaw/eval-units.json'), 'utf8'));
const VOCAB = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/bylaw/eval-vocab.json'), 'utf8'));
const UNITS: Json[] = FIX.units;

const code = (fn: () => unknown): string => {
  try { fn(); return 'no_error'; } catch (err) { return (err as { code?: string }).code ?? `untyped:${String(err)}`; }
};

describe('§7.4 grammar — every construct parses', () => {
  it.each([
    ['literal, each unit', ['x_m = 1.8 m @(A)', 'a_m2 = 204 m2 @(A)', 'p_pct = 50 pct @(A)', 's = 3 storeys @(A)', 'u = 6 units @(A)', 'f = 0.6 ratio @(A)']],
    ['variable + arithmetic with precedence', ['rear_setback_m = 7.5 m + 25 pct × lot_depth_m @(2)', 'x_m = (height_m − 2.5 m) ÷ 2 ratio @(2)']],
    ['max / min', ['rear_setback_m = max(7.5 m; 25 pct × lot_depth_m) @#whole', 'gfa_m2 = min(0.6 ratio × lot_area_m2; 204 m2) @SSP(A)']],
    ['band with literal arms', ['side_setback_m = band(required_lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m and < 12.0 m: 0.9 m; ≥ 30.0 m: 3.0 m) @(3)']],
    ['if', ['gfa_m2 = if(lot_area_m2 < 408 m2; 204 m2; 279 m2) @SSP(A)']],
    ['by_type', ['lot_frontage_min_m = by_type(detached_house: 12.0 m; semi_detached_house: 18.0 m) @SSP(B)']],
    ['existing(variable; date)', ['lot_frontage_min_m = existing(lot_frontage_m; 2013-05-09) @SSP(A)']],
    ['label / overlay', ['fsi = label(d) @(1)(A)', 'height_m = overlay(HT) @(1)(A)']],
  ])('%s', (_name, statements) => {
    for (const s of statements as string[]) expect({ s, code: code(() => D.parseStatement(s)) }).toEqual({ s, code: 'no_error' });
  });
});

describe('§7.4 S1 additions (Spec 69 M-48) — each parses and keeps its meaning', () => {
  it('unlimited is a value: 10.20.40.40(1)(B) fsi = unlimited', () => {
    expect(D.parseStatement('fsi = unlimited @(1)(B)').expr).toEqual({ type: 'unlimited' });
  });
  it('presence tests mapped / labelled / not, and label(u) < 6 units', () => {
    expect(D.canonCond(D.parseCond('not mapped(HT)'))).toBe('not(mapped(HT))');
    expect(D.canonCond(D.parseCond('labelled(u) and label(u) < 6 units'))).toBe('and(labelled(u);label(u)<6units)');
    expect(D.canonCond(D.parseCond('not labelled(f)'))).toBe('not(labelled(f))');
  });
  it('an absent-map argument is legal inside max: max(13.0 m; overlay(HT))', () => {
    expect(code(() => D.parseStatement('height_m = max(13.0 m; overlay(HT)) @(1)(D)(i)'))).toBe('no_error');
  });
  it('`other` in by_type', () => {
    const s = D.parseStatement('height_m = by_type(detached_house: 10.0 m; semi_detached_house: 10.0 m; other: 12.0 m) @(1)(B)');
    expect(s.expr.entries.map((e: Json) => e.key)).toEqual(['detached_house', 'semi_detached_house', 'other']);
  });
  it('multi-token conditions are a conjunction: token order does not change the canonical form', () => {
    expect(D.canonicalCondition({ tokens: ['corner_lot', 'adjacent_lot_fronts_flanking_street'], if: 'required_lot_frontage_m ≥ 12.0 m' }))
      .toBe(D.canonicalCondition({ tokens: ['adjacent_lot_fronts_flanking_street', 'corner_lot'], if: 'required_lot_frontage_m >= 12 m' }));
  });
  it('argument-level clause tags: max(overlay(HT) @(C)(i); 10.0 m @(C)(ii))', () => {
    const s = D.parseStatement('height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)');
    expect({ path: s.path, args: D.argPathsOf(s.expr) }).toEqual({ path: '(1)(C)', args: ['(C)(i)', '(C)(ii)'] });
  });
  it('enacted(<by-law>) as the existing() date', () => {
    expect(D.parseStatement('lot_frontage_min_m = existing(lot_frontage_m; enacted(569-2013)) @SSP(A)').expr).toEqual({ type: 'existing', var: 'lot_frontage_m', enacted: '569-2013' });
  });
  it('ratio is a literal unit: 0.6 ratio × lot_area_m2', () => {
    expect(D.checkStatement('gfa_m2 = 0.6 ratio × lot_area_m2 @(A)', VOCAB)).toEqual([]);
  });
});

describe('operator ruling 2026-10-07 (Spec 69 M-54): `unregulated` and label letter `au`', () => {
  it('unregulated parses as its own value, distinct from unlimited', () => {
    expect(D.parseStatement('lot_coverage_pct = unregulated @(1)(B)').expr).toEqual({ type: 'unregulated' });
    expect(D.canonicalStatement('lot_coverage_pct = unregulated @(1)(B)')).not.toBe(D.canonicalStatement('lot_coverage_pct = unlimited @(1)(B)'));
  });
  it('unregulated is a value: value_form literal (§7.2); legal as a band / if / by_type arm', () => {
    expect(D.valueForm(['lot_coverage_pct = unregulated @(1)(B)'])).toBe('literal');
    expect(D.checkStatement('lot_coverage_pct = if(lot_frontage_m < 6 m; unregulated; 50 pct) @x', VOCAB)).toEqual([]);
    expect(code(() => D.parseStatement('lot_coverage_pct = band(lot_frontage_m; < 6 m: unregulated; ≥ 6 m: 50 pct) @x'))).toBe('no_error');
  });
  it('unregulated is terminal: never an operand of arithmetic, max or min', () => {
    expect(D.checkStatement('lot_coverage_pct = unregulated + 5 pct @x', VOCAB)).toContain('unregulated_not_terminal');
    expect(D.checkStatement('lot_coverage_pct = max(unregulated; 50 pct) @x', VOCAB)).toContain('unregulated_not_terminal');
  });
  it('label letter au (10.5.1.10(3)(C): required minimum lot area for each dwelling unit, m²) binds to an m2 target', () => {
    expect(D.checkStatement('lot_area_per_unit_min_m2 = label(au) @(2)', VOCAB)).toEqual([]);
    expect(D.checkStatement('lot_frontage_min_m = label(au) @(2)', VOCAB).map((e: string) => e.split(':')[0])).toContain('unit_mismatch');
  });
});

describe('closed error codes — one known-bad input each (+ the good twin above)', () => {
  it.each([
    ['bad_unit', 'side_setback_m = 1.8 @(A)'],
    ['bad_unit', 'side_setback_m = 1.8 metres @(A)'],
    ['bad_clause_path', 'side_setback_m = 1.8 m'],
    ['bad_clause_path', 'side_setback_m = 1.8 m @ ;'],
    ['bad_target', 'max = 1.8 m @(A)'],
    ['bad_target', 'unregulated = 1.8 m @(A)'],
    ['unknown_function', 'side_setback_m = avg(1 m; 2 m) @(A)'],
    ['mixed_and_or', 'x_m = if(lot_frontage_m ≥ 6 m and lot_frontage_m < 15 m or lot_depth_m > 1 m; 1 m; 2 m) @(A)'],
    ['band_arm_not_literal', 'gfa_m2 = band(lot_area_m2; < 408 m2: min(0.6 ratio × lot_area_m2; 204 m2)) @(A)'],
    ['min_max_arity', 'x_m = max(1 m) @(A)'],
    ['duplicate_by_type_key', 'x_m = by_type(townhouse: 1 m; townhouse: 2 m) @(A)'],
    ['syntax', 'x_m = existing(lot_frontage_m; 569-2013) @(A)'],
    ['syntax', 'x_m = label @(A)'],
    ['syntax', 'x_m = 1 m $ 2 m @(A)'],
  ])('%s: %s', (expected, src) => {
    expect(code(() => D.parseStatement(src))).toBe(expected);
  });
  it('a parenthesized mix of and/or is accepted (the error is about precedence, not about mixing)', () => {
    expect(code(() => D.parseCond('(lot_depth_m ≥ 36.0 m and lot_frontage_m < 10.0 m) or (lot_depth_m ≥ 40.0 m and lot_frontage_m ≥ 10.0 m)'))).toBe('no_error');
  });
  it('value_form_mixed: one unit whose statements have different heads', () => {
    expect(code(() => D.valueForm(['height_m = 10 m @(A)', 'height_storeys = overlay(ST) @(A)']))).toBe('value_form_mixed');
  });
  it('the error-code list is closed and matches what the parser throws', () => {
    expect(D.DSL_ERROR_CODES).toEqual(['syntax', 'bad_literal', 'bad_unit', 'bad_target', 'bad_clause_path', 'unknown_function', 'mixed_and_or', 'band_arm_not_literal', 'min_max_arity', 'duplicate_by_type_key', 'value_form_mixed']);
  });
});

describe('canonical form (§7.4: agreement compares canonical forms)', () => {
  it('whitespace removed, numerals normalized, ASCII operators mapped', () => {
    expect(D.canonicalStatement('height_m = max(7.20 m; height_m - 2.50 m) @ (4)(A)')).toBe('height_m=max(7.2m;height_m−2.5m)@(4)(A)');
    expect(D.canonicalStatement('x_m = 15 m @(A)')).toBe(D.canonicalStatement('x_m=15.0 m@(A)'));
    expect(D.canonicalStatement('g = 0.6 ratio * lot_area_m2 @(A)')).toBe('g=0.6ratio×lot_area_m2@(A)');
  });
  it('max / min arguments, + and × operands and by_type keys are sorted', () => {
    expect(D.canonicalStatement('x_m = max(6 m; 0.6 m) @(1)')).toBe(D.canonicalStatement('x_m = max(0.6 m; 6 m) @(1)'));
    expect(D.canonicalStatement('x_m = min(a_m; b_m) @(1)')).toBe(D.canonicalStatement('x_m = min(b_m; a_m) @(1)'));
    expect(D.canonicalStatement('x_m = a_m + b_m + 1 m @(1)')).toBe(D.canonicalStatement('x_m = 1 m + b_m + a_m @(1)'));
    expect(D.canonicalStatement('g = lot_area_m2 × 0.6 ratio @(1)')).toBe(D.canonicalStatement('g = 0.6 ratio × lot_area_m2 @(1)'));
    expect(D.canonicalStatement('h_m = by_type(townhouse: 11 m; detached_house: 9 m) @a')).toBe(D.canonicalStatement('h_m = by_type(detached_house: 9.0 m; townhouse: 11.0 m) @a'));
  });
  it('− and ÷ are not commutative and are not sorted', () => {
    expect(D.canonicalStatement('x_m = a_m − b_m @(1)')).not.toBe(D.canonicalStatement('x_m = b_m − a_m @(1)'));
    expect(D.canonicalStatement('x = a_m ÷ b_m @(1)')).not.toBe(D.canonicalStatement('x = b_m ÷ a_m @(1)'));
  });
  it('if and band keep their order (a different order is a different reading)', () => {
    expect(D.canonicalStatement('s_m = band(lot_frontage_m; < 6 m: 1 m; ≥ 6 m: 2 m) @x')).not.toBe(D.canonicalStatement('s_m = band(lot_frontage_m; ≥ 6 m: 2 m; < 6 m: 1 m) @x'));
    expect(D.canonicalStatement('s_m = if(lot_frontage_m < 6 m; 1 m; 2 m) @x')).not.toBe(D.canonicalStatement('s_m = if(lot_frontage_m < 6 m; 2 m; 1 m) @x'));
  });
  it('argument clause tags travel with their argument through the sort', () => {
    expect(D.canonicalStatement('height_m = max(10.0 m @(C)(ii); overlay(HT) @(C)(i)) @(1)(C)')).toBe(D.canonicalStatement('height_m = max(overlay(HT) @(C)(i); 10 m @(C)(ii)) @(1)(C)'));
  });
  it('a unit statement list is a set: order-independent; "none" stays "none"', () => {
    expect(D.canonicalExpression(['b_m = 1 m @(B)', 'a_m = 2 m @(A)'])).toBe(D.canonicalExpression(['a_m = 2 m @(A)', 'b_m = 1 m @(B)']));
    expect(D.canonicalExpression('none')).toBe('none');
  });
});

describe('canonical form — review-lens fixes (DeepSeek spec lens, adjudicated)', () => {
  it('conditions are delimited: not(a < 5 m) differs from a variable named nota', () => {
    expect(D.canonCond(D.parseCond('not a_m < 5 m'))).not.toBe(D.canonCond(D.parseCond('nota_m < 5 m')));
  });
  it('and / or are associative: a and (b and c) ≡ a and b and c', () => {
    expect(D.canonCond(D.parseCond('a_m < 1 m and (b_m < 2 m and c_m < 3 m)'))).toBe(D.canonCond(D.parseCond('a_m < 1 m and b_m < 2 m and c_m < 3 m')));
  });
  it('a duplicated statement does not change the canonical statement set', () => {
    expect(D.canonicalExpression(['h_m = 10 m @(1)', 'h_m = 10 m @(1)'])).toBe(D.canonicalExpression(['h_m = 10 m @(1)']));
  });
  it('unlimited inside max() in arithmetic is caught statically; a by_type key outside the vocab is named', () => {
    expect(D.checkStatement('height_m = max(unlimited; 10 m) × 2 ratio @x', VOCAB)).toContain('unlimited_in_arithmetic');
    expect(D.checkStatement('height_m = by_type(detachd_house: 10 m; other: 12 m) @x', { ...VOCAB, building_type: ['detached_house'] })).toEqual(['unknown_building_type: detachd_house']);
  });
});

describe('value_form (§7.2) — derived from the outermost head, never keyed', () => {
  it.each([
    ['side_setback_m = 1.8 m @(A)', 'literal'],
    ['fsi = unlimited @(1)(B)', 'literal'],
    ['side_setback_m = band(required_lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m: 0.9 m) @(3)', 'band'],
    ['rear_setback_m = max(7.5 m; 25 pct × lot_depth_m) @(2)', 'formula'],
    ['gfa_m2 = 0.4 ratio × lot_area_m2 @(A)', 'formula'],
    ['x_m = by_type(townhouse: 1 m; other: 2 m) @(A)', 'by_building_type'],
    ['gfa_m2 = if(lot_area_m2 < 408 m2; 204 m2; 279 m2) @(A)', 'if'],
    ['fsi = label(d) @(1)(A)', 'map_lookup'],
    ['height_m = overlay(HT) @(1)(A)', 'map_lookup'],
    ['lot_frontage_min_m = existing(lot_frontage_m; enacted(569-2013)) @SSP(A)', 'existing_as_of'],
  ])('%s → %s', (s, form) => {
    expect(D.valueForm([s])).toBe(form);
  });
  it('"none" → none; a nested expression takes its outermost head (max(… band …) → formula)', () => {
    expect(D.valueForm('none')).toBe('none');
    expect(D.valueForm(['x_m = max(1 m; if(lot_frontage_m < 6 m; 1 m; 2 m)) @(A)'])).toBe('formula');
  });
});

describe('static unit check (§7.4: a literal unit equals the unit of the variable or target it binds to)', () => {
  it.each([
    ['lot_coverage_pct = 35 m @x', 'unit_mismatch'],
    ['height_m = max(10 m; 3 storeys) @x', 'unit_mismatch'],
    ['height_m = if(lot_frontage_m < 6 m2; 10 m; 11 m) @x', 'unit_mismatch'],
    ['height_m = no_such_input @x', 'unknown_variable'],
    ['no_such_target = 1 m @x', 'unknown_target'],
    ['fsi = min(0.6 ratio × lot_area_m2; 204 m2) @(A)(i)', 'unit_mismatch'],
    ['height_m = unlimited + 1 m @x', 'unlimited_in_arithmetic'],
  ])('known-bad %s → %s', (s, reason) => {
    expect(D.checkStatement(s, VOCAB).map((e: string) => e.split(':')[0])).toContain(reason);
  });
  it.each([
    'rear_setback_m = max(7.5 m; 25 pct × lot_depth_m) @(2)',
    'gfa_m2 = 0.6 ratio × lot_area_m2 @(A)',
    'height_m = if(lot_frontage_m < 6 m; 10 m; 11 m) @x',
    'fsi = unlimited @(1)(B)',
  ])('good twin %s', (s) => {
    expect(D.checkStatement(s, VOCAB)).toEqual([]);
  });
});

// ---------------------------------------------------------------- fixtures from real text (§7.3)
// The §7.3 fixture clauses (S0.5 started from these 14 + RD 1462 bands + 600.60.40(2)(A) + 10.20.40.70 bands),
// pinned here as archetype × value_form pairs that occur in real text.
const ALLOWED: Record<string, string[]> = {
  LIMIT: ['literal', 'band', 'formula', 'by_building_type', 'if', 'map_lookup', 'existing_as_of'],
  PERMIT: ['none', 'if'], PROHIBIT: ['none', 'if'], REQUIRE: ['none'], DEFINE: [...D.VALUE_FORMS ?? []], DISAPPLY: ['none'],
  INCLUDE: ['none'], PREVAILING: ['none'], PROCEDURAL: ['none'], UNUSUAL: ['none'],
};
const PINNED_PAIRS: [string, string, string][] = [
  ['900.3.10(5)#SSP(A)', 'LIMIT', 'literal'], // RD 5 (A)
  ['900.6.10(18)#SSP(B)', 'LIMIT', 'by_building_type'], // RM 18 (B)
  ['900.3.10(1462)#SSP(A)', 'LIMIT', 'if'], // RD 1462 (A) — the FSI tiers, keyed as an if-chain (band arms are literals)
  ['900.3.10(587)#SSP(A)', 'LIMIT', 'existing_as_of'], // RD 587 (A) — enacted(569-2013)
  ['900.3.10(254)#SSP(C)', 'INCLUDE', 'none'], // RD 254 (C)
  ['900.3.10(1463)#PBS(A)', 'PREVAILING', 'none'], // RD 1463
  ['900.3.10(5)#SSP(B)', 'DISAPPLY', 'none'], // RD 5 (B)
  ['900.2.10(604)#SSP(A)', 'PROHIBIT', 'none'], // R 604
  ['900.3.10(806)#SSP(G)', 'REQUIRE', 'none'], // RD 806 (G)
  ['10.20.40.70(3)#(B)', 'LIMIT', 'literal'], // 10.20.40.70(3) per clause
  ['10.20.40.70(3)#band', 'LIMIT', 'band'], // 10.20.40.70(3) as one band unit
  ['10.40.40.10(1)#(A)', 'LIMIT', 'map_lookup'], // 10.40.40.10(1)
  ['10.40.40.10(1)#(C)', 'LIMIT', 'formula'], // 10.40.40.10(1)(C) — argument-tagged max
  ['10.20.40.10(1)#(D)(i)', 'LIMIT', 'formula'], // the conditional height LIMIT (major street, absent HT argument)
  ['600.60.40(1)#(A)', 'LIMIT', 'literal'], // presence-test condition
  ['600.60.40(1)#(B)', 'PERMIT', 'none'], // explicit displacement of 900.1.10(3)
  ['600.60.40(2)#(A)', 'LIMIT', 'literal'], // argument-level displacement of (1)(C)(ii)
  ['900.1.10(3)#whole', 'PROCEDURAL', 'none'], // the precedence rule displaced
  ['10.20.30.20(1)#(A)', 'DEFINE', 'map_lookup'],
  ['10.20.30.20(1)#(B)', 'DEFINE', 'literal'],
  ['10.20.40.40(1)#(B)', 'LIMIT', 'literal'], // unlimited
];
const byId = new Map(UNITS.map((u) => [u.unit_id, u]));
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
function textNumbers(t: string): Set<number> {
  const s = new Set<number>();
  const clean = t.replace(/\[[^\]]*\]/g, ' ');
  for (const m of clean.matchAll(/\d+(?:\.\d+)?/g)) s.add(Number(m[0]));
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(clean)) s.add(n);
  return s;
}

describe('archetype × value_form fixtures from real clause text (§7.3, pinned at S6)', () => {
  it.each(PINNED_PAIRS)('%s is %s × %s, allowed by §7.3', (id, archetype, form) => {
    const u = byId.get(id);
    expect(u, id).toBeDefined();
    expect({ id, archetype: u!.archetype, form: D.valueForm(u!.numeric_expression) }).toEqual({ id, archetype, form });
    expect(ALLOWED[archetype]).toContain(form);
  });
  it('every fixture unit parses; every literal (statement and condition) occurs in its clause text', () => {
    const bad: string[] = [];
    for (const u of UNITS) {
      const nums = textNumbers(u.source_text);
      let sts: Json[] = [];
      try { sts = D.parseExpression(u.numeric_expression); } catch (err) { bad.push(`${u.unit_id}: ${String(err)}`); continue; }
      const lits = sts.flatMap((s) => D.literalsOf(s.expr));
      if (u.condition !== 'none' && u.condition.if && u.condition.if !== 'none') lits.push(...D.literalsOf(D.parseCond(u.condition.if)));
      for (const l of lits) if (!nums.has(l.value)) bad.push(`${u.unit_id}: literal ${l.raw} ${l.unit} not in clause text`);
    }
    expect(bad).toEqual([]);
  });
  it('every candidate fixture statement passes the static unit check', () => {
    const bad = UNITS.filter((u) => u.candidate).flatMap((u) => D.parseExpression(u.numeric_expression).flatMap((s: Json) => D.checkStatement(s, VOCAB).map((e: string) => `${u.unit_id}: ${e}`)));
    expect(bad).toEqual([]);
  });
  it('every fixture unit value_form is allowed for its archetype (G-SHAPE §7.3 table), except the one clause still inexpressible after M-48', () => {
    // 10.5.50.10(1)(A) "the front yard, excluding a permitted driveway … must be landscaping" (a percent of a stated
    // base) has no DSL form: Spec 69 §4 item 8, open. As a LIMIT with expression "none" it is a G-SHAPE failure —
    // it must be keyed UNUSUAL / not_modelled until a grammar ruling, never silently passed.
    const bad = UNITS.filter((u) => !(ALLOWED[u.archetype] ?? []).includes(D.valueForm(u.numeric_expression))).map((u) => `${u.unit_id} ${u.archetype} ${D.valueForm(u.numeric_expression)}`);
    expect(bad).toEqual(['10.5.50.10(1)#(A) LIMIT none']);
  });
});
