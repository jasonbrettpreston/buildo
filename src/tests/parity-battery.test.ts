/**
 * parity-battery.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §5 Testing Mandate
 *
 * Verifies that the JS Brain (cost-model-shared.js) and the TS shim
 * (cost-model.ts with tradeRates) produce byte-identical estimates for every
 * surgical valuation branch.
 *
 * Covered branches:
 *   - Zero-Total Bypass       — no active trades or all rates = 0
 *   - Default                 — no/placeholder reported cost → surgical model
 *   - Override (Liar's Gate)  — reported < surgical × threshold
 *   - Trust (Prop Slicing)    — reported ≥ surgical × threshold
 *   - Shell permit            — interior trades get 0.60x multiplier
 *   - Matrix hit/miss         — scope_intensity_matrix lookup vs fallback
 *   - Duplicate scope_tags    — dedup via Set before complexity score
 *   - NaN / Infinity guards   — Number.isFinite sanitization
 *   - GFA fallback            — urban vs suburban coverage ratio
 *   - Multi-trade slicing     — proportional weights preserved
 *
 * Both paths are exercised with the SAME config so output must be equal.
 * The comparison excludes: display (TS-only), computed_at (time), model_version
 * (wrapper adds it), and internal _ flags (Brain telemetry, not persisted).
 */

import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  type CostModelPermitInput,
  type CostModelParcelInput,
  type CostModelFootprintInput,
  type CostModelNeighbourhoodInput,
  PREMIUM_TIERS,
} from '@/features/leads/lib/cost-model';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { estimateCostShared } = require('../../src/features/leads/lib/cost-model-shared') as {
  estimateCostShared: (row: Record<string, unknown>, config: Record<string, unknown>) => Record<string, unknown>;
};

// ─── Shared test configuration ──────────────────────────────────────────────
// Minimal deterministic rate table — enough to cover all branches.
const TRADE_RATES = {
  plumbing:             { base_rate_sqft: 195, structure_complexity_factor: 1.40 },
  electrical:           { base_rate_sqft: 195, structure_complexity_factor: 1.40 },
  'drain-plumbing':     { base_rate_sqft:  98, structure_complexity_factor: 1.20 },
  drywall:              { base_rate_sqft:  98, structure_complexity_factor: 1.10 }, // interior
  painting:             { base_rate_sqft:  73, structure_complexity_factor: 1.00 }, // interior
  framing:              { base_rate_sqft: 292, structure_complexity_factor: 1.30 },
  concrete:             { base_rate_sqft: 195, structure_complexity_factor: 1.20 },
  roofing:              { base_rate_sqft: 122, structure_complexity_factor: 1.00 },
  hvac:                 { base_rate_sqft: 244, structure_complexity_factor: 1.30 },
  excavation:           { base_rate_sqft:  73, structure_complexity_factor: 1.00 },
  insulation:           { base_rate_sqft:  73, structure_complexity_factor: 1.00 },
};

const SCOPE_MATRIX: Record<string, number> = {
  'new building::sfd':              1.0000,
  'new building::semi-detached':    1.0000,
  'new building::multi-residential':1.0000,
  'addition::sfd':                  0.2500,
  'alteration::sfd':                0.1500,
  'interior alteration::commercial':0.2500,
  'interior alteration::sfd':       0.2000,
};

const PREMIUM_TIERS_EXPLICIT = PREMIUM_TIERS.map((t) => ({
  min: t.min,
  max: t.max,
  multiplier: t.multiplier,
}));

const SHARED_CONFIG = {
  tradeRates: TRADE_RATES,
  scopeMatrix: SCOPE_MATRIX,
  urbanCoverageRatio: 0.70,
  suburbanCoverageRatio: 0.40,
  trustThresholdPct: 0.25,
  liarGateThreshold: 0.25,
  premiumTiers: PREMIUM_TIERS_EXPLICIT,
};

