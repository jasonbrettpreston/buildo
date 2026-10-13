// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ
//
// WF6 Regression Guardian #1 / Observability #7 (CP-B8d) — the commit-time hook
// `scripts/hooks/check-step-shape.mjs`.
//
// Two defects, both in the purity half of that hook:
//
//   1. `matchLedger` returns `unallowed` entries as `{step, item[, collision]}` —
//      NOT the finding. The blocking loop printed `v.ruleId`/`v.file`/`v.line`, so
//      every purity failure read "footgun[undefined]: undefined:undefined": the one
//      thing a commit-blocking message must do (name the site) it did not.
//      `formatPurityUnallowed` looks each `(step, item)` key back up in the exact
//      findings array the match was fed.
//
//   2. The hook never applied `purityRowFreeze`. A NEW purity row (a later `filed`
//      date, or one on a module outside V2_PURITY_MODULES) slipped the commit and
//      was only caught later by step-validate #32.
//
// Both are pure functions, so the test is headless: no hook spawn, no git, no fs.
// The hook's `main()` is guarded behind an entry check (CP-B8d), so importing the
// module here neither scans nor exits.

import { describe, it, expect } from 'vitest';
import { formatPurityUnallowed } from '../../scripts/hooks/check-step-shape.mjs';
import { purityRowFreeze } from '../../scripts/analysis/gates/compute-literals.mjs';

describe('check-step-shape purity block (CP-B8d)', () => {
  it('(a) resolves an unallowed (step, item) back to its finding — no `undefined`', () => {
    // Exactly the shape `matchLedger` returns when no row covers a finding.
    const unallowed = [{ step: 'load-parcels', file: 'scripts/lib/compute/load-parcels.js', item: 'compute-ledger-sql@SELECT 1' }];
    // Exactly the shape `purityFindings(scanPurity(...))` produces.
    const findings = [
      {
        file: 'scripts/lib/compute/load-parcels.js',
        line: 42,
        ruleId: 'compute-ledger-sql',
        step: 'load-parcels',
        item: 'compute-ledger-sql@SELECT 1',
      },
    ];

    const lines = formatPurityUnallowed(unallowed, findings);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/footgun\[compute-[a-z-]+\]: \S+\.js:\d+/);
    expect(lines[0]).not.toContain('undefined');
    expect(lines[0]).toContain('scripts/lib/compute/load-parcels.js:42');
    expect(lines[0]).toContain('purity rows are frozen');
  });

  it('(a2) falls back to `<step> <item>` when no finding matches the key', () => {
    const lines = formatPurityUnallowed([{ step: 'load-parcels', file: 'scripts/lib/compute/load-parcels.js', item: 'no-such-finding' }], []);
    expect(lines).toEqual(['load-parcels no-such-finding']);
  });

  it('(b) a purity row filed after the freeze is a problem', () => {
    const row = {
      gate: 'E',
      step: 'enrich-parcels',
      item: 'compute-ledger-sql@SELECT 1',
      disposition: 'pending_remediation',
      why: 'fixture',
      closing_brief: 'fixture',
      filed: '2026-10-12',
      adjudicated_by: 'operator',
    };
    const problems = purityRowFreeze([row]);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('enrich-parcels');
  });
});
