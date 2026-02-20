import { describe, it, expect } from 'vitest';
import {
  parseStatedArea,
  sqmToSqft,
  mToFt,
  estimateLotDimensions,
  SQM_TO_SQFT,
  M_TO_FT,
} from '@/lib/parcels/geometry';
import {
  parseLinearName,
  normalizeAddressNumber,
  parseAddress,
} from '@/lib/parcels/address';
import { createMockParcel } from './factories';

// ---------------------------------------------------------------------------
// STATEDAREA parsing
// ---------------------------------------------------------------------------
describe('parseStatedArea', () => {
  it('parses a valid area string', () => {
    expect(parseStatedArea('17366.998291 sq.m')).toBeCloseTo(17366.998291);
  });

  it('parses area with no space before unit', () => {
    expect(parseStatedArea('500.00sq.m')).toBeCloseTo(500.0);
  });

  it('returns null for zero area', () => {
    expect(parseStatedArea('0 sq.m')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseStatedArea('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseStatedArea(null)).toBeNull();
  });

  it('returns null for invalid format (no unit)', () => {
    expect(parseStatedArea('12345')).toBeNull();
  });

  it('returns null for missing number', () => {
    expect(parseStatedArea('sq.m')).toBeNull();
  });

  it('returns null for negative value string', () => {
    expect(parseStatedArea('-100 sq.m')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------
describe('unit conversions', () => {
  it('converts sqm to sqft', () => {
    expect(sqmToSqft(1)).toBeCloseTo(SQM_TO_SQFT);
    expect(sqmToSqft(100)).toBeCloseTo(100 * SQM_TO_SQFT);
  });

  it('converts meters to feet', () => {
    expect(mToFt(1)).toBeCloseTo(M_TO_FT);
    expect(mToFt(10)).toBeCloseTo(10 * M_TO_FT);
  });
});

// ---------------------------------------------------------------------------
// Address normalization
// ---------------------------------------------------------------------------
describe('parseLinearName', () => {
  it('parses "Jane St" -> JANE / ST', () => {
    const result = parseLinearName('Jane St');
    expect(result.street_name).toBe('JANE');
    expect(result.street_type).toBe('ST');
  });

  it('parses "Queen Street West" -> QUEEN / ST (strips direction)', () => {
    const result = parseLinearName('Queen Street West');
    expect(result.street_name).toBe('QUEEN');
    expect(result.street_type).toBe('ST');
  });

  it('parses "Yonge Blvd" -> YONGE / BLVD', () => {
    const result = parseLinearName('Yonge Blvd');
    expect(result.street_name).toBe('YONGE');
    expect(result.street_type).toBe('BLVD');
  });

  it('parses "Spadina Ave" -> SPADINA / AVE', () => {
    const result = parseLinearName('Spadina Ave');
    expect(result.street_name).toBe('SPADINA');
    expect(result.street_type).toBe('AVE');
  });

  it('parses "Bayview Cres" -> BAYVIEW / CRES', () => {
    const result = parseLinearName('Bayview Cres');
    expect(result.street_name).toBe('BAYVIEW');
    expect(result.street_type).toBe('CRES');
  });

  it('handles empty string', () => {
    const result = parseLinearName('');
    expect(result.street_name).toBe('');
    expect(result.street_type).toBe('');
  });

  it('handles name with no recognized type', () => {
    const result = parseLinearName('The Queensway');
    expect(result.street_name).toBe('THE QUEENSWAY');
    expect(result.street_type).toBe('');
  });
});

describe('normalizeAddressNumber', () => {
  it('normalizes a regular number', () => {
    expect(normalizeAddressNumber('5000')).toBe('5000');
  });

  it('strips leading zeros', () => {
    expect(normalizeAddressNumber('0042')).toBe('42');
  });

  it('returns empty string for null', () => {
    expect(normalizeAddressNumber(null)).toBe('');
  });

  it('uppercases letter suffixes', () => {
    expect(normalizeAddressNumber('123a')).toBe('123A');
  });
});

describe('parseAddress', () => {
  it('normalizes a full address', () => {
    const result = parseAddress('123', 'Queen', 'St');
    expect(result.num).toBe('123');
    expect(result.street_name).toBe('QUEEN');
    expect(result.street_type).toBe('ST');
  });

  it('handles null components', () => {
    const result = parseAddress(null, null, null);
    expect(result.num).toBe('');
    expect(result.street_name).toBe('');
    expect(result.street_type).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Lot dimension estimation
// ---------------------------------------------------------------------------
describe('estimateLotDimensions', () => {
  it('estimates dimensions for a rectangular polygon', () => {
    // ~15m wide x ~33m deep rectangle in Toronto area
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [-79.5000, 43.7500],
        [-79.4998, 43.7500],
        [-79.4998, 43.7503],
        [-79.5000, 43.7503],
        [-79.5000, 43.7500],
      ]],
    };

    const result = estimateLotDimensions(geometry);
    expect(result).not.toBeNull();
    // The exact values depend on Haversine projection, but should be reasonable
    expect(result!.frontage_m).toBeGreaterThan(5);
    expect(result!.frontage_m).toBeLessThan(30);
    expect(result!.depth_m).toBeGreaterThan(20);
    expect(result!.depth_m).toBeLessThan(50);
    // Depth should be larger than frontage for a typical lot
    expect(result!.depth_m).toBeGreaterThan(result!.frontage_m);
  });

  it('estimates dimensions for a square polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [-79.5000, 43.7500],
        [-79.4998, 43.7500],
        [-79.4998, 43.7502],
        [-79.5000, 43.7502],
        [-79.5000, 43.7500],
      ]],
    };

    const result = estimateLotDimensions(geometry);
    expect(result).not.toBeNull();
    // For a roughly square polygon, frontage and depth should be similar
    const ratio = result!.depth_m / result!.frontage_m;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
  });

  it('returns null for null geometry', () => {
    expect(estimateLotDimensions(null)).toBeNull();
  });

  it('returns null for undefined geometry', () => {
    expect(estimateLotDimensions(undefined)).toBeNull();
  });

  it('returns null for geometry with no coordinates', () => {
    expect(estimateLotDimensions({ type: 'Polygon' })).toBeNull();
  });

  it('returns null for geometry with too few points', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [-79.5, 43.75],
        [-79.499, 43.75],
        [-79.5, 43.75],
      ]],
    };
    expect(estimateLotDimensions(geometry)).toBeNull();
  });

  it('handles MultiPolygon (uses first polygon)', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[
          [-79.5000, 43.7500],
          [-79.4998, 43.7500],
          [-79.4998, 43.7503],
          [-79.5000, 43.7503],
          [-79.5000, 43.7500],
        ]],
      ],
    };

    const result = estimateLotDimensions(geometry);
    expect(result).not.toBeNull();
    expect(result!.frontage_m).toBeGreaterThan(0);
    expect(result!.depth_m).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
describe('createMockParcel', () => {
  it('creates a valid parcel with defaults', () => {
    const parcel = createMockParcel();
    expect(parcel.parcel_id).toBe('5090819');
    expect(parcel.feature_type).toBe('COMMON');
    expect(parcel.lot_size_sqm).toBe(500.0);
  });

  it('accepts overrides', () => {
    const parcel = createMockParcel({
      parcel_id: '9999999',
      feature_type: 'CONDO',
    });
    expect(parcel.parcel_id).toBe('9999999');
    expect(parcel.feature_type).toBe('CONDO');
  });
});
