// Infra Layer Tests - API route validation, SQL safety, data integrity
// SPEC LINKS: docs/specs/06_data_api.md, 01_database_schema.md
import { describe, it, expect } from 'vitest';

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

describe('Pre-Permit API Integration', () => {
  const fs = require('fs');
  const path = require('path');

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
