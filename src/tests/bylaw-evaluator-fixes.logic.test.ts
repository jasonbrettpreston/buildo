// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (conditions), §7.5 (precedence rules 1, 2, 7), §7.6 (applies());
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-159 (a unit governs only its own subject), M-174(2)/(5),
//            M-182, M-197, M-198(5), M-202(3)/(4), M-205(3), M-209, M-215(2), M-216, M-217..M-222, M-224, M-225
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
  .map((u: Json) => ({ ...u, displaces: XR.displacesOf(index, u.unit_id, I.vocab, null).targets.map((t: Json) => t.id) }));
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
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
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
      expect(eff(l, 'main_wall_height_m').reason).toBe('condition_unknown:flat_or_shallow_roof');
    });
  }
  it('the six flat-roof units test flat_or_shallow_roof', () => {
    for (const id of ['10.10.40.10(11)#(11)(A)', '10.10.40.10(12)#(12)(A)', '10.20.40.10(4)#(4)(A)', '10.20.40.10(4)#(4)(B)', '10.40.40.10(6)#(6)(A)', '10.80.40.10(6)#(6)(A)']) {
      expect(unitOf(id).condition).toEqual({ tokens: ['flat_or_shallow_roof'] });
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
