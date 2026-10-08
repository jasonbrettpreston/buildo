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
  it('every vocab trigger phrase that occurs in the fixture text has a fixture above (notwithstanding: 0 occurrences in the pinned pages)', () => {
    const text = FX.fixtureSlice().rows.map((r: Json) => r.verbatim).join('\n');
    const occurs = VOCAB.displacement_triggers.phrases.filter((p: string) => new RegExp(`(?<![A-Za-z])${p}(?![A-Za-z])`).test(text));
    expect(occurs.sort()).toEqual(['Despite', 'despite', 'do not apply', 'does not apply']);
  });
});
