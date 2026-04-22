// 🔗 SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §Implementation
import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  BASE_RATES,
  PREMIUM_TIERS,
  SCOPE_ADDITIONS,
  COST_TIER_BOUNDARIES,
  type CostModelPermitInput,
  type CostModelParcelInput,
  type CostModelFootprintInput,
  type CostModelNeighbourhoodInput,
} from '@/features/leads/lib/cost-model';

// ---------------------------------------------------------------------------
// Fixture builders — override per test
// ---------------------------------------------------------------------------
function makePermit(
  overrides: Partial<CostModelPermitInput> = {},
): CostModelPermitInput {
  return {
    permit_num: '24 101234',
    revision_num: '01',
    permit_type: 'New Building',
    structure_type: 'Detached Dwelling',
    work: 'New Construction',
    est_const_cost: null,
    scope_tags: [],
    dwelling_units_created: 1,
    storeys: 2,
    ...overrides,
  };
}

function makeParcel(
  overrides: Partial<CostModelParcelInput> = {},
): CostModelParcelInput {
  return {
    lot_size_sqm: 500,
    frontage_m: 15,
    ...overrides,
  };
}

function makeFootprint(
  overrides: Partial<CostModelFootprintInput> = {},
): CostModelFootprintInput {
  return {
    footprint_area_sqm: 200,
    estimated_stories: 2,
    ...overrides,
  };
}

function makeNeighbourhood(
  overrides: Partial<CostModelNeighbourhoodInput> = {},
): CostModelNeighbourhoodInput {
  return {
    avg_household_income: 80000,
    tenure_renter_pct: 30,
    ...overrides,
  };
}

