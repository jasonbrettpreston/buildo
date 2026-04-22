// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/link-coa.js must read its CoA match confidence
// thresholds from logicVars rather than hardcoding them in the stats SQL:
//   - coa_match_conf_high   (E17): >= this = 'high confidence' link
//   - coa_match_conf_medium (E17): boundary between low and medium confidence
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-coa.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link-coa.js — confidence threshold externalization (§6.4)', () => {
  it('seed has coa_match_conf_high (default 0.90, bounds sane)', () => {
    const entry = SEED.coa_match_conf_high;
    if (!entry) throw new Error('coa_match_conf_high missing from seed JSON');
    expect(entry.default).toBe(0.90);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('seed has coa_match_conf_medium (default 0.50, bounds sane)', () => {
    const entry = SEED.coa_match_conf_medium;
    if (!entry) throw new Error('coa_match_conf_medium missing from seed JSON');
    expect(entry.default).toBe(0.50);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('reads confidence thresholds from logicVars — no hardcoded 0.90 or 0.50 in stats SQL', () => {
    expect(SRC).toMatch(/logicVars\.coa_match_conf_high/);
    expect(SRC).toMatch(/logicVars\.coa_match_conf_medium/);
    expect(SRC).not.toMatch(/linked_confidence >= 0\.90/);
    expect(SRC).not.toMatch(/linked_confidence >= 0\.50 AND/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
