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
 * SPEC LINK: docs/specs/product/future/82_crm_assistant_alerts.md
 *
 * DUAL PATH NOTE: N/A — this script processes saved + claimed tracked_projects
 * in two internal routing paths (Path A / Path B), but there is no separate
 * TypeScript module maintaining parity. src/lib/classification/scoring.ts is
 * unrelated (computes lead_score, not CRM alert state).
 */
'use strict';

const { z } = require('zod');
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

// WF3-03 PR-B (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 82;

// spec §8.4: cap alerts array in records_meta at 200 items to prevent
// a burst of stalled projects from blowing up PIPELINE_SUMMARY payload.
const ALERTS_META_CAP = 200;

// WF3-01: Short push-friendly notification titles per spec 82 §4.
// The longer contextual sentence goes to notifications.body (see alerts.push calls).
const NOTIFICATION_TITLES = {
  STALL_WARNING:  'Site Stalled — Check your schedule.',
  STALL_CLEARED:  'Back to Work — Site is active again.',
  START_IMMINENT: 'Job Starting Soon — Confirm your crew.',
};

// spec 47 §6.3: stay under 65,535 parameters.
// notifications INSERT: 7 cols per row — user_id, type, permit_num,
// trade_slug, title, body, created_at → Math.floor(65535 / 7) = 9362.
const ALERT_INSERT_COLS = 7;
const ALERT_BATCH_SIZE  = Math.floor(65535 / ALERT_INSERT_COLS);

// Zod schema for per-trade config fields consumed by this script.
// spec 47 §4.2: validate before use — prevents silent wrong-type skips.
const TRADE_CONFIG_SCHEMA = z.object({
  bid_phase_cutoff:   z.string().min(1),
  work_phase_target:  z.string().min(1),
}).passthrough();

