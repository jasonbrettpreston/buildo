// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b Testing Gates
// GET /api/onboarding/suppliers — authenticated route, returns supplier list per trade.

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

import { GET } from '@/app/api/onboarding/suppliers/route';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';

const mockGetUser = getUserIdFromSession as ReturnType<typeof vi.fn>;
const mockQuery = query as ReturnType<typeof vi.fn>;

function makeRequest(trade?: string): NextRequest {
  const url = trade
    ? `http://localhost/api/onboarding/suppliers?trade=${trade}`
    : 'http://localhost/api/onboarding/suppliers';
  return new NextRequest(url);
}

describe('GET /api/onboarding/suppliers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated request', async () => {
    mockGetUser.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('plumbing'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Unauthorized');
  });

  it('returns 400 when trade param is missing', async () => {
    mockGetUser.mockResolvedValueOnce('uid-123');
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 200 with non-empty supplier list for known trade', async () => {
    mockGetUser.mockResolvedValueOnce('uid-123');
    mockQuery.mockResolvedValueOnce([
      { name: 'Ferguson' },
      { name: 'Wolseley' },
      { name: 'Consolidated Pipe & Supply' },
    ]);
    const res = await GET(makeRequest('plumbing'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { suppliers: string[] } };
    expect(body.data.suppliers).toHaveLength(3);
    expect(body.data.suppliers[0]).toBe('Ferguson');
  });

  it('returns 200 with empty array for unknown trade (not 404)', async () => {
    mockGetUser.mockResolvedValueOnce('uid-123');
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(makeRequest('zzz-unknown-trade'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { suppliers: string[] } };
    expect(Array.isArray(body.data.suppliers)).toBe(true);
    expect(body.data.suppliers).toHaveLength(0);
  });

  it('returns 500 and logs error on DB failure', async () => {
    mockGetUser.mockResolvedValueOnce('uid-123');
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await GET(makeRequest('plumbing'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Failed to load suppliers');
  });
});
