// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//
// Infra tests for the admin User Management routes (mocked pool +
// verifyAdminAuth + admin-audit + firebase-admin). Asserts the security spine:
//   - verifyAdminAuth 401; admin_key mutation/create 403; session/dev allowed
//   - mutation guards: target-is-admin 403 (all actions); self-target
//     destructive 403; Zod 400 (missing reason / bad action)
//   - every mutation writes an admin_audit_log row; delete scrubs
//   - directory search/filter builds parameterized SQL
//   - deletion-window detail view is annotated + audit-logged

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/verify-admin')>('@/lib/auth/verify-admin');
  return { ...actual, verifyAdminAuth: vi.fn() };
});

// withTransaction runs the callback with a client whose .query IS the same
// mocked pool.query, so the mutation's UPDATE (now inside the txn, P24 close-out
// audit-atomicity fix) is still observed by mockedQuery.
vi.mock('@/lib/db/client', () => {
  const query = vi.fn();
  return {
    pool: { query },
    withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
  };
});
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/admin/analytics', () => ({ track: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/admin/admin-audit', () => ({
  writeAdminAudit: vi.fn().mockResolvedValue(undefined),
  scrubAdminAuditForTarget: vi.fn().mockResolvedValue(0),
}));
// No Firebase SDK in the test env → apps.length === 0 (dev synthetic path).
vi.mock('firebase-admin', () => ({ apps: [], auth: () => ({}) }));
vi.mock('@/lib/stripe/client', () => ({ cancelAllStripeSubscriptions: vi.fn().mockResolvedValue(1) }));

import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { writeAdminAudit, scrubAdminAuditForTarget } from '@/lib/admin/admin-audit';
import { cancelAllStripeSubscriptions } from '@/lib/stripe/client';
import { GET as DIR_GET, POST as CREATE_POST } from '@/app/api/admin/users/route';
import { GET as DETAIL_GET, PATCH } from '@/app/api/admin/users/[uid]/route';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedQuery = vi.mocked(pool.query);
const mockedAudit = vi.mocked(writeAdminAudit);
const mockedScrub = vi.mocked(scrubAdminAuditForTarget);
const mockedCancelSubs = vi.mocked(cancelAllStripeSubscriptions);

const SESSION_CTX: AdminContext = { uid: 'admin-session-1', authMethod: 'session' };
const ADMIN_KEY_CTX: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };

function makeRequest(opts: { method?: string; search?: string; body?: unknown } = {}): NextRequest {
  return {
    method: opts.method ?? 'GET',
    nextUrl: { pathname: '/api/admin/users', searchParams: new URLSearchParams(opts.search ?? '') },
    headers: { get: () => null },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as unknown as NextRequest;
}

function makeContext(uid: string) {
  return { params: Promise.resolve({ uid }) };
}

const PROFILE_ROW = {
  user_id: 'target-1',
  email: 'user@example.com',
  trade_slug: 'plumbing',
  trade_slugs_override: null,
  account_preset: 'tradesperson',
  subscription_status: 'trial',
  account_deleted_at: null,
};

// deterministic env for the admin-allowlist guard
const ORIGINAL_ENV = process.env.ADMIN_USER_IDS;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_USER_IDS = 'admin-session-1,other-admin';
  // default: query returns a single profile row unless overridden per-test
  mockedQuery.mockResolvedValue({ rows: [PROFILE_ROW], rowCount: 1 } as never);
});

