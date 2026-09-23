// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2 (Behavioral Contract)
// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 (line catalogue — the editable half)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AU (pricing DATA now admin-editable)
//
// Logic locks for scripts/lib/parcel-cost.js (the pure engine behind
// compute-parcel-cost-estimates.js). All functions are pure — no DB, no side effects.
//
// Coverage mandate (Spec 88 §2.1/2.4/2.6/2.7/2.9):
//   - escalationMultiplier: MAX(1,…) never-deflate + missing/invalid → 1.0
//   - lineCost: premium-inclusive total/per_sqm + SOLAR cost_adjustment_factor
//   - areaConfidenceFor: envelope high→low downgrade on max_build_confidence='low'
//   - buildParcelCostMenu: absent-line vs fits:false semantics, _schema_version,
//     norm_basis CoA-scoping, trades/products:null sentinel, headline scalars,
//     FSI derivation, premium fallback, counter outputs

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pc = require('../../scripts/lib/parcel-cost.js');

// Batch-2 row 2.4 — the 6 engine tunables (Rule 3), REQUIRED, mirroring the seed defaults in
// scripts/seeds/logic_variables.json (compute_parcel_cost_fsi_max_plausible=99.999,
// _escalation_min_multiplier=1, _escalation_fallback_multiplier=1, _premium_default=1,
// _adjustment_factor_default=1, _min_priceable_area_sqm=0) — value-neutral vs. the pre-conversion
// literals (FSI_MAX_PLAUSIBLE=99.999, Math.max(1,…), ?? 1 ×3, area<=0).
const CFG = {
  fsiMaxPlausible: 99.999,
  escalationMinMultiplier: 1,
  escalationFallbackMultiplier: 1,
  premiumDefault: 1,
  adjustmentFactorDefault: 1,
  minPriceableAreaSqm: 0,
};

