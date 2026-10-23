/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.6 (renovation), P5.7 (renovationResults), P5.12, P5.13
 * Handbook:  Spec 133 §lc.62 (LC-62), §m.228 (M-228), §m.229 (M-229); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * P3-4 (PLAN §4; CHAT-73.nohalt): renovationResults(envelope, existingHouse, config) in the existing shared module
 * src/features/leads/lib/renovation-shared.js (P5.7 "one pure calculation, shared by the step and the app"), plus the two
 * helpers it shares with the new-build modules (atticFloor, unitsFor). User-input fields are NULL with a closed reason
 * until the owner enters them (O-13). Vectors are hand-computed from the formulas in P5.6.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS shared module
const RS = require(path.join(ROOT, 'src/features/leads/lib/renovation-shared.js')) as Json;
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;

const ENV = {
  footprintSqm: 140, gfaSqm: 420, storeys: 3, frontageM: 10, reliefFrontageMaxM: 12.2, rearAdditionStoreyCap: false,
  fsiCapSqm: null, depthCapM: null, lengthCapM: null, extension: null,
  attic: { Hw: 7.5, H: 10, pitch: 1, ad: 0.3, c: 1.4, q: 2.0, shareMin: 0.8, areaMin: 10, storeyHeightM: 3 },
  units: { uCap: null, houseplexCap: 4, minUnits: 2 },
};
const HOUSE = { widthM: 8, depthM: 10, storeys: 2, basement: null, basementHeightM: null, confidence: 0.9, source: 'user_entered' };
const CFG = { basementLivableShare: 1, circulationShare: 0.1, unitMinInteriorSqm: 30, existingConfidenceMin: 0.6 };
const run = (env: Json = {}, house: Json = {}, cfg: Json = {}): Json => RS.renovationResults({ ...ENV, ...env }, { ...HOUSE, ...house }, { ...CFG, ...cfg });

describe('P3-4: the shared helpers', () => {
  it('atticFloor is the P5.2 item 6 attic test (counted, total) - one implementation for new build and renovation', () => {
    const p = { nw: 2, Hw: 7.5, H: 10, pitch: 1, ad: 0.3, c: 1.4, q: 2.0, shareMin: 0.8, areaMin: 10, e: 0 };
    const a = RS.atticFloor(p, { D: 8, E: 10 }, 3);
    expect(a.total).toBeCloseTo(76, 9); // (8 - 2 x 0.2) x 10
    expect(a.counted).toBe(true);
    expect(RS.atticFloor({ ...p, shareMin: 0.95 }, { D: 8, E: 10 }, 3).counted).toBe(false);
    expect(RS.atticFloor({ ...p, H: 7.5 }, { D: 8, E: 10 }, 3).total).toBe(0); // no clearance under the limit
  });

  it('unitsFor is the P5.4 count: min(u, houseplex cap, floors), drops under the unit floor, not_buildable under minUnits', () => {
    const floors = [{ floor: 2, area: 100, in_gfa: true }, { floor: 1, area: 100, in_gfa: true }, { floor: 0, area: 100, in_gfa: false }];
    const base = { floors, uCap: null, houseplexCap: 4, circulationShare: 0.1, unitMinInteriorSqm: 30, minUnits: 2 };
    expect(RS.unitsFor(base).count).toBe(3);
    expect(RS.unitsFor({ ...base, uCap: 2 }).count).toBe(2);
    const red = RS.unitsFor({ ...base, unitMinInteriorSqm: 100 });
    expect(red.count).toBe(2); // 270 / 3 = 90 < 100; 270 / 2 = 135
    expect(red.reduced).toBe(true);
    expect(RS.unitsFor({ ...base, unitMinInteriorSqm: 200 }).status).toBe('not_buildable');
  });
});

