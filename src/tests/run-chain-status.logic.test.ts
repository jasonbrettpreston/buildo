// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CC
//
// Spec 124 R-CC (operator 2026-10-12, purity seam S1-R): a chain-run step
// row's status is DERIVED from that run's records_meta.audit_table.rows via a
// single pure fold — the literal 'completed' is retired. This file pins every
// mapping row (including the null / missing-table / empty / unrecognised
// WARNs) and the chain-level precedence fold.
//
// run-chain.js is `require()`-d directly (as run-chain-selection.logic.test.ts
// does) — safe because of the `require.main === module` guard at the bottom of
// the file, so the module-load `run().catch(...)` never fires in a vitest
// worker.

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runChain = require('../../scripts/run-chain.js') as {
  stepStatusFromRecordsMeta: (recordsMeta: unknown) => {
    status: string;
    auditRows: Array<{ metric: string; status: string; detail: Record<string, unknown> }>;
  };
  resolveChainStatus: (facts: {
    wasCancelled: boolean;
    failedStep: string | null;
    hasVerdictFails: boolean;
    deferredStep: string | null;
    budgetStopped: boolean;
    hasVerdictWarns: boolean;
    stepRowStatuses?: string[];
  }) => string;
};

/** Build a records_meta carrying an audit_table with the given row statuses. */
const meta = (statuses: string[], verdict?: string) => ({
  audit_table: {
    ...(verdict === undefined ? {} : { verdict }),
    rows: statuses.map((status, i) => ({ metric: `m${i}`, status })),
  },
});

describe('stepStatusFromRecordsMeta — closed verdict→status mapping (R-CC)', () => {
  it('PASS → completed, no diagnostic rows', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['PASS', 'PASS']));
    expect(r.status).toBe('completed');
    expect(r.auditRows).toEqual([]);
  });

  it('SKIP-only → completed, no diagnostic rows', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['SKIP', 'SKIP']));
    expect(r.status).toBe('completed');
    expect(r.auditRows).toEqual([]);
  });

  it('INFO counts as a PASS-ish green (PASS or INFO ⇒ PASS)', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['INFO', 'SKIP']));
    expect(r.status).toBe('completed');
    expect(r.auditRows).toEqual([]);
  });

  it('any WARN → completed_with_warnings, no diagnostic rows', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['PASS', 'WARN']));
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([]);
  });

  it('any FAIL → completed_with_errors (FAIL beats WARN)', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['WARN', 'FAIL']));
    expect(r.status).toBe('completed_with_errors');
    expect(r.auditRows).toEqual([]);
  });

  it('empty rows → UNKNOWN → completed_with_warnings + verdict_unavailable{empty_rows}', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta([]));
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_unavailable', status: 'WARN', detail: { reason: 'empty_rows' } },
    ]);
  });

  it('missing audit_table → completed_with_warnings + verdict_unavailable{missing_audit_table}', () => {
    const r = runChain.stepStatusFromRecordsMeta({});
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_unavailable', status: 'WARN', detail: { reason: 'missing_audit_table' } },
    ]);
  });

  it('null recordsMeta → completed_with_warnings + verdict_unavailable{missing_audit_table} (null ≠ PASS)', () => {
    const r = runChain.stepStatusFromRecordsMeta(null);
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_unavailable', status: 'WARN', detail: { reason: 'missing_audit_table' } },
    ]);
  });

  it('unrecognised row status → completed_with_warnings + verdict_unavailable{unrecognised_status:<s>}', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['PASS', 'BOGUS']));
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_unavailable', status: 'WARN', detail: { reason: 'unrecognised_status:BOGUS' } },
    ]);
  });

  it('stored verdict agreeing with the fold writes NO mismatch row', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['PASS'], 'PASS'));
    expect(r.status).toBe('completed');
    expect(r.auditRows).toEqual([]);
  });

  it('stored verdict differing from the fold adds verdict_mismatch{stored, folded}', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta(['PASS'], 'FAIL'));
    expect(r.status).toBe('completed');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_mismatch', status: 'WARN', detail: { stored: 'FAIL', folded: 'PASS' } },
    ]);
  });

  it('mismatch is additive — it does not suppress a verdict_unavailable row', () => {
    const r = runChain.stepStatusFromRecordsMeta(meta([], 'PASS'));
    expect(r.status).toBe('completed_with_warnings');
    expect(r.auditRows).toEqual([
      { metric: 'verdict_unavailable', status: 'WARN', detail: { reason: 'empty_rows' } },
      { metric: 'verdict_mismatch', status: 'WARN', detail: { stored: 'PASS', folded: 'UNKNOWN' } },
    ]);
  });
});

describe('resolveChainStatus — chain fold precedence (R-CC: failed > errors > warnings > completed)', () => {
  const base = {
    wasCancelled: false,
    failedStep: null,
    hasVerdictFails: false,
    deferredStep: null,
    budgetStopped: false,
    hasVerdictWarns: false,
  };

  it('worst step-row status wins: errors beat warnings beat completed', () => {
    expect(runChain.resolveChainStatus({ ...base, stepRowStatuses: ['completed', 'completed_with_errors'] }))
      .toBe('completed_with_errors');
    expect(runChain.resolveChainStatus({ ...base, stepRowStatuses: ['completed', 'completed_with_warnings'] }))
      .toBe('completed_with_warnings');
    expect(runChain.resolveChainStatus({ ...base, stepRowStatuses: ['completed', 'completed'] }))
      .toBe('completed');
  });

  it('failed beats errors at the chain level', () => {
    expect(runChain.resolveChainStatus({ ...base, failedStep: 'x', stepRowStatuses: ['completed_with_errors'] }))
      .toBe('failed');
  });

  it('errors beat warnings', () => {
    expect(runChain.resolveChainStatus({ ...base, stepRowStatuses: ['completed_with_warnings', 'completed_with_errors'] }))
      .toBe('completed_with_errors');
  });

  it('pre-existing branches are preserved when no step-row statuses are supplied', () => {
    expect(runChain.resolveChainStatus(base)).toBe('completed');
    expect(runChain.resolveChainStatus({ ...base, budgetStopped: true })).toBe('completed_with_warnings');
    expect(runChain.resolveChainStatus({ ...base, deferredStep: 'd' })).toBe('deferred_to_full');
    expect(runChain.resolveChainStatus({ ...base, wasCancelled: true })).toBe('cancelled');
  });
});
