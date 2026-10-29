// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (conditions), §7.5 (precedence rules 1, 2, 7), §7.6 (applies());
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-159 (a unit governs only its own subject), M-174(2)/(5),
//            M-182, M-197, M-198(5), M-202(3)/(4), M-205(3), M-209, M-215(2), M-216, M-217..M-222, M-223(3), M-224, M-225;
//            operator 2026-10-19 review-page rulings Q-M218 / Q-M197 / Q-other-building (Spec 131 LC-54)
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.15 INV-18 / INV-19 (named describes; scenario plan R-13,
//            operator APPROVED 2026-10-20); docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HF (the INV-18 / INV-19
//            describes below are R-HF's lock)
//
// By-law evaluator-fix lane (operator item 6, 2026-10-18): the reality-check evaluator defects M-217..M-222 and the
// review leaks, each fixed once by provision family across the parallel residential chapters, never per zone.
// Every assertion reads the production path (validate.mjs inputs → agree.mjs resolved units with the M-75 corrections
// → withGeneratedFields + xref displacesOf → evaluate.mjs loadCandidates / effective over evaluatorVocab()).
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
const resolved: Json[] = [...AG.agreedUnits(ag).values()];
const units: Json[] = resolved
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, main_building_gfa_m2: 500, ...(extra.vars ?? {}) }, // main_building_gfa_m2: the third source of the value order (the maximum build) always holds a figure in the product (CHAT-198.NN-Q3)
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const touched = (r: Json): string[] => [r.winner, ...(r.applied ?? [])].filter((x: unknown): x is string => typeof x === 'string');

