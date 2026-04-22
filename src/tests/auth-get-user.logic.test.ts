// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockVerifyIdToken = vi.fn();
const mockApps: unknown[] = [];

vi.mock('firebase-admin', () => ({
  apps: mockApps,
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  default: {
    apps: mockApps,
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
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

describe('getUserIdFromSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApps.length = 0;
    mockApps.push({}); // assume initialized by default
  });

  it('returns null when cookie missing', async () => {
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest(undefined));
    expect(result).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns null when cookie is not 3 segments', async () => {
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('not-a-jwt'));
    expect(result).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns null and warns (dev) when firebase-admin not initialized', async () => {
    mockApps.length = 0;
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const logger = await import('@/lib/logger');
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBeNull();
    expect(logger.logWarn).toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
    (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
  });

  it('returns null and logs ERROR (production) when firebase-admin not initialized', async () => {
    mockApps.length = 0;
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const logger = await import('@/lib/logger');
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBeNull();
    expect(logger.logError).toHaveBeenCalled();
    (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
  });

  it('returns uid when verifyIdToken succeeds', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-123' });
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBe('user-123');
  });

  it('returns null and logs warn (not error) on id-token-expired', async () => {
    mockVerifyIdToken.mockRejectedValueOnce({ code: 'auth/id-token-expired' });
    const logger = await import('@/lib/logger');
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBeNull();
    expect(logger.logWarn).toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('returns null and logs warn (not error) on id-token-revoked', async () => {
    mockVerifyIdToken.mockRejectedValueOnce({ code: 'auth/id-token-revoked' });
    const logger = await import('@/lib/logger');
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBeNull();
    expect(logger.logWarn).toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('returns null and logs error on unknown error', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('boom'));
    const logger = await import('@/lib/logger');
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    const result = await getUserIdFromSession(makeRequest('a.b.c'));
    expect(result).toBeNull();
    expect(logger.logError).toHaveBeenCalled();
  });

  it('never throws across all paths', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('boom'));
    const { getUserIdFromSession } = await import('@/lib/auth/get-user');
    await expect(getUserIdFromSession(makeRequest('a.b.c'))).resolves.toBeNull();
    await expect(getUserIdFromSession(makeRequest(undefined))).resolves.toBeNull();
    await expect(getUserIdFromSession(makeRequest('bad'))).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dev-mode bypass — Bug #2 fix (WF3 2026-04-11)
// ---------------------------------------------------------------------------
// When DEV_MODE=true is set at the server level AND the incoming cookie
// matches DEV_SESSION_COOKIE exactly, verifyIdTokenCookie must skip the
// Firebase Admin verifyIdToken call entirely and return a stable dev uid.
// The prior implementation fell through to admin.auth().verifyIdToken on
// the fake `dev.buildo.local` cookie, which Google rejects, causing the
// leads page to redirect to /login.
//
// Security regression guard: the dev bypass MUST be gated on the
// server-only DEV_MODE env var (NEVER NEXT_PUBLIC_*). If an operator
// somehow sets DEV_MODE=true in production, the bypass activates — but
// that's the same risk surface as the middleware's existing dev bypass,
// documented in route-guard.ts:15-23. The tests below verify:
// 1. Dev mode + DEV_SESSION_COOKIE → returns 'dev-user' without Firebase
// 2. Prod mode + DEV_SESSION_COOKIE → still calls Firebase (regression lock)
// 3. Dev mode + a different 3-segment token → still calls Firebase

describe('verifyIdTokenCookie dev-mode bypass (Bug #2 regression lock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApps.length = 0;
    mockApps.push({});
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('returns "dev-user" without calling Firebase when DEV_MODE=true + cookie matches DEV_SESSION_COOKIE', async () => {
    process.env.DEV_MODE = 'true';
    const { verifyIdTokenCookie } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    const result = await verifyIdTokenCookie(DEV_SESSION_COOKIE);
    expect(result).toBe('dev-user');
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('STILL calls Firebase when DEV_MODE is NOT set (production regression guard)', async () => {
    // Critical security property: the dev bypass must NEVER fire in
    // prod, even if somehow the fake DEV_SESSION_COOKIE value ends up
    // in a request (attacker probe, misconfigured env, etc.).
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'real-user' });
    const { verifyIdTokenCookie } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    await verifyIdTokenCookie(DEV_SESSION_COOKIE);
    expect(mockVerifyIdToken).toHaveBeenCalledWith(DEV_SESSION_COOKIE);
  });

  it('STILL calls Firebase when DEV_MODE=true but cookie is a different 3-segment token', async () => {
    // The bypass is scoped to the exact DEV_SESSION_COOKIE value. A
    // real Firebase-issued token in dev mode must continue through the
    // normal verification path so devs testing with their own account
    // aren't hijacked by the bypass.
    process.env.DEV_MODE = 'true';
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'real-user' });
    const { verifyIdTokenCookie } = await import('@/lib/auth/get-user');
    const result = await verifyIdTokenCookie('real.firebase.token');
    expect(result).toBe('real-user');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('real.firebase.token');
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });

  it('DEV_MODE=false explicitly does NOT bypass', async () => {
    process.env.DEV_MODE = 'false';
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'real-user' });
    const { verifyIdTokenCookie } = await import('@/lib/auth/get-user');
    const { DEV_SESSION_COOKIE } = await import('@/lib/auth/route-guard');
    await verifyIdTokenCookie(DEV_SESSION_COOKIE);
    expect(mockVerifyIdToken).toHaveBeenCalled();
    delete (process.env as Record<string, string | undefined>).DEV_MODE;
  });
});