// A representative rates map (subset of the seeded archetype_cost_rates).
const RATES = {
  FB: { cost_per_sqm: 4844, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  CoA: { cost_per_sqm: 4844, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  SOLAR: { cost_per_sqm: 377, cost_adjustment_factor: 0.75, escalation_index_base: 100 },
  LANE_GARDEN: { cost_per_sqm: 5382, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  LANE_LANEWAY: { cost_per_sqm: 5651, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  KIT: { cost_per_sqm: 3498, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  BTH: { cost_per_sqm: 4306, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  GAR: { cost_per_sqm: 1938, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  BAS_UNDERPIN: { cost_per_sqm: 1615, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  BAS: { cost_per_sqm: 753, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  INT: { cost_per_sqm: 3229, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
  ADD: { cost_per_sqm: 4306, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
};

// Batch-2 row 2.5 (FOLD A2, Spec 88 §2.3, Spec 124 R-AU) — the EDITABLE half of the 13-line
// catalogue moved to the `parcel_cost_lines` DB table (migration 248); PARCEL_COST_LINES is now
// STRUCTURAL ONLY. The fixture below is the byte-for-byte seed of that table (authored by C0,
// also read by src/tests/db/pricing-tables.db.test.ts), so `LINES` here is exactly what
// readCostContract hands the engine at runtime — the same merge the compute performs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SEED_ROWS = require('./fixtures/parcel-cost-lines.seed.json') as Array<{
  id: string;
  archetype: string;
  base_confidence: 'high' | 'medium' | 'low';
  fit_permitted_values: string[] | null;
}>;
const LINES = pc.mergeCostLines(pc.PARCEL_COST_LINES, SEED_ROWS);

/** A merged-lines variant: same rows, one line's fit vocabulary overridden (P3). */
function linesWith(fitOverrides: Record<string, string[] | null>) {
  return pc.mergeCostLines(
    pc.PARCEL_COST_LINES,
    SEED_ROWS.map((r) => (r.id in fitOverrides ? { ...r, fit_permitted_values: fitOverrides[r.id] } : r)),
  );
}

/** A merged-lines variant: an extra/removed/duplicated DB row (P2 mismatch guards). */
function linesWithRows(mutate: (rows: typeof SEED_ROWS) => typeof SEED_ROWS) {
  return pc.mergeCostLines(pc.PARCEL_COST_LINES, mutate(SEED_ROWS.map((r) => ({ ...r }))));
}

// A fully-populated detached parcel (all 13 lines computable, as_of_right suites/garage).
function fullParcel(overrides: Record<string, unknown> = {}) {
  return {
    lot_size_sqm: 400,
    max_buildable_gfa_sqm: 300,
    opt_aor_gfa_sqm: 300, // WF3: new_build prices this; == max_buildable_gfa here so existing assertions stay value-neutral
    max_buildable_footprint_sqm: 120,
    opt_coa_gfa_sqm: 360,
    max_garden_suite_gfa_sqm: 60,
    max_laneway_suite_gfa_sqm: 55,
    cur_est_kitchen_gfa_sqm: 14,
    cur_est_bath_gfa_sqm: 8,
    max_garage_gfa_sqm: 37,
    cur_floor_gfa_sqm: 110,
    cur_pot_2story_gfa_sqm: 220,
    rear_suite_permission: 'as_of_right',
    garage_permission: 'as_of_right',
    max_build_confidence: 'high',
    neighbourhood_cost_premium: 1.0,
    realized_fsi_p90: null,
    ...overrides,
  };
}

describe('escalationMultiplier — §2.9 never-deflate + fallback', () => {
  it('index above base → ratio', () => {
    expect(pc.escalationMultiplier(110, 100, CFG)).toBeCloseTo(1.1, 6);
  });
  it('index below base → floored at 1 (never deflate fresh rates)', () => {
    expect(pc.escalationMultiplier(90, 100, CFG)).toBe(1);
  });
  it('index equal base → 1', () => {
    expect(pc.escalationMultiplier(100, 100, CFG)).toBe(1);
  });
  it('missing/invalid index → 1.0 (no crash)', () => {
    expect(pc.escalationMultiplier(null, 100, CFG)).toBe(1);
    expect(pc.escalationMultiplier(undefined, 100, CFG)).toBe(1);
    expect(pc.escalationMultiplier(NaN, 100, CFG)).toBe(1);
  });
  it('invalid/zero base → 1.0', () => {
    expect(pc.escalationMultiplier(110, 0, CFG)).toBe(1);
    expect(pc.escalationMultiplier(110, null, CFG)).toBe(1);
  });
  it('accepts DB numeric strings', () => {
    expect(pc.escalationMultiplier('120', '100', CFG)).toBeCloseTo(1.2, 6);
  });
});

describe('lineCost — §2.1/2.6 premium-inclusive', () => {
  it('total = rate × escalation × adj × area × premium', () => {
    const { total, per_sqm } = pc.lineCost({
      areaSqm: 300,
      ratePerSqm: 4844,
      escalationMult: 1.1,
      adjFactor: 1.0,
      premium: 1.2,
    });
    expect(per_sqm).toBeCloseTo(4844 * 1.1 * 1.0 * 1.2, 2);
    expect(total).toBeCloseTo(4844 * 1.1 * 1.0 * 1.2 * 300, 1);
  });
  it('SOLAR 0.75 cost_adjustment_factor applies', () => {
    const { per_sqm } = pc.lineCost({
      areaSqm: 120,
      ratePerSqm: 377,
      escalationMult: 1,
      adjFactor: 0.75,
      premium: 1,
    });
    expect(per_sqm).toBeCloseTo(377 * 0.75, 2);
  });
});

describe('areaConfidenceFor — §2.7 envelope downgrade', () => {
  it('high envelope line downgrades to low when max_build_confidence=low', () => {
    expect(pc.areaConfidenceFor('high', 'low')).toBe('low');
  });
  it('high stays high when envelope is high/medium/null', () => {
    expect(pc.areaConfidenceFor('high', 'high')).toBe('high');
    expect(pc.areaConfidenceFor('high', 'medium')).toBe('high');
    expect(pc.areaConfidenceFor('high', null)).toBe('high');
  });
  it('medium/low lines are NOT downgraded by envelope confidence', () => {
    expect(pc.areaConfidenceFor('medium', 'low')).toBe('medium');
    expect(pc.areaConfidenceFor('low', 'low')).toBe('low');
  });
});

// indexNow=100 with escalation_index_base=100 → multiplier 1.0 (no escalation).
const NO_ESCALATION = 100;

describe('buildParcelCostMenu — full parcel', () => {
  const { menu, scalars, lineCount, confidenceCounts, fitGatedSuiteCount, fitGatedGarageCount } =
    pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { config: CFG, lines: LINES });

  it('emits _schema_version + all 13 lines', () => {
    expect(menu._schema_version).toBe(pc.PARCEL_COST_SCHEMA_VERSION);
    expect(lineCount).toBe(13);
    for (const line of pc.PARCEL_COST_LINES) {
      expect(menu[line.id], `line ${line.id} present`).toBeDefined();
    }
  });

  it('max_build total = rate × area × premium (premium 1.0 here)', () => {
    expect(menu.max_build.total).toBeCloseTo(4844 * 300, 1);
    expect(menu.max_build.area).toBe(300);
    expect(menu.max_build.area_confidence).toBe('high');
  });

  it('WF3: max_build (new_build) prices opt_aor_gfa, NOT the max-build envelope', () => {
    // opt_aor (250) ≠ max_buildable_gfa (300) — the line must use opt_aor, while max_build_fsi
    // (the *envelope* reference scalar) keeps deriving from max_buildable_gfa (300 ÷ 400).
    const built = pc.buildParcelCostMenu(
      fullParcel({ opt_aor_gfa_sqm: 250, max_buildable_gfa_sqm: 300 }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(built.menu.max_build.area).toBe(250);              // prices opt_aor, not 300
    expect(built.menu.max_build.total).toBeCloseTo(4844 * 250, 1);
    expect(built.scalars.cost_fb_total).toBeCloseTo(4844 * 250, 1);
    expect(built.scalars.max_build_fsi).toBeCloseTo(300 / 400, 3); // envelope FSI unchanged (max_buildable_gfa)
  });

  it('solar_coa equals solar_max (footprint capped → same roof)', () => {
    expect(menu.solar_coa.total).toBe(menu.solar_max.total);
    expect(menu.solar_max.total).toBeCloseTo(377 * 0.75 * 120, 1);
  });

  it('trades/products are null sentinels on every line (P1)', () => {
    for (const line of pc.PARCEL_COST_LINES) {
      expect(menu[line.id].trades).toBeNull();
      expect(menu[line.id].products).toBeNull();
    }
  });

  it('norm_basis is CoA-line-scoped (pre_r2 by default, n/a elsewhere)', () => {
    expect(menu.coa_build.norm_basis).toBe('pre_r2'); // no r2Grounded opt → by-law
    expect(menu.max_build.norm_basis).toBe('n/a');
    expect(menu.kitchen.norm_basis).toBe('n/a');
  });

  it('norm_basis flips to r2_refined on coa_build when r2Grounded (detached, Spec 78 P2 R2)', () => {
    const built = pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { r2Grounded: true, config: CFG, lines: LINES });
    expect(built.menu.coa_build.norm_basis).toBe('r2_refined');
    expect(built.menu.max_build.norm_basis).toBe('n/a'); // non-CoA lines unchanged
    // townhouse/multiplex/generic (r2Grounded falsey) stay pre_r2
    expect(pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { r2Grounded: false, config: CFG, lines: LINES }).menu.coa_build.norm_basis).toBe('pre_r2');
  });

  it('fits key present + true on fit-gated lines, absent on others', () => {
    expect(menu.garden_suite.fits).toBe(true);
    expect(menu.laneway_suite.fits).toBe(true);
    expect(menu.garage.fits).toBe(true);
    expect('fits' in menu.max_build).toBe(false);
    expect('fits' in menu.kitchen).toBe(false);
    expect(fitGatedSuiteCount).toBe(0);
    expect(fitGatedGarageCount).toBe(0);
  });

  it('per_sqm headline scalars for kitchen/bath/basement(+underpin); totals for the rest', () => {
    expect(scalars.cost_kitchen_per_sqm).toBeCloseTo(3498, 2);
    expect(scalars.cost_bath_per_sqm).toBeCloseTo(4306, 2);
    expect(scalars.cost_basement_per_sqm).toBeCloseTo(753, 2);
    expect(scalars.cost_basement_underpin_per_sqm).toBeCloseTo(1615, 2);
    expect(scalars.cost_fb_total).toBeCloseTo(4844 * 300, 1);
    expect(scalars.cost_gut_total).toBeCloseTo(3229 * 220, 1);
    expect(scalars.cost_addition_total).toBeCloseTo(4306 * 110, 1);
  });

  it('FSI scalars derived from GFA ÷ lot; realized_fsi_p90 read-through (null in P1)', () => {
    expect(scalars.max_build_fsi).toBeCloseTo(300 / 400, 3);
    expect(scalars.coa_fsi).toBeCloseTo(360 / 400, 3);
    expect(scalars.realized_fsi_p90).toBeNull();
  });

  it('implausible FSI (garbage max_buildable_gfa) is NULLed + flagged, never overflows the column', () => {
    // a 111 m² lot with a 115,825 m² max-build → FSI ~1042 (a tree-contaminated massing artifact)
    const built = pc.buildParcelCostMenu(
      fullParcel({ lot_size_sqm: 111, max_buildable_gfa_sqm: 115825 }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(built.scalars.max_build_fsi).toBeNull();  // NULLed, not 1042 (would overflow NUMERIC(6,3))
    expect(built.fsiImplausible).toBe(true);
    // a plausible FSI is kept
    expect(pc.plausibleFsi(300, 400, CFG.fsiMaxPlausible)).toEqual({ fsi: 0.75, implausible: false });
    expect(pc.plausibleFsi(115825, 111, CFG.fsiMaxPlausible).fsi).toBeNull();
    expect(pc.FSI_MAX_PLAUSIBLE).toBe(99.999);
  });

  // Guardian carry-item (slice-0 output-panel peel, 2026-09-22) — S0.2 (commit 06dcd330,
  // scripts/lib/compute/compute-parcel-cost-estimates.js buildSourceSql/buildZoneSql)
  // narrowed compute_parcel_cost_estimates' SQL population to
  // `cur_floor_gfa_sqm IS NULL OR cur_floor_gfa_sqm <= product_scope_max_existing_gfa_sqm`
  // (default 750). Plan §5A.1's fence table promised "each [population-narrowing S0.2
  // caller] re-assert the [FSI plausibility] guard still fires on a synthetic over-bound
  // row" — never added at S0.2's own commit. `plausibleFsi`/`buildParcelCostMenu` are pure
  // (no DB access, never see the SQL population filter directly), so this fixture proves
  // the guard by SHAPE: cur_floor_gfa_sqm=110 (<= the 750 default — a row S0.2's WHERE
  // clause KEEPS in the priced population, not one it excludes) combined with the SAME
  // garbage max_buildable_gfa/lot_size_sqm ratio as the test above — the guard (aea1d402,
  // lessons.md:69) must still NULL+flag the FSI for a row genuinely inside S0.2's
  // narrowed scope, proving S0.2's population narrowing and the pre-existing FSI
  // plausibility guard are independent, non-interfering gates.
  it('S0.2 re-assertion: the FSI plausibility guard still fires on a synthetic over-bound row that IS inside S0.2\'s product-scope population (cur_floor_gfa_sqm <= 750)', () => {
    const inScopeOverBound = fullParcel({
      cur_floor_gfa_sqm: 110, // <= product_scope_max_existing_gfa_sqm default (750) — S0.2 KEEPS this row
      lot_size_sqm: 111,
      max_buildable_gfa_sqm: 115825, // same garbage massing-contamination shape as the guard's own test above
    });
    expect(inScopeOverBound.cur_floor_gfa_sqm).toBeLessThanOrEqual(750);
    const built = pc.buildParcelCostMenu(inScopeOverBound, RATES, NO_ESCALATION, { config: CFG, lines: LINES });
    expect(built.scalars.max_build_fsi).toBeNull();
    expect(built.fsiImplausible).toBe(true);
  });

  it('gut line is low-confidence (storey-multiplied); basement/addition medium', () => {
    expect(menu.gut.area_confidence).toBe('low');
    expect(menu.basement.area_confidence).toBe('medium');
    expect(menu.addition.area_confidence).toBe('medium');
    expect(confidenceCounts.low).toBe(1);
    expect(confidenceCounts.high).toBeGreaterThan(0);
    expect(confidenceCounts.medium).toBeGreaterThan(0);
  });
});

describe('buildParcelCostMenu — absent-line vs fits:false (§2.4)', () => {
  it('NULL area field → line key ABSENT (not computable)', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ max_garage_gfa_sqm: null, opt_coa_gfa_sqm: null }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect('garage' in menu).toBe(false);
    expect('coa_build' in menu).toBe(false);
  });

  it('zero/negative area → absent (never $0 line)', () => {
    const { menu } = pc.buildParcelCostMenu(fullParcel({ cur_floor_gfa_sqm: 0 }), RATES, NO_ESCALATION, { config: CFG, lines: LINES });
    expect('basement' in menu).toBe(false);
    expect('addition' in menu).toBe(false);
  });

  it('non-NULL area but permission not permitted → present + priced + fits:false', () => {
    const { menu, fitGatedGarageCount, fitGatedSuiteCount } = pc.buildParcelCostMenu(
      fullParcel({ garage_permission: 'prohibited', rear_suite_permission: 'not_permitted' }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(menu.garage.fits).toBe(false);
    expect(menu.garage.total).toBeGreaterThan(0); // still priced (hypothetical)
    expect(menu.garden_suite.fits).toBe(false);
    expect(fitGatedGarageCount).toBe(1);
    expect(fitGatedSuiteCount).toBe(2); // garden + laneway
  });

  it('coa_required permission counts as fits:true', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ garage_permission: 'coa_required' }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(menu.garage.fits).toBe(true);
  });
});

describe('buildParcelCostMenu — premium + confidence edges', () => {
  it('NULL neighbourhood_cost_premium → 1.0 fallback', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ neighbourhood_cost_premium: null }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(menu.max_build.total).toBeCloseTo(4844 * 300, 1);
  });

  it('premium 1.85 scales every total', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ neighbourhood_cost_premium: 1.85 }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(menu.max_build.total).toBeCloseTo(4844 * 300 * 1.85, 1);
  });

  it('max_build_confidence=low → envelope lines emit at low (never skipped)', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ max_build_confidence: 'low' }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: LINES },
    );
    expect(menu.max_build.area_confidence).toBe('low');
    expect(menu.garden_suite.area_confidence).toBe('low');
    expect(menu.max_build.total).toBeGreaterThan(0);
    // medium lines unaffected
    expect(menu.kitchen.area_confidence).toBe('medium');
  });

  it('escalation multiplier (index_now ÷ base) flows into totals', () => {
    // indexNow=110, escalation_index_base=100 → MAX(1, 1.1) = 1.1×
    const { menu } = pc.buildParcelCostMenu(fullParcel(), RATES, 110, { config: CFG, lines: LINES });
    expect(menu.max_build.total).toBeCloseTo(4844 * 1.1 * 300, 1);
  });

  it('index_now below base does NOT deflate totals (per-archetype MAX(1,…))', () => {
    const { menu } = pc.buildParcelCostMenu(fullParcel(), RATES, 80, { config: CFG, lines: LINES });
    expect(menu.max_build.total).toBeCloseTo(4844 * 300, 1);
  });
});

describe('buildParcelCostMenu / escalationMultiplier / plausibleFsi — config is REQUIRED (batch-2 row 2.4, Rule 3 / Spec 122 §1.2a P4)', () => {
  it('buildParcelCostMenu throws a named error when opts.config is absent — no defaulted engine tunable', () => {
    expect(() => pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION)).toThrow(/requires opts\.config/);
    expect(() => pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, {})).toThrow(/requires opts\.config/);
  });
  it('escalationMultiplier throws a named error when cfg is absent or incomplete', () => {
    expect(() => pc.escalationMultiplier(110, 100)).toThrow(/requires cfg/);
    expect(() => pc.escalationMultiplier(110, 100, { escalationMinMultiplier: 1 })).toThrow(/requires cfg/);
  });
  it('plausibleFsi throws a named error when fsiMaxPlausible is absent/non-finite', () => {
    expect(() => pc.plausibleFsi(300, 400)).toThrow(/requires a finite fsiMaxPlausible/);
    expect(() => pc.plausibleFsi(300, 400, NaN)).toThrow(/requires a finite fsiMaxPlausible/);
  });
});

