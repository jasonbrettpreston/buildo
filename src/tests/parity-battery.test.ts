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
  // `permit_type_class` is read off the permit fixture via index access so this
  // helper works for both pre-R5 inputs (no field) and post-R5 inputs (with the
  // CostModelPermitInput field). Production callers always supply the value via
  // the SOURCE_SQL JOIN (Spec 80 §5 default-discipline → 'unclassified').
  const ptc = (input.permit as unknown as Record<string, unknown>).permit_type_class;
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
    permit_type_class:     ptc === undefined ? 'construction' : ptc,
    footprint_area_sqm:    input.footprint?.footprint_area_sqm ?? null,
    estimated_stories:     input.footprint?.estimated_stories ?? null,
    lot_size_sqm:          input.parcel?.lot_size_sqm ?? null,
    avg_household_income:  input.neighbourhood?.avg_household_income ?? null,
    tenure_renter_pct:     input.neighbourhood?.tenure_renter_pct ?? null,
    // §3-ARCHETYPE (WF2 2026-07-06): the JS Brain reads these off the flat row;
    // the TS shim (cost-model.ts:535-560) passes them from `permit`. `toRow`
    // MUST mirror that pass-through or the archetype parity cases would compare
    // TS-with-scalars against JS-without and false-fail. Every field the shim
    // forwards is forwarded here — no deliberate TS↔JS asymmetry (Code Reviewer I4).
    project_type:                   input.permit.project_type ?? null,
    residential_sqm:                input.permit.residential_sqm ?? null,
    interior_alterations_sqm:       input.permit.interior_alterations_sqm ?? null,
    neighbourhood_cost_premium:     input.permit.neighbourhood_cost_premium ?? null,
    cost_fb_total:                  input.permit.cost_fb_total ?? null,
    cost_coa_total:                 input.permit.cost_coa_total ?? null,
    cost_addition_total:            input.permit.cost_addition_total ?? null,
    cost_gut_total:                 input.permit.cost_gut_total ?? null,
    cost_basement_underpin_per_sqm: input.permit.cost_basement_underpin_per_sqm ?? null,
    cost_basement_per_sqm:          input.permit.cost_basement_per_sqm ?? null,
    cost_garage_total:              input.permit.cost_garage_total ?? null,
    cost_laneway_suite_total:       input.permit.cost_laneway_suite_total ?? null,
    cost_garden_suite_total:        input.permit.cost_garden_suite_total ?? null,
    cost_kitchen_per_sqm:           input.permit.cost_kitchen_per_sqm ?? null,
    cost_bath_per_sqm:              input.permit.cost_bath_per_sqm ?? null,
    cost_solar_total:               input.permit.cost_solar_total ?? null,
    opt_aor_gfa_sqm:                input.permit.opt_aor_gfa_sqm ?? null,
    opt_coa_gfa_sqm:                input.permit.opt_coa_gfa_sqm ?? null,
    cur_floor_gfa_sqm:              input.permit.cur_floor_gfa_sqm ?? null,
    cur_pot_2story_gfa_sqm:         input.permit.cur_pot_2story_gfa_sqm ?? null,
    max_garage_gfa_sqm:             input.permit.max_garage_gfa_sqm ?? null,
    max_laneway_suite_gfa_sqm:      input.permit.max_laneway_suite_gfa_sqm ?? null,
    max_garden_suite_gfa_sqm:       input.permit.max_garden_suite_gfa_sqm ?? null,
    cur_est_kitchen_gfa_sqm:        input.permit.cur_est_kitchen_gfa_sqm ?? null,
    cur_est_bath_gfa_sqm:           input.permit.cur_est_bath_gfa_sqm ?? null,
    max_buildable_footprint_sqm:    input.permit.max_buildable_footprint_sqm ?? null,
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
  assertParityWith(input, label, SHARED_CONFIG);
}

/** Parity assertion parametrized by config — used by the archetype block (ARCH_CONFIG). */
function assertParityWith(input: ParityInput, label: string, config: Record<string, unknown>) {
  const tsResult = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, config);
  const jsResult = estimateCostShared(toRow(input), config);

  for (const field of PARITY_FIELDS) {
    expect(
      tsResult[field],
      `[${label}] TS.${field}`,
    ).toEqual(jsResult[field]);
  }
}

// ─── Fixture factory helpers ─────────────────────────────────────────────────
// `permit_type_class` is widened with `& { permit_type_class?: ... }` so the
// factory can default it to 'construction' for existing fixtures (preserves
// today's surgical behavior) and accept non-construction overrides for the
// WF2 #3 gate tests below. Once R5 lands the field on CostModelPermitInput,
// this widening collapses into a clean Partial<CostModelPermitInput>.
type PermitTypeClassValue = 'construction' | 'signage' | 'administrative' | 'safety_upgrade' | 'unclassified';
type MakePermitOverrides =
  & Partial<CostModelPermitInput>
  & Pick<CostModelPermitInput, 'permit_num'>
  & { permit_type_class?: PermitTypeClassValue | null };