describe('G-AGREE holds with every correction of this lane (no orphan)', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('M-217 / M-159(1) — a non-residential chapter never limits a residential lot', () => {
  for (const zone of ZONES) {
    it(`${zone}: Institutional FSI 80.10.40.40(1)(A) and Commercial Residential storeys 40.10.40.10(7) are not applied`, () => {
      for (const bt of ['detached_house', 'detached_houseplex']) {
        expect(touched(eff(lot(zone, bt), 'fsi')).filter((id) => id.startsWith('80.'))).toEqual([]);
        expect(touched(eff(lot(zone, bt), 'height_storeys')).filter((id) => id.startsWith('40.'))).toEqual([]);
      }
    });
  }
  it('applies() names the zone category it was set aside for', () => {
    const r = E.applies(lot('RD', 'detached_house'), units.find((u) => u.unit_id === '80.10.40.40(1)#(1)(A)'), C);
    expect([r.ok, r.why]).toEqual([false, 'zone category Institutional (M-159(1))']);
  });
  it('RD 10.20.40.10(4)(A) no longer carries the Chapter 40 "Development Standard Set 1" map gate', () => {
    const r = eff(lot('RD', 'detached_house', { flags: { flat_or_shallow_roof: true } }), 'main_wall_height_m');
    expect(String(r.reason ?? '')).not.toMatch(/map_area_not_held/);
  });
});

describe('M-218 — the flat-or-shallow-roof clauses are a design choice; the x.40.10(2) main-wall limit answers otherwise', () => {
  for (const zone of ['R', 'RD', 'RS', 'RM']) {
    it(`${zone}: a pitched roof keeps max(7.0 m, H − 2.5 m) = 7.5 m (was no_candidate)`, () => {
      const r = eff(lot(zone, 'detached_house'), 'main_wall_height_m');
      expect([r.status, r.value]).toEqual(['value', 7.5]);
      expect(r.winner).toMatch(/^10\.(10|20|40|80)\.40\.10\(2\)#/);
    });
    it(`${zone}: an undecided roof form is undecided, never a silent permit`, () => {
      const l = lot(zone, 'detached_house');
      delete l.flags.flat_or_shallow_roof;
      // the flat-roof clauses shape only the storey above the main-wall limit (operator 2026-10-19, Q-M218): the undecided
      // roof form leaves the step-back undecided (RD (4)(A) also sets the main walls, decided here only where both forms agree, M-60)
      expect(eff(l, 'upper_storey_setback_m').reason).toBe('condition_unknown:flat_or_shallow_roof');
    });
  }
  it('the six flat-roof units test flat_or_shallow_roof', () => {
    for (const id of ['10.10.40.10(11)#(11)(A)', '10.10.40.10(12)#(12)(A)', '10.20.40.10(4)#(4)(A)', '10.20.40.10(4)#(4)(B)', '10.40.40.10(6)#(6)(A)', '10.80.40.10(6)#(6)(A)']) {
      expect(unitOf(id).condition).toEqual({ tokens: ['flat_or_shallow_roof'] });
    }
  });
});

describe('Q-M218 flat roof (operator 2026-10-19) — the façade keeps its main-wall limit; only the storey above it is set back 1.4 m (M-218, M-223(3))', () => {
  const STEPBACK: Record<string, string[]> = {
    R: ['10.10.40.10(11)#(11)(A)', '10.10.40.10(12)#(12)(A)'], RD: ['10.20.40.10(4)#(4)(B)'], RS: ['10.40.40.10(6)#(6)(A)'], RM: ['10.80.40.10(6)#(6)(A)'],
  };
  it('the vocab names the measure upper_storey_setback_m (M-223(3))', () => {
    expect(I.vocab.dsl_target.upper_storey_setback_m).toMatchObject({ unit: 'm', aspect: 'envelope' });
  });
  for (const zone of ['R', 'RD', 'RS', 'RM']) {
    it(`${zone} flat roof: the façade height is the main-wall limit and the storey above it is set back 1.4 m`, () => {
      const l = lot(zone, 'detached_house', { flags: { flat_or_shallow_roof: true } });
      const walls = eff(l, 'main_wall_height_m');
      expect([walls.status, walls.value]).toEqual(['value', 7.5]);
      expect(walls.winner).toMatch(zone === 'RD' ? /^10\.20\.40\.10\(4\)#\(4\)\(A\)$/ : /^10\.(10|40|80)\.40\.10\(2\)#/);
      const step = eff(l, 'upper_storey_setback_m');
      expect([step.status, step.value]).toEqual(['value', 1.4]);
      expect(STEPBACK[zone]).toContain(step.winner);
    });
    it(`${zone} pitched roof: no step-back applies and the main-wall limit is unchanged`, () => {
      const l = lot(zone, 'detached_house');
      expect(eff(l, 'upper_storey_setback_m').value ?? null).toBe(null);
      expect(eff(l, 'main_wall_height_m').value).toBe(7.5);
    });
  }
  it('the five step-back units are keyed LIMIT upper_storey_setback_m min 1.4 m with the flat-roof condition', () => {
    for (const id of Object.values(STEPBACK).flat()) {
      const u = unitOf(id);
      expect([id, u.archetype, u.target, u.bound, u.condition]).toEqual([id, 'LIMIT', 'upper_storey_setback_m', 'min', { tokens: ['flat_or_shallow_roof'] }]);
      expect(u.numeric_expression[0]).toMatch(/^upper_storey_setback_m = 1\.4 m @/);
    }
  });
});

describe('Q-M197 (operator 2026-10-19: n, disclose) — no windows is assumed; the two lot facts of the windows arms are disclosed, never read', () => {
  it('each windows arm discloses the lot fact it also needs (rear: abuts a residential lot; side: does not abut a street)', () => {
    expect(unitOf('150.7.60.20(2)#(2)(C)').disclosure).toMatch(/rear lot line abuts a residential lot/);
    expect(unitOf('150.7.60.20(5)#(5)(A)').disclosure).toMatch(/side lot line that does not abut a street/);
  });
  it('the lot facts do not change the no-windows answer (a guard: already right at 920e9b6a)', () => {
    for (const zone of ZONES) {
      const plain = lot(zone, 'garden_suite');
      const facts = lot(zone, 'garden_suite', { flags: { side_yard_abuts_street: true, flanking_lot: true } });
      for (const t of ['rear_setback_m', 'side_setback_m']) expect([zone, t, eff(facts, t).value]).toEqual([zone, t, eff(plain, t).value]);
    }
  });
});

describe('Q-other-building (operator 2026-10-19: y) — the 45 % all-buildings test of 10.5 / 10.10.60.70(1)(C) is disclosed until the two-building step (M-177(1), P2-10)', () => {
  it('both units carry the closed P5.12 ancillary_coverage_all_buildings sentence', () => {
    for (const id of ['10.5.60.70(1)#(1)(C)', '10.10.60.70(1)#(1)(C)']) {
      expect([id, unitOf(id).disclosure]).toEqual([id, 'If all buildings on the lot together cover no more than 45 % of it, the limit on ancillary building coverage does not apply to a lot with a houseplex or a secondary suite.']);
    }
  });
});

describe('M-219 — Article x.40 (and 10.5.40) never answers for a suite; Article 10.5.60 answers only for ancillary buildings', () => {
  for (const zone of ZONES) {
    for (const bt of ['garden_suite', 'laneway_suite']) {
      it(`${zone} ${bt}: no 10.x.40 / 10.5.40 unit decides a setback, length or separation`, () => {
        for (const t of ['front_setback_m', 'rear_setback_m', 'side_setback_m', 'building_length_m', 'separation_m']) {
          expect([t, touched(eff(lot(zone, bt), t)).filter((id) => /^10\.(5|10|20|40|60|80)\.40\./.test(id))]).toEqual([t, []]);
        }
      });
    }
  }
  it('RT / RM garden suite separation is the suite rule 150.7.60.30(1), not the 11.0 m of x.40.80', () => {
    for (const zone of ['RT', 'RM']) {
      const r = eff(lot(zone, 'garden_suite'), 'separation_m');
      expect([r.value, r.winner]).toEqual([4, '150.7.60.30(1)#(1)(A)']);
    }
  });
  it('every article_application entry names exactly one of excluded / included building types, each a vocab type, with its citation (panel round 2)', () => {
    for (const [art, e] of Object.entries<Json>(I.vocab.article_application).filter(([k]) => k !== '$comment')) {
      expect([art, Array.isArray(e.excluded_building_types) !== Array.isArray(e.included_building_types)]).toEqual([art, true]);
      for (const t of e.excluded_building_types ?? e.included_building_types) expect(Object.keys(I.vocab.building_type)).toContain(t);
      expect(e.citation).toBe(`${art}.1(1)`);
    }
  });
  it('the 10.5.60.20(10)(A) device distance no longer decides the RT / RM principal front setback', () => {
    for (const zone of ['RT', 'RM']) expect(eff(lot(zone, 'detached_house'), 'front_setback_m').winner).toMatch(/^10\.(60|80)\.40\.70\(1\)#/);
  });
});

describe('M-197 — the garden-suite openings arms are disclosed; the blank wall gives the smallest setback', () => {
  for (const zone of ZONES) {
    it(`${zone}: side 10 % of a 12 m frontage = 1.2 m from (5)(B); rear 1.5 m from (2)(B)`, () => {
      expect([eff(lot(zone, 'garden_suite'), 'side_setback_m').value, eff(lot(zone, 'garden_suite'), 'side_setback_m').winner]).toEqual([1.2, '150.7.60.20(5)#(5)(B)']);
      expect([eff(lot(zone, 'garden_suite'), 'rear_setback_m').value, eff(lot(zone, 'garden_suite'), 'rear_setback_m').winner]).toEqual([1.5, '150.7.60.20(2)#(2)(B)']);
    });
  }
  it('with openings chosen, the with-openings arms bind (the disclosed trade-off)', () => {
    const l = lot('RD', 'garden_suite', { flags: { suite_wall_openings: true } });
    expect(eff(l, 'side_setback_m').value).toBe(1.5);
    expect(eff(l, 'rear_setback_m').value).toBe(3);
  });
  it('the vocab takes openings as absent (operator 2026-10-18)', () => {
    expect(I.vocab.design_choice_disclosure.default_overrides.suite_wall_openings.taken_as).toBe(false);
  });
});

describe('M-222 / M-224 — the Coxwell area unit takes the literal reading while its polygon is not held', () => {
  const tall = (mapAreas: string[] | undefined): Json => {
    const l = lot('RD', 'garden_suite', { vars: { proposed_height_m: 6.3, distance_to_residential_m: 5 } });
    if (mapAreas === undefined) delete l.map_areas; else l.map_areas = mapAreas;
    return l;
  };
  it('map not held: 7.5 m from (1)(B), with the unit\'s disclosure — never not_evaluated:map_area_not_held', () => {
    const r = eff(tall(undefined), 'separation_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 7.5, '150.7.60.30(1)#(1)(B)']);
    expect(r.disclosures.join(' ')).toMatch(/Coxwell/);
  });
  it('inside a held polygon: 5.0 m from (1)(C)', () => {
    expect(eff(tall(['Coxwell Avenue']), 'separation_m').value).toBe(5);
  });
  it('a suite ≤ 4.0 m answers 4.0 m and carries no Coxwell disclosure ((C) would not apply)', () => {
    const l = lot('RD', 'garden_suite', { vars: { proposed_height_m: 4, distance_to_residential_m: 4 } });
    delete l.map_areas;
    const r = eff(l, 'separation_m');
    expect(r.value).toBe(4);
    expect(r.disclosures.join(' ')).not.toMatch(/Coxwell/);
  });
});

describe('M-220 / M-202(3) — no \'u\' in the label: no \'u\' cap', () => {
  for (const zone of ZONES) {
    it(`${zone}: dwelling_units_max is unregulated by label absence (was label_value_absent:u)`, () => {
      const r = eff(lot(zone, 'detached_houseplex'), 'dwelling_units_max');
      expect([r.status, r.value, r.evidence?.kind, r.evidence?.ruling]).toEqual(['value', 'unregulated', 'label_absent', 'M-202(3)']);
    });
  }
  it('with u3 the cap is 3 (M-202(4): RT 10.60.40.1(2)(A) is the \'u\' cap, not a one-building rule)', () => {
    const l = lot('RT', 'detached_houseplex');
    l.label = { ...l.label, u: 3 };
    expect(eff(l, 'dwelling_units_max').value).toBe(3);
    expect(unitOf('10.60.40.1(2)#(2)(A)').condition).toEqual({ if: 'labelled(u)', tokens: ['label_value'] });
  });
  it('10.5.1.10(3)(D) applies only when the label carries u (the M-174(4) form, (D) only)', () => {
    expect(unitOf('10.5.1.10(3)#(3)(D)').condition).toEqual({ tokens: ['label_value'], if: 'labelled(u)' });
    expect(unitOf('10.5.1.10(3)#(3)(E)').condition).toBe('none'); // (A)–(C), (E) stay held with M-174(4)
  });
});

describe('M-221 / M-182 — "a residential building with a secondary suite" is the suite class', () => {
  for (const zone of ['RD', 'RS', 'RT', 'RM']) {
    it(`${zone}: a detached house with a suite on an LC 35 lot takes the 45 % of x.30.40(1)(D); without one, 35 %`, () => {
      const withSuite = lot(zone, 'detached_house', { flags: { has_secondary_suite: true }, overlays: { LC: 35 } });
      const without = lot(zone, 'detached_house', { flags: { has_secondary_suite: false }, overlays: { LC: 35 } });
      expect(eff(withSuite, 'lot_coverage_pct').value).toBe(45);
      expect(eff(without, 'lot_coverage_pct').value).toBe(35);
    });
  }
  for (const zone of ZONES) {
    it(`${zone}: the FSI DISAPPLY x.40.40(1)(C) applies to a house with a suite`, () => {
      const r = eff(lot(zone, 'detached_house', { flags: { has_secondary_suite: true } }), 'fsi');
      const z = { R: '10', RD: '20', RS: '40', RT: '60', RM: '80' }[zone];
      expect(r.trace).toContain(`rule 2: 10.${z}.40.40(1)#(1)(C) drops 10.${z}.40.40(1)#(1)(A)`);
    });
  }
});

describe('the parking leaks (M-225 extended) and the device leak — the M-159(2) accessory form', () => {
  it('10.5.80.1(2)(D) is UNUSUAL like (2)(A): the outdoor parking area is not a building', () => {
    const u = unitOf('10.5.80.1(2)#(2)(D)');
    expect([u.archetype, u.target, u.bound, u.numeric_expression]).toEqual(['UNUSUAL', 'none', 'none', 'none']);
  });
  it('the M-223 → M-225 re-cite: every live 10.5.80.1(2)(A) correction cites M-225', () => {
    const corr = (I.adjudications.adjudications ?? I.adjudications).filter((e: Json) => e.kind === 'correction');
    const sup = new Set(corr.map((e: Json) => e.supersedes).filter(Boolean));
    const live = corr.filter((e: Json) => e.unit === '10.5.80.1(2)#(2)(A)' && !sup.has(e.id));
    expect(live.length).toBe(7);
    for (const e of live) expect([e.field, /M-225/.test(e.rule), /M-223/.test(e.rule)]).toEqual([e.field, true, false]);
  });
  it('the R garage rule 10.10.60.20(1) and the device rule 10.5.60.20(10) carry their accessory structure', () => {
    for (const id of ['10.10.60.20(1)#(1)(A)', '10.10.60.20(1)#(1)(B)']) expect(unitOf(id).application.uses).toContain('private_garage');
    for (const id of ['10.5.60.20(10)#(10)(A)', '10.5.60.20(10)#(10)(B)']) expect(unitOf(id).application.uses).toContain('energy_device');
  });
  it('the R ancillary 5 % (10.10.60.70(1)) is on ancillary_coverage_pct, never the principal coverage', () => {
    for (const id of ['10.10.60.70(1)#(1)(A)', '10.10.60.70(1)#(1)(B)']) expect(unitOf(id).target).toBe('ancillary_coverage_pct');
  });
  it('the garden-suite parking variant 150.7.60.20(4)(B) needs a rear-street vehicle entrance', () => {
    const u = units.find((x) => x.unit_id === '150.7.60.20(4)#(4)(B)');
    expect(E.applies(lot('R', 'garden_suite', { flags: { through_lot: true, garage_entrance_faces_street: false } }), u, C).ok).toBe(false); // the design choice as Layer 3 sets it (M-172(3))
    expect(E.applies(lot('R', 'garden_suite', { flags: { through_lot: true, garage_entrance_faces_street: true } }), u, C).ok).toBe(true);
  });
  it('guard: no live parking- or device-scoped unit decides a principal or suite envelope target on any zone', () => {
    const ids = new Set(resolved.filter((u) => (u.application?.uses ?? []).some((x: unknown) => x === 'parking_space')).map((u) => u.unit_id));
    for (const zone of ZONES) for (const bt of ['detached_house', 'detached_houseplex', 'garden_suite', 'laneway_suite']) {
      for (const t of ['front_setback_m', 'rear_setback_m', 'side_setback_m', 'street_setback_m', 'separation_m', 'lot_coverage_pct']) {
        expect([zone, bt, t, touched(eff(lot(zone, bt), t)).filter((id) => ids.has(id) || id.startsWith('10.5.60.20(10)'))]).toEqual([zone, bt, t, []]);
      }
    }
  });
});

describe('M-205(3) / M-174(5) — RS and RM rear setback is the greater of 7.5 m and 25 % of lot depth (the owed P2-0 vector; already right at ca3bcf0e, so a guard, not a red)', () => {
  for (const zone of ['RS', 'RM']) {
    it(`${zone}: depth 40 m → 10.0 m; depth 20 m → 7.5 m`, () => {
      expect(eff(lot(zone, 'detached_house', { vars: { lot_depth_m: 40 } }), 'rear_setback_m').value).toBe(10);
      expect(eff(lot(zone, 'detached_house', { vars: { lot_depth_m: 20 } }), 'rear_setback_m').value).toBe(7.5);
    });
  }
});

describe('disclosures the tracker owed (M-215(2), M-216, M-209)', () => {
  it('the main-entrance height is disclosed in all four zone copies (M-215(2))', () => {
    for (const id of ['10.10.40.10(6)#whole', '10.20.40.10(6)#whole', '10.40.40.10(4)#whole', '10.80.40.10(4)#whole']) expect(unitOf(id).disclosure).toMatch(/1\.2 m above/);
  });
  it('suite parking and bicycle rules are disclosed (M-216)', () => {
    for (const id of ['150.7.80.1(1)#(1)(A)', '150.7.80.1(1)#(1)(B)', '150.7.80.1(2)#whole', '150.8.80.1(1)#(1)(A)', '150.8.80.1(1)#(1)(B)', '150.8.80.1(2)#whole']) {
      expect(unitOf(id).disclosure).toBe('No parking is required with the suite; it must provide two bicycle parking spaces.');
    }
  });
  it('laneway eligibility names all three arms (M-209)', () => {
    expect(unitOf('150.8.30.20(1)#whole').disclosure).toMatch(/rear lot line, along a side lot line, or along the side and rear lot lines combined/);
  });
});

describe('M-174(4) on (E) + M-183 — the houseplex and house-with-suite FSI exemption takes effect (round 2, operator 2026-10-19)', () => {
  it('10.5.1.10(3)(E) is a label definition: no target, no statement', () => {
    const u = unitOf('10.5.1.10(3)#(3)(E)');
    expect([u.archetype, u.target, u.numeric_expression]).toEqual(['DEFINE', 'none', 'none']);
  });
  for (const zone of ZONES) {
    const z = { R: '10', RD: '20', RS: '40', RT: '60', RM: '80' }[zone];
    it(`${zone}: d 0.6 — a detached house answers 0.6 from x.40.40(1)(A); a houseplex and a house with a suite answer not_applicable (x.40.40(1)(C))`, () => {
      const house = eff(lot(zone, 'detached_house'), 'fsi');
      expect([house.status, house.value, house.winner]).toEqual(['value', 0.6, `10.${z}.40.40(1)#(1)(A)`]);
      for (const l of [lot(zone, 'detached_houseplex'), lot(zone, 'detached_house', { flags: { has_secondary_suite: true } })]) {
        const r = eff(l, 'fsi');
        expect([r.status, r.reason, r.evidence?.kind]).toEqual(['not_applicable', `not_applicable:10.${z}.40.40(1)#(1)(C)`, 'disapply']);
      }
    });
  }
  it('M-215(1): R with no d — a house takes the 0.6 default of 10.10.40.40(1)(B); a houseplex is exempt', () => {
    const l = lot('R', 'detached_house'); l.label = { f: 12 };
    expect(eff(l, 'fsi').value).toBe(0.6);
    const p = lot('R', 'detached_houseplex'); p.label = { f: 12 };
    expect(eff(p, 'fsi').status).toBe('not_applicable');
  });
  it('M-183: houseplex storeys under ST 2 are not capped (x.40.10(3)(C); RT x.40.10(2)(C)); a house keeps 2', () => {
    for (const zone of ZONES) {
      expect(eff(lot(zone, 'detached_house', { overlays: { ST: 2 } }), 'height_storeys').value).toBe(2);
      expect(eff(lot(zone, 'detached_houseplex', { overlays: { ST: 2 } }), 'height_storeys').status).toBe('not_applicable');
    }
  });
  it('M-183: x.40.40(1)(D) — a townhouse on a major street with 60 dwelling units or fewer is exempt from FSI (RD, RS, RT)', () => {
    for (const [zone, z] of [['RD', '20'], ['RS', '40'], ['RT', '60']] as const) {
      const r = eff(lot(zone, 'townhouse', { flags: { major_street: true }, vars: { dwelling_units: 10 } }), 'fsi');
      expect([zone, r.status, r.reason]).toEqual([zone, 'not_applicable', `not_applicable:10.${z}.40.40(1)#(1)(D)`]);
    }
  });
  it('M-183(3): an undecided exemption stays undecided — x.40.40(1)(D) on an unknown dwelling count is never a silent not_applicable', () => {
    const r = eff(lot('RD', 'townhouse', { flags: { major_street: true } }), 'fsi');
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason)).not.toMatch(/^not_applicable/);
  });
  it('a not_applicable target read inside arithmetic is unregulated_in_arithmetic (M-183(2): no cap, never a number)', () => {
    expect(E.NOT_EVALUATED_CODES).toContain('unregulated_in_arithmetic');
    expect(E.NOT_EVALUATED_CODES).not.toContain('not_applicable_in_arithmetic');
  });
});

describe('M-217 strengthened — with the map polygons NOT held, no Chapter 40 unit gates RD main walls', () => {
  it('RD flat roof: main_wall_height_m is decided by RD units, never map_area_not_held', () => {
    const l = lot('RD', 'detached_house', { flags: { flat_or_shallow_roof: false } }); delete l.map_areas;
    const r = eff(l, 'main_wall_height_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 7.5, '10.20.40.10(2)#(2)(A)']);
  });
});

describe('disclosure round 2 (operator 2026-10-19, decision 4) — every ruled P5.12 disclosure is on its keyed unit', () => {
  const ROUND2 = ['10.20.40.10(7)#(7)(A)', '10.20.40.10(8)#whole', '10.40.40.1(7)#(7)(A)', '10.40.40.1(7)#(7)(B)', '10.40.40.1(7)#(7)(C)', '10.60.40.1(3)#(3)(A)',
    '10.80.30.10(1)#(1)(B)', '10.80.40.10(5)#(5)(B)', '150.7.60.30(1)#(1)(A)', '150.7.60.30(1)#(1)(B)', '150.7.60.51(2)#(2)(A)', '150.7.60.51(2)#(2)(B)',
    '150.8.50.10(1)#(1)(B)', '150.8.60.50(4)#whole', '5.10.40.40(1)#whole', '5.10.40.70(5)#whole', '600.60.40(2)#(2)(A)',
    '970.10.15.10(1)#(1)(A)', '970.10.15.10(1)#(1)(B)', '970.10.15.10(1)#(1)(C)', '970.10.15.10(1)#(1)(D)'];
  it('21 units carry a closed, placeholder-free disclosure', () => {
    for (const id of ROUND2) {
      const d = unitOf(id).disclosure;
      expect([id, typeof d === 'string' && d !== 'none' && !/[{}]/.test(d)]).toEqual([id, true]);
    }
  });
  it('a unit whose vocab already holds the closed sentence carries it verbatim', () => {
    const v = I.vocab;
    for (const id of ['970.10.15.10(1)#(1)(A)', '970.10.15.10(1)#(1)(D)']) expect(unitOf(id).disclosure).toBe(v.measure_deduction_disclosure.sentences[id]);
    expect(unitOf('10.80.40.10(5)#(5)(B)').disclosure).toBe(v.design_choice_disclosure.unit_sentences['10.80.40.10(5)#(5)(B)']);
  });
  it('M-208: the laneway soft-landscaping area is shown and never shrinks the suite', () => {
    expect(unitOf('150.8.50.10(1)#(1)(B)').disclosure).toMatch(/does not shrink the suite/);
  });
});

describe('M-180 — Chapter 900 exceptions and houseplexes: the detached-house substitution and "more permissive prevails" (round 3)', () => {
  // a synthetic authored exception with detached-house rules: height 8.5 m (strict) / 12.0 m (loose), coverage 30 %
  const EXC = '900.2.10(9999)';
  const X = (o: Json): Json => ({ layer: 'exception', exception: EXC, regulation_id: EXC, archetype: 'LIMIT', bound: 'max', condition: 'none', displaces: [],
    applies_to: { part: 'whole', refs: [] }, application: { zones: [], building_types: ['detached_house'], lot_conditions: [], uses: [] }, calculation_handling: { status: 'modelled' }, ...o });
  const withExc = (height: number): Json[] => [...units,
    X({ unit_id: `${EXC}#(A)`, target: 'height_m', numeric_expression: [`height_m = ${height} m @(A)`] }),
    X({ unit_id: `${EXC}#(B)`, target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = 30 pct @(B)'] })];
  const CX = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences, authored: { [EXC]: 'authored' } });
  const excLot = (zone: string, bt: string): Json => {
    const l = lot(zone, bt, { overlays: { LC: 35 }, flags: { lowest_level_joists_1_0_to_1_5_m_for_80_pct: false } });
    l.exception = EXC;
    return l;
  };
  const ev = (l: Json, t: string, us: Json[]): Json => E.effective(l, t, E.loadCandidates(l, us).candidates, CX);

  it('the ten "more permissive" units carry ranks_layers {more_permissive} and their article list as data', () => {
    for (const id of ['10.10.30.1(2)#whole', '10.20.30.1(2)#whole', '10.40.30.1(2)#whole', '10.60.30.1(2)#whole', '10.80.30.1(2)#whole',
      '10.10.40.1(7)#whole', '10.20.40.1(7)#whole', '10.40.40.1(6)#whole', '10.60.40.1(5)#whole', '10.80.40.1(5)#whole']) {
      const u = unitOf(id);
      expect([id, u.ranks_layers]).toEqual([id, { more_permissive: ['exception', 'base'] }]);
      expect(u.application.articles.length).toBeGreaterThan(0);
    }
    expect(unitOf('10.60.40.1(5)#whole').application.articles).toEqual(['10.60.40.10', '10.60.40.40']);
  });
  for (const zone of ['RD', 'RS', 'RM']) {
    it(`${zone}: the exception binds the detached house (8.5 m, 30 %); for the houseplex the more permissive zone rule prevails (10 m, 45 % with LC 35)`, () => {
      const us = withExc(8.5);
      expect([ev(excLot(zone, 'detached_house'), 'height_m', us).value, ev(excLot(zone, 'detached_house'), 'lot_coverage_pct', us).value]).toEqual([8.5, 30]);
      const h = ev(excLot(zone, 'detached_houseplex'), 'height_m', us);
      expect([h.value, h.disclosures.some((d: string) => /more permissive than the exception/.test(d))]).toEqual([10, true]);
      expect(ev(excLot(zone, 'detached_houseplex'), 'lot_coverage_pct', us).value).toBe(45);
    });
  }
  it('x.30.1(2) names "a residential building with a secondary suite" too: a house with a suite on the exception lot takes the zone 45 % over the exception 30 % (panel round 1)', () => {
    for (const zone of ['RD', 'RS', 'RT', 'RM']) {
      const l = excLot(zone, 'detached_house'); l.flags.has_secondary_suite = true;
      expect([zone, ev(l, 'lot_coverage_pct', withExc(8.5)).value]).toEqual([zone, 45]);
    }
  });
  it('a looser exception stands for the houseplex (12 m over the zone 10 m)', () => {
    const r = ev(excLot('RS', 'detached_houseplex'), 'height_m', withExc(12));
    expect([r.value, r.winner]).toEqual([12, `${EXC}#(A)`]);
  });
  it('M-180(1) substitution: an exception rule for a detached house binds the houseplex (RS)', () => {
    const u = withExc(8.5).find((x) => x.unit_id === `${EXC}#(A)`);
    expect(E.applies(excLot('RS', 'detached_houseplex'), u, CX).ok).toBe(true);
  });
  it('RD names the detached houseplex only: a semi-detached-house exception rule does not bind an RD semi-detached houseplex', () => {
    const semi = X({ unit_id: `${EXC}#(C)`, target: 'height_m', numeric_expression: ['height_m = 8.0 m @(C)'], application: { zones: [], building_types: ['semi_detached_house'], lot_conditions: [], uses: [] } });
    expect(E.applies(excLot('RD', 'semi_detached_houseplex'), semi, CX).ok).toBe(false);
    expect(E.applies(excLot('RS', 'semi_detached_houseplex'), semi, CX).ok).toBe(true);
  });
});

describe('the R default FSI (review of the round-2 knock-on, 2026-10-19)', () => {
  it('10.10.40.40(1)(B) says "if the zone label does not include a "d" value … the permitted maximum floor space index is 0.6": an R house with no d answers 0.6 from (B)', () => {
    const l = lot('R', 'detached_house'); l.label = { f: 12 };
    const r = eff(l, 'fsi');
    expect([r.status, r.value, r.winner]).toEqual(['value', 0.6, '10.10.40.40(1)#(1)(B)']);
    expect(unitOf('10.10.40.40(1)#(1)(B)').condition).toEqual({ tokens: ['label_value'], if: 'not labelled(d)' });
  });
});

// Spec 78 P5.15 INV-18 / INV-19 as named locks (scenario plan R-13, operator APPROVED 2026-10-20: "Add INV-18 /
// INV-19 as named describe titles in the existing lock file"). Red evidence: the same assertions over the tree at
// 7a782801^ (before the evaluator-fix lane) fail — 100 non-residential applied cells, 50 label_value_absent:u, 50
// main-wall no_candidate; and at a0d5b41e^ 10.5.80.1(2)(A) decides every garden-suite separation.
const NONRES_CHAPTERS = new Set(Object.entries<Json>(I.vocab.zone_category_chapter).filter(([k, v]) => k !== '$comment' && Array.isArray(v.zones) && !v.zones.length).map(([k]) => k));
const PRINCIPAL = ['detached_house', 'semi_detached_house', 'detached_houseplex'];
const SUITES = ['garden_suite', 'laneway_suite'];
const P53 = ['fsi', 'height_m', 'height_storeys', 'main_wall_height_m', 'lot_coverage_pct', 'building_length_m', 'building_depth_m', 'front_setback_m', 'rear_setback_m', 'side_setback_m', 'separation_m', 'dwelling_units_max'];
const SUITE_TARGETS = ['separation_m', 'height_m', 'height_storeys', 'gfa_m2', 'building_length_m', 'building_width_m', 'front_setback_m', 'rear_setback_m', 'side_setback_m', 'ancillary_coverage_pct'];

describe('INV-18 — no applied unit comes from a non-residential chapter (M-217) and no excluded-use unit enters a suite target (M-225)', () => {
  it('M-217: on R / RD / RS / RT / RM, for every class, roof form and P5.3 target, every applied unit is from a residential or citywide chapter', () => {
    expect([...NONRES_CHAPTERS].sort()).toEqual(['100', '15', '30', '40', '50', '60', '80', '90']);
    for (const zone of ZONES) for (const bt of [...PRINCIPAL, ...SUITES]) for (const flat of [false, true]) for (const t of P53) {
      const ids = touched(eff(lot(zone, bt, { flags: { flat_or_shallow_roof: flat } }), t));
      expect([zone, bt, flat, t, ids.filter((id) => NONRES_CHAPTERS.has(id.split('.')[0] ?? ''))]).toEqual([zone, bt, flat, t, []]);
    }
  });
  it('M-217 / M-159: no place-of-worship unit (Section 150.50) decides a house or suite target — the interior floor area leak 150.50.20.1(1)', () => {
    for (const zone of ZONES) for (const bt of [...PRINCIPAL, ...SUITES]) for (const flags of [{}, { has_secondary_suite: true }]) {
      for (const t of ['interior_floor_area_m2', 'height_m', 'height_projection_m', 'front_soft_landscaping_pct', 'landscaping_strip_width_m', 'driveway_width_m']) {
        expect([zone, bt, t, touched(eff(lot(zone, bt, { flags }), t)).filter((id) => id.startsWith('150.50.'))]).toEqual([zone, bt, t, []]);
      }
    }
    for (const id of ['150.50.20.1(1)#(1)(B)', '150.50.20.1(1)#(1)(C)']) expect([id, unitOf(id).application.building_types]).toEqual([id, ['non_residential_building']]);
  });
  it('M-225: no parking-scoped unit, and never 10.5.80.1(2), decides a garden- or laneway-suite target', () => {
    const parking = new Set(resolved.filter((u) => (u.application?.uses ?? []).some((x: unknown) => x === 'parking_space')).map((u) => u.unit_id));
    for (const zone of ZONES) for (const bt of SUITES) for (const vars of [{}, { proposed_height_m: 6.3, distance_to_residential_m: 7.5 }]) for (const t of SUITE_TARGETS) {
      const ids = touched(eff(lot(zone, bt, { vars }), t));
      expect([zone, bt, t, ids.filter((id) => parking.has(id) || id.startsWith('10.5.80.1(2)'))]).toEqual([zone, bt, t, []]);
    }
  });
});

describe('INV-19 — no not_evaluated where the zone regulates the main wall (M-218) or the label has no u (M-220)', () => {
  it('M-218: a pitched-roof house in R / RD / RS / RM reads its x.40.10 main-wall limit, never not_evaluated:no_candidate', () => {
    for (const zone of ['R', 'RD', 'RS', 'RM']) for (const bt of ['detached_house', 'semi_detached_house']) {
      const r = eff(lot(zone, bt), 'main_wall_height_m');
      const z = { R: '10', RD: '20', RS: '40', RM: '80' }[zone];
      expect([zone, bt, r.status, String(r.winner).startsWith(`10.${z}.40.10(`)]).toEqual([zone, bt, 'value', true]);
    }
  });
  it('M-220: a lot whose label has no u is never label_value_absent:u — dwelling_units_max is unregulated', () => {
    for (const zone of ZONES) for (const bt of PRINCIPAL) {
      const r = eff(lot(zone, bt), 'dwelling_units_max');
      expect([zone, bt, r.reason ?? null, r.value]).toEqual([zone, bt, null, 'unregulated']);
    }
  });
});

describe('INV-19 open arm — where the article does not exist the answer is never not_evaluated:no_candidate (M-220 "Also"; M-237, M-240; a ratchet at 0)', () => {
  it('no open cell is left (was: R coverage and length; RD semi depth; RT length and depth; RM houseplex length, depth and main wall)', () => {
    const open: string[] = [];
    for (const zone of ZONES) for (const bt of PRINCIPAL) for (const t of ['lot_coverage_pct', 'building_length_m', 'building_depth_m', 'main_wall_height_m']) {
      const r = eff(lot(zone, bt), t);
      if (r.status === 'not_evaluated' && r.reason === 'no_candidate') open.push(`${zone} ${bt} ${t}`);
    }
    // R-7a-v2 / M-240 (bylaw fix lane 3, 2026-10-20; operator approved, 2026-10-20-bylaw-fix-rulings#R-7a-v2): the last 16
    // cells close — R coverage by ABS-1, ABS-3 R length, ABS-4 / ABS-5 RT length and depth, ABS-6 RD semi depth, ABS-7.1…7.3
    // RM houseplex not_applicable. The ratchet is at 0.
    expect(open).toEqual([]);
  });
});

// M-159 (a unit governs only its own subject), golden-lot verification 2026-10-20 (coordinator: "a plain ancillary_building
// on an R lot picks up the one-storey garden-suite gfa cap of 60 m² from 150.7.60.50(4)(B)"). Red at 3d64c9f8: 60 m2 from
// 150.7.60.50(4)(B), and the separation / length / width suite limits on a plain ancillary building.
describe('M-159 / M-177(1) — a plain ancillary building (no suite) takes no garden- or laneway-suite limit', () => {
  it('no 150.7 / 150.8 unit governing "an ancillary building containing a … suite" decides an ancillary_building target', () => {
    for (const zone of ZONES) for (const t of ['gfa_m2', 'separation_m', 'building_length_m', 'building_width_m', 'side_setback_m', 'rear_setback_m', 'height_projection_m', 'encroachment_m']) {
      const r = eff(lot(zone, 'ancillary_building', { vars: { height_storeys: 1 } }), t);
      expect([zone, t, touched(r).filter((id) => /^150\.(7|8)\.60\.(2|3|5|6)/.test(id))]).toEqual([zone, t, []]);
    }
  });
  it('the suite still takes its own caps: a one-storey garden suite 60 m2, a laneway suite 10.0 m long', () => {
    const g = eff(lot('R', 'garden_suite', { flags: { suite_one_storey: true } }), 'gfa_m2'); // M-284: the one-storey arm is the design token
    expect([g.value, g.winner]).toEqual([60, '150.7.60.50(4)#(4)(B)']);
    const l = eff(lot('R', 'laneway_suite', { flags: { abuts_lane: true } }), 'building_length_m');
    expect([l.value, l.winner]).toEqual([10, '150.8.60.30(5)#whole']);
  });
});

// M-230 (operator 2026-10-20, chat decision CHAT-5, E2E-F-05): RS 10.40.40.20(4) says "Despite regulation 10.20.40.20(1)"
// (an RD regulation) inside the RS section; it is read as RS's own 10.40.40.20(1), so a townhouse on a major street
// takes 19.0 m, and the mis-citation is disclosed. Red at a59710ba: 17.0 m from 10.40.40.20(1).
describe('M-230 — RS 10.40.40.20(4) "Despite regulation 10.20.40.20(1)" is read as 10.40.40.20(1) (CHAT-5)', () => {
  it('the declared citation correction makes (4)(A)/(B) displace RS 10.40.40.20(1), not RD 10.20.40.20(1)', () => {
    for (const id of ['10.40.40.20(4)#(4)(A)', '10.40.40.20(4)#(4)(B)']) {
      const u = units.find((x) => x.unit_id === id) as Json;
      expect([id, u.displaces]).toEqual([id, ['10.40.40.20(1)']]);
    }
    expect(I.vocab.citation_corrections['10.40.40.20(4)']).toMatchObject({ '10.20.40.20(1)': '10.40.40.20(1)' });
  });
  it('an RS townhouse on a major street answers 19.0 m from (4)(A), with the mis-citation disclosed', () => {
    const r = eff(lot('RS', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([r.value, r.winner]).toEqual([19, '10.40.40.20(4)#(4)(A)']);
    expect(unitOf('10.40.40.20(4)#(4)(A)').disclosure).toMatch(/10\.20\.40\.20\(1\)/);
  });
  it('off a major street the RS 17.0 m length stands', () => {
    const r = eff(lot('RS', 'townhouse', { flags: { major_street: false } }), 'building_length_m'); // major_street is data-filled (M-169(3))
    expect([r.value, r.winner]).toEqual([17, '10.40.40.20(1)#whole']);
  });
});
