// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract, §6 Route Logic
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5
//
// Entitlements rewrite (`.cursor/phase1_plan.md` P1-F5.2): GET/PATCH source
// subscription_status/trial_started_at from the lead_gen entitlements LEFT
// JOIN; PATCH's trial bootstrap is an entitlements INSERT riding a new
// withTransaction boundary [fold 21]; delete fans out entitlement rows; the
// reactivate/delete describes exercise the per-product writes.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));
// The routes now use BOTH the `query` helper (reads outside transactions) and
// `withTransaction` (atomic write groups — fold 21). The transaction client's
// query returns pg QueryResult shapes ({rowCount, rows}); the `query` helper
// returns bare row arrays.
const fakeTxQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: fakeTxQuery }),
  ),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));
vi.mock('@/lib/api/with-api-envelope', () => ({
  withApiEnvelope: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET, PATCH } from '@/app/api/user-profile/route';
import { POST as DELETE_POST } from '@/app/api/user-profile/delete/route';
import { POST as REACTIVATE_POST } from '@/app/api/user-profile/reactivate/route';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';

const mockGetUser = getUserIdFromSession as ReturnType<typeof vi.fn>;
const mockQuery = query as ReturnType<typeof vi.fn>;

// entitlements is UUID-keyed (FK auth.users) — post-chokepoint-swap uids are
// Supabase uuids, and the entitlement helpers no-op on non-uuid shapes, so
// the fixtures use a uuid to exercise the REAL write paths.
const UID = '00000000-0000-0000-0000-000000000abc';

const BASE_PROFILE = {
  user_id: UID,
  trade_slug: 'plumbing',
  display_name: 'Alice',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  full_name: null,
  phone_number: null,
  company_name: null,
  email: null,
  backup_email: null,
  default_tab: null,
  location_mode: null,
  home_base_lat: null,
  home_base_lng: null,
  radius_km: null,
  supplier_selection: null,
  lead_views_count: 0,
  // R6: sourced from the entitlements LEFT JOIN now — null = zero-entitlement
  // user (the join's natural product for a missing row).
  subscription_status: null,
  trial_started_at: null,
  stripe_customer_id: null,
  onboarding_complete: false,
  tos_accepted_at: null,
  account_deleted_at: null,
  account_preset: null,
  trade_slugs_override: null,
  radius_cap_km: null,
  // Spec 99 §9.14: notification_prefs JSONB flattened to 5 sibling fields in
  // migration 117. NOT NULL with defaults — every fixture row carries them.
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
};

function makeGET(uid?: string): NextRequest {
  const req = new NextRequest('http://localhost/api/user-profile');
  if (uid) req.headers.set('authorization', `Bearer ${uid}`);
  return req;
}

function makePATCH(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user-profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePOST(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'POST' });
}

describe('GET /api/user-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spec 96 §10 Step 4's two entitlement helpers (applyFallbackTrialInitIfNeeded
    // and applyTrialExpirationIfNeeded, per-product now) run BEFORE the SELECT.
    // In the common test path neither predicate matches, so they no-op and
    // return empty rows. mockResolvedValue([]) is the safe default; tests that
    // exercise the SELECT use mockResolvedValueOnce on top of this default.
    mockQuery.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await GET(makeGET());
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown uid', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    // Helpers + SELECT all return empty for unknown uid — default mockQuery
    // resolves to [] for every call, so no Once stubs are needed here.
    const res = await GET(makeGET());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 with full profile row', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery
      .mockResolvedValueOnce([]) // applyFallbackTrialInitIfNeeded — predicate doesn't match
      .mockResolvedValueOnce([]) // applyTrialExpirationIfNeeded — predicate doesn't match
      .mockResolvedValueOnce([BASE_PROFILE]); // final joined SELECT
    const res = await GET(makeGET());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof BASE_PROFILE };
    expect(body.data.user_id).toBe(UID);
    expect(body.data.trade_slug).toBe('plumbing');
  });

  it('GET sets Cache-Control: no-store (WF3 hardening — trial-state writes on GET must not be proxy-cached)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BASE_PROFILE]);
    const res = await GET(makeGET());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('GET SELECT is the entitlements-joined client-safe projection (no SELECT *, no internal columns)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BASE_PROFILE]);
    await GET(makeGET());
    // The third call is the final profile SELECT.
    const finalSelectSql = String(mockQuery.mock.calls[2]?.[0] ?? '');
    expect(finalSelectSql).not.toContain('SELECT *');
    expect(finalSelectSql).not.toContain('stripe_customer_id');
    expect(finalSelectSql).not.toContain('radius_cap_km');
    expect(finalSelectSql).not.toContain('trade_slugs_override');
    // Sanity: the SELECT must include user_id (canonical identifier) and the
    // entitlements join sourcing the frozen mobile-contract field names (R6).
    expect(finalSelectSql).toContain('up.user_id');
    expect(finalSelectSql).toMatch(/LEFT JOIN entitlements e/);
    expect(finalSelectSql).toMatch(/e\.status AS subscription_status/);
    expect(finalSelectSql).toMatch(/e\.trial_started_at/);
  });

  it('trial helpers run per-product against entitlements (lead_gen, OD5) before the SELECT', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BASE_PROFILE]);
    await GET(makeGET());
    const initSql = String(mockQuery.mock.calls[0]?.[0] ?? '');
    const expireSql = String(mockQuery.mock.calls[1]?.[0] ?? '');
    expect(initSql).toMatch(/INSERT INTO entitlements/);
    expect(expireSql).toMatch(/UPDATE entitlements/);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([UID, 'lead_gen']);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([UID, 'lead_gen']);
  });

  it('returns 403 with days_remaining for deleted account', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    const deletedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockQuery
      .mockResolvedValueOnce([]) // applyFallbackTrialInitIfNeeded
      .mockResolvedValueOnce([]) // applyTrialExpirationIfNeeded
      .mockResolvedValueOnce([{ ...BASE_PROFILE, account_deleted_at: deletedAt }]); // SELECT
    const res = await GET(makeGET());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; days_remaining: number } };
    expect(body.error.code).toBe('ACCOUNT_DELETED');
    expect(body.error.days_remaining).toBe(25);
  });

  it('returns 500 without raw error message on DB failure', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockRejectedValueOnce(new Error('PG connection lost: secret details'));
    const res = await GET(makeGET());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('PG connection lost');
    expect(text).not.toContain('secret details');
  });
});

