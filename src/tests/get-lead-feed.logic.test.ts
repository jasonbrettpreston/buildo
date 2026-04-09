// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Implementation
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  LEAD_FEED_SQL,
  MAX_FEED_LIMIT,
  TIMING_DISPLAY_BY_CONFIDENCE,
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

  it('normalizes permit lead_id via LPAD(revision_num, 2, 0) to collapse DB "0"/"00" drift', () => {
    // Phase 0/1/2 holistic review finding: DB has both '0' and '00' as
    // revision_num values. Without padding, two ingest paths can produce
    // different lead_keys for the same permit revision, breaking
    // competition count dedup and cursor identity.
    expect(LEAD_FEED_SQL).toMatch(
      /permit_num \|\| ':' \|\| LPAD\(p\.revision_num, 2, '0'\)/,
    );
  });

  it('permit pillar boundaries match spec 70 §4 (value 0-20, opportunity 0-20)', () => {
    // Rescaled from pre-review drafts (value 0-30, opportunity 0-10) to
    // honor the per-pillar contract in spec 70 §4 lines 234-235. The
    // aggregate relevance_score ceiling is still 100 (30+30+20+20).
    expect(LEAD_FEED_SQL).toMatch(/WHEN 'mega'\s+THEN 20/);
    expect(LEAD_FEED_SQL).toMatch(/WHEN 'Permit Issued' THEN 20/);
    // The obsolete 0-30/0-10 bands must NOT reappear.
    expect(LEAD_FEED_SQL).not.toMatch(/WHEN 'mega'\s+THEN 30/);
    expect(LEAD_FEED_SQL).not.toMatch(/WHEN 'Permit Issued' THEN 10/);
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

  // ---- Phase 3-iii widened SELECTs ----
  it('joins permits to neighbourhoods (LEFT JOIN, NULL-safe)', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /LEFT JOIN neighbourhoods n ON n\.neighbourhood_id = p\.neighbourhood_id/,
    );
  });

  it('projects neighbourhood_name on permit_candidates', () => {
    expect(LEAD_FEED_SQL).toMatch(/n\.name\s+AS neighbourhood_name/);
  });

  it('projects cost_tier and estimated_cost on permit_candidates', () => {
    expect(LEAD_FEED_SQL).toMatch(/ce\.cost_tier\s+AS cost_tier/);
    // DECIMAL(15,2) explicit cast prevents node-pg returning a string
    expect(LEAD_FEED_SQL).toMatch(/ce\.estimated_cost::float8\s+AS estimated_cost/);
  });

  it('projects active_permits_nearby and avg_project_cost on builder_candidates', () => {
    // COUNT DISTINCT defends against entity_projects duplication
    expect(LEAD_FEED_SQL).toMatch(
      /COUNT\(DISTINCT \(p\.permit_num, p\.revision_num\)\)::int AS active_permits_nearby/,
    );
    expect(LEAD_FEED_SQL).toMatch(
      /AVG\(p\.est_const_cost::float8\) FILTER \(WHERE p\.est_const_cost > 0\) AS avg_project_cost/,
    );
  });

  it('WSIB LATERAL has a deterministic tiebreaker on w2.id', () => {
    // Without the secondary ORDER BY, two WSIB rows with the same
    // last_enriched_at produce non-deterministic ordering, breaking
    // cursor stability. (DeepSeek 2026-04-09 review.)
    expect(LEAD_FEED_SQL).toMatch(/ORDER BY w2\.last_enriched_at DESC, w2\.id DESC/);
  });

  it('mirrors widened columns as NULL on the other branch (UNION ALL shape)', () => {
    // Permit branch must NULL out builder-only stats
    expect(LEAD_FEED_SQL).toMatch(/NULL::int\s+AS active_permits_nearby/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::float8\s+AS avg_project_cost/);
    // Builder branch must NULL out permit-only address/cost columns
    expect(LEAD_FEED_SQL).toMatch(/NULL::text\s+AS neighbourhood_name/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::text\s+AS cost_tier/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::float8\s+AS estimated_cost/);
  });
});

