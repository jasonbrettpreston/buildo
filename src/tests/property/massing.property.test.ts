// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.12 Property-based tests ("distance/unit conversions ... MUST have at least one fast-check property test")
//
// task-456 X4 (mcfixreborn-g3 GROUNDER-E.md:91): the massing numbers had example tests only (massing.logic.test.ts).
// Invariants:
//   - computeBuildingCoverage (src/lib/massing/geometry.ts) is at most 100 for any positive, finite building and lot areas (the cap);
//   - formatHeight's ft figure is within 0.05 ft of m x 3.28084 (the registered pinned parcels_m_to_ft, typed here as the independent
//     reference so a drifting factor fails; M_TO_FT is what the formatter is given), for every m from 0 to 1,000,000.
// The tolerance carries the sibling's slack (report-sqft-rounding.property.test.ts): an exact rounding tie is off by 0.05 plus float noise.
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { computeBuildingCoverage, formatHeight } from '@/lib/massing/geometry';
import { M_TO_FT } from '@/lib/parcels/geometry';

const FACTOR = 3.28084;
// NaN and Infinity give NaN in the coverage division, so the areas are positive and finite.
const area = fc.double({ min: 1e-6, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
const metres = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

const ftOf = (s: string): number => {
  const m = /^-?\d+(?:\.\d+)? m \((-?\d+(?:\.\d+)?) ft\)$/.exec(s);
  if (!m) throw new Error(`not a height string: ${s}`);
  return Number(m[1]);
};

describe('massing numbers (property)', () => {
  it('coverage is at most 100 for positive areas', () => {
    fc.assert(fc.property(area, area, (building, lot) => {
      const c = computeBuildingCoverage(building, lot);
      return c !== null && c <= 100;
    }));
  });
  it('the ft figure is within 0.05 of m × 3.28084', () => {
    fc.assert(fc.property(metres, (m) => Math.abs(ftOf(formatHeight(m, M_TO_FT)) - m * FACTOR) <= 0.05 + 1e-6));
  });
});
