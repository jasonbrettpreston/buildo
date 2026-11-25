// 🔗 SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (every page setting has bounds and an on_invalid posture);
//              docs/specs/00_engineering_standards.md §12.12 Property-based tests.
//
// task-456 X4 (mcfixreborn-g3 GROUNDER-F.md:109): sliceNumber (mobile/src/lib/sliceConfig.ts, no imports, so the relative import works) had
// example tests only. For any min <= max and any finite v:
//   - under clamp the result is in [min, max]: v itself when v is in range, else the nearer bound;
//   - under fail the result is v when in range, and it throws exactly when v is outside.
// A value that is not a finite number (NaN, Infinity, -Infinity, undefined, a string) always throws, before any bound is read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { sliceNumber } from '../../../mobile/src/lib/sliceConfig';

const bound = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
// min equal to max is drawn sometimes; otherwise the pair is sorted so min <= max.
const bounds = fc.oneof(
  bound.map((x) => [x, x] as const),
  fc.tuple(bound, bound).map(([a, b]) => (a <= b ? [a, b] as const : [b, a] as const)),
);
const wide = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true });
// v from a range wider than the bounds, mixed with the endpoints and zero.
const caseOf = bounds.chain(([min, max]) => fc.record({
  min: fc.constant(min),
  max: fc.constant(max),
  on_invalid: fc.constantFrom('clamp', 'fail'),
  v: fc.oneof(wide, fc.constantFrom(min, max, 0)),
}));

let warn: { mockRestore: () => void };
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); });

describe('sliceNumber (property)', () => {
  it('for any min ≤ max and finite v: the result is in [min,max] (and v itself when in range), or it throws only under fail', () => {
    fc.assert(fc.property(caseOf, ({ min, max, on_invalid, v }) => {
      const slice = { config: { k: v }, bounds: { k: { min, max, on_invalid } } };
      const inRange = v >= min && v <= max;
      let out: number;
      try {
        out = sliceNumber(slice, 'k');
      } catch {
        return on_invalid === 'fail' && !inRange;
      }
      if (on_invalid === 'fail' && !inRange) return false;
      if (out < min || out > max) return false;
      if (inRange) return out === v;
      return out === (v < min ? min : max);
    }));
  });
  it('NaN, Infinity, -Infinity, undefined and a string always throw', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, '5']) {
      for (const on_invalid of ['clamp', 'fail']) {
        expect(() => sliceNumber({ config: { k: v }, bounds: { k: { min: 0, max: 10, on_invalid } } }, 'k')).toThrow(/missing or not a finite number/);
      }
    }
  });
});
