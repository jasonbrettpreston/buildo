// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (row_status, pending never fails a gate), §6 (G / A / ⧉),
//            §7.3 (per-archetype unit shape; one fixture per archetype × value-form pair that occurs in real text),
//            §7.4 (canonical agreement), §9 G-SHAPE, G-CLAUSE, G-XREF, G-AGREE, G-PROV (keyer provenance + ruling-id
//            arms), §10 stage 5; docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (+ notes), M-39, M-45, M-52, M-56;
//            docs/reports/mcbylaw-phase1-plan.md S6
//
// S6 authored-field gates: one known-bad fixture per reason code plus a good twin, from real clause text
// (cut from the live slice by authored-fixtures.mjs); each gate's closed reason-code list; the S7 interface contract
// ({status ∈ vocab.gate_state, checked, violations[{code, id, detail}]} + selfTest()); the closed sets locked both
// directions against vocab.json where vocab lists them.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const AG = await load('scripts/analysis/bylaw/agree.mjs');
const CL = await load('scripts/analysis/bylaw/clause.mjs');
const XR = await load('scripts/analysis/bylaw/xref.mjs');
const SH = await load('scripts/analysis/bylaw/shape.mjs');
const KP = await load('scripts/analysis/bylaw/keyer-prov.mjs');
const DSL = await load('scripts/analysis/bylaw/dsl.mjs');
const VOCAB: Json = (await import(pathToFileURL(path.join(process.cwd(), 'scripts/seeds/bylaw/vocab.json')).href, { with: { type: 'json' } })).default;

const codesOf = (r: Json) => [...new Set((r.violations || []).map((v: Json) => v.code))];
const GATES: [string, Json, string, (i: Json) => Json][] = [
  ['G-AGREE', AG, 'agreeFixtures', (i) => AG.checkAgree(i)],
  ['G-CLAUSE', CL, 'clauseFixtures', (i) => CL.checkClause(i)],
  ['G-XREF', XR, 'xrefFixtures', (i) => XR.checkXref(i)],
  ['G-SHAPE', SH, 'shapeFixtures', (i) => SH.checkShape(i)],
  ['G-PROV keyer arm', KP, 'keyerFixtures', (i) => KP.checkKeyerProv(i)],
  ['G-PROV ruling-id arm', KP, 'rulingFixtures', (i) => KP.checkRulingIds(i)],
];

describe('modules load', () => {
  for (const [name, m] of [['authored', AU], ['authored-fixtures', FX], ['agree', AG], ['clause', CL], ['xref', XR], ['shape', SH], ['keyer-prov', KP]] as [string, Json][]) {
    it(`${name}.mjs imports`, () => expect(m.importError).toBeUndefined());
  }
});

for (const [gate, mod, fxName, run] of GATES) {
  describe(`${gate} — one known-bad fixture per reason code + good twins (Spec 68 §9)`, () => {
    const fixtures: Json[] = typeof FX[fxName] === 'function' ? FX[fxName]() : [];
    const codes: string[] = (gate === 'G-PROV ruling-id arm' ? mod.RULING_REASON_CODES : mod.REASON_CODES) || [];
    it('exports a closed, unique, non-empty reason-code list', () => {
      expect(codes.length).toBeGreaterThan(0);
      expect(new Set(codes).size).toBe(codes.length);
    });
    it('has a known-bad fixture for every reason code (and no fixture for an unlisted code)', () => {
      const bad = new Set(fixtures.filter((f) => f.reason).map((f) => f.reason));
      expect([...bad].sort()).toEqual([...codes].sort());
    });
    for (const f of fixtures) {
      it(`${f.reason ? 'known-bad' : 'good'}: ${f.name}`, () => {
        const r = run(f.input);
        expect(VOCAB.gate_state).toContain(r.status);
        expect(typeof r.checked).toBe('number');
        for (const v of r.violations) {
          expect(codes).toContain(v.code);
          expect(typeof v.id).toBe('string');
          expect(typeof v.detail).toBe('string');
        }
        if (f.reason) {
          expect(r.status).toBe('fail');
          expect(codesOf(r)).toEqual([f.reason]);
        } else {
          expect(r.violations).toEqual([]);
          expect(r.status).toBe('pass');
          if (f.expect) expect(f.expect(r)).toBe(true);
          if (f.expectRows) for (const [id, st] of Object.entries(f.expectRows)) expect(r.rows.find((x: Json) => x.regulation_id === id)?.row_status).toBe(st);
        }
      });
    }
    it('selfTest() passes and covers every reason code', () => {
      const st = gate === 'G-PROV ruling-id arm' ? mod.rulingSelfTest() : gate === 'G-PROV keyer arm' ? mod.keyerSelfTest() : mod.selfTest();
      expect(st.results.filter((x: Json) => !x.ok)).toEqual([]);
      expect(st.pass).toBe(true);
      const covered = new Set(st.results.map((x: Json) => x.expected).filter(Boolean));
      for (const c of codes) expect(covered.has(c)).toBe(true);
    });
  });
}

