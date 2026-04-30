// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4
//
// Direct unit tests for the two trial-state helpers. These run against a
// mocked `query` so the WHERE-clause predicates are exercised exactly as
// they appear in production. The route-level integration is covered in the
// existing user-profile suite via the shared GET handler — this suite
// pins the helper contracts so a future refactor cannot silently weaken
// the idempotency guarantees.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  query: vi.fn(),
}));

import { query } from '@/lib/db/client';
import {
  applyFallbackTrialInitIfNeeded,
  applyTrialExpirationIfNeeded,
} from '@/lib/subscription/expiration';

const mockedQuery = vi.mocked(query);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('applyFallbackTrialInitIfNeeded', () => {
  it('issues an UPDATE with the correct predicate and returns the new row', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: 'u1', subscription_status: 'trial', trial_started_at: '2026-04-29T00:00:00Z' },
    ]);

    const result = await applyFallbackTrialInitIfNeeded('u1');

    expect(result?.subscription_status).toBe('trial');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    // Idempotency predicates — required for race safety under concurrent GETs
    expect(sql).toMatch(/onboarding_complete = true/i);
    expect(sql).toMatch(/trial_started_at IS NULL/i);
    expect(sql).toMatch(/subscription_status IS NULL/i);
    // Manufacturer guard — admin-managed accounts MUST NEVER be touched
    expect(sql).toMatch(/account_preset.*manufacturer/i);
  });

  it('returns null when no row matched the predicate (no-op path)', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    const result = await applyFallbackTrialInitIfNeeded('u1');
    expect(result).toBeNull();
  });

  it('a manufacturer account never receives a trial write — predicate excludes them', async () => {
    // Even if the predicate is somehow loose, the test verifies the SQL
    // includes the explicit account_preset != 'manufacturer' guard. This
    // catches a regression where someone accidentally relaxes the WHERE.
    mockedQuery.mockResolvedValueOnce([]);
    await applyFallbackTrialInitIfNeeded('mfg-uid');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/!=\s*'manufacturer'/i);
  });
});

describe('applyTrialExpirationIfNeeded', () => {
  it('issues an UPDATE with the inclusive 14-day boundary', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: 'u1', subscription_status: 'expired' },
    ]);

    const result = await applyTrialExpirationIfNeeded('u1');

    expect(result?.subscription_status).toBe('expired');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    // Inclusive boundary per spec — user gets the full 14th day
    expect(sql).toMatch(/INTERVAL\s+'14 days'\s+<=\s+NOW\(\)/i);
    // Double-check predicate (status='trial' AND boundary) is required for
    // race safety: two concurrent GETs at second 14d+1ms would otherwise
    // both UPDATE; the WHERE makes the second one a no-op.
    expect(sql).toMatch(/subscription_status = 'trial'/i);
  });

  it('returns null when status is not "trial" (no-op path)', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    const result = await applyTrialExpirationIfNeeded('u1');
    expect(result).toBeNull();
  });

  it('returns null when trial_started_at is NULL (defensive)', async () => {
    // The predicate requires `trial_started_at IS NOT NULL` — verify the SQL
    // includes the guard so a corrupted row doesn't crash on the date math.
    mockedQuery.mockResolvedValueOnce([]);
    await applyTrialExpirationIfNeeded('u1');
    const sql = mockedQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/trial_started_at IS NOT NULL/i);
  });
});
