// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.4, §7.5 (conditions, alternatives, applicability);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-75 (corrections), M-149, M-172(3), M-176(1), M-179
//
// Operator envelope review 2026-10-16 (findings 2, 7): fixes the existing rulings already decide, applied as M-75
// corrections to the agreed units and as vocab data. Each assertion reads the production path (validate.mjs inputs →
// agree.mjs resolved units; evaluate.mjs applies() over evaluatorVocab()).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const tokens = (c: unknown): string[] => (c && typeof c === 'object' ? ((c as Json).tokens ?? []) : []);
const C = E.makeContext(VO.evaluatorVocab(I.vocab));

describe('M-176(1) — townhouse unit width answers 5.0 m (no individual private driveway)', () => {
  it('the design-choice default takes "no driveway" as met and discloses the 6.0 m arm', () => {
    const o = I.vocab.design_choice_disclosure.default_overrides;
    expect(o.no_individual_private_driveway.taken_as).toBe(true);
    expect(o.individual_private_driveway.taken_as).toBe(false);
    expect(o.individual_private_driveway.disclosure).toBe('If each dwelling unit has an individual private driveway leading to its front: the minimum unit width is 6.0 m.');
  });
  it('10.80.40.1(3)(A) gaps cite M-176(1), not the superseded M-173 default', () => {
    const g = unitOf('10.80.40.1(3)#(3)(A)').calculation_handling.gaps;
    expect(g).toMatch(/M-176\(1\)/);
    expect(g).not.toMatch(/driveway is assumed present/);
  });
});

describe('M-179(1) — all-ancillary coverage is its own target', () => {
  it('vocab declares ancillary_coverage_pct (pct, envelope) and the vocab stays valid', () => {
    expect(I.vocab.dsl_target.ancillary_coverage_pct).toMatchObject({ unit: 'pct', aspect: 'envelope' });
    expect(VO.checkVocab(I.vocab).violations).toEqual([]);
  });
  it('150.8.60.70(1)(B) (30 % of all ancillary buildings) is keyed on ancillary_coverage_pct', () => {
    const u = unitOf('150.8.60.70(1)#(1)(B)');
    expect(u.target).toBe('ancillary_coverage_pct');
    expect(u.numeric_expression).toEqual(['ancillary_coverage_pct = 30 pct @(1)(B)']);
  });
});

describe('M-172(3) / M-75 — garden-suite side-yard arms carry their tested conditions', () => {
  const lot = (corner: boolean, garage: boolean): Json => ({ zone: 'R', label: {}, overlays: {}, vars: { lot_frontage_m: 12, lot_depth_m: 36 }, flags: { corner_lot: corner, garage_entrance_faces_street: garage }, building_type: 'garden_suite' });
  it('150.7.60.20(6)(B) tests corner_lot and garage_entrance_faces_street', () => {
    expect(tokens(unitOf('150.7.60.20(6)#(6)(B)').condition)).toEqual(['corner_lot', 'garage_entrance_faces_street']);
  });
  it('150.7.60.20(6)(C) is the corner-lot arm (M-179(2)): an interior lot takes 150.7.60.20(5)', () => {
    const u = unitOf('150.7.60.20(6)#(6)(C)');
    expect(tokens(u.condition)).toEqual(['corner_lot']);
    expect(E.applies(lot(false, false), u, C).ok).toBe(false);
  });
});

describe('M-149 / M-172(3) — untestable restrictive suite scopes are not modelled and disclosed', () => {
  for (const id of ['150.7.60.20(2)#(2)(C)', '150.7.60.20(5)#(5)(A)']) {
    it(`${id} is not_modelled with a disclosure`, () => {
      const u = unitOf(id);
      expect(u.calculation_handling.status).toBe('not_modelled');
      expect(u.calculation_handling.gaps).toMatch(/M-149/);
      expect(typeof u.disclosure === 'string' && u.disclosure !== 'none' && u.disclosure.startsWith('If ')).toBe(true);
    });
  }
});
