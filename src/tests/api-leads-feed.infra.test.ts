// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: {} as unknown,
  parsePositiveIntEnv: (_value: string | undefined, fallback: number) => fallback,
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

vi.mock('@/features/leads/api/request-logging', () => ({
  logRequestComplete: vi.fn(),
}));

// Mock the PostGIS pre-flight helper so the feed route's dev-env guard can be
// tested without a real DB. WF3 2026-04-11; module moved to test-feed-utils WF2 2026-04-22.
vi.mock('@/lib/admin/test-feed-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/test-feed-utils')>(
    '@/lib/admin/test-feed-utils',
  );
  return {
    ...actual,
    isPostgisAvailable: vi.fn(),
  };
});

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { logRequestComplete } from '@/features/leads/api/request-logging';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { isPostgisAvailable } from '@/lib/admin/test-feed-utils';
import { GET } from '@/app/api/leads/feed/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedWithRateLimit = vi.mocked(withRateLimit);
const mockedGetLeadFeed = vi.mocked(getLeadFeed);
const mockedLogRequestComplete = vi.mocked(logRequestComplete);
const mockedIsPostgisAvailable = vi.mocked(isPostgisAvailable);

beforeEach(() => {
  vi.clearAllMocks();
  // WF3 2026-04-11 — default the PostGIS pre-flight to "available" for
  // every test in this file. Tests that need to exercise the missing-
  // PostGIS 503 path explicitly override with `mockResolvedValueOnce(false)`.
  // This is in `beforeEach` (not `setHappyPathMocks`) so every test —
  // including the 429/500/composition tests that don't call
  // setHappyPathMocks — sees a defined pool-postgis result. Without this,
  // running the 429 suite in isolation (`vitest -t "429"`) triggers the
  // pre-flight with an unmocked `vi.fn()` that returns undefined, which
  // short-circuits into 503 and the 429 assertion fails. Caught by
  // adversarial review 2026-04-11.
  mockedIsPostgisAvailable.mockResolvedValue(true);
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
  subscription_status: null,
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
      timing_confidence: 'high' as const,
      opportunity_type: 'newbuild' as const,
      timing_display: 'Active build phase',
      neighbourhood_name: 'High Park',
      cost_tier: 'large' as const,
      estimated_cost: 750000,
      is_saved: false,
      lifecycle_phase: 'P7a',
      lifecycle_stalled: false,
      target_window: 'bid' as const,
      competition_count: 0,
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
  // isPostgisAvailable default = true is set in the file-level beforeEach
  // (not here) so every test — including ones that don't call
  // setHappyPathMocks — inherits the default.
}

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 200 OK happy paths
// ---------------------------------------------------------------------------

describe('GET /api/leads/feed — 200 happy paths', () => {
  it('returns 200 with mapped feed result and envelope shape (data + error: null + meta)', async () => {
    setHappyPathMocks();
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: unknown; error: unknown; meta: unknown };
    expect(body.data).toEqual(sampleResult.data);
    expect(body.error).toBeNull();
    expect(body.meta).toEqual(sampleResult.meta);
  });

  it('logRequestComplete is called with all 7 spec 70 observability fields', async () => {
    setHappyPathMocks();
    await GET(makeRequest(validQuery));
    expect(mockedLogRequestComplete).toHaveBeenCalledTimes(1);
    const call = mockedLogRequestComplete.mock.calls[0];
    expect(call?.[0]).toBe('[api/leads/feed]');
    const ctx = call?.[1] as Record<string, unknown>;
    // Spec 70 §API Endpoints "Observability" requires all 6 of these (the
    // 7th is duration_ms, which logRequestComplete adds itself).
    expect(ctx).toHaveProperty('user_id');
    expect(ctx).toHaveProperty('trade_slug');
    expect(ctx).toHaveProperty('lat');
    expect(ctx).toHaveProperty('lng');
    expect(ctx).toHaveProperty('radius_km');
    expect(ctx).toHaveProperty('result_count');
  });

  it('does NOT call logRequestComplete on error paths (only on 200)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await GET(makeRequest(validQuery));
    expect(mockedLogRequestComplete).not.toHaveBeenCalled();
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

  it('returns 400 VALIDATION_FAILED when trade_slug is missing', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest('?lat=43.65&lng=-79.38'));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when lat is non-numeric (NaN coercion guard)', async () => {
    // Regression: Number("abc") === NaN, and NaN > -90 is false. Without
    // .finite() in the schema, NaN would silently pass min/max gates and
    // reach getLeadFeed. Schema test in api-schemas.logic.test.ts asserts
    // .finite() at the schema level; this test asserts the route surfaces
    // the failure as 400 (not 500).
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest('?lat=abc&lng=-79.38&trade_slug=plumbing'));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when cursor is partial (missing lead_id)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(
      makeRequest(`${validQuery}&cursor_score=75&cursor_lead_type=permit`),
    );
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
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

  it('handles HTTP parameter pollution deterministically (?trade_slug=plumbing&trade_slug=electrical)', async () => {
    // `Object.fromEntries(URLSearchParams)` returns the LAST value for
    // duplicated keys. So `?trade_slug=plumbing&trade_slug=electrical`
    // becomes `{trade_slug: 'electrical'}`. The auth check uses that
    // post-Object.fromEntries value, so there is NO bypass — the
    // route's view of trade_slug is consistent across all uses.
    //
    // This test locks the deterministic behavior in. If the parsing
    // strategy ever changes (e.g. someone introduces a query parser
    // that takes the FIRST value), this test fails.
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical', // matches the LAST query value
      display_name: null,
      subscription_status: null,
    });
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 29 });
    mockedGetLeadFeed.mockResolvedValueOnce(sampleResult);
    const res = await GET(
      makeRequest('?lat=43.65&lng=-79.38&trade_slug=plumbing&trade_slug=electrical'),
    );
    // Should succeed because the LAST trade_slug ('electrical') matches the
    // user's profile trade. If parsing took the FIRST value ('plumbing'),
    // this would return 403.
    expect(res.status).toBe(200);
    const call = mockedGetLeadFeed.mock.calls[0];
    expect(call?.[0].trade_slug).toBe('electrical');
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
      subscription_status: null,
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
      subscription_status: null,
    });
    await GET(makeRequest(validQuery));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('does not call withRateLimit on 403 (trade check runs first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
      subscription_status: null,
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
  it('returns 500 INTERNAL_ERROR when getLeadFeed throws (DB failure must surface as 5xx per spec 70 §API Endpoints)', async () => {
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
      subscription_status: null,
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

// ---------------------------------------------------------------------------
// 503 DEV_ENV_MISSING_POSTGIS — dev-env pre-flight (WF3 2026-04-11)
// ---------------------------------------------------------------------------
// LEAD_FEED_SQL uses PostGIS `geography` casts for radius filtering. Local
// dev may not have the postgis extension installed. Without a pre-flight
// check, getLeadFeed throws `type "geography" does not exist` which
// surfaces as an opaque 500 + "Can't reach the server" in the UI. The fix
// pre-flights isPostgisAvailable after auth + Zod validation but BEFORE
// rate limiting and getLeadFeed, returning a structured 503 with
// install instructions instead of a generic 500.

describe('GET /api/leads/feed — 503 DEV_ENV_MISSING_POSTGIS (dev-env pre-flight)', () => {
  it('returns 503 with DEV_ENV_MISSING_POSTGIS code when PostGIS is not installed', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedIsPostgisAvailable.mockResolvedValueOnce(false);
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(503);
    const body = (await readJson(res)) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('DEV_ENV_MISSING_POSTGIS');
    // Install instructions must be in the message so the user sees
    // them in the error UI (via extractErrorMessage helper).
    expect(body.error.message).toMatch(/postgis/i);
    expect(body.error.message).toMatch(/install/i);
  });

  it('does NOT call getLeadFeed when PostGIS is missing (ordering proof)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedIsPostgisAvailable.mockResolvedValueOnce(false);
    await GET(makeRequest(validQuery));
    expect(mockedGetLeadFeed).not.toHaveBeenCalled();
  });

  it('does NOT count against the rate limit when PostGIS is missing', async () => {
    // Pre-flight fires BEFORE rate limit, so dev users hitting a stuck
    // feed don't exhaust their 30-req/min window on a 503.
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedIsPostgisAvailable.mockResolvedValueOnce(false);
    await GET(makeRequest(validQuery));
    expect(mockedWithRateLimit).not.toHaveBeenCalled();
  });

  it('still returns 401 (not 503) when unauthenticated — auth runs first', async () => {
    // Ordering: auth must always be checked before the dev-env guard so
    // an unauth'd bot doesn't see "postgis not installed" and learn we
    // run Next.js in dev mode. 401 is the universal "go away" response.
    mockedGetUserContext.mockResolvedValueOnce(null);
    // No isPostgisAvailable mock — would throw if the handler called it.
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(401);
    expect(mockedIsPostgisAvailable).not.toHaveBeenCalled();
  });

  it('still returns 400 (not 503) when Zod validation fails — validation runs before pre-flight', async () => {
    // Same ordering logic — garbage params return 400 without leaking
    // the dev-env message.
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest('?lat=not-a-number&lng=-79.38&trade_slug=plumbing'));
    expect(res.status).toBe(400);
    expect(mockedIsPostgisAvailable).not.toHaveBeenCalled();
  });

  it('passes through to getLeadFeed when PostGIS is available (production regression guard)', async () => {
    // Production has PostGIS installed; isPostgisAvailable returns true;
    // the 200 happy path must still run. This is the regression guard
    // for accidentally inverting the check.
    setHappyPathMocks();
    const res = await GET(makeRequest(validQuery));
    expect(res.status).toBe(200);
    expect(mockedGetLeadFeed).toHaveBeenCalled();
  });
});
