// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
//              docs/specs/00-architecture/13_authentication.md §3.2
//              .cursor/phase1_plan.md P1-F2.4 (getClaimsUid — read-path swap) +
//              Item 4 R1 (P1-F3d): UserContext keeps the subscription_status
//              FIELD NAME but the value is now the lead_gen ENTITLEMENT status
//              via LEFT JOIN — null for a zero-entitlement user, same contract
//              the legacy nullable column gave both consumers (R2 leads/view,
//              R4 parcels/lookup)
//              task-313 (McApp card 1; PLAN-313-v1 S1, T1; RR-0499 "1a", MORNING-DECISIONS.md:2598): the parcel routes'
//              `{ needsTrade: false }` path reads no user_profiles row; the lead_gen status comes from
//              getEntitlementStatus, a stale trial runs applyTrialExpirationIfNeeded, a thrown read is null.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getClaimsUid: vi.fn(),
}));
vi.mock('@/lib/subscription/expiration', () => ({
  applyTrialExpirationIfNeeded: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

import { getClaimsUid } from '@/lib/auth/get-user';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { applyTrialExpirationIfNeeded } from '@/lib/subscription/expiration';
import { logError } from '@/lib/logger';
import { createMockEntitlement } from './factories';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function createMockPool(): MockPool {
  return { query: vi.fn() };
}

function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCurrentUserContext', () => {
  it('returns null when no session (uid is null)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(null);
    const mock = createMockPool();
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
    expect(mock.query).not.toHaveBeenCalled();
  });

  it('returns context when session valid and profile exists', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: 'Alice', subscription_status: 'trial' }]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    // P24-24A: shape now carries the trade SET + primary. A single-trade row
    // (no trade_slugs_override) yields set = [primary], primary = trade_slug.
    expect(result).toEqual({
      uid: 'firebase-uid-abc',
      trade_slug: 'plumbing',
      primary_trade_slug: 'plumbing',
      trade_slugs: ['plumbing'],
      display_name: 'Alice',
      subscription_status: 'trial',
    });
  });

  it('P24-24A: unions trade_slugs_override into the trade set (primary first, deduped)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ trade_slug: 'glazing', trade_slugs_override: ['glazing', 'framing'], display_name: null, subscription_status: null }]),
    );
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result?.primary_trade_slug).toBe('glazing');
    expect(result?.trade_slug).toBe('glazing');
    expect(result?.trade_slugs).toEqual(['glazing', 'framing']);
  });

  it('P24-24A: legacy manufacturer (NULL trade_slug + override) rides the override — no longer 401s', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ trade_slug: null, trade_slugs_override: ['plumbing', 'electrical'], display_name: null, subscription_status: 'admin_managed' }]),
    );
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).not.toBeNull();
    expect(result?.primary_trade_slug).toBe('plumbing');
    expect(result?.trade_slugs).toEqual(['plumbing', 'electrical']);
  });

  it('P24-24A: a trade-less row (NULL trade_slug + empty override) still returns null (401)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ trade_slug: null, trade_slugs_override: [], display_name: null, subscription_status: null }]),
    );
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
  });

  it('returns null when session valid but no profile row', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
  });

  it('returns null when DB query throws (does not propagate)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
  });

  it('preserves null display_name from DB', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null, subscription_status: null }]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result?.display_name).toBeNull();
  });

  it('uses parameterized query (uid passed as $1)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null, subscription_status: null }]));
    await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params).toBeDefined();
    expect(params[0]).toBe('firebase-uid-abc');
  });

  it('sources subscription_status from the lead_gen entitlements LEFT JOIN (R1 — never the legacy column)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null, subscription_status: null }]));
    await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    const sql = String(mock.query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/FROM user_profiles up/);
    expect(sql).toMatch(/WHERE up\.user_id = \$1/);
    expect(sql).toMatch(/LEFT JOIN entitlements e/);
    expect(sql).toMatch(/e\.product = 'lead_gen'/);
    expect(sql).toMatch(/e\.status AS subscription_status/);
    // The legacy user_profiles column read is gone (P1-F3d grep gate).
    expect(sql).not.toMatch(/up\.subscription_status/);
  });

  it('propagates subscription_status = null when the user has no entitlement row (JOIN null)', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null, subscription_status: null }]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result?.subscription_status).toBeNull();
  });

  it('never throws — multiple failure modes all return null', async () => {
    // No session
    vi.mocked(getClaimsUid).mockResolvedValueOnce(null);
    expect(await getCurrentUserContext(makeRequest(), createMockPool() as unknown as Pool)).toBeNull();

    // Pool throws
    vi.mocked(getClaimsUid).mockResolvedValueOnce('uid');
    const mock1 = createMockPool();
    mock1.query.mockRejectedValueOnce(new Error('db down'));
    expect(await getCurrentUserContext(makeRequest(), mock1 as unknown as Pool)).toBeNull();

    // Empty rows
    vi.mocked(getClaimsUid).mockResolvedValueOnce('uid');
    const mock2 = createMockPool();
    mock2.query.mockResolvedValueOnce(qr([]));
    expect(await getCurrentUserContext(makeRequest(), mock2 as unknown as Pool)).toBeNull();
  });
});

