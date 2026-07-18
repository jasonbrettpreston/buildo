// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
//              docs/specs/00-architecture/13_authentication.md §3.2
//              .cursor/phase1_plan.md P1-F2.4 (getClaimsUid — read-path swap only;
//              subscription_status intentionally still fed by the legacy
//              user_profiles column, see get-user-context.ts's own header)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getClaimsUid: vi.fn(),
}));

import { getClaimsUid } from '@/lib/auth/get-user';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';

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

  it('queries the user_profiles table and selects subscription_status', async () => {
    vi.mocked(getClaimsUid).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null, subscription_status: null }]));
    await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    const sql = mock.query.mock.calls[0]?.[0];
    expect(String(sql)).toMatch(/FROM user_profiles/);
    expect(String(sql)).toMatch(/WHERE user_id = \$1/);
    expect(String(sql)).toMatch(/subscription_status/);
  });

  it('propagates subscription_status = null when DB returns null', async () => {
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
