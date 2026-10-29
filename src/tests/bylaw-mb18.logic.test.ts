// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-254 (platform setbacks), M-252 dated note 2026-10-29 (MB17-Q1, 2026-10-29-batch-ah#CHAT-209.MB17-Q1), M-75 (correction form);
//            ~/Buildo/.cursor/MCBYLAWS-QUEUE.md MB-18 ("platform setbacks keyed per side and street side; exception arms and building-type reading; driveway 10.5.100.1(1)(D) arms")
//
// MB-18 rule fixes already ruled, held for the MB-26 Layer 2 night. Every assertion reads the production path: the real-lot assembly
// (agreed units with the M-75 corrections) and evaluate.mjs. Three items:
//   1. 10.5.40.50(2) platform setbacks per side and street side (missing-rules card rank 4, "Existing: platform follows setback; correction under M-75").
//   2. MB17-Q1: an exception applies only to the building types it names (A0399: RM 23 side yard 0.6 m is for a detached house, a detached houseplex takes 1.2 m);
//      the lot minimums stay on the M-180(1) substitution (RM 252 lot frontage 8.0 m, A0289 kept).
//   3. 10.5.100.1(1)(D) driveway: the lesser of 9.0 m and the parking width, as (C) (the sealed min(9.0; 2.6) was always 2.6 m).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(ROOT);
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => { const u = byId.get(id); if (!u) throw new Error(`no unit ${id}`); return u; };
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType, exception: null,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

describe('MB-18 / 10.5.40.50(2): a platform meets the zone setbacks per side and on the street side (M-254 (1), missing-rules card rank 4)', () => {
  it('the unit is a LIMIT list over side, street side, rear and front, each referencing the zone setback', () => {
    const u = unitOf('10.5.40.50(2)#whole');
    expect(u.archetype).toBe('LIMIT');
    expect([].concat(u.target).sort()).toEqual(['platform_front_setback_m', 'platform_rear_setback_m', 'platform_side_setback_m', 'platform_side_setback_street_m']);
    expect([].concat(u.numeric_expression).sort()).toEqual([
      'platform_front_setback_m = front_setback_m @(2)', 'platform_rear_setback_m = rear_setback_m @(2)',
      'platform_side_setback_m = side_setback_m @(2)', 'platform_side_setback_street_m = side_setback_street_m @(2)']);
    expect(I.vocab.dsl_target.platform_side_setback_street_m).toMatchObject({ unit: 'm', bound: 'min', aspect: 'envelope' });
    expect(I.vocab.accessory_structure_use.deck_or_platform.element_targets).toContain('platform_side_setback_street_m');
  });
  it('a corner RD lot: interior side 1.2 m, street side 3.0 m (10.20.40.70(6)); both from 10.5.40.50(2)', () => {
    const l = lot('RD', 'detached_house', { flags: { corner_lot: true } });
    const s = eff(l, 'platform_side_setback_m'); const t = eff(l, 'platform_side_setback_street_m');
    expect([s.status, s.value, s.winner]).toEqual(['value', 1.2, '10.5.40.50(2)#whole']);
    expect([t.status, t.value, t.winner]).toEqual(['value', 3, '10.5.40.50(2)#whole']);
  });
  it('a lot with no street side has no platform street-side setback: not evaluated, never a number', () => {
    const t = eff(lot('RD', 'detached_house'), 'platform_side_setback_street_m');
    expect([t.status, t.value]).toEqual(['not_evaluated', null]);
  });
});

