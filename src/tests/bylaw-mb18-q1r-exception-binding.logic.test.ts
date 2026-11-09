// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-180 (1) (the detached-house substitution: an exception's unit
//            for a detached house also applies to the detached houseplex) and its dated note 2026-10-30 (operator MB17-Q1R,
//            "Q1 yes"; 2026-10-30-batch-ai#CHAT-210.MB17-Q1R: MB17-Q1 — "an exception applies only to the building types it
//            names" — is WITHDRAWN), M-252 (duplex / triplex read as a 2- / 3-unit houseplex; the by-type entry);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 4 (M-180(2): the more permissive prevails)
//
// MB-27 (inc3 lane E, row E4) — the lock, red first. MB17-Q1 never belonged in the engine: it read an exception-layer unit by
// the building type its clause names and nothing else (no parent type, no M-180(1) alias), keyed by vocab.exception_type_binding
// on the four setback targets. The operator withdrew it (CHAT-210.MB17-Q1R) because it contradicts the by-law's own
// applicability clause (10.80.30.1(1), 10.80.40.1(4)). So this file proves the withdrawal is complete and observable:
//   1. the rule is no longer data: neither vocab.json nor the evaluator's vocab carries exception_type_binding, and the
//      evaluator context holds no named-only reading (a leftover key would be dead data the next lane would trust);
//   2. A0399: the RM exception 23 side yard of 0.6 m, written for a detached house, sets the 4-unit detached houseplex again
//      (900.6.10(23)#(23)[SSP](D)(i)), not the 1.2 m base of 10.80.40.70(3)(A);
//   3. the withdrawn reading's own instance on the other side: the RS exception 900.4.10(24) street-side clause reaches the
//      detached houseplex through the M-180(1) alias, so the cell is a value (3.6 m), never "unregulated by absence";
//   4. what MB17-Q1 never touched still holds: the M-252 unit-count reading (a 2- / 3-unit houseplex takes the duplex /
//      triplex entry) and the M-180(1) lot minimums for a houseplex (RM 252 frontage 8.0 m, A0289).
// Every assertion reads the production path: the real-lot assembly (agreed units, displacements, M-75 corrections) and
// evaluate.mjs; nothing here is a fixture of the evaluator's internals.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const V = await mod('scripts/analysis/bylaw/vocab.mjs');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const A = await AS.loadRealLotAssembly(ROOT);
const { I, E, units, C } = A;
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => {
  const u = byId.get(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

const lot = (zone: string, buildingType: string | null, exception: string | null, extra: Json = {}): Json => ({
  zone, exception, building_type: buildingType, overlays: {}, map_areas: [], label: { f: 12, d: 0.6 },
  flags: { lawfully_existing: false, corner_lot: true, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const at = (l: Json, t: string): unknown[] => {
  const r = eff(l, t);
  return [r.status, r.value, r.reason ?? null, r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null];
};

describe('MB-18 / MB17-Q1R: the named-only exception reading is gone from the data and from the evaluator', () => {
  it('vocab.json carries no exception_type_binding: the seed no longer states a named-only mode or its targets', () => {
    expect(Object.hasOwn(VOCAB, 'exception_type_binding')).toBe(false);
    expect(VOCAB.exception_type_binding).toBeUndefined();
  });
  it('the evaluator vocab does not hand the key to the evaluation context', () => {
    const ev = V.evaluatorVocab(VOCAB);
    expect(Object.hasOwn(ev, 'exception_type_binding')).toBe(false);
    expect(I.vocab.exception_type_binding).toBeUndefined();
  });
  it('the evaluation context holds no named-only flag or target set (a leftover would be dead data the next lane trusts)', () => {
    for (const k of ['exceptionNamedOnly', 'exceptionNamedOnlyTargets', 'namedOnly', 'namedOnlyFor']) {
      expect(Object.hasOwn(C, k), k).toBe(false);
    }
  });
  it('the M-180(1) alias is untouched: every zone that names a houseplex still carries its detached-house entry', () => {
    expect(VOCAB.exception_type_alias.detached_house).toBeUndefined(); // the alias is per zone, never zone-wide
    for (const z of ['R', 'RD', 'RS', 'RT', 'RM']) expect(VOCAB.exception_type_alias[z].detached_house).toBe('detached_houseplex');
    expect(C.exceptionTypeAlias).toEqual(expect.objectContaining({ RD: expect.objectContaining({ detached_house: 'detached_houseplex' }) }));
  });
});

describe('MB-18 / MB17-Q1R: A0399 — the RM exception 23 side yard sets the detached houseplex again (M-180(1))', () => {
  const RM23 = (buildingType: string, dwellingUnits: number): Json =>
    lot('RM', buildingType, '900.6.10(23)', { label: { u: 4, d: 0.6 }, vars: { dwelling_units: dwellingUnits } });
  it('the unit 900.6.10(23)#(23)[SSP](D)(i) is the 0.6 m side yard, and it applies to a detached houseplex of 4 units', () => {
    const u = unitOf('900.6.10(23)#(23)[SSP](D)(i)');
    expect(u.layer).toBe('exception');
    expect(E.applies(RM23('detached_houseplex', 4), u, C).ok).toBe(true);
  });
  it('the detached house answers 0.6 m from (D)(i)', () => {
    expect(at(RM23('detached_house', 1), 'side_setback_m')).toEqual(['value', 0.6, null, '900.6.10(23)#(23)[SSP](D)(i)']);
  });
  it('the 4-unit detached houseplex answers the same 0.6 m, not the 1.2 m base of 10.80.40.70(3)(A)', () => {
    expect(at(RM23('detached_houseplex', 4), 'side_setback_m')).toEqual(['value', 0.6, null, '900.6.10(23)#(23)[SSP](D)(i)']);
  });
  it('the lot minimums stay on the substitution: the RM 252 frontage of a 2-unit houseplex is 8.0 m (A0289 kept)', () => {
    const a0289 = lot('RM', 'detached_houseplex', '900.6.10(252)', { label: { u: 4, d: 0.8, f: 12 }, vars: { dwelling_units: 2 } });
    expect(at(a0289, 'required_lot_frontage_m')).toEqual(['value', 8, null, '900.6.10(252)#(252)[SSP](A)']);
  });
});

describe('MB-18 / MB17-Q1R: what the withdrawal restores is visible on the RS exception cell too', () => {
  it('RS 900.4.10(24): the detached house takes its 3.6 m street-side clause', () => {
    expect(at(lot('RS', 'detached_house', '900.4.10(24)'), 'side_setback_street_m')).toEqual(['value', 3.6, null, '900.4.10(24)#(24)[SSP](C)(v)']);
  });
  it('RS 900.4.10(24): the detached houseplex takes it through the M-180(1) alias — a value, never absence', () => {
    const r = at(lot('RS', 'detached_houseplex', '900.4.10(24)'), 'side_setback_street_m');
    expect(r).toEqual(['value', 3.6, null, '900.4.10(24)#(24)[SSP](C)(v)']);
    expect(r[1]).not.toBe('unregulated');
  });
});

describe('MB-18 / MB17-Q1R: what MB17-Q1 never reached still holds (M-252 and M-180(2))', () => {
  it('a 2-unit houseplex named by a duplex entry is bound by it (M-252 by_unit_count), not read as absent', () => {
    const trip = lot('RM', 'detached_houseplex', '900.6.10(23)', { label: { u: 4, d: 0.6 }, vars: { dwelling_units: 3 } });
    expect(E.applies(trip, unitOf('900.6.10(23)#(23)[SSP](D)(ii)'), C).ok).toBe(true);
  });
  it('an unauthored exception still answers not_evaluated:exception_not_authored, never unregulated', () => {
    expect(at(lot('RS', 'detached_house', '900.4.10(99999)'), 'side_setback_m')).toEqual(['not_evaluated', null, 'exception_not_authored:900.4.10(99999)', null]);
  });
});
