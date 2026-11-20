/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (bounds and an on_invalid posture per tunable); docs/specs/02-web-admin/126_maxbld_surface_standard.md P4.
//
// FIX.CONFIG-BOUNDS (task-395): sliceNumber reads a number from a generated slice and applies the bounds the slice carries: in range, the value; out of range, the
// stated failure behaviour (fail throws by key name, clamp returns the nearest bound); no bounds entry, or a value that is not a finite number, throws by key name.
import { sliceNumber, type SliceNumbers } from '@/lib/sliceConfig';

const slice = (config: Record<string, unknown>, bounds?: Record<string, unknown>): SliceNumbers => ({ config, bounds } as SliceNumbers);

describe('sliceNumber applies the declared bounds', () => {
  it('returns an in-range value, including both bounds', () => {
    const b = { k: { min: 0, max: 10, on_invalid: 'clamp' } };
    expect(sliceNumber(slice({ k: 4 }, b), 'k')).toBe(4);
    expect(sliceNumber(slice({ k: 0 }, b), 'k')).toBe(0);
    expect(sliceNumber(slice({ k: 10 }, b), 'k')).toBe(10);
  });
  it('clamp: an out-of-range value reads as the nearest bound, and the clamp warns naming the key and both values', () => {
    const b = { k: { min: 3, max: 10, on_invalid: 'clamp' } };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(sliceNumber(slice({ k: 99 }, b), 'k')).toBe(10);
    expect(sliceNumber(slice({ k: -5 }, b), 'k')).toBe(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/"k".*99.*10/);
    warn.mockRestore();
  });
  it('an in-range value does not warn', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    sliceNumber(slice({ k: 5 }, { k: { min: 3, max: 10, on_invalid: 'clamp' } }), 'k');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('fail: an out-of-range value throws, naming the key', () => {
    const b = { k: { min: 0, max: 0, on_invalid: 'fail' } };
    expect(() => sliceNumber(slice({ k: 1 }, b), 'k')).toThrow(/"k"/);
  });
  it('a null bounds entry throws the key-named error, not a TypeError', () => {
    expect(() => sliceNumber(slice({ k: 1 }, { k: null }), 'k')).toThrow(/"k" has no valid bounds/);
  });
  it('a key with no bounds entry, a slice with no bounds, a missing key and a non-finite or non-number value throw by key name', () => {
    const b = { k: { min: 0, max: 10, on_invalid: 'clamp' } };
    expect(() => sliceNumber(slice({ k: 1 }, {}), 'k')).toThrow(/"k"/);
    expect(() => sliceNumber(slice({ k: 1 }), 'k')).toThrow(/"k"/);
    expect(() => sliceNumber(slice({}, b), 'k')).toThrow(/"k"/);
    expect(() => sliceNumber(slice({ k: Number.NaN }, b), 'k')).toThrow(/"k"/);
    expect(() => sliceNumber(slice({ k: '4' }, b), 'k')).toThrow(/"k"/);
  });
  it('a bounds entry with an unknown on_invalid or an inverted pair throws rather than guessing', () => {
    expect(() => sliceNumber(slice({ k: 4 }, { k: { min: 0, max: 10, on_invalid: 'default' } }), 'k')).toThrow(/"k"/);
    expect(() => sliceNumber(slice({ k: 4 }, { k: { min: 9, max: 1, on_invalid: 'clamp' } }), 'k')).toThrow(/"k"/);
  });
});
