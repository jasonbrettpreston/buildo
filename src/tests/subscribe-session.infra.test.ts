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

describe('POST /api/subscribe/session — 200 happy path', () => {
  it('issues a nonce row and returns the checkout URL', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-abc');
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'expired' }]) // SELECT profile
      .mockResolvedValueOnce([]); // INSERT nonce

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.url).toMatch(/^https:\/\/buildo\.com\/subscribe\?nonce=/);

    const insertCall = mockedQuery.mock.calls[1];
    expect(insertCall?.[0]).toContain('INSERT INTO subscribe_nonces');
    // Second arg is [nonce, uid] — uid must be 'uid-abc'
    expect(insertCall?.[1]?.[1]).toBe('uid-abc');
  });

  it('issues different nonces for two requests from the same user', async () => {
    mockedGetUid.mockResolvedValue('uid-abc');
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'expired' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ subscription_status: 'expired' }])
      .mockResolvedValueOnce([]);

    const res1 = await POST(makeRequest());
    const res2 = await POST(makeRequest());

    const body1 = (await res1.json()) as { data: { url: string } };
    const body2 = (await res2.json()) as { data: { url: string } };
    expect(body1.data.url).not.toBe(body2.data.url);
  });

  it('URL contains no UID and no email — only the nonce param', async () => {
    mockedGetUid.mockResolvedValueOnce('firebase-uid-secret');
    mockedQuery
      .mockResolvedValueOnce([{ subscription_status: 'trial' }])
      .mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };

    expect(body.data.url).not.toContain('firebase-uid-secret');
    expect(body.data.url).not.toContain('@');
    expect(body.data.url).not.toContain('email');
    expect(body.data.url).not.toContain('uid');
  });
});

describe('POST /api/subscribe/session — 4xx', () => {
  it('returns 401 when no Firebase session resolves', async () => {
    mockedGetUid.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 (ALREADY_ENTITLED) when subscription_status is "active"', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-active');
    mockedQuery.mockResolvedValueOnce([{ subscription_status: 'active' }]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_ENTITLED');
    // No nonce INSERT
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when subscription_status is "admin_managed"', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-mfg');
    mockedQuery.mockResolvedValueOnce([{ subscription_status: 'admin_managed' }]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when no profile row exists for the uid', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-no-profile');
    mockedQuery.mockResolvedValueOnce([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/subscribe/session — 500 leak prevention', () => {
  it('returns sanitized 500 when the DB throws', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-x');
    mockedQuery.mockRejectedValueOnce(new Error('connection terminated SECRET_X9'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('SECRET_X9');
  });
});
