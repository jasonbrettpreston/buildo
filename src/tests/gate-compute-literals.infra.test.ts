// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, §5 R-BA (gate E);
//            122_pipeline_step_optimization.md §5.5
//
// WF2 gate E — `scripts/analysis/gates/compute-literals.mjs`, fast invariant #32.
//
// The five-word standard's gate E draws every SQL INTERVAL/date literal,
// UPPER_SNAKE_CASE numeric constant, `violations:` non-zero comparison, and
// literal numeric SQL bound inside `scripts/lib/compute/**` from a CLOSED
// answer set: none at all, OR a `{gate:'E'}` ledger row keyed on
// `<rule-id>@<trimmed source line text>`. `scripts/hooks/check-step-shape.mjs`
// applies the SAME allowlist at commit time — only these 5 rule ids are ever
// filterable by a ledger row; every pre-existing compute-shape rule is not.
//
// T1/T2 re-run the module's own selfTest() both as a whole and via its direct
// assertions (Spec 121 §12b.6: a checker never proven to fire is not a check).
// T3/T4 are LIVE: the fleet's real findings are exactly the ledger's gate-E
// rows (0 orphans), landed 2026-09-26.

import { describe, it, expect } from 'vitest';
import * as gateE from '../../scripts/analysis/gates/compute-literals.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = process.cwd();

describe('gate E — no hard-coded compute literals (SQL INTERVAL/date, UPPER const, violations-compare, SQL bound)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => gateE.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — each of the 5 rule ids fires on the known-bad fixture (RED), and a
  // clean compute module fires 0 (GREEN).
  // -------------------------------------------------------------------------
  describe('T2: each rule id fires on the fixture; a clean compute fires 0', () => {
    it('T2a: all 5 gate-E rule ids fire on the known-bad fixture', () => {
      const findings = gateE.scanGateE([gateE.FIXTURE_FILE]);
      const seen = new Set(findings.map((f: { ruleId: string | undefined }) => f.ruleId));
      for (const ruleId of gateE.GATE_E_RULE_IDS) {
        expect(seen.has(ruleId), `rule "${ruleId}" did not fire on the fixture`).toBe(true);
      }
    });

    it('T2b: a clean compute module (assert-schema.js) yields 0 gate-E hits', () => {
      const findings = gateE.scanGateE(['scripts/lib/compute/assert-schema.js']);
      expect(findings).toEqual([]);
    });

    it('T2c: a finding with a matching ledger row is filtered (allowed), not reported', () => {
      const row = {
        gate: 'E', step: 'bad-compute-literals',
        item: 'compute-no-upper-numeric-const@const MAX_RETRY_COUNT = 5;',
        disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture',
        filed: '2026-09-26', adjudicated_by: 'operator',
      };
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], [row]);
      const stillReported = out.unallowed.filter((v: { item: string }) => v.item.startsWith('compute-no-upper-numeric-const@'));
      expect(stillReported).toEqual([]);
    });

    it('T2d: the fixture RED-fails with no ledger rows at all', () => {
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], []);
      expect(out.pass).toBe(false);
      expect(out.unallowed.length).toBeGreaterThan(0);
    });

    it('T2e: a ledger row with no matching finding is an ORPHAN (R-X closing-row posture)', () => {
      const row = {
        gate: 'E', step: 'bad-compute-literals',
        item: 'compute-no-upper-numeric-const@no such line exists anywhere',
        disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture',
        filed: '2026-09-26', adjudicated_by: 'operator',
      };
      const out = gateE.checkComputeLiterals([gateE.FIXTURE_FILE], [row]);
      expect(out.pass).toBe(false);
      expect(out.orphans.length).toBeGreaterThan(0);
    });

    it('T2f: old (pre-existing) rule ids are never filtered by a ledger row', () => {
      // compute-no-console is NOT in GATE_E_RULE_IDS — scanGateE drops it
      // entirely before matchLedger ever sees it, so no row could widen it.
      expect(gateE.GATE_E_RULE_IDS).not.toContain('compute-no-console');
      expect(gateE.GATE_E_RULE_IDS).not.toContain('compute-no-literal-threshold');
    });
  });

  // -------------------------------------------------------------------------
  // T3 — LIVE: the fleet's real gate-E findings are exactly the ledger's
  // gate-E rows, and there are zero orphans.
  // -------------------------------------------------------------------------
  it('T3: live — every compute-literal finding has a gate-E ledger row, and zero orphans', () => {
    const files = gateE.loadComputeFiles(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = gateE.checkComputeLiterals(files, rows, REPO_ROOT);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — the live scan actually finds something (a suite whose fleet scan
  // silently matches nothing proves nothing — Spec 121 §12b.6).
  // -------------------------------------------------------------------------
  it('T4: the live compute corpus has ≥1 real gate-E finding (all ledger-allowed)', () => {
    const files = gateE.loadComputeFiles(REPO_ROOT);
    const findings = gateE.scanGateE(files, REPO_ROOT);
    expect(findings.length).toBeGreaterThan(0);
  });
});
