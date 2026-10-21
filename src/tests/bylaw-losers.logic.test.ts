// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (losers[] with dropped_by, 134:44; prerequisites, 134:121, 134:171);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence rules 1-4a), §7.6 (the evaluator stays pure);
//            docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md:192 (the eight dropped_by members);
//            docs/reports/2026-10-21-layer2-build-plan.md PIN L2-PREREQ (R-IX, the by-law fix lane's evaluator additions)
//
// L2-LOSERS: effective() returns a structured losers[] beside the free-text trace[] (purely additive: no existing field
// changes). One fixture per dropped_by member, each red before the evaluator change. A loser is
// {unit_id, dropped_by, by}: the unit (or, for rule2_arg_displaced, the unit whose argument) that did not decide the
// value, why, and the unit that decided it (null when no unit did: condition_false).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const EXT = read('scripts/seeds/bylaw/external.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const C = E.makeContext(VO.evaluatorVocab(PVOCAB), { absences: ABS.rulings });
const eff = (lot: Json, target: string, units: Json[]): Json => E.effective(lot, target, E.loadCandidates(lot, units).candidates, C);
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const lot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false, through_lot: false }, building_type: 'detached_house', exception: null };
const loserOf = (r: Json, unitId: string): Json | undefined => (r.losers as Json[]).find((l) => l.unit_id === unitId);

describe('L2-LOSERS: the dropped_by vocabulary', () => {
  it('DROPPED_BY is the eight members of the Phase 2 plan (P2:192), in that order', () => {
    expect([...E.DROPPED_BY]).toEqual(['rule2_displaced', 'rule2_arg_displaced', 'rule3_outranked', 'rule4_higher_layer', 'rule4_provincial_restraint', 'rule4a_less_restrictive', 'condition_false', 'order_tiebreak']);
  });
  it('a value result carries losers[] (empty when nothing lost), purely additive beside trace[]', () => {
    const r = eff(lot, 'height_m', [U({ unit_id: 'ONLY#a', target: 'height_m', numeric_expression: ['height_m = 9.0 m @a'] })]);
    expect([r.status, r.value, r.losers]).toEqual(['value', 9, []]);
    expect(Array.isArray(r.trace)).toBe(true);
  });
});

