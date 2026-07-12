-- 221: P26-26-ADMIN — per-user webhook-event history correlation.
--
-- The admin Subscription-Ops surface (Spec 21 §6) exposes a per-user webhook
-- history at GET /api/admin/users/[uid]/subscription/events. The dedup ledger
-- (stripe_webhook_events, mig 114) stored ONLY event_id + processed_at, so it
-- could not answer "which events touched THIS customer, and what were they?".
--
-- This adds two nullable, additive columns the webhook route populates going
-- forward (event.type + the classified customer id). Historical rows keep NULL
-- — the per-user view is honestly "history begins at this deploy"; the dedup
-- contract (event_id PK) is unchanged.
--
-- SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6
--            docs/specs/02-web-admin/20_stripe_web_checkout.md §7

-- UP
ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Supports the per-user history query (filter by customer, newest first).
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_customer
  ON stripe_webhook_events (stripe_customer_id, processed_at DESC);

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DROP INDEX IF EXISTS idx_stripe_webhook_events_customer;
--   ALTER TABLE stripe_webhook_events DROP COLUMN IF EXISTS stripe_customer_id;
--   ALTER TABLE stripe_webhook_events DROP COLUMN IF EXISTS event_type;
