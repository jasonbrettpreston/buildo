// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §6
//            docs/specs/03-mobile/95_mobile_user_profiles.md §6.3
//
// P26-26D — delete-time Stripe cancellation battery (period-end per the
// 2026-07-12 ruling — the deleter keeps the paid period):
//   - lists ALL the stored customer's subscriptions and schedules
//     cancel_at_period_end on every non-terminal one (multi-sub case pinned);
//   - loud-non-fatal: a Stripe throw never fails the deletion, but writes the
//     stripe_cancel_failed_at durable marker (mig 220);
//   - no customer id → no Stripe calls at all;
//   - the webhook's deletion-state fence: subscription.updated/deleted arriving
//     after the delete cannot overwrite 'cancelled_pending_deletion'.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSubsList = vi.fn();
const mockSubsUpdate = vi.fn();
const mockedConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { list: mockSubsList, update: mockSubsUpdate },
    webhooks: { constructEvent: mockedConstructEvent },
  })),
}));

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));
const mockQuery = vi.fn();
const fakeTxQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { POST as DELETE_POST } from '@/app/api/user-profile/delete/route';
import { POST as WEBHOOK_POST } from '@/app/api/webhooks/stripe/route';
import { getUserIdFromSession } from '@/lib/auth/get-user';

const mockGetUser = vi.mocked(getUserIdFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
});

function makePOST(pathname: string): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

describe('POST /api/user-profile/delete — Stripe cancel (P26-26D, period-end)', () => {
  it('schedules cancel_at_period_end on EVERY non-terminal subscription (multi-sub)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-del-1');
    // The deletion UPDATE + entitlement fan-out ride the txn client now
    // (fakeTxQuery) — `query` serves only the SELECT (and the marker on
    // failure paths).
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: 'cus_del_1' }]); // SELECT
    mockSubsList.mockResolvedValueOnce({
      data: [
        { id: 'sub_active', status: 'active' },
        { id: 'sub_pastdue', status: 'past_due' },
        { id: 'sub_dead', status: 'canceled' }, // terminal — must be skipped
        { id: 'sub_scheduled', status: 'active', cancel_at_period_end: true }, // already scheduled — idempotent skip
        { id: 'sub_trial', status: 'trialing' },
      ],
    });
    mockSubsUpdate.mockResolvedValue({});

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true }, error: null, meta: null });
    expect(mockSubsList).toHaveBeenCalledWith({
      customer: 'cus_del_1',
      status: 'all',
      limit: 100,
    });
    // Live, not-yet-scheduled subs get cancel_at_period_end; terminal + already
    // scheduled are skipped.
    expect(mockSubsUpdate.mock.calls).toEqual([
      ['sub_active', { cancel_at_period_end: true }],
      ['sub_pastdue', { cancel_at_period_end: true }],
      ['sub_trial', { cancel_at_period_end: true }],
    ]);
    // No failure marker written.
    const markerCalls = mockQuery.mock.calls.filter((c) =>
      String(c[0]).includes('stripe_cancel_failed_at'),
    );
    expect(markerCalls).toHaveLength(0);
  });

  it('a Stripe throw is NON-FATAL but writes the durable stripe_cancel_failed_at marker', async () => {
    mockGetUser.mockResolvedValueOnce('uid-del-2');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: 'cus_del_2' }])
      .mockResolvedValueOnce(undefined); // marker UPDATE
    mockSubsList.mockRejectedValueOnce(new Error('stripe is down'));

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    // Deletion still succeeds — the DB state is authoritative.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true }, error: null, meta: null });

    const markerCall = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('stripe_cancel_failed_at'),
    );
    expect(markerCall).toBeDefined();
    expect(String(markerCall![0])).toMatch(/SET stripe_cancel_failed_at = NOW\(\)/);
    expect(markerCall![1]).toEqual(['uid-del-2']);
  });

  it('a mid-loop update throw also lands the marker (partial cancellation is still debt)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-del-3');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: 'cus_del_3' }])
      .mockResolvedValueOnce(undefined); // marker UPDATE
    mockSubsList.mockResolvedValueOnce({
      data: [
        { id: 'sub_a', status: 'active' },
        { id: 'sub_b', status: 'active' },
      ],
    });
    mockSubsUpdate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('rate limited'));

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    const markerCall = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('stripe_cancel_failed_at'),
    );
    expect(markerCall).toBeDefined();
  });

  it('makes NO Stripe calls when the profile has no customer id', async () => {
    mockGetUser.mockResolvedValueOnce('uid-del-4');
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: null }]);

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(mockSubsUpdate).not.toHaveBeenCalled();
  });
});

describe('webhook deletion-state fence (P26-26D, on the entitlements upsert)', () => {
  const UID_DELETED = '00000000-0000-0000-0000-00000000de1e';

  it('the customer-fallback branch refuses to overwrite cancelled_pending_deletion', async () => {
    // 26D schedules cancel_at_period_end, so Stripe fires subscription.updated
    // now and subscription.deleted at period end. The fence keeps EITHER event
    // from flipping the deletion state to 'active'/'expired' (which would
    // un-block the session route's deletion fence and let a deleted account
    // re-subscribe).
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_postdelete',
      type: 'customer.subscription.deleted',
      created: 1717250000,
      data: { object: { id: 'sub_del_1', customer: 'cus_del_1', status: 'canceled' } },
    });
    fakeTxQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_postdelete' }] }) // dedup
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: UID_DELETED }] }) // customer → user
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // upsert — fence rejects

    const res = await WEBHOOK_POST(
      {
        method: 'POST',
        nextUrl: { pathname: '/api/webhooks/stripe' },
        headers: { get: (n: string) => (n.toLowerCase() === 'stripe-signature' ? 'sig' : null) },
        text: async () => 'raw',
      } as unknown as NextRequest,
    );

    expect(res.status).toBe(200); // Stripe must not retry — 0 rows is expected
    const upsertSql = fakeTxQuery.mock.calls[2]?.[0] as string;
    expect(upsertSql).toContain('INSERT INTO entitlements');
    expect(upsertSql).toMatch(/entitlements\.status IS DISTINCT FROM 'cancelled_pending_deletion'/);
  });

  it('the fence is present on the metadata-primary branch too', async () => {
    mockedConstructEvent.mockReturnValueOnce({
      id: 'evt_postdelete_meta',
      type: 'customer.subscription.created',
      created: 1717250000,
      data: {
        object: {
          id: 'sub_del_9',
          customer: 'cus_del_9',
          status: 'active',
          metadata: { user_id: UID_DELETED },
        },
      },
    });
    fakeTxQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_postdelete_meta' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // upsert — fence rejects

    const res = await WEBHOOK_POST(
      {
        method: 'POST',
        nextUrl: { pathname: '/api/webhooks/stripe' },
        headers: { get: (n: string) => (n.toLowerCase() === 'stripe-signature' ? 'sig' : null) },
        text: async () => 'raw',
      } as unknown as NextRequest,
    );

    expect(res.status).toBe(200);
    const upsertSql = fakeTxQuery.mock.calls[1]?.[0] as string;
    expect(upsertSql).toContain('INSERT INTO entitlements');
    expect(upsertSql).toMatch(/entitlements\.status IS DISTINCT FROM 'cancelled_pending_deletion'/);
  });
});
