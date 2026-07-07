/**
 * cost-model-shared.regression.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A (WF1 re-key)
 *
 * Regression coverage for the WF1 §3.A production-vocabulary re-key.
 * Asserts that the Brain's computeEffectiveArea looks up the matrix using
 * exact production strings (Title Case), not normalized lowercase. Prevents
 * a future re-introduction of the 14-day silent cost_source='none' regression.
 */

import { describe, it, expect } from 'vitest';


const {
  computeEffectiveArea,
  estimateCostShared,
} = require('../../src/features/leads/lib/cost-model-shared'); // eslint-disable-line @typescript-eslint/no-require-imports

const PROD_SCOPE_MATRIX = {
  'Small Residential Projects::SFD - Detached':           0.25,
  'New Houses::SFD - Detached':                           1.00,
  'Building Additions/Alterations::Office':               0.20,
  'Building Additions/Alterations::Apartment Building':   0.15,
};

const PROD_TRADE_RATES = {
  plumbing: { base_rate_sqft: 195, structure_complexity_factor: 1.40 },
  framing:  { base_rate_sqft: 292, structure_complexity_factor: 1.30 },
};

const PROD_CONFIG = {
  scopeMatrix: PROD_SCOPE_MATRIX,
  tradeRates:  PROD_TRADE_RATES,
  liarGateThreshold: 0.25,
};

describe('Brain matrix-lookup — production vocabulary contract', () => {
  it('matches exact production vocabulary key (Title Case)', () => {
    const row = { permit_type: 'New Houses', structure_type: 'SFD - Detached' };
    const r = computeEffectiveArea(row, 1000, PROD_CONFIG);
    expect(r.matched).toBe(true);
    expect(r.matrixKey).toBe('New Houses::SFD - Detached');
    expect(r.areaEff).toBe(1000);
  });

  it('MISSES on lowercase input (regression guard)', () => {
    const row = { permit_type: 'new houses', structure_type: 'sfd - detached' };
    const r = computeEffectiveArea(row, 1000, PROD_CONFIG);
    expect(r.matched).toBe(false);
    expect(r.matrixKey).toBe('new houses::sfd - detached');
    expect(r.areaEff).toBeNull();
  });

  it('trims leading/trailing whitespace defensively (PI-7)', () => {
    const row = { permit_type: '  Building Additions/Alterations  ', structure_type: ' Office ' };
    const r = computeEffectiveArea(row, 5000, PROD_CONFIG);
    expect(r.matched).toBe(true);
    expect(r.areaEff).toBe(1000); // 5000 × 0.20
  });

  it('MISSES on trade-specific permit_type (safe-skip per §3.A(d))', () => {
    // Plumbing(PS) and Mechanical(MS) intentionally have no matrix row.
    const row = { permit_type: 'Plumbing(PS)', structure_type: 'SFD - Detached' };
    const r = computeEffectiveArea(row, 1000, PROD_CONFIG);
    expect(r.matched).toBe(false);
    expect(r.areaEff).toBeNull();
  });
});

describe('Brain integration — Small Residential Projects path (largest top-N combo)', () => {
  it('produces non-null estimated_cost for SRP/SFD-Detached with massing', () => {
    const row = {
      permit_type: 'Small Residential Projects',
      structure_type: 'SFD - Detached',
      footprint_area_sqm: 100,
      estimated_stories: 2,
      est_const_cost: 250000,
      active_trade_slugs: ['plumbing', 'framing'],
      permit_type_class: 'construction',
    };
    const est = estimateCostShared(row, PROD_CONFIG);
    expect(est.estimated_cost).not.toBeNull();
    expect(est.cost_source).not.toBe('none');
    // 200 sqm × 0.25 = 50 sqm areaEff; surgical compute > 0
    expect(est.effective_area_sqm).toBe(50);
  });
});
