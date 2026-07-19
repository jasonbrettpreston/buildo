// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5
//
// Entitlements rewrite (`.cursor/phase1_plan.md` P1-F5.2): the webhook now
// upserts per-product `entitlements` rows instead of updating
// user_profiles.subscription_status. These tests exercise the REAL module SQL
// (route + @/lib/entitlements helpers) against a mocked transaction client.

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
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';

beforeEach(() => {
  // clearAllMocks (not resetAllMocks) — `reset` wipes the Stripe constructor's
  // mockImplementation that wires `new Stripe(...)` → `{ webhooks: { constructEvent } }`,
  // which would make every test fail signature verification with a 400.
  vi.clearAllMocks();
  // The price→product map cache is module-level (~60s TTL) — reset it so each
  // test's logic_variables mock (or absence of one) is deterministic.
  _resetPriceProductMapCacheForTests();
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
// entitlements.user_id is UUID (FK auth.users) — fixtures must be uuid-shaped.
const UID_A = '00000000-0000-0000-0000-00000000000a';

const baseSubscriptionEvent = (status: string) => ({
  id: 'evt_test_123',
  type: 'customer.subscription.created' as const,
  created: FIXED_EVENT_TS_S,
  data: { object: { id: 'sub_test_1', customer: 'cus_test_abc', status } },
});

/** The dedup INSERT succeeds (fresh event). */
function mockDedupHit() {
  fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt' }] });
}

/** The customer-id fallback SELECT resolves to UID_A. */
function mockCustomerResolves(uid: string = UID_A) {
  fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: uid }] });
}

function upsertCall() {
  const call = fakeClientQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO entitlements'),
  );
  return { sql: (call?.[0] ?? '') as string, params: (call?.[1] ?? []) as unknown[] };
}

describe('POST /api/webhooks/stripe — 200 happy paths', () => {
  it('upserts a lead_gen entitlement "active" on subscription.created (metadata.user_id path)', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      ...baseSubscriptionEvent('active'),
      data: {
        object: {
          id: 'sub_test_1',
          customer: 'cus_test_abc',
          status: 'active',
          metadata: { user_id: UID_A },
        },
      },
    });
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // entitlements upsert

    const res = await POST(makeRequest('raw-body', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    // The upsert carries [user_id, product, status, stripe_subscription_id,
    // current_period_end, event_created_at]. No price on the fixture →
    // OD5-default product 'lead_gen'.
    const { sql, params } = upsertCall();
    expect(sql).toContain('INSERT INTO entitlements');
    expect(sql).toContain('ON CONFLICT (user_id, product) DO UPDATE');
    expect(params[0]).toBe(UID_A);
    expect(params[1]).toBe('lead_gen');
    expect(params[2]).toBe('active');
    expect(params[3]).toBe('sub_test_1');
    // fold 17: the watermark param is the STRIPE EVENT timestamp, never NOW().
    expect(params[5]).toBeInstanceOf(Date);
    expect((params[5] as Date).getTime()).toBe(FIXED_EVENT_TS_S * 1000);
  });

  it('writes "past_due" on invoice.payment_failed via the customer-id fallback', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_pd',
      type: 'invoice.payment_failed',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_test_pd' } },
    });
    mockDedupHit();
    mockCustomerResolves();
    // No parent.subscription_details on the fixture → no entitlements-by-sub
    // lookup query; falls back to lead_gen with a WARN.
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    // The fallback SELECT resolves user_id from stripe_customer_id.
    const lookupSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(lookupSql).toMatch(/SELECT user_id FROM user_profiles WHERE stripe_customer_id = \$1/);
    expect(fakeClientQuery.mock.calls[1]?.[1]).toEqual(['cus_test_pd']);
    const { params } = upsertCall();
    expect(params[0]).toBe(UID_A);
    expect(params[1]).toBe('lead_gen');
    expect(params[2]).toBe('past_due');
  });

  it('invoice events resolve their product via entitlements.stripe_subscription_id (no Stripe round-trip)', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_inv_prod',
      type: 'invoice.payment_succeeded',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          customer: 'cus_multi',
          parent: { subscription_details: { subscription: 'sub_flight_9' } },
        },
      },
    });
    mockDedupHit();
    mockCustomerResolves();
    // entitlements-by-subscription lookup → the flight_center row tracks it.
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ product: 'flight_center' }] });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const bySubSql = fakeClientQuery.mock.calls[2]?.[0] as string;
    expect(bySubSql).toMatch(/SELECT product FROM entitlements WHERE stripe_subscription_id = \$1/);
    const { params } = upsertCall();
    expect(params[1]).toBe('flight_center');
    expect(params[2]).toBe('active');
    expect(params[3]).toBe('sub_flight_9');
  });

  it('writes "expired" on subscription.deleted', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_test_del',
      type: 'customer.subscription.deleted',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          id: 'sub_test_del',
          customer: 'cus_test_del',
          status: 'canceled',
          metadata: { user_id: UID_A },
        },
      },
    });
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const { params } = upsertCall();
    expect(params[2]).toBe('expired');
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
    // Only the dedup INSERT happened, no entitlement write
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 200 no-op for subscription.updated with status != active', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_incomplete',
      type: 'customer.subscription.updated',
      created: FIXED_EVENT_TS_S,
      data: { object: { id: 'sub_x', customer: 'cus_x', status: 'incomplete' } },
    });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_incomplete' }] });

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    // Dedup write happened, but no upsert because outcome.newStatus is null
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('upsert preserves all three fences: event-ordering, deletion, superseded-subscription', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      ...baseSubscriptionEvent('active'),
      data: {
        object: { id: 'sub_test_1', customer: 'cus_test_abc', status: 'active', metadata: { user_id: UID_A } },
      },
    });
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    const { sql } = upsertCall();
    // 1. Out-of-order fence — per (user_id, product) watermark vs EXCLUDED
    //    (the Stripe event timestamp), never wall clock [fold 17].
    expect(sql).toMatch(/entitlements\.last_stripe_event_at IS NULL OR entitlements\.last_stripe_event_at < EXCLUDED\.last_stripe_event_at/);
    // 2. Deletion fence (P26-26D) — a deleted account's row is never revived.
    expect(sql).toMatch(/entitlements\.status IS DISTINCT FROM 'cancelled_pending_deletion'/);
    // 3. Superseded-subscription fence — keyed on stripe_subscription_id
    //    equality now (per-product: one customer can hold N concurrent subs;
    //    plan Item 4 W1 meaning change). Activating events still claim the row.
    expect(sql).toMatch(/\$3 = 'active' OR entitlements\.stripe_subscription_id IS NOT DISTINCT FROM EXCLUDED\.stripe_subscription_id/);
    // The tracked sub id survives customer-less/sub-less events via COALESCE.
    expect(sql).toMatch(/stripe_subscription_id = COALESCE\(EXCLUDED\.stripe_subscription_id, entitlements\.stripe_subscription_id\)/);
  });

  it('activates on checkout.session.completed via client_reference_id → user_id (OD5-default product)', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_checkout_done',
      type: 'checkout.session.completed',
      created: FIXED_EVENT_TS_S,
      data: {
        object: {
          client_reference_id: UID_A,
          customer: 'cus_checkout_1',
          subscription: 'sub_from_checkout',
        },
      },
    });
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const { params } = upsertCall();
    expect(params[0]).toBe(UID_A);
    // checkout carries no price data → OD5 default; subscription.created is
    // the authoritative corrector (plan Item 4 price-mapping design).
    expect(params[1]).toBe('lead_gen');
    expect(params[2]).toBe('active');
    expect(params[3]).toBe('sub_from_checkout');
  });
});

