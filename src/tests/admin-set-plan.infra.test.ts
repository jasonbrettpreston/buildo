// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3 (dated note 2026-11-14, MF-47: set_plan)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//
// MF-47 (RULED 2026-11-14: "an admin path to change plan_key") · PATCH /api/admin/users/[uid] action set_plan. Lane decision K6 (build-plan section 7):
// the path moves a COMP, i.e. an admin_managed parcel_tool row; on a Stripe-managed row the webhook owns plan_key (a price match rewrites it), so an
// admin override would be silently reverted and the action refuses with 409. Same security spine as its siblings: admin session only (401, admin_key
// 403), target-is-admin 403, Zod 400, the row read FOR UPDATE inside the transaction, ONE audit row in the same transaction carrying the previous
// plan_key.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/verify-admin')>('@/lib/auth/verify-admin');
  return { ...actual, verifyAdminAuth: vi.fn() };
});
vi.mock('@/lib/db/client', () => {
  const query = vi.fn();
  return { pool: { query }, withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) };
});
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/admin/analytics', () => ({ track: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/admin/admin-audit', () => ({ writeAdminAudit: vi.fn().mockResolvedValue(undefined), scrubAdminAuditForTarget: vi.fn().mockResolvedValue(0) }));
vi.mock('@/lib/stripe/client', () => ({ cancelAllStripeSubscriptions: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: {} } }) }));

import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { PATCH } from '@/app/api/admin/users/[uid]/route';

const verify = vi.mocked(verifyAdminAuth);
const query = vi.mocked(pool.query);
const audit = vi.mocked(writeAdminAudit);
const SESSION: AdminContext = { uid: 'admin-session-1', authMethod: 'session' };
const KEY: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };
const TARGET = '00000000-0000-0000-0000-00000000ad47';
const PROFILE = { user_id: TARGET, email: 'user@example.test', account_deleted_at: null };

const req = (body: unknown): NextRequest => ({ method: 'PATCH', nextUrl: { pathname: '/api/admin/users/x', searchParams: new URLSearchParams() }, headers: { get: () => null }, json: async () => body }) as unknown as NextRequest;
const ctx = { params: Promise.resolve({ uid: TARGET }) };
const body = { action: 'set_plan', plan_key: 'pro', reason: 'comp moves to Pro' };

/** is_admin guard -> existing joined row -> the locked entitlement read -> (update) -> re-select. */
function queue(entitlement: { status: string; plan_key: string } | null) {
  query
    .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    .mockResolvedValueOnce({ rows: [PROFILE], rowCount: 1 } as never)
    .mockResolvedValueOnce({ rows: entitlement ? [entitlement] : [], rowCount: entitlement ? 1 : 0 } as never)
    .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
    .mockResolvedValueOnce({ rows: [PROFILE], rowCount: 1 } as never);
}
const updateCall = () => query.mock.calls.find((c) => /UPDATE entitlements/.test(String(c[0])));

beforeEach(() => { vi.clearAllMocks(); query.mockReset(); });

describe('set_plan: the security spine', () => {
  it('no admin session -> 401 before any query', async () => {
    verify.mockResolvedValueOnce(null);
    expect((await PATCH(req(body), ctx)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
  it('the shared admin key cannot write (403) and nothing is queried', async () => {
    verify.mockResolvedValueOnce(KEY);
    expect((await PATCH(req(body), ctx)).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    ['a plan key outside the closed set', { ...body, plan_key: 'gold' }],
    ['no plan key', { action: 'set_plan', reason: 'comp moves to Pro' }],
    ['no reason', { action: 'set_plan', plan_key: 'pro' }],
    ['a reason under 3 characters', { ...body, reason: 'x' }],
  ])('%s -> 400, no write', async (_l, b) => {
    verify.mockResolvedValueOnce(SESSION);
    expect((await PATCH(req(b), ctx)).status).toBe(400);
    expect(updateCall()).toBeUndefined();
  });
  it('a target that is an admin account -> 403, no write', async () => {
    verify.mockResolvedValueOnce(SESSION);
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }], rowCount: 1 } as never);
    expect((await PATCH(req(body), ctx)).status).toBe(403);
    expect(updateCall()).toBeUndefined();
  });
});

describe('set_plan: the write', () => {
  it('moves an admin_managed row: the row is read FOR UPDATE first, the UPDATE is guarded to admin_managed, ONE audit row carries the previous plan', async () => {
    verify.mockResolvedValueOnce(SESSION);
    queue({ status: 'admin_managed', plan_key: 'basic' });
    const res = await PATCH(req(body), ctx);
    expect(res.status).toBe(200);
    const lock = query.mock.calls.findIndex((c) => /FROM entitlements WHERE user_id = \$1 AND product = 'parcel_tool' FOR UPDATE/.test(String(c[0])));
    const upd = query.mock.calls.findIndex((c) => /UPDATE entitlements/.test(String(c[0])));
    expect(lock).toBeGreaterThan(-1);
    expect(upd).toBeGreaterThan(lock);
    expect(String(query.mock.calls[upd]![0])).toMatch(/status = 'admin_managed'/);
    expect(query.mock.calls[upd]![1]).toEqual([TARGET, 'pro']);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'set_plan', targetUid: TARGET, oldValue: { product: 'parcel_tool', plan_key: 'basic' }, newValue: { product: 'parcel_tool', plan_key: 'pro' }, reason: 'comp moves to Pro' }),
      expect.anything(),
    );
  });
  it('no parcel_tool row -> 404, no write, no audit', async () => {
    verify.mockResolvedValueOnce(SESSION);
    queue(null);
    expect((await PATCH(req(body), ctx)).status).toBe(404);
    expect(updateCall()).toBeUndefined();
    expect(audit).not.toHaveBeenCalled();
  });
  it.each(['trial', 'active', 'past_due', 'expired'])('a Stripe-managed row (%s) -> 409, no write, no audit (the webhook owns plan_key there)', async (status) => {
    verify.mockResolvedValueOnce(SESSION);
    queue({ status, plan_key: 'basic' });
    const res = await PATCH(req(body), ctx);
    expect(res.status).toBe(409);
    expect(updateCall()).toBeUndefined();
    expect(audit).not.toHaveBeenCalled();
  });
});
