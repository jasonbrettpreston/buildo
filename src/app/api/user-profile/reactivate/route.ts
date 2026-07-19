// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.4 Reactivation
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5
//
// Entitlements swap (`.cursor/phase1_plan.md` Item 4 W4): reactivation now
// restores PER-PRODUCT entitlement rows. The customer's live Stripe
// subscriptions are grouped by product (price → product map, OD3) and each
// product's row gets its real live status back; any product still stuck in
// 'cancelled_pending_deletion' with no live subscription falls to 'expired'
// (the catch-all — nothing is left stuck in the deletion state).
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query, pool, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { getStripeClient, deriveEffectiveStripeStatusByProduct } from '@/lib/stripe/client';
import { CLIENT_SAFE_JOINED_SELECT } from '@/lib/userProfile.schema';
import {
  LEAD_GEN_ENTITLEMENT_JOIN,
  upsertEntitlementStatus,
  isUuid,
  type Product,
} from '@/lib/entitlements';

const PROFILE_SELECT_SQL = `SELECT ${CLIENT_SAFE_JOINED_SELECT} FROM user_profiles up ${LEAD_GEN_ENTITLEMENT_JOIN} WHERE up.user_id = $1`;

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

    // Determine the per-product statuses to restore.
    //  - Manufacturer is a comp/admin_managed account, independent of Stripe —
    //    it must NEVER see the consumer paywall, so it skips the Stripe read.
    //    admin_managed is restored on lead_gen specifically (the only product
    //    a manufacturer account holds in the single-product window — plan
    //    Item 4 W4's stated assumption); any OTHER product's row still falls
    //    through the catch-all below so nothing stays deletion-stuck.
    //  - Everyone else: because delete now schedules PERIOD-END cancel (the
    //    2026-07-12 ruling), subs stay LIVE until period end. A user who
    //    reactivates within that already-paid window should get each product's
    //    real live status back (RULED 2026-07-14 — review_followups D3), not
    //    be forced to re-subscribe. deriveEffectiveStripeStatusByProduct is
    //    the money-loop SSOT (shared with the admin reconcile route). We do
    //    NOT clear cancel_at_period_end — access lasts the remaining paid
    //    period, then lapses to 'expired' via the period-end `.deleted`
    //    webhook unless the user re-subscribes.
    //  - LOUD-NON-FATAL: a Stripe outage / unconfigured key must never block
    //    reactivation — fall back to the expired catch-all and log. The
    //    account is restored either way; a subsequent webhook or admin
    //    reconcile corrects the status. (Stripe I/O happens BEFORE the
    //    transaction — §R9, never hold a txn across network calls.)
    let restoredByProduct = new Map<Product, 'active' | 'past_due' | 'expired'>();
    const isManufacturer = account_preset === 'manufacturer';
    if (!isManufacturer && stripe_customer_id) {
      try {
        const stripe = getStripeClient();
        const subs = await stripe.subscriptions.list({
          customer: stripe_customer_id,
          status: 'all',
          limit: 100,
        });
        restoredByProduct = await deriveEffectiveStripeStatusByProduct(pool, subs.data);
      } catch (stripeErr) {
        logError('[user-profile/reactivate] live Stripe status read failed; defaulting to expired', stripeErr, {
          uid,
        });
        restoredByProduct = new Map();
      }
    }

    // Stripe bookkeeping on reactivation (P26 review + WF3 2026-07-14 round-2):
    //   - stripe_cancel_failed_at = NULL: retire any moot delete-time cancel
    //     debt (the user is staying). Known edge: if the delete-time cancel
    //     itself FAILED, the sub was never scheduled to cancel, so clearing the
    //     marker leaves a fully-live sub — benign (favors the user; nothing left
    //     to retry-cancel once reactivated). Spec 95 §6.4 Known Failure Modes
    //     (Regression Guardian F3).
    //   - last_stripe_event_at = NOW() on every touched entitlement row:
    //     RE-STAMP the out-of-order watermark to the reactivation instant — do
    //     NOT clear it to NULL. On the live-restore path the customer/sub ids
    //     are UNCHANGED, so the superseded-subscription fence passes for every
    //     event and the watermark is the ONLY guard against a stale/delayed
    //     same-subscription event (e.g. an already-resolved
    //     invoice.payment_failed) downgrading the freshly-restored status.
    //     NULL would DISABLE it (`last_stripe_event_at IS NULL OR ... <` is
    //     unconditionally true — Regression Guardian). NOW() keeps it
    //     forward-only: the genuine future period-end `.deleted`
    //     (created > now) still applies; stale events are rejected. Applied to
    //     the catch-all too, for the same reason (judgment call — the plan's
    //     catch-all SQL omitted it, but the fence rationale is identical).
    const updated = await withTransaction(async (client) => {
      // isUuid guard: pre-229 dev uid shapes cannot key an entitlements row
      // (UUID FK) — the account-level restore below still applies.
      if (isUuid(uid)) {
        if (isManufacturer) {
          await upsertEntitlementStatus(client, uid, 'lead_gen', 'admin_managed');
        } else {
          for (const [product, status] of restoredByProduct) {
            await client.query(
              `UPDATE entitlements
               SET status = $3, last_stripe_event_at = NOW(), updated_at = NOW()
               WHERE user_id = $1 AND product = $2`,
              [uid, product, status],
            );
          }
        }
        // Catch-all: any product with no live Stripe subscription found leaves
        // the deletion state as 'expired' — nothing stays stuck (plan Item 4
        // W4). Ordering matters: the per-product restores above have already
        // moved their rows OFF 'cancelled_pending_deletion', so this only
        // touches the genuinely unrestored rows.
        await client.query(
          `UPDATE entitlements
           SET status = 'expired', last_stripe_event_at = NOW(), updated_at = NOW()
           WHERE user_id = $1 AND status = 'cancelled_pending_deletion'`,
          [uid],
        );
      }
      // P24-24A — the response returns only the client-safe column list,
      // matching the /api/user-profile GET+PATCH convention.
      await client.query(
        `UPDATE user_profiles
         SET account_deleted_at = NULL,
             stripe_cancel_failed_at = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [uid],
      );
      const full = await client.query<Record<string, unknown>>(PROFILE_SELECT_SQL, [uid]);
      return full.rows[0] ?? null;
    });

    return NextResponse.json({ data: updated, error: null, meta: null });
  } catch (err) {
    logError('[user-profile/reactivate]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
