-- 220: P26-26D — durable retry marker for delete-time Stripe cancellation.
--
-- Account deletion schedules cancel_at_period_end on ALL the customer's live
-- Stripe subscriptions (Spec 20 §6-DELETE / Spec 95 §6.3; period-end per the
-- 2026-07-12 ruling — the deleter keeps the paid period). The cancel is deliberately
-- NON-FATAL (the DB deletion state is authoritative; a Stripe outage must not
-- block a user's right to delete) — but a swallowed failure would mean a
-- deleted user KEEPS GETTING BILLED. This column is the durable marker: set
-- to NOW() when the delete-time cancel throws, cleared by the operator sweep
-- (docs/runbook/stripe_cancel_failed_sweep.md) after a successful manual /
-- scripted retry. NULL = no outstanding cancel debt.
--
-- SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §6
--            docs/specs/03-mobile/95_mobile_user_profiles.md §6.3

-- UP
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stripe_cancel_failed_at TIMESTAMPTZ;

-- Sweep query support: the operator lists outstanding debt with
--   SELECT user_id, stripe_customer_id, stripe_cancel_failed_at
--   FROM user_profiles WHERE stripe_cancel_failed_at IS NOT NULL;
-- No index — the marked population is expected to be ~0 rows.

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   ALTER TABLE user_profiles DROP COLUMN IF EXISTS stripe_cancel_failed_at;