describe('estimateCost — permit-reported path', () => {
  it('uses est_const_cost directly when > $1,000', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 1_200_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('permit');
    expect(result.estimated_cost).toBe(1_200_000);
    expect(result.cost_range_low).toBe(1_200_000);
    expect(result.cost_range_high).toBe(1_200_000);
    expect(result.cost_tier).toBe('large');
  });

  it('rejects placeholder cost of $1 and falls through to model', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 1 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('model');
  });

  it('exactly $1,000 falls through to model (boundary: > 1000)', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 1000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('model');
  });

  it('$1,001 is used directly when no geometry is available (gate quiet)', () => {
    // WF3-06 note: with geometry present the Liar's Gate would fire
    // against $1,001 vs a ~$1.4M model (0.07% ratio). Passing null
    // parcel + footprint means modelCost=0 → gate condition
    // `modelCost > 0` is false → permit path passes through.
    const result = estimateCost(
      makePermit({ est_const_cost: 1001 }),
      null,
      null,
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('permit');
    expect(result.estimated_cost).toBe(1001);
    expect(result.is_geometric_override).toBe(false);
  });

  it('$1,001 with valid geometry triggers the Liar\'s Gate and reclassifies to model', () => {
    // Mutation-survivor coverage: a permit just above the placeholder
    // threshold against a non-trivial model must fire the gate. Catches
    // a class of regressions where the gate accidentally skips small
    // values.
    const result = estimateCost(
      makePermit({ est_const_cost: 1001 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('model');
    expect(result.is_geometric_override).toBe(true);
    // Model cost: 200 × 2 × 3000 × 1.15 premium (80K income tier) = 1,380,000
    expect(result.estimated_cost).toBeCloseTo(1_380_000, 0);
  });
});

describe('estimateCost — base rate categories', () => {
  it('New SFD → $3000/sqm', () => {
    expect(BASE_RATES.sfd).toBe(3000);
  });

  it('Semi/town → $2600/sqm', () => {
    expect(BASE_RATES.semi_town).toBe(2600);
  });

  it('Multi-residential → $3400/sqm', () => {
    expect(BASE_RATES.multi_res).toBe(3400);
  });

  it('Addition/alteration → $2000/sqm', () => {
    expect(BASE_RATES.addition).toBe(2000);
  });

  it('Commercial new → $4000/sqm', () => {
    expect(BASE_RATES.commercial).toBe(4000);
  });

  it('Interior renovation → $1150/sqm', () => {
    expect(BASE_RATES.interior_reno).toBe(1150);
  });

  it('applies SFD rate to a detached new build with full data — exact $1,380,000', () => {
    // 200 sqm × 2 stories × 3000/sqm × 1.15 premium (80K income) = 1,380,000
    const result = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Detached Dwelling' }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 80000 }),
    );
    expect(result.cost_source).toBe('model');
    expect(result.estimated_cost).toBeCloseTo(1_380_000, 0);
    expect(result.cost_tier).toBe('large');
  });

  it('applies semi/town rate — 200 sqm × 2 × 2600 × 1.0 (no premium) = $1,040,000', () => {
    const result = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Semi-detached' }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(result.estimated_cost).toBeCloseTo(1_040_000, 0);
  });

  it('applies multi-res rate — 200 sqm × 2 × 3400 × 1.0 = $1,360,000', () => {
    const result = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Multi-residential' }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(result.estimated_cost).toBeCloseTo(1_360_000, 0);
  });

  it('applies commercial rate — 200 sqm × 2 × 4000 × 1.0 = $1,600,000', () => {
    const result = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Commercial' }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(result.estimated_cost).toBeCloseTo(1_600_000, 0);
  });

  it('applies addition rate — renovation path, 200 sqm × 2 × 2000 × 1.0 = $800,000', () => {
    const result = estimateCost(
      makePermit({
        permit_type: 'Addition/Alteration',
        structure_type: 'Detached Dwelling',
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(result.estimated_cost).toBeCloseTo(800_000, 0);
  });

  it('applies interior renovation rate — 200 sqm × 2 × 1150 × 1.0 = $460,000', () => {
    const result = estimateCost(
      makePermit({
        permit_type: 'Interior Alteration',
        structure_type: 'Detached Dwelling',
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(result.estimated_cost).toBeCloseTo(460_000, 0);
  });
});

describe('estimateCost — urban-aware fallback (no footprint)', () => {
  it('uses 0.7 coverage for urban lots (tenure_renter_pct > 50)', () => {
    const urban = estimateCost(
      makePermit(),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 60 }),
    );
    // Urban: 500 × 0.7 × 2 floors = 700 sqm
    // Suburban: 500 × 0.4 × 2 = 400 sqm
    const suburban = estimateCost(
      makePermit(),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 40 }),
    );
    expect(urban.estimated_cost ?? 0).toBeGreaterThan(suburban.estimated_cost ?? 0);
  });

  it('residential uses 2 floors, commercial uses 1 (distinct area calculations)', () => {
    // Residential: 500 × 0.4 × 2 floors × 3000 rate × 1.15 premium = 1,380,000
    // Commercial:  500 × 0.4 × 1 floor  × 4000 rate × 1.15 premium =   920,000
    const res = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Detached Dwelling' }),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 40, avg_household_income: 80_000 }),
    );
    const com = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Commercial' }),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 40, avg_household_income: 80_000 }),
    );
    expect(res.estimated_cost).not.toBeNull();
    expect(com.estimated_cost).not.toBeNull();
    expect(res.estimated_cost).toBeCloseTo(1_380_000, 0);
    expect(com.estimated_cost).toBeCloseTo(920_000, 0);
    // Direction check: residential > commercial in this scenario
    expect(res.estimated_cost).toBeGreaterThan(com.estimated_cost ?? 0);
  });

  it('fallback path produces ±50% range, not ±25%', () => {
    const result = estimateCost(
      makePermit(),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood(),
    );
    expect(result.estimated_cost).not.toBeNull();
    expect(result.cost_range_low).not.toBeNull();
    expect(result.cost_range_high).not.toBeNull();
    const cost = result.estimated_cost ?? 0;
    const low = result.cost_range_low ?? 0;
    const high = result.cost_range_high ?? 0;
    const spread = (high - low) / cost;
    // ±50% → spread ≈ 1.0 (low is 0.5×, high is 1.5×)
    expect(spread).toBeCloseTo(1.0, 1);
  });
});

describe('estimateCost — premium tiers', () => {
  it('<$60K income → 1.0', () => {
    expect(PREMIUM_TIERS.find((t) => t.max !== null && t.max <= 60000)?.multiplier).toBe(1.0);
  });

  it('$60K-$100K → 1.15', () => {
    expect(PREMIUM_TIERS.find((t) => t.min === 60000)?.multiplier).toBe(1.15);
  });

  it('$100K-$150K → 1.35', () => {
    expect(PREMIUM_TIERS.find((t) => t.min === 100000)?.multiplier).toBe(1.35);
  });

  it('$150K-$200K → 1.6', () => {
    expect(PREMIUM_TIERS.find((t) => t.min === 150000)?.multiplier).toBe(1.6);
  });

  it('>$200K → 1.85', () => {
    expect(PREMIUM_TIERS.find((t) => t.min === 200000)?.multiplier).toBe(1.85);
  });

  it('null income → premium factor 1.0', () => {
    const result = estimateCost(
      makePermit(),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: null }),
    );
    expect(result.premium_factor).toBe(1.0);
  });
});

