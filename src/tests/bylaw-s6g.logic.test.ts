// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (row_status, pending never fails a gate), §6 (G / A / ⧉),
//            §7.3 (per-archetype unit shape; one fixture per archetype × value-form pair that occurs in real text),
//            §7.4 (canonical agreement), §9 G-SHAPE, G-CLAUSE, G-XREF, G-AGREE, G-PROV (keyer provenance + ruling-id
//            arms), §10 stage 5; docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (+ notes), M-39, M-45, M-52, M-56;
//            docs/reports/mcbylaw-phase1-plan.md S6
//
// S6 authored-field gates: one known-bad fixture per reason code plus a good twin, from real clause text
// (scripts/analysis/bylaw/fixtures/real-rows.json); each gate's closed reason-code list; the S7 interface contract
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
  it('an absent field never equals a written "none" ("none" is written, never omitted)', () => {
    expect(field('bound', undefined, 'none')).toBe(false);
  });
  it('the ⧉ set is the M-17 set: calculation_handling status is single-drafted (note d), ranks_layers is keyed', () => {
    expect(AU.DOUBLE_KEYED).toContain('ranks_layers');
    expect(AU.DOUBLE_KEYED).not.toContain('calculation_handling.status');
    expect(AU.SINGLE_DRAFTED).toContain('calculation_handling.status');
    for (const f of AU.NARROWED_DOUBLE_KEYED) expect(AU.DOUBLE_KEYED).toContain(f);
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
    const all = [...AU.DOUBLE_KEYED, ...AU.SINGLE_DRAFTED, ...AU.ROW_SINGLE_DRAFTED, ...AU.GENERATED_FIELDS];
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
    const text = FX.REAL_ROWS.rows.map((r: Json) => r.verbatim).join('\n');
    const occurs = VOCAB.displacement_triggers.phrases.filter((p: string) => new RegExp(`(?<![A-Za-z])${p}(?![A-Za-z])`).test(text));
    expect(occurs.sort()).toEqual(['Despite', 'despite', 'do not apply', 'does not apply']);
  });
});
