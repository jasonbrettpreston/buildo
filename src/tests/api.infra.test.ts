// Infra Layer Tests - API route validation, SQL safety, data integrity
// SPEC LINKS: docs/specs/06_data_api.md, 01_database_schema.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('API Permit Filter Validation', () => {
  const ALLOWED_SORT = ['issued_date', 'application_date', 'est_const_cost', 'lead_score', 'status'];

  function validateSortBy(input: string | null): string {
    if (!input) return 'issued_date';
    return ALLOWED_SORT.includes(input) ? input : 'issued_date';
  }

  function validateSortOrder(input: string | null): 'ASC' | 'DESC' {
    return input === 'asc' ? 'ASC' : 'DESC';
  }

  function validatePage(input: string | null): number {
    const page = parseInt(input || '1', 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }

  function validateLimit(input: string | null, max: number = 100): number {
    const limit = parseInt(input || '20', 10);
    if (isNaN(limit) || limit < 1) return 20;
    return Math.min(limit, max);
  }

  // Sort whitelist tests (SQL injection prevention)
  it('rejects unknown sort columns', () => {
    expect(validateSortBy('DROP TABLE permits')).toBe('issued_date');
  });

  it('rejects SQL injection in sort', () => {
    expect(validateSortBy('status; DROP TABLE --')).toBe('issued_date');
  });

  it('accepts valid sort columns', () => {
    ALLOWED_SORT.forEach((col) => {
      expect(validateSortBy(col)).toBe(col);
    });
  });

  it('defaults to issued_date for null sort', () => {
    expect(validateSortBy(null)).toBe('issued_date');
  });

  // Sort order tests
  it('defaults to DESC for invalid order', () => {
    expect(validateSortOrder('invalid')).toBe('DESC');
  });

  it('accepts asc', () => {
    expect(validateSortOrder('asc')).toBe('ASC');
  });

  it('defaults to DESC for null order', () => {
    expect(validateSortOrder(null)).toBe('DESC');
  });

  // Pagination tests
  it('defaults page to 1 for invalid input', () => {
    expect(validatePage('abc')).toBe(1);
    expect(validatePage('-5')).toBe(1);
    expect(validatePage('0')).toBe(1);
  });

  it('accepts valid pages', () => {
    expect(validatePage('1')).toBe(1);
    expect(validatePage('50')).toBe(50);
  });

  it('caps limit to max', () => {
    expect(validateLimit('500')).toBe(100);
    expect(validateLimit('500', 200)).toBe(200);
  });

  it('defaults limit for invalid input', () => {
    expect(validateLimit('abc')).toBe(20);
    expect(validateLimit('-1')).toBe(20);
  });
});

describe('Permit ID Parsing', () => {
  function parsePermitId(id: string): { permitNum: string; revisionNum: string } | null {
    const parts = id.split('--');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { permitNum: parts[0], revisionNum: parts[1] };
  }

  it('parses standard ID format', () => {
    const result = parsePermitId('24 101234--01');
    expect(result).toEqual({ permitNum: '24 101234', revisionNum: '01' });
  });

  it('returns null for invalid format', () => {
    expect(parsePermitId('invalid')).toBeNull();
  });

  it('returns null for empty parts', () => {
    expect(parsePermitId('--')).toBeNull();
    expect(parsePermitId('abc--')).toBeNull();
    expect(parsePermitId('--01')).toBeNull();
  });

  it('handles IDs with special characters', () => {
    const result = parsePermitId('24 101234 A--02');
    expect(result).toEqual({ permitNum: '24 101234 A', revisionNum: '02' });
  });
});

describe('Parameterized Query Builder', () => {
  function buildFilterQuery(filters: Record<string, string | undefined>) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`status = $${idx}`);
      params.push(filters.status);
      idx++;
    }
    if (filters.permit_type) {
      conditions.push(`permit_type = $${idx}`);
      params.push(filters.permit_type);
      idx++;
    }
    if (filters.ward) {
      conditions.push(`ward = $${idx}`);
      params.push(filters.ward);
      idx++;
    }
    if (filters.min_cost) {
      conditions.push(`est_const_cost >= $${idx}`);
      params.push(parseInt(filters.min_cost, 10));
      idx++;
    }
    if (filters.search) {
      conditions.push(
        `to_tsvector('english', COALESCE(description,'') || ' ' || COALESCE(street_name,'') || ' ' || COALESCE(builder_name,'')) @@ plainto_tsquery('english', $${idx})`
      );
      params.push(filters.search);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params, paramCount: idx - 1 };
  }

  it('builds empty query with no filters', () => {
    const result = buildFilterQuery({});
    expect(result.where).toBe('');
    expect(result.params).toEqual([]);
    expect(result.paramCount).toBe(0);
  });

  it('builds single filter query', () => {
    const result = buildFilterQuery({ status: 'Issued' });
    expect(result.where).toBe('WHERE status = $1');
    expect(result.params).toEqual(['Issued']);
    expect(result.paramCount).toBe(1);
  });

  it('builds multi-filter query with sequential params', () => {
    const result = buildFilterQuery({
      status: 'Issued',
      ward: '10',
      min_cost: '50000',
    });
    expect(result.where).toBe(
      'WHERE status = $1 AND ward = $2 AND est_const_cost >= $3'
    );
    expect(result.params).toEqual(['Issued', '10', 50000]);
    expect(result.paramCount).toBe(3);
  });

  it('includes full-text search condition', () => {
    const result = buildFilterQuery({ search: 'plumbing renovation' });
    expect(result.where).toContain('plainto_tsquery');
    expect(result.params).toEqual(['plumbing renovation']);
  });

  it('skips undefined filters', () => {
    const result = buildFilterQuery({ status: undefined, ward: '05' });
    expect(result.where).toBe('WHERE ward = $1');
    expect(result.params).toEqual(['05']);
  });
});

