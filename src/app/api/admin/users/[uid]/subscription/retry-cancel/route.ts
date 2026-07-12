// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §6-DELETE §7
//
// Admin retry of a failed delete-time Stripe cancel (P26-26-ADMIN). Account
// deletion cancels the customer's subscriptions at period end (26D); when that
// Stripe call throws, deletion still proceeds and user_profiles.
// stripe_cancel_failed_at is set as durable debt (mig 220). This route re-runs
// the SAME shared cancel helper for one user and clears the marker on success.
// It is the UI counterpart to the operator sweep
// (docs/runbook/stripe_cancel_failed_sweep.md).
//
// Auth: verifyAdminAuth FIRST line + attributable session admin (audited
// mutation). Refuses when there is no outstanding cancel debt.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, parseAdminAllowlist, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { cancelAllStripeSubscriptions, StripeNotConfiguredError } from '@/lib/stripe/client';
import { RetryCancelSchema } from '@/lib/admin/subscription-ops-schemas';

const TAG = '[api/admin/users/uid/subscription/retry-cancel]';

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key mutation rejected — retry-cancel requires a session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Retry-cancel requires a session admin', 403);
  }
  return null;
}

async function getParams(context: unknown): Promise<{ uid: string }> {
  return (context as { params: Promise<{ uid: string }> }).params;
}

export const POST = withApiEnvelope(async function POST(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  const { uid: targetUid } = await getParams(context);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = RetryCancelSchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const { reason } = parsed.data;

  const adminUids = parseAdminAllowlist(process.env.ADMIN_USER_IDS);
  if (adminUids.includes(targetUid)) {
    return err('FORBIDDEN', 'Cannot mutate an admin account', 403);
  }

  try {
    const res = await pool.query<{ stripe_customer_id: string | null; stripe_cancel_failed_at: string | null }>(
      `SELECT stripe_customer_id, stripe_cancel_failed_at FROM user_profiles WHERE user_id = $1`,
      [targetUid],
    );
    const profile = res.rows[0];
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    if (!profile.stripe_cancel_failed_at) {
      return err('BAD_REQUEST', 'No outstanding cancel debt for this user', 400);
    }
    if (!profile.stripe_customer_id) {
      // Marker set but no customer — cannot retry; clear it so the debt stops
      // showing (there is nothing to cancel), audit-logged with that reason.
      await pool.query(
        `UPDATE user_profiles SET stripe_cancel_failed_at = NULL, updated_at = NOW() WHERE user_id = $1`,
        [targetUid],
      );
      await writeAdminAudit({
        adminUid: adminCtx.uid,
        action: 'subscription_retry_cancel',
        targetUid,
        oldValue: { stripe_cancel_failed_at: profile.stripe_cancel_failed_at },
        newValue: { stripe_cancel_failed_at: null, note: 'no_stripe_customer' },
        reason,
      });
      return ok({ cleared: true, cancelled_count: 0 }, { note: 'no_stripe_customer' });
    }

    // Re-run the SHARED cancel helper. On failure, LEAVE the marker (the debt
    // persists) and surface the error — never a false success.
    let cancelledCount: number;
    try {
      cancelledCount = await cancelAllStripeSubscriptions(profile.stripe_customer_id);
    } catch (stripeErr) {
      if (stripeErr instanceof StripeNotConfiguredError) {
        return NextResponse.json(
          { data: null, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured' }, meta: null },
          { status: 500 },
        );
      }
      logError(TAG, stripeErr, { stage: 'retry_cancel', targetUid });
      return err('STRIPE_CANCEL_FAILED', 'Stripe cancel retry failed; marker retained', 502);
    }

    await pool.query(
      `UPDATE user_profiles SET stripe_cancel_failed_at = NULL, updated_at = NOW() WHERE user_id = $1`,
      [targetUid],
    );

    await writeAdminAudit({
      adminUid: adminCtx.uid,
      action: 'subscription_retry_cancel',
      targetUid,
      oldValue: { stripe_cancel_failed_at: profile.stripe_cancel_failed_at },
      newValue: { stripe_cancel_failed_at: null, cancelled_count: cancelledCount },
      reason,
    });

    return ok({ cleared: true, cancelled_count: cancelledCount }, { audited: true });
  } catch (cause) {
    logError(TAG, cause, { stage: 'retry_cancel_outer', targetUid });
    return internalError(cause, { route: 'POST /api/admin/users/[uid]/subscription/retry-cancel' });
  }
});