// ===========================================================================
// Auth gates
// ===========================================================================
describe('admin/users — auth gates', () => {
  it('GET directory → 401 when verifyAdminAuth null (before any query)', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await DIR_GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('PATCH → 401 when verifyAdminAuth null', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'revoke', reason: 'test' } }), makeContext('target-1'));
    expect(res.status).toBe(401);
  });

  it('PATCH → 403 on admin_key (non-attributable mutation)', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'revoke', reason: 'test reason' } }), makeContext('target-1'));
    expect(res.status).toBe(403);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('POST create → 403 on admin_key', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await CREATE_POST(
      makeRequest({ method: 'POST', body: { email: 'a@b.com', account_preset: 'supplier', trade_slugs: ['glazing'], reason: 'onboard supplier' } }),
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Mutation guards
// ===========================================================================
describe('admin/users PATCH — guards', () => {
  it('400 on a body missing the mandatory reason', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'revoke' } }), makeContext('target-1'));
    expect(res.status).toBe(400);
  });

  it('400 on an unknown action', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'nuke', reason: 'x reason' } }), makeContext('target-1'));
    expect(res.status).toBe(400);
  });

  it('403 when targeting an ADMIN_USER_IDS allowlist member (all actions)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'set_preset', account_preset: 'supplier', reason: 'demote admin' } }),
      makeContext('other-admin'),
    );
    expect(res.status).toBe(403);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('403 on self-target for a destructive action', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    // NOTE: admin-session-1 is also in the allowlist, so use a session admin
    // that is NOT allowlisted to isolate the self-target guard.
    process.env.ADMIN_USER_IDS = 'other-admin';
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'delete', reason: 'delete self' } }),
      makeContext('admin-session-1'),
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Mutations write audit rows
// ===========================================================================
describe('admin/users PATCH — mutations audit', () => {
  it('set_trades writes trade_slug=primary + override=rest and audits', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'set_trades', trade_slugs: ['glazing', 'framing'], reason: 'big box multi-trade' } }),
      makeContext('target-1'),
    );
    expect(res.status).toBe(200);
    // UPDATE call carried primary + [override] array
    const updateCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('trade_slugs_override = $3'));
    expect(updateCall?.[1]).toEqual(['target-1', 'glazing', ['framing']]);
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedAudit.mock.calls[0]![0].action).toBe('set_trades');
  });

  it('delete nullifies PII, marks deleted, audits, then scrubs', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    process.env.ADMIN_USER_IDS = 'other-admin'; // target-1 is not an admin
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'delete', reason: 'user requested deletion' } }), makeContext('target-1'));
    expect(res.status).toBe(200);
    const updateCall = mockedQuery.mock.calls.find((c) => String(c[0]).includes('account_deleted_at = NOW()'));
    expect(updateCall).toBeDefined();
    expect(String(updateCall?.[0])).toContain('full_name = NULL');
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedScrub).toHaveBeenCalledWith('target-1');
  });

  // REGRESSION LOCK (P26 review — Code Reviewer CRITICAL): admin delete MUST
  // cancel the Stripe subscription (else the deleted account bills forever with
  // no marker/recovery path). Mirrors the self-serve delete route.
  it('delete cancels the Stripe subscription when the account has a customer', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    process.env.ADMIN_USER_IDS = 'other-admin';
    mockedQuery.mockResolvedValue({ rows: [{ ...PROFILE_ROW, stripe_customer_id: 'cus_admin_del' }], rowCount: 1 } as never);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'delete', reason: 'admin ban' } }), makeContext('target-1'));
    expect(res.status).toBe(200);
    expect(mockedCancelSubs).toHaveBeenCalledWith('cus_admin_del');
  });

  it('delete does NOT call Stripe when the account has no customer', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    process.env.ADMIN_USER_IDS = 'other-admin';
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'delete', reason: 'trial user' } }), makeContext('target-1'));
    expect(res.status).toBe(200);
    expect(mockedCancelSubs).not.toHaveBeenCalled(); // PROFILE_ROW has no stripe_customer_id
  });

  it('extend_trial sets status=trial and audits', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'extend_trial', days: 30, reason: 'goodwill extension' } }), makeContext('target-1'));
    expect(res.status).toBe(200);
    expect(mockedAudit.mock.calls[0]![0].action).toBe('extend_trial');
  });

  it('404 when the target user does not exist', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never); // SELECT existing → empty
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'revoke', reason: 'revoke missing' } }), makeContext('ghost'));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Entitlements swap (plan Item 4 W6 + R7/R8) — per-product mutation writes.
// uuid target: the entitlement helpers no-op on non-uuid uids, so these are
// the cases that exercise the REAL upsert SQL.
// ===========================================================================
describe('admin/users PATCH — entitlements writes (W6)', () => {
  const TARGET_UUID = '00000000-0000-0000-0000-00000000ad01';

  it('revoke upserts status=expired on the lead_gen entitlement (default product) with a FOR UPDATE oldValue read (R8)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [PROFILE_ROW], rowCount: 1 } as never) // existing (joined)
      .mockResolvedValueOnce({ rows: [{ status: 'active', trial_started_at: null }], rowCount: 1 } as never) // FOR UPDATE oldValue
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never) // entitlement upsert
      .mockResolvedValueOnce({ rows: [PROFILE_ROW], rowCount: 1 } as never); // joined re-select
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'revoke', reason: 'chargeback abuse' } }),
      makeContext(TARGET_UUID),
    );
    expect(res.status).toBe(200);
    // R8: the audit oldValue snapshot comes from the row-locked entitlements read.
    const lockSql = String(mockedQuery.mock.calls[1]![0]);
    expect(lockSql).toMatch(/FROM entitlements WHERE user_id = \$1 AND product = \$2 FOR UPDATE/);
    const upsertSql = String(mockedQuery.mock.calls[2]![0]);
    expect(upsertSql).toContain('INSERT INTO entitlements');
    expect(mockedQuery.mock.calls[2]![1]).toEqual([TARGET_UUID, 'lead_gen', 'expired']);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'revoke',
        oldValue: { product: 'lead_gen', subscription_status: 'active' },
        newValue: { product: 'lead_gen', subscription_status: 'expired' },
      }),
      expect.anything(),
    );
  });

  it('extend_trial honours an explicit product and preserves the 14-day window arithmetic', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [PROFILE_ROW], rowCount: 1 } as never) // existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // FOR UPDATE — no row yet
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never) // trial upsert
      .mockResolvedValueOnce({ rows: [PROFILE_ROW], rowCount: 1 } as never); // joined re-select
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'extend_trial', days: 30, product: 'flight_center', reason: 'beta cohort' } }),
      makeContext(TARGET_UUID),
    );
    expect(res.status).toBe(200);
    const upsertSql = String(mockedQuery.mock.calls[2]![0]);
    expect(upsertSql).toMatch(/NOW\(\) - INTERVAL '14 days' \+ make_interval\(days => \$3\)/);
    expect(mockedQuery.mock.calls[2]![1]).toEqual([TARGET_UUID, 'flight_center', 30]);
  });

  it('delete fans out cancelled_pending_deletion to EVERY entitlement row (no product filter)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    process.env.ADMIN_USER_IDS = 'other-admin';
    mockedQuery.mockResolvedValue({ rows: [PROFILE_ROW], rowCount: 1 } as never);
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { action: 'delete', reason: 'user requested deletion' } }),
      makeContext(TARGET_UUID),
    );
    expect(res.status).toBe(200);
    const fanOut = mockedQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE entitlements'));
    expect(fanOut).toBeDefined();
    expect(String(fanOut![0])).toContain(`'cancelled_pending_deletion'`);
    expect(String(fanOut![0])).not.toContain('product =');
    // The user_profiles PII-nullify no longer writes the retired status column.
    const piiUpdate = mockedQuery.mock.calls.find((c) => String(c[0]).includes('account_deleted_at = NOW()'));
    expect(String(piiUpdate![0])).not.toContain('subscription_status');
  });
});

