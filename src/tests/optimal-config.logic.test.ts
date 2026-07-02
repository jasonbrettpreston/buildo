// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-2 (optimal-config engine)
//
// Logic locks for scripts/lib/optimal-config.js — the pure by-law budget-allocation engine:
//  - garden footprint = min(40% rear-yard, 60); soft-landscape 50/25 by frontage; height by separation
//  - side/rear setback rules; main-build GFA NULL-FSI guard; suite-fit vs the CURRENT building (§P)
//  - CoA = storeys-not-footprint; through-lot → no suite; holding → gated; binding-constraint selection
//  - trade-off resolver (suite adds value); whole-parcel computeOptimalConfig orchestration

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const oc = require('../../scripts/lib/optimal-config.js');

describe('optimal-config by-law rule helpers', () => {
  it('garden footprint cap = lesser of 40% rear-yard and 60 m²', () => {
    expect(oc.gardenSuiteFootprintCap(100)).toBe(40);   // 40% of 100 = 40 < 60
    expect(oc.gardenSuiteFootprintCap(200)).toBe(60);   // 40% of 200 = 80 → capped at 60
    expect(oc.gardenSuiteFootprintCap(0)).toBe(0);
    expect(oc.gardenSuiteFootprintCap(null)).toBe(0);
  });

  it('soft-landscape fraction = 50% when frontage > 6.0, else 25%', () => {
    expect(oc.softLandscapeFrac(6.1)).toBe(0.5);
    expect(oc.softLandscapeFrac(10)).toBe(0.5);
    expect(oc.softLandscapeFrac(6.0)).toBe(0.25);   // boundary: ≤ 6.0 → narrow
    expect(oc.softLandscapeFrac(5)).toBe(0.25);
  });

  it('garden height by separation: ≥7.5→6.0, ≥5.0→4.0, <5.0→null', () => {
    expect(oc.gardenHeightForSeparation(8)).toBe(6.0);
    expect(oc.gardenHeightForSeparation(7.5)).toBe(6.0);
    expect(oc.gardenHeightForSeparation(5.0)).toBe(4.0);
    expect(oc.gardenHeightForSeparation(6)).toBe(4.0);
    expect(oc.gardenHeightForSeparation(4.9)).toBeNull();
  });

  it('side setback = max(floor, 10% frontage) cap 3.0; floor 1.5 with openings / 0.6 without', () => {
    expect(oc.sideSetback(10, false)).toBeCloseTo(1.0, 5);   // 10% of 10 = 1.0 > 0.6
    expect(oc.sideSetback(5, false)).toBeCloseTo(0.6, 5);    // 10% of 5 = 0.5 < 0.6 floor
    expect(oc.sideSetback(5, true)).toBeCloseTo(1.5, 5);     // openings floor 1.5
    expect(oc.sideSetback(40, false)).toBeCloseTo(3.0, 5);   // 10% of 40 = 4.0 → cap 3.0
  });

  it('rear setback: through-lot→adjacent front; deep lot→max(½h,1.5); else 1.5', () => {
    expect(oc.rearSetback({ depthM: 30, suiteHeightM: 4, isThroughLot: false })).toBe(1.5);
    expect(oc.rearSetback({ depthM: 50, suiteHeightM: 6, isThroughLot: false })).toBe(3.0); // ½×6=3.0
    expect(oc.rearSetback({ depthM: 50, suiteHeightM: 2, isThroughLot: false })).toBe(1.5); // ½×2=1.0 < 1.5
    expect(oc.rearSetback({ isThroughLot: true, adjacentFrontSetbackM: 6 })).toBe(6);
  });
});

describe('optimal-config main-build GFA — NULL-FSI guard', () => {
  it('falls back to footprint×storeys when fsiCap is null (never unbounded)', () => {
    const r = oc.mainBuildGfa({ footprintSqm: 100, storeys: 2, lotSizeSqm: 400, fsiCap: null });
    expect(r.gfa).toBe(200);
    expect(r.binding).toBe('coverage');
  });

  it('binds on FSI when fsi×lot < footprint×storeys', () => {
    const r = oc.mainBuildGfa({ footprintSqm: 100, storeys: 3, lotSizeSqm: 400, fsiCap: 0.6 });
    expect(r.gfa).toBe(240);          // 0.6 × 400 = 240 < 300
    expect(r.binding).toBe('fsi');
  });

  it('binds on coverage when footprint×storeys < fsi×lot', () => {
    const r = oc.mainBuildGfa({ footprintSqm: 100, storeys: 2, lotSizeSqm: 400, fsiCap: 1.0 });
    expect(r.gfa).toBe(200);          // 200 < 400
    expect(r.binding).toBe('coverage');
  });
});

