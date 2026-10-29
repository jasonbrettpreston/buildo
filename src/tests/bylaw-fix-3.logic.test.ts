// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-240 (rule 7a v2), M-241 (N-2), M-242 (N-3), M-243 (D-3),
//            M-244 (D-1), M-245 (M-205(1) no floor); docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5 (rule 7a);
//            decision logs docs/reports/decisions/2026-10-20-bylaw-fix-rulings.json (the By-law Fix Rulings page) and
//            2026-10-20-chat-batch-c-bylaw.json (CHAT-21)
//
// By-law fix lane 3 (wf1/bylaw-fix-3): the seven by-law rulings the operator approved on 2026-10-20, drafted by lane
// wf1/bylaw-fix-2 from City of Toronto Committee of Adjustment examiner figures. Every assertion reads the production
// path (validate.mjs inputs → agree.mjs resolved units with the M-75 corrections → withGeneratedFields + xref displacesOf
// → evaluate.mjs loadCandidates / effective over evaluatorVocab()), as bylaw-fix-2 does.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const D = await mod('scripts/analysis/bylaw/dsl.mjs');
const CL = await mod('scripts/analysis/bylaw/clause.mjs');
const FA = await mod('scripts/analysis/bylaw/front-averaging.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const touched = (r: Json): string[] => [r.winner, ...(r.applied ?? [])].filter((x: unknown): x is string => typeof x === 'string');
void unitOf; void read; void touched; void ZONES;

// R-7a-v2 / M-240 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#R-7a-v2`): rule 7a does not count a
// DEFINE unit that has no statement for the target, nor a unit whose building_types exclude the lot's type (or its
// parent); an absence ruling may name building_types and may answer not_applicable with its subject_clause. ABS-3…ABS-7
// close the 16 INV-19 cells; R lot_coverage_pct resolves by ABS-1 (M-54 amended).
describe('R-7a-v2 / M-240 — absence per (zone, building type, target); a definition or another type\'s limit is not a limit', () => {
  const PRINCIPAL = ['detached_house', 'semi_detached_house', 'detached_houseplex'];
  const abs = (r: Json): unknown[] => [r.status, r.value, r.reason ?? null, r.evidence?.kind, r.evidence?.ruling];
  it('R: lot coverage of every principal type is unregulated by ABS-1 (DEFINE and ancillary-only units no longer block)', () => {
    for (const bt of PRINCIPAL) expect([bt, ...abs(eff(lot('R', bt), 'lot_coverage_pct'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-1']);
  });
  it('ABS-3: R building length of a house, semi or houseplex is unregulated; an R townhouse on a major street keeps 19.0 m from 10.10.40.20(1)(A)', () => {
    for (const bt of PRINCIPAL) expect([bt, ...abs(eff(lot('R', bt), 'building_length_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-3']);
    const t = eff(lot('R', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([t.value, t.winner]).toEqual([19, '10.10.40.20(1)#(1)(A)']);
  });
  it('ABS-4 / ABS-5: RT building length and depth of a house, semi or houseplex are unregulated; an RT townhouse on a major street keeps 19.0 m', () => {
    for (const bt of PRINCIPAL) {
      expect([bt, ...abs(eff(lot('RT', bt), 'building_length_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-4']);
      expect([bt, ...abs(eff(lot('RT', bt), 'building_depth_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-5']);
    }
    const t = eff(lot('RT', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([t.value, t.winner]).toEqual([19, '10.60.40.20(1)#(1)(A)']);
  });
  it('ABS-6: an RD semi-detached house\'s depth is unregulated; an RD detached house keeps 19.0 m from 10.20.40.30(1)', () => {
    expect(abs(eff(lot('RD', 'semi_detached_house'), 'building_depth_m'))).toEqual(['value', 'unregulated', null, 'absence', 'ABS-6']);
    const d = eff(lot('RD', 'detached_house'), 'building_depth_m');
    expect([d.value, d.winner]).toEqual([19, '10.20.40.30(1)#whole']);
  });
  it('ABS-7: an RM detached houseplex has no length, depth or main-wall rule — not_applicable:<the clause whose subject excludes it>', () => {
    const want: Record<string, string> = { building_length_m: '10.80.40.20(1)', building_depth_m: '10.80.40.30(1)', main_wall_height_m: '10.80.40.10(2)' };
    for (const [t, clause] of Object.entries(want)) {
      const r = eff(lot('RM', 'detached_houseplex'), t);
      expect([t, r.status, r.value, r.reason, r.evidence?.kind, String(r.evidence?.ruling).startsWith('ABS-7')]).toEqual([t, 'not_applicable', null, `not_applicable:${clause}`, 'absence', true]);
    }
  });
  it('Q-KG2: ABS-7.3 also covers an RM townhouse and an RM semi-detached houseplex (neither is in the subject of 10.80.40.10(2)); a townhouse on a major street too (M-190)', () => {
    for (const bt of ['townhouse', 'semi_detached_houseplex']) {
      for (const flags of [{}, { major_street: true }]) {
        const r = eff(lot('RM', bt, { flags }), 'main_wall_height_m');
        expect([bt, JSON.stringify(flags), r.status, r.value, r.reason, r.evidence?.kind, r.evidence?.ruling]).toEqual([bt, JSON.stringify(flags), 'not_applicable', null, 'not_applicable:10.80.40.10(2)', 'absence', 'ABS-7.3']);
      }
    }
    // unchanged: the RM detached and semi-detached HOUSE keep the clause, and the detached houseplex keeps ABS-7.3
    expect(String(eff(lot('RM', 'semi_detached_house'), 'main_wall_height_m').winner).startsWith('10.80.40.10(2)')).toBe(true);
    expect(eff(lot('RM', 'detached_houseplex'), 'main_wall_height_m').evidence?.ruling).toBe('ABS-7.3');
  });
  it('Q-KG2 family: an RM semi-detached houseplex has no building length or depth rule (10.80.40.20(1) and 10.80.40.30(1) bind a detached or semi-detached HOUSE); ABS-7.1 / ABS-7.2', () => {
    const want: Array<[string, string, string]> = [['building_length_m', '10.80.40.20(1)', 'ABS-7.1'], ['building_depth_m', '10.80.40.30(1)', 'ABS-7.2']];
    for (const [target, clause, ruling] of want) for (const flags of [{ major_street: false }, { major_street: true }]) {
      const r = eff(lot('RM', 'semi_detached_houseplex', { flags }), target);
      expect([target, JSON.stringify(flags), r.status, r.value, r.reason, r.evidence?.kind, r.evidence?.ruling]).toEqual([target, JSON.stringify(flags), 'not_applicable', null, `not_applicable:${clause}`, 'absence', ruling]);
    }
  });
  it('Q-KG2 family: an RM townhouse has no building depth rule at all (ABS-7.2); its length is 19.0 m only on a major street (10.80.40.20(3)(A)); off one it is unregulated by ABS-7.4 (Q-KG3); unknown while the flag is unknown', () => {
    for (const flags of [{ major_street: false }, { major_street: true }]) {
      const d = eff(lot('RM', 'townhouse', { flags }), 'building_depth_m');
      expect([JSON.stringify(flags), d.status, d.reason, d.evidence?.ruling]).toEqual([JSON.stringify(flags), 'not_applicable', 'not_applicable:10.80.40.30(1)', 'ABS-7.2']);
    }
    const on = eff(lot('RM', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([on.status, on.value, on.winner]).toEqual(['value', 19, '10.80.40.20(3)#(3)(A)']);
    // off a major street: Q-KG3 (rule 7a ignores a unit whose lot condition is known false), see the Q-KG3 describe below
    const off = eff(lot('RM', 'townhouse', { flags: { major_street: false } }), 'building_length_m');
    expect([off.status, off.value, off.evidence?.ruling]).toEqual(['value', 'unregulated', 'ABS-7.4']);
    const l = lot('RM', 'townhouse');
    delete l.flags.major_street;
    const unknown = eff(l, 'building_length_m');
    expect([unknown.status, unknown.reason]).toEqual(['not_evaluated', 'condition_unknown:major_street']);
  });
  it('Q-KG2 family: the ABS-7.1 / 7.2 entries name the added types, keep expert_sample, and add only phrases absent from the pinned page', () => {
    const byId = (id: string): Json => I.absences.find((x: Json) => x.id === id);
    expect(byId('ABS-7.1').building_types).toEqual(['detached_houseplex', 'semi_detached_houseplex']);
    expect(byId('ABS-7.2').building_types).toEqual(['detached_houseplex', 'semi_detached_houseplex', 'townhouse']);
    for (const id of ['ABS-7.1', 'ABS-7.2']) expect(byId(id).expert_sample).toBe(true);
    const p = page('ch10_80').toLowerCase().replace(/\s+/g, ' ');
    for (const id of ['ABS-7.1', 'ABS-7.2']) for (const ph of byId(id).absent_phrases) expect(p.includes(String(ph).toLowerCase()), `${id}: ${ph}`).toBe(false);
  });
  it('Q-KG2: the ABS-7.3 entry names exactly the three types, keeps expert_sample, and the statement names the added types', () => {
    const r = I.absences.find((x: Json) => x.id === 'ABS-7.3');
    expect(r.building_types).toEqual(['detached_houseplex', 'semi_detached_houseplex', 'townhouse']);
    expect(r.expert_sample).toBe(true);
    expect(r.absent_phrases).toEqual(expect.arrayContaining(['main walls for a semi-detached houseplex', 'main walls of a semi-detached houseplex', 'main walls for a townhouse', 'main walls of a townhouse']));
    expect(r.statement).toMatch(/townhouse/);
    expect(r.statement).toMatch(/semi-detached houseplex/);
  });
  it('the RM detached house keeps its 17.0 m length, 19.0 m depth and x.40.10(2) main wall', () => {
    const l = lot('RM', 'detached_house');
    expect([eff(l, 'building_length_m').value, eff(l, 'building_depth_m').value, String(eff(l, 'main_wall_height_m').winner).startsWith('10.80.40.10(2)')]).toEqual([17, 19, true]);
  });
  it('INV-19 open arm: no principal cell of the four targets is not_evaluated:no_candidate (ratchet 16 → 0)', () => {
    const open: string[] = [];
    for (const zone of ZONES) for (const bt of PRINCIPAL) for (const t of ['lot_coverage_pct', 'building_length_m', 'building_depth_m', 'main_wall_height_m']) {
      const r = eff(lot(zone, bt), t);
      if (r.status === 'not_evaluated' && r.reason === 'no_candidate') open.push(`${zone} ${bt} ${t}`);
    }
    expect(open).toEqual([]);
  });
  it('the absence rulings ABS-3…ABS-7 are each executed against their pinned page and pass', () => {
    const rs = I.absences.filter((r: Json) => /^ABS-[3-7](\.\d+)?$/.test(r.id));
    expect(rs.map((r: Json) => r.id)).toEqual(['ABS-3', 'ABS-4', 'ABS-5', 'ABS-6', 'ABS-7.1', 'ABS-7.2', 'ABS-7.3', 'ABS-7.4']);
    const res = E.checkAbsenceRulings({ rulings: rs, pages: Object.fromEntries(rs.map((r: Json) => [r.checked_page, page(r.checked_page)])), vocab: I.vocab });
    expect({ pass: res.pass, violations: res.violations }).toEqual({ pass: true, violations: [] });
  });
  it('an absence ruling may name building_types and answer not_applicable; not_applicable needs its subject_clause; one zone|target may carry a ruling per type', () => {
    const r6 = I.absences.find((r: Json) => r.id === 'ABS-6');
    expect(r6.building_types).toEqual(['semi_detached_house']);
    const r71 = I.absences.find((r: Json) => r.id === 'ABS-7.1');
    const { subject_clause: _drop, ...noClause } = r71; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(E.verifyAbsence(noClause, page(r71.checked_page), I.vocab).violations.join(' ')).toMatch(/not_applicable needs subject_clause/);
    const two = [r6, { ...r6, id: 'ABS-99', building_types: ['semi_detached_houseplex'] }];
    expect(E.checkAbsenceRulings({ rulings: two, pages: { [r6.checked_page]: page(r6.checked_page) }, vocab: I.vocab }).violations.filter((v: string) => /two rulings/.test(v))).toEqual([]);
    expect(E.checkAbsenceRulings({ rulings: [r6, { ...r6, id: 'ABS-99' }], pages: { [r6.checked_page]: page(r6.checked_page) }, vocab: I.vocab }).violations.join(' ')).toMatch(/two rulings/);
  });
});

// Q-KG3 (HELD): rule 7a ignores a unit whose lot condition is KNOWN FALSE for the lot (vocab.absence_ignore.known_false_lot_conditions),
// so a townhouse OFF a major street, whose only building-length unit is the major-street one, is unregulated by absence; a lot whose
// condition is UNKNOWN still returns condition_unknown, and a lot ON a major street keeps the 19.0 m unit.
describe('Q-KG3 — rule 7a ignores a unit whose lot condition is known false (townhouse building length off a major street)', () => {
  const L = (zone: string, bt: string, ms?: boolean): Json => { const l = lot(zone, bt, { flags: ms === undefined ? {} : { major_street: ms } }); if (ms === undefined) delete l.flags.major_street; return l; };
  const cell = (r: Json): unknown[] => [r.status, r.value ?? r.reason, r.evidence?.ruling ?? r.winner];
  it('off a major street an R, RT and RM townhouse has no building-length limit: unregulated by absence (ABS-3, ABS-4, ABS-7.4)', () => {
    expect(cell(eff(L('R', 'townhouse', false), 'building_length_m'))).toEqual(['value', 'unregulated', 'ABS-3']);
    expect(cell(eff(L('RT', 'townhouse', false), 'building_length_m'))).toEqual(['value', 'unregulated', 'ABS-4']);
    expect(cell(eff(L('RM', 'townhouse', false), 'building_length_m'))).toEqual(['value', 'unregulated', 'ABS-7.4']);
  });
  it('on a major street the 19.0 m unit still wins', () => {
    expect(cell(eff(L('R', 'townhouse', true), 'building_length_m'))).toEqual(['value', 19, '10.10.40.20(1)#(1)(A)']);
    expect(cell(eff(L('RT', 'townhouse', true), 'building_length_m'))).toEqual(['value', 19, '10.60.40.20(1)#(1)(A)']);
    expect(cell(eff(L('RM', 'townhouse', true), 'building_length_m'))).toEqual(['value', 19, '10.80.40.20(3)#(3)(A)']);
  });
  it('an UNKNOWN major_street is still condition_unknown, never absence', () => {
    for (const z of ['R', 'RT', 'RM']) expect([z, ...cell(eff(L(z, 'townhouse'), 'building_length_m'))]).toEqual([z, 'not_evaluated', 'condition_unknown:major_street', undefined]);
  });
  it('the change is declared data: without known_false_lot_conditions the off-major-street cell is no_candidate again', () => {
    const vocab = { ...I.vocab, absence_ignore: { ...I.vocab.absence_ignore, known_false_lot_conditions: [] } };
    const C0 = E.makeContext(VO.evaluatorVocab(vocab), { absences: I.absences });
    const l = L('R', 'townhouse', false);
    const r = E.effective(l, 'building_length_m', E.loadCandidates(l, units).candidates, C0);
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'no_candidate']);
    expect(I.vocab.absence_ignore.known_false_lot_conditions).toEqual(['major_street']);
  });
  it('an apartment building off a major street follows the same rule in R and RT (zone-wide rulings), and RM has no apartment ruling', () => {
    expect(cell(eff(L('R', 'apartment_building', false), 'building_length_m'))).toEqual(['value', 'unregulated', 'ABS-3']);
    expect(cell(eff(L('RT', 'apartment_building', false), 'building_length_m'))).toEqual(['value', 'unregulated', 'ABS-4']);
    expect(cell(eff(L('RM', 'apartment_building', false), 'building_length_m'))).toEqual(['not_evaluated', 'no_candidate', undefined]);
  });
  it('ABS-7.4 names only the RM townhouse, keeps expert_sample, and its absent phrases are absent from the pinned page', () => {
    const r = I.absences.find((x: Json) => x.id === 'ABS-7.4');
    expect([r.zone, r.target, r.building_types, r.expert_sample, r.answer]).toEqual(['RM', 'building_length_m', ['townhouse'], true, undefined]);
    const p = page('ch10_80').toLowerCase().replace(/\s+/g, ' ');
    for (const ph of r.absent_phrases) expect(p.includes(String(ph).toLowerCase()), String(ph)).toBe(false);
  });
});

// Q-KG3 / verify-44 A4: applies() reports a known-false lot condition as a STRUCTURED field, so rule 7a never depends on the wording of `why`.
describe('Q-KG3 A4 — applies() returns known_false_condition, and rule 7a reads that field, not the message text', () => {
  const unit = (id: string): Json => { const u = units.find((x: Json) => x.unit_id === id); if (!u) throw new Error(`no unit ${id}`); return u; };
  const townhouseLength = '10.80.40.20(3)#(3)(A)';
  const ap = (flag: boolean | undefined): Json => {
    const l = lot('RM', 'townhouse', { flags: flag === undefined ? {} : { major_street: flag } });
    if (flag === undefined) delete l.flags.major_street;
    return E.applies(l, unit(townhouseLength), C, () => null, new Set(), [], 'building_length_m');
  };
  it('a flag that is false names its token in known_false_condition; true and unknown carry no such field', () => {
    expect(ap(false)).toMatchObject({ ok: false, known_false_condition: 'major_street' });
    expect(ap(true).known_false_condition).toBeUndefined();
    expect(ap(undefined).ok).toBeNull();
    expect(ap(undefined).known_false_condition).toBeUndefined();
  });
  it('rule 7a does not parse the message: the evaluator source holds no comparison of a.why with a condition string', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/analysis/bylaw/evaluate.mjs'), 'utf8');
    expect(src).not.toMatch(/a\.why\s*===\s*`condition/);
    expect(src).toMatch(/known_false_condition/);
  });
});

// N-3 / M-242 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#N-3`): a unit whose own text is a complement
// phrase ("in all other cases", "in any other case", "otherwise"; vocab.complement_phrases) may carry condition.if =
// complement(<sibling unit id>, …), the negation of each sibling's keyed condition; G-CLAUSE licenses its variables and
// literals from the sibling's clause. First use: 10.5.60.50(2)(B) "40.0 square metres in all other cases" (City: 40 m² on
// 20 Norwood Rd A0625/26TEY, frontage 7.63 m, and 27 Regal).
describe('N-3 / M-242 — "in all other cases" takes the complement of its sibling arm (10.5.60.50(2)(B))', () => {
  it('vocab declares the complement phrases', () => {
    expect(I.vocab.complement_phrases?.phrases).toEqual(['in all other cases', 'in any other case', 'otherwise']);
  });
  it('the DSL parses complement(<unit id>, …) as one condition form, with a canonical text', () => {
    const c = D.parseCond('complement(10.5.60.50(2)#(2)(A))');
    expect(c).toEqual({ type: 'complement', of: ['10.5.60.50(2)#(2)(A)'] });
    expect(D.canonCond(D.parseCond('complement(1#(A), 1#(B))'))).toBe('complement(1#(A);1#(B))');
  });
  it('(B) is keyed complement((A)) and the evaluator reads it as not (lot_frontage_m ≥ 12.0 m)', () => {
    expect(unitOf('10.5.60.50(2)#(2)(B)').condition).toEqual({ tokens: ['frontage_band'], if: 'complement(10.5.60.50(2)#(2)(A))' });
    expect(units.find((u) => u.unit_id === '10.5.60.50(2)#(2)(B)')?.condition.complement_if).toEqual(['lot_frontage_m ≥ 12.0 m']);
  });
  it('the 20 Norwood Rd facts (R, frontage 7.63 m, a plain ancillary building) answer 40 m² from (B); 12.0 m answers 60 m² from (A)', () => {
    const narrow = eff(lot('R', 'ancillary_building', { label: { d: 1.0 }, vars: { lot_frontage_m: 7.63, lot_depth_m: 34.0, lot_area_m2: 259.6 } }), 'ancillary_floor_area_m2');
    expect([narrow.value, narrow.winner]).toEqual([40, '10.5.60.50(2)#(2)(B)']);
    const wide = eff(lot('R', 'ancillary_building', { vars: { lot_frontage_m: 12 } }), 'ancillary_floor_area_m2');
    expect([wide.value, wide.winner]).toEqual([60, '10.5.60.50(2)#(2)(A)']);
  });
  it('an unknown frontage leaves both arms undecided (the complement of unknown is unknown)', () => {
    const r = eff(lot('R', 'ancillary_building', { vars: { lot_frontage_m: undefined } }), 'ancillary_floor_area_m2');
    expect(r.status).toBe('not_evaluated');
  });
  it('G-CLAUSE: the production units pass; a complement on a unit whose text has no complement phrase is refused', () => {
    const agreed = AG.agreedUnits(ag);
    const ok = CL.checkClause({ slice: I.slice, units: agreed, vocab: I.vocab, adjudications: I.adjudications });
    expect(ok.violations.filter((x: Json) => x.id === '10.5.60.50(2)#(2)(B)')).toEqual([]);
    const a = agreed.get('10.5.60.50(2)#(2)(A)');
    const bad = new Map([['10.5.60.50(2)#(2)(A)', { ...a, condition: { tokens: ['frontage_band'], if: 'complement(10.5.60.50(2)#(2)(B))' } }], ['10.5.60.50(2)#(2)(B)', agreed.get('10.5.60.50(2)#(2)(B)')]]);
    const r = CL.checkClause({ slice: I.slice, units: bad, vocab: I.vocab, adjudications: I.adjudications });
    expect(r.violations.filter((x: Json) => x.id === '10.5.60.50(2)#(2)(A)').map((x: Json) => x.code)).toContain('variable_unlicensed');
  });
});

// D-1 / M-244 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#D-1`; M-159(3) specific-use scope):
// 10.10.40.71(1) "… do not apply to a transportation use along Eglinton Avenue West and Eglinton Avenue East …" is scoped to
// its use. transportation_use joins vocab.uses and vocab.specific_use; a house lot never has it, so the Eglinton map gate is
// never read for a house and front_setback_m resolves from 10.10.40.70(1) or by averaging, never map_area_not_held.
describe('D-1 / M-244 — the Eglinton transportation-use exemption is scoped to its use', () => {
  const rNoMap = (flags: Json = {}, vars: Json = {}): Json => lot('R', 'detached_house', { map_areas: undefined, flags, vars });
  it('vocab: transportation_use is a use and a specific use with its closed disclosure', () => {
    expect(I.vocab.uses).toContain('transportation_use');
    expect(I.vocab.specific_use.transportation_use?.disclosure).toBe('rules for a transportation use on this lot are not part of this answer');
  });
  it('10.10.40.71(1) is keyed uses [transportation_use], evidence "a transportation use"', () => {
    const u = unitOf('10.10.40.71(1)#whole');
    expect([u.application.uses, u.application.evidence.transportation_use]).toEqual([['transportation_use'], 'a transportation use']);
  });
  it('an R lot without map areas and no averaging answers 6.0 m from 10.10.40.70(1), and never reads the Eglinton map gate', () => {
    const r = eff(rNoMap({ front_averaging_not_applicable: true }), 'front_setback_m');
    expect([r.value, r.winner]).toEqual([6, '10.10.40.70(1)#whole']);
    expect((r.trace ?? []).filter((t: string) => /map_area_not_held/.test(t))).toEqual([]);
  });
  it('an R lot without map areas where averaging applies answers by averaging (10.5.40.70(1)), never map_area_not_held', () => {
    const r = eff(rNoMap({ front_averaging_not_applicable: false, one_abutting_building_within_15_m: true, two_abutting_buildings_within_15_m: false }, { abutting_front_setback_m: 4.5 }), 'front_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 4.5, '10.5.40.70(1)#(1)(A)']);
    const u = eff(rNoMap({ front_averaging_not_applicable: false }), 'front_setback_m');
    expect(String(u.reason)).not.toMatch(/map_area_not_held/);
  });
  it('M-159(3): the unit applies only on a lot that has the use', () => {
    const u = units.find((x) => x.unit_id === '10.10.40.71(1)#whole') as Json;
    expect(E.applies(rNoMap(), u, C).ok).toBe(false);
    const transit = lot('R', 'detached_house', { uses: ['transportation_use'], map_areas: ['Eglinton Avenue West'], flags: { abuts_named_street: true } });
    expect(E.applies(transit, u, C).ok).toBe(true);
  });
});

// M-205(1)-floor / M-245 (operator approved 2026-10-20 in chat, `2026-10-20-chat-batch-c-bylaw#CHAT-21`): where
// 10.5.40.70(1) applies, front_setback_m = averaged estimate + fya_porch_allowance_m with no zone-default floor; the zone
// default applies only where averaging does not apply. City figures under averaging below 6.0 m: 453 Durie St
// A0594/26TEY (R) 3.91 m, 24 Gardens Cres A0491/26TEY (RD) 4.86 m.
describe('M-205(1)-floor / M-245 — no zone-default floor under the averaged front yard', () => {
  const nb = (est: number): Json => ({ neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1, bldg_to_subject_m: 1.2, front_setback_est_m: est, est_status: 'estimated' });
  const viaEvaluator = (zone: string, r: Json): Json => eff(lot(zone, 'detached_house', { flags: r.flags, vars: r.vars }), 'front_setback_m');
  it('R: two neighbours at 2.91 m → 3.91 m (453 Durie St\'s examiner figure), through 10.5.40.70(1)(B), needs survey', () => {
    const r = FA.resolveFrontAveraging([nb(2.91), nb(2.91)], { fya_porch_allowance_m: 1.0 }, { zone_default_m: 6.0 });
    expect([r.front_setback_m, r.basis, r.needs_survey, r.disclosures]).toEqual([3.91, 'averaged_two', true, ['front_yard_needs_survey']]);
    const e = viaEvaluator('R', r);
    expect([e.value, e.winner]).toEqual([3.91, '10.5.40.70(1)#(1)(B)']);
  });
  it('RD: one neighbour at 3.86 m → 4.86 m (24 Gardens Cres\'s examiner figure), through 10.5.40.70(1)(A)', () => {
    const r = FA.resolveFrontAveraging([nb(3.86)], { fya_porch_allowance_m: 1.0 }, { zone_default_m: 6.0 });
    expect(r.front_setback_m).toBe(4.86);
    const e = viaEvaluator('RD', r);
    expect([e.value, e.winner]).toEqual([4.86, '10.5.40.70(1)#(1)(A)']);
  });
  // amended 2026-10-21 by 69a M-256 (`2026-10-21-chat-batch-g#CHAT-29.FRONT-YARD`): an excluded estimate answers needs survey
  // (no value), never the zone default
  it('the zone default applies only where averaging does not: no qualifying neighbour, three or more neighbours; an excluded estimate needs a survey (M-256)', () => {
    const cfg = { fya_porch_allowance_m: 1.0 }; const z = { zone_default_m: 6.0 };
    expect(FA.resolveFrontAveraging([], cfg, z).front_setback_m).toBe(6.0);
    expect(FA.resolveFrontAveraging([nb(2.0), { ...nb(2.0), est_status: 'estimate_negative', front_setback_est_m: null }], cfg, z).front_setback_m).toBe(6.0); // CHAT-198.NN-Q4: the flagged 6.0 m default, not an owed answer
    expect(FA.resolveFrontAveraging([nb(2.0), nb(2.0), nb(2.0)], cfg, z).front_setback_m).toBe(6.0);
  });
});

// N-2 / M-241 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#N-2`; CoA 20 Norwood Rd A0625/26TEY: the City
// applied 10.10.60.20(1)(A) as a 1.0 m garage side yard). (1) The M-175 guard applies only when the building answered is a
// principal or suite class; for the ancillary class a private-garage unit applies when the ancillary building contains a
// parking space (user input ancillary_contains_parking_space; unknown → needs_user_input, never the shed rule). (2)
// 10.10.60.20(1)(A) "1.0 metres from a rear lot line or side lot line abutting a street or lane" keys rear_setback_m,
// side_setback_street_m and lane_setback_m at 1.0 m, each on its own abutment condition (rear: abuts_lane until ML-1).
describe('N-2 / M-241 — a private-garage rule binds the ancillary building that is the garage', () => {
  const garage = (zone: string, parking: boolean | undefined, flags: Json = {}): Json => lot(zone, 'ancillary_building', { label: { d: 1.0 }, flags: { ...flags, ...(parking === undefined ? {} : { ancillary_contains_parking_space: parking }) }, vars: { lot_frontage_m: 7.63, lot_depth_m: 34.09, lot_area_m2: 260.07, proposed_height_m: 3.5 } });
  it('vocab: ancillary_contains_parking_space is a user-input lot condition, and private_garage names it as its ancillary condition', () => {
    expect(I.vocab.user_input).toContain('ancillary_contains_parking_space');
    expect(I.vocab.lot_condition.ancillary_contains_parking_space).toMatchObject({ user_input: 'ancillary_contains_parking_space' });
    expect(I.vocab.accessory_structure_use.private_garage.ancillary_condition).toBe('ancillary_contains_parking_space');
  });
  it('10.10.60.20(1)(A) keys rear, side-street and lane setbacks of 1.0 m, each on its own abutment condition', () => {
    expect(unitOf('10.10.60.20(1)#(1)(A)').numeric_expression).toEqual([
      'rear_setback_m = if(holds(abuts_lane); 1.0 m; unregulated) @(1)(A)',
      'side_setback_street_m = if(holds(corner_lot); 1.0 m; unregulated) @(1)(A)',
      'lane_setback_m = if(holds(abuts_lane); 1.0 m; unregulated) @(1)(A)',
    ]);
  });
  it('20 Norwood Rd facts (R, abuts a lane, a garage with parking): 1.0 m from the lane line and the rear line, from 10.10.60.20(1)(A)', () => {
    const l = garage('R', true, { abuts_lane: true });
    const lane = eff(l, 'lane_setback_m'); const rear = eff(l, 'rear_setback_m');
    expect([lane.value, lane.winner, rear.value, rear.winner]).toEqual([1, '10.10.60.20(1)#(1)(A)', 1, '10.10.60.20(1)#(1)(A)']);
  });
  it('while the parking space is unknown the answer is needs_user_input, never the shed rule', () => {
    const r = eff(garage('R', undefined, { abuts_lane: true }), 'rear_setback_m');
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'needs_user_input:ancillary_contains_parking_space']);
  });
  it('a shed (no parking space) keeps the ancillary rules: rear 0.3 m from 10.5.60.20(2)(C)', () => {
    const r = eff(garage('R', false, { abuts_lane: true }), 'rear_setback_m');
    expect([r.value, r.winner]).toEqual([0.3, '10.5.60.20(2)#(2)(C)']);
  });
  it('(1)(B): a garage whose rear line abuts no street or lane has no rear minimum; a side line abutting a street takes 1.0 m', () => {
    const r = eff(garage('R', true, { abuts_lane: false }), 'rear_setback_m');
    expect(r.value).toBe('unregulated');
    const s = eff(garage('R', true, { corner_lot: true }), 'side_setback_street_m');
    expect([s.value, s.winner]).toEqual([1, '10.10.60.20(1)#(1)(A)']);
  });
  it('RD: a garage with parking on a lane lot takes 10.5.60.20(6)(A) 1.0 m from the lane', () => {
    const r = eff(garage('RD', true, { abuts_lane: true }), 'lane_setback_m');
    expect([r.value, r.winner]).toEqual([1, '10.5.60.20(6)#(6)(A)']);
  });
  it('M-175 kept: no private-garage unit decides a house\'s setbacks', () => {
    for (const zone of ZONES) for (const t of ['rear_setback_m', 'side_setback_street_m', 'lane_setback_m']) {
      const r = eff(lot(zone, 'detached_house', { flags: { abuts_lane: true, corner_lot: true, ancillary_contains_parking_space: true } }), t);
      expect([zone, t, touched(r).filter((id) => /^10\.10\.60\.20\(1\)|^10\.5\.60\.20\((5|6)\)/.test(id))]).toEqual([zone, t, []]);
    }
  });
});

// D-3 / M-243 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#D-3`, "Approve (amends M-106)"): once
// encroachment_m declares bound max and encroachment_clearance_m min (the M-239 mechanism), one LIMIT lists a projection
// maximum and a clearance minimum, so the pair is no longer UNUSUAL; each projecting element gets its own targets (eaves,
// window projection, platform, canopy, cladding, architectural feature, equipment); the M-106 card units are re-keyed as
// LIMIT lists. 10.5.40.60(7)(B): "the eaves of a roof may encroach into a required minimum building setback a maximum of
// 0.9 metres, if they are no closer to a lot line than 0.3 metres".
describe('D-3 / M-243 — encroachment targets per element; one LIMIT carries a max projection and a min clearance', () => {
  const ELEMENTS = ['eaves', 'window_projection', 'platform', 'canopy', 'cladding', 'architectural_feature', 'equipment'];
  const CARD = ['10.5.40.60(1)#(1)(A)', '10.5.40.60(1)#(1)(B)', '10.5.40.60(1)#(1)(C)', '10.5.40.60(1)#(1)(E)', '10.5.40.60(2)#(2)(B)', '10.5.40.60(4)#(4)(A)',
    '10.5.40.60(5)#(5)(A)', '10.5.40.60(5)#(5)(B)', '10.5.40.60(6)#(6)(B)', '10.5.40.60(7)#(7)(B)', '10.5.40.60(8)#(8)(A)', '10.5.40.60(8)#(8)(B)',
    '10.5.40.60(8)#(8)(C)', '10.5.40.60(8)#(8)(D)', '10.5.40.60(4)@1075-2026#(4)', '10.5.60.60(1)#whole', '150.8.60.60(7)@1075-2026#(7)'];
  it('vocab: each element has an encroachment (max) and a clearance (min) target; encroachment_m / encroachment_clearance_m declare max / min', () => {
    for (const e of ELEMENTS) {
      expect([e, I.vocab.dsl_target[`${e}_encroachment_m`]?.unit, I.vocab.dsl_target[`${e}_encroachment_m`]?.bound]).toEqual([e, 'm', 'max']);
      expect([e, I.vocab.dsl_target[`${e}_clearance_m`]?.unit, I.vocab.dsl_target[`${e}_clearance_m`]?.bound]).toEqual([e, 'm', 'min']);
    }
    expect([I.vocab.dsl_target.encroachment_m.bound, I.vocab.dsl_target.encroachment_clearance_m.bound]).toEqual(['max', 'min']);
  });
  it('10.5.40.60(7)(B) is one LIMIT: eaves_encroachment_m 0.9 m and eaves_clearance_m 0.3 m', () => {
    const u = unitOf('10.5.40.60(7)#(7)(B)');
    expect([u.archetype, u.target, u.numeric_expression]).toEqual(['LIMIT', ['eaves_encroachment_m', 'eaves_clearance_m'], ['eaves_encroachment_m = 0.9 m @(7)(B)', 'eaves_clearance_m = 0.3 m @(7)(B)']]);
  });
  it('a house answers eaves 0.9 m (max) and 0.3 m from a lot line (min), from (7)(B), in every zone', () => {
    for (const zone of ZONES) {
      const l = lot(zone, 'detached_house');
      const e = eff(l, 'eaves_encroachment_m'); const c = eff(l, 'eaves_clearance_m');
      expect([zone, e.value, e.bound, e.winner, c.value, c.bound, c.winner]).toEqual([zone, 0.9, 'max', '10.5.40.60(7)#(7)(B)', 0.3, 'min', '10.5.40.60(7)#(7)(B)']);
    }
  });
  it('window answers no longer mix with the eaves: window projections answer from (6) only; no 10.5.40.60 unit answers encroachment_m', () => {
    const l = lot('RD', 'detached_house');
    const w = eff(l, 'window_projection_encroachment_m');
    expect([w.value, touched(w).every((id) => id.startsWith('10.5.40.60(6)'))]).toEqual([0.6, true]);
    expect(touched(eff(l, 'eaves_encroachment_m')).some((id) => id.startsWith('10.5.40.60(6)'))).toBe(false);
    expect(touched(eff(l, 'encroachment_m')).filter((id) => id.startsWith('10.5.40.60('))).toEqual([]);
  });
  it('every M-106 card unit is a LIMIT whose targets are element targets', () => {
    for (const id of CARD) {
      const u = unitOf(id);
      expect([id, u.archetype, [].concat(u.target).every((t: string) => ELEMENTS.some((e) => t.startsWith(`${e}_`)) || t === 'element_width_pct')]).toEqual([id, 'LIMIT', true]);
    }
  });
  it('an ancillary building answers eaves 0.3 m / 0.15 m from 10.5.60.60(1) (474 Beresford Ave\'s examiner figures)', () => {
    const l = lot('R', 'ancillary_building', { flags: { ancillary_contains_parking_space: true } });
    const e = eff(l, 'eaves_encroachment_m'); const c = eff(l, 'eaves_clearance_m');
    expect([e.value, e.winner, c.value, c.winner]).toEqual([0.3, '10.5.60.60(1)#whole', 0.15, '10.5.60.60(1)#whole']);
  });
  it('the parallel suite chapters key the same elements (150.7 / 150.8.60.60 platforms, canopies, architectural features, equipment)', () => {
    const want: Record<string, string> = {
      '150.7.60.60(4)#whole': 'platform_encroachment_m', '150.8.60.60(4)#whole': 'platform_encroachment_m',
      '150.7.60.60(5)#(5)(B)': 'canopy_encroachment_m', '150.8.60.60(5)#(5)(C)': 'canopy_encroachment_m',
      '150.7.60.60(6)#(6)(B)': 'architectural_feature_encroachment_m', '150.8.60.60(6)#(6)(A)': 'architectural_feature_encroachment_m',
      '150.7.60.60(7)#(7)(A)': 'equipment_encroachment_m', '150.8.60.60(7)#(7)(B)': 'equipment_encroachment_m',
    };
    for (const [id, t] of Object.entries(want)) expect([id, [].concat(unitOf(id).target)[0]]).toEqual([id, t]);
  });
});

// bylaw-fix-2 PIN-1: the golden-lot snapshot (lots@1) gets a committed puller, read-only against the dev DB
// (scripts/analysis/bylaw-validation/pull-golden-lots.cjs; --verify re-pulled all 170 existing lots with 0 differences on
// 2026-10-20), and the eight CoA notice lots are appended after the existing ones with their notice numbers.
describe('golden-lot puller (PIN-1) and the eight CoA notice lots', () => {
  const PL = createRequire(import.meta.url)(path.join(process.cwd(), 'scripts/analysis/bylaw-validation/pull-golden-lots.cjs'));
  const lots = read('src/tests/fixtures/bylaw-golden-lots/lots.json');
  const COA: Array<[string, string]> = [['5447457', 'A0594/26TEY'], ['5343399', 'A0625/26TEY'], ['5326193', 'A0383/26TEY'], ['5255493', 'A0491/26TEY'], ['5473105', 'A0533/26TEY'], ['5464792', 'A0507/26TEY'], ['5443676', 'A0510/26TEY'], ['5305360', 'A0461/26TEY']];
  it('the CLI has exactly one mode and refuses unknown flags; --add needs --out and <id>:<cat>[:<CoA>]', () => {
    expect(PL.parseArgs([]).error).toMatch(/exactly one mode/);
    expect(PL.parseArgs(['--verify', '--out', 'x']).error).toMatch(/unknown flag/);
    expect(PL.parseArgs(['--add', '1:coa_notice']).error).toMatch(/needs --out/);
    expect(PL.parseArgs(['--add', '5343399:coa_notice:A0625/26TEY', '--out', 'l.json']).values.specs).toEqual([{ id: '5343399', cats: ['coa_notice'], coa: 'A0625/26TEY' }]);
  });
  it('rowToLot reproduces the snapshot\'s lot transform (label letters, overlays, the Chapter 900 exception id, flags)', () => {
    const g = PL.rowToLot({ parcel_id: '1', address_number: '20', linear_name_full: 'Norwood Rd', zoning_class: 'R', zoning_zn_string: 'R (d1.0) (x7)', exception_number: 7,
      zoning_overlays: { height_overlay: { applied: true, height_max_m: 11 } }, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: true,
      frontage_m: 7.63, depth_m: 34.09, lot_size_sqm: 260.07, npts: 5 }, ['coa_notice'], 'A0625/26TEY');
    expect([g.coa, g.lot.label, g.lot.overlays, g.lot.exception, g.lot.flags.abuts_lane, 'no_rear_lot_line' in g.lot.flags]).toEqual(['A0625/26TEY', { d: 1 }, { HT: 11 }, '900.2.10(7)', true, false]);
  });
  it('the snapshot holds the 170 lots it had and the eight CoA lots after them, each with its notice number', () => {
    expect([lots.schema, lots.n, lots.lots.length]).toEqual(['bylaw-golden-lots/lots@1', 178, 178]);
    expect(lots.lots.slice(170).map((l: Json) => [l.id, l.coa])).toEqual(COA);
  });
});