function makePermit(overrides: MakePermitOverrides): CostModelPermitInput & { permit_type_class: PermitTypeClassValue | null } {
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
    // WF2 #3: default to 'construction' so existing fixtures keep their surgical
    // path. Non-construction fixtures override explicitly to test the gate.
    permit_type_class: overrides.permit_type_class === undefined ? 'construction' : overrides.permit_type_class,
    // §3-ARCHETYPE (WF2 2026-07-06): forward the ladder inputs so archetype
    // parity fixtures reach BOTH paths (the base factory only copied the pre-
    // archetype subset; unforwarded overrides were silently dropped → the JS
    // side never saw the scalars). Undefined stays undefined → treated as null.
    // `?? null` (never leave `undefined`) — exactOptionalPropertyTypes forbids an
    // explicit undefined on a non-optional-undefined field. null is equivalent for
    // the Brain's Number.isFinite guards.
    project_type:                   overrides.project_type ?? null,
    residential_sqm:                overrides.residential_sqm ?? null,
    interior_alterations_sqm:       overrides.interior_alterations_sqm ?? null,
    neighbourhood_cost_premium:     overrides.neighbourhood_cost_premium ?? null,
    cost_fb_total:                  overrides.cost_fb_total ?? null,
    cost_coa_total:                 overrides.cost_coa_total ?? null,
    cost_addition_total:            overrides.cost_addition_total ?? null,
    cost_gut_total:                 overrides.cost_gut_total ?? null,
    cost_basement_underpin_per_sqm: overrides.cost_basement_underpin_per_sqm ?? null,
    cost_basement_per_sqm:          overrides.cost_basement_per_sqm ?? null,
    cost_garage_total:              overrides.cost_garage_total ?? null,
    cost_laneway_suite_total:       overrides.cost_laneway_suite_total ?? null,
    cost_garden_suite_total:        overrides.cost_garden_suite_total ?? null,
    cost_kitchen_per_sqm:           overrides.cost_kitchen_per_sqm ?? null,
    cost_bath_per_sqm:              overrides.cost_bath_per_sqm ?? null,
    cost_solar_total:               overrides.cost_solar_total ?? null,
    opt_aor_gfa_sqm:                overrides.opt_aor_gfa_sqm ?? null,
    opt_coa_gfa_sqm:                overrides.opt_coa_gfa_sqm ?? null,
    cur_floor_gfa_sqm:              overrides.cur_floor_gfa_sqm ?? null,
    cur_pot_2story_gfa_sqm:         overrides.cur_pot_2story_gfa_sqm ?? null,
    max_garage_gfa_sqm:             overrides.max_garage_gfa_sqm ?? null,
    max_laneway_suite_gfa_sqm:      overrides.max_laneway_suite_gfa_sqm ?? null,
    max_garden_suite_gfa_sqm:       overrides.max_garden_suite_gfa_sqm ?? null,
    cur_est_kitchen_gfa_sqm:        overrides.cur_est_kitchen_gfa_sqm ?? null,
    cur_est_bath_gfa_sqm:           overrides.cur_est_bath_gfa_sqm ?? null,
    max_buildable_footprint_sqm:    overrides.max_buildable_footprint_sqm ?? null,
  };
}

