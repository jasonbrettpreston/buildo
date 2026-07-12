// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.3 Deletion
//            docs/specs/02-web-admin/20_stripe_web_checkout.md §6 (delete-time cancel)
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
// cancelAllStripeSubscriptions (period-end, P26-26D) is the SHARED helper in
// @/lib/stripe/client so the delete-time cancel and the admin retry-cancel
// route stay byte-identical. Delete-time semantics: schedule
// cancel_at_period_end for every live sub (the deleter keeps the paid period;
// billing stops at period end — Spec 20 §6). Stripe fires
// customer.subscription.updated now and .deleted LATER at period end; the
// webhook's `IS DISTINCT FROM 'cancelled_pending_deletion'` fence keeps both
// from overwriting the deletion state. Reactivation within the 30-day window
// needs no Stripe resurrection (reactivate lands 'expired' → re-subscribe).
import { cancelAllStripeSubscriptions } from '@/lib/stripe/client';

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const rows = await query<{ account_deleted_at: string | null; stripe_customer_id: string | null }>(
      `SELECT account_deleted_at, stripe_customer_id FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }

    // Idempotency: already deleted → 200
    if (rows[0]!.account_deleted_at) {
      return NextResponse.json({ data: { ok: true }, error: null, meta: null });
    }

    await query(
      `UPDATE user_profiles
       SET account_deleted_at = NOW(),
           subscription_status = 'cancelled_pending_deletion',
           updated_at = NOW()
       WHERE user_id = $1`,
      [uid],
    );

    // Delete-time Stripe cancel (P26-26D): schedule cancel_at_period_end for
    // every live subscription (user ruling 2026-07-12 — deleter keeps the paid
    // period; billing stops at period end). Loud-non-fatal: a Stripe outage must not block the
    // user's right to delete — the failure is logged AND durably marked in
    // stripe_cancel_failed_at so the operator sweep
    // (docs/runbook/stripe_cancel_failed_sweep.md) retries it. Without the
    // marker, a swallowed failure means a deleted user keeps getting billed.
    const stripeCustomerId = rows[0]!.stripe_customer_id;
    if (stripeCustomerId) {
      try {
        await cancelAllStripeSubscriptions(stripeCustomerId);
      } catch (stripeErr) {
        logError('[user-profile/delete]', stripeErr, {
          uid,
          stage: 'stripe_cancel',
          stripe_customer_id: stripeCustomerId,
        });
        try {
          await query(
            `UPDATE user_profiles SET stripe_cancel_failed_at = NOW(), updated_at = NOW()
             WHERE user_id = $1`,
            [uid],
          );
        } catch (markerErr) {
          // Even the marker write failed — the logError above is the last
          // line of visibility; the sweep also cross-checks Stripe directly.
          logError('[user-profile/delete]', markerErr, { uid, stage: 'stripe_cancel_marker' });
        }
      }
    }

    // Revoke all Firebase refresh tokens so existing sessions cannot be reused
    try {
      const admin = await import('firebase-admin');
      if (admin.apps.length > 0) {
        await admin.auth().revokeRefreshTokens(uid);
      }
    } catch (firebaseErr) {
      // Non-fatal: log but don't fail the deletion — DB state is authoritative
      logError('[user-profile/delete]', firebaseErr, { uid, stage: 'revoke_tokens' });
    }

    return NextResponse.json({ data: { ok: true }, error: null, meta: null });
  } catch (err) {
    logError('[user-profile/delete]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
