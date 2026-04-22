// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/classify-inspection-status.js must read the
// Active Inspection → Stalled stall threshold from logicVars.inspection_stall_days
// (not from a hardcoded constant), and both SQL INTERVAL literals must be
// parameterized so the value is tuneable from the control panel without
// a code deploy.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/classify-inspection-status.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('classify-inspection-status.js — inspection_stall_days externalization (§6.4)', () => {
  it('seed JSON contains inspection_stall_days with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('inspection_stall_days');
    const entry = SEED.inspection_stall_days;
    if (!entry) throw new Error('inspection_stall_days missing from seed JSON');
    expect(entry.default).toBe(300);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads inspection_stall_days from logicVars (not hardcoded)', () => {
    expect(SRC).toMatch(/logicVars\.inspection_stall_days/);
    // The standalone JS constant must be gone
    expect(SRC).not.toMatch(/STALE_DAYS\s*=\s*300/);
  });

  it('LOGIC_VARS_SCHEMA includes inspection_stall_days with numeric type', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/inspection_stall_days/);
    expect(SRC).toMatch(/z\.coerce\.number/);
  });

  it('SQL INTERVAL literals are parameterized — no hardcoded 300 days', () => {
    expect(SRC).not.toMatch(/INTERVAL '300 days'/);
  });
});
