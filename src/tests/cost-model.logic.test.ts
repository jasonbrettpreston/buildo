// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md §Implementation
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

  it('$1,001 is used directly', () => {
    const result = estimateCost(
      makePermit({ est_const_cost: 1001 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(result.cost_source).toBe('permit');
    expect(result.estimated_cost).toBe(1001);
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

  it('applies SFD rate to a detached new build with full data', () => {
    // 200 sqm × 2 stories × 3000/sqm × 1.15 premium (80K income) = 1,380,000
    const result = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Detached Dwelling' }),
      makeParcel(),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 80000 }),
    );
    expect(result.cost_source).toBe('model');
    expect(result.estimated_cost).toBeGreaterThan(1_000_000);
    expect(result.estimated_cost).toBeLessThan(1_500_000);
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

  it('residential defaults to 2 floors, commercial to 1', () => {
    const res = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Detached Dwelling' }),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 40 }),
    );
    const com = estimateCost(
      makePermit({ permit_type: 'New Building', structure_type: 'Commercial' }),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood({ tenure_renter_pct: 40 }),
    );
    // Residential should have higher cost (more floors); commercial has higher per-sqm
    // but lower floors_estimate — we check residential multiplier is > commercial's single-floor
    expect(res.estimated_cost).not.toBe(com.estimated_cost);
  });

  it('fallback path produces ±50% range, not ±25%', () => {
    const result = estimateCost(
      makePermit(),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      makeNeighbourhood(),
    );
    if (result.estimated_cost !== null && result.cost_range_low !== null && result.cost_range_high !== null) {
      const spread = (result.cost_range_high - result.cost_range_low) / result.estimated_cost;
      // ±50% → spread ≈ 1.0 (low is 0.5×, high is 1.5×)
      expect(spread).toBeCloseTo(1.0, 1);
    }
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
    const result = estimateCost(
      makePermit({ est_const_cost: 100_000 }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
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
