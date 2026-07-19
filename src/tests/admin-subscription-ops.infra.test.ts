// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Infra battery for the admin Subscription-Ops routes (P26-26-ADMIN). Mocked
// pool + verifyAdminAuth + admin-audit + stripe. Asserts the money-code spine:
//   - verifyAdminAuth 401; admin_key mutation 403 (attributable writes only)
//   - admin-target 403 (profiles.is_admin on the TARGET, P1-F4.4); Zod 400
//     (missing reason)
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

// Entitlements are UUID-keyed — the stored-entitlements read no-ops on
// non-uuid target uids, so reconcile fixtures use a uuid target.
const TARGET = '00000000-0000-0000-0000-00000000e001';

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

// Target-is-admin guard (P1-F4.4): reconcile POST reads profiles.is_admin on
// the TARGET uid via isProfileAdmin — the uuid TARGET consumes ONE leading
// pool.query per POST test; non-UUID targets (retry-cancel 't1') skip it.
beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
});

// ---------------------------------------------------------------------------
// reconcile GET
// ---------------------------------------------------------------------------
describe('GET reconcile (per-product array — W7 shape change)', () => {
  it('401 without admin', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await RECONCILE_GET(req(), ctx(TARGET));
    expect(res.status).toBe(401);
  });

  it('no stripe customer → not reconcilable, stored rows echoed with stripe_status null', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] } as never) // profile
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'trial' }] } as never); // stored entitlements
    const res = await RECONCILE_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      products: [{ product: 'lead_gen', stored_status: 'trial', stripe_status: null, drift: false }],
    });
    expect(body.meta.reason).toBe('no_stripe_customer');
    expect(mockSubsList).not.toHaveBeenCalled();
  });

  it('detects per-product drift when stored diverges from Stripe truth', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'expired' }] } as never);
    // No price on the sub fixture → OD5-default product 'lead_gen'.
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(body.data.products).toEqual([
      expect.objectContaining({ product: 'lead_gen', stored_status: 'expired', stripe_status: 'active', drift: true }),
    ]);
  });

  it('a stored row with NO live subscription reads Stripe truth "expired" (the no-subs case)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'active' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [] });
    const res = await RECONCILE_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(body.data.products).toEqual([
      expect.objectContaining({ product: 'lead_gen', stored_status: 'active', stripe_status: 'expired', drift: true }),
    ]);
  });

  it('protected state (admin_managed) never reports actionable drift', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'admin_managed' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'canceled' }] });
    const res = await RECONCILE_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(body.data.products[0].drift).toBe(false);
    expect(body.meta.protected).toEqual(['lead_gen']);
  });
});

