/**
 * chain-cascade.integration.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §8.2 (verdict cascade)
 *           docs/specs/01-pipeline/83_lead_cost_model.md §3.A (WF1 D3 fold)
 *
 * Source-level regression lock for the chain-cascade behavior — closes the
 * "audit passes but production broken" gap that allowed WF3 #16 to ship a
 * PASS audit_table verdict alongside a 100% null cost_estimates regression.
 *
 * The chain orchestrator (run-chain.js) MUST:
 *   1. Capture each step's audit_table.verdict into stepVerdicts[slug].
 *   2. When any step reports FAIL, mark the chain status as
 *      'completed_with_errors' (NOT 'completed').
 *   3. Log a WARN when FAIL verdicts are present but the step itself didn't
 *      throw — so operators see the FAIL signal even if the orchestrator
 *      doesn't auto-abort downstream steps.
 *
 * Note: the orchestrator's design choice is to LET downstream steps run when
 * a step reports verdict=FAIL but doesn't throw — the FAIL is a soft signal
 * for observers (observe-chain.js, dashboards). The auto-abort is reserved
 * for thrown errors. This test locks in that soft-signal contract.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runChain = readFileSync(
  resolve(__dirname, '../../scripts/run-chain.js'),
  'utf8',
);

describe('run-chain.js — verdict cascade contract', () => {
  it('captures audit_table.verdict from each step into stepVerdicts map', () => {
    expect(runChain).toMatch(/stepVerdicts\[slug\]\s*=\s*recordsMeta\.audit_table\.verdict/);
  });

  it('aggregates step verdicts to derive chain-level health', () => {
    expect(runChain).toMatch(/verdictValues\.includes\(['"]FAIL['"]\)/);
    expect(runChain).toMatch(/verdictValues\.includes\(['"]WARN['"]\)/);
  });

  it('marks chain status as completed_with_errors when any step verdict is FAIL', () => {
    expect(runChain).toMatch(/hasVerdictFails[\s\S]{0,100}'completed_with_errors'/);
  });

  it('logs a WARN when FAIL verdicts present (so operators see the signal)', () => {
    expect(runChain).toMatch(/FAIL verdicts/);
  });

  it('persists step_verdicts to chain records_meta for drill-down', () => {
    expect(runChain).toMatch(/metaObj\.step_verdicts\s*=\s*stepVerdicts/);
  });
});

describe('compute-cost-estimates — verdict source asserts WF1 D3 cascade', () => {
  it('audit_table verdict is row-derived (would have escalated to FAIL during the 14-day regression)', () => {
    const muscle = readFileSync(
      resolve(__dirname, '../../scripts/compute-cost-estimates.js'),
      'utf8',
    );
    // Asserts the OB-1 cascade: when any audit row is FAIL, verdict is FAIL.
    // This is the architectural defense — pre-WF1, the verdict was capped at
    // WARN by a parallel-boolean expression even when coverage was 0%.
    const cascadeRegion = muscle.match(/const costVerdict[\s\S]{0,500}?'PASS';/);
    expect(cascadeRegion).toBeTruthy();
    expect(cascadeRegion![0]).toMatch(/costAuditRows\.some\(.*'FAIL'\)/);
    expect(cascadeRegion![0]).toMatch(/['"]FAIL['"]/);
  });
});
