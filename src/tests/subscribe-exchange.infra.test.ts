// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 OD3
//
// POST /api/subscribe/exchange (P26-26B + W8 Stripe-Customer reuse,
// `.cursor/phase1_plan.md` Item 4 / fold 4) — the nonce consumer + Stripe
// checkout-session creator. Pins the money-critical params: mode subscription,
// BOTH linkage fields (client_reference_id AND subscription_data.metadata
// .user_id — half-linkage breaks the webhook contract), price from the
// stripe_price_id_default logic variable, ONE Stripe Customer per user
// forever (create-and-store only when absent; reuse on every later checkout —
// the invoice-event identity bridge), and the indistinguishable-400
// nonce-failure contract.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockSessionsCreate = vi.fn();
const mockCustomersCreate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    customers: { create: mockCustomersCreate },
  })),
}));

const fakeTxQuery = vi.fn(); // client.query inside withTransaction (the DELETE)
const fakeQuery = vi.fn(); // top-level query() (logic var + profile lookups + customer store)
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => fakeQuery(...args),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));

import { POST } from '@/app/api/subscribe/exchange/route';
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';

beforeEach(() => {
  vi.clearAllMocks();
  // The price→product map cache is module-level (~60s TTL) — reset it so each
  // test's logic_variables mock is deterministic ([P1-F6 fold] metadata.product).
  _resetPriceProductMapCacheForTests();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.SUBSCRIBE_CHECKOUT_BASE_URL = 'https://staging.buildo.com/subscribe';
});

function makeRequest(body: unknown): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/subscribe/exchange' },
    headers: { get: () => null },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as NextRequest;
}

const VALID_NONCE = '123e4567-e89b-12d3-a456-426614174000';
const UID = 'uid-exchange-1';

/** Queue the happy-path mocks for a FIRST-EVER checkout (no stored Customer):
 *  consumed nonce, configured price, profile row, Customer create + store,
 *  price→product map read (metadata.product stamp, [P1-F6 fold]). */
function queueFirstCheckout(
  opts: { email?: string | null; storedCustomer?: string | null; productMap?: Record<string, string> } = {},
) {
  const email = opts.email === undefined ? 'user@example.com' : opts.email;
  fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: UID }] });
  fakeQuery.mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }]); // logic var
  fakeQuery.mockResolvedValueOnce([
    { email, stripe_customer_id: opts.storedCustomer ?? null },
  ]); // profile
  if (!opts.storedCustomer) {
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_created_1' });
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: 'cus_created_1' }]); // COALESCE store
  }
  // resolvePriceProduct's cache-miss read of stripe_price_product_map:
  fakeQuery.mockResolvedValueOnce([
    { variable_value_json: opts.productMap ?? { price_live_123: 'lead_gen' } },
  ]);
  mockSessionsCreate.mockResolvedValueOnce({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  });
}