// ---------------------------------------------------------------------------
// reconcile POST (apply)
// ---------------------------------------------------------------------------
describe('POST reconcile apply (per-product — W7)', () => {
  it('admin_key → 403 (unattributable)', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift' } }), ctx(TARGET));
    expect(res.status).toBe(403);
  });

  it('missing reason → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await RECONCILE_POST(req({ body: { apply: true } }), ctx(TARGET));
    expect(res.status).toBe(400);
  });

  it('targeting an admin account (profiles.is_admin true) → 403, nothing else runs', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] } as never); // is_admin guard
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx(TARGET));
    expect(res.status).toBe(403);
    expect(String(mockedQuery.mock.calls[0]![0])).toContain('FROM profiles');
    expect(mockedQuery).toHaveBeenCalledTimes(1); // guard only — no profile load, no Stripe
    expect(mockSubsList).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('protected state (cancelled_pending_deletion) → 409, never mutated', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard (no profiles row)
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'cancelled_pending_deletion' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx(TARGET));
    expect(res.status).toBe(409);
    expect(mockedAudit).not.toHaveBeenCalled();
    // only guard + profile SELECT + stored-entitlements SELECT ran — no upsert
    expect(mockedQuery).toHaveBeenCalledTimes(3);
  });

  it('no drift → applied [], no audit', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'active' }] } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'drift observed' } }), ctx(TARGET));
    const body = await res.json();
    expect(body.data.applied).toEqual([]);
    expect(body.meta.drift).toBe(false);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('drift → fenced entitlements upsert + one audit row per product changed', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never) // profile
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'expired' }] } as never) // stored
      .mockResolvedValueOnce({ rowCount: 1 } as never); // upsert
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'stripe shows active' } }), ctx(TARGET));
    const body = await res.json();
    expect(body.data.applied).toEqual([{ product: 'lead_gen', from: 'expired', to: 'active' }]);
    const upsertSql = String(mockedQuery.mock.calls[3]![0]);
    // Per-product upsert (repairs a missing row too) with the SQL-level fence
    // excluding BOTH protected statuses (P26 review — admin_managed race)
    expect(upsertSql).toMatch(/INSERT INTO entitlements/);
    expect(upsertSql).toMatch(/NOT IN \('cancelled_pending_deletion', 'admin_managed'\)/);
    // Bumps the watermark so a stale webhook can't revert the operator decision
    expect(upsertSql).toMatch(/last_stripe_event_at = NOW\(\)/);
    expect(mockedQuery.mock.calls[3]![1]).toEqual([TARGET, 'lead_gen', 'active']);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription_reconcile_apply',
        oldValue: { product: 'lead_gen', subscription_status: 'expired' },
        newValue: { product: 'lead_gen', subscription_status: 'active' },
        reason: 'stripe shows active',
      }),
      expect.anything(), // the withTransaction client (atomic mutation+audit)
    );
  });

  it('a live subscription with NO stored row is drift the apply REPAIRS (insert arm)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never) // zero stored rows (webhook gap)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // upsert INSERT arm
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'webhook gap repair' } }), ctx(TARGET));
    const body = await res.json();
    expect(body.data.applied).toEqual([{ product: 'lead_gen', from: null, to: 'active' }]);
  });

  it('concurrent state change (upsert rowCount 0) → 409, no false success', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ product: 'lead_gen', status: 'expired' }] } as never)
      .mockResolvedValueOnce({ rowCount: 0 } as never);
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(req({ body: { apply: true, reason: 'stripe shows active' } }), ctx(TARGET));
    expect(res.status).toBe(409);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('optional product body field scopes the apply to that product only', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never) // is_admin guard
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never)
      .mockResolvedValueOnce({
        rows: [
          { product: 'flight_center', status: 'expired' },
          { product: 'lead_gen', status: 'expired' },
        ],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // ONE upsert only
    // Both stored rows drift against the (empty-price → lead_gen) live sub;
    // flight_center's live truth is 'expired' == stored, so only lead_gen
    // drifts anyway — but the scope filter is what we're pinning here.
    mockSubsList.mockResolvedValueOnce({ data: [{ status: 'active' }] });
    const res = await RECONCILE_POST(
      req({ body: { apply: true, reason: 'scoped', product: 'lead_gen' } }),
      ctx(TARGET),
    );
    const body = await res.json();
    expect(body.data.applied).toEqual([{ product: 'lead_gen', from: 'expired', to: 'active' }]);
    expect(mockedAudit).toHaveBeenCalledTimes(1);
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
    mockedQuery.mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] } as never);
    const res = await EVENTS_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.reason).toBe('no_stripe_customer');
  });

  it('surfaces event_type as `type`, newest first; watermark = MAX over the per-product entitlement rows', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] } as never) // profile
      .mockResolvedValueOnce({ rows: [{ last_stripe_event_at: '2026-07-12T09:00:00Z' }] } as never) // MAX(entitlements)
      .mockResolvedValueOnce({ rows: [
        { event_id: 'evt_2', event_type: 'invoice.payment_succeeded', processed_at: '2026-07-12T09:00:00Z' },
        { event_id: 'evt_1', event_type: null, processed_at: '2026-07-11T09:00:00Z' },
      ] } as never);
    const res = await EVENTS_GET(req(), ctx(TARGET));
    const body = await res.json();
    expect(body.data[0]).toEqual({ event_id: 'evt_2', type: 'invoice.payment_succeeded', processed_at: '2026-07-12T09:00:00Z' });
    expect(body.data[1].type).toBeNull(); // pre-mig-221 row → null type, honest
    expect(body.meta.last_stripe_event_at).toBe('2026-07-12T09:00:00Z');
    // The watermark is entitlements-derived now (N2) — MAX across products.
    const watermarkSql = String(mockedQuery.mock.calls[1]![0]);
    expect(watermarkSql).toMatch(/MAX\(last_stripe_event_at\)[\s\S]*FROM entitlements/);
  });
});