describe('POST /api/webhooks/stripe — price → product fan-out (OD3)', () => {
  const subWithPrice = (priceId: string) => ({
    id: 'evt_fanout',
    type: 'customer.subscription.created' as const,
    created: FIXED_EVENT_TS_S,
    data: {
      object: {
        id: 'sub_fanout_1',
        customer: 'cus_fanout',
        status: 'active',
        metadata: { user_id: UID_A },
        items: { data: [{ price: { id: priceId }, current_period_end: FIXED_EVENT_TS_S + 86_400 }] },
      },
    },
  });

  it('a mapped price writes its mapped product (stripe_price_product_map)', async () => {
    mockedConstructEvent.mockReturnValueOnce(subWithPrice('price_flight'));
    mockDedupHit();
    // resolvePriceProduct's cache-miss read of logic_variables:
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ variable_value_json: { price_flight: 'flight_center' } }],
    });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const mapSql = fakeClientQuery.mock.calls[1]?.[0] as string;
    expect(mapSql).toContain(`variable_key = 'stripe_price_product_map'`);
    const { params } = upsertCall();
    expect(params[1]).toBe('flight_center');
    // Net-new N2 column: current_period_end from the subscription item
    // (Stripe v18+ moved it off the Subscription object), Unix s → Date.
    expect(params[4]).toBeInstanceOf(Date);
    expect((params[4] as Date).getTime()).toBe((FIXED_EVENT_TS_S + 86_400) * 1000);
  });

  it('an unmapped price falls back to lead_gen (OD5 default, WARN — never an error)', async () => {
    mockedConstructEvent.mockReturnValueOnce(subWithPrice('price_unmapped'));
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ variable_value_json: {} }] });
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    const { params } = upsertCall();
    expect(params[1]).toBe('lead_gen');
  });
});

describe('POST /api/webhooks/stripe — identity edge cases', () => {
  it('200 + no entitlement write when the customer id resolves no user', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_orphan',
      type: 'invoice.payment_failed',
      created: FIXED_EVENT_TS_S,
      data: { object: { customer: 'cus_unknown' } },
    });
    mockDedupHit();
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no user match

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(upsertCall().sql).toBe('');
  });

  it('200 + no entitlement write when the resolved user id is not uuid-shaped (pre-229 legacy uid)', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_legacy',
      type: 'customer.subscription.created',
      created: FIXED_EVENT_TS_S,
      data: {
        object: { id: 'sub_l', customer: 'cus_l', status: 'active', metadata: { user_id: 'firebase-uid-legacy' } },
      },
    });
    mockDedupHit();

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));

    expect(res.status).toBe(200);
    expect(upsertCall().sql).toBe('');
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
    // Only the dedup INSERT was attempted — nothing else on the second pass
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