describe('archetype × value_form fixtures from real text (Spec 68 §7.3, pinned at S6)', () => {
  const goods: [string, Json][] = Object.entries(FX.GOOD || {});
  it('the good units cover exactly the pinned pairs', () => {
    const pairs = new Set(goods.map(([n]) => FX.pairOf(n)));
    expect([...pairs].sort()).toEqual([...(FX.PINNED_PAIRS || [])].sort());
  });
  for (const [n, u] of goods) {
    it(`${n}: archetype and the generated value_form match the pair`, () => {
      const [arch, vf] = FX.pairOf(n).split('×');
      expect(u.archetype).toBe(arch);
      expect(DSL.valueForm(u.numeric_expression)).toBe(vf);
    });
  }
});

describe('G-AGREE canonical comparison (Spec 68 §7.4, Spec 69 M-17 notes)', () => {
  const field = (p: string, a: unknown, b: unknown) => AU.canonicalField(p, a) === AU.canonicalField(p, b);
  it('numerals normalize and max/min/by_type arguments sort; if keeps its order', () => {
    expect(field('numeric_expression', ['h = max(10 m; overlay(HT)) @(C)'], ['h = max(overlay(HT); 10.0 m) @(C)'])).toBe(true);
    expect(field('numeric_expression', ['h = if(lot_frontage_m < 6 m; 1 m; 2 m) @(A)'], ['h = if(lot_frontage_m < 6 m; 2 m; 1 m) @(A)'])).toBe(false);
  });
  it('the generated exception_area token is not keyed (note c(1)); condition tokens are a set', () => {
    expect(field('condition', { tokens: ['corner_lot', 'exception_area'] }, { tokens: ['corner_lot'] })).toBe(true);
    expect(field('condition', { tokens: ['a', 'b'] }, { tokens: ['b', 'a'] })).toBe(true);
  });
  it('instrument compares kind + by-law number only (note c(3)); evidence phrases are never compared', () => {
    expect(field('instrument', { kind: 'former_bylaw', citation: 'By-law 7625', municipality: 'North York' }, { kind: 'former_bylaw', citation: 'former North York By-law 7625', municipality: 'NY' })).toBe(false);
    expect(field('instrument', { kind: 'former_bylaw', citation: 'By-law 438-86' }, { kind: 'former_bylaw', citation: 'Toronto By-law 438-86, s.6' })).toBe(true);
    expect(field('application', { zones: ['RD'], building_types: ['any'], evidence: { RD: 'in the RD zone' } }, { zones: ['RD'], building_types: ['any'], evidence: { RD: 'RD zone' } })).toBe(true);
  });
  // A1 canonical rules (2026-10-07, A1 agreement analysis): each equates two spellings of ONE meaning, stated as a rule
  it('C1: a threshold token implied by the condition.if (vocab lot_condition[t].reads) is canonical, keyed or not', () => {
    // 10.20.30.10(1)(A) "if a zone label includes the letter "a"" — label_value reads `label`
    expect(field('condition', { tokens: [], if: 'labelled(a)' }, { tokens: ['label_value'], if: 'labelled(a)' })).toBe(true);
    // 10.20.30.40(1)(B) — overlay_mapped reads `overlay`
    expect(field('condition', { tokens: [], if: 'not mapped(LC)' }, { tokens: ['overlay_mapped'], if: 'not mapped(LC)' })).toBe(true);
    // 10.20.20.100(8)(B) — lot_area_band / frontage_band read lot_area_m2 / lot_frontage_m
    expect(field('condition', { tokens: ['major_street'], if: 'lot_area_m2 ≥ 2000 m2 and lot_frontage_m ≥ 30 m' }, { tokens: ['major_street', 'lot_area_band', 'frontage_band'], if: 'lot_area_m2 >= 2000 m2 and lot_frontage_m >= 30 m' })).toBe(true);
    // not implied → still compared: a token with no `if`, a non-threshold token, a different if
    expect(field('condition', { tokens: ['corner_lot'] }, { tokens: ['corner_lot', 'frontage_band'] })).toBe(false);
    expect(field('condition', { tokens: [], if: 'labelled(a)' }, { tokens: ['major_street'], if: 'labelled(a)' })).toBe(false);
    expect(field('condition', { tokens: ['label_value'], if: 'labelled(a)' }, { tokens: ['label_value'], if: 'labelled(f)' })).toBe(false);
  });
  it('C2: a presence test of the generated exception_area layer is not keyed (note c(1)), in tokens or in the if', () => {
    expect(field('condition', { tokens: [], if: 'mapped(exception_area)' }, 'none')).toBe(true);
    expect(field('condition', { tokens: [], if: 'mapped(HT) and mapped(exception_area)' }, { tokens: ['overlay_mapped'], if: 'mapped(HT)' })).toBe(true);
    expect(field('condition', { tokens: [], if: 'mapped(HT)' }, 'none')).toBe(false);
  });
  it('C3: an argument @path equal to its statement @path is the statement itself (no argument-level displacement can name it apart)', () => {
    // 10.40.40.1(3)(B)
    expect(field('numeric_expression', ['dwelling_units_max = max(60.0 units @(3)(B); label(u) @(3)(B)) @(3)(B)'], ['dwelling_units_max = max(60 units; label(u)) @(3)(B)'])).toBe(true);
    // a sub-clause argument path is information (argument-level displacement, M-48) → still compared
    expect(field('numeric_expression', ['height_m = max(13.0 m @(1)(D)(i); overlay(HT)) @(1)(D)'], ['height_m = max(13.0 m; overlay(HT)) @(1)(D)'])).toBe(false);
  });
  it('C4: a literals_not_expressed literal is identified by its number ("one storey" ≡ "one" ≡ "1", "12" ≡ "12.0 metres")', () => {
    const e = (literal: string, clause = '(1)', reason = 'count_or_ordinal_not_a_limit') => ({ literal, clause, reason });
    expect(field('literals_not_expressed', [e('one storey')], [e('one')])).toBe(true);
    expect(field('literals_not_expressed', [e('12', '(3)(B)', 'threshold_used_in_application')], [e('12.0 metres', '(3)(B)', 'threshold_used_in_application')])).toBe(true);
    expect(field('literals_not_expressed', [e('12 m', '(3)(B)', 'threshold_used_in_application')], [e('12 m', '(3)(B)', 'cross_reference_value')])).toBe(false);
    expect(field('literals_not_expressed', [e('12 m', '(3)(B)')], [e('15 m', '(3)(B)')])).toBe(false);
  });
  it('C5: a literals_not_expressed entry holding no number the slicer counts (regulation ids, dates, ordinals — brief rule 9) is dropped', () => {
    const e = (literal: string, reason = 'cross_reference_value') => ({ literal, clause: '(2)', reason });
    expect(field('literals_not_expressed', [e('900.1.10(3)'), e('June 26, 2025', 'illustrative_or_historic'), e('Section 45'), e('second', 'count_or_ordinal_not_a_limit')], [])).toBe(true);
    expect(field('literals_not_expressed', [e('900.1.10(3)'), e('45 pct')], [])).toBe(false);
  });
  it('C6: application.zones is compared by the zones it admits after the rule-1 chapter loader and rule 0', () => {
    const app = (zones: string[]) => ({ zones, building_types: ['apartment_building'], lot_conditions: ['major_street'], uses: [] });
    const f = (unitId: string, a: string[], b: string[]) => AU.canonicalField('application', app(a), { unitId }) === AU.canonicalField('application', app(b), { unitId });
    // a 10.20 (RD chapter) base unit loads only on RD lots: [] ≡ [RD] ≡ all five (10.20.40.1(5)(B), 10.20.30.40(1)(C))
    expect(f('10.20.40.1(5)#(5)(B)', [], ['RD'])).toBe(true);
    expect(f('10.20.30.40(1)#(1)(C)', [], ['R', 'RD', 'RM', 'RS', 'RT'])).toBe(true);
    // Residential Zone category (10.5, no chapter zone): [] ≡ all five ≡ any — rule 0 admits only those five
    expect(f('10.5.40.11(2)#whole', [], ['R', 'RD', 'RM', 'RS', 'RT'])).toBe(true);
    expect(f('10.5.40.11(2)#whole', ['any'], ['R', 'RD', 'RM', 'RS', 'RT'])).toBe(true);
    // a zone set that excludes the chapter zone, or a proper subset outside a zone chapter, is a different meaning
    expect(f('10.20.40.1(5)#(5)(B)', ['RS'], ['RD'])).toBe(false);
    expect(f('10.5.40.11(2)#whole', ['RD'], [])).toBe(false);
    // without a unit id the projection is the keyed set (no loader context)
    expect(AU.canonicalField('application', app([])) === AU.canonicalField('application', app(['RD']))).toBe(false);
  });
  it('an absent field never equals a written "none" ("none" is written, never omitted)', () => {
    expect(field('bound', undefined, 'none')).toBe(false);
  });
  it('the ⧉ set is the NARROWED M-17 set (dated note 2026-10-07, A1 re-measure): archetype, target, bound, numeric_expression', () => {
    expect([...AU.DOUBLE_KEYED]).toEqual(['archetype', 'target', 'bound', 'numeric_expression']);
    expect([...AU.NARROWED_DOUBLE_KEYED]).toEqual([...AU.DOUBLE_KEYED]);
    // the eleven fields that left the ⧉ set are single-drafted by keyer A (expert-sampled, M-29), never compared
    expect([...AU.NARROWED_OUT].sort()).toEqual(['application', 'applies_to', 'calculation_handling.not_modelled_reason', 'calculation_handling.user_inputs', 'condition', 'evaluated_by_us', 'input_fidelity.status', 'instrument', 'literals_not_expressed', 'ranks_layers', 'requirement']);
    for (const f of AU.NARROWED_OUT) expect(AU.DOUBLE_KEYED).not.toContain(f);
    expect(AU.DOUBLE_KEYED).not.toContain('calculation_handling.status');
    expect(AU.SINGLE_DRAFTED).toContain('calculation_handling.status');
  });
  it('G-AGREE compares the narrowed set only: B differing on a narrowed-out field still agrees; on a core field it does not', () => {
    const a = FX.GOOD['LIMIT×literal'];
    const s1 = FX.shardOf([a]);
    // an A1–A3 B draft (keyed under the v0.5 set) still carries the narrowed-out fields: ignored, never compared
    s1.b.units[0] = { ...s1.b.units[0], application: { zones: ['RS'], building_types: ['townhouse'], lot_conditions: [], uses: [] }, condition: { tokens: ['corner_lot'] } };
    const r1 = AG.checkAgree({ shards: [s1], vocab: VOCAB });
    expect([r1.counts.units_agreed, r1.counts.disagreements]).toEqual([1, 0]);
    const s2 = FX.shardOf([a]);
    s2.b.units[0] = { ...s2.b.units[0], bound: a.bound === 'min' ? 'max' : 'min' };
    expect(AG.checkAgree({ shards: [s2], vocab: VOCAB }).units.get(a.unit_id).disagreements).toEqual(['bound']);
  });
  it('G-SHAPE after the narrowing: keyer A must write every narrowed-out field; keyer B writing one (A1–A3 drafts) is not a violation', () => {
    const a = FX.GOOD['LIMIT×literal'];
    const s = FX.shardOf([a]);
    s.b.units[0] = { ...s.b.units[0], application: a.application, ranks_layers: 'none', calculation_handling: { not_modelled_reason: 'none', user_inputs: [] } };
    expect(SH.checkShape({ slice: FX.fixtureSlice(), shards: [s], vocab: VOCAB }).violations).toEqual([]);
    const noApp = JSON.parse(JSON.stringify(a));
    delete noApp.application;
    const s2 = FX.shardOf([noApp]);
    expect(SH.checkShape({ slice: FX.fixtureSlice(), shards: [s2], vocab: VOCAB }).violations.map((v: Json) => [v.code, v.detail])).toContainEqual(['field_missing', 'keyer A omits application']);
  });
});

