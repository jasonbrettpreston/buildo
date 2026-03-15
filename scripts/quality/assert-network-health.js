#!/usr/bin/env node
/**
 * CQA Phase 2: Scraper Network Health (Telemetry Validation)
 *
 * Reads scraper_telemetry from the latest completed `inspections` pipeline_run
 * and validates operational health of the scraping infrastructure.
 *
 * Checks:
 *   1. schema_drift_count == 0 (AIC API field names unchanged)
 *   2. proxy_error_rate < 5% of permits_attempted
 *   3. avg_latency_ms (p50) < 2000ms
 *   4. consecutive_empty_hit == false (WAF didn't shadow-ban)
 *   5. session_failures == 0
 *
 * Usage: node scripts/quality/assert-network-health.js
 * Exit 0 = pass, Exit 1 = fail
 *
 * SPEC LINK: docs/specs/38_inspection_scraping.md §3.6 Step 2
 */
const pipeline = require('../lib/pipeline');

pipeline.run('assert-network-health', async (pool) => {
  console.log('\n=== Phase 2: Scraper Network Health ===\n');

  const errors = [];
  const warnings = [];
  const rows = [];

  // Fetch latest completed inspections run with scraper_telemetry
  const lastRun = await pool.query(
    `SELECT records_meta, records_updated FROM pipeline_runs
     WHERE (pipeline = 'inspections' OR pipeline LIKE '%:inspections')
       AND status = 'completed'
     ORDER BY started_at DESC LIMIT 1`
  );

  const row = lastRun.rows[0];
  const scTel = row?.records_meta?.scraper_telemetry;

  if (!scTel) {
    console.log('  SKIP: No scraper_telemetry in latest inspections run');
    rows.push({ metric: 'scraper_telemetry', value: null, threshold: null, status: 'SKIP' });
    pipeline.emitSummary({
      records_total: 0, records_new: null, records_updated: 0,
      records_meta: {
        audit_table: { phase: 2, name: 'Network Health', verdict: 'SKIP', rows },
      },
    });
    pipeline.emitMeta(
      { pipeline_runs: ['records_meta', 'status', 'pipeline'] },
      {}
    );
    return;
  }

  // Check 1: Schema drift
  const driftCount = (scTel.schema_drift || []).length;
  if (driftCount > 0) {
    errors.push(`AIC API schema drift: ${scTel.schema_drift.join('; ')}`);
    rows.push({ metric: 'schema_drift_count', value: driftCount, threshold: '== 0', status: 'FAIL' });
    console.error(`  FAIL: schema_drift_count = ${driftCount}`);
  } else {
    rows.push({ metric: 'schema_drift_count', value: 0, threshold: '== 0', status: 'PASS' });
    console.log('  PASS: schema_drift_count = 0');
  }

  // Check 2: Proxy error rate
  const attempted = scTel.permits_attempted || 0;
  const proxyErrors = scTel.proxy_errors || 0;
  const errorRate = attempted > 0 ? ((proxyErrors / attempted) * 100) : 0;
  const errorRateStr = errorRate.toFixed(1) + '%';
  if (attempted > 0 && errorRate >= 5) {
    errors.push(`Proxy error rate ${errorRateStr} (${proxyErrors}/${attempted})`);
    rows.push({ metric: 'proxy_error_rate', value: errorRateStr, threshold: '< 5%', status: 'FAIL' });
    console.error(`  FAIL: proxy_error_rate = ${errorRateStr}`);
    if (scTel.error_categories) {
      const breakdown = Object.entries(scTel.error_categories).map(([k, v]) => `${k}:${v}`).join(', ');
      console.log(`        breakdown: ${breakdown}`);
    }
    if (scTel.last_error) {
      console.log(`        last_error: ${scTel.last_error}`);
    }
  } else {
    rows.push({ metric: 'proxy_error_rate', value: errorRateStr, threshold: '< 5%', status: 'PASS' });
    console.log(`  PASS: proxy_error_rate = ${errorRateStr}`);
  }

  // Check 3: Latency (p50)
  const p50 = scTel.latency?.p50 ?? 0;
  const maxLatency = scTel.latency?.max ?? 0;
  if (p50 >= 2000) {
    warnings.push(`Latency p50 = ${p50}ms (threshold: <2000ms)`);
    rows.push({ metric: 'avg_latency_ms', value: p50, threshold: '< 2000', status: 'WARN' });
    console.log(`  WARN: avg_latency_ms (p50) = ${p50}ms`);
  } else {
    rows.push({ metric: 'avg_latency_ms', value: p50, threshold: '< 2000', status: 'PASS' });
    console.log(`  PASS: avg_latency_ms (p50) = ${p50}ms`);
  }
  rows.push({ metric: 'max_latency_ms', value: maxLatency, threshold: null, status: 'INFO' });
  console.log(`  INFO: max_latency_ms = ${maxLatency}ms`);

  // Check 4: Consecutive empty (WAF trap)
  const emptyMax = scTel.consecutive_empty_max || 0;
  const emptyHit = emptyMax >= 20;
  if (emptyHit) {
    warnings.push(`WAF trap: ${emptyMax} consecutive empty responses`);
    rows.push({ metric: 'consecutive_empty_hit', value: true, threshold: '== false', status: 'WARN' });
    console.log(`  WARN: consecutive_empty_hit = true (${emptyMax} consecutive)`);
  } else {
    rows.push({ metric: 'consecutive_empty_hit', value: false, threshold: '== false', status: 'PASS' });
    console.log(`  PASS: consecutive_empty_hit = false (max: ${emptyMax})`);
  }

  // Check 5: Session bootstraps (informational)
  rows.push({ metric: 'session_bootstraps', value: scTel.session_bootstraps || 0, threshold: null, status: 'INFO' });
  console.log(`  INFO: session_bootstraps = ${scTel.session_bootstraps || 0}`);

  // Check 6: Session failures
  const sessionFails = scTel.session_failures || 0;
  if (sessionFails > 0) {
    warnings.push(`${sessionFails} session failures`);
    rows.push({ metric: 'session_failures', value: sessionFails, threshold: null, status: 'WARN' });
    console.log(`  WARN: session_failures = ${sessionFails}`);
  } else {
    rows.push({ metric: 'session_failures', value: 0, threshold: null, status: 'PASS' });
    console.log(`  PASS: session_failures = 0`);
  }

  // Check 7: Permits closed on portal (informational — stale Open Data feed)
  const closed = scTel.permits_closed || 0;
  if (closed > 0) {
    rows.push({ metric: 'permits_closed', value: closed, threshold: null, status: 'INFO' });
    console.log(`  INFO: permits_closed = ${closed} (progressed past Inspection on portal)`);
  }

  // Verdict
  const verdict = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  console.log(`\n=== Network Health: ${verdict} ===\n`);

  pipeline.emitSummary({
    records_total: 0, records_new: null, records_updated: 0,
    records_meta: {
      checks_passed: errors.length === 0 ? 'all' : undefined,
      checks_failed: errors.length,
      checks_warned: warnings.length,
      audit_table: { phase: 2, name: 'Network Health', verdict, rows },
    },
  });
  pipeline.emitMeta(
    { pipeline_runs: ['records_meta', 'status', 'pipeline'] },
    {}
  );

  if (errors.length > 0) process.exit(1);
});
