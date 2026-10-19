// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-31, M-169(4), M-171, M-185, M-192, M-202, M-203, M-211;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (dormers_at_max, rear_addition_floor_levels,
//            addition_above_existing, existing_walls_site_fact, setback_encroachments, gfa_deductions_not_applied)
//
// Review answers batch 4 (live page DB dump envdb10, 2026-10-19): the new "wrong" / "disclose" answers whose keyed unit
// lacked the ruled form, fixed once per provision family (dormers across R / RS / RM). Production path as batch 3.
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
  zone, label: { f: 12, d: 0.6, ...(extra.label ?? {}) }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5 },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

const T = {
  "DORMER_A": "Dormer walls do not count as main walls if each dormer face sits in a roof directly above a part of a main wall within the main wall height limit; the design chooses the dormers.",
  "REAR_ADD": "In the R zone a rear addition's floors may not rise above the existing top floor; the renovation answer keeps the back-room storeys at or below the existing storeys.",
  "DEPTH_EXCL": "Parts of the building allowed to project into a setback, such as eaves, steps or a porch, are not counted in its depth.",
  "FSI_SUM": "Floor space index counts the gross floor area plus an attic that meets the headroom and size test (less up to 20 m² of mechanical attic space), minus the basement, floor voids and inside parking the by-law lets you leave out; the maximum build leaves out the basement, and the voids and parking depend on the design.",
  "BAY": "A bay or box window may project up to 0.75 m into the front or rear yard setback if the projections take up no more than 65% of that wall's width at each storey; this is a design detail and is not modelled.",
  "METER": "Wall-mounted utility meters may project into any setback if they stay at least 0.3 m from the lot line; this is a design detail and is not modelled.",
  "FRONT_EX": "A lawfully existing building that sits closer to the front lot line than today's minimum keeps that front setback; this needs the existing building's position, so it is disclosed, not calculated.",
  "UP_ADD": "On a lot of 12.2 m or less, an addition above the house keeps its setbacks (achieved if the house is lawfully existing)."
};

describe('M-185 — dormer walls over the main-wall limit are not main walls (x.40.10(5)(A) R / RS / RM, as RD (7)(A))', () => {
  for (const id of ['10.10.40.10(5)#(5)(A)', '10.40.40.10(5)#(5)(A)', '10.80.40.10(5)#(5)(A)']) {
    it(`${id} carries the dormers_at_max sentence of the RD twin`, () => {
      expect(unitOf(id).disclosure).toBe(T.DORMER_A);
      expect(unitOf('10.20.40.10(7)#(7)(A)').disclosure).toBe(T.DORMER_A);
    });
  }
});

describe('M-211(2) / M-192 — the R rear addition floor levels (10.10.40.10(7)) are the renovation answer, disclosed', () => {
  it('10.10.40.10(7) carries the rear_addition_floor_levels sentence', () => {
    expect(unitOf('10.10.40.10(7)#whole').disclosure).toBe(T.REAR_ADD);
  });
});

describe('M-31 / M-171 — 10.5.40.30 is the depth measure (procedural), as 10.5.40.20 is for length', () => {
  it('10.5.40.30(1) is a measurement rule that sets no limit', () => {
    const u = unitOf('10.5.40.30(1)#whole');
    expect(u.calculation_handling.description).toMatch(/^Measurement rule \(procedural, sets no limit\)/);
    expect(u.calculation_handling.gaps).toMatch(/M-31/);
    expect(u.numeric_expression).toBe('none');
  });
  it('10.5.40.30(2) is a disclosed measure exclusion', () => {
    const u = unitOf('10.5.40.30(2)#whole');
    expect(u.disclosure).toBe(T.DEPTH_EXCL);
    expect(u.calculation_handling.gaps).toMatch(/M-171/);
    expect(u.calculation_handling.description).toMatch(/^Excludes/);
  });
});

describe('M-171 / M-203 — 10.5.40.40(5)(B) states what the FSI counts', () => {
  it('10.5.40.40(5)(B) carries the GFA composition note', () => {
    expect(unitOf('10.5.40.40(5)#(5)(B)').disclosure).toBe(T.FSI_SUM);
  });
});

describe('M-169(4) — setback encroachments are design details, disclosed (10.5.40.60)', () => {
  for (const [id, s] of [['10.5.40.60(6)#(6)(A)', T.BAY], ['10.5.40.60(8)#(8)(E)', T.METER]] as [string, string][]) {
    it(`${id} carries the setback_encroachments sentence`, () => {
      expect(unitOf(id).disclosure).toBe(s);
    });
  }
});

describe('M-192 — lawfully-existing setbacks: (1)(A) disclosed, (3) the up-addition relief', () => {
  it('10.5.40.71(1)(A) carries the front-setback renovation disclosure', () => {
    expect(unitOf('10.5.40.71(1)#(1)(A)').disclosure).toBe(T.FRONT_EX);
    expect(unitOf('10.5.40.71(1)#(1)(A)').calculation_handling.gaps).toMatch(/M-192/);
  });
  it('10.5.40.71(3) carries the addition_above_existing sentence and names M-192 / M-211(1)', () => {
    expect(unitOf('10.5.40.71(3)#whole').disclosure).toBe(T.UP_ADD);
    expect(unitOf('10.5.40.71(3)#whole').calculation_handling.gaps).toMatch(/M-192.*M-211\(1\)/);
  });
});

describe('M-202 — R 10.10.40.1(3)(A) is the \'u\' dwelling-unit cap', () => {
  it('M-202: with u3 an R detached house is capped at 3; the R unit reads the label', () => {
    expect(eff(lot('R', 'detached_house', { label: { u: 3 } }), 'dwelling_units_max').value).toBe(3);
    expect(unitOf('10.10.40.1(3)#(3)(A)').condition).toEqual({ if: 'labelled(u)', tokens: ['label_value'] });
  });
});
