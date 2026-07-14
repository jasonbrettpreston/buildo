// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §6.4 (Reactivation)
//            docs/specs/02-web-admin/20_stripe_web_checkout.md §4.2, §6
//
// WF3 (2026-07-14, ruling — review_followups "New-agent empirical validation" D3):
// under PERIOD-END delete the subscription stays LIVE until period end, so a
// within-window reactivation must restore the user's REAL live status
// (deriveEffectiveStripeStatus — the money-loop SSOT), not force 'expired'.
// LOUD-NON-FATAL: any Stripe failure/unconfigured falls back to 'expired' and
// never blocks reactivation. Manufacturer is comp/admin_managed and skips
// Stripe entirely. cancel_at_period_end is NOT cleared (no un-cancel — access
// lasts the remaining paid period, then lapses via the period-end webhook).
//
// The real getStripeClient + deriveEffectiveStripeStatus run against a mocked
// Stripe SDK (mirrors user-profile-delete-stripe.infra.test.ts).

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
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

import { POST as REACTIVATE_POST } from '@/app/api/user-profile/reactivate/route';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { logError } from '@/lib/logger';

const mockGetUser = vi.mocked(getUserIdFromSession);
const mockLogError = vi.mocked(logError);

beforeEach(() => {
  vi.clearAllMocks();
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

/** The status arg ($2) the route passed to its UPDATE (the 2nd query call). */
function restoredStatusArg(): unknown {
  const updateCall = mockQuery.mock.calls[1];
  return (updateCall?.[1] as unknown[])?.[1];
}

describe('POST /api/user-profile/reactivate — live Stripe access restore (WF3, period-end)', () => {
  it('a LIVE active sub restores subscription_status = active (within the paid period)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r1');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r1' }])
      .mockResolvedValueOnce([{ subscription_status: 'active', account_deleted_at: null }]);
    // cancel_at_period_end scheduled, but Stripe status is still 'active' until period end.
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r1', status: 'active', cancel_at_period_end: true }] });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).toHaveBeenCalledWith({ customer: 'cus_r1', status: 'all', limit: 100 });
    expect(restoredStatusArg()).toBe('active');
    const body = (await res.json()) as { data: { subscription_status: string } };
    expect(body.data.subscription_status).toBe('active');
  });

  it('a past_due live sub restores subscription_status = past_due (routed to portal to fix payment)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r2');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r2' }])
      .mockResolvedValueOnce([{ subscription_status: 'past_due', account_deleted_at: null }]);
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r2', status: 'past_due' }] });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(restoredStatusArg()).toBe('past_due');
  });

  it('no live sub (all cancelled) restores expired', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r3');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r3' }])
      .mockResolvedValueOnce([{ subscription_status: 'expired', account_deleted_at: null }]);
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_r3', status: 'canceled' }] });

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(restoredStatusArg()).toBe('expired');
  });

  it('a Stripe throw is NON-FATAL — reactivation succeeds, status falls back to expired + logs', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r4');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r4' }])
      .mockResolvedValueOnce([{ subscription_status: 'expired', account_deleted_at: null }]);
    mockSubsList.mockRejectedValueOnce(new Error('stripe is down'));

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(restoredStatusArg()).toBe('expired');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('Stripe UNCONFIGURED (no secret key) is NON-FATAL — falls back to expired', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockGetUser.mockResolvedValueOnce('uid-r5');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: 'cus_r5' }])
      .mockResolvedValueOnce([{ subscription_status: 'expired', account_deleted_at: null }]);

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(restoredStatusArg()).toBe('expired');
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('makes NO Stripe call when the profile has no customer id (restores expired)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r6');
    mockQuery
      .mockResolvedValueOnce([{ account_deleted_at: RECENT_DELETE, account_preset: null, stripe_customer_id: null }])
      .mockResolvedValueOnce([{ subscription_status: 'expired', account_deleted_at: null }]);

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(restoredStatusArg()).toBe('expired');
  });

  it('manufacturer restores admin_managed and NEVER calls Stripe (even with a customer id)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-r7');
    mockQuery
      .mockResolvedValueOnce([
        { account_deleted_at: RECENT_DELETE, account_preset: 'manufacturer', stripe_customer_id: 'cus_r7' },
      ])
      .mockResolvedValueOnce([{ subscription_status: 'admin_managed', account_deleted_at: null }]);

    const res = await REACTIVATE_POST(makePOST());

    expect(res.status).toBe(200);
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(restoredStatusArg()).toBe('admin_managed');
  });
});
