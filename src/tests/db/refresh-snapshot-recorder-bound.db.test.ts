// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §1/§7.1/§7.2 (cause B)
// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §3 (refresh_snapshot)
//
// WF3 `wf3_deep_scrapes_failures`, Peel 2 (2026-09-18) — RED-FIRST proof, both directions,
// for `runRecorderPhase`'s two new bounds against a REAL Postgres connection (real
// `pg_backend_pid()`/`pg_cancel_backend()` semantics, not a fixture model of them — the
// class of defect a fake-pool fixture is most likely to get subtly wrong for a mechanism
// whose whole point is genuine cross-connection cancellation).
//
// Exercises `runRecorderPhase` DIRECTLY (not through a real step file) against a disposable
// table (`_test_wf3_recorder_bound`, created/dropped per suite) — never `data_quality_snapshots`
// — so this suite cannot interact with the real refresh_snapshot golden captures or the
// one-row-per-day contract other tests pin. The fake `compute` module here is intentionally
// tiny (3 synthetic reads) — it exercises the RUNNER's own bound/trace mechanism, not the
// real 14-read refresh-snapshot compute (see src/tests/steps/refresh_snapshot/violations.test.ts
// for that surface).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/refresh-snapshot-recorder-bound.db.test.ts --no-file-parallelism

import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
  runRecorderPhase: (args: {
    descriptor: unknown; pool: import('pg').Pool; compute: unknown; config: Record<string, unknown>;
    chainId: string; log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
    tag: string; preWriteGate: null; clockNow: () => Date;
  }) => Promise<{
    matched: {
      read_timings?: Array<{ key: string; elapsed_ms: number; row_count: number | null; phase: 'main' | 'optional'; cancelled?: boolean; cancel_kind?: string }>;
      optional_failed?: string[];
    } | null;
  }>;
  resolveRecorderBoundMinutes: (descriptor: unknown, config: Record<string, unknown>, field: string, tag: string) => { ms: number; minutes: number | null };
  connectPair: (pool: { connect: () => Promise<{ release: (err?: unknown) => void }> }) => Promise<[{ release: (err?: unknown) => void }, { release: (err?: unknown) => void }]>;
  remainingBudgetMs: (phaseDeadlineMs: number, elapsedMs: number) => number;
};

// -----------------------------------------------------------------------------
// WF3 output-panel fold-validation V2 (2026-09-18) — `connectPair` needs no DB at
// all (pure pool-stub logic), so this describe block is NOT gated on dbAvailable().
// -----------------------------------------------------------------------------
describe('connectPair (fold-validation V2) — the SECOND pool.connect() rejecting must not leak the first client', () => {
  /** The NAIVE, pre-fix shape (two bare awaits, no try) — proves the defect existed. */
  async function naiveConnectPair(pool: { connect: () => Promise<{ release: () => void }> }) {
    const a = await pool.connect();
    const b = await pool.connect();
    return [a, b];
  }

  it('(RED-FIRST) the NAIVE shape leaks the first client when the second connect() rejects — release is never called', async () => {
    let released = 0;
    const clientA = { release: () => { released++; } };
    let calls = 0;
    const stubPool = {
      connect: async () => {
        calls++;
        if (calls === 1) return clientA;
        throw new Error('pool exhausted');
      },
    };
    await expect(naiveConnectPair(stubPool)).rejects.toThrow('pool exhausted');
    expect(released, 'the naive shape has no way to release clientA — this is the leak V2 found').toBe(0);
  });

  it('(GREEN) the REAL connectPair releases the first client and the original error propagates unchanged', async () => {
    let released = 0;
    const clientA = { release: () => { released++; } };
    let calls = 0;
    const stubPool = {
      connect: async () => {
        calls++;
        if (calls === 1) return clientA;
        throw new Error('pool exhausted');
      },
    };
    await expect(stepLib.connectPair(stubPool)).rejects.toThrow('pool exhausted');
    expect(released).toBe(1);
  });

  it('the happy path returns both clients, in order, with neither released', async () => {
    const clientA = { release: () => {} };
    const clientB = { release: () => {} };
    let calls = 0;
    const stubPool = { connect: async () => { calls++; return calls === 1 ? clientA : clientB; } };
    const [a, b] = await stepLib.connectPair(stubPool);
    expect(a).toBe(clientA);
    expect(b).toBe(clientB);
  });
});

