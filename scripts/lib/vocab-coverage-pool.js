'use strict';

/**
 * Vocabulary / value-coverage measurement — distinct values PRESENT vs the defining vocabulary.
 * Shared by the global profiler (`scripts/quality/assert-global-coverage.js`) and the SDK
 * `cov_*` telemetry primitive (`pipeline.computeVocabCoverage`).
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §3 (vocabulary dimension)
 *            + 30_pipeline_architecture.md §3 + 48_pipeline_observability.md §3.5 (cov_ primitive)
 *
 * Catches silent under-emission a field-NULL profiler structurally can't see: a never-emitted
 * value has no row to be null. Returns raw counts (threshold-free) — the caller formats the row.
 *
 * This is the LEGACY POOL WRAPPER: it owns the transaction discipline (connect / BEGIN /
 * SET LOCAL statement_timeout / ROLLBACK / release) and delegates the actual resolution +
 * count to `./vocab-coverage` on the connected client. The compute-usable core is a
 * SEPARATE file (R-CH / R-CA(i)) so that BEGIN / SET / ROLLBACK can never be pulled into an
 * ASSERT compute's require closure.
 *
 * CP-S5 (Spec 124 R-CX, amends R-CH) — the core no longer authors the column-type read; this
 * wrapper (outside the compute closure) hands it its OWN reader, bound to the same connected
 * client and therefore the same transaction and statement_timeout as before.
 */

/** The legacy wrapper's column-type reader — the core's former `typeOf`, verbatim, on the wrapper's client. */
function clientColumnType(client) {
  return async (table, col) => {
    const r = await client.query(
      `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [table, col],
    );
    return r.rows[0]?.data_type ?? null;
  };
}

const { resolveAndCountTripleWithClient } = require('./vocab-coverage');

/**
 * Resolve one vocab triple and count coverage over a pool. NEVER throws — every failure degrades
 * to a `{ unresolved: '<enumerated reason>' }` marker (reasons: 'bad identifier' | 'missing column'
 * | 'type mismatch' | 'timeout' | 'query error'). Raw error detail goes to logWarn only, never
 * into the returned value (no info disclosure into the admin-visible audit row).
 *
 * @param {import('pg').Pool} pool
 * @param {{ dataTable:string, dataColumn:string, dataFilter?:string|null, vocabTable:string, vocabColumn:string, vocabFilter?:string|null }} t
 * @param {{ logWarn?: (tag:string, msg:string, ctx?:object) => void, statementTimeoutMs?: number }} [opts]
 * @returns {Promise<{ present:number, vocab_size:number } | { unresolved:string }>}
 */
async function resolveAndCountTriple(pool, t, opts = {}) {
  const logWarn = opts.logWarn || (() => {});
  const timeoutMs = Number(opts.statementTimeoutMs ?? 15000);

  // Identifier validation runs FIRST, before any connection is borrowed — a bad identifier
  // never reaches SQL and never costs a checkout.
  const { quoteOrNull } = require('./vocab-coverage');
  if (!quoteOrNull(t.dataTable) || !quoteOrNull(t.dataColumn) || !quoteOrNull(t.vocabTable) || !quoteOrNull(t.vocabColumn)) {
    return { unresolved: 'bad identifier' };
  }

  // pool.connect() is INSIDE the try so pool-exhaustion / connect failures degrade to an
  // unresolved marker too — preserving the never-throws contract end to end.
  let client;
  try {
    client = await pool.connect();
    // SET LOCAL is scoped to this transaction — guaranteed reset on COMMIT/ROLLBACK, so a
    // leaked statement_timeout can never reach the next borrower of this pooled connection.
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);

    // Resolution + intersection count happen in the core (no txn control of its own).
    return await resolveAndCountTripleWithClient(client, t, { ...opts, columnType: clientColumnType(client) });
  } catch (err) {
    const reason = err.code === '57014' ? 'timeout' : 'query error'; // 57014 = query_canceled (statement_timeout)
    logWarn('[vocab-coverage]', `${t.dataTable}.${t.dataColumn} → ${reason}`, { error: err.message });
    return { unresolved: reason };
  } finally {
    // ROLLBACK is a harmless no-op after a successful read; release always (if we got a client).
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        logWarn('[vocab-coverage]', 'rollback on release failed', { error: e.message });
      }
      client.release();
    }
  }
}

module.exports = { resolveAndCountTriple };
