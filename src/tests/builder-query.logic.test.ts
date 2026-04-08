// 🔗 SPEC LINK: docs/specs/product/future/73_builder_leads.md §Implementation
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  BUILDER_QUERY_SQL,
  BUILDER_QUERY_LIMIT,
  queryBuilderLeads,
} from '@/features/leads/lib/builder-query';
import { metersFromKilometers } from '@/features/leads/lib/distance';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function createMockPool(): MockPool {
  return { query: vi.fn() };
}

function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// SQL structure assertions
// ---------------------------------------------------------------------------

describe('BUILDER_QUERY_SQL — structure', () => {
  it('contains all 3 CTEs from spec 73', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/WITH nearby_permits AS/);
    expect(BUILDER_QUERY_SQL).toMatch(/builder_aggregates AS/);
    expect(BUILDER_QUERY_SQL).toMatch(/scored AS/);
  });

  it('contains all 4 score pillars', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/proximity_score/);
    expect(BUILDER_QUERY_SQL).toMatch(/activity_score/);
    expect(BUILDER_QUERY_SQL).toMatch(/contact_score/);
    expect(BUILDER_QUERY_SQL).toMatch(/fit_score/);
  });

  it('caps fit_score at 20 so relevance_score cannot exceed 100 (spec 70 §4 builder fit)', () => {
    // Phase 0/1/2 holistic review: base fit + WSIB +3 bonus could reach
    // 23, pushing relevance_score to 103 and breaking any 0-100 client
    // scale. LEAST(..., 20) is the cap.
    expect(BUILDER_QUERY_SQL).toMatch(/LEAST\([\s\S]*?20\s*\)\s*AS fit_score/);
  });

  it('uses ST_DWithin + ST_MakePoint with explicit float8 casts', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/ST_DWithin\(/);
    expect(BUILDER_QUERY_SQL).toMatch(/ST_MakePoint\(\$2::float8,\s*\$3::float8\)::geography/);
  });

  it('explicitly casts p.location to ::geography for meter-based distance', () => {
    // Regression: same as get-lead-feed.logic.test.ts. The column is stored
    // as `geometry(Point, 4326)` for GIST compatibility but distance math
    // must be meters. The explicit cast removes PostGIS function-resolution
    // ambiguity. Caught by Gemini Phase 0+1 holistic review.
    expect(BUILDER_QUERY_SQL).toMatch(/p\.location::geography/);
    expect(BUILDER_QUERY_SQL).not.toMatch(/p\.location <->/);
    expect(BUILDER_QUERY_SQL).not.toMatch(/ST_DWithin\(p\.location,/);
  });

  it('includes the multi-WSIB tie-breaker subquery (most-recent enrichment wins)', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/ORDER BY w\.last_enriched_at DESC LIMIT 1/);
  });

  it('filters WSIB by allowlisted business sizes', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/business_size IN \('Small Business', 'Medium Business'\)/);
  });

  it('filters permits by issued or inspection status', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/p\.status IN \('Permit Issued', 'Inspection'\)/);
  });

  it('orders by relevance_score DESC then closest_permit_m ASC', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/ORDER BY relevance_score DESC, closest_permit_m ASC/);
  });

  it('limits to BUILDER_QUERY_LIMIT (20)', () => {
    expect(BUILDER_QUERY_LIMIT).toBe(20);
    expect(BUILDER_QUERY_SQL).toMatch(/LIMIT 20/);
  });

  it('binds trade_slug at $1 for the trades.slug join', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/t\.slug = \$1/);
  });

  it('uses $4::float8 for radius_m in ST_DWithin', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/\$4::float8/);
  });
});

// ---------------------------------------------------------------------------
// Function behaviour
// ---------------------------------------------------------------------------

const sampleRow = {
  entity_id: 9183,
  legal_name: 'ACME CONSTRUCTION INC',
  trade_name: null,
  business_size: 'Small Business',
  primary_phone: '416-555-1234',
  primary_email: null,
  website: 'https://acme.example',
  photo_url: null,
  is_wsib_registered: true,
  active_permits_nearby: 4,
  closest_permit_m: 350,
  avg_project_cost: 850000,
  proximity_score: 30,
  activity_score: 25,
  contact_score: 20,
  fit_score: 20,
  relevance_score: 95,
};