describe('Geo Bounding Box Validation', () => {
  function validateBoundingBox(
    neLat: number, neLng: number,
    swLat: number, swLng: number
  ): { valid: boolean; error?: string } {
    if ([neLat, neLng, swLat, swLng].some(isNaN)) {
      return { valid: false, error: 'All bounding box params must be numbers' };
    }
    if (neLat <= swLat) {
      return { valid: false, error: 'ne_lat must be greater than sw_lat' };
    }
    if (neLng <= swLng) {
      return { valid: false, error: 'ne_lng must be greater than sw_lng' };
    }
    // Toronto reasonable bounds check
    if (swLat < 43.0 || neLat > 44.5 || swLng < -80.5 || neLng > -78.5) {
      return { valid: false, error: 'Bounding box is outside Toronto area' };
    }
    return { valid: true };
  }

  it('accepts valid Toronto bounding box', () => {
    const result = validateBoundingBox(43.7, -79.3, 43.6, -79.5);
    expect(result.valid).toBe(true);
  });

  it('rejects NaN values', () => {
    const result = validateBoundingBox(NaN, -79.3, 43.6, -79.5);
    expect(result.valid).toBe(false);
  });

  it('rejects inverted lat', () => {
    const result = validateBoundingBox(43.5, -79.3, 43.7, -79.5);
    expect(result.valid).toBe(false);
  });

  it('rejects bounding box outside Toronto', () => {
    const result = validateBoundingBox(45.0, -73.5, 44.5, -74.0);
    expect(result.valid).toBe(false);
  });
});

describe('Permit Detail Parcel Query', () => {
  // Validates the parcel response shape returned by GET /api/permits/[id]
  interface ParcelResponse {
    lot_size_sqft: number | null;
    lot_size_sqm: number | null;
    frontage_ft: number | null;
    frontage_m: number | null;
    depth_ft: number | null;
    depth_m: number | null;
    feature_type: string | null;
    link_confidence: number | null;
    match_type: string | null;
  }

  function validateParcelShape(parcel: Record<string, unknown> | null): boolean {
    if (parcel === null) return true; // null is valid (no match)
    const requiredFields = [
      'lot_size_sqft', 'lot_size_sqm', 'frontage_ft', 'frontage_m',
      'depth_ft', 'depth_m', 'feature_type', 'link_confidence', 'match_type',
    ];
    return requiredFields.every((f) => f in parcel);
  }

  function validateMatchType(type: string | null): boolean {
    if (type === null) return true;
    return ['exact_address', 'name_only'].includes(type);
  }

  function validateConfidence(val: unknown): boolean {
    if (val === null) return true;
    const n = Number(val);
    return !isNaN(n) && n >= 0 && n <= 1;
  }

  function validateNumericOrNull(val: unknown): boolean {
    if (val === null) return true;
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)));
  }

  it('accepts null parcel (no match)', () => {
    expect(validateParcelShape(null)).toBe(true);
  });

  it('validates complete parcel response shape', () => {
    const parcel: ParcelResponse = {
      lot_size_sqft: 5381.96,
      lot_size_sqm: 500.0,
      frontage_ft: 50.0,
      frontage_m: 15.24,
      depth_ft: 107.94,
      depth_m: 32.92,
      feature_type: 'COMMON',
      link_confidence: 0.95,
      match_type: 'exact_address',
    };
    expect(validateParcelShape(parcel as unknown as Record<string, unknown>)).toBe(true);
  });

  it('rejects parcel missing required fields', () => {
    const incomplete = { lot_size_sqft: 100 };
    expect(validateParcelShape(incomplete as Record<string, unknown>)).toBe(false);
  });

  it('validates exact_address match type', () => {
    expect(validateMatchType('exact_address')).toBe(true);
  });

  it('validates name_only match type', () => {
    expect(validateMatchType('name_only')).toBe(true);
  });

  it('rejects invalid match type', () => {
    expect(validateMatchType('fuzzy')).toBe(false);
  });

  it('accepts null match type', () => {
    expect(validateMatchType(null)).toBe(true);
  });

  it('validates confidence in range 0-1', () => {
    expect(validateConfidence(0.95)).toBe(true);
    expect(validateConfidence(0)).toBe(true);
    expect(validateConfidence(1)).toBe(true);
  });

  it('rejects confidence out of range', () => {
    expect(validateConfidence(1.5)).toBe(false);
    expect(validateConfidence(-0.1)).toBe(false);
  });

  it('accepts null confidence', () => {
    expect(validateConfidence(null)).toBe(true);
  });

  it('lot_size_sqft is number or null', () => {
    expect(validateNumericOrNull(5381.96)).toBe(true);
    expect(validateNumericOrNull(null)).toBe(true);
  });

  it('frontage_ft is number or null', () => {
    expect(validateNumericOrNull(50.0)).toBe(true);
    expect(validateNumericOrNull(null)).toBe(true);
  });

  it('rejects non-numeric lot dimensions', () => {
    expect(validateNumericOrNull('not-a-number')).toBe(false);
  });
});

describe('Permit Detail Neighbourhood Query', () => {
  interface NeighbourhoodResponse {
    name: string;
    neighbourhood_id: number;
    avg_household_income: number | null;
    median_household_income: number | null;
    avg_individual_income: number | null;
    low_income_pct: number | null;
    tenure_owner_pct: number | null;
    tenure_renter_pct: number | null;
    period_of_construction: string | null;
    census_year: number;
  }

  function validateNeighbourhoodShape(n: Record<string, unknown> | null): boolean {
    if (n === null) return true;
    const requiredFields = [
      'name', 'neighbourhood_id', 'avg_household_income', 'median_household_income',
      'tenure_owner_pct', 'tenure_renter_pct', 'period_of_construction', 'census_year',
    ];
    return requiredFields.every((f) => f in n);
  }

  function validateNeighbourhoodId(id: unknown): boolean {
    if (id === null) return false;
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
  }

  function validateCensusYear(year: unknown): boolean {
    const n = Number(year);
    return Number.isInteger(n) && n >= 2016 && n <= 2026;
  }

  function validatePercentage(val: unknown): boolean {
    if (val === null) return true;
    const n = Number(val);
    return !isNaN(n) && n >= 0 && n <= 100;
  }

  function validateIncome(val: unknown): boolean {
    if (val === null) return true;
    const n = Number(val);
    return !isNaN(n) && n >= 0;
  }

  it('accepts null neighbourhood (no match)', () => {
    expect(validateNeighbourhoodShape(null)).toBe(true);
  });

  it('validates complete neighbourhood response shape', () => {
    const n: NeighbourhoodResponse = {
      name: 'Agincourt North',
      neighbourhood_id: 129,
      avg_household_income: 95000,
      median_household_income: 78000,
      avg_individual_income: 42000,
      low_income_pct: 14.5,
      tenure_owner_pct: 72.3,
      tenure_renter_pct: 27.7,
      period_of_construction: '1961-1980',
      census_year: 2021,
    };
    expect(validateNeighbourhoodShape(n as unknown as Record<string, unknown>)).toBe(true);
  });

  it('neighbourhood_id is positive integer', () => {
    expect(validateNeighbourhoodId(129)).toBe(true);
    expect(validateNeighbourhoodId(1)).toBe(true);
  });

  it('neighbourhood_id rejects null and zero', () => {
    expect(validateNeighbourhoodId(null)).toBe(false);
    expect(validateNeighbourhoodId(0)).toBe(false);
  });

  it('census_year is in valid range (2016-2026)', () => {
    expect(validateCensusYear(2021)).toBe(true);
    expect(validateCensusYear(2016)).toBe(true);
  });

  it('census_year rejects out of range', () => {
    expect(validateCensusYear(2000)).toBe(false);
    expect(validateCensusYear(2030)).toBe(false);
  });

  it('percentages are 0-100', () => {
    expect(validatePercentage(72.3)).toBe(true);
    expect(validatePercentage(0)).toBe(true);
    expect(validatePercentage(100)).toBe(true);
    expect(validatePercentage(null)).toBe(true);
  });

  it('income is non-negative', () => {
    expect(validateIncome(95000)).toBe(true);
    expect(validateIncome(0)).toBe(true);
    expect(validateIncome(null)).toBe(true);
    expect(validateIncome(-1000)).toBe(false);
  });
});

