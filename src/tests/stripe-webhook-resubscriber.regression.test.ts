// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §4.2
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3
//
// REGRESSION LOCK (P26 money fix, rewritten for entitlements —
// `.cursor/phase1_plan.md` P1-F5.2 + P1-F5.5c). Two contracts pinned:
//
// 1. RE-SUBSCRIBER: a returning subscriber's ACTIVATING event must claim the
//    (user_id, product) entitlement row even though the row still tracks the
//    old, since-cancelled subscription id — the superseded-subscription fence
//    ($3='active' short-circuit) must never block an activation. The legacy
//    equality-guard bug (activation silently matching 0 rows for a paying
//    returner) must stay dead. (Under W8 one-Customer-per-user the customer
//    id no longer churns, but the SUBSCRIPTION id still does on every
//    re-subscribe — the fence is keyed on sub id now, so the same failure
//    mode would reappear there if the short-circuit were dropped.)
//
// 2. REVERSE-ORDER EVENTS [fold 17]: Stripe does not guarantee delivery
//    order. Two subscription.updated events for the same (user_id, product)
//    processed in REVERSE chronological order (newer event.created processed
//    FIRST) must resolve with the older event rejected — the watermark fence
//    compares the STRIPE EVENT timestamp (EXCLUDED.last_stripe_event_at =
//    event.created), never wall-clock processing time. If a refactor swaps
//    the watermark param to NOW(), the older event's param would carry the
//    LATER wall-clock instant and would win — these assertions fail.
//    (The SQL fence itself is additionally exercised against the live
//    entitlements table by the P1-F3d smoke run.)

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
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';

beforeEach(() => {
  vi.clearAllMocks();
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

const T0 = 1717250000; // 2024-06-01T13:53:20Z
const UID = '00000000-0000-0000-0000-0000000000ab';

function subscriptionEvent(opts: {
  eventId: string;
  subId: string;
  status: string;
  created: number;
  type?: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';
}) {
  return {
    id: opts.eventId,
    type: opts.type ?? 'customer.subscription.updated',
    created: opts.created,
    data: {
      object: {
        id: opts.subId,
        customer: 'cus_stable',
        status: opts.status,
        metadata: { user_id: UID },
      },
    },
  };
}

function upsertCall(n = 0) {
  const calls = fakeClientQuery.mock.calls.filter(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO entitlements'),
  );
  return { sql: (calls[n]?.[0] ?? '') as string, params: (calls[n]?.[1] ?? []) as unknown[] };
}

describe('re-subscriber: activating event claims the row despite a superseded tracked sub id', () => {
  it("the fence short-circuits on $3='active' so a fresh subscription (new sub id) re-activates", async () => {
    // delete → reactivate → re-subscribe topology: the lead_gen row still
    // tracks sub_OLD; the fresh checkout's subscription.created carries
    // sub_NEW. Activation must apply (the row is claimed, sub_NEW stored).
    mockedConstructEvent.mockReturnValueOnce(
      subscriptionEvent({
        eventId: 'evt_resub_1',
        subId: 'sub_NEW',
        status: 'active',
        created: T0,
        type: 'customer.subscription.created',
      }),
    );
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_resub_1' }] }) // dedup
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert applies

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const { sql, params } = upsertCall();
    // The activating short-circuit — WITHOUT it, sub_NEW ≠ sub_OLD would
    // fence out the activation and re-create the P26 locked-out-payer bug.
    expect(sql).toMatch(/\$3 = 'active' OR entitlements\.stripe_subscription_id IS NOT DISTINCT FROM EXCLUDED\.stripe_subscription_id/);
    // The new subscription id is what gets stored (COALESCE new-first).
    expect(sql).toMatch(/stripe_subscription_id = COALESCE\(EXCLUDED\.stripe_subscription_id, entitlements\.stripe_subscription_id\)/);
    expect(params[2]).toBe('active');
    expect(params[3]).toBe('sub_NEW');
  });

  it('a REVOKING event from a superseded subscription is fence-gated (sub-id equality required)', async () => {
    // The period-end .deleted from sub_OLD arrives weeks after the user
    // re-subscribed on sub_NEW. status='expired' does NOT short-circuit the
    // fence, so the SQL requires the row's tracked sub id to match — the
    // mocked 0-row result models the fence rejecting it; the route must
    // treat that as an expected stale delivery (200, no throw).
    mockedConstructEvent.mockReturnValueOnce(
      subscriptionEvent({
        eventId: 'evt_old_deleted',
        subId: 'sub_OLD',
        status: 'canceled',
        created: T0 + 100,
        type: 'customer.subscription.deleted',
      }),
    );
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_old_deleted' }] }) // dedup
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // fence rejects

    const res = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(200);
    const { params } = upsertCall();
    // subscription.deleted classifies to 'expired' — the revoking path.
    expect(params[2]).toBe('expired');
    expect(params[3]).toBe('sub_OLD');
  });
});

describe('reverse-order delivery [fold 17]: older event processed second must lose', () => {
  it('both events carry their OWN event.created as the watermark param — never wall clock', async () => {
    const newer = subscriptionEvent({
      eventId: 'evt_newer',
      subId: 'sub_1',
      status: 'active',
      created: T0 + 500, // chronologically NEWER
    });
    const older = subscriptionEvent({
      eventId: 'evt_older',
      subId: 'sub_1',
      status: 'past_due',
      created: T0, // chronologically OLDER, processed SECOND
    });

    // Process the NEWER event first.
    mockedConstructEvent.mockReturnValueOnce(newer);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_newer' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // applies
    const res1 = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));
    expect(res1.status).toBe(200);

    // Then the OLDER event arrives late (retry/queue delay).
    mockedConstructEvent.mockReturnValueOnce(older);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_older' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // watermark fence rejects
    const res2 = await POST(makeRequest('raw', { 'stripe-signature': 'sig' }));
    expect(res2.status).toBe(200); // stale delivery is EXPECTED, never a retry-500

    const first = upsertCall(0);
    const second = upsertCall(1);

    // The watermark param ($6) is each event's OWN Stripe timestamp. At the
    // moment the older event is processed, wall clock is LATER than both —
    // a NOW()-keyed watermark would let the older event win. The param
    // values prove the fence compares creation order, not processing order.
    expect((first.params[5] as Date).getTime()).toBe((T0 + 500) * 1000);
    expect((second.params[5] as Date).getTime()).toBe(T0 * 1000);
    expect((second.params[5] as Date).getTime()).toBeLessThan((first.params[5] as Date).getTime());

    // And the fence in both statements is the EXCLUDED-vs-row comparison the
    // live table enforces (exercised for real by the P1-F3d smoke run).
    for (const { sql } of [first, second]) {
      expect(sql).toMatch(/entitlements\.last_stripe_event_at IS NULL OR entitlements\.last_stripe_event_at < EXCLUDED\.last_stripe_event_at/);
      expect(sql).not.toMatch(/last_stripe_event_at = NOW\(\)/);
    }

    // The older event's rejection (rowCount 0) rides the same 200 contract.
    expect(second.params[2]).toBe('past_due');
  });
});
