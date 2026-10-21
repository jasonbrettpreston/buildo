// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-247..M-258 (chat batch G, the CoA scorecard rulings);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5; decision log
//            docs/reports/decisions/2026-10-21-chat-batch-g.json (CHAT-29)
//
// By-law fix lane 4 (wf1/bylaw-fix-4): the scorecard rulings the operator approved on 2026-10-21, each drafted from City of
// Toronto Committee of Adjustment examiner figures (lanes coa-scorecard-1 / coa-scorecard-hist). Every assertion reads the
// production path: the real-lot assembly (scripts/analysis/bylaw-validation/assembly.mjs — agreed units with the M-75
// corrections, generated fields, xref displacement links, exception authoring state per ruling (d)) and evaluate.mjs.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const FA = await mod('scripts/analysis/bylaw/front-averaging.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const index = AU.buildIndex(I.slice);
const external = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/external.json'), 'utf8'));
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => {
  const u = byId.get(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
const disp = (id: string): string[] => XR.displacesOf(index, id, I.vocab, external).targets.map((t: Json) => t.id);

// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType, exception: null,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
void unitOf; void page;

// F-SC-3 / M-248 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-3`): "Despite regulations
// 10.80.40.70(1) to (3) above" displaces (1), (2) and (3), not the two endpoints only.
describe('F-SC-3 / M-248 — a dotted range "X(1) to (n)" displaces every regulation in the range', () => {
  it('the by-law text carries the dotted ranges (ch10_80.txt, ch10_20.txt)', () => {
    expect(page('ch10_80')).toContain('Despite regulations 10.80.40.70(1) to (3) above');
    expect(page('ch10_20')).toContain('Despite regulations 10.20.40.70(1) to (6) above');
  });

  it('RM 10.80.40.70(4) displaces (1), (2) and (3); RD 10.20.40.70(7) displaces (1) to (6)', () => {
    for (const k of ['A', 'B', 'C', 'D']) expect(disp(`10.80.40.70(4)#(4)(${k})`), k).toEqual(expect.arrayContaining(['10.80.40.70(1)', '10.80.40.70(2)', '10.80.40.70(3)']));
    expect(disp('10.20.40.70(7)#(7)(D)')).toEqual(expect.arrayContaining(['10.20.40.70(1)', '10.20.40.70(2)', '10.20.40.70(3)', '10.20.40.70(4)', '10.20.40.70(5)', '10.20.40.70(6)']));
  });

  it('1785 Keele St (RM, major street, apartment, depth 30.44 m): rear yard 7.5 m from (4)(B), not 25 % of depth from (2)(B)', () => {
    const r = eff(lot('RM', 'apartment_building', { label: {}, flags: { major_street: true }, vars: { lot_depth_m: 30.44, lot_frontage_m: 30 } }), 'rear_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 7.5, '10.80.40.70(4)#(4)(B)']);
  });
});

// F-SC-4 / M-249 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-4`): RM 10.80.40.70(4)(D) in the
// parallel form — (i) 2.4 m; (ii) the primary-window arm disclosed (M-197 form); (iii) deep_side_setback_m (M-205(2) form).
describe('F-SC-4 / M-249 — RM apartment side yard on a major street keyed like its R / RD / RS / RT twins', () => {
  const D = '10.80.40.70(4)#(4)(D)';
  const keele = lot('RM', 'apartment_building', { label: {}, flags: { major_street: true }, vars: { lot_depth_m: 30.44, lot_frontage_m: 30 } });

  it('the text names the three arms (ch10_80.txt)', () => {
    expect(page('ch10_80')).toContain('(i) 2.4 metres; (ii) Despite (i) above, 5.5 metres for portions of the main wall that have primary windows; (iii) Despite (i) and (ii) above, 7.5 metres for all portions of the main wall exceeding a building length of 25.0 metres');
  });

  it('(4)(D) keys (i) on side_setback_m, (iii) on deep_side_setback_m and (iv) on the street side; no max() over the arms', () => {
    const u = unitOf(D);
    expect([].concat(u.numeric_expression).sort()).toEqual(['deep_side_setback_m = 7.5 m @(4)(D)(iii)', 'side_setback_m = 2.4 m @(4)(D)(i)', 'side_setback_street_m = 3.0 m @(4)(D)(iv)']);
    expect([].concat(u.target).sort()).toEqual(['deep_side_setback_m', 'side_setback_m', 'side_setback_street_m']);
  });

  it('the (ii) primary-window arm is disclosed, never bound (M-197 form)', () => {
    const g = String(unitOf(D).calculation_handling?.gaps ?? '');
    expect(g).toMatch(/5\.5 m/);
    expect(g).toMatch(/primary windows/);
  });

  it('1785 Keele St: side_setback_m 2.4 m (the City figure), deep_side_setback_m 7.5 m', () => {
    const s = eff(keele, 'side_setback_m');
    expect([s.status, s.value, s.winner]).toEqual(['value', 2.4, D]);
    const d = eff(keele, 'deep_side_setback_m');
    expect([d.status, d.value, d.winner]).toEqual(['value', 7.5, D]);
  });

  it('the twins key (i) alone on side_setback_m (rule by provision family)', () => {
    for (const id of ['10.10.40.70(5)#(5)(D)', '10.20.40.70(7)#(7)(D)', '10.40.40.70(4)#(4)(D)', '10.60.40.70(4)#(4)(D)']) {
      expect([].concat(unitOf(id).numeric_expression).filter((s: string) => s.startsWith('side_setback_m')), id).toHaveLength(1);
    }
  });
});

// F-SC-6 / M-250 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-6`): RD 42's GFA takes its own
// FSI cap — gfa_m2 = min(118 m2 + 25 pct × lot_area_m2; 0.5 ratio × lot_area_m2).
describe('F-SC-6 / M-250 — exception RD 42 gross floor area is capped at FSI 0.5', () => {
  const U = '900.3.10(42)#(42)[SSP](A)(i)';
  const bethnal = (area: number): Json => lot('RD', 'detached_house', { exception: '900.3.10(42)', label: { f: 12 }, vars: { lot_area_m2: area, lot_frontage_m: 12, lot_depth_m: area / 12 } });

  it('the text carries the cap (ch900_3.txt)', () => {
    expect(page('ch900_3')).toContain('is 118 square metres, plus 25% of the lot area, up to a maximum floor space index of 0.5');
  });

  it('the unit keys min() of the two limbs; fsi stays 0.5', () => {
    expect([].concat(unitOf(U).numeric_expression).sort()).toEqual(['fsi = 0.5 ratio @(42)[SSP](A)(i)', 'gfa_m2 = min(118 m2 + 25 pct × lot_area_m2; 0.5 ratio × lot_area_m2) @(42)[SSP](A)(i)']);
  });

  it('41 Bethnal Ave (City 195.72 m² on 391.44 m²): gfa_m2 = 0.5 × lot area; a large lot keeps 118 + 25 %', () => {
    const r = eff(bethnal(391.44), 'gfa_m2');
    expect([r.status, r.value, r.winner]).toEqual(['value', 195.72, U]);
    const big = eff(bethnal(1000), 'gfa_m2');
    expect(big.value).toBe(368);
  });
});

// F-SC-7 / M-251 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-7`): RD 70 (B) binds the residential
// building with its storey increment; an ancillary building falls to 10.5.60.20(3)(C)(ii).
describe('F-SC-7 / M-251 — exception RD 70 side yard: the residential building only, with the storey increment', () => {
  const B = '900.3.10(70)#(70)[SSP](B)';
  // 5 Parmbelle Cres: RD (f21.0; a975) (x70), HT 11.5, ST 3
  const parm = (bt: string, vars: Json = {}): Json => lot('RD', bt, { exception: '900.3.10(70)', label: { f: 21, a: 975 }, overlays: { HT: 11.5, ST: 3 }, vars: { lot_frontage_m: 21, lot_depth_m: 46, lot_area_m2: 975, ...vars } });

  it('the text carries the increment (ch900_3.txt)', () => {
    expect(page('ch900_3')).toContain('(B) The minimum side yard setback is 1.8 metres on each side for a one- storey building, plus 0.6 metres for each additional storey or portion thereof');
  });

  it('(B) keys 1.8 m + 0.6 m per additional storey on the proposed storeys (a scenario input)', () => {
    expect(unitOf(B).numeric_expression).toEqual(['side_setback_m = 1.8 m + 0.6 m × (proposed_storeys − 1 storeys) @(70)[SSP](B)']);
    expect(I.vocab.dsl_input.proposed_storeys).toMatchObject({ unit: 'storeys' });
  });

  it('a house: 1.8 m at one storey, 3.0 m at three; OWED (missing_input:proposed_storeys) until the scenario supplies storeys', () => {
    expect(eff(parm('detached_house', { proposed_storeys: 1 }), 'side_setback_m')).toMatchObject({ status: 'value', value: 1.8, winner: B });
    expect(eff(parm('detached_house', { proposed_storeys: 3 }), 'side_setback_m')).toMatchObject({ status: 'value', value: 3, winner: B });
    const owed = eff(parm('detached_house'), 'side_setback_m');
    expect([owed.status, owed.reason]).toEqual(['not_evaluated', 'missing_input:proposed_storeys']);
  });

  it('an ancillary building never takes (B): the pavilion (3.78 m high, 1.8 m or more from the house) answers half its height, 1.89 m, from 10.5.60.20(3)', () => {
    const r = eff(parm('ancillary_building', { proposed_height_m: 3.78, distance_to_residential_m: 5, ancillary_floor_area_m2: 20 }), 'side_setback_m');
    expect(r.winner).not.toBe(B);
    expect([r.status, r.value]).toEqual(['value', 1.89]);
    expect(String(r.winner)).toMatch(/^10\.5\.60\.20\(3\)/);
  });
});

// F-SC-8 / M-252 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-8`, "Follow the City"): an exception
// arm that names the lot's own building type is not displaced by 10.80.30.1(2) "the more permissive regulation prevails";
// duplex / triplex read as a detached houseplex of 2 / 3 units (vocab.exception_type_alias.by_unit_count).
describe('F-SC-8 / M-252 — exception RM 18 "35% for a duplex or triplex" binds a 2- or 3-unit houseplex', () => {
  // 61 Redgrave Dr: RM (u4) (x18), no Lot Coverage Overlay
  const red = (units: number | null): Json => lot('RM', 'detached_houseplex', { exception: '900.6.10(18)', label: { u: 4 }, vars: { lot_frontage_m: 9.14, lot_depth_m: 36.57, lot_area_m2: 334.4, ...(units === null ? {} : { dwelling_units: units }) } });

  it('the texts (ch900_6.txt x18 (C); ch10_80.txt 10.80.30.1(2))', () => {
    expect(page('ch900_6')).toContain('(C) The maximum lot coverage is: (i) 33% for a detached house or semi-detached house; and (ii) 35% for a duplex or triplex');
    expect(page('ch10_80')).toContain('is more permissive than the maximum lot coverage that would apply to the lot under regulation 10.80.30.1(1), then the more permissive regulation prevails');
  });

  it('vocab.exception_type_alias.by_unit_count maps duplex / triplex to a detached houseplex of 2 / 3 units', () => {
    expect(I.vocab.exception_type_alias.by_unit_count).toMatchObject({ duplex: { type: 'detached_houseplex', dwelling_units: 2 }, triplex: { type: 'detached_houseplex', dwelling_units: 3 } });
  });

  it('61 Redgrave Dr, a 2-unit houseplex: lot_coverage_pct 35 % from x18 (C) (the City figure); 3 units the same', () => {
    for (const n of [2, 3]) {
      const r = eff(red(n), 'lot_coverage_pct');
      expect([n, r.status, r.value, r.winner]).toEqual([n, 'value', 35, '900.6.10(18)#(18)[SSP](C)']);
    }
  });

  it('a 4-unit houseplex is no duplex or triplex: the detached-house substitution (33 %) and the more-permissive rule still apply (M-180(1)/(2) unchanged)', () => {
    const r = eff(red(4), 'lot_coverage_pct');
    expect([r.status, r.value]).toEqual(['value', 'unregulated']);
  });
});

// F-SC-9 / M-253 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-9`): on a garden-suite lot the house's
// coverage answer is kept, ancillary_coverage_pct carries the (B) 20 % cap, and (A) 45 % is disclosed. Already in force at
// ee5ed572 (N-1, 02ccf852): this describe locks it (no code change).
describe('F-SC-9 / M-253 — garden-suite lots: the 20 % all-ancillary cap, the 45 % path disclosed', () => {
  // 59 Yarrow Rd: RM (f12.0; u4; d0.8) (x252), HT 11 ST 3, no Lot Coverage Overlay
  const yar = (bt: string): Json => lot('RM', bt, { exception: '900.6.10(252)', label: { f: 12, u: 4, d: 0.8 }, overlays: { HT: 11, ST: 3 }, vars: { lot_frontage_m: 7.62, lot_depth_m: 33.53, lot_area_m2: 255.58 } });

  it('the text (ch150_7.txt 150.7.60.70(1))', () => {
    expect(page('ch150_7')).toContain('(A) the area of the lot covered by all buildings and structures must not exceed 45 percent; or (B) the ancillary building containing a garden suite is not included in the overall calculation of lot coverage, and the area of the lot covered by all ancillary buildings combined, including the ancillary building containing a garden suite, may not exceed 20 percent of the lot area');
  });

  it('the suite lot: ancillary_coverage_pct 20 % from (1)(B) on a lot with no Lot Coverage Overlay; the coverage answer stays the (B) path', () => {
    const a = eff(yar('garden_suite'), 'ancillary_coverage_pct');
    expect([a.status, a.value, a.winner]).toEqual(['value', 20, '150.7.60.70(1)#(1)(B)']);
    expect(eff(yar('garden_suite'), 'lot_coverage_pct').value).toBe('unregulated');
  });

  it('(A) 45 % is disclosed as the alternative path', () => {
    expect(String(unitOf('150.7.60.70(1)#(1)(A)').disclosure)).toMatch(/\(A\) 45 % for all buildings/);
  });
});

// Front yard / M-256 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.FRONT-YARD`,
// `2026-10-21-chat-batch-g#CHAT-29.Front-yard-accuracy`): keep M-245 (no floor); where averaging may apply but a neighbour's
// estimate is missing or excluded, front_setback_m answers needs_survey — never the zone default.
describe('front yard / M-256 — a missing or excluded neighbour estimate answers needs survey, never the zone default', () => {
  const nb = (o: Json): Json => ({ neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1, bldg_to_subject_m: 3, front_setback_est_m: 5, est_status: 'estimated', ...o });
  const res = (rows: Json[]): Json => FA.resolveFrontAveraging(rows, { fya_porch_allowance_m: 1.0 }, { zone_default_m: 6.0 });
  const NS = (r: Json): unknown[] => [r.basis, r.front_setback_m, r.needs_survey, r.disclosures, r.flags.front_averaging_not_applicable];

  it('the text: x.40.70(1) applies only "If regulation 10.5.40.70(1) does not apply" (ch10_20.txt)', () => {
    expect(page('ch10_20')).toContain('If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RD zone is 6.0 metres');
  });

  it('two qualifying neighbours, an estimate excluded (30 Sunvale Dr, 50 Melville Ave): needs survey, no value', () => {
    expect(NS(res([nb({}), nb({ front_setback_est_m: null, est_status: 'estimate_out_of_bounds' })]))).toEqual(['needs_survey', null, true, ['front_yard_survey_required'], null]);
  });

  it('no qualifying neighbour, but an abutting residential lot whose street or building is not known (24 Balding Crt): needs survey', () => {
    expect(NS(res([nb({ same_frontage_street: null, front_setback_est_m: null, est_status: 'no_frontage_street', bldg_to_subject_m: 4.46 })]))).toEqual(['needs_survey', null, true, ['front_yard_survey_required'], null]);
    expect(NS(res([nb({ neighbour_building_id: null, bldg_to_subject_m: null, front_setback_est_m: null, est_status: 'no_building' })]))[0]).toBe('needs_survey');
  });

  it('averaging provably does not apply (no abutting residential lot on the street, or its building beyond 15.0 m): the zone default', () => {
    expect([res([]).basis, res([]).front_setback_m]).toEqual(['zone_default', 6]);
    expect([res([nb({ bldg_to_subject_m: 20 })]).basis, res([nb({ same_frontage_street: false })]).basis, res([nb({ neighbour_residential: false })]).basis]).toEqual(['zone_default', 'zone_default', 'zone_default']);
  });

  it('M-245 kept: estimated neighbours average + allowance with no floor; three or more neighbours keep the zone default (Q-B2)', () => {
    expect([res([nb({ front_setback_est_m: 2 }), nb({ front_setback_est_m: 3 })]).front_setback_m]).toEqual([3.5]);
    expect(res([nb({}), nb({}), nb({})]).basis).toBe('zone_default_needs_survey');
  });

  it('the evaluator owes the front setback while the averaging flag is undecided (no zone-default answer)', () => {
    const l = lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: null } });
    const r = eff(l, 'front_setback_m');
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'condition_unknown:front_averaging_not_applicable']);
  });
});

