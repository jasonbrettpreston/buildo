/**
 * cost-model-shared.logic.test.ts
 *
 * SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §5 Testing Mandate
 *
 * Unit tests for the Surgical Valuation Brain (src/features/leads/lib/cost-model-shared.js).
 * All functions are pure — no DB, no side effects.
 *
 * Coverage mandate (spec 83 §8 Part 2 + §5):
 *   - computeGfa: primary vs fallback paths + NaN/null guards
 *   - computeEffectiveArea: matrix hit/miss
 *   - isShellPermit: detection logic
 *   - computeTradeValue: per-trade complexity (NOT global), shell 0.60x
 *   - computeSurgicalTotal: multi-trade accumulation
 *   - applyLiarsGate: all 4 branches (bypass, default, override, trust)
 *   - estimateCostShared: integration through all branches
 *   - Duplicate scope_tags dedup via Set (the "pool x2 = $80K" bug)
 *   - Number.isFinite guard on est_const_cost
 *   - determineCostTier: boundary values
 */

 
const {
  estimateCostShared,
  computeGfa,
  computeEffectiveArea,
  isShellPermit,
  computeTradeValue,
  computeSurgicalTotal,
  applyLiarsGate,
  computeComplexityScore,
  determineCostTier,
  INTERIOR_TRADE_SLUGS,
  PLACEHOLDER_COST_THRESHOLD,
  MODEL_VERSION,
} = require('../../src/features/leads/lib/cost-model-shared');

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_TRADE_RATES = {
  plumbing:   { base_rate_sqft: 195, structure_complexity_factor: 1.40 },
  electrical: { base_rate_sqft: 195, structure_complexity_factor: 1.40 },
  framing:    { base_rate_sqft: 292, structure_complexity_factor: 1.30 },
  drywall:    { base_rate_sqft: 98,  structure_complexity_factor: 1.10 },
  roofing:    { base_rate_sqft: 122, structure_complexity_factor: 1.00 },
};

const BASE_SCOPE_MATRIX = {
  'new building::sfd':              1.00,
  'addition::sfd':                  0.25,
  'interior alteration::commercial': 0.25,
  'alteration::sfd':                0.15,
};

const BASE_CONFIG = {
  tradeRates:             BASE_TRADE_RATES,
  scopeMatrix:            BASE_SCOPE_MATRIX,
  urbanCoverageRatio:     0.70,
  suburbanCoverageRatio:  0.40,
  trustThresholdPct:      0.25,
  liarGateThreshold:      0.25,
  premiumTiers: [
    { min: 0,       max: 60000,  multiplier: 1.00 },
    { min: 60000,   max: 100000, multiplier: 1.15 },
    { min: 100000,  max: 150000, multiplier: 1.35 },
    { min: 150000,  max: 200000, multiplier: 1.60 },
    { min: 200000,  max: null,   multiplier: 1.85 },
  ],
};

