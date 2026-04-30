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
//   400 — already-active or admin_managed (no checkout needed)
//   401 — no Firebase session
//   500 — sanitised error envelope
//
// Auth: Bearer token (mobile) or session cookie (web). Per spec §10 Step 4b,
// classified as 'authenticated' in route-guard.

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import type { SubscribeSessionResponse } from './types';

const CHECKOUT_BASE_URL =
  process.env.SUBSCRIBE_CHECKOUT_BASE_URL ?? 'https://buildo.com/subscribe';

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
    const profileRows = await query<{ subscription_status: string | null }>(
      `SELECT subscription_status FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (profileRows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }

    const status = profileRows[0]!.subscription_status;
    if (status !== null && DELETION_BLOCKED_STATUSES.has(status)) {
      // Account deletion confirmed — Spec 96 §2 requires NO app content
      // for these users. Returning 400 with a distinct code lets the
      // mobile client recognise this state and route to sign-in via the
      // gate's cancelled_pending_deletion branch (no UI on the paywall
      // screen should reach this state, but defense-in-depth.)
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
    if (status !== null && ALREADY_ENTITLED_STATUSES.has(status)) {
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

    const nonce = randomUUID();
    // INSERT — uniqueness is enforced by the PK on `nonce`. Collisions are
    // astronomically unlikely with v4 UUIDs but the constraint is the
    // backstop. expires_at default is NOW() + INTERVAL '15 minutes' so we
    // don't need to compute it client-side.
    await query(
      `INSERT INTO subscribe_nonces (nonce, user_id) VALUES ($1, $2)`,
      [nonce, uid],
    );

    const response: SubscribeSessionResponse = {
      url: `${CHECKOUT_BASE_URL}?nonce=${encodeURIComponent(nonce)}`,
    };
    return NextResponse.json({ data: response, error: null, meta: null });
  } catch (err) {
    logError('[subscribe/session]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
