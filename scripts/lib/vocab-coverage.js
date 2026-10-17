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
 * only runs the intersection count on it.
 *
 * CP-S5 (Spec 124 R-CX, amends R-CH, 2026-10-16) — the two column-type reads are NOT this
 * module's SQL: the caller hands a column-type reader in `opts.columnType(table, column)`
 * (an ASSERT passes the runner-owned `ctx.catalog.columnType`; the legacy pool wrapper passes
 * its own, outside the compute closure). Compute holds no catalog text (R-BZ G3).
 *
 * It lives in its OWN file precisely so that the legacy wrapper's BEGIN / SET / ROLLBACK stay
 * OUTSIDE the compute require closure — a task author requiring the core can never
 * transitively pull transaction control into the snapshot scope.
 *
 * Never throws — every failure degrades to `{ unresolved: '<enumerated reason>' }`
 * ('bad identifier' | 'no column-type reader' | 'missing column' | 'type mismatch' | 'timeout' |
 * 'query error') — with ONE exception: a catalog REFUSAL (`err.catalogRefusal`, an undeclared
 * table — a declaration defect, not a degraded read) propagates. Raw error
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
 * The client is borrowed, not owned: this function issues ONLY the one intersection count on
 * it; the column types come from `opts.columnType`. No BEGIN / SET / ROLLBACK / release.
 *
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }} client
 * @param {{ dataTable:string, dataColumn:string, dataFilter?:string|null, vocabTable:string, vocabColumn:string, vocabFilter?:string|null }} t
 * @param {{ logWarn?: (tag:string, msg:string, ctx?:object) => void, columnType?: (table:string, column:string) => Promise<string|null> }} [opts]
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
  // CP-S5 (R-CX): no reader handed in → nothing to resolve the column types with.
  if (typeof opts.columnType !== 'function') return { unresolved: 'no column-type reader' };
  const typeOf = opts.columnType;

  try {
    // 2. Resolve both columns through the caller's reader (sequential, as before).
    const dType = (await typeOf(t.dataTable, t.dataColumn)) ?? null;
    const vType = (await typeOf(t.vocabTable, t.vocabColumn)) ?? null;
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
    if (err && err.catalogRefusal) throw err; // CP-S5: an undeclared table is a defect, never a degraded marker
    const reason = err.code === '57014' ? 'timeout' : 'query error'; // 57014 = query_canceled (statement_timeout)
    logWarn('[vocab-coverage]', `${t.dataTable}.${t.dataColumn} → ${reason}`, { error: err.message });
    return { unresolved: reason };
  }
}

module.exports = { resolveAndCountTripleWithClient, quoteOrNull, typeFamily };
