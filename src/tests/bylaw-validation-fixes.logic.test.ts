// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`displaces[]`), §7.5 rule 2 (an optional variation keeps
//            the base limit; operator 2026-10-19 Q1); docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(4), M-206,
//            M-218; docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (side_yard_shift, one_storey_extension,
//            deep_side_setback), P5.13 (owed); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-57;
//            docs/reports/2026-10-19-bylaw-validation.md (defects D1, D2, D3)
//
// Validation-fixes lane (2026-10-19): the real-lot validation found three evaluator defects the operator ruled on.
// Every assertion reads the production path (validate.mjs inputs → agree.mjs resolved units with the M-75
// corrections → withGeneratedFields + xref evalDisplacement → evaluate.mjs loadCandidates / effective).
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
const displacement = (id: string): Json => {
  const d = XR.displacesOf(index, id, I.vocab, null);
  return { displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation === true };
};
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => ({ ...u, ...displacement(u.unit_id) }));
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
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string, ctx: Json = C): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, ctx);
const valueOf = (r: Json): unknown => (r.status === 'not_evaluated' ? `not_evaluated:${r.reason}` : r.value);

describe('G-AGREE holds with every correction of the validation-fixes lane', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('Q1 / D2 — an optional variation ("Despite …, … may …", no value of its own) keeps the base limit (Spec 68 §7.5 rule 2)', () => {
  it('the optional-variation flag is generated from the wording: the RD side-yard shift and the one-storey extensions carry it', () => {
    for (const id of ['10.20.40.70(4)#whole', '10.20.40.20(2)#(2)(A)', '10.40.40.20(2)#(2)(A)', '10.80.40.20(2)#(2)(A)']) {
      expect([id, displacement(id).displaces_optional]).toEqual([id, true]);
    }
  });
  // amended 2026-10-21 (69a M-255, F-SC-13/14): the RD / RS / RM (2)(C) extension clearance is keyed (extension_side_setback_m), so
  // it is no longer valueless; 14 remain
  it('the sweep of every chapter: exactly these 14 valueless PERMIT / UNUSUAL units are optional variations that keep a numeric base limit', () => {
    const tg = (u: Json): string[] => [].concat(u.target || []).filter((t: string) => t && t !== 'none');
    const caught = units.filter((u) => !tg(u).length && ['PERMIT', 'UNUSUAL'].includes(u.archetype) && u.displaces_optional
      && units.some((x) => x !== u && tg(x).length && ['LIMIT', 'DEFINE'].includes(x.archetype) && u.displaces.some((r: string) => E.refMatch(r, x.unit_id))))
      .map((u) => u.unit_id).sort();
    expect(caught).toEqual([
      '10.20.40.20(2)#(2)(A)', '10.20.40.20(2)#(2)(B)', '10.20.40.70(4)#whole',
      '10.40.40.20(2)#(2)(A)', '10.40.40.20(2)#(2)(B)',
      '10.5.20.40(7)#(7)(A)', '10.5.20.40(7)#(7)(B)', '10.5.60.20(7)#whole',
      '10.80.40.20(2)#(2)(A)', '10.80.40.20(2)#(2)(B)',
      '200.5.10.1(11)#(11)(A)', '200.5.10.1(11)#(11)(B)', '200.5.10.1(13)@1075-2026#(13)', '970.10.15.10(2)#whole',
    ].sort());
  });
  it('a value clause with a later "may" is not an optional variation (900.2.10(735)(M): "… is 2.6 metres …, except that … may …")', () => {
    expect(displacement('900.2.10(735)#(735)[SSP](M)').displaces_optional).toBe(false);
  });
  it('"is permitted" (no modal "may") and "does not apply" are not optional variations', () => {
    for (const id of ['10.20.40.1(2)#(2)(B)', '10.20.40.40(1)#(1)(C)', '10.20.40.70(5)#(5)(A)']) {
      expect([id, displacement(id).displaces_optional]).toEqual([id, false]);
    }
  });
  for (const [f, v] of [[12, 1.2], [15, 1.5], [17.9, 1.5]] as const) {
    it(`RD, required frontage ${f} m: side yard ${v} m from 10.20.40.70(3) (was no_candidate), the 0.3 m shift disclosed`, () => {
      const r = eff(lot('RD', 'detached_house', { label: { f } }), 'side_setback_m');
      expect(valueOf(r)).toBe(v);
      expect((r.disclosures ?? []).some((d: string) => /0\.3 m/.test(d))).toBe(true);
    });
  }
  for (const [zone, f] of [['RD', 15], ['RS', 15], ['RM', 15]] as const) {
    it(`${zone}, required frontage ${f} m: building length 17.0 m (was no_candidate), the one-storey extension disclosed`, () => {
      const r = eff(lot(zone, 'detached_house', { label: { f } }), 'building_length_m');
      expect(valueOf(r)).toBe(17);
      expect((r.disclosures ?? []).some((d: string) => /one-storey/i.test(d))).toBe(true);
    });
  }
  it('RD, required frontage 20 m (outside the shift band): side yard unchanged from (3)(E) 1.8 m', () => {
    expect(valueOf(eff(lot('RD', 'detached_house', { label: { f: 20 } }), 'side_setback_m'))).toBe(1.8);
  });
  it('a "may have … of 19.0 m" LIMIT keeps displacing (it has a value of its own): RD detached houseplex length rule unchanged', () => {
    const u = units.find((x) => x.unit_id === '10.20.40.20(3)#(3)(A)');
    expect(u && u.target).toBe('building_length_m');
    expect(u && u.displaces.length).toBeGreaterThan(0);
  });
});

describe('Q2 / D3 — RD over 18 m: the side setback answers the (3) band; the 7.5 m deep-portion rule is its own measure (owed to P5.13)', () => {
  it('10.20.40.70(5)(A)/(B) are keyed to deep_side_setback_m, not side_setback_m', () => {
    for (const id of ['10.20.40.70(5)#(5)(A)', '10.20.40.70(5)#(5)(B)']) {
      const u = unitOf(id);
      expect([id, u.target, u.numeric_expression]).toEqual([id, 'deep_side_setback_m', ['deep_side_setback_m = 7.5 m @(5)']]);
      expect([id, /7\.5 m/.test(u.disclosure)]).toEqual([id, true]);
    }
  });
  for (const [f, v] of [[21, 1.8], [24, 2.4], [30, 3.0]] as const) {
    it(`RD, required frontage ${f} m: side yard ${v} m from 10.20.40.70(3) (was 7.5 m), deep portion 7.5 m`, () => {
      const l = lot('RD', 'detached_house', { label: { f } });
      expect(valueOf(eff(l, 'side_setback_m'))).toBe(v);
      expect(valueOf(eff(l, 'deep_side_setback_m'))).toBe(7.5);
    });
  }
});

describe('D1 — the RD exception "detached house with a flat roof" height caps bind only a flat or shallow roof (M-218)', () => {
  const CAPS: Array<[string, string, number]> = [['900.3.10(18)', '900.3.10(18)#(18)[SSP](C)', 6], ['900.3.10(21)', '900.3.10(21)#(21)[SSP](A)', 6.5],
    ['900.3.10(28)', '900.3.10(28)#(28)[SSP](A)', 6.5], ['900.3.10(37)', '900.3.10(37)#(37)[SSP](A)', 6.5]];
  // x28 is fully authored (every unit agreed, no pending DEFINE), as eval-lots.mjs marks it; x18 / x21 / x37 still hold a
  // DEFINE with a target and no statement, so ruling (d) answers exception_not_authored there — their keying is checked directly
  const CX = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences, authored: { '900.3.10(28)': 'authored' } });
  for (const [, id] of CAPS) {
    it(`${id} carries the flat_or_shallow_roof condition`, () => {
      expect(unitOf(id).condition).toEqual({ tokens: ['flat_or_shallow_roof'] });
    });
  }
  for (const [exc, id, cap] of CAPS.filter(([e]) => e === '900.3.10(28)')) {
    it(`${exc}: a pitched roof is not capped at ${cap} m; a flat roof is`, () => {
      const pitched = eff(lot('RD', 'detached_house', { exception: exc, overlays: { HT: 9.5 } }), 'height_m', CX);
      const flat = eff(lot('RD', 'detached_house', { exception: exc, overlays: { HT: 9.5 }, flags: { flat_or_shallow_roof: true } }), 'height_m', CX);
      expect(pitched.winner).not.toBe(id);
      expect(valueOf(pitched)).not.toBe(cap);
      expect(valueOf(flat)).toBe(cap);
    });
  }
});

