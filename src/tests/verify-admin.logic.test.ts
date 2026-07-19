// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.2
//             docs/specs/00-architecture/13_authentication.md §3.6, §3.7
//             .cursor/phase1_plan.md Item 6, P1-F5.1
//
// Auth-gate tests for `verifyAdminAuth`. Per Spec 35 §8.2 every admin
// route MUST have an auth-gate test asserting 401 on missing auth, 403
// on authenticated-but-not-admin, 200 on valid admin claim. This file
// exercises the helper directly — route handlers consume it via the
// per-route infra tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getVerifiedUid: vi.fn(),
}));

vi.mock('@/lib/auth/route-guard', () => ({
  isDevMode: vi.fn(() => false),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const mockPoolQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

const mockGetAal = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: mockGetAal } },
  })),
}));

const mockConsumeBackupCode = vi.fn();
vi.mock('@/lib/admin/backup-codes', () => ({
  consumeBackupCode: (...args: unknown[]) => mockConsumeBackupCode(...args),
}));

import { getVerifiedUid, type VerifiedUid } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { logWarn, logError } from '@/lib/logger';
import {
  verifyAdminAuth,
  parseAdminAllowlist,
  parseAllowedOrigins,
  parseCiAllowedIps,
  getClientIp,
} from '@/lib/auth/verify-admin';

/** Test-only cast into the branded `VerifiedUid` type the mocked helper returns. */
function asVerifiedUid(uid: string): VerifiedUid {
  return uid as VerifiedUid;
}

const mockedGetUid = vi.mocked(getVerifiedUid);
const mockedIsDevMode = vi.mocked(isDevMode);
const mockedLogWarn = vi.mocked(logWarn);
const mockedLogError = vi.mocked(logError);

