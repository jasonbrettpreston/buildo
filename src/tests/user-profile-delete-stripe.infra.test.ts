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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { logError } from '@/lib/logger';

const mockGetUser = vi.mocked(getUserIdFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
});

/** The route first runs the create-if-missing INSERT through `query`, then
 *  reads the row FOR UPDATE inside the transaction (WF3 2026-11-11); the
 *  deletion writes follow on the same transaction client. */
function stubLockedRow(row: { account_deleted_at: string | null; stripe_customer_id: string | null }) {
  mockQuery.mockResolvedValueOnce([]); // INSERT ... ON CONFLICT (user_id) DO NOTHING
  fakeTxQuery
    .mockResolvedValueOnce({ rowCount: 1, rows: [row] }) // SELECT ... FOR UPDATE
    .mockResolvedValue({ rowCount: 1, rows: [] }); // deletion writes
}

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
    // The locked SELECT, the deletion UPDATE and the entitlement fan-out ride
    // the txn client (fakeTxQuery) — `query` serves only the create-if-missing
    // INSERT (and the marker on failure paths).
    stubLockedRow({ account_deleted_at: null, stripe_customer_id: 'cus_del_1' });
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
    stubLockedRow({ account_deleted_at: null, stripe_customer_id: 'cus_del_2' });
    mockQuery.mockResolvedValueOnce(undefined); // marker UPDATE
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
    stubLockedRow({ account_deleted_at: null, stripe_customer_id: 'cus_del_3' });
    mockQuery.mockResolvedValueOnce(undefined); // marker UPDATE
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
    stubLockedRow({ account_deleted_at: null, stripe_customer_id: null });

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(mockSubsUpdate).not.toHaveBeenCalled();
  });
});

// WF3 2026-11-11 (MF-52 D-1 a, MF-47 D-4; panel security F1 + F6). The mocks
// are keyed by SQL text, not call order, so the same cases run against the
// old route (unlocked SELECT before the transaction) and the fixed one
// (create-if-missing, then a locked read inside the transaction).
describe('POST /api/user-profile/delete — no user_profiles row; subscription with no stored customer', () => {
  const UID_NOROW = '00000000-0000-0000-0000-0000000d0e01';
  const UID_SUBONLY = '00000000-0000-0000-0000-0000000d0e02';

  // The SQL-keyed implementations below must not leak into later describes
  // (clearAllMocks clears calls, not implementations).
  afterEach(() => {
    mockQuery.mockReset();
    fakeTxQuery.mockReset();
  });

  function stubDb(opts: {
    rowBeforeInsert: { account_deleted_at: string | null; stripe_customer_id: string | null } | null;
    subscriptionId: string | null;
  }) {
    let row = opts.rowBeforeInsert;
    mockQuery.mockImplementation(async (sql: string) => {
      if (/INSERT INTO user_profiles/.test(sql)) {
        row ??= { account_deleted_at: null, stripe_customer_id: null };
        return [];
      }
      if (/SELECT account_deleted_at, stripe_customer_id FROM user_profiles/.test(sql)) {
        return row ? [row] : [];
      }
      return undefined; // marker UPDATE (Stripe-failure path)
    });
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (/FROM user_profiles/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (/FROM entitlements/.test(sql)) {
        return opts.subscriptionId
          ? { rowCount: 1, rows: [{ stripe_subscription_id: opts.subscriptionId }] }
          : { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
  }

  function markerWrites(uid: string) {
    return [...mockQuery.mock.calls, ...fakeTxQuery.mock.calls].filter((c) => {
      const sql = String(c[0]);
      const params = (c[1] ?? []) as unknown[];
      return (
        /UPDATE user_profiles/.test(sql) &&
        /stripe_cancel_failed_at\s*=/.test(sql) &&
        params[0] === uid &&
        (params.length === 1 || params[1] === true)
      );
    });
  }

  it('creates the missing row, reads it locked, and deletes (200, not 404)', async () => {
    mockGetUser.mockResolvedValueOnce(UID_NOROW);
    stubDb({ rowBeforeInsert: null, subscriptionId: null });

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true }, error: null, meta: null });
    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO user_profiles/.test(String(c[0])));
    expect(insert).toBeDefined();
    expect(String(insert![0])).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/);
    expect(insert![1]).toEqual([UID_NOROW]);
    const locked = fakeTxQuery.mock.calls.find(
      (c) => /FROM user_profiles/.test(String(c[0])) && /FOR UPDATE/.test(String(c[0])),
    );
    expect(locked).toBeDefined();
    const flag = fakeTxQuery.mock.calls.find((c) => /SET account_deleted_at = NOW\(\)/.test(String(c[0])));
    expect(flag).toBeDefined();
    expect(markerWrites(UID_NOROW)).toHaveLength(0);
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('a subscription with no stored customer sets stripe_cancel_failed_at and logs, so the operator sweep picks it up', async () => {
    mockGetUser.mockResolvedValueOnce(UID_SUBONLY);
    stubDb({
      rowBeforeInsert: { account_deleted_at: null, stripe_customer_id: null },
      subscriptionId: 'sub_orphan_1',
    });

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(markerWrites(UID_SUBONLY)).toHaveLength(1);
    expect(vi.mocked(logError)).toHaveBeenCalledWith(
      '[user-profile/delete]',
      expect.anything(),
      expect.objectContaining({ uid: UID_SUBONLY, stripe_subscription_id: 'sub_orphan_1' }),
    );
    // No customer to cancel against: no Stripe call.
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('no subscription and no customer: no marker (nothing is billing)', async () => {
    mockGetUser.mockResolvedValueOnce(UID_SUBONLY);
    stubDb({
      rowBeforeInsert: { account_deleted_at: null, stripe_customer_id: null },
      subscriptionId: null,
    });

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(markerWrites(UID_SUBONLY)).toHaveLength(0);
  });

  it('a second POST after the row was created and deleted is the idempotent 200 (no second write)', async () => {
    mockGetUser.mockResolvedValueOnce(UID_NOROW);
    stubDb({
      rowBeforeInsert: { account_deleted_at: '2026-11-11T00:00:00Z', stripe_customer_id: null },
      subscriptionId: 'sub_orphan_2',
    });

    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));

    expect(res.status).toBe(200);
    expect(fakeTxQuery.mock.calls.some((c) => /^\s*UPDATE/.test(String(c[0])))).toBe(false);
    expect(markerWrites(UID_NOROW)).toHaveLength(0);
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
