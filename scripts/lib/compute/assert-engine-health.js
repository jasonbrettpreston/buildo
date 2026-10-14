/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §"Engine health (assert_engine_health)"
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (chain-tail VACUUM owner, :142/:150)
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md (no SPEC LINK header carried by
 *            the pre-conversion step file itself — drift named in report §1.0, unresolved here)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (RECORDER, the
 *            AST+REC hybrid footnote), §5.1/§5.5 (frozen shape / compute contract)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 1 nothing hidden, Rule 2
 *            compute is just compute, Rule 3 tunables externalized, Rule 10 row-derived verdict)
 *
 * Batch 1 I3 — `assert_engine_health`'s compute, commit 7 of the full nine-commit ledger
 * (`.cursor/batch1_i3_assert_engine_health_active_task.md` §2; assessment report
 * `docs/reports/2026-09-14-batch1-i3-assert-engine-health-assessment.md`). Operator ruling
 * 2026-09-14 (report §2): archetype = RECORDER.
 *
 * Commit 8 (peel, review panel on commit 7 — report §9.6): R1 externalized the
 * `live >= 1000` dead-tuple-check floor (was a bare literal) to a 7th logic var,
 * `engine_health_dead_tuple_min_rows`; R2 restored the pre-conversion per-table
 * VACUUM-success log line (`ctx.log.info`) plus `records_meta.vacuumed_tables[]` — both
 * RETIRED at Spec 124 R-CG (S2 F3-3): the VACUUM maintenance pass itself moved to the
 * runner's `execution.maintenance` dynamic arm, which logs its own per-statement lines.
 *
 * ── WHY THIS FILE HAS NO `execution.shape` (a genuine finding, not silently worked around) ──
 * `runRecorderPhase` (scripts/lib/step/index.js) — the runner `execution.shape:"recorder"`
 * dispatches to — mechanically supports exactly ONE write statement per run: one
 * `compute.buildRow()` call producing ONE row, one `compute.buildWriteSql()` call, one
 * `write.executeRecorderUpsert()` call (`spec = descriptor.outputs.writes[0]`, single
 * `RETURNING` row). `refresh_snapshot` (the RECORDER exemplar this pilot mirrors) fits that
 * shape exactly: one row, keyed on `snapshot_date`. `assert_engine_health` does NOT fit it:
 * this step's real write is N rows (one per table `pg_stat_user_tables` discovers AT RUNTIME,
 * today ~40+), keyed `(table_name, snapshot_date)`, PLUS a separate VACUUM ANALYZE maintenance
 * pass (now the runner's `execution.maintenance` dynamic arm, Spec 124 R-CG, S2 F3-3) over
 * that same dynamic table set — a shape `runRecorderPhase` cannot express without a
 * runtime-library change (widening it to a batched/looped write, or a new `execution.shape`).
 * `step.schema.json`'s own `execution.shape` docblock (the "enrich" shape's addition rationale)
 * states the general rule this finding falls under verbatim: forcing a step into an
 * ill-fitting existing shape "is a lie... which is Rule 2's ban (compute is JUST compute) and
 * reproduces the exact pre-contract state where a step's real lifecycle is readable only by
 * reading its code." Widening the schema/runner is a RE-FREEZE decision (the plan's own Ask 1/
 * Ask 2 already flag schema-widening as out of THIS commit's authority; Operating Boundaries
 * marks `step.schema.json` frozen). The correct, disclosed alternative — the SAME one the three
 * live ASSERT descriptors already use (`assert-data-bounds`/`assert-schema`/
 * `assert-global-coverage`, all with `execution.shape` ABSENT) — is to leave `execution.shape`
 * undeclared: `isIngestStep`/`isLinkStep`/…/`isRecorderStep`/`isEnrichStep` all require
 * `execution.shape === '<name>'` verbatim (only `isIngestStep` keeps a legacy structural
 * inference, gated on an external URL read this step has none of), so an undeclared shape
 * matches NONE of them and the runtime falls through to calling `runnable.compute(stepCtx)`
 * directly — `stepCtx.pool`/`stepCtx.report`/`stepCtx.checks`/`stepCtx.config` are constructed
 * identically regardless of which branch runs (scripts/lib/step/index.js:3182-3233), so this
 * compute reaches them exactly the way `assert-data-bounds`'s own compute already does. This
 * compute therefore self-manages its own reads and RETURNS its own N-row guarded upsert as a `write_plan` — the
 * VACUUM ANALYZE maintenance pass is the runner's `execution.maintenance` dynamic arm
 * (Spec 124 R-CG, S2 F3-3), never this compute's — `identity.archetype: "RECORDER"` stands (the
 * operator's classification ruling, and every existing red-suite assertion keys on it), while
 * `execution.shape` stays undeclared (a runtime-EXECUTION fact, a different axis, never
 * checked by the red suite or by R-PACE-1's archetype-eligibility count). Filed as a genuine
 * newly-measured finding in this commit's report, not left silent.
 *
 * ── COUNTERS ── `descriptor.counters` is a real object (not "none"): with no phase runner,
 * `written` never gets populated (Rule 2's `deriveCounters` reads `computeResult.counters.*`
 * FIRST via `??`, only falling back to `written`/`records_meta`-path resolution when absent),
 * so `records_total`/`records_updated` are sourced from `records_meta.tables_checked` /
 * `records_meta.records_updated` — a real declared `source` path, resolved by the SAME
 * generic `resolveCounterSource` every other converted step uses, over `records_meta` alone
 * (no `written`/`acquired`/`matched` needed since none of those get populated on this path).
 *
 * ── PRESERVED VERBATIM (report §4.1 CONTRACT, AEH-IL-2/AEH-IL-3) ── the dynamic table
 * discovery query (no hardcoded list); the per-table dead/seq/ping-pong derivation math; the
 * 6-column `IS DISTINCT FROM` guarded upsert; the non-fatal write-failure catch (table may
 * not exist yet). The VACUUM ANALYZE maintenance loop is NO LONGER here: it moved to the
 * runner's `execution.maintenance` dynamic arm (Spec 124 R-CG, S2 F3-3), selected by the
 * ONE fleet dead-ratio measurement (`dead/(live+dead)`, `deadTupleRatio` from
 * `../dead-tuple-ratio`, shared with the runner's plausibility.js) — `deviations[]` below records the move.
 *
 * ── SEVERITY (revises the pre-conversion 'FAIL' label; Ask 1 ruling / Fold 1's "all
 * non-blocking") ── `inspAuditTable`'s pre-conversion `status:'FAIL'` rows (dead_tuple_pct,
 * update_insert_ratio) were COSMETIC TEXT ONLY — report §1.2 measured exhaustively that NO
 * threshold in this file, including those two, ever reached the halt (`hasFails` fed nothing).
 * Declaring a literal `severity:"FAIL"` on a `checks[]` entry is NOT cosmetic under the step
 * standard: a FAIL verdict with no `accept_until` entry drives `RUN_STATUS.FAILED`
 * (scripts/lib/step/index.js's terminal-selection `verdict === 'FAIL'` branch) — a REAL halt
 * this step never had. Porting the old 'FAIL' text as a declared `severity:"FAIL"` would be a
 * genuine, undisclosed REGRESSION (introducing a halt), not a verbatim port. All 6 checks
 * below are therefore declared `severity:"WARN"` (matching Spec 122 §1.10 :1112's own RECORDER
 * definition: "verdict is always PASS" — PASS or WARN, never a FAIL a check itself drives),
 * which RESOLVES AEH-D3's FAIL-vs-WARN inconsistency finding (both become WARN) rather than
 * preserving it — a deliberate, disclosed engineering call, reported as such rather than left
 * for a future commit, because leaving the FAIL label as `severity:"FAIL"` was not a safe
 * option to defer.
 */
'use strict';

// ---------------------------------------------------------------------------
// The ONE dead-tuple measurement (Spec 124 R-CG, S2 F3-3 / operator ruling
// 2026-10-13): `dead / (live + dead)`, 4 decimals. Shared with the runner's
// `execution.maintenance` dynamic arm so the WARN check and the VACUUM ANALYZE
// trigger read the SAME number — never a second, forked dead/live formula here.
// ---------------------------------------------------------------------------
const { deadTupleRatio } = require('../dead-tuple-ratio');

const TAG = '[assert_engine_health]';

/**
 * Pure derivation: turn raw `pg_stat_user_tables` rows into the per-table result
 * shape the pre-conversion file built at `:96-140`. Verbatim arithmetic
 * (rounding to 4 decimals) for the snapshot rows. Threshold comparisons are NOT
 * made here (S2 / R-BZ G7): the max-ratio checks are `value_max` in the
 * descriptor, so the library — never this file — decides (Rule 10).
 * @param {Array<Record<string, string>>} rows
 */
function buildTableResults(rows) {
  const tableResults = [];

  for (const row of rows) {
    const live = parseInt(row.n_live_tup, 10) || 0;
    const dead = parseInt(row.n_dead_tup, 10) || 0;
    const seq = parseInt(row.seq_scan, 10) || 0;
    const idx = parseInt(row.idx_scan, 10) || 0;
    const ins = parseInt(row.n_tup_ins, 10) || 0;
    const upd = parseInt(row.n_tup_upd, 10) || 0;
    const totalScans = seq + idx;

    const deadRatio = deadTupleRatio(live, dead);
    const seqRatio = totalScans > 0 ? seq / totalScans : 0;

    const entry = {
      table_name: row.table_name,
      n_live_tup: live,
      n_dead_tup: dead,
      dead_ratio: deadRatio,
      seq_scan: seq,
      idx_scan: idx,
      seq_ratio: Math.round(seqRatio * 10000) / 10000,
    };
    tableResults.push(entry);
  }

  return { tableResults };
}

/**
 * The max-ratio scopes for the three generic checks (S2 / R-BZ G7 / plan Fold 3
 * F3-1). One read-only query per check over `pg_stat_user_tables`, each ratio
 * ordered DESC so `rows[0]` is the scope's maximum. The row floors stay logic
 * variables (never literals — Rule 3); bound params only.
 * @param {object} pool
 * @param {Record<string, number>} config
 * @returns {Promise<{dead: Array, seq: Array, pingPong: Array}>}
 */
async function readRatioScopes(pool, config) {
  const deadRes = await pool.query(
    `SELECT relname AS table_name,
            (n_dead_tup::float8 / (n_live_tup + n_dead_tup))::float8 AS ratio
     FROM pg_stat_user_tables
     WHERE schemaname = 'public' AND n_live_tup >= $1 AND n_live_tup > 0
     ORDER BY ratio DESC, relname`,
    [config.engine_health_dead_tuple_min_rows],
  );
  const seqRes = await pool.query(
    `SELECT relname AS table_name,
            (seq_scan::float8 / (seq_scan + COALESCE(idx_scan, 0)))::float8 AS ratio
     FROM pg_stat_user_tables
     WHERE schemaname = 'public' AND n_live_tup >= $1 AND (seq_scan + COALESCE(idx_scan, 0)) > 0
     ORDER BY ratio DESC, relname`,
    [config.engine_health_seq_scan_min_rows],
  );
  const pingPongRes = await pool.query(
    `SELECT relname AS table_name,
            (n_tup_upd::float8 / n_tup_ins)::float8 AS ratio
     FROM pg_stat_user_tables
     WHERE schemaname = 'public' AND n_tup_ins > 0
     ORDER BY ratio DESC, relname`,
  );
  // Raw rows (ratio kept unrounded for `value`); rounding to 4 decimals is
  // applied to the DETAIL copy only, in ratioScope below.
  return { dead: deadRes.rows, seq: seqRes.rows, pingPong: pingPongRes.rows };
}

/**
 * Shape one ratio scope into an evaluator's `{ value, detail }`: `value` is the
 * unrounded scope maximum (`Number(rows[0].ratio)`, 0 when the scope is empty),
 * `detail` is the 4-decimal-rounded `{table, ratio}` rows.
 * @param {Array<Record<string, unknown>>} rows
 */
function ratioScope(rows) {
  return {
    value: rows.length > 0 ? Number(rows[0].ratio) : 0,
    detail: rows.map((r) => ({ table: r.table_name, ratio: Math.round(Number(r.ratio) * 10000) / 10000 })),
  };
}

/**
 * Fetches the ins/upd/last_autovacuum triple for one named table — the SAME
 * targeted follow-up query the pre-conversion file ran for `permit_inspections`
 * (:208-211) and `coa_applications` (:242-245), unchanged. Non-fatal: a query
 * failure reports zeros (`.catch(() => ({ rows: [] }))`), same as the original.
 * @param {import('pg').Pool} pool
 * @param {string} tableName
 */
async function fetchInsUpdVac(pool, tableName) {
  const res = await pool.query(
    `SELECT n_tup_ins::bigint AS ins, n_tup_upd::bigint AS upd, last_autovacuum
       FROM pg_stat_user_tables WHERE relname = $1`,
    [tableName],
  ).catch(() => ({ rows: [] }));
  const ins = parseInt(res.rows[0]?.ins, 10) || 0;
  const upd = parseInt(res.rows[0]?.upd, 10) || 0;
  const lastVac = res.rows[0]?.last_autovacuum || null;
  return { ins, upd, lastVac };
}

/**
 * The guarded upsert statement — verbatim SQL shape from the pre-conversion file
 * (:161-178), with the two clock values sourced from the run's own clock.
 * R-CE — the dates come from the run's ctx.clock in the declared zone; no CURRENT_DATE/NOW().
 */
const UPSERT_SQL = `INSERT INTO engine_health_snapshots
     (table_name, snapshot_date, n_live_tup, n_dead_tup, dead_ratio, seq_scan, idx_scan, seq_ratio, captured_at)
   VALUES ($1, (to_timestamp($8::float8 / 1000) AT TIME ZONE $9)::date, $2, $3, $4, $5, $6, $7, to_timestamp($8::float8 / 1000))
   ON CONFLICT (table_name, snapshot_date) DO UPDATE SET
     n_live_tup = EXCLUDED.n_live_tup,
     n_dead_tup = EXCLUDED.n_dead_tup,
     dead_ratio = EXCLUDED.dead_ratio,
     seq_scan = EXCLUDED.seq_scan,
     idx_scan = EXCLUDED.idx_scan,
     seq_ratio = EXCLUDED.seq_ratio,
     captured_at = EXCLUDED.captured_at
   WHERE engine_health_snapshots.n_live_tup IS DISTINCT FROM EXCLUDED.n_live_tup
      OR engine_health_snapshots.n_dead_tup IS DISTINCT FROM EXCLUDED.n_dead_tup
      OR engine_health_snapshots.dead_ratio IS DISTINCT FROM EXCLUDED.dead_ratio
      OR engine_health_snapshots.seq_scan IS DISTINCT FROM EXCLUDED.seq_scan
      OR engine_health_snapshots.idx_scan IS DISTINCT FROM EXCLUDED.idx_scan
      OR engine_health_snapshots.seq_ratio IS DISTINCT FROM EXCLUDED.seq_ratio
   RETURNING xmax`;

/**
 * Spec 124 R-CD — the snapshot upsert as a PLAN, not a write. The compute issues no DML: it returns
 * `{ table, sql, rows, report_check }` and the RUNNER (scripts/lib/step/index.js `runWritePlan`) executes `sql` once per
 * `rows` element on the pool, each statement autocommitted independently (`execution.txn_scope: "none"`), stops at the first
 * failing row (non-fatal — the table may not exist yet) and observes the outcome through the declared check `report_check`.
 * @param {Array<Record<string, number|string>>} tableResults
 * @param {number} clockMs — the run's ctx.clock(), epoch milliseconds ($8; the SQL converts it — no Date in compute)
 * @param {string} zone — the `pipeline_timezone` logic variable value ($9)
 * @returns {{table: string, sql: string, rows: Array<Array<number|string>>, report_check: string}}
 */
function buildSnapshotPlan(tableResults, clockMs, zone) {
  return {
    table: 'engine_health_snapshots',
    sql: UPSERT_SQL,
    rows: tableResults.map((entry) => [
      entry.table_name, entry.n_live_tup, entry.n_dead_tup,
      entry.dead_ratio, entry.seq_scan, entry.idx_scan, entry.seq_ratio,
      clockMs, zone,
    ]),
    report_check: 'engine_health_write_failed',
  };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id.
// Every check reports `{violations, detail}` (viol==0 form) or `{value, detail}`
// (value_max form) — the library (scripts/lib/step/verdict.js) derives PASS/WARN
// from the declared `limit`/`limit_from_config`, never this file (Rule 10).
// Each evaluator takes (ctx, data) — `data` is this run's own computed state,
// passed explicitly (mirrors assert-data-bounds's own evaluator/branch-data
// idiom) rather than stashed on `ctx`, which the runner owns and only the
// library ever assigns to (`ctx.matched`, `ctx.written`, …).
// ===========================================================================

function dead_tuple_ratio_high(ctx, data) {
  const { value, detail } = ratioScope(data.ratioScopes.dead);
  ctx.report('dead_tuple_ratio_high', { value, detail });
}

function seq_scan_ratio_high(ctx, data) {
  const { value, detail } = ratioScope(data.ratioScopes.seq);
  ctx.report('seq_scan_ratio_high', { value, detail });
}

function update_ping_pong_high(ctx, data) {
  const { value, detail } = ratioScope(data.ratioScopes.pingPong);
  ctx.report('update_ping_pong_high', { value, detail });
}

function insp_dead_tuple_pct(ctx, data) {
  const insp = data.insp;
  ctx.report('insp_dead_tuple_pct', { value: insp ? insp.deadPct : 0, detail: insp || 'permit_inspections not found' });
}

function insp_update_insert_ratio(ctx, data) {
  const insp = data.insp;
  ctx.report('insp_update_insert_ratio', { value: insp ? insp.uiRatio : 0, detail: insp || 'permit_inspections not found' });
}

function coa_dead_tuple_pct(ctx, data) {
  const coa = data.coa;
  ctx.report('coa_dead_tuple_pct', { value: coa ? coa.deadPct : 0, detail: coa || 'coa_applications not found' });
}

const CHECKS = {
  dead_tuple_ratio_high,
  seq_scan_ratio_high,
  update_ping_pong_high,
  insp_dead_tuple_pct,
  insp_update_insert_ratio,
  coa_dead_tuple_pct,
  // Spec 124 R-CD: observed by the RUNNER after it executes `write_plan` (runWritePlan reports it through the
  // declared ctx.report path). Kept in the dispatch table so dispatch ≡ declared checks (§5.5 compute shape);
  // the dispatch loop skips it (`id === writePlan.report_check`), so this body never runs.
  engine_health_write_failed: function engine_health_write_failed() {},
};

/**
 * The compute entry point. No `execution.shape` runner drives this step (see the
 * file header) — `ctx.pool` is used directly, exactly as `assert-data-bounds`'s
 * own compute already does. Every threshold consumed here comes from
 * `ctx.config` (Rule 3); nothing is a bare numeric literal compared against a
 * violation/failure count (ast-grep `compute-no-literal-threshold`).
 * @param {object} ctx
 */
async function compute(ctx) {
  const pool = ctx.pool;
  const config = ctx.config;
  const checksToRun = new Set(ctx.checks);

  // ── 1. Discover all public-schema tables dynamically — no hardcoded list ──
  const tableRes = await pool.query(
    `SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`,
  );
  const monitoredTables = tableRes.rows.map((r) => r.relname);

  // ── 2. Pull stats for every discovered table in one pass ─────────────────
  const statRes = await pool.query(
    `SELECT relname AS table_name,
            n_live_tup::bigint AS n_live_tup,
            n_dead_tup::bigint AS n_dead_tup,
            seq_scan::bigint AS seq_scan,
            idx_scan::bigint AS idx_scan,
            n_tup_ins::bigint AS n_tup_ins,
            n_tup_upd::bigint AS n_tup_upd
     FROM pg_stat_user_tables
     WHERE relname = ANY($1)
     ORDER BY relname`,
    [monitoredTables],
  );

  const { tableResults } = buildTableResults(statRes.rows);

  // ── 2b. Max-ratio scopes for the three generic checks (S2 / R-BZ G7) ──────
  // Each check's `value` is the scope maximum; the comparison against the
  // config threshold happens in the library (`value_max`), never here.
  const ratioScopes = await readRatioScopes(pool, config);

  // ── 3. VACUUM ANALYZE moved to the runner (Spec 124 R-CG, S2 F3-3): descriptor execution.maintenance select:"dead_tuple_ratio". ──

  // ── 4. Snapshot every table (N-row guarded upsert) — a PLAN the runner executes (Spec 124 R-CD); no DML here. ──
  const writePlan = buildSnapshotPlan(tableResults, ctx.clock(), config.pipeline_timezone);

  // ── 5. Per-chain audit-family targeted follow-ups — only when the relevant
  //      check is actually selected for THIS chain (Rule 2/Rule 3: no wasted
  //      query on a chain that will never display it — a disclosed refinement
  //      over the pre-conversion file, which ran both unconditionally). ──────
  let insp = null;
  if (checksToRun.has('insp_dead_tuple_pct') || checksToRun.has('insp_update_insert_ratio')) {
    const inspRow = tableResults.find((t) => t.table_name === 'permit_inspections');
    if (inspRow) {
      const { ins, upd, lastVac } = await fetchInsUpdVac(pool, 'permit_inspections');
      const total = inspRow.n_live_tup + inspRow.n_dead_tup;
      insp = {
        live: inspRow.n_live_tup,
        dead: inspRow.n_dead_tup,
        deadPct: total > 0 ? Math.round((inspRow.n_dead_tup / total) * 10000) / 100 : 0,
        uiRatio: ins > 0 ? Math.round((upd / ins) * 100) / 100 : 0,
        lastAutovacuum: lastVac,
      };
    }
  }

  let coa = null;
  if (checksToRun.has('coa_dead_tuple_pct')) {
    const coaRow = tableResults.find((t) => t.table_name === 'coa_applications');
    if (coaRow) {
      const { ins, upd, lastVac } = await fetchInsUpdVac(pool, 'coa_applications');
      const total = coaRow.n_live_tup + coaRow.n_dead_tup;
      coa = {
        live: coaRow.n_live_tup,
        dead: coaRow.n_dead_tup,
        deadPct: total > 0 ? Math.round((coaRow.n_dead_tup / total) * 10000) / 100 : 0,
        uiRatio: ins > 0 ? Math.round((upd / ins) * 100) / 100 : 0,
        lastAutovacuum: lastVac,
      };
    }
  }

  // ── 6. Declared checks[] — ctx.checks is already the chain-selected set ──
  const data = { ratioScopes, insp, coa };
  for (const id of ctx.checks) {
    if (id === writePlan.report_check) continue; // observed by the runner after it executes write_plan (R-CD)
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      check(ctx, data);
    } catch (err) {
      ctx.log.error(TAG, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }

  return {
    write_plan: writePlan,
    records_meta: {
      tables_checked: tableResults.length,
      engine_health: tableResults,
    },
    counters: {
      records_total: tableResults.length,
    },
  };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildTableResults = buildTableResults;
module.exports.fetchInsUpdVac = fetchInsUpdVac;
module.exports.buildSnapshotPlan = buildSnapshotPlan;
module.exports.UPSERT_SQL = UPSERT_SQL;
