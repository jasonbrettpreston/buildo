// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.12 Property-based tests ("unit conversions ... MUST have at least one fast-check property test")
//
// FIX.PROJ (task-372, D6 of the BL-GROUND verdicts): the server's square-feet rounding (src/lib/report-projection/format.ts, area_sqft) had example tests only.
// Invariants, for every finite non-negative area n in square metres from 0 to 1,000,000 (the assert_data_bounds ceiling):
//   - the shown number is a whole number of square feet within half a square foot of n x 10.7639 (the registered pinned factor, typed here as the
//     independent reference so a drifting factor fails);
//   - it never falls as n grows;
//   - the digits group in threes with commas, carry no sign and no NaN.
// A negative, NaN or infinite input is refused (null), never shown.
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { formatPageRule as formatPageRuleWith } from '@/lib/report-projection/format';
import { SQFT_PER_M2 } from '@/lib/report-projection/project';

const formatPageRule = (rule: string, n: number) => formatPageRuleWith(rule, n, SQFT_PER_M2);

const FACTOR = 10.7639;
const shown = (n: number): string => {
  const f = formatPageRule('area_sqft', n);
  if (f === null) throw new Error(`refused ${n}`);
  return f.value;
};
const digitsOf = (n: number): number => Number(shown(n).replace(/,/g, ''));
const area = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

describe('area_sqft rounding (property)', () => {
  it('is a whole number within half a square foot of n x 10.7639', () => {
    fc.assert(fc.property(area, (n) => {
      const d = digitsOf(n);
      return Number.isInteger(d) && Math.abs(d - n * FACTOR) <= 0.5 + 1e-6;
    }));
  });
  it('never falls as the area grows', () => {
    fc.assert(fc.property(area, area, (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return digitsOf(lo) <= digitsOf(hi);
    }));
  });
  it('groups the digits in threes with commas, never signed, never NaN', () => {
    fc.assert(fc.property(area, (n) => /^(0|[1-9]\d{0,2}(,\d{3})*)$/.test(shown(n))));
  });
  it('refuses a negative, NaN or infinite area', () => {
    fc.assert(fc.property(fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.001, -1e9), (n) => formatPageRule('area_sqft', n) === null));
  });
});