// ─── Test input shape ────────────────────────────────────────────────────────
interface ParityInput {
  permit: CostModelPermitInput;
  parcel: CostModelParcelInput | null;
  footprint: CostModelFootprintInput | null;
  neighbourhood: CostModelNeighbourhoodInput | null;
}

/**
 * Flatten the 4-object TS input into the flat PermitRow shape the Brain expects.
 */
function toRow(input: ParityInput): Record<string, unknown> {
  return {
    permit_num:            input.permit.permit_num,
    revision_num:          input.permit.revision_num,
    permit_type:           input.permit.permit_type,
    structure_type:        input.permit.structure_type,
    work:                  input.permit.work,
    est_const_cost:        input.permit.est_const_cost,
    scope_tags:            input.permit.scope_tags,
    storeys:               input.permit.storeys,
    dwelling_units_created:input.permit.dwelling_units_created,
    active_trade_slugs:    input.permit.active_trade_slugs ?? [],
    footprint_area_sqm:    input.footprint?.footprint_area_sqm ?? null,
    estimated_stories:     input.footprint?.estimated_stories ?? null,
    lot_size_sqm:          input.parcel?.lot_size_sqm ?? null,
    avg_household_income:  input.neighbourhood?.avg_household_income ?? null,
    tenure_renter_pct:     input.neighbourhood?.tenure_renter_pct ?? null,
  };
}

/** Fields compared between JS and TS paths (excludes time, display, internal flags). */
const PARITY_FIELDS = [
  'estimated_cost',
  'cost_source',
  'cost_tier',
  'is_geometric_override',
  'trade_contract_values',
  'effective_area_sqm',
  'modeled_gfa_sqm',
  'cost_range_low',
  'cost_range_high',
  'premium_factor',
  'complexity_score',
] as const;

function assertParity(input: ParityInput, label: string) {
  const tsResult = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
  const jsResult = estimateCostShared(toRow(input), SHARED_CONFIG);

  for (const field of PARITY_FIELDS) {
    expect(
      tsResult[field],
      `[${label}] TS.${field}`,
    ).toEqual(jsResult[field]);
  }
}

// ─── Fixture factory helpers ─────────────────────────────────────────────────
function makePermit(overrides: Partial<CostModelPermitInput> & Pick<CostModelPermitInput, 'permit_num'>): CostModelPermitInput {
  return {
    permit_num: overrides.permit_num,
    revision_num: overrides.revision_num ?? '00',
    permit_type: overrides.permit_type ?? null,
    structure_type: overrides.structure_type ?? null,
    work: overrides.work ?? null,
    est_const_cost: overrides.est_const_cost ?? null,
    scope_tags: overrides.scope_tags ?? null,
    dwelling_units_created: overrides.dwelling_units_created ?? null,
    storeys: overrides.storeys ?? null,
    active_trade_slugs: overrides.active_trade_slugs ?? [],
  };
}

const GOOD_FOOTPRINT: CostModelFootprintInput = { footprint_area_sqm: 200, estimated_stories: 2 };
const GOOD_PARCEL: CostModelParcelInput = { lot_size_sqm: 400, frontage_m: 10 };
const MID_NEIGHBOURHOOD: CostModelNeighbourhoodInput = { avg_household_income: 120_000, tenure_renter_pct: 20 };
const URBAN_NEIGHBOURHOOD: CostModelNeighbourhoodInput = { avg_household_income: 80_000, tenure_renter_pct: 70 };

// ─── Zero-Total Bypass branch ────────────────────────────────────────────────
describe('parity-battery — Zero-Total Bypass (cost_source="none")', () => {
  it('C01: no active_trade_slugs → bypass regardless of geometry', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C01', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: [] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C01');
    const ts = estimateCost(
      makePermit({ permit_num: 'C01', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: [] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
    expect(ts.trade_contract_values).toEqual({});
  });

  it('C02: active trades but slugs not in tradeRates → all zeros → bypass', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C02', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['pool-installation', 'decking-fences'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C02');
  });

  it('C03: no massing AND no active trades → double bypass path', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C03', active_trade_slugs: [] }),
      parcel: null, footprint: null, neighbourhood: null,
    }, 'C03');
    const ts = estimateCost(
      makePermit({ permit_num: 'C03', active_trade_slugs: [] }),
      null, null, null, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('none');
  });
});

