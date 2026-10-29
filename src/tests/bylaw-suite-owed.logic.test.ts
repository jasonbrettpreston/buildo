// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-158, M-176, M-177 (1)(2)(4), M-197, M-198 (1)(3), M-199,
//            M-214(3) (cited; the suite keying lane's owed part, dated notes under M-177 and M-198);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (suite_lot_fact_unknown, suite_separation_arm,
//            forms_deferred, secondary_suite_share_reading); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-53
//
// The 38 UNFIXED suite answers of the envelope-answer tracker (150.7 garden, 150.8 laneway, 150.10 secondary suites),
// each closed under its cited ruling. M-177(1)/(2): the suite scenario is computed for every lot from class data, never
// "when you tell us one is planned", so each laneway unit takes the form its garden twin already has (parallel chapters
// 150.7 / 150.8). M-197 / M-198: the blank wall leads; a lot fact we do not hold takes the larger setback and the arm it
// sets aside is disclosed. M-199: 45 % of the WHOLE house. Each `it` is a named lock (LC-53) read by
// generate-answer-tracker.mjs; the geometry each ruling also needs (proxies, placement, the < main GFA test, the suite
// share) is computed by the Spec 78 Phase-5 step and stays owed to step commit ① (P5.5 / P5.10 / P5.13).
// Production path as bylaw-evaluator-fixes: validate.mjs inputs → agree.mjs units with the M-75 corrections →
// withGeneratedFields + xref displacesOf → evaluate.mjs loadCandidates / effective.
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
// a lot as Layer 3 hands it over (M-169: site facts not holding; design choices explicit), as bylaw-evaluator-fixes
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, main_building_gfa_m2: 500, ...(extra.vars ?? {}) }, // main_building_gfa_m2: the third source of the value order (the maximum build) always holds a figure in the product (CHAT-198.NN-Q3)
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const TELL_US = /when you tell us/;

