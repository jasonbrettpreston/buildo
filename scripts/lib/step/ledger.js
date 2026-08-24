/**
 * The ledger row — opened at start, finalized in a `finally`.
 *
 * ⚠️ `crashed` IS NOT `failed`, AND THIS FILE NEVER WRITES `crashed`.
 * Spec 120 §3.2b: "`failed` means your code ran and reached a verdict, `crashed`
 * means the process died before anything could." A `finally` block, by
 * definition, only runs when the process is still alive to run it — so an
 * in-process finalize can only ever legitimately write `failed`. `crashed` is
 * produced by ONE writer, the Step-0 reconcile reaper (Spec 122 §7.4 / A3),
 * which reaps rows this library left in `running` because the process died.
 * Writing `crashed` from the finally would make the two indistinguishable
 * again, which is the exact defect the distinction exists to close.
 *
 * ⚠️ OWNERSHIP, S2-min. In-chain, `run-chain.js:591-604` already INSERTs the
 * `running` row under the chain-scoped slug (`sources:assert_schema`) and
 * finalizes it at `:718-731`. The library therefore owns the row only on the
 * STANDALONE path — exactly the rule `assert-schema.js:267` implements today,
 * preserved so S2-min needs zero run-chain changes. Consolidating both paths
 * into the library is claim #39 and lands with the run-chain growth wave.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.3
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b, §4.1 ①㉝
 */
'use strict';

const pipeline = require('../pipeline');

/** Spec 120 §3.2b run-status vocabulary (the schema's `terminal.status` enum + `running`). */
const RUN_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  COMPLETED_WITH_WARNINGS: 'completed_with_warnings',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed',
  CRASHED: 'crashed',
  SKIPPED: 'skipped',
  SELF_SKIPPED: 'self_skipped',
  DEFERRED_TO_FULL: 'deferred_to_full',
  CANCELLED: 'cancelled',
});

/**
 * Does THIS process own the ledger row?
 *
 * @param {string|null} chainId - PIPELINE_CHAIN, or null when standalone
 * @returns {boolean}
 */
function ownsLedgerRow(chainId) {
  return !chainId;
}

/**
 * INSERT the `running` row. Tolerant by design — a ledger the step cannot write
 * must not stop the step from running (same posture as `assert-schema.js:275`),
 * but the failure is LOGGED, never swallowed.
 *
 * @returns {Promise<number|null>} the run id, or null if the insert failed
 */
async function openLedgerRow(pool, slug) {
  try {
    const res = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), $2) RETURNING id`,
      [slug, RUN_STATUS.RUNNING],
    );
    return res.rows[0].id;
  } catch (err) {
    pipeline.log.warn(`[${slug}]`, `Could not insert pipeline_runs row: ${err.message}`);
    return null;
  }
}

/**
 * Finalize the row. Called from a `finally`, so it must never throw — a throw
 * here would replace the step's real error with a ledger error.
 *
 * @param {import('pg').Pool} pool
 * @param {number|null} runId
 * @param {{slug:string, status:string, durationMs:number, errorMessage?:string|null, recordsMeta?:object|null, recordsTotal?:number|null, recordsNew?:number|null, recordsUpdated?:number|null}} outcome
 */
async function finalizeLedgerRow(pool, runId, outcome) {
  if (!runId) return;
  if (outcome.status === RUN_STATUS.CRASHED) {
    // Structural, not defensive: see the file header. Reaching here would mean
    // a caller decided in-process that nothing judged, which is a contradiction.
    throw new Error(`[${outcome.slug}] finalizeLedgerRow refuses to write 'crashed' — that status belongs to the reconcile reaper (Spec 122 §7.4)`);
  }
  try {
    // ⚠️ NO `COALESCE` ON THE THREE COUNTERS, and that is the whole point.
    // `pipeline_runs.records_total/_new/_updated` DEFAULT to 0, so
    // `COALESCE($5, records_total)` resolves a deliberate NULL back to the
    // default 0 — a step declaring `counters: "none"` (§1.10, NORMATIVE for
    // every ASSERT) would emit `null` on stdout and persist `0` in the ledger.
    // That is the exact "9 distinct measured semantics for records_total" class
    // the `counters` category exists to retire, re-created one layer down.
    // Straight assignment is safe here because there is EXACTLY ONE finalize
    // per run (this function, from one `finally`), so there is no prior value
    // to preserve — unlike run-chain.js:718-731, whose COALESCE guards a row a
    // child process may have already written through.
    //
    // `records_meta` KEEPS its COALESCE deliberately: null there means "this
    // path produced no meta" (the DB-target refusal, a throw before the lock),
    // and blanking a previously-written meta would destroy audit rows.
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_total = $5,
           records_new = $6,
           records_updated = $7,
           records_meta = COALESCE($8::jsonb, records_meta)
       WHERE id = $4`,
      [
        outcome.status,
        outcome.durationMs,
        outcome.errorMessage ?? null,
        runId,
        outcome.recordsTotal ?? null,
        outcome.recordsNew ?? null,
        outcome.recordsUpdated ?? null,
        outcome.recordsMeta ? JSON.stringify(outcome.recordsMeta) : null,
      ],
    );
  } catch (err) {
    pipeline.log.warn(`[${outcome.slug}]`, `pipeline_runs UPDATE failed: ${err.message}`);
  }
}

module.exports = { RUN_STATUS, ownsLedgerRow, openLedgerRow, finalizeLedgerRow };