describe('estimateCost — scope additions', () => {
  it('pool adds $80,000', () => {
    expect(SCOPE_ADDITIONS.pool).toBe(80000);
  });

  it('elevator adds $60,000', () => {
    expect(SCOPE_ADDITIONS.elevator).toBe(60000);
  });

  it('underpinning adds $40,000', () => {
    expect(SCOPE_ADDITIONS.underpinning).toBe(40000);
  });

  it('solar adds $25,000', () => {
    expect(SCOPE_ADDITIONS.solar).toBe(25000);
  });

  it('stacks additively (pool + elevator + underpinning + solar = +205K)', () => {
    const baseline = estimateCost(
      makePermit({ scope_tags: [] }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    const withAll = estimateCost(
      makePermit({ scope_tags: ['pool', 'elevator', 'underpinning', 'solar'] }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect((withAll.estimated_cost ?? 0) - (baseline.estimated_cost ?? 0)).toBe(205_000);
  });
});

describe('estimateCost — cost tiers', () => {
  it('<$100K → small', () => {
    expect(COST_TIER_BOUNDARIES.small.max).toBe(100_000);
  });

  it('$100K-$500K → medium', () => {
    expect(COST_TIER_BOUNDARIES.medium.min).toBe(100_000);
    expect(COST_TIER_BOUNDARIES.medium.max).toBe(500_000);
  });

  it('$500K-$2M → large', () => {
    expect(COST_TIER_BOUNDARIES.large.min).toBe(500_000);
    expect(COST_TIER_BOUNDARIES.large.max).toBe(2_000_000);
  });

  it('$2M-$10M → major', () => {
    expect(COST_TIER_BOUNDARIES.major.min).toBe(2_000_000);
    expect(COST_TIER_BOUNDARIES.major.max).toBe(10_000_000);
  });

  it('≥$10M → mega', () => {
    expect(COST_TIER_BOUNDARIES.mega.min).toBe(10_000_000);
  });

  it('boundaries: exactly $100K → medium', () => {
    // WF3-06: $100K against a ~$1.4M model would trip the Liar's Gate
    // and reclassify as 'large'. Pass threshold=0 to pin tier-boundary
    // semantics without interference from the gate.
    const result = estimateCost(
      makePermit({ est_const_cost: 100_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
      { liarGateThreshold: 0 },
    );
    expect(result.cost_tier).toBe('medium');
  });

  it('boundaries: exactly $500K → large', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 500_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_tier).toBe('large');
  });

  it('boundaries: exactly $2M → major', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 2_000_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_tier).toBe('major');
  });

  it('boundaries: exactly $10M → mega', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 10_000_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_tier).toBe('mega');
  });
});

describe('estimateCost — complexity score', () => {
  it('zero signals → score 0', () => {
    const result = estimateCost(
      makePermit({
        storeys: 2,
        dwelling_units_created: 1,
        permit_type: 'Interior Alteration', // not new build
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 150 }),
      makeNeighbourhood({ avg_household_income: 70_000 }),
    );
    expect(result.complexity_score).toBe(0);
  });

  it('high-rise (stories > 6) adds 30', () => {
    const result = estimateCost(
      makePermit({
        storeys: 10,
        dwelling_units_created: 1,
        permit_type: 'Interior Alteration',
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 150 }),
      makeNeighbourhood({ avg_household_income: 70_000 }),
    );
    expect(result.complexity_score).toBe(30);
  });

  it('all signals combined cap at 100 (theoretical sum is 120)', () => {
    const result = estimateCost(
      makePermit({
        storeys: 10,             // +30 high-rise
        dwelling_units_created: 8, // +20 multi-unit
        permit_type: 'New Building', // +10 new build
        scope_tags: ['pool', 'elevator', 'underpinning'], // +10 each = +30
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 400 }), // +15 large footprint
      makeNeighbourhood({ avg_household_income: 180_000 }), // +15 premium
    );
    expect(result.complexity_score).toBe(100);
  });

  it('premium neighbourhood (income > 150K) adds 15', () => {
    const low = estimateCost(
      makePermit({
        storeys: 2,
        dwelling_units_created: 1,
        permit_type: 'Interior Alteration',
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 150 }),
      makeNeighbourhood({ avg_household_income: 100_000 }),
    );
    const high = estimateCost(
      makePermit({
        storeys: 2,
        dwelling_units_created: 1,
        permit_type: 'Interior Alteration',
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 150 }),
      makeNeighbourhood({ avg_household_income: 180_000 }),
    );
    expect((high.complexity_score ?? 0) - (low.complexity_score ?? 0)).toBe(15);
  });
});

describe('estimateCost — display strings', () => {
  it('permit-reported format', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 1_200_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 180_000 }),
    );
    expect(result.display).toContain('$1,200,000');
    expect(result.display).toContain('Large Job');
  });

  it('model estimate format', () => {
    const result = estimateCost(
      makePermit(),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    // Model estimate includes range marker
    expect(result.display).toMatch(/estimated|—/);
  });
});