// F-SC-11/12 / M-254 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-11.12`): interim before the
// structure dimension (S.3) — 10.5.40.50(2) is an element-scoped reference to the zone's setbacks; the declared-bound
// form reaches the remaining 10.5.40.60 units, so platform and stair clearances answer. A platform's own targets answer
// for the platform (M-159(2) / M-175 keep it off every principal-building target).
describe('F-SC-11/12 / M-254 — platforms meet the zone setbacks; stair, ramp and lift clearances answer', () => {
  // 11 Westchester Rd: RD (f12.0), detached house; 10.5.40.50(2) City 1.2 m (the RD (3)(C) side yard)
  const west = lot('RD', 'detached_house', { label: { f: 12 }, vars: { lot_frontage_m: 12, lot_depth_m: 40 } });

  it('the texts (ch10_5.txt 10.5.40.50(2), 10.5.40.60(3))', () => {
    expect(page('ch10_5')).toContain('a platform without main walls, such as a deck, porch, balcony or similar structure, attached to or within 0.3 metres of a building, must comply with the required minimum building setbacks for the zone');
    expect(page('ch10_5')).toContain('(ii) no wider than 2.0 metres; and (iii) no closer to a lot line than 0.6 metres');
  });

  it('10.5.40.50(2) is a LIMIT list referencing the zone setbacks', () => {
    const u = unitOf('10.5.40.50(2)#whole');
    expect([u.archetype, [].concat(u.numeric_expression).sort()]).toEqual(['LIMIT', ['platform_front_setback_m = front_setback_m @(2)', 'platform_rear_setback_m = rear_setback_m @(2)', 'platform_side_setback_m = side_setback_m @(2)']]);
  });

  it('11 Westchester Rd: the platform side setback is the zone side yard, 1.2 m; rear 25 % of depth / 7.5 m', () => {
    const s = eff(west, 'platform_side_setback_m');
    expect([s.status, s.value, s.winner]).toEqual(['value', 1.2, '10.5.40.50(2)#whole']);
    expect(eff(west, 'platform_rear_setback_m').value).toBe(10);
  });

  it('a porch answers its own clearance (10.5.40.60(1)(A)(i): no closer to a side lot line than the side yard) on a house lot', () => {
    const c = eff(west, 'platform_clearance_m');
    expect(c.status).toBe('value');
    expect(c.value).toBe(1.2);
  });

  it('exterior stairs, ramps and elevating devices keep 0.6 m from a lot line (10.5.40.60(3)(A)–(C)(iii))', () => {
    for (const [t, id] of [['stairs_clearance_m', '10.5.40.60(3)#(3)(A)'], ['ramp_clearance_m', '10.5.40.60(3)#(3)(B)'], ['elevating_device_clearance_m', '10.5.40.60(3)#(3)(C)']] as Array<[string, string]>) {
      const r = eff(west, t);
      expect([t, r.status, r.value, r.winner]).toEqual([t, 'value', 0.6, id]);
    }
  });

  it('the platform never limits the principal building: side_setback_m stays the zone side yard', () => {
    expect(eff(west, 'side_setback_m')).toMatchObject({ value: 1.2, winner: '10.20.40.70(3)#(3)(C)' });
  });
});

