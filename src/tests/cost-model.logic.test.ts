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

// ─── RETIRED (WF2 §3-ARCHETYPE, 2026-07-06 — Guardian F1-A) ──────────────────
// Three `estimateCost` V1-inline-path integration blocks were retired here:
//   1. "permit-reported path" (Liar's-Gate accept/override on est_const_cost)
//   2. "urban-aware fallback (no footprint)" (residential geometric lot-fallback)
//   3. "WF3-06 (H-W9) — Liar's Gate in TS estimateCost"
// Rationale: `estimateCost` has NO production callers — production reads the
// `cost_estimates` rows the Muscle writes via the shared Brain. For residential
// low-rise leads the Brain now prices through the archetype ladder, and the
// Liar's Gate is RETIRED for T1–T3 (Decision 2; kept only for T4). These blocks
// pinned the pre-archetype inline behavior as canonical, which it no longer is.
// Replacement coverage (through the REAL production path):
//   • Liar's Gate (all 4 branches) → cost-model-shared.logic.test.ts `applyLiarsGate`
//   • Trust/Override/Default/GFA-fallback parity → parity-battery.test.ts
//   • the archetype ladder that supersedes them → archetype-ladder.logic.test.ts
//     + the §3-ARCHETYPE block in parity-battery.test.ts (T1/T2 TS↔JS parity)
// The V1 helper units (determineBaseRate, computeBuildingArea, sumScopeAdditions,
// …) remain fully tested below — only the retired-behavior integrations were cut.
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


// Note: WF3-06 (H-W8/W9) — JS↔TS parity battery was removed in Phase 2 of
// spec 83 (WF2-2). The V1 parity battery compared estimateCostInline() in
// compute-cost-estimates.js with estimateCost() in cost-model.ts. In Phase 2,
// compute-cost-estimates.js was refactored to delegate all math to the Brain
// (cost-model-shared.js) — estimateCostInline no longer exists. The full V2
// surgical parity battery now lives in src/tests/parity-battery.test.ts and
// covers 40+ test cases across all spec 83 branches.

// ═══════════════════════════════════════════════════════════════════════════
// Mutation-survivor triage — ROUND 2 (2026-07-29, WF3 mutation-score red)
// The weekly Stryker run (30273538219) dropped cost-model.ts to 63.10%
// (aggregate 67.80 < break 75) after WF2 §3-ARCHETYPE (4442fb75) retired the
// V1 Liar's-Gate integration blocks and added ~100 lines (the Brain-path row/
// config builder). The blocks below re-pin V1 boundary BEHAVIOR through the
// current public contract (NOT the retired pre-archetype semantics — the V1
// inline path is still live for callers without config.tradeRates), and
// exercise the §3-ARCHETYPE pass-through fields so a dropped/nulled field in
// the shim's row builder changes observable output.
// ═══════════════════════════════════════════════════════════════════════════

