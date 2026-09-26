// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (closed-response gates ledger); R-X closing-row posture
//
// WF2 commit 0/11 — `scripts/analysis/gates/ledger.mjs` +
// `scripts/steps/_schema/standard-gates-ledger.json`.
//
// The five-word standard (Spec 124 §5 R-BA) draws every gate answer from a
// CLOSED set. Where a conversion genuinely cannot meet the closed set yet, the
// violation is not waived by prose: it gets a reviewed-diff ROW in ONE file, the
// orchestrator-owned ledger (the `grandfathered.json` / `write-class-disposition.json`
// posture, R-BA). Two directions matter and both are proven here:
//
//   (a) GREEN — a well-formed row that matches a live violation is `allowed`.
//   (b) RED — a violation with NO row is `unallowed`; a row whose violation has
//       since been fixed is an ORPHAN, and an orphan is RED (R-X closing-row
//       posture: the remediation commit deletes its own row — a row is never
//       allowed to outlive the violation it excuses, or the ledger silently
//       becomes permanent permission).
//
// T2 re-asserts each of `ledger.mjs`'s own `selfTest()` RED fixtures directly,
// so the module's internal self-test cannot rot into a pass-with-no-assertions
// (Spec 121 §12b.6 — a checker never proven to fire is not a check).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// In-memory fixtures — the exact shapes selfTest() exercises, restated here so
// this suite owns an independent copy of every RED direction (T2) and does not
// merely re-invoke the module's own opinion of what RED means.
// ---------------------------------------------------------------------------

const SPEC_124_REL = 'docs/specs/01-pipeline/124_step_standard_policy.md';
// A literal substring that IS in Spec 124 today (verified by T2c's own GREEN
// arm, which fails if this exact sentence stops being present) and one that is
// not (the rotted-citation arm).
const SPEC_124_ANCHOR = '**8. A write target\'s discipline class, guard, and scope are declared per write target — never assumed for the whole step.**';
const ABSENT_ANCHOR = 'this anchor text does not appear in Spec 124 at all';

const pendingRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'A',
  step: 'link_neighbourhoods',
  item: 'checks[neighbourhoods_loaded] limit',
  disposition: 'pending_remediation',
  why: 'folded into the batch-2 remediation roster; measured, dated, not waived.',
  closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row 1 (closed bounds)',
  filed: '2026-09-25',
  adjudicated_by: 'operator 2026-09-25',
  ...over,
});

const permanentRow = (anchor: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'E',
  step: 'compute_centroids',
  item: 'compute literal `ST_Transform(..., 4326)`',
  disposition: 'coordinate_reference',
  why: 'EPSG:4326 is the registry CRS, not a tunable — a scalar variable would be a lie.',
  spec_ref: SPEC_124_REL,
  anchor,
  filed: '2026-09-25',
  adjudicated_by: 'operator 2026-09-25',
  ...over,
});

function tmpDirWith(content: string, name = 'standard-gates-ledger.json'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ledger-'));
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return dir;
}

