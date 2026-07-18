// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.2, §3.3
//              .cursor/phase1_plan.md Item 2 (get-user.ts row), P1-F5.1
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockGetClaims = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: mockGetClaims,
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

function makeRequest(cookieValue: string | undefined, authHeader?: string): NextRequest {
  return {
    cookies: {
      get: vi.fn().mockReturnValue(cookieValue === undefined ? undefined : { value: cookieValue }),
    },
    headers: {
      get: vi.fn().mockReturnValue(authHeader ?? null),
    },
  } as unknown as NextRequest;
}

describe('getClaimsUid (Spec 13 §3.2 read-path default)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when Bearer token is not 3 segments', async () => {
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, 'Bearer not-a-jwt'));
    expect(result).toBeNull();
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it('rejects oversized Bearer tokens (>8KB) before any Supabase call (WF3 DoS guard, carried forward)', async () => {
    const oversized = 'a.' + 'x'.repeat(9000) + '.c';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, `Bearer ${oversized}`));
    expect(result).toBeNull();
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it('verifies a Bearer token via supabase.auth.getClaims(token) and returns claims.sub', async () => {
    mockGetClaims.mockResolvedValueOnce({
      data: { claims: { sub: 'user-123' } },
      error: null,
    });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBe('user-123');
    expect(mockGetClaims).toHaveBeenCalledWith('a.b.c');
  });

  it('verifies the cookie-derived session via supabase.auth.getClaims() with no explicit token', async () => {
    mockGetClaims.mockResolvedValueOnce({
      data: { claims: { sub: 'cookie-user' } },
      error: null,
    });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined));
    expect(result).toBe('cookie-user');
    expect(mockGetClaims).toHaveBeenCalledWith();
  });

  it('returns null when getClaims returns an error (expired/malformed/no session)', async () => {
    mockGetClaims.mockResolvedValueOnce({ data: null, error: { message: 'invalid' } });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBeNull();
  });

  it('returns null when both Bearer and cookie are absent (no session)', async () => {
    mockGetClaims.mockResolvedValueOnce({ data: null, error: null });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined));
    expect(result).toBeNull();
  });

  it('returns null and logs a distinguishable JWKS/network-failure error on a thrown exception (Spec 13 §4a)', async () => {
    mockGetClaims.mockRejectedValueOnce(new Error('JWKS fetch failed'));
    const logger = await import('@/lib/logger');
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBeNull();
    expect(logger.logError).toHaveBeenCalledWith(
      '[auth/get-user]',
      expect.any(Error),
      expect.objectContaining({ stage: 'jwks_or_network' }),
    );
  });

  it('never throws — thrown Supabase errors resolve to null', async () => {
    mockGetClaims.mockRejectedValueOnce(new Error('boom'));
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    await expect(getClaimsUid(makeRequest(undefined, 'Bearer a.b.c'))).resolves.toBeNull();
  });
});

describe('getVerifiedUid (Spec 13 §3.2 money/mutation/admin-write path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls supabase.auth.getUser(token) for the Bearer path, not getClaims', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-456' } }, error: null });
    const { getVerifiedUid } = await import('@/lib/auth/get-user');
    const result = await getVerifiedUid(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBe('user-456');
    expect(mockGetUser).toHaveBeenCalledWith('a.b.c');
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it('calls supabase.auth.getUser() for the cookie path with no explicit token', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'cookie-user' } }, error: null });
    const { getVerifiedUid } = await import('@/lib/auth/get-user');
    const result = await getVerifiedUid(makeRequest(undefined));
    expect(result).toBe('cookie-user');
    expect(mockGetUser).toHaveBeenCalledWith();
  });

  it('returns null when getUser errors (e.g. a just-revoked session)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'revoked' } });
    const { getVerifiedUid } = await import('@/lib/auth/get-user');
    const result = await getVerifiedUid(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBeNull();
  });
});