describe('P3-4: renovation_addition (RA, P5.6)', () => {
  it('back room = max(0, F - existing footprint) x storeys; up room on frontage <= 12.2 m keeps the existing plate; GFA = up + back', () => {
    const r = run();
    expect(r.existing.footprint_sqm).toBe(80);
    expect(r.existing.gfa_sqm).toBe(160);
    expect(r.addition.back_footprint_sqm).toBe(60);
    expect(r.addition.back_gfa_sqm).toBe(180);
    expect(r.addition.up_gfa_sqm).toBe(80);
    expect(r.addition.gfa_sqm).toBe(260);
    expect(r.disclosures).toEqual(expect.arrayContaining(['renovation_position_unknown', 'addition_above_existing']));
  });

  it('above 12.2 m frontage the up plate is min(existing footprint, F); the depth cap bounds it (10.5.40.71(3), M-211(1))', () => {
    expect(run({ frontageM: 13, footprintSqm: 70 }).addition.up_gfa_sqm).toBe(70);
    expect(run({ frontageM: 13 }).disclosures).not.toContain('addition_above_existing');
    expect(run({ depthCapM: 7 }).addition.up_gfa_sqm).toBe(56); // plate <= width 8 x 7
  });

  it('where FSI applies the up room is also capped at fsi x lot - existing GFA; the smaller binds', () => {
    expect(run({ fsiCapSqm: 200 }).addition.up_gfa_sqm).toBe(40);
    expect(run({ fsiCapSqm: 100 }).addition.up_gfa_sqm).toBe(0);
  });

  it('R: the back room is capped at the existing top floor (10.10.40.10(7)); needs the storeys', () => {
    const r = run({ rearAdditionStoreyCap: true });
    expect(r.addition.back_gfa_sqm).toBe(120); // 60 x min(3, 2)
    expect(r.disclosures).toContain('rear_addition_floor_levels');
    const none = run({ rearAdditionStoreyCap: true }, { storeys: null });
    expect(none.addition.back_gfa_sqm).toBeNull();
    expect(none.needs.addition_back_gfa_sqm).toBe('not_evaluated:needs_user_input:existing_storeys');
  });

  it('the one-storey extension (M-206) adds one storey of extraLength x share x width to the back room, disclosed', () => {
    const r = run({ extension: { extraLengthM: 2, maxWidthShare: 0.5 } });
    expect(r.addition.back_footprint_sqm).toBe(68);
    expect(r.addition.back_gfa_sqm).toBe(188);
    expect(r.disclosures).toContain('one_storey_extension');
  });

  it('with no existing storeys (O-13) the up room and the addition GFA are NULL with the closed reason; the back room outside R is still computed', () => {
    const r = run({}, { storeys: null });
    expect(r.addition.up_gfa_sqm).toBeNull();
    expect(r.addition.gfa_sqm).toBeNull();
    expect(r.addition.back_gfa_sqm).toBe(180);
    expect(r.addition.back_footprint_sqm).toBe(60);
    expect(r.needs.addition_up_gfa_sqm).toBe('not_evaluated:needs_user_input:existing_storeys');
    expect(r.disclosures).toContain('existing_storeys_needed');
  });
});

describe('P3-4: renovation_envelope_expansion (RE)', () => {
  it('= renovation envelope GFA - existing GFA; NULL without storeys', () => {
    expect(run().envelopeExpansion.gfa_sqm).toBe(260);
    expect(run({ gfaSqm: 100 }).envelopeExpansion.gfa_sqm).toBe(0);
    expect(run({}, { storeys: null }).envelopeExpansion.gfa_sqm).toBeNull();
  });
});

