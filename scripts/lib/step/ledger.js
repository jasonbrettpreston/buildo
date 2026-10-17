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
 * R-BG (iv) — the PRIOR-RUN BASELINE status set: the two statuses that mean
 * "this run finished and its records_meta is a usable baseline". Never
 * `completed_with_errors`.
 *
 * ⚠️ READER-SIDE ONLY, AND ONLY FOR BASELINES. Spec 124 R-CB (operator
 * 2026-10-12, purity seam S1 OQ-1): R-BG(iv) governs prior-run baselines only —
 * this set belongs to `readRunHistory`. An ordering/seam read is NOT a baseline
 * and accepts every finished status (`{completed, completed_with_warnings,
 * completed_with_errors}` — a covered FAIL run is a finished run, 122a:572),
 * adopting only the shared warn-skip predicate and the `id DESC` tie-break.
 * Applying this set to a seam read would hide a covered FAIL run from ordering,
 * which is the defect R-CB names.
 */
const BASELINE_STATUSES = Object.freeze(['completed', 'completed_with_warnings']);

/**
 * The R-BG (iv) "preserve-and-WARN run is never a baseline" predicate, VERBATIM
 * from `scripts/lib/source-version.js` `readPriorRunMeta` (~:140-146, the SQL as
 * written today). Parameter-free and shared by `readRunHistory` (a baseline
 * read) and `checkSeam` (an ordering read) per R-CB, so the two homes cannot
 * drift: `@>` containment means a row whose `records_meta.audit_table.rows`
 * carries the `write_skipped_pre_write_warn` marker is a preserve-and-WARN run,
 * not a measurement. `COALESCE(..., false)` keeps a row with no `records_meta`
 * at all (NULL → false) INCLUDED — absent meta is not a skip marker.
 */
const WARN_SKIP_PREDICATE_SQL =
  "NOT COALESCE(records_meta->'audit_table'->'rows' @> '[{\"metric\":\"write_skipped_pre_write_warn\"}]'::jsonb, false)";

/** The reader's default column list — the projection whitelist (`columns` ⊆ this). */
const RUN_HISTORY_COLUMNS = Object.freeze([
  'id',
  'pipeline',
  'status',
  'started_at',
  'completed_at',
  'records_meta',
]);

/** The ordering keys a caller may name; anything else is a typo, not a default. */
const RUN_HISTORY_ORDER_BY = Object.freeze(['completed_at', 'started_at']);

/**
 * THE ONE RUN-HISTORY READER (R-BG (iv) baseline filter; Spec 124 R-CB).
 *
 * ⚠️ PURE — A READER, NEVER A WRITER. It performs exactly one SELECT: it never
 * INSERTs/UPDATEs/DELETEs, and in particular it NEVER writes the `baseline_absent`
 * row. Writing that row is the CALLER's business (a reader that mutates the table
 * it reads cannot be reasoned about, and would make "no baseline" indistinguishable
 * from "baseline read failed"). Locked by the purity case in
 * `src/tests/ledger-reader.logic.test.ts` (every SQL the pool sees is a SELECT).
 *
 * The two `chains`/`slugForms` mechanics mirror `deriveLedgerSlugs`
 * (`scripts/lib/step/staleness.js:626-635`): a slug is matched in every declared
 * chain-prefixed form, plus the bare and hyphenated forms — a standalone run or a
 * legacy writer may use either (R-CB's HEADLINE case, HQ-6: a bare
 * `load_coa_notices` standalone run IS found for a step declaring chain `sources`).
 *
 * `slugForms` is required LAZILY, INSIDE the function. `scripts/lib/ledger.js`
 * requires `step/index.js` lazily (on first use), and `step/index.js` re-exports
 * this module — so a TOP-LEVEL `require('../ledger')` here would create a load
 * cycle at require time. Deferring it to call time breaks the cycle; the
 * require is also cheap (Node memoises it).
 *
 * @param {import('pg').Pool} pool
 * @param {{slug:string, chains?:string[], statuses?:string[], orderBy?:'completed_at'|'started_at', limit?:number, excludeWarnSkip?:boolean, columns?:string[], completedSince?:Date|string|number, metaObject?:string}} opts
 * @param {Date|string|number} [opts.completedSince] Bounds the read to runs completed at or AFTER
 *   this instant (emitted as `completed_at >= $N::timestamptz`). WHY: #12b's "producer runs since my
 *   own last start" activity read (enrich-parcels zoning).
 * @param {string} [opts.metaObject] A `records_meta` key that must be a JSON OBJECT on the row,
 *   emitted as `jsonb_typeof(records_meta -> $N::text) = 'object'` with the KEY BOUND, never interpolated.
 *   WHY: #12d keeps today's fallback — the newest run that CARRIES the key wins (operator 2026-10-13, "reverse").
 * @returns {Promise<{rows:object[], forms:string[]}>} `forms` is the deduped slug
 *   expansion actually queried — returned so a caller reporting a `baseline_absent`
 *   row can state WHICH spellings it looked for, rather than re-deriving them.
 */
