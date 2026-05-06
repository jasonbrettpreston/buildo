/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.6
//             docs/specs/03-mobile/95_mobile_user_profiles.md §4
//
// Error taxonomy for fetchWithAuth:
//  - AccountDeletedError thrown on 403 with ACCOUNT_DELETED code in body
//  - ApiError(403) thrown on generic 403 (no ACCOUNT_DELETED code)
//  - ApiError(404) thrown on 404 (no retry — deterministic new-user state)
//  - NetworkError thrown on fetch() failure

// Stateful authStore mock: setAuth mutates the inner state so that the
// recursive fetchWithAuthInternal call (after a 401 token refresh) reads
// the REFRESHED idToken, not the original. Without this, the §B6 retry
// path silently sends the stale bearer on the second fetch and no test
// can detect a regression where setAuth is dropped.
jest.mock('@/store/authStore', () => {
  const initial = {
    idToken: 'test-token',
    user: { uid: 'user-1', email: null, displayName: null } as {
      uid: string;
      email: string | null;
      displayName: string | null;
    },
  };
  let state: typeof initial & { setAuth: jest.Mock } = {
    ...initial,
    setAuth: jest.fn((user: typeof initial.user, idToken: string) => {
      state = { ...state, user, idToken };
    }),
  };
  return {
    useAuthStore: {
      getState: () => state,
      // Test-only helper to reset stateful auth between cases.
      _resetMockState: () => {
        state = {
          ...initial,
          setAuth: jest.fn((user: typeof initial.user, idToken: string) => {
            state = { ...state, user, idToken };
          }),
        };
      },
    },
  };
});

// RNFirebase: `auth` is a factory function — `auth()` returns the instance with
// currentUser. apiClient.ts calls `auth().currentUser?.getIdToken(true)`.
jest.mock('@/lib/firebase', () => {
  const instance = { currentUser: { getIdToken: jest.fn() } };
  const authFn: any = jest.fn(() => instance);
  // Expose the singleton instance off the function so tests can `requireMock`
  // and reach `auth.currentUser.getIdToken` regardless of whether they go
  // through `auth()` or pull the underlying instance directly.
  authFn.currentUser = instance.currentUser;
  return { auth: authFn };
});

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

// RED LIGHT for first test: before the 401 retry fix, fetchWithAuth throws ApiError(401)
// immediately on first 401 without ever calling getIdToken — mockFetch only fires once.
describe('fetchWithAuth — 401 token refresh retry (Spec 99 §B6)', () => {
  function getIdTokenMock(): jest.Mock {
    return (
      jest.requireMock('@/lib/firebase') as {
        auth: { currentUser: { getIdToken: jest.Mock } };
      }
    ).auth.currentUser.getIdToken;
  }

  function getSetAuthMock(): jest.Mock {
    return (
      jest.requireMock('@/store/authStore') as {
        useAuthStore: { getState: () => { setAuth: jest.Mock } };
      }
    ).useAuthStore.getState().setAuth;
  }

  beforeEach(() => {
    getIdTokenMock().mockReset();
    (
      jest.requireMock('@/store/authStore') as {
        useAuthStore: { _resetMockState: () => void };
      }
    ).useAuthStore._resetMockState();
  });

  it('retries with fresh token on 401 and resolves', async () => {
    getIdTokenMock().mockResolvedValue('refreshed-token');
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200, { data: 'ok' }));
    const result = await fetchWithAuth<{ data: string }>('/api/leads/feed');
    expect(result).toEqual({ data: 'ok' });
    expect(getIdTokenMock()).toHaveBeenCalledWith(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Spec 99 §B6 contract: the refreshed token MUST be (a) written to
    // authStore via setAuth and (b) carried as the Bearer on the retry.
    // Without these two assertions a regression that calls getIdToken
    // but drops the result would still pass.
    // Capture the setAuth mock once — calling getSetAuthMock() twice would
    // pull a fresh reference if a future refactor adds a mid-test reset,
    // silently producing a confusing pass/fail (Independent reviewer #1).
    const setAuthMock = getSetAuthMock();
    expect(setAuthMock).toHaveBeenCalledTimes(1);
    expect(setAuthMock).toHaveBeenCalledWith(
      { uid: 'user-1', email: null, displayName: null },
      'refreshed-token',
    );

    const firstCallHeaders = (mockFetch.mock.calls[0][1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    const secondCallHeaders = (mockFetch.mock.calls[1][1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    expect(firstCallHeaders?.Authorization).toBe('Bearer test-token');
    expect(secondCallHeaders?.Authorization).toBe('Bearer refreshed-token');
  });

  it('throws ApiError(401) when retry also returns 401', async () => {
    getIdTokenMock().mockResolvedValue('refreshed-token');
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    const err = await fetchWithAuth('/api/leads/feed').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws ApiError(401) when getIdToken throws', async () => {
    getIdTokenMock().mockRejectedValue(new Error('Firebase network error'));
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    const err = await fetchWithAuth('/api/leads/feed').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
