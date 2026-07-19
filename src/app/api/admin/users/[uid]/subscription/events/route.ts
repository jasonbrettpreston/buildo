// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Per-user Stripe webhook history (P26-26-ADMIN). Read-only observability over
// the dedup ledger (stripe_webhook_events), filtered to this user's Stripe
// customer id (mig 221 added event_type + stripe_customer_id). Answers "what
// Stripe events have actually touched this account, and when?" without Stripe
// dashboard access — the operator's fastest webhook-liveness check per user.
//
// HONEST BOUNDARY: rows written before mig 221 carry a NULL stripe_customer_id
// and cannot be attributed to a customer — the per-user view is "history since
// the correlation columns shipped". The last-touch watermark is per-product on
// `entitlements.last_stripe_event_at` since the N2 swap
// (`.cursor/phase1_plan.md` Item 4) — meta returns MAX() across the user's
// entitlement rows as the account-level "true last-touch time" this view
// always reported (the events list itself is customer-scoped, i.e. spans all
// products, so the max — not any single product's watermark — is the honest
// counterpart).
//
// Auth: verifyAdminAuth FIRST line. Read-only — no audit row.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { isUuid } from '@/lib/entitlements';
import { ok, err } from '@/features/leads/api/envelope';
import { internalError } from '@/features/leads/api/error-mapping';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

async function getParams(context: unknown): Promise<{ uid: string }> {
  return (context as { params: Promise<{ uid: string }> }).params;
}

export const GET = withApiEnvelope(async function GET(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const { uid } = await getParams(context);

  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const profileRes = await pool.query<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM user_profiles WHERE user_id = $1`,
      [uid],
    );
    const profile = profileRes.rows[0];
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    if (!profile.stripe_customer_id) {
      return ok([], { count: 0, last_stripe_event_at: null, reason: 'no_stripe_customer' });
    }

    // Account-level last-touch: MAX across the user's per-product entitlement
    // watermarks (see header). Null for a user with no entitlement rows.
    let lastStripeEventAt: string | null = null;
    if (isUuid(uid)) {
      const watermarkRes = await pool.query<{ last_stripe_event_at: string | null }>(
        `SELECT MAX(last_stripe_event_at) AS last_stripe_event_at FROM entitlements WHERE user_id = $1`,
        [uid],
      );
      lastStripeEventAt = watermarkRes.rows[0]?.last_stripe_event_at ?? null;
    }

    const rows = await pool.query<{ event_id: string; event_type: string | null; processed_at: string }>(
      `SELECT event_id, event_type, processed_at
         FROM stripe_webhook_events
        WHERE stripe_customer_id = $1
        ORDER BY processed_at DESC
        LIMIT $2`,
      [profile.stripe_customer_id, limit],
    );

    const events = rows.rows.map((r) => ({
      event_id: r.event_id,
      type: r.event_type,
      processed_at: r.processed_at,
    }));

    return ok(events, {
      count: events.length,
      limit,
      last_stripe_event_at: lastStripeEventAt,
      // Honesty label (P26 review — Observability): this history is filtered by
      // the profile's CURRENT stripe_customer_id. A user who churned and
      // re-subscribed got a fresh customer id, so events recorded under a prior
      // customer id are not shown here — last_stripe_event_at (updated on every
      // match regardless of customer) is the true latest-touch signal. (Under
      // W8's one-Customer-per-user reuse this split can no longer occur for
      // post-swap accounts; the label stays for the pre-reuse rows.)
      scope: 'current_stripe_customer_id',
    });
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/users/[uid]/subscription/events' });
  }
});
