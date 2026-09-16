// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
//             docs/specs/00-architecture/13_authentication.md §3.5 (middleware
//             performs NO cryptographic verification)
//             docs/specs/00_engineering_standards.md §4.1 + §4.4
//
// The ENFORCEMENT half of the WF3 SEC-1 guard locks. `api.infra.test.ts`
// proves, by source scan, that `verifyAdminAuth` is the first statement of
// every `/api/admin/**` handler export. This file proves the consequence
// end-to-end with the REAL guard (not a mock): a request that the
// presence-only middleware arm lets through — `x-admin-key: <anything>`, no
// session — is refused by the handler itself and never reaches the mutation.
//
// Provenance: `src/middleware.ts:115` passes a request carrying ANY
// `x-admin-key` header value (the P1-F4 break-glass TRANSPORT decision,
// 2026-07-19 — deliberate and NOT changed here), and `hasSupabaseSessionCookie`
// passes on ANY non-empty `sb-*-auth-token` cookie. Before this WF3,
// `PUT /api/admin/control-panel/configs` had no guard, so both shapes reached
// `applyConfigUpdate`, which rewrites `logic_variables` and three more tunable
// tables. That is the bypass — not a matcher gap.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/admin/control-panel', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/control-panel')>(
    '@/lib/admin/control-panel',
  );
  return {
    ...actual,
    loadAllConfigs: vi.fn().mockResolvedValue({}),
    applyConfigUpdate: vi.fn().mockResolvedValue(0),
  };
});

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  query: vi.fn().mockResolvedValue([]),
  withTransaction: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

// The POSITIVE arm (F4) drives the REAL `verifyAdminAuth` all the way to its
// success return, so only its two external dependencies are stubbed: the
// session resolver (`getVerifiedUid`, normally a revocation-checked Supabase
// `getUser()` round-trip) and the `profiles.is_admin` read, which shares the
// mocked pool below. Everything between them — the CSRF gate, the dev-mode
// branch, the CI-token compare, the MFA gate — runs for real.
const ADMIN_UID = '11111111-2222-3333-4444-555555555555';
vi.mock('@/lib/auth/get-user', () => ({
  getVerifiedUid: vi.fn().mockResolvedValue(null),
}));

import { loadAllConfigs, applyConfigUpdate } from '@/lib/admin/control-panel';
import { getVerifiedUid } from '@/lib/auth/get-user';
import { pool } from '@/lib/db/client';
import { GET, PUT } from '@/app/api/admin/control-panel/configs/route';

const mockedApply = vi.mocked(applyConfigUpdate);
const mockedLoad = vi.mocked(loadAllConfigs);
const mockedUid = vi.mocked(getVerifiedUid);
const mockedPoolQuery = vi.mocked(pool.query);

/**
 * A request shaped exactly like one the middleware's admin arm ALLOWS
 * through: it carries an `x-admin-key` header (presence-only passthrough)
 * but no session and no correct secret.
 */
function middlewarePassedRequest(opts: {
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}): NextRequest {
  const headers = new Map(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method: opts.method,
    url: 'https://example.test/api/admin/control-panel/configs',
    nextUrl: {
      pathname: '/api/admin/control-panel/configs',
      searchParams: new URLSearchParams(),
    },
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: () => undefined, getAll: () => [] },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as unknown as NextRequest;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // Neutralize every verifyAdminAuth pass-through so the test exercises the
  // production posture, not a dev/CI shortcut:
  //   - NODE_ENV=production + no dev flags   → isDevMode() false
  //   - no CI_ADMIN_TOKEN                    → mode 2 cannot match
  //   - no ADMIN_ALLOWED_ORIGINS             → CSRF gate default-denies
  delete process.env.CI_ADMIN_TOKEN;
  delete process.env.CI_ADMIN_ALLOWED_IPS;
  delete process.env.ADMIN_ALLOWED_ORIGINS;
  delete process.env.NEXT_PUBLIC_DEV_MODE;
  delete process.env.DEV_MODE;
  delete process.env.ADMIN_MFA_ENFORCED;
  mockedUid.mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('the middleware presence-only arm no longer reaches an admin handler', () => {
  it('PUT with `x-admin-key: anything` → 401, and applyConfigUpdate is never called', async () => {
    const res = await PUT(
      middlewarePassedRequest({
        method: 'PUT',
        headers: { 'x-admin-key': 'anything' },
        body: { logicVariables: [{ key: 'evil', value: '1' }] },
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe('UNAUTHORIZED');
    expect(body.data).toBeNull();
    // The whole point: the write never happened.
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('PUT with a garbage sb-* session cookie shape → 401, no write', async () => {
    const res = await PUT(
      middlewarePassedRequest({
        method: 'PUT',
        headers: { cookie: 'sb-abcdef-auth-token=garbage' },
        body: { logicVariables: [] },
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('GET with `x-admin-key: anything` → 401, and loadAllConfigs is never called', async () => {
    const res = await GET(
      middlewarePassedRequest({ method: 'GET', headers: { 'x-admin-key': 'anything' } }),
    );
    expect(res.status).toBe(401);
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('POSITIVE ARM — a VALID admin session reaches the handler: 200, and the DB call happens', async () => {
    // Without this arm the suite would pass just as happily against a guard
    // that refuses EVERYTHING — a lock that only proves things are blocked
    // cannot tell "correctly gated" from "broken". Here the real
    // `verifyAdminAuth` runs end to end: session cookie present, resolver
    // returns a uid, `profiles.is_admin` reads true, MFA not enforced.
    mockedUid.mockResolvedValue(ADMIN_UID as unknown as Awaited<ReturnType<typeof getVerifiedUid>>);
    mockedPoolQuery.mockResolvedValue({ rows: [{ is_admin: true }], rowCount: 1 } as never);
    mockedLoad.mockResolvedValue({ logicVariables: [] } as never);

    const res = await GET(
      middlewarePassedRequest({
        method: 'GET',
        headers: { cookie: `sb-abcdef-auth-token=a.real.looking.token` },
      }),
    );

    expect(res.status).toBe(200);
    // The guard did the admin check against the DB…
    expect(mockedPoolQuery).toHaveBeenCalled();
    expect(String(mockedPoolQuery.mock.calls[0]?.[0])).toMatch(/SELECT is_admin FROM profiles/);
    expect(mockedPoolQuery.mock.calls[0]?.[1]).toEqual([ADMIN_UID]);
    // …and the handler actually ran its own work, rather than short-circuiting.
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('POSITIVE ARM, negative control — the SAME request with is_admin false is 401 and never loads configs', async () => {
    // Proves the 200 above came from the admin check passing, not from the
    // stub simply making everything succeed.
    mockedUid.mockResolvedValue(ADMIN_UID as unknown as Awaited<ReturnType<typeof getVerifiedUid>>);
    mockedPoolQuery.mockResolvedValue({ rows: [{ is_admin: false }], rowCount: 1 } as never);

    const res = await GET(
      middlewarePassedRequest({
        method: 'GET',
        headers: { cookie: `sb-abcdef-auth-token=a.real.looking.token` },
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('the 401 body leaks no oracle (no method, no uid, no reason)', async () => {
    const res = await PUT(
      middlewarePassedRequest({
        method: 'PUT',
        headers: { 'x-admin-key': 'anything' },
        body: {},
      }),
    );
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/admin_key|dev_bypass|session|origin|CI_ADMIN_TOKEN|uid/i);
  });
});
