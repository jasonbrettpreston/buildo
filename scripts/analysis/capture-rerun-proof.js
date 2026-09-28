/**
 * capture-rerun-proof — the two-run `idempotent_rerun: "zero_writes"` proof.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.0-§1.1 (idempotent_rerun)
 *
 * WHY THIS EXISTS
 * ---------------
 * 26 write targets declare `outputs.writes[].write_discipline.idempotent_rerun:
 * "zero_writes"` — the claim that running the step a SECOND time over unchanged
 * input physically writes NOTHING. Nothing measured it. The tier-2 content-hash
 * gate (`scripts/lib/step/acquire.js#contentHashSkip`) makes an unforced second
 * run SKIP before the write, so the property the declaration names ("run the
 * WRITE twice over identical bytes, the second changes nothing") is never
 * exercised by the gate that appears to cover it (defect-ledger LR-D11). The
 * manual D-19 observation (forced run 1: 21 updated; forced run 2: 0/0/0) was an
 * anecdote, not a standing check.
 *
 * The POST golden capture runs the step twice. This module decides whether the
 * second run was genuinely a no-op, from two independent measurements:
 *
 *   (1) `rewritten` — rows whose `xmin` is NEWER than a txid read just before
 *       run 2 started. `xmin` is the inserting/updating transaction id stored in
 *       the tuple header, so this catches the case a row count cannot see: the
 *       LS018/B4.5 "rewrite every row with an identical value" class, where an
 *       unguarded `UPDATE` writes 854 rows of byte-identical data. A row count
 *       delta is 0 and the content hash is unchanged — and the declaration is
 *       still FALSE, because a write (a dead tuple, WAL, bloat, replica churn)
 *       physically happened.
 *   (2) `row_delta = rows_after - rows_before` — catches DELETEs, which also
 *       never appear as a rewrite of a surviving row.
 *
 * XID WRAPAROUND: `xmin` is a 32-bit epoch-less xid; PostgreSQL wraps it every
 * ~4.29e9 transactions. The txid is normalised to
 * `[0, 2^32)` and the comparison is done modulo 2^32 with a half-range window
 * (`< 2^31`), which is exactly the modulo-arithmetic rule PostgreSQL itself uses
 * for xid age. On a local single-database dev box wrap is unreachable in
 * practice, but the rule costs nothing and an off-by-a-wrap comparison would be
 * a silent false PASS.
 *
 * ANSWER SET (closed, `ANS_*` below): a table is `zero` (proved no writes),
 * `rewrote` (writes observed — FAIL) or `drift_declared` (the table ALSO carries
 * a non-`zero_writes` target, so a table-level count cannot isolate the
 * zero_writes one — RECORDED with its counts but never counted as proof, in
 * either direction). `NOT_APPLICABLE` when the descriptor declares no
 * `zero_writes` target at all.
 *
 * SAFETY RULE: a measurement GAP is never a pass. A table with no measurement,
 * or with a non-finite number, THROWS — an unmeasured declaration is unproven,
 * not satisfied.
 *
 * Everything here is pure except `measureRerun` (the only DB-touching function),
 * so the decision rules are lockable without a database
 * (`src/tests/capture-rerun-proof.logic.test.ts`).
 */
'use strict';

/** The declaration this module measures. */
const ZERO_WRITES = 'zero_writes';

/** The closed set of per-table answers. Frozen: an unknown answer is a bug, not an extension point. */
const ANSWERS = Object.freeze(['zero', 'rewrote', 'drift_declared']);

/** Answer keys for the decision as a whole (plus `NOT_APPLICABLE` for "nothing to prove"). */
const PASS = 'PASS';
const FAIL = 'FAIL';
const NOT_APPLICABLE = 'NOT_APPLICABLE';

/** A table-level count is only evidence when EVERY target on that table claims zero_writes. */
const MODE_STRICT = 'strict';
const MODE_DRIFT_DECLARED = 'drift_declared';

/** Identifiers are interpolated into SQL (table names cannot be bound parameters) — validate, never quote. */
const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/** 2^32 — the xid space; and 2^31 — the half-range comparison window. */
const XID_SPACE = 4294967296;
const XID_HALF = 2147483648;

/** `xmin` is a system column: value 0 = HEAP_TUPLE_XMIN_INVALID, 1 = FROZEN, 2 = BOOTSTRAP. */
const XMIN_SPECIAL_MAX = 3;

/** Take a txid just before run 2, normalised to [0, 2^32) so the modulo comparison is well-formed. */
const TXID_SQL = 'SELECT (txid_current() % 4294967296)::bigint AS lo';

/** Row count for one table. */
function COUNT_SQL(table) {
  return `SELECT count(*)::bigint AS n FROM ${quoteIdent(table)}`;
}

