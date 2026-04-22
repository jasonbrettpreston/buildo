#!/usr/bin/env node
/**
 * Classify Inspection Status — batch sweep for stalled permits
 *
 * Runs after the AIC scraper in the deep_scrapes chain.
 * Detects permits where enriched_status = 'Active Inspection' but
 * no inspection activity for 300+ days → sets enriched_status = 'Stalled'.
 *
 * Also re-activates Stalled permits if new inspection data appears
 * (driven from recent permit_inspections activity, not graveyard scan).
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/53_source_aic_inspections.md
 */

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');

const ADVISORY_LOCK_ID = 53;

const LOGIC_VARS_SCHEMA = z.object({
  inspection_stall_days: z.coerce.number().finite().positive().int(),
}).passthrough();

pipeline.run('classify-inspection-status', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-inspection-status');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'classify-inspection-status');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);

  const staleDays = logicVars.inspection_stall_days;

  const { stalledCount, reactivatedCount } = await pipeline.withTransaction(pool, async (client) => {
    // Step 1: Mark Active Inspection permits as Stalled if no activity in 300+ days
    // Scoped to revision_num = '00' because only base permits have inspections.
    // Uses GREATEST (not COALESCE) across all temporal indicators so the DB always
    // picks the absolute most recent sign of life.
    // Excludes scraped_at (pipeline metadata, refreshed nightly — not business data)
    // and last_seen_at (refreshed by nightly permit scraper — grants false immunity).
    const stalledResult = await client.query(
      `UPDATE permits p
       SET enriched_status = 'Stalled',
           last_seen_at = $2::timestamptz
       WHERE p.enriched_status = 'Active Inspection'
         AND p.revision_num = '00'
         AND GREATEST(
           (SELECT MAX(pi.inspection_date)
            FROM permit_inspections pi
            WHERE pi.permit_num = p.permit_num),
           p.issued_date,
           p.application_date
         ) < NOW() - $1 * INTERVAL '1 day'
       RETURNING p.permit_num`,
      [staleDays, RUN_AT]
    );

    // Step 2: Re-activate Stalled permits if new inspection activity detected
    // Driven from recent permit_inspections (last 24h) joined to permits —
    // avoids scanning the infinite Stalled graveyard which degrades over time.
    // Guards against terminal state clobbering: only reactivates permits that
    // are currently 'Stalled', not 'Inspections Complete' or 'Not Passed'.
    const reactivatedResult = await client.query(
      `UPDATE permits p
       SET enriched_status = 'Active Inspection',
           last_seen_at = $2::timestamptz
       WHERE p.enriched_status = 'Stalled'
         AND p.revision_num = '00'
         -- SAFETY: redundant guard — WHERE already constrains to 'Stalled',
         -- but protects against future refactors that widen the WHERE scope
         AND p.enriched_status NOT IN ('Inspections Complete', 'Not Passed')
         AND EXISTS (
           SELECT 1 FROM permit_inspections pi
           WHERE pi.permit_num = p.permit_num
             AND pi.inspection_date >= (NOW() - $1 * INTERVAL '1 day')::date
         )
       RETURNING p.permit_num`,
      [staleDays, RUN_AT]
    );

    return {
      stalledCount: stalledResult.rows.length,
      reactivatedCount: reactivatedResult.rows.length,
    };
  });

  // Step 3: Report current distribution
  const { rows: dist } = await pool.query(
    `SELECT enriched_status, COUNT(*) AS cnt
     FROM permits
     WHERE enriched_status IS NOT NULL
     GROUP BY enriched_status
     ORDER BY cnt DESC`
  );

  pipeline.log.info('[classify-inspection-status]', 'Classification complete', {
    stalled: stalledCount,
    reactivated: reactivatedCount,
    distribution: dist,
  });

  pipeline.emitSummary({
    records_total: stalledCount + reactivatedCount,
    records_new: 0,
    records_updated: stalledCount + reactivatedCount,
    records_meta: {
      stalled: stalledCount,
      reactivated: reactivatedCount,
      distribution: dist.map((r) => ({ status: r.enriched_status, count: safeParsePositiveInt(r.cnt, 'cnt') })),
      audit_table: {
        phase: 2,
        name: 'Inspection Status Classification',
        verdict: 'PASS',
        rows: [
          { metric: 'newly_stalled', value: stalledCount, threshold: null, status: 'INFO' },
          { metric: 'reactivated', value: reactivatedCount, threshold: null, status: 'INFO' },
          ...dist.map((r) => ({ metric: `enriched_${r.enriched_status.toLowerCase().replace(/\s/g, '_')}`, value: safeParsePositiveInt(r.cnt, 'cnt'), threshold: null, status: 'INFO' })),
        ],
      },
    },
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'revision_num', 'enriched_status', 'issued_date', 'application_date', 'last_seen_at'], permit_inspections: ['permit_num', 'inspection_date'] },
    { permits: ['enriched_status', 'last_seen_at'] }
  );
  });
  if (!lockResult.acquired) return;
});
