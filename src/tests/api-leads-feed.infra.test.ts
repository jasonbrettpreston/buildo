// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: {} as unknown,
}));

vi.mock('@/lib/auth/get-user-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  withRateLimit: vi.fn(),
}));

vi.mock('@/features/leads/lib/get-lead-feed', async () => {
  // Re-export the real constants so the route can still import MAX_FEED_LIMIT etc.
  const actual = await vi.importActual<typeof import('@/features/leads/lib/get-lead-feed')>(
    '@/features/leads/lib/get-lead-feed',
  );
  return {
    ...actual,
    getLeadFeed: vi.fn(),
  };
});

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { GET } from '@/app/api/leads/feed/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedWithRateLimit = vi.mocked(withRateLimit);
const mockedGetLeadFeed = vi.mocked(getLeadFeed);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(query: string): NextRequest {
  // Build a minimal NextRequest stand-in. We only need .nextUrl.searchParams
  // for the route's input parsing.
  const url = new URL(`http://localhost/api/leads/feed${query}`);
  return {
    nextUrl: { searchParams: url.searchParams },
  } as unknown as NextRequest;
}

const validQuery = '?lat=43.65&lng=-79.38&trade_slug=plumbing';

const sampleContext = {
  uid: 'firebase-uid-abc',
  trade_slug: 'plumbing',
  display_name: null,
};

const sampleResult = {
  data: [
    {
      lead_type: 'permit' as const,
      lead_id: '24 101234:01',
      permit_num: '24 101234',
      revision_num: '01',
      status: 'Permit Issued',
      permit_type: 'New Building',
      description: 'New SFD',
      street_num: '47',
      street_name: 'Maple Ave',
      latitude: 43.65,
      longitude: -79.38,
      distance_m: 350,
      proximity_score: 30,
      timing_score: 30,
      value_score: 20,
      opportunity_score: 10,
      relevance_score: 90,
    },
  ],
  meta: {
    next_cursor: null,
    count: 1,
    radius_km: 10,
  },
};

