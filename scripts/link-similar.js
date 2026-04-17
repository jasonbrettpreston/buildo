#!/usr/bin/env node
/**
 * Link similar permits by propagating scope tags from BLD permits to companion
 * permits (PLB, MS, DM, etc.) that share the same base permit number.
 *
 * A BLD permit "24 123456 BLD 00" has companions like "24 123456 PLB 00",
 * "24 123456 MS 00". This script merges the BLD's scope_tags into companions
 * (array union, not overwrite) so they inherit structural classification while
 * preserving their own trade-specific tags.
 *
 * DM (Demolition Folder) permits get 'demolition' tag added inline during
 * propagation — no separate fix-up step needed.
 *
 * Uses DISTINCT ON to pick the latest BLD revision when multiple exist
 * (e.g. rev 00, 01, 02). Uses SUBSTRING regex for base_num matching.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with tags_propagated, duration_ms
 *
 * Usage: node scripts/link-similar.js
 *
 * SPEC LINK: docs/specs/30_permit_scope_classification.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');

const ADVISORY_LOCK_ID = 30;

pipeline.run('link-similar', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const startTime = Date.now();

  pipeline.log.info('[link-similar]', 'Linking similar permits (BLD → companion propagation)...');

  const propagated = await pipeline.withTransaction(pool, async (client) => {
    // Propagate scope_tags + project_type from BLD to companion permits.
    // Uses array union (not overwrite) to preserve companion's own trade tags.
    // DM permits get 'demolition' tag merged inline — eliminates separate fix-up
    // and prevents the ping-pong loop (overwrite → append → IS DISTINCT FROM → repeat).
    // DISTINCT ON picks the latest revision per base_num (revision_num DESC).
    // Sorted ARRAY_AGG prevents IS DISTINCT FROM thrashing on reorder.
    const propagateResult = await client.query(
      `UPDATE permits AS companion
       SET
         scope_tags = (
           SELECT ARRAY_AGG(DISTINCT tag ORDER BY tag)
           FROM UNNEST(
             COALESCE(companion.scope_tags, '{}') || bld.scope_tags ||
             CASE WHEN companion.permit_type = 'Demolition Folder (DM)' THEN ARRAY['demolition'] ELSE '{}'::text[] END
           ) AS tag
         ),
         project_type = bld.project_type,
         scope_classified_at = $1::timestamptz,
         scope_source = 'propagated'
       FROM (
         SELECT DISTINCT ON (base_num)
           SUBSTRING(permit_num FROM '^\\d{2} \\d{6}') AS base_num,
           scope_tags,
           project_type
         FROM permits
         WHERE permit_num ~ '\\sBLD(\\s|$)'
           AND scope_tags IS NOT NULL
           AND array_length(scope_tags, 1) > 0
           AND SUBSTRING(permit_num FROM '^\\d{2} \\d{6}') IS NOT NULL
         ORDER BY SUBSTRING(permit_num FROM '^\\d{2} \\d{6}'), revision_num DESC
       ) AS bld
       WHERE SUBSTRING(companion.permit_num FROM '^\\d{2} \\d{6}') = bld.base_num
         AND companion.permit_num !~ '\\sBLD(\\s|$)'
         AND companion.permit_num ~ '\\s[A-Z]{2,4}(\\s|$)'
         AND (companion.scope_tags IS DISTINCT FROM (
           SELECT ARRAY_AGG(DISTINCT tag ORDER BY tag)
           FROM UNNEST(
             COALESCE(companion.scope_tags, '{}') || bld.scope_tags ||
             CASE WHEN companion.permit_type = 'Demolition Folder (DM)' THEN ARRAY['demolition'] ELSE '{}'::text[] END
           ) AS tag
         ) OR companion.project_type IS DISTINCT FROM bld.project_type)`,
      [RUN_AT]
    );

    return propagateResult.rowCount || 0;
  });

  pipeline.log.info('[link-similar]', `Propagated scope tags to ${propagated.toLocaleString()} companion permits`);

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[link-similar]', 'Done', {
    tags_propagated: propagated,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for similar permit linking observability
  const cumulativeResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM permits WHERE scope_source = 'propagated') AS propagated,
       (SELECT COUNT(*) FROM permits WHERE scope_source IS NOT NULL) AS classified`
  );
  const cumulativePropagated = safeParsePositiveInt(cumulativeResult.rows[0].propagated, 'propagated');
  const cumulativeClassified = safeParsePositiveInt(cumulativeResult.rows[0].classified, 'classified');
  const propagationRate = cumulativeClassified > 0 ? (cumulativePropagated / cumulativeClassified) * 100 : 0;

  const similarAuditRows = [
    { metric: 'run_propagated', value: propagated, threshold: null, status: 'INFO' },
    { metric: 'cumulative_propagated', value: cumulativePropagated, threshold: null, status: 'INFO' },
    { metric: 'cumulative_classified', value: cumulativeClassified, threshold: null, status: 'INFO' },
    { metric: 'propagation_rate', value: propagationRate.toFixed(1) + '%', threshold: '>= 20%', status: propagationRate >= 20 ? 'PASS' : 'WARN' },
  ];

  pipeline.emitSummary({
    records_total: propagated,
    records_new: 0,
    records_updated: propagated,
    records_meta: {
      duration_ms: durationMs,
      tags_propagated: propagated,
      audit_table: {
        phase: 10,
        name: 'Similar Permit Linking',
        verdict: propagationRate >= 20 ? 'PASS' : 'WARN',
        rows: similarAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "scope_tags", "project_type", "permit_type"] },
    { "permits": ["scope_tags", "project_type", "scope_classified_at", "scope_source"] }
  );
  });
  if (!lockResult.acquired) return;
});
