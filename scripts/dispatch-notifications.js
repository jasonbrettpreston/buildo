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

const _torontoHourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto', hour: 'numeric', hour12: false,
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

    // ── Receipt pass (25B): fetch receipts for the PRIOR run's sent tickets and
    // prune any exact token that resolved to DeviceNotRegistered (~24h lag).
    // Best-effort — never aborts the run.
    try {
      const { rows: priorTickets } = await pool.query(
        `SELECT id, expo_ticket_id, push_token
           FROM notification_dispatches
          WHERE status = 'sent' AND expo_ticket_id IS NOT NULL
            AND dispatched_at >= $1::timestamptz - INTERVAL '2 days'
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
        for (const tok of deadTokens) {
          const res = await pool.query('DELETE FROM device_tokens WHERE push_token = $1', [tok]);
          tokensPruned += res.rowCount ?? 0;
        }
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

    // ── Read the queue: un-dispatched rows joined to a device token + prefs,
    // excluding tuples already in today's ledger (the cross-chain dedup).
    // Only v1-dispatchable types; disabled types filtered in-code (JSONB array).
    const eligible = []; // { notificationId, userId, leadId, type, token, title, body, permitNum, schedule }
    const deferrals = []; // { userId, leadId, type, token, status, detail }

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

      // Quiet-hours defer (25B): only schedule-gated types respect the window.
      if (isScheduleGated(type)) {
        const { inWindow, endHour } = scheduleWindow(row.notification_schedule || 'anytime', hour);
        if (!inWindow) {
          // valid_until = end of today's window. If the window has already
          // passed for today, the row expires (dropped, counted) — no stale push.
          const expired = hour >= endHour;
          deferrals.push({
            userId: row.user_id, leadId, type, token: row.push_token,
            status: expired ? 'deferred_expired' : 'deferred',
            detail: `schedule=${row.notification_schedule || 'anytime'} hour=${hour} valid_until_hour=${endHour}`,
          });
          continue;
        }
      }

      // Throttle: cap per user per Toronto day.
      const sent = sentTodayByUser.get(row.user_id) || 0;
      if (config.notifications_max_per_user_per_day > 0 && sent >= config.notifications_max_per_user_per_day) {
        deferrals.push({
          userId: row.user_id, leadId, type, token: row.push_token,
          status: 'deferred', detail: `throttle: ${sent} >= ${config.notifications_max_per_user_per_day}`,
        });
        continue;
      }
      sentTodayByUser.set(row.user_id, sent + 1);

      eligible.push({
        notificationId: row.notification_id,
        userId: row.user_id,
        leadId,
        type,
        token: row.push_token,
        title: row.title,
        body: row.body,
        permitNum: row.permit_num,
      });
    }

    // ── Record deferrals in the ledger (idempotent).
    for (const d of deferrals) {
      const res = await pool.query(
        `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, status, detail, dispatched_at)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::timestamptz)
         ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
        [d.userId, d.leadId, d.type, today, d.token, d.status, d.detail, RUN_AT],
      );
      if ((res.rowCount ?? 0) > 0) {
        if (d.status === 'deferred_expired') deferredExpired++; else deferred++;
      }
    }

    // ── Send eligible rows in chunks of <=100.
    for (let i = 0; i < eligible.length; i += MAX_CHUNK) {
      const chunk = eligible.slice(i, i + MAX_CHUNK);
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
        // Whole-chunk failure (non-2xx / top-level). Record errors; no ledger
        // sent-rows so the tuples retry next run.
        pipeline.log.warn('[dispatch-notifications]', `chunk send failed (${chunk.length} msgs)`, { err: err.message });
        deliveryErrors += chunk.length;
        continue;
      }

      // Align tickets to chunk by index (push-dispatch preserves order).
      for (let j = 0; j < chunk.length; j++) {
        const e = chunk[j];
        const t = tickets[j];
        if (t && t.status === 'ok') {
          const res = await pool.query(
            `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, expo_ticket_id, status, dispatched_at)
             VALUES ($1, $2, $3, $4::date, $5, $6, 'sent', $7::timestamptz)
             ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
            [e.userId, e.leadId, e.type, today, e.token, t.id, RUN_AT],
          );
          if ((res.rowCount ?? 0) > 0) dispatched++;
          await pool.query(
            'UPDATE notifications SET is_sent = true, sent_at = $2::timestamptz WHERE id = $1',
            [e.notificationId, RUN_AT],
          );
        } else {
          deliveryErrors++;
          const err = t?.error ?? 'unknown';
          // Ticket-time prune (25B): DeviceNotRegistered → delete the EXACT token
          // (never the user's other devices).
          if (err === DEVICE_NOT_REGISTERED && e.token) {
            const res = await pool.query('DELETE FROM device_tokens WHERE push_token = $1', [e.token]);
            tokensPruned += res.rowCount ?? 0;
          }
          await pool.query(
            `INSERT INTO notification_dispatches (user_id, lead_id, type, toronto_date, push_token, status, detail, dispatched_at)
             VALUES ($1, $2, $3, $4::date, $5, 'error', $6, $7::timestamptz)
             ON CONFLICT (user_id, lead_id, type, toronto_date) DO NOTHING`,
            [e.userId, e.leadId, e.type, today, e.token, String(err).slice(0, 200), RUN_AT],
          );
        }
      }
    }

    // §R10 — audit rows.
    const auditRows = [
      { metric: 'dispatched', value: dispatched, threshold: null, status: 'PASS' },
      { metric: 'delivery_errors', value: deliveryErrors, threshold: '0 ideal', status: deliveryErrors > 0 ? 'WARN' : 'PASS' },
      { metric: 'tokens_pruned', value: tokensPruned, threshold: null, status: 'PASS' },
      { metric: 'deferred', value: deferred, threshold: null, status: 'PASS' },
      { metric: 'deferred_expired', value: deferredExpired, threshold: '0 ideal', status: deferredExpired > 0 ? 'WARN' : 'PASS' },
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
        notifications: ['id', 'user_id', 'type', 'lead_id', 'permit_num', 'title', 'body', 'is_sent'],
        device_tokens: ['user_id', 'push_token'],
        user_profiles: ['user_id', 'phase_changed', 'lifecycle_stalled_pref', 'start_date_urgent', 'notification_schedule'],
        notification_dispatches: ['user_id', 'lead_id', 'type', 'toronto_date'],
      },
      {
        notification_dispatches: ['user_id', 'lead_id', 'type', 'toronto_date', 'push_token', 'expo_ticket_id', 'status', 'detail'],
        notifications: ['is_sent', 'sent_at'],
        device_tokens: [],
      },
      ['ExpoPush'],
    );
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted the SKIP summary.
});
