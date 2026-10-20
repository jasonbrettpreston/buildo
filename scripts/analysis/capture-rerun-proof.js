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
 * ANSWER SET (closed, `ANSWERS` below): a table is `zero` (proved no writes),
 * `rewrote` (writes observed — FAIL), `drift_declared` (the table ALSO carries
 * a non-`zero_writes` target, so a table-level count cannot isolate the
 * zero_writes one — RECORDED with its counts but never counted as proof, in
 * either direction) or `seen_touch_only` (Spec 124 R-EX, below). `NOT_APPLICABLE`
 * when the descriptor declares no `zero_writes` and no seen-drift target at all.
 *
 * R-EX (Spec 124 §5, operator y 2026-10-20; COA-D14) — THE SEEN-COLUMN DRIFT. A target
 * with an R-DZ `written:"seen"` column is touched to the run clock for every fed key
 * the change guard skipped, on EVERY run, so `zero_writes` is false by construction
 * (coa_applications: 2,689 rows on the Night P4 run 2). It declares
 * `idempotent_rerun:"declared_drift"` (why citing R-DZ) and `declared_drift.liveness`
 * `{kind:"check", ref}` names the check whose row value is that run's
 * `written.touched`. Its table is mode `seen_drift` and is PROVED (answer
 * `seen_touch_only`) only when run 2's rewritten rows equal that touched count
 * EXACTLY, the row delta is 0, and the content hash with the seen column projected
 * out (`projectedHashSql`) is unchanged; anything else is `rewrote` (FAIL). A
 * `zero_writes` claim on a seen-column target is mode `seen_zero_writes`: FAIL.
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
const ANSWERS = Object.freeze(['zero', 'rewrote', 'drift_declared', 'seen_touch_only']);

/** Answer keys for the decision as a whole (plus `NOT_APPLICABLE` for "nothing to prove"). */
const PASS = 'PASS';
const FAIL = 'FAIL';
const NOT_APPLICABLE = 'NOT_APPLICABLE';

/** A table-level count is only evidence when EVERY target on that table claims zero_writes. */
const MODE_STRICT = 'strict';
const MODE_DRIFT_DECLARED = 'drift_declared';
/** R-EX: a declared_drift target whose drift is exactly its R-DZ seen-column touch. */
const MODE_SEEN_DRIFT = 'seen_drift';
/** R-EX: a zero_writes claim on a target with a seen column — false by construction, a FAIL. */
const MODE_SEEN_ZERO_WRITES = 'seen_zero_writes';
const DECLARED_DRIFT = 'declared_drift';

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

/**
 * R-EX: the table's content hash with the seen column projected out, rows ordered by the target key. Every
 * identifier is validated (never quoted from input); `''` on an empty table so the hash is always a string.
 */
