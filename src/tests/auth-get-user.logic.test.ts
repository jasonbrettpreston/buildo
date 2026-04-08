// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
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

function makeRequest(cookieValue: string | undefined): NextRequest {
  return {
    cookies: {
      get: vi.fn().mockReturnValue(cookieValue === undefined ? undefined : { value: cookieValue }),
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