describe('getUserIdFromSession — back-compat alias (Item 2 fold)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to getVerifiedUid (getUser()-grade), preserving the pre-swap revocation-checked posture for the ~32 untouched call sites outside this WF scope', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'legacy-caller' } }, error: null });
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest(undefined, 'Bearer a.b.c'));
    expect(result).toBe('legacy-caller');
    expect(mockGetUser).toHaveBeenCalledWith('a.b.c');
    expect(mockGetClaims).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dev-mode bypass — carried forward from the Firebase era (Bug #2 fix, WF3
// 2026-04-11), now exercised against BOTH getClaimsUid and getVerifiedUid
// since Item 2 requires the check live in both (either could be the first
// call on a fresh dev session).
// ---------------------------------------------------------------------------
describe('dev-mode bypass (Bug #2 regression lock, carried forward)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('getClaimsUid returns "dev-user" without calling Supabase when DEV_MODE=true + cookie matches DEV_SESSION_COOKIE', async () => {
    process.env.DEV_MODE = 'true';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE));
    expect(result).toBe('dev-user');
    expect(mockGetClaims).not.toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('getVerifiedUid ALSO carries the dev bypass (Item 2: both functions, not just one)', async () => {
    process.env.DEV_MODE = 'true';
    const { getVerifiedUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getVerifiedUid(makeRequest(DEV_SESSION_COOKIE));
    expect(result).toBe('dev-user');
    expect(mockGetUser).not.toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('STILL calls Supabase when DEV_MODE is NOT set (production regression guard)', async () => {
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
    mockGetClaims.mockResolvedValueOnce({ data: { claims: { sub: 'real-user' } }, error: null });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE));
    expect(result).toBe('real-user');
    expect(mockGetClaims).toHaveBeenCalledWith();
  });

  it('STILL calls Supabase when DEV_MODE=true + matching cookie + NODE_ENV=production (WF3 dual-gate hardening, carried forward)', async () => {
    process.env.DEV_MODE = 'true';
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    mockGetClaims.mockResolvedValueOnce({ data: { claims: { sub: 'real-user' } }, error: null });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE));
    expect(result).toBe('real-user');
    expect(mockGetClaims).toHaveBeenCalledWith();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? 'test';
  });

  it('DEV_MODE=false explicitly does NOT bypass', async () => {
    process.env.DEV_MODE = 'false';
    mockGetClaims.mockResolvedValueOnce({ data: { claims: { sub: 'real-user' } }, error: null });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    await getClaimsUid(makeRequest(DEV_SESSION_COOKIE));
    expect(mockGetClaims).toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  // Bearer-vs-cookie precedence (carried forward — dev-mode middleware
  // injects the '__session' cookie on every request, including mobile
  // requests that already carry a real Bearer token).
  it('returns the Bearer-token uid when BOTH a dev cookie AND an Authorization Bearer header are present', async () => {
    process.env.DEV_MODE = 'true';
    mockGetClaims.mockResolvedValueOnce({ data: { claims: { sub: 'mobile-user' } }, error: null });
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE, 'Bearer real.bearer.token'));
    expect(result).toBe('mobile-user');
    expect(mockGetClaims).toHaveBeenCalledWith('real.bearer.token');
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('falls back to cookie path when no Bearer header is present (web admin / SSR unaffected)', async () => {
    process.env.DEV_MODE = 'true';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE));
    expect(result).toBe('dev-user');
    expect(mockGetClaims).not.toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('returns null when Bearer is malformed (preserves fail-closed contract)', async () => {
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const result = await getClaimsUid(makeRequest(undefined, 'Bearer not-a-jwt'));
    expect(result).toBeNull();
  });

  it('FAIL-CLOSED: garbage Bearer + valid dev cookie → null (NOT cookie uid)', async () => {
    process.env.DEV_MODE = 'true';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE, 'Bearer not-a-jwt'));
    expect(result).toBeNull();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('FAIL-CLOSED: empty Bearer ("Authorization: Bearer ") + valid dev cookie → null', async () => {
    process.env.DEV_MODE = 'true';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE, 'Bearer '));
    expect(result).toBeNull();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('FAIL-CLOSED: non-Bearer Authorization (e.g., "Basic ...") + valid dev cookie → null', async () => {
    process.env.DEV_MODE = 'true';
    const { getClaimsUid } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await getClaimsUid(makeRequest(DEV_SESSION_COOKIE, 'Basic dXNlcjpwYXNz'));
    expect(result).toBeNull();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });
});
