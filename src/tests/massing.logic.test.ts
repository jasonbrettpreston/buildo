// Logic Layer Tests — Building Massing geometry and classification
// SPEC LINK: docs/specs/31_building_massing.md
import { describe, it, expect } from 'vitest';
import {
  estimateStories,
  classifyStructure,
  pointInPolygon,
  computeFootprintArea,
  formatHeight,
  formatArea,
  formatStories,
  formatCoverage,
  computeBuildingCoverage,
  STORY_HEIGHT_M,
  SHED_THRESHOLD_SQM,
  GARAGE_MAX_SQM,
} from '@/lib/massing/geometry';

describe('estimateStories', () => {
  it('returns 1 for 3m height (single story)', () => {
    expect(estimateStories(3.0)).toBe(1);
  });

  it('returns 2 for 6m height', () => {
    expect(estimateStories(6.0)).toBe(2);
  });

  it('returns 3 for 9.5m height (rounds to nearest)', () => {
    expect(estimateStories(9.5)).toBe(3);
  });

  it('returns 1 for 2.5m height (minimum 1 story)', () => {
    expect(estimateStories(2.5)).toBe(1);
  });

  it('returns null for null height', () => {
    expect(estimateStories(null)).toBeNull();
  });

  it('returns null for 0 height', () => {
    expect(estimateStories(0)).toBeNull();
  });

  it('returns null for negative height', () => {
    expect(estimateStories(-5)).toBeNull();
  });

  it('returns null for undefined height', () => {
    expect(estimateStories(undefined)).toBeNull();
  });

  it('uses STORY_HEIGHT_M constant of 3.0', () => {
    expect(STORY_HEIGHT_M).toBe(3.0);
  });
});

describe('classifyStructure', () => {
  it('classifies largest area as primary', () => {
    expect(classifyStructure(150, [150, 30, 10])).toBe('primary');
  });

  it('classifies 20-60 sqm accessory as garage', () => {
    expect(classifyStructure(35, [150, 35])).toBe('garage');
  });

  it('classifies < 20 sqm accessory as shed', () => {
    expect(classifyStructure(15, [150, 15])).toBe('shed');
  });

  it('classifies solo building as primary regardless of area', () => {
    expect(classifyStructure(10, [10])).toBe('primary');
  });

  it('classifies > 60 sqm non-largest as other', () => {
    expect(classifyStructure(80, [150, 80])).toBe('other');
  });

  it('classifies both as primary when two buildings have equal area', () => {
    expect(classifyStructure(100, [100, 100])).toBe('primary');
  });

  it('uses threshold constants correctly', () => {
    expect(SHED_THRESHOLD_SQM).toBe(20);
    expect(GARAGE_MAX_SQM).toBe(60);
  });
});

describe('pointInPolygon', () => {
  // A simple square polygon: 0,0 -> 1,0 -> 1,1 -> 0,1 -> 0,0
  const square: [number, number][] = [
    [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
  ];

  it('returns true for point inside polygon', () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
  });

  it('returns false for point outside polygon', () => {
    expect(pointInPolygon([2, 2], square)).toBe(false);
  });

  it('returns false for point far from polygon', () => {
    expect(pointInPolygon([100, 100], square)).toBe(false);
  });

  it('returns false for null point', () => {
    expect(pointInPolygon(null, square)).toBe(false);
  });

  it('returns false for null polygon', () => {
    expect(pointInPolygon([0.5, 0.5], null)).toBe(false);
  });

  it('returns false for polygon with fewer than 4 points', () => {
    expect(pointInPolygon([0.5, 0.5], [[0, 0], [1, 0], [1, 1]])).toBe(false);
  });
});

describe('computeFootprintArea', () => {
  it('computes area for a known rectangle', () => {
    // ~10m x ~10m rectangle at Toronto lat
    const lng = -79.5;
    const lat = 43.75;
    const dLng = 0.00012; // ~10m at Toronto latitude
    const dLat = 0.00009; // ~10m
    const ring: [number, number][] = [
      [lng, lat],
      [lng + dLng, lat],
      [lng + dLng, lat + dLat],
      [lng, lat + dLat],
      [lng, lat],
    ];
    const area = computeFootprintArea(ring);
    expect(area).not.toBeNull();
    // Should be roughly 100 sqm (10m x 10m) — allow ±20% for projection
    expect(area!).toBeGreaterThan(70);
    expect(area!).toBeLessThan(130);
  });

  it('returns null for invalid ring (< 4 points)', () => {
    expect(computeFootprintArea([[0, 0], [1, 0], [1, 1]])).toBeNull();
  });

  it('returns null for null ring', () => {
    expect(computeFootprintArea(null as unknown as [number, number][])).toBeNull();
  });

  it('returns null for empty ring', () => {
    expect(computeFootprintArea([])).toBeNull();
  });

  it('returns 0 for degenerate polygon (collinear points)', () => {
    const line: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 0]];
    expect(computeFootprintArea(line)).toBe(0);
  });
});

describe('formatHeight', () => {
  it('formats height with metric and imperial', () => {
    expect(formatHeight(9.5)).toBe('9.5 m (31.2 ft)');
  });

  it('formats zero-point height', () => {
    expect(formatHeight(3.0)).toBe('3.0 m (9.8 ft)');
  });

  it('returns N/A for null', () => {
    expect(formatHeight(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatHeight(undefined)).toBe('N/A');
  });
});

describe('formatArea', () => {
  it('formats area with comma grouping', () => {
    expect(formatArea(1500)).toBe('1,500 sq ft');
  });

  it('formats small area', () => {
    expect(formatArea(250)).toBe('250 sq ft');
  });

  it('returns N/A for null', () => {
    expect(formatArea(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatArea(undefined)).toBe('N/A');
  });
});

describe('formatStories', () => {
  it('formats single storey', () => {
    expect(formatStories(1)).toBe('1 storey');
  });

  it('formats multiple storeys', () => {
    expect(formatStories(3)).toBe('3 storeys');
  });

  it('returns N/A for null', () => {
    expect(formatStories(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatStories(undefined)).toBe('N/A');
  });
});

describe('formatCoverage', () => {
  it('formats percentage', () => {
    expect(formatCoverage(34.2)).toBe('34.2%');
  });

  it('returns N/A for null', () => {
    expect(formatCoverage(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatCoverage(undefined)).toBe('N/A');
  });
});

describe('computeBuildingCoverage', () => {
  it('computes 50% coverage correctly', () => {
    expect(computeBuildingCoverage(500, 1000)).toBe(50);
  });

  it('returns null for null lot size', () => {
    expect(computeBuildingCoverage(500, null)).toBeNull();
  });

  it('returns null for null building area', () => {
    expect(computeBuildingCoverage(null, 1000)).toBeNull();
  });

  it('returns null for zero lot size', () => {
    expect(computeBuildingCoverage(500, 0)).toBeNull();
  });

  it('returns null for zero building area', () => {
    expect(computeBuildingCoverage(0, 1000)).toBeNull();
  });

  it('caps at 100% for building larger than lot', () => {
    expect(computeBuildingCoverage(1500, 1000)).toBe(100);
  });

  it('returns null for negative building area', () => {
    expect(computeBuildingCoverage(-100, 1000)).toBeNull();
  });

  it('returns null for negative lot size', () => {
    expect(computeBuildingCoverage(500, -1000)).toBeNull();
  });
});
