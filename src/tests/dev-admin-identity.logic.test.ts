// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8.1
//             docs/specs/00-architecture/13_authentication.md §4a (dev-bypass failure mode)
//             migrations/229_uid_uuid_fk_conversion.sql:104-106 (admin_uid UUID + FK)
//             migrations/226_profiles_admin_bootstrap.sql:25 (profiles.id → auth.users)
//
// The DEV-ADMIN IDENTITY (WF3 SEC-1 Integration fold, 2026-09-15).
//
// SEC-1 made every admin mutation audited and session-only, which killed the
// local admin write surface: `isDevMode()` returned the shared `'dev-user'`
// sentinel and all 13 mutations 403'd. The ruling: in dev mode only,
// `DEV_ADMIN_UID` resolves the bypass to a REAL uuid with `session` semantics,
// so mutations run and their audit rows are attributable.
//
// The thing these locks exist to prevent is the obvious one: that this becomes
// a production admin bypass. Both directions, on both flags.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/auth/get-user', () => ({ getVerifiedUid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/admin/backup-codes', () => ({ consumeBackupCode: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { verifyAdminAuth } from '@/lib/auth/verify-admin';

const DEV_ADMIN_UID = '00000000-0000-4000-8000-0000000000de';
const ORIGINAL_ENV = { ...process.env };

function getRequest(): NextRequest {
  // GET — a read, so the §13 CSRF gate (mutating methods only) is not in play
  // and the dev branch is the first thing evaluated.
  return {
    method: 'GET',
    headers: { get: () => null },
    cookies: { get: () => undefined, getAll: () => [] },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  // `NODE_ENV` is typed read-only; the cast is the same one src/tests/setup.ts uses.
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.DEV_MODE = 'true';
  delete process.env.DEV_ADMIN_UID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('DEV_ADMIN_UID — dev mode resolves to an AUDITABLE identity', () => {
  it('dev mode + a uuid DEV_ADMIN_UID → session semantics with that uuid', async () => {
    process.env.DEV_ADMIN_UID = DEV_ADMIN_UID;
    const ctx = await verifyAdminAuth(getRequest());
    expect(ctx).toEqual({ uid: DEV_ADMIN_UID, authMethod: 'session' });
    // `session` is what every SEC-1 mutation gate tests for, so this is the
    // whole point: the admin write surface is alive locally…
    expect(ctx?.authMethod).toBe('session');
    // …and `admin_audit_log.admin_uid` (UUID NOT NULL, FK → auth.users) can
    // actually accept the value, which the 'dev-user' sentinel never could.
    expect(ctx?.uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('dev mode with DEV_ADMIN_UID UNSET → the original sentinel, unchanged', async () => {
    // The opt-in must not change anybody's behaviour by existing. This is the
    // byte-identical pre-fold result: mutations still 403, reads still work.
    const ctx = await verifyAdminAuth(getRequest());
    expect(ctx).toEqual({ uid: 'dev-user', authMethod: 'dev_bypass' });
  });

  it('a NON-UUID DEV_ADMIN_UID falls back to the sentinel rather than half-working', async () => {
    // A non-uuid would pass the session gate and then raise 22P02/23503 inside
    // the mutation transaction. Refusing at the guard keeps the failure at the
    // gate, where it is legible.
    process.env.DEV_ADMIN_UID = 'dev-admin';
    const ctx = await verifyAdminAuth(getRequest());
    expect(ctx).toEqual({ uid: 'dev-user', authMethod: 'dev_bypass' });
  });
});

describe('DEV_ADMIN_UID — production is unreachable (both flags, both directions)', () => {
  it('NODE_ENV=production + DEV_MODE=true + DEV_ADMIN_UID → NOT a dev admin', async () => {
    // `isDevMode()` itself already requires NODE_ENV !== 'production', so the
    // dev branch is not even entered; the guard falls through to the real
    // session path, whose mocked resolver returns null.
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.DEV_ADMIN_UID = DEV_ADMIN_UID;
    const ctx = await verifyAdminAuth(getRequest());
    expect(ctx).toBeNull();
  });

  it('DEV_MODE unset + DEV_ADMIN_UID set → NOT a dev admin, in any NODE_ENV', async () => {
    delete process.env.DEV_MODE;
    process.env.DEV_ADMIN_UID = DEV_ADMIN_UID;
    expect(await verifyAdminAuth(getRequest())).toBeNull();
  });

  it("DEV_MODE='false' is not truthy-coerced", async () => {
    process.env.DEV_MODE = 'false';
    process.env.DEV_ADMIN_UID = DEV_ADMIN_UID;
    expect(await verifyAdminAuth(getRequest())).toBeNull();
  });

  it('SOURCE LOCK — the dev-admin branch is gated on NODE_ENV !== production independently of isDevMode()', () => {
    // Spec 13 §4a's two-flag defense, restated on the branch that hands out a
    // real admin uuid: one misconfigured variable must never be enough.
    const src = fs.readFileSync(path.join(__dirname, '../lib/auth/verify-admin.ts'), 'utf-8');
    const branch = src.slice(src.indexOf('if (isDevMode())'), src.indexOf("authMethod: 'dev_bypass' }"));
    expect(branch).toContain("process.env.NODE_ENV !== 'production'");
    expect(branch).toContain('isUuid(devAdminUid)');
  });
});
