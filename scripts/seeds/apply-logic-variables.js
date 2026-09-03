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
 * ⚠️ DO-NOTHING BLIND SPOT (WF3 cloud-parity FIX 1, 2026-09-03). `ON CONFLICT
 * (variable_key) DO NOTHING` means this loader can only ever INSERT a
 * genuinely NEW key — a pre-existing row holding the WRONG value survives a
 * re-run silently, with no error and no log line naming the disagreement.
 * Live incident: cloud's `link_parcels_link_rate_warn_pct` had to be verified
 * by a separate before/after SQL SELECT (`.cursor/wf3_cloud_parity_active_task.md`
 * FIX 1 step 1.3) because the loader itself would have reported the same
 * "N/435 inserted" success line whether the pre-existing value was correct
 * (25) or dangerously wrong (75 — see the descriptor's `link_rate` check for
 * why those two are not interchangeable). Any caller that needs VALUE parity,
 * not just KEY presence, must diff `logic_variables` against this file's
 * defaults directly (see `src/tests/link-parcels.infra.test.ts`'s style of
 * seed-vs-default assertion, and FIX 1's 1.3b full-value-diff step) — this
 * loader's own success output is not evidence of that.
 *
 * ⚠️ STANDALONE INVOCATION REQUIRES `require.main === module` (below). A
 * caller that does `node -e "...; require('./scripts/seeds/apply-logic-variables.js')"`
 * loads this module and gets its export back, but NEVER runs it — the
 * standalone block below only fires when this file is the process's entry
 * point. Unlike `scripts/migrate.js` (which has no such guard and executes
 * unconditionally on require), this file must be invoked DIRECTLY:
 *   `node -r dotenv/config scripts/seeds/apply-logic-variables.js`
 * See `docs/runbook/README.md` §3 rule 1a for the cloud-explicit form.
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