/**
 * Rows on `table` written by a transaction newer than `$1` — the physical-write probe.
 * `>= 3` excludes the three reserved `xmin` sentinels (invalid/frozen/bootstrap); a
 * FROZEN tuple is by definition not a fresh write, and `(0 - $1 + 2^32) % 2^32` would
 * otherwise land inside the fresh window.
 */
function rewrittenSql(table) {
  return `SELECT count(*)::bigint AS n FROM ${quoteIdent(table)} WHERE xmin::text::bigint >= ${XMIN_SPECIAL_MAX} AND ((xmin::text::bigint - $1::bigint + ${XID_SPACE}) % ${XID_SPACE}) < ${XID_HALF}`;
}

/** `"<table>"`, refusing anything that is not a bare lowercase identifier. */
function quoteIdent(table) {
  if (typeof table !== 'string' || !TABLE_NAME_RE.test(table)) {
    throw new Error(`invalid table name ${JSON.stringify(table)} (expected ${TABLE_NAME_RE})`);
  }
  return `"${table}"`;
}

/** The `writes[]` array, tolerating `outputs` being absent or the string `"none"`. Pure. */
function writeTargets(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || typeof outputs !== 'object') return [];
  return Array.isArray(outputs.writes) ? outputs.writes : [];
}

/** The `write_discipline` of one writes[] entry, or `{}`. Pure. */
function writeDiscipline(target) {
  const wd = target && target.write_discipline;
  return wd && typeof wd === 'object' ? wd : {};
}

/** True iff this target declares the exact `zero_writes` string. Pure. */
function declaresZeroWrites(target) {
  return writeDiscipline(target).idempotent_rerun === ZERO_WRITES;
}

/**
 * Which tables carry a `zero_writes` claim, and whether a table-level count can
 * isolate it. Pure.
 *
 * A table is included iff AT LEAST ONE of its targets declares `zero_writes`.
 * `mode` is `strict` when EVERY target on the table declares it — then any
 * rewrite/deletion on the table is attributable to the claim and is a FAIL —
 * and `drift_declared` otherwise: another target on the same table explicitly
 * declares `declared_drift`/`not_idempotent`, so a table-level measurement sees
 * that target's writes too and cannot prove anything about the zero_writes one.
 *
 * @param {object|null} descriptor
 * @returns {Array<{table: string, mode: 'strict'|'drift_declared'}>} sorted by table
 */
function rerunTables(descriptor) {
  const byTable = new Map();
  for (const target of writeTargets(descriptor)) {
    if (!target || typeof target.table !== 'string') continue;
    const entry = byTable.get(target.table) ?? { table: target.table, total: 0, zeroWrites: 0 };
    entry.total += 1;
    if (declaresZeroWrites(target)) entry.zeroWrites += 1;
    byTable.set(target.table, entry);
  }
  return [...byTable.values()]
    .filter((e) => e.zeroWrites > 0)
    .map((e) => ({ table: e.table, mode: e.zeroWrites === e.total ? MODE_STRICT : MODE_DRIFT_DECLARED }))
    .sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
}

const POST_CAPTURE_RE = /docs\/reports\/golden\/([a-z0-9_]+)\/post\/[^/]+\.json$/;

/**
 * The golden slug when `p` is a POST capture path (`docs/reports/golden/<slug>/post/<file>.json`),
 * else `null`. Backslashes are normalised first, so a Windows path resolves identically.
 * Pure. A PRE capture is deliberately NOT a rerun proof: the second run's writes are
 * exactly what a PRE capture is taken to observe.
 * @param {string} p
 * @returns {string|null}
 */
function isPostCapturePath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  const m = POST_CAPTURE_RE.exec(p.split('\\').join('/'));
  return m ? m[1] : null;
}