describe('G-AGREE holds with every correction of the suite keying lane', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('M-177(1)/(4) — the 150.10 secondary-suite scope units: the suite class, one suite per dwelling unit', () => {
  it('M-177: 150.10.1(1) is the Section 150.10 scope sentence for the secondary_suite class, with no measure', () => {
    const u = unitOf('150.10.1(1)#whole');
    expect([u.archetype, u.target, u.application.building_types]).toEqual(['PROCEDURAL', 'none', ['secondary_suite']]);
  });
  it('M-177: 150.10.20.1(1)(A) permits a suite in a detached house, and the house-with-suite class releases FSI in every zone', () => {
    expect([unitOf('150.10.20.1(1)#(1)(A)').archetype, unitOf('150.10.20.1(1)#(1)(A)').application.building_types]).toEqual(['PERMIT', ['detached_house']]);
    for (const zone of ZONES) {
      const z = { R: '10', RD: '20', RS: '40', RT: '60', RM: '80' }[zone];
      expect(eff(lot(zone, 'detached_house', { flags: { has_secondary_suite: true } }), 'fsi').trace).toContain(`rule 2: 10.${z}.40.40(1)#(1)(C) drops 10.${z}.40.40(1)#(1)(A)`);
    }
  });
  it('M-177 / M-214(3): 150.10.20.1(1)(B) a suite in a semi-detached house is permitted and disclosed as not modelled (forms_deferred)', () => {
    expect(unitOf('150.10.20.1(1)#(1)(B)').disclosure).toBe('A secondary suite is permitted in a semi-detached house; a secondary suite in a semi-detached house is not modelled in this release.');
  });
  it('M-177(4): 150.10.20.1(2) one suite per dwelling unit is the class vector (has_secondary_suite = 1), never an unenforced count', () => {
    expect(unitOf('150.10.20.1(2)#whole').disclosure).toBe('Each dwelling unit may have at most one secondary suite; the house-with-suite answer has exactly one.');
  });
});

describe('M-199 — 150.10.40.40: a secondary suite may be 45 % of the WHOLE house it sits in; the stricter reading is disclosed', () => {
  it('M-199: 150.10.40.40(1) states the whole-house reading and keeps 45 percent as a clause literal (keying owed)', () => {
    const u = unitOf('150.10.40.40(1)#whole');
    expect(u.disclosure).toBe('A secondary suite may take up to 45% of the interior floor area of the house it is in, the suite included; if the City reads 45% against the main unit only, the suite is smaller.');
    expect(u.literals_not_expressed).toContainEqual({ clause: '(1)', literal: '45 percent', reason: 'limit_not_modelled' });
    expect(u.calculation_handling.gaps).toContain('whole house interior floor area (suite included)');
  });
  it('M-199 / M-177: 150.10.40.40(2) the basement suite of a one-storey detached house may take the whole basement', () => {
    const u = unitOf('150.10.40.40(2)#whole');
    expect([u.archetype, u.disclosure]).toEqual(['PERMIT', 'In a one-storey detached house, a basement secondary suite may take the whole basement.']);
  });
});

describe('M-177(1)/(2) — the garden-suite caps answer on every lot from class data (no user input)', () => {
  it('M-177: 150.7.20.1(2) and 150.8.20.1(2) allow one suite building on a lot', () => {
    for (const id of ['150.7.20.1(2)#whole', '150.8.20.1(2)#whole']) expect([id, unitOf(id).numeric_expression]).toEqual([id, ['buildings_on_lot = 1 units @(2)']]);
    for (const zone of ZONES) for (const bt of ['garden_suite', 'laneway_suite']) expect([zone, bt, eff(lot(zone, bt), 'buildings_on_lot').value]).toEqual([zone, bt, 1]);
  });
  it('M-177: 150.7.60.40(2) a garden suite has at most 2 storeys', () => {
    expect(unitOf('150.7.60.40(2)#whole').numeric_expression).toEqual(['height_storeys = 2 storeys @(2)']);
    for (const zone of ZONES) expect([eff(lot(zone, 'garden_suite'), 'height_storeys').value, eff(lot(zone, 'garden_suite'), 'height_storeys').winner]).toEqual([2, '150.7.60.40(2)#whole']);
  });
  it('M-177: 150.7.60.50(4)(A) 120 m2 and (4)(B) 60 m2 for one storey are the garden-suite GFA caps', () => {
    expect(unitOf('150.7.60.50(4)#(4)(A)').numeric_expression).toEqual(['gfa_m2 = 120 m2 @(4)(A)']);
    expect(unitOf('150.7.60.50(4)#(4)(B)').numeric_expression).toEqual(['gfa_m2 = 60 m2 @(4)(B)']);
    for (const zone of ZONES) expect([eff(lot(zone, 'garden_suite', { flags: { suite_one_storey: false } }), 'gfa_m2').value, eff(lot(zone, 'garden_suite', { flags: { suite_one_storey: false } }), 'gfa_m2').winner]).toEqual([120, '150.7.60.50(4)#(4)(A)']); // M-284: two storeys by default
  });
  it('M-177: 150.7.60.50(1) the garden-suite GFA is left out of the lot FSI (a DEFINE on gfa_m2, applied in the suite scenario)', () => {
    const u = unitOf('150.7.60.50(1)#whole');
    // the suite class only (M-159; a plain ancillary building is not "an ancillary building containing a garden suite", 2026-10-20)
    expect([u.archetype, u.target, u.application.building_types]).toEqual(['DEFINE', 'gfa_m2', ['garden_suite']]);
  });
  it('M-177(2): 150.7.60.50(2) the garden suite is kept smaller than the house, disclosed, never an unchecked comparison', () => {
    // CHAT-198.NN-Q3 (2026-10-29-batch-aa): the comparison is now evaluated through main_building_gfa_m2; the disclosure names where the main building's floor area comes from
    expect(unitOf('150.7.60.50(2)#whole').disclosure).toBe("A garden suite must be smaller (in gross floor area) than the main building on the lot; the main building's floor area is taken from the plan facts, else the footprint and storeys given, else the maximum build.");
    expect([unitOf('150.7.60.50(2)#whole').archetype, unitOf('150.7.60.50(2)#whole').numeric_expression]).toEqual(['LIMIT', ['gfa_m2 = main_building_gfa_m2 @(2)']]);
  });
  it('M-177(2) / M-198: 150.7.60.40(1) the garden suite is 4.0 m below 7.5 m from the house and 6.3 m at 7.5 m or more', () => {
    for (const zone of ZONES) {
      const near = eff(lot(zone, 'garden_suite'), 'height_m');
      const far = eff(lot(zone, 'garden_suite', { vars: { proposed_height_m: 6.3, distance_to_residential_m: 7.5 } }), 'height_m');
      expect([near.value, near.winner, far.value, far.winner]).toEqual([4, '150.7.60.40(1)#(1)(A)', 6.3, '150.7.60.40(1)#(1)(B)']);
    }
    expect(unitOf('150.7.60.40(1)#(1)(B)').condition).toEqual({ tokens: ['separation_band'], if: 'distance_to_residential_m ≥ 7.5 m' });
  });
});

describe('M-198 / M-197 — garden-suite setbacks: the blank wall and the smaller lawful setback lead; a lot fact we do not hold is disclosed', () => {
  it('M-198: 150.7.60.20(2)(A) on a lot deeper than 45.0 m the rear setback is the greater of 1.5 m and half the suite height', () => {
    const r = eff(lot('RD', 'garden_suite', { vars: { lot_depth_m: 50, proposed_height_m: 6.3, distance_to_residential_m: 7.5 } }), 'rear_setback_m');
    expect([r.value, r.winner]).toEqual([3.15, '150.7.60.20(2)#(2)(A)']);
  });
  it('M-198: 150.7.60.20(2)(B) the garden-suite rear setback is 1.5 m in all other cases', () => {
    for (const zone of ZONES) expect([eff(lot(zone, 'garden_suite'), 'rear_setback_m').value, eff(lot(zone, 'garden_suite'), 'rear_setback_m').winner]).toEqual([1.5, '150.7.60.20(2)#(2)(B)']);
  });
  it('M-198(1): 150.7.60.20(3)(A) on a through lot takes the larger of the neighbour-front-yard proxy (the lot\'s own Layer 2 front_setback_m, supplied by the step) and 1.5 m', () => {
    const u = unitOf('150.7.60.20(3)#(3)(A)');
    expect([u.condition, u.numeric_expression]).toEqual([{ tokens: ['through_lot'] }, ['rear_setback_m = abutting_front_setback_m @(3)(A)']]);
    // E2E-F-02 (coordinator correction 2026-10-20): the step supplies abutting_front_setback_m = the principal house's
    // front_setback_m; the restrictive garage choice is not taken (M-172(3))
    const flags = { through_lot: true, garage_entrance_faces_street: false };
    const house = eff(lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: true, abuts_named_street: false } }), 'front_setback_m');
    expect(house.status).toBe('value');
    const r = eff(lot('RD', 'garden_suite', { flags, vars: { abutting_front_setback_m: house.value } }), 'rear_setback_m');
    expect([r.value, r.winner]).toEqual([Math.max(house.value, 1.5), '150.7.60.20(3)#(3)(A)']);
    // without the step's proxy the input is missing, never guessed
    expect(eff(lot('RD', 'garden_suite', { flags }), 'rear_setback_m').reason).toBe('missing_input:abutting_front_setback_m');
  });
  it('M-198: 150.7.60.20(3)(B) the through-lot fallback is 1.5 m', () => {
    expect(unitOf('150.7.60.20(3)#(3)(B)').numeric_expression).toEqual(['rear_setback_m = 1.5 m @(3)(B)']);
  });
  it('M-198: 150.7.60.20(5)(A) the with-openings side arm is disclosed with its lot fact and never read', () => {
    const u = unitOf('150.7.60.20(5)#(5)(A)');
    expect([u.condition, u.disclosure]).toEqual([{ tokens: ['suite_wall_openings'] }, expect.stringMatching(/side lot line that does not abut a street/)]);
    const facts = lot('RD', 'garden_suite', { flags: { side_yard_abuts_street: true } });
    expect(eff(facts, 'side_setback_m').value).toBe(eff(lot('RD', 'garden_suite'), 'side_setback_m').value);
  });
  it('M-198: 150.7.60.20(5)(B) the side setback is the greater of 0.6 m or 10 % of the frontage, at most 3.0 m', () => {
    for (const [f, v] of [[12, 1.2], [4, 0.6], [40, 3]] as [number, number][]) {
      const r = eff(lot('RS', 'garden_suite', { vars: { lot_frontage_m: f } }), 'side_setback_m');
      expect([f, r.value, r.winner]).toEqual([f, v, '150.7.60.20(5)#(5)(B)']);
    }
  });
  it('M-198(2): 150.7.60.20(6)(A) a corner lot keys the 1.5 m floor; the averaging needs the neighbour and is disclosed', () => {
    const u = unitOf('150.7.60.20(6)#(6)(A)');
    expect([u.condition, u.numeric_expression]).toEqual([{ tokens: ['corner_lot', 'adjacent_lot_fronts_flanking_street'] }, ['side_setback_street_m = 1.5 m @(6)(A)']]);
    expect(u.disclosure).toMatch(/average of the neighbour's front setback and your house's side setback \(at least 1\.5 m\)/);
  });
  it('M-158 / M-198: 150.7.60.21(1)(A) and (B) a new build answers the 150.7.60.20 minimum; the lawfully existing setback is the caveat', () => {
    for (const [id, t, v] of [['150.7.60.21(1)#(1)(A)', 'rear_setback_m', 1.5], ['150.7.60.21(1)#(1)(B)', 'side_setback_m', 1.2]] as [string, string, number][]) {
      expect([id, unitOf(id).condition]).toEqual([id, { tokens: ['lawfully_existing'] }]);
      expect(unitOf(id).disclosure).toMatch(/we cannot check this without the as-built setbacks/);
      const r = eff(lot('RD', 'garden_suite'), t);
      expect([id, r.value, r.winner === id]).toEqual([id, v, false]);
    }
  });
});

