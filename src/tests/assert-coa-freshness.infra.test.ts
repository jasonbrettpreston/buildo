// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-coa-freshness.js must read the
// portal-rot WARN threshold from logicVars.coa_freshness_warn_days rather
// than hardcoding 45, so Ops can tune the staleness SLA without a code deploy.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-coa-freshness.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-coa-freshness.js — coa_freshness_warn_days externalization (§6.4)', () => {
  it('seed JSON has coa_freshness_warn_days with correct defaults and bounds', () => {
    expect(SEED).toHaveProperty('coa_freshness_warn_days');
    const entry = SEED.coa_freshness_warn_days;
    if (!entry) throw new Error('coa_freshness_warn_days missing from seed JSON');
    expect(entry.default).toBe(45);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads coa_freshness_warn_days from logicVars — no hardcoded 45', () => {
    expect(SRC).toMatch(/logicVars\.coa_freshness_warn_days/);
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    // The literal >= 45 comparison must be gone
    expect(SRC).not.toMatch(/>=\s*45[^0-9]/);
  });

  it('audit threshold string references the variable — no hardcoded "< 45"', () => {
    expect(SRC).not.toMatch(/'< 45'/);
  });
});

describe('assert-coa-freshness.js — WF2 P6.5 FAIL tier (3-tier: FAIL > WARN > PASS)', () => {
  it('seed JSON has coa_freshness_fail_days (default 135, min 14, max 365)', () => {
    expect(SEED).toHaveProperty('coa_freshness_fail_days');
    const entry = SEED.coa_freshness_fail_days;
    if (!entry) throw new Error('coa_freshness_fail_days missing from seed JSON');
    expect(entry.default).toBe(135);
    expect(entry.min).toBe(14);
    expect(entry.max).toBe(365);
    // FAIL floor must exceed the WARN floor.
    const warnEntry = SEED.coa_freshness_warn_days;
    if (!warnEntry) throw new Error('coa_freshness_warn_days missing from seed JSON');
    expect(entry.default).toBeGreaterThan(warnEntry.default);
  });

  it('reads coa_freshness_fail_days from logicVars + Zod-validates fail > warn', () => {
    expect(SRC).toMatch(/logicVars\.coa_freshness_fail_days/);
    expect(SRC).toMatch(/coa_freshness_fail_days:\s*z\.coerce\.number\(\)/);
    expect(SRC).toMatch(/coa_freshness_fail_days\s*>\s*d\.coa_freshness_warn_days/);
  });

  it('verdict cascades FAIL > WARN > PASS (isFail takes precedence)', () => {
    expect(SRC).toMatch(/const isFail\s*=[\s\S]*?freshnessFailDays/);
    expect(SRC).toMatch(/isFail\s*\?\s*'FAIL'\s*:\s*isStale\s*\?\s*'WARN'\s*:\s*'PASS'/);
  });

  it('empty-table branch stays WARN (fresh-staging, not portal rot)', () => {
    // The totalRecords===0 branch must still emit verdict WARN, not FAIL.
    const emptyBranch = SRC.match(/totalRecords === 0\)[\s\S]*?verdict:\s*'(\w+)'/);
    expect(emptyBranch?.[1]).toBe('WARN');
  });
});
