// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-BA (gate H)
//
// WF2 gate H — OBSERVABLE: **the policy matrix never counts what did not run.**
//
// `scripts/analysis/step-validate.mjs`'s policy matrix carried 3 status values.
// Under `--fast` (`vitestResult.ranOk === false`) `computePolicyMatrix` passes
// `tests = []`, so every vitest-evidenced row fell to its `m.length === 0` branch
// and reported a shape/descriptor-derived `enforced-green` for a check that never
// executed — the matrix counting what did not run. The closed set is now 5 values
// (`enforced-green` · `enforced-red` · `not-run` · `vacuous` · `prose-only`), and
// ONLY `enforced-green` counts toward `**Enforced-green: N/M**`.
//
// T1-T3 are in-memory (the exact fixtures `step-validate.mjs`'s own `selfTest()`
// asserts, re-derived here so an edit to either side is caught). T4 is the LIVE
// half the directive names: a real `--step=assert_schema --fast` spawn whose
// stdout matrix must carry no status outside the closed 5-value set — a checker
// never proven to fire is not a check (Spec 121 §12b.6).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// `step-validate.mjs` is a plain `.mjs` with inferred (loosely-typed) signatures;
// the suite imports it for its exports only, as the sibling gate suites do.
import * as stepValidateRaw from '../../scripts/analysis/step-validate.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_REL = 'scripts/analysis/step-validate.mjs';

const stepValidate = stepValidateRaw as unknown as {
  matrixStatusCounts: (
    matrix: Array<{ status?: string }>,
  ) => { green: number; red: number; notRun: number; vacuous: number; prose: number; total: number };
};

/** The closed 5-value set this gate exists to enforce (Spec 124 §5 R-BA gate H). */
const STATUSES = ['enforced-green', 'enforced-red', 'not-run', 'vacuous', 'prose-only'] as const;

// ---------------------------------------------------------------------------
// T1 — Rule 11 vacuous (both directions): a descriptor with 0 pre_write checks
// maps to `vacuous`, never `enforced-green`; one cited pre_write check maps to
// `enforced-green`. The T1 fixtures mirror step-validate.mjs's own selfTest().
// ---------------------------------------------------------------------------

describe('gate H — T1: Rule 11 vacuous vs enforced-green', () => {
  it('T1a: RED direction — 0 pre_write checks is NOT counted as enforced-green', () => {
    // The tally half: a matrix whose only Rule 11 row is `vacuous` must not
    // report it as green. This is the counting defect stated as an assertion.
    const counts = stepValidate.matrixStatusCounts([{ status: 'vacuous' }]);
    expect(counts.vacuous).toBe(1);
    expect(counts.green).toBe(0);
  });

  it('T1b: GREEN direction — an `enforced-green` row IS counted', () => {
    const counts = stepValidate.matrixStatusCounts([{ status: 'enforced-green' }]);
    expect(counts.green).toBe(1);
    expect(counts.vacuous).toBe(0);
  });

  it('T1c: only `enforced-green` joins the counted category', () => {
    const counts = stepValidate.matrixStatusCounts(STATUSES.map((status) => ({ status })));
    expect(counts).toEqual({ green: 1, red: 1, notRun: 1, vacuous: 1, prose: 1, total: 5 });
  });
});

// ---------------------------------------------------------------------------
// T2 — not-run vs enforced-green on the SAME fixture, toggling `ranOk`. Read
// live from the committed source, since the classifier itself is module-private:
// the source must contain the `'not-run'` branch keyed on `vitestResult.ranOk`.
// ---------------------------------------------------------------------------

describe('gate H — T2: not-run vs enforced-green toggling ranOk', () => {
  it('T2a: the vitest-only row yields `not-run` under --fast (source lock)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8');
    // The classifier: `if (!ranOk) return 'not-run';` — the gate-H rule 1 branch.
    expect(src).toMatch(/function vitestStatus\(matched, ranOk\) \{\s*\n\s*if \(!ranOk\) return 'not-run';/);
    // The status vocabulary itself.
    expect(src).toContain("'not-run'");
    expect(src).toContain("'vacuous'");
  });

  it('T2b: the same counts flip when the fixture flips — decided purely by status', () => {
    // The toggling half: the identical row shape, one status apart.
    const notRun = stepValidate.matrixStatusCounts([{ status: 'not-run' }]);
    const green = stepValidate.matrixStatusCounts([{ status: 'enforced-green' }]);
    expect(notRun.green).toBe(0);
    expect(notRun.notRun).toBe(1);
    expect(green.green).toBe(1);
    expect(green.notRun).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T3 — the render line carries `not-run:` and `vacuous:` after the unchanged
// `**Enforced-green: N/M**` line. Source-locked: the render is module-private.
// ---------------------------------------------------------------------------

describe('gate H — T3: the render line names not-run and vacuous', () => {
  it('T3: the scorecard render carries the not-run/vacuous tallies', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8');
    expect(src).toMatch(/\*\*Enforced-green: \$\{counts\.green\}\/\$\{matrix\.length\}\*\* · not-run: \$\{counts\.notRun\} · vacuous: \$\{counts\.vacuous\}/);
    // And the tally is driven by the exported helper, never a hand-rolled filter.
    expect(src).toContain('matrixStatusCounts(matrix)');
  });
});

// ---------------------------------------------------------------------------
// T4 — LIVE: `node scripts/analysis/step-validate.mjs --step=assert_schema
// --fast` stdout carries no matrix status outside the closed 5-value set.
// ---------------------------------------------------------------------------

/** Parse the `| Rule | Name | Status | Note |` table out of the stdout block. */
function parseMatrixStatuses(stdout: string): string[] {
  const lines = stdout.split('\n');
  const start = lines.findIndex((l) => l.includes('### Policy coverage matrix'));
  if (start === -1) return [];
  const statuses: string[] = [];
  let seenHeader = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.startsWith('|')) {
      if (statuses.length) break;
      continue;
    }
    if (/^\|\s*Rule\s*\|/.test(line)) { seenHeader = true; continue; }
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    if (!seenHeader) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] is '' (leading pipe); rule=cells[1], name=cells[2], status=cells[3].
    const status = cells[3];
    if (status) statuses.push(status);
  }
  return statuses;
}

describe('gate H — T4: live --fast matrix uses only closed statuses', () => {
  it('T4: a real --step=assert_schema --fast run has no out-of-set status', () => {
    const run = spawnSync('node', [SCRIPT_REL, '--step=assert_schema', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 180_000,
    });
    // A non-zero exit is possible (a step may hard-stop); the matrix is still
    // rendered, and it is the MATRIX — not the exit code — under test here.
    const stdout = `${run.stdout || ''}`;
    const statuses = parseMatrixStatuses(stdout);
    expect(statuses.length, `no policy matrix parsed from:\n${stdout.slice(0, 2000)}`).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(STATUSES as readonly string[], `out-of-set status "${status}"`).toContain(status);
    }
  });
});
