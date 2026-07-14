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
    // Stripe bookkeeping on reactivation (P26 review + WF3 2026-07-14 round-2):
    //   - stripe_cancel_failed_at = NULL: retire any moot delete-time cancel
    //     debt (the user is staying). Known edge: if the delete-time cancel
    //     itself FAILED, the sub was never scheduled to cancel, so clearing the
    //     marker leaves a fully-live sub — benign (favors the user; nothing left
    //     to retry-cancel once reactivated). Spec 95 §6.4 Known Failure Modes
    //     (Regression Guardian F3).
    //   - last_stripe_event_at = NOW(): RE-STAMP the out-of-order watermark to
    //     the reactivation instant — do NOT clear it to NULL. The webhook's
    //     superseded-sub fence (`$1='active' OR stripe_customer_id IS NOT
    //     DISTINCT FROM $2`, webhook route:312) only guards the RE-SUBSCRIBE
    //     topology (a fresh cus_NEW ≠ the stored id); on the live-restore path
    //     the customer id is UNCHANGED, so that fence passes for EVERY event and
    //     the watermark is the ONLY guard against a stale/delayed same-customer
    //     event (e.g. an already-resolved invoice.payment_failed) downgrading
    //     the freshly-restored status. NULL would DISABLE it (the guard
    //     `last_stripe_event_at IS NULL OR ... < $4` is unconditionally true —
    //     Regression Guardian). NOW() keeps it forward-only: the genuine future
    //     period-end `.deleted` (created > now) still applies; stale events
    //     (created < now) are rejected.
    const updated = await query<Record<string, unknown>>(
      `UPDATE user_profiles
       SET account_deleted_at = NULL,
           subscription_status = $2,
           last_stripe_event_at = NOW(),
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
