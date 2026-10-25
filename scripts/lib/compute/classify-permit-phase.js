'use strict';
/**
 * COMPUTE for `classify_permit_phase` (C6-2 commit ②; Spec 132 §core.9 (R-BZ), §x-stages.2 (R-EQ)).
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (step 4 of the permits chain)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.6, core.8, core.9, core.12, core.14
 *
 * WHAT THIS STEP DOES: one guarded set-based UPDATE that sets permits.enriched_status = 'Examination'
 * on base-revision 'Inspection' permits with no real issued_date. It is not a construction-phase
 * classifier (CPP-D9). The statement text, the guard and the scope are the legacy ones
 * (scripts/classify-permit-phase.js:53-63); the epoch-default cutoff is the pinned variable
 * classify_permit_phase_issued_date_floor_year (CPP-D3) and the lock is identity.lock.
 *
 * Compute is pure: no clock of its own (ctx.clock), no transaction or lock (the runner's shared
 * phase transaction and identity.lock), no verdict (the runner derives it from the four INFO rows),
 * no env. The one write goes through ctx.joinUpdate (class N, set_based_join_update). The reads
 * are SELECT constants on the client / pool the runner hands in (gate E G5: a resolved SELECT
 * literal is not a site; the geocode_permits form).
 *
 * Vocabulary constants (declared in classify-permit-phase.notes.json, not tunables): the CKAN status
 * word 'Inspection', the derived value 'Examination' and the base revision key '00'.
 */

/**
 * The scope predicate, shared by the eligible count and the UPDATE (pinned L3). `$1` in the count
 * and `$2` in the UPDATE is classify_permit_phase_issued_date_floor_year. issued_date is a DATE
 * column (src/lib/db/generated/schema.ts:2126), so `issued_date <= make_date(1970, 1, 1)` selects
 * exactly the rows the legacy epoch-date comparison (frozen oracle :46, :59) selected.
 */
const ELIGIBLE_SQL = `
    SELECT COUNT(*) AS cnt FROM permits
     WHERE status = 'Inspection'
       AND revision_num = '00'
       AND (issued_date IS NULL OR issued_date <= make_date($1::int, 1, 1))
`;

/**
 * The legacy UPDATE (scripts/classify-permit-phase.js:53-63), ported verbatim except the cutoff.
 * The guard is enriched_status alone (outputs.writes[0].write_discipline.guard_columns): last_seen_at
 * is the run clock and moves only on rows whose enriched_status changes (pinned L2; card CPP-Q1
 * keeps the bump as a declared deviation). No RETURNING: ctx.joinUpdate returns the rowCount.
 */
function buildClassifySql() {
  return `
      UPDATE permits
      SET enriched_status = 'Examination',
          last_seen_at = $1::timestamptz
      WHERE status = 'Inspection'
        AND revision_num = '00'
        AND (issued_date IS NULL OR issued_date <= make_date($2::int, 1, 1))
        AND enriched_status IS DISTINCT FROM 'Examination'
  `;
}

/**
 * The cumulative stats, read on the step's pool after COMMIT (legacy :70-77). The denominator is
 * every base-revision 'Inspection' permit with no issued_date clause (3a074eea; pinned L3).
 */
const STATS_SQL = `
    SELECT
      COUNT(*) FILTER (WHERE enriched_status = 'Examination') AS total_examination,
      COUNT(*) AS total_inspection
    FROM permits
    WHERE status = 'Inspection'
      AND revision_num = '00'
`;

/** Phase `classify` (writes_ref 0), inside the runner's shared transaction. */
async function runClassifyPass(client, ctx, config) {
  const floorYear = config.classify_permit_phase_issued_date_floor_year;
  const eligible = await client.query(ELIGIBLE_SQL, [floorYear]);
  const updated = await ctx.joinUpdate(0, buildClassifySql(), [ctx.clock.now(), floorYear]);
  ctx.onProgress(updated);
  return { eligible_pool: Number(eligible.rows[0].cnt), updated };
}

/**
 * The post-phase observation block (execution.enrich_hooks.post_phase), called once after COMMIT on
 * the step's pool. `matched` carries one key per declared check; `matched.compute` carries the
 * counter sources (the geocode_permits "declare the root that resolves" form).
 */
async function computePostPhase(pool, { passRaw }) {
  const pass = passRaw.classify || {};
  const stats = await pool.query(STATS_SQL);
  const s = stats.rows[0];
  const totalExamination = Number(s.total_examination);
  const totalInspection = Number(s.total_inspection);
  const examinationClassified = Number(pass.updated || 0);
  // The division guard (pinned L9). A number now, not the legacy display string (CPP-D7).
  const examinationRate = totalInspection > 0 ? (totalExamination / totalInspection) * 100 : 0;
  return {
    matched: {
      examination_classified: examinationClassified,
      total_examination: totalExamination,
      total_inspection: totalInspection,
      examination_rate: examinationRate,
    },
    compute: {
      eligible_pool: Number(pass.eligible_pool || 0),
      records_new_aggregate: 0,
      examination_classified: examinationClassified,
    },
  };
}

// One function per declared check, keys === descriptor.checks[].id in declaration order. Each reports
// the measured value; none judges (all four are INFO, Spec 132 §core.6; CPP-D2).
function examination_classified(ctx) {
  ctx.report('examination_classified', { violations: 0, detail: ctx.matched.examination_classified });
}
function total_examination(ctx) {
  ctx.report('total_examination', { violations: 0, detail: ctx.matched.total_examination });
}
function total_inspection(ctx) {
  ctx.report('total_inspection', { violations: 0, detail: ctx.matched.total_inspection });
}
function examination_rate(ctx) {
  ctx.report('examination_rate', { violations: 0, detail: ctx.matched.examination_rate });
}

const CHECKS = { examination_classified, total_examination, total_inspection, examination_rate };

/** The legacy records_meta keys (pinned L6), from the runner's timing and the measured counts. */
function buildMeta(ctx) {
  const m = ctx.matched;
  return {
    duration_ms: ctx.elapsed_ms,
    examination_classified: m.examination_classified,
    total_examination: m.total_examination,
    total_inspection: m.total_inspection,
  };
}

/** Run the selected checks. A self-skip or a config refusal has no post-phase block: emit nothing measured. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    await check(ctx);
  }
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildMeta(ctx) };
}

const passes = [{ name: 'classify', txn: 'shared', run: runClassifyPass }];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  ELIGIBLE_SQL,
  STATS_SQL,
  buildClassifySql,
  runClassifyPass,
  computePostPhase,
  buildMeta,
  passes,
});
