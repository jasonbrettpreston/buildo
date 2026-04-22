// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/get-user', () => ({
  getUserIdFromSession: vi.fn(),
}));

import { getUserIdFromSession } from '@/lib/auth/get-user';
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
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce(null);
    const mock = createMockPool();
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
    expect(mock.query).not.toHaveBeenCalled();
  });

  it('returns context when session valid and profile exists', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: 'Alice' }]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toEqual({ uid: 'firebase-uid-abc', trade_slug: 'plumbing', display_name: 'Alice' });
  });

  it('returns null when session valid but no profile row', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
  });

  it('returns null when DB query throws (does not propagate)', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result).toBeNull();
  });

  it('preserves null display_name from DB', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null }]));
    const result = await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    expect(result?.display_name).toBeNull();
  });

  it('uses parameterized query (uid passed as $1)', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null }]));
    await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params).toBeDefined();
    expect(params[0]).toBe('firebase-uid-abc');
  });

  it('queries the user_profiles table', async () => {
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('firebase-uid-abc');
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ trade_slug: 'plumbing', display_name: null }]));
    await getCurrentUserContext(makeRequest(), mock as unknown as Pool);
    const sql = mock.query.mock.calls[0]?.[0];
    expect(String(sql)).toMatch(/FROM user_profiles/);
    expect(String(sql)).toMatch(/WHERE user_id = \$1/);
  });

  it('never throws — multiple failure modes all return null', async () => {
    // No session
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce(null);
    expect(await getCurrentUserContext(makeRequest(), createMockPool() as unknown as Pool)).toBeNull();

    // Pool throws
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('uid');
    const mock1 = createMockPool();
    mock1.query.mockRejectedValueOnce(new Error('db down'));
    expect(await getCurrentUserContext(makeRequest(), mock1 as unknown as Pool)).toBeNull();

    // Empty rows
    vi.mocked(getUserIdFromSession).mockResolvedValueOnce('uid');
    const mock2 = createMockPool();
    mock2.query.mockResolvedValueOnce(qr([]));
    expect(await getCurrentUserContext(makeRequest(), mock2 as unknown as Pool)).toBeNull();
  });
});
