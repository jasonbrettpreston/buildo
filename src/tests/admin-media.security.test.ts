// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
//             docs/specs/00-architecture/13_authentication.md §3.6 + §4a
//             docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//
// T3 (MF-37 plan.v3 §4): the admin media trust boundary. Routes: 401 when verifyAdminAuth returns null
// (GET, POST, DELETE); 403 SESSION_REQUIRED for the shared admin_key and dev_bypass sentinels on the mutations;
// 200 on the session path; every audit row carries a non-empty reason. requireAdminPage: the page-side
// parity matrix with verifyAdminAuth (dev+UID, dev without UID, no session, getUser error, non-admin,
// admin, MFA enforced at aal1 / aal2, profiles lookup throws). Auth, DB, storage and telemetry are mocked
// (the admin-mutation-audit.infra.test.ts style); no database.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signMany: vi.fn(),
  getUser: vi.fn(),
  aal: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: h.poolQuery },
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: h.clientQuery })),
}));
vi.mock('@/lib/auth/verify-admin', () => ({ verifyAdminAuth: vi.fn(), isProfileAdmin: vi.fn() }));
vi.mock('@/lib/admin/admin-audit', () => ({ writeAdminAudit: vi.fn() }));
vi.mock('@/lib/admin/analytics', () => ({ track: vi.fn(async () => undefined) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/lib/media/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/media/storage')>()),
  sessionMediaStorage: vi.fn(async () => ({ upload: h.upload, remove: h.remove, signMany: h.signMany })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: h.getUser, mfa: { getAuthenticatorAssuranceLevel: h.aal } } })),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import { verifyAdminAuth, isProfileAdmin, type AdminContext } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { track } from '@/lib/admin/analytics';
import { logError, logWarn } from '@/lib/logger';
import { GET, POST } from '@/app/api/admin/media/route';
import { DELETE } from '@/app/api/admin/media/[asset_id]/route';
import { requireAdminPage } from '@/lib/auth/require-admin-page';

const UID = '11111111-2222-4333-8444-555555555555';
const ASSET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SESSION: AdminContext = { uid: UID, authMethod: 'session' };
const ADMIN_KEY: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };
const DEV: AdminContext = { uid: 'dev-user', authMethod: 'dev_bypass' };
const PNG_URL = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
const LIMITS = [
  ['media_upload_max_bytes', '2000000'],
  ['media_signed_url_ttl_seconds', '600'],
  ['media_list_page_max', '200'],
  ['media_list_cache_seconds', '60'],
  ['media_storage_timeout_ms', '15000'],
].map(([variable_key, variable_value]) => ({ variable_key, variable_value }));
const ROW = {
  asset_id: ASSET, kind: 'ad_creative', path: `ad_creative/${ASSET}.png`, mime: 'image/png', bytes: 8, alt: 'Hero',
  scenario_key: null, position: null, uploaded_by: UID, created_at: new Date('2026-11-09T14:05:00Z'),
};

function req(method: string, body?: unknown): NextRequest {
  const length = String(JSON.stringify(body ?? null).length);
  return {
    method,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? length : null) },
    nextUrl: { pathname: '/api/admin/media', searchParams: new URLSearchParams() },
    json: async () => body,
  } as unknown as NextRequest;
}
const ctx = { params: Promise.resolve({ asset_id: ASSET }) };
const verify = vi.mocked(verifyAdminAuth);
const audit = vi.mocked(writeAdminAudit);

beforeEach(() => {
  vi.clearAllMocks();
  h.poolQuery.mockImplementation(async (sql: string) =>
    sql.includes('logic_variables') ? { rows: LIMITS } : sql.includes('ORDER BY') ? { rows: [ROW] } : { rows: [] },
  );
  h.clientQuery.mockImplementation(async (sql: string) => (sql.includes('FOR UPDATE') ? { rows: [ROW] } : { rows: [], rowCount: 1 }));
  h.upload.mockResolvedValue(undefined);
  h.remove.mockResolvedValue(undefined);
  h.signMany.mockResolvedValue(['https://signed.test/a']);
  audit.mockResolvedValue(undefined);
});

