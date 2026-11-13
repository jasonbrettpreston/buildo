// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-475 (Phase 2 stores side_setback_street_m as unregulated by
//            absence where the zone has no street-side article; Layer 3 never reads not_evaluated:no_candidate as
//            unregulated), M-361 Q1 (no candidate is unregulated only where the zone has no such article), M-240 (rule 7a
//            v2: absence per zone, building type and target), M-385 / R3-01 (undecided never means zero);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 7a
//
// MB-27.L2 McProof item 1 (M-475) — the lock, red first. The change is data, not code: one absence ruling per zone with no
// street-side article (R, RS, RT, RM), each typed to the four principal house types (detached_house, semi_detached_house,
// detached_houseplex, semi_detached_houseplex; the ABS-6 form), so a garden or laneway suite cell never moves (150.7 and 150.8
// carry their own street-side clauses). RD keeps 10.20.40.70(6). Every assertion reads the production path (the golden-lot
// assembly: agreed units, displacement and include links, enactments, the exception authoring map, the seeded absences).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const page = (id: string): string => fs.readFileSync(path.join(ROOT, `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
const A = await (await mod('scripts/analysis/bylaw-validation/assembly.mjs')).loadRealLotAssembly(ROOT);
const L3 = await mod('scripts/analysis/bylaw/evaluate-l3.mjs');
const E: Json = A.E;
const C: Json = A.C;
const UNITS: Json[] = A.units;
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS: Json[] = read('scripts/seeds/bylaw/absence-rulings.json').rulings;

const T = 'side_setback_street_m';
const HOUSE_TYPES = ['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex'];
const ZONE_PAGE: Record<string, string> = { R: 'ch10_10', RS: 'ch10_40', RT: 'ch10_60', RM: 'ch10_80' };
const ZONES = Object.keys(ZONE_PAGE);
// the apartment-building major-street corner clause of each zone page: 3.0 m from a side lot line abutting a street (accounted, not absent)
const APT_CLAUSE: Record<string, string> = { R: '10.10.40.70(5)#(5)(D)', RS: '10.40.40.70(4)#(4)(D)', RT: '10.60.40.70(4)#(4)(D)', RM: '10.80.40.70(4)#(4)(D)' };
const streetSide = ABS.filter((r) => r.target === T);
const rulingOf = (zone: string): Json | undefined => streetSide.find((r) => r.zone === zone);

const lot = (zone: string, buildingType: string | null, flags: Json = {}, exception: string | null = null): Json => ({
  zone, exception, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: true, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...flags },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5 },
});
const eff = (l: Json): Json => E.effective(l, T, E.loadCandidates(l, UNITS).candidates, C);
const show = (r: Json): unknown[] => [r.status, r.value, r.reason ?? null, r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null, (r.evidence && r.evidence.kind) || null, (r.evidence && r.evidence.ruling) || null];

describe('M-475 the rulings are data: one typed street-side absence ruling per zone with no street-side article', () => {
  it('R, RS, RT and RM each carry exactly one, typed to the four principal house types; RD carries none (10.20.40.70(6))', () => {
    const byZone = Object.fromEntries(streetSide.map((r) => [r.zone, [...(r.building_types || ['<zone-wide>'])].sort()]));
    expect(streetSide.length).toBe(4);
    expect(byZone).toEqual({ R: HOUSE_TYPES, RS: HOUSE_TYPES, RT: HOUSE_TYPES, RM: HOUSE_TYPES });
    for (const z of ZONES) expect(rulingOf(z)?.checked_page).toBe(ZONE_PAGE[z]);
  });
  it('no street-side ruling names a suite, ancillary, townhouse or apartment type, and none answers not_applicable', () => {
    for (const r of streetSide) {
      expect(r.building_types.filter((t: string) => !HOUSE_TYPES.includes(t))).toEqual([]);
      expect(r.answer).toBeUndefined();
    }
  });
  it('each passes on its pinned page, and its occurrence patterns are the target\'s licensing patterns', () => {
    const r = E.checkAbsenceRulings({ rulings: streetSide, pages: Object.fromEntries(streetSide.map((x) => [x.checked_page, page(x.checked_page)])), vocab: VOCAB });
    expect({ pass: r.pass, violations: r.violations, executed: r.executed }).toEqual({ pass: true, violations: [], executed: 4 });
    for (const x of streetSide) expect([...x.occurrence_patterns].sort()).toEqual([...VOCAB.dsl_target[T].patterns].sort());
  });
  it.each(ZONES)('%s: the apartment major-street corner clause (D)(iv) is accounted for, not absent', (z) => {
    const r = rulingOf(z) as Json;
    expect(r.accounted_occurrences.some((a: string) => /on a corner lot the required minimum side yard setback from a side lot line abutting a street is 3\.0 metres/i.test(a))).toBe(true);
    expect(r.present_phrases.some((p: string) => /\(D\) for an apartment building, a side yard setback of/i.test(p))).toBe(true);
  });
  it.each(ZONES)('%s: a new house street-side clause on the page reds the ruling', (z) => {
    const r = rulingOf(z) as Json;
    const text = `${page(r.checked_page)}\n(9) Side Yard on a Corner Lot In the ${z} zone, for a detached house the required minimum side yard setback from a side lot line abutting a street is 2.4 metres.`;
    expect(E.verifyAbsence(r, page(r.checked_page), VOCAB).pass).toBe(true);
    expect(E.verifyAbsence(r, text, VOCAB).pass).toBe(false);
  });
});

