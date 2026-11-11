// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.3 Deletion
//            docs/specs/02-web-admin/20_stripe_web_checkout.md §6 (delete-time cancel)
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { markAllEntitlementsCancelledPendingDeletion } from '@/lib/entitlements';
// cancelAllStripeSubscriptions (period-end, P26-26D) is the SHARED helper in
// @/lib/stripe/client so the delete-time cancel and the admin retry-cancel
// route stay byte-identical. Delete-time semantics: schedule
// cancel_at_period_end for every live sub (the deleter keeps the paid period;
// billing stops at period end — Spec 20 §6). Stripe fires
// customer.subscription.updated now and .deleted LATER at period end; the
// webhook's `IS DISTINCT FROM 'cancelled_pending_deletion'` fence keeps both
// from overwriting the deletion state. Reactivation within the 30-day window
// restores the LIVE Stripe status (WF3 2026-07-14): if the period-end sub is
// still live it lands 'active'/'past_due', else 'expired' — see
// reactivate/route.ts + Spec 95 §6.4.
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
    // Create-if-missing (WF3 2026-11-11, MF-52 D-1 a; the pattern at
    // user-profile/route.ts:141). Sign-up creates only a `profiles` row
    // (migration 226:35-45), so a user who never hit PATCH /api/user-profile
    // has no user_profiles row. The old 404 here meant that user could not
    // delete their account in the app (App Store 5.1.1(v)).
    await query(`INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [uid]);

    // Entitlements swap (`.cursor/phase1_plan.md` Item 4 W5): deletion is
    // account-level — account_deleted_at on user_profiles PLUS a fan-out to
    // EVERY entitlement row the user has (no product filter, deliberately:
    // 'cancelled_pending_deletion' must block re-subscribe on all products).
    // Both writes commit together or not at all (fold: withTransaction added
    // this phase — a mid-write failure must not leave a deleted account with
    // live entitlements, or vice versa). The row is read FOR UPDATE inside the
    // same transaction (panel security F6), so the idempotency check, the
    // stored Stripe customer and the write all use one locked row.
    const outcome = await withTransaction(async (client) => {
      const locked = await client.query<{ account_deleted_at: string | null; stripe_customer_id: string | null }>(
        `SELECT account_deleted_at, stripe_customer_id FROM user_profiles WHERE user_id = $1 FOR UPDATE`,
        [uid],
      );
      const row = locked.rows[0];
      if (!row) return { kind: 'no_profile' as const };

      // Idempotency: already deleted → 200
      if (row.account_deleted_at) return { kind: 'already_deleted' as const };

      // A subscription with no stored customer (panel security F1): checkout
      // could create a Stripe Customer it failed to store, so the cancel below
      // has nothing to call. Mark the debt with the existing
      // stripe_cancel_failed_at marker so the operator sweep
      // (docs/runbook/stripe_cancel_failed_sweep.md) cancels it by hand.
      let orphanSubscriptionId: string | null = null;
      if (!row.stripe_customer_id) {
        const subs = await client.query<{ stripe_subscription_id: string }>(
          `SELECT stripe_subscription_id FROM entitlements
           WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
           LIMIT 1`,
          [uid],
        );
        orphanSubscriptionId = subs.rows[0]?.stripe_subscription_id ?? null;
      }

      await client.query(
        `UPDATE user_profiles
         SET account_deleted_at = NOW(),
             stripe_cancel_failed_at = CASE WHEN $2 THEN NOW() ELSE stripe_cancel_failed_at END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [uid, orphanSubscriptionId !== null],
      );
      await markAllEntitlementsCancelledPendingDeletion(client, uid);
      return {
        kind: 'deleted' as const,
        stripeCustomerId: row.stripe_customer_id,
        orphanSubscriptionId,
      };
    });

    if (outcome.kind === 'no_profile') {
      // The insert above ran, so a missing row here is data corruption (same
      // handling as subscribe/session's no_profile branch).
      logError('[user-profile/delete]', new Error('No user_profiles row after create-if-missing'), {
        event: 'data_inconsistency',
        uid,
      });
      return NextResponse.json(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
        { status: 500 },
      );
    }
    if (outcome.kind === 'already_deleted') {
      return NextResponse.json({ data: { ok: true }, error: null, meta: null });
    }

    if (outcome.orphanSubscriptionId) {
      logError('[user-profile/delete]', new Error('Subscription has no stored Stripe customer; cancel marked for the operator sweep'), {
        uid,
        stage: 'stripe_cancel_no_customer',
        stripe_subscription_id: outcome.orphanSubscriptionId,
      });
    }

    // Delete-time Stripe cancel (P26-26D): schedule cancel_at_period_end for
    // every live subscription (user ruling 2026-07-12 — deleter keeps the paid
    // period; billing stops at period end). Loud-non-fatal: a Stripe outage must not block the
    // user's right to delete — the failure is logged AND durably marked in
    // stripe_cancel_failed_at so the operator sweep
    // (docs/runbook/stripe_cancel_failed_sweep.md) retries it. Without the
    // marker, a swallowed failure means a deleted user keeps getting billed.
    const stripeCustomerId = outcome.stripeCustomerId;
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

    // KNOWN GAP, intentionally NOT implemented as a ban — flagged for
    // Security sign-off rather than shipped as a guess (P1-G5 Admin-SDK-
    // successor site for Firebase's `revokeRefreshTokens`).
    //
    // `@supabase/supabase-js`'s GoTrueAdminApi (confirmed via source read of
    // this installed version) has NO "invalidate all existing sessions for
    // a user id, without blocking future sign-in" method:
    //   - `admin.signOut(jwt, scope)` takes the USER'S OWN live JWT (which
    //     this server-side deletion flow does not have), not a uid — it
    //     cannot be called here at all.
    //   - `admin.updateUserById(uid, { ban_duration })` is the closest
    //     primitive but is semantically WRONG for this call site: it blocks
    //     the account from EVER signing in again until unbanned, which
    //     directly conflicts with this route's own 30-day reactivation
    //     window (`user-profile/reactivate/route.ts` restores the account
    //     — banning here with no matching unban on that path would
    //     permanently lock out every reactivated user, a worse regression
    //     than leaving the existing session live for its natural ~1hr
    //     expiry).
    // Net effect: a deleted user's already-issued access token remains
    // valid until its own natural expiry (unchanged Supabase default ~1hr)
    // instead of being force-revoked immediately. DB state
    // (`account_deleted_at`) is authoritative and already gates every
    // route that matters; this is a narrower blast radius than the
    // Firebase-era immediate revocation, not a correctness bug in the
    // deletion itself. Revisit if/when a wave touches
    // `user-profile/reactivate/route.ts` and can implement ban+unban as a
    // matched pair.

    return NextResponse.json({ data: { ok: true }, error: null, meta: null });
  } catch (err) {
    logError('[user-profile/delete]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
