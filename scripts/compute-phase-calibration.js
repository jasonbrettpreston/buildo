#!/usr/bin/env node
/**
 * compute-phase-calibration — phase-level velocity calibration.
 *
 * Reads TWO transition ledgers:
 *   1. permit_phase_transitions (legacy — permit-side; preserved unchanged)
 *   2. lifecycle_transitions (Phase E.2 writer — CoA-side; NEW in Phase E.3)
 *
 * Computes per-cohort percentile statistics (median, p25, p75 days in phase)
 * and writes them to `phase_stay_calibration` for downstream consumers.
 *
 * Permit-side cohorts: legacy 2-tuple key (permit_type, from_phase).
 * CoA-side cohorts:    granular 5-tuple key (NULL, project_type, coa_type_class,
 *                      from_seq, to_seq) — Spec 42 §6.7 step 6 + Spec 84 §8.7
 *                      cohort blind-spot.
 *
 * Phase E.3 v5 fold trail:
 *   - v3 fold v2-G/v2-E: legacy PK + NOT NULL constraints dropped via mig 147.
 *   - v3 fold v3-G-HIGH-3 + v3-DS-MED-1: CoA aggregate does NOT filter
 *     `coa_type_class IS NOT NULL` or `project_type IS NOT NULL` — both are
 *     data-destructive when Phase D classify-coa-scope.js is incomplete.
 *     Observability via two new audit metrics:
 *       (a) coa_type_class_null_transition_count (>5% WARN — v5 fold v4-C1
 *           CRIT: separate SQL query, NOT a loop counter, since aggregate
 *           buckets collapse NULL rows).
 *       (b) unknown_cohort_count (>0 WARN — v3 fold v2-G-3 defensive).
 *   - v3 fold v3-G-CRIT: atomic temp-table swap replaces DELETE+INSERT.
 *     TRUNCATE inside withTransaction holds ACCESS EXCLUSIVE for the full
 *     transaction; readers block but never see an empty table.
 *   - v3 fold #6 (Observability N): audit_table.verdict DERIVED from row
 *     statuses per Spec 47 §R10 (fixes pre-existing hardcoded-counter bug).
 *   - v5 fold v4-H1: coa_transition_count query gets seq-range filter to
 *     match aggregate population for metric/aggregate reconcilability.
 *   - v5 fold v4-H2: coa_applications query wrapped in information_schema
 *     EXISTS guard to prevent advisory-lock leak on missing-table crash.
 *   - v5 fold v4-M3: bucket-count safety cap at 5000 (param-limit headroom).
 *
 * Closes Spec 84 bug 84-W4 ("Dead Transition Write: Ledger is written but not
 * used") for both ledgers. The inspector's lifecycle.timeline[] panel reads
 * this table for cohort comparisons.
 *
 * Idempotent: re-runs recompute the entire table from current ledger state via
 * atomic CREATE TEMP TABLE → INSERT staging → TRUNCATE + INSERT FROM staging
 * (single transaction).
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 + §8.7
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6 + §6.11 Phase E.3
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

// Spec 47 §R2 — advisory lock 93. Owning spec 84 is taken by
// classify-lifecycle-phase.js (the E.2 ledger writer); 93 is the
// registry-assigned free ID for this consumer.
const ADVISORY_LOCK_ID = 93;

const LOGIC_VARS_SCHEMA = z.object({
  calibration_freshness_warn_hours: z.coerce.number().finite().positive(),
}).passthrough();

// Phase E.3 v5 — canonical column list for phase_stay_calibration writes.
// Order MUST match the staging INSERT VALUES placeholders; flattenBuckets
// uses NAME-based lookup so SQL SELECT-list reordering is safe.
const COHORT_INSERT_COLS = Object.freeze([
  'permit_type',
  'project_type',
  'coa_type_class',
  'from_seq',
  'to_seq',
  'phase',
  'median_days',
  'p25_days',
  'p75_days',
  'sample_size',
  'computed_at',
]);

// Sample-size tier boundaries — exported for unit testing.
function classifyTier(sampleSize) {
  if (sampleSize >= 100) return 'high';
  if (sampleSize >= 30)  return 'mid';
  if (sampleSize >= 10)  return 'low';
  return 'outlier';
}

// Phase E.3 v5 (v2 fold #4) — placeholder generation by column count.
// Eliminates off-by-one risk from manual `$${base + N}` arithmetic.
//
// v6 fold v5-D-2 (Independent Issue 1 — conf 82): defensive guard against
// rowCount=0. The legacy implementation would produce `INSERT INTO t (a) VALUES `
// (no tuples, trailing space), a SQL syntax error. Callers MUST guard against
// the empty case before invocation; this throw makes the contract explicit.
function buildBulkInsertSQL(table, cols, rowCount) {
  if (rowCount <= 0) {
    throw new Error(
      `buildBulkInsertSQL: rowCount must be > 0 (got ${rowCount}). ` +
      `Caller must guard the empty case before invocation.`
    );
  }
  const tuples = [];
  for (let i = 0; i < rowCount; i++) {
    const base = i * cols.length;
    const placeholders = cols.map((_, j) => `$${base + j + 1}`).join(', ');
    tuples.push(`(${placeholders})`);
  }
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${tuples.join(', ')}`;
}

// Phase E.3 v5 fold v3-G-MED-1 — name-based lookup (NOT positional).
// Robust against future SQL SELECT-list reordering: the SELECT must use the
// COHORT_INSERT_COLS names exactly, but column ORDER in the SELECT is irrelevant.
function flattenBuckets(buckets, runAt) {
  return buckets.flatMap((b) =>
    COHORT_INSERT_COLS.map((col) => (col === 'computed_at' ? runAt : (b[col] ?? null)))
  );
}

if (require.main === module) {
  pipeline.run('compute-phase-calibration', async (pool) => {
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      // §R3.5 — capture DB clock once; reused for every timestamp written.
      const RUN_AT = await pipeline.getDbTimestamp(pool);

      // §R4 — config load + Zod validation
      const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-phase-calibration');
      const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'compute-phase-calibration');
      if (!validation.valid) {
        throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
      }

      // ─── §R5 + v5 fold v4-H2 — startup guards ──────────────────────
      // Validate dependent table existence before running queries that would
      // otherwise crash with `relation does not exist` and leak the advisory lock.

      // Guard #1: lifecycle_transitions (E.2 writer output — required for CoA aggregate)
      const { rows: [{ exists: ltExists }] } = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'lifecycle_transitions') AS exists`
      );
      if (!ltExists) {
        throw new Error(
          '[compute-phase-calibration] lifecycle_transitions table missing — ' +
          'apply Phase B migration 134 first.'
        );
      }

      // v6 fold v5-D-3 (DeepSeek HIGH #2): phase_stay_calibration target EXISTS guard.
      // The staging swap's CREATE TEMP TABLE (LIKE phase_stay_calibration ...) and
      // the final INSERT INTO phase_stay_calibration ... would crash with relation-
      // not-exist if mig 123 + 135 + 147 are not applied. The advisory lock is
      // released by pipeline.withAdvisoryLock's try/finally on error, but the error
      // message would be unhelpful. Explicit guard with clear migration hint.
      const { rows: [{ exists: pscExists }] } = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'phase_stay_calibration') AS exists`
      );
      if (!pscExists) {
        throw new Error(
          '[compute-phase-calibration] phase_stay_calibration target table missing — ' +
          'apply migrations 123, 135, and 147 first.'
        );
      }

      // Guard #2: differentiate "E.2 hasn't produced CoA rows yet" vs "table populated"
      const { rows: [{ n: coaCount }] } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM lifecycle_transitions WHERE lead_id LIKE 'coa:%'`
      );
      if (coaCount === 0) {
        pipeline.log.warn('[compute-phase-calibration]',
          'lifecycle_transitions has zero CoA-side rows — E.2 first run has not yet produced ' +
          'CoA transitions. coa_cohort_count will be 0 (expected pre-E.2 first-run state).');
      } else {
        pipeline.log.info('[compute-phase-calibration]',
          `lifecycle_transitions has ${coaCount.toLocaleString()} CoA-side rows; expecting CoA cohorts.`);
      }

      // Guard #3 + v5 fold v4-H2: coa_applications EXISTS check. Skip the Phase D
      // coverage guard if the table is missing rather than crashing the script.
      const { rows: [{ exists: coaAppsExists }] } = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'coa_applications') AS exists`
      );
      let projectTypeCoveragePct = null;
      let ltProjectTypeCoveragePct = null;
      if (coaAppsExists) {
        const { rows: [{ pct }] } = await pool.query(
          `SELECT COALESCE(
             ROUND(100.0 * COUNT(*) FILTER (WHERE project_type IS NOT NULL) / NULLIF(COUNT(*), 0))::int,
             0) AS pct
             FROM coa_applications`
        );
        projectTypeCoveragePct = pct;
        // Dual-source: measure what the CoA aggregate ACTUALLY reads. A CoA
        // application could have project_type set today but ALL its historical
        // lifecycle_transitions rows were written by E.2 before Phase D ran.
        const { rows: [{ pct: ltPct }] } = await pool.query(
          `SELECT COALESCE(
             ROUND(100.0 * COUNT(*) FILTER (WHERE project_type IS NOT NULL) / NULLIF(COUNT(*), 0))::int,
             0) AS pct
             FROM lifecycle_transitions
            WHERE lead_id LIKE 'coa:%'`
        );
        ltProjectTypeCoveragePct = ltPct;
      } else {
        pipeline.log.warn('[compute-phase-calibration]',
          'coa_applications table missing — Phase D migrations not yet applied. ' +
          'Skipping project_type coverage guard; audit metric will report null.');
      }
      if (projectTypeCoveragePct != null && projectTypeCoveragePct < 50) {
        pipeline.log.warn('[compute-phase-calibration]',
          `coa_applications.project_type coverage ${projectTypeCoveragePct}% (< 50%) — ` +
          `Phase D classify-coa-scope.js may not have run. Verify Phase D execution.`);
      }
      if (
        ltProjectTypeCoveragePct != null && projectTypeCoveragePct != null &&
        ltProjectTypeCoveragePct < projectTypeCoveragePct - 10
      ) {
        pipeline.log.warn('[compute-phase-calibration]',
          `lifecycle_transitions.project_type coverage ${ltProjectTypeCoveragePct}% lags ` +
          `coa_applications by >10% — old transitions predate Phase D. CoA cohort buckets ` +
          `may be sparse until E.2 reclassifies all CoA rows (next dirty run).`);
      }

      // ─── §R7 + §R8 — Aggregate SQL (permit-side preserved + CoA-side ADD) ───
      //
      // Permit-side: legacy 2-tuple cohort structure PRESERVED. v3 fold #8
      // adds `, id` tiebreaker to the LAG window for deterministic ordering
      // across tied transitioned_at values (idempotency).
      //
      // ROUND() before ::INTEGER cast — Postgres casts truncate, which would
      // systematically bias every cohort downward. Critical for stall-detection
      // accuracy.
      const permitAggSql = `
        WITH transitions_with_duration AS (
          SELECT
            permit_num,
            revision_num,
            permit_type,
            from_phase,
            transitioned_at,
            transitioned_at - LAG(transitioned_at) OVER (
              PARTITION BY permit_num, revision_num ORDER BY transitioned_at, id
            ) AS phase_duration
          FROM permit_phase_transitions
        ),
        twd AS (
          SELECT *, EXTRACT(EPOCH FROM phase_duration) / 86400.0 AS duration_days
            FROM transitions_with_duration
           WHERE from_phase IS NOT NULL AND permit_type IS NOT NULL AND phase_duration IS NOT NULL
        )
        SELECT
          permit_type,
          NULL::VARCHAR(50)  AS project_type,
          NULL::VARCHAR(30)  AS coa_type_class,
          NULL::INTEGER      AS from_seq,
          NULL::INTEGER      AS to_seq,
          from_phase         AS phase,
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS median_days,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p25_days,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p75_days,
          COUNT(*)::INTEGER  AS sample_size
        FROM twd
        GROUP BY permit_type, from_phase
      `;

      // CoA-side — NEW. Reads from lifecycle_transitions. 5-tuple cohort key:
      // (NULL permit_type, project_type, coa_type_class, from_seq, to_seq).
      //
      // WHERE clause is the conjunction of two predicates (BOTH must hold):
      //   1. lead_id LIKE 'coa:%' — canonical CoA lead discriminator.
      //   2. (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22) — intrinsic
      //      CoA seq range per Spec 84 §2.5.c (22 CoA statuses). The OR inside
      //      this predicate broadens it to "transition originates from OR
      //      terminates in the CoA seq range" — but the outer AND with the
      //      lead_id LIKE guard prevents this from broadening to non-CoA rows.
      //      Defense-in-depth: a permit-side row with an accidentally-CoA-shaped
      //      seq would still be excluded by the lead_id LIKE filter.
      //   - NO filter on project_type or coa_type_class — v3 fold v2-DS-1 +
      //     v3 fold v3-G-HIGH-3 removed both filters as data-destructive.
      //     Replacement observability: coa_type_class_null_transition_count
      //     (>5% WARN) + unknown_cohort_count (>0 WARN).
      //
      // MIN(from_phase) is the legacy column aggregate for backward-compat;
      // the GROUP BY is the 5-tuple cohort key, NOT from_phase.
      const coaAggSql = `
        WITH coa_transitions_with_duration AS (
          SELECT
            lt.lead_id,
            lt.project_type,
            lt.coa_type_class,
            lt.from_seq,
            lt.to_seq,
            lt.from_phase,
            lt.transitioned_at,
            lt.transitioned_at - LAG(lt.transitioned_at) OVER (
              PARTITION BY lt.lead_id
              ORDER BY lt.transitioned_at, lt.id
            ) AS phase_duration
          FROM lifecycle_transitions lt
          WHERE lt.lead_id LIKE 'coa:%'
            AND (lt.from_seq BETWEEN 1 AND 22 OR lt.to_seq BETWEEN 1 AND 22)
        ),
        ctwd AS (
          SELECT *, EXTRACT(EPOCH FROM phase_duration) / 86400.0 AS duration_days
            FROM coa_transitions_with_duration
           WHERE phase_duration IS NOT NULL
             AND from_seq IS NOT NULL AND to_seq IS NOT NULL
        )
        SELECT
          NULL::VARCHAR(50)  AS permit_type,
          project_type,
          coa_type_class,
          from_seq,
          to_seq,
          MIN(from_phase)    AS phase,
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS median_days,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p25_days,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p75_days,
          COUNT(*)::INTEGER  AS sample_size
        FROM ctwd
        GROUP BY project_type, coa_type_class, from_seq, to_seq
      `;

      const permitRes = await pool.query(permitAggSql);
      const coaRes    = await pool.query(coaAggSql);
      const permitBuckets = permitRes.rows;
      const coaBuckets    = coaRes.rows;
      const allBuckets    = [...permitBuckets, ...coaBuckets];

      // ─── §R10 records_total — count source transitions evaluated ───
      const sourceRowsEvaluated = allBuckets.reduce((sum, b) => sum + b.sample_size, 0);

      // ─── Tier counters + cohort-type counters ──────────────────────
      let highVolumeBuckets    = 0;
      let midVolumeBuckets     = 0;
      let lowVolumeBuckets     = 0;
      let outlierBuckets       = 0;
      let permitCohortCount    = 0;
      let coaCohortCount       = 0;
      let unreliableBuckets    = 0;
      let unknownCohortCount   = 0;
      const permitTypesSeen    = new Set();
      const phasesSeen         = new Set();

      for (const b of allBuckets) {
        if (b.permit_type != null) {
          permitCohortCount++;
          permitTypesSeen.add(b.permit_type);
        } else if (b.coa_type_class != null || b.project_type != null) {
          // v6 fold v5-D-1 (convergent Independent #4 + Observability #1 — conf 80+83):
          // Count partially-classified CoA buckets as CoA cohorts. A bucket where
          // Phase D set project_type but not coa_type_class is still a CoA cohort
          // (partial classification is a Phase D coverage signal observable via
          // coa_type_class_null_transition_count, not a reason to demote the bucket
          // to "unknown"). Previously this branch only checked coa_type_class, which
          // caused coaCohortCount to undercount when Phase D was partially complete.
          coaCohortCount++;
        } else {
          // v3 fold v2-G-3: both permit_type AND coa_type_class AND project_type NULL
          // means a CoA row where Phase D never classified the underlying coa_application
          // (or a structural SQL bug producing all-null buckets — defense-in-depth).
          unknownCohortCount++;
        }
        if (b.phase != null) phasesSeen.add(b.phase);
        const tier = classifyTier(b.sample_size);
        if      (tier === 'high')    highVolumeBuckets++;
        else if (tier === 'mid')     midVolumeBuckets++;
        else if (tier === 'low')     lowVolumeBuckets++;
        else                          outlierBuckets++;
        if (b.sample_size < 30) unreliableBuckets++;
      }

      // v5 fold v4-M3 — bucket-count safety cap. Param ceiling for the staging
      // INSERT is 65535 / 11 cols ≈ 5955 rows; cap at 5000 for headroom.
      if (allBuckets.length > 5000) {
        throw new Error(
          `[compute-phase-calibration] bucket count ${allBuckets.length} exceeds 5000-row safety cap ` +
          `(param-limit headroom). CoA cardinality has grown; sub-batching deferred to Phase F.`
        );
      }

      // v5 fold v4-H1 — coa_transition_count with seq-range filter to match
      // the CoA aggregate's population. Without this, the count and the
      // aggregate become non-reconcilable for operators.
      const { rows: [{ n: coaTransitionCount }] } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM lifecycle_transitions
          WHERE lead_id LIKE 'coa:%'
            AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`
      );

      // v5 fold v4-C1 CRIT — dedicated SQL query for coaTypeClassNullTransitionCount.
      // The aggregate buckets collapse NULL coa_type_class rows into a single
      // bucket, so a JS loop over allBuckets cannot count individual NULL
      // transitions. Filter matches coa_transition_count for ratio reconcilability.
      const { rows: [{ n: coaTypeClassNullTransitionCount }] } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM lifecycle_transitions
          WHERE lead_id LIKE 'coa:%'
            AND coa_type_class IS NULL
            AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`
      );

      // ─── §R9 + v5 fold v3-G-CRIT — atomic temp-table swap ─────────
      // Replaces the pre-E.3 DELETE+INSERT pattern. TRUNCATE inside the
      // withTransaction block holds ACCESS EXCLUSIVE for the full transaction;
      // concurrent readers block on the lock but never observe an empty table.
      // Empty-state visibility window = zero (corrected from the inaccurate
      // "<1ms" framing in v4 draft).
      await pipeline.withTransaction(pool, async (client) => {
        if (allBuckets.length === 0) {
          await client.query('TRUNCATE phase_stay_calibration');
          return;
        }
        await client.query(
          'CREATE TEMP TABLE phase_stay_calibration_staging ' +
          '(LIKE phase_stay_calibration INCLUDING DEFAULTS) ON COMMIT DROP'
        );
        const stagingInsertSql = buildBulkInsertSQL(
          'phase_stay_calibration_staging',
          COHORT_INSERT_COLS,
          allBuckets.length,
        );
        const params = flattenBuckets(allBuckets, RUN_AT);
        await client.query(stagingInsertSql, params);
        await client.query('TRUNCATE phase_stay_calibration');
        await client.query(
          'INSERT INTO phase_stay_calibration SELECT * FROM phase_stay_calibration_staging'
        );
        // Temp table dropped on COMMIT via ON COMMIT DROP.
      });

      // ─── §R10 — audit_table (15 rows / 6 thresholded) ─────────────
      const auditRows = [
        // 4 existing — preserved unchanged
        { metric: 'total_buckets',           value: allBuckets.length,    threshold: '>= 1', status: allBuckets.length >= 1 ? 'PASS' : 'FAIL' },
        { metric: 'permit_types_calibrated', value: permitTypesSeen.size, threshold: null,   status: 'INFO' },
        { metric: 'phases_calibrated',       value: phasesSeen.size,      threshold: null,   status: 'INFO' },
        // v3 fold v2-O-L/Indep F: unreliable_buckets PRESERVED + documented overlap.
        // NOTE: by definition `unreliable_buckets = low_volume_buckets + outlier_buckets`.
        { metric: 'unreliable_buckets',      value: unreliableBuckets,    threshold: '< 30 sample_size triggers WARN; equals low+outlier by definition (do not sum)', status: unreliableBuckets > 0 ? 'WARN' : 'INFO' },
        // 7 new INFO — granular cohort observability
        { metric: 'permit_cohort_count',     value: permitCohortCount,    threshold: null,   status: 'INFO' },
        { metric: 'coa_cohort_count',        value: coaCohortCount,       threshold: null,   status: 'INFO' },
        { metric: 'coa_transition_count',    value: coaTransitionCount,   threshold: null,   status: 'INFO' },
        { metric: 'high_volume_buckets',     value: highVolumeBuckets,    threshold: null,   status: 'INFO' },
        { metric: 'mid_volume_buckets',      value: midVolumeBuckets,     threshold: null,   status: 'INFO' },
        { metric: 'low_volume_buckets',      value: lowVolumeBuckets,     threshold: null,   status: 'INFO' },
        { metric: 'outlier_buckets',         value: outlierBuckets,       threshold: null,   status: 'INFO' },
        // 4 new thresholded WARN gates
        // v6 fold v5-D-4 (Observability Issue 2 — conf 80): descriptor wording clarified.
        // The metric WARN fires for multiple legitimate causes — not only "E.2 hasn't run."
        // Operators see WARN here when ANY of: (1) E.2 first run hasn't produced CoA
        // transitions yet; (2) Phase D is fully incomplete (project_type + coa_type_class
        // both NULL — rows route to unknown_cohort_count instead); or (3) seq-range filter
        // excludes all CoA transitions. See co-firing note in operator pre-ack runbook.
        { metric: 'coa_cohort_presence',     value: coaCohortCount,       threshold: '>= 1 (WARN = E.2 not yet run, OR Phase D fully incomplete, OR seq-range excludes all CoA transitions — see co-firing note)', status: coaCohortCount >= 1 ? 'PASS' : 'WARN' },
        { metric: 'coa_project_type_coverage_pct', value: projectTypeCoveragePct, threshold: '>= 50 PASS, < 50 WARN', status: projectTypeCoveragePct == null ? 'INFO' : (projectTypeCoveragePct >= 50 ? 'PASS' : 'WARN') },
        { metric: 'unknown_cohort_count',    value: unknownCohortCount,   threshold: '== 0 PASS, > 0 WARN', status: unknownCohortCount === 0 ? 'PASS' : 'WARN' },
        // v5 fold v4-L1: value field stores absolute count for triage; status computes ratio relative to coa_transition_count.
        { metric: 'coa_type_class_null_transition_count', value: coaTypeClassNullTransitionCount, threshold: 'ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage', status: coaTransitionCount === 0 || (coaTypeClassNullTransitionCount / coaTransitionCount) <= 0.05 ? 'PASS' : 'WARN' },
      ];
      // TOTAL: 15 rows / 6 thresholded (total_buckets FAIL + unreliable_buckets WARN +
      // coa_cohort_presence WARN + coa_project_type_coverage_pct WARN +
      // unknown_cohort_count WARN + coa_type_class_null_transition_count WARN).

      // v3 fold v2-O-N: verdict DERIVED from row statuses per Spec 47 §R10.
      // Replaces the pre-existing hardcoded-counter bug at the legacy script's line 155.
      const auditVerdict =
        auditRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
        auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

      pipeline.emitSummary({
        records_total: sourceRowsEvaluated,
        records_new: allBuckets.length,
        records_updated: 0,
        records_meta: {
          audit_table: {
            phase: 84,
            name: 'Phase Calibration',
            verdict: auditVerdict,
            rows: auditRows,
          },
          // Spec 48 §3.2 — distributions in records_meta NOT passed to DeepSeek context.
          // Surfaced for manual operator SQL inspection only.
          sample_size_distribution: {
            high:    highVolumeBuckets,
            mid:     midVolumeBuckets,
            low:     lowVolumeBuckets,
            outlier: outlierBuckets,
          },
          cohort_dimension_coverage: {
            permit_type_non_null:    permitCohortCount,
            coa_type_class_non_null: coaCohortCount,
            project_type_non_null:   allBuckets.filter((b) => b.project_type != null).length,
            from_seq_non_null:       allBuckets.filter((b) => b.from_seq != null).length,
            to_seq_non_null:         allBuckets.filter((b) => b.to_seq != null).length,
          },
          coa_project_type_coverage_pct:       projectTypeCoveragePct,
          coa_lt_project_type_coverage_pct:    ltProjectTypeCoveragePct,
        },
      });

      // §R11 — emitMeta (reads + writes)
      pipeline.emitMeta(
        {
          permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type', 'id'],
          lifecycle_transitions:    ['lead_id', 'from_phase', 'to_phase', 'from_seq', 'to_seq', 'transitioned_at', 'project_type', 'coa_type_class', 'id'],
          coa_applications:         ['project_type'],
        },
        {
          phase_stay_calibration: COHORT_INSERT_COLS,
        },
      );
    }); // withAdvisoryLock

    if (!lockResult.acquired) return;
  });
}

module.exports = {
  ADVISORY_LOCK_ID,
  COHORT_INSERT_COLS,
  buildBulkInsertSQL,
  flattenBuckets,
  classifyTier,
};
