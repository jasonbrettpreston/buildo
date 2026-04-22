#!/usr/bin/env node
/**
 * CQA Phase 4: Staleness Monitor (Coverage Check)
 *
 * Detects pipeline blind spots — permits the scraper has silently abandoned.
 * Queries permits in Inspection status for target types and checks scrape freshness.
 *
 * Checks:
 *   1. Coverage stats (informational): total target, scraped, never scraped, pct
 *   2. max_days_stale (informational)
 *   3. stale_over_30d: WARN in early phase (<5% coverage), FAIL in production
 *
 * Usage: node scripts/quality/assert-staleness.js
 * Exit 0 = pass, Exit 1 = fail
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 */
const { z } = require('zod');
const pipeline = require('../lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('../lib/config-loader');

const LOGIC_VARS_SCHEMA = z.object({
  scrape_early_phase_threshold_pct: z.coerce.number().finite().positive(),
  scrape_stale_days:                z.coerce.number().finite().positive().int(),
}).passthrough();

// Must match scraper TARGET_TYPES (Spec 38 §3.6 — stage-level scrape targets only)
const TARGET_TYPES = [
  'Small Residential Projects',
  'Building Additions/Alterations',
  'New Houses',
];

const ADVISORY_LOCK_ID = 106;

pipeline.run('assert-staleness', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-staleness');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-staleness');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);

  const earlyPhasePct = logicVars.scrape_early_phase_threshold_pct;
  const staleDays     = logicVars.scrape_stale_days;

  console.log('\n=== Phase 4: Staleness Monitor ===\n');

  const errors = [];
  const warnings = [];
  const rows = [];

  // Coverage query
  const coverageRes = await pool.query(
    `SELECT
       COUNT(DISTINCT p.permit_num) AS total_target,
       COUNT(DISTINCT pi.permit_num) AS scraped
     FROM permits p
     LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
     WHERE p.status = 'Inspection'
       AND p.permit_type = ANY($1)`,
    [TARGET_TYPES]
  );
  const totalTarget = parseInt(coverageRes.rows[0].total_target) || 0;
  const scraped = parseInt(coverageRes.rows[0].scraped) || 0;
  const neverScraped = totalTarget - scraped;
  const coveragePct = totalTarget > 0 ? ((scraped / totalTarget) * 100).toFixed(1) + '%' : '0%';
  const isEarlyPhase = totalTarget > 0 && (scraped / totalTarget) * 100 < earlyPhasePct;

  rows.push({ metric: 'total_target_permits', value: totalTarget, threshold: null, status: 'INFO' });
  rows.push({ metric: 'scraped_permits', value: scraped, threshold: null, status: 'INFO' });
  rows.push({ metric: 'never_scraped', value: neverScraped, threshold: null, status: 'INFO' });
  rows.push({ metric: 'coverage_pct', value: coveragePct, threshold: null, status: 'INFO' });

  console.log(`  INFO: total_target_permits = ${totalTarget.toLocaleString()}`);
  console.log(`  INFO: scraped_permits = ${scraped.toLocaleString()}`);
  console.log(`  INFO: never_scraped = ${neverScraped.toLocaleString()}`);
  console.log(`  INFO: coverage_pct = ${coveragePct}${isEarlyPhase ? ' (early phase)' : ''}`);

  // Staleness query — group by permit first (a permit has multiple inspection
  // stages, so counting raw rows inflates stale_14d by the stage count)
  const stalenessRes = await pool.query(
    `WITH permit_freshness AS (
       SELECT
         p.permit_num,
         MAX(pi.scraped_at) AS last_scraped
       FROM permits p
       JOIN permit_inspections pi ON pi.permit_num = p.permit_num
       WHERE p.status = 'Inspection'
         AND p.permit_type = ANY($1)
       GROUP BY p.permit_num
     )
     SELECT
       MAX(CURRENT_DATE - last_scraped::date) AS max_days_stale,
       COUNT(*) FILTER (WHERE last_scraped < NOW() - $2 * INTERVAL '1 day') AS stale_30d
     FROM permit_freshness`,
    [TARGET_TYPES, staleDays]
  );
  const maxDaysStale = parseInt(stalenessRes.rows[0]?.max_days_stale) || 0;
  const stale30d = parseInt(stalenessRes.rows[0]?.stale_30d) || 0;

  rows.push({ metric: 'max_days_stale', value: maxDaysStale, threshold: null, status: 'INFO' });
  console.log(`  INFO: max_days_stale = ${maxDaysStale} days`);

  if (stale30d > 0) {
    if (isEarlyPhase) {
      warnings.push(`${stale30d} permits stale >30d (early phase — not blocking)`);
      rows.push({ metric: 'stale_over_30d', value: stale30d, threshold: '== 0', status: 'WARN' });
      console.log(`  WARN: stale_over_30d = ${stale30d} (early phase)`);
    } else {
      errors.push(`${stale30d} permits stale >30d`);
      rows.push({ metric: 'stale_over_30d', value: stale30d, threshold: '== 0', status: 'FAIL' });
      console.error(`  FAIL: stale_over_30d = ${stale30d}`);
    }
  } else {
    rows.push({ metric: 'stale_over_30d', value: 0, threshold: '== 0', status: 'PASS' });
    console.log('  PASS: stale_over_30d = 0');
  }

  // Verdict
  const verdict = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  console.log(`\n=== Staleness Monitor: ${verdict} ===\n`);

  pipeline.emitSummary({
    records_total: 0, records_new: null, records_updated: 0,
    records_meta: {
      checks_passed: errors.length === 0 ? 'all' : undefined,
      checks_failed: errors.length,
      checks_warned: warnings.length,
      audit_table: { phase: 4, name: 'Staleness Monitor', verdict, rows },
    },
  });
  pipeline.emitMeta(
    { permits: ['permit_num', 'status', 'permit_type'], permit_inspections: ['permit_num', 'scraped_at'] },
    {}
  );

  if (errors.length > 0) throw new Error(`Staleness check failed: ${errors.join('; ')}`);
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