describe('optimal-config garden suite fit (conservative, vs current building §P)', () => {
  const base = {
    frontageM: 10, lotSizeSqm: 400, rearYardAreaSqm: 150, rearBehindMaxM: 12,
    existingAncillarySqm: 0, mainGfaSqm: 250, isThroughLot: false,
  };

  it('fits with a compliant footprint, height and GFA < main', () => {
    const r = oc.gardenSuiteFit(base);
    expect(r.fits).toBe(true);
    expect(r.footprintSqm).toBeLessThanOrEqual(60);
    expect(r.footprintSqm).toBeLessThanOrEqual((1 - 0.5) * 150); // soft-landscape floor respected
    expect(r.gfaSqm).toBeLessThan(base.mainGfaSqm);
    expect([4.0, 6.0]).toContain(r.heightM);
  });

  it('through-lot → no rear-yard suite (binding=through_lot)', () => {
    const r = oc.gardenSuiteFit({ ...base, isThroughLot: true });
    expect(r.fits).toBe(false);
    expect(r.binding).toBe('through_lot');
  });

  it('20% all-ancillary cap consumed by an existing garage → binding=coverage', () => {
    const r = oc.gardenSuiteFit({ ...base, existingAncillarySqm: 80 }); // 0.2×400=80 → no headroom
    expect(r.fits).toBe(false);
    expect(r.binding).toBe('coverage');
  });

  it('insufficient rear depth to clear the 5.0 m separation → binding=depth', () => {
    const r = oc.gardenSuiteFit({ ...base, rearBehindMaxM: 3 });
    expect(r.fits).toBe(false);
    expect(r.binding).toBe('depth');
  });

  it('suite GFA cannot exceed the main-house GFA (suppressed when it would)', () => {
    const r = oc.gardenSuiteFit({ ...base, mainGfaSqm: 30 }); // tiny main → suite GFA ≥ main
    expect(r.fits).toBe(false);
    expect(r.binding).toBe('fsi');
  });
});

describe('optimal-config laneway suite fit', () => {
  it('fits when ≥3.5 m lane abuts and headroom exists', () => {
    const r = oc.lanewaySuiteFit({ abutsLanewayM: 4, lotSizeSqm: 400, existingAncillarySqm: 0, mainGfaSqm: 250 });
    expect(r.fits).toBe(true);
    expect(r.footprintSqm).toBeLessThanOrEqual(60);
  });

  it('no lane (or < 3.5 m) → binding=no_lane', () => {
    expect(oc.lanewaySuiteFit({ abutsLanewayM: 0, lotSizeSqm: 400 }).binding).toBe('no_lane');
    expect(oc.lanewaySuiteFit({ abutsLanewayM: 3.4, lotSizeSqm: 400 }).binding).toBe('no_lane');
  });
});