describe('Spec 69 M-76 A1 — a building type named only as an exclusion is not named (G-CLAUSE any_with_named_type)', () => {
  const fx: Json[] = FX.clauseFixtures();
  const good = fx.find((f) => f.name.startsWith('good twin: M-76 A1'));
  const bad = fx.find((f) => f.name.startsWith('any_with_named_type: M-76 A1'));
  it('exclusion-only text ("other than an ancillary building … other than an apartment building") keyed `any` passes', () => {
    expect(good).toBeTruthy();
    const r = CL.checkClause(good!.input);
    expect(r.violations).toEqual([]);
  });
  it('a positively named type still fails, and the excluded type is not reported', () => {
    expect(bad).toBeTruthy();
    const r = CL.checkClause(bad!.input);
    expect(codesOf(r)).toEqual(['any_with_named_type']);
    const detail = r.violations.map((v: Json) => v.detail).join(' ');
    expect(detail).toContain('detached_house');
    expect(detail).toContain('townhouse');
    expect(detail).not.toContain('ancillary_building');
  });
});

describe('Spec 69 M-76 A2 + A3 — section / Article includes and the 3-part Article index (G-XREF)', () => {
  const fx: Json[] = FX.xrefFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p));
  it('A3: a 3-part Article id resolves to kind article; an unknown 3-part id stays unresolved', () => {
    const idx = AU.buildIndex(FX.fixtureSlice());
    expect(AU.resolveCitation(idx, '10.20.40')).toEqual({ ok: true, kind: 'article', id: '10.20.40' });
    expect(AU.resolveCitation(idx, '10.99.40').ok).toBe(false);
  });
  it('A2: a section include and a 3-part Article include expand (counted), no violation', () => {
    for (const p of ['good twin: M-76 A2 — a section include', 'good twin: M-76 A2 + A3']) {
      const f = byName(p);
      expect(f, p).toBeTruthy();
      const r = XR.checkXref(f!.input);
      expect(r.violations).toEqual([]);
      expect(r.counts.include_group_expansions).toBe(1);
    }
  });
  it('A2: an Article include containing its own regulation is a cycle; one with no in-scope rows is unresolved', () => {
    expect(codesOf(XR.checkXref(byName('include_cycle: M-76 A2')!.input))).toEqual(['include_cycle']);
    expect(codesOf(XR.checkXref(byName('include_unresolved: M-76 A2')!.input))).toEqual(['include_unresolved']);
  });
  it('A2: groupRows filters by inScopeIds', () => {
    const idx = AU.buildIndex(FX.fixtureSlice());
    expect(XR.groupRows(idx, { kind: 'article', id: '10.20.40.70' })).toEqual(['10.20.40.70(3)', '10.20.40.70(4)', '10.20.40.70(6)']);
    expect(XR.groupRows(idx, { kind: 'article', id: '10.20.40.70' }, new Set(['10.20.40.70(4)']))).toEqual(['10.20.40.70(4)']);
  });
});

