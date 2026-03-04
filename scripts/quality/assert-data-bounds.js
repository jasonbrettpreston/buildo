#!/usr/bin/env node
/**
 * CQA Tier 2: Post-Ingestion Data Bounds Validation
 *
 * Runs SQL-based validation queries against the local database to detect
 * data quality issues after ingestion: cost outliers, null rates, orphaned
 * records, and duplicate PKs.
 *
 * Usage: node scripts/quality/assert-data-bounds.js
 *
 * Exit 0 = pass (warnings are OK)
 * Exit 1 = fail (errors detected — orphans, duplicates, or critical nulls)
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const SLUG = 'assert_data_bounds';

async function count(sql) {
  const res = await pool.query(sql);
  return parseInt(res.rows[0].count, 10);
}

async function run() {
  console.log('\n=== CQA Tier 2: Data Bounds Validation ===\n');

  const startMs = Date.now();
  let runId = null;

  try {
    const res = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), 'running') RETURNING id`,
      [SLUG]
    );
    runId = res.rows[0].id;
  } catch (err) {
    console.warn('Could not insert pipeline_runs row:', err.message);
  }

  const warnings = [];
  const errors = [];

  try {
    // -----------------------------------------------------------------------
    // 1. Cost bounds
    // -----------------------------------------------------------------------
    const costOutliers = await count(
      `SELECT COUNT(*) FROM permits WHERE est_const_cost < 100 OR est_const_cost > 500000000`
    );
    if (costOutliers > 0) {
      warnings.push(`${costOutliers} permits with cost < $100 or > $500M`);
      console.log(`  WARN: ${costOutliers} permits with cost outliers`);
    } else {
      console.log('  OK: Cost bounds — no outliers');
    }

    // -----------------------------------------------------------------------
    // 2. Null-rate thresholds (recent batch — last 24h by last_seen_at)
    // -----------------------------------------------------------------------
    const recentTotal = await count(
      `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day'`
    );

    if (recentTotal > 0) {
      // description nulls > 5% = warning
      const descNull = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND description IS NULL`
      );
      const descPct = (descNull / recentTotal * 100).toFixed(1);
      if (descNull / recentTotal > 0.05) {
        warnings.push(`Description null rate ${descPct}% (${descNull}/${recentTotal})`);
        console.log(`  WARN: Description null rate ${descPct}%`);
      } else {
        console.log(`  OK: Description null rate ${descPct}%`);
      }

      // builder_name nulls > 20% = warning
      const builderNull = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND builder_name IS NULL`
      );
      const builderPct = (builderNull / recentTotal * 100).toFixed(1);
      if (builderNull / recentTotal > 0.20) {
        warnings.push(`Builder name null rate ${builderPct}% (${builderNull}/${recentTotal})`);
        console.log(`  WARN: Builder name null rate ${builderPct}%`);
      } else {
        console.log(`  OK: Builder name null rate ${builderPct}%`);
      }

      // status nulls > 0% = error
      const statusNull = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND status IS NULL`
      );
      if (statusNull > 0) {
        errors.push(`${statusNull} permits with NULL status`);
        console.error(`  FAIL: ${statusNull} permits with NULL status`);
      } else {
        console.log('  OK: No NULL status values');
      }
    } else {
      console.log('  SKIP: No recent permits (last 24h) — null rate checks skipped');
    }

    // -----------------------------------------------------------------------
    // 3. Referential audits
    // -----------------------------------------------------------------------

    // Orphaned permit_trades
    const orphanTrades = await count(
      `SELECT COUNT(*) FROM permit_trades pt
       LEFT JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
       WHERE p.permit_num IS NULL`
    );
    if (orphanTrades > 0) {
      errors.push(`${orphanTrades} orphaned permit_trades rows`);
      console.error(`  FAIL: ${orphanTrades} orphaned permit_trades rows`);
    } else {
      console.log('  OK: No orphaned permit_trades');
    }

    // Orphaned permit_parcels
    const orphanParcels = await count(
      `SELECT COUNT(*) FROM permit_parcels pp
       LEFT JOIN permits p ON p.permit_num = pp.permit_num AND p.revision_num = pp.revision_num
       WHERE p.permit_num IS NULL`
    );
    if (orphanParcels > 0) {
      errors.push(`${orphanParcels} orphaned permit_parcels rows`);
      console.error(`  FAIL: ${orphanParcels} orphaned permit_parcels rows`);
    } else {
      console.log('  OK: No orphaned permit_parcels');
    }

    // Orphaned coa links
    const orphanCoa = await count(
      `SELECT COUNT(*) FROM coa_applications ca
       WHERE ca.linked_permit_num IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = ca.linked_permit_num)`
    );
    if (orphanCoa > 0) {
      errors.push(`${orphanCoa} orphaned coa_applications linked_permit_num`);
      console.error(`  FAIL: ${orphanCoa} orphaned coa linked_permit_num`);
    } else {
      console.log('  OK: No orphaned CoA links');
    }

    // -----------------------------------------------------------------------
    // 4. Duplicate PK check
    // -----------------------------------------------------------------------
    const dupes = await count(
      `SELECT COUNT(*) FROM (
         SELECT permit_num, revision_num FROM permits
         GROUP BY permit_num, revision_num HAVING COUNT(*) > 1
       ) d`
    );
    if (dupes > 0) {
      errors.push(`${dupes} duplicate (permit_num, revision_num) groups`);
      console.error(`  FAIL: ${dupes} duplicate PK groups`);
    } else {
      console.log('  OK: No duplicate PKs');
    }

  } catch (err) {
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startMs;
  const hasErrors = errors.length > 0;
  const status = hasErrors ? 'failed' : 'completed';
  const allMessages = [...errors, ...warnings.map((w) => `WARN: ${w}`)];
  const errorMsg = allMessages.length > 0 ? allMessages.join('; ') : null;

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId]
    ).catch(() => {});
  }

  if (warnings.length > 0) {
    console.log(`\n  Warnings: ${warnings.length}`);
  }
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
  }

  console.log(`\n=== Data Bounds: ${status.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s) ===\n`);

  await pool.end();

  if (hasErrors) process.exit(1);
}

run().catch((err) => {
  console.error('Data bounds validation error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
