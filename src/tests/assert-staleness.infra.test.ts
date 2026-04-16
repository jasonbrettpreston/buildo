// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-staleness.js must read both its
// scrape-quality thresholds from logicVars rather than hardcoding them:
//   - scrape_early_phase_threshold_pct (E6): % coverage below which stale = WARN not FAIL
//   - scrape_stale_days                (E6): days before a scraped permit is stale
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-staleness.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-staleness.js — scrape threshold externalization (§6.4)', () => {
  it('seed has scrape_early_phase_threshold_pct (default 5, bounds sane)', () => {
    const entry = SEED.scrape_early_phase_threshold_pct;
    if (!entry) throw new Error('scrape_early_phase_threshold_pct missing from seed JSON');
    expect(entry.default).toBe(5);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has scrape_stale_days (default 30, bounds sane)', () => {
    const entry = SEED.scrape_stale_days;
    if (!entry) throw new Error('scrape_stale_days missing from seed JSON');
    expect(entry.default).toBe(30);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads both thresholds from logicVars — LOGIC_VARS_SCHEMA present', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/logicVars\.scrape_early_phase_threshold_pct/);
    expect(SRC).toMatch(/logicVars\.scrape_stale_days/);
  });

  it('no hardcoded 0.05 coverage fraction', () => {
    expect(SRC).not.toMatch(/\)\s*<\s*0\.05/);
  });

  it('no hardcoded INTERVAL 30 days in SQL', () => {
    expect(SRC).not.toMatch(/INTERVAL '30 days'/);
  });
});
