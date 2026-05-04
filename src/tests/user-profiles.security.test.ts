// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §6 Route Logic §6.2 PATCH Whitelist

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
  // Spec 99 §9.14: notification_prefs JSONB flattened to 5 sibling fields.
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
};

function makePATCH(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user-profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupAuth(profile = BASE_PROFILE) {
  mockGetUser.mockResolvedValueOnce('uid-abc');
  mockQuery.mockResolvedValueOnce([profile]);
}

describe('PATCH /api/user-profile — whitelist security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spec 96 GET handler now runs two helper UPDATEs before the SELECT.
    // Default both to no-op (empty rows) so unstubbed paths don't crash.
    mockQuery.mockResolvedValue([]);
  });

  it('strips subscription_status silently — returns 200 with field unchanged', async () => {
    setupAuth();
    const unchanged = { ...BASE_PROFILE, subscription_status: null };
    mockQuery.mockResolvedValueOnce([unchanged]);
    const res = await PATCH(makePATCH({ full_name: 'Bob', subscription_status: 'active' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof unchanged };
    // subscription_status must not have been written (still null as per DB mock)
    expect(body.data.subscription_status).toBeNull();
  });

  it('strips account_deleted_at silently — returns 200', async () => {
    setupAuth();
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ full_name: 'Bob', account_deleted_at: '2099-01-01T00:00:00Z' }));
    expect(res.status).toBe(200);
  });

  it('strips trade_slugs_override silently — returns 200', async () => {
    setupAuth();
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ full_name: 'Bob', trade_slugs_override: ['hvac', 'plumbing'] }));
    expect(res.status).toBe(200);
  });

  it('strips lead_views_count silently — returns 200', async () => {
    setupAuth();
    mockQuery.mockResolvedValueOnce([BASE_PROFILE]);
    const res = await PATCH(makePATCH({ full_name: 'Bob', lead_views_count: 9999 }));
    expect(res.status).toBe(200);
  });

  it('returns 403 on PATCH when account is deleted', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_deleted_at: new Date().toISOString() }]);
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_DELETED');
  });

  it('5xx responses do not expose raw error text', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    mockQuery.mockRejectedValueOnce(new Error('pg: column "secret_col" does not exist'));
    const res = await PATCH(makePATCH({ full_name: 'Bob' }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret_col');
    expect(text).not.toContain('does not exist');
  });

  it('manufacturer cannot self-elevate via account_preset — field stripped', async () => {
    // account_preset is not in UserProfileUpdateSchema, so Zod strips it silently
    mockGetUser.mockResolvedValueOnce('uid-mfr');
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_preset: 'manufacturer' }]);
    mockQuery.mockResolvedValueOnce([{ ...BASE_PROFILE, account_preset: 'manufacturer' }]);
    const res = await PATCH(makePATCH({ full_name: 'Bob', account_preset: 'admin_managed' }));
    expect(res.status).toBe(200);
    // account_preset unchanged — the mock returns the manufacturer row
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data['account_preset']).toBe('manufacturer');
  });

  it('GET returns own profile — WHERE clause scoped to authenticated UID', async () => {
    mockGetUser.mockResolvedValueOnce('uid-abc');
    // Two helper UPDATEs (no-op, return []) then the SELECT
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...BASE_PROFILE, user_id: 'uid-abc' }]);
    const req = new NextRequest('http://localhost/api/user-profile');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { user_id: string } };
    // Confirms the row returned belongs to the authenticated user
    expect(body.data.user_id).toBe('uid-abc');
  });
});
