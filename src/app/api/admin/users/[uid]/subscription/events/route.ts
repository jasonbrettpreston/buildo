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
// the correlation columns shipped". user_profiles.last_stripe_event_at (mig
// 116, always populated) is returned in meta as the true last-touch time.
//
// Auth: verifyAdminAuth FIRST line. Read-only — no audit row.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
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
    const profileRes = await pool.query<{ stripe_customer_id: string | null; last_stripe_event_at: string | null }>(
      `SELECT stripe_customer_id, last_stripe_event_at FROM user_profiles WHERE user_id = $1`,
      [uid],
    );
    const profile = profileRes.rows[0];
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    if (!profile.stripe_customer_id) {
      return ok([], { count: 0, last_stripe_event_at: null, reason: 'no_stripe_customer' });
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
      last_stripe_event_at: profile.last_stripe_event_at,
      // Honesty label (P26 review — Observability): this history is filtered by
      // the profile's CURRENT stripe_customer_id. A user who churned and
      // re-subscribed got a fresh customer id, so events recorded under a prior
      // customer id are not shown here — last_stripe_event_at (updated on every
      // match regardless of customer) is the true latest-touch signal.
      scope: 'current_stripe_customer_id',
    });
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/users/[uid]/subscription/events' });
  }
});