describe('V1 placeholder-cost threshold — exact boundary (PLACEHOLDER_COST_THRESHOLD=1000)', () => {
  // footprint 100 sqm × 1 storey × sfd $3000 × premium 1.0 = model $300,000.
  // liarGateThreshold:0 disables the gate (strict `<` can never fire) so these
  // pin ONLY the placeholder dispatch, not the override.
  function at(est: number | null) {
    return estimateCost(
      makePermit({ est_const_cost: est, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
      { liarGateThreshold: 0 },
    );
  }

  it('est exactly $1000 (boundary) is a placeholder → model path, NOT trusted', () => {
    const r = at(1000);
    expect(r.cost_source).toBe('model');
    expect(r.estimated_cost).toBe(300_000);
    expect(r.is_geometric_override).toBe(false);
  });

  it('est $1001 (just above boundary) IS trusted → permit path', () => {
    const r = at(1001);
    expect(r.cost_source).toBe('permit');
    expect(r.estimated_cost).toBe(1001);
    // permit-reported costs carry no range
    expect(r.cost_range_low).toBe(1001);
    expect(r.cost_range_high).toBe(1001);
  });

  it('est $0 (below boundary) → model path', () => {
    const r = at(0);
    expect(r.cost_source).toBe('model');
    expect(r.estimated_cost).toBe(300_000);
  });
});

describe("V1 Liar's Gate — exact boundary + threshold override + fallback suppression", () => {
  // model = 100 sqm × 1 storey × $3000 × 1.0 = $300,000; default gate = ×0.25 = $75,000.
  function gateAt(est: number, config?: { liarGateThreshold?: number }) {
    return estimateCost(
      makePermit({ est_const_cost: est, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
      config,
    );
  }

  it('reported $74,999 (just below model×0.25) → geometric override fires', () => {
    const r = gateAt(74_999);
    expect(r.cost_source).toBe('model');
    expect(r.is_geometric_override).toBe(true);
    expect(r.estimated_cost).toBe(300_000);
    // override uses the MODEL range (±25%, footprint basis — not fallback ±50%)
    expect(r.cost_range_low).toBe(225_000);
    expect(r.cost_range_high).toBe(375_000);
    expect(r.modeled_gfa_sqm).toBe(100);
  });

  it('reported exactly $75,000 (= model×0.25, strict <) → trusted, NO override', () => {
    const r = gateAt(75_000);
    expect(r.cost_source).toBe('permit');
    expect(r.is_geometric_override).toBe(false);
    expect(r.estimated_cost).toBe(75_000);
    expect(r.cost_range_low).toBe(75_000);
    expect(r.cost_range_high).toBe(75_000);
  });

  it('config.liarGateThreshold=0.5 raises the gate: $149,999 overridden, $150,000 trusted', () => {
    const over = gateAt(149_999, { liarGateThreshold: 0.5 });
    expect(over.is_geometric_override).toBe(true);
    expect(over.estimated_cost).toBe(300_000);
    const trusted = gateAt(150_000, { liarGateThreshold: 0.5 });
    expect(trusted.is_geometric_override).toBe(false);
    expect(trusted.estimated_cost).toBe(150_000);
  });

  it('gate is SUPPRESSED on lot-size fallback (±50% uncertainty carve-out)', () => {
    // fallback: 1000 sqm lot × 0.4 suburban × 2 floors = 800 sqm × $3000 = $2.4M model.
    // Reported $10,000 is far below the gate but usedFallback=true → trusted.
    const r = estimateCost(
      makePermit({ est_const_cost: 10_000, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.cost_source).toBe('permit');
    expect(r.is_geometric_override).toBe(false);
    expect(r.estimated_cost).toBe(10_000);
  });
});

describe('V1 range percentages — exact ±25% model / ±50% fallback / 0% permit', () => {
  it('footprint-based model estimate carries ±25% exactly', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 100, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(300_000);
    expect(r.cost_range_low).toBe(225_000);
    expect(r.cost_range_high).toBe(375_000);
    expect(r.modeled_gfa_sqm).toBe(100);
  });

  it('lot-fallback model estimate carries ±50% exactly', () => {
    // 1000 × 0.4 × 2 = 800 sqm × $3000 = $2.4M → low $1.2M, high $3.6M
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(2_400_000);
    expect(r.cost_range_low).toBe(1_200_000);
    expect(r.cost_range_high).toBe(3_600_000);
    expect(r.modeled_gfa_sqm).toBe(800);
  });

  it('trusted permit cost keeps modeled_gfa_sqm from the geometry that ran the gate', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 900_000 }),
      makeParcel(),
      makeFootprint(), // 200 × 2 = 400 sqm
      makeNeighbourhood(),
    );
    expect(r.cost_source).toBe('permit');
    expect(r.modeled_gfa_sqm).toBe(400);
  });
});

describe('V1 tradeAllocationPct slicing (sliceTradeValues)', () => {
  it('slices the trusted permit cost by pct, rounds, and DROPS zero slices', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 200_001 }),
      null,
      makeFootprint(),
      makeNeighbourhood(),
      { liarGateThreshold: 0, tradeAllocationPct: { plumbing: 0.1, electrical: 0, hvac: 0.005 } },
    );
    expect(r.estimated_cost).toBe(200_001);
    // 200,001 × 0.1 = 20,000.1 → 20,000 (rounded); electrical 0% is DROPPED (val > 0 filter)
    expect(r.trade_contract_values).toEqual({ plumbing: 20_000, hvac: 1_000 });
  });

  it('no tradeAllocationPct config → empty trade_contract_values on the model path', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null }),
      makeParcel(),
      makeFootprint(),
      makeNeighbourhood(),
    );
    expect(r.cost_source).toBe('model');
    expect(r.trade_contract_values).toEqual({});
  });
});

