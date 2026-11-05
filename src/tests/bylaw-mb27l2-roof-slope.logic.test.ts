// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-482 (Q-RSM: principal roof_slope_max is unregulated by absence
//            in RD, RS, RM and RT for every class, and in R for the classes 10.10.40.10(4) does not name; the RD reading of
//            10.20.40.11(1), V8-Q3), M-223(3) (R 10.10.40.10(4) keyed as roof_slope_max), M-361 Q1, M-240 (rule 7a v2);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 7a
//
// MB-27.L2 Q-RSM — the lock, red first. The change is data, not code: zone-wide roof_slope_max absence rulings for RD, RS, RT
// and RM (the ABS-3 / ABS-4 form), and one R ruling typed to detached_houseplex, semi_detached_house and semi_detached_houseplex
// (the ABS-6 form). R detached_house and house_with_secondary_suite (a detached house) keep 5:3 from 10.10.40.10(4). The RD
// ruling accounts for 10.20.40.11(1), a MINIMUM slope for an altered roof of a lawfully existing building, which does not limit
// roof_slope_max. Every assertion reads the production path (the golden-lot assembly).
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
const E: Json = A.E;
const C: Json = A.C;
const UNITS: Json[] = A.units;
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS: Json[] = read('scripts/seeds/bylaw/absence-rulings.json').rulings;

const T = 'roof_slope_max';
const ZONE_WIDE: Record<string, string> = { RD: 'ch10_20', RS: 'ch10_40', RT: 'ch10_60', RM: 'ch10_80' };
const R_TYPES = ['detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex'];
const CLASS_TYPES = ['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex'];
const slope = ABS.filter((r) => r.target === T);
const rulingOf = (zone: string): Json | undefined => slope.find((r) => r.zone === zone);

const lot = (zone: string, buildingType: string | null, exception: string | null = null): Json => ({
  zone, exception, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5 },
});
const eff = (l: Json, units: Json[] = UNITS): Json => E.effective(l, T, E.loadCandidates(l, units).candidates, C);
const show = (r: Json): unknown[] => [r.status, r.value, r.reason ?? null, r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null, (r.evidence && r.evidence.kind) || null, (r.evidence && r.evidence.ruling) || null];
const absent = (zone: string): unknown[] => ['value', 'unregulated', null, null, 'absence', (rulingOf(zone) as Json).id];

describe('Q-RSM the rulings are data: zone-wide in RD, RS, RT and RM; typed in R', () => {
  it('one roof_slope_max ruling per zone: RD, RS, RT, RM zone-wide; R typed to the three classes 10.10.40.10(4) does not name', () => {
    const byZone = Object.fromEntries(slope.map((r) => [r.zone, r.building_types ? [...r.building_types].sort() : null]));
    expect(byZone).toEqual({ RD: null, RS: null, RT: null, RM: null, R: R_TYPES });
    for (const [z, p] of Object.entries(ZONE_WIDE)) expect(rulingOf(z)?.checked_page).toBe(p);
    expect(rulingOf('R')?.checked_page).toBe('ch10_10');
    for (const r of slope) expect(r.answer).toBeUndefined();
  });
  it('each passes on its pinned page (every "slope" on the page accounted for)', () => {
    const r = E.checkAbsenceRulings({ rulings: slope, pages: Object.fromEntries(slope.map((x) => [x.checked_page, page(x.checked_page)])), vocab: VOCAB });
    expect({ pass: r.pass, violations: r.violations, executed: r.executed }).toEqual({ pass: true, violations: [], executed: 5 });
    for (const x of slope) expect(x.occurrence_patterns).toEqual(['slope']);
  });
  it('RD accounts for 10.20.40.11(1), the minimum slope of an altered roof of a lawfully existing building (V8-Q3 a)', () => {
    const rd = rulingOf('RD') as Json;
    expect(rd.accounted_occurrences.some((a: string) => /the altered roof may not have a slope less than 1\.0 vertical units for every 4\.0 horizontal units/i.test(a))).toBe(true);
    expect(rd.statement).toMatch(/10\.20\.40\.11\(1\)/);
    expect(rd.statement).toMatch(/minimum/i);
  });
  it('RT has no slope sentence at all', () => {
    expect(/slope/i.test(page('ch10_60'))).toBe(false);
    expect((rulingOf('RT') as Json).accounted_occurrences).toEqual([]);
  });
  it.each(['RD', 'RS', 'RT', 'RM', 'R'])('%s: a new maximum-slope clause on the page reds the ruling', (z) => {
    const r = rulingOf(z) as Json;
    const text = `${page(r.checked_page)}\n(9) Roof Slope In the ${z} zone, a roof on a semi-detached house may not have a slope greater than 1.0 vertical units for every 1.0 horizontal units.`;
    expect(E.verifyAbsence(r, page(r.checked_page), VOCAB).pass).toBe(true);
    expect(E.verifyAbsence(r, text, VOCAB).pass).toBe(false);
  });
});

describe('Q-RSM on the production path', () => {
  const zoneWide = Object.keys(ZONE_WIDE).flatMap((z) => [...CLASS_TYPES, 'duplex', 'townhouse', 'apartment_building', null].map((bt) => [z, bt] as const));
  it.each(zoneWide)('%s %s: unregulated by absence, no winner (every class, every type)', (z, bt) => {
    expect(show(eff(lot(z, bt)))).toEqual(absent(z));
  });
  it('R detached_house and house_with_secondary_suite keep 5:3 from 10.10.40.10(4)', () => {
    expect(VOCAB.scenario_class_units.house_with_secondary_suite.building_type).toBe('detached_house');
    const r = eff(lot('R', 'detached_house'));
    expect([r.status, r.winner]).toEqual(['value', '10.10.40.10(4)#whole']);
    expect(r.value).toBeCloseTo(5 / 3, 8);
    expect((r.evidence && r.evidence.kind) || null).not.toBe('absence');
  });
  it.each([...R_TYPES, 'duplex'])('R %s: unregulated by absence (10.10.40.10(4) names only a detached house)', (bt) => {
    expect(show(eff(lot('R', bt)))).toEqual(absent('R'));
  });
  it('R townhouse and apartment building are outside the ruling and stay no_candidate', () => {
    for (const bt of ['townhouse', 'apartment_building']) expect(show(eff(lot('R', bt)))).toEqual(['not_evaluated', null, 'no_candidate', null, null, null]);
  });
});

describe('Q-RSM exceptions: a slope clause in an exception keeps it; an unauthored exception stays gated', () => {
  const excUnit: Json = {
    unit_id: '900.4.10(24)#(24)[SSP](Z)', regulation_id: '900.4.10(24)', layer: 'exception', exception: '900.4.10(24)', archetype: 'LIMIT', bound: 'max', target: T,
    displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RS'], building_types: ['any'] }, numeric_expression: ['roof_slope_max = 1.0 ratio @(24)[SSP](Z)'],
  };
  it('an RS exception lot whose exception carries a slope unit takes it, not the absence', () => {
    const r = eff(lot('RS', 'detached_house', '900.4.10(24)'), [...UNITS, excUnit]);
    expect([r.status, r.value, typeof r.winner === 'string' ? r.winner : r.winner && r.winner.unit_id]).toEqual(['value', 1, excUnit.unit_id]);
  });
  it('an unauthored exception stays not_evaluated:exception_not_authored, never unregulated', () => {
    for (const z of ['RD', 'RS', 'RT', 'RM', 'R']) expect(show(eff(lot(z, 'semi_detached_house', '900.4.10(99999)')))).toEqual(['not_evaluated', null, 'exception_not_authored:900.4.10(99999)', null, null, null]);
  });
});
