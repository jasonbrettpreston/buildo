'use strict';

/**
 * Vocabulary / value-coverage CORE — the client-taking half of the vocab-coverage measurement.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CA(i); R-CH vocab core)
 *
 * This is the piece an ASSERT compute may call INSIDE the runner-owned READ ONLY snapshot
 * (`ctx.readSnapshot`, R-CH). Per R-CA(i), an ASSERT compute holds no transaction, no `SET` and
 * no `ROLLBACK` of its own — so this module NEVER opens a connection, never issues
 * `BEGIN` / `SET` / `ROLLBACK`, and never releases anything: it receives a live `client` and
 * only runs the two `information_schema.columns` reads plus the intersection count on it.
 *
 * It lives in its OWN file precisely so that the legacy wrapper's BEGIN / SET / ROLLBACK stay
 * OUTSIDE the compute require closure — a task author requiring the core can never
 * transitively pull transaction control into the snapshot scope.
 *
 * Never throws — every failure degrades to `{ unresolved: '<enumerated reason>' }`
 * ('bad identifier' | 'missing column' | 'type mismatch' | 'timeout' | 'query error'). Raw error
 * detail goes to logWarn only, never into the returned value (no info disclosure into the
 * admin-visible audit row).
 */

// Identifiers come from manifest/matrix constants. We still validate to fail GRACEFULLY
// (return an unresolved marker) rather than throw like pipeline.quoteIdent does.
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
const typeFamily = (dt) => (/int|numeric|serial|double|real|decimal/.test(dt) ? 'num' : /char|text/.test(dt) ? 'text' : dt);

function quoteOrNull(name) {
  return typeof name === 'string' && IDENT_RE.test(name) ? `"${name}"` : null;
}

/**
 * Resolve one vocab triple and count coverage on a caller-supplied client. NEVER throws.
 *
 * Coverage uses INTERSECTION semantics (distinct data values that ARE in the vocabulary), which
 * bounds the ratio at <=100% and stays correct for non-FK columns with out-of-vocab junk values.
 *
 * The client is borrowed, not owned: this function issues ONLY read queries
 * (`information_schema.columns` + one intersection count). No BEGIN / SET / ROLLBACK / release.
 *
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }} client
 * @param {{ dataTable:string, dataColumn:string, dataFilter?:string|null, vocabTable:string, vocabColumn:string, vocabFilter?:string|null }} t
 * @param {{ logWarn?: (tag:string, msg:string, ctx?:object) => void }} [opts]
 * @returns {Promise<{ present:number, vocab_size:number } | { unresolved:string }>}
 */
async function resolveAndCountTripleWithClient(client, t, opts = {}) {
  const logWarn = opts.logWarn || (() => {});

  // 1. Identifier validation (graceful — bad identifier never reaches SQL).
  const dT = quoteOrNull(t.dataTable);
  const dC = quoteOrNull(t.dataColumn);
  const vT = quoteOrNull(t.vocabTable);
  const vC = quoteOrNull(t.vocabColumn);
  if (!dT || !dC || !vT || !vC) return { unresolved: 'bad identifier' };

  try {
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
  }
}

module.exports = { resolveAndCountTripleWithClient, quoteOrNull, typeFamily };