// Batch-2 row 2.5 (FOLD A2) — P1. The catalogue the engine prices from is no longer a module
// literal: opts.lines is REQUIRED, mirroring opts.config's own guard (batch-2 row 2.4).
describe('buildParcelCostMenu — P1: opts.lines is REQUIRED (batch-2 row 2.5, Spec 88 §2.3 / Spec 124 R-AU)', () => {
  it('throws a named error naming opts.lines when it is absent', () => {
    expect(() => pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { config: CFG })).toThrow(/requires opts\.lines/);
    expect(() => pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { config: CFG, lines: undefined })).toThrow(/requires opts\.lines/);
  });

  it('runs off the SUPPLIED lines — a subset array yields only those lines (RED: the old literal array always priced all 13)', () => {
    const subset = LINES.filter((l: { id: string }) => l.id === 'max_build');
    const { menu, lineCount } = pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { config: CFG, lines: subset });
    expect(lineCount).toBe(1);
    expect('max_build' in menu).toBe(true);
    expect('kitchen' in menu).toBe(false);
  });
});

// Batch-2 row 2.5 (FOLD A2) — P2. mergeCostLines is the id-set + vocabulary guard between the
// frozen structural bindings (PARCEL_COST_LINES) and the editable parcel_cost_lines DB rows.
describe('mergeCostLines — P2: the id-set + fit-vocabulary guard (batch-2 row 2.5)', () => {
  it('13 structural + 13 matching rows → 13 merged lines, structural fields preserved + DB fields joined', () => {
    expect(LINES).toHaveLength(13);
    const byId = new Map(LINES.map((l: { id: string }) => [l.id, l]));
    expect([...byId.keys()].sort()).toEqual(SEED_ROWS.map((r) => r.id).sort());
    const maxBuild = byId.get('max_build') as Record<string, unknown>;
    expect(maxBuild.archetype).toBe('FB');            // from the DB row
    expect(maxBuild.baseConfidence).toBe('high');     // from the DB row
    expect(maxBuild.areaField).toBe('opt_aor_gfa_sqm'); // structural — unchanged
    expect(maxBuild.scalar).toBe('cost_fb_total');    // structural — unchanged
    expect(maxBuild.fitPermittedValues).toBeNull();
    const garden = byId.get('garden_suite') as Record<string, unknown>;
    expect(garden.fitField).toBe('rear_suite_permission');       // structural
    expect(garden.fitPermittedValues).toEqual(['as_of_right', 'coa_required']); // DB
  });

  it('a DB row whose id is unknown to PARCEL_COST_LINES throws', () => {
    expect(() => linesWithRows((rows) => [...rows, { id: 'not_a_line', archetype: 'FB', base_confidence: 'high', fit_permitted_values: null }]))
      .toThrow(/\[parcel-cost\] mergeCostLines: parcel_cost_lines id is unknown to PARCEL_COST_LINES: not_a_line/);
  });

  it('a structural id with no DB row throws', () => {
    expect(() => linesWithRows((rows) => rows.filter((r) => r.id !== 'gut')))
      .toThrow(/\[parcel-cost\] mergeCostLines: PARCEL_COST_LINES id has no parcel_cost_lines row: gut/);
  });

  it('a duplicate DB id throws', () => {
    // noUncheckedIndexedAccess: rows[0] is `T | undefined` — the array is never empty here
    // (13 seed rows), so the non-null assertion is safe; a plain spread of `T | undefined`
    // widens every property to optional and fails the linesWithRows return type.
    expect(() => linesWithRows((rows) => [...rows, { ...rows[0]! }]))
      .toThrow(/\[parcel-cost\] mergeCostLines: duplicate parcel_cost_lines id: max_build/);
  });

  it('a fit-gated line with a null vocabulary throws', () => {
    expect(() => linesWith({ garage: null }))
      .toThrow(/\[parcel-cost\] mergeCostLines: fit-gated line garage has a null parcel_cost_lines\.fit_permitted_values/);
  });

  it('a non-fit-gated line with a non-null vocabulary throws', () => {
    expect(() => linesWith({ kitchen: ['as_of_right'] }))
      .toThrow(/\[parcel-cost\] mergeCostLines: non-fit-gated line kitchen has a non-null parcel_cost_lines\.fit_permitted_values/);
  });
});

