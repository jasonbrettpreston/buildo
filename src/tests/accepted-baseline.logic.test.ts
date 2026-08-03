// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §4.5, §4.6, §4.9
//
// Pipeline Rehab P4 (2026-08-03) — producer-side accepted-baseline WARN
// pattern for the two persistently-red audit gates:
//   - coa `assert_global_coverage` coa_applications.estimated_cost
//     (61.1–61.2% vs the 90/70 global rail — 8/8 nightly FAILs)
//   - permits `assert_entity_tracing` opportunity_score (79.9–80.0 vs >= 80,
//     never passed — persistently near-threshold, NOT flapping)
// The acceptance lives IN THE GATES (Spec 48 §4.6 — never a checker-side
// allowlist), is self-announcing every run with the live value (§4.9), and
// SELF-RETIRES the moment the value reaches the strict threshold.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { acceptedBaselineRows } = require('../../scripts/lib/accepted-baseline.js') as {
  acceptedBaselineRows: (args: {
    valuePct: number | null;
    strictPct: number;
    acceptanceMetric: string;
    baseline: string;
  }) => Array<{ metric: string; value: string; threshold: string; status: string }> | null;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

describe('acceptedBaselineRows — pure accepted-baseline builder (Spec 48 §4.9)', () => {
  const args = {
    valuePct: 61.1,
    strictPct: 90,
    acceptanceMetric: 'coa_cost_coverage_gate_accepted',
    baseline: '61.1-61.2% on 2026-08-03',
  };

  it('below the strict threshold: emits the accepted-WARN row (live value + threshold + self-documenting acceptance string) plus a companion re-tighten INFO row', () => {
    const rows = acceptedBaselineRows(args);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(2);
    const warn = rows![0]!;
    const info = rows![1]!;
    expect(warn.metric).toBe('coa_cost_coverage_gate_accepted');
    expect(warn.status).toBe('WARN');
    expect(warn.value).toContain('61.1'); // live value EVERY run — a further regression stays visible
    expect(warn.threshold).toContain('90'); // the suspended strict threshold
    expect(warn.threshold).toContain('SELF-RETIRES'); // self-documenting acceptance string
    expect(warn.threshold).toContain('61.1-61.2% on 2026-08-03'); // baseline provenance
    expect(info.metric).toBe('coa_cost_coverage_gate_accepted_retighten');
    expect(info.status).toBe('INFO');
    expect(info.threshold).toContain('90'); // machine-observable re-tighten condition
  });

  it('at the strict threshold: acceptance SELF-RETIRES (null — the plain gate resumes, no acceptance row)', () => {
    expect(acceptedBaselineRows({ ...args, valuePct: 90 })).toBeNull();
  });

  it('above the strict threshold: null (normal PASS, no acceptance row)', () => {
    expect(acceptedBaselineRows({ ...args, valuePct: 95.2 })).toBeNull();
  });

  it('unusable value (null / NaN): null — acceptance never invents rows from bad data', () => {
    expect(acceptedBaselineRows({ ...args, valuePct: null })).toBeNull();
    expect(acceptedBaselineRows({ ...args, valuePct: NaN })).toBeNull();
  });
});

describe('gate wiring — producer-side acceptance (source-scan)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf-8');

  it('assert-global-coverage.js wires coa_cost_coverage_gate_accepted through the shared builder (coa chain only)', () => {
    const src = read('scripts/quality/assert-global-coverage.js');
    expect(src).toMatch(/require\(['"]\.\.?\/?\.?\.?\/lib\/accepted-baseline['"]\)/);
    expect(src).toContain("acceptanceMetric: 'coa_cost_coverage_gate_accepted'");
    // Scope guard: the permits-chain Step-14 cost profile stays a PLAIN
    // calibratedRow — the permits assert_global_coverage profile currently
    // PASSes and must NOT be relaxed.
    expect(src).toMatch(/calibratedRow\('Step 14 — compute_cost_estimates',\s*'cost_estimates\.estimated_cost'/);
  });

  it('assert-entity-tracing.js wires permits_opportunity_score_gate_accepted and derives its verdict from rows (never a parallel boolean)', () => {
    const src = read('scripts/quality/assert-entity-tracing.js');
    expect(src).toMatch(/require\(['"]\.\.?\/?\.?\.?\/lib\/accepted-baseline['"]\)/);
    expect(src).toContain("acceptanceMetric: 'permits_opportunity_score_gate_accepted'");
    // Verdict must be row-derived (Spec 48: FAIL if any row FAIL, else WARN
    // if any WARN, else PASS) — an accepted-WARN run lands
    // completed_with_warnings, which is green under the P3 allowlist.
    expect(src).toMatch(/auditRows\.some\(\s*\(?r\)?\s*=>\s*r\.status === 'FAIL'\)/);
    expect(src).toMatch(/auditRows\.some\(\s*\(?r\)?\s*=>\s*r\.status === 'WARN'\)/);
  });

  it('neither gate reuses the RESERVED coa_audit_gate_warn_accepted metric name (Spec 85 / mig 211 collision hazard)', () => {
    expect(read('scripts/quality/assert-global-coverage.js')).not.toContain('coa_audit_gate_warn_accepted');
    expect(read('scripts/quality/assert-entity-tracing.js')).not.toContain('coa_audit_gate_warn_accepted');
  });
});
