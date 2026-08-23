#!/usr/bin/env node
/**
 * One-time — post-enrichment indexes on permits/coa_applications zoning columns
 * (Spec 66 enrich-permits). CREATE INDEX CONCURRENTLY out-of-band because migration
 * 166 cannot (validate-migration Rule 2 + CONCURRENTLY-in-txn). Partial indexes on
 * zoning_class (most rows are NULL — no-link/gap) + GIN on the jsonb columns for path
 * queries. Same pattern as backfill-parcels-zoning-index.js (Spec 65). NOT in
 * manifest.json; no advisory lock (idempotent DDL). Safe to re-run.
 *
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md §2 (Index Deliverable)
 * Usage: node scripts/one-time/backfill-permits-coa-zoning-index.js
 */
'use strict';

const { createResolvedPool } = require('../lib/resolve-db');

// CONCURRENTLY must run outside a transaction → each via pool.query (autocommit).
const INDEXES = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_zoning_class
     ON permits (zoning_class) WHERE zoning_class IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_applicable_bylaws_gin
     ON permits USING GIN (applicable_bylaws)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_overlay_summary_gin
     ON permits USING GIN (overlay_summary)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_zoning_class
     ON coa_applications (zoning_class) WHERE zoning_class IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_variance_context_gin
     ON coa_applications USING GIN (variance_context)`,
];

async function main() {
  const pool = createResolvedPool({ label: 'backfill-permits-coa-zoning-index' });
  try {
    for (const sql of INDEXES) {
      const name = (sql.match(/idx_[a-z_]+/) || ['?'])[0];
      const t0 = Date.now();
      await pool.query(sql); // autocommit — CONCURRENTLY cannot run inside BEGIN/COMMIT
      console.log(`  OK ${name} (${Date.now() - t0}ms)`);
    }
    console.log(`Done: ${INDEXES.length} indexes ensured on permits + coa_applications.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('backfill-permits-coa-zoning-index FAILED:', err.message);
  console.error('If an index is left INVALID, DROP INDEX it and re-run.');
  process.exitCode = 1;
});
