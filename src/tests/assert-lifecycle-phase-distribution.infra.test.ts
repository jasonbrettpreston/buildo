// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-lifecycle-phase-distribution.js must read
// its unclassified permit threshold from logicVars rather than hardcoding it:
//   - lifecycle_unclassified_max (E12): hard FAIL limit for unclassified non-terminal permits
//
// Note: EXPECTED_BANDS (E11) are snapshot-calibrated engineering constants, not
// business parameters — demoted to Indefinite Deferral per triage rule criterion 1.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-lifecycle-phase-distribution.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-lifecycle-phase-distribution.js — unclassified threshold externalization (§6.4)', () => {
  it('seed has lifecycle_unclassified_max (default 100, bounds sane)', () => {
    const entry = SEED.lifecycle_unclassified_max;
    if (!entry) throw new Error('lifecycle_unclassified_max missing from seed JSON');
    expect(entry.default).toBe(100);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThanOrEqual(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads lifecycle_unclassified_max from logicVars — no hardcoded UNCLASSIFIED_MAX = 100', () => {
    expect(SRC).toMatch(/logicVars\.lifecycle_unclassified_max/);
    expect(SRC).not.toMatch(/UNCLASSIFIED_MAX\s*=\s*100/);
    expect(SRC).not.toMatch(/const UNCLASSIFIED_MAX/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