// Batch-2 row 2.5 (FOLD A2) — P3. `fits` is driven by the MERGED `fitPermittedValues` vocabulary.
// RED before this change: the module-level PERMITTED_VALUES Set ignored the DB row entirely, so
// narrowing a line's vocabulary had no effect.
describe('buildParcelCostMenu — P3: fits is driven by the merged row vocabulary (batch-2 row 2.5)', () => {
  it("a DB vocabulary of ['as_of_right'] makes coa_required NOT fit — the row wins over the old literal Set", () => {
    const narrowed = linesWith({ garden_suite: ['as_of_right'], laneway_suite: ['as_of_right'], garage: ['as_of_right'] });
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ rear_suite_permission: 'coa_required', garage_permission: 'as_of_right' }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: narrowed },
    );
    expect(menu.garden_suite.fits).toBe(false);
    expect(menu.laneway_suite.fits).toBe(false);
    expect(menu.garage.fits).toBe(true);
  });

  it("a DB vocabulary of ['as_of_right','coa_required'] makes coa_required fit", () => {
    const widened = linesWith({ garden_suite: ['as_of_right', 'coa_required'] });
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ rear_suite_permission: 'coa_required' }),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: widened },
    );
    expect(menu.garden_suite.fits).toBe(true);
  });

  it('an empty vocabulary makes every permission not-fit (proves the array is genuinely consulted)', () => {
    const emptied = linesWith({ garden_suite: [], laneway_suite: [], garage: [] });
    const { menu, fitGatedSuiteCount, fitGatedGarageCount } = pc.buildParcelCostMenu(
      fullParcel(),
      RATES,
      NO_ESCALATION,
      { config: CFG, lines: emptied },
    );
    expect(menu.garden_suite.fits).toBe(false);
    expect(menu.garage.fits).toBe(false);
    expect(fitGatedSuiteCount).toBe(2);
    expect(fitGatedGarageCount).toBe(1);
  });
});

