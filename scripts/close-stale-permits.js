#!/usr/bin/env node
/**
 * Close stale permits — two-stage lifecycle for feed disappearance.
 *
 * When a permit is removed from the Toronto Open Data feed, it stays
 * as status = 'Inspection' forever. This script detects feed disappearance
 * and transitions permits through: Active → Pending Closed → Closed.
 *
 * Detection is run-relative (not calendar-relative): compares last_seen_at
 * against the most recent successful permits load timestamp. Works regardless
 * of pipeline frequency.
 *
 * Lifecycle:
 *   1. Pending Closed — permit not in latest feed (last_seen_at < last load)
 *   2. Closed — Pending Closed for 30+ days
 *   3. Reopened — permit reappears in feed → permits loader upsert restores
 *      CKAN status naturally (no extra code needed)
 *
 * Usage: node scripts/close-stale-permits.js
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('close-stale-permits', async (pool) => {
  const startTime = Date.now();

  // Find the most recent successful permits load timestamp
  const lastLoadResult = await pool.query(
    `SELECT started_at FROM pipeline_runs
     WHERE pipeline IN ('permits:permits', 'permits')
       AND status = 'completed'
     ORDER BY started_at DESC
     LIMIT 1`
  );

  if (lastLoadResult.rows.length === 0) {
    pipeline.log.info('[close-stale]', 'No successful permits load found. Skipping.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    pipeline.emitMeta(
      { "permits": ["status", "last_seen_at", "completed_date"], "pipeline_runs": ["pipeline", "status", "started_at"] },
      { "permits": ["status", "completed_date"] }
    );
    return;
  }

  const lastLoadAt = lastLoadResult.rows[0].started_at;
  pipeline.log.info('[close-stale]', `Reference load: ${new Date(lastLoadAt).toISOString()}`);

  // Step 1: Mark permits not in latest feed as Pending Closed
  // Any permit with last_seen_at before the latest load was NOT in that feed.
  const pendingResult = await pipeline.withTransaction(pool, async (client) => {
    return client.query(
      `UPDATE permits
       SET status = 'Pending Closed',
           completed_date = last_seen_at::date
       WHERE status NOT IN ('Pending Closed', 'Closed')
         AND last_seen_at < $1
       RETURNING permit_num`,
      [lastLoadAt]
    );
  });
  const pendingCount = pendingResult.rowCount || 0;
  pipeline.log.info('[close-stale]', `Pending Closed: ${pendingCount.toLocaleString()} permits`);

  // Step 2: Promote Pending Closed > 30 days to Closed
  const closedResult = await pipeline.withTransaction(pool, async (client) => {
    return client.query(
      `UPDATE permits
       SET status = 'Closed'
       WHERE status = 'Pending Closed'
         AND last_seen_at < NOW() - INTERVAL '30 days'
       RETURNING permit_num`
    );
  });
  const closedCount = closedResult.rowCount || 0;
  pipeline.log.info('[close-stale]', `Promoted to Closed: ${closedCount.toLocaleString()} permits`);

  // Cumulative counts
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'Pending Closed') AS total_pending,
       COUNT(*) FILTER (WHERE status = 'Closed') AS total_closed,
       COUNT(*) AS total
     FROM permits`
  );
  const totalPending = parseInt(statsResult.rows[0].total_pending, 10);
  const totalClosed = parseInt(statsResult.rows[0].total_closed, 10);
  const totalPermits = parseInt(statsResult.rows[0].total, 10);
  const closureRate = totalPermits > 0 ? ((totalPending + totalClosed) / totalPermits * 100) : 0;

  // VACUUM if we touched a lot of rows
  if (pendingCount + closedCount > 100) {
    await pool.query('VACUUM ANALYZE permits');
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[close-stale]', 'Complete', {
    pending_closed: pendingCount,
    promoted_to_closed: closedCount,
    total_pending: totalPending,
    total_closed: totalClosed,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Safety guard: if > 10% of permits are being closed in a single run,
  // the upstream permits load likely had a partial download (CKAN timeout, etc.)
  const pendingClosedRate = totalPermits > 0 ? (pendingCount / totalPermits * 100) : 0;
  const hasFails = pendingClosedRate >= 10;
  if (hasFails) {
    pipeline.log.error('[close-stale]', `Safety guard: ${pendingClosedRate.toFixed(1)}% closure rate exceeds 10% — possible partial CKAN download upstream`);
  }

  const auditRows = [
    { metric: 'last_load_at', value: new Date(lastLoadAt).toISOString().split('T')[0], threshold: null, status: 'INFO' },
    { metric: 'pending_closed', value: pendingCount, threshold: null, status: 'INFO' },
    { metric: 'pending_closed_rate', value: pendingClosedRate.toFixed(1) + '%', threshold: '< 10%', status: hasFails ? 'FAIL' : 'PASS' },
    { metric: 'promoted_to_closed', value: closedCount, threshold: null, status: 'INFO' },
    { metric: 'total_pending', value: totalPending, threshold: null, status: 'INFO' },
    { metric: 'total_closed', value: totalClosed, threshold: null, status: 'INFO' },
    { metric: 'closure_rate', value: closureRate.toFixed(1) + '%', threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: pendingCount + closedCount,
    records_new: 0,
    records_updated: pendingCount + closedCount,
    records_meta: {
      duration_ms: durationMs,
      pending_closed: pendingCount,
      promoted_to_closed: closedCount,
      total_pending: totalPending,
      total_closed: totalClosed,
      audit_table: {
        phase: 3,
        name: 'Stale Permit Closure',
        verdict: hasFails ? 'FAIL' : 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["status", "last_seen_at", "completed_date"], "pipeline_runs": ["pipeline", "status", "started_at"] },
    { "permits": ["status", "completed_date"] }
  );
});
