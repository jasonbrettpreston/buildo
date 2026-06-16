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
 */

// Identifiers come from manifest/matrix constants. We still validate to fail GRACEFULLY
// (return an unresolved marker) rather than throw like pipeline.quoteIdent does.
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
const typeFamily = (dt) => (/int|numeric|serial|double|real|decimal/.test(dt) ? 'num' : /char|text/.test(dt) ? 'text' : dt);

function quoteOrNull(name) {
  return typeof name === 'string' && IDENT_RE.test(name) ? `"${name}"` : null;
}

/**
 * Resolve one vocab triple and count coverage. NEVER throws — every failure degrades to a
 * `{ unresolved: '<enumerated reason>' }` marker (reasons: 'bad identifier' | 'missing column'
 * | 'type mismatch' | 'timeout' | 'query error'). Raw error detail goes to logWarn only, never
 * into the returned value (no info disclosure into the admin-visible audit row).
 *
 * Coverage uses INTERSECTION semantics (distinct data values that ARE in the vocabulary), which
 * bounds the ratio at <=100% and stays correct for non-FK columns with out-of-vocab junk values.
 *
 * @param {import('pg').Pool} pool
 * @param {{ dataTable:string, dataColumn:string, dataFilter?:string|null, vocabTable:string, vocabColumn:string, vocabFilter?:string|null }} t
 * @param {{ logWarn?: (tag:string, msg:string, ctx?:object) => void, statementTimeoutMs?: number }} [opts]
 * @returns {Promise<{ present:number, vocab_size:number } | { unresolved:string }>}
 */
async function resolveAndCountTriple(pool, t, opts = {}) {
  const logWarn = opts.logWarn || (() => {});
  const timeoutMs = Number(opts.statementTimeoutMs ?? 15000);

  // 1. Identifier validation (graceful — bad identifier never reaches SQL).
  const dT = quoteOrNull(t.dataTable);
  const dC = quoteOrNull(t.dataColumn);
  const vT = quoteOrNull(t.vocabTable);
  const vC = quoteOrNull(t.vocabColumn);
  if (!dT || !dC || !vT || !vC) return { unresolved: 'bad identifier' };

  // pool.connect() is INSIDE the try so pool-exhaustion / connect failures degrade to an
  // unresolved marker too — preserving the never-throws contract end to end.
  let client;
  try {
    client = await pool.connect();
    // SET LOCAL is scoped to this transaction — guaranteed reset on COMMIT/ROLLBACK, so a
    // leaked statement_timeout can never reach the next borrower of this pooled connection.
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);

    // 2. Resolve both columns (sequential — one client can't run concurrent queries).
    const typeOf = async (table, col) => {
      const r = await client.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [table, col],
      );
      return r.rows[0]?.data_type ?? null;
    };
    const dType = await typeOf(t.dataTable, t.dataColumn);
    const vType = await typeOf(t.vocabTable, t.vocabColumn);
    if (dType === null || vType === null) return { unresolved: 'missing column' };
    if (typeFamily(dType) !== typeFamily(vType)) return { unresolved: 'type mismatch' };

    // 3. Intersection-count. dataFilter applies to the data side, vocabFilter to the vocab side —
    //    independently (never combined). Filters are trusted manifest constants (NOT parameterizable).
    const vWhere = t.vocabFilter ? ` WHERE ${t.vocabFilter}` : '';
    const dAnd = t.dataFilter ? ` AND (${t.dataFilter})` : '';
    const { rows: [row] } = await client.query(
      `SELECT (SELECT COUNT(DISTINCT ${dC})::int FROM ${dT}
                WHERE ${dC} IN (SELECT ${vC} FROM ${vT}${vWhere})${dAnd}) AS present,
              (SELECT COUNT(DISTINCT ${vC})::int FROM ${vT}${vWhere}) AS vocab_size`,
    );
    return { present: Number(row.present) || 0, vocab_size: Number(row.vocab_size) || 0 };
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