describe('PARCEL_COST_LINES — map integrity', () => {
  it('13 structural lines, ids unique, every archetype seeded in RATES via the MERGED catalogue', () => {
    expect(pc.PARCEL_COST_LINES.length).toBe(13);
    const ids = pc.PARCEL_COST_LINES.map((l: { id: string }) => l.id);
    expect(new Set(ids).size).toBe(13);
    // Batch-2 row 2.5 — the structural array no longer carries `archetype`; the lock now reads
    // the DB-joined half (the fixture of the 13 partition rows), which is what the engine prices.
    expect(LINES.length).toBe(13);
    for (const line of LINES) {
      expect(RATES[line.archetype as keyof typeof RATES], `rate for ${line.archetype}`).toBeDefined();
    }
  });

  it('structural-only: no archetype / baseConfidence literal survives on PARCEL_COST_LINES', () => {
    for (const line of pc.PARCEL_COST_LINES) {
      expect('archetype' in line, `${line.id} must not carry archetype`).toBe(false);
      expect('baseConfidence' in line, `${line.id} must not carry baseConfidence`).toBe(false);
    }
    // baseConfidence still arrives — from the DB row, on the merged object.
    expect(LINES.every((l: { baseConfidence: string }) => ['high', 'medium', 'low'].includes(l.baseConfidence))).toBe(true);
  });

  it('exactly the 12 §2.5 headline scalars are wired (solar_coa shares cost_solar_total)', () => {
    const scalarLines = pc.PARCEL_COST_LINES.filter((l: { scalar: string | null }) => l.scalar);
    expect(scalarLines.length).toBe(12);
  });
});

// Batch-2 row 2.5, Spec 124 R-AU — PERMITTED_VALUES is retired; the vocabulary lives in the
// `parcel_cost_lines` table (fit_permitted_values) and the merged line object. Verified with a
// repo-wide search before deletion (its only reader was inside this module).
describe('PERMITTED_VALUES — retired (batch-2 row 2.5, Spec 124 R-AU)', () => {
  it('is no longer exported by the engine', () => {
    expect(pc.PERMITTED_VALUES).toBeUndefined();
  });

  it('the vocabulary reaches the engine only through the merged line row', () => {
    const garden = LINES.find((l: { id: string }) => l.id === 'garden_suite') as { fitPermittedValues: string[] };
    expect(garden.fitPermittedValues).toEqual(['as_of_right', 'coa_required']);
  });
});
