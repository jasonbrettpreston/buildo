// 🔗 SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (CoA: same ladder minus T1)
//
// WF2 Phase C unit tests for the CoA archetype pricing path. CoA carries no
// applicant-declared area (no residential_sqm / interior_alterations_sqm), so
// the ladder's T1 (own-area × per-sqm) and T3 (rate × own area) rungs can NEVER
// fire — the CoA ladder is effectively **T2-or-T4**. These tests drive the REAL
// Phase C path: `buildCoaArchetypeInput` (scripts/lib/coa-cost-model.js) builds
// the `_is_coa: true` Brain row, `tryArchetypeCost` (the Brain) prices it.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCoaArchetypeInput } = require('../../scripts/lib/coa-cost-model');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const brain = require('../features/leads/lib/cost-model-shared.js');

// ── Fixtures ────────────────────────────────────────────────────────────────

const GUARDS = {
  archetypeEnabled: true,
  archetypeRates: {} as Record<string, number>,
  archetypeT1FsiMin: 0.05,
  archetypeT1FsiMax: 8,
  archetypeT1TotalCap: 25_000_000,
  archetypeT2RenoCap: 10_000_000,
  archetypeT2BuildCap: 20_000_000,
  archetypeT2BuildMin: 200_000,
};

const CONFIG = {
  tradeRates: {
    framing: { base_rate_sqft: 40, structure_complexity_factor: 1.5 },
    electrical: { base_rate_sqft: 20, structure_complexity_factor: 1.0 },
  },
  scopeMatrix: {},
  urbanCoverageRatio: 0.7,
  suburbanCoverageRatio: 0.4,
  liarGateThreshold: 0.25,
  ...GUARDS,
};

// A low-rise residential CoA whose scope maps to coa_build, with the Spec 88
// propagated coa scalar present (the T2 line total). Own-area fields are
// DELIBERATELY absent — buildCoaArchetypeInput never sets them for CoA.
const coaRow = (over: Record<string, unknown> = {}) =>
  buildCoaArchetypeInput({
    lead_id: 'coa:A0001/26',
    project_type: 'NewConstruction',
    structure_type: 'SFD - Detached',
    scope_tags: [],
    active_trade_slugs: ['framing', 'electrical'],
    neighbourhood_cost_premium: 1.2,
    lot_size_sqm: 400,
    // coa_build line: scalarCol cost_coa_total (kind total), areaCol opt_coa_gfa_sqm
    cost_coa_total: 850_000,
    opt_coa_gfa_sqm: 240,
    ...over,
  });

// ── Entry gate + CoA mapper rules ────────────────────────────────────────────

describe('CoA entry gate + project_type rules', () => {
  it('NewConstruction low-rise → coa_build priced at T2', () => {
    const r = brain.tryArchetypeCost(coaRow(), CONFIG);
    expect(r).not.toBeNull();
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeLines).toEqual(['coa_build']);
    expect(r._archetypeTier).toBe('t2');
  });
  it('non-lowrise structure_type → T4 (Apartment Building never enters the ladder)', () => {
    expect(brain.tryArchetypeCost(coaRow({ structure_type: 'Apartment Building' }), CONFIG)).toBeNull();
  });
  it('Severance → null (T4)', () => {
    expect(brain.tryArchetypeCost(coaRow({ project_type: 'Severance' }), CONFIG)).toBeNull();
  });
  it('Demolition → null (T4)', () => {
    expect(brain.tryArchetypeCost(coaRow({ project_type: 'Demolition' }), CONFIG)).toBeNull();
  });
  it('NewConstruction + accessory tag → still coa_build (accessory never demotes)', () => {
    const r = brain.tryArchetypeCost(coaRow({ scope_tags: ['garage'] }), CONFIG);
    expect(r._archetypeLines).toEqual(['coa_build']);
  });
  it('tagless Mixed → coa_build fallback (the conservative anchor)', () => {
    const r = brain.tryArchetypeCost(coaRow({ project_type: 'Mixed', scope_tags: [] }), CONFIG);
    expect(r).not.toBeNull();
    expect(r._archetypeLines).toEqual(['coa_build']);
  });
  it('Mixed WITH tags → tag dominance (interior-alterations → gut line)', () => {
    const r = brain.tryArchetypeCost(
      coaRow({
        project_type: 'Mixed',
        scope_tags: ['alter:interior-alterations'],
        cost_coa_total: null,
        opt_coa_gfa_sqm: null,
        cost_gut_total: 480_000,
        cur_pot_2story_gfa_sqm: 240,
      }),
      CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeLines).toEqual(['gut']);
    expect(r.estimated_cost).toBe(480_000);
  });
});

// ── T2 — parcel line total + bounds ──────────────────────────────────────────

