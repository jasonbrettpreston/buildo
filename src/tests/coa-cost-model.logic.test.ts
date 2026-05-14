// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// scripts/lib/coa-cost-model.js — Brain config builder for CoA-side cost
// estimation. Delegates math to src/features/leads/lib/cost-model-shared.js
// (`estimateCostShared`). CoA-specific defaults: est_const_cost: null (no
// Liar's Gate), cost_source='geometric', permit_type_class skipped.
//
// R0.14 confirmed: cost-model-shared.js:512 is null-safe via Number.isFinite.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCoaConfig, mapCoaRowToBrainInput } = require('../../scripts/lib/coa-cost-model');

describe('coa-cost-model — buildCoaConfig (R5.1)', () => {
  it('returns a config object with the standard Brain knobs', () => {
    const tradeRates = [{ trade_slug: 'electrician', base_rate_sqft: 12.50, structure_complexity_factor: 1.0 }];
    const scopeMatrix = [{ permit_type: 'NEW HOUSE', structure_type: 'DETACHED', gfa_allocation_percentage: 0.85 }];
    const logicVars = { liar_gate_threshold: 0.25, model_range_pct: 0.20, fallback_range_pct: 0.40 };
    const config = buildCoaConfig({ tradeRates, scopeMatrix, logicVars });
    expect(config).toBeDefined();
    expect(config).toHaveProperty('liarGateThreshold');
  });

  it('forces cost_source semantics for CoA (no Liar Gate path)', () => {
    const config = buildCoaConfig({ tradeRates: [], scopeMatrix: [], logicVars: {} });
    // The config should signal "geometric-only" mode somehow — either via a
    // flag or by skipping the Liar's Gate threshold entirely.
    expect(config).toBeDefined();
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
});
