// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9
//
// Phase B B3 — runLedgerGateDecision (scripts/lib/source-version.js), live-DB
// behavioral cases. Case IDs mirror the B3 grounding fold's red-first table:
//   G1 no-completed⇒RUN · G2 any-status⇒RUN (running/failed) · G3 skip-iff-
//   all-0-change · G4 defer-row⇒RUN · plus the window-boundary + upstream-
//   changed + throws-on-missing-slug-params cases the table folds into "X1".
//
// T2 fixture discipline: FX-prefixed pipeline_runs.pipeline slugs, DELETE-by-
// prefix cleanup — slug sets are ALWAYS parameters to the function under test,
// never hardcoded inside it, so the fixture proves that by using slugs the
// production code has never seen.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runLedgerGateDecision } = require('../../../scripts/lib/source-version.js');

// `as const` tuples — under tsconfig's noUncheckedIndexedAccess, a plain
// string[] indexes as `string | undefined`; a fixed-length tuple indexes as
// the exact literal type for any in-range index (0/1 below).
const OWN = ['FX_ledger_own_a', 'FX_ledger_own_b'] as const;
const UPSTREAM = ['FX_ledger_up_a', 'FX_ledger_up_b'] as const;

async function insertRun(
  pool: Pool,
  opts: {
    pipeline: string;
    status: string;
    startedAt: Date;
    completedAt?: Date | null;
    recordsNew?: number;
    recordsUpdated?: number;
    recordsMeta?: object | null;
  },
) {
  const { pipeline, status, startedAt, completedAt = null, recordsNew = 0, recordsUpdated = 0, recordsMeta = null } = opts;
  await pool.query(
    `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_new, records_updated, records_meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [pipeline, status, startedAt, completedAt, recordsNew, recordsUpdated, recordsMeta ? JSON.stringify(recordsMeta) : null],
  );
}

function minutesAgo(anchor: Date, mins: number): Date {
  return new Date(anchor.getTime() - mins * 60_000);
}

describe.skipIf(!dbAvailable())('runLedgerGateDecision — Phase B B3 live-DB cases', () => {
  let pool: Pool;
  let anchor: Date;

  beforeAll(async () => {
    pool = getTestPool() as Pool;
    const { rows } = await pool.query('SELECT NOW() AS now');
    anchor = new Date(rows[0].now);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE 'FX_ledger_%'`);
  });

  it('throws when ownSlugs is missing/empty (T2: slug sets are always required parameters)', async () => {
    await expect(runLedgerGateDecision(pool, { ownSlugs: [], upstreamSlugs: UPSTREAM })).rejects.toThrow(/ownSlugs/);
    await expect(runLedgerGateDecision(pool, { upstreamSlugs: UPSTREAM } as never)).rejects.toThrow(/ownSlugs/);
  });

  it('throws when upstreamSlugs is missing/empty', async () => {
    await expect(runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: [] })).rejects.toThrow(/upstreamSlugs/);
  });

  it('G1: own has never completed → fail-safe RUN (no_prior_completed_run), even if own has non-completed history', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'failed', startedAt: minutesAgo(anchor, 60) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: false, reason: 'no_prior_completed_run', ownCompleted: null });
  });

  it('G2: an upstream "running" row since own last completed → RUN (upstream_activity_since_last_run)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, { pipeline: UPSTREAM[0], status: 'running', startedAt: minutesAgo(anchor, 10) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('upstream_activity_since_last_run');
    expect(d.nonCompleted).toBe(1);
  });

  // Commit E (B3 output-panel remediation, E-R2) — a STRANDED (stale-past-TTL)
  // running row must STILL force RUN, exactly like a fresh one (G2 above). The
  // staleRunningUpstream field is VISIBILITY ONLY (chain-concurrency.js's 12h
  // TTL convention) — it must never flip the skip/run direction.
  it('E-R2: a running row STRANDED past the 12h TTL still forces RUN (fail-safe pinned — a future "optimization" must not skip past it)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    // 13 hours ago — past chain-concurrency.js's 12h TTL, and still "since own
    // last completed run" (own last completed only 60 minutes ago is AFTER
    // the stranded row's start... wait: the window is COALESCE(completed_at,
    // 'infinity') > own.started_at — a running row's completed_at is NULL,
    // COALESCEd to 'infinity', which is always > own.started_at regardless of
    // how long ago it started. A stranded row from BEFORE own's last run even
    // started still counts — that is the wedge this commit fixes.
    await insertRun(pool, { pipeline: UPSTREAM[0], status: 'running', startedAt: minutesAgo(anchor, 13 * 60) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('upstream_activity_since_last_run');
    expect(d.nonCompleted).toBe(1);
    expect(d.staleRunningUpstream).toBe(1); // visibility: this non-completed row IS the stale one
  });

  it('a FRESH (< 12h) running row does not count as stale (staleRunningUpstream stays 0) even though it still forces RUN', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, { pipeline: UPSTREAM[0], status: 'running', startedAt: minutesAgo(anchor, 10) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.skip).toBe(false);
    expect(d.nonCompleted).toBe(1);
    expect(d.staleRunningUpstream).toBe(0);
  });

  it('G2b: an upstream "failed" row since own last completed → RUN (same fail-safe class as running)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, { pipeline: UPSTREAM[1], status: 'failed', startedAt: minutesAgo(anchor, 20), completedAt: minutesAgo(anchor, 19) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('upstream_activity_since_last_run');
  });

  it('G3: own completed, upstream completed-with-zero-changes since → SKIP (no_upstream_changes)', async () => {
    await insertRun(pool, { pipeline: OWN[1], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, {
      pipeline: UPSTREAM[0], status: 'completed', startedAt: minutesAgo(anchor, 10), completedAt: minutesAgo(anchor, 9),
      recordsNew: 0, recordsUpdated: 0,
    });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: true, reason: 'no_upstream_changes', nonCompleted: 0, completedWithChanges: 0 });
  });

  it('G3b: no upstream rows at all in the window → SKIP (vacuously zero non-completed and zero changes)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 5), completedAt: minutesAgo(anchor, 4) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: true, reason: 'no_upstream_changes' });
  });

  it('upstream completed WITH changes since own last run → RUN (upstream_changed)', async () => {
    await insertRun(pool, { pipeline: OWN[1], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, {
      pipeline: UPSTREAM[1], status: 'completed', startedAt: minutesAgo(anchor, 10), completedAt: minutesAgo(anchor, 9),
      recordsNew: 3, recordsUpdated: 0,
    });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: false, reason: 'upstream_changed', completedWithChanges: 1 });
  });

  it('G4: an upstream deferred_to_full row since own last run → RUN (excluded from completed-with-changes, still forces RUN via non_completed)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    await insertRun(pool, {
      pipeline: UPSTREAM[0], status: 'deferred_to_full', startedAt: minutesAgo(anchor, 10), completedAt: minutesAgo(anchor, 9),
      recordsNew: 0, recordsUpdated: 0,
    });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('upstream_activity_since_last_run');
    expect(d.nonCompleted).toBe(1);
    expect(d.completedWithChanges).toBe(0); // deferred_to_full never counts as completed-with-changes
  });

  it('an upstream run that COMPLETED before own last started is outside the window and ignored → SKIP', async () => {
    await insertRun(pool, { pipeline: OWN[1], status: 'completed', startedAt: minutesAgo(anchor, 30), completedAt: minutesAgo(anchor, 29) });
    // Upstream finished well BEFORE own's last run started — must not count.
    await insertRun(pool, {
      pipeline: UPSTREAM[1], status: 'completed', startedAt: minutesAgo(anchor, 90), completedAt: minutesAgo(anchor, 89),
      recordsNew: 50, recordsUpdated: 0,
    });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: true, reason: 'no_upstream_changes' });
  });

  it('own-last anchors on the MOST RECENT completed own row (a later own completion narrows the window)', async () => {
    await insertRun(pool, { pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 60), completedAt: minutesAgo(anchor, 59) });
    // Upstream changed between the two own runs — should NOT be visible once own's anchor moves past it.
    await insertRun(pool, {
      pipeline: UPSTREAM[0], status: 'completed', startedAt: minutesAgo(anchor, 40), completedAt: minutesAgo(anchor, 39),
      recordsNew: 5, recordsUpdated: 0,
    });
    await insertRun(pool, { pipeline: OWN[1], status: 'completed', startedAt: minutesAgo(anchor, 20), completedAt: minutesAgo(anchor, 19) });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d).toMatchObject({ skip: true, reason: 'no_upstream_changes' });
    expect(new Date(d.ownStarted).getTime()).toBeCloseTo(minutesAgo(anchor, 20).getTime(), -2);
  });

  it('returns ownLastRecordsMeta from the own-last completed row (consumed by the cost-step ISO-key comparison)', async () => {
    await insertRun(pool, {
      pipeline: OWN[0], status: 'completed', startedAt: minutesAgo(anchor, 5), completedAt: minutesAgo(anchor, 4),
      recordsMeta: { rates_as_of: '2026-06-01', index_updated_at: '2026-07-01T00:00:00.000Z' },
    });
    const d = await runLedgerGateDecision(pool, { ownSlugs: OWN, upstreamSlugs: UPSTREAM, now: anchor });
    expect(d.ownLastRecordsMeta).toEqual({ rates_as_of: '2026-06-01', index_updated_at: '2026-07-01T00:00:00.000Z' });
  });
});
