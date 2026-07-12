// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//
// POST /api/subscribe/exchange (P26-26B) — the nonce consumer + Stripe
// checkout-session creator. Pins the money-critical params: mode subscription,
// BOTH linkage fields (client_reference_id AND subscription_data.metadata
// .user_id — half-linkage breaks the webhook contract), price from the
// stripe_price_id_default logic variable, and the indistinguishable-400
// nonce-failure contract.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockSessionsCreate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
  })),
}));

const fakeTxQuery = vi.fn(); // client.query inside withTransaction (the DELETE)
const fakeQuery = vi.fn(); // top-level query() (logic var + email lookups)
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => fakeQuery(...args),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));

import { POST } from '@/app/api/subscribe/exchange/route';

beforeEach(() => {
  vi.clearAllMocks();
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

/** Queue the happy-path mocks: consumed nonce, configured price, email row. */
function queueHappyPath() {
  fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-exchange-1' }] });
  fakeQuery
    .mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }]) // logic var
    .mockResolvedValueOnce([{ email: 'user@example.com' }]); // email
  mockSessionsCreate.mockResolvedValueOnce({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  });
}

describe('POST /api/subscribe/exchange — happy path', () => {
  it('consumes the nonce and creates a subscription-mode session with BOTH linkage fields + the seeded price', async () => {
    queueHappyPath();

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

    // The money-critical session params.
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price_live_123', quantity: 1 }]);
    // BOTH linkage fields — the webhook contract.
    expect(params.client_reference_id).toBe('uid-exchange-1');
    expect(params.subscription_data).toEqual({ metadata: { user_id: 'uid-exchange-1' } });
    expect(params.customer_email).toBe('user@example.com');
    expect(params.success_url).toBe('https://staging.buildo.com/subscribe/success');
    expect(params.cancel_url).toBe('https://staging.buildo.com/subscribe/cancel');
  });

  it('omits customer_email when the profile has none', async () => {
    fakeTxQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'uid-2' }] });
    fakeQuery
      .mockResolvedValueOnce([{ variable_value_json: 'price_live_123' }])
      .mockResolvedValueOnce([{ email: null }]);
    mockSessionsCreate.mockResolvedValueOnce({ id: 'cs_2', url: 'https://checkout.stripe.com/c/2' });

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(200);
    const params = mockSessionsCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('customer_email' in params).toBe(false);
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
      .mockResolvedValueOnce([{ email: null }]);
    mockSessionsCreate.mockRejectedValueOnce(new Error('stripe upstream SECRET_X1'));

    const res = await POST(makeRequest({ nonce: VALID_NONCE }));

    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('SECRET_X1');
  });
});
