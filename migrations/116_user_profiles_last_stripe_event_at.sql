-- Migration 116: user_profiles.last_stripe_event_at column
-- SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
--            (security hardening — out-of-order webhook event guard)
--
-- Adds a per-user timestamp tracking the most recent Stripe event the
-- webhook handler successfully applied. Used to reject out-of-order events
-- — Stripe does not guarantee delivery order, so a delayed
-- `customer.subscription.updated` event arriving AFTER a
-- `customer.subscription.deleted` event would otherwise overwrite
-- 'expired' back to 'active', granting cancelled users continued access.
--
-- The webhook UPDATE is gated on `last_stripe_event_at IS NULL OR
-- last_stripe_event_at < event.created`, so older events affect zero rows.
-- The dedup INSERT into stripe_webhook_events is still required to prevent
-- the same event being processed twice; this column is the complementary
-- guard against DIFFERENT events arriving out of order.
--
-- Nullable because most users will never have a Stripe event (admin_managed
-- manufacturers, accounts that never subscribed). NULL means "no event
-- applied yet" and is treated as < any event timestamp.

-- ============================================================
-- UP
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_stripe_event_at TIMESTAMPTZ;

-- ============================================================
-- DOWN
-- ============================================================
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS last_stripe_event_at;