describe('optimal-config whole-parcel computeOptimalConfig', () => {
  const lot = {
    lotSizeSqm: 400, frontageM: 12, depthM: 35, coverageCapFrac: 0.35,
    maxBuildableFootprintSqm: 140, fsiCap: null, nbhdStoreysP50: 2, nbhdStoreysP90: 3,
    rearYardAreaSqm: 150, rearBehindMaxM: 12, existingAncillarySqm: 0,
    lotSizeConfidence: 'high', abutsLanewayM: 0,
  };

  it('CoA-upside is storeys-not-footprint: same footprint, higher storeys/GFA than as-of-right', () => {
    const c = oc.computeOptimalConfig(lot);
    expect(c.as_of_right.main_footprint_sqm).toBe(c.coa_upside.main_footprint_sqm); // CoA = up, not out
    expect(c.coa_upside.main_storeys).toBeGreaterThan(c.as_of_right.main_storeys);
    expect(c.coa_upside.main_gfa_sqm).toBeGreaterThan(c.as_of_right.main_gfa_sqm);
    expect(c.opt_coa_gfa_uplift_sqm).toBeGreaterThan(0);
  });

  it('WF3: as-of-right storeys capped at maxBuildStories (envelope); CoA (p90) NOT capped', () => {
    // nbhd typically builds 2 (p50) but THIS parcel's envelope caps at 1 storey.
    const c = oc.computeOptimalConfig({ ...lot, maxBuildStories: 1 });
    expect(c.as_of_right.main_storeys).toBe(1);                            // capped from p50=2 → 1
    expect(c.as_of_right.main_gfa_sqm).toBe(c.as_of_right.main_footprint_sqm); // footprint × 1
    expect(c.coa_upside.main_storeys).toBe(3);                             // p90 uncapped — CoA upside intact
    expect(c.coa_upside.main_gfa_sqm).toBeGreaterThan(c.as_of_right.main_gfa_sqm);
  });

  it('WF3: no cap when maxBuildStories is null, ≥ p50, or == p50 (fallback = max_build_stories → no-op, F8)', () => {
    expect(oc.computeOptimalConfig(lot).as_of_right.main_storeys).toBe(2);                              // null → uncapped
    expect(oc.computeOptimalConfig({ ...lot, maxBuildStories: 5 }).as_of_right.main_storeys).toBe(2);   // ≥ p50 → no-op
    expect(oc.computeOptimalConfig({ ...lot, maxBuildStories: 2 }).as_of_right.main_storeys).toBe(2);   // == p50 → no-op
  });

  it('emits a fitting suite + suite_adds_value when a rear yard accommodates one', () => {
    const c = oc.computeOptimalConfig(lot);
    expect(c.opt_suite_fits_full).toBe(true);
    expect(c.opt_suite_type).toBe('garden');
    expect(c.opt_suite_adds_value).toBe(true);
    expect(c.as_of_right.total_gfa_sqm).toBeGreaterThan(c.as_of_right.main_gfa_sqm);
  });

  it('prefers a laneway suite when a lane abuts', () => {
    const c = oc.computeOptimalConfig({ ...lot, abutsLanewayM: 4 });
    expect(c.opt_suite_type).toBe('laneway');
  });

  it('holding zone gates the as-of-right suite and sets binding=holding', () => {
    const c = oc.computeOptimalConfig({ ...lot, isHolding: true });
    expect(c.as_of_right.suite).toBeNull();
    expect(c.opt_binding_constraint).toBe('holding');
  });

  it('confidence degrades to low when lot-size confidence is low', () => {
    expect(oc.computeOptimalConfig({ ...lot, lotSizeConfidence: 'low' }).opt_config_confidence).toBe('low');
  });

  it('bylaw_version is stamped on every result', () => {
    expect(oc.computeOptimalConfig(lot).bylaw_version).toBe('569-2013_consolidation_2025');
  });

  // R2 (Spec 78 P2): the CoA tier is grounded in the REALIZED detached FSI p90, not the by-law FSI.
  const r2lot = {
    lotSizeSqm: 400, maxBuildableFootprintSqm: 140, coverageCapFrac: 0.35,
    fsiCap: 1.0, nbhdStoreysP50: 2, nbhdStoreysP90: 3, lotSizeConfidence: 'high', rearYardAreaSqm: 0,
  };

  it('R2: realizedFsiP90 above the by-law FSI lifts the CoA GFA (grounded in what neighbours build)', () => {
    const bylawOnly = oc.computeOptimalConfig(r2lot);                        // no realizedFsiP90 → by-law
    const r2 = oc.computeOptimalConfig({ ...r2lot, realizedFsiP90: 1.5 });   // realized > by-law
    expect(bylawOnly.coa_upside.main_gfa_sqm).toBeCloseTo(400, 5);           // MIN(140×3, 1.0×400) = 400 (by-law FSI)
    expect(r2.coa_upside.main_gfa_sqm).toBeCloseTo(420, 5);                  // MIN(140×3, 1.5×400) = 420 (coverage-bound)
    expect(r2.coa_upside.main_gfa_sqm).toBeGreaterThan(bylawOnly.coa_upside.main_gfa_sqm);
    expect(r2.as_of_right.main_gfa_sqm).toBe(bylawOnly.as_of_right.main_gfa_sqm); // as-of-right UNCHANGED (by-law)
  });

  it('R2 invariant: realizedFsiP90 below as-of-right density floors CoA at as-of-right (opt_coa ≥ opt_aor)', () => {
    const r2 = oc.computeOptimalConfig({ ...r2lot, fsiCap: 2.0, realizedFsiP90: 0.5 });
    // realized-grounded CoA = MIN(140×3, 0.5×400=200) = 200 < as-of-right 280 → floored to 280.
    expect(r2.coa_upside.main_gfa_sqm).toBe(r2.as_of_right.main_gfa_sqm);
    expect(r2.coa_upside.main_gfa_binding).toBe('realized_fsi_floor');
    expect(r2.opt_coa_gfa_uplift_sqm).toBe(0);
    // Guardian F3: the floored CoA IS the as-of-right build → storeys floor too (not a stray p90).
    expect(r2.coa_upside.main_storeys).toBe(r2.as_of_right.main_storeys);
  });

  it('R2: no realizedFsiP90 (null) preserves the by-law CoA behaviour (backward-compatible)', () => {
    const noNorm = oc.computeOptimalConfig({ ...r2lot, realizedFsiP90: null });
    const bylaw = oc.computeOptimalConfig(r2lot);
    expect(noNorm.coa_upside.main_gfa_sqm).toBe(bylaw.coa_upside.main_gfa_sqm);
  });
});

