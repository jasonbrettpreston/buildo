#!/usr/bin/env node
/**
 * CQA Tier 2: Post-Ingestion Data Bounds Validation
 *
 * Runs SQL-based validation queries against the local database to detect
 * data quality issues after ingestion: cost outliers, null rates, orphaned
 * records, duplicate PKs, and source table row counts and bounds.
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

// When run from a chain (via run-chain.js), PIPELINE_CHAIN env var is set.
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

async function count(sql) {
  const res = await pool.query(sql);
  return parseInt(res.rows[0].count, 10);
}

async function run() {
  console.log('\n=== CQA Tier 2: Data Bounds Validation ===\n');

  const startMs = Date.now();
  let runId = null;

  // Skip own pipeline_runs tracking when run from a chain
  if (!CHAIN_ID) {
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
  }

  // Determine which checks to run based on chain context
  const runPermitChecks = !CHAIN_ID || CHAIN_ID === 'permits';
  const runCoaChecks    = !CHAIN_ID || CHAIN_ID === 'permits' || CHAIN_ID === 'coa';
  const runSourceChecks = !CHAIN_ID || CHAIN_ID === 'sources';

  const warnings = [];
  const errors = [];

  try {
    // -----------------------------------------------------------------------
    // Permit-scoped checks (sections 1-4)
    // -----------------------------------------------------------------------
    if (runPermitChecks) {
      // 1. Cost bounds
      const costOutliers = await count(
        `SELECT COUNT(*) FROM permits WHERE est_const_cost < 100 OR est_const_cost > 500000000`
      );
      if (costOutliers > 0) {
        warnings.push(`${costOutliers} permits with cost < $100 or > $500M`);
        console.log(`  WARN: ${costOutliers} permits with cost outliers`);
      } else {
        console.log('  OK: Cost bounds — no outliers');
      }

      // 2. Null-rate thresholds (recent batch — last 24h by last_seen_at)
      const recentTotal = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day'`
      );

      if (recentTotal > 0) {
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

      // 3. Referential audits
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

      // 4. Duplicate PK check
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
    }

    // -----------------------------------------------------------------------
    // CoA-scoped checks
    // -----------------------------------------------------------------------
    if (runCoaChecks) {
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
    }

    // -----------------------------------------------------------------------
    // Source-scoped checks (sections 5-8)
    // -----------------------------------------------------------------------
    if (runSourceChecks) {
      // 5. address_points
      const apCount = await count(`SELECT COUNT(*) FROM address_points`);
      if (apCount === 0) {
        errors.push('address_points table is empty');
        console.error('  FAIL: address_points table is empty');
      } else {
        console.log(`  OK: address_points has ${apCount.toLocaleString()} rows`);
      }

      const apDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT address_point_id FROM address_points
           GROUP BY address_point_id HAVING COUNT(*) > 1
         ) d`
      );
      if (apDupes > 0) {
        errors.push(`${apDupes} duplicate address_point_id groups`);
        console.error(`  FAIL: ${apDupes} duplicate address_point_id groups`);
      } else {
        console.log('  OK: No duplicate address_point_id');
      }

      // 6. parcels
      const parcelCount = await count(`SELECT COUNT(*) FROM parcels`);
      if (parcelCount === 0) {
        errors.push('parcels table is empty');
        console.error('  FAIL: parcels table is empty');
      } else {
        console.log(`  OK: parcels has ${parcelCount.toLocaleString()} rows`);
      }

      const parcelDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT parcel_id FROM parcels
           GROUP BY parcel_id HAVING COUNT(*) > 1
         ) d`
      );
      if (parcelDupes > 0) {
        errors.push(`${parcelDupes} duplicate parcel_id groups`);
        console.error(`  FAIL: ${parcelDupes} duplicate parcel_id groups`);
      } else {
        console.log('  OK: No duplicate parcel_id');
      }

      const lotOutliers = await count(
        `SELECT COUNT(*) FROM parcels WHERE lot_size_sqm IS NOT NULL AND (lot_size_sqm <= 0 OR lot_size_sqm > 1000000)`
      );
      if (lotOutliers > 0) {
        warnings.push(`${lotOutliers} parcels with lot_size_sqm out of bounds (0-1M sqm)`);
        console.log(`  WARN: ${lotOutliers} parcels with lot size outliers`);
      } else {
        console.log('  OK: Parcel lot sizes within bounds');
      }

      // 7. building_footprints
      const bfCount = await count(`SELECT COUNT(*) FROM building_footprints`);
      if (bfCount === 0) {
        errors.push('building_footprints table is empty');
        console.error('  FAIL: building_footprints table is empty');
      } else {
        console.log(`  OK: building_footprints has ${bfCount.toLocaleString()} rows`);
      }

      const heightOutliers = await count(
        `SELECT COUNT(*) FROM building_footprints WHERE max_height IS NOT NULL AND (max_height <= 0 OR max_height > 500)`
      );
      if (heightOutliers > 0) {
        warnings.push(`${heightOutliers} building_footprints with max_height out of bounds (0-500m)`);
        console.log(`  WARN: ${heightOutliers} building footprints with height outliers`);
      } else {
        console.log('  OK: Building footprint heights within bounds');
      }

      // 8. neighbourhoods
      const nhoodCount = await count(`SELECT COUNT(*) FROM neighbourhoods`);
      if (nhoodCount < 158) {
        errors.push(`neighbourhoods has ${nhoodCount} rows (expected >= 158)`);
        console.error(`  FAIL: neighbourhoods has ${nhoodCount} rows (expected >= 158)`);
      } else {
        console.log(`  OK: neighbourhoods has ${nhoodCount} rows (>= 158)`);
      }

      const nhoodDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT neighbourhood_id FROM neighbourhoods
           GROUP BY neighbourhood_id HAVING COUNT(*) > 1
         ) d`
      );
      if (nhoodDupes > 0) {
        errors.push(`${nhoodDupes} duplicate neighbourhood_id groups`);
        console.error(`  FAIL: ${nhoodDupes} duplicate neighbourhood_id groups`);
      } else {
        console.log('  OK: No duplicate neighbourhood_id');
      }
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