describe('M-177 / M-198 / M-197 — laneway-suite setbacks, height, separation and caps answer on every lot, in the garden-suite form', () => {
  it('M-177(1): no laneway unit says it applies only when the user tells us a suite is planned', () => {
    for (const id of ['150.8.60.20(2)#(2)(A)', '150.8.60.20(2)#(2)(B)', '150.8.60.20(3)#(3)(A)', '150.8.60.20(3)#(3)(B)', '150.8.60.20(3)#(3)(D)', '150.8.60.40(1)#(1)(A)', '150.8.60.40(1)#(1)(B)', '150.8.60.40(2)#whole', '150.8.60.70(1)#(1)(A)', '150.8.60.70(1)#(1)(B)']) {
      expect([id, TELL_US.test(String(unitOf(id).disclosure))]).toEqual([id, false]);
    }
  });
  it('M-198: 150.8.60.20(1) the setbacks reach every part of the building above and below ground, footings excepted', () => {
    const u = unitOf('150.8.60.20(1)#whole');
    expect([u.archetype, u.calculation_handling.description]).toEqual(['DEFINE', expect.stringMatching(/all above-ground and below-ground parts of a laneway-suite building, excluding footings/)]);
  });
  it('M-197 / M-198(3): 150.8.60.20(2)(A) the 0.0 m rear arm is set aside because the lane line is not held; 1.0 m answers', () => {
    expect(unitOf('150.8.60.20(2)#(2)(A)').disclosure).toBe('Whether the rear lot line abuts a street or lane is not known for this lot; the larger setback (1.0 m) is used.');
    expect(unitOf('150.8.60.20(2)#(2)(A)').calculation_handling.not_modelled_reason).toBe('needs_data_we_lack');
    for (const zone of ZONES) expect([eff(lot(zone, 'laneway_suite'), 'rear_setback_m').value, eff(lot(zone, 'laneway_suite'), 'rear_setback_m').winner]).toEqual([1, '150.8.60.20(2)#(2)(B)']);
  });
  it('M-197 / M-198: 150.8.60.20(3)(A) the 0.0 m side arm is set aside because the side line is not classified; 1.0 m answers', () => {
    expect(unitOf('150.8.60.20(3)#(3)(A)').disclosure).toBe('Whether the side lot line abuts a street or lane is not known for this lot; the larger setback (1.0 m) is used.');
    expect(unitOf('150.8.60.20(3)#(3)(A)').calculation_handling.not_modelled_reason).toBe('needs_data_we_lack');
  });
  it('M-198: 150.8.60.20(3)(B) the side abutting a street takes the house side yard, computed with the house', () => {
    expect(unitOf('150.8.60.20(3)#(3)(B)').disclosure).toBe('On a corner lot, the laneway suite is set back from the side lot line that abuts the street by the side yard setback required for the house.');
    expect(unitOf('150.8.60.20(3)#(3)(B)').calculation_handling.not_modelled_reason).toBe('needs_data_we_lack');
  });
  it('M-198: 150.8.60.20(3)(D) the laneway-suite side setback is 1.0 m in all other cases, modelled', () => {
    expect([unitOf('150.8.60.20(3)#(3)(D)').calculation_handling.status, unitOf('150.8.60.20(3)#(3)(D)').disclosure]).toEqual(['modelled', 'none']);
    for (const zone of ZONES) expect([eff(lot(zone, 'laneway_suite'), 'side_setback_m').value, eff(lot(zone, 'laneway_suite'), 'side_setback_m').winner]).toEqual([1, '150.8.60.20(3)#(3)(D)']);
  });
  it('M-177(2) / M-198: 150.8.60.30(1)(A) and (B) the separation is 4.0 m, or 7.5 m for a suite over 4.0 m, with the trade-off disclosed', () => {
    expect(unitOf('150.8.60.30(1)#(1)(A)').disclosure).toContain('A laneway suite no taller than 4.0 m must be at least 4.0 m from the house; a 6.3 m suite needs 7.5 m, taken where the lot depth fits.'); // M-286 appends the existing-house sentence
    expect(unitOf('150.8.60.30(1)#(1)(B)').disclosure).toContain('A laneway suite taller than 4.0 m must be at least 7.5 m from the house; at 4.0 m from the house the suite is limited to 4.0 m.');
    expect(eff(lot('RD', 'laneway_suite'), 'separation_m').value).toBe(4);
    expect(eff(lot('RD', 'laneway_suite', { vars: { proposed_height_m: 6.3, distance_to_residential_m: 7.5 } }), 'separation_m').value).toBe(7.5);
  });
  it('M-177: 150.8.60.30(5) and (6) the laneway suite is at most 10.0 m long and 8.0 m wide', () => {
    for (const zone of ZONES) {
      expect([eff(lot(zone, 'laneway_suite'), 'building_length_m').winner, eff(lot(zone, 'laneway_suite'), 'building_length_m').value]).toEqual(['150.8.60.30(5)#whole', 10]);
      expect([eff(lot(zone, 'laneway_suite'), 'building_width_m').winner, eff(lot(zone, 'laneway_suite'), 'building_width_m').value]).toEqual(['150.8.60.30(6)#whole', 8]);
    }
  });
  it('M-177(2) / M-198: 150.8.60.40(1)(B) the laneway suite is 6.3 m at 7.5 m or more from the house, modelled', () => {
    expect([unitOf('150.8.60.40(1)#(1)(B)').calculation_handling.status, unitOf('150.8.60.40(1)#(1)(B)').disclosure]).toEqual(['modelled', I.vocab.suite_scenario.laneway_suite_with_existing_house]); // M-286
    const r = eff(lot('RD', 'laneway_suite', { vars: { proposed_height_m: 6.3, distance_to_residential_m: 7.5 } }), 'height_m');
    expect([r.value, r.winner]).toEqual([6.3, '150.8.60.40(1)#(1)(B)']);
  });
  it('M-177: 150.8.60.50(1) the laneway-suite GFA is left out of the lot FSI (a DEFINE on gfa_m2)', () => {
    expect([unitOf('150.8.60.50(1)#whole').archetype, unitOf('150.8.60.50(1)#whole').target]).toEqual(['DEFINE', 'gfa_m2']);
  });
  it('M-177(2): 150.8.60.50(2) the laneway suite is kept smaller than the house, disclosed', () => {
    expect(unitOf('150.8.60.50(2)#whole').disclosure).toBe("A laneway suite must be smaller (in gross floor area) than the main building on the lot; the main building's floor area is taken from the plan facts, else the footprint and storeys given, else the maximum build."); // CHAT-198.NN-Q3
    expect(unitOf('150.8.60.50(2)#whole').numeric_expression).toEqual(['gfa_m2 = main_building_gfa_m2 @(2)']);
  });
  it('M-177: 150.8.60.50(3) the general ancillary floor-area cap 10.5.60.50(2) does not apply to a laneway suite', () => {
    expect([unitOf('150.8.60.50(3)#whole').archetype, unitOf('150.8.60.50(3)#whole').calculation_handling.description]).toEqual(['DISAPPLY', expect.stringMatching(/10\.5\.60\.50\(2\)/)]);
  });
  it('M-177(1): 150.8.60.70(1)(A) the laneway suite is outside the lot coverage, applied in the suite scenario', () => {
    const u = unitOf('150.8.60.70(1)#(1)(A)');
    expect([u.archetype, u.target, u.calculation_handling.status]).toEqual(['DEFINE', 'lot_coverage_pct', 'partially_modelled']);
    expect(u.disclosure).toBe('A laneway suite does not count toward the lot coverage limit for the house; all ancillary buildings together, the suite included, may cover at most 30% of the lot.');
  });
});
