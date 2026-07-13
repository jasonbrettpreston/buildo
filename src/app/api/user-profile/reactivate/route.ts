// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.4 Reactivation
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
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
    const rows = await query<{ account_deleted_at: string | null; account_preset: string | null }>(
      `SELECT account_deleted_at, account_preset FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }

    const { account_deleted_at, account_preset } = rows[0]!;

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

    const restoredStatus = account_preset === 'manufacturer' ? 'admin_managed' : 'expired';

    // P24-24A — RETURNING * leaked stripe_customer_id / radius_cap_km /
    // trade_slugs_override (admin-internal + PII) to the mobile client. Return
    // only the client-safe column list, matching the /api/user-profile GET+PATCH
    // convention (userProfile.schema.ts).
    // Reset the Stripe bookkeeping tied to the SUPERSEDED subscription (P26
    // review — Reality-Check CRITICAL/HIGH). Both columns reference the old
    // sub the deletion scheduled to cancel; leaving them stale lets a later
    // terminal event or an operator sweep act on the wrong subscription after
    // the user re-subscribes with a fresh customer id:
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
