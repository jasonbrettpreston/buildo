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
  // Step 1: Mark Active Inspection permits as Stalled if no activity in 10+ months
  // Uses COALESCE to fall back to scraped_at when inspection_date is NULL
  const stalledResult = await pool.query(
    `UPDATE permits p
     SET enriched_status = 'Stalled'
     FROM (
       SELECT pi.permit_num,
              COALESCE(MAX(pi.inspection_date), MIN(pi.scraped_at)::date) AS last_activity
       FROM permit_inspections pi
       JOIN permits p2 ON p2.permit_num = pi.permit_num
       WHERE p2.enriched_status = 'Active Inspection'
       GROUP BY pi.permit_num
       HAVING COALESCE(MAX(pi.inspection_date), MIN(pi.scraped_at)::date) < NOW() - INTERVAL '1 month' * $1
     ) stale
     WHERE p.permit_num = stale.permit_num
       AND p.enriched_status IS DISTINCT FROM 'Stalled'`,
    [STALE_MONTHS]
  );
  const stalledCount = stalledResult.rowCount;

  // Step 2: Re-activate Stalled permits if new activity detected
  const reactivatedResult = await pool.query(
    `UPDATE permits p
     SET enriched_status = 'Active Inspection'
     FROM (
       SELECT pi.permit_num,
              COALESCE(MAX(pi.inspection_date), MIN(pi.scraped_at)::date) AS last_activity
       FROM permit_inspections pi
       JOIN permits p2 ON p2.permit_num = pi.permit_num
       WHERE p2.enriched_status = 'Stalled'
       GROUP BY pi.permit_num
       HAVING COALESCE(MAX(pi.inspection_date), MIN(pi.scraped_at)::date) >= NOW() - INTERVAL '1 month' * $1
     ) active
     WHERE p.permit_num = active.permit_num
       AND p.enriched_status IS DISTINCT FROM 'Active Inspection'`,
    [STALE_MONTHS]
  );
  const reactivatedCount = reactivatedResult.rowCount;

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
    records_new: null,
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