// ===========================================================================
// Directory + detail
// ===========================================================================
describe('admin/users GET directory + detail', () => {
  it('builds a parameterized filter for q + preset + status', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 } as never) // count
      .mockResolvedValueOnce({ rows: [PROFILE_ROW], rowCount: 1 } as never); // rows
    const res = await DIR_GET(makeRequest({ search: 'q=alice&preset=supplier&subscription_status=trial' }));
    expect(res.status).toBe(200);
    const countCall = mockedQuery.mock.calls[0]!;
    expect(String(countCall[0])).toContain('ILIKE');
    expect(countCall[1]).toContain('%alice%');
    expect(countCall[1]).toContain('supplier');
    // R5: the status filter matches the lead_gen entitlement (LEFT JOIN) —
    // applied to the count AND rows queries identically.
    expect(String(countCall[0])).toContain('LEFT JOIN entitlements e');
    expect(String(countCall[0])).toContain('e.status = ');
    const rowsCall = mockedQuery.mock.calls[1]!;
    expect(String(rowsCall[0])).toContain('LEFT JOIN entitlements e');
    expect(String(rowsCall[0])).toContain('e.status AS subscription_status');
  });

  // REGRESSION LOCK (P26 review — Code Reviewer HIGH): the sweep-surface filter
  // Spec 21 §6 promises must actually exist (it was documented but unbuilt).
  it('stripe_cancel_failed=true filters to the marker IS NOT NULL', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const res = await DIR_GET(makeRequest({ search: 'stripe_cancel_failed=true' }));
    expect(res.status).toBe(200);
    expect(String(mockedQuery.mock.calls[0]![0])).toContain('stripe_cancel_failed_at IS NOT NULL');
  });

  it('detail 404 for unknown uid', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const res = await DETAIL_GET(makeRequest(), makeContext('nobody'));
    expect(res.status).toBe(404);
  });

  it('detail of a deletion-window account is annotated + audit-logged', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ ...PROFILE_ROW, account_deleted_at: '2026-07-01T00:00:00Z' }], rowCount: 1 } as never) // detail
      .mockResolvedValueOnce({ rows: [{ saved_count: 2, view_events: 5 }], rowCount: 1 } as never); // counts
    const res = await DETAIL_GET(makeRequest(), makeContext('target-1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { deleted: boolean } };
    expect(body.meta.deleted).toBe(true);
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedAudit.mock.calls[0]![0].action).toBe('view_deleted_account');
  });
});

// ===========================================================================
// Create
// ===========================================================================
describe('admin/users POST create', () => {
  it('creates a supplier (dev synthetic uid), inserts profile, audits', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({
      rows: [{ user_id: 'dev_supplier_x', email: 'a@b.com', account_preset: 'supplier', trade_slug: 'glazing', trade_slugs_override: null, subscription_status: 'admin_managed' }],
      rowCount: 1,
    } as never);
    const res = await CREATE_POST(
      makeRequest({ method: 'POST', body: { email: 'a@b.com', account_preset: 'supplier', trade_slugs: ['glazing'], reason: 'onboard glass co' } }),
    );
    expect(res.status).toBe(200);
    expect(mockedAudit.mock.calls[0]![0].action).toBe('create_account');
  });

  it('400 on an invalid trade slug', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await CREATE_POST(
      makeRequest({ method: 'POST', body: { email: 'a@b.com', account_preset: 'supplier', trade_slugs: ['not-a-trade'], reason: 'bad slug' } }),
    );
    expect(res.status).toBe(400);
  });
});

afterAll(() => {
  process.env.ADMIN_USER_IDS = ORIGINAL_ENV;
});
