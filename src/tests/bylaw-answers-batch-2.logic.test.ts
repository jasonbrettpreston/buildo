// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-171 (+ dated note 2026-10-18), M-185, M-203, M-205(1)/(3);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.4 (basement in_gfa false), P5.12 (basement_excluded,
//            gfa_deductions_not_applied, attic_outside_gfa, front_yard_averaging), P5.15(B) (named locks)
//
// Review answers batch 2 (live page DB dump 2026-10-19, 56 new answers): every new "wrong" / "disclose" answer whose
// keyed unit lacked the ruled form, fixed once per provision family. Production path as bylaw-evaluator-fixes.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => ({ ...u, displaces: XR.displacesOf(index, u.unit_id, I.vocab, null).targets.map((t: Json) => t.id) }));
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

describe('M-171 — GFA may exclude the basement, voids and parking: each 10.5.40.40(3) deduction carries its closed sentence', () => {
  const S = I.vocab.measure_deduction_disclosure.sentences;
  for (const id of ['10.5.40.40(3)#(3)(A)', '10.5.40.40(3)#(3)(B)', '10.5.40.40(3)#(3)(C)', '10.5.40.40(3)#(3)(D)']) {
    it(`${id} carries the vocab sentence verbatim`, () => {
      expect(unitOf(id).disclosure).toBe(S[id]);
    });
  }
  it('10.5.40.40(3)(A): the basement is excluded from GFA (M-171 dated note 2026-10-18; Spec 78 P5.4 basement in_gfa false)', () => {
    const u = unitOf('10.5.40.40(3)#(3)(A)');
    expect(u.disclosure).toBe('Your counted floor area may exclude the basement floor area.');
    expect(u.calculation_handling.gaps).toMatch(/M-171/);
    expect(u.calculation_handling.gaps).toMatch(/in_gfa: false/);
  });
});

describe('M-203 — the attic test (10.5.40.40(1)(A)/(B)) is disclosed with the attic_outside_gfa sentence', () => {
  for (const id of ['10.5.40.40(1)#(1)(A)', '10.5.40.40(1)#(1)(B)']) {
    it(`${id} carries the closed attic sentence`, () => {
      expect(unitOf(id).disclosure).toBe('An attic that does not meet the headroom and size test is livable but not counted in the City\'s floor-area total (GFA).');
    });
  }
});

describe('M-205(1) — front-yard averaging (10.5.40.70(1)(A)/(B)) carries the front_yard_averaging sentence', () => {
  for (const id of ['10.5.40.70(1)#(1)(A)', '10.5.40.70(1)#(1)(B)']) {
    it(`${id} discloses that the averaged setback uses estimated neighbour setbacks`, () => {
      expect(unitOf(id).disclosure).toBe('The front setback averages the neighbouring houses\' setbacks, which are estimated; a survey may differ.');
    });
  }
});

describe('M-205(3) — RD rear setback is the greater of 7.5 m and 25 % of lot depth (10.20.40.70(2)); R stays a flat 7.5 m', () => {
  it('RD: depth 40 m → 10.0 m from (2)(B); depth 20 m → 7.5 m from (2)(A)', () => {
    const deep = eff(lot('RD', 'detached_house', { vars: { lot_depth_m: 40 } }), 'rear_setback_m');
    expect([deep.value, deep.winner]).toEqual([10, '10.20.40.70(2)#(2)(B)']);
    const shallow = eff(lot('RD', 'detached_house', { vars: { lot_depth_m: 20 } }), 'rear_setback_m');
    expect([shallow.value, shallow.winner]).toEqual([7.5, '10.20.40.70(2)#(2)(A)']);
    expect(eff(lot('R', 'detached_house', { vars: { lot_depth_m: 40 } }), 'rear_setback_m').value).toBe(7.5);
  });
});

describe('M-183 — R names the semi-detached houseplex in its FSI exemption (10.10.40.40(1)(C)); RD names none', () => {
  it('R: a semi-detached houseplex is FSI-exempt (not_applicable by 10.10.40.40(1)(C)); RD: it is not named, so a d of 0.6 applies', () => {
    const r = eff(lot('R', 'semi_detached_houseplex'), 'fsi');
    expect([r.status, r.reason]).toEqual(['not_applicable', 'not_applicable:10.10.40.40(1)#(1)(C)']);
    expect(eff(lot('RD', 'semi_detached_houseplex'), 'fsi').value).toBe(0.6);
  });
});
