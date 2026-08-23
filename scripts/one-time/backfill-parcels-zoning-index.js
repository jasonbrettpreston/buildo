#!/usr/bin/env node
/**
 * One-time — create the post-enrichment indexes on parcels.zoning_* columns
 * (Spec 65 enrich-parcels). Runs CREATE INDEX CONCURRENTLY OUT OF BAND because
 * migration 165 cannot (validate-migration.js Rule 2 forbids non-CONCURRENTLY
 * indexes on >100K-row tables, and migrate.js runs each file in one transaction
 * where CONCURRENTLY is illegal). Same pattern as mig-116
 * backfill-address-points-geom.js. NOT in scripts/manifest.json; no advisory lock
 * (idempotent DDL, IF NOT EXISTS). Safe to re-run.
 *
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 (Index Deliverable)
 *
 * Usage: node scripts/one-time/backfill-parcels-zoning-index.js
 */
'use strict';

const { createResolvedPool } = require('../lib/resolve-db');

// CONCURRENTLY must run outside a transaction block → each via pool.query (autocommit).
const INDEXES = [
  // Primary lookup/join key — zoning_class filters and the WF3 permit join.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_zoning_class
     ON parcels (zoning_class) WHERE zoning_class IS NOT NULL`,
  // Chapter 900 exception lookups.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_exception_number
     ON parcels (exception_number) WHERE exception_number IS NOT NULL`,
  // Overlay-membership partial indexes (only the TRUE rows — sparse, small).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_in_policy_area
     ON parcels (parcel_id) WHERE in_policy_area`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_on_policy_road
     ON parcels (parcel_id) WHERE on_policy_road`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_in_rooming_house_overlay
     ON parcels (parcel_id) WHERE in_rooming_house_overlay`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_in_parking_zone_overlay
     ON parcels (parcel_id) WHERE in_parking_zone_overlay`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_in_building_setback_overlay
     ON parcels (parcel_id) WHERE in_building_setback_overlay`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_on_priority_retail
     ON parcels (parcel_id) WHERE on_priority_retail`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parcels_in_queenstw_eat_overlay
     ON parcels (parcel_id) WHERE in_queenstw_eat_overlay`,
];

async function main() {
  const pool = createResolvedPool({ label: 'backfill-parcels-zoning-index' });
  try {
    for (const sql of INDEXES) {
      const name = (sql.match(/idx_[a-z_]+/) || ['?'])[0];
      const t0 = Date.now();
      // CONCURRENTLY cannot run inside BEGIN/COMMIT — pool.query is autocommit.
      await pool.query(sql);
      console.log(`  OK ${name} (${Date.now() - t0}ms)`);
    }
    console.log(`Done: ${INDEXES.length} indexes ensured on parcels.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // A failed CONCURRENTLY leaves an INVALID index — surface it loudly so the
  // operator can DROP and re-run (never silently swallow; Spec 47).
  console.error('backfill-parcels-zoning-index FAILED:', err.message);
  console.error('If an index is left INVALID, DROP INDEX it and re-run.');
  process.exitCode = 1;
});