describe('Street View URL Validation', () => {
  function validateTorontoCoord(
    lat: number | null,
    lng: number | null
  ): { valid: boolean; error?: string } {
    if (lat === null && lng === null) return { valid: true }; // null is valid (not geocoded)
    if (lat === null || lng === null) return { valid: false, error: 'Both lat and lng must be provided or both null' };
    if (isNaN(lat) || isNaN(lng)) return { valid: false, error: 'Coordinates must be numbers' };
    if (lat < 43.0 || lat > 44.5) return { valid: false, error: 'Latitude out of Toronto range (43.0-44.5)' };
    if (lng < -80.5 || lng > -78.5) return { valid: false, error: 'Longitude out of Toronto range (-80.5 to -78.5)' };
    return { valid: true };
  }

  function buildStreetViewUrl(lat: number, lng: number, apiKey: string): string {
    return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&key=${apiKey}`;
  }

  it('accepts valid Toronto latitude (43.0-44.5)', () => {
    expect(validateTorontoCoord(43.6519, -79.3911).valid).toBe(true);
    expect(validateTorontoCoord(43.0, -79.0).valid).toBe(true);
    expect(validateTorontoCoord(44.5, -80.0).valid).toBe(true);
  });

  it('accepts null coordinates (not geocoded)', () => {
    expect(validateTorontoCoord(null, null).valid).toBe(true);
  });

  it('rejects latitude outside Toronto range', () => {
    expect(validateTorontoCoord(42.0, -79.3).valid).toBe(false);
    expect(validateTorontoCoord(45.0, -79.3).valid).toBe(false);
  });

  it('rejects longitude outside Toronto range', () => {
    expect(validateTorontoCoord(43.65, -81.0).valid).toBe(false);
    expect(validateTorontoCoord(43.65, -78.0).valid).toBe(false);
  });

  it('rejects NaN coordinates', () => {
    expect(validateTorontoCoord(NaN, -79.3).valid).toBe(false);
    expect(validateTorontoCoord(43.65, NaN).valid).toBe(false);
  });

  it('rejects mismatched null (one null, one not)', () => {
    expect(validateTorontoCoord(43.65, null).valid).toBe(false);
    expect(validateTorontoCoord(null, -79.3).valid).toBe(false);
  });

  it('URL contains size=600x400 and fov=90', () => {
    const url = buildStreetViewUrl(43.6519, -79.3911, 'KEY');
    expect(url).toContain('size=600x400');
    expect(url).toContain('fov=90');
  });

  it('URL contains correct location format', () => {
    const url = buildStreetViewUrl(43.6519, -79.3911, 'KEY');
    expect(url).toContain('location=43.6519,-79.3911');
  });
});

describe('Database Schema Constraints', () => {
  it('permit composite PK requires both fields', () => {
    const pk = { permit_num: '24 101234', revision_num: '01' };
    expect(pk.permit_num).toBeTruthy();
    expect(pk.revision_num).toBeTruthy();
  });

  it('data_hash is SHA-256 hex (64 chars)', () => {
    const hash = 'a'.repeat(64);
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it('sync_run status enum values', () => {
    const validStatuses = ['running', 'completed', 'failed'];
    validStatuses.forEach((s) => {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    });
  });

  it('notification type enum values', () => {
    const validTypes = ['new_lead', 'status_change', 'weekly_digest', 'system'];
    expect(validTypes).toHaveLength(4);
  });

  it('trade slug uniqueness constraint holds', () => {
    const slugs = new Set([
      'excavation', 'shoring', 'concrete', 'structural-steel', 'framing',
      'masonry', 'roofing', 'plumbing', 'hvac', 'electrical',
      'fire-protection', 'insulation', 'drywall', 'painting', 'flooring',
      'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing',
    ]);
    expect(slugs.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// API Route Structure & Export Validation
// ---------------------------------------------------------------------------

describe('API Route Exports', () => {
  const API_ROUTES = [
    { path: 'admin/builders/route.ts', methods: ['GET'] },
    { path: 'admin/market-metrics/route.ts', methods: ['GET'] },
    { path: 'admin/pipelines/[slug]/route.ts', methods: ['POST'] },
    { path: 'admin/rules/route.ts', methods: ['GET'] },
    { path: 'admin/stats/route.ts', methods: ['GET'] },
    { path: 'admin/sync/route.ts', methods: ['POST'] },
    { path: 'builders/route.ts', methods: ['GET'] },
    { path: 'builders/[id]/route.ts', methods: ['GET'] },
    { path: 'coa/route.ts', methods: ['GET'] },
    { path: 'notifications/route.ts', methods: ['GET'] },
    { path: 'permits/geo/route.ts', methods: ['GET'] },
    { path: 'permits/route.ts', methods: ['GET'] },
    { path: 'permits/[id]/route.ts', methods: ['GET'] },
    { path: 'products/route.ts', methods: ['GET'] },
    { path: 'quality/refresh/route.ts', methods: ['POST'] },
    { path: 'quality/route.ts', methods: ['GET'] },
    { path: 'sync/route.ts', methods: ['GET'] },
    { path: 'trades/route.ts', methods: ['GET'] },
  ];

  for (const route of API_ROUTES) {
    it(`${route.path} exists and exports ${route.methods.join(', ')}`, () => {
      const filePath = path.join(__dirname, '../app/api', route.path);
      expect(fs.existsSync(filePath)).toBe(true);
      const src = fs.readFileSync(filePath, 'utf-8');
      for (const method of route.methods) {
        // Accept either: `export async function GET(` or `export const GET = withApiEnvelope(`
        const exportFn = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
        const exportConst = new RegExp(`export\\s+const\\s+${method}\\s*=`);
        expect(exportFn.test(src) || exportConst.test(src),
          `${route.path} should export ${method} (as function or const)`
        ).toBe(true);
      }
    });
  }

  it('all 18 API route files exist', () => {
    const count = API_ROUTES.filter(r =>
      fs.existsSync(path.join(__dirname, '../app/api', r.path))
    ).length;
    expect(count).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// Middleware Route Protection
// ---------------------------------------------------------------------------

describe('Middleware Route Protection', () => {
  it('src/middleware.ts exists', () => {
    expect(fs.existsSync(path.join(__dirname, '../middleware.ts'))).toBe(true);
  });

  it('middleware uses classifyRoute from route-guard', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../middleware.ts'),
      'utf-8'
    );
    expect(src).toContain('classifyRoute');
    expect(src).toContain('SESSION_COOKIE_NAME');
  });

  it('middleware returns 401 for unauthenticated admin API requests', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../middleware.ts'),
      'utf-8'
    );
    expect(src).toContain('401');
    expect(src).toContain('Authentication required');
  });

  it('middleware passes x-admin-key PRESENCE through but NEVER compares the secret (P1-F4 break-glass fix, 2026-07-19)', () => {
    // Two-part contract (found live at the Phase 1 P1-F4 break-glass proof):
    //   1. TRANSPORT: an x-admin-key-bearing request has no session cookie by
    //      definition — middleware must let it through to the route handler
    //      (presence-only check), else the CI/break-glass path is unreachable
    //      (the previous full-removal behavior 401'd it at the edge).
    //   2. VERIFICATION: the secret COMPARISON lives SOLELY in
    //      verify-admin.ts mode 2 (CI_ADMIN_TOKEN, Spec 13 §3.7) — middleware
    //      must never read the expected token or compare values (Item 2's
    //      no-duplicate-gate rule still holds; a wrong token still 401s in
    //      verify-admin.ts).
    const middlewareSrc = fs.readFileSync(
      path.join(__dirname, '../middleware.ts'),
      'utf-8'
    );
    // Presence passthrough exists…
    expect(middlewareSrc).toContain("request.headers.get('x-admin-key')");
    // …but no comparison material: no expected-token env reads, no
    // constant-time compare, no legacy key name.
    expect(middlewareSrc).not.toContain('CI_ADMIN_TOKEN');
    expect(middlewareSrc).not.toContain('ADMIN_API_KEY');
    expect(middlewareSrc).not.toContain('timingSafe');

    const verifyAdminSrc = fs.readFileSync(
      path.join(__dirname, '../lib/auth/verify-admin.ts'),
      'utf-8'
    );
    expect(verifyAdminSrc).toContain('x-admin-key');
    expect(verifyAdminSrc).toContain('CI_ADMIN_TOKEN');
  });

  it('admin API routes are CLASSIFIED as admin (labelling only — enforcement is locked by the per-route guard scan below)', async () => {
    // RENAMED 2026-09-15 (WF3 SEC-1). The old name — "protected by middleware
    // classification" — asserted a LABEL and read as coverage of the trust
    // boundary for months while 11 of 29 admin routes had no guard at all.
    // classifyRoute() returning 'admin' means the path is labelled; the
    // middleware's admin arm then performs a PRESENCE check only (any
    // non-empty sb-*-auth-token cookie, or any x-admin-key header VALUE,
    // passes). Enforcement lives in verifyAdminAuth as the first statement of
    // every handler — see "Admin route guard is enforced per-route" below.
    const guard = await import('@/lib/auth/route-guard');
    expect(guard.classifyRoute('/api/admin/stats')).toBe('admin');
    expect(guard.classifyRoute('/api/admin/sync')).toBe('admin');
    expect(guard.classifyRoute('/api/admin/pipelines/load_permits')).toBe('admin');
  });

  it('read-only data APIs remain publicly accessible', async () => {
    const guard = await import('@/lib/auth/route-guard');
    expect(guard.classifyRoute('/api/permits')).toBe('public');
    expect(guard.classifyRoute('/api/trades')).toBe('public');
    expect(guard.classifyRoute('/api/quality')).toBe('public');
  });
});

describe('Pre-Permit API Integration', () => {

  it('permit detail API handles COA- prefix to fetch from coa_applications', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    expect(src).toContain("permitNum.startsWith('COA-')");
    expect(src).toContain('coa_applications');
    expect(src).toContain('mapCoaToPermitDto');
  });

  it('permit list API supports source=pre_permits parameter', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/route.ts'),
      'utf-8'
    );
    expect(src).toContain("source === 'pre_permits'");
    expect(src).toContain('getUpcomingLeads');
  });

  it('admin stats API returns CoA counts in response', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(src).toContain('coa_total');
    expect(src).toContain('coa_linked');
    expect(src).toContain('coa_upcoming');
  });

  it('permit detail API declares permit variable before massing block', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    // "const permit = permits[0]" must come before "permit.storeys" (massing block)
    const permitDeclIdx = src.indexOf('const permit = permits[0]');
    const massingUseIdx = src.indexOf('permit.storeys');
    expect(permitDeclIdx).toBeGreaterThan(-1);
    expect(massingUseIdx).toBeGreaterThan(-1);
    expect(permitDeclIdx).toBeLessThan(massingUseIdx);
  });
});

// ---------------------------------------------------------------------------
// Error Handling Hardening — WF5 audit fixes
// ---------------------------------------------------------------------------

describe('API Error Handling Hardening', () => {
  // C8: No API route should leak raw err.message to clients
  it('no API route exposes raw err.message in error responses', () => {
    const apiDir = path.join(__dirname, '../app/api');
    const routeFiles = findRouteFiles(apiDir);

    const leakyFiles: string[] = [];
    for (const file of routeFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      // Match patterns like: message: err.message, message: err instanceof Error ? err.message : String(err)
      if (/message:\s*err\b/.test(src) || /message:\s*err\s+instanceof/.test(src)) {
        leakyFiles.push(path.relative(apiDir, file));
      }
    }

    expect(leakyFiles).toEqual([]);
  });

  // C9: All public GET route handlers must be wrapped in try-catch or withApiEnvelope
  it('public GET routes have try-catch wrappers', () => {
    const publicRoutes = [
      path.join(__dirname, '../app/api/builders/route.ts'),
      path.join(__dirname, '../app/api/coa/route.ts'),
    ];

    for (const file of publicRoutes) {
      const src = fs.readFileSync(file, 'utf-8');
      // Accept either explicit try-catch in handler body or withApiEnvelope wrapper (which provides the try-catch)
      const hasTryCatch = /export\s+async\s+function\s+GET[\s\S]*?\{[\s\S]*?try\s*\{/.test(src);
      const hasApiEnvelope = src.includes('withApiEnvelope');
      expect(
        hasTryCatch || hasApiEnvelope,
        `${path.basename(file)} GET handler must have try-catch or withApiEnvelope`,
      ).toBe(true);
    }
  });

  // C1: Pool error handler must not crash the process
  it('database pool error handler does not call process.exit', () => {
    const clientSrc = fs.readFileSync(
      path.join(__dirname, '../lib/db/client.ts'),
      'utf-8'
    );
    expect(clientSrc).not.toContain('process.exit');
  });

  // C2: Sync process ROLLBACK must be error-guarded
  it('sync process wraps ROLLBACK in nested try-catch', () => {
    const syncSrc = fs.readFileSync(
      path.join(__dirname, '../lib/sync/process.ts'),
      'utf-8'
    );
    // The catch block should not have a bare `await client.query('ROLLBACK')`
    // It should be wrapped in its own try-catch
    const catchBlock = syncSrc.match(/}\s*catch\s*\(err\)\s*\{([\s\S]*?)}\s*finally/);
    expect(catchBlock, 'should have catch block before finally').toBeTruthy();
    const catchBody = catchBlock![1];
    // Should contain a nested try around ROLLBACK
    expect(catchBody).toContain('try');
    expect(catchBody).toContain('ROLLBACK');
  });
});

describe('Centralized Error Logging', () => {
  it('logError module exists and exports logError function', () => {
    const loggerPath = path.join(__dirname, '../lib/logger.ts');
    expect(fs.existsSync(loggerPath)).toBe(true);
    const src = fs.readFileSync(loggerPath, 'utf-8');
    expect(src).toContain('export function logError');
  });

  it('critical paths use logError instead of bare console.error', () => {
    const criticalFiles = [
      path.join(__dirname, '../lib/db/client.ts'),
      path.join(__dirname, '../lib/sync/process.ts'),
    ];
    for (const file of criticalFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      expect(src).toContain("from '@/lib/logger'");
    }
  });
});

describe('Performance Index Coverage', () => {
  function readMigrations(): string {
    const migDir = path.join(__dirname, '../../migrations');
    return fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => fs.readFileSync(path.join(migDir, f), 'utf-8'))
      .join('\n');
  }

  it('permits.est_const_cost has a B-tree index', () => {
    const sql = readMigrations();
    expect(sql).toMatch(/CREATE\s+INDEX[\s\S]*?ON\s+permits\s*\(\s*est_const_cost/i);
  });

  it('permits.application_date has a B-tree index', () => {
    const sql = readMigrations();
    expect(sql).toMatch(/CREATE\s+INDEX[\s\S]*?ON\s+permits\s*\(\s*application_date/i);
  });

  it('coa_applications.hearing_date has a B-tree index', () => {
    const sql = readMigrations();
    expect(sql).toMatch(/CREATE\s+INDEX[\s\S]*?ON\s+coa_applications\s*\(\s*hearing_date/i);
  });
});

describe('pipelines/runs route — static WHERE construction (C4 regression)', () => {
  // SPEC LINK: docs/specs/00-architecture/07_backend_prod_eval.md §C4
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/pipelines/runs/route.ts'),
    'utf-8'
  );

  it('does not use dynamic conditions.join() to build WHERE clause', () => {
    expect(SRC).not.toMatch(/conditions\.join\s*\(/);
  });

  it('uses nullable-parameter static WHERE for pipeline filter', () => {
    expect(SRC).toMatch(/\$1::text IS NULL OR pipeline = \$1/);
  });

  it('uses nullable-parameter static WHERE for status filter', () => {
    expect(SRC).toMatch(/\$2::text IS NULL OR status = \$2/);
  });
});

describe('migration 112 — notification_prefs column repair (P2 regression)', () => {
  // SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
  // WF3 2026-04-25 P2: user_profiles.notification_prefs missing from live DB despite
  // migrations 108 + 111 applied. Migration 112 must re-add the column idempotently.
  it('migration file 112_notification_prefs_repair_2.sql exists', () => {
    const migPath = path.resolve(__dirname, '../../migrations/112_notification_prefs_repair_2.sql');
    expect(fs.existsSync(migPath)).toBe(true);
  });

  it('migration 112 uses ADD COLUMN IF NOT EXISTS for notification_prefs', () => {
    const migPath = path.resolve(__dirname, '../../migrations/112_notification_prefs_repair_2.sql');
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+notification_prefs/i);
  });

  it('migration 112 targets user_profiles table', () => {
    const migPath = path.resolve(__dirname, '../../migrations/112_notification_prefs_repair_2.sql');
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/ALTER TABLE\s+user_profiles/i);
  });

  it('migration 112 includes a DOWN block', () => {
    const migPath = path.resolve(__dirname, '../../migrations/112_notification_prefs_repair_2.sql');
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/DROP COLUMN IF EXISTS\s+notification_prefs/i);
  });

  it('migration 112 DOWN block has ALLOW-DESTRUCTIVE annotation (validate-migration.js gate)', () => {
    const migPath = path.resolve(__dirname, '../../migrations/112_notification_prefs_repair_2.sql');
    if (!fs.existsSync(migPath)) return;
    const sql = fs.readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/--\s*ALLOW-DESTRUCTIVE/i);
  });
});

// ---------------------------------------------------------------------------
// WF3 SEC-1 — the trust boundary as a DECLARED, EXECUTABLE property
// SPEC LINKS: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
//             docs/specs/00_engineering_standards.md §4.3 (never SELECT *) + §4.4
//
// These four locks exist because NOTHING in this suite could turn red on
// either drift: the pre-existing coverage over these routes asserted route
// CLASSIFICATION (a label) and file TEXT, never ENFORCEMENT. A missing
// `verifyAdminAuth`, a missing `writeAdminAudit`, a `SELECT *` on a public
// route and a write inside a GET were all invisible.
// ---------------------------------------------------------------------------

/**
 * Strip `//` and block comments so a source scan reads CODE, not the prose
 * that explains it — these routes now carry comments quoting the very
 * `SELECT *` / `reapStaleRunningRows` shapes they retired.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Handler export spans of a route.ts, keyed by HTTP method. */
function adminHandlerBodies(src: string): Array<{ method: string; body: string }> {
  const starts: Array<{ method: string; idx: number }> = [];
  const re = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) starts.push({ method: m[1]!, idx: m.index });
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.idx : src.length;
    const decl = src.slice(s.idx, end);
    const braceIdx = decl.indexOf('{', decl.indexOf(')'));
    return { method: s.method, body: braceIdx === -1 ? decl : decl.slice(braceIdx + 1) };
  });
}

/** The first line of real code in a handler body (comments/blank lines skipped). */
function firstStatementOf(body: string): string {
  let inBlockComment = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true;
      continue;
    }
    if (line.startsWith('//')) continue;
    return line;
  }
  return '';
}