describe('E-5 gate fix: a relative path resolves inside the unit own [SSP]/[PBS] group (Spec 68 §9 G-CLAUSE)', () => {
  it('(A) from (252)[SSP] is (252)[SSP](A); without the group it stays ambiguous / unresolved', () => {
    const row = { clauses: [{ path: '(252)' }, { path: '(252)[SSP]' }, { path: '(252)[SSP](A)' }, { path: '(252)[PBS]' }, { path: '(252)[PBS](A)' }] };
    expect(AU.resolveClause(row, '(A)', '(252)[SSP]').path).toBe('(252)[SSP](A)');
    expect(AU.resolveClause(row, '(A)', '(252)[PBS](A)').path).toBe('(252)[PBS](A)');
    expect(AU.resolveClause(row, '(A)')).toBeNull();
  });
});

describe('Spec 69 M-76 A10 — a mixed-measure LIMIT lists several targets (G-SHAPE)', () => {
  const fx: Json[] = FX.shapeFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p));
  it('two statements with their two listed targets pass', () => {
    const r = SH.checkShape(byName('good twin: M-76 A10')!.input);
    expect(r.violations).toEqual([]);
  });
  it('a listed target with no statement / a statement outside the list fails; a DEFINE with a list fails', () => {
    const r = SH.checkShape(byName('statement_target_mismatch: M-76 A10 — a listed target')!.input);
    expect(codesOf(r)).toEqual(['statement_target_mismatch']);
    const details = r.violations.map((v: Json) => v.detail).join(' | ');
    expect(details).toContain('height_storeys');
    expect(details).toContain('building_length_m has no statement');
    expect(codesOf(SH.checkShape(byName('statement_target_mismatch: M-76 A10 — a target list on a DEFINE')!.input))).toEqual(['statement_target_mismatch']);
  });
  it('unitTargets and the canonical target are order-independent', () => {
    expect(AU.unitTargets('none')).toEqual([]);
    expect(AU.unitTargets('height_m')).toEqual(['height_m']);
    expect(AU.unitTargets(['height_m', 'height_storeys'])).toEqual(['height_m', 'height_storeys']);
    expect(AU.canonicalField('target', ['height_storeys', 'height_m'])).toBe(AU.canonicalField('target', ['height_m', 'height_storeys']));
    expect(AU.canonicalField('target', 'height_m')).toBe('height_m');
  });
});