describe('queryBuilderLeads — function behaviour', () => {
  it('maps rows to BuilderLeadCandidate[] on happy path', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([sampleRow]));
    const result = await queryBuilderLeads('plumbing', 43.65, -79.38, 5, mock as unknown as Pool);
    expect(result).toHaveLength(1);
    expect(result[0]?.entity_id).toBe(9183);
    expect(result[0]?.legal_name).toBe('ACME CONSTRUCTION INC');
    expect(result[0]?.relevance_score).toBe(95);
  });

  it('returns empty array on empty result', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await queryBuilderLeads('plumbing', 43.65, -79.38, 5, mock as unknown as Pool);
    expect(result).toEqual([]);
  });

  it('returns empty array + does not throw when pool query throws', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await queryBuilderLeads('plumbing', 43.65, -79.38, 5, mock as unknown as Pool);
    expect(result).toEqual([]);
  });

  it('passes radius_km converted to meters via metersFromKilometers', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await queryBuilderLeads('plumbing', 43.65, -79.38, 7, mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params).toBeDefined();
    expect(params[3]).toBe(metersFromKilometers(7));
    expect(params[3]).toBe(7000);
  });

  it('passes parameters in spec order: $1=trade_slug, $2=lng, $3=lat, $4=radius_m', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await queryBuilderLeads('electrical', 43.65, -79.38, 10, mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[0]).toBe('electrical');
    expect(params[1]).toBe(-79.38); // lng
    expect(params[2]).toBe(43.65);  // lat
    expect(params[3]).toBe(10000);  // radius_m
  });

  it('handles avg_project_cost as null without throwing', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([{ ...sampleRow, avg_project_cost: null }]));
    const result = await queryBuilderLeads('plumbing', 43.65, -79.38, 5, mock as unknown as Pool);
    expect(result[0]?.avg_project_cost).toBeNull();
  });

  it('preserves photo_url null (V1 default — no fetched builder photos)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([sampleRow]));
    const result = await queryBuilderLeads('plumbing', 43.65, -79.38, 5, mock as unknown as Pool);
    expect(result[0]?.photo_url).toBeNull();
  });
});

// ===========================================================================
// Mutation-survivor triage — added 2026-04-08 after commit d8b508e.
// 50% baseline mutation score. Kills the 11 surviving mutants on the JS
// wrapper around BUILDER_QUERY_SQL by exercising toNumberOrNull branches,
// mapRow field identity, and the parameter-order contract.
// ===========================================================================

describe('toNumberOrNull — guard branches (mutation survivors)', () => {
  // toNumberOrNull is exercised via avg_project_cost which is the only
  // string-or-number field in the row shape. Each test passes a different
  // shape through mapRow and reads back the result.
  async function avgFrom(value: number | string | null) {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleRow, avg_project_cost: value }]),
    );
    const result = await queryBuilderLeads(
      'plumbing',
      43.65,
      -79.38,
      5,
      mock as unknown as Pool,
    );
    return result[0]?.avg_project_cost;
  }

  it('null input passes through as null', async () => {
    expect(await avgFrom(null)).toBeNull();
  });

  it('number input passes through unchanged', async () => {
    expect(await avgFrom(123456)).toBe(123456);
  });

  it('valid decimal string is parsed to a finite number', async () => {
    expect(await avgFrom('850000.50')).toBe(850000.5);
  });

  it('non-numeric string returns null (NaN guard)', async () => {
    expect(await avgFrom('not-a-number')).toBeNull();
  });

  it('empty string returns null (Number("") is 0 but the guard accepts it — documents current behaviour)', async () => {
    // Number("") === 0 which is finite. This test locks the current
    // behaviour so a future "reject empty string" fix becomes a visible
    // intentional change, not a silent drift.
    expect(await avgFrom('')).toBe(0);
  });
});

describe('mapRow — field passthrough identity (mutation survivors)', () => {
  it('preserves every row field in the output candidate with exact values', async () => {
    const mock = createMockPool();
    const row = {
      entity_id: 42,
      legal_name: 'TEST BUILDER',
      trade_name: 'Test Trade',
      business_size: 'Medium Business',
      primary_phone: '416-000-0001',
      primary_email: 'info@test.example',
      website: 'https://test.example',
      photo_url: 'https://test.example/logo.png',
      is_wsib_registered: false,
      active_permits_nearby: 7,
      closest_permit_m: 123,
      avg_project_cost: 550_000,
      proximity_score: 25,
      activity_score: 30,
      contact_score: 20,
      fit_score: 17,
      relevance_score: 92,
    };
    mock.query.mockResolvedValueOnce(qr([row]));
    const result = await queryBuilderLeads(
      'plumbing',
      43.65,
      -79.38,
      5,
      mock as unknown as Pool,
    );
    expect(result[0]).toEqual({
      entity_id: 42,
      legal_name: 'TEST BUILDER',
      trade_name: 'Test Trade',
      business_size: 'Medium Business',
      primary_phone: '416-000-0001',
      primary_email: 'info@test.example',
      website: 'https://test.example',
      photo_url: 'https://test.example/logo.png',
      is_wsib_registered: false,
      active_permits_nearby: 7,
      closest_permit_m: 123,
      avg_project_cost: 550_000,
      proximity_score: 25,
      activity_score: 30,
      contact_score: 20,
      fit_score: 17,
      relevance_score: 92,
    });
  });

  it('handles is_wsib_registered=true boolean correctly (not coerced)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleRow, is_wsib_registered: true }]),
    );
    const result = await queryBuilderLeads(
      'plumbing',
      43.65,
      -79.38,
      5,
      mock as unknown as Pool,
    );
    expect(result[0]?.is_wsib_registered).toBe(true);
  });

  it('handles is_wsib_registered=false boolean correctly (not coerced)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleRow, is_wsib_registered: false }]),
    );
    const result = await queryBuilderLeads(
      'plumbing',
      43.65,
      -79.38,
      5,
      mock as unknown as Pool,
    );
    expect(result[0]?.is_wsib_registered).toBe(false);
  });
});