// ===========================================================================
// Mutation-survivor triage — AT-boundary behaviour tests
// Added 2026-04-08 after the first Stryker run (commit d8b508e) surfaced
// 117 surviving mutants in cost-model.ts. Each describe block below kills
// one high-leverage mutant cluster by exercising the branch at its exact
// boundary and asserting the precise output. Tests reference spec 72
// §Implementation constants (BASE_RATES, PREMIUM_TIERS, COST_TIER_BOUNDARIES,
// COMPLEXITY_SIGNALS) so drift between spec and code fails at test time.
// ===========================================================================

const MODEL_PATH_PERMIT_OVERRIDES = { est_const_cost: null };

describe('determineBaseRate — newBuild dispatch chain (mutation survivors)', () => {
  function estimateWithKnownArea(structure_type: string, footprintSqm = 100) {
    return estimateCost(
      makePermit({
        ...MODEL_PATH_PERMIT_OVERRIDES,
        permit_type: 'New Building',
        structure_type,
        scope_tags: [],
      }),
      null,
      makeFootprint({ footprint_area_sqm: footprintSqm, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
  }

  it('Multi-Residential hits multi_res rate (3400)', () => {
    const r = estimateWithKnownArea('Multi-Residential');
    expect(r.estimated_cost).toBe(BASE_RATES.multi_res * 100);
  });

  it('Apartment Building hits multi_res rate via apartment substring', () => {
    const r = estimateWithKnownArea('Apartment Building');
    expect(r.estimated_cost).toBe(BASE_RATES.multi_res * 100);
  });

  it('Condominium hits multi_res rate via condo substring', () => {
    const r = estimateWithKnownArea('Condominium');
    expect(r.estimated_cost).toBe(BASE_RATES.multi_res * 100);
  });

  it('Semi-Detached hits semi_town rate (2600)', () => {
    const r = estimateWithKnownArea('Semi-Detached');
    expect(r.estimated_cost).toBe(BASE_RATES.semi_town * 100);
  });

  it('Townhouse hits semi_town rate via town substring', () => {
    const r = estimateWithKnownArea('Townhouse');
    expect(r.estimated_cost).toBe(BASE_RATES.semi_town * 100);
  });

  it('Commercial Office hits commercial rate (4000)', () => {
    const r = estimateWithKnownArea('Commercial Office');
    expect(r.estimated_cost).toBe(BASE_RATES.commercial * 100);
  });

  it('Detached Dwelling hits sfd rate (3000)', () => {
    const r = estimateWithKnownArea('Detached Dwelling');
    expect(r.estimated_cost).toBe(BASE_RATES.sfd * 100);
  });

  it('unknown structure_type on a new build falls back to sfd rate', () => {
    const r = estimateWithKnownArea('Institutional Complex');
    expect(r.estimated_cost).toBe(BASE_RATES.sfd * 100);
  });
});

describe('determineBaseRate — renovation dispatch chain (mutation survivors)', () => {
  function estimateReno(permit_type: string, work = 'Renovation') {
    return estimateCost(
      makePermit({
        ...MODEL_PATH_PERMIT_OVERRIDES,
        permit_type,
        work,
        structure_type: 'Detached Dwelling',
        scope_tags: [],
      }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
  }

  it('Interior Alteration hits interior_reno rate not addition (regression)', () => {
    const r = estimateReno('Interior Alteration');
    expect(r.estimated_cost).toBe(BASE_RATES.interior_reno * 100);
  });

  it('work field with Interior Fit-Out hits interior_reno rate', () => {
    const r = estimateReno('Alteration', 'Interior Fit-Out');
    expect(r.estimated_cost).toBe(BASE_RATES.interior_reno * 100);
  });

  it('Addition hits addition rate (2000)', () => {
    const r = estimateReno('Addition');
    expect(r.estimated_cost).toBe(BASE_RATES.addition * 100);
  });

  it('Alteration without interior marker hits addition rate', () => {
    const r = estimateReno('Alteration');
    expect(r.estimated_cost).toBe(BASE_RATES.addition * 100);
  });

  it('unknown renovation type falls back to interior_reno rate', () => {
    const r = estimateReno('Miscellaneous Permit');
    expect(r.estimated_cost).toBe(BASE_RATES.interior_reno * 100);
  });
});

describe('computePremiumFactor — tier boundaries (mutation survivors)', () => {
  function premiumAt(income: number | null) {
    const r = estimateCost(
      makePermit({
        ...MODEL_PATH_PERMIT_OVERRIDES,
        permit_type: 'New Building',
        structure_type: 'Detached Dwelling',
      }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: income, tenure_renter_pct: 0 }),
    );
    return r.premium_factor;
  }

  it('null income defaults to 1.0', () => {
    expect(premiumAt(null)).toBe(1.0);
  });

  it('income 0 hits tier 0 multiplier 1.0', () => {
    expect(premiumAt(0)).toBe(1.0);
  });

  it('income 59999 (just below boundary) stays at 1.0', () => {
    expect(premiumAt(59_999)).toBe(1.0);
  });

  it('income 60000 (exact boundary) jumps to 1.15', () => {
    expect(premiumAt(60_000)).toBe(1.15);
  });

  it('income 99999 stays at 1.15', () => {
    expect(premiumAt(99_999)).toBe(1.15);
  });

  it('income 100000 (exact boundary) jumps to 1.35', () => {
    expect(premiumAt(100_000)).toBe(1.35);
  });

  it('income 150000 (exact boundary) jumps to 1.6', () => {
    expect(premiumAt(150_000)).toBe(1.6);
  });

  it('income 199999 stays at 1.6', () => {
    expect(premiumAt(199_999)).toBe(1.6);
  });

  it('income 200000 (exact boundary, top tier max=null) jumps to 1.85', () => {
    expect(premiumAt(200_000)).toBe(1.85);
  });

  it('income 500000 (well above top tier) stays at 1.85', () => {
    expect(premiumAt(500_000)).toBe(1.85);
  });
});

describe('computeBuildingArea — footprint vs parcel fallback (mutation survivors)', () => {
  it('footprint with area 0 skips footprint path and uses parcel fallback', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      makeParcel({ lot_size_sqm: 500 }),
      makeFootprint({ footprint_area_sqm: 0, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).not.toBeNull();
    expect(r.cost_source).toBe('model');
  });

  it('footprint with stories null skips footprint path', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      makeParcel({ lot_size_sqm: 500 }),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: null }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(Number.isFinite(r.estimated_cost ?? 0)).toBe(true);
  });

  it('footprint with valid values is preferred over parcel', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      makeParcel({ lot_size_sqm: 5000 }),
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(100 * BASE_RATES.sfd);
  });

  it('parcel fallback with rentPct 50 (boundary) uses SUBURBAN coverage 0.4', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 50 }),
    );
    expect(r.estimated_cost).toBe(800 * BASE_RATES.sfd);
  });

  it('parcel fallback with rentPct 51 (above boundary) uses URBAN coverage 0.7', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 51 }),
    );
    expect(r.estimated_cost).toBe(1400 * BASE_RATES.sfd);
  });

  it('commercial parcel fallback uses 1 floor not 2', () => {
    const r = estimateCost(
      makePermit({
        ...MODEL_PATH_PERMIT_OVERRIDES,
        permit_type: 'New Building',
        structure_type: 'Commercial Office',
      }),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(400 * BASE_RATES.commercial);
  });

  it('no footprint no parcel no est_const_cost returns null estimate', () => {
    const r = estimateCost(
      makePermit(MODEL_PATH_PERMIT_OVERRIDES),
      null,
      null,
      null,
    );
    expect(r.estimated_cost).toBeNull();
    expect(r.cost_tier).toBeNull();
  });
});

