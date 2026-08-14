// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
//
// Parse-smoke + pure-logic test for scripts/check-chain-verdict.js — the
// post-run verdict reader that closes the aic-orchestrator.py exit-0-on-
// scrape-failure masking gap (Integration HIGH-2). Exercises only the pure
// classifyVerdict helper; the DB-querying run() path connects via
// SUPABASE_DATABASE_URL — not exercised here without a live DB (mirrors
// check-chain-running.logic.test.ts's / restore-db.logic.test.ts's
// pure-logic-only scope).

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainVerdict = require('../../scripts/check-chain-verdict.js') as {
  classifyVerdict: (row: { id?: number; status: string; records_meta: Record<string, unknown> | null } | undefined) => { ok: boolean; reason: string };
  checkDurationTripwire: (
    row: { id?: number; status: string; records_meta: Record<string, unknown> | null; started_at?: string | Date | null; completed_at?: string | Date | null } | undefined,
    budgetMinutes: number,
  ) => { durationMinutes: number; budgetMinutes: number; thresholdMinutes: number; message: string } | null;
  OK_STATUSES: Set<string>;
};

describe('check-chain-verdict.js — script presence', () => {
  it('exists in scripts/ directory', () => {
    const scriptPath = require.resolve('../../scripts/check-chain-verdict.js');
    expect(scriptPath).toMatch(/check-chain-verdict\.js$/);
  });

  it('exports classifyVerdict, OK_STATUSES, and run', () => {
    // Deliberate lock RETIREMENT (Pipeline Rehab P3, 2026-08-03): the
    // FAIL_STATUSES denylist export is gone — `pipeline_runs.status` is
    // unconstrained TEXT (mig 033, no CHECK), so a denylist is unprovable;
    // the script now exports the green ALLOWLIST instead.
    expect(typeof checkChainVerdict.classifyVerdict).toBe('function');
    expect(checkChainVerdict.OK_STATUSES instanceof Set).toBe(true);
  });
});

describe('check-chain-verdict.js — classifyVerdict', () => {
  it('passes a clean "completed" status with no step_verdicts', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 1,
      status: 'completed',
      records_meta: null,
    });
    expect(ok).toBe(true);
    expect(reason).toContain('status=completed');
  });

  it('passes "completed_with_warnings" — a WARN verdict is not a workflow failure', () => {
    const { ok } = checkChainVerdict.classifyVerdict({
      id: 2,
      status: 'completed_with_warnings',
      records_meta: { step_verdicts: { assert_data_bounds: 'WARN' } },
    });
    expect(ok).toBe(true);
  });

  it('fails "failed" status', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 3,
      status: 'failed',
      records_meta: null,
    });
    expect(ok).toBe(false);
    expect(reason).toContain('status=failed');
  });

  it('fails "completed_with_errors" status — the exit-0 masking case', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 4,
      status: 'completed_with_errors',
      records_meta: { step_verdicts: { inspections: 'FAIL' } },
    });
    expect(ok).toBe(false);
    expect(reason).toContain('status=completed_with_errors');
    expect(reason).toContain('FAIL');
  });

  it('fails on a FAIL step_verdict even if status somehow reads "completed" (belt-and-suspenders)', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 5,
      status: 'completed',
      records_meta: { step_verdicts: { assert_network_health: 'FAIL' } },
    });
    expect(ok).toBe(false);
    expect(reason).toContain('step_verdicts');
  });

  it('fails when no row is found at all', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict(undefined);
    expect(ok).toBe(false);
    expect(reason).toBe('no pipeline_runs row found');
  });

  // Deliberate lock RETIREMENT (Pipeline Rehab P3, 2026-08-03): the previous
  // lock here pinned FAIL_STATUSES = {failed, completed_with_errors} — a
  // denylist that classified THREE live orphaned `running` rows (ids
  // 1756/2045/2097, GH step-timeout kills) as green. The allowlist below is
  // the replacement contract.
  it('OK_STATUSES contains exactly completed, completed_with_warnings, and deferred_to_full (green allowlist, B2)', () => {
    expect([...checkChainVerdict.OK_STATUSES].sort()).toEqual(
      ['completed', 'completed_with_warnings', 'deferred_to_full'].sort(),
    );
  });

  it('fails status="running" — an orphaned row from a killed chain must never read green (live false-GREEN, 2026-08-03)', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 2097,
      status: 'running',
      records_meta: null,
    });
    expect(ok).toBe(false);
    expect(reason).toContain('running');
  });

  it('fails status="cancelled" — a cancelled run is not a pass (second denylist hole)', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 6,
      status: 'cancelled',
      records_meta: null,
    });
    expect(ok).toBe(false);
    expect(reason).toContain('cancelled');
  });

  it('fails an unknown/novel status — status is unconstrained TEXT (mig 033), only the allowlist is provable', () => {
    const { ok } = checkChainVerdict.classifyVerdict({
      id: 7,
      status: 'some_future_status',
      records_meta: null,
    });
    expect(ok).toBe(false);
  });

  it('fails "completed_with_errors" even when step_verdicts is ABSENT entirely (records_meta contract: keys may be missing)', () => {
    const { ok, reason } = checkChainVerdict.classifyVerdict({
      id: 8,
      status: 'completed_with_errors',
      records_meta: {},
    });
    expect(ok).toBe(false);
    expect(reason).toContain('completed_with_errors');
  });

  // KNOWING, test-pinned behavior (P3): the script reads the latest row by
  // started_at — a concurrent manual dispatch's `running` row therefore
  // reddens a scheduled run's verdict check. Accepted: a red that makes an
  // operator look is strictly better than the false-green it replaces.
  it('pins the knowing behavior: a concurrent run\'s "running" row reddens the check (latest-row-by-started_at)', () => {
    const { ok } = checkChainVerdict.classifyVerdict({
      id: 9,
      status: 'running',
      records_meta: { step_verdicts: {} },
    });
    expect(ok).toBe(false);
  });
});

