// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract, §6 Route Logic

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
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

const BASE_PROFILE = {
  user_id: 'uid-abc',
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
    // Spec 96 §10 Step 4 added two helpers (applyFallbackTrialInitIfNeeded
    // and applyTrialExpirationIfNeeded) that run BEFORE the SELECT. Each
    // issues an idempotent UPDATE with a WHERE-clause predicate; in the
    // common test path neither matches, so the helpers no-op and return
    // empty rows. mockResolvedValue([]) is the safe default; tests that
    // exercise the SELECT use mockResolvedValueOnce on top of this default.
    mockQuery.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await GET(makeGET());
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown uid', async () => {
    mockGetUser.mockResolvedValueOnce('uid-new');
    // Helpers + SELECT all return empty for unknown uid — default mockQuery
    // resolves to [] for every call, so no Once stubs are needed here.
    const res = await GET(makeGET());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 with full profile row', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery
      .mockResolvedValueOnce([]) // applyFallbackTrialInitIfNeeded — predicate doesn't match
      .mockResolvedValueOnce([]) // applyTrialExpirationIfNeeded — predicate doesn't match
      .mockResolvedValueOnce([BASE_PROFILE]); // final SELECT
    const res = await GET(makeGET());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof BASE_PROFILE };
    expect(body.data.user_id).toBe('uid-abc');
    expect(body.data.trade_slug).toBe('plumbing');
  });

  it('GET sets Cache-Control: no-store (WF3 hardening — trial-state writes on GET must not be proxy-cached)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BASE_PROFILE]);
    const res = await GET(makeGET());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('GET SELECT projects only client-safe columns (WF3 hardening — no SELECT * leakage)', async () => {
    // Pre-WF3 the SELECT was `SELECT * FROM user_profiles`, which leaked
    // `stripe_customer_id`/`radius_cap_km`/`trade_slugs_override` to the
    // client. Now the SELECT lists explicit columns from
    // `CLIENT_SAFE_SELECT_LIST`. Inspect the actual SQL passed to the
    // query mock.
    mockGetUser.mockResolvedValueOnce('uid-abc');
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
    // Sanity: the SELECT must include user_id (canonical identifier).
    expect(finalSelectSql).toContain('user_id');
  });

  it('returns 403 with days_remaining for deleted account', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
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
    mockGetUser.mockResolvedValueOnce('uid-abc');
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

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when trade_slug in body differs from existing (immutability guard)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ trade_slug: 'hvac' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TRADE_IMMUTABLE');
  });

  it('returns 200 when new user sets trade_slug for first time (trade_slug IS NULL)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-new');
    // Existing row has null trade_slug (new user, auto-created by UPSERT)
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    const updated = { ...BASE_PROFILE, trade_slug: 'plumbing' };
    mockQuery.mockResolvedValueOnce([updated]);
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.trade_slug).toBe('plumbing');
  });

  it('PATCH trade_slug first-write uses atomic precondition (WF3 hardening — race-safe)', async () => {
    // Pre-WF3 the SELECT-then-UPDATE pattern allowed two concurrent PATCHes
    // to both see `trade_slug IS NULL`, both succeed, second winner
    // overwrites first. Now the UPDATE includes `AND trade_slug IS NULL`
    // in its WHERE clause so the loser sees rowCount === 0 and gets 409.
    mockGetUser.mockResolvedValueOnce('uid-new');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: 'plumbing' }]);
    await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toMatch(/WHERE\s+user_id\s*=\s*\$1\s+AND\s+trade_slug\s+IS\s+NULL/i);
  });

  it('returns 409 TRADE_RACE_LOST when concurrent PATCH won the trade_slug first-write (WF3 hardening)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-new');
    // Initial SELECT shows trade_slug NULL (we believe we have the lock)
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, trade_slug: null }]);
    // UPDATE returns 0 rows (precondition failed — concurrent winner already set it)
    mockQuery.mockResolvedValueOnce([]);
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

  it('PATCH RETURNING clause projects only client-safe columns (WF3 hardening — no RETURNING * leakage)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]); // existing
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]); // updated
    await PATCH(makePATCH({ full_name: 'New Name' }));
    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall![0] as string;
    expect(sql).not.toContain('RETURNING *');
    expect(sql).not.toContain('stripe_customer_id');
    expect(sql).not.toContain('radius_cap_km');
    expect(sql).not.toContain('trade_slugs_override');
  });

  it('returns 200 when trade_slug matches existing (idempotency)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    // First query: fetch existing row
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    // Second query: re-fetch full row
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ trade_slug: 'plumbing' }));
    expect(res.status).toBe(200);
  });

  it('returns updated row for valid PATCH fields', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, full_name: 'Bob', updated_at: '2026-02-01T00:00:00Z' };
    mockQuery.mockResolvedValueOnce([updated]);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.full_name).toBe('Bob');
  });

  it('applies radius_cap_km to incoming radius_km', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, radius_cap_km: 25 }]);
    const capped = { ...BASE_PROFILE, radius_km: 25 };
    mockQuery.mockResolvedValueOnce([capped]);
    const res = await PATCH(makePATCH({ radius_km: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof capped };
    expect(body.data.radius_km).toBe(25);
  });

  it('does not cap radius_km when radius_cap_km is NULL', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, radius_cap_km: null }]);
    const uncapped = { ...BASE_PROFILE, radius_km: 50 };
    mockQuery.mockResolvedValueOnce([uncapped]);
    const res = await PATCH(makePATCH({ radius_km: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof uncapped };
    expect(body.data.radius_km).toBe(50);
  });

  it('returns 403 for deleted account', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_deleted_at: new Date().toISOString() }]);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when onboarding_complete=true but trade_slug is null', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
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
    mockGetUser.mockResolvedValueOnce('uid-abc');
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
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, full_name: 'Bob', updated_at: '2026-02-01T00:00:00Z' };
    mockQuery.mockResolvedValueOnce([updated]);
    // email is not in UserProfileUpdateSchema — Zod .strip() silently discards it
    const res = await PATCH(makePATCH({ full_name: 'Bob', email: 'hacker@evil.com' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.email).toBeNull();
  });

  it('returns 500 without raw error message on DB failure', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
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

  it('returns 400 LOCATION_COORDS_REQUIRED when home_base_fixed sent without any coords', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    // Existing row has no coords (null) — effective state would violate constraint
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 400 when home_base_fixed sent with lat but missing lng', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lat: 43.65 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 400 when home_base_fixed sent with lng but missing lat', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lng: -79.38 }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOCATION_COORDS_REQUIRED');
  });

  it('returns 200 when home_base_fixed sent with both coords', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const updated = { ...BASE_PROFILE, location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 };
    mockQuery.mockResolvedValueOnce([updated]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.location_mode).toBe('home_base_fixed');
  });

  it('returns 200 when home_base_fixed sent without coords but existing row already has both', async () => {
    // User already has coords set — just updating location_mode to fixed is valid
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'home_base_fixed', home_base_lat: 43.65, home_base_lng: -79.38 };
    mockQuery.mockResolvedValueOnce([updated]);
    const res = await PATCH(makePATCH({ location_mode: 'home_base_fixed' }));
    expect(res.status).toBe(200);
  });

  it('auto-clears coords when switching to gps_live — response has null lat/lng', async () => {
    // Existing row has coords set from a previous home_base_fixed session
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'gps_live', home_base_lat: null, home_base_lng: null };
    mockQuery.mockResolvedValueOnce([updated]);
    const res = await PATCH(makePATCH({ location_mode: 'gps_live' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof updated };
    expect(body.data.home_base_lat).toBeNull();
    expect(body.data.home_base_lng).toBeNull();
  });

  it('gps_live with explicit null coords also returns 200', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, home_base_lat: 43.65, home_base_lng: -79.38 }]);
    const updated = { ...BASE_PROFILE, location_mode: 'gps_live', home_base_lat: null, home_base_lng: null };
    mockQuery.mockResolvedValueOnce([updated]);
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

  it('returns 200 ok:true on successful deletion', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, stripe_customer_id: null }]);
    mockQuery.mockResolvedValueOnce([]);
    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
  });

  it('returns 200 ok:true when already deleted (idempotency)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: new Date().toISOString(), stripe_customer_id: null }]);
    const res = await DELETE_POST(makePOST('/api/user-profile/delete'));
    expect(res.status).toBe(200);
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
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: null, account_preset: null }]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_DELETED');
  });

  it('returns 400 when 30-day window expired', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    const deletedAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: deletedAt, account_preset: null }]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('RECOVERY_WINDOW_EXPIRED');
  });

  it('restores to expired status for standard accounts', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    const deletedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: deletedAt, account_preset: null }]);
    const restored = { ...BASE_PROFILE, account_deleted_at: null, subscription_status: 'expired' };
    mockQuery.mockResolvedValueOnce([restored]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof restored };
    expect(body.data.subscription_status).toBe('expired');
  });

  it('restores to admin_managed status for manufacturer accounts', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    const deletedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([{ account_deleted_at: deletedAt, account_preset: 'manufacturer' }]);
    const restored = { ...BASE_PROFILE, account_deleted_at: null, subscription_status: 'admin_managed' };
    mockQuery.mockResolvedValueOnce([restored]);
    const res = await REACTIVATE_POST(makePOST('/api/user-profile/reactivate'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof restored };
    expect(body.data.subscription_status).toBe('admin_managed');
  });
});
