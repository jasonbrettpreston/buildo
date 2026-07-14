// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.4 Reactivation
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { getStripeClient, deriveEffectiveStripeStatus } from '@/lib/stripe/client';
import { CLIENT_SAFE_SELECT_LIST } from '@/lib/userProfile.schema';

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const rows = await query<{
      account_deleted_at: string | null;
      account_preset: string | null;
      stripe_customer_id: string | null;
    }>(
      `SELECT account_deleted_at, account_preset, stripe_customer_id FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }

    const { account_deleted_at, account_preset, stripe_customer_id } = rows[0]!;

    if (!account_deleted_at) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_DELETED', message: 'Account is not in a deleted state' }, meta: null },
        { status: 400 },
      );
    }

    const deletedAt = new Date(account_deleted_at);
    const daysElapsed = (Date.now() - deletedAt.getTime()) / 86_400_000;
    if (daysElapsed >= 30) {
      return NextResponse.json(
        { data: null, error: { code: 'RECOVERY_WINDOW_EXPIRED', message: '30-day recovery window has passed' }, meta: null },
        { status: 400 },
      );
    }

    // Determine the status to restore.
    //  - Manufacturer is a comp/admin_managed account, independent of Stripe —
    //    it must NEVER see the consumer paywall, so it skips the Stripe read.
    //  - Everyone else: because delete now schedules PERIOD-END cancel (the
    //    2026-07-12 ruling), the sub stays LIVE until period end. A user who
    //    reactivates within that already-paid window should get their real live
    //    status back (RULED 2026-07-14 — review_followups D3), not be forced to
    //    re-subscribe. deriveEffectiveStripeStatus is the money-loop SSOT
    //    (shared with the admin reconcile route). We do NOT clear
    //    cancel_at_period_end — access lasts the remaining paid period, then
    //    lapses to 'expired' via the period-end `.deleted` webhook unless the
    //    user re-subscribes.
    //  - LOUD-NON-FATAL: a Stripe outage / unconfigured key must never block
    //    reactivation — fall back to 'expired' and log. The account is restored
    //    either way; a subsequent webhook or admin reconcile corrects the status.
    let restoredStatus: 'admin_managed' | 'active' | 'past_due' | 'expired';
    if (account_preset === 'manufacturer') {
      restoredStatus = 'admin_managed';
    } else {
      restoredStatus = 'expired';
      if (stripe_customer_id) {
        try {
          const stripe = getStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: stripe_customer_id,
            status: 'all',
            limit: 100,
          });
          restoredStatus = deriveEffectiveStripeStatus(subs.data);
        } catch (stripeErr) {
          logError('[user-profile/reactivate] live Stripe status read failed; defaulting to expired', stripeErr, {
            uid,
          });
          restoredStatus = 'expired';
        }
      }
    }

    // P24-24A — RETURNING * leaked stripe_customer_id / radius_cap_km /
    // trade_slugs_override (admin-internal + PII) to the mobile client. Return
    // only the client-safe column list, matching the /api/user-profile GET+PATCH
    // convention (userProfile.schema.ts).
    // Reset the Stripe bookkeeping tied to the subscription the deletion
    // scheduled to cancel (P26 review — Reality-Check CRITICAL/HIGH). Safe under
    // BOTH reactivation outcomes: (a) re-subscribe with a fresh customer id — a
    // stale terminal event / operator sweep could otherwise act on the wrong
    // sub; (b) live-restore on the SAME customer (the 2026-07-14 ruling above) —
    // clearing the watermark only lets the genuine period-end `.deleted` (a
    // FUTURE event) apply, and no older in-flight event can set a status worse
    // than the sub's real live state. The webhook's deletion + superseded-sub
    // fences remain the primary guards; these clears are belt-and-suspenders:
    //   - last_stripe_event_at = NULL: clears the out-of-order watermark tied
    //     to the old sub (the webhook's superseded-subscription fence is the
    //     primary guard; this is belt-and-suspenders).
    //   - stripe_cancel_failed_at = NULL: the old sub's cancel debt is moot on
    //     reactivation; a re-subscribe mints a new customer, so retrying the
    //     old cancel would target the wrong (or a live) subscription.
    const updated = await query<Record<string, unknown>>(
      `UPDATE user_profiles
       SET account_deleted_at = NULL,
           subscription_status = $2,
           last_stripe_event_at = NULL,
           stripe_cancel_failed_at = NULL,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING ${CLIENT_SAFE_SELECT_LIST}`,
      [uid, restoredStatus],
    );

    return NextResponse.json({ data: updated[0], error: null, meta: null });
  } catch (err) {
    logError('[user-profile/reactivate]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
