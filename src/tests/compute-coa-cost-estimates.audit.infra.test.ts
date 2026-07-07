/**
 * compute-coa-cost-estimates.audit.infra.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A (WF1 D3 OB-2 mirror)
 *
 * Asserts the CoA Muscle has the OB-2 zero-coverage FAIL gate (finite-guarded,
 * INFO on empty input). Carried forward into this WF1 because the same 14-day
 * silent regression mechanism can re-occur in the CoA path — symmetric defense.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const coaMuscle = readFileSync(
  resolve(__dirname, '../../scripts/compute-coa-cost-estimates.js'),
  'utf8',
);

describe('compute-coa-cost-estimates audit_table — D3 OB-2 mirror', () => {
  it('coverageRow uses Number.isFinite guard', () => {
    expect(coaMuscle).toMatch(/!Number\.isFinite\(coveragePct\)/);
  });

  it('coverageRow uses externalized coa_cost_coverage_fail_pct (operator-tunable FAIL gate)', () => {
    expect(coaMuscle).toMatch(/logicVars\.coa_cost_coverage_fail_pct/);
    expect(coaMuscle).toMatch(/coveragePct <= coverageFailPct[\s\S]{0,200}'FAIL'/);
  });

  it('coverageRow emits INFO on empty input (processed === 0)', () => {
    expect(coaMuscle).toMatch(/processed === 0[\s\S]{0,400}'INFO'/);
  });

  it('CoA Brain config builder uses defensive .trim() (G11 symmetry with permits Brain)', () => {
    const coaBrain = readFileSync(
      resolve(__dirname, '../../scripts/lib/coa-cost-model.js'),
      'utf8',
    );
    expect(coaBrain).toMatch(/const pt = \(row\.permit_type \|\| ''\)\.trim\(\)/);
    expect(coaBrain).toMatch(/const st = \(row\.structure_type \|\| ''\)\.trim\(\)/);
  });
});
