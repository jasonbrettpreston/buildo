// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-158, M-169, M-171, M-192, M-205(2), M-211(5);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (blank_side_wall, vacant_existing_lot,
//            lawfully_existing_relief), main_side_setbacks_m (R 0.45 m by default)
//
// Review answers batch 3 (live page DB dump envdb9, 2026-10-19): the new "wrong" answers whose keyed unit lacked the
// ruled form, fixed once per provision family. Production path as bylaw-evaluator-fixes.
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
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
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

const T = {
 "BLANK": "Side walls are taken without windows or doors, so the side yard is 0.45 m; with windows or doors in that side the zone side yard applies.",
 "LEN": "Parts of the building allowed to project into a setback, such as eaves, steps or a porch, are not counted in its length.",
 "VAC_A": "If this is a vacant lot that existed before the current rules, a house or detached houseplex may be built on it only if the lot frontage is at least 6.0 m.",
 "VAC_B": "If this is a vacant lot that existed before the current rules, the house or detached houseplex must also meet the rest of the by-law or have a minor variance.",
 "R4A": "For a side or rear addition to a lawfully existing building on a lot under 9.0 m wide, the side yard may stay at the existing building's; this is a renovation rule and is not calculated.",
 "R4B": "For a side or rear addition to a lawfully existing building on a lot 9.0 m to 12.2 m wide, the side yard is the larger of half the normal side yard or the existing one; this is a renovation rule and is not calculated."
};

describe('M-205(2) — the R 0.45 m side yard is taken without windows or doors, and says so (10.10.40.70(4)(A)–(E))', () => {
  for (const id of ['10.10.40.70(4)#(4)(A)', '10.10.40.70(4)#(4)(B)', '10.10.40.70(4)#(4)(C)', '10.10.40.70(4)#(4)(D)', '10.10.40.70(4)#(4)(E)']) {
    it(`${id} carries the closed blank_side_wall sentence and names the Layer 3 default`, () => {
      const u = unitOf(id);
      expect(u.disclosure).toBe(T.BLANK);
      expect(u.calculation_handling.gaps).toMatch(/M-205\(2\)/);
    });
  }
});

describe('M-171 — 10.5.40.20(2) excludes encroaching parts from building length; it does not define length', () => {
  it('10.5.40.20(2) is a disclosed measure exclusion', () => {
    const u = unitOf('10.5.40.20(2)#whole');
    expect(u.disclosure).toBe(T.LEN);
    expect(u.calculation_handling.gaps).toMatch(/M-171/);
    expect(u.calculation_handling.description).toMatch(/^Excludes/);
  });
});

describe('M-158 / M-169 — the vacant lawfully existing lot (10.5.30.21(3)) is a site fact taken as not holding, disclosed', () => {
  for (const [id, s] of [['10.5.30.21(3)#(3)(A)', T.VAC_A], ['10.5.30.21(3)#(3)(B)', T.VAC_B]] as [string, string][]) {
    it(`${id}: never binds the default lot; carries vacant_existing_lot`, () => {
      expect(E.applies(lot('RD', 'detached_house'), units.find((x) => x.unit_id === id), C).ok).toBe(false);
      expect(unitOf(id).disclosure).toBe(s);
    });
  }
  it('a plain RD lot\'s frontage is never 6.0 m from 10.5.30.21(3)(A)', () => {
    expect(eff(lot('RD', 'detached_house'), 'required_lot_frontage_m').winner).not.toBe('10.5.30.21(3)#(3)(A)');
  });
});

describe('M-211(5) / M-192 — 10.5.40.71(4) side yards for additions are a renovation rule, disclosed', () => {
  for (const [id, s] of [['10.5.40.71(4)#(4)(A)', T.R4A], ['10.5.40.71(4)#(4)(B)', T.R4B]] as [string, string][]) {
    it(`${id} carries the renovation disclosure`, () => {
      expect(unitOf(id).disclosure).toBe(s);
      expect(unitOf(id).calculation_handling.gaps).toMatch(/M-211\(5\)/);
    });
  }
});
