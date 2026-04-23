// 🔗 SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §3
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/lib/config-loader.js — shared config loader', () => {
  let content: string;

  it('exports loadMarketplaceConfigs function', () => {
    content = read('scripts/lib/config-loader.js');
    expect(content).toMatch(/module\.exports\s*=\s*\{.*loadMarketplaceConfigs/);
  });

  it('queries both trade_configurations and logic_variables', () => {
    expect(content).toMatch(/FROM trade_configurations/);
    expect(content).toMatch(/FROM logic_variables/);
  });

  it('parses multiplier_bid and multiplier_work from trade configs', () => {
    expect(content).toMatch(/multiplier_bid/);
    expect(content).toMatch(/multiplier_work/);
  });

  it('validates allocation_pct sum with tolerance', () => {
    expect(content).toMatch(/allocSum/);
    expect(content).toMatch(/1\.0/);
    // Tolerance constant is 0.001 — tighter than the 2% band from initial spec.
    // Regex /0\.001/ matches the guard at `Math.abs(allocSum - 1.0) > 0.001`.
    expect(content).toMatch(/0\.001/);
  });

  it('derives FALLBACK_LOGIC_VARS from logic_variables.json (WF3-0 seed refactor)', () => {
    // After WF3-0, fallbacks are no longer inline — they're derived from the seed JSON.
    expect(content).toMatch(/FALLBACK_LOGIC_VARS/);
    expect(content).toMatch(/require.*seeds\/logic_variables/);
    // The seed JSON must contain the critical keys
    const json = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, unknown>;
    for (const key of ['los_multiplier_bid', 'stall_penalty_precon', 'coa_stall_threshold', 'liar_gate_threshold']) {
      expect(json, `Seed JSON missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('falls back gracefully on DB query failure', () => {
    // Should catch errors and return fallback values
    expect(content).toMatch(/catch \(err\)/);
    expect(content).toMatch(/using hardcoded defaults/);
  });

  it('WF3 B3-H2: clones FALLBACK_TRADE_CONFIGS + FALLBACK_LOGIC_VARS to prevent shared-reference mutation', () => {
    // Previously `let tradeConfigs = FALLBACK_TRADE_CONFIGS` aliased the shared
    // object, and `{ ...FALLBACK_LOGIC_VARS }` was a shallow copy (still sharing
    // nested JSON values like income_premium_tiers). Any consumer that mutated
    // a nested property would corrupt the fallback for every subsequent call
    // in the process. structuredClone isolates the working copy.
    expect(content).toMatch(/let tradeConfigs\s*=\s*structuredClone\(FALLBACK_TRADE_CONFIGS\)/);
    expect(content).toMatch(/let logicVars\s*=\s*structuredClone\(FALLBACK_LOGIC_VARS\)/);
  });

  it('WF3 B3-C1: guards against allocSum = 0 / non-finite before normalization division', () => {
    // The old unguarded `tc.allocation_pct / allocSum` produced Infinity or
    // NaN when allocSum degenerated. Guard reverts to the hardcoded fallback
    // instead of silently broadcasting Infinity across every trade's
    // allocation percentage.
    expect(content).toMatch(/!Number\.isFinite\(allocSum\)\s*\|\|\s*allocSum\s*<=\s*0/);
    expect(content).toMatch(/reverting to hardcoded fallback/);
  });

  it('WF3 B3-H3: per-field isFinite + negative guards on trade_configurations numeric columns', () => {
    // parseFloat(null) = NaN silently propagates into allocation math and
    // multiplier computations. parseTradeNum returns null for non-finite or
    // negative values so the caller can fall back per-slug to
    // FALLBACK_TRADE_CONFIGS[slug] rather than shipping a NaN-poisoned row.
    expect(content).toMatch(/parseTradeNum/);
    expect(content).toMatch(/!Number\.isFinite\(n\)/);
    // Per-slug fallback must use structuredClone so subsequent consumers'
    // mutations don't corrupt the shared fallback.
    expect(content).toMatch(/dbTradeConfigs\[slug\]\s*=\s*structuredClone\(fallback\)/);
  });

  it('WF3 (2026-04-23): imminent_window_days passed through parseTradeNum — rejects NaN/negative without crashing', () => {
    // imminent_window_days was the only numeric trade_configurations column not
    // guarded by parseTradeNum. A NaN string or negative value would silently
    // propagate; null was also unguarded. Fix: wrap with parseTradeNum when
    // non-null; leave null as-is (callers use ?? 14 fallback).
    // The `!= null` guard preserves the legitimate-null path.
    expect(content).toMatch(/imminent_window_days[\s\S]*?parseTradeNum/);
    expect(content).toMatch(/c\.imminent_window_days\s*!=\s*null/);
  });

  it('WF3 B3-H3: NEGATIVE_IS_INVALID set rejects negative logic_variables; expired_threshold_days excluded', () => {
    // Negative divisors / buffers / ratios are always config errors except
    // expired_threshold_days, which is stored signed by convention (see
    // compute-trade-forecasts.js — script normalizes with Math.abs).
    expect(content).toMatch(/NEGATIVE_IS_INVALID\s*=\s*new Set/);
    // Must include the common divisors + ratios
    expect(content).toMatch(/NEGATIVE_IS_INVALID[\s\S]{0,400}los_base_divisor/);
    expect(content).toMatch(/NEGATIVE_IS_INVALID[\s\S]{0,400}stall_penalty_precon/);
    expect(content).toMatch(/NEGATIVE_IS_INVALID[\s\S]{0,400}snowplow_buffer_days/);
    // expired_threshold_days must NOT be in the negative-invalid set
    const negSetMatch = content.match(/NEGATIVE_IS_INVALID\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(negSetMatch).toBeTruthy();
    expect(negSetMatch![1]).not.toMatch(/expired_threshold_days/);
    // And the guard must actually fire
    expect(content).toMatch(/parsed\s*<\s*0\s*&&\s*NEGATIVE_IS_INVALID\.has\(variable_key\)/);
  });
});

describe('scripts/ — all 4 pipeline scripts use shared config loader', () => {
  const scripts = [
    'scripts/compute-opportunity-scores.js',
    'scripts/compute-trade-forecasts.js',
    'scripts/compute-cost-estimates.js',
    'scripts/update-tracked-projects.js',
  ];

  for (const script of scripts) {
    it(`${script} imports loadMarketplaceConfigs`, () => {
      const content = read(script);
      expect(content).toMatch(/require\('\.\/lib\/config-loader'\)/);
      expect(content).toMatch(/loadMarketplaceConfigs/);
    });
  }
});

describe('migration 093 — control panel gaps', () => {
  let content: string;

  it('exists and is valid SQL', () => {
    content = read('migrations/093_control_panel_gaps.sql');
    expect(content).toBeTruthy();
  });

  it('adds multiplier_bid and multiplier_work columns', () => {
    expect(content).toMatch(/ADD COLUMN multiplier_bid/);
    expect(content).toMatch(/ADD COLUMN multiplier_work/);
  });

  it('seeds trade-specific multiplier overrides', () => {
    expect(content).toMatch(/UPDATE trade_configurations SET multiplier_bid/);
    // Heavy trades get higher multipliers
    expect(content).toMatch(/3\.0/);
    // Commodity trades get lower multipliers
    expect(content).toMatch(/2\.0/);
  });

  it('inserts missing logic_variables keys', () => {
    expect(content).toMatch(/lead_expiry_days/);
    expect(content).toMatch(/coa_stall_threshold/);
  });

  it('has commented-out DOWN block', () => {
    expect(content).toMatch(/-- ALTER TABLE trade_configurations DROP COLUMN multiplier_bid/);
    expect(content).toMatch(/-- DELETE FROM logic_variables/);
  });
});
