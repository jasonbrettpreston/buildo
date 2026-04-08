// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Implementation
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  LEAD_FEED_SQL,
  MAX_FEED_LIMIT,
  getLeadFeed,
} from '@/features/leads/lib/get-lead-feed';
import { MAX_RADIUS_KM, metersFromKilometers } from '@/features/leads/lib/distance';
import type { LeadFeedInput } from '@/features/leads/types';

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

describe('LEAD_FEED_SQL — structure', () => {
  it('contains all 4 CTEs', () => {
    expect(LEAD_FEED_SQL).toMatch(/permit_candidates AS/);
    expect(LEAD_FEED_SQL).toMatch(/builder_candidates AS/);
    expect(LEAD_FEED_SQL).toMatch(/unified AS/);
    expect(LEAD_FEED_SQL).toMatch(/ranked AS/);
  });

  it('uses UNION ALL between candidate CTEs', () => {
    expect(LEAD_FEED_SQL).toMatch(/UNION ALL/);
  });

  it('contains all 4 score pillars in both candidates', () => {
    // Each pillar appears in both permit_candidates and builder_candidates
    expect((LEAD_FEED_SQL.match(/proximity_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/timing_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/value_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/opportunity_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('computes relevance_score as sum of 4 pillars in ranked CTE', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /\(proximity_score \+ timing_score \+ value_score \+ opportunity_score\) AS relevance_score/,
    );
  });

  it('uses cursor pagination via row tuple comparison', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /\$6::int IS NULL OR\s*\(relevance_score, lead_type, lead_id\) <\s*\(\$6::int, \$7::text, \$8::text\)/,
    );
  });

  it('orders by relevance_score DESC, lead_type DESC, lead_id DESC', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC/,
    );
  });

  it('limits via $5::int parameter', () => {
    expect(LEAD_FEED_SQL).toMatch(/LIMIT \$5::int/);
  });

  it('joins to trades table by trade_id and filters by t.slug (NOT pt.trade_slug — that column does not exist on permit_trades)', () => {
    // Regression: an earlier draft used `pt.trade_slug = $1` which would
    // fail at runtime because permit_trades has `trade_id INTEGER` only.
    // Caught by the holistic Phase 1 review.
    expect(LEAD_FEED_SQL).toMatch(/JOIN trades t ON t\.id = pt\.trade_id/);
    expect(LEAD_FEED_SQL).toMatch(/t\.slug = \$1/);
    expect(LEAD_FEED_SQL).not.toMatch(/pt\.trade_slug/);
  });

  it('filters permits by is_active + confidence >= 0.5', () => {
    expect(LEAD_FEED_SQL).toMatch(/pt\.is_active = true/);
    expect((LEAD_FEED_SQL.match(/pt\.confidence >= 0\.5/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('excludes cancelled / revoked / closed permits', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /p\.status NOT IN \('Cancelled', 'Revoked', 'Closed'\)/,
    );
  });

  it('uses ST_DWithin in both candidate CTEs', () => {
    expect((LEAD_FEED_SQL.match(/ST_DWithin\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('explicitly casts p.location to ::geography for meter-based distance (NOT degree-based)', () => {
    // Regression: spec 70 unified feed expects radius_km in METERS via ST_DWithin
    // and `<->`. The column is stored as `geometry(Point, 4326)` (migration 067)
    // for GIST index compatibility, but distance math must be meters. Without
    // an explicit `::geography` cast on `p.location`, PostGIS might resolve to
    // the geometry overload of ST_DWithin/`<->` and interpret radius_m as
    // DEGREES (1 degree ≈ 111km). Caught by Gemini Phase 0+1 holistic review.
    expect(LEAD_FEED_SQL).toMatch(/p\.location::geography/);
    // Should NOT have any bare `p.location` distance expressions
    expect(LEAD_FEED_SQL).not.toMatch(/p\.location <->/);
    expect(LEAD_FEED_SQL).not.toMatch(/ST_DWithin\(p\.location,/);
  });

  it('filters builder candidates by WSIB business_size allowlist', () => {
    expect(LEAD_FEED_SQL).toMatch(/business_size IN \('Small Business', 'Medium Business'\)/);
  });
});

// ---------------------------------------------------------------------------
// Function behaviour
// ---------------------------------------------------------------------------

const samplePermitRow = {
  lead_type: 'permit',
  lead_id: '24 101234:01',
  permit_num: '24 101234',
  revision_num: '01',
  status: 'Permit Issued',
  permit_type: 'New Building',
  description: 'New SFD',
  street_num: '47',
  street_name: 'Maple Ave',
  entity_id: null,
  legal_name: null,
  business_size: null,
  primary_phone: null,
  primary_email: null,
  website: null,
  photo_url: null,
  latitude: 43.65,
  longitude: -79.38,
  distance_m: 350,
  proximity_score: 30,
  timing_score: 30,
  value_score: 20,
  opportunity_score: 10,
  relevance_score: 90,
};

const sampleBuilderRow = {
  lead_type: 'builder',
  lead_id: '9183',
  permit_num: null,
  revision_num: null,
  status: null,
  permit_type: null,
  description: null,
  street_num: null,
  street_name: null,
  entity_id: 9183,
  legal_name: 'ACME CONSTRUCTION',
  business_size: 'Small Business',
  primary_phone: '416-555-1234',
  primary_email: null,
  website: 'https://acme.example',
  photo_url: null,
  latitude: null,
  longitude: null,
  distance_m: 500,
  proximity_score: 25,
  timing_score: 15,
  value_score: 20,
  opportunity_score: 7,
  relevance_score: 67,
};

function makeInput(overrides: Partial<LeadFeedInput> = {}): LeadFeedInput {
  return {
    user_id: 'firebase-uid-abc',
    trade_slug: 'plumbing',
    lat: 43.65,
    lng: -79.38,
    radius_km: 10,
    limit: 15,
    ...overrides,
  };
}

describe('getLeadFeed — function behaviour', () => {
  it('returns mapped LeadFeedItems on happy path', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow, sampleBuilderRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.lead_type).toBe('permit');
    expect(result.data[1]?.lead_type).toBe('builder');
    expect(result.meta.count).toBe(2);
    expect(result.meta.radius_km).toBe(10);
  });

  it('returns null next_cursor when rows.length < limit', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow])); // 1 row, limit 15
    const result = await getLeadFeed(makeInput({ limit: 15 }), mock as unknown as Pool);
    expect(result.meta.next_cursor).toBeNull();
  });

  it('extracts next_cursor from last row when rows.length === limit', async () => {
    const mock = createMockPool();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...samplePermitRow,
      lead_id: `permit-${i}`,
      relevance_score: 90 - i,
    }));
    mock.query.mockResolvedValueOnce(qr(rows));
    const result = await getLeadFeed(makeInput({ limit: 3 }), mock as unknown as Pool);
    expect(result.meta.next_cursor).not.toBeNull();
    expect(result.meta.next_cursor?.score).toBe(88);
    expect(result.meta.next_cursor?.lead_type).toBe('permit');
    expect(result.meta.next_cursor?.lead_id).toBe('permit-2');
  });

  it('returns empty result on empty rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toEqual([]);
    expect(result.meta.next_cursor).toBeNull();
    expect(result.meta.count).toBe(0);
  });

  it('returns safe empty result + does not throw on pool error', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toEqual([]);
    expect(result.meta.next_cursor).toBeNull();
    expect(result.meta.radius_km).toBe(10);
  });

  it('passes nulls for $6/$7/$8 on first page (no cursor)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput(), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it('passes cursor values for $6/$7/$8 on subsequent pages', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(
      makeInput({ cursor: { score: 75, lead_type: 'permit', lead_id: '24 101234:01' } }),
      mock as unknown as Pool,
    );
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[5]).toBe(75);
    expect(params[6]).toBe('permit');
    expect(params[7]).toBe('24 101234:01');
  });

  it('clamps limit to MAX_FEED_LIMIT (30) when input exceeds it (DoS prevention)', async () => {
    expect(MAX_FEED_LIMIT).toBe(30);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ limit: 1_000_000 }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[4]).toBe(MAX_FEED_LIMIT);
  });

  it('clamps limit to minimum of 1 when input is 0 or negative', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ limit: 0 }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[4]).toBe(1);
  });

  it('clamps radius_km to MAX_RADIUS_KM (50) when input exceeds it', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getLeadFeed(makeInput({ radius_km: 100 }), mock as unknown as Pool);
    expect(result.meta.radius_km).toBe(MAX_RADIUS_KM);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[3]).toBe(metersFromKilometers(MAX_RADIUS_KM));
  });

  it('passes parameters in spec order: $1=trade_slug, $2=lng, $3=lat, $4=radius_m, $5=limit', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(
      makeInput({ trade_slug: 'electrical', lat: 43.7, lng: -79.4, radius_km: 5, limit: 20 }),
      mock as unknown as Pool,
    );
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[0]).toBe('electrical');
    expect(params[1]).toBe(-79.4); // lng
    expect(params[2]).toBe(43.7);  // lat
    expect(params[3]).toBe(5000);  // radius_m
    expect(params[4]).toBe(20);    // limit
  });

  it('handles mixed permit + builder rows in same response', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow, sampleBuilderRow, samplePermitRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toHaveLength(3);
    expect(result.data.filter((r) => r.lead_type === 'permit')).toHaveLength(2);
    expect(result.data.filter((r) => r.lead_type === 'builder')).toHaveLength(1);
  });
});