describe('G-XREF A4 / A9 fixtures (Spec 68 §9 G-XREF as written)', () => {
  const fx: Json[] = FX.xrefFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p));
  it('A4 good twin displaces 2; A4 red reports displaces_unresolved', () => {
    const g = XR.checkXref(byName('good twin: A4')!.input);
    expect(g.violations).toEqual([]);
    expect(g.counts.displaces).toBe(2);
    expect(codesOf(XR.checkXref(byName('displaces_unresolved: A4')!.input))).toEqual(['displaces_unresolved']);
  });
  it('A9 good twin counts one self-instruction ref; a non-self one stays ref_unresolved', () => {
    const g = XR.checkXref(byName('good twin: A9')!.input);
    expect(g.violations).toEqual([]);
    expect(g.counts.self_instruction_refs).toBe(1);
    expect(codesOf(XR.checkXref(byName('ref_unresolved: A9')!.input))).toEqual(['ref_unresolved']);
  });
});

describe('slicer exclusions A7 / A8 (Spec 68 §6.5 declared spans, vocab.json slicer.anti_vacuity_exclusions)', () => {
  it('A7: "Ontario Regulation 200/96" yields no literal; A8: an enacting row\'s leading "27." yields none; real literals stay', async () => {
    const T = await load('scripts/analysis/bylaw/text.mjs');
    expect(T.extractLiterals('as set out in Ontario Regulation 200/96, for 3.0 metres').map((l: Json) => l.raw)).toEqual(['3.0 metres']);
    expect(T.extractLiterals('27. Zoning By-law 569-2013, as amended, is further amended so that it reads: (C) a maximum of 0.9 metres').map((l: Json) => l.raw)).toEqual(['0.9 metres']);
    expect(T.extractLiterals('(2) a maximum of 27. metres').length).toBeGreaterThan(0);
    expect(T.scanNumbers('Ontario Regulation 200/96').uncovered).toEqual([]);
  });
});

describe('G-CLAUSE A12 / A13 / A6b fixtures (Spec 68 §9 G-CLAUSE as written)', () => {
  const fx: Json[] = FX.clauseFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p));
  for (const [good, bad, code] of [
    ['good twin: A13 + M-76 A10', 'literal_unaccounted: A13', 'literal_unaccounted'],
    ['good twin: A12', 'evidence_pattern_mismatch: A12', 'evidence_pattern_mismatch'],
    ['good twin: A6b', 'variable_unlicensed: A6b', 'variable_unlicensed'],
  ] as [string, string, string][]) {
    it(`${good} passes; ${bad} fails for ${code} only`, () => {
      expect(byName(good), good).toBeTruthy();
      expect(CL.checkClause(byName(good)!.input).violations).toEqual([]);
      expect(codesOf(CL.checkClause(byName(bad)!.input))).toEqual([code]);
    });
  }
});

describe("M-84 — keyer B's generated/single fields are ignored in every batch", () => {
  const fx: Json[] = FX.shapeFixtures();
  const byName = (p: string) => fx.find((f) => f.name.startsWith(p));
  it('a .b generated field passes (counted) in any batch; the same write in the .a draft fails', () => {
    const g = SH.checkShape(byName('good twin: M-84 — a generated field in a .b draft is ignored')!.input);
    expect(g.violations).toEqual([]);
    expect(g.counts.b_generated_ignored).toBe(1);
    const a4 = SH.checkShape(byName('good twin: M-84 — the same write in an A4 .b is ignored too')!.input);
    expect(a4.violations).toEqual([]);
    expect(a4.counts.b_generated_ignored).toBe(1);
    expect(codesOf(SH.checkShape(byName('generated_field_authored')!.input))).toEqual(['generated_field_authored']);
  });
});

