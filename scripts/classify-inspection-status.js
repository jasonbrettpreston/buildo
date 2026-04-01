#!/usr/bin/env node
/**
 * Classify Inspection Status — batch sweep for stalled permits
 *
 * Runs after the AIC scraper in the deep_scrapes chain.
 * Detects permits where enriched_status = 'Active Inspection' but
 * no inspection activity for 10+ months → sets enriched_status = 'Stalled'.
 *
 * Also re-activates Stalled permits if new inspection data appears
 * (scraper re-scraped and found activity).
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 */

const pipeline = require('./lib/pipeline');

const STALE_MONTHS = 10;

pipeline.run('classify-inspection-status', async (pool) => {
  // Wrap both steps in a single transaction to prevent race conditions
  // with concurrent scraper inserts between stalling and re-activating
  const { stalledCount, reactivatedCount } = await pipeline.withTransaction(pool, async (client) => {
    // Step 1: Mark Active Inspection permits as Stalled if no activity in 10+ months
    // Uses MAX(scraped_at) — scraped_at tracks when data actually changed, not first discovery
    const stalledResult = await client.query(
      `UPDATE permits p
       SET enriched_status = 'Stalled'
       FROM (
         SELECT pi.permit_num,
                COALESCE(MAX(pi.inspection_date), MAX(pi.scraped_at)::date) AS last_activity
         FROM permit_inspections pi
         WHERE EXISTS (
           SELECT 1 FROM permits p2
           WHERE p2.permit_num = pi.permit_num
             AND p2.enriched_status = 'Active Inspection'
         )
         GROUP BY pi.permit_num
         HAVING COALESCE(MAX(pi.inspection_date), MAX(pi.scraped_at)::date) < NOW() - INTERVAL '1 month' * $1
       ) stale
       WHERE p.permit_num = stale.permit_num
         AND p.enriched_status = 'Active Inspection'`,
      [STALE_MONTHS]
    );

    // Step 2: Re-activate Stalled permits if new activity detected
    const reactivatedResult = await client.query(
      `UPDATE permits p
       SET enriched_status = 'Active Inspection'
       FROM (
         SELECT pi.permit_num,
                COALESCE(MAX(pi.inspection_date), MAX(pi.scraped_at)::date) AS last_activity
         FROM permit_inspections pi
         WHERE EXISTS (
           SELECT 1 FROM permits p2
           WHERE p2.permit_num = pi.permit_num
             AND p2.enriched_status = 'Stalled'
         )
         GROUP BY pi.permit_num
         HAVING COALESCE(MAX(pi.inspection_date), MAX(pi.scraped_at)::date) >= NOW() - INTERVAL '1 month' * $1
       ) active
       WHERE p.permit_num = active.permit_num
         AND p.enriched_status = 'Stalled'`,
      [STALE_MONTHS]
    );

    return {
      stalledCount: stalledResult.rowCount || 0,
      reactivatedCount: reactivatedResult.rowCount || 0,
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
      distribution: dist.reduce((acc, r) => { acc[r.enriched_status] = parseInt(r.cnt); return acc; }, {}),
      audit_table: {
        phase: 2,
        name: 'Inspection Status Classification',
        verdict: 'PASS',
        rows: [
          { metric: 'newly_stalled', value: stalledCount, threshold: null, status: 'INFO' },
          { metric: 'reactivated', value: reactivatedCount, threshold: null, status: 'INFO' },
          ...dist.map((r) => ({ metric: `enriched_${r.enriched_status.toLowerCase().replace(/\s/g, '_')}`, value: parseInt(r.cnt), threshold: null, status: 'INFO' })),
        ],
      },
    },
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'enriched_status'], permit_inspections: ['permit_num', 'inspection_date', 'scraped_at'] },
    { permits: ['enriched_status'] }
  );
});
