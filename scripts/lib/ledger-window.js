#!/usr/bin/env node
/**
 * Ledger strand window — finalize a hand-rolled `pipeline_runs` row when the
 * work between the row's INSERT and its normal finalize UPDATE does not reach
 * that UPDATE.
 *
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §9.3 ①
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
 *
 * ── WHY THIS EXISTS, WITH THE PREMISE CORRECTED (P3, 2026-08-24) ───────────
 *
 * Spec 120 §9.3 ① recorded that `assert-schema`, `assert-data-bounds` and
 * `assert-engine-health` "strand a `running` row on ANY throw". Executed
 * against the three files, that is FALSE and the annotation in the spec now
 * says so. Each script wraps its entire check body in an outer try/catch that
 * converts every provokable throw into an `errors.push`, and each script's
 * terminal `throw` fires AFTER its finalize UPDATE has already written
 * status='failed'. The throws that claim counted are all inside that catch.
 *
 * What is genuinely unprotected, and what this module closes:
 *   (a) the region between the outer catch and the finalize UPDATE — audit-table
 *       assembly and JSON.stringify — which sits in no try at all;
 *   (b) the finalize UPDATE itself, which is `.catch`-warned, so a failed UPDATE
 *       leaves the row 'running' with nothing but a log line.
 *
 * ── WHAT THIS DOES NOT PROTECT AGAINST ─────────────────────────────────────
 *
 * Process death. SIGKILL, the GitHub step-timeout kill, OOM and a runner cancel
 * all terminate the process without running any `finally`, and the row stays
 * 'running'. That is reaper / reconcile-on-start work (Phase B B6.6), not this.
 * A `finally` closes THROWS, not KILLS — do not describe it as more.
 *
 * ── SCOPE ──────────────────────────────────────────────────────────────────
 *
 * These rows are only opened on the STANDALONE path (`!PIPELINE_CHAIN`); inside
 * a chain, run-chain.js owns the ledger row. That is why the hole survived every
 * chain run and shows up in manual/one-off invocations.
 */
'use strict';

/** Postgres `error_message` is text, but a 50KB stack helps nobody. */
const MAX_ERROR_MESSAGE = 2000;

/**
 * Should the `finally` write anything?
 *
 * Two guards, both load-bearing:
 *  - no `runId` — either the step is chain-scoped (run-chain.js owns the row) or
 *    the INSERT itself failed. The INSERT keeps its own try/catch precisely so a
 *    failed INSERT does not become a second failure mode; the window is inert.
 *  - already finalized — the normal path wrote the real status/verdict/meta. The
 *    `finally` must never overwrite it (it also runs on the happy path).
 *
 * @param {{ runId: number|null|undefined, finalized: boolean }} state
 * @returns {boolean}
 */
function shouldFinalizeStranded({ runId, finalized }) {
  return Boolean(runId) && !finalized;
}

/**
 * The message the stranded row carries, so the row explains itself to an
 * operator reading `pipeline_runs` months later.
 *
 * @param {unknown} error the error the window captured, or null/undefined when
 *   the body completed but the normal finalize UPDATE never landed.
 * @returns {string}
 */
function strandErrorMessage(error) {
  if (error === null || error === undefined) {
    // The `finally` also runs on the NORMAL path. Reaching it with no error means
    // the finalize UPDATE was `.catch`-warned away — report THAT, not a phantom throw.
    return 'interrupted: ledger row never finalized — the normal finalize UPDATE did not land';
  }
  const raw = error instanceof Error && error.message ? error.message : String(error);
  const msg = `interrupted: step threw before the ledger row was finalized — ${raw}`;
  return msg.length > MAX_ERROR_MESSAGE ? `${msg.slice(0, MAX_ERROR_MESSAGE - 1)}…` : msg;
}

/**
 * Close an unfinalized `pipeline_runs` row as `failed`.
 *
 * `status = 'failed'` deliberately, NOT a new `crashed` value: the status
 * vocabulary is exact-set locked across eight admin consumers
 * (`check-pipeline-freshness.logic.test.ts`), and widening it is Spec 120 §6c
 * work with its own cross-layer contract. A stranded row's distinguishing
 * signal is its `error_message`, which starts `interrupted:`.
 *
 * NEVER THROWS. A throwing `finally` REPLACES the original error and the real
 * cause is lost — the single most important property of this function.
 *
 * @param {import('pg').Pool} pool
 * @param {{ runId: number|null|undefined, finalized: boolean, slug: string,
 *           durationMs: number, error: unknown,
 *           log?: { warn: (tag: string, msg: string, ctx?: object) => void } }} opts
 * @returns {Promise<boolean>} true only when a row was actually transitioned.
 */
async function finalizeStrandedRun(pool, opts) {
  const { runId, finalized, slug, durationMs, error, log } = opts;
  if (!shouldFinalizeStranded({ runId, finalized })) return false;
  try {
    const res = await pool.query(
      `UPDATE pipeline_runs
          SET completed_at = NOW(), status = 'failed', duration_ms = $2, error_message = $3
        WHERE id = $1 AND status = 'running'`,
      [runId, durationMs, strandErrorMessage(error)],
    );
    // The `AND status = 'running'` guard is what makes this safe to call
    // unconditionally: a row some other path already finalized matches zero rows.
    return Boolean(res && res.rowCount > 0);
  } catch (err) {
    if (log && typeof log.warn === 'function') {
      log.warn(`[${slug}]`, `stranded pipeline_runs finalize failed: ${err.message}`, { runId });
    }
    return false;
  }
}

module.exports = {
  MAX_ERROR_MESSAGE,
  finalizeStrandedRun,
  shouldFinalizeStranded,
  strandErrorMessage,
};
