#!/usr/bin/env node
/**
 * Update Tracked Projects — the CRM Assistant.
 *
 * Nightly pipeline script that processes saved + claimed projects,
 * detects state changes (stalled, urgency shifts, window closures),
 * generates alerts ONLY when reality shifts, and auto-archives dead
 * leads. Two "memory" columns (last_notified_urgency, last_notified_stalled)
 * prevent duplicate notifications across runs.
 *
 * Two routing paths:
 *   Path A (Saved): passive watchlist — auto-archive only, no alerts
 *   Path B (Claimed): active flight board — stall/recovery/imminent alerts
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const {
  TRADE_TARGET_PHASE: TRADE_TARGET_PHASE_FALLBACK,
  PHASE_ORDINAL,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

// Terminal phases that should trigger auto-archive regardless of
// ordinal comparison. PHASE_ORDINAL omits these, so isWindowClosed
// would never fire for P19/P20 permits. Independent review gap.
const TERMINAL_PHASES = new Set(['P19', 'P20']);

// Claimed statuses — these get the full alert treatment
const CLAIMED_STATUSES = new Set([
  'claimed_unverified', 'claimed', 'verified',
]);

pipeline.run('update-tracked-projects', async (pool) => {
  // ─── Load Control Panel via shared loader ──────────────────
  const { tradeConfigs } = await loadMarketplaceConfigs(pool, 'tracked-projects');
  const TRADE_TARGET_PHASE = Object.fromEntries(
    Object.entries(tradeConfigs).map(([slug, tc]) => [slug, {
      bid_phase: tc.bid_phase_cutoff,
      work_phase: tc.work_phase_target,
    }]),
  );

  // ═══════════════════════════════════════════════════════════
  // Step 1: Query all active tracked projects with forecast data
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[tracked-projects]', 'Querying active tracked projects...');

  const { rows } = await pool.query(`
    SELECT
      tp.id AS tracking_id,
      tp.user_id,
      tp.status AS tracking_status,
      tp.trade_slug,
      tp.permit_num,
      tp.revision_num,
      p.lifecycle_phase,
      p.lifecycle_stalled,
      tf.predicted_start,
      tf.urgency,
      tp.last_notified_urgency,
      tp.last_notified_stalled,
      COALESCE(tc.imminent_window_days, 14) AS imminent_window_days
    FROM tracked_projects tp
    JOIN permits p ON tp.permit_num = p.permit_num
                  AND tp.revision_num = p.revision_num
    LEFT JOIN trade_forecasts tf ON tp.permit_num = tf.permit_num
                                 AND tp.revision_num = tf.revision_num
                                 AND tp.trade_slug = tf.trade_slug
    LEFT JOIN trade_configurations tc ON tc.trade_slug = tp.trade_slug
    WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
  `);

  pipeline.log.info(
    '[tracked-projects]',
    `Active tracked projects: ${rows.length}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 2: Process each row through the routing engine
  // ═══════════════════════════════════════════════════════════
  const updates = [];  // {id, fields} — batched DB updates
  const alerts = [];   // {user_id, type, message} — notification payloads

  let archived = 0;
  let stallAlerts = 0;
  let recoveryAlerts = 0;
  let imminentAlerts = 0;

  for (const row of rows) {
    const targets = TRADE_TARGET_PHASE[row.trade_slug];
    if (!targets) continue; // unmapped trade — skip

    const currentOrdinal = PHASE_ORDINAL[row.lifecycle_phase];
    const targetOrdinal = PHASE_ORDINAL[targets.work_phase];

    // Window closed: permit physically passed the trade's work phase,
    // OR permit reached a terminal phase (P19/P20). Terminal phases
    // are not in PHASE_ORDINAL so the ordinal check would miss them.
    const isWindowClosed = TERMINAL_PHASES.has(row.lifecycle_phase)
      || (currentOrdinal != null && targetOrdinal != null
          && currentOrdinal >= targetOrdinal);

    // ─── Path A: Saved (passive watchlist) ──────────────────
    if (row.tracking_status === 'saved') {
      if (isWindowClosed || row.urgency === 'expired') {
        updates.push({ id: row.tracking_id, status: 'archived' });
        archived++;
      }
      // No alerts for saves — passive watchlist
      continue;
    }

    // ─── Path B: Claimed (active flight board) ──────────────
    if (!CLAIMED_STATUSES.has(row.tracking_status)) continue;

    // B1. Auto-archive: window closed → job is starting/done
    if (isWindowClosed) {
      updates.push({ id: row.tracking_id, status: 'archived' });
      archived++;
      continue; // No alerts on closed jobs
    }

    // B1b. Auto-archive claimed leads whose urgency is 'expired'
    // (WF3 2026-04-13). Previously only saved leads archived on
    // urgency=expired; claimed leads would accumulate in the
    // tracked_projects table indefinitely even after the forecast
    // engine had given up on them. The expired threshold itself is
    // controlled by logic_variables.expired_threshold_days (consumed
    // upstream by compute-trade-forecasts.classifyUrgency), so this
    // archive is effectively the lead_expiry_days TTL enforcement.
    if (row.urgency === 'expired') {
      updates.push({ id: row.tracking_id, status: 'archived' });
      archived++;
      continue;
    }

    // B2. Stall alert: site just stalled (state-change detection)
    if (row.lifecycle_stalled === true && row.last_notified_stalled !== true) {
      const dateStr = row.predicted_start
        ? new Date(row.predicted_start).toISOString().slice(0, 10)
        : 'TBD';
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_WARNING',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        message: `Schedule Alert: The site at ${row.permit_num} just stalled. Your ${row.trade_slug} target date has been pushed back to ${dateStr}.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_stalled: true,
      });
      stallAlerts++;
    }

    // B3. Recovery alert: site just unstalled
    if (row.lifecycle_stalled === false && row.last_notified_stalled === true) {
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_CLEARED',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        message: `Schedule Alert: The stop-work at ${row.permit_num} has been cleared. Construction is resuming.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_stalled: false,
      });
      recoveryAlerts++;
    }

    // B4. Imminent alert: urgency just shifted to imminent.
    // Skip if stalled — a stalled site with "imminent" urgency is
    // contradictory (the predicted_start is unreliable during stall).
    // WF3: both reviewers flagged the double-alert scenario.
    if (row.urgency === 'imminent' && row.last_notified_urgency !== 'imminent'
        && row.lifecycle_stalled !== true) {
      const dateStr = row.predicted_start
        ? new Date(row.predicted_start).toISOString().slice(0, 10)
        : 'soon';
      alerts.push({
        user_id: row.user_id,
        type: 'START_IMMINENT',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        message: `Action Required: Your ${row.trade_slug} job at ${row.permit_num} is IMMINENT (within ${row.imminent_window_days} days). Expected start: ${dateStr}.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_urgency: 'imminent',
      });
      imminentAlerts++;
    }
  }

  pipeline.log.info('[tracked-projects]', `Archived: ${archived}`);
  pipeline.log.info('[tracked-projects]', `Alerts: stall=${stallAlerts}, recovery=${recoveryAlerts}, imminent=${imminentAlerts}`);

  // ═══════════════════════════════════════════════════════════
  // Step 3: Merge + batch UPDATE tracked_projects
  // ═══════════════════════════════════════════════════════════
  //
  // WF3 fix #1: merge updates by ID before executing. A single row
  // can generate multiple update entries (e.g., stall alert sets
  // last_notified_stalled + imminent alert sets last_notified_urgency).
  // Without merging, we'd issue 2 UPDATEs for the same row.
  const merged = new Map();
  for (const upd of updates) {
    const existing = merged.get(upd.id);
    if (existing) {
      Object.assign(existing, upd); // later fields overwrite earlier
    } else {
      merged.set(upd.id, { ...upd });
    }
  }

  const mergedUpdates = [...merged.values()];
  if (mergedUpdates.length > 0) {
    // WF3 fix #2: wrap in withTransaction to prevent partial state
    // on crash. Without this, a crash mid-loop leaves some memory
    // flags updated and others not → duplicate alerts on next run.
    await pipeline.withTransaction(pool, async (client) => {
      for (const upd of mergedUpdates) {
        const setClauses = [];
        const params = [];
        let paramIdx = 1;

        if (upd.status != null) {
          setClauses.push(`status = $${paramIdx++}`);
          params.push(upd.status);
        }
        if (upd.last_notified_stalled != null) {
          setClauses.push(`last_notified_stalled = $${paramIdx++}`);
          params.push(upd.last_notified_stalled);
        }
        if (upd.last_notified_urgency != null) {
          setClauses.push(`last_notified_urgency = $${paramIdx++}`);
          params.push(upd.last_notified_urgency);
        }

        // Always bump updated_at on any change
        setClauses.push(`updated_at = NOW()`);

        params.push(upd.id);
        await client.query(
          `UPDATE tracked_projects SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          params,
        );
      }
    });
    pipeline.log.info('[tracked-projects]', `Applied ${mergedUpdates.length} DB updates (merged from ${updates.length} raw)`);
  }

  // ═══════════════════════════════════════════════════════════
  // Step 4: Analytics Sync — populate lead_analytics
  // ═══════════════════════════════════════════════════════════
  //
  // Aggregates all tracked_projects by permit into lead_analytics so
  // the competition discount (opportunity score) reflects real user
  // behavior. Runs as a single SQL UPSERT — Postgres does the GROUP BY.
  // Uses LPAD to match the canonical lead_key format.
  pipeline.log.info('[tracked-projects]', 'Syncing lead_analytics...');

  // Wrap both UPSERT + zero-out in a single transaction so a crash
  // between them doesn't leave stale non-zero counts alongside fresh
  // counts. Adversarial review: data corruption vector without atomicity.
  let analyticsSynced = 0;
  let analyticsZeroed = 0;

  await pipeline.withTransaction(pool, async (client) => {
    const { rows: syncedRows } = await client.query(`
      INSERT INTO lead_analytics (lead_key, tracking_count, saving_count, updated_at)
      SELECT
        'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0') AS lead_key,
        COUNT(*) FILTER (WHERE tp.status IN ('claimed_unverified', 'claimed', 'verified'))::int AS tracking_count,
        COUNT(*) FILTER (WHERE tp.status = 'saved')::int AS saving_count,
        NOW()
      FROM tracked_projects tp
      WHERE tp.status NOT IN ('archived', 'expired')
      GROUP BY tp.permit_num, tp.revision_num
      ON CONFLICT (lead_key) DO UPDATE SET
        tracking_count = EXCLUDED.tracking_count,
        saving_count = EXCLUDED.saving_count,
        updated_at = NOW()
      RETURNING 1
    `);
    analyticsSynced = syncedRows.length;

    // Zero out lead_analytics rows where all trackers have been archived.
    // Operand order: la.lead_key on the left so Postgres can use the PK
    // index. Independent review Issue 1.
    const { rows: zeroedRows } = await client.query(`
      UPDATE lead_analytics la
         SET tracking_count = 0, saving_count = 0, updated_at = NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM tracked_projects tp
          WHERE la.lead_key = 'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0')
            AND tp.status NOT IN ('archived', 'expired')
       )
       AND (la.tracking_count > 0 OR la.saving_count > 0)
      RETURNING 1
    `);
    analyticsZeroed = zeroedRows.length;
  });

  pipeline.log.info(
    '[tracked-projects]',
    `Analytics sync: ${analyticsSynced} upserted, ${analyticsZeroed} zeroed`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 5: Telemetry
  // ═══════════════════════════════════════════════════════════
  pipeline.emitSummary({
    records_total: rows.length,
    records_new: 0,
    records_updated: updates.length,
    records_meta: {
      active_tracked: rows.length,
      archived,
      stall_alerts: stallAlerts,
      recovery_alerts: recoveryAlerts,
      imminent_alerts: imminentAlerts,
      total_alerts: alerts.length,
      analytics_synced: analyticsSynced,
      analytics_zeroed: analyticsZeroed,
      alerts,
    },
  });

  pipeline.emitMeta(
    {
      tracked_projects: ['id', 'user_id', 'status', 'trade_slug', 'permit_num', 'revision_num', 'last_notified_urgency', 'last_notified_stalled'],
      permits: ['permit_num', 'revision_num', 'lifecycle_phase', 'lifecycle_stalled'],
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'predicted_start', 'urgency'],
    },
    {
      tracked_projects: ['status', 'last_notified_urgency', 'last_notified_stalled', 'updated_at'],
      lead_analytics: ['lead_key', 'tracking_count', 'saving_count', 'updated_at'],
    },
  );
});