describe('M-475 on the production path: a house lot in a zone with no street-side article is unregulated by absence', () => {
  const cases = ZONES.flatMap((z) => [...HOUSE_TYPES, 'duplex'].flatMap((bt) => [true, false].map((corner) => [z, bt, corner] as const)));
  it.each(cases)('%s %s (corner lot %s): unregulated, evidence absence, its zone ruling, no winner', (z, bt, corner) => {
    expect(show(eff(lot(z, bt, { corner_lot: corner })))).toEqual(['value', 'unregulated', null, null, 'absence', (rulingOf(z) as Json).id]);
  });
  it.each(ZONES)('%s house_with_secondary_suite (its class vector is a detached house) is unregulated by absence too', (z) => {
    const v = VOCAB.scenario_class_units.house_with_secondary_suite;
    expect(v.building_type).toBe('detached_house');
    const l = lot(z, v.building_type, { has_secondary_suite: true });
    expect(show(eff(l))).toEqual(['value', 'unregulated', null, null, 'absence', (rulingOf(z) as Json).id]);
  });
  it('RD keeps 10.20.40.70(6): 3.0 m on a qualifying corner lot, no_candidate off a corner, never absence', () => {
    expect(show(eff(lot('RD', 'detached_house')))).toEqual(['value', 3, null, '10.20.40.70(6)#(6)(A)', null, null]);
    for (const bt of [...HOUSE_TYPES, null]) expect(show(eff(lot('RD', bt, { corner_lot: false })))).toEqual(['not_evaluated', null, 'no_candidate', null, null, null]);
  });
});

describe('M-475 moves no other cell: suites, townhouses, apartments and the null type keep their answers', () => {
  it.each(ZONES)('%s: the garden and laneway suite cells are unchanged (150.7 garden suite clause; 150.8 laneway suite)', (z) => {
    expect(show(eff(lot(z, 'garden_suite')))).toEqual(['not_evaluated', null, 'missing_input:principal_side_setback_m', null, null, null]); // MB-27 increment 5 item 6 reading 2 (named re-pin): 150.7.60.20(6)(C) is on the street-side target, the house's cell supplied by the step (P5.13)
    expect(show(eff(lot(z, 'laneway_suite')))).toEqual(['not_evaluated', null, 'no_candidate', null, null, null]);
  });
  it.each(ZONES)('%s: townhouse and apartment off a major street stay no_candidate', (z) => {
    for (const bt of ['townhouse', 'apartment_building']) expect(show(eff(lot(z, bt)))).toEqual(['not_evaluated', null, 'no_candidate', null, null, null]);
  });
  it.each(ZONES)('%s: an unknown building type is undecided (M-50: the house types are unregulated, the others not), never unregulated', (z) => {
    expect(show(eff(lot(z, null)))).toEqual(['not_evaluated', null, 'needs_user_input:building_type', null, null, null]);
  });
  it.each(ZONES)('%s: an apartment building on a major-street corner lot keeps 3.0 m from its (D)(iv) clause', (z) => {
    expect(show(eff(lot(z, 'apartment_building', { major_street: true })))).toEqual(['value', 3, null, APT_CLAUSE[z], null, null]);
  });
});

describe('M-475 exceptions: an exception that carries a street-side clause keeps it; an unauthored one stays gated', () => {
  it('RS 900.4.10(24): its detached-house and semi-detached-house street-side clauses (3.6 m) still win', () => {
    expect(show(eff(lot('RS', 'detached_house', {}, '900.4.10(24)')))).toEqual(['value', 3.6, null, '900.4.10(24)#(24)[SSP](C)(v)', null, null]);
    expect(show(eff(lot('RS', 'semi_detached_house', {}, '900.4.10(24)')))).toEqual(['value', 3.6, null, '900.4.10(24)#(24)[SSP](B)(v)', null, null]);
  });
  it('RS 900.4.10(24): a houseplex takes the detached-house street-side clause 3.6 m (M-180 alias; MB17-Q1 withdrawn)', () => {
    expect(show(eff(lot('RS', 'detached_houseplex', {}, '900.4.10(24)')))).toEqual(['value', 3.6, null, '900.4.10(24)#(24)[SSP](C)(v)', null, null]);
  });
  it('an unauthored exception stays not_evaluated:exception_not_authored, never unregulated', () => {
    for (const z of ZONES) expect(show(eff(lot(z, 'detached_house', {}, '900.4.10(99999)')))).toEqual(['not_evaluated', null, 'exception_not_authored:900.4.10(99999)', null, null, null]);
  });
});

describe('M-475 / R3-01: Layer 3 never reads not_evaluated:no_candidate as unregulated', () => {
  const read3 = (cell: Json): Json => L3.evaluateL3Source(`l2(${T})`, L3.makeL3Env({ round9: (x: number) => Math.round(x * 1e9) / 1e9, eps: 1e-9, cells: { [T]: cell }, targetUnits: { [T]: 'm' } })).l3;
  it('a stored no_candidate cell is not evaluated with its reason carried; only a stored unregulated cell reads as unregulated', () => {
    const ne = read3({ s: 'not_evaluated', reason: 'no_candidate' });
    expect([ne.k, ne.reason]).toEqual(['ne', 'no_candidate']);
    expect(read3({ s: 'applies', kind: 'unregulated' }).k).toBe('unregulated');
  });
});
