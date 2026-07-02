// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2 (Behavioral Contract)
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
    expect(pc.escalationMultiplier(110, 100)).toBeCloseTo(1.1, 6);
  });
  it('index below base → floored at 1 (never deflate fresh rates)', () => {
    expect(pc.escalationMultiplier(90, 100)).toBe(1);
  });
  it('index equal base → 1', () => {
    expect(pc.escalationMultiplier(100, 100)).toBe(1);
  });
  it('missing/invalid index → 1.0 (no crash)', () => {
    expect(pc.escalationMultiplier(null, 100)).toBe(1);
    expect(pc.escalationMultiplier(undefined, 100)).toBe(1);
    expect(pc.escalationMultiplier(NaN, 100)).toBe(1);
  });
  it('invalid/zero base → 1.0', () => {
    expect(pc.escalationMultiplier(110, 0)).toBe(1);
    expect(pc.escalationMultiplier(110, null)).toBe(1);
  });
  it('accepts DB numeric strings', () => {
    expect(pc.escalationMultiplier('120', '100')).toBeCloseTo(1.2, 6);
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
    pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION);

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
    const built = pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { r2Grounded: true });
    expect(built.menu.coa_build.norm_basis).toBe('r2_refined');
    expect(built.menu.max_build.norm_basis).toBe('n/a'); // non-CoA lines unchanged
    // townhouse/multiplex/generic (r2Grounded falsey) stay pre_r2
    expect(pc.buildParcelCostMenu(fullParcel(), RATES, NO_ESCALATION, { r2Grounded: false }).menu.coa_build.norm_basis).toBe('pre_r2');
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
    );
    expect(built.scalars.max_build_fsi).toBeNull();  // NULLed, not 1042 (would overflow NUMERIC(6,3))
    expect(built.fsiImplausible).toBe(true);
    // a plausible FSI is kept
    expect(pc.plausibleFsi(300, 400)).toEqual({ fsi: 0.75, implausible: false });
    expect(pc.plausibleFsi(115825, 111).fsi).toBeNull();
    expect(pc.FSI_MAX_PLAUSIBLE).toBe(99.999);
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
    );
    expect('garage' in menu).toBe(false);
    expect('coa_build' in menu).toBe(false);
  });

  it('zero/negative area → absent (never $0 line)', () => {
    const { menu } = pc.buildParcelCostMenu(fullParcel({ cur_floor_gfa_sqm: 0 }), RATES, NO_ESCALATION);
    expect('basement' in menu).toBe(false);
    expect('addition' in menu).toBe(false);
  });

  it('non-NULL area but permission not permitted → present + priced + fits:false', () => {
    const { menu, fitGatedGarageCount, fitGatedSuiteCount } = pc.buildParcelCostMenu(
      fullParcel({ garage_permission: 'prohibited', rear_suite_permission: 'not_permitted' }),
      RATES,
      NO_ESCALATION,
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
    );
    expect(menu.max_build.total).toBeCloseTo(4844 * 300, 1);
  });

  it('premium 1.85 scales every total', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ neighbourhood_cost_premium: 1.85 }),
      RATES,
      NO_ESCALATION,
    );
    expect(menu.max_build.total).toBeCloseTo(4844 * 300 * 1.85, 1);
  });

  it('max_build_confidence=low → envelope lines emit at low (never skipped)', () => {
    const { menu } = pc.buildParcelCostMenu(
      fullParcel({ max_build_confidence: 'low' }),
      RATES,
      NO_ESCALATION,
    );
    expect(menu.max_build.area_confidence).toBe('low');
    expect(menu.garden_suite.area_confidence).toBe('low');
    expect(menu.max_build.total).toBeGreaterThan(0);
    // medium lines unaffected
    expect(menu.kitchen.area_confidence).toBe('medium');
  });

  it('escalation multiplier (index_now ÷ base) flows into totals', () => {
    // indexNow=110, escalation_index_base=100 → MAX(1, 1.1) = 1.1×
    const { menu } = pc.buildParcelCostMenu(fullParcel(), RATES, 110);
    expect(menu.max_build.total).toBeCloseTo(4844 * 1.1 * 300, 1);
  });

  it('index_now below base does NOT deflate totals (per-archetype MAX(1,…))', () => {
    const { menu } = pc.buildParcelCostMenu(fullParcel(), RATES, 80);
    expect(menu.max_build.total).toBeCloseTo(4844 * 300, 1);
  });
});

describe('PARCEL_COST_LINES — map integrity', () => {
  it('13 lines, ids unique, every archetype seeded in RATES', () => {
    expect(pc.PARCEL_COST_LINES.length).toBe(13);
    const ids = pc.PARCEL_COST_LINES.map((l: { id: string }) => l.id);
    expect(new Set(ids).size).toBe(13);
    for (const line of pc.PARCEL_COST_LINES) {
      expect(RATES[line.archetype as keyof typeof RATES], `rate for ${line.archetype}`).toBeDefined();
    }
  });

  it('exactly the 12 §2.5 headline scalars are wired (solar_coa shares cost_solar_total)', () => {
    const scalarLines = pc.PARCEL_COST_LINES.filter((l: { scalar: string | null }) => l.scalar);
    expect(scalarLines.length).toBe(12);
  });
});
