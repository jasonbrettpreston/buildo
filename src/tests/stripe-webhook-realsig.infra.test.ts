// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §4.1
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//
// REAL-SIGNATURE test. Every other webhook test mocks `stripe` and stubs
// constructEvent, so they never exercise the actual HMAC signature check. This
// one uses the REAL Stripe SDK to generate a valid signed header
// (`generateTestHeaderString`) and asserts the route accepts it AND that a
// deliberately corrupted signature is rejected — the money route's front door.
// Only the DB client is mocked (no live DB in unit scope).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import type { NextRequest } from 'next/server';

const fakeClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeClientQuery }),
  ),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

const WEBHOOK_SECRET = 'whsec_realsig_test_secret';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_realsig';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => body,
    method: 'POST',
    nextUrl: { pathname: '/api/webhooks/stripe' },
  } as unknown as NextRequest;
}

describe('POST /api/webhooks/stripe — real Stripe signature verification', () => {
  // entitlements.user_id is UUID-keyed (Spec 116 N2) — the signed fixture's
  // client_reference_id must be uuid-shaped or the route (correctly) skips
  // the entitlement write as a pre-229 legacy uid.
  const UID_REAL = '00000000-0000-0000-0000-0000000000fe';

  it('accepts a genuinely-signed checkout.session.completed and activates the lead_gen entitlement', async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const payload = JSON.stringify({
      id: 'evt_realsig_1',
      object: 'event',
      type: 'checkout.session.completed',
      created: 1717250000,
      data: { object: { client_reference_id: UID_REAL, customer: 'cus_real' } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_realsig_1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest(payload, { 'stripe-signature': header }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // The entitlements upsert: [user_id, product, status, ...] — OD5-default
    // product on a checkout event (no price data).
    const upsertSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(upsertSql).toContain('INSERT INTO entitlements');
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[0]).toBe(UID_REAL);
    expect(params[1]).toBe('lead_gen');
    expect(params[2]).toBe('active');
  });

  it('rejects a real payload signed with the WRONG secret (400, no DB write)', async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const payload = JSON.stringify({
      id: 'evt_realsig_2',
      object: 'event',
      type: 'checkout.session.completed',
      created: 1717250000,
      data: { object: { client_reference_id: UID_REAL, customer: 'cus_real' } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_attacker_secret' });

    const res = await POST(makeRequest(payload, { 'stripe-signature': header }));

    expect(res.status).toBe(400);
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });
});
