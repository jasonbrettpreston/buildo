// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 (realtor wire-up)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R5 (startup guards)
//
// Startup-guard helper for the realtor persona's data-layer dependency.
// Cycle 7's classifier (scripts/classify-permits.js, src/lib/sync/process.ts,
// scripts/reclassify-all.js) writes permit_trades rows with trade_id=33
// unconditionally. If migration 118 hasn't been applied, that INSERT
// hits the FK constraint `permit_trades_trade_id_fkey` and crashes the
// entire pipeline mid-run.
//
// This helper queries the trades table once at script-startup. The
// caller passes the boolean to the classifier's `realtorAvailable`
// option — when false, the classifier skips the realtor append.
// Pipeline completes successfully with construction-trade
// classification only; realtor classification is disabled until
// migration 118 lands.
//
// Defensive failure mode: any query error → returns false. Better to
// skip realtor than crash the pipeline. The caller logs a warning so
// operators see the disabled state in pipeline_runs output.

'use strict';

const REALTOR_TRADE_ID = 33;
const REALTOR_TRADE_SLUG = 'realtor';

/**
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: number; slug: string }> }> }} pool
 * @returns {Promise<boolean>} true if trades.id=33 with slug='realtor' exists; false otherwise (including on query error)
 */
async function checkRealtorAvailable(pool) {
  try {
    const result = await pool.query(
      `SELECT id, slug FROM trades WHERE id = $1 AND slug = $2`,
      [REALTOR_TRADE_ID, REALTOR_TRADE_SLUG],
    );
    return result.rows.length > 0;
  } catch {
    // Defensive: don't crash the caller. Returning false makes the
    // classifier skip realtor for this run; pipeline succeeds with
    // construction-trade classification only.
    return false;
  }
}

module.exports = {
  checkRealtorAvailable,
  REALTOR_TRADE_ID,
  REALTOR_TRADE_SLUG,
};
