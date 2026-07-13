// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Infra battery for the admin Subscription-Ops routes (P26-26-ADMIN). Mocked
// pool + verifyAdminAuth + admin-audit + stripe. Asserts the money-code spine:
//   - verifyAdminAuth 401; admin_key mutation 403 (attributable writes only)
//   - allowlist-target 403; Zod 400 (missing reason)
//   - reconcile PROTECTED-STATE fence (deleted/comp → 409, never mutated)
//   - reconcile drift → UPDATE + audit; no-drift → no audit; concurrent-delete
//     fence (rowCount 0 → 409)
//   - retry-cancel: no-marker 400; success clears marker + audits; Stripe throw
//     → 502 with marker RETAINED (no false success)
//   - events: per-customer history, event_type surfaced as `type`

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/verify-admin')>('@/lib/auth/verify-admin');
  return { ...actual, verifyAdminAuth: vi.fn() };
});
// pool.query AND the withTransaction client.query route to the SAME mock, so the
// existing call-index assertions (SELECT = call 0, UPDATE = call 1) still hold
// after the reconcile/retry-cancel routes moved their mutation+audit into a
// transaction (P26 review — atomicity fix).
vi.mock('@/lib/db/client', () => {
  const q = vi.fn();
  return {
    pool: { query: q },
    withTransaction: vi.fn(async (fn: (c: { query: typeof q }) => unknown) => fn({ query: q })),
  };
});
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/admin/admin-audit', () => ({ writeAdminAudit: vi.fn().mockResolvedValue(undefined) }));

const mockSubsList = vi.fn();
const mockSubsUpdate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { list: mockSubsList, update: mockSubsUpdate },
  })),
}));

import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { GET as RECONCILE_GET, POST as RECONCILE_POST } from '@/app/api/admin/users/[uid]/subscription/reconcile/route';
import { POST as RETRY_POST } from '@/app/api/admin/users/[uid]/subscription/retry-cancel/route';
import { GET as EVENTS_GET } from '@/app/api/admin/users/[uid]/subscription/events/route';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedQuery = vi.mocked(pool.query);
const mockedAudit = vi.mocked(writeAdminAudit);

const SESSION_CTX: AdminContext = { uid: 'admin-session-1', authMethod: 'session' };
const ADMIN_KEY_CTX: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };

