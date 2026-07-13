// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Admin subscription reconcile (P26-26-ADMIN). Webhooks are best-effort — a
// dropped or out-of-order event leaves user_profiles.subscription_status out of
// step with Stripe's actual state. This route is the operator's drift check:
//   GET  — live-GET the customer's Stripe subscriptions, derive the effective
//          status, and report stored-vs-Stripe (read-only, no mutation).
//   POST — apply the Stripe truth to user_profiles (admin-confirmed, reason
//          mandatory, audit-logged). REFUSES to touch protected states
//          (deleted / admin_managed) so it can never resurrect a deleted
//          account or demote a comp account.
//
// Auth: verifyAdminAuth FIRST line. POST additionally requires an attributable
// session admin (admin_key cannot perform an audited mutation).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, parseAdminAllowlist, type AdminContext } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import {
  getStripeClient,
  deriveEffectiveStripeStatus,
  StripeNotConfiguredError,
} from '@/lib/stripe/client';
import {
  ReconcileApplySchema,
  RECONCILE_PROTECTED_STATUSES,
} from '@/lib/admin/subscription-ops-schemas';

const TAG = '[api/admin/users/uid/subscription/reconcile]';

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function stripeNotConfigured(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured' }, meta: null },
    { status: 500 },
  );
}

async function getParams(context: unknown): Promise<{ uid: string }> {
  return (context as { params: Promise<{ uid: string }> }).params;
}

interface ProfileRow {
  subscription_status: string;
  stripe_customer_id: string | null;
}

async function loadProfile(uid: string): Promise<ProfileRow | null> {
  const res = await pool.query<ProfileRow>(
    `SELECT subscription_status, stripe_customer_id FROM user_profiles WHERE user_id = $1`,
    [uid],
  );
  return res.rows[0] ?? null;
}

/** Live-derive the customer's effective Stripe status. */
async function stripeStatusFor(customerId: string): Promise<'active' | 'past_due' | 'expired'> {
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  return deriveEffectiveStripeStatus(subs.data);
}

// ---------------------------------------------------------------------------
// GET — read-only drift report
// ---------------------------------------------------------------------------
export const GET = withApiEnvelope(async function GET(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const { uid } = await getParams(context);

  try {
    const profile = await loadProfile(uid);
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    const stored = profile.subscription_status;

    if (!profile.stripe_customer_id) {
      return ok(
        { stored_status: stored, stripe_status: null, drift: false },
        { reconcilable: false, reason: 'no_stripe_customer' },
      );
    }

    const stripeStatus = await stripeStatusFor(profile.stripe_customer_id);
    const isProtected = RECONCILE_PROTECTED_STATUSES.has(stored);
    // Drift is only actionable when the stored status is Stripe-governed.
    const drift = !isProtected && stored !== stripeStatus;

    return ok(
      { stored_status: stored, stripe_status: stripeStatus, drift },
      { reconcilable: !isProtected, protected: isProtected },
    );
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) return stripeNotConfigured();
    return internalError(cause, { route: 'GET /api/admin/users/[uid]/subscription/reconcile' });
  }
});

// ---------------------------------------------------------------------------
// POST — apply the Stripe truth (audited mutation)
// ---------------------------------------------------------------------------
function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key mutation rejected — reconcile-apply requires a session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Reconcile-apply requires a session admin', 403);
  }
  return null;
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
  const parsed = ReconcileApplySchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const { reason } = parsed.data;

  // Never mutate an admin allowlist member.
  const adminUids = parseAdminAllowlist(process.env.ADMIN_USER_IDS);
  if (adminUids.includes(targetUid)) {
    return err('FORBIDDEN', 'Cannot mutate an admin account', 403);
  }

  try {
    const profile = await loadProfile(targetUid);
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    const stored = profile.subscription_status;

    // Protected states are not Stripe-governed — refuse (409) rather than
    // resurrect a deleted account or demote a comp account.
    if (RECONCILE_PROTECTED_STATUSES.has(stored)) {
      return err('CONFLICT', `Cannot reconcile a '${stored}' account`, 409);
    }
    if (!profile.stripe_customer_id) {
      return err('BAD_REQUEST', 'User has no Stripe customer to reconcile against', 400);
    }

    const stripeStatus = await stripeStatusFor(profile.stripe_customer_id);

    if (stored === stripeStatus) {
      // No drift — idempotent no-op (no audit row for a non-change).
      return ok(
        { stored_status: stored, stripe_status: stripeStatus, applied: false },
        { drift: false },
      );
    }

    // Atomic mutation + audit (P26 review — DeepSeek/Observability CRITICAL):
    // the UPDATE and its admin_audit_log row commit together or not at all, so
    // an audit-write failure can never leave a mutated-but-unaudited (and, per
    // the no-drift short-circuit above, unrecoverable) account.
    // The WHERE fence excludes BOTH protected statuses (P26 review — the SQL
    // guard, not just the read-time check at line ~158, so a concurrent flip to
    // 'admin_managed' or the deletion state during the Stripe round-trip can't
    // be overwritten). last_stripe_event_at = NOW() blocks a subsequently-
    // arriving STALE webhook from reverting this operator decision (Gemini MED).
    let applied = false;
    await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE user_profiles
            SET subscription_status = $1, last_stripe_event_at = NOW(), updated_at = NOW()
          WHERE user_id = $2
            AND subscription_status NOT IN ('cancelled_pending_deletion', 'admin_managed')`,
        [stripeStatus, targetUid],
      );
      if ((updated.rowCount ?? 0) === 0) {
        // The fence caught a concurrent state change — no mutation, no audit.
        return;
      }
      await writeAdminAudit(
        {
          adminUid: adminCtx.uid,
          action: 'subscription_reconcile_apply',
          targetUid,
          oldValue: { subscription_status: stored },
          newValue: { subscription_status: stripeStatus },
          reason,
        },
        client,
      );
      applied = true;
    });

    if (!applied) {
      return err('CONFLICT', 'Account state changed concurrently; reconcile not applied', 409);
    }

    return ok(
      { stored_status: stored, stripe_status: stripeStatus, applied: true },
      { drift: true, audited: true },
    );
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) return stripeNotConfigured();
    logError(TAG, cause, { stage: 'reconcile_apply', targetUid });
    return internalError(cause, { route: 'POST /api/admin/users/[uid]/subscription/reconcile' });
  }
});
