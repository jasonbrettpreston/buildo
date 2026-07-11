-- 218_notification_dispatch_ledger.sql
-- SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2
-- FK-EXEMPT
--
-- P25 (25A) — the notification dispatch consolidation.
--   (1) notification_dispatches — the once-per-day delivery LEDGER. Its
--       UNIQUE(user_id, lead_id, type, toronto_date) makes the pre-P25
--       double-send (the classifier step runs in BOTH daily chains, and
--       START_DATE_URGENT had no cross-run memory) structurally impossible.
--   (2) notifications.lead_id — the canonical routing key column, retiring the
--       coa-application-number-in-permit_num polymorphism (Spec 82 §4 F.4 note).
--   (3) three logic_variables seeds (the kill-switch OFF + the throttle + the
--       disabled-types JSONB). Seeded HERE, not via scripts/seeds/logic_variables.json,
--       because the seed loader (apply-logic-variables.js) only writes the numeric
--       variable_value column and cannot carry the JSONB var.
--
-- FK-EXEMPT rationale: the ledger keys on (user_id, lead_id) — user_id is a
-- Firebase uid (no users table FK anywhere in this schema) and lead_id is a
-- loose canonical key (permit:.. / coa:..), the same FK-free curation pattern as
-- admin_watchlist (mig 215) and notifications (mig 010).
--
-- NOTE (validator hygiene): comments avoid apostrophes — validate-migration.js
-- blanks string literals and a lone apostrophe in a comment opens a fake string.
--
-- UP
CREATE TABLE IF NOT EXISTS notification_dispatches (
  id             BIGSERIAL      PRIMARY KEY,
  user_id        VARCHAR(100)   NOT NULL,
  lead_id        VARCHAR(120)   NOT NULL,
  type           VARCHAR(50)    NOT NULL,
  toronto_date   DATE           NOT NULL,
  push_token     VARCHAR(200),
  expo_ticket_id VARCHAR(200),
  status         VARCHAR(20)    NOT NULL DEFAULT 'sent'
    CONSTRAINT notification_dispatches_status_check
    CHECK (status IN ('sent', 'error', 'deferred', 'deferred_expired')),
  detail         TEXT,
  dispatched_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  -- The once-per-day guarantee. The dispatcher writes with ON CONFLICT DO
  -- NOTHING so a tuple already delivered today (across BOTH chain runs) is a
  -- no-op. toronto_date is the America/Toronto calendar date (DST-aware),
  -- computed by the dispatcher — NOT DATE(now()) in UTC (which would split a
  -- single Toronto evening across two dates).
  CONSTRAINT notification_dispatches_once_per_day
    UNIQUE (user_id, lead_id, type, toronto_date)
);

-- Receipt pass reads the prior runs sent rows to fetch Expo receipts.
CREATE INDEX IF NOT EXISTS idx_notification_dispatches_ticket
  ON notification_dispatches (expo_ticket_id)
  WHERE expo_ticket_id IS NOT NULL;

-- Per-user per-day throttle count + the admin dispatch-log read order.
CREATE INDEX IF NOT EXISTS idx_notification_dispatches_user_date
  ON notification_dispatches (user_id, toronto_date);

-- The canonical routing key on the queue. Nullable + additive: existing
-- notifications rows keep NULL; the enqueuers populate it going forward. The
-- dispatcher reads it for the deep-link entity_id and the ledger key.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lead_id VARCHAR(120);

-- Dispatcher work-queue scan (un-dispatched rows by creation order).
CREATE INDEX IF NOT EXISTS idx_notifications_dispatch_scan
  ON notifications (is_sent, created_at);

-- Logic variable seeds. ON CONFLICT DO NOTHING preserves any operator-tuned
-- value on re-run. The kill-switch ships OFF (0) — the gate is flipped ON last
-- (the P16 pattern), so the whole engine is inert until an operator enables it.
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('notifications_dispatch_enabled', 0,
   'Master kill-switch for the dispatch_notifications step. 0=OFF (no pushes sent), 1=ON. Seeded OFF; flipped ON last after the engine is validated.'),
  ('notifications_max_per_user_per_day', 10,
   'Throttle: max notifications delivered per user per Toronto calendar day. Excess rows are deferred, not sent.')
ON CONFLICT (variable_key) DO NOTHING;

-- The disabled-types JSONB lever (operator can suppress a specific type without
-- code). variable_value carries the sentinel 0 (per the one-of-value-or-json
-- convention, mig 092); the array lives in variable_value_json. Default empty.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('notifications_disabled_types', 0, '[]'::jsonb,
   'JSONB array of notification type strings the dispatcher must skip (operator kill-list, in addition to the code-fenced types).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- ALLOW-DESTRUCTIVE (rollback drops the ledger table + the added column/indexes)
-- DELETE FROM logic_variables WHERE variable_key IN ('notifications_dispatch_enabled','notifications_max_per_user_per_day','notifications_disabled_types');
-- DROP INDEX IF EXISTS idx_notifications_dispatch_scan;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS lead_id;
-- DROP INDEX IF EXISTS idx_notification_dispatches_user_date;
-- DROP INDEX IF EXISTS idx_notification_dispatches_ticket;
-- DROP TABLE IF EXISTS notification_dispatches;
