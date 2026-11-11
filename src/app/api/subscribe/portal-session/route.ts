// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §5
//            docs/specs/03-mobile/96_mobile_subscription.md §7
//
// POST /api/subscribe/portal-session (P26-26C) — creates a one-off Stripe
// Customer Portal session for the authenticated user and returns its URL.
// Replaces the mobile Settings screen's static billing-page link: the portal
// is where cancel, payment-method updates, and past_due recovery live.
//
// Status code matrix:
//   200 — `{ data: { url }, error: null, meta: null }`
//   400 — NO_STRIPE_CUSTOMER (profile has no stripe_customer_id — the user
//         has never completed a checkout; nothing to manage)
//   401 — no Firebase session
//   403 — ACCOUNT_DELETED (account scheduled for deletion; WF3 2026-11-11,
//         MF-52 D-3: the account_deleted_at check subscribe/session makes,
//         with the code and body user-profile/route.ts returns. A deleted
//         user's token lives about an hour, and a portal renewal could undo
//         the delete-time period-end cancel)
//   404 — authenticated user with no profile row
//   500 — STRIPE_NOT_CONFIGURED (named env-presence guard) / sanitized
//
// Auth: session/Bearer via getUserIdFromSession. Route-guard: inherits
// 'authenticated' from the /api/subscribe prefix (pinned in
// subscribe-routes.logic.test.ts) — deliberately NOT in
// PUBLIC_EXACT_API_PATHS.

import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import {
  getStripeClient,
  resolveSubscribeBaseUrl,
  StripeNotConfiguredError,
} from '@/lib/stripe/client';
import type { PortalSessionResponse } from './types';

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

    const deletedAtRaw = rows[0]!.account_deleted_at;
    if (deletedAtRaw) {
      // Same body and headers as user-profile/route.ts (GET): the mobile
      // apiClient builds AccountDeletedError from account_deleted_at and
      // days_remaining.
      const daysElapsed = (Date.now() - new Date(deletedAtRaw).getTime()) / 86_400_000;
      const daysRemaining = Math.max(0, Math.ceil(30 - daysElapsed));
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'ACCOUNT_DELETED',
            message: 'Account is scheduled for deletion',
            account_deleted_at: deletedAtRaw,
            days_remaining: daysRemaining,
          },
          meta: null,
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const customerId = rows[0]!.stripe_customer_id;
    if (!customerId) {
      // Never checked out — there is no Stripe customer to manage. The mobile
      // client maps this to "no billing to manage yet" copy.
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'NO_STRIPE_CUSTOMER',
            message: 'No billing account exists yet — subscribe first.',
          },
          meta: null,
        },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    // Return target after the user leaves the portal: the public site root
    // (derived from the subscribe base URL so staging stays on staging). The
    // mobile user simply closes the in-app browser; web users land somewhere
    // sensible.
    const returnUrl = new URL(resolveSubscribeBaseUrl()).origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    const response: PortalSessionResponse = { url: session.url };
    return NextResponse.json({ data: response, error: null, meta: null });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      logError('[subscribe/portal-session]', err, { event: 'stripe_not_configured', uid });
      return NextResponse.json(
        { data: null, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payment processing is not configured' }, meta: null },
        { status: 500 },
      );
    }
    logError('[subscribe/portal-session]', err, { event: 'unexpected', uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