// §3-ARCHETYPE (WF2 2026-07-06): the ladder guards mirror the seeded
// logic_variables (archetype_ladder.logic.test.ts GUARDS). ARCH_CONFIG turns the
// ladder ON for the archetype parity block; SHARED_CONFIG keeps it OFF so every
// pre-archetype branch above stays byte-identical to its committed baseline.
const ARCH_CONFIG = {
  ...SHARED_CONFIG,
  archetypeEnabled: true,
  archetypeRates: {} as Record<string, number>,
  archetypeT1FsiMin: 0.05,
  archetypeT1FsiMax: 8,
  archetypeT1TotalCap: 25_000_000,
  archetypeT2RenoCap: 10_000_000,
  archetypeT2BuildCap: 20_000_000,
  archetypeT2BuildMin: 200_000,
  archetypeT3TotalCap: 15_000_000,
};

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

  it('C18: matrix miss — unknown combination → safe-skip (cost_source=none, effective_area=null) per WF3 Pass-2.5 Finding D', () => {
    assertParity({
      permit: makePermit({ permit_num: 'C18', permit_type: 'demolition', structure_type: 'industrial', active_trade_slugs: ['excavation'] }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: null,
    }, 'C18');
    // Matrix miss now safe-skips: effective_area_sqm=null, cost_source='none',
    // estimated_cost=null. Pre-fix behavior was effective_area ≈ 400 (full GFA),
    // which produced $14M-style cost balloons on trade-specific permits.
    const ts = estimateCost(
      makePermit({ permit_num: 'C18', permit_type: 'demolition', structure_type: 'industrial', active_trade_slugs: ['excavation'] }),
      GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG,
    );
    expect(ts.effective_area_sqm).toBeNull();
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
    expect(ts.modeled_gfa_sqm).toBeNull(); // Option A envelope symmetry
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

  it('C39: case-sensitive permit_type matching in matrix lookup (§3.A re-key 2026-05-24)', () => {
    // Brain trims only; matrix lookup is exact-case per Spec 83 §3.A re-key.
    // SHARED_CONFIG uses a lowercase matrix → UPPER input misses; lower input hits.
    const upper = makePermit({ permit_num: 'C39u', permit_type: 'NEW BUILDING', structure_type: 'SFD', active_trade_slugs: ['framing'] });
    const lower = makePermit({ permit_num: 'C39l', permit_type: 'new building', structure_type: 'sfd', active_trade_slugs: ['framing'] });
    const tsUpper = estimateCost(upper, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    const tsLower = estimateCost(lower, GOOD_PARCEL, GOOD_FOOTPRINT, null, SHARED_CONFIG);
    expect(tsUpper.effective_area_sqm).toBeNull();
    expect(tsLower.effective_area_sqm).not.toBeNull();
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

// ─── WF2 #3 — permit_type_class gate (Spec 80 §5 + Spec 83 §3) ──────────────
//
// Non-construction permits short-circuit to cost_source='none' BEFORE the
// Surgical Triangle runs. Eliminates the $29M-for-2-signs / $1.96B WESTON
// GOLF CLUB bug class where sign permits inherit host-building GFA.
//
// Both surfaces (TS shim via estimateCost + JS Brain via estimateCostShared)
// must produce IDENTICAL cost_source='none' output for every non-construction
// class. The TS shim's surgical-brain branch passes permit_type_class through
// to the Brain, so single source of truth is preserved.

describe('parity-battery — WF2 #3 permit_type_class gate (cost_source="none" for non-construction)', () => {
  it('C-PCG-01: administrative class short-circuits despite valid massing + active trades', () => {
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-01',
        permit_type: 'pre-permit',
        structure_type: 'sfd',
        active_trade_slugs: ['plumbing', 'electrical'],
        permit_type_class: 'administrative',
      }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-01');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
    expect(ts.trade_contract_values).toEqual({});
    expect(ts.is_geometric_override).toBe(false);
  });

  it('C-PCG-02: signage class short-circuits (sign permits do NOT inherit host-building GFA)', () => {
    // The original $29M ZARA two-wall-signs bug: sign permit on a commercial
    // tower inherited the entire structure's footprint × stories. Gate ensures
    // signage class never reaches the Surgical Triangle even with rich massing.
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-02',
        permit_type: 'designated structures',
        structure_type: 'commercial',
        est_const_cost: 5_000,
        active_trade_slugs: ['electrical', 'structural-steel'],
        permit_type_class: 'signage',
      }),
      parcel: { lot_size_sqm: 5_000, frontage_m: 80 },
      footprint: { footprint_area_sqm: 5_000, estimated_stories: 30 },
      neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-02');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
  });

  it('C-PCG-03: safety_upgrade class short-circuits (limited-scope fire/security upgrades)', () => {
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-03',
        permit_type: 'fire/security upgrade',
        structure_type: 'multi-residential',
        est_const_cost: 50_000,
        active_trade_slugs: ['electrical', 'fire-protection'],
        permit_type_class: 'safety_upgrade',
      }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-03');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
  });

  it('C-PCG-04: unclassified class short-circuits (safe-skip default per Spec 80 §5)', () => {
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-04',
        permit_type: 'partial permit',
        structure_type: 'sfd',
        active_trade_slugs: ['plumbing'],
        permit_type_class: 'unclassified',
      }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-04');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
  });

  it('C-PCG-05: null permit_type_class short-circuits (DB column nullable defensive default)', () => {
    // Edge case: SOURCE_SQL uses COALESCE(ptc.class, 'unclassified') so this
    // shouldn't happen in production, but the Brain treats null/undefined as
    // safe-skip too (defense in depth).
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-05',
        permit_type: 'new building',
        structure_type: 'sfd',
        active_trade_slugs: ['plumbing'],
        permit_type_class: null,
      }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-05');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).toBe('none');
  });

  it('C-PCG-06: construction class with identical inputs DOES run the Surgical Triangle (regression-lock)', () => {
    // Mirror of C-PCG-04 but flipped to construction — the same shape MUST
    // produce a non-'none' result. Catches a future regression where the gate
    // accidentally flips polarity.
    const input: ParityInput = {
      permit: makePermit({
        permit_num: 'C-PCG-06',
        permit_type: 'new building',
        structure_type: 'sfd',
        active_trade_slugs: ['plumbing'],
        permit_type_class: 'construction',
      }),
      parcel: GOOD_PARCEL, footprint: GOOD_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParity(input, 'C-PCG-06');

    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, SHARED_CONFIG);
    expect(ts.cost_source).not.toBe('none');
    expect(ts.estimated_cost).not.toBeNull();
    expect((ts.estimated_cost ?? 0)).toBeGreaterThan(0);
  });
});

