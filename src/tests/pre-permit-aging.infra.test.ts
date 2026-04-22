// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: the 18-month and 12-month pre-permit aging windows must
// be read from logicVars rather than hardcoded, so Ops can tune the expiry
// and stale-warning thresholds without a code deploy.
//
//   pre_permit_expiry_months (E4): 18-month expiry used by create-pre-permits.js
//                                  AND assert-pre-permit-aging.js
//   pre_permit_stale_months  (E4): 12-month early-warning used only by
//                                  assert-pre-permit-aging.js
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CREATE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/create-pre-permits.js'),
  'utf-8'
);
const ASSERT_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-pre-permit-aging.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('pre-permit aging — logicVars externalization (§6.4)', () => {
  // ── Seed JSON ─────────────────────────────────────────────────────────────

  it('seed JSON has pre_permit_expiry_months with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('pre_permit_expiry_months');
    const entry = SEED.pre_permit_expiry_months;
    if (!entry) throw new Error('pre_permit_expiry_months missing from seed JSON');
    expect(entry.default).toBe(18);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed JSON has pre_permit_stale_months with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('pre_permit_stale_months');
    const entry = SEED.pre_permit_stale_months;
    if (!entry) throw new Error('pre_permit_stale_months missing from seed JSON');
    expect(entry.default).toBe(12);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  // ── create-pre-permits.js ─────────────────────────────────────────────────

  it('create-pre-permits.js reads pre_permit_expiry_months from logicVars', () => {
    expect(CREATE_SRC).toMatch(/logicVars\.pre_permit_expiry_months/);
    expect(CREATE_SRC).toMatch(/LOGIC_VARS_SCHEMA/);
  });

  it('create-pre-permits.js has no hardcoded INTERVAL 18 months', () => {
    expect(CREATE_SRC).not.toMatch(/INTERVAL '18 months'/);
  });

  // ── assert-pre-permit-aging.js ────────────────────────────────────────────

  it('assert-pre-permit-aging.js reads both aging keys from logicVars', () => {
    expect(ASSERT_SRC).toMatch(/logicVars\.pre_permit_expiry_months/);
    expect(ASSERT_SRC).toMatch(/logicVars\.pre_permit_stale_months/);
    expect(ASSERT_SRC).toMatch(/LOGIC_VARS_SCHEMA/);
  });

  it('assert-pre-permit-aging.js has no hardcoded INTERVAL months', () => {
    expect(ASSERT_SRC).not.toMatch(/INTERVAL '18 months'/);
    expect(ASSERT_SRC).not.toMatch(/INTERVAL '12 months'/);
  });
});