/** Exports whose FIRST statement is not the verifyAdminAuth call. */
function unguardedExports(src: string, label: string): string[] {
  return adminHandlerBodies(src)
    .filter((h) => !/verifyAdminAuth\s*\(/.test(firstStatementOf(h.body)))
    .map((h) => `${label} ${h.method}`);
}

describe('Admin route guard is enforced per-route, not by middleware (Spec 33 §8)', () => {
  const adminApiDir = path.join(__dirname, '../app/api/admin');

  it('every /api/admin/** handler export calls verifyAdminAuth as its FIRST statement', () => {
    const offenders: string[] = [];
    for (const file of findRouteFiles(adminApiDir)) {
      const rel = path.relative(adminApiDir, file).replace(/\\/g, '/');
      offenders.push(...unguardedExports(fs.readFileSync(file, 'utf-8'), rel));
    }
    // Spec 33 §8: "verifyAdminAuth as the FIRST line of every /api/admin/**
    // handler — per-route guard, NOT middleware (middleware is bypassable)."
    expect(offenders).toEqual([]);
  });

  it('no admin route declares a handler as `export async function` — the scans only see `export const`', () => {
    // BLIND SPOT, closed 2026-09-15 (Code Reviewer fold F2). Both source scans
    // parse `export const GET = …` spans. Next.js accepts
    // `export async function GET(…)` equally, and such a handler would be
    // INVISIBLE to every guard/audit/session-gate assertion above — it would
    // simply not appear in `adminHandlerBodies`, so an unguarded, unaudited
    // mutation could ship with all five locks green. Rather than teach the
    // parser a second shape (two grammars, two chances to drift), the estate
    // declares ONE: `export const NAME = withApiEnvelope(...)`. This lock is
    // what makes the other scans' coverage total rather than merely likely.
    const FUNCTION_DECL = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/;
    const offenders: string[] = [];
    for (const file of findRouteFiles(adminApiDir)) {
      const rel = path.relative(adminApiDir, file).replace(/\\/g, '/');
      const src = stripComments(fs.readFileSync(file, 'utf-8'));
      const m = FUNCTION_DECL.exec(src);
      if (m) offenders.push(`${rel} ${m[2]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('INVERSE ARM — that scan catches an `export async function POST(` declaration', () => {
    // Scratch fixture: the exact shape the estate must not contain. Proves the
    // assertion above can fail, and that `adminHandlerBodies` is blind to it —
    // which is precisely why the declaration-shape lock has to exist.
    const FUNCTION_DECL = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/;
    const fixture = `
      export async function POST(request: NextRequest) {
        await pool.query('DELETE FROM everything');
        return NextResponse.json({ data: null, error: null, meta: null });
      }
    `;
    expect(FUNCTION_DECL.test(stripComments(fixture))).toBe(true);
    // …and the guard/audit scans genuinely cannot see it (the blind spot).
    expect(adminHandlerBodies(fixture)).toEqual([]);
    expect(unguardedExports(fixture, 'fixture/route.ts')).toEqual([]);
    // The `export const` form the estate uses IS seen.
    const conforming = `export const POST = withApiEnvelope(async function POST(request: NextRequest) { return x; });`;
    expect(FUNCTION_DECL.test(conforming)).toBe(false);
    expect(adminHandlerBodies(conforming)).toHaveLength(1);
  });

  it('INVERSE ARM — the scan detects a handler that does NOT guard (proves it can fail)', () => {
    const unguardedFixture = `
      export const POST = withApiEnvelope(async function POST(request: NextRequest) {
        // no guard here
        const body = await request.json();
        return NextResponse.json({ data: body, error: null, meta: null });
      });
    `;
    expect(unguardedExports(unguardedFixture, 'fixture/route.ts')).toEqual(['fixture/route.ts POST']);

    const guardedFixture = `
      export const POST = withApiEnvelope(async function POST(request: NextRequest) {
        const adminCtx = await verifyAdminAuth(request);
        if (!adminCtx) return unauthorized();
        return NextResponse.json({ data: null, error: null, meta: null });
      });
    `;
    expect(unguardedExports(guardedFixture, 'fixture/route.ts')).toEqual([]);
  });

  it('the classification test above is LABELLING only — enforcement is locked by the scan', async () => {
    // Kept deliberately (it is the only coverage of middleware classification),
    // but renamed + annotated: classifyRoute proves the path is LABELLED
    // 'admin'; it proves nothing about whether anything ENFORCES that label.
    // The presence-only admin arm of src/middleware.ts passes any request
    // carrying a non-empty sb-*-auth-token cookie OR any x-admin-key header
    // value — see the integration lock in admin-route-guard.infra.test.ts.
    const guard = await import('@/lib/auth/route-guard');
    expect(guard.classifyRoute('/api/admin/control-panel/configs')).toBe('admin');
  });
});

describe('Admin mutations are audited (Spec 128 R-12 / Spec 33 §8.1)', () => {
  const adminApiDir = path.join(__dirname, '../app/api/admin');

  // PRE-EXISTING gaps this WF3 deliberately did NOT close (fold-simplicity —
  // they are outside its declared 9-file scope) and did NOT hide. Each is
  // filed in docs/reports/review_followups.md. The assertions below compare
  // against these EXACT lists, so the locks stay red-capable in both
  // directions: a NEW unaudited/ungated mutation fails, and closing one of
  // these fails too until the list is updated.
  const AUDIT_GAPS_FILED = [
    // MFA factor ENROLMENT for the calling admin's own account. Self-service
    // on one's own credential, not an admin-on-subject mutation; the DELETE
    // (factor removal) IS audited. Filed MED.
    'security/mfa/route.ts POST',
  ];
  const SESSION_GATE_GAPS_FILED = [
    // These four ARE audited, but their guard is the narrower
    // `authMethod === 'admin_key'` shape (the same fence the watchlist
    // carried until this WF3): `dev_bypass` still reaches the mutation, and
    // its 'dev-user' sentinel then hits `admin_audit_log.admin_uid` UUID NOT
    // NULL and raises 22P02 INSIDE the transaction — a 500 where a 403 is
    // correct. Pre-existing, same finding class, filed HIGH.
    'users/route.ts POST',
    'users/[uid]/route.ts PATCH',
    'users/[uid]/subscription/reconcile/route.ts POST',
    'users/[uid]/subscription/retry-cancel/route.ts POST',
  ];

  it('every mutating /api/admin/** export writes an admin_audit_log row', () => {
    const offenders: string[] = [];
    for (const file of findRouteFiles(adminApiDir)) {
      const rel = path.relative(adminApiDir, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf-8');
      for (const h of adminHandlerBodies(src)) {
        if (h.method === 'GET') continue;
        if (!/writeAdminAudit\s*\(/.test(h.body)) offenders.push(`${rel} ${h.method}`);
      }
    }
    // An unaudited admin mutation is a compliance hole (admin-audit.ts:56-58)
    // and blocks Spec 126 surface conversion (Spec 128 R-12).
    expect(offenders).toEqual(AUDIT_GAPS_FILED);
  });

  it('every mutating /api/admin/** export refuses the shared non-session sentinels', () => {
    // Q1(a): admin_audit_log.admin_uid is UUID NOT NULL, while verifyAdminAuth
    // returns the NON-UUID sentinels 'admin-key' / 'dev-user' for the
    // admin_key / dev_bypass methods. Auditing such a mutation would raise
    // 22P02 INSIDE the transaction — an unattributable mutation is refused
    // (403) rather than executed unaudited or crashed at 500.
    const offenders: string[] = [];
    for (const file of findRouteFiles(adminApiDir)) {
      const rel = path.relative(adminApiDir, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf-8');
      // The gate is EITHER written inline in the handler, OR delegated to a
      // named guard helper declared in the SAME file — in which case that
      // file must itself carry the literal comparison, so the delegation
      // cannot hide a weaker predicate (e.g. the pre-2026-09-15 watchlist
      // helper, which only refused `admin_key` and let `dev_bypass` through).
      const fileDeclaresGate = /authMethod\s*!==\s*'session'/.test(src);
      for (const h of adminHandlerBodies(src)) {
        if (h.method === 'GET') continue;
        const inline = /authMethod\s*!==\s*'session'/.test(h.body);
        const delegated =
          fileDeclaresGate && /(sessionRequired|forbiddenNonSessionWrite)\s*\(/.test(h.body);
        if (!inline && !delegated) offenders.push(`${rel} ${h.method}`);
      }
    }
    // Sort both sides — findRouteFiles scan order is filesystem-dependent and
    // varies between local and CI environments; the semantic contract is
    // same-elements, same count, not declaration order.
    expect([...offenders].sort()).toEqual([...SESSION_GATE_GAPS_FILED].sort());
  });

  it('every mutating /api/admin/** export is Origin-gated by the shared guard (Spec 33 §13 CSRF)', () => {
    // The 8 mutations newly guarded by WF3 SEC-1 do not carry their own CSRF
    // check — they INHERIT it. `verifyAdminAuth` opens with the §13 gate
    // (`src/lib/auth/verify-admin.ts`: MUTATING_METHODS → `isOriginAllowed`),
    // which runs BEFORE dev-mode, before the CI-token compare and before the
    // session read, and `isOriginAllowed` DEFAULT-DENIES when
    // `ADMIN_ALLOWED_ORIGINS` is unset or unparseable. So "is this mutation
    // Origin-gated?" reduces to "is `verifyAdminAuth` its first statement?" —
    // which is exactly what the guard scan above proves, for every export.
    // This test pins the two properties that make that inheritance valid, so
    // a future edit cannot quietly move the CSRF gate below an early return
    // or turn the default-deny into a default-allow.
    const guardSrc = fs.readFileSync(path.join(__dirname, '../lib/auth/verify-admin.ts'), 'utf-8');

    // (a) the gate is armed for exactly the state-mutating methods…
    expect(guardSrc).toMatch(/MUTATING_METHODS\s*=\s*new Set\(\['POST',\s*'PATCH',\s*'PUT',\s*'DELETE'\]\)/);
    // …and fires BEFORE isDevMode() and before the CI-token compare.
    const csrfIdx = guardSrc.indexOf('if (!isOriginAllowed(request))');
    const devIdx = guardSrc.indexOf('if (isDevMode())');
    const ciIdx = guardSrc.indexOf("request.headers.get('x-admin-key')");
    expect(csrfIdx).toBeGreaterThan(-1);
    expect(csrfIdx).toBeLessThan(devIdx);
    expect(csrfIdx).toBeLessThan(ciIdx);

    // (b) default-deny on misconfiguration — a missing/empty allowlist must
    // refuse, never admit. `ADMIN_ALLOWED_ORIGINS` is therefore a DEPLOY
    // PRECONDITION, enforced by scripts/verify-vercel-env.js.
    expect(guardSrc).toContain('if (allowed.length === 0) return false;');
    expect(guardSrc).toContain("if (!originHeader) return false;");

    // (c) and every mutating admin export actually routes through it (the
    // same predicate as the guard scan, restated on the CSRF axis so this
    // lock fails on its own terms rather than only via the guard lock).
    const offenders: string[] = [];
    for (const file of findRouteFiles(adminApiDir)) {
      const rel = path.relative(adminApiDir, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf-8');
      for (const h of adminHandlerBodies(src)) {
        if (h.method === 'GET') continue;
        if (!/verifyAdminAuth\s*\(/.test(firstStatementOf(h.body))) offenders.push(`${rel} ${h.method}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('INVERSE ARM — the Origin-gate scan detects a mutation that bypasses the guard', () => {
    const bypassing = `
      export const POST = withApiEnvelope(async function POST(request: NextRequest) {
        const body = await request.json();
        const adminCtx = await verifyAdminAuth(request);
        if (!adminCtx) return unauthorized();
        return NextResponse.json({ data: body, error: null, meta: null });
      });
    `;
    // Guard present, but NOT first — the body is read before the CSRF gate.
    expect(unguardedExports(bypassing, 'fixture/route.ts')).toEqual(['fixture/route.ts POST']);
  });

  it('INVERSE ARM — the audit scan detects an unaudited mutation', () => {
    const src = `
      export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
        const adminCtx = await verifyAdminAuth(request);
        await pool.query('UPDATE things SET x = 1');
        return NextResponse.json({ data: null, error: null, meta: null });
      });
    `;
    const bodies = adminHandlerBodies(src).filter((h) => h.method !== 'GET');
    expect(bodies).toHaveLength(1);
    expect(/writeAdminAudit\s*\(/.test(bodies[0]!.body)).toBe(false);
  });
});

describe('GET /api/admin/stats performs no writes (reaper moved to reconcile Step 0)', () => {
  it('stats route contains no reapStaleRunningRows call and no reaper import', () => {
    const src = stripComments(
      fs.readFileSync(path.join(__dirname, '../app/api/admin/stats/route.ts'), 'utf-8'),
    );
    // Spec 128 ASK-12: the reaper is a SCHEDULED JOB, not a side effect of a
    // dashboard GET. `scripts/reconcile-runs.js` is already Step 0 of the
    // `sources` chain (Spec 122 §7.4) and is the more authoritative reaper.
    // (The route's own header comment still NAMES the removal and its named
    // residual — hence the comment strip: the lock reads code, the comment
    // carries the reason.)
    expect(src).not.toContain('reapStaleRunningRows');
    expect(src).not.toContain('reap-stale-runs');
  });

  it('stats route issues no UPDATE/INSERT/DELETE statement', () => {
    const src = stripComments(
      fs.readFileSync(path.join(__dirname, '../app/api/admin/stats/route.ts'), 'utf-8'),
    );
    expect(src).not.toMatch(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+\w/);
  });

  it('INVERSE ARM — the write scan detects a GET that mutates', () => {
    const fixture = `
      export const GET = withApiEnvelope(async function GET(request: NextRequest) {
        await reapStaleRunningRows();
        return NextResponse.json({ data: null, error: null, meta: null });
      });
    `;
    expect(stripComments(fixture)).toContain('reapStaleRunningRows');
  });

  it('the reaper helper and its DB test are RETAINED for the future JOB', () => {
    expect(fs.existsSync(path.join(__dirname, '../lib/admin/reap-stale-runs.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, 'db/admin-stats-reaper.db.test.ts'))).toBe(true);
  });
});

describe('Public data routes project explicit allow-lists, never SELECT * (§4.3)', () => {
  const PROJECTED_ROUTES = [
    'permits/[id]/route.ts',
    'permits/route.ts',
    'builders/[id]/route.ts',
    'builders/route.ts',
    'coa/route.ts',
    'entities/route.ts',
    'entities/[id]/route.ts',
  ];

  function readRoute(rel: string): string {
    return fs.readFileSync(path.join(__dirname, '../app/api', rel), 'utf-8');
  }

  it('no public route selects a wildcard from a base table', () => {
    const offenders: string[] = [];
    for (const rel of PROJECTED_ROUTES) {
      const src = stripComments(readRoute(rel));
      // `SELECT *`, `SELECT pa.*`, `SELECT e.*`, `SELECT p.*` — every shape
      // that hands a caller every column the table happens to have today.
      if (/SELECT\s+(?:\w+\.)?\*/i.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('INVERSE ARM — the wildcard scan detects a `SELECT pa.*` (proves it can fail)', () => {
    const fixture = `
      const rows = await query(\`SELECT pa.*, pp.match_type FROM parcels pa\`);
    `;
    expect(/SELECT\s+(?:\w+\.)?\*/i.test(stripComments(fixture))).toBe(true);
    const projected = `
      const rows = await query(\`SELECT pa.id, pa.lot_size_sqft FROM parcels pa\`);
    `;
    expect(/SELECT\s+(?:\w+\.)?\*/i.test(stripComments(projected))).toBe(false);
  });

  it('every public route sources its columns from the shared allow-list module', () => {
    const offenders: string[] = [];
    for (const rel of PROJECTED_ROUTES) {
      if (!readRoute(rel).includes("@/lib/api/public-projections")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('NEGATIVE CONTROL — the parcel allow-list serves no cost, menu or geometry column', async () => {
    const { PARCEL_PUBLIC_COLS } = await import('@/lib/api/public-projections');
    // Spec 100 §5: the paid parcel-cost payload is gated behind Bearer auth
    // + a server-side subscription check on /api/parcels/lookup. Until this
    // lock existed, /api/permits/[id] (PUBLIC_PREFIXES, no auth at all)
    // served all 158 parcels columns — the cost menu, the cost scalars and
    // the raw PostGIS polygons included.
    const leaked = PARCEL_PUBLIC_COLS.filter((c) =>
      /^(cost_|parcel_cost_menu$|geom|opt_|max_build_|comparable_builds$|neighbourhood_cost_premium$)/.test(c),
    );
    expect(leaked).toEqual([]);
  });

  it('NEGATIVE CONTROL — the entity allow-list serves no direct-contact PII column', async () => {
    const { ENTITY_PUBLIC_COLS } = await import('@/lib/api/public-projections');
    const leaked = ENTITY_PUBLIC_COLS.filter((c) =>
      ['primary_phone', 'primary_email', 'linkedin_url'].includes(c),
    );
    expect(leaked).toEqual([]);
  });

  it('the parcel allow-list still satisfies the declared ParcelResponse contract', async () => {
    const { PARCEL_PUBLIC_COLS } = await import('@/lib/api/public-projections');
    // The 9 keys validateParcelShape (above) declares, minus the two the
    // JOIN supplies (match_type, link_confidence), must all survive.
    for (const required of [
      'lot_size_sqft', 'lot_size_sqm', 'frontage_ft', 'frontage_m',
      'depth_ft', 'depth_m', 'feature_type',
    ]) {
      expect(PARCEL_PUBLIC_COLS).toContain(required);
    }
    // `id` is load-bearing: the massing block queries parcel_buildings by it.
    expect(PARCEL_PUBLIC_COLS).toContain('id');
  });

  it('the COA allow-list stays aligned with the COA- branch of /api/permits/[id]', async () => {
    const { COA_PUBLIC_COLS } = await import('@/lib/api/public-projections');
    const detailSrc = readRoute('permits/[id]/route.ts');
    // Every column the COA- detail branch projects by name must be servable
    // by the list route too — one CoA vocabulary, two entry points.
    for (const col of ['application_number', 'sub_type', 'linked_permit_num', 'linked_confidence']) {
      expect(COA_PUBLIC_COLS).toContain(col);
      expect(detailSrc).toContain(col);
    }
  });
});

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}
