# Stripe cancel-failure sweep (P26-26D)

**Owning spec:** `docs/specs/02-web-admin/20_stripe_web_checkout.md` §6
**Marker:** `user_profiles.stripe_cancel_failed_at` (mig 220)

## Why this exists

Account deletion (`POST /api/user-profile/delete`) cancels ALL the customer's
live Stripe subscriptions **immediately**. The cancel is deliberately
non-fatal — a Stripe outage must not block a user's right to delete — so a
failed cancel is logged AND durably marked in `stripe_cancel_failed_at`.
**An unmarked, unswept failure means a deleted user keeps getting billed.**

## Cadence

Check weekly, and after any Stripe incident. Expected population: 0 rows.

## Procedure

1. List outstanding debt:

   ```sql
   SELECT user_id, stripe_customer_id, stripe_cancel_failed_at
   FROM user_profiles
   WHERE stripe_cancel_failed_at IS NOT NULL
   ORDER BY stripe_cancel_failed_at;
   ```

2. For each row, cancel every live subscription in the Stripe dashboard
   (Customers → `<stripe_customer_id>` → Subscriptions → Cancel **immediately**),
   or via CLI:

   ```bash
   stripe subscriptions list --customer <cus_id> --status active
   stripe subscriptions cancel <sub_id>
   ```

   Also check `past_due` / `trialing` / `unpaid` statuses — all of them can
   still bill or resume billing.

3. Clear the marker ONLY after confirming zero live subscriptions remain:

   ```sql
   UPDATE user_profiles
   SET stripe_cancel_failed_at = NULL, updated_at = NOW()
   WHERE user_id = '<uid>';
   ```

4. If the same row re-marks repeatedly, the stored `stripe_customer_id` is
   probably stale/invalid — verify the customer exists in Stripe and record
   the resolution in `docs/reports/review_followups.md`.

## Notes

- Delete-time cancel is **immediate**; portal cancellation is
  **period-end** (`cancel_at_period_end`). The asymmetry is deliberate: a
  deleted account cannot use the paid period, so immediate is the cleaner
  contract, and both stop future billing (Spec 20 §6).
- Reactivation within the 30-day window needs NO Stripe resurrection —
  reactivate lands `'expired'` and the user re-subscribes normally
  (Spec 95 §6.4).
