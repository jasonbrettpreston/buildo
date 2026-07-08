'use strict';
/**
 * self-feed-tracked-projects — materialize a `tracked_projects` row per
 * `lead_views.saved = true` row (Spec 82 §KFM-1, option (C) SELF-FEED).
 *
 * WHY: real saves land in `lead_views.saved` (src/app/api/leads/save/route.ts →
 * record-lead-view.ts) but the CRM alert engine reads its work queue FROM
 * `tracked_projects`, which no production code populates. Without this bridge
 * EVERY push notification is muted and Spec 81's competition/saturation signal
 * (rebuilt FROM tracked_projects into lead_analytics) reads zero for real users.
 *
 * DESIGN (Spec 82 §KFM-1 option c — the Guardian-discovered self-feed):
 *   1. INSERT ... SELECT one saved-status row per saved lead_view (permit + coa
 *      lead_types; builder leads have no CRM branch, so they are skipped).
 *      `ON CONFLICT DO NOTHING` — with NO conflict target so ALL three unique
 *      arbiters are handled gracefully:
 *        - uq_tracked_user_permit_trade (user_id, permit_num, revision_num, trade_slug)
 *        - uq_tracked_user_coa_trade    (user_id, lead_id, trade_slug) WHERE coa
 *        - uniq_tracked_projects_lead_id (lead_id) WHERE lead_id IS NOT NULL  [mig 140, GLOBAL]
 *      DO NOTHING means an existing row's memory columns (last_notified_*,
 *      notified_decision_rendered, status, claimed_at) are NEVER clobbered.
 *   2. REACTIVATE: a row previously auto-archived by the engine whose lead_view
 *      is saved=true again must re-enter the active board. A targeted UPDATE
 *      flips status 'archived' → 'saved' WITHOUT touching the notification-memory
 *      columns (only status + updated_at). Un-save does NOT archive here — the
 *      engine's own disappearance logic owns archiving.
 *
 * lead_id mapping:
 *   - permit lead_view (lead_key='permit:<num>:<rev>') → tracked_projects row with
 *     permit_num/revision_num set and lead_id NULL. Branch A of the engine's
 *     SOURCE_SQL reads p.lead_id from the permits JOIN, and the lead_analytics
 *     rebuild keys permit rows on permit_num/revision_num — so permit rows do
 *     NOT need a stored lead_id. Leaving it NULL also keeps permit leads
 *     multi-user (the GLOBAL uniq_tracked_projects_lead_id excludes NULLs).
 *   - coa lead_view (lead_key='coa:<application_number>') → tracked_projects row
 *     with lead_id = lead_key (already the canonical coa anchor) and permit_num/
 *     revision_num NULL.
 *
 * KNOWN LIMITATION (pre-existing schema, NOT introduced here): the GLOBAL
 * `uniq_tracked_projects_lead_id` (mig 140) caps a coa lead at ONE tracker
 * across all users — a second user saving the same coa lead is silently skipped
 * by DO NOTHING. Filed as a follow-up; permit leads are unaffected (lead_id NULL).
 *
 * SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §Known Failure Modes (KFM-1)
 */

// $1 = RUN_AT (DB clock timestamptz, captured at engine startup per Spec 47 §R3.5).
const SELF_FEED_INSERT_SQL = `
  INSERT INTO tracked_projects
    (user_id, permit_num, revision_num, trade_slug, lead_id, status, claimed_at, updated_at)
  SELECT user_id, permit_num, revision_num, trade_slug, lead_id,
         'saved', $1::timestamptz, $1::timestamptz
  FROM (
    -- Permit-side saves: keyed on permit_num/revision_num; lead_id stays NULL.
    SELECT lv.user_id,
           lv.permit_num,
           lv.revision_num,
           lv.trade_slug,
           NULL::text AS lead_id
    FROM lead_views lv
    WHERE lv.saved = true
      AND lv.lead_type = 'permit'
      AND lv.permit_num IS NOT NULL
      AND lv.revision_num IS NOT NULL

    UNION ALL

    -- CoA-side saves: lead_key IS the canonical 'coa:<application_number>' anchor.
    SELECT lv.user_id,
           NULL::text AS permit_num,
           NULL::text AS revision_num,
           lv.trade_slug,
           lv.lead_key AS lead_id
    FROM lead_views lv
    WHERE lv.saved = true
      AND lv.lead_type = 'coa'
      AND lv.lead_key LIKE 'coa:%'
  ) feed
  ON CONFLICT DO NOTHING
`;

// $1 = RUN_AT. Re-save-after-archive: bring an archived row back to the entry
// state ('saved') when its lead_view is saved=true again. Only status +
// updated_at change — the notification-memory columns are untouched.
const SELF_FEED_REACTIVATE_SQL = `
  UPDATE tracked_projects tp
     SET status = 'saved', updated_at = $1::timestamptz
   WHERE tp.status = 'archived'
     AND (
       EXISTS (
         SELECT 1 FROM lead_views lv
         WHERE lv.saved = true
           AND lv.lead_type = 'permit'
           AND lv.user_id = tp.user_id
           AND lv.permit_num = tp.permit_num
           AND lv.revision_num = tp.revision_num
           AND lv.trade_slug = tp.trade_slug
       )
       OR EXISTS (
         SELECT 1 FROM lead_views lv
         WHERE lv.saved = true
           AND lv.lead_type = 'coa'
           AND lv.user_id = tp.user_id
           AND lv.lead_key = tp.lead_id
           AND lv.trade_slug = tp.trade_slug
       )
     )
`;

/**
 * Run the self-feed inside a caller-provided transaction client.
 * @param {import('pg').PoolClient} client - inside a withTransaction block.
 * @param {string} runAt - RUN_AT timestamptz (Spec 47 §R3.5).
 * @returns {Promise<{ inserted: number, reactivated: number }>}
 */
async function runSelfFeed(client, runAt) {
  const ins = await client.query(SELF_FEED_INSERT_SQL, [runAt]);
  const react = await client.query(SELF_FEED_REACTIVATE_SQL, [runAt]);
  return {
    inserted: ins.rowCount ?? 0,
    reactivated: react.rowCount ?? 0,
  };
}

module.exports = {
  SELF_FEED_INSERT_SQL,
  SELF_FEED_REACTIVATE_SQL,
  runSelfFeed,
};
