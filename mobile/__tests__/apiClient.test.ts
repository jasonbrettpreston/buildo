/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.6
//             docs/specs/03-mobile/95_mobile_user_profiles.md §4
//
// Error taxonomy for fetchWithAuth:
//  - AccountDeletedError thrown on 403 with ACCOUNT_DELETED code in body
//  - ApiError(403) thrown on generic 403 (no ACCOUNT_DELETED code)
//  - ApiError(404) thrown on 404 (no retry — deterministic new-user state)
//  - NetworkError thrown on fetch() failure

jest.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => ({ idToken: 'test-token' }) },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { fetchWithAuth, AccountDeletedError, ApiError, NetworkError } from '@/lib/apiClient';

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchWithAuth — AccountDeletedError', () => {
  const deletedBody = {
    data: null,
    error: {
      code: 'ACCOUNT_DELETED',
      message: 'Account is scheduled for deletion',
      account_deleted_at: '2026-03-30T00:00:00.000Z',
      days_remaining: 28,
    },
    meta: null,
  };

  it('throws AccountDeletedError on 403 with ACCOUNT_DELETED code', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, deletedBody));
    await expect(fetchWithAuth('/api/user-profile')).rejects.toBeInstanceOf(AccountDeletedError);
  });

  it('AccountDeletedError carries account_deleted_at from body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, deletedBody));
    await expect(fetchWithAuth('/api/user-profile')).rejects.toMatchObject({
      account_deleted_at: '2026-03-30T00:00:00.000Z',
    });
  });

  it('AccountDeletedError carries days_remaining from body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, deletedBody));
    await expect(fetchWithAuth('/api/user-profile')).rejects.toMatchObject({
      days_remaining: 28,
    });
  });

  it('throws ApiError(403) on generic 403 without ACCOUNT_DELETED code', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, { error: 'Forbidden' }));
    await expect(fetchWithAuth('/api/user-profile')).rejects.toBeInstanceOf(ApiError);
    try {
      await fetchWithAuth('/api/user-profile');
    } catch {
      // re-mock for status assertion
    }
    mockFetch.mockResolvedValueOnce(makeResponse(403, { error: 'Forbidden' }));
    await fetchWithAuth('/api/user-profile').catch((e: ApiError) => {
      expect(e.status).toBe(403);
    });
  });

  it('throws ApiError(403) on 403 with non-JSON body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, 'not json'));
    const err = await fetchWithAuth('/api/user-profile').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });

  it('days_remaining = 0 edge case is preserved', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, {
      data: null,
      error: { code: 'ACCOUNT_DELETED', account_deleted_at: '2026-01-01T00:00:00.000Z', days_remaining: 0 },
      meta: null,
    }));
    const err = await fetchWithAuth('/api/user-profile').catch((e) => e);
    expect(err).toBeInstanceOf(AccountDeletedError);
    expect((err as AccountDeletedError).days_remaining).toBe(0);
  });
});

describe('fetchWithAuth — ApiError / NetworkError', () => {
  it('throws ApiError(404) on 404', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, { error: 'Not Found' }));
    const err = await fetchWithAuth('/api/user-profile').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('throws NetworkError on fetch() rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));
    const err = await fetchWithAuth('/api/user-profile').catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
  });
});
