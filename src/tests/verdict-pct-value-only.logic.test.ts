// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10; 122_pipeline_step_optimization.md §5.5
//
// Q1 (WF3 skip-rate, 2026-09-28) — the `pct` limit arm must read
// `observation.value` ONLY, exactly as `value_min`/`value_max` already do.
// `evaluateLimit`'s own JSDoc says a percentage check reports the measured
// ratio as `value` and leaves `violations` undefined; before this fix the pct
// arm compared `measured` (violations-first), so a compute that reported a 0/1
// flag as `violations` had that flag compared to the percentage bound and
// PASSED on every possible input — the Spec 121 §12b.6 "green because it never
// looked" class.
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const verdict = require('../../scripts/lib/step/verdict.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const { evaluateLimit, checkRow } = verdict as {
  evaluateLimit: (limit: unknown, observation: Record<string, unknown>) => { ok?: boolean; unevaluable?: string };
  checkRow: (check: Record<string, unknown>, observation: Record<string, unknown>, onCheckError: string) => { status: string; value: unknown; threshold: unknown } | null;
};

describe('verdict Q1 — pct evaluates observation.value only', () => {
  it('T1: a pct limit with no numeric value (a bare 0/1 flag) is UNEVALUABLE, never ok', () => {
    const verdictish = evaluateLimit('pct <= 5', { violations: 0 });
    expect(verdictish.ok).toBeUndefined();
    expect(verdictish.unevaluable).toBe('check reported no numeric ratio');
  });

  it('T2: a pct limit compares observation.value, so the ratio wins over the violations flag', () => {
    expect(evaluateLimit('pct <= 5', { violations: 0, value: 50 })).toEqual({ ok: false });
  });

  it('T3: an unevaluable pct check resolves to the DECLARED severity, never PASS', () => {
    const row = checkRow({ id: 'skip_rate_pct', severity: 'FAIL', limit: 'pct <= 5' }, { violations: 0, detail: '50.0%' }, 'fail_step');
    expect(row).not.toBeNull();
    expect(row!.status).toBe('FAIL');
    expect(row!.status).not.toBe('PASS');
  });

  it('T4: pct compares the value at and across the bound, both directions, and NaN is unevaluable', () => {
    expect(evaluateLimit('pct <= 5', { value: 5 })).toEqual({ ok: true });
    expect(evaluateLimit('pct <= 5', { value: 5.01 })).toEqual({ ok: false });
    expect(evaluateLimit('pct >= 90', { value: 90 })).toEqual({ ok: true });
    expect(evaluateLimit('pct >= 90', { value: 89.9 })).toEqual({ ok: false });
    expect(evaluateLimit('pct <= 5', { value: NaN }).unevaluable).toBeDefined();
  });

  it('T5: the viol and value_max arms are unchanged', () => {
    expect(evaluateLimit('viol == 0', { violations: 0 })).toEqual({ ok: true });
    expect(evaluateLimit({ warn: 1, fail: 5 }, { violations: 5 })).toEqual({ ok: false, escalate: 'FAIL' });
    expect(evaluateLimit('value_max 10', { value: 3 })).toEqual({ ok: true });
  });
});
