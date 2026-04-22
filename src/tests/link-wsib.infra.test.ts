// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/link-wsib.js must read its Tier 3 fuzzy-match
// similarity threshold from logicVars rather than hardcoding it:
//   - wsib_fuzzy_match_threshold (E20): pg_trgm threshold and inline similarity() comparison
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-wsib.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link-wsib.js — fuzzy match threshold externalization (§6.4)', () => {
  it('seed has wsib_fuzzy_match_threshold (default 0.6, bounds sane)', () => {
    const entry = SEED.wsib_fuzzy_match_threshold;
    if (!entry) throw new Error('wsib_fuzzy_match_threshold missing from seed JSON');
    expect(entry.default).toBe(0.6);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('reads threshold from logicVars — no hardcoded similarity_threshold = 0.6 or > 0.6', () => {
    expect(SRC).toMatch(/logicVars\.wsib_fuzzy_match_threshold/);
    expect(SRC).not.toMatch(/similarity_threshold\s*=\s*0\.6/);
    expect(SRC).not.toMatch(/similarity\(.*\)\s*>\s*0\.6/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
