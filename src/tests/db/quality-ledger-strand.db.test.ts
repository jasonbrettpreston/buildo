// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §9.3 ① (strand factories)
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// P3 (2026-08-24) — behavioural proof of the strand-window fix, against a real
// `pipeline_runs` table.
//
// WHAT IS PROVEN HERE: a throw raised inside the INSERT→finalize window leaves
// the row `failed` with a message, never `running`. The test builds the window
// in the SAME shape the three quality asserts now use —
//
//     INSERT 'running' → try { …throw… } catch { windowError = e; throw e }
//                        finally { finalizeStrandedRun(...) }
//
// — and drives it against the testcontainer.
//
// WHY THE THROW IS INJECTED HERE RATHER THAN PROVOKED IN THE REAL SCRIPT — this
// is the honest ceiling of this file, and it is also the finding that refutes
// Spec 120 §9.3 ①'s original premise. Executed against all three scripts, there
// is NO DB-reachable provocation that throws inside the window: every check body
// sits in an outer try/catch that converts throws into `errors.push`, and each
// terminal `throw` fires AFTER the finalize UPDATE has written status='failed'.
// The only un-`try`'d region is audit-table assembly over string arrays, which
// no schema mutation can make throw. So a "spawn the real script and break the
// database" test — the assert-data-bounds-halt.db.test.ts idiom — cannot exist
// for this defect. Adding a test-only crash hook to a production script would be
// worse than the gap it closes. The mechanism is proven here; the three scripts
// are tied to the mechanism by the source locks in
// src/tests/quality-ledger-window.logic.test.ts.
//
// WHAT IS NOT PROVEN, ANYWHERE: SIGKILL. No JS `finally` runs when the process
// is killed — the GH step-timeout kill, OOM, and a runner cancel all still
// strand the row. That remains reaper/reconcile work (Phase B B6.6), and the
// fix must not be described as closing it.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/quality-ledger-strand.db.test.ts

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { finalizeStrandedRun } = require('../../../scripts/lib/ledger-window.js') as {
  finalizeStrandedRun: (
    pool: unknown,
    opts: {
      runId: number | null;
      finalized: boolean;
      slug: string;
      durationMs: number;
      error: unknown;
      log?: { warn: (tag: string, msg: string) => void };
    },
  ) => Promise<boolean>;
};

const pool = getTestPool();
const FX = 'FXSTRAND:';