describe('Spec 69a M-80 — re-key generations supersede (authored / G-AGREE / G-SHAPE)', () => {
  it('shardGeneration / predecessorKey', () => {
    expect(AU.shardGeneration('ch10_40/10.40.40.70')).toEqual({ base: 'ch10_40/10.40.40.70', gen: 0 });
    expect(AU.shardGeneration('ch10_40/10.40.40.70~r2')).toEqual({ base: 'ch10_40/10.40.40.70', gen: 2 });
    expect(AU.predecessorKey('a~r1')).toBe('a');
    expect(AU.predecessorKey('a~r2')).toBe('a~r1');
    expect(AU.predecessorKey('a')).toBeNull();
  });
  it('supersession: the newest generation owns the unit; a partial re-key leaves the other units with the old shard', () => {
    const g = FX.GOOD['LIMIT×literal'];
    const m = FX.GOOD['LIMIT×map_lookup'];
    const old = FX.shardOf([g, m]);
    const s = AU.supersession([old, FX.rekeyOf(old, [g])]);
    expect(s.newest.get(g.unit_id)).toBe(`${old.key}~r1`);
    expect(s.newest.get(m.unit_id)).toBe(old.key);
    expect([...s.superseded.get(old.key)]).toEqual([g.unit_id]);
    expect(s.whole.has(old.key)).toBe(false);
    expect(AU.supersession([old, FX.rekeyOf(old, [g, m])]).whole.has(old.key)).toBe(true);
  });
  it('G-AGREE reads the newest drafts; G-SHAPE allows the generation, not an unrelated duplicate', () => {
    const ag: Json[] = FX.agreeFixtures();
    const sh: Json[] = FX.shapeFixtures();
    const f1 = ag.find((f) => f.name.startsWith('good twin: M-80'))!;
    const r1 = AG.checkAgree(f1.input);
    expect(r1.status).toBe('pass');
    expect(f1.expect(r1)).toBe(true);
    expect(SH.checkShape(sh.find((f) => f.name.startsWith('good twin: M-80'))!.input).violations).toEqual([]);
    expect(codesOf(SH.checkShape(sh.find((f) => f.name.startsWith('schema_invalid: M-80'))!.input))).toEqual(['schema_invalid']);
  });
  it('G-PROV: a wholly superseded shard is not re-checked; supersedes must equal the predecessor files', () => {
    const fx: Json[] = FX.keyerFixtures();
    const good = fx.find((f) => f.name.startsWith('good twin: M-80'))!;
    const r = KP.checkKeyerProv(good.input);
    expect(r.violations).toEqual([]);
    expect(r.counts.superseded_shards).toBe(1);
    for (const f of fx.filter((x) => x.name.startsWith('supersedes_mismatch: M-80'))) expect(codesOf(KP.checkKeyerProv(f.input))).toEqual(['supersedes_mismatch']);
  });
});

describe('Spec 69a M-82 Q7 — limit_not_modelled only on UNUSUAL (G-SHAPE)', () => {
  const fx: Json[] = FX.shapeFixtures();
  it('passes on UNUSUAL, fails on LIMIT', () => {
    expect(SH.checkShape(fx.find((f) => f.name.startsWith('good twin: M-82'))!.input).violations).toEqual([]);
    expect(codesOf(SH.checkShape(fx.find((f) => f.name.startsWith('shape_must_be_none: M-82'))!.input))).toEqual(['shape_must_be_none']);
    expect(VOCAB.literal_not_expressed_reason).toContain('limit_not_modelled');
  });
});

// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-107 (operator 2026-10-14, a partly modelled LIMIT)
describe('Spec 69a M-107 — lot_condition_arm_not_modelled only on LIMIT (G-SHAPE)', () => {
  const fx: Json[] = FX.shapeFixtures();
  it('passes on LIMIT, fails on UNUSUAL', () => {
    expect(SH.checkShape(fx.find((f) => f.name.startsWith('good twin: M-107'))!.input).violations).toEqual([]);
    expect(codesOf(SH.checkShape(fx.find((f) => f.name.startsWith('shape_must_be_none: M-107'))!.input))).toEqual(['shape_must_be_none']);
    expect(VOCAB.literal_not_expressed_reason).toContain('lot_condition_arm_not_modelled');
  });
});

// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-130 (operator 2026-10-14, additive inexpressible arm of a LIMIT)
describe('Spec 69a M-130 — limit_arm_not_modelled only on LIMIT (G-SHAPE); aggregate_side_setback_m', () => {
  const fx: Json[] = FX.shapeFixtures();
  it('passes on LIMIT, fails on UNUSUAL', () => {
    expect(SH.checkShape(fx.find((f) => f.name.startsWith('good twin: M-130'))!.input).violations).toEqual([]);
    expect(codesOf(SH.checkShape(fx.find((f) => f.name.startsWith('shape_must_be_none: M-130'))!.input))).toEqual(['shape_must_be_none']);
    expect(VOCAB.literal_not_expressed_reason).toContain('limit_arm_not_modelled');
    expect(VOCAB.dsl_target.aggregate_side_setback_m).toMatchObject({ unit: 'm', aspect: 'envelope', patterns: ['aggregate side yard'] });
  });
});

