// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.3 Deletion
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

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

    // Stripe subscription cancellation deferred to Spec 96 (stripe package not yet installed).
    // rows[0].stripe_customer_id will be used here when Stripe is wired.

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