async function readRunHistory(pool, opts) {
  const o = opts || {};

  if (typeof o.slug !== 'string' || o.slug.length === 0) {
    throw new Error('readRunHistory: `slug` is REQUIRED (a non-empty string)');
  }

  // `require` is not shadowed — deliberately LAZY (see the doc comment above).
  // eslint-disable-next-line global-require
  const { slugForms } = require('../ledger');
  const forms = [...new Set(slugForms(o.slug, o.chains || []))];

  const statuses = o.statuses === undefined ? BASELINE_STATUSES : o.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0 || !statuses.every((s) => typeof s === 'string' && s.length > 0)) {
    throw new Error('readRunHistory: `statuses` must be a NON-EMPTY array of strings');
  }

  const orderBy = o.orderBy === undefined ? 'completed_at' : o.orderBy;
  if (!RUN_HISTORY_ORDER_BY.includes(orderBy)) {
    throw new Error(`readRunHistory: \`orderBy\` must be one of ${RUN_HISTORY_ORDER_BY.join(', ')} — got ${JSON.stringify(o.orderBy)}`);
  }

  // Clamp a too-small/float limit, but REFUSE a non-number: `NaN` and `undefined`
  // in a LIMIT would be a silently unbounded read, the one outcome a bounded
  // baseline read must never have.
  const rawLimit = o.limit === undefined ? 1 : o.limit;
  if (typeof rawLimit !== 'number' || Number.isNaN(rawLimit)) {
    throw new Error(`readRunHistory: \`limit\` must be a number — got ${JSON.stringify(o.limit)}`);
  }
  const limit = Math.max(1, Math.floor(rawLimit));

  // WHITELIST, not sanitisation: an unknown column is a typo (`*` injection would
  // let a caller read columns this reader was never scoped to expose).
  const columns = o.columns === undefined ? [...RUN_HISTORY_COLUMNS] : o.columns;
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    !columns.every((c) => RUN_HISTORY_COLUMNS.includes(c))
  ) {
    throw new Error(`readRunHistory: \`columns\` must be a non-empty subset of ${RUN_HISTORY_COLUMNS.join(', ')}`);
  }

  const excludeWarnSkip = o.excludeWarnSkip === undefined ? true : !!o.excludeWarnSkip;

  // #12b — "producer runs since my own last start" activity read. Accept a Date, an
  // ISO string, or finite epoch ms; bind it as an ISO string so the `::timestamptz`
  // cast is unambiguous. Anything else (incl. NaN, an invalid Date, '') is a THROW.
  let completedSinceIso = null;
  if (o.completedSince !== undefined) {
    const v = o.completedSince;
    const asDate = v instanceof Date ? v : (typeof v === 'string' || typeof v === 'number') && v !== '' ? new Date(v) : null;
    if (!asDate || Number.isNaN(asDate.getTime())) {
      throw new Error('readRunHistory: `completedSince` must be a Date, ISO string or epoch ms');
    }
    completedSinceIso = asDate.toISOString();
  }

  // #12d — the newest run that CARRIES the key wins (operator 2026-10-13, "reverse").
  // A key is a bare identifier and is BOUND, never interpolated (injection guard).
  let metaObjectKey = null;
  if (o.metaObject !== undefined) {
    if (typeof o.metaObject !== 'string' || !/^[a-z][a-z0-9_]*$/.test(o.metaObject)) {
      throw new Error('readRunHistory: `metaObject` must be a records_meta key (^[a-z][a-z0-9_]*$)');
    }
    metaObjectKey = o.metaObject;
  }

  // New params append AFTER $3 (limit), in the order completedSince then metaObject,
  // and only when present — so with neither option the SQL text and params array are
  // BYTE-IDENTICAL to before this option pair existed.
  const params = [forms, [...statuses], limit];
  let sql =
    `SELECT ${columns.join(', ')} FROM pipeline_runs` +
    ' WHERE pipeline = ANY($1::text[]) AND status = ANY($2::text[])' +
    (excludeWarnSkip ? ` AND ${WARN_SKIP_PREDICATE_SQL}` : '');
  if (completedSinceIso !== null) {
    params.push(completedSinceIso);
    sql += ` AND completed_at >= $${params.length}::timestamptz`;
  }
  if (metaObjectKey !== null) {
    params.push(metaObjectKey);
    sql += ` AND jsonb_typeof(records_meta -> $${params.length}::text) = 'object'`;
  }
  sql += ` ORDER BY ${orderBy} DESC, id DESC LIMIT $3`;

  const res = await pool.query(sql, params);
  return { rows: res.rows, forms };
}

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
 * @returns {Promise<boolean>} true only when the UPDATE actually landed. The
 *   caller needs this: a swallowed UPDATE failure leaves the row 'running', and
 *   the ledger strand window (scripts/lib/ledger-window.js) is what closes it.
 */
async function finalizeLedgerRow(pool, runId, outcome) {
  if (!runId) return false;
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
    return true;
  } catch (err) {
    pipeline.log.warn(`[${outcome.slug}]`, `pipeline_runs UPDATE failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  RUN_STATUS,
  BASELINE_STATUSES,
  WARN_SKIP_PREDICATE_SQL,
  RUN_HISTORY_COLUMNS,
  RUN_HISTORY_ORDER_BY,
  readRunHistory,
  ownsLedgerRow,
  openLedgerRow,
  finalizeLedgerRow,
};
