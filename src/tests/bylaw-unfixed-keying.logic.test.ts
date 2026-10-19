// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-149, M-158, M-175, M-176(1)/(2), M-179(1), M-185, M-187 (Q4, Q12;
//            triage F10 / F22), M-190, M-191, M-211(4), M-214(1); docs/specs/01-pipeline/78_optimal_lot_configuration.md
//            P5.12 (townhouse_driveway_width, major_street_forms_not_modelled, existing_ancillary_setbacks, dormers_at_max),
//            P5.15(B) (named locks); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-53
//
// Unfixed lane (2026-10-19): the review-page queue-4 rows owned by the keying lane and the evaluator fix lane, each
// fixed once by provision family across the parallel residential chapters. Every assertion reads the production path
// (validate.mjs inputs → agree.mjs resolved units with the M-75 corrections → withGeneratedFields + xref displacesOf →
// evaluate.mjs loadCandidates / effective over evaluatorVocab()), as bylaw-evaluator-fixes.logic.test.ts does.
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
const unitRow = (id: string): Json => {
  const u = units.find((x) => x.unit_id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const touched = (r: Json): string[] => [r.winner, ...(r.applied ?? [])].filter((x: unknown): x is string => typeof x === 'string');
// M-176(1): no individual private driveway is the build-more default; the 6.0 m arm is the trade-off
const NO_DRIVEWAY = { no_individual_private_driveway: true, individual_private_driveway: false };
const DRIVEWAY = { no_individual_private_driveway: false, individual_private_driveway: true };
const P512 = {
  townhouse_driveway_width: 'Townhouse unit width is 5.0 m per unit without an individual private driveway, 6.0 m with one.',
  major_street_forms_not_modelled: 'On a major street an apartment building (up to 60 units) or a townhouse may be permitted with larger limits; not modelled here.',
  existing_ancillary_setbacks: 'If the existing ancillary building is lawfully existing, a laneway suite in it may keep its setbacks.',
};

describe('G-AGREE holds with every correction of the unfixed lane (no orphan)', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('M-187 Q12 / triage F22 — separation between buildings on the same lot is a disclosed scope, never bound (M-149)', () => {
  const SEP = ['10.10.40.80(2)#(2)(A)', '10.10.40.80(2)#(2)(B)', '10.20.40.80(2)#(2)(A)', '10.20.40.80(2)#(2)(B)', '10.40.40.80(2)#(2)(A)', '10.40.40.80(2)#(2)(B)',
    '10.60.40.80(2)#(2)(A)', '10.60.40.80(2)#(2)(B)', '10.60.40.80(2)#(2)(C)', '10.80.40.80(2)#(2)(A)', '10.80.40.80(2)#(2)(B)'];
  it('the 11 x.40.80(2) units are UNUSUAL with no target, their limit literal recorded and a closed "If the lot …" disclosure', () => {
    for (const id of SEP) {
      const u = unitOf(id);
      expect([id, u.archetype, u.target, u.numeric_expression, u.calculation_handling.status]).toEqual([id, 'UNUSUAL', 'none', 'none', 'not_modelled']);
      expect([id, u.literals_not_expressed.some((l: Json) => l.reason === 'limit_not_modelled' && /metres$/.test(l.literal))]).toEqual([id, true]);
      expect([id, /^If the lot /.test(u.disclosure)]).toEqual([id, true]);
    }
  });
  for (const zone of ['RT', 'RM']) {
    it(`${zone}: a one-building lot takes no separation_m from x.40.80(2) (was 11.0 m from (2)(B))`, () => {
      const r = eff(lot(zone, 'detached_house'), 'separation_m');
      expect(touched(r).filter((id) => /\.40\.80\(2\)/.test(id))).toEqual([]);
    });
  }
  it('R / RS: a townhouse on a major street takes no separation_m from x.40.80(2)', () => {
    for (const zone of ['R', 'RS']) {
      const r = eff(lot(zone, 'townhouse', { flags: { major_street: true } }), 'separation_m');
      expect([zone, touched(r).filter((id) => /\.40\.80\(2\)/.test(id))]).toEqual([zone, []]);
    }
  });
});

describe('M-187 Q4 / triage F10 — townhouse unit width is 5.0 m under the no-driveway default, 6.0 m disclosed (M-176(1))', () => {
  const W: [string, string, Json][] = [['R', '10.10.40.1(4)#(4)(A)', {}], ['RD', '10.20.40.1(4)#(4)(A)', {}], ['RS', '10.40.40.1(4)#(4)(A)', { major_street: true }],
    ['RT', '10.60.40.1(3)#(3)(A)', {}], ['RM', '10.80.40.1(3)#(3)(A)', {}]];
  for (const [zone, id, more] of W) {
    it(`${zone}: ${id} is keyed on no_individual_private_driveway and carries the P5.12 townhouse_driveway_width sentence`, () => {
      const u = unitOf(id);
      expect(u.condition.tokens).toContain('no_individual_private_driveway');
      expect(u.application.lot_conditions).toContain('no_individual_private_driveway');
      expect(u.application.lot_conditions).not.toContain('individual_private_driveway');
      expect(u.disclosure).toBe(P512.townhouse_driveway_width);
    });
    it(`${zone}: no driveway answers 5.0 m from (A); a driveway answers 6.0 m and (A) is set aside`, () => {
      const a = eff(lot(zone, 'townhouse', { flags: { ...NO_DRIVEWAY, ...more } }), 'dwelling_unit_width_m');
      expect([a.status, a.value, a.winner]).toEqual(['value', 5, id]);
      const b = eff(lot(zone, 'townhouse', { flags: { ...DRIVEWAY, ...more } }), 'dwelling_unit_width_m');
      expect([b.status, b.value, touched(b).includes(id)]).toEqual(['value', 6, false]);
    });
  }
});

describe('M-190 / M-214(1) — x.40.10(2)(C) disapplies the main-wall cap for major-street forms, which are disclosed as not modelled', () => {
  for (const id of ['10.10.40.10(2)#(2)(C)', '10.20.40.10(2)#(2)(C)', '10.40.40.10(2)#(2)(C)', '10.80.40.10(2)#(2)(C)']) {
    it(`${id} stays a DISAPPLY and carries major_street_forms_not_modelled`, () => {
      const u = unitOf(id);
      expect([u.archetype, u.disclosure]).toEqual(['DISAPPLY', P512.major_street_forms_not_modelled]);
    });
  }
  it('RS: a townhouse on a major street has no main-wall cap (not_applicable by (C))', () => {
    const r = eff(lot('RS', 'townhouse', { flags: { major_street: true } }), 'main_wall_height_m');
    expect([r.status, r.reason]).toEqual(['not_applicable', 'not_applicable:10.40.40.10(2)#(2)(C)']);
  });
});

describe('M-176(2) / M-190 — the eight x.40.10(2)(A)/(B) main-wall units are an envelope limit, subject per zone', () => {
  const MW = ['10.10.40.10(2)#(2)(A)', '10.10.40.10(2)#(2)(B)', '10.20.40.10(2)#(2)(A)', '10.20.40.10(2)#(2)(B)', '10.40.40.10(2)#(2)(A)', '10.40.40.10(2)#(2)(B)', '10.80.40.10(2)#(2)(A)', '10.80.40.10(2)#(2)(B)'];
  it('handling is partially_modelled (the pair is a Layer 3 design choice), never the M-173(3) disclosure-only not_modelled', () => {
    for (const id of MW) {
      const ch = unitOf(id).calculation_handling;
      expect([id, ch.status, ch.user_inputs, /M-176\(2\)/.test(ch.gaps)]).toEqual([id, 'partially_modelled', [], true]);
    }
  });
  it('RM: a detached house answers 7.5 m from 10.80.40.10(2); a detached houseplex has no RM main-wall cap (M-190)', () => {
    const d = eff(lot('RM', 'detached_house'), 'main_wall_height_m');
    expect([d.status, d.value]).toEqual(['value', 7.5]);
    expect(d.winner).toMatch(/^10\.80\.40\.10\(2\)#/);
    const h = eff(lot('RM', 'detached_houseplex'), 'main_wall_height_m');
    expect(touched(h).filter((id) => id.startsWith('10.80.40.10(2)'))).toEqual([]);
  });
});

describe('M-179(1) / M-191 — garden-suite coverage: (A)/(B) one max statement, (B)\'s 20 % on ancillary_coverage_pct', () => {
  it('150.7.60.70(1)(A) is one statement: max(45 % @(1)(A); overlay @(1)(B)(i)) where mapped, else none, never a min-combine with (B)', () => {
    const u = unitOf('150.7.60.70(1)#(1)(A)');
    expect([u.target, u.numeric_expression]).toEqual(['lot_coverage_pct', ['lot_coverage_pct = if(mapped(LC); max(45 pct @(1)(A); overlay(LC) @(1)(B)(i)); unregulated) @(1)']]);
  });
  it('150.7.60.70(1)(B) bounds the ancillary buildings together at 20 %, on its own target (as the laneway twin 150.8.60.70(1)(B) at 30 %)', () => {
    const u = unitOf('150.7.60.70(1)#(1)(B)');
    expect([u.target, u.numeric_expression]).toEqual(['ancillary_coverage_pct', ['ancillary_coverage_pct = 20 pct @(1)(B)']]);
    expect(unitOf('150.8.60.70(1)#(1)(B)').target).toBe('ancillary_coverage_pct');
  });
  it('no garden-suite unit keys two statements on lot_coverage_pct any more', () => {
    for (const id of ['150.7.60.70(1)#(1)(A)', '150.7.60.70(1)#(1)(B)']) {
      const lc = (unitOf(id).numeric_expression as string[]).filter((s) => s.startsWith('lot_coverage_pct'));
      expect([id, lc.length <= 1]).toEqual([id, true]);
    }
  });
});

describe('M-185 — dormers are taken at the 40 % share (element_width_pct re-keyed partially_modelled)', () => {
  for (const id of ['10.10.40.10(5)#(5)(B)', '10.20.40.10(7)#(7)(B)', '10.40.40.10(5)#(5)(B)', '10.80.40.10(5)#(5)(B)']) {
    it(`${id}: 40 % kept as data, partially_modelled with no user input, the closed design-choice sentence on the unit`, () => {
      const u = unitOf(id);
      expect([u.archetype, u.numeric_expression[0].replace(/ @.*$/, '')]).toEqual(['DEFINE', 'element_width_pct = 40 pct']);
      expect([u.calculation_handling.status, u.calculation_handling.user_inputs, /M-185/.test(u.calculation_handling.gaps)]).toEqual(['partially_modelled', [], true]);
      expect(u.disclosure).toBe(I.vocab.design_choice_disclosure.unit_sentences[id]);
    });
  }
});

describe('M-175 — a solar energy device on a garden suite never limits the principal building (150.7.75.1(1))', () => {
  for (const id of ['150.7.75.1(1)#(1)(A)', '150.7.75.1(1)#(1)(B)']) {
    it(`${id}: applies() sets it aside as an energy_device on a garden-suite lot, and never binds a house lot`, () => {
      const g = E.applies(lot('RD', 'garden_suite'), unitRow(id), C);
      expect([g.ok, g.why]).toEqual([false, 'use energy_device (an accessory structure, not the principal building)']);
      expect(E.applies(lot('RD', 'detached_house'), unitRow(id), C).ok).toBe(false);
    });
  }
  it('150.7.75.1(1): no height or setback answer of a house or a garden-suite lot is touched by the solar-device unit', () => {
    for (const bt of ['detached_house', 'garden_suite']) for (const t of ['height_m', 'height_projection_m', 'side_setback_m', 'rear_setback_m']) {
      expect([bt, t, touched(eff(lot('RD', bt), t)).filter((id) => id.startsWith('150.7.75.1'))]).toEqual([bt, t, []]);
    }
  });
});

describe('M-211(4) / M-158(1) — 150.8.60.21(1): the new build is answered; the lawfully existing setback is the disclosed caveat', () => {
  for (const id of ['150.8.60.21(1)#(1)(A)', '150.8.60.21(1)#(1)(B)']) {
    it(`${id}: set aside on a new-build lot (lawfully_existing false) and carries the P5.12 existing_ancillary_setbacks sentence`, () => {
      const r = E.applies(lot('RD', 'laneway_suite'), unitRow(id), C);
      expect([r.ok, r.why]).toEqual([false, 'condition lawfully_existing']);
      expect(unitOf(id).disclosure).toBe(P512.existing_ancillary_setbacks);
      expect(unitOf(id).calculation_handling.gaps).toMatch(/M-158\(1\)/);
    });
  }
});

describe('M-174(4) amended (operator y 2026-10-19, Q-label-defs) — the zone-label letters f and a are label definitions', () => {
  for (const id of ['10.5.1.10(3)#(3)(A)', '10.5.1.10(3)#(3)(B)']) {
    it(`${id} is a DEFINE with no target and no statement, the same form as (D) and (E)`, () => {
      const u = unitOf(id);
      expect([u.archetype, u.target, u.numeric_expression]).toEqual(['DEFINE', 'none', 'none']);
    });
  }
  // ordinary lots keep their answer: the zone's own x.30.20(1)(A) / x.30.10(1)(A) reads the same label value
  const LABELS = [{ f: 12, a: 370 }, { f: 15, a: 460 }, { f: 7.5, a: 230 }];
  for (const zone of ['R', 'RD', 'RS', 'RT', 'RM']) {
    it(`${zone}: plain lots (detached house, detached houseplex) answer the label's f and a from the zone's own rule (RT houseplex: its own 6.0 m)`, () => {
      const z = { R: '10', RD: '20', RS: '40', RT: '60', RM: '80' }[zone];
      for (const label of LABELS) for (const bt of ['detached_house', 'detached_houseplex']) {
        const l = lot(zone, bt, { flags: { major_street: false }, vars: { dwelling_units: 1 } }); l.label = { ...l.label, ...label };
        const f = eff(l, 'required_lot_frontage_m');
        const a = eff(l, 'required_lot_area_m2');
        // RT 10.60.30.20(1)(E) (648-2025): "despite (A) … the required minimum lot frontage is 6.0 metres for a lot with a detached houseplex" — unmasked, by law
        const rtHp = zone === 'RT' && bt === 'detached_houseplex';
        expect([zone, bt, label.f, f.status, f.value, f.winner]).toEqual([zone, bt, label.f, 'value', rtHp ? 6 : label.f, rtHp ? '10.60.30.20(1)#(1)(E)' : `10.${z}.30.20(1)#(1)(A)`]);
        expect([zone, bt, label.a, a.status, a.value, a.winner]).toEqual([zone, bt, label.a, 'value', label.a, `10.${z}.30.10(1)#(1)(A)`]);
      }
    });
  }
});

describe('M-159 — the place-of-worship rules govern a place of worship only (exposed on plain R lots by Q-label-defs)', () => {
  for (const id of ['10.10.20.100(8)#(8)(B)', '10.20.20.100(8)#(8)(B)', '10.20.20.100(8)#(8)(C)', '10.60.20.100(8)#(8)(B)', '10.60.20.100(8)#(8)(C)']) {
    it(`${id} is keyed to the non-residential building, never a house lot`, () => {
      expect(unitOf(id).application.building_types).toEqual(['non_residential_building']);
      expect(E.applies(lot('R', 'detached_house', { zone: { '10': 'R', '20': 'RD', '60': 'RT' }[id.slice(3, 5)], flags: { major_street: true } }), unitRow(id), C).ok).toBe(false);
    });
  }
  it('RD / RT: a plain lot\'s gfa_m2 is never capped by the place-of-worship 2,000 / 2,500 m² rule', () => {
    for (const zone of ['RD', 'RT']) expect([zone, touched(eff(lot(zone, 'detached_house', { flags: { major_street: false } }), 'gfa_m2')).filter((x) => x.includes('.20.100(8)'))]).toEqual([zone, []]);
  });
});

describe('M-187 Q4 / triage F06 — townhouse frontage on a major street is 5.0 m per unit (6.0 m less 1.0 m), 6.0 m disclosed', () => {
  for (const [zone, id] of [['RD', '10.20.30.20(1)#(1)(C)'], ['RS', '10.40.30.20(1)#(1)(D)'], ['RM', '10.80.30.20(1)#(1)(D)']] as [string, string][]) {
    it(`${zone}: ${id} is a LIMIT on required_lot_frontage_m under the no-driveway token`, () => {
      const u = unitOf(id);
      expect([u.archetype, u.target, u.bound, u.calculation_handling.status]).toEqual(['LIMIT', 'required_lot_frontage_m', 'min', 'partially_modelled']);
      expect(u.condition.tokens).toEqual(['major_street', 'all_units_front_street', 'no_individual_private_driveway']);
      expect(u.disclosure).toBe('If each dwelling unit has an individual private driveway leading to its front: 6.0 m of frontage per unit.');
    });
    it(`${zone}: a 4-unit townhouse on a major street, every unit fronting the street, no driveways: 20.0 m from ${id} (was 12 m from the f label)`, () => {
      const r = eff(lot(zone, 'townhouse', { flags: { ...NO_DRIVEWAY, major_street: true, all_units_front_street: true, unit_not_fronting_street: false }, vars: { dwelling_units: 4 } }), 'required_lot_frontage_m');
      expect([r.status, r.value, r.winner]).toEqual(['value', 20, id]);
    });
  }
});

describe('M-181(2) — the semi-detached houseplex takes 50 % of the lot area; a semi-detached house on two lots is disclosed', () => {
  for (const [zone, z] of [['RS', '40'], ['RT', '60'], ['RM', '80']] as [string, string][]) {
    it(`${zone}: a semi-detached houseplex needs 50 % of 'a' (185 m² of 370) from 10.${z}.30.10(1)(B); a semi-detached house is not bound by it`, () => {
      const l = (bt: string): Json => { const x = lot(zone, bt, { flags: { major_street: false } }); x.label = { ...x.label, a: 370 }; return x; };
      const hp = eff(l('semi_detached_houseplex'), 'required_lot_area_m2');
      expect([hp.status, hp.value, hp.winner]).toEqual(['value', 185, `10.${z}.30.10(1)#(1)(B)`]);
      expect(touched(eff(l('semi_detached_house'), 'required_lot_area_m2'))).not.toContain(`10.${z}.30.10(1)#(1)(B)`);
      expect(unitOf(`10.${z}.30.10(1)#(1)(B)`).application.building_types).toEqual(['semi_detached_houseplex']);
    });
  }
});

describe('G-EVAL evaluates with the evaluator\'s displacement links (operator y 2026-10-19; Spec 68 §9 G-EVAL, §6 generated displaces[], §7.5 rule 2)', () => {
  it('the G-EVAL gate keeps 10.20.40.20(3)(B) "Despite regulation 10.20.40.20(1)": V25:building_length_m stays needs_user_input:building_type (houseplex 19.0 m, other types 17.0 m)', async () => {
    const { ctx } = await V.runGates(I);
    const row = ctx.evalResult.rows.find((x: Json) => x.id === 'V25:building_length_m');
    expect([row.per_type.detached_houseplex, row.per_type.detached_house]).toEqual([19, 17]);
    expect(row.got).toBe('not_evaluated:needs_user_input:building_type');
    expect(ctx.evalResult.violations.filter((v: string) => v.includes('V25'))).toEqual([]);
  }, 300_000);
});

describe('Spec 68 §6 ruling 2026-10-19 — "N percent of the requirements cited in (X)" displaces (X) (text-grounded, as "despite"); M-181(3)', () => {
  const targetsOf = (id: string): string[] => XR.displacesOf(index, id, I.vocab, null).targets.map((t: Json) => t.id);
  for (const [zone, z] of [['RS', '40'], ['RM', '80']] as [string, string][]) {
    it(`${zone}: 10.${z}.30.20(1)(C) "50 percent of the requirements cited in (A) and (B) above" derives the link to (A) and (B)`, () => {
      expect(targetsOf(`10.${z}.30.20(1)#(1)(C)`)).toEqual([`10.${z}.30.20(1)#(1)(A)`, `10.${z}.30.20(1)#(1)(B)`]);
    });
    it(`${zone}: semi-detached houseplex frontage is 50 % from (C) — 6.0 m of f 12, 7.5 m with no f; a semi-detached house keeps the full value`, () => {
      const withF = eff(lot(zone, 'semi_detached_houseplex'), 'required_lot_frontage_m');
      expect([withF.status, withF.value, withF.winner]).toEqual(['value', 6, `10.${z}.30.20(1)#(1)(C)`]);
      const noF = lot(zone, 'semi_detached_houseplex'); noF.label = { d: 0.6 };
      const r = eff(noF, 'required_lot_frontage_m');
      expect([r.status, r.value, r.winner]).toEqual(['value', 7.5, `10.${z}.30.20(1)#(1)(C)`]);
      expect(eff(lot(zone, 'semi_detached_house'), 'required_lot_frontage_m').value).toBe(12);
      expect(unitOf(`10.${z}.30.20(1)#(1)(C)`).application.building_types).toEqual(['semi_detached_houseplex']);
      expect(unitOf(`10.${z}.30.20(1)#(1)(C)`).disclosure).toMatch(/^If the semi-detached house is divided onto two lots/);
    });
  }
  it('narrow: a soft-landscaping share ("75 percent of the front yard landscaping required in (A), (B), and (C)") is not a displacement', () => {
    expect(targetsOf('10.5.50.10(1)#(1)(D)')).toEqual([]);
  });
});
