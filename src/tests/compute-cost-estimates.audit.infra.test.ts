/**
 * compute-cost-estimates.audit.infra.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A + Spec 47 §8.2
 *
 * Source-level regression locks for the WF1 §3.A audit_table observability
 * gates: OB-1 (row-derived verdict cascade), OB-2 (model_coverage_pct FAIL
 * on zero, finite-guarded, INFO on empty input), OB-3a (permit_type_class_
 * skipped_pct), and OB-3b (matrix_miss_pct WARN/FAIL on thresholds).
 *
 * These are file-content assertions (cheap, fast). End-to-end gate-firing
 * behavior lives in chain-cascade.integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const muscle = readFileSync(
  resolve(__dirname, '../../scripts/compute-cost-estimates.js'),
  'utf8',
);

describe('compute-cost-estimates audit_table — WF1 OB-1/OB-2/OB-3a/OB-3b', () => {
  it('OB-1: verdict cascade reads from costAuditRows (row-derived, not parallel-boolean)', () => {
    expect(muscle).toMatch(/costAuditRows\.some\(\(r\) => r\.status === 'FAIL'\)/);
    expect(muscle).toMatch(/costAuditRows\.some\(\(r\) => r\.status === 'WARN'\)/);
  });

  it('OB-2: model_coverage_pct uses Number.isFinite guard', () => {
    expect(muscle).toMatch(/!Number\.isFinite\(modelCoveragePct\)/);
  });

  it('OB-2: model_coverage_pct compares against externalized cost_model_coverage_fail_pct (FAIL gate)', () => {
    expect(muscle).toMatch(/logicVars\.cost_model_coverage_fail_pct/);
    expect(muscle).toMatch(/modelCoveragePct <= coverageFail[\s\S]{0,200}'FAIL'/);
  });

  it('OB-2: model_coverage_pct emits INFO (not FAIL) when processed === 0 (empty input)', () => {
    expect(muscle).toMatch(/processed === 0[\s\S]{0,200}'INFO'/);
  });

  it('OB-3a: permit_type_class_skipped_pct row uses externalized cost_ptc_skipped_warn_pct', () => {
    expect(muscle).toMatch(/permit_type_class_skipped_pct/);
    expect(muscle).toMatch(/logicVars\.cost_ptc_skipped_warn_pct/);
  });

  it('OB-3b: matrix_miss_pct row uses externalized cost_matrix_miss_warn_pct + fail_pct (Spec 86 Control Panel)', () => {
    expect(muscle).toMatch(/matrix_miss_pct/);
    expect(muscle).toMatch(/logicVars\.cost_matrix_miss_warn_pct/);
    expect(muscle).toMatch(/logicVars\.cost_matrix_miss_fail_pct/);
  });

  it('Brain scopeMatrix builder uses .trim() only, no .toLowerCase()', () => {
    const scopeMatrixBlock = muscle.match(/const scopeMatrix = Object\.fromEntries\([\s\S]{0,500}?\);/);
    expect(scopeMatrixBlock).toBeTruthy();
    expect(scopeMatrixBlock![0]).toMatch(/\.trim\(\)/);
    expect(scopeMatrixBlock![0]).not.toMatch(/\.toLowerCase\(\)/);
  });
});