describe('P3-4: renovation_interior (RI)', () => {
  it('attic conversion inside the existing box (larger pair, no dormers) and the unit conversion over existing floors + basement', () => {
    const r = run();
    expect(r.interior.attic_gfa_sqm).toBeCloseTo(76.8, 9);
    expect(r.interior.attic_outside_gfa_sqm).toBe(0);
    expect(r.interior.units).toBe(3); // floors 2 + basement, houseplex cap 4
    expect(r.interior.units_gain).toBe(2);
    expect(r.interior.avg_unit_gfa_sqm).toBeCloseTo(72, 9);
    expect(r.disclosures).toContain('conversion_within_building');
  });

  it('a failing attic is livable but outside GFA (M-203)', () => {
    const r = run({ attic: { ...ENV.attic, shareMin: 0.95 } });
    expect(r.interior.attic_gfa_sqm).toBe(0);
    expect(r.interior.attic_outside_gfa_sqm).toBeCloseTo(76.8, 9);
    expect(r.disclosures).toContain('attic_outside_gfa');
  });

  it('a semi-detached house is capped at the houseplex cap passed in (no fiveplex or sixplex), and a u cap applies', () => {
    expect(run({ units: { uCap: 2, houseplexCap: 4, minUnits: 2 } }).interior.units).toBe(2);
  });

  it('the unit floor drops the count; under minUnits there is no conversion (units 1, gain 0)', () => {
    expect(run({}, {}, { unitMinInteriorSqm: 100 }).interior.units).toBe(2);
    const r = run({}, {}, { unitMinInteriorSqm: 500 });
    expect(r.interior.units).toBe(1);
    expect(r.interior.units_gain).toBe(0);
  });

  it('NULL attic and units without existing storeys, with the closed reason', () => {
    const r = run({}, { storeys: null });
    expect(r.interior.attic_gfa_sqm).toBeNull();
    expect(r.interior.units).toBeNull();
    expect(r.needs.interior_attic_gfa_sqm).toBe('not_evaluated:needs_user_input:existing_storeys');
    expect(r.needs.interior_units_gain).toBe('not_evaluated:needs_user_input:existing_storeys');
  });
});

describe('P3-4: renovation_basement (RB) and basement finish (RF)', () => {
  it('RB: livable gain = existing footprint x share, never in GFA; a basement unit is possible when one unit fits', () => {
    const r = run();
    expect(r.basement.livable_gain_sqm).toBe(80);
    expect(r.basement.in_gfa).toBe(false);
    expect(r.basement.unit_possible).toBe(true);
    expect(r.disclosures).toEqual(expect.arrayContaining(['basement_excluded', 'basement_unit_grade', 'basement_headroom_code', 'basement_becomes_storey']));
    expect(r.disclosure_params.basement_excluded).toEqual({ A: 80 });
    expect(run({}, {}, { unitMinInteriorSqm: 100 }).basement.unit_possible).toBe(false);
  });

  it('RB needs no existing storeys', () => {
    expect(run({}, { storeys: null }).basement.livable_gain_sqm).toBe(80);
  });

  it('RF: only where the owner says a basement exists and enters its height; otherwise NULL', () => {
    expect(run({}, { basement: true, basementHeightM: 2.4 }).basementFinish.livable_sqm).toBe(80);
    expect(run({}, { basement: true, basementHeightM: null }).basementFinish.livable_sqm).toBeNull();
    expect(run({}, { basement: null }).basementFinish.livable_sqm).toBeNull();
    expect(run({}, { basement: false, basementHeightM: 2.4 }).basementFinish.livable_sqm).toBeNull();
  });
});

describe('P3-4: provenance, confidence and closed disclosure codes (P5.6, P5.12)', () => {
  it('estimated house -> existing_estimated; low confidence -> existing_low_confidence; entered house -> neither', () => {
    expect(run({}, { source: 'user_entered', confidence: 0.9 }).disclosures).not.toEqual(expect.arrayContaining(['existing_estimated']));
    const est = run({}, { source: 'estimated', confidence: 0.5 });
    expect(est.disclosures).toEqual(expect.arrayContaining(['existing_estimated', 'existing_low_confidence']));
    expect(est.existing.low_confidence).toBe(true);
  });

  it('every disclosure code it can write is a registered P5.12 code (vocab.json disclosure_code)', () => {
    const all = [run(), run({ rearAdditionStoreyCap: true, extension: { extraLengthM: 2, maxWidthShare: 0.5 } }, { source: 'estimated', confidence: 0.1, storeys: null }), run({ attic: { ...ENV.attic, shareMin: 0.95 } })];
    for (const r of all) for (const c of r.disclosures) expect(VOCAB.disclosure_code, c).toContain(c);
  });

  it('is deterministic, does not mutate its inputs, and a missing input throws', () => {
    const env = JSON.stringify({ ...ENV });
    const a = run();
    expect(run()).toEqual(a);
    expect(JSON.stringify({ ...ENV })).toBe(env);
    expect(() => run({}, { widthM: undefined })).toThrow(/never defaulted/);
    expect(() => run({}, {}, { basementLivableShare: undefined })).toThrow(/never defaulted/);
  });
});