describe('MB-18 / MB17-Q1: an exception applies only to the building types it names (M-252 dated note 2026-10-29)', () => {
  it('the rule is data: vocab.exception_type_binding names the mode and the setback targets it reads', () => {
    expect(I.vocab.exception_type_binding).toMatchObject({ mode: 'named_only', targets: ['front_setback_m', 'rear_setback_m', 'side_setback_m', 'side_setback_street_m'] });
  });
  it('A0399: RM exception 23 (900.6.10(23)(D)(i): 0.6 m for a detached house) sets the detached house, not a 4-unit detached houseplex (base 1.2 m, 10.80.40.70(3)(A))', () => {
    const house = lot('RM', 'detached_house', { exception: '900.6.10(23)', label: { u: 4, d: 0.6 }, vars: { dwelling_units: 1 } });
    const plex = lot('RM', 'detached_houseplex', { exception: '900.6.10(23)', label: { u: 4, d: 0.6 }, vars: { dwelling_units: 4 } });
    const h = eff(house, 'side_setback_m'); const p = eff(plex, 'side_setback_m');
    expect([h.value, h.winner]).toEqual([0.6, '900.6.10(23)#(23)[SSP](D)(i)']);
    expect([p.value, p.winner]).toEqual([1.2, '10.80.40.70(3)#(3)(A)']);
  });
  it('the exception still sets the detached house height and the lot minimums of a houseplex are kept (M-180(1) outside the setbacks): RM 23 height 9.5 m for the house, RM 252 lot frontage 8.0 m for a 2-unit houseplex (A0289)', () => {
    const house = lot('RM', 'detached_house', { exception: '900.6.10(23)', label: { u: 4, d: 0.6 } });
    expect(eff(house, 'height_m').value).toBe(9.5);
    const a0289 = lot('RM', 'detached_houseplex', { exception: '900.6.10(252)', label: { u: 4, d: 0.8, f: 12 }, vars: { dwelling_units: 2 } });
    const f = eff(a0289, 'required_lot_frontage_m');
    expect([f.value, f.winner]).toEqual([8, '900.6.10(252)#(252)[SSP](A)']);
  });
  it('a duplex or triplex named by an exception still binds the 2- or 3-unit houseplex (M-252 by_unit_count): it is a named type', () => {
    const trip = lot('RM', 'detached_houseplex', { exception: '900.6.10(23)', label: { u: 4, d: 0.6 }, vars: { dwelling_units: 3 } });
    expect(eff(trip, 'side_setback_m').value).toBe(1.2); // RM 23 (D)(ii): 1.2 m for a triplex, the same as the base
    const u = unitOf('900.6.10(23)#(23)[SSP](D)(ii)');
    expect(E.applies(trip, u, C).ok).toBe(true);
  });
});

describe('MB-18 / 10.5.100.1(1)(D): the driveway of a lot wider than 23.0 m is the lesser of 9.0 m and the parking width (as (C))', () => {
  it('the expression keeps the parking-width arm; the 2.6 m all-parking-in-the-rear-yard arm stays a literal not expressed', () => {
    const d = unitOf('10.5.100.1(1)#(1)(D)'); const c = unitOf('10.5.100.1(1)#(1)(C)');
    expect(d.numeric_expression).toEqual(['driveway_width_m = min(9.0 m @(1)(D)(i); parking_width_m @(1)(D)(ii)) @(1)(D)']);
    expect(c.numeric_expression).toEqual(['driveway_width_m = min(6.0 m @(1)(C)(i); parking_width_m @(1)(C)(iii)) @(1)(C)']);
    expect(d.literals_not_expressed).toContainEqual({ clause: '(1)(D)(iii)', literal: '2.6 metres', reason: 'threshold_used_in_application' });
    expect(d.disclosure).toMatch(/lesser of 9\.0 m and the parking space width/);
  });
  it('a 30 m lot no longer answers 2.6 m: without the parking width it is not evaluated (missing input), exactly as (C) is', () => {
    const wide = lot('RD', 'detached_house', { label: { f: 30, d: 0.6 }, vars: { lot_frontage_m: 30 } });
    const r = eff(wide, 'driveway_width_m');
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'missing_input:parking_width_m']);
    const c = eff(lot('RD', 'detached_house'), 'driveway_width_m');
    expect([c.status, c.reason]).toEqual(['not_evaluated', 'missing_input:parking_width_m']);
  });
});

// the scorer: a corner lot's second named side is read against the street side (A0578 "1.2 m on the north side and 3 m on the south side")
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const haveData = fs.existsSync(path.join(DATA, 'parcels-all2.json'));
describe.skipIf(!haveData)('MB-18 / scorer: the street side of a corner lot (172 notices)', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mb18-')), 'sc.json');
  execFileSync('node', [path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'),
    '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const sc = JSON.parse(fs.readFileSync(out, 'utf8'));
  const platform = (n: string): Json[] => sc.rows.filter((r: Json) => r.notice === n && r.clause === '10.5.40.50(2)');
  it('A0578/26TEY (corner lot): the 3 m south side is the street-side setback, so the row is MATCH (was NO ANSWER: one lot-wide side setback)', () => {
    const r = platform('A0578/26TEY')[0]!;
    expect(r.class).toBe('MATCH');
    expect(r.checks.map((k: Json) => [k.value, k.class, k.street_side === true])).toEqual([[1.2, 'MATCH', false], [3, 'MATCH', true]]);
  });
  it('A0090/26SC: 3.6 m south and 0.45 m north, the south side being the street side: MATCH (was NO ANSWER)', () => {
    const r = platform('A0090/26SC')[0]!;
    expect(r.class).toBe('MATCH');
  });
  it('a lot that is not a corner lot never reads a side limit against a street side: A0103/26SC stays DIFFER', () => {
    expect(platform('A0103/26SC')[0]!.class).toBe('DIFFER');
  });
}, 180000);
