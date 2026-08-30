/**
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 9 (PRIMARY)
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (SECONDARY — owns the `parcels` table)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (compute dispatch), §1.10 (BACKFILL)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 1 nothing hidden, Rule 2 compute is JUST compute, Rule 10 row-derived verdict)
 *
 * Pilot 6 — `compute_centroids`'s compute: the VERBATIM-PORTED PostGIS `UPDATE ...
 * RETURNING id` (G2's "verbatim" guarantee — LG-20's class-E `write_once_backfill`
 * write, `scripts/lib/step/write.js executeBackfillUpdate`) plus the pure check
 * observers. NO fs/pg/pipeline require, NO process.argv/process.env, opens NO pool
 * — Rule 2.
 *
 * ⚠️ A-1(a) — THE JS FALLBACK (arithmetic-mean `computeCentroid()`, the cursor-
 * paginated batch loop, the CC-D1 infinite-loop fence it carried) IS RETIRED
 * WHOLE, not merely declared unreachable. `guards.requires: postgis` /
 * `on_missing: "fail"` (the `link_massing` A-8 precedent) HALTS a DB with no
 * PostGIS extension rather than silently falling back to a second algorithm. The
 * fence's evidence trail (commit `80ac3469`, "Fix infinite loop: cursor
 * pagination replaces `centroid_lat IS NULL` filter which refetched malformed
 * geometries forever") is preserved in `compute-centroids.notes.json`'s
 * `fences[]`, never as live code — the PostGIS branch below is ONE `UPDATE ...
 * RETURNING id` with no loop, so it has no cursor-pagination analogue to
 * preserve and none is needed (a server-side `UPDATE ... WHERE ...` cannot
 * infinite-loop on a malformed row the way a client-side re-scan can).
 */
'use strict';

/** T1 (WARN threshold on the failed-geometry count — verdict-affecting, on_invalid "fail"). */
const FAILED_GEOMETRIES_VAR = 'compute_centroids_failed_geometries_warn';
/** T2 (WARN floor on the compute-rate percentage — verdict-affecting, on_invalid "fail"). T2's default (98) traces to commit `d32612bb`'s deliberate 90%->98% tightening. */
const COMPUTE_RATE_VAR = 'compute_centroids_compute_rate_warn_pct';
/** T3 (batch size for the FULL-mode guarded repair's keyset UPDATE loop — NOT verdict-affecting, on_invalid "clamp"). CC-D3, 2026-08-30. */
const FULL_RECOMPUTE_BATCH_VAR = 'compute_centroids_full_recompute_batch_size';

const TABLE = 'parcels';

/**
 * The pre-run backlog — verbatim port of the pre-conversion script's own count
 * query (`compute-centroids.js:64-66`, before conversion). `runBackfillPhase`
 * reads `backlog_count` to decide the ZERO-WORK COMPLETION branch (mirroring the
 * old script's own `totalParcels === 0` early return).
 */
function buildPreSql() {
  return `SELECT COUNT(*)::int AS backlog_count
    FROM parcels
   WHERE geometry IS NOT NULL AND centroid_lat IS NULL`;
}

/**
 * ⚠️ G2's "verbatim" GUARANTEE — this text is byte-identical (modulo whitespace)
 * to the pre-conversion script's ONE PostGIS write statement (`:101-107`).
 * LG-20's `executeBackfillUpdate` refuses any INSERT/DELETE/TRUNCATE token,
 * checked on THIS text at execution time — so a future edit that silently turns
 * this into something else throws instead of running. No transaction wrapper: a
 * single server-side statement IS the transaction (`txn_scope: "statement"`).
 */
function buildUpdateSql() {
  return `UPDATE parcels SET
     centroid_lat = ST_Y(ST_Centroid(geom)),
     centroid_lng = ST_X(ST_Centroid(geom))
   WHERE geom IS NOT NULL AND centroid_lat IS NULL
   RETURNING id`;
}

/**
 * The post-run failed-geometry count — verbatim port of the pre-conversion
 * script's own failed-count query (`:111-113`, before conversion): parcels whose
 * `geometry` JSONB is present but the PostGIS `geom` cast never populated (a
 * malformed GeoJSON payload), still uncomputed after the UPDATE above.
 */
function buildPostSql() {
  return `SELECT COUNT(*)::int AS failed_geometries
    FROM parcels
   WHERE geometry IS NOT NULL AND geom IS NULL AND centroid_lat IS NULL`;
}

/**
 * The compute-authored SQL set `runBackfillPhase` (`scripts/lib/step/index.js`)
 * executes, mirroring `buildMaterializeSql`/`buildTierSql`'s split (ruling A-2
 * option 2 precedent). Neither `descriptor` nor `config` is read by the SQL text
 * itself — T1/T2 are verdict thresholds only, never query parameters — kept as
 * parameters for shape parity with the other archetypes' `build*Sql(descriptor,
 * config)` signature.
 */