describe('Spec 69 M-75 correction kind — a sealed draft is corrected by a record, never edited', () => {
  const g = FX.GOOD['LIMIT×literal'];
  const correctionFor = (field: string, value: unknown, o: Json = {}) => ({ adjudications: [{ id: `COR-${g.unit_id}/${field}`, kind: 'correction', unit: g.unit_id, field, value, reason: 'the clause says so', rule: 'Spec 68 §6.4', adjudicator: 'operator', adjudicated_on: '2026-10-08', ...o }] });
  const appValue = { zones: ['RS'], building_types: ['any'], lot_conditions: [], uses: [], evidence: { RS: 'in the RS zone' } };

  it('selfTest() covers each new reason code (its fixture fails for that code)', () => {
    const st = AG.selfTest();
    const byExpected = new Map((st.results as Json[]).map((x: Json) => [x.expected, x]));
    for (const code of ['correction_orphan', 'correction_rule_missing', 'correction_duplicate']) {
      const r = byExpected.get(code)!;
      expect(r, `no fixture for ${code}`).toBeTruthy();
      expect(r.ok, `${code} fixture did not fail for its code (got ${JSON.stringify(r.got)})`).toBe(true);
    }
  });

  it('a good correction on an A-only field changes the resolved unit and counts.corrections === 1', () => {
    const r = AG.checkAgree({ shards: [FX.shardOf([g])], adjudications: correctionFor('application', appValue), vocab: VOCAB });
    expect(r.status).toBe('pass');
    expect(r.counts.corrections).toBe(1);
    expect(r.units.get(g.unit_id)!.unit.application.zones).toEqual(['RS']);
  });

  it('a correction on a pending unit is an orphan', () => {
    const r = AG.checkAgree({ shards: [{ ...FX.shardOf([g]), b: null }], adjudications: correctionFor('application', appValue), vocab: VOCAB });
    expect(codesOf(r)).toEqual(['correction_orphan']);
  });

  it('a correction does not change the sealed draft object passed in', () => {
    const shards = [FX.shardOf([g])];
    const before = JSON.parse(JSON.stringify(shards));
    AG.checkAgree({ shards, adjudications: correctionFor('application', appValue), vocab: VOCAB });
    expect(shards).toEqual(before);
  });

  it('M-75 note 2026-10-08: a superseding correction applies, the superseded record is untouched and counted', () => {
    const f = FX.agreeFixtures().find((x: Json) => x.name.startsWith('good twin: M-75 supersedes'));
    const before = JSON.stringify(f.input.adjudications);
    const r = AG.checkAgree(f.input);
    expect(r.violations).toEqual([]);
    expect(f.expect(r)).toBe(true);
    expect(JSON.stringify(f.input.adjudications)).toBe(before);
  });
});

