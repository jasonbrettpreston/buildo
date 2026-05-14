// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1 + R5.5
//
// scripts/lib/coa-cost-model.js — Brain config builder for CoA-side cost
// estimation. Delegates math to src/features/leads/lib/cost-model-shared.js
// (`estimateCostShared`). CoA-specific defaults: est_const_cost: null (no
// Liar's Gate), cost_source='geometric', permit_type_class:'construction' sentinel.
//
// R5.5 review folds locked in here (4-reviewer plan-review caught these as
// CRITICAL/HIGH BUGS in the R5.1 substrate):
//   - #1 (W#1 L-1 + W#2 CRIT-1): config returns `tradeRates`/`scopeMatrix` as
//        plain objects (was Maps with wrong field names → 100% null cost)
//   - #2 (W#2 CRIT-3): config passes `urbanCoverageRatio`/`suburbanCoverageRatio`
//        from logicVars (was missing → Brain hardcode 0.7/0.4 fallback)
//   - #5 (W#2 HIGH-5): `skipPermitTypeClassGating` flag removed as dead code;
//        sentinel `permit_type_class:'construction'` is the actual mechanism.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCoaConfig, mapCoaRowToBrainInput } = require('../../scripts/lib/coa-cost-model');

describe('coa-cost-model — buildCoaConfig (R5.5 review folds #1, #2, #5)', () => {
  it('returns standard Brain knobs (liar_gate, model_range, fallback_range)', () => {
    const config = buildCoaConfig({
      tradeRates: [],
      scopeMatrix: [],
      logicVars: { liar_gate_threshold: 0.25, model_range_pct: 0.20, fallback_range_pct: 0.40 },
    });
    expect(config.liarGateThreshold).toBe(0.25);
    expect(config.modelRangePct).toBe(0.20);
    expect(config.fallbackRangePct).toBe(0.40);
  });

  it('R5.5 fold #1: returns `tradeRates` as a PLAIN OBJECT (not a Map) with the Brain-expected key name', () => {
    const config = buildCoaConfig({
      tradeRates: [
        { trade_slug: 'plumbing', base_rate_sqft: 12.5, structure_complexity_factor: 1.0 },
        { trade_slug: 'electrical', base_rate_sqft: 10.0, structure_complexity_factor: 1.0 },
      ],
      scopeMatrix: [],
      logicVars: {},
    });
    // Field name MUST be 'tradeRates' (Brain reads config.tradeRates[slug]).
    expect(config).toHaveProperty('tradeRates');
    expect(config).not.toHaveProperty('tradeRateBySlug');
    // MUST be a plain object (Brain uses bracket-notation access; Map.get
    // is incompatible with bracket access — returns undefined).
    expect(config.tradeRates).not.toBeInstanceOf(Map);
    expect(typeof config.tradeRates).toBe('object');
    // Bracket access must work for any registered slug.
    expect(config.tradeRates['plumbing']).toBeDefined();
    expect(config.tradeRates['plumbing'].base_rate_sqft).toBe(12.5);
    expect(config.tradeRates['electrical']).toBeDefined();
  });

  it('R5.5 fold #1: returns `scopeMatrix` as a PLAIN OBJECT (not a Map) with the Brain-expected key name', () => {
    const config = buildCoaConfig({
      tradeRates: [],
      scopeMatrix: [
        { permit_type: 'NEW HOUSE', structure_type: 'DETACHED', gfa_allocation_percentage: 0.85 },
      ],
      logicVars: {},
    });
    expect(config).toHaveProperty('scopeMatrix');
    expect(config).not.toHaveProperty('scopeIntensity');
    expect(config.scopeMatrix).not.toBeInstanceOf(Map);
    expect(typeof config.scopeMatrix).toBe('object');
    expect(config.scopeMatrix['NEW HOUSE::DETACHED']).toBe(0.85);
  });

  it('R5.5 fold #2: passes urbanCoverageRatio + suburbanCoverageRatio from logicVars', () => {
    const config = buildCoaConfig({
      tradeRates: [],
      scopeMatrix: [],
      logicVars: { urban_coverage_ratio: 0.65, suburban_coverage_ratio: 0.35 },
    });
    expect(config.urbanCoverageRatio).toBe(0.65);
    expect(config.suburbanCoverageRatio).toBe(0.35);
  });

  it('R5.5 fold #2: defaults urbanCoverageRatio=0.7, suburbanCoverageRatio=0.4 when logicVars absent', () => {
    const config = buildCoaConfig({ tradeRates: [], scopeMatrix: [], logicVars: {} });
    expect(config.urbanCoverageRatio).toBe(0.7);
    expect(config.suburbanCoverageRatio).toBe(0.4);
  });

  it('R5.5 fold #5: dead `skipPermitTypeClassGating` flag is removed (sentinel routes CoA rows instead)', () => {
    const config = buildCoaConfig({ tradeRates: [], scopeMatrix: [], logicVars: {} });
    expect(config).not.toHaveProperty('skipPermitTypeClassGating');
  });

  it('preserves `coaContext: true` for downstream identification', () => {
    const config = buildCoaConfig({ tradeRates: [], scopeMatrix: [], logicVars: {} });
    expect(config.coaContext).toBe(true);
  });

  it('handles empty inputs without crashing (defensive)', () => {
    expect(() => buildCoaConfig({ tradeRates: null, scopeMatrix: null, logicVars: null })).not.toThrow();
    expect(() => buildCoaConfig({})).not.toThrow();
  });
});

