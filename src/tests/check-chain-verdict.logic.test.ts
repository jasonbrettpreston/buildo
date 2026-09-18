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
  classifyVerdictError: (err: unknown) => { transient: boolean; message: string };
  queryWithRetry: (
    pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    sql: string,
    params?: unknown[],
    opts?: { maxAttempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void>; log?: (msg: string) => void },
  ) => Promise<unknown>;
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

// ===========================================================================
// WF3 2026-09-18 — Peel 3 (cause D, Spec 118 §1.5/§4). `check-chain-verdict.js`
// treated a transient connection loss identically to a genuine verdict FAIL
// (run `32867150497`, 2026-08-25: "DB check failed for chain_deep_scrapes:
// Connection terminated unexpectedly" — the chain itself did NOT fail).
// `classifyVerdictError`/`queryWithRetry` are pure/injectable — no live DB needed.
// ===========================================================================

describe('check-chain-verdict.js — classifyVerdictError (Peel 3, cause D)', () => {
  it('classifies "Connection terminated unexpectedly" (the exact live message from run 32867150497) as transient', () => {
    const { transient } = checkChainVerdict.classifyVerdictError(new Error('Connection terminated unexpectedly'));
    expect(transient).toBe(true);
  });

  it('classifies ECONNRESET / ETIMEDOUT error codes as transient', () => {
    expect(checkChainVerdict.classifyVerdictError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })).transient).toBe(true);
    expect(checkChainVerdict.classifyVerdictError(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })).transient).toBe(true);
  });

  it('classifies a genuine query/schema error as NOT transient (e.g. a typo\'d column — must red on attempt 1, never retried)', () => {
    const { transient } = checkChainVerdict.classifyVerdictError(Object.assign(new Error('column "statuz" does not exist'), { code: '42703' }));
    expect(transient).toBe(false);
  });

  it('classifies a non-Error thrown value without crashing', () => {
    const { transient, message } = checkChainVerdict.classifyVerdictError('a bare string throw');
    expect(transient).toBe(false);
    expect(message).toBe('a bare string throw');
  });
});

describe('check-chain-verdict.js — queryWithRetry (Peel 3, cause D)', () => {
  const noSleep = () => Promise.resolve();

  it('RED-FIRST proof (pre-fix behaviour, reproduced directly against the OLD call shape): a bare pool.query with no retry throws on the FIRST transient error — this is exactly what made run 32867150497 red. queryWithRetry must NOT reproduce this.', async () => {
    let calls = 0;
    const pool = {
      query: async (_sql: string) => {
        calls++;
        throw new Error('Connection terminated unexpectedly');
      },
    };
    // The OLD shape (bare pool.query, no wrapper) — reds on attempt 1, proving the defect existed.
    await expect(pool.query('SELECT 1')).rejects.toThrow('Connection terminated unexpectedly');
    expect(calls).toBe(1);
  });

  it('(3.4a) two transient throws then success — queryWithRetry succeeds, never surfacing the transient error to the caller', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls++;
        if (calls <= 2) throw new Error('Connection terminated unexpectedly');
        return { rows: [{ id: 1, status: 'completed' }] };
      },
    };
    const res = await checkChainVerdict.queryWithRetry(pool, 'SELECT 1', [], { sleep: noSleep, log: () => {} }) as { rows: Array<{ id: number }> };
    expect(calls).toBe(3);
    expect(res.rows[0]!.id).toBe(1);
  });

  it('(3.4b) three transient throws (exhausting the default 3 attempts) — rethrows wrapped, message names "transient DB connectivity", distinct from a verdict FAIL', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls++;
        throw new Error('Connection terminated unexpectedly');
      },
    };
    await expect(
      checkChainVerdict.queryWithRetry(pool, 'SELECT 1', [], { sleep: noSleep, log: () => {} }),
    ).rejects.toThrow(/transient DB connectivity/);
    expect(calls, 'must attempt exactly maxAttempts (3) times, never more').toBe(3);
  });

  it('(3.4c, the anti-masking lock) a genuine verdict FAIL — a query that SUCCEEDS and returns a "failed" status row — is returned on attempt 1, unretried: queryWithRetry only ever intercepts a THROW, never inspects a successful result', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls++;
        return { rows: [{ id: 5021, status: 'completed_with_errors', records_meta: { step_verdicts: { inspections: 'FAIL' } } }] };
      },
    };
    const res = await checkChainVerdict.queryWithRetry(pool, 'SELECT 1', [], { sleep: noSleep, log: () => {} }) as { rows: Array<{ status: string }> };
    expect(calls, 'a successful query — however bad the row it returns — is never retried').toBe(1);
    const { ok, reason } = checkChainVerdict.classifyVerdict(res.rows[0] as never);
    expect(ok, 'the genuine verdict FAIL must still be reported as a FAIL — retry must never mask it').toBe(false);
    expect(reason).toContain('FAIL');
  });

  it('a non-transient error is never retried, even once — reds immediately with the ORIGINAL error, not a wrapped "transient" message', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls++;
        throw Object.assign(new Error('column "statuz" does not exist'), { code: '42703' });
      },
    };
    await expect(
      checkChainVerdict.queryWithRetry(pool, 'SELECT 1', [], { sleep: noSleep, log: () => {} }),
    ).rejects.toThrow('column "statuz" does not exist');
    expect(calls).toBe(1);
  });

  it('backoff delays are exponential off the base (200ms, 400ms) and sleep is invoked between attempts, not before the first', async () => {
    let calls = 0;
    const delays: number[] = [];
    const pool = {
      query: async () => {
        calls++;
        if (calls <= 2) throw new Error('Connection terminated unexpectedly');
        return { rows: [] };
      },
    };
    await checkChainVerdict.queryWithRetry(pool, 'SELECT 1', [], {
      sleep: (ms: number) => { delays.push(ms); return Promise.resolve(); },
      log: () => {},
    });
    expect(delays).toEqual([200, 400]);
  });
});
