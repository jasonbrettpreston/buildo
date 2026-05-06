// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('@/lib/auth/get-user-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { GET } from '@/app/api/leads/detail/[id]/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  // Minimal stand-in — the route only consumes `request` to pass through to
  // getCurrentUserContext (which is mocked). No URL parsing happens here.
  return {
    nextUrl: { pathname: '/api/leads/detail/x' },
    method: 'GET',
  } as unknown as NextRequest;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleContext = {
  uid: 'firebase-uid-abc',
  trade_slug: 'plumbing',
  display_name: null,
  subscription_status: null,
};

const sampleRow = {
  permit_num: '24 101234',
  revision_num: '01',
  street_num: '123',
  street_name: 'Main St',
  work_description: 'Two-storey rear addition',
  lifecycle_phase: 'P8',
  lifecycle_stalled: false,
  latitude: '43.65000',
  longitude: '-79.38000',
  updated_at: '2026-04-29T10:00:00.000Z',
  estimated_cost: '450000.00',
  cost_tier: 'large',
  cost_range_low: '380000.00',
  cost_range_high: '520000.00',
  modeled_gfa_sqm: '142.5',
  neighbourhood_name: 'Annex',
  avg_household_income: 145000,
  median_household_income: 120000,
  period_of_construction: '1981-1990',
  predicted_start: '2026-06-01',
  p25_days: 28,
  p75_days: 65,
  opportunity_score: 78,
  target_window: 'bid' as const,
  competition_count: 4,
  saved: false,
};

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 200 happy paths
// ---------------------------------------------------------------------------

describe('GET /api/leads/detail/[id] — 200', () => {
  it('returns the composed LeadDetail envelope for a valid permit id', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [sampleRow] });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: Record<string, unknown>; error: null };
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      lead_id: '24 101234--01',
      lead_type: 'permit',
      permit_num: '24 101234',
      revision_num: '01',
      address: '123 Main St',
      location: { lat: 43.65, lng: -79.38 },
      lifecycle_phase: 'P8',
      lifecycle_stalled: false,
      target_window: 'bid',
      opportunity_score: 78,
      competition_count: 4,
      updated_at: '2026-04-29T10:00:00.000Z',
    });
  });

  it('unwraps NUMERIC strings to numbers in the cost block', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [sampleRow] });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { cost: { estimated: number; range_low: number; modeled_gfa_sqm: number } } };
    expect(body.data.cost.estimated).toBe(450000);
    expect(body.data.cost.range_low).toBe(380000);
    expect(body.data.cost.modeled_gfa_sqm).toBe(142.5);
  });

  it('returns cost: null when no cost_estimates row matched', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        ...sampleRow,
        estimated_cost: null,
        cost_tier: null,
        cost_range_low: null,
        cost_range_high: null,
        modeled_gfa_sqm: null,
      }],
    });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { cost: unknown } };
    expect(body.data.cost).toBeNull();
  });

  it('returns location: null when latitude/longitude are missing', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...sampleRow, latitude: null, longitude: null }],
    });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { location: unknown } };
    expect(body.data.location).toBeNull();
  });

  // -------------------------------------------------------------------------
  // is_saved (mapper-boundary tests; SQL-boundary tests live in
  // src/tests/db/lead-detail-saved-state.db.test.ts)
  // -------------------------------------------------------------------------

  it('returns is_saved: false when the row reports saved=false (default)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [sampleRow] });
    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { is_saved: boolean } };
    expect(body.data.is_saved).toBe(false);
  });

  it('returns is_saved: true when the row reports saved=true', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...sampleRow, saved: true }],
    });
    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { is_saved: boolean } };
    expect(body.data.is_saved).toBe(true);
  });

  it('LEAD_DETAIL_SQL contains the lv_self LATERAL EXISTS scoped to $4 (regression guard)', async () => {
    // Read the SQL string directly to lock the parameter binding. Mocked-pool
    // tests can't observe parameter substitution end-to-end; this asserts the
    // structural shape that the Multi-Agent plan review caught (`$2` vs `$4`
    // would have silently returned is_saved=false for every lead).
    const { LEAD_DETAIL_SQL } = await import('@/lib/leads/lead-detail-query');
    expect(LEAD_DETAIL_SQL).toMatch(/lv_self/);
    expect(LEAD_DETAIL_SQL).toMatch(/SELECT EXISTS\s*\(/);
    expect(LEAD_DETAIL_SQL).toMatch(/lv_own\.user_id\s*=\s*\$4::text/);
    expect(LEAD_DETAIL_SQL).toMatch(/lv_own\.saved\s*=\s*true/);
    expect(LEAD_DETAIL_SQL).toMatch(/lv_self\.saved AS saved/);
  });
});

// ---------------------------------------------------------------------------
// 400 invalid id
// ---------------------------------------------------------------------------

describe('GET /api/leads/detail/[id] — 400', () => {
  it('rejects empty id', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext(''));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_LEAD_ID');
  });

  it('rejects id with no separator', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext('not-an-id'));
    expect(res.status).toBe(400);
  });

  it('rejects empty COA application number', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext('COA-'));
    expect(res.status).toBe(400);
  });

  it('rejects id with empty revision_num', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext('24 101234--'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 401 unauthenticated
// ---------------------------------------------------------------------------

describe('GET /api/leads/detail/[id] — 401', () => {
  it('returns 401 when no user context resolves', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(401);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// 404 not found
// ---------------------------------------------------------------------------

describe('GET /api/leads/detail/[id] — 404', () => {
  it('returns 404 when the permit row does not exist', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeRequest(), makeContext('99 999999--00'));
    expect(res.status).toBe(404);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for CoA leads (not yet implemented)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext('COA-A0123/24EYK'));
    expect(res.status).toBe(404);
    expect(mockedPool.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 500 leak prevention
// ---------------------------------------------------------------------------

describe('GET /api/leads/detail/[id] — 500', () => {
  it('returns sanitized 500 when the pool throws (no err.message in body)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockRejectedValueOnce(
      new Error('relation "permits" does not exist OOPS_INTERNAL_DETAIL'),
    );

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('OOPS_INTERNAL_DETAIL');
  });
});
