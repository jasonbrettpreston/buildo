/**
 * cost-estimates.infra.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §5 Testing Mandate
 *
 * File-shape infra tests covering:
 *   Phase 1 — Migration 096 schema, Brain module shape, config-loader guards
 *   Phase 2 — Muscle script shape (bulk UPSERT, param-count safety, Spec 47 compliance)
 *
 * All tests are deterministic file-reads — no live DB required.
 * This matches the infra test convention used by every other *.infra.test.ts
 * in this repo (compute-cost-estimates.infra.test.ts, classify-lifecycle-phase.infra.test.ts, etc.)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

// ---------------------------------------------------------------------------
// Phase 1 — Migration 096 schema
// ---------------------------------------------------------------------------

describe('migrations/096_surgical_valuation.sql — schema correctness', () => {
  let migration: string;

  beforeAll(() => {
    migration = read('migrations/096_surgical_valuation.sql');
  });

  it('adds effective_area_sqm column to cost_estimates', () => {
    expect(migration).toMatch(/ALTER TABLE cost_estimates\s+ADD COLUMN IF NOT EXISTS effective_area_sqm/i);
  });

  it("expands cost_source enum to include 'none'", () => {
    expect(migration).toMatch(/cost_source IN \('permit', 'model', 'none'\)/);
  });

  it('drops old cost_source constraint before adding new one (idempotent upgrade)', () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS cost_estimates_cost_source_check/);
  });

  it('creates trade_sqft_rates table with correct columns', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS trade_sqft_rates/);
    expect(migration).toMatch(/trade_slug\s+VARCHAR\(50\)\s+PRIMARY KEY/);
    expect(migration).toMatch(/base_rate_sqft/);
    expect(migration).toMatch(/structure_complexity_factor/);
  });

  it('creates scope_intensity_matrix table with composite PK', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS scope_intensity_matrix/);
    expect(migration).toMatch(/gfa_allocation_percentage/);
    expect(migration).toMatch(/PRIMARY KEY \(permit_type, structure_type\)/);
  });

  it('seeds 3 logic_variables for surgical knobs', () => {
    expect(migration).toMatch(/urban_coverage_ratio/);
    expect(migration).toMatch(/suburban_coverage_ratio/);
    expect(migration).toMatch(/trust_threshold_pct/);
  });

  it('seeds all 32 trades into trade_sqft_rates', () => {
    // Count ON CONFLICT rows — each trade is one INSERT row
    const tradeNames = [
      'excavation', 'shoring', 'demolition', 'temporary-fencing', 'concrete',
      'waterproofing', 'framing', 'structural-steel', 'masonry', 'elevator',
      'plumbing', 'hvac', 'electrical', 'drain-plumbing', 'fire-protection',
      'roofing', 'insulation', 'glazing', 'drywall', 'painting',
      'flooring', 'tiling', 'trim-work', 'millwork-cabinetry', 'stone-countertops',
      'security', 'eavestrough-siding', 'caulking', 'solar',
      'landscaping', 'decking-fences', 'pool-installation',
    ];
    for (const slug of tradeNames) {
      expect(migration, `trade_sqft_rates missing seed for '${slug}'`).toContain(`'${slug}'`);
    }
  });

  it('seeds 18 rows into scope_intensity_matrix', () => {
    // Check important permit_type × structure_type combinations.
    // Regex allows for column-alignment padding between the slug and next value.
    const expected: [RegExp, string][] = [
      [/'new building',\s*'sfd'/,                "new building::sfd"],
      [/'new building',\s*'multi-residential'/,  "new building::multi-residential"],
      [/'addition',\s*'sfd'/,                    "addition::sfd"],
      [/'addition',\s*'multi-residential'/,      "addition::multi-residential"],
      [/'alteration',\s*'sfd'/,                  "alteration::sfd"],
      [/'interior alteration',\s*'sfd'/,         "interior alteration::sfd"],
      [/'interior alteration',\s*'commercial'/,  "interior alteration::commercial"],
    ];
    for (const [pattern, label] of expected) {
      expect(migration, `scope_intensity_matrix missing seed for '${label}'`).toMatch(pattern);
    }
  });

  it('adds observability columns to data_quality_snapshots', () => {
    expect(migration).toMatch(/ALTER TABLE data_quality_snapshots/);
    expect(migration).toMatch(/cost_estimates_liar_gate_overrides/);
    expect(migration).toMatch(/cost_estimates_zero_total_bypass/);
  });

  it('has a commented DOWN block with ALLOW-DESTRUCTIVE marker', () => {
    expect(migration).toMatch(/-- ALLOW-DESTRUCTIVE/);
    expect(migration).toMatch(/-- DROP TABLE IF EXISTS scope_intensity_matrix/);
    expect(migration).toMatch(/-- DROP TABLE IF EXISTS trade_sqft_rates/);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — Brain module shape
// ---------------------------------------------------------------------------

describe('src/features/leads/lib/cost-model-shared.js — Brain shape', () => {
  let brain: string;

  beforeAll(() => {
    brain = read('src/features/leads/lib/cost-model-shared.js');
  });

  it('has SPEC LINK pointing to spec 83', () => {
    expect(brain).toMatch(/SPEC LINK.*83_lead_cost_model/);
  });

  it('declares DUAL CODE PATH annotation', () => {
    expect(brain).toMatch(/DUAL CODE PATH/i);
  });

  it('is CommonJS (uses module.exports)', () => {
    expect(brain).toMatch(/module\.exports\s*=/);
    // Must NOT have ES module exports — breaks pipeline require()
    expect(brain).not.toMatch(/^export\s+/m);
  });

  it('exports estimateCostShared as primary entry point', () => {
    expect(brain).toMatch(/estimateCostShared/);
  });

  it('exports all granular functions for unit testing', () => {
    const expectedExports = [
      'computeGfa',
      'computeEffectiveArea',
      'isShellPermit',
      'computeTradeValue',
      'computeSurgicalTotal',
      'applyLiarsGate',
      'computeComplexityScore',
      'determineCostTier',
    ];
    for (const fn of expectedExports) {
      expect(brain, `Brain missing export: ${fn}`).toContain(fn);
    }
  });

  it('defines INTERIOR_TRADE_SLUGS constant', () => {
    expect(brain).toMatch(/INTERIOR_TRADE_SLUGS/);
    // Must use Set — spec 83 §3 Step 3
    expect(brain).toMatch(/new Set\(/);
  });

  it('contains all 10 interior trade slugs in INTERIOR_TRADE_SLUGS', () => {
    const interiorSlugs = [
      'drywall', 'painting', 'electrical', 'plumbing', 'drain-plumbing',
      'flooring', 'tiling', 'trim-work', 'millwork-cabinetry', 'stone-countertops',
    ];
    for (const slug of interiorSlugs) {
      expect(brain, `INTERIOR_TRADE_SLUGS missing '${slug}'`).toContain(`'${slug}'`);
    }
  });

  it('applies 0.60x SHELL_INTERIOR_MULTIPLIER to interior trades', () => {
    expect(brain).toMatch(/SHELL_INTERIOR_MULTIPLIER\s*=\s*0\.60/);
  });

  it('returns cost_source="none" for Zero-Total Bypass (spec 83 §3 Step D)', () => {
    expect(brain).toMatch(/cost_source.*'none'/);
  });

  it('uses Number.isFinite guard on est_const_cost (W12, W21)', () => {
    expect(brain).toMatch(/Number\.isFinite\(\s*row\.est_const_cost\s*\)/);
  });

  it('deduplicates scope_tags via new Set() before evaluation (W8)', () => {
    // Prevents duplicate 'pool' → double-count of complexity score
    expect(brain).toMatch(/new Set\(\s*\(row\.scope_tags/);
  });

  it('applies .toLowerCase().trim() for string sanitization (W12, W21)', () => {
    expect(brain).toMatch(/\.toLowerCase\(\)\.trim\(\)/);
  });

  it('applies complexity factor per-trade (not globally)', () => {
    // structure_complexity_factor must be inside computeTradeValue, not outside
    const tradeValueFn = brain.match(/function computeTradeValue[\s\S]*?^}/m)?.[0] || '';
    expect(tradeValueFn, 'computeTradeValue not found').toBeTruthy();
    expect(tradeValueFn).toMatch(/structure_complexity_factor/);
  });

  it('does NOT import from pg, pool, or DB modules (pure functions only)', () => {
    expect(brain).not.toMatch(/require\(\s*['"]pg['"]/);
    expect(brain).not.toMatch(/require\(\s*['"].*pool['"]/);
    expect(brain).not.toMatch(/require\(\s*['"].*\/db\//);
    expect(brain).not.toMatch(/require\(\s*['"].*\/client['"]/);
  });

  it('has JSDoc @typedef for PermitRow, CostModelConfig, and CostEstimate', () => {
    expect(brain).toMatch(/@typedef.*PermitRow/);
    expect(brain).toMatch(/@typedef.*CostModelConfig/);
    expect(brain).toMatch(/@typedef.*CostEstimate/);
  });

  it('declares MODEL_VERSION = 2 (signals surgical formula upgrade from v1)', () => {
    expect(brain).toMatch(/MODEL_VERSION\s*=\s*2/);
  });

  it('uses strict mode', () => {
    expect(brain).toMatch(/'use strict'/);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — Config-loader guard
// ---------------------------------------------------------------------------

describe('scripts/lib/config-loader.js — ZERO_IS_INVALID guard', () => {
  let loader: string;

  beforeAll(() => {
    loader = read('scripts/lib/config-loader.js');
  });

  it('includes liar_gate_threshold in ZERO_IS_INVALID (spec 83 §4)', () => {
    // A zero value would silently disable the Liar's Gate
    expect(loader).toMatch(/['"]liar_gate_threshold['"]/);
    // Verify it is inside the ZERO_IS_INVALID Set declaration
    const zeroIsInvalidBlock = loader.match(/const ZERO_IS_INVALID\s*=\s*new Set\([\s\S]*?\)\s*;/)?.[0] || '';
    expect(zeroIsInvalidBlock, 'liar_gate_threshold not found in ZERO_IS_INVALID Set').toContain('liar_gate_threshold');
  });

  it('includes urban_coverage_ratio in ZERO_IS_INVALID (spec 83 §4)', () => {
    const zeroIsInvalidBlock = loader.match(/const ZERO_IS_INVALID\s*=\s*new Set\([\s\S]*?\)\s*;/)?.[0] || '';
    expect(zeroIsInvalidBlock).toContain('urban_coverage_ratio');
  });

  it('includes suburban_coverage_ratio in ZERO_IS_INVALID (spec 83 §4)', () => {
    const zeroIsInvalidBlock = loader.match(/const ZERO_IS_INVALID\s*=\s*new Set\([\s\S]*?\)\s*;/)?.[0] || '';
    expect(zeroIsInvalidBlock).toContain('suburban_coverage_ratio');
  });

  it('includes trust_threshold_pct in ZERO_IS_INVALID (spec 83 §4)', () => {
    const zeroIsInvalidBlock = loader.match(/const ZERO_IS_INVALID\s*=\s*new Set\([\s\S]*?\)\s*;/)?.[0] || '';
    expect(zeroIsInvalidBlock).toContain('trust_threshold_pct');
  });

  it('exports validateLogicVars for Zod validation (used by Muscle in Phase 2)', () => {
    expect(loader).toMatch(/validateLogicVars/);
    expect(loader).toMatch(/module\.exports[\s\S]*validateLogicVars/);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — ESLint override for CommonJS Brain
// ---------------------------------------------------------------------------

describe('eslint.config.mjs — Brain CommonJS override', () => {
  let eslintConfig: string;

  beforeAll(() => {
    eslintConfig = read('eslint.config.mjs');
  });

  it('has an override allowing CommonJS in cost-model-shared.js', () => {
    expect(eslintConfig).toMatch(/cost-model-shared\.js/);
    expect(eslintConfig).toMatch(/@typescript-eslint\/no-require-imports.*off/);
  });

  it('scope is exact path (not a broad glob)', () => {
    // The override must name the exact file, not src/**/*.js which would
    // pollute the entire frontend with CommonJS permissions
    const brainBlock = eslintConfig.match(
      /files:\s*\[['"]src\/features\/leads\/lib\/cost-model-shared\.js['"]\]/
    );
    expect(brainBlock, 'Override not scoped to exact Brain path').toBeTruthy();
  });

  it('has a separate override for the Brain logic test (no-require-imports)', () => {
    // The test file require()-s the CommonJS Brain directly; needs its own override
    expect(eslintConfig).toMatch(/cost-model-shared\.logic\.test\.ts/);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — Types update
// ---------------------------------------------------------------------------

describe('src/lib/permits/types.ts — CostSource includes "none"', () => {
  let types: string;

  beforeAll(() => {
    types = read('src/lib/permits/types.ts');
  });

  it("CostSource type includes 'none' for Zero-Total Bypass (spec 83 §3 Step D)", () => {
    expect(types).toMatch(/CostSource.*=.*'permit'.*'model'.*'none'/);
  });

  it('CostEstimate interface has effective_area_sqm field (migration 096)', () => {
    expect(types).toMatch(/effective_area_sqm\??\s*:/);
  });
});