// ─── §3-ARCHETYPE ladder parity (WF2 2026-07-06) ─────────────────────────────
// Code Reviewer I4: the TS shim gained archetype field pass-through + the ladder
// runs inside the shared Brain. These cases prove the shim and the Muscle price
// the ladder identically — if `toRow`/`makePermit` ever drop a scalar, or the
// shim's row construction diverges, a field mismatch fails here. Fixtures mirror
// archetype-ladder.logic.test.ts (gut line: cost_gut_total total, area basis
// cur_pot_2story_gfa_sqm, own-area basis interior_alterations_sqm).
describe('parity-battery — §3-ARCHETYPE ladder (ARCH_CONFIG)', () => {
  const archPermit = (over: Partial<CostModelPermitInput> & { permit_num: string }) =>
    makePermit({
      permit_type: 'Small Residential Projects',
      structure_type: 'SFD - Detached',
      project_type: 'renovation',
      work: 'Interior Alterations',
      est_const_cost: 50_000,
      scope_tags: ['alter:interior-alterations'],
      dwelling_units_created: 0,
      storeys: 2,
      active_trade_slugs: ['framing', 'electrical'],
      neighbourhood_cost_premium: 1.2,
      cost_gut_total: 480_000,
      cur_pot_2story_gfa_sqm: 240,
      ...over,
    });
  const ARCH_PARCEL: CostModelParcelInput = { lot_size_sqm: 400, frontage_m: 12 };
  const ARCH_FOOTPRINT: CostModelFootprintInput = { footprint_area_sqm: 120, estimated_stories: 2 };

  it('A1: T1 declared-area (own area × per-sqm) — TS == JS', () => {
    const input: ParityInput = {
      permit: archPermit({ permit_num: 'A1', interior_alterations_sqm: 100 }),
      parcel: ARCH_PARCEL, footprint: ARCH_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParityWith(input, 'A1', ARCH_CONFIG);
    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, ARCH_CONFIG);
    expect(ts.cost_source).toBe('archetype_declared_area');
    expect(ts.estimated_cost).toBe(200_000);
  });

  it('A2: T1 FSI-band reject → T2 parcel total — TS == JS', () => {
    const input: ParityInput = {
      permit: archPermit({ permit_num: 'A2', interior_alterations_sqm: 10 }),
      parcel: ARCH_PARCEL, footprint: ARCH_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParityWith(input, 'A2', ARCH_CONFIG);
    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, ARCH_CONFIG);
    expect(ts.cost_source).toBe('archetype_parcel');
    expect(ts.estimated_cost).toBe(480_000);
  });

  it('A3: no own area → T2 parcel total (the CoA-shaped path) — TS == JS', () => {
    const input: ParityInput = {
      permit: archPermit({ permit_num: 'A3', interior_alterations_sqm: null }),
      parcel: ARCH_PARCEL, footprint: ARCH_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParityWith(input, 'A3', ARCH_CONFIG);
    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, ARCH_CONFIG);
    expect(ts.cost_source).toBe('archetype_parcel');
  });

  it('A4: non-lowrise structure_type falls through to T4 — TS == JS (byte-identical legacy)', () => {
    const input: ParityInput = {
      permit: archPermit({ permit_num: 'A4', structure_type: 'Office', active_trade_slugs: ['plumbing'] }),
      parcel: ARCH_PARCEL, footprint: ARCH_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParityWith(input, 'A4', ARCH_CONFIG);
    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, ARCH_CONFIG);
    expect(String(ts.cost_source).startsWith('archetype_')).toBe(false);
  });

  it('A5: zero propagated total → cost_source="none" (Zero-Total analog) — TS == JS', () => {
    const input: ParityInput = {
      permit: archPermit({ permit_num: 'A5', cost_gut_total: 0 }),
      parcel: ARCH_PARCEL, footprint: ARCH_FOOTPRINT, neighbourhood: MID_NEIGHBOURHOOD,
    };
    assertParityWith(input, 'A5', ARCH_CONFIG);
    const ts = estimateCost(input.permit, input.parcel, input.footprint, input.neighbourhood, ARCH_CONFIG);
    expect(ts.cost_source).toBe('none');
    expect(ts.estimated_cost).toBeNull();
  });
});
