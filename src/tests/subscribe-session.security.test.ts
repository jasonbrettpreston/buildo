// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b + Testing Gates

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
}));

import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { POST } from '@/app/api/subscribe/session/route';

const mockedGetUid = vi.mocked(getUserIdFromSession);
const mockedQuery = vi.mocked(query);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRequest(): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/subscribe/session' },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

describe('POST /api/subscribe/session — security', () => {
  it('URL never contains user_id or email (PII boundary)', async () => {
    const sensitiveUid = 'firebase-uid-PII-LEAK-PATTERN';
    mockedGetUid.mockResolvedValueOnce(sensitiveUid);
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'expired' }])
      .mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };

    expect(body.data.url).not.toContain(sensitiveUid);
    expect(body.data.url).not.toMatch(/uid=|user_id=|email=|user=/i);
  });

  it('two consecutive requests issue distinct nonces', async () => {
    mockedGetUid.mockResolvedValue('uid-x');
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'trial' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ subscription_status: 'trial' }])
      .mockResolvedValueOnce([]);

    const r1 = await POST(makeRequest());
    const r2 = await POST(makeRequest());
    const u1 = ((await r1.json()) as { data: { url: string } }).data.url;
    const u2 = ((await r2.json()) as { data: { url: string } }).data.url;

    const n1 = new URL(u1).searchParams.get('nonce');
    const n2 = new URL(u2).searchParams.get('nonce');
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1).not.toBe(n2);
  });

  it('nonce is a UUID-shaped string (not a guessable counter)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-x');
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'trial' }])
      .mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };
    const nonce = new URL(body.data.url).searchParams.get('nonce');

    // RFC 4122 v4 UUID shape — 8-4-4-4-12 hex
    expect(nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('rejects already-active users without creating a nonce row', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-active');
    mockedQuery.mockResolvedValueOnce([{ subscription_status: 'active' }]);

    await POST(makeRequest());

    // SELECT only — no INSERT into subscribe_nonces
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0]?.[0]).toContain('SELECT');
  });

  it('unauthenticated request never queries the DB', async () => {
    mockedGetUid.mockResolvedValueOnce(null);
    await POST(makeRequest());
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