describe('V1 display formatting — formatDollarShort boundaries + label thresholds', () => {
  it('model range spanning the $1M format boundary renders "$600K–$1.0M estimated · Large Job" exactly', () => {
    // Addition rate: 400 sqm × 1 storey × $2000 × 1.0 = $800,000 → low 600K, high exactly 1.0M.
    // Complexity: largeFootprint +15 only (< 40, no label); premium 1.0 (no label).
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'Addition', structure_type: 'Detached Dwelling', scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 400, estimated_stories: 1 }),
      makeNeighbourhood({ avg_household_income: null, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(800_000);
    expect(r.display).toBe('$600K–$1.0M estimated · Large Job');
  });

  it('low of exactly $1000 renders "$1K" (>= boundary), giving "$1K–$3K estimated · Small Job"', () => {
    // fallback: 1.25 sqm lot × 0.4 × 2 = 1 sqm × $2000 = $2000 model → low 1000, high 3000.
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'Addition', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 1.25 }),
      null,
      makeNeighbourhood({ avg_household_income: null, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(2000);
    expect(r.display).toBe('$1K–$3K estimated · Small Job');
  });

  it('sub-$1000 values render whole dollars: "$400–$1K estimated · Small Job"', () => {
    // fallback: 0.5 sqm lot × 0.4 × 2 = 0.4 sqm × $2000 ≈ $800 → low ≈ 400, high ≈ 1200.
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'Addition', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 0.5 }),
      null,
      makeNeighbourhood({ avg_household_income: null, tenure_renter_pct: 0 }),
    );
    expect(r.display).toBe('$400–$1K estimated · Small Job');
  });

  it('complexity 30 (below the 40 label boundary) omits "Complex scope"', () => {
    // storeys 7 → +30 highRise only (Addition = not a new build, no +10)
    const r = estimateCost(
      makePermit({ est_const_cost: 2_500_000, permit_type: 'Addition', storeys: 7, scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 150 }),
      makeNeighbourhood({ avg_household_income: 50_000 }),
    );
    expect(r.complexity_score).toBe(30);
    expect(r.display).not.toContain('Complex scope');
  });
});

describe('V1 complexity — storeys ?? footprint fallback chain', () => {
  it('null permit.storeys falls back to footprint.estimated_stories for the high-rise signal', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'Interior Alteration', storeys: null, dwelling_units_created: 1, scope_tags: [] }),
      null,
      makeFootprint({ footprint_area_sqm: 150, estimated_stories: 7 }),
      makeNeighbourhood({ avg_household_income: 70_000 }),
    );
    expect(r.complexity_score).toBe(30);
  });

  it('null storeys AND null footprint → no high-rise signal, score 0', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: 2_000_000, permit_type: 'Interior Alteration', storeys: null, dwelling_units_created: 1, scope_tags: [] }),
      null,
      null,
      makeNeighbourhood({ avg_household_income: 70_000 }),
    );
    expect(r.complexity_score).toBe(0);
    // no geometry at all → modeled_gfa_sqm stays null on the trusted path
    expect(r.modeled_gfa_sqm).toBeNull();
  });
});