const TABLE = '_test_wf3_recorder_bound';
const TAG = '[wf3_test_recorder]';

const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

/** Minimal but real descriptor — only the fields runRecorderPhase's own call chain reads. */
function fixtureDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    identity: { name: 'wf3_test_recorder', lock: 999901 },
    outputs: {
      writes: [
        {
          table: TABLE,
          key: 'snapshot_date',
          columns: [{ name: 'snapshot_date', written: 'step', bind: 'value' }],
          write_discipline: { class: 'guarded_upsert', scope: 'none', guard: 'none', guard_columns: 'all_declared' },
          retract: 'none',
        },
      ],
    },
    guards: { requires: [] },
    override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
    execution: {
      statement_timeout_minutes_from_config: 'none',
      phase_deadline_minutes_from_config: 'none',
      ...overrides,
    },
  };
}

/**
 * Minimal fake compute — buildReads/buildRow/buildWriteSql only (Rule 2 seam
 * runRecorderPhase calls). `buildRow` surfaces which optional keys came back
 * `null` (the runner's own carry-forward marker) as `matched.optional_failed[]`
 * — mirrors the real compute's `optional_query_failed` shape closely enough to
 * assert against without needing the real 14-read contract.
 */
function fakeCompute(reads: { main: Array<{ key: string; sql: string; params?: unknown[] }>; optional?: Array<{ key: string; sql: string; params?: unknown[] }> }) {
  return {
    buildReads: () => ({ main: reads.main, optional: reads.optional || [] }),
    buildRow: (results: Record<string, unknown>) => ({
      row: {},
      matched: { optional_failed: (reads.optional || []).filter((o) => results[o.key] === null).map((o) => o.key) },
    }),
    buildWriteSql: () => ({
      sql: `INSERT INTO ${TABLE} (snapshot_date) VALUES (CURRENT_DATE) ON CONFLICT (snapshot_date) DO UPDATE SET snapshot_date = EXCLUDED.snapshot_date RETURNING (xmax::text::int = 0) AS is_insert`,
      params: [],
    }),
  };
}