describe('queryBuilderLeads — parameter order contract (mutation survivors)', () => {
  // The function signature is (slug, lat, lng, ...) matching codebase
  // convention, but internally the parameter array swaps to (slug, lng,
  // lat, radius_m) because PostGIS ST_MakePoint expects (x=lng, y=lat).
  // This test locks that exact order so a future "fix" that removes the
  // swap regresses visibly.

  it('pool.query receives parameters in the PostGIS order [slug, lng, lat, radius_m]', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await queryBuilderLeads(
      'electrical',
      43.65, // lat
      -79.38, // lng
      10, // km
      mock as unknown as Pool,
    );
    const call = mock.query.mock.calls[0];
    const params = call?.[1] as unknown[];
    expect(params).toEqual(['electrical', -79.38, 43.65, 10_000]);
  });

  it('radius is converted from km to meters (× 1000)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await queryBuilderLeads('plumbing', 43.65, -79.38, 25, mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1] as unknown[];
    expect(params[3]).toBe(25_000);
  });

  it('returns empty array on pool.query rejection (never throws)', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await queryBuilderLeads(
      'plumbing',
      43.65,
      -79.38,
      5,
      mock as unknown as Pool,
    );
    expect(result).toEqual([]);
  });
});

describe('BUILDER_QUERY_SQL — exact CASE band values (locks Stryker StringLiteral mutants)', () => {
  // The existing tests above check that CASE fragments exist but don't
  // lock the exact threshold numbers inside the SQL text. Stryker mutates
  // the literal '5' in `active_permits_nearby >= 5 THEN 30` to '0' and
  // the shape-only regex tests survive. The tests below lock the exact
  // number-to-band pairings per spec 70 §4 Builder scoring + spec 73.

  it('proximity score bands are 30/25/20/15/10/5/0 at 500/1000/2000/5000/10000/20000 metres', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/< 500\s+THEN 30/);
    expect(BUILDER_QUERY_SQL).toMatch(/< 1000\s+THEN 25/);
    expect(BUILDER_QUERY_SQL).toMatch(/< 2000\s+THEN 20/);
    expect(BUILDER_QUERY_SQL).toMatch(/< 5000\s+THEN 15/);
    expect(BUILDER_QUERY_SQL).toMatch(/< 10000\s+THEN 10/);
    expect(BUILDER_QUERY_SQL).toMatch(/< 20000\s+THEN 5/);
  });

  it('activity score bands are 30/25/20/15 at 5+/3-4/2/else permits', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby >= 5 THEN 30/);
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby >= 3 THEN 25/);
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby = 2 THEN 20/);
  });

  it('contact score bands are 20/15/10/0 by phone+website combinations', () => {
    expect(BUILDER_QUERY_SQL).toMatch(
      /website IS NOT NULL AND primary_phone IS NOT NULL THEN 20/,
    );
    expect(BUILDER_QUERY_SQL).toMatch(
      /website IS NOT NULL OR primary_phone IS NOT NULL THEN 15/,
    );
    expect(BUILDER_QUERY_SQL).toMatch(/primary_email IS NOT NULL THEN 10/);
  });

  it('fit score base bands are 20/17/14/10 with +3 WSIB bonus capped at 20', () => {
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby >= 5 THEN 20/);
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby >= 3 THEN 17/);
    expect(BUILDER_QUERY_SQL).toMatch(/active_permits_nearby = 2 THEN 14/);
    expect(BUILDER_QUERY_SQL).toMatch(
      /CASE WHEN is_wsib_registered THEN 3 ELSE 0 END/,
    );
  });
});