describe('PATCH /api/user-profile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /** Standard write-path stubs: the txn runs UPDATE → (optional trial INSERT)
   *  → final joined SELECT. */
  function stubTxnWrite(finalRow: Record<string, unknown>, opts: { updateRowCount?: number } = {}) {
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE user_profiles')) {
        return { rowCount: opts.updateRowCount ?? 1, rows: [{ user_id: UID }] };
      }
      if (sql.includes('INSERT INTO entitlements')) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [finalRow] }; // final joined SELECT
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when trade_slug in body differs from existing (immutability guard)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ trade_slug: 'hvac' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TRADE_IMMUTABLE');
  });

  it('returns 200 when new user sets trade_slug for first time (trade_slug IS NULL)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    // Existing row has null trade_slug (new user, auto-created by UPSERT)
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    const updated = { ...BASE_PROFILE, trade_slug: 'plumbing' };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.trade_slug).toBe('plumbing');
  });

  it('PATCH trade_slug first-write uses atomic precondition (WF3 hardening — race-safe)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    stubTxnWrite({ ...BASE_PROFILE, trade_slug: 'plumbing' });
    await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    const updateCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toMatch(/WHERE\s+user_id\s*=\s*\$1\s+AND\s+trade_slug\s+IS\s+NULL/i);
  });

  it('returns 409 TRADE_RACE_LOST when concurrent PATCH won the trade_slug first-write (WF3 hardening)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    // Initial SELECT shows trade_slug NULL (we believe we have the lock)
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    // UPDATE returns 0 rows (precondition failed — concurrent winner already set it)
    stubTxnWrite(BASE_PROFILE, { updateRowCount: 0 });
    // Reconciliation SELECT returns the winner's value
    mockQuery.mockResolvedValueOnce([{ trade_slug: 'electrical' }]);
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    expect(res.status).toBe(409);
    const body = await res.json() as {
      error: { code: string; existing_trade_slug: string | null };
    };
    expect(body.error.code).toBe('TRADE_RACE_LOST');
    expect(body.error.existing_trade_slug).toBe('electrical');
  });

  it('PATCH response row comes from the joined client-safe SELECT (no RETURNING * leakage)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]); // existing
    stubTxnWrite(BASE_PROFILE);
    await PATCH(makePATCH({ full_name: 'New Name' }));
    const updateCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall![0] as string;
    expect(sql).not.toContain('RETURNING *');
    expect(sql).not.toContain('stripe_customer_id');
    expect(sql).not.toContain('radius_cap_km');
    expect(sql).not.toContain('trade_slugs_override');
    // The response projection is the entitlements-joined client-safe list.
    const selectCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('LEFT JOIN entitlements'),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toMatch(/e\.status AS subscription_status/);
  });

  it('returns 200 when trade_slug matches existing (idempotency — falls through, does NOT add trade_slug to SET clause)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    // First query: fetch existing row
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    // PATCH body has only trade_slug (matching existing) — no other writable
    // fields, so setClauses.length === 0 path runs the "no writable fields"
    // SELECT (outside the txn) instead of an UPDATE.
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    expect(res.status).toBe(200);
    expect(fakeTxQuery).not.toHaveBeenCalled();
  });

  it('PATCH { trade_slug: <existing>, full_name: "X" } applies full_name and skips trade_slug (WF3 Phase 7 fix — Gemini CRITICAL #2)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]); // existing
    stubTxnWrite({ ...BASE_PROFILE, full_name: 'New Name' });
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing', full_name: 'New Name' }));
    expect(res.status).toBe(200);
    const updateCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall![0] as string;
    // Must include full_name SET clause
    expect(sql).toMatch(/full_name\s*=\s*\$\d+/);
    // Must NOT include trade_slug SET clause (value unchanged — silent drop is correct here)
    expect(sql).not.toMatch(/trade_slug\s*=\s*\$\d+/);
  });

  it('returns updated row for valid PATCH fields', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, full_name: 'Bob', updated_at: '2026-02-01T00:00:00Z' };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.full_name).toBe('Bob');
  });

  it('onboarding completion bootstraps the lead_gen trial ENTITLEMENT inside the SAME transaction [fold 21]', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { ...BASE_PROFILE, location_mode: 'gps_live', tos_accepted_at: '2026-01-01T00:00:00Z' },
    ]);
    stubTxnWrite({ ...BASE_PROFILE, onboarding_complete: true, subscription_status: 'trial' });
    const res = await PATCH(makePATCH({ onboarding_complete: true }));
    expect(res.status).toBe(200);
    // Both the user_profiles UPDATE and the entitlements INSERT ran on the
    // SAME transaction client — a mid-write failure rolls back both.
    const trialCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO entitlements'),
    );
    expect(trialCall).toBeDefined();
    expect(trialCall![0]).toMatch(/ON CONFLICT \(user_id, product\) DO NOTHING/);
    expect(trialCall![1]).toEqual([UID, 'lead_gen']);
    // Legacy columns must be absent from the UPDATE's SET clause (grep gate).
    const updateCall = fakeTxQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE user_profiles'),
    );
    expect(updateCall![0]).not.toContain('subscription_status');
    expect(updateCall![0]).not.toContain('trial_started_at');
  });

  it('a failing trial-entitlement INSERT propagates (transaction rollback semantics, §11 fold-21 verification)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([
      { ...BASE_PROFILE, location_mode: 'gps_live', tos_accepted_at: '2026-01-01T00:00:00Z' },
    ]);
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE user_profiles')) return { rowCount: 1, rows: [{ user_id: UID }] };
      if (sql.includes('INSERT INTO entitlements')) throw new Error('forced entitlement failure');
      return { rowCount: 1, rows: [BASE_PROFILE] };
    });
    const res = await PATCH(makePATCH({ onboarding_complete: true }));
    // The route must NOT swallow the second statement's failure — it
    // propagates out of withTransaction (which rolls back the UPDATE) and
    // surfaces as a sanitized 500. Swallowing it here would commit
    // onboarding_complete=true with no entitlement row.
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('forced entitlement failure');
  });

  it('applies radius_cap_km to incoming radius_km', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, radius_cap_km: 25 }]);
    const capped = { ...BASE_PROFILE, radius_km: 25 };
    stubTxnWrite(capped);
    const res = await PATCH(makePATCH({ radius_km: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof capped };
    expect(body.data.radius_km).toBe(25);
  });

  it('does not cap radius_km when radius_cap_km is NULL', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, radius_cap_km: null }]);
    const uncapped = { ...BASE_PROFILE, radius_km: 50 };
    stubTxnWrite(uncapped);
    const res = await PATCH(makePATCH({ radius_km: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof uncapped };
    expect(body.data.radius_km).toBe(50);
  });

  it('returns 403 for deleted account', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_deleted_at: new Date().toISOString() }]);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when onboarding_complete=true but trade_slug is null', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    const res = await PATCH(makePATCH({
      onboarding_complete: true,
      location_mode: 'gps_live',
      tos_accepted_at: '2026-01-01T00:00:00Z',
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('returns 400 when onboarding_complete=true but location_mode not set', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, location_mode: null }]);
    const res = await PATCH(makePATCH({
      onboarding_complete: true,
      tos_accepted_at: '2026-01-01T00:00:00Z',
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('strips email field silently — returns 200 with email unchanged on profile', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, full_name: 'Bob', updated_at: '2026-02-01T00:00:00Z' };
    stubTxnWrite(updated);
    // email is not in UserProfileUpdateSchema — Zod .strip() silently discards it
    const res = await PATCH(makePATCH({ full_name: 'Bob', email: 'hacker@evil.com' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.email).toBeNull();
  });

  it('returns 500 without raw error message on DB failure', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockRejectedValueOnce(new Error('internal pg failure: secret'));
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('internal pg failure');
    expect(text).not.toContain('secret');
  });
});

