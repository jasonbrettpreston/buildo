// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §4.2
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//
// REGRESSION LOCK (P26 — the money fix). Pins the re-subscriber correctness
// contract: a returning subscriber whose stored stripe_customer_id is cus_OLD,
// receiving a metadata.user_id-carrying event that mints cus_NEW, MUST be
// re-activated AND have cus_NEW stored authoritatively. The pre-P26 guard
// (`stripe_customer_id IS NULL OR = $2` + `COALESCE(stripe_customer_id, $2)`)
// silently matched 0 rows (cus_OLD ≠ cus_NEW) and left a paying customer
// locked out. If a future refactor reintroduces either the equality guard or
// the COALESCE-prefer-existing write, this test fails.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockedConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockedConstructEvent },
  })),
}));

// The fake client models a live user_profiles row with a STALE customer id.
// It captures the WHERE clause + params so we can assert the UPDATE would have
// matched the row (guard-free) and would write cus_NEW.
const fakeClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeClientQuery }),
  ),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
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

const FIXED_EVENT_TS_S = 1717250000;

describe('re-subscriber: stored cus_OLD + metadata event carrying cus_NEW', () => {
  it('activates AND stores cus_NEW authoritatively (no customer-id equality guard, no COALESCE)', async () => {
    // A returning subscriber. Stripe mints cus_NEW for the fresh checkout; the
    // subscription carries our metadata.user_id. The stored row still holds
    // cus_OLD from the previous, since-cancelled subscription.
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_resub_1',
      type: 'customer.subscription.created',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          customer: 'cus_NEW',
          status: 'active',
          metadata: { user_id: 'firebase-uid-returning' },
        },
      },
    });
    // Dedup INSERT succeeds; the UPDATE matches the row (1 row) precisely
    // because the equality guard is gone.
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_resub_1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const updateSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];

    // Identity via user_id, not the stale customer id.
    expect(updateSql).toMatch(/WHERE user_id = \$3/);
    // The equality guard that broke re-subscribers must NOT be present.
    expect(updateSql).not.toMatch(/stripe_customer_id IS NULL OR stripe_customer_id = \$2/);
    // cus_NEW is written authoritatively via COALESCE($2, existing) — new-first,
    // so a non-null incoming customer (this event) OVERWRITES cus_OLD (the
    // re-subscriber fix). This is NOT the old broken existing-first
    // COALESCE(stripe_customer_id, $2) which preserved the stale cus_OLD.
    expect(updateSql).toMatch(/stripe_customer_id = COALESCE\(\$2, stripe_customer_id\)/);
    expect(updateSql).not.toMatch(/COALESCE\(stripe_customer_id/);
    // P26-review superseded-subscription fence: activating ('active') events —
    // like this re-subscribe — still claim the customer id ($1='active' short-
    // circuits the guard), so the re-subscriber overwrite is preserved.
    expect(updateSql).toMatch(/\$1 = 'active' OR stripe_customer_id IS NOT DISTINCT FROM \$2/);

    // Activation + the NEW customer id land in params.
    expect(params[0]).toBe('active');
    expect(params[1]).toBe('cus_NEW');
    expect(params[2]).toBe('firebase-uid-returning');
    expect(params[3]).toBeInstanceOf(Date);
  });
});