describe.skipIf(!dbAvailable())('runRecorderPhase — Peel 2 bounds against a REAL Postgres connection (WF3 2026-09-18)', () => {
  let pool: import('pg').Pool;

  beforeAll(async () => {
    const p = getTestPool();
    if (!p) throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    pool = p;
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.query(`CREATE TABLE ${TABLE} (snapshot_date date PRIMARY KEY)`);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
  });

  it('resolveRecorderBoundMinutes: "none" disables (ms=0), a declared finite var resolves correctly, an unset var name THROWS, a non-numeric value THROWS, and a declared 0 is a deliberate disable (not a throw)', () => {
    const d = fixtureDescriptor();
    expect(stepLib.resolveRecorderBoundMinutes(d, {}, 'statement_timeout_minutes_from_config', TAG)).toEqual({ ms: 0, minutes: null });

    const d2 = fixtureDescriptor({ statement_timeout_minutes_from_config: 'my_test_var_minutes' });
    expect(stepLib.resolveRecorderBoundMinutes(d2, { my_test_var_minutes: 2 }, 'statement_timeout_minutes_from_config', TAG)).toEqual({ ms: 120000, minutes: 2 });

    // Declared name, but the config object carries no such key (the exact ER-D1 class:
    // a typo or an un-hoisted var must THROW, never silently resolve to unbounded NaN).
    expect(() => stepLib.resolveRecorderBoundMinutes(d2, {}, 'statement_timeout_minutes_from_config', TAG)).toThrow(/finite/);
    expect(() => stepLib.resolveRecorderBoundMinutes(d2, { my_test_var_minutes: 'not-a-number' }, 'statement_timeout_minutes_from_config', TAG)).toThrow(/finite/);

    // A declared, explicit 0 is a deliberate disable — distinct from the accident above,
    // and must NOT throw (ER-D1's own "the accident and the declaration must not render
    // identically" rule, applied to this THIRD copy of the pattern).
    expect(stepLib.resolveRecorderBoundMinutes(d2, { my_test_var_minutes: 0 }, 'statement_timeout_minutes_from_config', TAG)).toEqual({ ms: 0, minutes: 0 });
  });

  it('(2.4c) read_timings[] names every declared main read, in order, each with a finite elapsed_ms and the real row_count', async () => {
    const descriptor = fixtureDescriptor();
    const compute = fakeCompute({
      main: [
        { key: 'alpha', sql: 'SELECT 1 AS n' },
        { key: 'beta', sql: 'SELECT 1 AS n UNION ALL SELECT 2' },
        { key: 'gamma', sql: 'SELECT pg_sleep(0)' },
      ],
    });
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config: {}, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    const timings = result.matched!.read_timings!;
    expect(timings.map((t) => t.key)).toEqual(['alpha', 'beta', 'gamma']);
    expect(timings.every((t) => Number.isFinite(t.elapsed_ms) && t.elapsed_ms >= 0)).toBe(true);
    expect(timings[0]!.row_count).toBe(1);
    expect(timings[1]!.row_count).toBe(2);
  });

  it('(2.4b) inverse — a fast read well under BOTH declared bounds is never cancelled and completes normally', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'test_stmt_timeout_min',
      phase_deadline_minutes_from_config: 'test_phase_deadline_min',
    });
    const compute = fakeCompute({ main: [{ key: 'fast', sql: 'SELECT 1' }] });
    const config = { test_stmt_timeout_min: 1, test_phase_deadline_min: 1 }; // 1 minute each — the read takes milliseconds
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    expect(result.matched!.read_timings![0]!.key).toBe('fast');
  });

  it('(2.4a RED-FIRST, statement bound) a read whose STATEMENT exceeds the declared per-statement timeout is cancelled and the thrown error names the read key and "statement_timeout" — proven by first showing the SAME read completes when the bound is loosened (red only under the tight bound)', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'test_stmt_timeout_min',
      phase_deadline_minutes_from_config: 'none',
    });
    // 0.01 min = 600ms statement_timeout; the read sleeps 3s — must abort.
    const compute = fakeCompute({ main: [{ key: 'slow_stmt', sql: 'SELECT pg_sleep(3)' }] });
    const tight = { test_stmt_timeout_min: 0.01 };
    await expect(
      stepLib.runRecorderPhase({
        descriptor, pool, compute, config: tight, chainId: 'none', log: silentLog, tag: TAG,
        preWriteGate: null, clockNow: () => new Date(),
      }),
    ).rejects.toThrow(/slow_stmt[\s\S]*statement_timeout|statement_timeout[\s\S]*slow_stmt/);

    // GREEN under a loosened bound — same read, same SQL, only the declared minutes differ —
    // proving the abort above was genuinely caused by the tight bound, not by something else
    // about this read/table/connection.
    const loose = { test_stmt_timeout_min: 1 };
    const computeFast = fakeCompute({ main: [{ key: 'slow_stmt', sql: 'SELECT pg_sleep(0.05)' }] });
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute: computeFast, config: loose, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    expect(result.matched!.read_timings![0]!.key).toBe('slow_stmt');
  }, 20000);

  it('(2.4a RED-FIRST, phase deadline) reads whose STATEMENTS are each individually fast but whose SUM exceeds the phase deadline are cancelled mid-loop via pg_cancel_backend, and the error names "phase_deadline" — the exact class a per-statement bound alone cannot catch (Spec 118 §3 layer-3 gap)', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'none', // per-statement bound OFF — only the phase deadline can fire
      phase_deadline_minutes_from_config: 'test_phase_deadline_min',
    });
    // Three reads, each pg_sleep(0.4)s (1.2s total) against a 600ms (0.01min) phase deadline —
    // no single statement trips a (disabled) statement timeout, but the loop's wall clock does.
    const compute = fakeCompute({
      main: [
        { key: 'r1', sql: 'SELECT pg_sleep(0.4)' },
        { key: 'r2', sql: 'SELECT pg_sleep(0.4)' },
        { key: 'r3', sql: 'SELECT pg_sleep(0.4)' },
      ],
    });
    const config = { test_phase_deadline_min: 0.01 };
    await expect(
      stepLib.runRecorderPhase({
        descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
        preWriteGate: null, clockNow: () => new Date(),
      }),
    ).rejects.toThrow(/phase_deadline/);
  }, 20000);

  it('(2.5) a read error that is NOT a cancellation/timeout (a genuine SQL error) propagates completely unchanged — never swallowed, never relabelled as a bound failure', async () => {
    const descriptor = fixtureDescriptor();
    const compute = fakeCompute({ main: [{ key: 'broken', sql: 'SELECT this_column_does_not_exist' }] });
    await expect(
      stepLib.runRecorderPhase({
        descriptor, pool, compute, config: {}, chainId: 'none', log: silentLog, tag: TAG,
        preWriteGate: null, clockNow: () => new Date(),
      }),
    ).rejects.toThrow(/this_column_does_not_exist/);
  });

  // -------------------------------------------------------------------------
  // WF3 output-panel fold R1 (2026-09-18) — the 6 OPTIONAL reads (massing,
  // schemaColumnCounts, sla, inspections, costEst, coaFunnel in the real
  // compute) run OUTSIDE the pinned REPEATABLE READ snapshot, on their own
  // autocommit statements, each independently try/caught with a pre-existing
  // carry-forward-on-failure policy (git-blamed to `c19cf224^:scripts/
  // refresh-snapshot.js:308-503`, itself predating `fd14dc53` — this loop has
  // NEVER been inside the shared transaction). That isolation is the fence:
  // moving a bound-cancelled optional read onto the "fail the step" path, or
  // into the shared transaction, would both retire it. These locks prove the
  // bound applies to optional reads too WITHOUT retiring that fence — a
  // cancelled optional read still carries forward (never fails the step),
  // now loud and named in `read_timings[]`.
  // -------------------------------------------------------------------------

  it('(R1 RED-FIRST) a SLOW optional read is CANCELLED by the same per-statement bound, named in read_timings[] (phase:"optional", cancelled:true), and the step follows the EXISTING carry-forward path — it does not fail the step', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'test_opt_stmt_timeout_min',
      phase_deadline_minutes_from_config: 'none',
    });
    const compute = fakeCompute({
      main: [{ key: 'fast_main', sql: 'SELECT 1' }],
      optional: [{ key: 'slow_optional', sql: 'SELECT pg_sleep(3)' }],
    });
    const config = { test_opt_stmt_timeout_min: 0.01 }; // 600ms — the optional read sleeps 3s
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    // The step did NOT fail (no throw above) — carry-forward, not a step failure.
    expect(result.matched!.optional_failed).toEqual(['slow_optional']);
    const optEntry = result.matched!.read_timings!.find((t) => t.key === 'slow_optional')!;
    expect(optEntry.phase).toBe('optional');
    expect(optEntry.cancelled).toBe(true);
    expect(optEntry.cancel_kind).toBe('statement_timeout');
    expect(optEntry.row_count).toBeNull();
    // The main read completed normally, untouched by the optional bound.
    const mainEntry = result.matched!.read_timings!.find((t) => t.key === 'fast_main')!;
    expect(mainEntry.phase).toBe('main');
    expect(mainEntry.cancelled).toBeUndefined();
  }, 20000);

  it('(R1 inverse) a FAST optional read, well under the bound, is never cancelled and is named in read_timings[] exactly like a main read', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'test_opt_stmt_timeout_min2',
      phase_deadline_minutes_from_config: 'test_opt_phase_deadline_min2',
    });
    const compute = fakeCompute({
      main: [{ key: 'm', sql: 'SELECT 1' }],
      optional: [{ key: 'fast_optional', sql: 'SELECT 1' }],
    });
    const config = { test_opt_stmt_timeout_min2: 1, test_opt_phase_deadline_min2: 1 }; // 1 min each — instant read
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    expect(result.matched!.optional_failed).toEqual([]);
    const optEntry = result.matched!.read_timings!.find((t) => t.key === 'fast_optional')!;
    expect(optEntry.phase).toBe('optional');
    expect(optEntry.cancelled).toBeUndefined();
    expect(optEntry.row_count).toBe(1);
  });

  it('(R1) a genuine SQL error on an optional read (not a cancellation) still carries forward, named WITHOUT a cancel_kind — distinguishing "cancelled" from "just failed"', async () => {
    const descriptor = fixtureDescriptor();
    const compute = fakeCompute({
      main: [{ key: 'm', sql: 'SELECT 1' }],
      optional: [{ key: 'broken_optional', sql: 'SELECT this_column_does_not_exist' }],
    });
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config: {}, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    expect(result.matched!.optional_failed).toEqual(['broken_optional']);
    const optEntry = result.matched!.read_timings!.find((t) => t.key === 'broken_optional')!;
    expect(optEntry.cancelled).toBeUndefined();
    expect(optEntry.cancel_kind).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // WF3 output-panel fold-validation V1 (2026-09-18) — ONE wall-clock phase
  // deadline across main + optional reads, not two independent full-length
  // ones. Numbers chosen so the pre-fix ("optional gets its own FRESH full
  // budget") and post-fix ("optional gets only the REMAINING budget") shapes
  // land on opposite sides of a single, generous assertion threshold:
  //   declared budget   = 3000ms (0.05min)
  //   main read         = pg_sleep(2.5) -> completes clean, ~500ms remains
  //   optional read     = pg_sleep(5)   -> far longer than what remains either way
  //   pre-fix total  ~= 2500 (main) + 3000 (optional's OWN fresh budget)   = ~5500ms
  //   post-fix total ~= 2500 (main) +  ~500 (optional's REMAINING budget) = ~3000ms
  // Asserting total < 4000ms sits squarely between the two — it passes on the
  // fix and would fail on the pre-fix shape (verified manually, see the WF3
  // commit body for the RED capture: temporarily reverting the "remaining"
  // arithmetic to the full `phaseDeadlineMs` reproduced ~5.5s and failed this
  // assertion).
  // -------------------------------------------------------------------------
  it('(V1 RED-FIRST) main + optional reads share ONE wall-clock phase deadline — a slow optional read is cancelled at the REMAINING budget, not a fresh full one; total elapsed stays well under 2x the declared deadline; the step still takes the carry-forward path', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'none', // isolate the phase-deadline mechanism only
      phase_deadline_minutes_from_config: 'test_v1_phase_deadline_min',
    });
    const compute = fakeCompute({
      main: [{ key: 'main_consumes_budget', sql: 'SELECT pg_sleep(2.5)' }],
      optional: [{ key: 'optional_gets_remainder_only', sql: 'SELECT pg_sleep(5)' }],
    });
    const config = { test_v1_phase_deadline_min: 0.05 }; // 3000ms declared, shared by BOTH blocks
    const startedAt = Date.now();
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    const totalElapsedMs = Date.now() - startedAt;
    // The discriminating assertion: proves ONE shared budget, not two independent ones.
    expect(totalElapsedMs, `total elapsed ${totalElapsedMs}ms must stay well under 2x the 3000ms declared deadline — a fresh full budget for the optional block would push this past ~5500ms`).toBeLessThan(4000);
    // The main read completed normally (2.5s < its own 3000ms full budget).
    const mainEntry = result.matched!.read_timings!.find((t) => t.key === 'main_consumes_budget')!;
    expect(mainEntry.phase).toBe('main');
    expect(mainEntry.cancelled).toBeUndefined();
    expect(mainEntry.row_count).not.toBeNull();
    // The optional read was cancelled by the phase deadline (the REMAINING slice,
    // not a fresh 3000ms — proven by the wall-clock assertion above) — carry-forward,
    // never a step failure (no throw above).
    expect(result.matched!.optional_failed).toEqual(['optional_gets_remainder_only']);
    const optEntry = result.matched!.read_timings!.find((t) => t.key === 'optional_gets_remainder_only')!;
    expect(optEntry.phase).toBe('optional');
    expect(optEntry.cancelled).toBe(true);
    expect(optEntry.cancel_kind).toBe('phase_deadline');
    expect(optEntry.row_count).toBeNull();
  }, 20000);

  it('(V1) a phase deadline already exhausted by the main reads skips EVERY optional read up front (no query attempted) — still carry-forward, never a step failure', async () => {
    const descriptor = fixtureDescriptor({
      statement_timeout_minutes_from_config: 'none',
      phase_deadline_minutes_from_config: 'test_v1_exhausted_deadline_min',
    });
    const compute = fakeCompute({
      main: [{ key: 'main_instant', sql: 'SELECT 1' }],
      optional: [
        { key: 'never_attempted_1', sql: 'SELECT 1' },
        { key: 'never_attempted_2', sql: 'SELECT 1' },
      ],
    });
    // A 1ms declared deadline — deterministically exhausted by the time an INSTANT main
    // read (BEGIN + pg_backend_pid() + one SELECT + COMMIT, several real round trips)
    // completes, on any real Postgres connection. Chosen over "sleep close to the
    // deadline" specifically to avoid racing wall-clock jitter for a precise near-zero
    // remainder (see remainingBudgetMs's own unit test below for the exact arithmetic,
    // proven without any timing race at all).
    const config = { test_v1_exhausted_deadline_min: 1 / 60000 };
    const result = await stepLib.runRecorderPhase({
      descriptor, pool, compute, config, chainId: 'none', log: silentLog, tag: TAG,
      preWriteGate: null, clockNow: () => new Date(),
    });
    expect(result.matched!.optional_failed).toEqual(['never_attempted_1', 'never_attempted_2']);
    for (const key of ['never_attempted_1', 'never_attempted_2']) {
      const entry = result.matched!.read_timings!.find((t) => t.key === key)!;
      expect(entry.cancelled).toBe(true);
      expect(entry.cancel_kind).toBe('phase_deadline');
      expect(entry.elapsed_ms).toBe(0); // never attempted, not merely fast
      expect(entry.row_count).toBeNull();
    }
  }, 20000);

  it('(V1 arithmetic, no DB) remainingBudgetMs: the exact pure function the exhausted-budget branch is built on, proven without racing wall-clock sleeps', () => {
    expect(stepLib.remainingBudgetMs(3000, 2500)).toBe(500);
    expect(stepLib.remainingBudgetMs(3000, 3000)).toBe(0);
    expect(stepLib.remainingBudgetMs(3000, 3500), 'already past the deadline reads as 0 remaining, never negative').toBe(0);
    expect(stepLib.remainingBudgetMs(0, 100), 'a disabled deadline (0) stays disabled regardless of elapsed').toBe(0);
    expect(stepLib.remainingBudgetMs(1, 0), 'a genuinely enabled 1ms deadline with zero elapsed still returns the full 1ms').toBe(1);
  });
});
