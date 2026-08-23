'use strict';
// WF2 P6.6 — one-off reset for the CoA trade fan-out fix (is_active = !fromBundle).
//
// WHY: classify-coa-trades' dirty predicate only fires for CoAs whose scope step
// re-ran (trade_classified_at IS NULL OR < scope_classified_at), and scope only
// re-fires for feed-re-seen CoAs. ~87% of CoAs are terminal and never re-seen, so
// a plain P7 chain run would flip only the re-seen sliver. Nulling
// trade_classified_at drains ALL rows through the dirty predicate so the corpus-
// wide fan-out fix (median 33→~15 active trades/CoA) actually lands. This also
// correctly re-fires compute_coa_cost_estimates downstream (its predicate is
// cost_classified_at < trade_classified_at).
//
// P7 PRECONDITION: run this IMMEDIATELY BEFORE the coa chain in Phase 7.
//   node scripts/analysis/wf2-reset-coa-trade-classification.js --confirm
//
// Guarded: without --confirm it only COUNTS (dry-run) and writes nothing.
require('dotenv/config');
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');

const CONFIRM = process.argv.includes('--confirm');

const pool = createResolvedPool({ label: 'wf2-reset-coa-trade-classification' });

(async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM coa_applications WHERE trade_classified_at IS NOT NULL`,
  );
  const eligible = rows[0].n;
  console.log(`[wf2-reset-coa-trade-classification] ${eligible} CoAs currently carry trade_classified_at`);

  if (!CONFIRM) {
    console.log('[wf2-reset-coa-trade-classification] DRY-RUN (no --confirm) — no writes. Re-run with --confirm to reset.');
    await pool.end();
    return;
  }

  // P7 precondition hardening [Gemini P9-pass]: a destructive NULL-out with no
  // rollback path is not acceptable. Back up (id, trade_classified_at) to a
  // dedicated table BEFORE nulling. Restore is a single documented UPDATE (below).
  const BACKUP_TABLE = '_backup_coa_trade_classified_20260707';
  await pool.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`);
  const bkp = await pool.query(
    `CREATE TABLE ${BACKUP_TABLE} AS
       SELECT id, trade_classified_at
       FROM coa_applications
       WHERE trade_classified_at IS NOT NULL`,
  );
  const bkpCount = await pool.query(`SELECT COUNT(*)::int AS n FROM ${BACKUP_TABLE}`);
  console.log(`[wf2-reset-coa-trade-classification] backed up ${bkpCount.rows[0].n} (id, trade_classified_at) pairs to ${BACKUP_TABLE} (CREATE TABLE AS reported ${bkp.rowCount}).`);
  console.log(`[wf2-reset-coa-trade-classification] RESTORE (one UPDATE, if the reset must be undone):`);
  console.log(`    UPDATE coa_applications c SET trade_classified_at = b.trade_classified_at`);
  console.log(`    FROM ${BACKUP_TABLE} b WHERE b.id = c.id;`);

  const res = await pool.query(
    `UPDATE coa_applications SET trade_classified_at = NULL WHERE trade_classified_at IS NOT NULL`,
  );
  console.log(`[wf2-reset-coa-trade-classification] reset trade_classified_at on ${res.rowCount} CoAs — the dirty predicate will now drain the full corpus on the next coa chain run.`);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
