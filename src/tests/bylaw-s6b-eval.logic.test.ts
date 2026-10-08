// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence rules 0–7, permitted(), building type
//            unknown), §7.6 (evaluator, lot vector, eval-vectors.json), §9 G-EVAL (a)(b)(c);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-34, M-38, M-43, M-48, M-49, M-50, M-51;
//            docs/reports/mcbylaw-phase1-plan.md S6b
//
// S6b unit tests: evaluate() semantics (M-48 unlimited, absent map arguments, presence tests, enacted dates, closed
// not_evaluated reasons); the §7.5 precedence fixtures for rules 0–7 incl. the M-49 tie-break, own-target and
// argument-level displacement (M-48) and M-50; permitted() with M-38; G-EVAL over eval-vectors.json with the S0.5
// fixture units (no numeric mismatch may be hidden — each is either a match, a counted not_evaluated with its reason,
// or an adjudication naming the wrong side); and G-EVAL's own known-bad fixtures.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
const VOCAB = read('src/tests/fixtures/bylaw/eval-vocab.json');
const ALL_UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units;
const UNITS = ALL_UNITS.filter((u) => u.candidate);
const VECTORS: Json[] = read('scripts/seeds/bylaw/eval-vectors.json').vectors;
const PAGE_600_60 = fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/pages/ch600_60.txt'), 'utf8');
const ENACT = E.enactedDatesFromText ? E.enactedDatesFromText(PAGE_600_60) : {};
const C = E.makeContext ? E.makeContext(VOCAB, { enactments: ENACT }) : {};
const vec = (id: string): Json => VECTORS.find((v) => v.id === id)!;
const unit = (id: string): Json => ALL_UNITS.find((u) => u.unit_id === id)!;
const eff = (lot: Json, target: string, units = UNITS): Json => E.effective(lot, target, E.loadCandidates(lot, units).candidates, C);
const show = (r: Json): unknown => (r.status === 'value' ? r.value : `${r.status}:${r.reason}`);
const DERWYN = vec('derwyn:side_setback_m').lot;