/** Non-finite / non-number measurement guard. Pure. */
function requireFinite(value, what) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`rerun proof: ${what} is not a finite number (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Decide whether run 2 was a genuine zero-write rerun. Pure; THROWS on a gap.
 *
 * @param {object} args
 * @param {Array<{table: string, mode: string}>} args.tables — from rerunTables()
 * @param {Record<string, {rewritten: number, rows_before: number, rows_after: number}>} args.measured
 * @param {{exit_code: number, skipped?: boolean}|null} args.run2
 * @returns {{answer: string, rows: Array<{table: string, mode: string, answer: string, rewritten: number, row_delta: number}>, reason: string}}
 */
function rerunProofDecision({ tables, measured, run2 }) {
  const list = Array.isArray(tables) ? tables : [];
  if (list.length === 0) {
    return { answer: NOT_APPLICABLE, rows: [], reason: 'no zero_writes target' };
  }
  // Order matters: a crashed run 2 has no meaningful measurements, so the exit
  // code is judged BEFORE the gap check — otherwise a step that died before
  // touching anything would throw "measurement gap" instead of reporting FAIL.
  if (!run2 || typeof run2 !== 'object') {
    throw new Error('rerun proof: run2 is required once tables are being proved');
  }
  if (run2.exit_code !== 0) {
    return {
      answer: FAIL,
      rows: [],
      reason: `second run exited ${JSON.stringify(run2.exit_code)}${run2.skipped ? ' (skipped)' : ''} — a crash/skip is not a zero-write rerun`,
    };
  }

  const rows = [];
  const offending = [];
  for (const { table, mode } of list) {
    const m = measured ? measured[table] : undefined;
    if (!m || typeof m !== 'object') {
      throw new Error(`rerun proof: no measurement for table ${table} — a measurement gap is never a pass`);
    }
    const rewritten = requireFinite(m.rewritten, `${table}.rewritten`);
    const rows_before = requireFinite(m.rows_before, `${table}.rows_before`);
    const rows_after = requireFinite(m.rows_after, `${table}.rows_after`);
    const row_delta = rows_after - rows_before;
    let answer;
    if (mode === MODE_DRIFT_DECLARED) {
      // Recorded with its counts, never counted as proof — neither to fail nor to pass.
      answer = MODE_DRIFT_DECLARED;
    } else {
      answer = rewritten === 0 && row_delta === 0 ? 'zero' : 'rewrote';
    }
    if (!ANSWERS.includes(answer)) throw new Error(`rerun proof: unknown answer ${JSON.stringify(answer)}`);
    rows.push({ table, mode, answer, rewritten, row_delta });
    if (answer === 'rewrote') offending.push(`${table}: ${rewritten} row(s) rewritten, row delta ${row_delta}`);
  }

  if (offending.length > 0) {
    return { answer: FAIL, rows, reason: offending.join('; ') };
  }
  const proved = rows.filter((r) => r.answer === 'zero').map((r) => r.table);
  const drift = rows.filter((r) => r.answer === MODE_DRIFT_DECLARED).map((r) => r.table);
  return {
    answer: PASS,
    rows,
    reason: `zero writes on ${proved.length} table(s) [${proved.join(',')}]` +
      (drift.length > 0 ? `; drift_declared (not counted as proof) on [${drift.join(',')}]` : ''),
  };
}

/**
 * Measure a two-run rerun. The ONLY DB-touching function here.
 *
 * Ordering is load-bearing and asserted by the unit test: every `rows_before`
 * count FIRST, then ONE txid, then run 2, then the `rewritten`/`rows_after`
 * probes. Reading `lo` after the counts is safe (a count cannot write a tuple),
 * and reading it in ONE statement means all tables are compared against the same
 * transaction horizon — two `txid_current()` calls are not guaranteed equal.
 *
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>}} pool
 * @param {Array<{table: string}>} tables
 * @param {() => Promise<{exit_code: number, skipped?: boolean}>} runSecond
 * @returns {Promise<{measured: Record<string, object>, run2: object|null, lo: number|null}>}
 */
async function measureRerun(pool, tables, runSecond) {
  const list = Array.isArray(tables) ? tables : [];
  if (list.length === 0) {
    // No claim to prove: the second run is not even invoked — running a step for
    // a proof that cannot be made is pure cost (and a side effect of its own).
    return { measured: {}, run2: null, lo: null };
  }

  const before = {};
  for (const { table } of list) {
    const res = await pool.query(COUNT_SQL(table));
    before[table] = Number(res.rows[0].n);
  }

  const txidRes = await pool.query(TXID_SQL);
  const lo = Number(txidRes.rows[0].lo);

  const run2 = await runSecond();

  const measured = {};
  for (const { table } of list) {
    const rewrittenRes = await pool.query(rewrittenSql(table), [lo]);
    const afterRes = await pool.query(COUNT_SQL(table));
    measured[table] = {
      rewritten: Number(rewrittenRes.rows[0].n),
      rows_before: before[table],
      rows_after: Number(afterRes.rows[0].n),
    };
  }

  return { measured, run2, lo };
}

module.exports = {
  ZERO_WRITES,
  ANSWERS,
  PASS,
  FAIL,
  NOT_APPLICABLE,
  MODE_STRICT,
  MODE_DRIFT_DECLARED,
  TABLE_NAME_RE,
  XID_SPACE,
  XID_HALF,
  XID_SPECIAL_MAX: XMIN_SPECIAL_MAX,
  TXID_SQL,
  COUNT_SQL,
  rewrittenSql,
  rerunTables,
  isPostCapturePath,
  rerunProofDecision,
  measureRerun,
};