function makeRequest(
  headers: Record<string, string> = {},
  method: string = 'GET',
): NextRequest {
  // Minimal NextRequest stand-in. The helper consumes
  // `request.method` (CSRF gate) + `request.headers.get(...)` + passes
  // the request through to `getVerifiedUid` (which we mock).
  return {
    method,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mockedIsDevMode.mockReturnValue(false);
  mockPoolQuery.mockReset();
  mockGetAal.mockReset();
  mockConsumeBackupCode.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('parseAdminAllowlist (retained utility — see verify-admin.ts docstring)', () => {
  it('returns empty array when env var is undefined', () => {
    expect(parseAdminAllowlist(undefined)).toEqual([]);
  });

  it('parses comma-separated uids with whitespace trimming', () => {
    expect(parseAdminAllowlist('uid1, uid2 ,uid3')).toEqual(['uid1', 'uid2', 'uid3']);
  });

  it('drops empty entries from trailing/leading commas', () => {
    expect(parseAdminAllowlist(',uid1,,uid2,')).toEqual(['uid1', 'uid2']);
  });
});

describe('parseCiAllowedIps', () => {
  it('returns empty array when env var is undefined', () => {
    expect(parseCiAllowedIps(undefined)).toEqual([]);
  });

  it('parses comma-separated IPs with whitespace trimming', () => {
    expect(parseCiAllowedIps('1.2.3.4, 5.6.7.8')).toEqual(['1.2.3.4', '5.6.7.8']);
  });

  it('normalizes IPv6-mapped IPv4 entries so either notation is accepted ([P1-F6 fold])', () => {
    expect(parseCiAllowedIps('::ffff:1.2.3.4, 5.6.7.8')).toEqual(['1.2.3.4', '5.6.7.8']);
  });
});

describe('getClientIp', () => {
  it('returns null when x-forwarded-for is absent', () => {
    expect(getClientIp(makeRequest())).toBeNull();
  });

  it('prefers x-vercel-forwarded-for (proxy-set) over x-forwarded-for', () => {
    const req = makeRequest({
      'x-vercel-forwarded-for': '198.51.100.7',
      'x-forwarded-for': 'spoofed.attacker.example, 198.51.100.7',
    });
    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('prefers x-real-ip over x-forwarded-for when vercel header absent', () => {
    const req = makeRequest({ 'x-real-ip': ' 198.51.100.9 ', 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIp(req)).toBe('198.51.100.9');
  });

  it('falls back to the RIGHTMOST x-forwarded-for entry (proxy-appended), never the client-controllable leftmost', () => {
    const req = makeRequest({ 'x-forwarded-for': ' 203.0.113.5 , 70.41.3.18 ' });
    expect(getClientIp(req)).toBe('70.41.3.18');
  });

  it('normalizes an IPv6-mapped IPv4 caller (::ffff:1.2.3.4 → 1.2.3.4) on every header path ([P1-F6 fold])', () => {
    expect(getClientIp(makeRequest({ 'x-vercel-forwarded-for': '::ffff:198.51.100.7' }))).toBe('198.51.100.7');
    expect(getClientIp(makeRequest({ 'x-real-ip': ' ::ffff:198.51.100.9 ' }))).toBe('198.51.100.9');
    expect(getClientIp(makeRequest({ 'x-forwarded-for': '203.0.113.5, ::ffff:70.41.3.18' }))).toBe('70.41.3.18');
  });
});

describe('verifyAdminAuth — dev mode bypass', () => {
  it('returns dev_bypass context when isDevMode is true (no auth check)', async () => {
    mockedIsDevMode.mockReturnValue(true);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toEqual({ uid: 'dev-user', authMethod: 'dev_bypass' });
    expect(mockedGetUid).not.toHaveBeenCalled();
  });
});

describe('verifyAdminAuth — CI_ADMIN_TOKEN + CI_ADMIN_ALLOWED_IPS (Spec 13 §3.7 successor)', () => {
  it('returns admin_key context when token matches AND caller IP is allowlisted', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    process.env.CI_ADMIN_ALLOWED_IPS = '203.0.113.5';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-ci-secret', 'x-forwarded-for': '203.0.113.5' }),
    );
    expect(ctx).toEqual({ uid: 'admin-key', authMethod: 'admin_key' });
    // The CI-credential path MUST short-circuit before session verify.
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('falls through to session check when token matches but caller IP is NOT allowlisted (logs WARN)', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    process.env.CI_ADMIN_ALLOWED_IPS = '203.0.113.5';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-ci-secret', 'x-forwarded-for': '198.51.100.9' }),
    );
    expect(ctx).toBeNull();
    expect(mockedLogWarn).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.stringMatching(/CI_ADMIN_TOKEN matched but caller IP/),
      expect.any(Object),
    );
  });

  it('returns null when header is missing entirely (falls through to session, no session present)', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
  });

  it('returns null when header value does not match', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest({ 'x-admin-key': 'wrong-secret' }));
    expect(ctx).toBeNull();
  });

  it('does NOT use header when CI_ADMIN_TOKEN env is unset (defends against empty-string bypass)', async () => {
    delete process.env.CI_ADMIN_TOKEN;
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest({ 'x-admin-key': '' }));
    expect(ctx).toBeNull();
  });

  it('rejects keys of the same length but different content (timing-safe compare)', async () => {
    process.env.CI_ADMIN_TOKEN = 'aaaaaaaaaa';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest({ 'x-admin-key': 'bbbbbbbbbb' }));
    expect(ctx).toBeNull();
  });

  it('rejects keys of different lengths without throwing', async () => {
    process.env.CI_ADMIN_TOKEN = 'short';
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest({ 'x-admin-key': 'much-longer-key' }));
    expect(ctx).toBeNull();
  });

  // [P1-F6 fold — DeepSeek] IPv6-mapped-IPv4 normalization: either notation
  // on either side of the allowlist compare must match.
  it('IPv6-mapped caller matches a plain-IPv4 allowlist entry', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    process.env.CI_ADMIN_ALLOWED_IPS = '203.0.113.5';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-ci-secret', 'x-forwarded-for': '::ffff:203.0.113.5' }),
    );
    expect(ctx).toEqual({ uid: 'admin-key', authMethod: 'admin_key' });
  });

  it('plain-IPv4 caller matches an IPv6-mapped allowlist entry', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    process.env.CI_ADMIN_ALLOWED_IPS = '::ffff:203.0.113.5';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-ci-secret', 'x-forwarded-for': '203.0.113.5' }),
    );
    expect(ctx).toEqual({ uid: 'admin-key', authMethod: 'admin_key' });
  });
});