function setHappyPathMocks() {
  mockedGetUserContext.mockResolvedValueOnce(sampleContext);
  mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
  mockedGetLeadFeed.mockResolvedValueOnce(sampleResult);
}

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 200 OK happy paths
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 200 happy paths', () => {
  it('returns 200 with mapped feed result and envelope shape', async () => {
    setHappyPathMocks();
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: unknown; error: unknown; meta: unknown };
    expect(body.data).toEqual(sampleResult.data);
    expect(body.error).toBeNull();
    expect(body.meta).toEqual(sampleResult.meta);
  });

  it('passes the cursor triple to getLeadFeed when all 3 cursor params present', async () => {
    setHappyPathMocks();
    await GET(
      makeRequest(
        `${validQuery}&cursor_score=75&cursor_lead_type=permit&cursor_lead_id=24%20101234%3A01`,
      ),
    );
    const call = mockedGetLeadFeed.mock.calls[0];
    expect(call?.[0].cursor).toEqual({
      score: 75,
      lead_type: 'permit',
      lead_id: '24 101234:01',
    });
  });

  it('returns 200 with empty data array and null next_cursor when no leads match', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
    mockedGetLeadFeed.mockResolvedValueOnce({
      data: [],
      meta: { next_cursor: null, count: 0, radius_km: 10 },
    });
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: unknown[]; meta: { count: number; next_cursor: unknown } };
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
    expect(body.meta.next_cursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 401 Unauthorized
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 401 Unauthorized', () => {
  it('returns 401 UNAUTHORIZED when getCurrentUserContext returns null', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(401);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not call getLeadFeed on 401', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await GET(makeRequest(validQuery));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('does not call withRateLimit on 401 (auth gate runs first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await GET(makeRequest(validQuery));
    expect(mockedWithRateLimit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 400 Validation
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 400 Validation', () => {
  it('returns 400 VALIDATION_FAILED when lat is out of range', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest('?lat=999&lng=-79.38&trade_slug=plumbing'));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toBeDefined();
  });

  it('returns 400 when trade_slug is missing', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest('?lat=43.65&lng=-79.38'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when cursor is partial (missing lead_id)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(
      makeRequest(`${validQuery}&cursor_score=75&cursor_lead_type=permit`),
    );
    expect(res.status).toBe(400);
  });

  it('does not call getLeadFeed on 400', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    await GET(makeRequest('?lat=999&lng=-79.38&trade_slug=plumbing'));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('returns 401 (not 400) for unauthenticated request with invalid params (auth gate first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('?lat=999&lng=-79.38&trade_slug=plumbing'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 403 Forbidden — trade slug mismatch
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 403 Forbidden', () => {
  it('returns 403 FORBIDDEN_TRADE_MISMATCH when requested trade differs from profile trade', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    const res = await GET(makeRequest(validQuery)); // requests plumbing
    expect(res.status).toBe(403);
    const body = (await readJson(res)) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FORBIDDEN_TRADE_MISMATCH');
    expect(body.error.message).toContain('plumbing');
    expect(body.error.message).toContain('electrical');
  });

  it('does not call getLeadFeed on 403', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    await GET(makeRequest(validQuery));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('does not call withRateLimit on 403 (trade check runs first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    await GET(makeRequest(validQuery));
    expect(mockedWithRateLimit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 429 Rate limited
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 429 Rate Limited', () => {
  it('returns 429 RATE_LIMITED when withRateLimit denies', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(429);
    const body = (await readJson(res)) as { error: { code: string; details?: { remaining: number } } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toEqual({ remaining: 0 });
  });

  it('429 response includes Retry-After header', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await GET(makeRequest(validQuery));
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('does not call getLeadFeed on 429', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    await GET(makeRequest(validQuery));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('rate limit key is leads-feed:{uid} (per-endpoint bucket)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
    mockedGetLeadFeed.mockResolvedValueOnce(sampleResult);
    await GET(makeRequest(validQuery));
    const call = mockedWithRateLimit.mock.calls[0];
    expect(call?.[1].key).toBe('leads-feed:firebase-uid-abc');
    expect(call?.[1].limit).toBe(30);
    expect(call?.[1].windowSec).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// 500 Internal error (defensive)
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 500 Internal Error (defensive)', () => {
  it('returns 500 INTERNAL_ERROR when getLeadFeed throws (regression — never-throws contract)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
    mockedGetLeadFeed.mockRejectedValueOnce(new Error('boom'));
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(500);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when getCurrentUserContext throws (regression)', async () => {
    mockedGetUserContext.mockRejectedValueOnce(new Error('auth helper crashed'));
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(500);
  });

  it('returns 500 when withRateLimit throws (regression)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockRejectedValueOnce(new Error('upstash down'));
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Composition correctness
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — composition correctness', () => {
  it('passes uid from context (NOT from query) to getLeadFeed', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'firebase-uid-from-token',
      trade_slug: 'plumbing',
      display_name: null,
    });
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
    mockedGetLeadFeed.mockResolvedValueOnce(sampleResult);
    await GET(makeRequest(`${validQuery}&user_id=evil-spoofed-uid`));
    const call = mockedGetLeadFeed.mock.calls[0];
    expect(call?.[0].user_id).toBe('firebase-uid-from-token');
  });

  it('passes coerced (numeric) lat/lng/radius_km/limit to getLeadFeed', async () => {
    setHappyPathMocks();
    await GET(makeRequest('?lat=43.65&lng=-79.38&trade_slug=plumbing&radius_km=5&limit=10'));
    const input = mockedGetLeadFeed.mock.calls[0]?.[0];
    expect(typeof input?.lat).toBe('number');
    expect(typeof input?.lng).toBe('number');
    expect(input?.radius_km).toBe(5);
    expect(input?.limit).toBe(10);
  });

  it('omits cursor field when no cursor params provided (cleaner LeadFeedInput)', async () => {
    setHappyPathMocks();
    await GET(makeRequest(validQuery));
    const input = mockedGetLeadFeed.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty('cursor');
  });
});