describe('sumScopeAdditions — per-tag dispatch (mutation survivors)', () => {
  function costWith(scope_tags: string[] | null) {
    return estimateCost(
      makePermit({
        ...MODEL_PATH_PERMIT_OVERRIDES,
        permit_type: 'New Building',
        structure_type: 'Detached Dwelling',
        scope_tags,
      }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
  }

  const BASE = 100 * BASE_RATES.sfd;

  it('pool tag adds SCOPE_ADDITIONS.pool', () => {
    expect(costWith(['pool']).estimated_cost).toBe(BASE + SCOPE_ADDITIONS.pool);
  });

  it('elevator tag adds SCOPE_ADDITIONS.elevator', () => {
    expect(costWith(['elevator']).estimated_cost).toBe(BASE + SCOPE_ADDITIONS.elevator);
  });

  it('underpinning tag adds SCOPE_ADDITIONS.underpinning', () => {
    expect(costWith(['underpinning']).estimated_cost).toBe(
      BASE + SCOPE_ADDITIONS.underpinning,
    );
  });

  it('solar tag adds SCOPE_ADDITIONS.solar', () => {
    expect(costWith(['solar']).estimated_cost).toBe(BASE + SCOPE_ADDITIONS.solar);
  });

  it('unknown tag adds nothing', () => {
    expect(costWith(['unknown-tag']).estimated_cost).toBe(BASE);
  });

  it('uppercase POOL tag adds pool addition (case-insensitive)', () => {
    expect(costWith(['POOL']).estimated_cost).toBe(BASE + SCOPE_ADDITIONS.pool);
  });

  it('null scope_tags adds nothing (guard branch)', () => {
    expect(costWith(null).estimated_cost).toBe(BASE);
  });

  it('all four known tags stack additively', () => {
    expect(costWith(['pool', 'elevator', 'underpinning', 'solar']).estimated_cost).toBe(
      BASE +
        SCOPE_ADDITIONS.pool +
        SCOPE_ADDITIONS.elevator +
        SCOPE_ADDITIONS.underpinning +
        SCOPE_ADDITIONS.solar,
    );
  });

  // Bug 5 (user-supplied Gemini holistic 2026-04-09 — "Scope Tags
  // Double-Dip"): PostgreSQL TEXT[] doesn't enforce uniqueness, and
  // the upstream classifier + inspector edits can append duplicate
  // tags. Pre-fix, ['pool', 'pool'] added $80K twice.
  it('duplicate pool tags do NOT double-count (Bug 5 dedupe)', () => {
    expect(costWith(['pool', 'pool']).estimated_cost).toBe(
      BASE + SCOPE_ADDITIONS.pool,
    );
  });

  it('triple duplicate adds the bonus exactly once', () => {
    expect(costWith(['elevator', 'elevator', 'elevator']).estimated_cost).toBe(
      BASE + SCOPE_ADDITIONS.elevator,
    );
  });

  it('mixed-case duplicates dedupe via lowercase normalization', () => {
    expect(costWith(['pool', 'POOL', 'Pool']).estimated_cost).toBe(
      BASE + SCOPE_ADDITIONS.pool,
    );
  });

  it('duplicate-laden 4-tag input stacks each known tag exactly once', () => {
    expect(
      costWith([
        'pool',
        'pool',
        'elevator',
        'elevator',
        'underpinning',
        'underpinning',
        'solar',
      ]).estimated_cost,
    ).toBe(
      BASE +
        SCOPE_ADDITIONS.pool +
        SCOPE_ADDITIONS.elevator +
        SCOPE_ADDITIONS.underpinning +
        SCOPE_ADDITIONS.solar,
    );
  });
});

describe('determineCostTier — band boundaries (mutation survivors)', () => {
  function tierAt(cost: number) {
    // WF3-06: disable the Liar's Gate (threshold=0 means strict `<` can
    // never fire since cost > 0) so these tests pin only the tier
    // classification behavior, not the gate override.
    const r = estimateCost(
      makePermit({ est_const_cost: cost }),
      null,
      makeFootprint(),
      makeNeighbourhood(),
      { liarGateThreshold: 0 },
    );
    return r.cost_tier;
  }

  it('99999 is small (just below medium)', () => {
    expect(tierAt(99_999)).toBe('small');
  });

  it('100000 is medium (exact boundary)', () => {
    expect(tierAt(100_000)).toBe('medium');
  });

  it('499999 is medium (just below large)', () => {
    expect(tierAt(499_999)).toBe('medium');
  });

  it('500000 is large (exact boundary)', () => {
    expect(tierAt(500_000)).toBe('large');
  });

  it('1999999 is large (just below major)', () => {
    expect(tierAt(1_999_999)).toBe('large');
  });

  it('2000000 is major (exact boundary)', () => {
    expect(tierAt(2_000_000)).toBe('major');
  });

  it('9999999 is major (just below mega)', () => {
    expect(tierAt(9_999_999)).toBe('major');
  });

  it('10000000 is mega (exact boundary)', () => {
    expect(tierAt(10_000_000)).toBe('mega');
  });

  it('1500 is small (just above placeholder threshold)', () => {
    expect(tierAt(1_500)).toBe('small');
  });
});

describe('computeComplexityScore — boundary thresholds (mutation survivors)', () => {
  function complexityWith(overrides: {
    storeys?: number | null;
    dwelling_units_created?: number | null;
    footprint_area_sqm?: number | null;
    avg_household_income?: number | null;
    scope_tags?: string[];
    newBuild?: boolean;
  }) {
    const r = estimateCost(
      makePermit({
        est_const_cost: 5_000_000,
        permit_type: overrides.newBuild === false ? 'Addition' : 'New Building',
        structure_type: 'Detached Dwelling',
        storeys: overrides.storeys ?? 1,
        dwelling_units_created: overrides.dwelling_units_created ?? 0,
        scope_tags: overrides.scope_tags ?? [],
      }),
      null,
      makeFootprint({
        footprint_area_sqm: overrides.footprint_area_sqm ?? 50,
        estimated_stories: overrides.storeys ?? 1,
      }),
      makeNeighbourhood({
        avg_household_income: overrides.avg_household_income ?? 0,
        tenure_renter_pct: 0,
      }),
    );
    return r.complexity_score ?? 0;
  }

  it('baseline new build scores 10 (newBuild signal only)', () => {
    expect(complexityWith({})).toBe(10);
  });

  it('storeys 6 is boundary NOT triggered', () => {
    expect(complexityWith({ storeys: 6 })).toBe(10);
  });

  it('storeys 7 triggers highRise +30 = 40', () => {
    expect(complexityWith({ storeys: 7 })).toBe(40);
  });

  it('dwelling_units 4 is boundary NOT triggered', () => {
    expect(complexityWith({ dwelling_units_created: 4 })).toBe(10);
  });

  it('dwelling_units 5 triggers multiUnit +20 = 30', () => {
    expect(complexityWith({ dwelling_units_created: 5 })).toBe(30);
  });

  it('footprint 300 is boundary NOT triggered', () => {
    expect(complexityWith({ footprint_area_sqm: 300 })).toBe(10);
  });

  it('footprint 301 triggers largeFootprint +15 = 25', () => {
    expect(complexityWith({ footprint_area_sqm: 301 })).toBe(25);
  });

  it('income 150000 is boundary NOT triggered', () => {
    expect(complexityWith({ avg_household_income: 150_000 })).toBe(10);
  });

  it('income 150001 triggers premiumNbhd +15 = 25', () => {
    expect(complexityWith({ avg_household_income: 150_001 })).toBe(25);
  });

  it('single pool tag adds complexScope +10', () => {
    expect(complexityWith({ scope_tags: ['pool'] })).toBe(20);
  });

  it('three complex tags stack to 10 + 30 = 40', () => {
    expect(complexityWith({ scope_tags: ['pool', 'elevator', 'underpinning'] })).toBe(
      40,
    );
  });

  it('all signals max at 100 via Math.min cap', () => {
    expect(
      complexityWith({
        storeys: 20,
        dwelling_units_created: 100,
        footprint_area_sqm: 10_000,
        avg_household_income: 500_000,
        scope_tags: ['pool', 'elevator', 'underpinning'],
      }),
    ).toBe(100);
  });

  it('Addition without newBuild returns 0', () => {
    expect(complexityWith({ newBuild: false })).toBe(0);
  });
});

describe('buildDisplay — output branches (mutation survivors)', () => {
  it('null cost returns the unavailable placeholder', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null }),
      null,
      null,
      null,
    );
    expect(r.display).toBe('Cost estimate unavailable');
  });

  it('permit source uses full-dollar format', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 1_234_567 }),
      null,
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(r.display).toContain('$1,234,567');
  });

  it('model source uses K or M short format', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'New Building', structure_type: 'Detached Dwelling' }),
      null,
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.display).toMatch(/\$\d+K|\$\d+\.\d+M/);
    expect(r.display).toContain('estimated');
  });

  it('premiumFactor 1.35 boundary triggers Premium neighbourhood label', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 2_500_000 }),
      null,
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 100_000 }),
    );
    expect(r.display).toContain('Premium neighbourhood');
  });

  it('premiumFactor 1.15 below boundary omits Premium neighbourhood label', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 2_500_000 }),
      null,
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 60_000 }),
    );
    expect(r.display).not.toContain('Premium neighbourhood');
  });

  it('complexity 40 boundary triggers Complex scope label', () => {
    const r = estimateCost(
      makePermit({
        est_const_cost: 2_500_000,
        storeys: 7,
        permit_type: 'New Building',
      }),
      null,
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.display).toContain('Complex scope');
  });
});