describe('verifyAdminAuth — session + profiles.is_admin (Spec 13 §3.6)', () => {
  it('returns session context when getVerifiedUid resolves AND profiles.is_admin is true', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('11111111-1111-1111-1111-111111111111'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toEqual({ uid: '11111111-1111-1111-1111-111111111111', authMethod: 'session' });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM profiles'),
      ['11111111-1111-1111-1111-111111111111'],
    );
  });

  it('returns null + logs WARN when authenticated but profiles.is_admin is false (privilege-escalation attempt)', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('regular-user-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: false }] });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    expect(mockedLogWarn).toHaveBeenCalledTimes(1);
    expect(mockedLogWarn.mock.calls[0]?.[1]).toMatch(/not an admin/i);
  });

  it('returns null when authenticated but no profiles row exists yet', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('brand-new-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
  });

  it('returns null when getVerifiedUid returns null (no session) — no log', async () => {
    mockedGetUid.mockResolvedValueOnce(null);
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockedLogWarn).not.toHaveBeenCalled();
  });

  it('fails closed + logs a distinguishable error when the profiles query throws (table not migrated yet)', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('some-uid'));
    mockPoolQuery.mockRejectedValueOnce(new Error('relation "profiles" does not exist'));
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    expect(mockedLogError).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.any(Error),
      expect.objectContaining({ stage: 'profiles-lookup' }),
    );
  });
});

describe('verifyAdminAuth — MFA gate (landed, inert until ADMIN_MFA_ENFORCED=true)', () => {
  it('does NOT call the MFA check when ADMIN_MFA_ENFORCED is unset (inert by default — Item 6 sequencing)', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx?.authMethod).toBe('session');
    expect(mockGetAal).not.toHaveBeenCalled();
  });

  it('when ADMIN_MFA_ENFORCED=true and aal2 is reached, admin auth succeeds', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    mockGetAal.mockResolvedValueOnce({ data: { currentLevel: 'aal2' }, error: null });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx?.authMethod).toBe('session');
  });

  it('when ADMIN_MFA_ENFORCED=true and the session is only aal1, admin auth is denied', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    mockGetAal.mockResolvedValueOnce({ data: { currentLevel: 'aal1' }, error: null });
    const ctx = await verifyAdminAuth(makeRequest());
    expect(ctx).toBeNull();
    expect(mockedLogWarn).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.stringMatching(/aal2/),
      expect.any(Object),
    );
  });
});

describe('verifyAdminAuth — MFA backup-code challenge alternative (P1-F4.3 / fold 22)', () => {
  function armAal1AdminSession(uid = 'admin-uid') {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid(uid));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    mockGetAal.mockResolvedValueOnce({ data: { currentLevel: 'aal1' }, error: null });
  }

  it('enforced + aal1 + valid unused backup code header → session context (code consumed)', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    armAal1AdminSession();
    mockConsumeBackupCode.mockResolvedValueOnce(true);

    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-backup-code': 'a1b2-c3d4-e5f6-a7b8' }),
    );
    expect(ctx).toEqual({ uid: 'admin-uid', authMethod: 'session' });
    expect(mockConsumeBackupCode).toHaveBeenCalledWith('admin-uid', 'a1b2-c3d4-e5f6-a7b8');
    expect(mockedLogWarn).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.stringMatching(/backup code consumed/i),
      expect.objectContaining({ uid: 'admin-uid' }),
    );
  });

  it('enforced + aal1 + invalid/used backup code → denied (single-use holds)', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    armAal1AdminSession();
    mockConsumeBackupCode.mockResolvedValueOnce(false);

    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-backup-code': 'ffff-ffff-ffff-ffff' }),
    );
    expect(ctx).toBeNull();
    expect(mockedLogWarn).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.stringMatching(/invalid or already-used/i),
      expect.objectContaining({ uid: 'admin-uid' }),
    );
  });

  it('enforced + aal2 already reached → backup-code path never consulted (no code burned)', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    mockGetAal.mockResolvedValueOnce({ data: { currentLevel: 'aal2' }, error: null });

    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-backup-code': 'a1b2-c3d4-e5f6-a7b8' }),
    );
    expect(ctx?.authMethod).toBe('session');
    expect(mockConsumeBackupCode).not.toHaveBeenCalled();
  });

  it('gate INERT (env unset) → backup-code path never consulted even when the header is present', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-backup-code': 'a1b2-c3d4-e5f6-a7b8' }),
    );
    expect(ctx?.authMethod).toBe('session');
    expect(mockGetAal).not.toHaveBeenCalled();
    expect(mockConsumeBackupCode).not.toHaveBeenCalled();
  });

  it('enforced + aal1 + consume throws (DB down) → fail closed with mfa-check logError', async () => {
    process.env.ADMIN_MFA_ENFORCED = 'true';
    armAal1AdminSession();
    mockConsumeBackupCode.mockRejectedValueOnce(new Error('connection refused'));

    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-backup-code': 'a1b2-c3d4-e5f6-a7b8' }),
    );
    expect(ctx).toBeNull();
    expect(mockedLogError).toHaveBeenCalledWith(
      '[auth/verify-admin]',
      expect.any(Error),
      expect.objectContaining({ stage: 'mfa-check' }),
    );
  });
});