describe('optimal-config review-fold fixes (Phase 2 output review)', () => {
  it('shares the 20% ancillary cap: a suite that consumes it leaves no garage headroom', () => {
    // lot 250 → cap 50; a deep rear yard lets the garden suite claim the full 50 m² footprint.
    const c = oc.computeOptimalConfig({
      lotSizeSqm: 250, frontageM: 10, depthM: 35, maxBuildableFootprintSqm: 100, fsiCap: null,
      nbhdStoreysP50: 2, nbhdStoreysP90: 3, rearYardAreaSqm: 150, rearBehindMaxM: 20,
      existingAncillarySqm: 0, lotSizeConfidence: 'high', abutsLanewayM: 0,
    });
    const suiteFp = c.as_of_right.suite ? c.as_of_right.suite.footprintSqm : 0;
    const garageFp = c.as_of_right.garage.fits ? c.as_of_right.garage.footprintSqm : 0;
    expect(suiteFp).toBe(50);                 // suite takes the whole 20% headroom
    expect(c.as_of_right.garage.fits).toBe(false); // garage gets the (zero) remainder
    expect(suiteFp + garageFp).toBeLessThanOrEqual(0.2 * 250); // combined never exceeds the 20% cap
  });

  it('accepts a boolean abuts_laneway when no metre value is supplied (Phase-3 source)', () => {
    expect(oc.lanewayAbutmentOk({ abutsLaneway: true })).toBe(true);
    expect(oc.lanewayAbutmentOk({ abutsLaneway: false })).toBe(false);
    expect(oc.lanewayAbutmentOk({ abutsLanewayM: 4 })).toBe(true);       // metres signal preferred
    expect(oc.lanewayAbutmentOk({ abutsLanewayM: 3, abutsLaneway: true })).toBe(false); // metres wins
    const c = oc.computeOptimalConfig({
      lotSizeSqm: 400, frontageM: 12, depthM: 35, maxBuildableFootprintSqm: 140, fsiCap: null,
      nbhdStoreysP50: 2, rearYardAreaSqm: 150, rearBehindMaxM: 12, existingAncillarySqm: 0,
      lotSizeConfidence: 'high', abutsLaneway: true, // boolean only, no metres
    });
    expect(c.opt_suite_type).toBe('laneway');
  });

  it('binding reflects the laneway-first path when a lane abuts (not the garden re-run)', () => {
    // lane abuts; laneway misses on GFA<main (fsi); garden would miss on depth. Old code re-ran garden
    // and wrongly reported "depth"; the recorded suite_binding must be the laneway path's "fsi".
    const c = oc.computeOptimalConfig({
      lotSizeSqm: 400, frontageM: 12, depthM: 35, maxBuildableFootprintSqm: 25, fsiCap: null,
      nbhdStoreysP50: 2, rearYardAreaSqm: 150, rearBehindMaxM: 2, existingAncillarySqm: 0,
      lotSizeConfidence: 'high', abutsLaneway: true,
    });
    expect(c.opt_suite_fits_full).toBe(false);
    expect(c.opt_binding_constraint).toBe('fsi');   // laneway's miss reason, not garden's 'depth'
  });
});
