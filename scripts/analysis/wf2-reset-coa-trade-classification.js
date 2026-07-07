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
const { Pool } = require('pg');

const CONFIRM = process.argv.includes('--confirm');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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

  const res = await pool.query(
    `UPDATE coa_applications SET trade_classified_at = NULL WHERE trade_classified_at IS NOT NULL`,
  );
  console.log(`[wf2-reset-coa-trade-classification] reset trade_classified_at on ${res.rowCount} CoAs — the dirty predicate will now drain the full corpus on the next coa chain run.`);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
