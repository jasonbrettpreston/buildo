// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Stripe is mocked at the module level. constructEvent returns a fake Event
// when the test sets up `mockedConstructEvent.mockReturnValueOnce(...)`, or
// throws when the test sets `mockedConstructEvent.mockImplementationOnce(() => { throw ... })`.
const mockedConstructEvent = vi.fn();
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: { constructEvent: mockedConstructEvent },
    })),
  };
});

// withTransaction passthrough — the test inspects the inner queries via the
// fakeClient.query mock. Mirrors the api-leads-view.infra pattern.
const fakeClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeClientQuery }),
  ),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

beforeEach(() => {
  // clearAllMocks (not resetAllMocks) — `reset` wipes the Stripe constructor's
  // mockImplementation that wires `new Stripe(...)` → `{ webhooks: { constructEvent } }`,
  // which would make every test fail signature verification with a 400.
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

const FIXED_EVENT_TS_S = 1717250000; // 2024-06-01T13:53:20Z
const baseSubscriptionEvent = (status: string) => ({
  id: 'evt_test_123',
  type: 'customer.subscription.created' as const,
  created: FIXED_EVENT_TS_S,
  data: { object: { customer: 'cus_test_abc', status } },
});

describe('POST /api/webhooks/stripe — 200 happy paths', () => {
  it('writes subscription_status="active" on subscription.created with status=active', async () => {
    mockedConstructEvent.mockReturnValueOnce(baseSubscriptionEvent('active'));
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_123' }] }) // INSERT dedup
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE user_profiles

    const res = await POST(makeRequest('raw-body', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    // Verify the UPDATE was issued with the right status, customer id,
    // and event timestamp (params: [status, customer_id, event_created_at]
    // for the stripe_customer_id fallback path — no metadata.user_id here).
    const updateCall = fakeClientQuery.mock.calls[1];
    expect(updateCall).toBeDefined();
    expect(updateCall?.[0]).toContain('UPDATE user_profiles');
    const params = updateCall?.[1] as unknown[];
    expect(params[0]).toBe('active');
    expect(params[1]).toBe('cus_test_abc');
    expect(params[2]).toBeInstanceOf(Date);
    // Confirm the event timestamp is preserved through the conversion
    expect((params[2] as Date).getTime()).toBe(FIXED_EVENT_TS_S * 1000);
  });

  it('writes "past_due" on invoice.payment_failed', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_pd',
      type: 'invoice.payment_failed',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_test_pd' } },
    });
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_pd' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[0]).toBe('past_due');
    expect(params[1]).toBe('cus_test_pd');
  });

  it('writes "expired" on subscription.deleted', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_del',
      type: 'customer.subscription.deleted',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_test_del', status: 'canceled' } },
    });
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_del' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[0]).toBe('expired');
  });

  it('returns 200 no-op for unknown event types', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_unknown',
      type: 'customer.discount.created',
      created: FIXED_EVENT_TS_S,
      data: { object: {} },
    });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_unknown' }] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // Only the dedup INSERT happened, no UPDATE
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 200 no-op for subscription.updated with status != active', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_incomplete',
      type: 'customer.subscription.updated',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_x', status: 'incomplete' } },
    });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_incomplete' }] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    // Dedup write happened, but no UPDATE because outcome.newStatus is null
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('UPDATE includes event-ordering guard (last_stripe_event_at < event.created)', async () => {
    // Out-of-order delivery guard: Stripe doesn't guarantee event order.
    // The UPDATE WHERE clause must reject events older than the most
    // recently applied one to prevent expired→active resurrection.
    mockedConstructEvent.mockReturnValueOnce(baseSubscriptionEvent('active'));
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_123' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    const updateSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(updateSql).toMatch(/last_stripe_event_at IS NULL OR last_stripe_event_at <\s+\$\d/);
  });

  it('user_id path writes customer id AUTHORITATIVELY and drops the customer-id equality guard (P26 re-subscriber fix)', async () => {
    // P26: the previous customer-id equality guard on the user_id path
    // (`stripe_customer_id IS NULL OR = $2`) broke re-subscribers — a returning
    // customer gets a NEW cus_ id that never matches the stored one, so
    // activation silently matched 0 rows. The fence against metadata.user_id
    // forgery is now that only OUR checkout route can set metadata.user_id /
    // client_reference_id; the customer id is written authoritatively so a
    // re-subscribe overwrites cus_OLD with cus_NEW.
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_meta',
      type: 'customer.subscription.created',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          customer: 'cus_test_abc',
          status: 'active',
          metadata: { user_id: 'firebase-uid-xyz' },
        },
      },
    });
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_test_meta' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    const updateSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(updateSql).toMatch(/WHERE user_id = \$\d/);
    // The customer-id equality guard must be GONE from the user_id path.
    expect(updateSql).not.toMatch(/stripe_customer_id IS NULL OR stripe_customer_id = \$\d/);
    // Customer id written via COALESCE($2, existing): authoritative when the
    // event carries a customer (re-subscriber — cus_NEW overwrites cus_OLD,
    // since this event is 'active' with a non-null $2), but never NULLs the
    // stored id on a customer-less event (P26 review — Gemini HIGH).
    expect(updateSql).toMatch(/stripe_customer_id = COALESCE\(\$2, stripe_customer_id\)/);
    // Superseded-subscription fence (P26 review — Reality-Check CRITICAL): an
    // activating ('active') event still claims the customer; a revoking event
    // only applies when the event's customer matches the current stored one, so
    // a stale terminal event from an old sub can't downgrade a re-subscriber.
    expect(updateSql).toMatch(/\$1 = 'active' OR stripe_customer_id IS NOT DISTINCT FROM \$2/);
    // The out-of-order guard stays.
    expect(updateSql).toMatch(/last_stripe_event_at IS NULL OR last_stripe_event_at <\s+\$\d/);
    // Params order on user_id path: [status, customer_id, user_id, event_created_at]
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[2]).toBe('firebase-uid-xyz');
    expect(params[3]).toBeInstanceOf(Date);
  });

  it('activates on checkout.session.completed via client_reference_id → user_id (routes the metadata-primary UPDATE)', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_checkout_done',
      type: 'checkout.session.completed',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          client_reference_id: 'firebase-uid-abc',
          customer: 'cus_checkout_1',
        },
      },
    });
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_checkout_done' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const updateSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(updateSql).toMatch(/WHERE user_id = \$\d/);
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[0]).toBe('active');
    expect(params[1]).toBe('cus_checkout_1');
    expect(params[2]).toBe('firebase-uid-abc');
  });

  it('flips past_due → active on invoice.payment_succeeded via the customer-id fallback', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_pay_ok',
      type: 'invoice.payment_succeeded',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_recovered' } },
    });
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_pay_ok' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const updateSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    // No metadata.user_id on an invoice → customer-id fallback branch.
    expect(updateSql).toMatch(/WHERE stripe_customer_id = \$\d/);
    const params = fakeClientQuery.mock.calls[1]?.[1] as unknown[];
    expect(params[0]).toBe('active');
    expect(params[1]).toBe('cus_recovered');
  });
});

