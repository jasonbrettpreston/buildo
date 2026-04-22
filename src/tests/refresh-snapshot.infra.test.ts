// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/refresh-snapshot.js must read its CoA snapshot
// confidence thresholds from logicVars rather than hardcoding them:
//   - snapshot_coa_conf_high  (E17): >= this = high_confidence in CoA snapshot
//   - coa_match_conf_medium   (E17): < this = low_confidence in CoA snapshot
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/refresh-snapshot.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('refresh-snapshot.js — CoA confidence threshold externalization (§6.4)', () => {
  it('seed has snapshot_coa_conf_high (default 0.80, bounds sane)', () => {
    const entry = SEED.snapshot_coa_conf_high;
    if (!entry) throw new Error('snapshot_coa_conf_high missing from seed JSON');
    expect(entry.default).toBe(0.80);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('reads thresholds from logicVars — no hardcoded 0.80 or 0.50 in CoA snapshot SQL', () => {
    expect(SRC).toMatch(/logicVars\.snapshot_coa_conf_high/);
    expect(SRC).toMatch(/logicVars\.coa_match_conf_medium/);
    expect(SRC).not.toMatch(/linked_confidence >= 0\.80\b/);
    expect(SRC).not.toMatch(/linked_confidence < 0\.50\b/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