describe('PATCH /api/user-profile — location coherence (Spec 95 §7)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function stubTxnWrite(finalRow: Record<string, unknown>) {
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE user_profiles')) return { rowCount: 1, rows: [{ user_id: UID }] };
      return { rowCount: 1, rows: [finalRow] };
    });
  }

  it('returns 400 LOCATION_COORDS_REQUIRED when home_base_fixed sent without any coords', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    // Existing row has no coords (null) — effective state would violate constraint
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 400 when home_base_fixed sent with lat but missing lng', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lat: 43.65 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 400 when home_base_fixed sent with lng but missing lat', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lng: -79.38 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 200 when home_base_fixed sent with both coords', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.location_mode).toBe('home_base_fixed');
  });

  it('returns 200 when home_base_fixed sent without coords but existing row already has both', async () => {
    // User already has coords set — just updating location_mode to fixed is valid
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed' }));
    expect(res.status).toBe(200);
  });

  it('auto-clears coords when switching to gps_live — response has null lat/lng', async () => {
    // Existing row has coords set from a previous home_base_fixed session
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'gps_live', home_base_lat: null, home_base_lng: null };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ location_mode: 'gps_live' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.home_base_lat).toBeNull();
    expect(body.data.home_base_lng).toBeNull();
  });

  it('gps_live with explicit null coords also returns 200', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'gps_live', home_base_lat: null, home_base_lng: null };
    stubTxnWrite(updated);
    const res = await PATCH(makePATCH({ location_mode: 'gps_live', home_base_lat: null, home_base_lng: null }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/user-profile/delete', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));
    expect(res.status).toBe(401);
  });

  it('returns 200 ok:true and fans deletion out to EVERY entitlement row (W5, one transaction)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: null }]);
    fakeTxQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
    // Same transaction client: account flag + entitlement fan-out.
    const profileUpdate = fakeTxQuery.mock.calls.find(
      (c) => (c[0] as string).startsWith('UPDATE user_profiles'),
    );
    expect(profileUpdate).toBeDefined();
    // The legacy subscription_status write is GONE from user_profiles.
    expect(profileUpdate![0]).not.toContain('subscription_status');
    const entitlementUpdate = fakeTxQuery.mock.calls.find(
      (c) => (c[0] as string).includes('UPDATE entitlements'),
    );
    expect(entitlementUpdate).toBeDefined();
    expect(entitlementUpdate![0]).toContain(`'cancelled_pending_deletion'`);
    // Account-level: NO product filter — every product's row flips.
    expect(entitlementUpdate![0]).not.toContain('product =');
    expect(entitlementUpdate![1]).toEqual([UID]);
  });

  it('returns 200 ok:true when already deleted (idempotency)', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: new Date().toISOString(), stripe_customer_id: null }]);
    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));
    expect(res.status).toBe(200);
    expect(fakeTxQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/user-profile/reactivate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when account is not deleted', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, account_preset: null }]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_DELETED');
  });

  it('returns 400 when 30-day window expired', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    const deletedAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: deletedAt, account_preset: null }]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('RECOVERY_WINDOW_EXPIRED');
  });

  it('standard account with no Stripe customer: the catch-all flips deletion-stuck rows to expired', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    const deletedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: deletedAt, account_preset: null, stripe_customer_id: null },
    ]);
    const restored = { ...BASE_PROFILE, account_deleted_at: null, subscription_status: 'expired' };
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('LEFT JOIN entitlements')) return { rowCount: 1, rows: [restored] };
      return { rowCount: 1, rows: [] };
    });
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof restored };
    expect(body.data.subscription_status).toBe('expired');
    // W4 catch-all: nothing stays stuck in the deletion state; the watermark
    // is RE-STAMPED (not nulled) so stale events can't downgrade the restore.
    const catchAll = fakeTxQuery.mock.calls.find(
      (c) => (c[0] as string).includes(`status = 'expired'`),
    );
    expect(catchAll).toBeDefined();
    expect(catchAll![0]).toContain(`status = 'cancelled_pending_deletion'`);
    expect(catchAll![0]).toContain('last_stripe_event_at = NOW()');
    // Account-level restore on user_profiles no longer touches status columns.
    const profileUpdate = fakeTxQuery.mock.calls.find(
      (c) => (c[0] as string).includes('account_deleted_at = NULL'),
    );
    expect(profileUpdate).toBeDefined();
    expect(profileUpdate![0]).not.toContain('subscription_status');
  });

  it('manufacturer accounts restore admin_managed on the lead_gen entitlement', async () => {
    mockGetUser.mockResolvedValueOnce(UID);
    const deletedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([
      { account_deleted_at: deletedAt, account_preset: 'manufacturer', stripe_customer_id: null },
    ]);
    const restored = { ...BASE_PROFILE, account_deleted_at: null, subscription_status: 'admin_managed' };
    fakeTxQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('LEFT JOIN entitlements')) return { rowCount: 1, rows: [restored] };
      return { rowCount: 1, rows: [] };
    });
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof restored };
    expect(body.data.subscription_status).toBe('admin_managed');
    // The manufacturer path upserts admin_managed on (uid, lead_gen).
    const upsert = fakeTxQuery.mock.calls.find(
      (c) => (c[0] as string).includes('INSERT INTO entitlements'),
    );
    expect(upsert).toBeDefined();
    expect(upsert![1]).toEqual([UID, 'lead_gen', 'admin_managed']);
  });
});
