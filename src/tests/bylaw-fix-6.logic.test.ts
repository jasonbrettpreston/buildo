// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-280..M-291 (chat page 4D, lane B: design inputs and keying);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-254, M-259, M-197, M-172, M-177; docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5;
//            decision log docs/reports/decisions/2026-10-21-page-4d-b.json (CHAT-38.F-4D-1, -3, -4, -5, -7, -11, -12, -15, -17, -19, -21)
//
// By-law fix lane 6 (wf1/bylaw-fix-6), fix round 4D lane B. Every assertion reads the production path: the real-lot assembly
// (scripts/analysis/bylaw-validation/assembly.mjs — agreed units with the M-75 corrections, generated fields, xref
// displacement links) and evaluate.mjs. Design inputs follow the M-259 `blank_side_wall` pattern: a lot-condition token that
// is a user input, a default in `design_choice_disclosure.default_overrides`, and a closed disclosure sentence.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => {
  const u = byId.get(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
const tokensOf = (c: unknown): string[] => (c && typeof c === 'object' && Array.isArray((c as Json).tokens) ? (c as Json).tokens : []);
const targetsOf = (u: Json): string[] => [].concat(u.target);

// a lot as Layer 3 would hand it over: site facts not holding (M-169); the design choices are set per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType, exception: null,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false,
    suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const dc = I.vocab.design_choice_disclosure;
// the M-259 design-input pattern, asserted once per new token
const designInput = (tok: string, input: string, taken: boolean): void => {
  expect(I.vocab.lot_condition[tok]?.user_input).toBe(input);
  expect(I.vocab.user_input).toContain(input);
  expect(typeof dc.lot_condition[tok]).toBe('string');
  expect(typeof dc.user_input[input]).toBe('string');
  expect(dc.default_overrides[tok]?.taken_as).toBe(taken);
  expect(String(dc.default_overrides[tok]?.why ?? '')).toMatch(/M-28\d/);
};

// F-4D-1 (platform half) / M-280 (amends M-254): the platform's own area, height and common-wall distance targets answer for the
// platform. The units were keyed on the targets already; with no element target they were set aside as "not part of this answer".
describe('F-4D-1 / M-280 — platform area, height and common-wall distance are platform element targets (M-254)', () => {
  it('the text carries the three limits (ch10_20.txt, ch10_40.txt, ch10_5.txt)', () => {
    expect(page('ch10_20')).toMatch(/maximum area of each platform is 4\.0 square metres/);
    expect(page('ch10_40')).toMatch(/at least 1\.8 metres from the common wall/i);
    expect(page('ch10_5')).toMatch(/no higher than 1\.2 metres above the ground/);
  });

  it('deck_or_platform.element_targets lists them beside the M-254 setbacks', () => {
    expect(I.vocab.accessory_structure_use.deck_or_platform.element_targets).toEqual(expect.arrayContaining(['platform_area_m2', 'platform_common_wall_distance_m', 'platform_height_m', 'platform_above_access_floor_m']));
  });

  it('platform_area_m2 is 4.0 m2 in RD, RS and RM (detached house) and for a semi-detached house in RS and RM', () => {
    for (const [zone = '', bt = '', id = ''] of [['RD', 'detached_house', '10.20.40.50(1)#(1)(B)'], ['RS', 'detached_house', '10.40.40.50(1)#(1)(B)'], ['RM', 'detached_house', '10.80.40.50(1)#(1)(B)'], ['RS', 'semi_detached_house', '10.40.40.50(2)#(2)(B)'], ['RM', 'semi_detached_house', '10.80.40.50(2)#(2)(B)']]) {
      const r = eff(lot(zone, bt), 'platform_area_m2');
      expect([zone, bt, r.status, r.value, r.winner]).toEqual([zone, bt, 'value', 4, id]);
    }
  });

  it('platform_common_wall_distance_m is 1.8 m for a semi-detached house in RS and RM', () => {
    for (const [zone = '', id = ''] of [['RS', '10.40.40.50(2)#(2)(C)'], ['RM', '10.80.40.50(2)#(2)(C)']]) {
      const r = eff(lot(zone, 'semi_detached_house'), 'platform_common_wall_distance_m');
      expect([zone, r.status, r.value, r.winner]).toEqual([zone, 'value', 1.8, id]);
    }
  });

  it('platform_height_m is 1.2 m in the Residential Zone category (10.5.40.50(4)(A)), on every residential zone', () => {
    for (const zone of ['R', 'RD', 'RS', 'RT', 'RM']) {
      const r = eff(lot(zone, 'detached_house'), 'platform_height_m');
      expect([zone, r.status, r.value, r.winner]).toEqual([zone, 'value', 1.2, '10.5.40.50(4)#(4)(A)']);
    }
  });

  it('the suite 0.2 m rules are heights above the access floor, not above grade, so they no longer answer platform_height_m (150.7.60.60(3)(A))', () => {
    expect(targetsOf(unitOf('150.7.60.60(3)#(3)(A)'))).toEqual(['platform_above_access_floor_m']);
    // 10.5.40 excludes suites (M-219), so a garden suite has no platform-height figure of its own; the laneway 4.0 m rule is scoped to the laneway suite (M-288)
    const g = eff(lot('RD', 'garden_suite'), 'platform_height_m');
    expect([g.status, g.reason]).toEqual(['not_evaluated', 'no_candidate']);
    expect(eff(lot('RD', 'laneway_suite'), 'platform_height_m')).toMatchObject({ status: 'value', value: 4, winner: '150.8.60.60(3)#(3)(B)' });
    expect(eff(lot('RD', 'garden_suite'), 'platform_above_access_floor_m')).toMatchObject({ status: 'value', value: 0.2 });
  });

  it('the principal-building targets are unchanged (M-159(2), M-175): a platform rule never limits the house', () => {
    expect(eff(lot('RD', 'detached_house'), 'side_setback_m')).toMatchObject({ status: 'value' });
    expect(eff(lot('RD', 'detached_house'), 'gfa_m2').winner ?? '').not.toMatch(/\.50\(1\)/);
  });
});

// F-4D-1 (heating-device half) / M-281: a ground-mounted heating or air-conditioning device has its own energy_device_* targets.
describe('F-4D-1 / M-281 — a ground-mounted heating or air-conditioning device has its own targets (energy_device_*)', () => {
  it('the text (ch10_5.txt 10.5.60.20(10)): front yard at least 6.0 m from the front lot line; side yard the lesser of 0.9 m or the building side yard', () => {
    const t = page('ch10_5');
    expect(t).toContain('the device may be located in a front yard, if it is at least 6.0 metres from the front lot line');
    expect(t).toContain('the device may be in a side yard, if it is no closer to the side lot line than the lesser of: (i) 0.9 metres; or (ii) the required minimum side yard setback for the residential building on the lot');
  });

  it('vocab declares energy_device_front_setback_m and energy_device_side_clearance_m (min) and lists them as the energy_device element targets', () => {
    for (const t of ['energy_device_front_setback_m', 'energy_device_side_clearance_m']) {
      expect(I.vocab.dsl_target[t]).toMatchObject({ unit: 'm', bound: 'min' });
    }
    expect(I.vocab.accessory_structure_use.energy_device.element_targets).toEqual(['energy_device_front_setback_m', 'energy_device_side_clearance_m']);
  });

  it('10.5.60.20(10)(A) and (B) are keyed on the device targets, not on the house front setback and encroachment clearance', () => {
    expect(targetsOf(unitOf('10.5.60.20(10)#(10)(A)'))).toEqual(['energy_device_front_setback_m']);
    expect(targetsOf(unitOf('10.5.60.20(10)#(10)(B)'))).toEqual(['energy_device_side_clearance_m']);
  });

  it('answers 6.0 m from the front lot line; the side clearance is the lesser of 0.9 m and the house side yard (0.45 m blank wall, 0.9 m with openings)', () => {
    expect(eff(lot('R', 'detached_house', { flags: { blank_side_wall: true } }), 'energy_device_front_setback_m')).toMatchObject({ status: 'value', value: 6, winner: '10.5.60.20(10)#(10)(A)' });
    expect(eff(lot('R', 'detached_house', { flags: { blank_side_wall: true } }), 'energy_device_side_clearance_m')).toMatchObject({ status: 'value', value: 0.45, winner: '10.5.60.20(10)#(10)(B)' });
    expect(eff(lot('R', 'detached_house', { flags: { blank_side_wall: false } }), 'energy_device_side_clearance_m')).toMatchObject({ status: 'value', value: 0.9 });
  });

  it('the device never limits the house: the house front setback keeps its own winner', () => {
    const r = eff(lot('R', 'detached_house', { flags: { blank_side_wall: true } }), 'front_setback_m');
    expect(r.winner).toBe('10.10.40.70(1)#whole');
  });
});

// F-4D-3 / M-282: the 2.0 / 5.5 / 11.0 m separation between facing main walls depends on the openings to dwelling units; two
// design tokens (taken as absent: the smallest separation, the other arms disclosed — M-197).
describe('F-4D-3 / M-282 — separation between main walls follows the openings (main_wall_openings, main_wall_openings_each)', () => {
  const FAMILY: Array<[string, string, Json, string, number, string]> = [
    ['R', 'townhouse', {}, '10.10.40.80(1)#', 2, 'A'],
    ['RD', 'townhouse', { major_street: true }, '10.20.40.80(1)#', 2, 'A'],
    ['RS', 'townhouse', { major_street: true }, '10.40.40.80(1)#', 2, 'A'],
    ['RT', 'townhouse', {}, '10.60.40.80(1)#', 5.5, 'A'],
    ['RM', 'apartment_building', {}, '10.80.40.80(1)#', 5.5, 'A'],
  ];

  it('the text has three arms in R, RD, RS (neither wall / one wall / each wall) and two in RT, RM (ch10_10.txt, ch10_60.txt)', () => {
    expect(page('ch10_10')).toContain('(A) 2.0 metres if there are no openings to dwelling units in those main walls; (B) 5.5 metres if there are no openings to dwelling units in one of those main walls; and (C) 11.0 metres if each main wall has an opening to a dwelling unit');
    expect(page('ch10_60')).toContain('(A) 5.5 metres if there are no openings to dwelling units in one or more of those main walls; and (B) 11.0 metres if each main wall has an opening to a dwelling unit');
  });

  it('vocab: both tokens are user-input design choices taken as absent (M-259 pattern)', () => {
    designInput('main_wall_openings', 'main_wall_openings', false);
    designInput('main_wall_openings_each', 'main_wall_openings_each', false);
  });

  it('the 5.5 m arm carries main_wall_openings and the 11.0 m arm main_wall_openings_each in R, RD, RS; RT and RM carry the 11.0 m arm token only', () => {
    for (const pre of ['10.10.40.80(1)#', '10.20.40.80(1)#', '10.40.40.80(1)#']) {
      expect([pre, tokensOf(unitOf(`${pre}(1)(A)`).condition).filter((t) => /^main_wall/.test(t))]).toEqual([pre, []]);
      expect([pre, tokensOf(unitOf(`${pre}(1)(B)`).condition).includes('main_wall_openings')]).toEqual([pre, true]);
      expect([pre, tokensOf(unitOf(`${pre}(1)(C)`).condition).includes('main_wall_openings_each')]).toEqual([pre, true]);
    }
    for (const pre of ['10.60.40.80(1)#', '10.80.40.80(1)#']) {
      expect([pre, tokensOf(unitOf(`${pre}(1)(A)`).condition).filter((t) => /^main_wall/.test(t))]).toEqual([pre, []]);
      expect([pre, tokensOf(unitOf(`${pre}(1)(B)`).condition).includes('main_wall_openings_each')]).toEqual([pre, true]);
    }
  });

  it('no openings (the default): 2.0 m in R, RD, RS; 5.5 m in RT, RM (the City figure on A0251/26TEY is 2.0 m)', () => {
    for (const [zone, bt, flags, pre, want] of FAMILY) {
      const r = eff(lot(zone, bt, { flags: { ...flags, main_wall_openings: false, main_wall_openings_each: false } }), 'separation_m');
      expect([zone, r.status, r.value, r.winner]).toEqual([zone, 'value', want, `${pre}(1)(A)`]);
    }
  });

  it('openings in one facing wall: 5.5 m; in each facing wall: 11.0 m (R, RD, RS)', () => {
    for (const [zone, bt, flags, pre] of FAMILY.slice(0, 3)) {
      const one = eff(lot(zone, bt, { flags: { ...flags, main_wall_openings: true, main_wall_openings_each: false } }), 'separation_m');
      expect([zone, one.value, one.winner]).toEqual([zone, 5.5, `${pre}(1)(B)`]);
      const each = eff(lot(zone, bt, { flags: { ...flags, main_wall_openings: true, main_wall_openings_each: true } }), 'separation_m');
      expect([zone, each.value, each.winner]).toEqual([zone, 11, `${pre}(1)(C)`]);
    }
    for (const [zone, bt, flags, pre] of FAMILY.slice(3)) {
      const each = eff(lot(zone, bt, { flags: { ...flags, main_wall_openings: true, main_wall_openings_each: true } }), 'separation_m');
      expect([zone, each.value, each.winner]).toEqual([zone, 11, `${pre}(1)(B)`]);
    }
  });

  it('with the design not given the answer asks for it (needs_user_input), never an assumed 11 m', () => {
    const r = eff(lot('R', 'townhouse'), 'separation_m');
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason)).toMatch(/^needs_user_input:main_wall_openings/);
  });
});

