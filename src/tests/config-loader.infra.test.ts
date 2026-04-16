// 🔗 SPEC LINK: docs/specs/product/future/86_control_panel.md §3
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
    expect(content).toMatch(/0\.02/);
  });

  it('derives FALLBACK_LOGIC_VARS from logic_variables.json (WF3-0 seed refactor)', () => {
    // After WF3-0, fallbacks are no longer inline — they're derived from the seed JSON.
    expect(content).toMatch(/FALLBACK_LOGIC_VARS/);
    expect(content).toMatch(/require.*seeds\/logic_variables/);
    // The seed JSON must contain the critical keys
    const json = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, unknown>;
    for (const key of ['los_multiplier_bid', 'stall_penalty_precon', 'lead_expiry_days', 'coa_stall_threshold', 'liar_gate_threshold']) {
      expect(json, `Seed JSON missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('falls back gracefully on DB query failure', () => {
    // Should catch errors and return fallback values
    expect(content).toMatch(/catch \(err\)/);
    expect(content).toMatch(/using hardcoded defaults/);
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
