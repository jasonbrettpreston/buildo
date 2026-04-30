// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b + Testing Gates

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

const fakeClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeClientQuery }),
  ),
}));

import { getUserIdFromSession } from '@/lib/auth/get-user';
import { POST } from '@/app/api/subscribe/session/route';

const mockedGetUid = vi.mocked(getUserIdFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUBSCRIBE_CHECKOUT_BASE_URL = 'https://buildo.com/subscribe';
});

function makeRequest(): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/subscribe/session' },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

// Helper: queue [SELECT profile, SELECT existing nonce, INSERT nonce] for the
// happy-path transaction body.
function queueHappyPath(status: string | null) {
  fakeClientQuery
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ subscription_status: status }] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing nonce
    .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT
}

describe('POST /api/subscribe/session — security', () => {
  it('URL never contains user_id or email (PII boundary)', async () => {
    const sensitiveUid = 'firebase-uid-PII-LEAK-PATTERN';
    mockedGetUid.mockResolvedValueOnce(sensitiveUid);
    queueHappyPath('expired');

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };

    expect(body.data.url).not.toContain(sensitiveUid);
    expect(body.data.url).not.toMatch(/uid=|user_id=|email=|user=/i);
  });

  it('two consecutive requests reuse the same unexpired nonce (idempotent within window)', async () => {
    // Spec §10 Step 4b: nonces are single-use ON EXCHANGE. Reusing an
    // unexpired nonce before exchange prevents nonce-table churn from
    // double-tap CTAs. The first call inserts; the second finds the
    // existing row and returns the same URL.
    mockedGetUid.mockResolvedValue('uid-x');
    // First request: no existing nonce → INSERT
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ subscription_status: 'trial' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // Second request: existing nonce found → reuse
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ subscription_status: 'trial' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ nonce: 'reused-nonce-9999' }],
      });

    const r1 = await POST(makeRequest());
    const r2 = await POST(makeRequest());
    const u1 = ((await r1.json()) as { data: { url: string } }).data.url;
    const u2 = ((await r2.json()) as { data: { url: string } }).data.url;

    const n1 = new URL(u1).searchParams.get('nonce');
    const n2 = new URL(u2).searchParams.get('nonce');
    expect(n1).toBeTruthy();
    // Second request returned the existing nonce, not a new one
    expect(n2).toBe('reused-nonce-9999');
  });

  it('nonce is a UUID-shaped string (not a guessable counter)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-x');
    queueHappyPath('trial');

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };
    const nonce = new URL(body.data.url).searchParams.get('nonce');

    // RFC 4122 v4 UUID shape — 8-4-4-4-12 hex
    expect(nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('rejects already-active users without creating a nonce row', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-active');
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'active' }],
    });

    await POST(makeRequest());

    // SELECT profile only — no nonce SELECT or INSERT
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
    expect(fakeClientQuery.mock.calls[0]?.[0]).toContain('SELECT');
  });

  it('unauthenticated request never queries the DB', async () => {
    mockedGetUid.mockResolvedValueOnce(null);
    await POST(makeRequest());
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });

  it('cancelled_pending_deletion users cannot resubscribe (deletion contract)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-deleting');
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'cancelled_pending_deletion' }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    // SELECT profile only — no nonce SELECT or INSERT
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });
});