pipeline.run('update-tracked-projects', async (pool) => {
  // §R3.5: Capture run timestamp at pipeline startup — MANDATORY per skeleton.
  // Used as $1 in all updated_at writes to prevent the Midnight Cross.
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');

  // ─── Load Control Panel via shared loader ──────────────────
  // Done BEFORE lock acquisition so a config error doesn't hold the lock.
  const { tradeConfigs } = await loadMarketplaceConfigs(pool, 'tracked-projects');

  // spec 47 §4.2: validate each trade's required fields before use.
  // Invalid entries log a WARN and are treated as unmapped (skipped).
  const validTradeConfigs = {};
  for (const [slug, tc] of Object.entries(tradeConfigs)) {
    const result = TRADE_CONFIG_SCHEMA.safeParse(tc);
    if (!result.success) {
      pipeline.log.warn(
        '[tracked-projects]',
        `tradeConfigs[${slug}] missing required fields — trade will be skipped`,
        { errors: result.error.issues.map((i) => i.message) },
      );
    } else {
      validTradeConfigs[slug] = tc;
    }
  }

  const TRADE_TARGET_PHASE = Object.fromEntries(
    Object.entries(validTradeConfigs).map(([slug, tc]) => [slug, {
      bid_phase: tc.bid_phase_cutoff,
      work_phase: tc.work_phase_target,
    }]),
  );

  // ─── Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
  // Replaces hand-rolled lockClient + SIGTERM boilerplate. Two concurrent runs
  // would race on memory columns and double-fire CRM alerts. skipEmit:false so
  // the script emits its own rich SKIP payload (with audit_table) on lock-held.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  // ═══════════════════════════════════════════════════════════
  // Step 1: Stream all active tracked projects with forecast data
  //
  // spec 47 §6.1: tracked_projects is explicitly listed as always
  // requiring pipeline.streamQuery. pool.query would load the entire
  // active set into Node heap at once.
  //
  // §16.3 stale-snapshot guard not needed: advisory lock 82 prevents
  // concurrent script instances, and the two write-back targets
  // (tracked_projects.status/memory-columns, lead_analytics) are only
  // written by this script's own withTransaction blocks.
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[tracked-projects]', 'Streaming active tracked projects...');

  const SQL = `
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
    -- 'saved' = Path A + CLAIMED_STATUSES set ('claimed_unverified','claimed','verified') = Path B.
    -- Must stay in sync with the CLAIMED_STATUSES constant defined above.
    WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
  `;

  // ═══════════════════════════════════════════════════════════
  // Step 2: Process each row through the routing engine
  // ═══════════════════════════════════════════════════════════
  const updates = [];  // {id, fields} — batched DB updates
  const alerts = [];   // {user_id, type, message} — notification payloads

  let totalRows = 0;
  let archived = 0;
  let stallAlerts = 0;
  let recoveryAlerts = 0;
  let imminentAlerts = 0;
  let unmappedTrade = 0;
  // spec §8.2: computed not hardcoded — increment if a dispatch step is added.
  // Currently this script queues alerts for downstream delivery; no sends here.
  let deliveryErrors = 0;

  // WF3-04 (H-W14 / 82-W7): defensive telemetry for lifecycle_phase
  // values that are neither in PHASE_ORDINAL nor TERMINAL_PHASES.
  // Without this, any future orphan-like value would silently render
  // isWindowClosed=false forever with zero signal. Dedup by distinct
  // value so one unknown phase doesn't spam N WARNs per nightly run.
  let unknown_phase_skipped = 0;
  const unknownPhasesSeen = new Set();

  for await (const row of pipeline.streamQuery(pool, SQL, [])) {
    totalRows++;

    const targets = TRADE_TARGET_PHASE[row.trade_slug];
    if (!targets) { unmappedTrade++; continue; } // unmapped trade — skip

    const currentOrdinal = PHASE_ORDINAL[row.lifecycle_phase];
    const targetOrdinal = PHASE_ORDINAL[targets.work_phase];

    // ═══════════════════════════════════════════════════════════
    // WF3-03: Dead Lead Cleanup
    //
    // Null lifecycle_phase = unclassified or dead-state permit.
    // If it also has no forecast (urgency is null), it is a ghost
    // lead that will never trigger an alert and can never auto-archive
    // via isWindowClosed or urgency='expired'. Archive it to keep the
    // user's CRM flight-board clean. The update is routed through the
    // existing archiveIds SQL path — no new SQL statement needed.
    //
    // If urgency is non-null the permit has an active forecast signal
    // despite missing phase data — skip silently (don't archive) since
    // the phase may be assigned in a future classify run.
    //
    // Always continue regardless to skip the rest of the alerting logic
    // and avoid polluting the "unknown phase" telemetry with null rows.
    // ═══════════════════════════════════════════════════════════
    if (row.lifecycle_phase == null) {
      if (row.urgency == null) {
        updates.push({ id: row.tracking_id, status: 'archived' });
        archived++;
      }
      continue;
    }

    // Defensive WARN for genuinely unknown phase values (non-null, not
    // in PHASE_ORDINAL, not in TERMINAL_PHASES). See counter declaration.
    if (currentOrdinal == null && !TERMINAL_PHASES.has(row.lifecycle_phase)) {
      unknown_phase_skipped++;
      if (!unknownPhasesSeen.has(row.lifecycle_phase)) {
        unknownPhasesSeen.add(row.lifecycle_phase);
        pipeline.log.warn(
          '[tracked-projects]',
          `Unknown lifecycle_phase="${row.lifecycle_phase}" — neither in PHASE_ORDINAL nor TERMINAL_PHASES. `
            + 'Row will not auto-archive; investigate producer.',
          { permit_num: row.permit_num, revision_num: row.revision_num,
            trade_slug: row.trade_slug },
        );
      }
      continue;
    }

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
      // spec 47 §14.4: guard against invalid date strings from the DB before
      // calling .toISOString() — a corrupt predicted_start would throw, not
      // fall through the ternary. Number.isNaN(d.getTime()) catches that case.
      const _ps1 = row.predicted_start ? new Date(row.predicted_start) : null;
      const dateStr = (_ps1 && !Number.isNaN(_ps1.getTime()))
        ? _ps1.toISOString().slice(0, 10)
        : 'TBD';
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_WARNING',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.STALL_WARNING,
        body: `Schedule Alert: The site at ${row.permit_num} just stalled. Your ${row.trade_slug} target date has been pushed back to ${dateStr}.`,
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
        title: NOTIFICATION_TITLES.STALL_CLEARED,
        body: `Schedule Alert: The stop-work at ${row.permit_num} has been cleared. Construction is resuming.`,
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
      const _ps2 = row.predicted_start ? new Date(row.predicted_start) : null;
      const dateStr = (_ps2 && !Number.isNaN(_ps2.getTime()))
        ? _ps2.toISOString().slice(0, 10)
        : 'soon';
      alerts.push({
        user_id: row.user_id,
        type: 'START_IMMINENT',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.START_IMMINENT,
        body: `Action Required: Your ${row.trade_slug} job at ${row.permit_num} is IMMINENT (within ${row.imminent_window_days} days). Expected start: ${dateStr}.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_urgency: 'imminent',
      });
      imminentAlerts++;
    }

    // ═══════════════════════════════════════════════════════════
    // WF3-02 (B5): Urgency Reset
    //
    // If a project was previously marked imminent but the city delays
    // the permit (forecast shifts back to 'delayed' or 'upcoming'),
    // clear last_notified_urgency so the script can re-alert the user
    // when it approaches again.
    //
    // Silent state reset — no alert payload generated here.
    // ═══════════════════════════════════════════════════════════
    if (row.last_notified_urgency === 'imminent' && row.urgency !== 'imminent') {
      updates.push({
        id: row.tracking_id,
        last_notified_urgency: null,
      });
    }
  }

  pipeline.log.info('[tracked-projects]', `Streamed ${totalRows} active tracked projects`);
  pipeline.log.info('[tracked-projects]', `Archived: ${archived}`);
  pipeline.log.info(
    '[tracked-projects]',
    `Alerts: stall=${stallAlerts}, recovery=${recoveryAlerts}, imminent=${imminentAlerts}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 3: Merge + batch UPDATE tracked_projects
  //
  // WF3 fix #1: merge updates by ID before executing. A single row
  // can generate multiple update entries (e.g., stall alert sets
  // last_notified_stalled + imminent alert sets last_notified_urgency).
  // Without merging, we'd issue 2 UPDATEs for the same row.
  //
  // WF3 (spec 47 §7.5 N+1 fix): Replace per-row client.query with
  // category-based batch UPDATEs using ANY($ids::int[]).
  // Each unique field-combination gets ONE UPDATE statement that
  // targets its entire id set — at most 8 DB roundtrips for any
  // number of rows (5 original + 3 WF3-02 reset categories).
  //
  // updated_at uses $1 = RUN_AT (captured at startup) — not NOW() —
  // to prevent the Midnight Cross (spec 47 §14).
  // ═══════════════════════════════════════════════════════════
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
  let totalUpdated = 0;

  if (mergedUpdates.length > 0) {
    // Categorise by which fields change — each category maps to one UPDATE.
    //
    // WF3-02: Added 3 reset categories for last_notified_urgency = NULL.
    // The old `hasUrgency = upd.last_notified_urgency != null` evaluated to
    // false for null values, causing reset updates to silently fall through
    // to the invariant warning. isImminent / isReset replace it.
    const archiveIds = [];
    const stallOnIds = [];              // stalled = true
    const stallOffIds = [];             // stalled = false, no urgency change
    const imminentOnlyIds = [];         // urgency = 'imminent', no stall change
    const stallOffImminentIds = [];     // stalled = false + urgency = 'imminent'
    const resetUrgencyOnlyIds = [];     // urgency = NULL (WF3-02 reset)
    const stallOnResetUrgencyIds = [];  // stalled = true  + urgency = NULL (WF3-02)
    const stallOffResetUrgencyIds = []; // stalled = false + urgency = NULL (WF3-02)

    for (const upd of mergedUpdates) {
      const hasStatus  = upd.status === 'archived';
      const hasStall   = upd.last_notified_stalled != null;
      const isImminent = upd.last_notified_urgency === 'imminent';
      const isReset    = upd.last_notified_urgency === null;

      if (hasStatus) {
        archiveIds.push(upd.id);
      } else if (hasStall && !isImminent && !isReset) {
        (upd.last_notified_stalled === true ? stallOnIds : stallOffIds).push(upd.id);
      } else if (isImminent && !hasStall) {
        imminentOnlyIds.push(upd.id);
      } else if (hasStall && isImminent) {
        // B3 (stall recovery) + B4 (imminent) fired together — stall is always false here
        // because B4 requires lifecycle_stalled !== true.
        stallOffImminentIds.push(upd.id);
      } else if (isReset && !hasStall) {
        resetUrgencyOnlyIds.push(upd.id);
      } else if (hasStall && isReset) {
        (upd.last_notified_stalled === true ? stallOnResetUrgencyIds : stallOffResetUrgencyIds).push(upd.id);
      } else {
        // Defensive invariant: all update objects pushed by the routing engine
        // must set status, last_notified_stalled, or last_notified_urgency.
        pipeline.log.warn(
          '[tracked-projects]',
          'Batch categorizer: update object has no recognized fields — will not be written',
          { id: upd.id, fields: Object.keys(upd) },
        );
        deliveryErrors++;
      }
    }

    // WF3 fix #2: wrap all category UPDATEs in one withTransaction to
    // prevent partial state on crash. Memory flags + archive decisions
    // must be atomic — a crash between them would double-fire alerts.
    await pipeline.withTransaction(pool, async (client) => {
      // IS DISTINCT FROM guards on all 5 categories (spec 47 §12):
      // prevents re-writing rows whose state already matches the target,
      // keeping rowCount accurate and making re-runs truly idempotent.
      if (archiveIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET status = 'archived', updated_at = $1
            WHERE id = ANY($2::int[])
              AND status IS DISTINCT FROM 'archived'`,
          [RUN_AT, archiveIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOnIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = true, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_stalled IS DISTINCT FROM true`,
          [RUN_AT, stallOnIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOffIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_stalled IS DISTINCT FROM false`,
          [RUN_AT, stallOffIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (imminentOnlyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_urgency = 'imminent', updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_urgency IS DISTINCT FROM 'imminent'`,
          [RUN_AT, imminentOnlyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOffImminentIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false,
                  last_notified_urgency = 'imminent',
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM false
                   OR last_notified_urgency IS DISTINCT FROM 'imminent')`,
          [RUN_AT, stallOffImminentIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }

      // ═══════════════════════════════════════════════════════════
      // WF3-02: Urgency Reset SQL Executions
      // IS NOT NULL guard (not IS DISTINCT FROM) because the target
      // value IS null — IS DISTINCT FROM NULL would be equivalent to
      // IS NOT NULL, but making it explicit keeps the intent clear.
      // ═══════════════════════════════════════════════════════════
      if (resetUrgencyOnlyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_urgency = NULL, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_urgency IS NOT NULL`,
          [RUN_AT, resetUrgencyOnlyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOnResetUrgencyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = true,
                  last_notified_urgency = NULL,
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM true
                   OR last_notified_urgency IS NOT NULL)`,
          [RUN_AT, stallOnResetUrgencyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOffResetUrgencyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false,
                  last_notified_urgency = NULL,
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM false
                   OR last_notified_urgency IS NOT NULL)`,
          [RUN_AT, stallOffResetUrgencyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }

      // ═══════════════════════════════════════════════════════════
      // WF3-01: Atomic Notification Dispatch
      //
      // Spec 82 §4: the CRM Assistant MUST INSERT into the notifications
      // table for every generated alert. This block was previously missing —
      // alerts were queued in memory and emitted to PIPELINE_SUMMARY for
      // Datadog, but never persisted to the DB and never delivered to users.
      //
      // Atomicity (spec 47 §7.1): INSERT runs inside the SAME transaction
      // as the memory flag UPDATEs above. If the flag UPDATE commits but
      // the INSERT fails (or vice versa), the user either loses the alert
      // permanently or receives it again tomorrow. Atomic commit prevents both.
      //
      // Batching (spec 47 §7.6): multi-row VALUES INSERT — no N+1.
      // Parameter guard (spec 47 §6.3): chunk at ALERT_BATCH_SIZE to stay
      // under the 65,535 param hard limit even on burst-stall days.
      // Midnight Cross (spec 47 §14.2): use RUN_AT (captured at startup),
      // never NOW(), so created_at matches updated_at on tracked_projects.
      // ═══════════════════════════════════════════════════════════
      if (alerts.length > 0) {
        for (let i = 0; i < alerts.length; i += ALERT_BATCH_SIZE) {
          const batch = alerts.slice(i, i + ALERT_BATCH_SIZE);
          const tuples = batch.map((_, idx) => {
            const base = idx * ALERT_INSERT_COLS;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
          }).join(', ');
          const params = batch.flatMap((a) => [
            a.user_id, a.type, a.permit_num, a.trade_slug, a.title, a.body, RUN_AT,
          ]);
          await client.query(
            `INSERT INTO notifications
               (user_id, type, permit_num, trade_slug, title, body, created_at)
             VALUES ${tuples}`,
            params,
          );
        }
      }
    });
    pipeline.log.info(
      '[tracked-projects]',
      `Applied ${totalUpdated} DB updates (${mergedUpdates.length} merged from ${updates.length} raw)`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Step 4: Analytics Sync — populate lead_analytics
  // ═══════════════════════════════════════════════════════════
  //
  // Aggregates all tracked_projects by permit into lead_analytics so
  // the competition discount (opportunity score) reflects real user
  // behavior. Runs as a single SQL UPSERT — Postgres does the GROUP BY.
  // Uses LPAD to match the canonical lead_key format.
  //
  // updated_at uses $1 = RUN_AT — not NOW() — per spec 47 §14.
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
        $1::timestamptz
      FROM tracked_projects tp
      WHERE tp.status NOT IN ('archived', 'expired')
      GROUP BY tp.permit_num, tp.revision_num
      ON CONFLICT (lead_key) DO UPDATE SET
        tracking_count = EXCLUDED.tracking_count,
        saving_count = EXCLUDED.saving_count,
        updated_at = EXCLUDED.updated_at
      RETURNING 1
    `, [RUN_AT]);
    analyticsSynced = syncedRows.length;

    // Zero out lead_analytics rows where all trackers have been archived.
    // Operand order: la.lead_key on the left so Postgres can use the PK
    // index. Independent review Issue 1.
    const { rows: zeroedRows } = await client.query(`
      UPDATE lead_analytics la
         SET tracking_count = 0, saving_count = 0, updated_at = $1
       WHERE NOT EXISTS (
         SELECT 1 FROM tracked_projects tp
          WHERE la.lead_key = 'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0')
            AND tp.status NOT IN ('archived', 'expired')
       )
       AND (la.tracking_count > 0 OR la.saving_count > 0)
      RETURNING 1
    `, [RUN_AT]);
    analyticsZeroed = zeroedRows.length;
  });

  pipeline.log.info(
    '[tracked-projects]',
    `Analytics sync: ${analyticsSynced} upserted, ${analyticsZeroed} zeroed`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 5: Audit + Telemetry
  // ═══════════════════════════════════════════════════════════

  // spec §8.2 mandatory rows for "Alert delivery" type:
  // alerts_evaluated, alerts_delivered, delivery_errors
  const totalAlerts = stallAlerts + recoveryAlerts + imminentAlerts;
  const auditTableRows = [
    { metric: 'alerts_evaluated',  value: totalRows,    threshold: null, status: 'INFO' },
    { metric: 'alerts_delivered',  value: totalAlerts,  threshold: null, status: 'INFO' },
    { metric: 'delivery_errors',   value: deliveryErrors, threshold: 0, status: deliveryErrors > 0 ? 'FAIL' : 'PASS' },
    { metric: 'projects_archived', value: archived,     threshold: null, status: 'INFO' },
    { metric: 'unknown_phase',     value: unknown_phase_skipped, threshold: null, status: 'INFO' },
  ];
  const auditVerdict =
    auditTableRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditTableRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // spec §8.4: cap alerts array at ALERTS_META_CAP items.
  // A burst of stalled permits could produce thousands of alert payloads
  // — embedding them all in PIPELINE_SUMMARY would crash observability
  // ingestion (Datadog/CloudWatch row size limits). Use alerts_total +
  // alerts_truncated to preserve the count signal without the payload.
  const alertsCapped = alerts.slice(0, ALERTS_META_CAP);
  const alertsTruncated = alerts.length > ALERTS_META_CAP;

  pipeline.emitSummary({
    records_total: totalRows,
    records_new: 0,
    records_updated: totalUpdated,
    records_meta: {
      active_tracked: totalRows,
      archived,
      stall_alerts: stallAlerts,
      recovery_alerts: recoveryAlerts,
      imminent_alerts: imminentAlerts,
      alerts_total: alerts.length,
      ...(alertsTruncated ? { alerts_truncated: true } : {}),
      analytics_synced: analyticsSynced,
      analytics_zeroed: analyticsZeroed,
      unmapped_trade: unmappedTrade,
      unknown_phase_skipped,
      unknown_phase_values: [...unknownPhasesSeen],
      alerts: alertsCapped,
      run_at: RUN_AT,
      audit_table: {
        phase: 24,
        name: 'CRM Assistant',
        verdict: auditVerdict,
        rows: auditTableRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      tracked_projects: ['id', 'user_id', 'status', 'trade_slug', 'permit_num', 'revision_num', 'last_notified_urgency', 'last_notified_stalled'],
      permits: ['permit_num', 'revision_num', 'lifecycle_phase', 'lifecycle_stalled'],
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'predicted_start', 'urgency'],
      trade_configurations: ['trade_slug', 'imminent_window_days', 'bid_phase_cutoff', 'work_phase_target'],
    },
    {
      tracked_projects: ['status', 'last_notified_urgency', 'last_notified_stalled', 'updated_at'],
      lead_analytics: ['lead_key', 'tracking_count', 'saving_count', 'updated_at'],
    },
  );
  }, { skipEmit: false }); // end withAdvisoryLock

  // Lock held — emit rich SKIP with audit_table (FreshnessTimeline verdict).
  if (!lockResult.acquired) {
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        skipped: true, reason: 'advisory_lock_held_elsewhere',
        audit_table: {
          phase: 24,
          name: 'CRM Assistant',
          verdict: 'PASS',
          rows: [{ metric: 'skipped_lock_held', value: 1, threshold: null, status: 'INFO' }],
        },
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
