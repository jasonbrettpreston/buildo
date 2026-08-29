/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §Bridge (PRIMARY)
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4 (SECONDARY)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (compute dispatch), §1.10 (MATERIALIZER)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 1 nothing hidden, Rule 2 compute is JUST compute)
 *
 * Pilot 5 — `link_parcel_addresses`'s compute: the VERBATIM-PORTED
 * INSERT...SELECT...JOIN ST_Within...ON CONFLICT DO NOTHING SQL builder (G2's
 * "verbatim" guarantee — LG-18's class-D write, `scripts/lib/step/write.js
 * executeInsertSelectNoRetract`) plus the pure check observers. NO fs/pg/pipeline
 * require, NO process.argv/process.env, opens NO pool — Rule 2.
 *
 * ⚠️ LPA-D1 (the W3 retraction breach, PINNED per Spec 123 §3.1): the join predicate
 * below is IDENTICAL to the pre-conversion script's (:161-182) — `parcel_address_points`
 * guarantees the AP geom is inside the parcel AT WRITE TIME, and nothing here (or
 * anywhere in this pilot) re-evaluates or removes a row once an upstream geom edit makes
 * that stale. `parcel_address_points_stale_st_within_count` (below) makes the live
 * exposure of that defect OBSERVABLE every run — the fix itself is a separate, future
 * ruling, never silently bundled into this conversion.
 */
'use strict';

/** T1 (batch size — not verdict-affecting, on_invalid "clamp"). */
const BATCH_SIZE_VAR = 'link_parcel_addresses_batch_size';
/** T4 (non-CONDO per-parcel fan-out ceiling — Fold B's honest aggregate, replacing the dropped 5-id allow-list). */
const FANOUT_NONCONDO_VAR = 'link_parcel_addresses_fanout_warn_noncondo';
/** T5 (CONDO per-parcel fan-out ceiling). */
const FANOUT_CONDO_VAR = 'link_parcel_addresses_fanout_warn_condo';
/** T6 (LPA-D5, WF3-B — Structure-class link-rate floor). */
const STRUCTURE_LINK_RATE_VAR = 'link_parcel_addresses_structure_link_rate_warn_pct';
/** T7 (LPA-D5, WF3-B — RD/RS zone-aware per-parcel fan-out ceiling, T4's declared retighten target). */
const FANOUT_RD_RS_VAR = 'link_parcel_addresses_fanout_warn_rd_rs';

const TABLE = 'parcel_address_points';

/**
 * The pre-run counts — verbatim port of the pre-conversion script's `pre` query
 * (`link-parcel-addresses.js:123-129`, before conversion).
 */
function buildPreSql() {
  return `SELECT
    (SELECT COUNT(*) FROM parcels        WHERE geom IS NOT NULL) AS parcels_with_geom,
    (SELECT COUNT(*) FROM parcels        WHERE geom IS     NULL) AS parcels_with_null_geom,
    (SELECT COUNT(*) FROM address_points WHERE geom IS NOT NULL) AS address_points_with_geom,
    (SELECT COUNT(*) FROM address_points WHERE geom IS     NULL) AS address_points_with_null_geom,
    (SELECT COUNT(*) FROM parcel_address_points)                  AS existing_links`;
}

/**
 * ⚠️ G2's "verbatim" GUARANTEE — this text is byte-identical (modulo whitespace) to the
 * pre-conversion script's ONE write statement (`:161-182`). LG-18's
 * `executeInsertSelectNoRetract` refuses any UPDATE/DELETE token and requires the
 * `ON CONFLICT ... DO NOTHING` clause present, checked on THIS text at execution time —
 * so a future edit that silently turns this into a retraction (fixing LPA-D1 without a
 * ruling) throws instead of running.
 *
 * Params: `$1` = the keyset cursor (`lastId`, starts at -1 — idempotent-not-resumable,
 * LPA-D2), `$2` = the batch size (T1, `ctx.config`), `$3` = RUN_AT (library-captured,
 * Spec 47 §R3.5 — the compute never reads a clock, claim #204).
 */
function buildBatchSql() {
  return `WITH parcel_batch AS (
     SELECT id, geom
     FROM parcels
     WHERE geom IS NOT NULL
       AND id > $1
     ORDER BY id
     LIMIT $2
   ),
   ins AS (
     INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
     SELECT pb.id, ap.address_point_id, $3::timestamptz
     FROM parcel_batch pb
     JOIN address_points ap
       ON ap.geom IS NOT NULL
      AND ST_Within(ap.geom, pb.geom)
     ON CONFLICT (parcel_id, address_point_id) DO NOTHING
     RETURNING parcel_id
   )
   SELECT
     (SELECT COUNT(*) FROM ins)          AS new_links,
     (SELECT MAX(id) FROM parcel_batch)  AS max_id,
     (SELECT COUNT(*) FROM parcel_batch) AS rows_in_batch`;
}

/**
 * The post-run counts — verbatim port of the pre-conversion script's `post` query
 * (`:222-232`, before conversion), column-renamed to the descriptor's own check ids
 * (`final_link_count`, not `final_links`; `address_points_with_no_parcel`, not
 * `aps_with_no_parcel`) so the generic merge in `runMaterializePhase` lands them
 * directly onto `ctx.matched` under the names the compute's own checks read.
 */
function buildPostSql() {
  return `SELECT
    (SELECT COUNT(*) FROM parcel_address_points)                                            AS final_link_count,
    (SELECT COUNT(DISTINCT parcel_id) FROM parcel_address_points)                           AS parcels_with_links,
    (SELECT COUNT(DISTINCT address_point_id) FROM parcel_address_points)                    AS aps_with_links,
    (SELECT COUNT(*) FROM parcels p
       WHERE p.geom IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.parcel_id = p.id)) AS parcels_with_no_address,
    (SELECT COUNT(*) FROM address_points ap
       WHERE ap.geom IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.address_point_id = ap.address_point_id))
                                                                                  AS address_points_with_no_parcel,
    (SELECT json_agg(x ORDER BY x.address_class_desc) FROM (
       SELECT ap.address_class_desc,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM parcel_address_points pap WHERE pap.address_point_id = ap.address_point_id
         )) AS linked
       FROM address_points ap
       WHERE ap.geom IS NOT NULL
       GROUP BY ap.address_class_desc
     ) x)                                                                       AS link_rate_by_class,
    (SELECT COUNT(*) FROM address_points ap
       WHERE ap.geom IS NOT NULL AND ap.address_class_desc = 'Structure')       AS structure_class_total,
    (SELECT COUNT(*) FROM address_points ap
       WHERE ap.geom IS NOT NULL AND ap.address_class_desc = 'Structure'
         AND EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.address_point_id = ap.address_point_id))
                                                                                  AS structure_class_linked`;
}

/**
 * LPA-D1 (stale ST_Within, PINNED) + the new missed-link / fan-out invariants (Fold A/B,
 * Reality-Check items a/b). `$1` = T4 (non-CONDO fan-out ceiling), `$2` = T5 (CONDO
 * fan-out ceiling), `$3` = T7 (LPA-D5, WF3-B — RD/RS zone-aware fan-out ceiling) — all
 * `ctx.config`-resolved, never a literal (Rule 3).
 */
function buildInvariantsSql() {
  return `SELECT
    (SELECT COUNT(*) FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       JOIN address_points ap ON ap.address_point_id = pap.address_point_id
       WHERE NOT ST_Within(ap.geom, p.geom))                                    AS stale_st_within_count,
    (SELECT COUNT(*) FROM address_points ap
       JOIN parcels p
         ON p.geom IS NOT NULL AND ap.geom IS NOT NULL AND ST_Within(ap.geom, p.geom)
       WHERE NOT EXISTS (
         SELECT 1 FROM parcel_address_points pap
          WHERE pap.parcel_id = p.id AND pap.address_point_id = ap.address_point_id
       ))                                                                       AS missed_link_count,
    (SELECT COUNT(*) FROM (
       SELECT address_point_id FROM parcel_address_points GROUP BY address_point_id HAVING COUNT(DISTINCT parcel_id) > 1
     ) m)                                                                       AS multi_parcel_address_count,
    (SELECT COUNT(*) FROM (
       SELECT parcel_id, address_point_id FROM parcel_address_points
       GROUP BY parcel_id, address_point_id HAVING COUNT(*) > 1
     ) d)                                                                       AS dup_count,
    (SELECT COALESCE(MAX(fanout), 0) FROM (
       SELECT pap.parcel_id, COUNT(*) AS fanout FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.feature_type = 'CONDO' GROUP BY pap.parcel_id
     ) c1)                                                                      AS fanout_condo_max,
    (SELECT COALESCE(MAX(fanout), 0) FROM (
       SELECT pap.parcel_id, COUNT(*) AS fanout FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.feature_type IS DISTINCT FROM 'CONDO' GROUP BY pap.parcel_id
     ) c2)                                                                      AS fanout_noncondo_max,
    (SELECT COUNT(*) FROM (
       SELECT pap.parcel_id, COUNT(*) AS fanout FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.feature_type IS DISTINCT FROM 'CONDO'
       GROUP BY pap.parcel_id HAVING COUNT(*) > $1
     ) c3)                                                                      AS fanout_noncondo_gt_threshold,
    (SELECT COUNT(*) FROM (
       SELECT pap.parcel_id, COUNT(*) AS fanout FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.feature_type = 'CONDO'
       GROUP BY pap.parcel_id HAVING COUNT(*) > $2
     ) c4)                                                                      AS fanout_condo_gt_threshold,
    (SELECT COUNT(*) FROM (
       SELECT pap.parcel_id, COUNT(*) AS fanout FROM parcel_address_points pap
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.zoning_class IN ('RD', 'RS')
       GROUP BY pap.parcel_id HAVING COUNT(*) > $3
     ) c5)                                                                      AS fanout_rd_rs_gt_threshold`;
}

/**
 * The compute-authored SQL set `runMaterializePhase` (`scripts/lib/step/index.js`)
 * executes, mirroring `buildTierSql`'s split (ruling A-2 option 2). `descriptor` supplies
 * `execution.batch_size_from_config` (peel 8-cutover, LW-D10 class) — the SINGLE
 * declared source of T1's variable name, so a static descriptor scan (§1.2a P4's
 * `fromConfigRefs`) sees the same name this function reads, rather than a JS constant
 * invisible to any descriptor-level check. `BATCH_SIZE_VAR` stays exported for the test
 * harness's own fixtures, but is no longer this function's own source of truth.
 *
 * @param {object} descriptor
 * @param {Record<string, number>} config - `ctx.config`, the resolved T1/T4/T5/T7 values
 */
function buildMaterializeSql(descriptor, config) {
  const batchSizeVar = (descriptor.execution && descriptor.execution.batch_size_from_config) || BATCH_SIZE_VAR;
  return {
    pre_sql: buildPreSql(),
    batch_sql: buildBatchSql(),
    post_sql: buildPostSql(),
    invariants_sql: buildInvariantsSql(),
    invariants_params: [config[FANOUT_NONCONDO_VAR], config[FANOUT_CONDO_VAR], config[FANOUT_RD_RS_VAR]],
    batch_size_config_key: batchSizeVar,
  };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

/** LPA-D4 — the ledger-gated-skip decision, on the record even on a SKIP (mirrors link_wsib's gate_decision exactly). */
function gate_decision(ctx) {
  const g = ctx.gate || {};
  ctx.report('gate_decision', {
    violations: 0,
    detail: { mode: g.mode, reason: g.reason, gated_skip: Boolean(g.skipped) },
  });
}

function parcels_with_geom_pre_run(ctx) {
  const n = (ctx.matched && ctx.matched.parcels_with_geom) || 0;
  ctx.report('parcels_with_geom_pre_run', { violations: 0, detail: n });
}

function address_points_with_geom_pre_run(ctx) {
  const n = (ctx.matched && ctx.matched.address_points_with_geom) || 0;
  ctx.report('address_points_with_geom_pre_run', { violations: 0, detail: n });
}

/** WARN, not FAIL — Phase 2a backfill may be incomplete or the operator may have intentionally skipped some rows. */
function address_points_with_null_geom(ctx) {
  const n = (ctx.matched && ctx.matched.address_points_with_null_geom) || 0;
  ctx.report('address_points_with_null_geom', { violations: n, detail: n });
}

function new_links_written(ctx) {
  const n = (ctx.matched && ctx.matched.new_links_written) || 0;
  ctx.report('new_links_written', { violations: 0, detail: n });
}

/**
 * G10 — the zero-coverage gate. The bridge is the SOLE data path for `link-parcels.js`
 * Strategy 1a and `link-coa-to-parcels.js` Tier 1a — a complete failure (PostGIS
 * extension absent, GIST index dropped, SRID mismatch) silently produces
 * `final_link_count = 0` and the chain proceeds to unlink every permit downstream.
 * FAIL, `blocking:false` (report loudly, never halt — the schema's `blocking:true`
 * requires `when:"pre"`, and this is a `post`-write structural fact).
 */
function final_link_count(ctx) {
  const n = (ctx.matched && ctx.matched.final_link_count) || 0;
  ctx.report('final_link_count', { violations: n === 0 ? 1 : 0, detail: n });
}

function parcels_with_links(ctx) {
  const n = (ctx.matched && ctx.matched.parcels_with_links) || 0;
  ctx.report('parcels_with_links', { violations: 0, detail: n });
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function parcel_link_rate_pct(ctx) {
  const m = ctx.matched || {};
  const total = m.parcels_with_geom || 0;
  const linked = m.parcels_with_links || 0;
  const pct = total > 0 ? round((linked / total) * 100) : 0;
  ctx.report('parcel_link_rate_pct', { violations: 0, detail: `${pct}%` });
}

/** T2 — a config-driven percentage CEILING (a floor on how HEALTHY the corpus is), WARN. */
function parcels_with_no_address_pct(ctx) {
  const m = ctx.matched || {};
  const total = m.parcels_with_geom || 0;
  const linked = m.parcels_with_links || 0;
  const noAddress = Math.max(0, total - linked);
  const pct = total > 0 ? round((noAddress / total) * 100) : 0;
  ctx.report('parcels_with_no_address_pct', { value: pct, detail: `${pct}%` });
}

/** T3 — same shape as T2, the address-points-side complement, WARN. */
function address_points_with_no_parcel_pct(ctx) {
  const m = ctx.matched || {};
  const total = m.address_points_with_geom || 0;
  const noParcel = m.address_points_with_no_parcel || 0;
  const pct = total > 0 ? round((noParcel / total) * 100) : 0;
  ctx.report('address_points_with_no_parcel_pct', { value: pct, detail: `${pct}%` });
}

function errors(ctx) {
  const n = (ctx.matched && ctx.matched.errors) || 0;
  ctx.report('errors', { violations: n, detail: n });
}

/**
 * T4 — Fold B's honest aggregate, replacing the dropped 5-id allow-list: the count of
 * non-CONDO parcels whose fan-out (linked address points) exceeds the declared ceiling
 * (default 20, measured live 130 → this WARNs today, expected — R-H: a standing
 * non-zero population, never FAIL, never silently PASSed away).
 */
function parcel_fanout_outliers(ctx) {
  const n = (ctx.matched && ctx.matched.fanout_noncondo_gt_threshold) || 0;
  ctx.report('parcel_fanout_outliers', { violations: n, detail: n });
}

/** T5 — the CONDO-side ceiling (default 400; measured live max 346, comfortably under). */
function parcel_fanout_condo_outliers(ctx) {
  const n = (ctx.matched && ctx.matched.fanout_condo_gt_threshold) || 0;
  ctx.report('parcel_fanout_condo_outliers', { violations: n, detail: n });
}

/** INFO — the raw fan-out shape (condo/non-condo max + the non-condo outlier count), always reported. */
function parcel_fanout_distribution(ctx) {
  const m = ctx.matched || {};
  ctx.report('parcel_fanout_distribution', {
    violations: 0,
    detail: {
      condo_max: m.fanout_condo_max || 0,
      noncondo_max: m.fanout_noncondo_max || 0,
      noncondo_gt_threshold: m.fanout_noncondo_gt_threshold || 0,
    },
  });
}

/** LPA-D1 — the W3 breach's live exposure, INFO, always observable (Rule 1: nothing hidden). PINNED per Spec 123 §3.1. */
function parcel_address_points_stale_st_within_count(ctx) {
  const n = (ctx.matched && ctx.matched.stale_st_within_count) || 0;
  ctx.report('parcel_address_points_stale_st_within_count', { violations: 0, detail: n });
}

/** Fold A, Reality-Check item b — an in-parcel address point with no bridge row at all (distinct from the "no parcel" complement). */
function parcel_address_points_missed_link_count(ctx) {
  const n = (ctx.matched && ctx.matched.missed_link_count) || 0;
  ctx.report('parcel_address_points_missed_link_count', { violations: 0, detail: n });
}

/** LPA-D5 (WF3-B) — the per-address_class_desc link-rate distribution, INFO, un-thresholded (the companion `structure_class_link_rate_warn` gates only the Structure slice). */
function address_points_link_rate_by_class(ctx) {
  const rows = (ctx.matched && ctx.matched.link_rate_by_class) || [];
  const detail = rows.map((r) => {
    const total = Number(r.total) || 0;
    const linked = Number(r.linked) || 0;
    return {
      class: r.address_class_desc,
      total,
      linked,
      pct: total > 0 ? round((linked / total) * 100) : 0,
    };
  });
  ctx.report('address_points_link_rate_by_class', { violations: 0, detail });
}

/** LPA-D5 (WF3-B) — T6, a config-driven percentage FLOOR (R-N precedent, `pct >=`) on the Structure-class link rate specifically. */
function structure_class_link_rate_warn(ctx) {
  const m = ctx.matched || {};
  const total = m.structure_class_total || 0;
  const linked = m.structure_class_linked || 0;
  const pct = total > 0 ? round((linked / total) * 100) : 0;
  ctx.report('structure_class_link_rate_warn', { value: pct, detail: `${pct}%` });
}

/** LPA-D5 (WF3-B) — T7, T4's declared retighten target: a strictly tighter per-parcel fan-out ceiling scoped to RD/RS-zoned parcels. */
function parcel_fanout_rd_rs_outliers(ctx) {
  const n = (ctx.matched && ctx.matched.fanout_rd_rs_gt_threshold) || 0;
  ctx.report('parcel_fanout_rd_rs_outliers', { violations: n, detail: n });
}

/**
 * The step's `records_meta` block. No self-consumption exists for this step
 * (`emits: "none"`, claim #203) — this is purely descriptive.
 */
function buildMaterializeMeta(ctx) {
  const m = ctx.matched || {};
  return {
    duration_ms: ctx.elapsed_ms,
    batches_processed: m.batches_processed || 0,
    completed_naturally: Boolean(m.completed_naturally),
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  gate_decision,
  parcels_with_geom_pre_run,
  address_points_with_geom_pre_run,
  address_points_with_null_geom,
  new_links_written,
  final_link_count,
  parcels_with_links,
  parcel_link_rate_pct,
  parcels_with_no_address_pct,
  address_points_with_no_parcel_pct,
  errors,
  parcel_fanout_outliers,
  parcel_fanout_condo_outliers,
  parcel_fanout_distribution,
  parcel_address_points_stale_st_within_count,
  parcel_address_points_missed_link_count,
  address_points_link_rate_by_class,
  structure_class_link_rate_warn,
  parcel_fanout_rd_rs_outliers,
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
  return { records_meta: buildMaterializeMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildMaterializeSql = buildMaterializeSql;
module.exports.buildPreSql = buildPreSql;
module.exports.buildBatchSql = buildBatchSql;
module.exports.buildPostSql = buildPostSql;
module.exports.buildInvariantsSql = buildInvariantsSql;
module.exports.BATCH_SIZE_VAR = BATCH_SIZE_VAR;
module.exports.FANOUT_NONCONDO_VAR = FANOUT_NONCONDO_VAR;
module.exports.FANOUT_CONDO_VAR = FANOUT_CONDO_VAR;
module.exports.STRUCTURE_LINK_RATE_VAR = STRUCTURE_LINK_RATE_VAR;
module.exports.FANOUT_RD_RS_VAR = FANOUT_RD_RS_VAR;
module.exports.TABLE = TABLE;
