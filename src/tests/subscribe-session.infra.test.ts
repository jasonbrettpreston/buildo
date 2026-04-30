// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b + Testing Gates

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

// withTransaction passthrough — the test inspects inner queries via fakeClientQuery.
// Mirrors the api-leads-view + stripe-webhook test pattern for transactional routes.
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
  // Force the prod fallback URL to be valid in tests — the route now throws
  // when SUBSCRIBE_CHECKOUT_BASE_URL is unset in non-prod, so set it explicitly.
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
function queueHappyPath(status: string | null, existingNonce: string | null = null) {
  fakeClientQuery
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: status }],
    })
    .mockResolvedValueOnce({
      rowCount: existingNonce ? 1 : 0,
      rows: existingNonce ? [{ nonce: existingNonce }] : [],
    });
  if (!existingNonce) {
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
  }
}

describe('POST /api/subscribe/session — 200 happy path', () => {
  it('issues a nonce row and returns the checkout URL', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-abc');
    queueHappyPath('expired');

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.url).toMatch(/^https:\/\/buildo\.com\/subscribe\?nonce=/);

    // Calls in order: SELECT profile FOR UPDATE, SELECT existing nonce, INSERT nonce
    expect(fakeClientQuery).toHaveBeenCalledTimes(3);
    const insertCall = fakeClientQuery.mock.calls[2];
    expect(insertCall?.[0]).toContain('INSERT INTO subscribe_nonces');
    // Second arg is [nonce, uid] — uid must be 'uid-abc'
    expect(insertCall?.[1]?.[1]).toBe('uid-abc');
  });

  it('issues different nonces for two requests from the same user', async () => {
    mockedGetUid.mockResolvedValue('uid-abc');
    queueHappyPath('expired');
    queueHappyPath('expired');

    const res1 = await POST(makeRequest());
    const res2 = await POST(makeRequest());

    const body1 = (await res1.json()) as { data: { url: string } };
    const body2 = (await res2.json()) as { data: { url: string } };
    expect(body1.data.url).not.toBe(body2.data.url);
  });

  it('reuses an unexpired nonce when one already exists (idempotent within window)', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-abc');
    queueHappyPath('expired', 'existing-nonce-uuid-9999');

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url).toContain('existing-nonce-uuid-9999');
    // No INSERT — only SELECT profile + SELECT existing nonce
    expect(fakeClientQuery).toHaveBeenCalledTimes(2);
  });

  it('URL contains no UID and no email — only the nonce param', async () => {
    mockedGetUid.mockResolvedValueOnce('firebase-uid-secret');
    queueHappyPath('trial');

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
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });

  it('returns 400 (ALREADY_ENTITLED) when subscription_status is "active"', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-active');
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'active' }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_ENTITLED');
    // SELECT profile only — no nonce SELECT or INSERT
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when subscription_status is "admin_managed"', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-mfg');
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'admin_managed' }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 (ACCOUNT_PENDING_DELETION) when status is cancelled_pending_deletion', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-deleting');
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ subscription_status: 'cancelled_pending_deletion' }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_PENDING_DELETION');
  });

  it('returns 500 (data inconsistency) when no profile row exists', async () => {
    // Auth user with no profile row is data corruption, not a 404 the client
    // can act on — return 500 so support catches it (Gemini wiring review LOW).
    mockedGetUid.mockResolvedValueOnce('uid-no-profile');
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/subscribe/session — 500 leak prevention', () => {
  it('returns sanitized 500 when the DB throws', async () => {
    mockedGetUid.mockResolvedValueOnce('uid-x');
    fakeClientQuery.mockRejectedValueOnce(
      new Error('connection terminated SECRET_X9'),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('SECRET_X9');
  });
});

describe('POST /api/subscribe/session — env validation', () => {
  it('returns 500 in non-prod when SUBSCRIBE_CHECKOUT_BASE_URL is unset', async () => {
    delete process.env.SUBSCRIBE_CHECKOUT_BASE_URL;
    // NODE_ENV is typed as a literal union by Next.js; the cast is the
    // documented escape hatch (CLAUDE.md TypeScript Quirks).
    (process.env as Record<string, string>).NODE_ENV = 'test';
    mockedGetUid.mockResolvedValueOnce('uid-x');

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    // No DB calls — fail before transaction
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });
});
