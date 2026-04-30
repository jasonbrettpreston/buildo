// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5 + Testing Gates

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockedConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockedConstructEvent },
  })),
}));

const fakeClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeClientQuery }),
  ),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

beforeEach(() => {
  // clearAllMocks (not resetAllMocks) — preserves the Stripe constructor's
  // mockImplementation across tests; reset would wipe it and every test would
  // fall through to the 400 "Invalid signature" branch before reaching the
  // assertion target.
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

describe('POST /api/webhooks/stripe — security', () => {
  it('rejects forged signature strings (400, no UPDATE issued)', async () => {
    mockedConstructEvent.mockImplementationOnce(() => {
      throw new Error('Webhook signature verification failed');
    });

    const res = await POST(makeRequest('forged-payload', { 'stripe-signature': 'totally-fake-sig' }));

    expect(res.status).toBe(400);
    // No DB write should occur
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });

  it('rejects empty payload before signature verification', async () => {
    const res = await POST(makeRequest('', { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(400);
    expect(mockedConstructEvent).not.toHaveBeenCalled();
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });

  it('rejects when stripe-signature header is absent', async () => {
    const res = await POST(makeRequest('valid-payload-no-sig'));
    expect(res.status).toBe(400);
    expect(mockedConstructEvent).not.toHaveBeenCalled();
  });

  it('does not leak raw Stripe error messages on 4xx', async () => {
    const sensitiveDetail = 'OAUTH_SECRET_LEAK_PATTERN';
    mockedConstructEvent.mockImplementationOnce(() => {
      throw new Error(`internal: ${sensitiveDetail}`);
    });

    const res = await POST(makeRequest('payload', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).not.toContain(sensitiveDetail);
  });

  it('does not leak raw error messages on 5xx', async () => {
    const sensitiveDetail = 'INTERNAL_DB_PASSWORD_LEAK';
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test',
      type: 'customer.subscription.created',
      created: 1717250000,
      data: { object: { customer: 'cus_x', status: 'active' } },
    });
    fakeClientQuery.mockRejectedValueOnce(new Error(sensitiveDetail));

    const res = await POST(makeRequest('payload', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain(sensitiveDetail);
  });

  it('idempotency: a replayed event_id is rejected without re-applying', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_replayed',
      type: 'customer.subscription.created',
      created: 1717250000,
      data: { object: { customer: 'cus_x', status: 'active' } },
    });
    // Dedup INSERT collides → rowCount = 0
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest('payload', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    // Dedup attempt only — no UPDATE
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });
});