describe('L2-LOSERS: one fixture per dropped_by member', () => {
  it('rule2_displaced: a same-layer "Despite" drops the displaced unit', () => {
    const A = U({ unit_id: '10.60.40.70(3)#(A)', regulation_id: '10.60.40.70(3)', bound: 'min', application: { zones: ['RT'], building_types: ['any'] }, target: 'side_setback_m', numeric_expression: ['side_setback_m = 7.5 m @(3)(A)'] });
    const B = U({ unit_id: '10.60.40.70(3)#(B)', regulation_id: '10.60.40.70(3)', bound: 'min', application: { zones: ['RT'], building_types: ['any'] }, target: 'side_setback_m', displaces: ['10.60.40.70(3)(A)'], numeric_expression: ['side_setback_m = 0.9 m @(3)(B)'] });
    const r = eff({ ...lot, zone: 'RT' }, 'side_setback_m', [A, B]);
    expect(r.value).toBe(0.9);
    expect(loserOf(r, A.unit_id)).toMatchObject({ dropped_by: 'rule2_displaced', by: B.unit_id });
  });
  it('rule2_arg_displaced: an argument of a unit is replaced by the displacing unit', () => {
    const hA = U({ unit_id: '10.20.40.10(1)#(A)', regulation_id: '10.20.40.10(1)', target: 'height_m', condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' }, numeric_expression: ['height_m = overlay(HT) @(1)(A)'] });
    const hC = U({ unit_id: '10.20.40.10(1)#(C)', regulation_id: '10.20.40.10(1)', target: 'height_m', application: { zones: ['RD'], building_types: ['detached_houseplex'] }, displaces: ['10.20.40.10(1)(A)'], numeric_expression: ['height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)'] });
    const six2A = U({ unit_id: '600.60.40(2)#(A)', regulation_id: '600.60.40(2)', layer: 'overlay', target: 'height_m', applies_to: { part: 'map_area', refs: ['sixplex_overlay'] }, application: { zones: ['R', 'RD', 'RS', 'RT', 'RM'], building_types: ['detached_houseplex'] }, condition: { tokens: ['unit_count_band'], if: 'dwelling_units ≥ 5 units and dwelling_units ≤ 6 units' }, displaces: ['10.20.40.10(1)(C)(ii)'], numeric_expression: ['height_m = 10.5 m @(2)(A)'] });
    const r = eff({ ...lot, overlays: { HT: 9 }, building_type: 'sixplex', map_areas: ['sixplex_overlay'], vars: { ...lot.vars, dwelling_units: 6 } }, 'height_m', [hA, hC, six2A]);
    expect(r.value).toBe(10.5);
    expect(loserOf(r, hC.unit_id)).toMatchObject({ dropped_by: 'rule2_arg_displaced', by: six2A.unit_id });
  });
  it('rule3_outranked: a unit that displaces the precedence rule outranks a higher layer', () => {
    const p9003 = U({ unit_id: '900.1.10(3)#whole', regulation_id: '900.1.10(3)', archetype: 'PROCEDURAL', target: 'none', bound: 'none', application: { zones: ['any'], building_types: ['any'] }, ranks_layers: 'exception > base, overlay', numeric_expression: 'none' });
    const ov = U({ unit_id: 'OV#h', layer: 'overlay', target: 'height_m', displaces: ['900.1.10(3)'], numeric_expression: ['height_m = 10.5 m @x'] });
    const ex = U({ unit_id: 'EX#h', layer: 'exception', exception: 'SYN', target: 'height_m', numeric_expression: ['height_m = 9.0 m @x'] });
    const r = E.effective(lot, 'height_m', [p9003, ov, ex], C); // the exception unit is handed over directly: loadCandidates keeps only the lot's own exception
    expect(r.value).toBe(10.5);
    expect(loserOf(r, 'EX#h')).toMatchObject({ dropped_by: 'rule3_outranked', by: 'OV#h' });
  });
  it('rule4_higher_layer: the highest layer replaces the lower one for the same bound', () => {
    const base = U({ unit_id: 'BASE#h', target: 'height_m', numeric_expression: ['height_m = 10.0 m @x'] });
    const ov = U({ unit_id: 'OV#h2', layer: 'overlay', target: 'height_m', numeric_expression: ['height_m = 11.0 m @x'] });
    const r = eff(lot, 'height_m', [base, ov]);
    expect(r.value).toBe(11);
    expect(loserOf(r, 'BASE#h')).toMatchObject({ dropped_by: 'rule4_higher_layer', by: 'OV#h2' });
  });
  it('rule4_provincial_restraint: a provincial unit restrains a more restrictive by-law value', () => {
    const P = E.provincialUnits(EXT, PVOCAB).units;
    const cov = U({ unit_id: 'BY#cov30', regulation_id: '10.20.30.40(1)', application: { zones: ['RD'], building_types: ['any'] }, target: 'lot_coverage_pct', numeric_expression: ['lot_coverage_pct = 30 pct @x'] });
    const inScope = { ...lot, flags: { ...lot.flags, parcel_of_urban_residential_land: true }, vars: { ...lot.vars, house_units: 2, ancillary_units: 1 } };
    const r = eff(inScope, 'lot_coverage_pct', [cov, ...P]);
    expect([r.value, r.winner]).toEqual([45, 'O.Reg.299/19 s.5(1)1']);
    expect(loserOf(r, 'BY#cov30')).toMatchObject({ dropped_by: 'rule4_provincial_restraint', by: 'O.Reg.299/19 s.5(1)1' });
  });
  it('rule4a_less_restrictive: at one layer and bound the most restrictive value governs', () => {
    const a = U({ unit_id: 'H1#a', target: 'height_m', numeric_expression: ['height_m = 10.0 m @a'] });
    const b = U({ unit_id: 'H2#b', target: 'height_m', numeric_expression: ['height_m = 8.5 m @b'] });
    const r = eff(lot, 'height_m', [a, b]);
    expect([r.value, r.winner]).toEqual([8.5, 'H2#b']);
    expect(loserOf(r, 'H1#a')).toMatchObject({ dropped_by: 'rule4a_less_restrictive', by: 'H2#b' });
  });
  it('condition_false: a value unit whose condition does not hold for the lot', () => {
    const hA = U({ unit_id: '10.20.40.10(1)#(A)', regulation_id: '10.20.40.10(1)', target: 'height_m', condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' }, numeric_expression: ['height_m = overlay(HT) @(1)(A)'] });
    const hB = U({ unit_id: '10.20.40.10(1)#(B)', regulation_id: '10.20.40.10(1)', target: 'height_m', condition: { tokens: ['overlay_mapped'], if: 'not mapped(HT)' }, numeric_expression: ['height_m = 10.0 m @(1)(B)'] });
    const r = eff(lot, 'height_m', [hA, hB]);
    expect(r.value).toBe(8.5);
    expect(loserOf(r, hB.unit_id)).toMatchObject({ dropped_by: 'condition_false', by: null });
  });
  it('order_tiebreak: two units give the same value; the first in declared order stands', () => {
    const a = U({ unit_id: 'T1#a', target: 'height_m', numeric_expression: ['height_m = 8.5 m @a'] });
    const b = U({ unit_id: 'T2#b', target: 'height_m', numeric_expression: ['height_m = 8.5 m @b'] });
    const r = eff(lot, 'height_m', [a, b]);
    expect(r.value).toBe(8.5);
    expect(r.losers).toHaveLength(1);
    expect(r.losers[0]).toMatchObject({ dropped_by: 'order_tiebreak', by: r.winner });
    expect(r.losers[0].unit_id).not.toBe(r.winner);
  });
});

describe('L2-LOSERS: every loser is well-formed', () => {
  it('each loser names a unit and a dropped_by member, and never the winner', () => {
    const a = U({ unit_id: 'H1#a', target: 'height_m', numeric_expression: ['height_m = 10.0 m @a'] });
    const b = U({ unit_id: 'H2#b', target: 'height_m', numeric_expression: ['height_m = 8.5 m @b'] });
    const r = eff(lot, 'height_m', [a, b]);
    for (const l of r.losers) {
      expect(typeof l.unit_id).toBe('string');
      expect(E.DROPPED_BY).toContain(l.dropped_by);
      expect(l.unit_id).not.toBe(r.winner);
    }
  });
});