function req(opts: { body?: unknown; search?: string } = {}): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname: '/x', searchParams: new URLSearchParams(opts.search ?? '') },
    headers: { get: () => null },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as unknown as NextRequest;
}
const ctx = (uid: string) => ({ params: Promise.resolve({ uid }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.ADMIN_USER_IDS = 'admin-session-1';
});

// ---------------------------------------------------------------------------
// reconcile GET
// ---------------------------------------------------------------------------
describe('GET reconcile', () => {
  it('401 without admin', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await RECONCILE_GET(req(), ctx('t1'));
    expect(res.status).toBe(401);
  });

  it('no stripe customer → not reconcilable, drift false', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ subscription_status: 'trial', stripe_customer_id: null }] } as never);
    const res = await RECONCILE_GET(req(), ctx('t1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ stored_status: 'trial', stripe_status: null, drift: false });
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('detects drift when stored diverges from Stripe truth', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ subscription_status: 'expired', stripe_customer_id: 'cus_1' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_GET(req(), ctx('t1'));
    const body = await res.json();
    expect(body.data).toEqual({ stored_status: 'expired', stripe_status: 'active', drift: true });
  });

  it('protected state (admin_managed) never reports actionable drift', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ subscription_status: 'admin_managed', stripe_customer_id: 'cus_1' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'canceled' }] });
    const res = await RECONCILE_GET(req(), ctx('t1'));
    const body = await res.json();
    expect(body.data.drift).toBe(false);
    expect(body.meta.protected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reconcile POST (apply)
// ---------------------------------------------------------------------------
describe('POST reconcile apply', () => {
  it('admin_key → 403 (unattributable)', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift' } }), ctx('t1'));
    expect(res.status).toBe(403);
  });

  it('missing reason → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await RECONCILE_POST(req({ body: { apply: true } }), ctx('t1'));
    expect(res.status).toBe(400);
  });

  it('targeting an admin allowlist member → 403', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx('admin-session-1'));
    expect(res.status).toBe(403);
  });

  it('protected state (cancelled_pending_deletion) → 409, never mutated', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ subscription_status: 'cancelled_pending_deletion', stripe_customer_id: 'cus_1' }] } as never);
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx('t1'));
    expect(res.status).toBe(409);
    expect(mockedAudit).not.toHaveBeenCalled();
    // only the SELECT ran — no UPDATE
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('no drift → applied:false, no audit', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ subscription_status: 'active', stripe_customer_id: 'cus_1' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx('t1'));
    const body = await res.json();
    expect(body.data.applied).toBe(false);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('drift → UPDATE (fenced) + audit written', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ subscription_status: 'expired', stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // UPDATE
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'stripe shows active' } }), ctx('t1'));
    const body = await res.json();
    expect(body.data).toMatchObject({ stored_status: 'expired', stripe_status: 'active', applied: true });
    const updateSql = String(mockedQuery.mock.calls[1]![0]);
    // Fence excludes BOTH protected statuses (P26 review — admin_managed race)
    expect(updateSql).toMatch(/NOT IN \('cancelled_pending_deletion', 'admin_managed'\)/);
    // Bumps the watermark so a stale webhook can't revert the operator decision
    expect(updateSql).toMatch(/last_stripe_event_at = NOW\(\)/);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription_reconcile_apply',
        oldValue: { subscription_status: 'expired' },
        newValue: { subscription_status: 'active' },
        reason: 'stripe shows active',
      }),
      expect.anything(), // the withTransaction client (atomic mutation+audit)
    );
  });

  it('concurrent deletion (UPDATE rowCount 0) → 409, no false success', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ subscription_status: 'expired', stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rowCount: 0 } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'stripe shows active' } }), ctx('t1'));
    expect(res.status).toBe(409);
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// retry-cancel POST
// ---------------------------------------------------------------------------
describe('POST retry-cancel', () => {
  it('admin_key → 403', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await RETRY_POST(req({ body: { reason: 'retry' } }), ctx('t1'));
    expect(res.status).toBe(403);
  });

  it('no outstanding marker → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1', stripe_cancel_failed_at: null }] } as never);
    const res = await RETRY_POST(req({ body: { reason: 'operator retry' } }), ctx('t1'));
    expect(res.status).toBe(400);
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('success → cancels, clears marker, audits', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1', stripe_cancel_failed_at: '2026-07-12T00:00:00Z', account_deleted_at: '2026-07-12T00:00:00Z' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // clear marker
    mockSubsList.mockResolvedValueOnce({ data: [{ id: 'sub_a', status: 'active' }] });
    mockSubsUpdate.mockResolvedValueOnce({});
    const res = await RETRY_POST(req({ body: { reason: 'operator retry' } }), ctx('t1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ cleared: true, cancelled_count: 1 });
    expect(mockSubsUpdate).toHaveBeenCalledWith('sub_a', { cancel_at_period_end: true });
    const clearSql = String(mockedQuery.mock.calls[1]![0]);
    expect(clearSql).toMatch(/stripe_cancel_failed_at = NULL/);
    expect(mockedAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subscription_retry_cancel' }), expect.anything());
  });

  it('Stripe throw → 502, marker RETAINED (no clear, no false success)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1', stripe_cancel_failed_at: '2026-07-12T00:00:00Z', account_deleted_at: '2026-07-12T00:00:00Z' }] } as never);
    mockSubsList.mockRejectedValueOnce(new Error('stripe down'));
    const res = await RETRY_POST(req({ body: { reason: 'operator retry' } }), ctx('t1'));
    expect(res.status).toBe(502);
    // no clear UPDATE, no audit
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  // REGRESSION LOCK (P26 review — Reality-Check HIGH): a REACTIVATED account
  // (account_deleted_at NULL) with a stale marker must clear the marker WITHOUT
  // touching Stripe — else the sweep/retry would cancel the user's new, live,
  // paying subscription.
  it('reactivated account (account_deleted_at NULL) → clears marker, NO Stripe cancel', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_new', stripe_cancel_failed_at: '2026-07-12T00:00:00Z', account_deleted_at: null }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // clear marker
    const res = await RETRY_POST(req({ body: { reason: 'sweep' } }), ctx('t1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ cleared: true, cancelled_count: 0 });
    expect(body.meta.note).toBe('stale_marker_account_reactivated');
    expect(mockSubsList).not.toHaveBeenCalled(); // the live subscription is untouched
    expect(mockSubsUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// events GET
// ---------------------------------------------------------------------------
describe('GET events', () => {
  it('401 without admin', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await EVENTS_GET(req(), ctx('t1'));
    expect(res.status).toBe(401);
  });

  it('no stripe customer → empty list', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ stripe_customer_id: null, last_stripe_event_at: null }] } as never);
    const res = await EVENTS_GET(req(), ctx('t1'));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.reason).toBe('no_stripe_customer');
  });

  it('surfaces event_type as `type`, newest first', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1', last_stripe_event_at: '2026-07-12T09:00:00Z' }] } as never)
      .mockResolvedValueOnce({ rows: [
        { event_id: 'evt_2', event_type: 'invoice.payment_succeeded', processed_at: '2026-07-12T09:00:00Z' },
        { event_id: 'evt_1', event_type: null, processed_at: '2026-07-11T09:00:00Z' },
      ] } as never);
    const res = await EVENTS_GET(req(), ctx('t1'));
    const body = await res.json();
    expect(body.data[0]).toEqual({ event_id: 'evt_2', type: 'invoice.payment_succeeded', processed_at: '2026-07-12T09:00:00Z' });
    expect(body.data[1].type).toBeNull(); // pre-mig-221 row → null type, honest
    expect(body.meta.last_stripe_event_at).toBe('2026-07-12T09:00:00Z');
  });
});
