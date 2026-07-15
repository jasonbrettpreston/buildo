# 25E Gate-Flip — Phase 0 Backlog Baseline (2026-07-15)

**Purpose:** set `notifications_max_stale_hours`, the Zod default, and the `eligible[]` ceiling from evidence before implementing the WF2 gate-flip-blocker fixes.

## Environment
- Dev DB brought up (docker `buildo-postgis`, healthy); migrations **218–221 applied** this session (dev DB previously predated P25/P26). `migrate --verify` now: the 9 known checksum-DRIFT migrations remain (documented, operator-owned), 0 missing.
- **Migration number correction:** the plan said "mig 219" but `219_stripe_price_id_default.sql` / `220_stripe_cancel_failed_at.sql` / `221_stripe_webhook_events_correlation.sql` (P26) already exist → this WF2's migration is **`222_notification_gateflip.sql`**.

## Measurement (read-only; `scratchpad/notif_baseline.js`)
- **`notifications` queue: EMPTY** — 0 total rows, 0 un-sent, 0 duplicate (user,type,lead) tuples.
- **`notification_dispatches` ledger: EMPTY** — 0 rows (engine inert; never dispatched).
- **`logic_variables`:** `notifications_dispatch_enabled=0` (gate OFF), `notifications_max_per_user_per_day=10`, `notifications_disabled_types=[]`.

**Why empty:** the two enqueuers (`classify-lifecycle-phase.js`, `update-tracked-projects.js`) write `notifications` rows only for currently-saved leads that had phase transitions during a chain run. Mig 218 (which adds `notifications.lead_id` + the ledger) was applied only this session, and the permits/coa chains have not re-run since. So there is no historical backlog on this dev DB to measure — the real first-flip backlog will accumulate only once the enqueuers run against 218+ schema with the gate still OFF.

## Thresholds — set from reasoning (no empirical backlog available)
- **`notifications_max_stale_hours = 168` (7 days).** Freshness auto-drop is scoped to `START_DATE_URGENT` only (Guardian fold — the other types keep unconditional retry). A URGENT row is enqueued for a `predicted_start` in the **6–7 day** window; once the row is older than ~7 days its predicted start has elapsed (the job has already started) → the "starts in N days" body is now false and the notification is useless → drop as `stale_dropped`. 168h == the enqueue horizon, so a merely-late URGENT (start still upcoming) is preserved while a start-has-passed one is dropped. Operator-tunable via the logic_variable; Zod `.default(168)` guarantees inert-safety if the seed is ever absent.
- **`eligible[]` ceiling = 50,000.** A pure OOM backstop (~10 MB at ~200 B/entry), far above realistic steady-state daily volume (bounded by saved-leads-with-transitions/day). On hit: WARN (with truncated user_ids) + process the first 50,000 FIFO (`ORDER BY created_at ASC`), retain the remainder for next run, emit the `eligible_ceiling_hit` audit row. If a pre-flip backlog projection ever exceeds this, the documented one-time operator pre-flip sweep handles it before the flip.

## Consequence for testing
The `.db` battery (`dispatch-notifications.db.test.ts`, mock transport, synthetic fixtures) is the validation vehicle for every fix — not live data. Phase-by-phase `BUILDO_TEST_DB=1` runs will exercise duplicate-row suppression, URGENT staleness, chunk-build throttle, evening-in-morning, the ceiling, and the 5-day receipt window against fabricated rows.