describe('standard-gates ledger (R-BA)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => ledger.selfTest()).not.toThrow();
  });

  it('T1b: GATES and DISPOSITIONS are the closed sets R-BA names', () => {
    expect(ledger.GATES).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'K']);
    expect(ledger.DISPOSITIONS.permanent).toEqual([
      'non_tunable',
      'physical_constant',
      'unit_conversion',
      'coordinate_reference',
    ]);
    expect(ledger.DISPOSITIONS.pending).toEqual(['pending_remediation', 'pending_recapture']);
  });

  // -------------------------------------------------------------------------
  // T2 — every RED fixture selfTest() relies on, asserted DIRECTLY. If the
  // module's self-test silently stopped checking one of these, this suite is
  // red on its own, not merely trusting the module's pass.
  // -------------------------------------------------------------------------
  describe('T2: RED directions proven by direct assertion', () => {
    it('T2a: a valid pending row has 0 problems', () => {
      expect(ledger.validateRow(pendingRow())).toEqual([]);
    });

    it('T2b: a permanent row whose anchor is absent is a problem naming `anchor`', () => {
      const problems = ledger.validateRow(permanentRow(ABSENT_ANCHOR));
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' | ')).toMatch(/anchor/);
    });

    it('T2c: a permanent row whose anchor IS literally present is GREEN', () => {
      expect(ledger.validateRow(permanentRow(SPEC_124_ANCHOR))).toEqual([]);
    });

    it('T2d: disposition `maybe` (outside the closed menu) is a problem', () => {
      const problems = ledger.validateRow(pendingRow({ disposition: 'maybe' }));
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' | ')).toMatch(/disposition/);
    });

    it('T2e: an unknown key `note` is a problem (closed shape)', () => {
      const problems = ledger.validateRow(pendingRow({ note: 'extra prose smuggled in' }));
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' | ')).toMatch(/note/);
    });

    it('T2f: a permanent row with no spec_ref is a problem', () => {
      const row = permanentRow(SPEC_124_ANCHOR);
      delete row.spec_ref;
      const problems = ledger.validateRow(row);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' | ')).toMatch(/spec_ref/);
    });

    it('T2g: a permanent row with a spec_ref outside docs/specs/ is a problem', () => {
      const problems = ledger.validateRow(permanentRow(SPEC_124_ANCHOR, { spec_ref: 'CLAUDE.md' }));
      expect(problems.join(' | ')).toMatch(/docs\/specs\//);
    });

    it('T2h: a permanent row with a spec_ref that does not exist is a problem', () => {
      const problems = ledger.validateRow(
        permanentRow(SPEC_124_ANCHOR, { spec_ref: 'docs/specs/01-pipeline/999999_nope.md' }),
      );
      expect(problems.join(' | ')).toMatch(/does not resolve/);
    });

    it('T2i: a pending row with no closing_brief is a problem', () => {
      const row = pendingRow();
      delete row.closing_brief;
      const problems = ledger.validateRow(row);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' | ')).toMatch(/closing_brief/);
    });

    it('T2j: a non-ISO `filed` date is a problem', () => {
      const problems = ledger.validateRow(pendingRow({ filed: '25/09/2026' }));
      expect(problems.join(' | ')).toMatch(/filed/);
    });

    it('T2k: an out-of-menu gate letter is a problem', () => {
      const problems = ledger.validateRow(pendingRow({ gate: 'Z' }));
      expect(problems.join(' | ')).toMatch(/gate/);
    });

    it('T2l: matchLedger — one violation, no row => unallowed 1, allowed 0', () => {
      const out = ledger.matchLedger('A', [{ step: 'link_neighbourhoods', item: 'x' }], []);
      expect(out.unallowed).toHaveLength(1);
      expect(out.allowed).toHaveLength(0);
      expect(out.orphans).toHaveLength(0);
    });

    it('T2m: matchLedger — a row with no violation => orphans 1 (RED, R-X closing posture)', () => {
      const out = ledger.matchLedger('A', [], [pendingRow()]);
      expect(out.orphans).toHaveLength(1);
      expect(out.unallowed).toHaveLength(0);
    });

    it('T2n: matchLedger — row + matching violation => allowed 1, orphans 0, unallowed 0', () => {
      const out = ledger.matchLedger(
        'A',
        [{ step: 'link_neighbourhoods', item: 'checks[neighbourhoods_loaded] limit' }],
        [pendingRow()],
      );
      expect(out.allowed).toHaveLength(1);
      expect(out.orphans).toHaveLength(0);
      expect(out.unallowed).toHaveLength(0);
    });

    it('T2o: matchLedger — a row for ANOTHER gate is not an orphan of this gate', () => {
      const out = ledger.matchLedger('B', [], [pendingRow()]);
      expect(out.orphans).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // T3 — the LIVE ledger: every committed row validates, and the contract
  // version is the one this module reads.
  // -------------------------------------------------------------------------
  it('T3: the live ledger parses, is contract_version 1, and every row validates', () => {
    const live = ledger.loadLedger(REPO_ROOT);
    expect(live.contract_version).toBe(1);
    expect(Array.isArray(live.rows)).toBe(true);

    const problems: string[] = [];
    live.rows.forEach((row: Record<string, unknown>, i: number) => {
      const p = ledger.validateRow(row, { repoRoot: REPO_ROOT });
      if (p.length) problems.push(`rows[${i}]: ${p.join('; ')}`);
    });
    expect(problems).toEqual([]);
  });

  it('T3b: the live ledger file exists at the path the module names', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, ledger.LEDGER_REL_PATH))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — malformed JSON is a THROW naming the path, never a silent `[]`.
  // -------------------------------------------------------------------------
  it('T4: malformed JSON throws, naming the ledger path', () => {
    const dir = tmpDirWith('{ "contract_version": 1, "rows": [ ');
    let err: Error | null = null;
    try {
      ledger.loadLedger(dir);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message).toContain('standard-gates-ledger.json');
  });

  it('T4b: a missing ledger throws, naming the ledger path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ledger-empty-'));
    let err: Error | null = null;
    try {
      ledger.loadLedger(dir);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message).toContain('standard-gates-ledger.json');
  });
});