// ═════════════════════════════════════════════════════════════════
// WF3-06 (H-W8 + H-W9) — Dual-path convergence: dedup + Liar's Gate
// ═════════════════════════════════════════════════════════════════

describe('WF3-06 (H-W8) — scope_tags dedup', () => {
  // TS side is known-correct (already uses new Set). These tests pin
  // the contract so any future regression is caught.

  it('TS sumScopeAdditions: duplicate "pool" tags add $80K once, not twice', () => {
    const r = estimateCost(
      makePermit({
        est_const_cost: null,
        scope_tags: ['pool', 'pool'],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    // 200 sqm × 2 stories × 3000/sqm × 1.15 premium + 80K scope = 1,460,000
    // (NOT 1,540,000 which would be double-counted pool)
    expect(r.cost_source).toBe('model');
    expect(r.estimated_cost).toBeCloseTo(1_460_000, 0);
  });

  it('TS sumScopeAdditions: case-insensitive dedup ("POOL" = "pool")', () => {
    const r = estimateCost(
      makePermit({
        est_const_cost: null,
        scope_tags: ['POOL', 'Pool', 'pool'],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(r.estimated_cost).toBeCloseTo(1_460_000, 0);
  });

  it('TS computeComplexityScore: duplicate "elevator" only adds +10 once', () => {
    const r = estimateCost(
      makePermit({
        est_const_cost: 500_000,
        scope_tags: ['elevator', 'elevator'],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    // newBuild +10, complexScope elevator +10 (once, not twice). No
    // highRise/multiUnit/largeFootprint/premiumNbhd triggered.
    expect(r.complexity_score).toBe(20);
  });
});

describe('WF3-06 (H-W9) — Liar\'s Gate in TS estimateCost', () => {
  it('fires when permit-reported cost < modelCost × threshold (default 0.25)', () => {
    // 200 × 2 × 3000 × 1.0 (income 50K → premium 1.0) = 1,200,000 model.
    // Reported 100K is 8.3% of model, below 25% threshold → gate fires.
    const r = estimateCost(
      makePermit({
        est_const_cost: 100_000,
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.cost_source).toBe('model');
    expect(r.is_geometric_override).toBe(true);
    expect(r.estimated_cost).toBeCloseTo(1_200_000, 0);
    expect(r.modeled_gfa_sqm).toBe(400); // 200 × 2
  });

  it('does NOT fire when permit-reported cost is reasonable vs model', () => {
    // Same model 1.2M, reported 1.0M = 83% of model. Above 25% → gate silent.
    const r = estimateCost(
      makePermit({
        est_const_cost: 1_000_000,
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.cost_source).toBe('permit');
    expect(r.is_geometric_override).toBe(false);
    expect(r.estimated_cost).toBe(1_000_000);
  });

  it('is suppressed when area came from lot-size fallback (usedFallback=true)', () => {
    // No footprint row → lot-size fallback fires. Reported 100K would
    // normally trigger the gate, but the fallback's ±50% uncertainty
    // means the model is unreliable — gate suppressed per JS L241.
    const r = estimateCost(
      makePermit({
        est_const_cost: 100_000,
        scope_tags: [],
      }),
      makeParcel({ lot_size_sqm: 500 }),
      null, // no footprint
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.cost_source).toBe('permit');
    expect(r.is_geometric_override).toBe(false);
  });

  it('strict < boundary: reported === modelCost × threshold does NOT fire', () => {
    // Model = 1,200,000. Threshold 0.25. Boundary = 300,000.
    // JS uses strict `<`, so reported=300000 does NOT fire gate.
    const r = estimateCost(
      makePermit({
        est_const_cost: 300_000,
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.cost_source).toBe('permit');
    expect(r.is_geometric_override).toBe(false);
  });

  it('custom liarGateThreshold param fires on values above default threshold', () => {
    // Model 1,200,000. Reported 500K. Default threshold 0.25 → boundary
    // 300K, so 500K would NOT fire at default. But with threshold 0.5,
    // boundary becomes 600K, so 500K < 600K → gate fires.
    const r = estimateCost(
      makePermit({
        est_const_cost: 500_000,
        scope_tags: [],
      }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood({ avg_household_income: 50_000 }),
      { liarGateThreshold: 0.5 },
    );
    expect(r.cost_source).toBe('model');
    expect(r.is_geometric_override).toBe(true);
  });

  it('returns is_geometric_override=false and empty trade_contract_values on null-area permit', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, scope_tags: [] }),
      null,
      null,
      makeNeighbourhood(),
    );
    expect(r.estimated_cost).toBe(null);
    expect(r.is_geometric_override).toBe(false);
    expect(r.modeled_gfa_sqm).toBe(null);
    expect(r.trade_contract_values).toEqual({});
  });

  it('slices trade_contract_values when tradeAllocationPct config provided', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 1_000_000, scope_tags: [] }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
      { tradeAllocationPct: { plumbing: 0.1, electrical: 0.08 } },
    );
    expect(r.trade_contract_values).toEqual({
      plumbing: 100_000,
      electrical: 80_000,
    });
  });
});

// Note: WF3-06 (H-W8/W9) — JS↔TS parity battery was removed in Phase 2 of
// spec 83 (WF2-2). The V1 parity battery compared estimateCostInline() in
// compute-cost-estimates.js with estimateCost() in cost-model.ts. In Phase 2,
// compute-cost-estimates.js was refactored to delegate all math to the Brain
// (cost-model-shared.js) — estimateCostInline no longer exists. The full V2
// surgical parity battery now lives in src/tests/parity-battery.test.ts and
// covers 40+ test cases across all spec 83 branches.
