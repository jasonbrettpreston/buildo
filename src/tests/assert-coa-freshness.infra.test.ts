// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-DE (v), R-DF EXTERNALIZED, R-EF
//
// Regression lock: the portal-rot bounds of assert_coa_freshness are operator-tunable logic variables, never
// literals, so Ops can tune the staleness SLA without a code deploy.
//
// Two halves while the step converts (phase-4 wave 4). Commit ② lands at stage compute_ported (W4A-R6,
// operator y 2026-10-18; R-EF): the LEGACY shell is still the live step and still reads the legacy
// coa_freshness_* names (first two describes, unchanged). The converted descriptor reads the step-owned
// assert_coa_freshness_* copies (migration 270, values carried; last describe). At ③ the frozen shell lands,
// the legacy names retire, and the legacy half is deleted.
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

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const SEED_C = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, { default: number; type: string; min?: number; max?: number }>;
const DESC = JSON.parse(read('scripts/quality/assert-coa-freshness.descriptor.json')) as {
  checks: { id: string; limit: string; limit_from_config?: string; warn_limit?: string; warn_limit_from_config?: string; severity: string }[];
  config: { logic_variables: { name: string; min: number; max: number }[]; retired?: { name: string }[] };
};

describe('assert_coa_freshness descriptor (②, compute_ported) — step-owned bounds externalization (§6.4; R-DE (v))', () => {
  it('seeds carry the two step-owned bounds with the legacy defaults (45 / 135) and bounds', () => {
    expect(SEED_C.assert_coa_freshness_warn_max_days).toMatchObject({ default: 45, type: 'number', min: 7, max: 180 });
    expect(SEED_C.assert_coa_freshness_fail_max_days).toMatchObject({ default: 135, type: 'number', min: 14, max: 365 });
    // The FAIL bound's default exceeds the WARN bound's (the legacy refine, now a seed-level fact).
    expect(SEED_C.assert_coa_freshness_fail_max_days?.default).toBeGreaterThan(SEED_C.assert_coa_freshness_warn_max_days?.default ?? Infinity);
  });

  it.fails('the legacy coa_freshness_* names are in NO seed (Spec 124 R-A) and are declared retired (flips at ③, with the frozen shell)', () => {
    expect(SEED_C).not.toHaveProperty('coa_freshness_warn_days');
    expect(SEED_C).not.toHaveProperty('coa_freshness_fail_days');
    expect((DESC.config.retired ?? []).map((r) => r.name).sort()).toEqual(['coa_freshness_fail_days', 'coa_freshness_warn_days']);
  });

  it('the descriptor declares each bound with the seed\'s own min/max', () => {
    for (const v of DESC.config.logic_variables) {
      expect(SEED_C[v.name], v.name).toBeDefined();
      expect([v.min, v.max]).toEqual([SEED_C[v.name]?.min, SEED_C[v.name]?.max]);
    }
  });

  it('the three tiers are one declared check whose two bounds both resolve from config (FAIL > WARN > PASS)', () => {
    const c = DESC.checks.find((x) => x.id === 'ingestion_days_ago');
    expect(c).toMatchObject({ severity: 'FAIL', limit_from_config: 'assert_coa_freshness_warn_max_days', warn_limit_from_config: 'assert_coa_freshness_fail_max_days' });
    // The literal in each bound string is the seed default, substituted at run time (verdict.js resolveLimit).
    expect(c?.limit).toBe(`value_max ${SEED_C.assert_coa_freshness_warn_max_days?.default}`);
    expect(c?.warn_limit).toBe(`value_max ${SEED_C.assert_coa_freshness_fail_max_days?.default}`);
  });

  it('the empty-table lane stays WARN (fresh staging, not portal rot)', () => {
    expect(DESC.checks.find((x) => x.id === 'total_records_present')).toMatchObject({ limit: 'viol == 0', severity: 'WARN' });
  });

  it('no compute file carries a copied bound', () => {
    const src = read('scripts/lib/compute/assert-coa-freshness.js');
    expect(src).not.toMatch(/\b(45|135)\b/);
  });
});