function makeRow(overrides = {}) {
  return {
    permit_num: 'P-TEST-001',
    revision_num: '00',
    permit_type: 'new building',
    structure_type: 'sfd',
    work: null,
    est_const_cost: null,
    scope_tags: null,
    storeys: null,
    estimated_stories: 2,
    footprint_area_sqm: 100,
    lot_size_sqm: 500,
    tenure_renter_pct: 20,
    avg_household_income: 80000,
    dwelling_units_created: 1,
    active_trade_slugs: ['plumbing', 'electrical'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeGfa
// ---------------------------------------------------------------------------

describe('computeGfa', () => {
  it('uses footprint × estimated_stories (primary path)', () => {
    const row = makeRow({ footprint_area_sqm: 100, estimated_stories: 3, lot_size_sqm: 500 });
    const { gfa, usedFallback, modeledGfaSqm } = computeGfa(row, BASE_CONFIG);
    expect(gfa).toBe(300);
    expect(usedFallback).toBe(false);
    expect(modeledGfaSqm).toBe(300);
  });

  it('prefers storeys field when estimated_stories is null', () => {
    const row = makeRow({ footprint_area_sqm: 100, estimated_stories: null, storeys: 4 });
    const { gfa, usedFallback } = computeGfa(row, BASE_CONFIG);
    expect(gfa).toBe(400);
    expect(usedFallback).toBe(false);
  });

  it('falls back to lot_size × coverage × floors when massing absent', () => {
    const row = makeRow({ footprint_area_sqm: null, estimated_stories: null, lot_size_sqm: 400, tenure_renter_pct: 20 });
    const { gfa, usedFallback } = computeGfa(row, BASE_CONFIG);
    // suburban (20% renter) × 0.4 × 2 floors
    expect(gfa).toBeCloseTo(400 * 0.40 * 2, 5);
    expect(usedFallback).toBe(true);
  });

  it('applies urban coverage when tenure_renter_pct > 50', () => {
    const row = makeRow({ footprint_area_sqm: null, estimated_stories: null, lot_size_sqm: 400, tenure_renter_pct: 60 });
    const { gfa } = computeGfa(row, BASE_CONFIG);
    // urban (60% renter) × 0.7 × 2 floors
    expect(gfa).toBeCloseTo(400 * 0.70 * 2, 5);
  });

  it('returns gfa=0 and usedFallback=true when no geometry data', () => {
    const row = makeRow({ footprint_area_sqm: null, estimated_stories: null, lot_size_sqm: null });
    const { gfa, usedFallback, modeledGfaSqm } = computeGfa(row, BASE_CONFIG);
    expect(gfa).toBe(0);
    expect(usedFallback).toBe(true);
    expect(modeledGfaSqm).toBeNull();
  });

  it('ignores footprint with zero area', () => {
    const row = makeRow({ footprint_area_sqm: 0, estimated_stories: 3, lot_size_sqm: 400 });
    const { usedFallback } = computeGfa(row, BASE_CONFIG);
    // footprint=0 must fall through to lot-size fallback
    expect(usedFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveArea
// ---------------------------------------------------------------------------

describe('computeEffectiveArea', () => {
  it('applies matrix intensity on a hit (new building::sfd → 1.0)', () => {
    const row = makeRow({ permit_type: 'new building', structure_type: 'sfd' });
    const { areaEff, matched } = computeEffectiveArea(row, 200, BASE_CONFIG);
    expect(areaEff).toBe(200);
    expect(matched).toBe(true);
  });

  it('applies 0.25 intensity for addition::sfd', () => {
    const row = makeRow({ permit_type: 'addition', structure_type: 'sfd' });
    const { areaEff, matched } = computeEffectiveArea(row, 200, BASE_CONFIG);
    expect(areaEff).toBe(50);
    expect(matched).toBe(true);
  });

  it('defaults to full GFA on matrix miss', () => {
    const row = makeRow({ permit_type: 'demolition', structure_type: 'commercial' });
    const { areaEff, matched } = computeEffectiveArea(row, 200, BASE_CONFIG);
    expect(areaEff).toBe(200); // conservative miss = full scope
    expect(matched).toBe(false);
  });

  it('normalizes permit_type and structure_type to lowercase before lookup', () => {
    const row = makeRow({ permit_type: 'New Building', structure_type: 'SFD' });
    const { matched } = computeEffectiveArea(row, 100, BASE_CONFIG);
    expect(matched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isShellPermit
// ---------------------------------------------------------------------------

describe('isShellPermit', () => {
  it('returns true when permit_type contains "shell"', () => {
    expect(isShellPermit(makeRow({ permit_type: 'New Building - Shell Only', work: null }))).toBe(true);
  });

  it('returns true when work description contains "shell"', () => {
    expect(isShellPermit(makeRow({ permit_type: 'new building', work: 'construct shell and core' }))).toBe(true);
  });

  it('returns false for a normal permit', () => {
    expect(isShellPermit(makeRow({ permit_type: 'interior alteration', work: 'reno bathroom' }))).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isShellPermit(makeRow({ permit_type: 'SHELL PERMIT', work: null }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeTradeValue — per-trade complexity (NOT global)
// ---------------------------------------------------------------------------

describe('computeTradeValue', () => {
  it('computes framing value using per-trade complexity factor', () => {
    // framing: 292 $/sqft × 1.30 complexity × 1.0 premium × 100 sqm area
    const val = computeTradeValue('framing', 100, false, 1.0, BASE_CONFIG);
    expect(val).toBeCloseTo(292 * 1.30 * 1.0 * 100, 2);
  });

  it('applies plumbing complexity factor independently of roofing', () => {
    const plumbing = computeTradeValue('plumbing', 100, false, 1.0, BASE_CONFIG);
    const roofing  = computeTradeValue('roofing',  100, false, 1.0, BASE_CONFIG);
    // plumbing complexity = 1.40; roofing = 1.00
    expect(plumbing).toBeCloseTo(195 * 1.40 * 100, 2);
    expect(roofing).toBeCloseTo(122 * 1.00 * 100, 2);
    // Per-trade complexity: NOT a shared global multiplier
    expect(plumbing).not.toBe(roofing);
  });

  it('applies 0.60x shell multiplier to interior trades', () => {
    const normalVal = computeTradeValue('drywall', 100, false, 1.0, BASE_CONFIG);
    const shellVal  = computeTradeValue('drywall', 100, true,  1.0, BASE_CONFIG);
    expect(shellVal).toBeCloseTo(normalVal * 0.60, 2);
  });

  it('does NOT apply shell multiplier to exterior trades (roofing)', () => {
    const normalVal = computeTradeValue('roofing', 100, false, 1.0, BASE_CONFIG);
    const shellVal  = computeTradeValue('roofing', 100, true,  1.0, BASE_CONFIG);
    expect(shellVal).toBe(normalVal); // roofing is NOT in INTERIOR_TRADE_SLUGS
  });

  it('applies all INTERIOR_TRADE_SLUGS to the shell multiplier', () => {
    const interiorSlugs = [...INTERIOR_TRADE_SLUGS];
    const configWithAll = {
      ...BASE_CONFIG,
      tradeRates: Object.fromEntries(
        interiorSlugs.map((slug) => [slug, { base_rate_sqft: 100, structure_complexity_factor: 1.0 }])
      ),
    };
    for (const slug of interiorSlugs) {
      const normal = computeTradeValue(slug, 100, false, 1.0, configWithAll);
      const shell  = computeTradeValue(slug, 100, true,  1.0, configWithAll);
      expect(shell).toBeCloseTo(normal * 0.60, 5);
    }
  });

  it('applies neighbourhood premium multiplier', () => {
    const premiumVal = computeTradeValue('framing', 100, false, 1.85, BASE_CONFIG);
    const baseVal    = computeTradeValue('framing', 100, false, 1.00, BASE_CONFIG);
    expect(premiumVal).toBeCloseTo(baseVal * 1.85, 2);
  });

  it('returns 0 when trade_slug not in tradeRates', () => {
    expect(computeTradeValue('unknown-trade', 100, false, 1.0, BASE_CONFIG)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSurgicalTotal
// ---------------------------------------------------------------------------

describe('computeSurgicalTotal', () => {
  it('sums values for all active trade slugs', () => {
    const row = makeRow({ active_trade_slugs: ['plumbing', 'electrical'] });
    const { total, tradeValues } = computeSurgicalTotal(row, 100, false, 1.0, BASE_CONFIG);
    // plumbing: 195 × 1.40 × 100 = 27300; electrical: 195 × 1.40 × 100 = 27300
    expect(tradeValues['plumbing']).toBe(27300);
    expect(tradeValues['electrical']).toBe(27300);
    expect(total).toBeCloseTo(54600, 0);
  });

  it('returns total=0 and empty tradeValues when active_trade_slugs is empty', () => {
    const row = makeRow({ active_trade_slugs: [] });
    const { total, tradeValues } = computeSurgicalTotal(row, 100, false, 1.0, BASE_CONFIG);
    expect(total).toBe(0);
    expect(Object.keys(tradeValues)).toHaveLength(0);
  });

  it('returns total=0 and empty tradeValues when active_trade_slugs is null/undefined', () => {
    const row = makeRow({ active_trade_slugs: null });
    const { total } = computeSurgicalTotal(row, 100, false, 1.0, BASE_CONFIG);
    expect(total).toBe(0);
  });

  it('excludes trades with zero value (not in tradeRates)', () => {
    const row = makeRow({ active_trade_slugs: ['plumbing', 'ghost-trade'] });
    const { tradeValues } = computeSurgicalTotal(row, 100, false, 1.0, BASE_CONFIG);
    expect('ghost-trade' in tradeValues).toBe(false);
    expect('plumbing' in tradeValues).toBe(true);
  });

  it('deduplicates duplicate slugs — double slug must not inflate total (WF3-fix)', () => {
    // Duplicate slug would inflate surgical total by 2×, shifting Liar's Gate
    const row = makeRow({ active_trade_slugs: ['plumbing', 'plumbing'] });
    const { total, tradeValues } = computeSurgicalTotal(row, 100, false, 1.0, BASE_CONFIG);
    // Must equal single-slug total (195 × 1.40 × 100 = 27300), not 54600
    expect(Object.keys(tradeValues)).toHaveLength(1);
    expect(tradeValues['plumbing']).toBe(27300);
    expect(total).toBeCloseTo(27300, 0);
  });
});

// ---------------------------------------------------------------------------
// applyLiarsGate — all 4 branches
// ---------------------------------------------------------------------------

describe('applyLiarsGate', () => {
  const tradeVals = { plumbing: 27300, electrical: 27300 };
  const surgicalTotal = 54600;
  const threshold = 0.25;

  it('Branch 1: Zero-Total Bypass — returns cost_source=none when total=0', () => {
    const result = applyLiarsGate(null, 0, {}, threshold, false);
    expect(result.cost_source).toBe('none');
    expect(result.estimated_cost).toBeNull();
    expect(result.trade_contract_values).toEqual({});
    expect(result.zeroTotalBypass).toBe(true);
    expect(result.liarsGateOverride).toBe(false);
  });

  it('Branch 2: Default — null reported cost uses model total', () => {
    const result = applyLiarsGate(null, surgicalTotal, tradeVals, threshold, false);
    expect(result.cost_source).toBe('model');
    expect(result.estimated_cost).toBe(Math.round(surgicalTotal));
    expect(result.is_geometric_override).toBe(false);
    expect(result.trade_contract_values).toEqual(tradeVals);
    expect(result.zeroTotalBypass).toBe(false);
  });

  it('Branch 2: Default — reported cost ≤ PLACEHOLDER_COST_THRESHOLD uses model', () => {
    const result = applyLiarsGate(500, surgicalTotal, tradeVals, threshold, false);
    expect(result.cost_source).toBe('model');
    expect(result.is_geometric_override).toBe(false);
  });

  it('Branch 3: Override — reported < surgical × threshold triggers Liar\'s Gate', () => {
    // reported = 1000; surgical = 54600; threshold = 0.25 → 1000 < 13650 → fires
    const reportedLow = 1001; // just above PLACEHOLDER_COST_THRESHOLD
    const result = applyLiarsGate(reportedLow, surgicalTotal, tradeVals, threshold, false);
    expect(result.cost_source).toBe('model');
    expect(result.is_geometric_override).toBe(true);
    expect(result.liarsGateOverride).toBe(true);
    expect(result.estimated_cost).toBe(Math.round(surgicalTotal));
  });

  it('Branch 3: Override suppressed when usedFallback=true', () => {
    // Lot-size fallback is ±50% uncertain — don't trust it enough to override
    const reportedLow = 1001;
    const result = applyLiarsGate(reportedLow, surgicalTotal, tradeVals, threshold, true);
    // Falls through to Branch 4 (trust) because usedFallback suppresses override
    expect(result.cost_source).toBe('permit');
    expect(result.is_geometric_override).toBe(false);
  });

  it('Branch 4: Trust — proportional slicing when reported ≥ surgical × threshold', () => {
    // reported = 30000; surgical = 54600; threshold = 0.25 → 30000 > 13650 → slicing
    const reportedHigh = 30000;
    const result = applyLiarsGate(reportedHigh, surgicalTotal, tradeVals, threshold, false);
    expect(result.cost_source).toBe('permit');
    expect(result.is_geometric_override).toBe(false);
    expect(result.estimated_cost).toBe(reportedHigh);
    // Each trade gets 50% share (27300/54600 = 0.5)
    expect(result.trade_contract_values['plumbing']).toBe(Math.round(0.5 * reportedHigh));
    expect(result.trade_contract_values['electrical']).toBe(Math.round(0.5 * reportedHigh));
  });

  it('Branch 4: Slicing only spans active trades (not all 32 allocations)', () => {
    // Only plumbing + electrical in tradeVals — other trades should not appear
    const result = applyLiarsGate(30000, surgicalTotal, tradeVals, threshold, false);
    const keys = Object.keys(result.trade_contract_values);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('plumbing');
    expect(keys).toContain('electrical');
  });
});

// ---------------------------------------------------------------------------
// Spec 83 §3 Step 2 — Duplicate scope_tags guard
// ---------------------------------------------------------------------------

describe('duplicate scope_tags via Set deduplication', () => {
  it('computeComplexityScore: duplicate "pool" only adds +10 once', () => {
    const rowDuplicates = makeRow({ scope_tags: ['pool', 'pool', 'pool'], storeys: 2 });
    const rowUnique     = makeRow({ scope_tags: ['pool'], storeys: 2 });
    const scoreDup  = computeComplexityScore(rowDuplicates);
    const scoreUniq = computeComplexityScore(rowUnique);
    expect(scoreDup).toBe(scoreUniq);
  });

  it('computeComplexityScore: handles NULL elements in scope_tags array', () => {
    // PostgreSQL TEXT[] can hold NULL elements
    const row = makeRow({ scope_tags: ['pool', null, 'elevator'] });
    // Should not throw; null elements become '' → no match → no double-count
    expect(() => computeComplexityScore(row)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Number.isFinite guard on est_const_cost
// ---------------------------------------------------------------------------

describe('Number.isFinite guard on est_const_cost', () => {
  it('treats NaN est_const_cost as null (no Liar\'s Gate corruption)', () => {
    const row = makeRow({
      est_const_cost: NaN,
      active_trade_slugs: ['plumbing'],
    });
    const result = estimateCostShared(row, BASE_CONFIG);
    // NaN sanitized to null → Default branch → cost_source='model'
    expect(result.cost_source).toBe('model');
    expect(Number.isNaN(result.estimated_cost)).toBe(false);
  });

  it('treats Infinity est_const_cost as null', () => {
    const row = makeRow({ est_const_cost: Infinity, active_trade_slugs: ['plumbing'] });
    const result = estimateCostShared(row, BASE_CONFIG);
    expect(result.cost_source).toBe('model');
  });
});

// ---------------------------------------------------------------------------
// determineCostTier — boundary values
// ---------------------------------------------------------------------------

describe('determineCostTier', () => {
  it('classifies values at tier boundaries', () => {
    expect(determineCostTier(0)).toBe('small');
    expect(determineCostTier(99999)).toBe('small');
    expect(determineCostTier(100000)).toBe('medium');
    expect(determineCostTier(499999)).toBe('medium');
    expect(determineCostTier(500000)).toBe('large');
    expect(determineCostTier(1999999)).toBe('large');
    expect(determineCostTier(2000000)).toBe('major');
    expect(determineCostTier(9999999)).toBe('major');
    expect(determineCostTier(10000000)).toBe('mega');
  });

  it('returns null for non-finite cost', () => {
    expect(determineCostTier(NaN)).toBeNull();
    expect(determineCostTier(-1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// estimateCostShared — integration tests
// ---------------------------------------------------------------------------

describe('estimateCostShared — integration', () => {
  it('returns cost_source=none when no active trades (Zero-Total Bypass)', () => {
    const row = makeRow({ active_trade_slugs: [] });
    const result = estimateCostShared(row, BASE_CONFIG);
    expect(result.cost_source).toBe('none');
    expect(result.estimated_cost).toBeNull();
    expect(result.trade_contract_values).toEqual({});
    expect(result._zeroTotalBypass).toBe(true);
  });

  it('returns cost_source=model when no geometry data (gfa=0)', () => {
    const row = makeRow({ footprint_area_sqm: null, lot_size_sqm: null, active_trade_slugs: ['plumbing'] });
    const result = estimateCostShared(row, BASE_CONFIG);
    // gfa=0 → areaEff=0 → surgicalTotal=0 → Zero-Total Bypass
    expect(result.cost_source).toBe('none');
  });

  it('populates effective_area_sqm on a successful estimate', () => {
    const row = makeRow({
      footprint_area_sqm: 100,
      estimated_stories: 2,
      active_trade_slugs: ['plumbing'],
    });
    const result = estimateCostShared(row, BASE_CONFIG);
    // GFA = 200; matrix = new building::sfd → 1.0; areaEff = 200
    expect(result.effective_area_sqm).toBeCloseTo(200, 2);
  });

  it('propagates is_geometric_override=true when Liar\'s Gate fires', () => {
    const row = makeRow({
      est_const_cost: 1001, // just above PLACEHOLDER_COST_THRESHOLD
      footprint_area_sqm: 100,
      estimated_stories: 2,
      active_trade_slugs: ['plumbing', 'electrical'],
    });
    const result = estimateCostShared(row, BASE_CONFIG);
    // surgicalTotal ≈ 54600; 1001 < 54600 × 0.25 → override fires
    expect(result.is_geometric_override).toBe(true);
    expect(result.cost_source).toBe('model');
    expect(result._liarsGateOverride).toBe(true);
  });

  it('returns trust branch for large reported cost', () => {
    const row = makeRow({
      est_const_cost: 200000, // above 54600 × 0.25 = 13650
      footprint_area_sqm: 100,
      estimated_stories: 2,
      active_trade_slugs: ['plumbing', 'electrical'],
    });
    const result = estimateCostShared(row, BASE_CONFIG);
    expect(result.cost_source).toBe('permit');
    expect(result.estimated_cost).toBe(200000);
    expect(result.is_geometric_override).toBe(false);
  });

  it('MODEL_VERSION is 2 — signals surgical formula (not legacy v1)', () => {
    expect(MODEL_VERSION).toBe(2);
  });

  it('PLACEHOLDER_COST_THRESHOLD is 1000', () => {
    expect(PLACEHOLDER_COST_THRESHOLD).toBe(1000);
  });

  it('output shape includes all required fields', () => {
    const row = makeRow({ active_trade_slugs: ['plumbing'] });
    const result = estimateCostShared(row, BASE_CONFIG);
    expect(result).toHaveProperty('permit_num');
    expect(result).toHaveProperty('revision_num');
    expect(result).toHaveProperty('estimated_cost');
    expect(result).toHaveProperty('cost_source');
    expect(result).toHaveProperty('cost_tier');
    expect(result).toHaveProperty('cost_range_low');
    expect(result).toHaveProperty('cost_range_high');
    expect(result).toHaveProperty('premium_factor');
    expect(result).toHaveProperty('complexity_score');
    expect(result).toHaveProperty('is_geometric_override');
    expect(result).toHaveProperty('modeled_gfa_sqm');
    expect(result).toHaveProperty('effective_area_sqm');
    expect(result).toHaveProperty('trade_contract_values');
  });
});
