// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §5 Paywall Screen
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//
// POST /api/subscribe/session — issues a single-use, 15-minute-TTL nonce
// for the buildo.com checkout flow. The nonce, NOT the UID or email, is
// what travels in the URL query string. The web checkout page exchanges
// the nonce server-to-server to recover the Firebase UID and immediately
// invalidates the row, so the URL is safe to log, share with referrers,
// or land in browser history without leaking PII.
//
// Status code matrix:
//   200 — `{ data: { url }, error: null, meta: null }`
//   400 — already-active or admin_managed (no checkout needed) /
//         account pending deletion / non-prod env without override
//   401 — no Firebase session
//   500 — sanitised error envelope (incl. data inconsistency: auth user
//         with no profile row, which is unrecoverable from the client)
//
// Auth: Bearer token (mobile) or session cookie (web). Per spec §10 Step 4b,
// classified as 'authenticated' in route-guard.

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import type { SubscribeSessionResponse } from './types';

// SUBSCRIBE_CHECKOUT_BASE_URL must be explicitly set in any non-production
// environment (staging, dev, preview) to prevent accidental routing to the
// production payment processor. We allow the production fallback only when
// NODE_ENV === 'production' so a misconfigured staging deployment fails
// loud instead of silently sending QA testers to live Stripe checkout.
function resolveCheckoutBaseUrl(): string {
  const fromEnv = process.env.SUBSCRIBE_CHECKOUT_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === 'production') return 'https://buildo.com/subscribe';
  // Throwing here surfaces the misconfiguration in the route's catch block
  // and produces a 500 — preferred over silently returning a prod URL from
  // a non-prod build.
  throw new Error(
    'SUBSCRIBE_CHECKOUT_BASE_URL is required in non-production environments. ' +
      'Set it in .env to your environment-specific checkout host.',
  );
}

// Statuses that already grant full access — no checkout needed. Returning
// 400 (not 200 with a no-op URL) lets the client surface a clear error
// instead of silently opening a browser to a paid-in-full page.
const ALREADY_ENTITLED_STATUSES = new Set(['active', 'admin_managed']);

// Statuses that block ANY new subscription activity. cancelled_pending_deletion
// means the user has confirmed account deletion (Spec 96 §2) — they must NOT
// be able to re-subscribe through this endpoint, which would partially
// revive a deleted account and break the deletion contract. Reactivation
// flows through Spec 95 /api/user-profile/reactivate, not through Stripe.
const DELETION_BLOCKED_STATUSES = new Set(['cancelled_pending_deletion']);

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const baseUrl = resolveCheckoutBaseUrl();

    // Wrap SELECT + INSERT in a single transaction with a row-level lock to
    // close the TOCTOU race: a concurrent webhook flipping subscription_status
    // to 'active' between the SELECT and the INSERT would otherwise still
    // issue a useless checkout URL. FOR UPDATE serialises with the webhook's
    // UPDATE on the same row.
    //
    // Idempotent within the 15-min nonce window: if a valid unexpired nonce
    // already exists for this user (e.g. double-tap on the CTA), reuse it
    // instead of churning the table with orphan rows. This makes the endpoint
    // safe to call repeatedly within a checkout window without polluting the
    // nonce table.
    const result = await withTransaction(async (client) => {
      const profileRows = await client.query<{ subscription_status: string | null }>(
        `SELECT subscription_status FROM user_profiles WHERE user_id = $1 FOR UPDATE`,
        [uid],
      );

      if (profileRows.rowCount === 0) {
        // Authenticated user with no profile row is data corruption (auth
        // succeeded but the user_profile insert never landed, or the row
        // was deleted out of band). 500 is more accurate than 404 — the
        // client cannot recover from this, only support can.
        return { kind: 'no_profile' as const };
      }

      const status = profileRows.rows[0]!.subscription_status;
      if (status !== null && DELETION_BLOCKED_STATUSES.has(status)) {
        return { kind: 'deletion_blocked' as const };
      }
      if (status !== null && ALREADY_ENTITLED_STATUSES.has(status)) {
        return { kind: 'already_entitled' as const };
      }

      // Reuse an unexpired nonce if one exists. Spec 96 §10 Step 4b
      // describes nonces as "single-use" — meaning the WEB CHECKOUT consumes
      // the row on exchange — so reusing the row before exchange is safe.
      const existing = await client.query<{ nonce: string }>(
        `SELECT nonce FROM subscribe_nonces
         WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY expires_at DESC
         LIMIT 1`,
        [uid],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        return { kind: 'ok' as const, nonce: existing.rows[0]!.nonce };
      }

      const nonce = randomUUID();
      // INSERT — uniqueness is enforced by the PK on `nonce`. Collisions
      // are astronomically unlikely with v4 UUIDs but the constraint is the
      // backstop. expires_at default is NOW() + INTERVAL '15 minutes' so we
      // don't need to compute it client-side; relying on the DB default
      // also avoids clock skew between app server and DB server.
      await client.query(
        `INSERT INTO subscribe_nonces (nonce, user_id) VALUES ($1, $2)`,
        [nonce, uid],
      );
      return { kind: 'ok' as const, nonce };
    });

    if (result.kind === 'no_profile') {
      logError('[subscribe/session]', new Error('Authenticated user has no user_profiles row'), {
        event: 'data_inconsistency',
        uid,
      });
      return NextResponse.json(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
        { status: 500 },
      );
    }
    if (result.kind === 'deletion_blocked') {
      // Account deletion confirmed — Spec 96 §2 requires NO app content
      // for these users. Returning 400 with a distinct code lets the
      // mobile client recognise this state and route to sign-in via the
      // gate's cancelled_pending_deletion branch.
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'ACCOUNT_PENDING_DELETION',
            message: 'Account is pending deletion and cannot resubscribe.',
          },
          meta: null,
        },
        { status: 400 },
      );
    }
    if (result.kind === 'already_entitled') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'ALREADY_ENTITLED',
            message: 'Account already has access — no checkout needed.',
          },
          meta: null,
        },
        { status: 400 },
      );
    }

    const response: SubscribeSessionResponse = {
      url: `${baseUrl}?nonce=${encodeURIComponent(result.nonce)}`,
    };
    return NextResponse.json({ data: response, error: null, meta: null });
  } catch (err) {
    logError('[subscribe/session]', err, { event: 'unexpected', uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
