#!/usr/bin/env node
/**
 * Dispatch Notifications — the ONE sender (P25 25A/25B).
 *
 * Reads the `notifications` queue (written by the two enqueuers:
 * classify-lifecycle-phase.js and update-tracked-projects.js), and delivers each
 * eligible row to Expo EXACTLY ONCE per (user, lead, type, Toronto-date) via the
 * `notification_dispatches` ledger. Replaces the pre-P25 direct sender that lived
 * inside classify-lifecycle-phase.js (which double-sent) and activates Spec 82's
 * queue (which no sender ever read).
 *
 * Inert until `notifications_dispatch_enabled = 1` (seeded OFF). The step is a
 * no-op SKIP while the kill-switch is OFF — this is the intermediate-safe state.
 *
 * SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');
const {
  sendPushChunk,
  fetchReceipts,
  DEVICE_NOT_REGISTERED,
  MAX_CHUNK,
} = require('./lib/push-dispatch');
const {
  DISPATCHABLE_TYPES_V1,
  PREF_COLUMN_BY_TYPE,
  isScheduleGated,
  entityIdFromLead,
} = require('./lib/notification-types');

// §R2 — advisory lock id. 101 (the spec number) was taken by purge-lead-views.js,
// and 122 by a one-time backfill, so 123 is assigned from the free range
// (compute-phase-calibration precedent). Registered in
// src/tests/pipeline-advisory-lock.infra.test.ts + Spec 47 §A.5.
const ADVISORY_LOCK_ID = 123;

// §R4 — config schema. Every consumed logic_variable appears here and is
// validated at startup so a bad DB value fails fast, never silently.
const CONFIG_SCHEMA = z.object({
  notifications_dispatch_enabled: z.coerce.number().int().min(0).max(1),
  notifications_max_per_user_per_day: z.coerce.number().int().min(0),
  // JSONB array — config-loader returns the parsed value (or a stringified
  // fallback); coerce defensively to an array of strings.
  notifications_disabled_types: z
    .union([z.array(z.string()), z.string(), z.null()])
    .transform((v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v.trim()) {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
      }
      return [];
    }),
  // Freshness bound (hours) for START_DATE_URGENT queue rows (25E #4). Seeded by
  // mig 222; the `.default(168)` is the inert-safety fallback — this schema is
  // parsed (:~99) BEFORE the kill-switch check, so a missing/undefined DB value
  // must NOT throw (a throw here aborts the whole permits chain and skips
  // backup_db). 168h == the 6-7 day URGENT enqueue horizon.
  notifications_max_stale_hours: z.coerce.number().int().positive().default(168),
}).passthrough();

// The America/Toronto calendar date (YYYY-MM-DD) for a given instant — DST-aware.
// This is the dedup date; a UTC DATE() would split a Toronto evening across two
// calendar days (the double-send hole this engine closes).
const _torontoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
});
function torontoDate(instant) {
  return _torontoDateFmt.format(instant); // en-CA → YYYY-MM-DD
}

// hourCycle:'h23' pins the range to 0-23. Plain `hour12:false` emits "24" at
// midnight on some ICU builds (25E #8) → scheduleWindow would misclassify it as
// past-window. Low real-world impact (cron is 6AM) but deterministic now.
const _torontoHourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23',
});
function torontoHour(instant) {
  return safeParsePositiveInt(_torontoHourFmt.format(instant), 'toronto_hour');
}

// Delivery-window bounds per notification_schedule (mirrors the pre-P25 sender
// isScheduleAllowed at classify-lifecycle-phase.js:61). Returns { inWindow, endHour }.
function scheduleWindow(schedule, hour) {
  if (schedule === 'morning') return { inWindow: hour >= 6 && hour < 9, endHour: 9 };
  if (schedule === 'evening') return { inWindow: hour >= 17 && hour < 20, endHour: 20 };
  return { inWindow: true, endHour: 24 }; // anytime
}

// entityIdFromLead (the NUM--REV deep-link composition) is imported from
// ./lib/notification-types — the shared home so the cross-contract lock test
// can require the REAL composition without executing pipeline.run.

// type → the urgency label the pre-P25 payload carried.
function urgencyForType(type) {
  if (type === 'LIFECYCLE_STALLED') return 'stalled';
  if (type === 'START_DATE_URGENT') return 'urgent';
  return 'normal';
}

pipeline.run('dispatch-notifications', async (pool) => {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'dispatch-notifications');
  const config = CONFIG_SCHEMA.parse({
    notifications_dispatch_enabled: logicVars.notifications_dispatch_enabled,
    notifications_max_per_user_per_day: logicVars.notifications_max_per_user_per_day,
    notifications_disabled_types: logicVars.notifications_disabled_types,
    notifications_max_stale_hours: logicVars.notifications_max_stale_hours,
  });

  // Test-only transport injection (the 25E mock-transport battery). Production
  // leaves this unset → push-dispatch uses its default https transport.
  const transport = global.__BUILDO_PUSH_TRANSPORT__ || undefined;

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // §R1 — kill-switch. Inert (no sends) until an operator flips the gate ON.
    if (config.notifications_dispatch_enabled !== 1) {
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'notifications_dispatch_enabled=0 (kill-switch OFF)',
          audit_table: {
            phase: 22, name: 'Dispatch Notifications', verdict: 'SKIP',
            rows: [{ metric: 'dispatch_enabled', value: 0, threshold: '=1 to dispatch', status: 'PASS' }],
          },
        },
      });
      pipeline.emitMeta({ logic_variables: ['notifications_dispatch_enabled'] }, {});
      return;
    }

    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const today = torontoDate(RUN_AT);
    const hour = torontoHour(RUN_AT);
    const disabledSet = new Set(config.notifications_disabled_types);

    let dispatched = 0;
    let deliveryErrors = 0;
    let tokensPruned = 0;
    let deferred = 0;
    let deferredExpired = 0;
    let staleDropped = 0;          // 25E #4 — URGENT rows retired past the freshness bound
    let duplicatesSuppressed = 0;  // 25E #1 — duplicate queue rows retired without a send
    let ceilingHit = 0;            // 25E #6 — eligible rows left for next run by the memory ceiling

    // ── Receipt pass (25B): fetch receipts for the PRIOR run's sent tickets and
    // prune any exact token that resolved to DeviceNotRegistered (~24h lag).
    // Best-effort — never aborts the run.
    try {
      // 25E #7: 5-day lookback (was 2d) covers the Fri→Mon (and stat-holiday
      // Fri→Tue) weekday-cron gap; `receipt_checked_at IS NULL` makes the wider
      // window exactly-once so an already-checked ticket is never re-fetched.
      const { rows: priorTickets } = await pool.query(
        `SELECT id, expo_ticket_id, push_token
           FROM notification_dispatches
          WHERE status = 'sent' AND expo_ticket_id IS NOT NULL
            AND receipt_checked_at IS NULL
            AND dispatched_at >= $1::timestamptz - INTERVAL '5 days'
            AND dispatched_at <  $1::timestamptz - INTERVAL '1 hour'`,
        [RUN_AT],
      );
      if (priorTickets.length > 0) {
        const { receipts } = await fetchReceipts(priorTickets.map((r) => r.expo_ticket_id), { transport });
        const deadTokens = new Set();
        for (const t of priorTickets) {
          const r = receipts[t.expo_ticket_id];
          if (r && r.status === 'error' && r.error === DEVICE_NOT_REGISTERED && t.push_token) {
            deadTokens.add(t.push_token);
          }
        }
        // The Expo receipt HTTP call above is now COMPLETE — the token DELETEs
        // + the receipt_checked_at stamp run in ONE post-network transaction
        // (§47 §R9; a transaction is NEVER held open across the network I/O).
        // Stamping EVERY fetched ticket (not just the dead ones) is what makes
        // the widened window exactly-once. return-then-add keeps the prune count
        // correct across a 40P01 retry.
        const pruned = await pipeline.withTransaction(pool, async (client) => {
          let n = 0;
          for (const tok of deadTokens) {
            const res = await client.query('DELETE FROM device_tokens WHERE push_token = $1', [tok]);
            n += res.rowCount ?? 0;
          }
          await client.query(
            `UPDATE notification_dispatches SET receipt_checked_at = $1::timestamptz
              WHERE id = ANY($2::bigint[])`,
            [RUN_AT, priorTickets.map((t) => t.id)],
          );
          return n;
        });
        tokensPruned += pruned;
      }
    } catch (err) {
      pipeline.log.warn('[dispatch-notifications]', 'receipt pass failed (non-fatal)', { err: err.message });
    }

    // ── Per-user per-day throttle seed: today's already-sent counts.
    const sentTodayByUser = new Map();
    {
      const { rows } = await pool.query(
        `SELECT user_id, COUNT(*)::int AS n
           FROM notification_dispatches
          WHERE toronto_date = $1::date AND status = 'sent'
          GROUP BY user_id`,
        [today],
      );
      for (const r of rows) sentTodayByUser.set(r.user_id, r.n);
    }

    // ── URGENT freshness sweep (25E #4). START_DATE_URGENT carries a time-derived
    // body ("starts in N days") frozen at enqueue; once a row is older than
    // notifications_max_stale_hours its predicted start has elapsed and the body
    // is false → retire it as `stale_dropped` (a per-tuple ledger row mirroring
    // deferred_expired) instead of pushing a stale notification. SCOPED TO URGENT
    // ONLY: PHASE_CHANGED / LIFECYCLE_STALLED bodies are NOT time-derived, so they
    // KEEP the unconditional-retry contract (an Expo-outage-stuck send must never
    // be silently dropped — the :~330 whole-chunk-failure fence). Batched + looped
    // so a large first-flip backlog never holds a long lock, and the eligible
    // stream that follows never sees a stale URGENT row.
    const STALE_SWEEP_BATCH = 5000;
    for (;;) {
      const swept = await pipeline.withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `SELECT id, user_id, COALESCE(lead_id, permit_num) AS lead_id, type
             FROM notifications
            WHERE type = 'START_DATE_URGENT'
              AND is_sent = false
              AND created_at < $1::timestamptz - ($2::text || ' hours')::interval
            ORDER BY id
            LIMIT $3`,
          [RUN_AT, config.notifications_max_stale_hours, STALE_SWEEP_BATCH],
        );
        for (const r of rows) {
          if (!r.lead_id) continue; // no routing identity → cannot key the ledger
          await client.query(
            `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, status, detail, dispatched_at)
             VALUES ($1, $2, $3, $4::date, 'stale_dropped', $5, $6::timestamptz)
             ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
            [r.user_id, r.lead_id, r.type, today, `stale > ${config.notifications_max_stale_hours}h`, RUN_AT],
          );
        }
        const ids = rows.map((r) => r.id);
        if (ids.length > 0) {
          // sent_at = NULL marks "retired without a push" (vs a real send which
          // stamps sent_at = RUN_AT). is_sent = true removes it from the queue.
          await client.query(
            `UPDATE notifications SET is_sent = true, sent_at = NULL WHERE id = ANY($1::int[])`,
            [ids],
          );
        }
        return ids.length; // return-then-add (40P01-safe)
      });
      staleDropped += swept;
      if (swept < STALE_SWEEP_BATCH) break;
    }

    // ── Read the queue: un-dispatched rows joined to a device token + prefs,
    // excluding tuples already in today's ledger (the cross-chain dedup).
    // Only v1-dispatchable types; disabled types filtered in-code (JSONB array).
    // OOM backstop (25E #6): far above realistic daily volume (~10MB at the
    // ceiling). Steady-state volume is bounded by saved-leads-with-transitions/day;
    // a first-flip backlog is handled by the runbook pre-flip check + one-time
    // operator sweep. On hit we process the first ELIGIBLE_CEILING (FIFO — the
    // stream is created_at ASC) and leave the rest is_sent=false for next run.
    const ELIGIBLE_CEILING = 50000;
    const eligible = []; // { notificationId, userId, leadId, type, token, title, body, permitNum }
    const deferrals = []; // { userId, leadId, type, token, status, detail }
    // 25E #1 in-run dedup: `${userId}|${leadId}|${type}|${token}` -> index into
    // eligible[]. The token is IN the key so multi-device fan-out (one notification
    // to a user's N devices) is preserved while true duplicates (same content to
    // the SAME device — the cross-chain URGENT re-insert + multi-trade fan-out) are
    // collapsed to one push per device.
    const dedupIndex = new Map();
    const suppressIds = []; // notification ids of duplicate queue rows to retire

    for await (const row of pipeline.streamQuery(
      pool,
      `SELECT n.id AS notification_id, n.user_id, n.type, n.lead_id, n.permit_num,
              n.title, n.body,
              dt.push_token,
              up.phase_changed, up.lifecycle_stalled_pref, up.start_date_urgent,
              up.notification_schedule
         FROM notifications n
         JOIN device_tokens dt ON dt.user_id = n.user_id
         JOIN user_profiles up ON up.user_id = n.user_id
        WHERE n.type = ANY($1::text[])
          AND n.is_sent = false
          AND NOT EXISTS (
                SELECT 1 FROM notification_dispatches d
                 WHERE d.user_id = n.user_id
                   AND d.lead_id = COALESCE(n.lead_id, n.permit_num)
                   AND d.type = n.type
                   AND d.toronto_date = $2::date
              )
        ORDER BY n.created_at ASC`,
      [DISPATCHABLE_TYPES_V1, today],
    )) {
      const type = row.type;
      if (disabledSet.has(type)) continue;

      // Per-type preference gate (a false pref column silences the type).
      const prefCol = PREF_COLUMN_BY_TYPE[type];
      if (prefCol === 'phase_changed' && !row.phase_changed) continue;
      if (prefCol === 'lifecycle_stalled_pref' && !row.lifecycle_stalled_pref) continue;
      if (prefCol === 'start_date_urgent' && !row.start_date_urgent) continue;

      const leadId = row.lead_id || row.permit_num;
      if (!leadId) continue; // cannot key the ledger / route without an identity

      // Schedule gate (25B + 25E #3). Only schedule-gated types (PHASE_CHANGED)
      // respect the window, keyed on the user's notification_schedule pref.
      if (isScheduleGated(type)) {
        const schedule = row.notification_schedule || 'anytime';
        const { inWindow, endHour } = scheduleWindow(schedule, hour);
        if (!inWindow) {
          if (hour >= endHour) {
            // The window has already PASSED earlier today → expire (no stale push).
            deferrals.push({
              userId: row.user_id, leadId, type, token: row.push_token,
              status: 'deferred_expired',
              detail: `schedule=${schedule} hour=${hour} past valid_until_hour=${endHour}`,
            });
            continue;
          }
          // The window is LATER today. Under the once-daily 6AM cron there is no
          // later run to serve it, so deferring would loop FOREVER (25E #3 — the
          // 'evening' starvation). PRODUCT RULING (locked): deliver in the morning
          // run rather than defer into an unreachable window. Reversal fence: if an
          // evening dispatch cron is ever added, defer here instead (the window
          // would then be reachable). Falls through to send.
        }
      }

      // In-run dedup (25E #1). The stream is created_at ASC, so a later row is
      // FRESHER → prefer it (its START_DATE_URGENT "starts in N days" body is the
      // most current) and retire the older duplicate. Throttle is NOT applied here
      // — it moves to chunk-build (25E #5) so it can be failure-aware.
      const dedupKey = `${row.user_id}|${leadId}|${type}|${row.push_token}`;
      const cand = {
        notificationId: row.notification_id,
        userId: row.user_id,
        leadId,
        type,
        token: row.push_token,
        title: row.title,
        body: row.body,
        permitNum: row.permit_num,
      };
      const existingIdx = dedupIndex.get(dedupKey);
      if (existingIdx !== undefined) {
        suppressIds.push(eligible[existingIdx].notificationId); // retire the older
        eligible[existingIdx] = cand;                            // keep the fresher
        continue;
      }
      if (eligible.length >= ELIGIBLE_CEILING) {
        // OOM backstop (25E #6): stop building; the remainder stay is_sent=false
        // and drain next run. Loud via the eligible_ceiling_hit audit row below.
        ceilingHit++;
        pipeline.log.warn('[dispatch-notifications]',
          `eligible ceiling ${ELIGIBLE_CEILING} hit — remainder deferred to next run`,
          { sample_user_ids: eligible.slice(-5).map((e) => e.userId) });
        break;
      }
      dedupIndex.set(dedupKey, eligible.length);
      eligible.push(cand);
    }

    // ── Retire duplicate queue rows BEFORE any send (25E #1, crash-safety). If
    // this were deferred to after the send phase, a crash between the winner's
    // send+ledger and this stamp would leave the duplicate is_sent=false with no
    // ledger row of its own → it re-sends on the next Toronto day (within the
    // freshness window). Stamping durably FIRST closes that window. Pure DB (no
    // Expo I/O) — §R9-safe. sent_at=NULL = "retired without a push". The guard
    // `AND is_sent=false` + return-then-add keep the count 40P01-correct.
    if (suppressIds.length > 0) {
      const n = await pipeline.withTransaction(pool, async (client) => {
        const res = await client.query(
          `UPDATE notifications SET is_sent = true, sent_at = NULL
             WHERE id = ANY($1::int[]) AND is_sent = false`,
          [suppressIds],
        );
        return res.rowCount ?? 0;
      });
      duplicatesSuppressed += n;
    }

    // ── Send eligible rows in chunks of <=100, enforcing the per-user/day cap at
    // CHUNK-BUILD time (25E #5). A row is admitted only if the user is under cap;
    // the count is incremented on admit and ROLLED BACK if the send fails, so a
    // failed push never consumes a slot. Build-time enforcement is required because
    // sendPushChunk transmits the whole chunk in one HTTP call before any
    // per-message result is known — a purely post-success cap cannot un-send.
    let i = 0;
    while (i < eligible.length) {
      const chunk = [];
      const admitted = []; // userIds provisionally charged a cap slot for THIS chunk
      while (i < eligible.length && chunk.length < MAX_CHUNK) {
        const e = eligible[i];
        i++;
        const sent = sentTodayByUser.get(e.userId) || 0;
        if (config.notifications_max_per_user_per_day > 0 && sent >= config.notifications_max_per_user_per_day) {
          deferrals.push({
            userId: e.userId, leadId: e.leadId, type: e.type, token: e.token,
            status: 'deferred', detail: `throttle: ${sent} >= ${config.notifications_max_per_user_per_day}`,
          });
          continue;
        }
        sentTodayByUser.set(e.userId, sent + 1); // provisional reserve
        admitted.push(e.userId);
        chunk.push(e);
      }
      if (chunk.length === 0) continue;

      const messages = chunk.map((e) => ({
        to: e.token,
        title: e.title,
        body: e.body,
        data: {
          notification_type: e.type,
          route_domain: 'flight_board',
          entity_id: entityIdFromLead(e.leadId, e.permitNum),
          urgency: urgencyForType(e.type),
        },
      }));

      let tickets;
      try {
        ({ tickets } = await sendPushChunk(messages, { transport }));
      } catch (err) {
        // Whole-chunk failure: release EVERY provisional cap slot (failure-aware,
        // 25E #5) + record errors; no ledger sent-rows so the tuples retry next run.
        for (const uid of admitted) {
          sentTodayByUser.set(uid, Math.max(0, (sentTodayByUser.get(uid) || 1) - 1));
        }
        pipeline.log.warn('[dispatch-notifications]', `chunk send failed (${chunk.length} msgs)`, { err: err.message });
        deliveryErrors += chunk.length;
        continue;
      }

      // The Expo send HTTP call is COMPLETE. The per-chunk ledger writes +
      // is_sent flips + dead-token prunes run in ONE transaction AFTER the
      // network I/O (§47 §R9 — a transaction is never held across the send).
      // Tickets align to `chunk` by index (push-dispatch preserves order).
      const deltas = await pipeline.withTransaction(pool, async (client) => {
        let sent = 0;
        let errs = 0;
        let pruned = 0;
        const capRefunds = []; // userIds whose provisional slot must be released (send errored)
        for (let j = 0; j < chunk.length; j++) {
          const e = chunk[j];
          const t = tickets[j];
          if (t && t.status === 'ok') {
            const res = await client.query(
              `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, expo_ticket_id, status, dispatched_at)
               VALUES ($1, $2, $3, $4::date, $5, $6, 'sent', $7::timestamptz)
               ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
              [e.userId, e.leadId, e.type, today, e.token, t.id, RUN_AT],
            );
            if ((res.rowCount ?? 0) > 0) sent++;
            await client.query(
              'UPDATE notifications SET is_sent = true, sent_at = $2::timestamptz WHERE id = $1',
              [e.notificationId, RUN_AT],
            );
          } else {
            errs++;
            capRefunds.push(e.userId); // a failed push must not consume the cap (25E #5)
            const err = t?.error ?? 'unknown';
            // Ticket-time prune (25B): DeviceNotRegistered → delete the EXACT token
            // (never the user's other devices).
            if (err === DEVICE_NOT_REGISTERED && e.token) {
              const res = await client.query('DELETE FROM device_tokens WHERE push_token = $1', [e.token]);
              pruned += res.rowCount ?? 0;
            }
            await client.query(
              `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, status, detail, dispatched_at)
               VALUES ($1, $2, $3, $4::date, $5, 'error', $6, $7::timestamptz)
               ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
              [e.userId, e.leadId, e.type, today, e.token, String(err).slice(0, 200), RUN_AT],
            );
          }
        }
        // return-then-add so the counters stay correct across a 40P01 retry
        return { sent, errs, pruned, capRefunds };
      });
      dispatched += deltas.sent;
      deliveryErrors += deltas.errs;
      tokensPruned += deltas.pruned;
      // Release cap slots for per-ticket failures (outside the txn so a 40P01
      // re-run of the block re-derives capRefunds rather than double-releasing).
      for (const uid of deltas.capRefunds) {
        sentTodayByUser.set(uid, Math.max(0, (sentTodayByUser.get(uid) || 1) - 1));
      }
    }

    // ── Record all deferrals (schedule-expired + throttle) in the ledger. No
    // network I/O — one atomic batch (§47 §R9). Written AFTER the send loop
    // because throttle deferrals are only known once the cap is enforced at send.
    if (deferrals.length > 0) {
      const counts = await pipeline.withTransaction(pool, async (client) => {
        let def = 0;
        let defExp = 0;
        for (const d of deferrals) {
          const res = await client.query(
            `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, status, detail, dispatched_at)
             VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::timestamptz)
             ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
            [d.userId, d.leadId, d.type, today, d.token, d.status, d.detail, RUN_AT],
          );
          if ((res.rowCount ?? 0) > 0) {
            if (d.status === 'deferred_expired') defExp++; else def++;
          }
        }
        return { def, defExp }; // return-then-add: correct across a 40P01 retry
      });
      deferred += counts.def;
      deferredExpired += counts.defExp;
    }

    // §R10 — audit rows. Every terminal disposition is observable (25E OB fold):
    // the stale-drop, duplicate-suppression, and ceiling paths each get a named
    // row feeding the row-derived verdict cascade (never a parallel boolean).
    const auditRows = [
      { metric: 'dispatched', value: dispatched, threshold: null, status: 'PASS' },
      { metric: 'delivery_errors', value: deliveryErrors, threshold: '0 ideal', status: deliveryErrors > 0 ? 'WARN' : 'PASS' },
      { metric: 'tokens_pruned', value: tokensPruned, threshold: null, status: 'PASS' },
      { metric: 'deferred', value: deferred, threshold: null, status: 'PASS' },
      { metric: 'deferred_expired', value: deferredExpired, threshold: '0 ideal', status: deferredExpired > 0 ? 'WARN' : 'PASS' },
      { metric: 'stale_dropped', value: staleDropped, threshold: '0 ideal', status: staleDropped > 0 ? 'WARN' : 'PASS' },
      { metric: 'duplicates_suppressed', value: duplicatesSuppressed, threshold: null, status: 'PASS' },
      { metric: 'eligible_ceiling_hit', value: ceilingHit, threshold: '0 required', status: ceilingHit > 0 ? 'WARN' : 'PASS' },
    ];
    const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
      : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

    pipeline.emitSummary({
      records_total: eligible.length + deferrals.length,
      records_new: dispatched,
      records_updated: 0,
      records_meta: {
        audit_table: { phase: 22, name: 'Dispatch Notifications', verdict, rows: auditRows },
      },
    });

    pipeline.emitMeta(
      {
        // created_at is now a first-class eligibility gate (the URGENT freshness
        // sweep, 25E #4) — not just an ORDER BY tiebreaker.
        notifications: ['id', 'user_id', 'type', 'lead_id', 'permit_num', 'title', 'body', 'is_sent', 'created_at'],
        device_tokens: ['user_id', 'push_token'],
        user_profiles: ['user_id', 'phase_changed', 'lifecycle_stalled_pref', 'start_date_urgent', 'notification_schedule'],
        notification_dispatches: ['user_id', 'lead_id', 'type', 'toronto_date', 'expo_ticket_id', 'receipt_checked_at'],
      },
      {
        notification_dispatches: ['user_id', 'lead_id', 'type', 'toronto_date', 'push_token', 'expo_ticket_id', 'status', 'detail', 'receipt_checked_at'],
        notifications: ['is_sent', 'sent_at'],
        device_tokens: [],
      },
      ['ExpoPush'],
    );
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted the SKIP summary.
});