describe('coa-cost-model — mapCoaRowToBrainInput', () => {
  it('passes est_const_cost: null (CoA records have no declared cost)', () => {
    const coaRow = {
      lead_id: 'coa:A0123-24',
      application_number: 'A0123-24',
      coa_type_class: 'residential',
      project_type: 'addition',
      scope_tags: ['addition', 'deck'],
      modeled_gfa_sqm: 250.0,
      footprint_area_sqm: 80.0,
      estimated_stories: 2,
      avg_household_income: 95000,
      active_trade_slugs: ['electrician', 'plumber', 'carpenter'],
    };
    const brainInput = mapCoaRowToBrainInput(coaRow);
    expect(brainInput.est_const_cost).toBe(null);
  });

  it('preserves geometric inputs (gfa, footprint, stories, neighbourhood)', () => {
    const coaRow = {
      lead_id: 'coa:A0123-24',
      modeled_gfa_sqm: 250.0,
      footprint_area_sqm: 80.0,
      estimated_stories: 2,
      avg_household_income: 95000,
      scope_tags: ['addition'],
    };
    const brainInput = mapCoaRowToBrainInput(coaRow);
    expect(brainInput.modeled_gfa_sqm).toBe(250.0);
    expect(brainInput.footprint_area_sqm).toBe(80.0);
    expect(brainInput.estimated_stories).toBe(2);
    expect(brainInput.avg_household_income).toBe(95000);
  });

  it('handles null modeled_gfa_sqm without crashing (no parcel match)', () => {
    const coaRow = { lead_id: 'coa:A0123-24', modeled_gfa_sqm: null, scope_tags: ['addition'] };
    expect(() => mapCoaRowToBrainInput(coaRow)).not.toThrow();
  });

  it('R5.5 fold #5: routes CoA rows through Brain Surgical Triangle via permit_type_class:"construction" sentinel', () => {
    // The Brain's gate at cost-model-shared.js:484 checks
    // `row.permit_type_class !== COST_SLICING_CLASS` where COST_SLICING_CLASS
    // is 'construction'. The sentinel MUST be 'construction' for CoA rows
    // to pass the gate. Without it (or with skipPermitTypeClassGating flag —
    // which the Brain doesn't read), all CoA rows would be filtered out.
    const coaRow = { lead_id: 'coa:A0123-24', scope_tags: ['addition'] };
    const brainInput = mapCoaRowToBrainInput(coaRow);
    expect(brainInput.permit_type_class).toBe('construction');
  });

  it('passes lead_id through to Brain (cost_estimates write target)', () => {
    const coaRow = { lead_id: 'coa:A0123-24', scope_tags: ['addition'] };
    const brainInput = mapCoaRowToBrainInput(coaRow);
    expect(brainInput.lead_id).toBe('coa:A0123-24');
  });

  it('forces permit_num + revision_num to NULL (mig 145 allows NULL for CoA rows in cost_estimates)', () => {
    const coaRow = { lead_id: 'coa:A0123-24', scope_tags: ['addition'] };
    const brainInput = mapCoaRowToBrainInput(coaRow);
    expect(brainInput.permit_num).toBeNull();
    expect(brainInput.revision_num).toBeNull();
  });
});
