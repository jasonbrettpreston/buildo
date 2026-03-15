#!/usr/bin/env node
/**
 * Link similar permits by propagating scope tags from BLD permits to companion
 * permits (PLB, MS, DM, etc.) that share the same base permit number.
 *
 * A BLD permit "24 123456 BLD 00" has companions like "24 123456 PLB 00",
 * "24 123456 MS 00". This script copies the BLD's scope_tags and project_type
 * to those companions so they inherit the same classification.
 *
 * Uses DISTINCT ON to pick the latest BLD revision when multiple exist
 * (e.g. rev 00, 01, 02). Uses SUBSTRING regex for index-eligible matching.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with tags_propagated, demolitions_restored, duration_ms
 *
 * Usage: node scripts/link-similar.js
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('link-similar', async (pool) => {
  const startTime = Date.now();

  pipeline.log.info('[link-similar]', 'Linking similar permits (BLD → companion propagation)...');

  const { propagated, demFixed } = await pipeline.withTransaction(pool, async (client) => {
    // Propagate scope_tags + project_type from BLD to companion permits.
    // DISTINCT ON picks the latest revision per base_num (rev 02 > 01 > 00).
    // SUBSTRING regex is index-eligible (vs SPLIT_PART which forces seq scan).
    const propagateResult = await client.query(
      `UPDATE permits AS companion
       SET
         scope_tags = bld.scope_tags,
         project_type = bld.project_type,
         scope_classified_at = NOW(),
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
         ORDER BY SUBSTRING(permit_num FROM '^\\d{2} \\d{6}'), permit_num DESC
       ) AS bld
       WHERE SUBSTRING(companion.permit_num FROM '^\\d{2} \\d{6}') = bld.base_num
         AND companion.permit_num !~ '\\sBLD(\\s|$)'
         AND companion.permit_num ~ '\\s[A-Z]{2,4}(\\s|$)'
         AND companion.scope_tags IS DISTINCT FROM bld.scope_tags`
    );

    const propagated = propagateResult.rowCount || 0;
    pipeline.log.info('[link-similar]', `Propagated scope tags to ${propagated.toLocaleString()} companion permits`);

    // Re-add demolition tag to DM permits that lost it during propagation
    const demFixResult = await client.query(
      `UPDATE permits
       SET scope_tags = CASE
         WHEN scope_tags IS NULL THEN ARRAY['demolition']
         ELSE array_append(scope_tags, 'demolition')
       END
       WHERE permit_type = 'Demolition Folder (DM)'
         AND (scope_tags IS NULL OR NOT ('demolition' = ANY(scope_tags)))`
    );
    const demFixed = demFixResult.rowCount || 0;
    if (demFixed > 0) {
      pipeline.log.info('[link-similar]', `Re-added demolition tag to ${demFixed} DM companion permits`);
    }

    return { propagated, demFixed };
  });

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[link-similar]', 'Done', {
    tags_propagated: propagated,
    demolitions_restored: demFixed,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  pipeline.emitSummary({
    records_total: propagated + demFixed,
    records_new: 0,
    records_updated: propagated + demFixed,
    records_meta: {
      duration_ms: durationMs,
      tags_propagated: propagated,
      demolitions_restored: demFixed,
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "scope_tags", "project_type", "permit_type"] },
    { "permits": ["scope_tags", "project_type", "scope_classified_at", "scope_source"] }
  );
});
