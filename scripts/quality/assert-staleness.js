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
 *   3. stale_over_14d: WARN in early phase (<5% coverage), FAIL in production
 *
 * Usage: node scripts/quality/assert-staleness.js
 * Exit 0 = pass, Exit 1 = fail
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md §3.6 Step 5
 */
const pipeline = require('../lib/pipeline');

// Must match scraper TARGET_TYPES (Spec 38 §3.6 — stage-level scrape targets only)
const TARGET_TYPES = [
  'Small Residential Projects',
  'Building Additions/Alterations',
  'New Houses',
];

pipeline.run('assert-staleness', async (pool) => {
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
  const isEarlyPhase = totalTarget > 0 && (scraped / totalTarget) < 0.05;

  rows.push({ metric: 'total_target_permits', value: totalTarget, threshold: null, status: 'INFO' });
  rows.push({ metric: 'scraped_permits', value: scraped, threshold: null, status: 'INFO' });
  rows.push({ metric: 'never_scraped', value: neverScraped, threshold: null, status: 'INFO' });
  rows.push({ metric: 'coverage_pct', value: coveragePct, threshold: null, status: 'INFO' });

  console.log(`  INFO: total_target_permits = ${totalTarget.toLocaleString()}`);
  console.log(`  INFO: scraped_permits = ${scraped.toLocaleString()}`);
  console.log(`  INFO: never_scraped = ${neverScraped.toLocaleString()}`);
  console.log(`  INFO: coverage_pct = ${coveragePct}${isEarlyPhase ? ' (early phase)' : ''}`);

  // Staleness query — for permits that HAVE been scraped
  const stalenessRes = await pool.query(
    `SELECT
       MAX(CURRENT_DATE - pi.scraped_at::date) AS max_days_stale,
       COUNT(*) FILTER (WHERE pi.scraped_at < NOW() - INTERVAL '14 days') AS stale_14d
     FROM permits p
     JOIN permit_inspections pi ON pi.permit_num = p.permit_num
     WHERE p.status = 'Inspection'
       AND p.permit_type = ANY($1)`,
    [TARGET_TYPES]
  );
  const maxDaysStale = parseInt(stalenessRes.rows[0]?.max_days_stale) || 0;
  const stale14d = parseInt(stalenessRes.rows[0]?.stale_14d) || 0;

  rows.push({ metric: 'max_days_stale', value: maxDaysStale, threshold: null, status: 'INFO' });
  console.log(`  INFO: max_days_stale = ${maxDaysStale} days`);

  if (stale14d > 0) {
    if (isEarlyPhase) {
      warnings.push(`${stale14d} permits stale >14d (early phase — not blocking)`);
      rows.push({ metric: 'stale_over_14d', value: stale14d, threshold: '== 0', status: 'WARN' });
      console.log(`  WARN: stale_over_14d = ${stale14d} (early phase)`);
    } else {
      errors.push(`${stale14d} permits stale >14d`);
      rows.push({ metric: 'stale_over_14d', value: stale14d, threshold: '== 0', status: 'FAIL' });
      console.error(`  FAIL: stale_over_14d = ${stale14d}`);
    }
  } else {
    rows.push({ metric: 'stale_over_14d', value: 0, threshold: '== 0', status: 'PASS' });
    console.log('  PASS: stale_over_14d = 0');
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

  if (errors.length > 0) process.exit(1);
});
