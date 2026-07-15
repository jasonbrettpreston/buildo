-- 222_notification_gateflip.sql
-- SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §4
-- FK-EXEMPT
--
-- P25 25E — notification-dispatch gate-flip blockers (WF2). Three additive
-- changes that let dispatch_notifications be safe to turn on:
--   (1) notification_dispatches.receipt_checked_at — marks a dispatched ticket
--       as receipt-checked so the widened (5-day) receipt pass never re-fetches
--       an already-checked ticket (avoids redundant Expo calls + double prune).
--   (2) status CHECK gains stale_dropped — the 5th terminal disposition. A
--       START_DATE_URGENT queue row older than notifications_max_stale_hours has
--       an elapsed predicted-start, so the dispatcher retires it as stale_dropped
--       (a per-tuple ledger row, mirroring deferred_expired) instead of pushing a
--       now-false starts-in-N-days body. Scoped to URGENT only; PHASE_CHANGED and
--       LIFECYCLE_STALLED keep unconditional retry.
--   (3) notifications_max_stale_hours logic_variable seed. Seeded HERE (not via
--       scripts/seeds/logic_variables.json) to match the notifications_* family
--       from mig 218 — the JSON loader route has no config-loader fallback for
--       this family. The dispatcher also carries a Zod default so a missing seed
--       degrades safely rather than throwing before the kill-switch.
--
-- FK-EXEMPT rationale: notification_dispatches keys on (user_id, lead_id) which
-- are FK-free curation keys (same as mig 218); this migration only ALTERs it.
--
-- NOTE (validator hygiene): comments avoid apostrophes — validate-migration.js
-- blanks string literals and a lone apostrophe in a comment opens a fake string.
--
-- UP

-- (1) Receipt-checked marker. Nullable + additive; existing rows keep NULL and
-- are eligible for one receipt check on the next run within the 5-day window.
ALTER TABLE notification_dispatches
  ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ;

-- Supports the widened receipt scan: sent tickets not yet receipt-checked,
-- ordered by dispatch time. Partial index keeps it tiny (only the pending set).
CREATE INDEX IF NOT EXISTS idx_notification_dispatches_receipt_pending
  ON notification_dispatches (dispatched_at)
  WHERE status = 'sent' AND expo_ticket_id IS NOT NULL AND receipt_checked_at IS NULL;

-- (2) Add stale_dropped to the status CHECK. Drop-and-re-add the named
-- constraint from mig 218 (DROP CONSTRAINT is non-destructive to data).
ALTER TABLE notification_dispatches
  DROP CONSTRAINT IF EXISTS notification_dispatches_status_check;
ALTER TABLE notification_dispatches
  ADD CONSTRAINT notification_dispatches_status_check
  CHECK (status IN ('sent', 'error', 'deferred', 'deferred_expired', 'stale_dropped'));

-- (3) Freshness-bound logic_variable. ON CONFLICT DO NOTHING preserves any
-- operator-tuned value on re-run. 168 hours == the 6-7 day URGENT enqueue
-- horizon; a URGENT row older than that has a predicted-start already elapsed.
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('notifications_max_stale_hours', 168,
   'Freshness bound in hours for START_DATE_URGENT queue rows. A URGENT row older than this has an elapsed predicted-start (its starts-in-N-days body is now false); the dispatcher retires it as stale_dropped instead of sending. Scoped to START_DATE_URGENT only. 168h is the 6-7 day URGENT enqueue horizon. The dispatcher also carries a Zod default so a missing row never throws.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- ALLOW-DESTRUCTIVE (rollback drops the added column/index/seed + reverts the CHECK)
-- DELETE FROM logic_variables WHERE variable_key = 'notifications_max_stale_hours';
-- DROP INDEX IF EXISTS idx_notification_dispatches_receipt_pending;
-- ALTER TABLE notification_dispatches DROP COLUMN IF EXISTS receipt_checked_at;
-- ALTER TABLE notification_dispatches DROP CONSTRAINT IF EXISTS notification_dispatches_status_check;
-- ALTER TABLE notification_dispatches ADD CONSTRAINT notification_dispatches_status_check CHECK (status IN ('sent','error','deferred','deferred_expired'));