describe('closed sets locked both directions against vocab.json', () => {
  it('row_status values G-SHAPE computes == vocab.row_status', () => {
    expect([...SH.ROW_STATUSES].sort()).toEqual([...VOCAB.row_status].sort());
  });
  it('gate states the gates return ⊆ vocab.gate_state and the gates use all of it', () => {
    expect([...AU.GATE_STATES].sort()).toEqual([...VOCAB.gate_state].sort());
  });
  it('the adjudication kinds the gates handle are vocab.adjudication_kind members', () => {
    for (const k of [...AG.HANDLED_KINDS, ...KP.HANDLED_KINDS]) expect(VOCAB.adjudication_kind).toContain(k);
  });
  it('the ⧉ / A / G ownership lists are disjoint', () => {
    const all = [...AU.DOUBLE_KEYED, ...AU.NARROWED_OUT, ...AU.SINGLE_DRAFTED, ...AU.ROW_SINGLE_DRAFTED, ...AU.GENERATED_FIELDS];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('pending never fails a gate (Spec 68 §4, Spec 69 M-45): 0 authored shards', () => {
  it('every S6 gate passes on the fixture slice with nothing authored', () => {
    const slice = FX.fixtureSlice();
    const agree = AG.checkAgree({ shards: [], vocab: VOCAB });
    const units = AG.agreedUnits(agree);
    expect(agree.status).toBe('pass');
    expect(CL.checkClause({ slice, units, vocab: VOCAB }).status).toBe('pass');
    expect(XR.checkXref({ slice, units, vocab: VOCAB, external: { entries: [] } }).status).toBe('pass');
    const sh = SH.checkShape({ slice, shards: [], vocab: VOCAB });
    expect(sh.status).toBe('pass');
    expect(sh.counts.pending).toBe(slice.rows.length);
    expect(KP.checkKeyerProv({ shards: [], lsTree: () => [], headTree: [], staged: [] }).status).toBe('pass');
  });
  it('the keyer arm is not_run (never PASS) when a shard needs the ls-tree witness and none is injected', () => {
    const shard = FX.shardOf([FX.GOOD['LIMIT×literal']]);
    expect(KP.checkKeyerProv({ shards: [shard] }).status).toBe('not_run');
  });
});

describe('displacesOf — generated from the clause text through the slice API (Spec 68 §6 displaces[] G)', () => {
  const slice = FX.fixtureSlice();
  const idx = AU.buildIndex(slice);
  const d = (unitId: string) => XR.displacesOf(idx, unitId, VOCAB).targets.map((t: Json) => t.id).sort();
  it('"Despite regulation 10.20.40.70(3) and (4)" → both rows', () => expect(d('10.20.40.70(6)#whole')).toEqual(['10.20.40.70(3)', '10.20.40.70(4)']));
  it('"despite (A) above" → the sibling clause', () => expect(d('10.20.40.10(1)#(1)(C)')).toEqual(['10.20.40.10(1)#(1)(A)']));
  it('"regulation (A) and (B) above does not apply" → both siblings', () => expect(d('10.20.40.40(1)#(1)(C)')).toEqual(['10.20.40.40(1)#(1)(A)', '10.20.40.40(1)#(1)(B)']));
  it('"Despite regulations 900.1.10(3) and 900.1.10(4)(A)" → a row and a clause', () => expect(d('600.60.40(1)#(1)(B)')).toEqual(['900.1.10(3)', '900.1.10(4)#(4)(A)']));
  it('"despite (A) to (B) above … do not apply" → both siblings, and both triggers name them', () => {
    expect(d('10.20.40.40(1)#(1)(D)')).toEqual(['10.20.40.40(1)#(1)(A)', '10.20.40.40(1)#(1)(B)']);
    const trig = XR.displacesOf(idx, '10.20.40.40(1)#(1)(D)', VOCAB).triggers;
    expect(trig.map((t: Json) => t.phrase).sort()).toEqual(['despite', 'do not apply']);
    for (const t of trig) expect(t.n).toBeGreaterThan(0);
  });
  it('a subordinate "despite" ("despite any language in a Prevailing By-law") names nothing → needs a not_an_override reason', () => {
    const r = XR.displacesOf(idx, '900.1.10(4)#(4)(C)(iii)', VOCAB);
    expect(r.targets).toEqual([]);
    expect(r.triggers.filter((t: Json) => t.n === 0).map((t: Json) => t.phrase)).toEqual(['despite']);
  });
  it('every vocab trigger phrase that occurs in the fixture text has a fixture above (notwithstanding: 0 occurrences in the pinned pages; "exempt from": A4; "apply to prevent": M-93 below; "is not subject to the regulations of": 0 occurrences in the fixture text, M-93 live fixture below)', () => {
    const text = FX.fixtureSlice().rows.map((r: Json) => r.verbatim).join('\n');
    const occurs = VOCAB.displacement_triggers.phrases.filter((p: string) => new RegExp(`(?<![A-Za-z])${p}(?![A-Za-z])`).test(text));
    expect(occurs.sort()).toEqual(['Despite', 'apply to prevent', 'despite', 'do not apply', 'does not apply', 'exempt from']);
  });
  it('A4: "exempt from the requirements of regulation 10.20.20.100(8) (B) and (C)" → both sibling clauses', () => {
    expect(d('10.20.20.100(8)#(8)(D)')).toEqual(['10.20.20.100(8)#(8)(B)', '10.20.20.100(8)#(8)(C)']);
  });
  describe('Spec 69a M-81 R6 (live slice)', () => {
    const live = AU.buildIndex(FX.liveSlice());
    const dl = (unitId: string) => XR.displacesOf(live, unitId, VOCAB, null);
    it('"Despite regulation10.5.60.20(2), (3), (5) and (6)" (the City dropped the space) names the four rows', () => {
      const r = dl('10.10.60.20(1)#(1)(A)')!;
      expect(r.targets.map((t: Json) => t.id)).toEqual(expect.arrayContaining(['10.5.60.20(2)', '10.5.60.20(3)', '10.5.60.20(5)', '10.5.60.20(6)']));
      for (const t of r.triggers) expect(t.n).toBeGreaterThan(0);
    });
    it('(H) "the requirements of any regulation, prevailing section or prevailing by-law in article 900.2.10" displaces the article', () => {
      expect(dl('10.10.20.60(1)#(1)(H)').targets.map((t: Json) => t.id)).toEqual(['900.2.10']);
    });
    it('M-93 "apply to prevent": 200.25.1(3) "None of the provisions of regulations 200.5.10.1(7)(C), … 200.15.10.10(1) apply to prevent the erection or use of a lawfully existing building" displaces the cited regulations (backward trigger)', () => {
      const r = dl('200.25.1(3)#whole');
      expect(r.triggers.map((t: Json) => t.phrase)).toEqual(['apply to prevent']);
      expect(r.targets.map((t: Json) => t.id)).toEqual(expect.arrayContaining(['200.5.10.1(12)', '200.15.1(5)', '200.15.10.10(1)', '200.15.10.5(1)']));
      for (const t of r.triggers) expect(t.n).toBeGreaterThan(0);
    });
    it('M-93 "is not subject to the regulations of": 600.60.30(2) "… is not a fiveplex or sixplex, is not subject to the regulations of Section 600.60, and must comply …" displaces the section', () => {
      const r = dl('600.60.30(2)#whole');
      expect(r.triggers.map((t: Json) => t.phrase)).toEqual(['is not subject to the regulations of']);
      expect(r.targets.map((t: Json) => t.id)).toEqual(['600.60']);
    });
    it('good twin: (C) "regulation 10.10.40.1(3) and any regulation … in article 900.2.10" still names only its leading regulation', () => {
      expect(dl('10.10.20.60(1)#(1)(C)').targets.map((t: Json) => t.id)).toEqual(['10.10.40.1(3)']);
    });
  });
  it('A5: "despite the requirements of Chapter 200" → the chapter (here through an external ref; the fixture slice has no Ch.200 row)', () => {
    const ext = { entries: [{ id: 'REF-200', kind: 'ref', citation: 'Chapter 200', url: 'https://www.toronto.ca/x', reason: 'outside_page_set' }] };
    const r = XR.displacesOf(idx, '10.10.80.200(1)#(1)(B)', VOCAB, ext);
    expect(r.targets.map((t: Json) => t.citation)).toEqual(['Chapter 200']);
    expect(r.triggers.every((t: Json) => t.n > 0)).toBe(true);
  });
});
