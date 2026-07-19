// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §6.4 (Reactivation)
//            docs/specs/02-web-admin/20_stripe_web_checkout.md §4.2, §6
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3
//
// WF3 (2026-07-14, ruling — review_followups "New-agent empirical validation" D3):
// under PERIOD-END delete the subscription stays LIVE until period end, so a
// within-window reactivation must restore the user's REAL live status — now
// PER PRODUCT (deriveEffectiveStripeStatusByProduct, the money-loop SSOT;
// `.cursor/phase1_plan.md` Item 4 W4) — onto the entitlements rows.
// LOUD-NON-FATAL: any Stripe failure/unconfigured falls back to the expired
// catch-all and never blocks reactivation. Manufacturer is comp/admin_managed
// and skips Stripe entirely. cancel_at_period_end is NOT cleared (no
// un-cancel — access lasts the remaining paid period, then lapses via the
// period-end webhook).
//
// The real getStripeClient + per-product derive run against a mocked Stripe
// SDK (mirrors user-profile-delete-stripe.infra.test.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSubsList = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { list: mockSubsList },
  })),
}));

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));
const mockQuery = vi.fn();
const fakeTxQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { POST as REACTIVATE_POST } from '@/app/api/user-profile/reactivate/route';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { logError } from '@/lib/logger';
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';

const mockGetUser = vi.mocked(getUserIdFromSession);
const mockLogError = vi.mocked(logError);

// entitlements is UUID-keyed — the per-product restore no-ops on non-uuid uids.
const UID = '00000000-0000-0000-0000-00000000ac71';

beforeEach(() => {
  vi.clearAllMocks();
  _resetPriceProductMapCacheForTests();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
});

function makePOST(): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/user-profile/reactivate' },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

const RECENT_DELETE = new Date(Date.now() - 3 * 86_400_000).toISOString();

/** Stub the txn: entitlement writes no-op; the joined SELECT returns `row`. */
function stubTxn(row: Record<string, unknown>) {
  fakeTxQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('LEFT JOIN entitlements')) return { rowCount: 1, rows: [row] };
    return { rowCount: 1, rows: [] };
  });
}

/** The per-product restore UPDATE calls (status param $3). */
function perProductRestoreCalls() {
  return fakeTxQuery.mock.calls.filter(
    (c) => String(c[0]).includes('UPDATE entitlements') && String(c[0]).includes('SET status = $3'),
  );
}

/** The catch-all UPDATE (deletion-stuck rows → expired). */
function catchAllCall() {
  return fakeTxQuery.mock.calls.find(
    (c) => String(c[0]).includes(`status = 'cancelled_pending_deletion'`),
  );
}

describe('POST /api/user-profile/reactivate — per-product live Stripe restore (W4)', () => {
  it('a LIVE active sub restores the lead_gen entitlement to active (within the paid period)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r1' },
    ]);
    // cancel_at_period_end scheduled, but Stripe status is still 'active' until
    // period end. No price on the fixture → OD5-default product lead_gen.
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r1', status: 'active', cancel_at_period_end: true }] });
    stubTxn({ subscription_status: 'active', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).toHaveBeenCalledWith({ customer: 'cus_r1', status: 'all', limit: 100 });
    const restores = perProductRestoreCalls();
    expect(restores).toHaveLength(1);
    expect(restores[0]![1]).toEqual([UID, 'lead_gen', 'active']);
    const body = (await res.json()) as { data: { subscription_status: string } };
    expect(body.data.subscription_status).toBe('active');
    // Load-bearing clauses (Chesterton's Fence — Regression Guardian +
    // Code Reviewer): the out-of-order watermark is RE-STAMPED to NOW() (NOT
    // cleared to NULL, which would disable the webhook's out-of-order guard on
    // the same-subscription live-restore path) on BOTH the per-product restore
    // and the catch-all; the moot cancel-debt marker is cleared on the profile.
    expect(String(restores[0]![0])).toMatch(/last_stripe_event_at = NOW\(\)/);
    expect(String(catchAllCall()![0])).toMatch(/last_stripe_event_at = NOW\(\)/);
    const profileUpdate = fakeTxQuery.mock.calls.find((c) =>
      String(c[0]).includes('account_deleted_at = NULL'),
    );
    expect(String(profileUpdate![0])).toMatch(/stripe_cancel_failed_at = NULL/);
    // The retired user_profiles columns are never written here (grep gate).
    expect(String(profileUpdate![0])).not.toContain('subscription_status');
  });

  it('a past_due live sub restores past_due (routed to portal to fix payment)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r2' },
    ]);
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r2', status: 'past_due' }] });
    stubTxn({ subscription_status: 'past_due', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(perProductRestoreCalls()[0]![1]).toEqual([UID, 'lead_gen', 'past_due']);
  });

  it('no live sub (all cancelled) → the catch-all flips deletion-stuck rows to expired', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r3' },
    ]);
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r3', status: 'canceled' }] });
    stubTxn({ subscription_status: 'expired', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    // 'canceled' maps to expired for the group — the per-product UPDATE writes
    // 'expired'; the catch-all also runs. Either way nothing stays stuck.
    expect(catchAllCall()).toBeDefined();
    expect(String(catchAllCall()![0])).toContain(`SET status = 'expired'`);
  });

  it('a Stripe throw is NON-FATAL — reactivation succeeds, catch-all applies + logs', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r4' },
    ]);
    mockSubsList.mockRejectedValueOnce(new Error('stripe is down'));
    stubTxn({ subscription_status: 'expired', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(perProductRestoreCalls()).toHaveLength(0); // no live statuses derived
    expect(catchAllCall()).toBeDefined(); // deletion-stuck rows still resolve
    expect(mockLogError).toHaveBeenCalled();
  });

  it('Stripe UNCONFIGURED (no secret key) is NON-FATAL — catch-all applies', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r5' },
    ]);
    stubTxn({ subscription_status: 'expired', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(catchAllCall()).toBeDefined();
  });

  it('makes NO Stripe call when the profile has no customer id (catch-all restores expired)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: null },
    ]);
    stubTxn({ subscription_status: 'expired', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(catchAllCall()).toBeDefined();
  });

  it('manufacturer restores admin_managed on lead_gen and NEVER calls Stripe (even with a customer id)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: RECENT_DELETE, account_preset: 'manufacturer', stripe_customer_id: 'cus_r7' },
    ]);
    stubTxn({ subscription_status: 'admin_managed', account_deleted_at: null });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    const upsert = fakeTxQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO entitlements'));
    expect(upsert).toBeDefined();
    expect(upsert![1]).toEqual([UID, 'lead_gen', 'admin_managed']);
  });
});
