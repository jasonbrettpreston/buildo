// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-data-bounds.js must read its
// data-quality thresholds from logicVars rather than hardcoding them:
//   - cost_outlier_ceiling_cad (E7): $500M outlier ceiling
//   - desc_null_rate_warn_pct  (E8): description null-rate SLA
//   - builder_null_rate_warn_pct (E8): builder null-rate SLA
//   - cost_est_null_rate_warn_pct (E9): cost_estimates null-rate SLA
//   - cost_est_min_tiers (E9): minimum distinct cost tiers
//   - calibration_freshness_warn_hours (E10): timing_calibration staleness SLA
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-data-bounds.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-data-bounds.js — threshold externalization (§6.4)', () => {
  // ── E7: cost outlier ceiling ────────────────────────────────────────────
  it('seed has cost_outlier_ceiling_cad (default 2000000000, bounds sane)', () => {
    const entry = SEED.cost_outlier_ceiling_cad;
    if (!entry) throw new Error('cost_outlier_ceiling_cad missing from seed JSON');
    expect(entry.default).toBe(2000000000);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads cost_outlier_ceiling_cad from logicVars — no hardcoded 500000000 in SQL', () => {
    expect(SRC).toMatch(/logicVars\.cost_outlier_ceiling_cad/);
    expect(SRC).not.toMatch(/> 500000000/);
  });

  // ── E8: null-rate SLAs ──────────────────────────────────────────────────
  it('seed has desc_null_rate_warn_pct (default 5, bounds sane)', () => {
    const entry = SEED.desc_null_rate_warn_pct;
    if (!entry) throw new Error('desc_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(5);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has builder_null_rate_warn_pct (default 95, bounds sane)', () => {
    const entry = SEED.builder_null_rate_warn_pct;
    if (!entry) throw new Error('builder_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(95);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads null-rate thresholds from logicVars — no hardcoded 0.05 or 0.95 comparisons', () => {
    expect(SRC).toMatch(/logicVars\.desc_null_rate_warn_pct/);
    expect(SRC).toMatch(/logicVars\.builder_null_rate_warn_pct/);
    expect(SRC).not.toMatch(/recentTotal > 0\.05/);
    expect(SRC).not.toMatch(/recentTotal > 0\.95/);
  });

  // ── E9: cost_estimates health ───────────────────────────────────────────
  it('seed has cost_est_null_rate_warn_pct (default 80, bounds sane)', () => {
    const entry = SEED.cost_est_null_rate_warn_pct;
    if (!entry) throw new Error('cost_est_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(80);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has cost_est_min_tiers (default 2, bounds sane)', () => {
    const entry = SEED.cost_est_min_tiers;
    if (!entry) throw new Error('cost_est_min_tiers missing from seed JSON');
    expect(entry.default).toBe(2);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads cost_estimates thresholds from logicVars — no hardcoded 0.80 or < 2', () => {
    expect(SRC).toMatch(/logicVars\.cost_est_null_rate_warn_pct/);
    expect(SRC).toMatch(/logicVars\.cost_est_min_tiers/);
    expect(SRC).not.toMatch(/ceTotal > 0\.80/);
    expect(SRC).not.toMatch(/tierCount < 2\b/);
  });

  // ── E10: calibration freshness ──────────────────────────────────────────
  it('seed has calibration_freshness_warn_hours (default 48, bounds sane)', () => {
    const entry = SEED.calibration_freshness_warn_hours;
    if (!entry) throw new Error('calibration_freshness_warn_hours missing from seed JSON');
    expect(entry.default).toBe(48);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads calibration_freshness_warn_hours from logicVars — no hardcoded > 48', () => {
    expect(SRC).toMatch(/logicVars\.calibration_freshness_warn_hours/);
    expect(SRC).not.toMatch(/tcFreshness > 48\b/);
  });

  // ── Infrastructure ──────────────────────────────────────────────────────
  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
