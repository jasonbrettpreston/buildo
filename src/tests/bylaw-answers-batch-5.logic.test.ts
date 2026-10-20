// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-31, M-158, M-169(2) and (4), M-175, M-192, M-196, M-208, M-211,
//            M-212, M-213, M-214 (cited); M-228, M-229 (RULED 2026-10-20, operator "1 & 2 y"; drafted here);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (rooftop_elements_exempt, shoreline_hazard,
//            setback_encroachments, decks_platforms_not_modelled, lawfully_existing_relief, vacant_existing_lot,
//            heritage_designated, suite_soft_landscaping, forms_deferred)
//
// Review answers batch 5 (live page DB dump envdb11, 2026-10-20): the new "wrong" / "disclose" / null answers whose keyed
// unit lacked the ruled form, fixed once per provision family (rooftop allowances 10.5.40.10(2)-(5) as the principal-building
// twin of 150.x.60.40(3)-(6); the 10.5.40.60 encroachments; the 5.10.40.70 / .80 shoreline setbacks; the lawfully
// existing lot family 10.5.30.11 / .21 / .41). Production path as batches 3 and 4.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const spec78 = fs.readFileSync(path.join(process.cwd(), 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');
const code = (c: string): string => (spec78.split('\n').find((l) => l.startsWith(`| \`${c}\` |`)) ?? '');

const T = {
  "SUITE_CONV": "A secondary suite is not allowed in a semi-detached house or townhouse converted to hold up to four dwelling units; a secondary suite in a semi or townhouse is not modelled in this release.",
  "AREA_ADD": "An addition to a lawfully existing building on a lot smaller than today's minimum must meet every other rule of the by-law or have a minor variance; the maximum build meets them.",
  "VACANT_AREA": "If this is a vacant lot that lawfully existed with less than today's minimum lot area, a detached house or detached houseplex may be built on it if it meets the rest of the by-law or has a minor variance.",
  "FRONTAGE_EX": "If this lot lawfully existed with less frontage than today's minimum, that lawful frontage is its minimum lot frontage instead.",
  "FRONTAGE_ADD": "An addition to a lawfully existing building on a lot with less than today's minimum frontage must meet every other rule of the by-law or have a minor variance; the maximum build meets them.",
  "COVER_ADD": "An addition to a lawfully existing building that covers more of the lot than allowed must meet every other rule of the by-law or have a minor variance; the maximum build meets them.",
  "ROOF_ANT": "Antennae on the roof may rise up to 1.5 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_FLAG": "Flagpoles on the roof may rise up to 1.5 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_PARAPET": "Parapets for a green roof may rise up to 1.5 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_DISH": "Satellite dishes on the roof may rise up to 1.5 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_VANE": "Weather vanes on the roof may rise up to 1.5 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_EQUIP": "Rooftop equipment such as mechanical and ventilation units may rise up to 5.0 m above the height limit (skylights 1.0 m) and cover at most 30% of the roof; rooftop elements are design details and are not modelled.",
  "ROOF_STRUCT": "Rooftop stairwells, roof access, elevator shafts, chimneys and vents may rise up to 5.0 m above the height limit and cover at most 30% of the roof; rooftop elements are design details and are not modelled.",
  "ROOF_SCREEN": "On a building taller than 15.0 m, screens or enclosures around rooftop equipment may rise up to 5.0 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_AMENITY": "On a building taller than 15.0 m, open railings or wind screens for a rooftop amenity space may rise up to 3.0 m above the height limit; rooftop elements are design details and are not modelled.",
  "ROOF_AMENITY_SET": "Open railings or wind screens for a rooftop amenity space must stay at least 2.0 m inside the main walls; rooftop elements are design details and are not modelled.",
  "PLAT_WALLS": "The sides of a deck, porch or balcony that are at least 50% open above its floor are not main walls; decks and platforms are not modelled.",
  "PLAT_SETBACK": "A deck, porch or balcony without main walls must meet the required setbacks; decks and platforms are not modelled.",
  "STAIRS": "Exterior stairs may project into a setback if they run no more than 1.5 m for each 1.0 m of rise, are no wider than 2.0 m and stay at least 0.6 m from the lot line; this is a design detail and is not modelled.",
  "RAMP": "An uncovered ramp may project into a setback if it is no steeper than 1 in 15, each sloped part is no wider than 1.5 m and it stays at least 0.6 m from the lot line; this is a design detail and is not modelled.",
  "LIFT": "A lift of up to 3.0 m² that rises no higher than the first floor may project into a setback if it stays at least 0.6 m from the lot line; this is a design detail and is not modelled.",
  "DORMER_SB": "No wall of a roof dormer may be closer to a lot line than the required setback; the maximum design keeps dormers inside the setbacks.",
  "LANE_SOFT60": "On a lot with a frontage of 6.0 m or less, 60 % of the area between the house's rear walls and the laneway suite's front wall must be soft landscaping; this is shown, and it does not shrink the suite.",
  "HERITAGE": "On a heritage-designated property, work that needs a Heritage Permit must follow the permit's limits on bulk, massing, form and location; the zone's building rules do not stop work that complies with the permit.",
  "SHORE_SB_A": "If TRCA has determined a shoreline hazard limit or stable top-of-bank crosses the lot: buildings must be set back at least 10 m from it, except an ancillary building on a residential lot.",
  "SHORE_SB_EX": "If an existing building lawfully sits less than 10 m from a shoreline hazard limit or stable top-of-bank on the lot, it may stay, and may be altered or replaced if no point of its main walls gets closer.",
  "SHORE_SEP_A": "If TRCA has determined a shoreline hazard limit or stable top-of-bank on a nearby lot: buildings must be at least 10 m from it, except an ancillary building on a residential lot.",
  "SHORE_SEP_EX": "If an existing building lawfully sits less than 10 m from a shoreline hazard limit or stable top-of-bank on another lot, it may stay, and may be altered or replaced if no point of its main walls gets closer.",
  "THROUGH_RESERVE": "On a through lot, a street line separated from the street by a 0.3 m reserve cannot be chosen as the front lot line; no reserve is known for this lot, so none is taken.",
  "THROUGH_FRONT": "This is a through lot; the front lot line is taken on the street the neighbouring lots face (the lot's address street). If the City sets the other street line as the front, the front and rear setbacks swap.",
  "MECH_ATTIC": "Up to the lesser of 5% of the permitted floor-area total (GFA) or 20 m² of a counted attic is taken as mechanical-equipment space and left out of the GFA; this is achieved if that attic space holds the building's mechanical equipment.",
};