describe('parseAllowedOrigins', () => {
  it('returns empty array when env var is undefined', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it('parses comma-separated origins with whitespace trimming and lowercasing', () => {
    expect(
      parseAllowedOrigins('https://Admin.Buildo.app, https://Staging.Buildo.app'),
    ).toEqual(['https://admin.buildo.app', 'https://staging.buildo.app']);
  });

  // [P1-F6 fold — DeepSeek] strict URL parse of allowlist entries.
  it('canonicalizes entries (trailing slash dropped) and DROPS malformed / literal-null entries', () => {
    expect(
      parseAllowedOrigins('https://admin.buildo.app/, null, not a url, https://staging.buildo.app'),
    ).toEqual(['https://admin.buildo.app', 'https://staging.buildo.app']);
  });
});

describe('verifyAdminAuth — Spec 33 §13 CSRF Origin gate', () => {
  beforeEach(() => {
    process.env.ADMIN_ALLOWED_ORIGINS = 'https://admin.buildo.app';
  });

  it('GET request bypasses the CSRF gate even with no Origin header', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid-1'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    const ctx = await verifyAdminAuth(makeRequest({}, 'GET'));
    expect(ctx?.authMethod).toBe('session');
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'returns null + logs WARN when %s has no Origin header',
    async (method) => {
      const ctx = await verifyAdminAuth(makeRequest({}, method));
      expect(ctx).toBeNull();
      // CSRF check MUST short-circuit BEFORE session verify runs — a forged
      // cross-site request must not even reach session verify.
      expect(mockedGetUid).not.toHaveBeenCalled();
      expect(mockedLogWarn).toHaveBeenCalledTimes(1);
      expect(mockedLogWarn.mock.calls[0]?.[1]).toMatch(/CSRF/i);
    },
  );

  it('returns null when POST has Origin not in the allowlist', async () => {
    const ctx = await verifyAdminAuth(
      makeRequest({ origin: 'https://evil.example.com' }, 'POST'),
    );
    expect(ctx).toBeNull();
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  // [P1-F6 fold — DeepSeek] a literal `null` Origin (sandboxed iframe /
  // data: page) can NEVER match — even when a misconfigured allowlist
  // contains the string 'null'.
  it('rejects a literal "null" Origin even when the allowlist contains "null"', async () => {
    process.env.ADMIN_ALLOWED_ORIGINS = 'null, https://admin.buildo.app';
    const ctx = await verifyAdminAuth(makeRequest({ origin: 'null' }, 'POST'));
    expect(ctx).toBeNull();
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('rejects a malformed (unparseable) Origin header', async () => {
    const ctx = await verifyAdminAuth(makeRequest({ origin: 'not a url at all' }, 'POST'));
    expect(ctx).toBeNull();
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('rejects a non-http(s) Origin scheme (file:)', async () => {
    const ctx = await verifyAdminAuth(makeRequest({ origin: 'file:///C:/evil.html' }, 'POST'));
    expect(ctx).toBeNull();
    expect(mockedGetUid).not.toHaveBeenCalled();
  });

  it('passes CSRF + auth when POST has matching Origin and admin session', async () => {
    mockedGetUid.mockResolvedValueOnce(asVerifiedUid('admin-uid-1'));
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    const ctx = await verifyAdminAuth(
      makeRequest({ origin: 'https://admin.buildo.app' }, 'POST'),
    );
    expect(ctx?.authMethod).toBe('session');
    expect(ctx?.uid).toBe('admin-uid-1');
  });

  it('CSRF gate runs BEFORE dev_bypass — a forged cross-site mutating request is blocked even in dev mode', async () => {
    mockedIsDevMode.mockReturnValue(true);
    const ctx = await verifyAdminAuth(makeRequest({}, 'POST'));
    expect(ctx).toBeNull();
  });
});

describe('verifyAdminAuth — auth method precedence', () => {
  it('CI_ADMIN_TOKEN+allowlisted-IP wins over session cookie when both present', async () => {
    process.env.CI_ADMIN_TOKEN = 'test-ci-secret';
    process.env.CI_ADMIN_ALLOWED_IPS = '203.0.113.5';
    const ctx = await verifyAdminAuth(
      makeRequest({ 'x-admin-key': 'test-ci-secret', 'x-forwarded-for': '203.0.113.5' }),
    );
    expect(ctx?.authMethod).toBe('admin_key');
    expect(mockedGetUid).not.toHaveBeenCalled();
  });
});
