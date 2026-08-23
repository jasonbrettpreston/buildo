#!/usr/bin/env node
/**
 * Idempotent logic_variables seed loader.
 *
 * Reads scripts/seeds/logic_variables.json and inserts each key into the
 * logic_variables table with ON CONFLICT DO NOTHING. Safe to re-run: existing
 * rows (including operator-tuned values) are never overwritten.
 *
 * Called automatically at the end of `npm run migrate` (via scripts/migrate.js).
 * Can also be invoked directly: `node scripts/seeds/apply-logic-variables.js`
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
 */
'use strict';

const SEEDS = require('./logic_variables.json');

/**
 * Insert all logic variable seeds into the database.
 * Existing rows (including operator-tuned values) are preserved.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} pool
 * @returns {Promise<void>}
 */
async function applyLogicVariables(pool) {
  const entries = Object.entries(SEEDS);
  let inserted = 0;

  for (const [key, meta] of entries) {
    const result = await pool.query(
      `INSERT INTO logic_variables (variable_key, variable_value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (variable_key) DO NOTHING`,
      [key, meta.default, meta.description ?? null],
    );
    inserted += result.rowCount ?? 0;
  }

  console.log(
    `Seeds: ${inserted}/${entries.length} logic_variables rows inserted` +
    ` (${entries.length - inserted} already existed — values preserved)`,
  );
}

module.exports = applyLogicVariables;

// ── Standalone invocation ────────────────────────────────────────────────────
if (require.main === module) {
  const { createResolvedPool } = require('../lib/resolve-db');

  const pool = createResolvedPool({ label: 'apply-logic-variables' });

  applyLogicVariables(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