describe.skipIf(!dbAvailable())('ledger strand window — a throw inside the window still finalizes the row', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run — there, a missing pool means silently
    // registering zero tests (the false-green trap). Sibling precedent:
    // assert-data-bounds-halt.db.test.ts:115-126.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  /** Opens the ledger row exactly as the three asserts do. */
  async function openRow(slug: string): Promise<number> {
    const res = await pool!.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), 'running') RETURNING id`,
      [FX + slug],
    );
    return res.rows[0].id as number;
  }

  async function readRow(id: number) {
    const r = await pool!.query(
      `SELECT status, error_message, duration_ms, completed_at FROM pipeline_runs WHERE id = $1`,
      [id],
    );
    return r.rows[0] as {
      status: string;
      error_message: string | null;
      duration_ms: number | null;
      completed_at: string | null;
    };
  }

  /**
   * The window, in the shape the scripts now use. `body` stands in for
   * everything between the INSERT and the finalize.
   */
  async function runWindow(slug: string, body: (ctx: { markFinalized: () => void }) => Promise<void>) {
    const startMs = Date.now();
    const runId = await openRow(slug);
    let ledgerFinalized = false;
    let windowError: unknown = null;
    try {
      await body({ markFinalized: () => { ledgerFinalized = true; } });
    } catch (err) {
      windowError = err;
      throw err;
    } finally {
      await finalizeStrandedRun(pool, {
        runId,
        finalized: ledgerFinalized,
        slug,
        durationMs: Date.now() - startMs,
        error: windowError,
      });
    }
    return runId;
  }

  beforeEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}%`]);
  });

  afterAll(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline LIKE $1`, [`${FX}%`]);
    await pool!.end();
  });

  it('THE RED-FIRST CASE — a throw in the window leaves the row failed, not running', async () => {
    let runId = 0;
    await expect(
      runWindow('assert-schema', async () => {
        runId = (
          await pool!.query(`SELECT id FROM pipeline_runs WHERE pipeline = $1`, [FX + 'assert-schema'])
        ).rows[0].id;
        throw new Error('audit-table assembly blew up');
      }),
    ).rejects.toThrow('audit-table assembly blew up');

    const row = await readRow(runId);
    expect(row.status, 'a stranded running row wedges every run-ledger gate behind it').toBe('failed');
    expect(row.error_message).toMatch(/audit-table assembly blew up/);
    expect(row.completed_at).not.toBeNull();
    expect(Number(row.duration_ms)).toBeGreaterThanOrEqual(0);
  });

  it('the original error still propagates — the window must not swallow a halt', async () => {
    // If the finally masked or swallowed the throw, the chain would proceed past
    // a step that failed. The rejects.toThrow above is the assertion; this case
    // pins that a FAILING finalize (guarded UPDATE matching nothing) does not
    // change that.
    await pool!.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms)
       VALUES ($1, NOW(), NOW(), 'completed', 0)`,
      [FX + 'decoy'],
    );
    await expect(
      runWindow('decoy2', async ({ markFinalized }) => {
        markFinalized();
        throw new Error('halt me');
      }),
    ).rejects.toThrow('halt me');
  });

  it('the normal path is untouched — a finalized row is NOT overwritten by the finally', async () => {
    let runId = 0;
    await runWindow('assert-engine-health', async ({ markFinalized }) => {
      runId = (
        await pool!.query(`SELECT id FROM pipeline_runs WHERE pipeline = $1`, [FX + 'assert-engine-health'])
      ).rows[0].id;
      await pool!.query(
        `UPDATE pipeline_runs SET completed_at = NOW(), status = 'completed', duration_ms = 55,
                error_message = NULL WHERE id = $1`,
        [runId],
      );
      markFinalized();
    });

    const row = await readRow(runId);
    expect(row.status, 'the finally must never demote a completed run to failed').toBe('completed');
    expect(row.error_message).toBeNull();
    expect(Number(row.duration_ms)).toBe(55);
  });

  it('the `status = running` guard makes a stray second call idempotent', async () => {
    const runId = await openRow('guard');
    const first = await finalizeStrandedRun(pool, {
      runId, finalized: false, slug: 'guard', durationMs: 10, error: new Error('first'),
    });
    const second = await finalizeStrandedRun(pool, {
      runId, finalized: false, slug: 'guard', durationMs: 999, error: new Error('second'),
    });
    expect(first).toBe(true);
    expect(second, 'the row is no longer running — the guarded UPDATE must match zero rows').toBe(false);

    const row = await readRow(runId);
    expect(row.error_message).toMatch(/first/);
    expect(row.error_message).not.toMatch(/second/);
    expect(Number(row.duration_ms)).toBe(10);
  });

  it('a row finalized as failed by the normal path keeps ITS message, not the strand message', async () => {
    // Real shape: the terminal `throw new Error('Schema validation failed …')`
    // fires AFTER the finalize UPDATE. The row must keep the check errors, not
    // be relabelled by the window.
    let runId = 0;
    await expect(
      runWindow('assert-data-bounds', async ({ markFinalized }) => {
        runId = (
          await pool!.query(`SELECT id FROM pipeline_runs WHERE pipeline = $1`, [FX + 'assert-data-bounds'])
        ).rows[0].id;
        await pool!.query(
          `UPDATE pipeline_runs SET completed_at = NOW(), status = 'failed', duration_ms = 7,
                  error_message = $2 WHERE id = $1`,
          [runId, 'Parcels schema drift detected'],
        );
        markFinalized();
        throw new Error('Schema validation failed — schema drift detected');
      }),
    ).rejects.toThrow('Schema validation failed');

    const row = await readRow(runId);
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('Parcels schema drift detected');
  });
});
