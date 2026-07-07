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

describe('compute-coa-cost-estimates — WF2 P6.5 corpus-scoped coverage', () => {
  it('emits coa_corpus_cost_coverage_pct (INFO breakout of the batch coverage gate)', () => {
    expect(coaMuscle).toMatch(/metric:\s*'coa_corpus_cost_coverage_pct'/);
  });

  it('corpus coverage divides priced coa cost rows by the whole coa_applications population', () => {
    // FILTER count over the entire corpus, not the incremental `processed` batch.
    expect(coaMuscle).toMatch(/FROM cost_estimates[\s\S]{0,120}lead_id LIKE 'coa:%'[\s\S]{0,120}estimated_cost IS NOT NULL/);
    expect(coaMuscle).toMatch(/FROM coa_applications\)::int AS total/);
  });

  it('corpus row is INFO — the batch cost_estimate_coverage_pct keeps the FAIL/WARN authority', () => {
    // corpus row must not carry a FAIL/WARN status (it's a health breakout).
    const corpusRow = coaMuscle.match(/metric:\s*'coa_corpus_cost_coverage_pct',[\s\S]{0,160}?status:\s*'(\w+)'/);
    expect(corpusRow?.[1]).toBe('INFO');
  });
});