describe('POST /api/subscribe/exchange — happy path', () => {
  it('consumes the nonce, creates-and-stores the Customer (first checkout), and creates a subscription session with BOTH linkage fields + the seeded price', async () => {
    queueFirstCheckout();

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' },
      error: null,
      meta: null,
    });

    // The DELETE-consume: single statement, TTL-guarded, RETURNING user_id.
    const deleteSql = fakeTxQuery.mock.calls[0]?.[0] as string;
    expect(deleteSql).toMatch(/DELETE FROM subscribe_nonces/);
    expect(deleteSql).toMatch(/expires_at > NOW\(\)/);
    expect(deleteSql).toMatch(/RETURNING user_id/);
    expect(fakeTxQuery.mock.calls[0]?.[1]).toEqual([VALID_NONCE]);

    // W8: the Customer is created once, with the user's email + identity metadata.
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { user_id: UID },
    });
    // ...and stored race-safely (COALESCE keeps a concurrent winner's id).
    const storeSql = fakeQuery.mock.calls[2]?.[0] as string;
    expect(storeSql).toMatch(/SET stripe_customer_id = COALESCE\(stripe_customer_id, \$2\)/);
    expect(storeSql).toMatch(/RETURNING stripe_customer_id/);

    // The money-critical session params.
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price_live_123', quantity: 1 }]);
    // BOTH linkage fields — the webhook contract.
    expect(params.client_reference_id).toBe(UID);
    expect(params.subscription_data).toEqual({ metadata: { user_id: UID } });
    // [P1-F6 fold — Gemini MED race] the product is stamped on the session
    // metadata at creation, from the same price→product source of truth the
    // webhook uses — checkout.session.completed activates the right product.
    expect(params.metadata).toEqual({ product: 'lead_gen' });
    // W8: customer, never customer_email (Stripe rejects both together, and
    // email-only sessions mint a fresh Customer per checkout).
    expect(params.customer).toBe('cus_created_1');
    expect('customer_email' in params).toBe(false);
    expect(params.success_url).toBe('https://staging.buildo.com/subscribe/success');
    expect(params.cancel_url).toBe('https://staging.buildo.com/subscribe/cancel');
  });

  it('REUSES the stored Customer on a later checkout — no create call (W8)', async () => {
    queueFirstCheckout({ storedCustomer: 'cus_stored_9' });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(200);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.customer).toBe('cus_stored_9');
  });

  it('two checkouts for the same user land on the SAME stripe_customer_id (fold 4 — the 1:1 identity bridge)', async () => {
    // Checkout #1 (first ever): creates cus_created_1 and stores it.
    queueFirstCheckout();
    const res1 = await POST(makeRequest({ nonce: VALID_NONCE }));
    expect(res1.status).toBe(200);

    // Checkout #2 (e.g. the SECOND product's checkout): the stored id is
    // found and reused — Stripe never mints a second Customer for this user.
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: UID }] });
    fakeQuery.mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }]);
    fakeQuery.mockResolvedValueOnce([
      { email: 'user@example.com', stripe_customer_id: 'cus_created_1' },
    ]);
    // No second map read queued — the module-level ~60s cache from checkout
    // #1 serves the product resolution.
    mockSessionsCreate.mockResolvedValueOnce({ id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' });
    const res2 = await POST(makeRequest({ nonce: VALID_NONCE }));
    expect(res2.status).toBe(200);

    expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
    const c1 = (mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>).customer;
    const c2 = (mockSessionsCreate.mock.calls[1]?.[0] as Record<string, unknown>).customer;
    expect(c1).toBe('cus_created_1');
    expect(c2).toBe('cus_created_1');
  });

  it('creates the Customer without an email when the profile has none', async () => {
    queueFirstCheckout({ email: null });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith({ metadata: { user_id: UID } });
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('customer_email' in params).toBe(false);
    expect(params.customer).toBe('cus_created_1');
  });

  it('a concurrent-first-checkout race loser ADOPTS the winner-stored Customer id', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: UID }] });
    fakeQuery.mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }]);
    fakeQuery.mockResolvedValueOnce([{ email: null, stripe_customer_id: null }]);
    // This request creates cus_loser, but the COALESCE-guarded UPDATE returns
    // the concurrent winner's already-stored id — the session must use THAT.
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_loser' });
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: 'cus_winner' }]);
    fakeQuery.mockResolvedValueOnce([{ variable_value_json: { price_live_123: 'lead_gen' } }]); // map read
    mockSessionsCreate.mockResolvedValueOnce({ id: 'cs_r', url: 'https://checkout.stripe.com/c/r' });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));
    expect(res.status).toBe(200);
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.customer).toBe('cus_winner');
  });

  // [P1-F6 fold — Gemini MED race] a NON-default product's price stamps its
  // OWN product on the session metadata — the webhook activates flight_center
  // directly off checkout.session.completed instead of racing the default.
  it('stamps metadata.product from the price→product map for a non-default product', async () => {
    queueFirstCheckout({
      storedCustomer: 'cus_stored_fc',
      productMap: { price_live_123: 'flight_center' },
    });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(200);
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.metadata).toEqual({ product: 'flight_center' });
  });
});

describe('POST /api/subscribe/exchange — the indistinguishable 400', () => {
  async function expectInvalidNonceShape(res: Response) {
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_NONCE');
    expect(body.error.message).toBe('This checkout link is invalid or has expired.');
    return body;
  }

  it('returns the same 400 for an unknown/consumed/expired nonce (0-row DELETE)', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    await expectInvalidNonceShape(res as unknown as Response);
    // No Stripe call, no config reads — the probe learns nothing further.
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it('returns the IDENTICAL body for a malformed nonce shape (no DB touch)', async () => {
    const res = await POST(makeRequest({ nonce: 'short' }));

    const body = await expectInvalidNonceShape(res as unknown as Response);
    expect(fakeTxQuery).not.toHaveBeenCalled();

    // Cross-check byte-for-byte indistinguishability with the 0-row case.
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res2 = await POST(makeRequest({ nonce: VALID_NONCE }));
    expect(await res2.json()).toEqual(body);
  });

  it('returns 400 INVALID_JSON for a non-JSON body', async () => {
    const res = await POST(makeRequest(new Error('boom')));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/subscribe/exchange — named config 500s', () => {
  it('returns STRIPE_PRICE_NOT_CONFIGURED when the logic variable is still the empty seed', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-3' }] });
    fakeQuery.mockResolvedValueOnce([{ variable_value_json: '' }]); // mig 219 seed state

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('returns STRIPE_PRICE_NOT_CONFIGURED when the row is missing entirely', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-3' }] });
    fakeQuery.mockResolvedValueOnce([]); // no logic_variables row

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
  });

  it('returns STRIPE_NOT_CONFIGURED when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-4' }] });
    fakeQuery.mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }]);

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('STRIPE_NOT_CONFIGURED');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('returns sanitized 500 when the Stripe create call throws (nonce already consumed — documented cost)', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-5' }] });
    fakeQuery
      .mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }])
      .mockResolvedValueOnce([{ email: null, stripe_customer_id: 'cus_5' }])
      .mockResolvedValueOnce([{ variable_value_json: { price_live_123: 'lead_gen' } }]); // map read
    mockSessionsCreate.mockRejectedValueOnce(new Error('stripe upstream SECRET_X1'));

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('SECRET_X1');
  });
});
