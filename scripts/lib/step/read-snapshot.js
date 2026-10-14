// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CH, ctx.readSnapshot; R-CA(i))
'use strict';

/**
 * ctx.readSnapshot(fn) — the runner-owned READ ONLY snapshot (Spec 124 R-CH).
 *
 * WHY THIS SEAM EXISTS (R-CH). A compute pass that measures an ASSERT over a population
 * must never own the transaction it reads under. Isolation, the read-only guarantee and
 * the statement bound are RUNNER policy — the same three facts `ctx.tempTable` keeps out
 * of a compute's DDL. The compute hands in a function; the runner hands it a reader.
 *
 * R-CA(i) is the reason the txn exists at all: an ASSERT compute holds NO transaction and
 * issues NO `SET` of its own — it receives `client` inside a transaction that is already
 * `READ ONLY`, so a compute cannot mutate, and it receives a bound that was set by the
 * runner, so a compute cannot silently forget one. One snapshot per call: the `fn` runs
 * against a single connection inside a single `BEGIN … ROLLBACK`, and the connection is
 * always returned to the pool, success or failure.
 *
 * THE TIMEOUT IS LOUD WHEN IT CANNOT BE RESOLVED. `descriptor.execution.
 * statement_timeout_minutes_from_config` names a config variable. When the descriptor
 * declares that name and the resolved config has no (or a non-positive / non-finite)
 * value for it, this refuses to open the snapshot: a missing input must never degrade
 * into a silent no-timeout query. When the descriptor declares no such name, no
 * `SET LOCAL` is issued at all — the absence is intentional, not an oversight.
 */

/**
 * Build the ctx.readSnapshot seam, bound to one pool and one declared statement bound.
 *
 * @param {{
 *   pool: { connect: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown>, release: () => void }> },
 *   descriptor: { identity: { name: string }, execution?: { statement_timeout_minutes_from_config?: unknown } },
 *   config: Record<string, unknown>,
 *   tag: string,
 * }} deps
 * @returns {(fn: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown>}
 */
function makeReadSnapshot({ pool, descriptor, config, tag }) {
  const where = `${tag} ctx.readSnapshot`;

  // Resolve the declared bound BEFORE taking a connection. A refusal here must cost no
  // client, so the loud failure precedes `pool.connect()`.
  return async function readSnapshot(fn) {
    // Resolved LAZILY: the snapshot is built for every step context, but only a step that
    // calls it must declare a usable bound — and a missing bound refuses before any client is taken.
    const key = descriptor.execution && descriptor.execution.statement_timeout_minutes_from_config;
    let ms = 0;
    if (typeof key === 'string') {
      const minutes = Number(config[key]);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        // A missing input is LOUD, never a silent no-timeout. `config[key]` is interpolated
        // verbatim (not the coerced `minutes`) so the message shows what the variable held.
        throw new Error(
          `${where} — execution.statement_timeout_minutes_from_config names "${key}", which resolved to ${config[key]}`,
        );
      }
      ms = Math.round(minutes * 60000);
    }


    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      if (ms) {
        await client.query(`SET LOCAL statement_timeout = ${ms}`);
      }
      return await fn(client);
    } finally {
      // A read-only txn has nothing to commit, so it is always ROLLBACK that ends it. The
      // error is swallowed: a ROLLBACK after an already-aborted txn must not mask the real
      // error the compute threw (that error is what propagates out of `fn`).
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  };
}

module.exports = { makeReadSnapshot };
