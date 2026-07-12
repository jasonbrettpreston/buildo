// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §5
//            docs/specs/03-mobile/96_mobile_subscription.md §7
//
// POST /api/subscribe/portal-session (P26-26C) — the authed Customer Portal
// session creator — plus the past_due fold on POST /api/subscribe/session
// (past_due routes toward the portal instead of minting a double-billing
// checkout nonce).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockPortalCreate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  })),
}));

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

const fakeQuery = vi.fn();
const fakeTxQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => fakeQuery(...args),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));

import { getUserIdFromSession } from '@/lib/auth/get-user';
import { POST } from '@/app/api/subscribe/portal-session/route';
import { POST as SESSION_POST } from '@/app/api/subscribe/session/route';

const mockedGetUid = vi.mocked(getUserIdFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.SUBSCRIBE_CHECKOUT_BASE_URL = 'https://staging.buildo.com/subscribe';
});

function makeRequest(pathname: string): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

describe('POST /api/subscribe/portal-session', () => {
  it('creates a one-off portal session for the stored customer and returns its url', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-portal-1');
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: 'cus_stored_1' }]);
    mockPortalCreate.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/p/session/xyz',
    });

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { url: 'https://billing.stripe.com/p/session/xyz' },
      error: null,
      meta: null,
    });
    // The stored customer id + an origin-scoped return_url (staging stays
    // on staging — derived from SUBSCRIBE_CHECKOUT_BASE_URL).
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_stored_1',
      return_url: 'https://staging.buildo.com',
    });
  });

  it('returns 400 NO_STRIPE_CUSTOMER when stripe_customer_id is NULL', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-portal-2');
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: null }]);

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('NO_STRIPE_CUSTOMER');
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    mockedGetUid.mockResolvedValueOnce(null);

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(401);
    expect(fakeQuery).not.toHaveBeenCalled();
  });

  it('returns 404 for an authenticated user with no profile row', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-ghost');
    fakeQuery.mockResolvedValueOnce([]);

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(404);
  });

  it('returns the named STRIPE_NOT_CONFIGURED 500 when the secret key is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockedGetUid.mockResolvedValueOnce('uid-portal-3');
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: 'cus_stored_3' }]);

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('STRIPE_NOT_CONFIGURED');
  });

  it('returns sanitized 500 when the Stripe call throws', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-portal-4');
    fakeQuery.mockResolvedValueOnce([{ stripe_customer_id: 'cus_stored_4' }]);
    mockPortalCreate.mockRejectedValueOnce(new Error('portal upstream SECRET_P1'));

    const res = await POST(makeRequest('/api/subscribe/portal-session'));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('SECRET_P1');
  });
});

describe('POST /api/subscribe/session — the past_due fold (P26-26C)', () => {
  it('routes past_due users toward the portal (400 PAST_DUE_USE_PORTAL, no nonce minted)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-pd-1');
    // The session route's transaction: profile SELECT returns past_due.
    fakeTxQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'past_due' }],
    });

    const res = await SESSION_POST(makeRequest('/api/subscribe/session'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('PAST_DUE_USE_PORTAL');
    // A second checkout would double-bill: assert NO nonce SELECT/INSERT
    // followed the status check (only the profile SELECT ran).
    expect(fakeTxQuery).toHaveBeenCalledTimes(1);
  });

  it('still blocks active users with ALREADY_ENTITLED (fold does not widen the gate)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-pd-2');
    fakeTxQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'active' }],
    });

    const res = await SESSION_POST(makeRequest('/api/subscribe/session'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('ALREADY_ENTITLED');
  });
});