const ROOF: [string, keyof typeof T][] = [
  ['10.5.40.10(2)#(2)(A)', 'ROOF_ANT'], ['10.5.40.10(2)#(2)(B)', 'ROOF_FLAG'], ['10.5.40.10(2)#(2)(C)', 'ROOF_PARAPET'],
  ['10.5.40.10(2)#(2)(D)', 'ROOF_DISH'], ['10.5.40.10(2)#(2)(E)', 'ROOF_VANE'], ['10.5.40.10(3)#(3)(A)', 'ROOF_EQUIP'],
  ['10.5.40.10(3)#(3)(B)', 'ROOF_STRUCT'], ['10.5.40.10(3)#(3)(C)', 'ROOF_SCREEN'], ['10.5.40.10(5)#(5)(A)', 'ROOF_AMENITY'],
  ['10.5.40.10(5)#(5)(B)', 'ROOF_AMENITY_SET'],
];
describe('M-169(4) — rooftop height allowances 10.5.40.10(2)-(5) are disclosed, never evaluated (rooftop_elements_exempt)', () => {
  for (const [id, k] of ROOF) {
    it(`${id} carries its rooftop sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
  it('rooftop_elements_exempt reads "building or suite height" and cites 10.5.40.10(2)-(5)', () => {
    expect(code('rooftop_elements_exempt')).toMatch(/may exceed the building or suite height within limits/);
    expect(code('rooftop_elements_exempt')).toMatch(/10\.5\.40\.10\(2\)–\(5\)/);
  });
});

const ENC: [string, keyof typeof T][] = [
  ['10.5.40.60(3)#(3)(A)', 'STAIRS'], ['10.5.40.60(3)#(3)(B)', 'RAMP'], ['10.5.40.60(3)#(3)(C)', 'LIFT'],
  ['10.5.40.60(7)#(7)(A)', 'DORMER_SB'],
];
describe('M-169(4) — the rest of the 10.5.40.60 encroachments carry their setback_encroachments sentence', () => {
  for (const [id, k] of ENC) {
    it(`${id} carries its encroachment sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
});

const SHORE: [string, keyof typeof T][] = [
  ['5.10.40.70(6)#(6)(A)', 'SHORE_SB_A'], ['5.10.40.70(7)#whole', 'SHORE_SB_EX'],
  ['5.10.40.80(1)#(1)(A)', 'SHORE_SEP_A'], ['5.10.40.80(2)#whole', 'SHORE_SEP_EX'],
];
describe('M-169(2) / M-212(3) — the shoreline setback and separation are disclosed site facts (shoreline_hazard)', () => {
  for (const [id, k] of SHORE) {
    it(`${id} carries its shoreline sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
  it('shoreline_hazard names the 10 m setback beside the FSI rule', () => {
    expect(code('shoreline_hazard')).toMatch(/allowed floor area \(FSI\), and buildings must stay 10 m from it/);
  });
});

const LAWFUL: [string, keyof typeof T][] = [
  ['10.5.30.11(2)#whole', 'AREA_ADD'], ['10.5.30.11(3)#whole', 'VACANT_AREA'], ['10.5.30.21(1)#whole', 'FRONTAGE_EX'],
  ['10.5.30.21(2)#whole', 'FRONTAGE_ADD'], ['10.5.30.41(2)#whole', 'COVER_ADD'],
];
describe('M-158 / M-192 — the lawfully existing lot family 10.5.30.11 / .21 / .41 is disclosed, one form', () => {
  for (const [id, k] of LAWFUL) {
    it(`${id} carries its lawfully-existing sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
  it('M-192: 10.5.40.11(2) names the renovation answer holding additions to the base height (re-cited from M-211(1), verify-12f N6)', () => {
    expect(unitOf('10.5.40.11(2)#whole').calculation_handling.gaps).toMatch(/M-192: an addition meets the permitted maximum height/);
    expect(unitOf('10.5.40.11(2)#whole').calculation_handling.gaps).not.toMatch(/M-211/);
  });
});

describe('M-196(1) / M-214(3) — 10.5.20.40(6): no secondary suite in a converted semi or townhouse portion', () => {
  it('10.5.20.40(6) carries the prohibition sentence and names M-196(1) / M-214(3)', () => {
    expect(unitOf('10.5.20.40(6)#whole').disclosure).toBe(T.SUITE_CONV);
    expect(unitOf('10.5.20.40(6)#whole').calculation_handling.gaps).toMatch(/M-196\(1\).*M-214\(3\)/);
  });
});

describe('M-175 / M-208 / M-213(3) — platforms, laneway soft landscaping and the heritage permit are disclosed', () => {
  for (const [id, k] of [['10.5.40.50(1)#whole', 'PLAT_WALLS'], ['10.5.40.50(2)#whole', 'PLAT_SETBACK'], ['150.8.50.10(1)#(1)(A)', 'LANE_SOFT60'], ['5.10.40.1(6)#(6)(A)', 'HERITAGE']] as [string, keyof typeof T][]) {
    it(`${id} carries its sentence`, () => {
      expect(unitOf(id).disclosure).toBe(T[k]);
    });
  }
});

describe('M-31 — 10.5.40.1(1) is the procedural scope of Article 10.5.40', () => {
  it('M-31: 10.5.40.1(1) scopes 10.5.40 to every building except ancillary buildings, informational', () => {
    const u = unitOf('10.5.40.1(1)#whole');
    expect(unitOf('10.5.40.1(1)#whole').archetype).toBe('PROCEDURAL');
    expect(u.calculation_handling.status).toBe('informational');
    expect(u.calculation_handling.description).toMatch(/excluding ancillary buildings or structures, which are governed by Article 10\.5\.60/);
  });
});

describe('M-228 — a through lot takes its front lot line on the street the neighbouring lots face (10.5.30.20(1)(A)/(B))', () => {
  it('M-228: 10.5.30.20(1)(A) / (B) carry the reserve and front-line sentences and name M-228', () => {
    expect(unitOf('10.5.30.20(1)#(1)(A)').disclosure).toBe(T.THROUGH_RESERVE);
    expect(unitOf('10.5.30.20(1)#(1)(B)').disclosure).toBe(T.THROUGH_FRONT);
    for (const id of ['10.5.30.20(1)#(1)(A)', '10.5.30.20(1)#(1)(B)']) expect(unitOf(id).calculation_handling.gaps).toMatch(/M-228/);
  });
  it('M-228: P5.12 carries through_lot_front_line', () => {
    expect(code('through_lot_front_line')).toMatch(/the front lot line is taken on \{street\}, the street the neighbouring lots face/);
  });
});

describe('M-229 — the mechanical attic area is left out of GFA by default (10.5.40.40(2); amends M-171)', () => {
  it('M-229: 10.5.40.40(2) carries the achieved-if sentence and names M-229', () => {
    expect(unitOf('10.5.40.40(2)#whole').disclosure).toBe(T.MECH_ATTIC);
    expect(unitOf('10.5.40.40(2)#whole').calculation_handling.gaps).toMatch(/M-229 .*min\(5 % × permitted maximum GFA, 20 m²\)/);
  });
  it('M-229: P5.12 carries mechanical_attic_excluded', () => {
    expect(code('mechanical_attic_excluded')).toMatch(/achieved if that space holds the mechanical equipment/);
  });
});

describe('PIN NONRES-1 / NONRES-2 / SCOPE-100UNITS-1 — arms answered "disclose" pinned out of scope, no disclosure applied', () => {
  for (const id of ['5.10.40.70(6)#(6)(B)', '5.10.40.80(1)#(1)(B)', '10.5.40.60(4)#(4)(B)']) {
    it(`${id} carries no disclosure (pinned out of scope)`, () => {
      expect(unitOf(id).disclosure).toBe('none');
    });
  }
});
