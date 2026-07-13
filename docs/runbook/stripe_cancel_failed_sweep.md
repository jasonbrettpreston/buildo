# Stripe cancel-failure sweep (P26-26D)

**Owning spec:** `docs/specs/02-web-admin/20_stripe_web_checkout.md` §6
**Marker:** `user_profiles.stripe_cancel_failed_at` (mig 220)

## Why this exists

Account deletion — BOTH the self-serve path (`POST /api/user-profile/delete`)
AND the admin path (`PATCH /api/admin/users/[uid]` action `delete`) — schedules
`cancel_at_period_end` on ALL the customer's live Stripe subscriptions
(**period-end** per the 2026-07-12 ruling: the deleter keeps the paid period,
then billing stops). The cancel is deliberately non-fatal — a Stripe outage must
not block a user's right to delete — so a failed cancel is logged AND durably
marked in `stripe_cancel_failed_at`. **An unmarked, unswept failure means a
deleted user's subscription keeps auto-renewing past the paid period.**

## Cadence

Check weekly, and after any Stripe incident. Expected population: 0 rows. The
admin UI equivalent is the Subscription-Ops "Retry cancel" button (Spec 21 §6)
plus the directory `stripe_cancel_failed` filter.

## Procedure

1. List outstanding debt:

   ```sql
   SELECT user_id, stripe_customer_id, stripe_cancel_failed_at, account_deleted_at
   FROM user_profiles
   WHERE stripe_cancel_failed_at IS NOT NULL
   ORDER BY stripe_cancel_failed_at;
   ```

   Rows with `account_deleted_at IS NULL` were reactivated after the failure —
   the marker is stale debt against a superseded subscription; do NOT cancel the
   current (possibly live/paying) subscription. Just clear the marker (step 3).
   The admin retry-cancel route does this automatically.

2. For each still-deleted row, schedule cancel-at-period-end on every live
   subscription in the Stripe dashboard (Customers → `<stripe_customer_id>` →
   Subscriptions → **Cancel at period end**), or via CLI:

   ```bash
   stripe subscriptions list --customer <cus_id> --status all
   stripe subscriptions update <sub_id> -d cancel_at_period_end=true
   ```

   Also check `past_due` / `trialing` / `unpaid` statuses — all of them can
   still bill or resume billing (the shared helper skips only the terminal
   `canceled` / `incomplete_expired` states).

3. Clear the marker ONLY after confirming every live subscription is scheduled
   to cancel (or, for a reactivated row, immediately):

   ```sql
   UPDATE user_profiles
   SET stripe_cancel_failed_at = NULL, updated_at = NOW()
   WHERE user_id = '<uid>';
   ```

4. If the same row re-marks repeatedly, the stored `stripe_customer_id` is
   probably stale/invalid — verify the customer exists in Stripe and record
   the resolution in `docs/reports/review_followups.md`.

## Notes

- Delete-time cancel AND portal cancellation are both **period-end**
  (`cancel_at_period_end`) as of the 2026-07-12 ruling — the earlier
  immediate-cancel-on-delete design is retired (Spec 20 §6). Both stop future
  billing; the deleter simply keeps the period they already paid for.
- Reactivation within the 30-day window needs NO Stripe resurrection — it lands
  `'expired'` and clears `stripe_cancel_failed_at` + `last_stripe_event_at`
  (both scoped to the superseded subscription), and the user re-subscribes
  normally with a fresh customer id (Spec 95 §6.4).
