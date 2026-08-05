#!/usr/bin/env node
/**
 * Seed pipeline_schedules with the operator-ruled cadences (Spec 115 §6,
 * P3-G11/P3-D3). Idempotent, re-runnable standalone CLI (not a Spec 47
 * pipeline script — no advisory lock / SDK wrapper needed for a small,
 * re-runnable display-data seed; mirrors scripts/seed-coa.js's
 * standalone-CLI shape and scripts/migrate.js's connection pattern).
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §6
 *
 * Why INSERT ... ON CONFLICT (pipeline, COALESCE(chain_id,'__ALL__')), not
 * UPDATE or ON CONFLICT (pipeline): migration 038's original
 * `PRIMARY KEY (pipeline)` is GONE — migration 095 replaced it with the
 * expression unique index `idx_pipeline_schedules_scope
 * (pipeline, COALESCE(chain_id, '__ALL__'))`. A bare `ON CONFLICT (pipeline)`
 * (migration 048's shape) fails at runtime today because no such constraint
 * exists for Postgres to infer against. `src/app/api/admin/pipelines/
 * schedules/route.ts:80-86` (the PATCH handler) already targets this exact
 * expression successfully — that is the working precedent this script
 * copies. A plain UPDATE would also silently no-op for `sources`/`entities`/
 * `deep_scrapes`, which have zero existing rows (P3-G11 live-verified: the
 * table holds only 27 step-level rows, all chain_id NULL).
 *
 * Usage: node scripts/seed-pipeline-schedules.js
 * Requires DATABASE_URL or PG_* environment variables.
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');

// Values per Spec 115 §2 (chain cadences) / §6 (this table's row inventory).
// All rows are global (chain_id = NULL) — none of these five pipelines need
// per-chain scoping today.
const SCHEDULES = [
  { pipeline: 'coa', cadence: 'Daily', cron_expression: '0 11 * * *' },
  { pipeline: 'permits', cadence: 'Daily', cron_expression: '0 11 * * *' },
  { pipeline: 'sources', cadence: 'Weekly', cron_expression: '0 13 * * 0' },
  { pipeline: 'entities', cadence: 'Daily', cron_expression: '0 8 * * *' },
  // Cadence cut 3 slots -> 1 on 2026-08-05 (`2fa3b2e7`) when the schedule was re-enabled;
  // must stay byte-equal to .github/workflows/chain-deep-scrapes.yml's live cron (Spec 115 §6).
  { pipeline: 'deep_scrapes', cadence: 'Weekdays (1x Daily)', cron_expression: '0 15 * * 1-5' },
];

async function main() {
  const pool = new Pool(
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: resolveSslConfig({ connectionString: process.env.DATABASE_URL }),
        }
      : {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432', 10),
          database: process.env.PG_DATABASE || 'buildo',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
          ssl: resolveSslConfig({ host: process.env.PG_HOST || 'localhost' }),
        }
  );

  console.log('=== Seeding pipeline_schedules (Spec 115 §6) ===\n');

  let inserted = 0;
  let updated = 0;

  try {
    for (const row of SCHEDULES) {
      const result = await pool.query(
        `INSERT INTO pipeline_schedules (pipeline, cadence, cron_expression, chain_id, enabled)
         VALUES ($1, $2, $3, NULL, TRUE)
         ON CONFLICT (pipeline, COALESCE(chain_id, '__ALL__'))
           DO UPDATE SET cadence = EXCLUDED.cadence, cron_expression = EXCLUDED.cron_expression
         RETURNING (xmax = 0) AS is_insert`,
        [row.pipeline, row.cadence, row.cron_expression]
      );
      if (result.rows[0]?.is_insert) {
        inserted++;
        console.log(`  INSERT  ${row.pipeline.padEnd(14)} ${row.cadence.padEnd(22)} ${row.cron_expression}`);
      } else {
        updated++;
        console.log(`  UPDATE  ${row.pipeline.padEnd(14)} ${row.cadence.padEnd(22)} ${row.cron_expression}`);
      }
    }

    console.log(`\nDone: ${inserted} inserted, ${updated} updated (of ${SCHEDULES.length} total rows).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed-pipeline-schedules FAILED:', err.message);
  process.exit(1);
});
