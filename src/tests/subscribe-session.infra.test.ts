// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b + Testing Gates
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5
//
// Entitlements rewrite (`.cursor/phase1_plan.md` P1-F5.2, R3): the single
// legacy user_profiles lock splits into TWO row-locks in one transaction —
// user_profiles (account-level deletion check) + the (uid, lead_gen)
// entitlements row (portal-routed / already-entitled checks).

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

// entitlements is UUID-keyed — the row-lock read no-ops on non-uuid uids, so
// fixtures use uuids to exercise the real gate path.
const UID = '00000000-0000-0000-0000-00000000d001';

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

// Helper: queue [SELECT profile FOR UPDATE, SELECT entitlement FOR UPDATE,
// SELECT existing nonce, INSERT nonce] for the transaction body.
function queueHappyPath(status: string | null, existingNonce: string | null = null) {
  fakeClientQuery
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ account_deleted_at: null }] })
    .mockResolvedValueOnce(
      status === null
        ? { rowCount: 0, rows: [] } // first-time subscriber — no entitlement row
        : { rowCount: 1, rows: [{ status, trial_started_at: null }] },
    )
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
    mockedGetUid.mockResolvedValueOnce(UID);
    queueHappyPath('expired');

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.url).toMatch(/^https:\/\/buildo\.com\/subscribe\?nonce=/);

    // Calls in order: SELECT profile FOR UPDATE, SELECT entitlement FOR
    // UPDATE, SELECT existing nonce, INSERT nonce.
    expect(fakeClientQuery).toHaveBeenCalledTimes(4);
    // The two split locks (R3): account-level + per-product entitlement row.
    expect(fakeClientQuery.mock.calls[0]?.[0]).toMatch(/SELECT account_deleted_at FROM user_profiles WHERE user_id = \$1 FOR UPDATE/);
    expect(fakeClientQuery.mock.calls[1]?.[0]).toMatch(/FROM entitlements WHERE user_id = \$1 AND product = \$2 FOR UPDATE/);
    expect(fakeClientQuery.mock.calls[1]?.[1]).toEqual([UID, 'lead_gen']);
    const insertCall = fakeClientQuery.mock.calls[3];
    expect(insertCall?.[0]).toContain('INSERT INTO subscribe_nonces');
    // Second arg is [nonce, uid]
    expect(insertCall?.[1]?.[1]).toBe(UID);
  });

  it('proceeds normally for a FIRST-TIME subscriber with zero entitlement rows (no lock taken, no 500)', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    queueHappyPath(null); // FOR UPDATE on zero rows — legal, proceeds

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url).toContain('nonce=');
  });

  it('issues different nonces for two requests from the same user', async () => {
    mockedGetUid.mockResolvedValue(UID);
    queueHappyPath('expired');
    queueHappyPath('expired');

    const res1 = await POST(makeRequest());
    const res2 = await POST(makeRequest());

    const body1 = (await res1.json()) as { data: { url: string } };
    const body2 = (await res2.json()) as { data: { url: string } };
    expect(body1.data.url).not.toBe(body2.data.url);
  });

  it('reuses an unexpired nonce when one already exists (idempotent within window)', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    queueHappyPath('expired', 'existing-nonce-uuid-9999');

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url).toContain('existing-nonce-uuid-9999');
    // No INSERT — profile lock + entitlement lock + SELECT existing nonce
    expect(fakeClientQuery).toHaveBeenCalledTimes(3);
  });

  it('URL contains no UID and no email — only the nonce param', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    queueHappyPath('trial');

    const res = await POST(makeRequest());
    const body = (await res.json()) as { data: { url: string } };

    expect(body.data.url).not.toContain(UID);
    expect(body.data.url).not.toContain('@');
    expect(body.data.url).not.toContain('email');
    expect(body.data.url).not.toContain('uid');
  });
});

describe('POST /api/subscribe/session — 4xx', () => {
  it('returns 401 when no session resolves', async () => {
    mockedGetUid.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });

  it('returns 400 (ALREADY_ENTITLED) when the lead_gen entitlement is "active"', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ account_deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'active', trial_started_at: null }] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_ENTITLED');
    // Profile lock + entitlement lock only — no nonce SELECT or INSERT
    expect(fakeClientQuery).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when the lead_gen entitlement is "admin_managed"', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ account_deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'admin_managed', trial_started_at: null }] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(fakeClientQuery).toHaveBeenCalledTimes(2);
  });

  it('returns 400 (PAST_DUE_USE_PORTAL) when the lead_gen entitlement is "past_due"', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ account_deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'past_due', trial_started_at: null }] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAST_DUE_USE_PORTAL');
  });

  it('returns 400 (ACCOUNT_PENDING_DELETION) when account_deleted_at is set — the account-level check', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ account_deleted_at: '2026-07-01T00:00:00Z' }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_PENDING_DELETION');
    // Short-circuits before the entitlement lock.
    expect(fakeClientQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 (ACCOUNT_PENDING_DELETION) when the entitlement row is deletion-marked (belt to the account flag)', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ account_deleted_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'cancelled_pending_deletion', trial_started_at: null }] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_PENDING_DELETION');
  });

  it('returns 500 (data inconsistency) when no profile row exists', async () => {
    // Auth user with no profile row is data corruption, not a 404 the client
    // can act on — return 500 so support catches it (Gemini wiring review LOW).
    mockedGetUid.mockResolvedValueOnce(UID);
    fakeClientQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/subscribe/session — 500 leak prevention', () => {
  it('returns sanitized 500 when the DB throws', async () => {
    mockedGetUid.mockResolvedValueOnce(UID);
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
    mockedGetUid.mockResolvedValueOnce(UID);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    // No DB calls — fail before transaction
    expect(fakeClientQuery).not.toHaveBeenCalled();
  });
});
