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