// F-4D-4 / M-283: an apartment building on a major street has side setbacks by wall portion — 1.8 m without primary windows,
// 5.5 m with; on a through lot 2.4 m and 5.5 m.
describe('F-4D-4 / M-283 — the apartment primary-windows arm is behind an input (primary_windows)', () => {
  it('the text names the two arms (ch10_10.txt 10.10.40.70(5)(D), (E))', () => {
    const t = page('ch10_10');
    expect(t).toContain('(i) 1.8 metres for all portions of the main wall that do not have primary windows; (ii) 5.5 metres for all portions of the main wall that have primary windows');
    expect(t).toContain('(i) 2.4 metres for all portions of the main wall with that do not have primary windows; (ii) 5.5 metres for all portions of the main wall that have primary windows');
  });

  it('vocab: primary_windows is a user-input design choice taken as absent (M-259 pattern)', () => {
    designInput('primary_windows', 'primary_windows', false);
  });

  it('(5)(D) and (5)(E) express both arms on the token: 1.8 / 5.5 m and 2.4 / 5.5 m', () => {
    const d = [].concat(unitOf('10.10.40.70(5)#(5)(D)').numeric_expression).join(' ');
    const e = [].concat(unitOf('10.10.40.70(5)#(5)(E)').numeric_expression).join(' ');
    expect(d).toMatch(/holds\(primary_windows\).*5\.5 m.*1\.8 m/);
    expect(e).toMatch(/holds\(primary_windows\).*5\.5 m.*2\.4 m/);
  });

  it('A0426/26TEY: without primary windows 1.8 m (default), with primary windows 5.5 m (the City figure); through lot 2.4 m / 5.5 m', () => {
    const apt = (flags: Json): Json => lot('R', 'apartment_building', { flags: { major_street: true, ...flags } });
    expect(eff(apt({ primary_windows: false }), 'side_setback_m')).toMatchObject({ status: 'value', value: 1.8, winner: '10.10.40.70(5)#(5)(D)' });
    expect(eff(apt({ primary_windows: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 5.5, winner: '10.10.40.70(5)#(5)(D)' });
    expect(eff(apt({ primary_windows: false, through_lot: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 2.4, winner: '10.10.40.70(5)#(5)(E)' });
    expect(eff(apt({ primary_windows: true, through_lot: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 5.5, winner: '10.10.40.70(5)#(5)(E)' });
  });

  it('with the design not given the answer asks for it (needs_user_input)', () => {
    const r = eff(lot('R', 'apartment_building', { flags: { major_street: true } }), 'side_setback_m');
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'needs_user_input:primary_windows']);
  });
});

// F-4D-5 / M-284: the garden suite floor-area cap is 60 m2 when the suite is one storey, 120 m2 otherwise.
describe('F-4D-5 / M-284 — the garden suite one-storey 60 m2 arm is chosen by an input (suite_one_storey)', () => {
  it('the text (ch150_7.txt 150.7.60.50(4))', () => {
    expect(page('ch150_7')).toContain('(B) despite (A) above, the maximum gross floor area for an ancillary building containing a garden suite that is one storey is 60 square metres');
  });

  it('vocab: suite_one_storey is a user-input design choice taken as false — two storeys, the larger 120 m2 (M-177(2)); the one-storey arm is disclosed', () => {
    designInput('suite_one_storey', 'suite_one_storey', false);
  });

  it('(4)(B) is conditioned on the token, not on the resolved storey cap', () => {
    const u = unitOf('150.7.60.50(4)#(4)(B)');
    expect(tokensOf(u.condition)).toEqual(['suite_one_storey']);
    expect(u.condition.if).toBeUndefined();
    expect(u.application.lot_conditions).toContain('suite_one_storey');
  });

  it('A0079/26SC: one storey 60 m2 (the City figure), otherwise 120 m2', () => {
    expect(eff(lot('RD', 'garden_suite', { flags: { suite_one_storey: false } }), 'gfa_m2')).toMatchObject({ status: 'value', value: 120, winner: '150.7.60.50(4)#(4)(A)' });
    expect(eff(lot('RD', 'garden_suite', { flags: { suite_one_storey: true } }), 'gfa_m2')).toMatchObject({ status: 'value', value: 60, winner: '150.7.60.50(4)#(4)(B)' });
  });
});

// F-4D-7 / M-285: "a front lot line that abuts Huntingwood Dr." — the parcel's primary frontage street name (Spec 62 L1,
// parcels.primary_frontage_street_name) joined to the street the exception names.
describe('F-4D-7 / M-285 — abuts_named_street is joined from the parcel street name to the street the exception names', () => {
  const rd323 = (name: string | undefined, flags: Json = {}): Json => lot('RD', 'detached_house', { exception: '900.3.10(323)', flags, ...(name === undefined ? {} : { primary_frontage_street_name: name }) });

  it('the exception text (ch900_3.txt RD 323 (C))', () => {
    expect(page('ch900_3')).toContain('The minimum building setback from a front lot line that abuts Huntingwood Dr. is 7.5 metres');
  });

  it('vocab.named_street is a table unit -> streets (+ line) that covers every unit carrying abuts_named_street, or lists it as unnamed', () => {
    const t = I.vocab.named_street;
    expect(t.units['900.3.10(323)#(323)[SSP](C)']).toMatchObject({ streets: ['Huntingwood Dr.'], line: 'front' });
    const carrying = units.filter((u: Json) => tokensOf(u.condition).includes('abuts_named_street')).map((u: Json) => u.unit_id).sort();
    const covered = [...Object.keys(t.units), ...t.unnamed].sort();
    expect(covered).toEqual(carrying);
    expect(Object.keys(t.units).filter((k) => t.unnamed.includes(k))).toEqual([]);
  });

  it('a parcel on Huntingwood Dr. takes the 7.5 m front setback; a parcel on Ravencliff Cres. does not (A0096/26SC)', () => {
    expect(eff(rd323('Huntingwood Dr'), 'front_setback_m')).toMatchObject({ status: 'value', value: 7.5, winner: '900.3.10(323)#(323)[SSP](C)' });
    const other = eff(rd323('Ravencliff Cres'), 'front_setback_m');
    expect([other.status, other.value, other.winner]).toEqual(['value', 6, '10.20.40.70(1)#whole']);
  });

  it('street names compare whole-word and without case, punctuation or suffix spelling (Huntingwood Drive = HUNTINGWOOD DR.)', () => {
    for (const n of ['HUNTINGWOOD DR.', 'Huntingwood Drive', ' huntingwood  dr ']) expect([n, eff(rd323(n), 'front_setback_m').value]).toEqual([n, 7.5]);
    expect(eff(rd323('Huntingwood Crescent'), 'front_setback_m').value).toBe(6);
  });

  it('with no street name the flag decides exactly as before; with neither the answer asks for it', () => {
    expect(eff(rd323(undefined, { abuts_named_street: true }), 'front_setback_m').value).toBe(7.5);
    expect(eff(rd323(undefined, { abuts_named_street: false }), 'front_setback_m').value).toBe(6);
    expect(eff(rd323(undefined), 'front_setback_m').reason).toBe('condition_unknown:abuts_named_street');
  });

  it('a clause that does not say "front lot line" cannot be refuted by the front street: a different frontage stays undecided (never false)', () => {
    const t = I.vocab.named_street;
    const anyLine = (Object.values(t.units) as Json[]).find((v) => v.line === 'any');
    expect(anyLine).toBeTruthy();
  });
});

// F-4D-11 / M-286 (operator amended): suite separation and height use the distance to the max-build envelope (new build) or the
// isolated suite; a laneway suite with an EXISTING house carries a disclosure; no user-input field for distance.
describe('F-4D-11 / M-286 — suite separation and height: derived distance, laneway-with-existing-house disclosure, no distance input', () => {
  const SENTENCE_KEY = 'laneway_suite_with_existing_house';

  it('distance_to_residential_m and proposed_height_m are derived scenario values, never user inputs', () => {
    expect(I.vocab.user_input).not.toContain('distance_to_residential_m');
    expect(I.vocab.user_input).not.toContain('proposed_height_m');
    const s = I.vocab.suite_scenario;
    expect(s.distance_to_residential_m.basis).toBe('max_build_envelope');
    expect(s.distance_to_residential_m.user_input).toBe(false);
    expect(typeof s.distance_to_residential_m.isolated_suite).toBe('string');
  });

  it('the existing-house disclosure is one closed sentence in vocab, carried by the four laneway separation and height units', () => {
    const sentence = I.vocab.suite_scenario[SENTENCE_KEY];
    expect(typeof sentence).toBe('string');
    expect(sentence).toMatch(/existing house/);
    for (const id of ['150.8.60.30(1)#(1)(A)', '150.8.60.30(1)#(1)(B)', '150.8.60.40(1)#(1)(A)', '150.8.60.40(1)#(1)(B)']) expect([id, String(unitOf(id).disclosure)]).toEqual([id, expect.stringContaining(sentence)]);
  });

  it('the garden suite units do not carry it (the operator named the laneway suite with an existing house)', () => {
    for (const id of ['150.7.60.30(1)#(1)(A)', '150.7.60.40(1)#(1)(B)']) expect(String(unitOf(id).disclosure)).not.toContain(I.vocab.suite_scenario[SENTENCE_KEY]);
  });

  it('with the two derived values supplied the rows answer: 6.3 m at 8.0 m from the new build, 7.5 m separation (A0174/26NY, A0486/26TEY)', () => {
    const far = lot('RD', 'laneway_suite', { vars: { proposed_height_m: 6.3, distance_to_residential_m: 8 } });
    expect(eff(far, 'height_m')).toMatchObject({ status: 'value', value: 6.3 });
    expect(eff(far, 'separation_m')).toMatchObject({ status: 'value', value: 7.5 });
  });
});

// F-4D-12 / M-287 (operator: reading B): R-zone ancillary coverage stays 5 percent (10.10.60.70(1)); the City's 10 percent on A0180/26TEY
// is an explained difference.
describe('F-4D-12 / M-287 — R-zone ancillary coverage stays at 5 percent (reading B)', () => {
  it('the R text says 5% and names the parking-space exception without a figure of its own (ch10_10.txt)', () => {
    expect(page('ch10_10')).toMatch(/10\.10\.60\.70 [^]{0,200}may not exceed 5% of the lot area/);
  });

  it('a garage lot in R answers 5, winner 10.10.60.70(1)(A); RD and the base figure are unchanged', () => {
    const r = eff(lot('R', 'ancillary_building', { flags: { ancillary_contains_parking_space: true, blank_side_wall: true } }), 'ancillary_coverage_pct');
    expect([r.status, r.value, r.winner]).toEqual(['value', 5, '10.10.60.70(1)#(1)(A)']);
  });

  it('the explained difference is recorded as data the scorecard reads: vocab.explained_differences', () => {
    const x = I.vocab.explained_differences['10.5.60.70(1)(B)'];
    expect(x).toMatchObject({ ours: 5, city: 10, ruling: 'M-287' });
    expect(String(x.reading)).toMatch(/10\.10\.60\.70\(1\)/);
  });
});

// F-4D-15 / M-288: key the listed clauses or give them targets; what the text or the evaluator cannot carry is held on the record.
describe('F-4D-15 / M-288 — laneway platform floor height keyed; the clauses that cannot be keyed faithfully are held', () => {
  it('150.8.60.60(3)(A) is a height above the access floor, 0.2 m, on the platform element target', () => {
    const u = unitOf('150.8.60.60(3)#(3)(A)');
    expect(targetsOf(u)).toEqual(['platform_above_access_floor_m']);
    expect([].concat(u.numeric_expression)).toEqual(['platform_above_access_floor_m = 0.2 m @(3)(A)']);
    expect(u.archetype).toBe('LIMIT');
  });

  it('150.8.60.60(3)(B) keeps platform_height_m = 4.0 m; both are now answered for a platform on a laneway suite', () => {
    const l = lot('R', 'laneway_suite');
    expect(eff(l, 'platform_above_access_floor_m')).toMatchObject({ status: 'value', value: 0.2 });
    expect(eff(l, 'platform_height_m')).toMatchObject({ status: 'value' });
  });

  it('held, with the reason on the register (M-288): 150.8.60.60(2)(B), 10.5.40.50(4)(B)/(C), 10.5.40.60(2)(A) stay unkeyed, so no wrong figure is answered', () => {
    // (4)(B)/(C) would share platform_above_access_floor_m with (3) (0.2 m, a platform at or above the second storey) and
    // override it; (2)(B) needs the laneway suite's own setbacks and angular planes (structure dimension S.3); 10.5.40.60(2)(A) is a pure reference (M-254 PIN)
    for (const id of ['150.8.60.60(2)#(2)(B)', '10.5.40.50(4)#(4)(B)', '10.5.40.50(4)#(4)(C)', '10.5.40.60(2)#(2)(A)']) expect([id, targetsOf(unitOf(id)).filter((t) => t !== 'none')]).toEqual([id, []]);
    expect(eff(lot('R', 'detached_house'), 'platform_above_access_floor_m')).toMatchObject({ status: 'value', value: 0.2 });
  });
});

// F-4D-17 / M-289: the existing M-259 input (blank_side_wall) already covers the four notices; recorded, with the arm that gives the City figure.
describe('F-4D-17 / M-289 — the City 0.9 m on a side wall with openings is the blank_side_wall:false arm (M-259), for every type of the notices', () => {
  it('detached, semi-detached and detached houseplex: 0.45 m by default, 0.9 m with openings', () => {
    for (const [bt = '', id = ''] of [['detached_house', '(4)(A)'], ['semi_detached_house', '(4)(B)'], ['detached_houseplex', '(4)(D)']]) {
      expect(eff(lot('R', bt, { flags: { blank_side_wall: true } }), 'side_setback_m')).toMatchObject({ value: 0.45, winner: `10.10.40.70(4)#${id}` });
      expect(eff(lot('R', bt, { flags: { blank_side_wall: false } }), 'side_setback_m')).toMatchObject({ value: 0.9, winner: '10.10.40.70(3)#(3)(A)' });
    }
  });
});