describe('check-chain-verdict.js — duration tripwire (P1, Pipeline Rehab 2026-08-03)', () => {
  // The 120-min permits step ceiling is UNVALIDATED headroom (no completed run
  // >90 min exists) — the tripwire warns at >80% of the budget so duration
  // creep is visible BEFORE the next step-timeout kill, instead of after it.
  const row = (startedAt: string, completedAt: string) => ({
    id: 9,
    status: 'completed',
    records_meta: null,
    started_at: startedAt,
    completed_at: completedAt,
  });

  it('fires when chain duration exceeds 80% of the budget (100 of 120 min)', () => {
    const res = checkChainVerdict.checkDurationTripwire(
      row('2026-08-03T00:00:00Z', '2026-08-03T01:40:00Z'),
      120,
    );
    expect(res).not.toBeNull();
    expect(res!.durationMinutes).toBeCloseTo(100, 5);
    expect(res!.budgetMinutes).toBe(120);
    expect(res!.thresholdMinutes).toBeCloseTo(96, 5);
    // Self-documenting: the message names the live duration, the budget, and
    // the 80% threshold so the annotation is actionable without reading code.
    expect(res!.message).toContain('100');
    expect(res!.message).toContain('120');
    expect(res!.message).toContain('96');
  });

  it('stays silent at or below 80% of the budget (90 of 120 min)', () => {
    const res = checkChainVerdict.checkDurationTripwire(
      row('2026-08-03T00:00:00Z', '2026-08-03T01:30:00Z'),
      120,
    );
    expect(res).toBeNull();
  });

  it('stays silent when the budget is missing/invalid or timestamps are absent', () => {
    expect(checkChainVerdict.checkDurationTripwire(row('2026-08-03T00:00:00Z', '2026-08-03T01:40:00Z'), NaN)).toBeNull();
    expect(checkChainVerdict.checkDurationTripwire(row('2026-08-03T00:00:00Z', '2026-08-03T01:40:00Z'), 0)).toBeNull();
    expect(
      checkChainVerdict.checkDurationTripwire(
        { id: 9, status: 'completed', records_meta: null, started_at: '2026-08-03T00:00:00Z', completed_at: null },
        120,
      ),
    ).toBeNull();
    expect(checkChainVerdict.checkDurationTripwire(undefined, 120)).toBeNull();
  });

  it('run() wires the tripwire: budget from CHAIN_DURATION_BUDGET_MINUTES env, emitted as a ::warning annotation (never a failure)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../scripts/check-chain-verdict.js'), 'utf-8');
    expect(src).toMatch(/CHAIN_DURATION_BUDGET_MINUTES/);
    expect(src).toMatch(/::warning title=Chain duration tripwire::/);
  });
});

describe('check-chain-verdict.js — source-scan invariants (F8 fold 2026-07-20)', () => {
  const source = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    return fs.readFileSync(path.resolve(__dirname, '../../scripts/check-chain-verdict.js'), 'utf-8');
  };

  it('gates dotenv.config() behind !GITHUB_ACTIONS (CLI hygiene)', () => {
    expect(source()).toMatch(/if\s*\(\s*!process\.env\.GITHUB_ACTIONS\s*\)\s*require\(['"]dotenv['"]\)\.config\(\)/);
  });

  it('uses ::error GitHub Actions annotations for the missing-env, FAIL-verdict, and DB-error branches (annotation consistency)', () => {
    const src = source();
    expect(src).toMatch(/::error title=Chain verdict check::SUPABASE_DATABASE_URL is not set/);
    expect(src).toMatch(/::error title=Chain verdict check::\$\{chainSlug\} verdict is a FAIL/);
    expect(src).toMatch(/::error title=Chain verdict check::DB check failed/);
  });
});
