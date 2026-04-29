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
  notification_prefs: null,
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
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await GET(makeGET());
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown uid', async () => {
    mockGetUser.mockResolvedValueOnce('uid-new');
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(makeGET());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 with full profile row', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await GET(makeGET());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof BASE_PROFILE };
    expect(body.data.user_id).toBe('uid-abc');
    expect(body.data.trade_slug).toBe('plumbing');
  });

  it('returns 403 with days_remaining for deleted account', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    const deletedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_deleted_at: deletedAt }]);
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

  it('returns 400 when trade_slug in body (immutability guard)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ trade_slug: 'hvac' }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('TRADE_IMMUTABLE');
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