// F-SC-13/14 / M-255 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-13.14`): the UNUSUAL / PERMIT units
// the City enforces are keyed where the text gives a value (rule by provision family: the RS and RM twins with them).
describe('F-SC-13/14 / M-255 — the extension side clearance, the RD parapet allowance and the platform count are keyed', () => {
  // 21 Kelso Ave: RD (f12.0; a370) (x1463) — a zone-level lot here (the exception is not part of this check); f15 puts
  // the lot in the (2) band ("more than 12.0 metres to 18.0 metres")
  const rd = lot('RD', 'detached_house', { label: { f: 15 }, vars: { lot_frontage_m: 15, lot_depth_m: 40 } });

  it('the texts (ch10_20.txt)', () => {
    expect(page('ch10_20')).toContain('(C) is at least 3.0 metres from each side lot line');
    expect(page('ch10_20')).toContain('A parapet on a residential building in the RD zone may exceed the permitted maximum main wall height in regulation 10.20.40.10(4) by a maximum of 0.3 metres');
    expect(page('ch10_20')).toContain('(A) there may be no more than a total of four platforms, and no more than one on each of the front, rear and each side of the detached house');
  });

  it('RD / RS / RM 10.x.40.20(2)(C): the one-storey extension keeps 3.0 m from each side lot line (extension_side_setback_m, min)', () => {
    expect(eff(rd, 'extension_side_setback_m')).toMatchObject({ status: 'value', value: 3, winner: '10.20.40.20(2)#(2)(C)' });
    expect(eff(lot('RS', 'detached_house', { label: { f: 15 } }), 'extension_side_setback_m')).toMatchObject({ status: 'value', value: 3, winner: '10.40.40.20(2)#(2)(C)' });
    expect(eff(lot('RM', 'detached_house', { label: { f: 15 } }), 'extension_side_setback_m')).toMatchObject({ status: 'value', value: 3, winner: '10.80.40.20(2)#(2)(C)' });
  });

  it('RD 10.20.40.10(5): a parapet may exceed the flat-roof main wall height by 0.3 m (parapet_projection_m, max)', () => {
    expect(eff(rd, 'parapet_projection_m')).toMatchObject({ status: 'value', value: 0.3, winner: '10.20.40.10(5)#whole' });
  });

  it('RD / RS / RM 10.x.40.50(1)(A): at most four upper platforms on a detached house (platform_count, max) — a platform element target', () => {
    for (const [z, id] of [['RD', '10.20.40.50(1)#(1)(A)'], ['RS', '10.40.40.50(1)#(1)(A)'], ['RM', '10.80.40.50(1)#(1)(A)']] as Array<[string, string]>) {
      expect([z, eff(lot(z, 'detached_house'), 'platform_count')]).toMatchObject([z, { status: 'value', value: 4, winner: id }]);
    }
    expect(I.vocab.accessory_structure_use.deck_or_platform.element_targets).toContain('platform_count');
  });
});
