// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5
//
// Direct unit tests for the two PER-PRODUCT trial-state helpers
// (`.cursor/phase1_plan.md` Item 4 W2 — entitlements rewrite) plus the R6
// null-contract case [fold 16]. These run against a mocked `query` so the
// WHERE/NOT EXISTS predicates are exercised exactly as they appear in
// production. The route-level integration is covered in the user-profile
// suite via the shared GET handler — this suite pins the helper contracts so
// a future refactor cannot silently weaken the idempotency guarantees.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from '@/lib/db/client';
import {
  applyFallbackTrialInitIfNeeded,
  applyTrialExpirationIfNeeded,
} from '@/lib/subscription/expiration';

const mockedQuery = vi.mocked(query);

// entitlements.user_id is UUID-keyed — helpers no-op on legacy uid shapes.
const UID = '00000000-0000-0000-0000-0000000000c1';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('applyFallbackTrialInitIfNeeded', () => {
  it('issues the guarded entitlements INSERT and returns the new row', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: UID, product: 'lead_gen', status: 'trial', trial_started_at: '2026-04-29T00:00:00Z' },
    ]);

    const result = await applyFallbackTrialInitIfNeeded(UID, 'lead_gen');

    expect(result?.status).toBe('trial');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    const params = mockedQuery.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/INSERT INTO entitlements/i);
    // Idempotency predicates — required for race safety under concurrent GETs:
    // profile must be onboarded, and NO entitlement row may exist yet for the
    // product (a row existing AT ALL means "already handled" — active
    // subscriber, expired trial, and admin_managed comp all block re-init).
    expect(sql).toMatch(/onboarding_complete = true/i);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*FROM entitlements/i);
    expect(sql).toMatch(/ON CONFLICT \(user_id, product\) DO NOTHING/i);
    // Manufacturer guard — admin-managed accounts MUST NEVER be touched
    expect(sql).toMatch(/account_preset.*manufacturer/i);
    // Per-product: the product travels as a bind param.
    expect(params).toEqual([UID, 'lead_gen']);
  });

  it('returns null when no row was inserted (already-handled path)', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    const result = await applyFallbackTrialInitIfNeeded(UID, 'lead_gen');
    expect(result).toBeNull();
  });

  it('a manufacturer account never receives a trial write — predicate excludes them', async () => {
    // Even if the predicate is somehow loose, the test verifies the SQL
    // includes the explicit account_preset != 'manufacturer' guard. This
    // catches a regression where someone accidentally relaxes the WHERE.
    mockedQuery.mockResolvedValueOnce([]);
    await applyFallbackTrialInitIfNeeded(UID, 'lead_gen');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/!=\s*'manufacturer'/i);
  });

  it('no-ops (null, zero queries) on a non-uuid legacy/dev uid', async () => {
    // 'dev-user' etc. cannot key entitlements' UUID FK — the helper must
    // return null WITHOUT issuing SQL (a 22P02 cast error would 500 the GET).
    const result = await applyFallbackTrialInitIfNeeded('dev-user', 'lead_gen');
    expect(result).toBeNull();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe('applyTrialExpirationIfNeeded', () => {
  it('issues an entitlements UPDATE with the inclusive 14-day boundary', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: UID, product: 'lead_gen', status: 'expired' },
    ]);

    const result = await applyTrialExpirationIfNeeded(UID, 'lead_gen');

    expect(result?.status).toBe('expired');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/UPDATE entitlements/i);
    // Inclusive boundary per spec — user gets the full 14th day
    expect(sql).toMatch(/INTERVAL\s+'14 days'\s+<=\s+NOW\(\)/i);
    // Double-check predicate (status='trial' AND boundary) is required for
    // race safety: two concurrent GETs at second 14d+1ms would otherwise
    // both UPDATE; the WHERE makes the second one a no-op. Per-product scope
    // keeps product A's clock independent of product B's (N2).
    expect(sql).toMatch(/status = 'trial'/i);
    expect(sql).toMatch(/product = \$2/i);
  });

  it('returns null when status is not "trial" (no-op path)', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    const result = await applyTrialExpirationIfNeeded(UID, 'lead_gen');
    expect(result).toBeNull();
  });

  it('returns null when trial_started_at is NULL (defensive)', async () => {
    // The predicate requires `trial_started_at IS NOT NULL` — verify the SQL
    // includes the guard so a corrupted row doesn't crash on the date math.
    mockedQuery.mockResolvedValueOnce([]);
    await applyTrialExpirationIfNeeded(UID, 'lead_gen');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/trial_started_at IS NOT NULL/i);
  });

  it('no-ops (null, zero queries) on a non-uuid legacy/dev uid', async () => {
    const result = await applyTrialExpirationIfNeeded('dev-user', 'lead_gen');
    expect(result).toBeNull();
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R6 null contract [fold 16] — GET /api/user-profile for a ZERO-entitlement
// user must yield `subscription_status: null, trial_started_at: null` EXACTLY
// (JSON null — never an omitted key, never undefined, never a 500). Mobile's
// UserProfileSchema (4 consumer call sites) parses these fields nullable and
// depends on the keys being present.
// ---------------------------------------------------------------------------
describe('GET /api/user-profile — zero-entitlement null contract (R6, fold 16)', () => {
  it('serialises subscription_status: null and trial_started_at: null for a user with no entitlements row', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth/get-user', () => ({
      getUserIdFromSession: vi.fn(async () => UID),
    }));
    const routeQuery = vi.fn();
    vi.doMock('@/lib/db/client', () => ({
      query: routeQuery,
      withTransaction: vi.fn(),
    }));

    // Helper writes no-op (fresh row conditions unmet), then the joined
    // SELECT returns the LEFT JOIN's natural NULLs for the e.* columns —
    // exactly what pg produces when no entitlement row matches.
    routeQuery
      .mockResolvedValueOnce([]) // applyFallbackTrialInitIfNeeded INSERT (no row)
      .mockResolvedValueOnce([]) // applyTrialExpirationIfNeeded UPDATE (no row)
      .mockResolvedValueOnce([
        {
          user_id: UID,
          trade_slug: 'plumbing',
          display_name: null,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
          onboarding_complete: false,
          account_deleted_at: null,
          subscription_status: null,
          trial_started_at: null,
        },
      ]);

    const { GET } = await import('@/app/api/user-profile/route');
    const res = await GET({
      headers: { get: () => null },
      nextUrl: { pathname: '/api/user-profile' },
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    // The keys must EXIST and be JSON null — `in` checks catch the
    // undefined-dropped-by-JSON.stringify regression the fold warns about.
    expect('subscription_status' in body.data).toBe(true);
    expect('trial_started_at' in body.data).toBe(true);
    expect(body.data.subscription_status).toBeNull();
    expect(body.data.trial_started_at).toBeNull();

    // And the SELECT is the joined shape (entitlements LEFT JOIN), so the
    // nulls come from the join, not a stale user_profiles column read.
    const selectSql = routeQuery.mock.calls[2]?.[0] as string;
    expect(selectSql).toMatch(/LEFT JOIN entitlements e/);
    expect(selectSql).toMatch(/e\.status AS subscription_status/);
    vi.doUnmock('@/lib/auth/get-user');
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
  });
});