// ─── Default branch (surgical model, no reported cost) ───────────────────────
describe('parity-battery — Default path (cost_source="model", no override)', () => {
  it('C04: null est_const_cost + good massing + plumbing trade', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C04', permit_type: 'new building', structure_type: 'sfd', est_const_cost: null, active_trade_slugs: ['plumbing', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C04');
    const ts = estimateCost(
      makePermit({ permit_num: 'C04', permit_type: 'new building', structure_type: 'sfd', est_const_cost: null, active_trade_slugs: ['plumbing', 'electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('model');
    expect(ts.is_geometric_override).toBe(false);
    expect(ts.estimated_cost).toBeGreaterThan(0);
  });

  it('C05: est_const_cost = 500 (below placeholder $1000) → surgical model overrides', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C05', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 500, active_trade_slugs: ['electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C05');
    const ts = estimateCost(
      makePermit({ permit_num: 'C05', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 500, active_trade_slugs: ['electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('model');
    expect(ts.is_geometric_override).toBe(false);
  });

  it('C06: est_const_cost = 1 (typical placeholder filing fee) → model path', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C06', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 1, active_trade_slugs: ['framing', 'concrete'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C06');
  });

  it('C07: lot-size GFA fallback (no footprint), no reported cost', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C07', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      parcel: GOOD_PARCEL, footprint: null, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C07');
    const ts = estimateCost(
      makePermit({ permit_num: 'C07', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      GOOD_PARCEL, null, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('model');
  });
});

// ─── Override branch (Liar's Gate fires) ─────────────────────────────────────
describe('parity-battery — Override path (is_geometric_override=true)', () => {
  it('C08: reported $5K vs surgical ~$80K → Liar\'s Gate override', () => {
    // plumbing + electrical on 200 sqm footprint × 2 stories × rate × complexity × premium
    assertParity({
      permit: makePermit({ permit_num: 'C08', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 5_000, active_trade_slugs: ['plumbing', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C08');
    const ts = estimateCost(
      makePermit({ permit_num: 'C08', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 5_000, active_trade_slugs: ['plumbing', 'electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.is_geometric_override).toBe(true);
    expect(ts.cost_source).toBe('model');
  });

  it('C09: reported $10K vs large surgical → Override (footprint-based)', () => {
    // surgical total for 500sqm × 5 stories × framing+concrete+plumbing ≈ $2M+
    // reported $10K is well below surgical × 0.25 → override fires
    const bigFootprint: CostModelFootprintInput = { footprint_area_sqm: 500, estimated_stories: 5 };
    assertParity({
      permit: makePermit({ permit_num: 'C09', permit_type: 'new building', structure_type: 'multi-residential', est_const_cost: 10_000, active_trade_slugs: ['framing', 'concrete', 'plumbing'] }),
      parcel: null, footprint: bigFootprint, neighbourhood: null,
    }, 'C09');
    const ts = estimateCost(
      makePermit({ permit_num: 'C09', permit_type: 'new building', structure_type: 'multi-residential', est_const_cost: 10_000, active_trade_slugs: ['framing', 'concrete', 'plumbing'] }),
      null, bigFootprint, null, SHARED_CONFIG,
    );
    expect(ts.is_geometric_override).toBe(true);
  });

  it('C10: Override suppressed when usedFallback=true (lot-size uncertainty)', () => {
    // Lot-size fallback + reported cost below threshold → Brain suppresses override
    // (fallback has ±50% uncertainty; override would be unreliable)
    assertParity({
      permit: makePermit({ permit_num: 'C10', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 10_000, active_trade_slugs: ['electrical'] }),
      parcel: { lot_size_sqm: 500, frontage_m: 10 }, footprint: null, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C10');
    const ts = estimateCost(
      makePermit({ permit_num: 'C10', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 10_000, active_trade_slugs: ['electrical'] }),
      { lot_size_sqm: 500, frontage_m: 10 }, null, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    // Override is suppressed when fallback is used
    expect(ts.is_geometric_override).toBe(false);
  });
});

// ─── Trust branch (proportional slicing) ─────────────────────────────────────
describe('parity-battery — Trust path (cost_source="permit", proportional slicing)', () => {
  it('C11: reported $500K vs surgical $200K → city cost trusted, sliced by weight', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C11', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 500_000, active_trade_slugs: ['plumbing', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C11');
    const ts = estimateCost(
      makePermit({ permit_num: 'C11', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 500_000, active_trade_slugs: ['plumbing', 'electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('permit');
    expect(ts.estimated_cost).toBe(500_000);
    expect(ts.is_geometric_override).toBe(false);
    // Proportional slicing: trade_contract_values must sum to ~reported cost
    const sliceSum = Object.values(ts.trade_contract_values).reduce((a, b) => a + b, 0);
    expect(sliceSum).toBeGreaterThan(0);
    expect(sliceSum).toBeLessThanOrEqual(500_000);
  });

  it('C12: reported cost ≥ threshold, single trade → full slice to that trade', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C12', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 80_000, active_trade_slugs: ['roofing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C12');
    const ts = estimateCost(
      makePermit({ permit_num: 'C12', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: 80_000, active_trade_slugs: ['roofing'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.cost_source).toBe('permit');
    // Single trade slice = reported cost (full weight)
    expect(ts.trade_contract_values['roofing']).toBe(80_000);
  });

  it('C13: three-trade proportional slicing preserves relative weights', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C13', permit_type: 'new building', structure_type: 'sfd', est_const_cost: 400_000, active_trade_slugs: ['framing', 'concrete', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C13');
  });
});

// ─── Shell permit branch ──────────────────────────────────────────────────────
describe('parity-battery — Shell permit (0.60x interior multiplier)', () => {
  it('C14: shell permit — interior trades (drywall, painting) get 0.60x discount', () => {
    const shellPermit = makePermit({
      permit_num: 'C14',
      permit_type: 'new building (shell)',
      structure_type: 'sfd',
      work: 'structural shell only',
      active_trade_slugs: ['drywall', 'painting', 'framing'],
    });
    assertParity({
      permit: shellPermit,
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C14');
  });

  it('C15: shell via work field — "shell construction" keyword', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C15', permit_type: 'new building', work: 'erect shell construction', active_trade_slugs: ['electrical', 'framing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C15');
  });

  it('C16: non-shell — interior trades get full rate (0.60x only on shell)', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C16', permit_type: 'interior alteration', structure_type: 'sfd', active_trade_slugs: ['drywall', 'painting'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C16');
    // Same permit_type+structure_type (same matrix allocation), only work field differs
    const shellResult = estimateCost(
      makePermit({ permit_num: 'C16-s', permit_type: 'new building', structure_type: 'sfd', work: 'erect shell', active_trade_slugs: ['drywall'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    const normalResult = estimateCost(
      makePermit({ permit_num: 'C16-n', permit_type: 'new building', structure_type: 'sfd', work: null, active_trade_slugs: ['drywall'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    // Same matrix allocation → same area_eff → only rate differs (0.60x on shell)
    expect((shellResult.estimated_cost ?? 0)).toBeLessThan(normalResult.estimated_cost ?? Infinity);
  });
});

// ─── Matrix hit / miss branch ─────────────────────────────────────────────────
describe('parity-battery — Scope intensity matrix hit/miss', () => {
  it('C17: matrix hit — "addition::sfd" → 0.25 allocation', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C17', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['plumbing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C17');
  });

  it('C18: matrix miss — unknown combination → full GFA (allocation = 1.0)', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C18', permit_type: 'demolition', structure_type: 'industrial', active_trade_slugs: ['excavation'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C18');
    // Matrix miss means effective_area = full GFA (area_eff = gfa × 1.0)
    const ts = estimateCost(
      makePermit({ permit_num: 'C18', permit_type: 'demolition', structure_type: 'industrial', active_trade_slugs: ['excavation'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    // gfa = 200 × 2 = 400 sqm; area_eff = 400 (no matrix reduction)
    expect(ts.effective_area_sqm).toBeCloseTo(400, 1);
  });

  it('C19: matrix hit — "interior alteration::commercial" → 0.25 allocation', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C19', permit_type: 'interior alteration', structure_type: 'commercial', active_trade_slugs: ['electrical', 'hvac'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C19');
  });
});

// ─── Duplicate scope_tags branch ─────────────────────────────────────────────
describe('parity-battery — Duplicate scope_tags deduplication (W8)', () => {
  it('C20: scope_tags=[pool,pool] → complexity counts pool once (not twice)', () => {
    const dupTags = makePermit({ permit_num: 'C20', scope_tags: ['pool', 'pool'], active_trade_slugs: ['plumbing'] });
    const dedupTags = makePermit({ permit_num: 'C20b', scope_tags: ['pool'], active_trade_slugs: ['plumbing'] });
    const parityInput = { permit: dupTags, parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null };
    assertParity(parityInput, 'C20');
    const tsWithDup = estimateCost(dupTags, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    const tsWithOne = estimateCost(dedupTags, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    // Complexity must be identical — dedup prevents double-counting
    expect(tsWithDup.complexity_score).toBe(tsWithOne.complexity_score);
  });

  it('C21: scope_tags=[elevator,elevator] → deduped, not double-counted', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C21', scope_tags: ['elevator', 'elevator'], active_trade_slugs: ['electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C21');
  });

  it('C22: scope_tags=[pool,elevator,pool,underpinning] → 3 unique signals counted once each', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C22', scope_tags: ['pool', 'elevator', 'pool', 'underpinning'], active_trade_slugs: ['plumbing', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C22');
    const ts = estimateCost(
      makePermit({ permit_num: 'C22', scope_tags: ['pool', 'elevator', 'pool', 'underpinning'], active_trade_slugs: ['plumbing', 'electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, MID_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    // 3 unique complexScope signals (pool, elevator, underpinning) × 10 pts = 30
    // MID_NEIGHBOURHOOD income=120K < premiumNbhd threshold of 150K → no +15
    expect(ts.complexity_score).toBe(30);
  });
});

// ─── NaN / numeric sanitization branch ───────────────────────────────────────
describe('parity-battery — NaN / Infinity sanitization (W12, W21)', () => {
  it('C23: est_const_cost = NaN → treated as null → model path', () => {
    const nanPermit = makePermit({ permit_num: 'C23', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: NaN, active_trade_slugs: ['electrical'] });
    assertParity({
      permit: nanPermit, parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C23');
    const ts = estimateCost(nanPermit, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    expect(ts.cost_source).toBe('model');
    expect(ts.is_geometric_override).toBe(false);
  });

  it('C24: est_const_cost = Infinity → treated as null → model path', () => {
    const infPermit = makePermit({ permit_num: 'C24', permit_type: 'alteration', structure_type: 'sfd', est_const_cost: Infinity, active_trade_slugs: ['roofing'] });
    assertParity({
      permit: infPermit, parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C24');
    const ts = estimateCost(infPermit, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    expect(ts.cost_source).toBe('model');
  });

  it('C25: est_const_cost = -Infinity → treated as null (negative not finite)', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C25', est_const_cost: -Infinity, active_trade_slugs: ['plumbing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C25');
  });
});

// ─── GFA fallback branch (urban vs suburban) ──────────────────────────────────
describe('parity-battery — GFA fallback (urban vs suburban coverage)', () => {
  it('C26: urban neighbourhood (tenure_renter_pct=70) → 0.70 coverage fallback', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C26', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      parcel: { lot_size_sqm: 300, frontage_m: 8 }, footprint: null, neighbourhood: URBAN_NEIGHBOURHOOD,
    }, 'C26');
    const ts = estimateCost(
      makePermit({ permit_num: 'C26', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      { lot_size_sqm: 300, frontage_m: 8 }, null, URBAN_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    // Urban: gfa = 300 × 0.70 × 2 = 420; area_eff = 420 × 0.25 (addition::sfd) = 105
    expect(ts.effective_area_sqm).toBeCloseTo(105, 0);
  });

  it('C27: suburban neighbourhood (tenure_renter_pct=15) → 0.40 coverage fallback', () => {
    const suburban = { avg_household_income: 80_000, tenure_renter_pct: 15 };
    assertParity({
      permit: makePermit({ permit_num: 'C27', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      parcel: { lot_size_sqm: 300, frontage_m: 8 }, footprint: null, neighbourhood: suburban,
    }, 'C27');
    const ts = estimateCost(
      makePermit({ permit_num: 'C27', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      { lot_size_sqm: 300, frontage_m: 8 }, null, suburban, SHARED_CONFIG,
    );
    // Suburban: gfa = 300 × 0.40 × 2 = 240; area_eff = 240 × 0.25 = 60
    expect(ts.effective_area_sqm).toBeCloseTo(60, 0);
  });

  it('C28: urban GFA > suburban GFA for same lot (coverage ratio difference)', () => {
    const urban = estimateCost(
      makePermit({ permit_num: 'C28u', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      { lot_size_sqm: 300, frontage_m: 8 }, null, URBAN_NEIGHBOURHOOD, SHARED_CONFIG,
    );
    const suburban = estimateCost(
      makePermit({ permit_num: 'C28s', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      { lot_size_sqm: 300, frontage_m: 8 }, null, { avg_household_income: 50_000, tenure_renter_pct: 15 }, SHARED_CONFIG,
    );
    expect(urban.effective_area_sqm ?? 0).toBeGreaterThan(suburban.effective_area_sqm ?? 0);
  });
});

// ─── Premium neighbourhood factor ────────────────────────────────────────────
describe('parity-battery — Neighbourhood premium factor', () => {
  it('C29: no neighbourhood data → premium = 1.0', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C29', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C29');
    const ts = estimateCost(
      makePermit({ permit_num: 'C29', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.premium_factor).toBe(1.0);
  });

  it('C30: income $180K → multiplier 1.60 (150K–200K band)', () => {
    const richNeighbourhood = { avg_household_income: 180_000, tenure_renter_pct: 20 };
    assertParity({
      permit: makePermit({ permit_num: 'C30', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: richNeighbourhood,
    }, 'C30');
    const ts = estimateCost(
      makePermit({ permit_num: 'C30', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, richNeighbourhood, SHARED_CONFIG,
    );
    expect(ts.premium_factor).toBe(1.60);
  });

  it('C31: income $250K → multiplier 1.85 (200K+ band)', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C31', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['plumbing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: { avg_household_income: 250_000, tenure_renter_pct: 20 },
    }, 'C31');
  });
});

// ─── Complexity score branch ──────────────────────────────────────────────────
describe('parity-battery — Complexity score calculation', () => {
  it('C32: high-rise (storeys=8) → +30 pts', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C32', storeys: 8, active_trade_slugs: ['electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C32');
    const ts = estimateCost(
      makePermit({ permit_num: 'C32', storeys: 8, active_trade_slugs: ['electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.complexity_score).toBeGreaterThanOrEqual(30);
  });

  it('C33: multi-unit dwelling (5 units) → +20 pts', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C33', dwelling_units_created: 5, active_trade_slugs: ['plumbing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C33');
    const ts = estimateCost(
      makePermit({ permit_num: 'C33', dwelling_units_created: 5, active_trade_slugs: ['plumbing'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.complexity_score).toBeGreaterThanOrEqual(20);
  });

  it('C34: new building permit_type → +10 complexity pts for newBuild signal', () => {
    const newBuild = estimateCost(
      makePermit({ permit_num: 'C34n', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    const alteration = estimateCost(
      makePermit({ permit_num: 'C34a', permit_type: 'alteration', structure_type: 'sfd', active_trade_slugs: ['framing'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(newBuild.complexity_score).toBe((alteration.complexity_score ?? 0) + 10);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe('parity-battery — Edge cases and null guards', () => {
  it('C35: all null inputs → Zero-Total Bypass (no massing = no estimate)', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C35', active_trade_slugs: ['plumbing'] }),
      parcel: null, footprint: null, neighbourhood: null,
    }, 'C35');
    const ts = estimateCost(
      makePermit({ permit_num: 'C35', active_trade_slugs: ['plumbing'] }),
      null, null, null, SHARED_CONFIG,
    );
    // No geometry → GFA = 0 → areaEff = 0 → surgical total = 0 → bypass
    expect(ts.cost_source).toBe('none');
  });

  it('C36: zero-area footprint (footprint_area_sqm=0) → falls back to lot size', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C36', permit_type: 'addition', structure_type: 'sfd', active_trade_slugs: ['roofing'] }),
      parcel: GOOD_PARCEL,
      footprint: { footprint_area_sqm: 0, estimated_stories: 2 },
      neighbourhood: MID_NEIGHBOURHOOD,
    }, 'C36');
  });

  it('C37: large footprint (>300 sqm) → +15 largeFootprint complexity pts', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C37', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing', 'concrete'] }),
      parcel: GOOD_PARCEL, footprint: { footprint_area_sqm: 400, estimated_stories: 2 }, neighbourhood: null,
    }, 'C37');
    const ts = estimateCost(
      makePermit({ permit_num: 'C37', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing', 'concrete'] }),
      GOOD_PARCEL, { footprint_area_sqm: 400, estimated_stories: 2 }, null, SHARED_CONFIG,
    );
    expect(ts.complexity_score).toBeGreaterThanOrEqual(15);
  });

  it('C38: scope_tags with null elements does not throw (guard t ?? "")', () => {
    const tagsWithNull = ['pool', null as unknown as string, 'elevator'];
    assertParity({
      permit: makePermit({ permit_num: 'C38', scope_tags: tagsWithNull, active_trade_slugs: ['plumbing'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C38');
  });

  it('C39: case-insensitive permit_type matching in matrix lookup', () => {
    // Brain lowercases and trims permit_type before lookup
    const upper = makePermit({ permit_num: 'C39u', permit_type: 'NEW BUILDING', structure_type: 'SFD', active_trade_slugs: ['framing'] });
    const lower = makePermit({ permit_num: 'C39l', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing'] });
    const tsUpper = estimateCost(upper, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    const tsLower = estimateCost(lower, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    expect(tsUpper.effective_area_sqm).toEqual(tsLower.effective_area_sqm);
  });

  it('C40: range is ±25% when cost_source=model (footprint-based, no fallback)', () => {
    const ts = estimateCost(
      makePermit({ permit_num: 'C40', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['plumbing', 'electrical'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    assertParity({
      permit: makePermit({ permit_num: 'C40', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['plumbing', 'electrical'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C40');
    if (ts.cost_source === 'model' && ts.estimated_cost !== null) {
      expect(ts.cost_range_low).toBe(Math.round(ts.estimated_cost * 0.75));
      expect(ts.cost_range_high).toBe(Math.round(ts.estimated_cost * 1.25));
    }
  });
});