describe('V1 computeBuildingArea — remaining fallback edges', () => {
  it('footprint with null stories falls back to the parcel path with the exact fallback cost', () => {
    // parcel 500 × 0.4 × 2 = 400 sqm × $3000 = $1.2M (suburban, renter 0)
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 500 }),
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: null }),
      makeNeighbourhood({ avg_household_income: 50_000, tenure_renter_pct: 0 }),
    );
    expect(r.estimated_cost).toBe(1_200_000);
    expect(r.modeled_gfa_sqm).toBe(400);
  });

  it('NULL neighbourhood on the parcel fallback defaults renter pct to 0 → suburban coverage', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'New Building', structure_type: 'Detached Dwelling', scope_tags: [] }),
      makeParcel({ lot_size_sqm: 500 }),
      null,
      null,
    );
    // 500 × 0.4 × 2 = 400 sqm × $3000 × 1.0 (null income) = $1.2M
    expect(r.estimated_cost).toBe(1_200_000);
    expect(r.premium_factor).toBe(1.0);
  });

  it('Path 3 (no cost, no geometry) returns the full null envelope', () => {
    const r = estimateCost(
      makePermit({ est_const_cost: null, permit_type: 'Interior Alteration', scope_tags: [] }),
      null,
      null,
      makeNeighbourhood({ avg_household_income: 120_000 }),
    );
    expect(r.estimated_cost).toBeNull();
    expect(r.cost_source).toBe('model');
    expect(r.cost_tier).toBeNull();
    expect(r.cost_range_low).toBeNull();
    expect(r.cost_range_high).toBeNull();
    expect(r.is_geometric_override).toBe(false);
    expect(r.modeled_gfa_sqm).toBeNull();
    expect(r.premium_factor).toBe(1.35); // premium still computed for telemetry
    expect(r.trade_contract_values).toEqual({});
    expect(r.display).toBe('Cost estimate unavailable');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Brain-path delegation block (config.tradeRates present) — §3-ARCHETYPE row
// pass-through + config defaults. Each test makes ONE (or one cluster of)
// shim-forwarded field(s) output-relevant so a nulled/dropped field in the
// cost-model.ts row builder changes the result. Ladder mechanics themselves
// are pinned in archetype-ladder.logic.test.ts + parity-battery.test.ts; here
// we only need the TS shim's forwarding to be load-bearing.
// ───────────────────────────────────────────────────────────────────────────

const BRAIN_RATES = {
  plumbing: { base_rate_sqft: 100, structure_complexity_factor: 1.0 },
  electrical: { base_rate_sqft: 300, structure_complexity_factor: 1.0 },
};

const ARCH_CONFIG = {
  tradeRates: BRAIN_RATES,
  scopeMatrix: { 'New Building::SFD': 1.0 },
  archetypeEnabled: true,
  archetypeT1FsiMin: 0.05,
  archetypeT1FsiMax: 8,
  archetypeT1TotalCap: 25_000_000,
  archetypeT2RenoCap: 10_000_000,
  archetypeT2BuildCap: 20_000_000,
  archetypeT2BuildMin: 200_000,
  archetypeT3TotalCap: 15_000_000,
};

/** Low-rise residential, construction-class permit — the archetype entry gate. */
function archPermit(overrides: Partial<CostModelPermitInput> = {}): CostModelPermitInput {
  return makePermit({
    permit_type_class: 'construction',
    structure_type: 'SFD',
    est_const_cost: null,
    scope_tags: [],
    ...overrides,
  });
}

describe('Brain path §3-ARCHETYPE — shim row pass-through (T2 parcel totals)', () => {
  it('max_build line: cost_fb_total + opt_aor_gfa_sqm + premium forwarded (T2, archetype_parcel)', () => {
    const r = estimateCost(
      archPermit({
        project_type: 'new_build',
        cost_fb_total: 1_500_000,
        opt_aor_gfa_sqm: 300,
        neighbourhood_cost_premium: 1.2,
        active_trade_slugs: ['plumbing', 'electrical'],
      }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(1_500_000);
    expect(r.modeled_gfa_sqm).toBe(300);
    expect(r.effective_area_sqm).toBe(300);
    expect(r.premium_factor).toBe(1.2);
    expect(r.cost_range_low).toBe(1_125_000);
    expect(r.cost_range_high).toBe(1_875_000);
    expect(r.cost_tier).toBe('large');
    expect(r.is_geometric_override).toBe(false);
    // Decision-4 slicing over the shim-forwarded active_trade_slugs (rates 100 vs 300)
    expect(r.trade_contract_values).toEqual({ plumbing: 375_000, electrical: 1_125_000 });
    // archetype = model-style display with the en-dash range
    expect(r.display).toBe('$1.1M–$1.9M estimated · Large Job');
  });

  it('T1 declared-area rung: residential_sqm + lot forwarded (archetype_declared_area)', () => {
    // per-sqm = 1.5M / 300 = $5000; own area 250; fsi 250/400 = 0.625 ∈ [0.05, 8]
    const r = estimateCost(
      archPermit({ project_type: 'new_build', cost_fb_total: 1_500_000, opt_aor_gfa_sqm: 300, residential_sqm: 250 }),
      makeParcel({ lot_size_sqm: 400 }),
      null, null, ARCH_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_declared_area');
    expect(r.estimated_cost).toBe(1_250_000);
    expect(r.modeled_gfa_sqm).toBe(250);
  });

  it('addition line: cost_addition_total + cur_floor_gfa_sqm forwarded', () => {
    const r = estimateCost(
      archPermit({ scope_tags: ['addition'], cost_addition_total: 400_000, cur_floor_gfa_sqm: 120 }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(400_000);
    expect(r.modeled_gfa_sqm).toBe(120);
  });

  it('underpin+basement additive pair: both per-sqm scalars × cur_floor area, summed', () => {
    const r = estimateCost(
      archPermit({
        scope_tags: ['underpinning', 'basement'],
        cost_basement_underpin_per_sqm: 800,
        cost_basement_per_sqm: 500,
        cur_floor_gfa_sqm: 100,
      }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(130_000); // 800×100 + 500×100
    expect(r.modeled_gfa_sqm).toBe(200); // both bases summed
  });

  it('kitchen+bath additive pair: per-sqm scalars × their OWN estimated areas', () => {
    const r = estimateCost(
      archPermit({
        scope_tags: ['kitchen', 'bathroom'],
        cost_kitchen_per_sqm: 3000,
        cur_est_kitchen_gfa_sqm: 20,
        cost_bath_per_sqm: 4000,
        cur_est_bath_gfa_sqm: 10,
      }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.estimated_cost).toBe(100_000); // 60K + 40K
    expect(r.modeled_gfa_sqm).toBe(30);
  });

  it('garage line: cost_garage_total + max_garage_gfa_sqm forwarded', () => {
    const r = estimateCost(
      archPermit({ scope_tags: ['garage'], cost_garage_total: 90_000, max_garage_gfa_sqm: 45 }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.estimated_cost).toBe(90_000);
    expect(r.modeled_gfa_sqm).toBe(45);
  });

  it('garage fit-gate: NULL scalar = fits:false → cost null + unavailable display', () => {
    const r = estimateCost(
      archPermit({ scope_tags: ['garage'] }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.cost_source).toBe('none');
    expect(r.estimated_cost).toBeNull();
    expect(r.cost_tier).toBeNull();
    expect(r.display).toBe('Cost estimate unavailable');
    expect(r.trade_contract_values).toEqual({});
  });

  it('laneway_suite line: cost_laneway_suite_total + max_laneway_suite_gfa_sqm forwarded', () => {
    const r = estimateCost(
      archPermit({ scope_tags: ['laneway-suite'], cost_laneway_suite_total: 350_000, max_laneway_suite_gfa_sqm: 60 }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.estimated_cost).toBe(350_000);
    expect(r.modeled_gfa_sqm).toBe(60);
  });

  it('solar line: cost_solar_total + max_buildable_footprint_sqm forwarded', () => {
    const r = estimateCost(
      archPermit({ scope_tags: ['solar'], cost_solar_total: 30_000, max_buildable_footprint_sqm: 150 }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.estimated_cost).toBe(30_000);
    expect(r.modeled_gfa_sqm).toBe(150);
  });

  it('T3 rate rung: archetypeRates + interior_alterations_sqm + premium forwarded (archetype_rate)', () => {
    // gut line, no parcel scalar → T3 = INT $2000/sqm × 50 sqm own area × premium 1.2
    const r = estimateCost(
      archPermit({ scope_tags: ['renovation'], interior_alterations_sqm: 50, neighbourhood_cost_premium: 1.2 }),
      null, null, null,
      { ...ARCH_CONFIG, archetypeRates: { INT: 2000 } },
    );
    expect(r.cost_source).toBe('archetype_rate');
    expect(r.estimated_cost).toBe(120_000);
    expect(r.modeled_gfa_sqm).toBe(50);
  });

  it('archetype premium ≥1.35 + complexity 40 drive both display labels through the Brain branch', () => {
    const r = estimateCost(
      archPermit({
        project_type: 'new_build',
        cost_fb_total: 2_000_000,
        opt_aor_gfa_sqm: 300,
        neighbourhood_cost_premium: 1.5,
        storeys: 7, // +30 highRise; 'New Building' default permit_type → +10 newBuild = 40
      }),
      null, null, null, ARCH_CONFIG,
    );
    expect(r.premium_factor).toBe(1.5);
    expect(r.complexity_score).toBe(40);
    expect(r.display).toContain('Premium neighbourhood');
    expect(r.display).toContain('Complex scope');
  });

  it('archetypeEnabled ABSENT → ladder stays OFF even with scalars present (T4 surgical)', () => {
    const r = estimateCost(
      archPermit({
        project_type: 'new_build',
        cost_fb_total: 1_500_000,
        opt_aor_gfa_sqm: 300,
        active_trade_slugs: ['plumbing'],
      }),
      null,
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      null,
      { tradeRates: BRAIN_RATES, scopeMatrix: { 'New Building::SFD': 1.0 } },
    );
    // surgical: 400 sqm × $100 × 1.0 × 1.0 = $40,000 — NOT the $1.5M archetype total
    expect(r.cost_source).toBe('model');
    expect(r.estimated_cost).toBe(40_000);
  });
});

describe('Brain path — shim config defaults + display source dispatch', () => {
  it('trusted permit cost through the Brain renders the full-dollar (non-estimated) display', () => {
    const r = estimateCost(
      archPermit({
        structure_type: 'Office Building', // not low-rise → T4
        est_const_cost: 500_000,
        active_trade_slugs: ['plumbing'],
      }),
      null,
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      null,
      { tradeRates: BRAIN_RATES, scopeMatrix: { 'New Building::Office Building': 1.0 } },
    );
    // surgical 400×100 = $40K; reported $500K ≥ gate → trusted
    expect(r.cost_source).toBe('permit');
    expect(r.estimated_cost).toBe(500_000);
    expect(r.display).toContain('$500,000');
    expect(r.display).not.toContain('estimated');
    expect(r.trade_contract_values).toEqual({ plumbing: 500_000 });
  });

  it('trustThresholdPct is honored when liarGateThreshold is absent (?? chain)', () => {
    // surgical $40K; gate at 0.9 → $36K. Reported $20K < $36K → override.
    // (With the 0.25 default the gate is $10K and $20K would be TRUSTED.)
    const r = estimateCost(
      archPermit({
        structure_type: 'Office Building',
        est_const_cost: 20_000,
        active_trade_slugs: ['plumbing'],
      }),
      null,
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      null,
      { tradeRates: BRAIN_RATES, scopeMatrix: { 'New Building::Office Building': 1.0 }, trustThresholdPct: 0.9 },
    );
    expect(r.is_geometric_override).toBe(true);
    expect(r.estimated_cost).toBe(40_000);
  });

  it('custom urbanCoverageRatio reaches the Brain GFA fallback (not the 0.7 default)', () => {
    // SFD (residential, 2 fallback floors), ladder disabled (no archetypeEnabled), mapper-null.
    // renter 60% > 50 → urban: 1000 × 0.5 × 2 = 1000 sqm GFA; areaEff ×0.5 = 500 → $50K
    const r = estimateCost(
      archPermit({ active_trade_slugs: ['plumbing'] }),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: null, tenure_renter_pct: 60 }),
      {
        tradeRates: BRAIN_RATES,
        scopeMatrix: { 'New Building::SFD': 0.5 },
        urbanCoverageRatio: 0.5,
        suburbanCoverageRatio: 0.25,
      },
    );
    expect(r.modeled_gfa_sqm).toBe(1000);
    expect(r.estimated_cost).toBe(50_000);
  });

  it('custom suburbanCoverageRatio reaches the Brain GFA fallback (not the 0.4 default)', () => {
    // renter 0 ≤ 50 → suburban: 1000 × 0.25 × 2 = 500 sqm GFA; areaEff ×0.5 = 250 → $25K
    const r = estimateCost(
      archPermit({ active_trade_slugs: ['plumbing'] }),
      makeParcel({ lot_size_sqm: 1000 }),
      null,
      makeNeighbourhood({ avg_household_income: null, tenure_renter_pct: 0 }),
      {
        tradeRates: BRAIN_RATES,
        scopeMatrix: { 'New Building::SFD': 0.5 },
        urbanCoverageRatio: 0.5,
        suburbanCoverageRatio: 0.25,
      },
    );
    expect(r.modeled_gfa_sqm).toBe(500);
    expect(r.estimated_cost).toBe(25_000);
  });

  it('premiumTiers default map (config omits premiumTiers) still applies income tiers', () => {
    // income $250K → top tier 1.85; surgical $40K × 1.85 = $74K
    const r = estimateCost(
      archPermit({ structure_type: 'Office Building', active_trade_slugs: ['plumbing'] }),
      null,
      makeFootprint({ footprint_area_sqm: 200, estimated_stories: 2 }),
      makeNeighbourhood({ avg_household_income: 250_000, tenure_renter_pct: 0 }),
      { tradeRates: BRAIN_RATES, scopeMatrix: { 'New Building::Office Building': 1.0 } },
    );
    expect(r.premium_factor).toBe(1.85);
    expect(r.estimated_cost).toBe(74_000);
  });
});
