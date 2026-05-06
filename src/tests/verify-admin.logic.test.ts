// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.2
//
// Auth-gate tests for `verifyAdminAuth`. Per Spec 35 §8.2 every admin
// route MUST have an auth-gate test asserting 401 on missing auth, 403
// on authenticated-but-not-admin, 200 on valid admin claim. This file
// exercises the helper directly; route handlers consume it via the
// per-route infra tests (e.g., `admin-app-health.infra.test.ts`).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

vi.mock('@/lib/auth/route-guard', () => ({
  isDevMode: vi.fn(() => false),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import { getUserIdFromSession } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { logWarn } from '@/lib/logger';
import {
  verifyAdminAuth,
  parseAdminAllowlist,
} from '@/lib/auth/verify-admin';

const mockedGetUid = vi.mocked(getUserIdFromSession);
const mockedIsDevMode = vi.mocked(isDevMode);
const mockedLogWarn = vi.mocked(logWarn);

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  // Minimal NextRequest stand-in. The helper only consumes
  // `request.headers.get(...)` + passes the request through to
  // `getUserIdFromSession` (which we mock).
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mockedIsDevMode.mockReturnValue(false);
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('parseAdminAllowlist', () => {
  it('returns empty array when env var is undefined', () => {
    expect(parseAdminAllowlist(undefined)).toEqual([]);
  });

  it('returns empty array when env var is empty string', () => {
    expect(parseAdminAllowlist('')).toEqual([]);
  });

  it('parses comma-separated uids with whitespace trimming', () => {
    expect(parseAdminAllowlist('uid1, uid2 ,uid3')).toEqual([
      'uid1',
      'uid2',
      'uid3',
    ]);
  });

  it('drops empty entries from trailing/leading commas', () => {
    expect(parseAdminAllowlist(',uid1,,uid2,')).toEqual(['uid1', 'uid2']);
  });
});

describe('verifyAdminAuth — dev mode bypass', () => {
  it('returns dev_bypass context when isDevMode is true (no auth check)', async () => {
    mockedIsDevMode.mockReturnValue(true);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toEqual({ uid: 'dev-user', authMethod: 'dev_bypass' });
    // Dev bypass MUST short-circuit — getUserIdFromSession should NOT be called.
    expect(mockedGetUid).not.toHaveBeenCalled();
  });
});

describe('verifyAdminAuth — X-Admin-Key header', () => {
  it('returns admin_key context when header matches ADMIN_API_KEY env', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-secret';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-admin-secret' }),
    );
    expect(ctx).toEqual({ uid: 'admin-key', authMethod: 'admin_key' });
    // The X-Admin-Key path MUST short-circuit before firebase-admin
    // verify (cost optimization for the CI / pipeline path).
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('returns null when header is missing entirely', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-secret';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
  });

  it('returns null when header value does not match', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-secret';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'wrong-secret' }),
    );
    expect(ctx).toBeNull();
  });

  it('does NOT use header when ADMIN_API_KEY env is unset (defends against empty-string bypass)', async () => {
    delete process.env.ADMIN_API_KEY;
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': '' }),
    );
    expect(ctx).toBeNull();
  });
});

describe('verifyAdminAuth — session cookie + allowlist', () => {
  it('returns session context when uid is in ADMIN_USER_IDS allowlist', async () => {
    process.env.ADMIN_USER_IDS = 'admin-uid-1,admin-uid-2';
    mockedGetUid.mockResolvedValueOnce('admin-uid-1');
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toEqual({ uid: 'admin-uid-1', authMethod: 'session' });
  });

  it('returns null + logs WARN when authenticated user is NOT in allowlist (privilege-escalation attempt)', async () => {
    process.env.ADMIN_USER_IDS = 'admin-uid-1';
    mockedGetUid.mockResolvedValueOnce('regular-user-uid');
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    // Spec 33 §5 anti-pattern: privilege-escalation attempts MUST be
    // logged (auditable) — bare 401 with no log loses the signal.
    expect(mockedLogWarn).toHaveBeenCalledTimes(1);
    expect(mockedLogWarn.mock.calls[0]?.[1]).toMatch(/not an admin/i);
  });

  it('returns null when getUserIdFromSession returns null (no session)', async () => {
    process.env.ADMIN_USER_IDS = 'admin-uid-1';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    // No log — this is "anonymous user" not "privilege escalation".
    expect(mockedLogWarn).not.toHaveBeenCalled();
  });

  it('returns null when ADMIN_USER_IDS env is unset (defends against allowlist bypass via no-allowlist)', async () => {
    delete process.env.ADMIN_USER_IDS;
    mockedGetUid.mockResolvedValueOnce('any-uid');
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    // Authenticated but no allowlist configured = treated as not-admin.
    // Spec 33 §5 anti-pattern guard: admin auth must be explicit, never
    // implicit via empty allowlist.
    expect(mockedLogWarn).toHaveBeenCalledTimes(1);
  });
});

describe('verifyAdminAuth — auth method precedence', () => {
  it('X-Admin-Key wins over session cookie when both present', async () => {
    // CI script with a valid API key happens to also have a session cookie
    // attached (rare but possible). API key path is preferred for cost.
    process.env.ADMIN_API_KEY = 'test-admin-secret';
    process.env.ADMIN_USER_IDS = 'admin-uid-1';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-admin-secret' }),
    );
    expect(ctx?.authMethod).toBe('admin_key');
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('falls through to session check when X-Admin-Key header is wrong', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-secret';
    process.env.ADMIN_USER_IDS = 'admin-uid-1';
    mockedGetUid.mockResolvedValueOnce('admin-uid-1');
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'wrong-secret' }),
    );
    expect(ctx?.authMethod).toBe('session');
    expect(ctx?.uid).toBe('admin-uid-1');
  });
});