function projectedHashSql(table, seenColumn, keys) {
  quoteIdent(seenColumn);
  const order = (Array.isArray(keys) ? keys : [keys]).map((k) => `t.${quoteIdent(k)}`).join(', ');
  if (order.length === 0) throw new Error(`invalid key for ${table}: a projected hash needs an order`);
  return `SELECT md5(coalesce(string_agg((to_jsonb(t) - '${seenColumn}')::text, E'\\n' ORDER BY ${order}), '')) AS h FROM ${quoteIdent(table)} t`;
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

/** The target's R-DZ `written:"seen"` column name, or null. Pure. */
function seenColumnOf(target) {
  const cols = target && Array.isArray(target.columns) ? target.columns : [];
  const c = cols.find((x) => x && x.written === 'seen');
  return c && typeof c.name === 'string' ? c.name : null;
}

/**
 * Which tables carry a `zero_writes` claim, and whether a table-level count can
 * isolate it. Pure. R-EX: a table whose targets are a seen-column `declared_drift`
 * (plus any plain `zero_writes`) is `seen_drift`; a seen column under `zero_writes`
 * is `seen_zero_writes` (a FAIL in the decision). THROWS on a seen-drift target whose
 * `declared_drift.liveness` names no check — its touched count would be unmeasured.
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
    const entry = byTable.get(target.table) ?? { table: target.table, total: 0, zeroWrites: 0, seenDrift: null, seenZero: null };
    entry.total += 1;
    const seen = seenColumnOf(target);
    const key = Array.isArray(target.key) ? target.key : [target.key];
    if (declaresZeroWrites(target)) {
      entry.zeroWrites += 1;
      if (seen) entry.seenZero = { seen_column: seen, key };
    } else if (seen && writeDiscipline(target).idempotent_rerun === DECLARED_DRIFT) {
      const dd = writeDiscipline(target).declared_drift;
      const live = dd && dd.liveness;
      if (!live || live.kind !== 'check' || typeof live.ref !== 'string' || live.ref.length === 0) {
        throw new Error(`rerun proof: ${target.table} declares declared_drift on the seen column "${seen}" but declared_drift.liveness names no check — its written.touched is unmeasured (Spec 124 R-EX)`);
      }
      entry.seenDrift = { seen_column: seen, key, touched_check: live.ref };
    }
    byTable.set(target.table, entry);
  }
  return [...byTable.values()]
    .filter((e) => e.zeroWrites > 0 || e.seenDrift)
    .map((e) => {
      if (e.seenZero) return { table: e.table, mode: MODE_SEEN_ZERO_WRITES, ...e.seenZero, touched_check: null };
      if (e.seenDrift && e.zeroWrites + 1 === e.total) return { table: e.table, mode: MODE_SEEN_DRIFT, ...e.seenDrift };
      return { table: e.table, mode: e.zeroWrites === e.total ? MODE_STRICT : MODE_DRIFT_DECLARED };
    })
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
  for (const { table, mode, touched_check: touchedCheck } of list) {
    const m = measured ? measured[table] : undefined;
    if (!m || typeof m !== 'object') {
      throw new Error(`rerun proof: no measurement for table ${table} — a measurement gap is never a pass`);
    }
    const rewritten = requireFinite(m.rewritten, `${table}.rewritten`);
    const rows_before = requireFinite(m.rows_before, `${table}.rows_before`);
    const rows_after = requireFinite(m.rows_after, `${table}.rows_after`);
    const row_delta = rows_after - rows_before;
    let answer;
    let touched;
    if (mode === MODE_SEEN_ZERO_WRITES) {
      rows.push({ table, mode, answer: 'rewrote', rewritten, row_delta });
      offending.push(`${table}: zero_writes is declared on a target with an R-DZ seen column, which is touched every run — declare declared_drift (Spec 124 R-EX)`);
      continue;
    }
    if (mode === MODE_SEEN_DRIFT) {
      const audit = run2.audit && typeof run2.audit === 'object' ? run2.audit : {};
      touched = requireFinite(audit[touchedCheck], `${table}.written.touched (run 2's ${touchedCheck} check row)`);
      if (typeof m.hash_before !== 'string' || typeof m.hash_after !== 'string') {
        throw new Error(`rerun proof: no projected content hash for ${table} — a measurement gap is never a pass`);
      }
      const why = [];
      if (rewritten !== touched) why.push(`${rewritten} row(s) rewritten, written.touched ${touched}`);
      if (row_delta !== 0) why.push(`row delta ${row_delta}`);
      if (m.hash_before !== m.hash_after) why.push('projected content hash changed (a content write beside the seen touch)');
      answer = why.length === 0 ? 'seen_touch_only' : 'rewrote';
      rows.push({ table, mode, answer, rewritten, touched, row_delta });
      if (why.length > 0) offending.push(`${table}: ${why.join(', ')}`);
      continue;
    }
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
  const proved = rows.filter((r) => r.answer === 'zero' || r.answer === 'seen_touch_only').map((r) => r.table);
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
  const hashBefore = {};
  for (const t of list) {
    const res = await pool.query(COUNT_SQL(t.table));
    before[t.table] = Number(res.rows[0].n);
    if (t.mode === MODE_SEEN_DRIFT) hashBefore[t.table] = String((await pool.query(projectedHashSql(t.table, t.seen_column, t.key))).rows[0].h);
  }

  const txidRes = await pool.query(TXID_SQL);
  const lo = Number(txidRes.rows[0].lo);

  const run2 = await runSecond();

  const measured = {};
  for (const t of list) {
    const { table } = t;
    const rewrittenRes = await pool.query(rewrittenSql(table), [lo]);
    const afterRes = await pool.query(COUNT_SQL(table));
    measured[table] = {
      rewritten: Number(rewrittenRes.rows[0].n),
      rows_before: before[table],
      rows_after: Number(afterRes.rows[0].n),
    };
    if (t.mode === MODE_SEEN_DRIFT) {
      measured[table].hash_before = hashBefore[table];
      measured[table].hash_after = String((await pool.query(projectedHashSql(table, t.seen_column, t.key))).rows[0].h);
    }
  }

  return { measured, run2, lo };
}

/**
 * R-EX: run 2's audit-table values by metric (`records_meta.audit_table.rows[].value`), the channel the
 * seen-drift proof reads its declared touched check from. Pure; `{}` when the run carried no audit table.
 */
function auditValuesFromRecordsMeta(recordsMeta) {
  const rows = recordsMeta && recordsMeta.audit_table && Array.isArray(recordsMeta.audit_table.rows) ? recordsMeta.audit_table.rows : [];
  const out = {};
  for (const r of rows) if (r && typeof r.metric === 'string') out[r.metric] = r.value;
  return out;
}

module.exports = {
  ZERO_WRITES,
  ANSWERS,
  PASS,
  FAIL,
  NOT_APPLICABLE,
  MODE_STRICT,
  MODE_DRIFT_DECLARED,
  MODE_SEEN_DRIFT,
  MODE_SEEN_ZERO_WRITES,
  projectedHashSql,
  auditValuesFromRecordsMeta,
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