describe('getCurrentUserContext { needsTrade: false } (task-313, the parcel routes)', () => {
  const UID = '00000000-0000-0000-0000-0000000313a1';
  const entRow = (status: string, trialStartedAt: Date | null = null) => {
    const e = createMockEntitlement({ user_id: UID, status: status as never, trial_started_at: trialStartedAt });
    return { status: e.status, trial_started_at: e.trial_started_at };
  };
  const parcelCall = (mock: MockPool) => getCurrentUserContext(makeRequest(), mock as unknown as Pool, { needsTrade: false });

  it('needsTrade:false, no profile row → {uid, subscription_status:null}', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    expect(await parcelCall(mock)).toEqual({ uid: UID, subscription_status: null });
  });

  it('needsTrade:false, trade-less row → context', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([entRow('active')]));
    expect(await parcelCall(mock)).toEqual({ uid: UID, subscription_status: 'active' });
  });

  it('needsTrade:false reads lead_gen via entitlements, not user_profiles', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([entRow('active')]));
    await parcelCall(mock);
    expect(mock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mock.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM entitlements WHERE user_id = \$1 AND product = \$2/);
    expect(sql).not.toMatch(/user_profiles/);
    expect(params).toEqual([UID, 'lead_gen']);
  });

  it('default call unchanged: no row → null', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    expect(await getCurrentUserContext(makeRequest(), mock as unknown as Pool)).toBeNull();
    expect(String(mock.query.mock.calls[0]?.[0])).toMatch(/FROM user_profiles up/);
  });

  it('needsTrade:false, the lead_gen read throws → null, logged, no throw', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('db down'));
    await expect(parcelCall(mock)).resolves.toBeNull();
    expect(vi.mocked(logError)).toHaveBeenCalledWith('[auth/get-user-context]', expect.any(Error), expect.objectContaining({ uid: UID }));
  });

  it('needsTrade:false, lead_gen trial older than 14 days → expired through applyTrialExpirationIfNeeded', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([entRow('trial', new Date('2026-01-01T00:00:00Z'))]));
    vi.mocked(applyTrialExpirationIfNeeded).mockResolvedValueOnce({ status: 'expired' });
    expect(await parcelCall(mock)).toEqual({ uid: UID, subscription_status: 'expired' });
    expect(vi.mocked(applyTrialExpirationIfNeeded)).toHaveBeenCalledWith(UID, 'lead_gen');
  });

  it('needsTrade:false, a trial still inside 14 days stays trial; a non-trial status never runs the expiry', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([entRow('trial', new Date())]));
    expect(await parcelCall(mock)).toEqual({ uid: UID, subscription_status: 'trial' });
    vi.mocked(getClaimsUid).mockResolvedValueOnce(UID);
    const mock2 = createMockPool();
    mock2.query.mockResolvedValueOnce(qr([entRow('active')]));
    vi.mocked(applyTrialExpirationIfNeeded).mockClear();
    await parcelCall(mock2);
    expect(vi.mocked(applyTrialExpirationIfNeeded)).not.toHaveBeenCalled();
  });

  it('needsTrade:false, no session → null and no read', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce(null);
    const mock = createMockPool();
    expect(await parcelCall(mock)).toBeNull();
    expect(mock.query).not.toHaveBeenCalled();
  });
});