describe('POST /api/webhooks/stripe — idempotency', () => {
  it('returns 200 without re-applying when the event id was already processed', async () => {
    mockedConstructEvent.mockReturnValueOnce(baseSubscriptionEvent('active'));
    // Dedup INSERT collides — rowCount === 0 means already processed
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // Only the dedup INSERT was attempted — no UPDATE on the second pass
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/webhooks/stripe — 400 / 500', () => {
  it('returns 400 when Stripe-Signature header is missing', async () => {
    const res = await POST(makeRequest('raw'));
    expect(res.status).toBe(400);
    expect(mockedConstructEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the signature fails verification', async () => {
    mockedConstructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'forged' }));
    expect(res.status).toBe(400);
    // Defensive: the raw Stripe error message must not leak in the response body
    const body = await res.text();
    expect(body).not.toContain('No signatures found matching');
  });

  it('returns 400 on empty body', async () => {
    const res = await POST(makeRequest('', { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(400);
    expect(mockedConstructEvent).not.toHaveBeenCalled();
  });

  it('returns 413 when payload exceeds the 1MB DoS cap', async () => {
    // Public endpoint — without an upper-bound check, an attacker can POST
    // multi-GB bodies and exhaust server memory before signature verify.
    // Stripe payloads are well under 100KB; 1MB is generous headroom.
    const huge = 'x'.repeat(1_048_577);
    const res = await POST(makeRequest(huge, { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(413);
    expect(mockedConstructEvent).not.toHaveBeenCalled();
  });

  it('returns 500 with sanitized envelope when DB transaction throws', async () => {
    mockedConstructEvent.mockReturnValueOnce(baseSubscriptionEvent('active'));
    fakeClientQuery.mockRejectedValueOnce(new Error('connection terminated SECRET_DETAIL_X9'));

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('SECRET_DETAIL_X9');
  });
});