describe('CoA T2 parcel total + plausibility bounds', () => {
  it('the propagated coa total as-is; premium NOT re-applied; modeled_gfa = opt_coa area', () => {
    const r = brain.tryArchetypeCost(coaRow(), CONFIG);
    expect(r.estimated_cost).toBe(850_000);
    expect(r.premium_factor).toBe(1.2); // the EMBEDDED Spec 88 premium, reported only
    expect(r.modeled_gfa_sqm).toBe(240);
    expect(r.effective_area_sqm).toBe(240);
  });
  it('build line above $20M cap → T4 (no own area, no rate → null)', () => {
    expect(brain.tryArchetypeCost(coaRow({ cost_coa_total: 105_000_000 }), CONFIG)).toBeNull();
  });
  it('build line below $200K floor (sliver envelope) → T4', () => {
    expect(brain.tryArchetypeCost(coaRow({ cost_coa_total: 4_800 }), CONFIG)).toBeNull();
  });
  it('reno line (gut via Mixed) uses the reno cap, not the build cap', () => {
    // $9M gut ≤ $10M reno cap → priced (would exceed the $20M build cap check too,
    // but the point is class routing: gut is class "reno").
    const r = brain.tryArchetypeCost(
      coaRow({
        project_type: 'Mixed',
        scope_tags: ['alter:interior-alterations'],
        cost_coa_total: null,
        opt_coa_gfa_sqm: null,
        cost_gut_total: 9_000_000,
        cur_pot_2story_gfa_sqm: 3000,
      }),
      CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(9_000_000);
  });
});

// ── T1 + T3 are UNREACHABLE on CoA (no own area) ─────────────────────────────

describe('CoA has no own area — T1 + T3 never fire', () => {
  it('buildCoaArchetypeInput never sets residential_sqm / interior_alterations_sqm', () => {
    const row = coaRow();
    expect(row.residential_sqm).toBeUndefined();
    expect(row.interior_alterations_sqm).toBeUndefined();
  });
  it('a rate exists but no own area → T3 cannot fire; T2 still prices from the scalar', () => {
    const r = brain.tryArchetypeCost(coaRow(), { ...CONFIG, archetypeRates: { CoA: 4000 } });
    expect(r._archetypeTier).toBe('t2'); // NOT t3 — no own area
    expect(r.estimated_cost).toBe(850_000);
  });
  it('no scalar + a rate + NO own area → T4 (no derived-area invention)', () => {
    const r = brain.tryArchetypeCost(
      coaRow({ cost_coa_total: null, opt_coa_gfa_sqm: null }),
      { ...CONFIG, archetypeRates: { CoA: 4000 } },
    );
    expect(r).toBeNull();
  });
});

// ── fits:false + zero-total 'none' semantics ─────────────────────────────────

describe("CoA fits:false and zero-total → 'none', never a fallback price", () => {
  it('fit-gated line (garage via Mixed) with NULL scalar → none + _archetypeFitBlocked', () => {
    const r = brain.tryArchetypeCost(
      coaRow({
        project_type: 'Mixed',
        scope_tags: ['garage'],
        cost_coa_total: null,
        opt_coa_gfa_sqm: null,
        cost_garage_total: null, // fits:false — permissioning, not missing data
        max_garage_gfa_sqm: null,
      }),
      CONFIG,
    );
    expect(r.cost_source).toBe('none');
    expect(r.estimated_cost).toBeNull();
    expect(r._archetypeFitBlocked).toBe(true);
  });
  it('present-but-ZERO coa scalar → none + _archetypeZeroTotal (Guardian F1-B)', () => {
    const r = brain.tryArchetypeCost(coaRow({ cost_coa_total: 0 }), CONFIG);
    expect(r.cost_source).toBe('none');
    expect(r.estimated_cost).toBeNull();
    expect(r._archetypeZeroTotal).toBe(true);
  });
});

// ── Decision-4 slicing + envelope contract ───────────────────────────────────

describe('CoA envelope contract + trade slicing', () => {
  it('is_geometric_override=false; ±25% range; premium reported not re-applied', () => {
    const r = brain.tryArchetypeCost(coaRow(), CONFIG);
    expect(r.is_geometric_override).toBe(false);
    expect(r._liarsGateOverride).toBe(false);
    expect(r.cost_range_low).toBe(Math.round(850_000 * 0.75));
    expect(r.cost_range_high).toBe(Math.round(850_000 * 1.25));
  });
  it('trade slicing weights ∝ base_rate × complexity over the CoA active trades', () => {
    const r = brain.tryArchetypeCost(coaRow(), CONFIG);
    const tv = r.trade_contract_values as Record<string, number>;
    // framing 40×1.5=60, electrical 20×1=20 → 75% / 25% of 850,000
    expect(tv.framing).toBe(Math.round(0.75 * 850_000));
    expect(tv.electrical).toBe(Math.round(0.25 * 850_000));
  });
  it('trade-less CoA → {} (counted by the Muscle, never a crash)', () => {
    const r = brain.tryArchetypeCost(coaRow({ active_trade_slugs: [] }), CONFIG);
    expect(r.trade_contract_values).toEqual({});
    expect(r.cost_source).toBe('archetype_parcel');
  });
});
