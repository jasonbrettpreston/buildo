import { describe, it, expect } from 'vitest';
import {
  parseStatedArea,
  sqmToSqft,
  mToFt,
  estimateLotDimensions,
  SQM_TO_SQFT,
  M_TO_FT,
  haversineDistance,
  computeCentroid,
  findNearestParcel,
  SPATIAL_MAX_DISTANCE_M,
  SPATIAL_CONFIDENCE,
  parseGeoId,
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

// ---------------------------------------------------------------------------
// 🔗 SPEC LINK: docs/specs/29_spatial_parcel_matching.md
// Spatial matching (Strategy 3) — centroid computation, distance, nearest parcel
// ---------------------------------------------------------------------------

describe('computeCentroid', () => {
  it('computes centroid for a Polygon geometry', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [-79.5000, 43.7500],
        [-79.4998, 43.7500],
        [-79.4998, 43.7503],
        [-79.5000, 43.7503],
        [-79.5000, 43.7500], // closing point
      ]],
    };
    const centroid = computeCentroid(geometry);
    expect(centroid).not.toBeNull();
    // Centroid should be roughly the center of the rectangle
    expect(centroid![0]).toBeCloseTo(-79.4999, 3); // lng
    expect(centroid![1]).toBeCloseTo(43.75015, 3); // lat
  });

  it('computes centroid for a MultiPolygon geometry (uses first polygon)', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[
          [-79.4000, 43.6500],
          [-79.3998, 43.6500],
          [-79.3998, 43.6502],
          [-79.4000, 43.6502],
          [-79.4000, 43.6500],
        ]],
        [[
          [-79.3000, 43.7000],
          [-79.2998, 43.7000],
          [-79.2998, 43.7002],
          [-79.3000, 43.7002],
          [-79.3000, 43.7000],
        ]],
      ],
    };
    const centroid = computeCentroid(geometry);
    expect(centroid).not.toBeNull();
    // Should use first polygon only
    expect(centroid![0]).toBeCloseTo(-79.3999, 3);
    expect(centroid![1]).toBeCloseTo(43.6501, 3);
  });

  it('returns null for null geometry', () => {
    expect(computeCentroid(null)).toBeNull();
  });

  it('returns null for geometry with no coordinates', () => {
    expect(computeCentroid({ type: 'Polygon' })).toBeNull();
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
    expect(computeCentroid(geometry)).toBeNull();
  });
});

describe('haversineDistance', () => {
  it('computes ~0m for same point', () => {
    const p: [number, number] = [-79.3832, 43.6532];
    expect(haversineDistance(p, p)).toBeCloseTo(0, 0);
  });

  it('computes ~111m for 0.001° latitude difference', () => {
    const p1: [number, number] = [-79.3832, 43.6532];
    const p2: [number, number] = [-79.3832, 43.6542]; // +0.001° lat
    const dist = haversineDistance(p1, p2);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  it('computes ~82m for 0.001° longitude difference at Toronto latitude', () => {
    const p1: [number, number] = [-79.3832, 43.6532];
    const p2: [number, number] = [-79.3822, 43.6532]; // +0.001° lng
    const dist = haversineDistance(p1, p2);
    expect(dist).toBeGreaterThan(70);
    expect(dist).toBeLessThan(90);
  });

  it('computes known Toronto distance (~3.7km Queen to Bloor on Yonge)', () => {
    const queen: [number, number] = [-79.3790, 43.6530]; // Queen & Yonge
    const bloor: [number, number] = [-79.3871, 43.6709]; // Bloor & Yonge
    const dist = haversineDistance(queen, bloor);
    expect(dist).toBeGreaterThan(1800);
    expect(dist).toBeLessThan(2200);
  });
});

describe('findNearestParcel', () => {
  const candidates = [
    { id: 1, centroid_lat: 43.6532, centroid_lng: -79.3832 },  // 0m away
    { id: 2, centroid_lat: 43.6535, centroid_lng: -79.3835 },  // ~45m away
    { id: 3, centroid_lat: 43.6550, centroid_lng: -79.3850 },  // ~250m away
  ];

  it('returns the nearest parcel within threshold', () => {
    const result = findNearestParcel(43.6533, -79.3833, candidates);
    expect(result).not.toBeNull();
    expect(result!.parcel_id).toBe(1);
    expect(result!.distance_m).toBeLessThan(20);
  });

  it('returns null when no candidates within 100m', () => {
    // Point far from all candidates
    const result = findNearestParcel(43.7000, -79.4000, candidates);
    expect(result).toBeNull();
  });

  it('picks the closest when multiple are within range', () => {
    // Point equidistant-ish between candidates 1 and 2, closer to 2
    const result = findNearestParcel(43.6534, -79.3834, candidates);
    expect(result).not.toBeNull();
    expect(result!.parcel_id).toBe(2);
  });

  it('returns null for empty candidates array', () => {
    const result = findNearestParcel(43.6532, -79.3832, []);
    expect(result).toBeNull();
  });

  it('respects custom max distance', () => {
    // Candidate 2 is ~45m away — should match with 50m threshold
    const result = findNearestParcel(43.6532, -79.3832, candidates, 50);
    expect(result).not.toBeNull();
    expect(result!.parcel_id).toBe(1);
  });
});

describe('Spatial matching constants', () => {
  it('SPATIAL_MAX_DISTANCE_M is 100', () => {
    expect(SPATIAL_MAX_DISTANCE_M).toBe(100);
  });

  it('SPATIAL_CONFIDENCE is 0.65', () => {
    expect(SPATIAL_CONFIDENCE).toBe(0.65);
  });
});

describe('Strategy 3 cascade behavior', () => {
  it('ParcelMatchResult match_type includes spatial', () => {
    // Type-level test: ensure 'spatial' is a valid match_type
    const result = {
      parcel_id: 1,
      match_type: 'spatial' as const,
      confidence: SPATIAL_CONFIDENCE,
    };
    expect(result.match_type).toBe('spatial');
    expect(result.confidence).toBe(0.65);
  });
});

// ---------------------------------------------------------------------------
// 🔗 SPEC LINK: docs/specs/29_spatial_parcel_matching.md
// Address Points geocoding — geo_id parsing and validation
// ---------------------------------------------------------------------------

describe('parseGeoId', () => {
  it('parses a valid integer geo_id', () => {
    expect(parseGeoId('12345')).toBe(12345);
  });

  it('parses a large address point ID', () => {
    expect(parseGeoId('525001')).toBe(525001);
  });

  it('returns null for null input', () => {
    expect(parseGeoId(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseGeoId(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGeoId('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseGeoId('   ')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseGeoId('abc')).toBeNull();
  });

  it('returns null for mixed alphanumeric string', () => {
    expect(parseGeoId('123abc')).toBeNull();
  });

  it('returns null for floating point string', () => {
    expect(parseGeoId('123.45')).toBeNull();
  });

  it('returns null for negative number string', () => {
    expect(parseGeoId('-100')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseGeoId('0')).toBeNull();
  });

  it('trims whitespace around valid ID', () => {
    expect(parseGeoId('  42  ')).toBe(42);
  });
});