describe('Q3 / D4 resolved (a) 2026-10-19 — M-176(1) stands: a townhouse on a major street takes the no-driveway frontage; the driveway case is disclosed', () => {
  const TH: Array<[string, string]> = [['RD', '10.20.30.20(1)#(1)(C)'], ['RS', '10.40.30.20(1)#(1)(D)'], ['RM', '10.80.30.20(1)#(1)(D)']];
  const DISCLOSURE = 'The frontage assumes no townhouse unit has its own driveway: 5.0 m per unit (20 m for 4 units). If each unit has its own driveway to the front, it needs 6.0 m per unit (24 m for 4 units).';
  const flags = { major_street: true, all_units_front_street: true, unit_not_fronting_street: false, no_individual_private_driveway: true, individual_private_driveway: false };
  for (const [zone, id] of TH) {
    it(`${id} carries the plain-words driveway disclosure (≤ 45 words, LC-52)`, () => {
      const d = unitOf(id).disclosure;
      expect(d).toBe(DISCLOSURE);
      expect(d.split(/\s+/).length).toBeLessThanOrEqual(45);
    });
    it(`${zone}: a 4-unit townhouse on a major street needs 20 m from ${id}, which discloses the 24 m driveway case`, () => {
      const r = eff(lot(zone, 'townhouse', { label: { f: 18 }, flags, vars: { dwelling_units: 4 } }), 'required_lot_frontage_m');
      expect(valueOf(r)).toBe(20);
      // the winning unit carries the disclosure (unit disclosures travel with the answer to P5.12, not in effective().disclosures)
      expect(r.winner).toBe(id);
      expect(unitOf(r.winner).disclosure).toBe(DISCLOSURE);
    });
  }
});