function buildBackfillSql() {
  return {
    pre_sql: buildPreSql(),
    update_sql: buildUpdateSql(),
    post_sql: buildPostSql(),
  };
}

/**
 * CC-D3 (2026-08-30) — the FULL-mode repair. `override.force_full` (env
 * `COMPUTE_CENTROIDS_FORCE_FULL`) selects this path INSTEAD OF `buildBackfillSql`
 * above; the incremental scope (`centroid_lat IS NULL`) is untouched either way — see
 * the descriptor's second `outputs.writes[]` target (`write_discipline.class:
 * "set_based_scoped"`, `set_source: "compute"`, LG-22).
 *
 * `drift_select_sql` is BOTH the guard predicate AND the before-image source in one
 * statement — it reads every row whose STORED centroid differs from a freshly
 * computed `ST_Centroid(geom)` by ANY amount (`IS DISTINCT FROM`, not `> 1.0`: the
 * runtime plausibility check's `> 1.0` bound is an OBSERVABILITY threshold, not the
 * repair's own scope — repairing only >1m drift would leave every sub-1m drift
 * uncorrected and CALL it done). `shift_m` rides along so `recompute_max_shift_m`
 * costs nothing extra to measure. The runner (`runBackfillFullRecompute`,
 * `scripts/lib/step/index.js`) reads this ONCE (R-M: the before-image must be
 * written from the SAME rows the update will touch), then chunks the returned ids
 * into `update_sql`'s keyset-batched UPDATEs.
 *
 * `update_sql` is a plain guarded UPDATE scoped by `id = ANY($1::int[])` — the ids
 * come from `drift_select_sql`'s own result, not a re-derived predicate, so a batch
 * can never touch a row that was not before-imaged. `executeGuardedUpdate` (LG-22)
 * enforces the UPDATE-only token boundary the same way `executeBackfillUpdate`
 * (LG-20) does for the incremental path.
 */