describe('TIMING_DISPLAY_BY_CONFIDENCE', () => {
  it('maps every confidence value to a non-empty display string', () => {
    expect(TIMING_DISPLAY_BY_CONFIDENCE.high).toBeTruthy();
    expect(TIMING_DISPLAY_BY_CONFIDENCE.medium).toBeTruthy();
    expect(TIMING_DISPLAY_BY_CONFIDENCE.low).toBeTruthy();
  });

  it('returns distinct phrases per confidence level', () => {
    const values = new Set(Object.values(TIMING_DISPLAY_BY_CONFIDENCE));
    expect(values.size).toBe(3);
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
  // Phase 3-iii widened columns (permit branch)
  neighbourhood_name: 'High Park',
  cost_tier: 'large',
  estimated_cost: 750000,
  active_permits_nearby: null,
  avg_project_cost: null,
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
  // 'Permit Issued' maps to 20 in the SQL CASE (was 10 in a pre-review
  // 0-10 draft; spec 70 §4 line 235 pins opportunity at 0-20). Independent
  // review 2026-04-09 caught this fixture drift — kept the row otherwise
  // identical so the relevance_score sum lines up at 100.
  opportunity_score: 20,
  relevance_score: 100,
  timing_confidence: 'high' as const,
  opportunity_type: 'newbuild' as const,
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
  // Phase 3-iii widened columns (builder branch)
  neighbourhood_name: null,
  cost_tier: null,
  estimated_cost: null,
  active_permits_nearby: 4,
  avg_project_cost: 425000,
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
  timing_confidence: 'high' as const,
  opportunity_type: 'builder-led' as const,
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

  it('next_cursor uses RAW res.rows.length, not post-mapRow data.length (Gemini+DeepSeek 2026-04-09 CRITICAL)', async () => {
    // Pre-fix: mapRow could drop a malformed row → data.length <
    // clampedLimit → next_cursor=null → silent feed truncation. Now
    // the cursor decision uses res.rows.length and the last raw row.
    // Simulate by feeding 3 rows where the middle one is malformed
    // (entity_id=null on a builder row → mapRow drops it).
    const mock = createMockPool();
    const goodPermit = { ...samplePermitRow, lead_id: 'p-good', relevance_score: 95 };
    const malformedBuilder = {
      ...sampleBuilderRow,
      lead_id: 'b-bad',
      entity_id: null, // forces mapRow to drop
      relevance_score: 90,
    };
    const tailPermit = { ...samplePermitRow, lead_id: 'p-tail', relevance_score: 85 };
    mock.query.mockResolvedValueOnce(qr([goodPermit, malformedBuilder, tailPermit]));
    const result = await getLeadFeed(makeInput({ limit: 3 }), mock as unknown as Pool);
    // data has only 2 items (the malformed one was dropped), but
    // res.rows.length === 3 === limit so the cursor MUST be set,
    // pointing at the last RAW row's lead_id.
    expect(result.data).toHaveLength(2);
    expect(result.meta.next_cursor).not.toBeNull();
    expect(result.meta.next_cursor?.lead_id).toBe('p-tail');
    expect(result.meta.next_cursor?.score).toBe(85);
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

  it('THROWS on pool error so the route layer can return 500 (spec 70 §API Endpoints)', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(
      getLeadFeed(makeInput(), mock as unknown as Pool),
    ).rejects.toThrow('connection refused');
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

// ---------------------------------------------------------------------------
// Phase 3-iii widened mapRow coverage
// ---------------------------------------------------------------------------

describe('mapRow — widened columns', () => {
  it('passes through neighbourhood_name, cost_tier, estimated_cost on permit rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.lead_type).toBe('permit');
    if (item?.lead_type === 'permit') {
      expect(item.neighbourhood_name).toBe('High Park');
      expect(item.cost_tier).toBe('large');
      expect(item.estimated_cost).toBe(750000);
    }
  });

  it('handles permit row with NULL neighbourhood (orphan from geocoder)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, neighbourhood_name: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.neighbourhood_name).toBeNull();
    }
  });

  it('handles permit row with NULL cost_estimate (no cached estimate)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, cost_tier: null, estimated_cost: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.cost_tier).toBeNull();
      expect(item.estimated_cost).toBeNull();
    }
  });

  it('narrows unknown cost_tier strings to null (defensive)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, cost_tier: 'gigantic' }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      // Bad enum value from a future SQL drift should not crash mapRow
      expect(item.cost_tier).toBeNull();
    }
  });

  it('coerces estimated_cost from a string (node-pg DECIMAL fallback)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, estimated_cost: '750000.50' }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.estimated_cost).toBe(750000.5);
    }
  });

  it('passes through active_permits_nearby and avg_project_cost on builder rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([sampleBuilderRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.lead_type).toBe('builder');
    if (item?.lead_type === 'builder') {
      expect(item.active_permits_nearby).toBe(4);
      expect(item.avg_project_cost).toBe(425000);
    }
  });

  it('handles builder row with NULL avg_project_cost (zero costed permits)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, avg_project_cost: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'builder') {
      expect(item.avg_project_cost).toBeNull();
    }
  });

  it('defaults active_permits_nearby to 0 if SQL drift returns null', async () => {
    // mapRow falls back to 0 instead of dropping the row, since "0
    // active permits" is a sensible card display
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, active_permits_nearby: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'builder') {
      expect(item.active_permits_nearby).toBe(0);
    }
  });

  it('synthesizes timing_display from confidence on every row', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([
        { ...samplePermitRow, timing_confidence: 'high' as const },
        { ...samplePermitRow, lead_id: 'p2', timing_confidence: 'medium' as const },
        { ...samplePermitRow, lead_id: 'p3', timing_confidence: 'low' as const },
      ]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data[0]?.timing_display).toBe(TIMING_DISPLAY_BY_CONFIDENCE.high);
    expect(result.data[1]?.timing_display).toBe(TIMING_DISPLAY_BY_CONFIDENCE.medium);
    expect(result.data[2]?.timing_display).toBe(TIMING_DISPLAY_BY_CONFIDENCE.low);
  });
});
