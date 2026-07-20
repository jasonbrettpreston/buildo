/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.6
//             docs/specs/03-mobile/95_mobile_user_profiles.md §4
//
// Error taxonomy for fetchWithAuth:
//  - AccountDeletedError thrown on 403 with ACCOUNT_DELETED code in body
//  - ApiError(403) thrown on generic 403 (no ACCOUNT_DELETED code)
//  - ApiError(404) thrown on 404 (no retry — deterministic new-user state)
//  - NetworkError thrown on fetch() failure
//  - 401 → supabase.auth.refreshSession() → single retry (isRetry guard)

// Stateful authStore mock: setAuth mutates the inner state so that the
// recursive fetchWithAuthInternal call (after a 401 session refresh) reads
// the REFRESHED accessToken, not the original. Without this, the §B6 retry
// path silently sends the stale bearer on the second fetch and no test
// can detect a regression where setAuth is dropped.
jest.mock('@/store/authStore', () => {
  const initial = {
    accessToken: 'test-token',
    user: { uid: 'user-1', email: null, displayName: null } as {
      uid: string;
      email: string | null;
      displayName: string | null;
    },
  };
  let state: typeof initial & { setAuth: jest.Mock } = {
    ...initial,
    setAuth: jest.fn((user: typeof initial.user, accessToken: string) => {
      state = { ...state, user, accessToken };
    }),
  };
  return {
    useAuthStore: {
      getState: () => state,
      // Test-only helper to reset stateful auth between cases.
      _resetMockState: () => {
        state = {
          ...initial,
          setAuth: jest.fn((user: typeof initial.user, accessToken: string) => {
            state = { ...state, user, accessToken };
          }),
        };
      },
    },
  };
});

// Supabase client mock — apiClient.ts calls `supabase.auth.refreshSession()`
// on 401 (replaces `auth().currentUser?.getIdToken(true)`). Resolves the
// same `{ data: { session }, error }` envelope the real SDK returns; the
// retried request's Bearer must equal `session.access_token` — the exact
// value Phase-1's server verifier (get-user.ts getClaims/getUser) checks.
const mockRefreshSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: (...a: unknown[]) => mockRefreshSession(...a),
    },
  },
}));

const mockCaptureException = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
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

/** A refreshed-session envelope in the real supabase-js shape. */
function makeRefreshedSession(accessToken: string) {
  return {
    data: {
      session: {
        access_token: accessToken,
        refresh_token: `refresh-${accessToken}`,
        user: { id: 'user-1', email: null },
      },
      user: { id: 'user-1', email: null },
    },
    error: null,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockCaptureException.mockClear();
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

  it('generic error path caps the body at 120 chars — >120-char payloads are replaced, never truncated-but-included (PII guard, Guardian F2 lock)', async () => {
    // Load-bearing sanitization (apiClient.ts generic !ok path): a long server
    // payload could carry PII (addresses, names, permit details) into the
    // thrown ApiError.message and onward into Sentry breadcrumbs.
    const longBody = 'x'.repeat(121);
    mockFetch.mockResolvedValueOnce(makeResponse(500, longBody));
    await expect(fetchWithAuth('/api/test')).rejects.toThrow('HTTP 500');
    // Short bodies pass through verbatim (pre-existing contract, unchanged).
    mockFetch.mockResolvedValueOnce(makeResponse(500, 'server exploded'));
    await expect(fetchWithAuth('/api/test')).rejects.toThrow('server exploded');
  });

  it('throws NetworkError on fetch() rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));
    const err = await fetchWithAuth('/api/user-profile').catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
  });
});

describe('fetchWithAuth — 401 session refresh retry (Spec 99 §B6)', () => {
  function getSetAuthMock(): jest.Mock {
    return (
      jest.requireMock('@/store/authStore') as {
        useAuthStore: { getState: () => { setAuth: jest.Mock } };
      }
    ).useAuthStore.getState().setAuth;
  }

  beforeEach(() => {
    mockRefreshSession.mockReset();
    (
      jest.requireMock('@/store/authStore') as {
        useAuthStore: { _resetMockState: () => void };
      }
    ).useAuthStore._resetMockState();
  });

  it('retries with fresh session on 401 and resolves — Bearer equals session.access_token (real server contract)', async () => {
    mockRefreshSession.mockResolvedValue(makeRefreshedSession('refreshed-token'));
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(200, { data: 'ok' }));
    const result = await fetchWithAuth<{ data: string }>('/api/leads/feed');
    expect(result).toEqual({ data: 'ok' });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Spec 99 §B6 contract: the refreshed token MUST be (a) written to
    // authStore via setAuth and (b) carried as the Bearer on the retry —
    // this is `session.access_token`, the exact value get-user.ts's
    // getClaims()/getUser() verifies server-side (Phase-1 contract).
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
    mockRefreshSession.mockResolvedValue(makeRefreshedSession('refreshed-token'));
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    const err = await fetchWithAuth('/api/leads/feed').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws ApiError(401) when refreshSession throws', async () => {
    mockRefreshSession.mockRejectedValue(new Error('Supabase network error'));
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    const err = await fetchWithAuth('/api/leads/feed').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError(401) when refreshSession resolves with an error envelope', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: Object.assign(new Error('Invalid Refresh Token'), {
        name: 'AuthApiError',
        code: 'refresh_token_not_found',
        status: 400,
      }),
    });
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    const err = await fetchWithAuth('/api/leads/feed').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('token-never-in-logs: refresh failure telemetry carries NO session/token material (P2 plan, GT MED)', async () => {
    // Simulated refreshSession failure → Sentry.captureException fires, but
    // the captured error + extras must contain no session object, no
    // access_token/refresh_token value, and no Bearer string.
    mockCaptureException.mockClear();
    mockRefreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: Object.assign(new Error('Invalid Refresh Token'), {
        name: 'AuthApiError',
        code: 'refresh_token_not_found',
        status: 400,
      }),
    });
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'Unauthorized' }));
    await fetchWithAuth('/api/leads/feed').catch(() => undefined);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [capturedErr, hint] = mockCaptureException.mock.calls[0] as [
      Error,
      { extra?: Record<string, unknown> } | undefined,
    ];
    // The captured value is the AuthError itself (code/message/status only).
    expect(capturedErr).toBeInstanceOf(Error);
    const serialized = JSON.stringify({
      message: capturedErr.message,
      ...(capturedErr as unknown as Record<string, unknown>),
      hint,
    });
    // No token VALUES anywhere in the captured payload (the GoTrue error
    // CODE string `refresh_token_not_found` is fine — the rule bans token
    // material and session objects, not error codes).
    expect(serialized).not.toContain('test-token');
    expect(serialized).not.toContain('Bearer ');
    expect(hint?.extra ?? {}).not.toHaveProperty('session');
    expect(hint?.extra ?? {}).not.toHaveProperty('accessToken');
    expect(hint?.extra ?? {}).not.toHaveProperty('access_token');
  });
});