function buildFullRecomputeSql(descriptor, config) {
  const batchSizeVar = (descriptor && descriptor.execution && descriptor.execution.batch_size_from_config)
    || FULL_RECOMPUTE_BATCH_VAR;
  return {
    // ⚠️ ROUND(...::numeric, 7), NOT a bare ST_Y/ST_X comparison — found live
    // this WF3, red-first, by executing this exact query against a fixture
    // row that was ALREADY correct. `centroid_lat`/`centroid_lng` are
    // NUMERIC(10,7) (migration 245's own ~1.1cm quantum); ST_Centroid returns
    // unrounded double precision. Comparing a ROUNDED stored value against an
    // UNROUNDED fresh one via bare IS DISTINCT FROM is DISTINCT on the last
    // decimal for nearly every row, even one this exact UPDATE just wrote —
    // it would report the ENTIRE table as "drifted" on every run, breaking
    // idempotent_rerun:"zero_writes" the same way an un-guarded set-based
    // write would. Rounding BOTH sides to the column's own precision is what
    // makes a re-run over an already-repaired row a genuine no-op.
    drift_select_sql: `SELECT id, centroid_lat, centroid_lng,
       ROUND(ST_Y(ST_Centroid(geom))::numeric, 7) AS new_centroid_lat,
       ROUND(ST_X(ST_Centroid(geom))::numeric, 7) AS new_centroid_lng,
       ST_DistanceSphere(
         ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat), 4326),
         ST_Centroid(geom)
       ) AS shift_m
    FROM parcels
   WHERE geom IS NOT NULL
     AND (centroid_lat IS DISTINCT FROM ROUND(ST_Y(ST_Centroid(geom))::numeric, 7)
          OR centroid_lng IS DISTINCT FROM ROUND(ST_X(ST_Centroid(geom))::numeric, 7))
   ORDER BY id`,
    update_sql: `UPDATE parcels SET
     centroid_lat = ST_Y(ST_Centroid(geom)),
     centroid_lng = ST_X(ST_Centroid(geom))
   WHERE id = ANY($1::int[])
   RETURNING id`,
    batch_size: (config && config[batchSizeVar]) || 10000,
  };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** R-P's spirit (N/A — no ledger gate exists for this step): persists WHY a zero-work run had nothing to do. */
function backlog_count(ctx) {
  const n = (ctx.matched && ctx.matched.backlog_count) || 0;
  ctx.report('backlog_count', { violations: 0, detail: n });
}

/** INFO — records_total's own source (§11 Counter Semantic Contract): computed + failed. */
function parcels_processed(ctx) {
  const n = (ctx.matched && ctx.matched.parcels_processed) || 0;
  ctx.report('parcels_processed', { violations: 0, detail: n });
}

/** INFO — records_updated's own source. */
function centroids_computed(ctx) {
  const n = (ctx.matched && ctx.matched.centroids_computed) || 0;
  ctx.report('centroids_computed', { violations: 0, detail: n });
}

/** T1 — WARN when any geometry failed the PostGIS cast (a malformed geometry, never a reason to halt). */
function failed_geometries(ctx) {
  const n = (ctx.matched && ctx.matched.failed_geometries) || 0;
  ctx.report('failed_geometries', { violations: n, detail: n });
}

/**
 * T2 — WARN floor on the compute-rate percentage. `processed === 0` reports
 * 100% (vacuously — nothing was attempted, so nothing failed), which is what
 * keeps a genuine ZERO-WORK completion PASSing without a separate hardcoded
 * verdict: on the live corpus's steady state (0 backlog) this check is not even
 * SCORED (`runBackfillPhase`'s zero-work narrowing excludes every `when: "post"`
 * check), so the 100% branch only matters for a synthetic non-zero-backlog,
 * zero-computed pathological case a real run has never produced.
 */
function compute_rate(ctx) {
  const m = ctx.matched || {};
  const processed = m.parcels_processed || 0;
  const computed = m.centroids_computed || 0;
  const pct = processed > 0 ? round1((computed / processed) * 100) : 100;
  ctx.report('compute_rate', { value: pct, detail: `${pct}%` });
}

/** WARN (not FAIL) — a standing `COMPUTE_CENTROIDS_FORCE_FULL` env var must be visible on every run, forced or not (link_massing precedent, `override_force_full_present`). */
function override_force_full_present(ctx) {
  const standing = ctx.overrides && ctx.overrides.force_full === true;
  ctx.report('override_force_full_present', { violations: standing ? 1 : 0, detail: standing });
}

/** INFO — CC-D3's own repair counter: rows the FULL-mode guarded UPDATE actually touched (0 on every incremental run). */
function recompute_rows_changed(ctx) {
  const n = (ctx.matched && ctx.matched.recompute_rows_changed) || 0;
  ctx.report('recompute_rows_changed', { violations: 0, detail: n });
}

/** INFO — the largest single-row centroid shift the FULL-mode repair corrected, in metres (null on an incremental run — nothing to measure). */
function recompute_max_shift_m(ctx) {
  const m = ctx.matched || {};
  const v = Object.prototype.hasOwnProperty.call(m, 'recompute_max_shift_m') ? m.recompute_max_shift_m : null;
  ctx.report('recompute_max_shift_m', { violations: 0, detail: v });
}

/**
 * The step's `records_meta` block — mirrors the pre-conversion script's own
 * top-level fields (`duration_ms`, `parcels_processed`, `centroids_computed`,
 * `failed_geometries`) for maximal fidelity, even though the audit_table SHAPE
 * around them is now row-derived (Rule 10) rather than the old `hasWarns`
 * parallel boolean. CC-D3 (2026-08-30) adds `recompute_rows_changed`/
 * `recompute_max_shift_m` for the FULL-mode repair — 0/null on every incremental run.
 */
function buildBackfillMeta(ctx) {
  const m = ctx.matched || {};
  return {
    duration_ms: ctx.elapsed_ms,
    parcels_processed: m.parcels_processed || 0,
    centroids_computed: m.centroids_computed || 0,
    failed_geometries: m.failed_geometries || 0,
    recompute_rows_changed: m.recompute_rows_changed || 0,
    recompute_max_shift_m: Object.prototype.hasOwnProperty.call(m, 'recompute_max_shift_m') ? m.recompute_max_shift_m : null,
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  backlog_count,
  override_force_full_present,
  parcels_processed,
  centroids_computed,
  failed_geometries,
  compute_rate,
  recompute_rows_changed,
  recompute_max_shift_m,
};

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row (never suppress siblings). */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildBackfillMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildBackfillSql = buildBackfillSql;
module.exports.buildFullRecomputeSql = buildFullRecomputeSql;
module.exports.buildPreSql = buildPreSql;
module.exports.buildUpdateSql = buildUpdateSql;
module.exports.buildPostSql = buildPostSql;
module.exports.FAILED_GEOMETRIES_VAR = FAILED_GEOMETRIES_VAR;
module.exports.COMPUTE_RATE_VAR = COMPUTE_RATE_VAR;
module.exports.FULL_RECOMPUTE_BATCH_VAR = FULL_RECOMPUTE_BATCH_VAR;
module.exports.TABLE = TABLE;