describe('evaluate() — §7.4 semantics', () => {
  const lot = { zone: 'RD', label: { f: 9, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: {}, building_type: 'detached_house' };
  it('arithmetic: p pct × X = p/100 · X; max picks the larger', () => {
    expect(E.evaluate('rear_setback_m = max(7.5 m; 25 pct × lot_depth_m) @(2)', lot, C)).toMatchObject({ value: 8.39, unit: 'm' });
  });
  it('unlimited is a value; unlimited in arithmetic is not_evaluated (never a number)', () => {
    expect(E.evaluate('fsi = unlimited @(1)(B)', lot, C).value).toBe('unlimited');
    expect(E.evaluate('height_m = unlimited + 1 m @x', lot, C).not_evaluated).toBe('unlimited_in_arithmetic');
  });
  it('M-48: an absent map argument is dropped from max; every argument absent → not_evaluated', () => {
    expect(E.evaluate('height_m = max(13.0 m; overlay(HT)) @(1)(D)(i)', { ...lot, overlays: {} }, C).value).toBe(13);
    expect(E.evaluate('height_m = max(13.0 m; overlay(HT)) @(1)(D)(i)', { ...lot, overlays: { HT: 15 } }, C).value).toBe(15);
    expect(E.evaluate('height_m = max(overlay(HT); overlay(HT)) @x', { ...lot, overlays: {} }, C).not_evaluated).toBe('all_map_arguments_absent');
  });
  it('a map we do not hold is unknown, not absent: max() is not_evaluated (map_area_not_held), never dropped', () => {
    expect(E.evaluate('height_m = max(13.0 m; overlay(HT)) @(1)(D)(i)', { ...lot, overlays: undefined }, C).not_evaluated).toBe('map_area_not_held:HT');
  });
  it('map_lookup outside max/min without a value → not_evaluated with a reason (§7.6)', () => {
    expect(E.evaluate('height_m = overlay(HT) @(1)(A)', { ...lot, overlays: {} }, C).not_evaluated).toBe('map_value_absent:HT');
    expect(E.evaluate('fsi = label(d) @(1)(A)', { ...lot, label: {} }, C).not_evaluated).toBe('label_value_absent:d');
  });
  it('existing_as_of without as-built input → existing_building_facts; with it → the value; enacted() from the page header', () => {
    expect(ENACT['569-2013']).toBe('2013-05-09');
    const s = unit('900.3.10(587)#SSP(A)').numeric_expression[0];
    expect(E.evaluate(s, lot, C).not_evaluated).toBe('existing_building_facts:lot_frontage_m');
    expect(E.evaluate(s, { ...lot, existing: { 'lot_frontage_m@2013-05-09': 9.1 } }, C).value).toBe(9.1);
    expect(E.evaluate(s, lot, E.makeContext(VOCAB)).not_evaluated).toBe('enactment_date_unknown:569-2013');
  });
  it('by_type: listed type, parent type, `other`, unlisted without other, unknown type', () => {
    const s = 'x_m = by_type(detached_houseplex: 1 m; townhouse: 2 m; other: 3 m) @x';
    expect(E.evaluate(s, { ...lot, building_type: 'townhouse' }, C).value).toBe(2);
    expect(E.evaluate(s, { ...lot, building_type: 'sixplex' }, C).value).toBe(1);
    expect(E.evaluate(s, { ...lot, building_type: 'apartment_building' }, C).value).toBe(3);
    expect(E.evaluate('x_m = by_type(townhouse: 2 m) @x', lot, C).not_evaluated).toBe('by_type_unlisted:detached_house');
    expect(E.evaluate(s, { ...lot, building_type: null }, C).not_evaluated).toBe('needs_user_input:building_type');
  });
  it('band: first matching arm; no arm → band_no_match (never a default)', () => {
    const s = 'side_setback_m = band(lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m and < 12.0 m: 0.9 m) @(3)';
    expect(E.evaluate(s, lot, C).value).toBe(0.9);
    expect(E.evaluate(s, { ...lot, vars: { lot_frontage_m: 13 } }, C).not_evaluated).toBe('band_no_match');
  });
  it('a missing input is named; a user input is needs_user_input; division by zero is not_evaluated', () => {
    expect(E.evaluate('x_m = parking_width_m @x', lot, C).not_evaluated).toBe('missing_input:parking_width_m');
    expect(E.evaluate('x = lot_area_m2 ÷ lot_depth_m @x', { ...lot, vars: { lot_area_m2: 1, lot_depth_m: 0 } }, C).not_evaluated).toBe('division_by_zero');
  });
  it('RD 1462 FSI tiers (if-chain): 327.12 → 196.272; 500 → 250; 600 → 279; 800 → 320', () => {
    const s = unit('900.3.10(1462)#SSP(A)').numeric_expression[0];
    expect([327.12, 500, 600, 800].map((a) => E.evaluate(s, { ...lot, vars: { lot_area_m2: a } }, C).value)).toEqual([196.272, 250, 279, 320]);
  });
  it('an expression that does not parse is not_evaluated expression_error, never a throw', () => {
    expect(E.evaluate('x_m = 1.8 @(A)', lot, C).not_evaluated).toBe('expression_error:bad_unit');
  });
});

describe('G-EVAL (c): §7.5 precedence fixtures — rules 0–7, conflicts, M-38, M-48, M-49, M-50', () => {
  const fixtures: Json[] = E.precedenceFixtures ? E.precedenceFixtures(VOCAB) : [];
  it('the fixture set covers every rule 0–7 plus 4a and M-50', () => {
    expect([...new Set(fixtures.map((f) => f.rule))].sort()).toEqual(['0', '1', '2', '3', '4', '4a', '5', '6', '7', 'M-50']);
  });
  it.each(fixtures.map((f) => [`[${f.rule}] ${f.name}`, f]))('%s', (_n, f) => {
    expect(f.run()).toEqual(f.expect);
  });
  it('selfTest() (the module-shape self test) passes', () => {
    expect(E.selfTest(VOCAB)).toMatchObject({ pass: true, violations: [] });
  });
});

describe('precedence on the real fixture clauses', () => {
  // operator ruling (d) 2026-10-07: an unauthored exception blocks every target, so the fixture exceptions (fully keyed
  // here) are declared authored for these precedence checks
  const CX = E.makeContext ? E.makeContext(VOCAB, { enactments: ENACT, authored: Object.fromEntries(['900.3.10(5)', '900.3.10(254)', '900.3.10(1462)', '900.3.10(1463)', 'SYN', '900.2.10(604)'].map((x) => [x, 'authored'])) }) : {};
  const effX = (lot: Json, target: string): Json => E.effective(lot, target, E.loadCandidates(lot, UNITS).candidates, CX);
  it('600.60.40(2)(A) displaces only (1)(C)(ii): a sixplex in the overlay with HT 12.0 keeps 12.0 (Spec 68 §7.4)', () => {
    const six = { ...DERWYN, overlays: { HT: 12 }, map_areas: ['sixplex_overlay'], building_type: 'sixplex', vars: { ...DERWYN.vars, dwelling_units: 6 }, flags: { ...DERWYN.flags, lowest_level_joists_1_0_to_1_5_m_for_80_pct: true, lowest_level_ceiling_2_4_m_for_80_pct: true, lowest_level_contains_dwelling_unit: true } };
    expect(show(eff(six, 'height_m'))).toBe(12);
    expect(show(eff({ ...six, overlays: { HT: 8.5 } }, 'height_m'))).toBe(10.5);
    expect(show(eff({ ...six, overlays: {} }, 'height_m'))).toBe(10.5);
    expect(show(eff({ ...six, flags: { ...six.flags, lowest_level_contains_dwelling_unit: false } }, 'height_m'))).toBe(12);
    expect(show(eff({ ...six, overlays: { HT: 8.5 }, flags: { ...six.flags, lowest_level_contains_dwelling_unit: false } }, 'height_m'))).toBe(10);
  });
  it('M-48 own target on the real 10.20.40.70(6): corner lot f15 keeps the interior 1.5 and gets 3.0 street side', () => {
    const corner = { ...DERWYN, label: { f: 15 }, flags: { ...DERWYN.flags, corner_lot: true, adjacent_lot_fronts_flanking_street: true } };
    expect([show(eff(corner, 'side_setback_m')), show(eff(corner, 'side_setback_street_m'))]).toEqual([1.5, 3]);
  });
  it('RD 5 (A) "Despite 10.20.40.70(3)" on a Derwyn-like lot in exception 900.3.10(5): 1.8 replaces the band 0.9', () => {
    expect(show(effX({ ...DERWYN, exception: '900.3.10(5)' }, 'side_setback_m'))).toBe(1.8);
  });
  it('RD 254 INCLUDEs RD 1462 (loader): the gfa cap on 327.12 m² is min(0.6 × 327.12, 204) = 196.272', () => {
    const lot = { ...DERWYN, exception: '900.3.10(254)', building_type: 'detached_house' };
    expect(E.loadCandidates(lot, UNITS).log).toEqual(['INCLUDE 900.3.10(254)#SSP(C) → 900.3.10(1462) (depth 1)']);
    expect(show(effX(lot, 'gfa_m2'))).toBe(196.272);
  });
  it('RD 1463 PREVAILING: value unchanged, alternate path disclosed (rule 5)', () => {
    const r = effX({ ...DERWYN, exception: '900.3.10(1463)' }, 'side_setback_m');
    expect([r.value, r.disclosures.some((d: string) => d.includes('900.3.10(1463)#PBS(A)'))]).toEqual([0.9, true]);
  });
  it('M-38 through permitted() on the real 600.60.40(1)(B) and 900.1.10(3) units + a synthetic exception PROHIBIT', () => {
    const lot = { ...DERWYN, exception: 'SYN', map_areas: ['sixplex_overlay'], vars: { ...DERWYN.vars, dwelling_units: 6 } };
    const prohibit = { unit_id: 'SYN#SSP(A)', regulation_id: 'SYN', exception: 'SYN', layer: 'exception', archetype: 'PROHIBIT', target: 'none', bound: 'none', condition: { tokens: ['unit_count_band'], if: 'dwelling_units ≥ 5 units' }, applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['detached_houseplex'] }, displaces: [], numeric_expression: 'none' };
    const cands = [...E.loadCandidates(lot, UNITS).candidates, prohibit];
    expect(E.permitted(lot, 'sixplex', cands, CX).status).toBe('permitted');
    expect(E.permitted({ ...lot, map_areas: [] }, 'sixplex', cands, CX).status).toBe('prohibited');
    expect(E.permitted({ ...lot, map_areas: undefined }, 'sixplex', cands, CX)).toMatchObject({ status: 'not_evaluated', reason: 'map_area_not_held:sixplex_overlay' });
    expect(E.permitted({ ...lot, zone: null }, 'sixplex', cands, CX).status).toBe('not_evaluated');
    expect(E.permitted(lot, 'sixplex', cands, C)).toMatchObject({ status: 'not_evaluated', reason: 'exception_not_authored:SYN' }); // ruling (d)
  });
  it('R 604 prohibits an apartment building, not a detached houseplex', () => {
    const lot = { zone: 'R', label: {}, overlays: {}, vars: { dwelling_units: 6 }, flags: {}, exception: '900.2.10(604)', map_areas: ['sixplex_overlay'] };
    const cands = E.loadCandidates(lot, UNITS).candidates;
    expect([E.permitted(lot, 'apartment_building', cands, CX).status, E.permitted(lot, 'sixplex', cands, CX).status]).toEqual(['prohibited', 'permitted']);
  });
  it('M-50 V12 on the real RT units: building type NULL → not_evaluated with the per-type values', () => {
    const r = eff(vec('V12').lot, 'side_setback_m');
    expect([r.status, r.reason, r.per_type.detached_house, r.per_type.apartment_building]).toEqual(['not_evaluated', 'needs_user_input:building_type', 0.9, 7.5]);
  });
  it('the 10.20.40.70(3) band unit ≡ the seven per-clause units for every required frontage 3.0–40.0 m', () => {
    const bandUnit = { ...unit('10.20.40.70(3)#band'), candidate: true };
    const per = UNITS.filter((u) => /^10\.20\.40\.70\(3\)#\([A-G]\)$/.test(u.unit_id));
    const reqF = UNITS.filter((u) => u.unit_id.startsWith('10.20.30.20(1)'));
    const diffs: string[] = [];
    for (let f = 3; f <= 40; f += 0.5) {
      const lot = { zone: 'RD', label: { f }, overlays: {}, vars: {}, flags: {}, building_type: 'detached_house' };
      const a = show(E.effective(lot, 'side_setback_m', [bandUnit, ...reqF], C)); const b = show(E.effective(lot, 'side_setback_m', [...per, ...reqF], C));
      if (a !== b) diffs.push(`f=${f}: band ${a} vs per-clause ${b}`);
    }
    expect(diffs).toEqual([]);
  });
});

describe('G-EVAL (a)+(b) over scripts/seeds/bylaw/eval-vectors.json (fixture units)', () => {
  const r: Json = E.checkEval ? E.checkEval({ units: UNITS, vectors: VECTORS, vocab: VOCAB, enactments: ENACT }) : { pass: false, violations: ['no module'], rows: [], counts: {} };
  it('passes: every expression evaluates on every applicable vector; no unexplained numeric mismatch', () => {
    expect({ pass: r.pass, violations: r.violations }).toEqual({ pass: true, violations: [] });
  });
  it('vector verdict counts (pinned; a change is a reviewed edit)', () => {
    // hardening 2026-10-07 (Spec 69 M-60): Derwyn / Eastbourne carry the detached-house type their Spec 67 source states
    // (+9 match); 7 untyped vectors whose types disagree are no_expected:building_type_unstated (M-50)
    expect(r.counts).toEqual({ units_evaluated: 115, unit_vector_evaluations: 4863, vectors: 109, match: 70, mismatch_adjudicated: 0, mismatch_unadjudicated: 0, not_evaluated: 21, pending: 0, excluded: 7, inexpressible: 2, no_expected: 9 });
  });
  it('every not_evaluated vector carries a reason from the closed set', () => {
    const bad = r.rows.filter((x: Json) => x.verdict === 'not_evaluated' && !E.NOT_EVALUATED_CODES.includes(E.reasonCode(String(x.got).replace(/^not_evaluated:/, '')))).map((x: Json) => `${x.id} ${x.got}`);
    expect(bad).toEqual([]);
  });
  it('M-51: V1–V4 and V25 side evaluate to the corrected 1.2 m; with label f = the stated frontage they give 0.6 / 0.9 / 1.8 / 3.0 / 1.8', () => {
    const ids = ['V1', 'V2', 'V3', 'V4', 'V25:side_setback_m'];
    expect(ids.map((id) => r.rows.find((x: Json) => x.id === id).verdict)).toEqual(['match', 'match', 'match', 'match', 'match']);
    const withF = ids.map((id) => { const v = vec(id); const lot = { ...v.lot, label: { ...v.lot.label, f: v.adjudication.with_label_f_equal_to_frontage.label_f } }; return show(eff(lot, 'side_setback_m')); });
    expect(withF).toEqual(ids.map((id) => vec(id).adjudication.with_label_f_equal_to_frontage.value));
    expect(withF).toEqual([0.6, 0.9, 1.8, 3, 1.8]);
  });
  it('the 9 S0.5-inexpressible "not limited" vectors are now expressible: 7 match `unlimited` / `unregulated` (M-54) or are not_evaluated with a named input; the 2 RT front-landscaping vectors stay inexpressible (Spec 69 §4 item 8)', () => {
    const unl = r.rows.filter((x: Json) => x.expected && (x.expected.value === 'unlimited' || x.expected.value === 'unregulated'));
    expect(unl.map((x: Json) => `${x.id}:${x.verdict}`)).toEqual([
      'derwyn:height_storeys:match', 'eastbourne:lot_coverage_pct:match', 'futura:fsi:not_evaluated', 'cordella:lot_coverage_pct:match',
      'p5071306:fsi:not_evaluated', 'bijou:fsi:not_evaluated', 'bijou:lot_coverage_pct:match',
    ]);
    expect(unl.filter((x: Json) => x.verdict === 'not_evaluated').map((x: Json) => x.got)).toEqual(Array(3).fill('not_evaluated:needs_user_input:has_secondary_suite'));
    expect(r.rows.filter((x: Json) => x.verdict === 'inexpressible').map((x: Json) => x.id)).toEqual(['p5071306:front_landscaping_pct', 'bijou:front_landscaping_pct']);
  });
});

describe('evaluator — review-lens fixes (DeepSeek error-paths / spec lenses, adjudicated)', () => {
  const lot = { zone: 'RD', label: {}, overlays: {}, vars: { lot_depth_m: 30 }, flags: {}, building_type: 'detached_house' };
  const U = (o: Json) => ({ layer: 'base', archetype: 'LIMIT', bound: 'min', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, ...o });
  it('arithmetic over an absent overlay is not dropped from max(): max(overlay(HT) + 1 m; 2 m) is not_evaluated, not 2', () => {
    expect(E.evaluate('height_m = max(overlay(HT) + 1 m; 2 m) @x', lot, C).not_evaluated).toBe('map_value_absent:HT');
  });
  it('a DEFINE / bound "none" unit is grouped as exact, never crashes', () => {
    expect(show(E.effective(lot, 'required_lot_frontage_m', [U({ unit_id: 'D#(A)', archetype: 'DEFINE', bound: 'none', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = 12.0 m @(A)'] })], C))).toBe(12);
  });
  it('a conflict in a referenced target is reported as such, not as a missing input', () => {
    const t1 = U({ unit_id: 'F#(A)', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = 12.0 m @(A)'] });
    const t2 = U({ unit_id: 'F#(B)', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = 15.0 m @(B)'] });
    const s = U({ unit_id: 'S#(A)', target: 'side_setback_m', numeric_expression: ['side_setback_m = band(required_lot_frontage_m; < 13 m: 1.2 m; ≥ 13 m: 1.5 m) @(A)'] });
    expect(show(E.effective(lot, 'side_setback_m', [t1, t2, s], C))).toBe('not_evaluated:referenced_target_conflict:required_lot_frontage_m');
  });
  it('an expression string holding "=" and an argument tag is evaluated as an expression, not a statement', () => {
    expect(E.evaluate('if(lot_depth_m = 30 m; max(10 m @(i); 2 m @(ii)); 3 m)', lot, C).value).toBe(10);
  });
  it('a vector with a status outside the closed set fails G-EVAL', () => {
    expect(E.checkEval({ units: UNITS, vectors: [{ ...vec('V8'), vector_status: 'by_law_expected_v2' }], vocab: VOCAB }).violations.map((v: string) => v.split(':')[0])).toEqual(['bad_vector_status']);
  });
});

describe('operator ruling 2026-10-07 (Spec 69 M-54): unregulated results carry their clause; label au', () => {
  const U = (o: Json) => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, ...o });
  const lot = { zone: 'RD', label: {}, overlays: {}, vars: { lot_frontage_m: 10 }, flags: { major_street: false }, building_type: 'detached_house' };
  it('evaluate(): unregulated is a value with its clause path, not not_evaluated', () => {
    expect(E.evaluate('lot_coverage_pct = unregulated @(1)(B)', lot, C)).toMatchObject({ value: 'unregulated', clause: '(1)(B)' });
  });
  it('evaluate(): unregulated in arithmetic is not_evaluated (never a number)', () => {
    expect(E.evaluate('lot_coverage_pct = unregulated + 5 pct @x', lot, C).not_evaluated).toBe('unregulated_in_arithmetic');
  });
  it('effective(): a coverage-null RD lot is unregulated by 10.20.30.40(1)(B), and the result names the clause', () => {
    const r = eff({ ...DERWYN, overlays: { HT: 8.5 }, building_type: 'detached_house' }, 'lot_coverage_pct');
    expect([r.status, r.value, r.clause]).toEqual(['value', 'unregulated', '10.20.30.40(1)#(B)']);
  });
  it('effective(): a finite bound at the same layer beats unregulated (rule 4a); a higher layer replaces it (rule 4)', () => {
    const unreg = U({ unit_id: '10.20.30.40(1)#(B)', regulation_id: '10.20.30.40(1)', target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = unregulated @(1)(B)'] });
    expect(show(E.effective(lot, 'lot_coverage_pct', [unreg, U({ unit_id: 'X#(C)', target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = 50 pct @(C)'] })], C))).toBe(50);
    expect(show(E.effective(lot, 'lot_coverage_pct', [unreg, U({ unit_id: 'EX#(A)', layer: 'exception', target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = 40 pct @(A)'] })], C))).toBe(40);
    expect(show(E.effective(lot, 'lot_coverage_pct', [unreg], C))).toBe('unregulated');
  });
  it('R zone without an absence ruling: no clause can be carried, the result stays no_candidate', () => {
    expect(show(eff({ ...DERWYN, zone: 'R', overlays: {}, building_type: 'detached_house' }, 'lot_coverage_pct'))).toBe('not_evaluated:no_candidate');
  });
});

describe('operator ruling 2026-10-07 (Spec 69 M-54 note): R-zone coverage unregulated BY ABSENCE, cited', () => {
  const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
  const CA = E.makeContext ? E.makeContext(VOCAB, { enactments: ENACT, absences: ABS.rulings }) : {};
  const rLot = { ...DERWYN, zone: 'R', overlays: {}, building_type: 'detached_house', exception: null };
  const effA = (lot: Json, units = UNITS): Json => E.effective(lot, 'lot_coverage_pct', E.loadCandidates(lot, units).candidates, CA);
  const covEx = { unit_id: '900.2.10(9)#SSP(A)', regulation_id: '900.2.10(9)', exception: '900.2.10(9)', layer: 'exception', archetype: 'LIMIT', target: 'lot_coverage_pct', bound: 'max', condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['R'], building_types: ['any'] }, displaces: [], numeric_expression: ['lot_coverage_pct = 35 pct @SSP(A)'] };
  it('an R lot with no candidate for lot_coverage_pct is unregulated with evidence kind "absence", the stated absence and the M-29 flag', () => {
    const r = effA(rLot);
    expect([r.status, r.value, r.clause]).toEqual(['value', 'unregulated', null]);
    expect(r.evidence).toEqual({ kind: 'absence', ruling: 'ABS-1', statement: 'no principal-building lot coverage regulation in 569-2013 Ch.10.10 for the R zone; only the ancillary cap 10.10.60.70', expert_sample: true });
  });
  it('a clause-stated unregulated carries evidence kind "clause", never "absence"', () => {
    const r = E.effective({ ...DERWYN, overlays: { HT: 8.5 }, building_type: 'detached_house' }, 'lot_coverage_pct', E.loadCandidates(DERWYN, UNITS).candidates, CA);
    expect(r.evidence).toEqual({ kind: 'clause', clause: '10.20.30.40(1)#(B)' });
  });
  it('absence does not apply when an exception candidate for lot_coverage_pct exists, even when it does not apply to the lot', () => {
    const lot = { ...rLot, exception: '900.2.10(9)' };
    const CA9 = E.makeContext(VOCAB, { enactments: ENACT, absences: ABS.rulings, authored: { '900.2.10(9)': 'authored' } });
    expect(show(E.effective(lot, 'lot_coverage_pct', E.loadCandidates(lot, [...UNITS, covEx]).candidates, CA9))).toBe(35);
    expect(show(effA(lot, [...UNITS, covEx]))).toBe('not_evaluated:exception_not_authored:900.2.10(9)'); // ruling (d): blocks the value too
    const notThisType = [...UNITS, { ...covEx, application: { zones: ['R'], building_types: ['townhouse'] } }];
    // hardening 2026-10-07 (Spec 69 M-60): an exception with no authored record never yields absence
    expect(show(effA(lot, notThisType))).toBe('not_evaluated:exception_not_authored:900.2.10(9)');
    const CAuth = E.makeContext(VOCAB, { enactments: ENACT, absences: ABS.rulings, authored: { '900.2.10(9)': 'authored' } });
    expect(show(E.effective(lot, 'lot_coverage_pct', E.loadCandidates(lot, notThisType).candidates, CAuth))).toBe('not_evaluated:no_candidate');
  });
  it('absence does not apply to an overlay candidate; a provincial unit never switches it off (Spec 69 M-55 note, M-60)', () => {
    const ov = { ...covEx, unit_id: 'overlay#c', layer: 'overlay', exception: undefined, application: { zones: ['R'], building_types: ['townhouse'] } };
    expect(show(effA(rLot, [...UNITS, ov]))).toBe('not_evaluated:no_candidate');
    const pr = { ...covEx, unit_id: 'provincial#c', layer: 'provincial', exception: undefined, application: { zones: ['R'], building_types: ['townhouse'] } };
    expect(show(effA(rLot, [...UNITS, pr]))).toBe('unregulated');
  });
  it('absence does not apply on a lot whose exception is not captured (no unit loaded for it): not_evaluated, never inferred', () => {
    expect(show(effA({ ...rLot, exception: '900.2.10(777)' }))).toBe('not_evaluated:exception_not_authored:900.2.10(777)');
  });
  it('absence is zone- and target-scoped: RD coverage and R height are untouched', () => {
    expect(effA({ ...DERWYN, overlays: { HT: 8.5 }, building_type: 'detached_house' }).evidence.kind).toBe('clause');
    expect(show(E.effective(rLot, 'building_length_m', E.loadCandidates(rLot, UNITS).candidates, CA))).toBe('not_evaluated:no_candidate');
  });
  it('with building type unknown (M-50) every type agrees, so the absence result stands with its evidence', () => {
    const r = effA({ ...rLot, building_type: null });
    expect([r.value, r.evidence.kind]).toEqual(['unregulated', 'absence']);
  });
});

describe('M-54 G-EVAL (continued)', () => {
  it('G-EVAL: an unregulated expectation matches only with the same clause', () => {
    const v = vec('eastbourne:lot_coverage_pct');
    expect(v.expected).toEqual({ value: 'unregulated', clause: '10.20.30.40(1)#(B)' });
    expect(E.checkEval({ units: UNITS, vectors: [v], vocab: VOCAB }).pass).toBe(true);
    expect(E.checkEval({ units: UNITS, vectors: [{ ...v, expected: { value: 'unregulated', clause: '10.20.30.40(1)#(A)' } }], vocab: VOCAB }).pass).toBe(false);
  });
  it('label au: p5071306 "RT (au220.0)" reads 220 m² per dwelling unit (10.60.30.10(2))', () => {
    const r = eff({ ...vec('p5071306:side_setback_m').lot }, 'lot_area_per_unit_min_m2');
    expect([show(r), r.unit]).toEqual([220, 'm2']);
  });
});

describe('G-EVAL known-bad fixtures (each fails for its reason; the good twin passes)', () => {
  const base = VECTORS.filter((v) => ['V7', 'V8', 'V22'].includes(v.id));
  const ok = (vectors: Json[], units = UNITS) => E.checkEval({ units, vectors, vocab: VOCAB, enactments: ENACT });
  it('good twin', () => { expect(ok(base).pass).toBe(true); });
  it('eval_mismatch_unadjudicated: a wrong expected value with no adjudication fails', () => {
    const bad = [{ ...vec('V8'), expected: { value: 9.0 } }];
    expect(ok(bad).violations.map((v: string) => v.split(':')[0])).toEqual(['eval_mismatch_unadjudicated']);
  });
  it('an eval_mismatch adjudication naming the wrong side is counted, not failed', () => {
    const adj = [{ ...vec('V8'), expected: { value: 9.0 }, adjudication: { kind: 'eval_mismatch', wrong_side: 'vector', bylaw_clause: '10.20.40.70(2)', reason: 'fixture' } }];
    const res = ok(adj);
    expect([res.pass, res.counts.mismatch_adjudicated]).toEqual([true, 1]);
  });
  it('an expected not_evaluated that comes back as a value is a mismatch', () => {
    expect(ok([{ ...vec('V8'), expected: { not_evaluated: 'no_candidate' } }]).pass).toBe(false);
  });
  it('a vector whose target has no candidate unit is pending, never failed (Spec 68 §4: pending never fails a gate)', () => {
    const res = ok([{ ...vec('V8'), target: 'separation_m' }]);
    expect([res.pass, res.counts.pending]).toEqual([true, 1]);
  });
  it('the zero-agreed state (no units at all) passes with every vector pending', () => {
    const res = ok(VECTORS, []);
    expect([res.pass, res.counts.pending, res.counts.match]).toEqual([true, 93, 0]); // 109 − 7 composite − 9 no_expected
  });
  it('parse_error: an agreed expression that does not parse fails G-EVAL (a)', () => {
    const res = ok(base, [...UNITS, { unit_id: '10.20.40.70(9)#(A)', regulation_id: '10.20.40.70(9)', layer: 'base', archetype: 'LIMIT', target: 'rear_setback_m', bound: 'min', numeric_expression: ['rear_setback_m = 7.5 @(9)(A)'], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, displaces: [] }]);
    expect(res.violations.map((v: string) => v.split(':')[0])).toEqual(['parse_error']);
  });
  it('unit_error: an agreed expression whose unit differs from its target fails G-EVAL (a)', () => {
    const res = ok(base, [...UNITS, { unit_id: '10.20.40.70(9)#(A)', regulation_id: '10.20.40.70(9)', layer: 'base', archetype: 'LIMIT', target: 'rear_setback_m', bound: 'min', numeric_expression: ['rear_setback_m = 7.5 m2 @(9)(A)'], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, displaces: [] }]);
    expect(res.violations.map((v: string) => v.split(':')[0])).toContain('unit_error');
  });
  it('an agreed CONFLICT on a vector is a mismatch (an agreed conflict fails the row)', () => {
    const twin = (id: string, v: string) => ({ unit_id: id, regulation_id: '10.20.40.70(9)', layer: 'base', archetype: 'LIMIT', target: 'rear_setback_m', bound: 'exact', numeric_expression: [`rear_setback_m = ${v} m @(9)`], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, displaces: [] });
    const res = ok([vec('V7')], [twin('10.20.40.70(9)#(A)', '7.5'), twin('10.20.40.70(9)#(B)', '8.0')]);
    expect([res.pass, res.rows[0].got]).toEqual([false, 'conflict']);
  });
});
