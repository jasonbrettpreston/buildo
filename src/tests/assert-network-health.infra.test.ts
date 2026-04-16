// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-network-health.js must read its
// scraper health SLA thresholds from logicVars rather than hardcoding them:
//   - scraper_error_rate_warn_pct (E13): proxy error rate FAIL threshold (%)
//   - scraper_latency_p50_warn_ms (E13): p50 latency WARN threshold (ms)
//   - scraper_empty_streak_warn   (E13): consecutive empty responses WAF WARN
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-network-health.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-network-health.js — scraper SLA threshold externalization (§6.4)', () => {
  it('seed has scraper_error_rate_warn_pct (default 5, bounds sane)', () => {
    const entry = SEED.scraper_error_rate_warn_pct;
    if (!entry) throw new Error('scraper_error_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(5);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has scraper_latency_p50_warn_ms (default 2000, bounds sane)', () => {
    const entry = SEED.scraper_latency_p50_warn_ms;
    if (!entry) throw new Error('scraper_latency_p50_warn_ms missing from seed JSON');
    expect(entry.default).toBe(2000);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has scraper_empty_streak_warn (default 20, bounds sane)', () => {
    const entry = SEED.scraper_empty_streak_warn;
    if (!entry) throw new Error('scraper_empty_streak_warn missing from seed JSON');
    expect(entry.default).toBe(20);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads all three thresholds from logicVars — no hardcoded values', () => {
    expect(SRC).toMatch(/logicVars\.scraper_error_rate_warn_pct/);
    expect(SRC).toMatch(/logicVars\.scraper_latency_p50_warn_ms/);
    expect(SRC).toMatch(/logicVars\.scraper_empty_streak_warn/);
    expect(SRC).not.toMatch(/errorRate >= 5\b/);
    expect(SRC).not.toMatch(/p50 >= 2000\b/);
    expect(SRC).not.toMatch(/emptyMax >= 20\b/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
