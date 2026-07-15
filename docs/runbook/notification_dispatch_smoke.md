# Runbook — Notification Dispatch: device-boundary smoke + gate activation

**Spec:** `docs/specs/01-pipeline/101_notification_dispatch.md` (engine) ·
`docs/specs/02-web-admin/102_admin_notifications_tool.md` (admin tool) ·
`docs/specs/03-mobile/92_mobile_engagement_hardware.md` (mobile surface).

**Status:** the dispatch engine is SHIPPED but INERT — `logic_variables.notifications_dispatch_enabled = 0`
(seeded OFF in `migrations/218_notification_dispatch_ledger.sql`). No push is sent to any real
device until an operator flips it. This runbook is the honest device boundary the headless
battery cannot cross, plus the gate-activation procedure.

---

## Why a manual smoke exists

The 25E battery (`src/tests/db/dispatch-notifications.db.test.ts`) drives a MOCK Expo transport
and asserts dispatch / dedup / pref-gates / throttle / receipts / token-pruning against the
`notification_dispatches` ledger with zero network I/O. It proves everything up to — but not
including — a real Expo delivery landing on a physical phone and the deep-link routing to the
board detail. That last hop (Expo push service → device OS → app cold/warm start → tap →
`flight_board` route → board detail for `NUM--REV`) is untestable headlessly. This smoke closes it.

## Device-boundary smoke (do this BEFORE flipping the gate)

Prereqs: a physical device (Android 13+ is the priority — delivery was broken there pre-25D)
with the dev build installed, signed in as a seeded account whose `device_tokens` row exists,
and admin access to `/admin/notifications`.

1. **Register the device.** Open the app, accept the notification permission prompt (Android 13+:
   the channel is created BEFORE the permission ask — 25D). Confirm a `device_tokens` row exists
   for the account (`/admin/users/[uid]` Notifications card shows the token count).
2. **Test-send.** In `/admin/notifications`, use TEST-SEND (`POST /api/admin/notifications/test-send`)
   targeting that account. The Expo ticket id is returned in the response `_debug` field —
   confirm `status: "ok"` (a ticket error here is a token/credential problem, not a device one).
3. **Delivery.** Confirm the push arrives on the physical device (foreground toast + system tray).
4. **Tap → route.** Tap the notification. Confirm the app opens the board detail for the lead —
   this exercises the `data.route_domain = 'flight_board'` + `data.entity_id = NUM--REV` contract
   (the cross-contract seam locked by `notification-dispatch-contract.logic.test.ts`). A blank or
   404 screen means the entity_id form drifted from the board-detail parser (`[flight-job].tsx`).
5. **Receipt/prune sanity (optional, +~24h).** For a deliberately-stale token, confirm the next
   in-chain run prunes it (`device_tokens` row gone; `tokens_pruned` in the run's audit rows).

If any step fails, DO NOT flip the gate — fix and re-smoke.

---

## Gate activation (the LAST step — reviewed, not automatic)

**Where the flip lives:** `logic_variables.notifications_dispatch_enabled` — seeded `0` in
`migrations/218_notification_dispatch_ledger.sql:72`, read at `scripts/dispatch-notifications.js`
(the `CONFIG_SCHEMA` + the §R1 kill-switch guard: `if (config.notifications_dispatch_enabled !== 1)`
emits a SKIP summary and does nothing). Flip via the Spec 86 control panel or:

```sql
UPDATE logic_variables SET variable_value = 1 WHERE variable_key = 'notifications_dispatch_enabled';
```

**Green evidence required BEFORE the flip (all must hold):**

1. `dispatch-notifications.db.test.ts` — 14/14 green (`BUILDO_TEST_DB=1`).
2. The device-boundary smoke above — passed end-to-end on a physical Android 13+ device
   (delivery + tap → board detail).
3. `bash scripts/hooks/ast-grep-leads.sh` — exit 0 (no bare-mutation; transactions never held
   across the Expo network call).
4. A DRY observation run with the gate still `0`: confirm the SKIP summary appears in
   `pipeline_runs` for `dispatch_notifications` in the **permits chain** (25E #10 — the step is
   registered ONLY in `chains.permits`, immediately after `update_tracked_projects`; it is
   deliberately absent from `chains.coa`, so do NOT look for it there — confirm its absence in the
   manifest as part of this check).
5. Throttle + disabled-types + freshness levers confirmed present in `logic_variables`
   (`notifications_max_per_user_per_day`, `notifications_disabled_types`, `notifications_max_stale_hours`).
6. **Pre-flip backlog check (25E #4).** With the gate still `0`, measure the accumulated queue:
   `SELECT type, COUNT(*), MIN(created_at), MAX(created_at) FROM notifications WHERE is_sent=false GROUP BY type`.
   The URGENT freshness sweep auto-drops URGENT rows older than `notifications_max_stale_hours`
   (168h) on the first run; PHASE_CHANGED / LIFECYCLE_STALLED do NOT auto-drop. If the non-URGENT
   backlog is large (stale phase-changes accumulated over weeks), sweep them once BEFORE flipping
   (`UPDATE notifications SET is_sent=true, sent_at=NULL WHERE is_sent=false AND type IN
   ('LIFECYCLE_PHASE_CHANGED','LIFECYCLE_STALLED') AND created_at < NOW() - INTERVAL '<N> days'`)
   so the first live run does not deliver a burst of stale phase updates. NO-GO if the backlog is
   unexpectedly huge — investigate before flipping.

**After the flip:** watch the first in-chain run's audit rows — `dispatched`, `delivery_errors`,
`tokens_pruned`, `deferred`, `deferred_expired`, `stale_dropped`, `duplicates_suppressed`,
`eligible_ceiling_hit`, `no_device_token`, `disabled_type_skipped`, `pref_gated_skipped`,
`no_lead_id_skipped`. A `delivery_errors` / `tokens_pruned` spike on run 1 is the signal to
re-check token hygiene; a non-zero `eligible_ceiling_hit` means the queue exceeded the in-memory
ceiling (backlog not swept — remainder drains next run); a large `no_device_token` is expected
(web-only / no-push-permission savers — their rows are retired, not accumulated); a non-zero
`no_lead_id_skipped` is a data anomaly worth investigating. Revert instantly by setting the
variable back to `0` (the engine returns to inert SKIP on the next run — no code deploy needed).