describe('admin media routes — auth boundary', () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ['GET', () => GET(req('GET'))],
    ['POST', () => POST(req('POST', { kind: 'ad_creative', alt: 'Hero', file: PNG_URL }))],
    ['DELETE', () => DELETE(req('DELETE', { confirm: 'Hero' }), ctx)],
  ];

  for (const [method, call] of calls) {
    it(`${method}: 401 when verifyAdminAuth returns null, nothing read or written`, async () => {
      verify.mockResolvedValueOnce(null);
      const res = await call();
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHORIZED');
      expect(h.poolQuery).not.toHaveBeenCalled();
      expect(h.clientQuery).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
      expect(vi.mocked(track)).not.toHaveBeenCalled();
    });

    it(`${method}: 200 on a session admin`, async () => {
      verify.mockResolvedValueOnce(SESSION);
      const res = await call();
      expect(res.status).toBe(200);
    });
  }

  for (const [method, call] of calls.slice(1)) {
    for (const sentinel of [ADMIN_KEY, DEV]) {
      it(`${method}: 403 SESSION_REQUIRED for ${sentinel.authMethod}, no audit, no telemetry, no write`, async () => {
        verify.mockResolvedValueOnce(sentinel);
        const res = await call();
        expect(res.status).toBe(403);
        expect((await res.json()).error.code).toBe('SESSION_REQUIRED');
        expect(audit).not.toHaveBeenCalled();
        expect(vi.mocked(track)).not.toHaveBeenCalled();
        expect(h.clientQuery).not.toHaveBeenCalled();
        expect(h.upload).not.toHaveBeenCalled();
        expect(h.remove).not.toHaveBeenCalled();
        expect(vi.mocked(logWarn)).toHaveBeenCalledTimes(1);
      });
    }
  }

  it('GET reads are allowed for the sentinels (reads are not audited)', async () => {
    verify.mockResolvedValueOnce(DEV);
    expect((await GET(req('GET'))).status).toBe(200);
  });

  it('every audit row carries a non-empty reason and the session uid', async () => {
    verify.mockResolvedValue(SESSION);
    await calls[1]![1]();
    await calls[2]![1]();
    expect(audit).toHaveBeenCalledTimes(2);
    for (const [params] of audit.mock.calls) {
      expect(params.reason.trim().length).toBeGreaterThan(0);
      expect(params.adminUid).toBe(UID);
    }
    expect(audit.mock.calls.map(([p]) => p.action)).toEqual(['media_upload', 'media_delete']);
  });
});

describe('requireAdminPage — parity matrix with verifyAdminAuth', () => {
  const env = { ...process.env };
  const isAdmin = vi.mocked(isProfileAdmin);
  const setEnv = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  beforeEach(() => {
    setEnv({ DEV_MODE: undefined, DEV_ADMIN_UID: undefined, ADMIN_MFA_ENFORCED: undefined });
    h.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
    isAdmin.mockResolvedValue(true);
    h.aal.mockResolvedValue({ data: { currentLevel: 'aal2' } });
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('dev mode with a valid DEV_ADMIN_UID → that uid, no session read', async () => {
    setEnv({ DEV_MODE: 'true', DEV_ADMIN_UID: UID });
    await expect(requireAdminPage()).resolves.toEqual({ uid: UID });
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('dev mode without DEV_ADMIN_UID → allowed as dev-user (read-only; routes 403 its mutations)', async () => {
    setEnv({ DEV_MODE: 'true' });
    await expect(requireAdminPage()).resolves.toEqual({ uid: 'dev-user' });
  });

  it('no session → notFound', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('getUser error (garbage cookie) → notFound + logError session-verify', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') });
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(vi.mocked(logError).mock.calls[0]![2]).toMatchObject({ stage: 'session-verify' });
  });

  it('profiles lookup throws → notFound + logError profiles-lookup (fail closed)', async () => {
    isAdmin.mockRejectedValue(new Error('db down'));
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(vi.mocked(logError).mock.calls[0]![2]).toMatchObject({ stage: 'profiles-lookup' });
  });

  it('non-admin → notFound + logWarn', async () => {
    isAdmin.mockResolvedValue(false);
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(vi.mocked(logWarn)).toHaveBeenCalledTimes(1);
  });

  it('admin → { uid }', async () => {
    await expect(requireAdminPage()).resolves.toEqual({ uid: UID });
  });

  it('MFA enforced at aal1 → notFound; at aal2 → allowed', async () => {
    setEnv({ ADMIN_MFA_ENFORCED: 'true' });
    h.aal.mockResolvedValueOnce({ data: { currentLevel: 'aal1' } });
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(requireAdminPage()).resolves.toEqual({ uid: UID });
  });
});
