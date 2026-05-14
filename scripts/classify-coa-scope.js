#!/usr/bin/env node
/**
 * Classify CoA applications by scope via description-keyword analysis.
 *
 * Writes 5 derived columns to `coa_applications` per Spec 42 §6.6.D:
 *   - coa_type_class  (residential / commercial / institutional / mixed / NULL)
 *   - project_type    (NewConstruction / Addition / Alteration / Demolition /
 *                      Severance / Mixed / NULL)
 *   - scope_tags      (TEXT[] from ~30-tag reduced taxonomy, or NULL)
 *   - scope_classified_at  (RUN_AT)
 *   - scope_source    ('description' constant)
 *
 * Pure classifier extracted to scripts/lib/coa-scope-classifier.js with TS twin
 * at src/lib/classification/coa-scope-classifier.ts (Spec 84 §7 dual-path).
 *
 * Observability:
 *   - Structured logging via pipeline.log (Spec 00 §6.1)
 *   - audit_table with per-tier metrics: scope_classified_pct,
 *     unmapped_scope_count, project_type_distribution, coa_type_class_distribution
 *   - Day-1 threshold via logic_variables.coa_scope_unmapped_threshold_pct
 *     (WARN, not FAIL)
 *
 * Usage:
 *   node scripts/classify-coa-scope.js
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5 + §6.6.D + §6.8 row 666
 *            docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { classifyCoaScope } = require('./lib/coa-scope-classifier');

// §R2 — advisory lock 4202 (Spec 42 §6.8 Phase D allocation)
const ADVISORY_LOCK_ID = 4202;

// §R4 — Zod schema for required logic_variables
const LOGIC_VARS_SCHEMA = z.object({
  coa_scope_unmapped_threshold_pct: z.coerce.number().finite().nonnegative().max(100),
}).passthrough();

// WF3 #r5-3-observability-fixes BUG-4: Spec 47 §6.3 mandates the formula
// `Math.floor(65535 / COL_COUNT)` to prevent silent param-limit violations
// as columns are added. flushBatch emits 4 params per row (id, coa_type_class,
// project_type, scope_tags) + 1 shared RUN_AT. The Math.min(1000, ...) cap is
// memory-bounded, not param-bounded — keeping in-memory batch staging modest.
const COA_SCOPE_COL_COUNT = 4;
const UPDATE_BATCH_SIZE = Math.min(1000, Math.floor(65535 / COA_SCOPE_COL_COUNT));

pipeline.run('classify-coa-scope', async (pool) => {
  // §R3.5 + §R5 — capture RUN_AT + validate config BEFORE lock contention
  // (R5.2 lessons-routing pattern: startup validation fails fast).
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const startTime = Date.now();

  const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-coa-scope');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'classify-coa-scope');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const unmappedThresholdPct = logicVars.coa_scope_unmapped_threshold_pct;

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // Counters for per-tier audit (Spec 42 §6.8 row 666).
    let processed = 0;
    let scopeClassified = 0;     // scope_tags non-NULL
    let unmappedScope = 0;       // scope_tags IS NULL (no keyword fired)
    let noClass = 0;             // coa_type_class IS NULL (no class keyword)
    let noProjectType = 0;       // project_type IS NULL
    let totalUpdated = 0;        // WF3 BUG-1: actual rowCount sum from flushBatch (NOT JS classifier count) per Spec 47 §8.1
    const projectTypeDist = new Map();
    const coaTypeClassDist = new Map();

    // Batched UPDATE staging: collect classifier outputs in 1000-row batches,
    // flush via single UNNEST UPDATE per batch (pg-native array binding —
    // R8 Gemini CRIT: never use string-literal `{` || ... || `}` concat).
    const batch = {
      ids: [],
      typeClasses: [],
      projectTypes: [],
      scopeTagArrays: [],     // each entry is JS array (or null), passed via $N::TEXT[][] expansion
    };

    /** Flush the staged batch via an explicit VALUES UPDATE.
     *
     * R8 review CRIT (Worktree + Gemini): PostgreSQL's `unnest()` on a 2D array
     * `text[][]` flattens ALL dimensions to individual `text` scalars — it does
     * NOT produce one `text[]` per outer row. Documented at
     * `scripts/classify-permits.js:777` ("Cannot use unnest on 2D arrays —
     * PostgreSQL flattens all dimensions"). Therefore parallel-UNNEST with
     * `unnest($4::text[][])` cannot bind the scope_tags column.
     *
     * The fix: build an explicit VALUES clause with one `$N::text[]` parameter
     * per row per column. node-postgres natively serializes a JS `string[]` to
     * a PostgreSQL `text[]` literal (and `null` → SQL NULL) — no string-literal
     * concatenation needed (R8 Gemini CRIT safety). Param count for 1000 rows
     * × 4 params + 1 RUN_AT = 4001, well under PG's 65535 limit.
     *
     * R8 Gemini MED: dropped `scope_classified_at` and `scope_source` from the
     * IS DISTINCT FROM check — those are not substantive change indicators
     * (timestamp + constant). Only re-write the row when classifier output
     * actually differs.
     */
    async function flushBatch() {
      if (batch.ids.length === 0) return;

      const valuesParts = [];
      const params = [];
      let paramIdx = 1;
      for (let i = 0; i < batch.ids.length; i++) {
        valuesParts.push(`($${paramIdx++}::bigint, $${paramIdx++}::text, $${paramIdx++}::text, $${paramIdx++}::text[])`);
        params.push(batch.ids[i], batch.typeClasses[i], batch.projectTypes[i], batch.scopeTagArrays[i]);
      }
      const runAtParam = paramIdx++;
      params.push(RUN_AT);

      await pipeline.withTransaction(pool, async (client) => {
        // WF3 BUG-1: capture result.rowCount for accurate records_updated metric
        // (Spec 47 §8.1 mandate; lessons 81-W5/82-W6/85-W6).
        //
        // No IS DISTINCT FROM guard: live re-run discovered an infinite-
        // re-processing bug — when classifier output is all-NULL (rows with
        // unmatchable descriptions), IS DISTINCT FROM correctly identifies
        // "no substantive change" → UPDATE skipped → scope_classified_at
        // never advances → row re-fetched forever via `scope_classified_at <
        // last_seen_at` cursor. The SELECT cursor already gates re-fetch on
        // content change, so IS DISTINCT FROM is redundant (Spec 47 §9.3
        // dead-tuple bloat concern is dominated by the cursor pre-filter).
        const result = await client.query(
          `UPDATE coa_applications ca
              SET coa_type_class      = v.coa_type_class,
                  project_type        = v.project_type,
                  scope_tags          = v.scope_tags,
                  scope_classified_at = $${runAtParam}::timestamptz,
                  scope_source        = 'description'
             FROM (VALUES ${valuesParts.join(', ')}) AS v(id, coa_type_class, project_type, scope_tags)
            WHERE ca.id = v.id`,
          params
        );
        totalUpdated += result.rowCount ?? 0;
      });
      batch.ids = [];
      batch.typeClasses = [];
      batch.projectTypes = [];
      batch.scopeTagArrays = [];
    }

    // §R7 — streamQuery for the source SELECT (33K rows; well above the 10K
    // streamQuery mandate threshold).
    //
    // Idempotency filter (R8 spec-drift correction): Spec 42 §6.8 row 666 says
    // "(scope_classified_at IS NULL OR scope_classified_at < load_at)" but the
    // actual coa_applications column is `last_seen_at` — `load_at` was a
    // spec-text placeholder that never materialized as a column. The semantics
    // work the same way: load-coa.js bumps `last_seen_at` to RUN_AT ONLY when
    // `data_hash IS DISTINCT FROM EXCLUDED.data_hash` (i.e., the source row's
    // content changed). So `scope_classified_at < last_seen_at` correctly fires
    // re-classification after CKAN description amendments.
    const sourceStream = pipeline.streamQuery(
      pool,
      `SELECT id, description, status, decision
         FROM coa_applications
        WHERE description IS NOT NULL
          AND description <> ''
          AND (scope_classified_at IS NULL OR scope_classified_at < last_seen_at)
        ORDER BY id ASC`,
      []
    );
    for await (const row of sourceStream) {
      processed++;
      const { coa_type_class, project_type, scope_tags } = classifyCoaScope({
        description: row.description,
        status: row.status,
        decision: row.decision,
      });

      // Bucket counters.
      if (scope_tags === null) unmappedScope++;
      else scopeClassified++;
      if (coa_type_class === null) noClass++;
      if (project_type === null) noProjectType++;

      const ptKey = project_type ?? '(null)';
      projectTypeDist.set(ptKey, (projectTypeDist.get(ptKey) ?? 0) + 1);
      const ctKey = coa_type_class ?? '(null)';
      coaTypeClassDist.set(ctKey, (coaTypeClassDist.get(ctKey) ?? 0) + 1);

      // Stage into batch.
      batch.ids.push(row.id);
      batch.typeClasses.push(coa_type_class);
      batch.projectTypes.push(project_type);
      batch.scopeTagArrays.push(scope_tags);   // null or JS array — pg driver handles both

      if (batch.ids.length >= UPDATE_BATCH_SIZE) {
        await flushBatch();
        if (processed % 5000 === 0) {
          pipeline.log.info('[classify-coa-scope]', `Processed ${processed.toLocaleString()} CoAs so far`);
        }
      }
    }

    // Final flush.
    await flushBatch();

    // ─── Audit table emit (Spec 42 §6.8 + WF6 hardening) ────────────
    const durationMs = Date.now() - startTime;
    const scopeClassifiedPct = processed > 0 ? (scopeClassified / processed) * 100 : 0;
    const unmappedPct = processed > 0 ? (unmappedScope / processed) * 100 : 0;

    const auditRows = [
      { metric: 'coa_processed',         value: processed,                                        threshold: null,                                       status: 'INFO' },
      { metric: 'scope_classified',      value: scopeClassified,                                  threshold: null,                                       status: 'INFO' },
      { metric: 'unmapped_scope_count',  value: unmappedPct.toFixed(1) + '%',                     threshold: `<= ${unmappedThresholdPct}%`,              status: unmappedPct <= unmappedThresholdPct ? 'PASS' : 'WARN' },
      { metric: 'scope_classified_pct',  value: scopeClassifiedPct.toFixed(1) + '%',              threshold: `>= ${100 - unmappedThresholdPct}%`,        status: unmappedPct <= unmappedThresholdPct ? 'PASS' : 'WARN' },
      { metric: 'no_class',              value: noClass,                                          threshold: null,                                       status: 'INFO' },
      { metric: 'no_project_type',       value: noProjectType,                                    threshold: null,                                       status: 'INFO' },
      { metric: 'project_type_distribution', value: Object.fromEntries(projectTypeDist),          threshold: null,                                       status: 'INFO' },
      { metric: 'coa_type_class_distribution', value: Object.fromEntries(coaTypeClassDist),       threshold: null,                                       status: 'INFO' },
    ];

    const hasWarn = auditRows.some((r) => r.status === 'WARN');

    pipeline.emitSummary({
      records_total: processed,
      records_new: 0,
      records_updated: totalUpdated,    // WF3 BUG-1: actual DB rowCount sum, not JS-side count
      records_meta: {
        duration_ms: durationMs,
        coa_processed: processed,
        scope_classified: scopeClassified,
        unmapped_scope: unmappedScope,
        no_class: noClass,
        no_project_type: noProjectType,
        project_type_distribution: Object.fromEntries(projectTypeDist),
        coa_type_class_distribution: Object.fromEntries(coaTypeClassDist),
        audit_table: {
          phase: 42,
          name: 'CoA Scope Classification',
          verdict: hasWarn ? 'WARN' : 'PASS',
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      { coa_applications: ['id', 'description', 'status', 'decision', 'last_seen_at', 'scope_classified_at'] },
      { coa_applications: ['coa_type_class', 'project_type', 'scope_tags', 'scope_classified_at', 'scope_source'] }
    );

    pipeline.log.info('[classify-coa-scope]', 'Classification complete', {
      processed,
      scope_classified: scopeClassified,
      unmapped_scope: unmappedScope,
      no_class: noClass,
      no_project_type: noProjectType,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });
  });

  // §R12 — SKIP guard (SDK already emitted SKIP summary if lock contended)
  if (!lockResult.acquired) return;
});
