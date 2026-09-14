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
 * ── WHY THIS FILE HAS NO `execution.shape` (a genuine finding, not silently worked around) ──
 * `runRecorderPhase` (scripts/lib/step/index.js) — the runner `execution.shape:"recorder"`
 * dispatches to — mechanically supports exactly ONE write statement per run: one
 * `compute.buildRow()` call producing ONE row, one `compute.buildWriteSql()` call, one
 * `write.executeRecorderUpsert()` call (`spec = descriptor.outputs.writes[0]`, single
 * `RETURNING` row). `refresh_snapshot` (the RECORDER exemplar this pilot mirrors) fits that
 * shape exactly: one row, keyed on `snapshot_date`. `assert_engine_health` does NOT fit it:
 * this step's real write is N rows (one per table `pg_stat_user_tables` discovers AT RUNTIME,
 * today ~40+), keyed `(table_name, snapshot_date)`, PLUS a separate VACUUM ANALYZE maintenance
 * loop over that same dynamic table set — a shape `runRecorderPhase` cannot express without a
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
 * compute therefore self-manages its own reads, its own N-row guarded upsert, and its own
 * VACUUM ANALYZE loop via `ctx.pool` directly — `identity.archetype: "RECORDER"` stands (the
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
 * VACUUM ANALYZE loop, per-table try/caught (AEH-IL-2's `let` hoist fix — moot here, this is a
 * fresh file, but the SAME "declare before the loop that reads/writes it" discipline is kept);
 * the 6-column `IS DISTINCT FROM` guarded upsert; the non-fatal write-failure catch (table may
 * not exist yet); the chain-tail VACUUM timing itself (Ask 2 / EP-D17 DEFER, `deviations[]`
 * below, never hoisted, never touched beyond externalizing its threshold literal).
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
// Local, pure re-implementation of scripts/lib/pipeline.js's quoteIdent
// (scripts/lib/pipeline.js:804-810) — compute may not `require('../pipeline')`
// (Rule 2, ast-grep `compute-forbidden-require`), so this tiny pure identifier
// sanitizer is duplicated verbatim rather than imported. Any future change to
// the original must be mirrored here by hand — there is no single source.
// ---------------------------------------------------------------------------
function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

const TAG = '[assert_engine_health]';

/**
 * Pure derivation: turn raw `pg_stat_user_tables` rows into the per-table result
 * shape the pre-conversion file built at `:96-140`, plus the set of tables that
 * violate each of the 3 generic thresholds (all config-driven — Rule 3). Verbatim
 * arithmetic (rounding to 4 decimals), verbatim thresholds semantics (dead-tuple
 * skips tables <1000 live rows; seq-scan only flags tables >= the min-rows floor).
 * @param {Array<Record<string, string>>} rows
 * @param {Record<string, number>} config
 */
function buildTableResults(rows, config) {
  const tableResults = [];
  const deadTupleViolators = [];
  const seqScanViolators = [];
  const pingPongViolators = [];

  for (const row of rows) {
    const live = parseInt(row.n_live_tup, 10) || 0;
    const dead = parseInt(row.n_dead_tup, 10) || 0;
    const seq = parseInt(row.seq_scan, 10) || 0;
    const idx = parseInt(row.idx_scan, 10) || 0;
    const ins = parseInt(row.n_tup_ins, 10) || 0;
    const upd = parseInt(row.n_tup_upd, 10) || 0;
    const totalScans = seq + idx;

    const deadRatio = live > 0 ? dead / live : 0;
    const seqRatio = totalScans > 0 ? seq / totalScans : 0;

    const entry = {
      table_name: row.table_name,
      n_live_tup: live,
      n_dead_tup: dead,
      dead_ratio: Math.round(deadRatio * 10000) / 10000,
      seq_scan: seq,
      idx_scan: idx,
      seq_ratio: Math.round(seqRatio * 10000) / 10000,
    };
    tableResults.push(entry);

    // Check 1: dead tuple ratio — skip small tables (<1000 rows, autovacuum handles them).
    if (live >= 1000 && deadRatio > config.engine_health_dead_tuple_ratio_warn_max) {
      deadTupleViolators.push({ table: row.table_name, dead_ratio: entry.dead_ratio, live });
    }

    // Check 2: sequential scan ratio, large tables only.
    if (live >= config.engine_health_seq_scan_min_rows && totalScans > 0
      && seqRatio > config.engine_health_seq_scan_ratio_warn_max) {
      seqScanViolators.push({ table: row.table_name, seq_ratio: entry.seq_ratio, seq, idx });
    }

    // Check 3: update ping-pong (cumulative, all-time ratio).
    if (ins > 0 && upd > config.engine_health_ping_pong_ratio_warn_max * ins) {
      pingPongViolators.push({ table: row.table_name, ratio: Math.round((upd / ins) * 10) / 10, upd, ins });
    }
  }

  return { tableResults, deadTupleViolators, seqScanViolators, pingPongViolators };
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

/** The guarded upsert statement — verbatim SQL shape from the pre-conversion file (:161-178). */
const UPSERT_SQL = `INSERT INTO engine_health_snapshots
     (table_name, snapshot_date, n_live_tup, n_dead_tup, dead_ratio, seq_scan, idx_scan, seq_ratio)
   VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (table_name, snapshot_date) DO UPDATE SET
     n_live_tup = EXCLUDED.n_live_tup,
     n_dead_tup = EXCLUDED.n_dead_tup,
     dead_ratio = EXCLUDED.dead_ratio,
     seq_scan = EXCLUDED.seq_scan,
     idx_scan = EXCLUDED.idx_scan,
     seq_ratio = EXCLUDED.seq_ratio,
     captured_at = NOW()
   WHERE engine_health_snapshots.n_live_tup IS DISTINCT FROM EXCLUDED.n_live_tup
      OR engine_health_snapshots.n_dead_tup IS DISTINCT FROM EXCLUDED.n_dead_tup
      OR engine_health_snapshots.dead_ratio IS DISTINCT FROM EXCLUDED.dead_ratio
      OR engine_health_snapshots.seq_scan IS DISTINCT FROM EXCLUDED.seq_scan
      OR engine_health_snapshots.idx_scan IS DISTINCT FROM EXCLUDED.idx_scan
      OR engine_health_snapshots.seq_ratio IS DISTINCT FROM EXCLUDED.seq_ratio
   RETURNING xmax`;

/**
 * Writes one guarded-upsert row per discovered table — the compute-authored write
 * loop `write_discipline.set_source:"compute"` declares (no phase-runner codegen
 * involved). Wrapped in ONE try/catch around the WHOLE loop, matching the
 * pre-conversion file's own non-fatal posture (:158-188: "table may not exist
 * yet") — a failure stops the loop at the failing row and reports a WARN check,
 * never a throw. Each statement autocommits independently (no explicit
 * transaction), exactly as the pre-conversion file did (no BEGIN/COMMIT anywhere
 * in it) — `execution.txn_scope: "none"`.
 * @param {import('pg').Pool} pool
 * @param {Array<Record<string, number|string>>} tableResults
 */
async function writeSnapshots(pool, tableResults) {
  let recordsUpdated = 0;
  let writeFailed = false;
  let writeError = null;
  try {
    for (const entry of tableResults) {
      const res = await pool.query(UPSERT_SQL, [
        entry.table_name, entry.n_live_tup, entry.n_dead_tup,
        entry.dead_ratio, entry.seq_scan, entry.idx_scan, entry.seq_ratio,
      ]);
      if (res.rowCount > 0 && res.rows[0].xmax !== '0') recordsUpdated++;
    }
  } catch (err) {
    writeFailed = true;
    writeError = err.message;
  }
  return { recordsUpdated, writeFailed, writeError };
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
  const v = data.deadTupleViolators;
  ctx.report('dead_tuple_ratio_high', { violations: v.length, detail: v });
}

function seq_scan_ratio_high(ctx, data) {
  const v = data.seqScanViolators;
  ctx.report('seq_scan_ratio_high', { violations: v.length, detail: v });
}

function update_ping_pong_high(ctx, data) {
  const v = data.pingPongViolators;
  ctx.report('update_ping_pong_high', { violations: v.length, detail: v });
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

function engine_health_write_failed(ctx, data) {
  const f = data.writeFailed;
  ctx.report('engine_health_write_failed', { violations: f ? 1 : 0, detail: f ? data.writeError : null });
}

function engine_health_vacuum_failed(ctx, data) {
  const errs = data.vacuumErrors;
  ctx.report('engine_health_vacuum_failed', { violations: errs.length, detail: errs });
}

const CHECKS = {
  dead_tuple_ratio_high,
  seq_scan_ratio_high,
  update_ping_pong_high,
  insp_dead_tuple_pct,
  insp_update_insert_ratio,
  coa_dead_tuple_pct,
  engine_health_write_failed,
  engine_health_vacuum_failed,
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

  const { tableResults, deadTupleViolators, seqScanViolators, pingPongViolators } = buildTableResults(statRes.rows, config);

  // ── 3. Auto-VACUUM ANALYZE tables exceeding the dead-tuple threshold ──────
  // Ask 2 / EP-D17 DEFER (deviations[] below): the chain-tail VACUUM timing
  // itself is NOT touched — only its threshold literal is now config-driven.
  const vacuumTargets = tableResults.filter(
    (t) => t.dead_ratio > config.engine_health_dead_tuple_ratio_warn_max && t.n_live_tup > 0,
  );
  const vacuumErrors = [];
  for (const target of vacuumTargets) {
    try {
      await pool.query(`VACUUM ANALYZE ${quoteIdent(target.table_name)}`);
    } catch (err) {
      vacuumErrors.push({ table: target.table_name, error: err.message });
      ctx.log.warn(TAG, `VACUUM ANALYZE ${target.table_name} failed: ${err.message}`);
    }
  }

  // ── 4. Snapshot every table into engine_health_snapshots (N-row guarded upsert) ──
  const { recordsUpdated, writeFailed, writeError } = await writeSnapshots(pool, tableResults);
  if (writeFailed) ctx.log.warn(TAG, `Could not write engine_health_snapshots: ${writeError}`);

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
  const data = {
    deadTupleViolators, seqScanViolators, pingPongViolators, insp, coa, writeFailed, writeError, vacuumErrors,
  };
  for (const id of ctx.checks) {
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
    records_meta: {
      tables_checked: tableResults.length,
      tables_vacuumed: vacuumTargets.length,
      records_updated: recordsUpdated,
      engine_health: tableResults,
    },
    counters: {
      records_total: tableResults.length,
      records_updated: recordsUpdated,
    },
  };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildTableResults = buildTableResults;
module.exports.fetchInsUpdVac = fetchInsUpdVac;
module.exports.writeSnapshots = writeSnapshots;
module.exports.quoteIdent = quoteIdent;
module.exports.UPSERT_SQL = UPSERT_SQL;
