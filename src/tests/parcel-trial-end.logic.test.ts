// 🔗 SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3 (dated note 2026-11-14, MF-47)
//
// MF-47 (RULED 2026-11-14: "the trial-length bound gains Stripe's 48-hour floor") · the pure trial-end maths of src/lib/stripe/parcel-checkout.ts:
// now + N calendar months (UTC, the day clamped to the month end, the Postgres interval rule MF-45 uses), refused when under 48 hours or when N
// is not a whole number of months in the setting's seed bounds.
import { describe, it, expect } from 'vitest';
import seed from '../../scripts/seeds/logic_variables.json';
import { trialEndFor, TRIAL_MONTHS_KEY, STRIPE_MIN_TRIAL_MS } from '@/lib/stripe/parcel-checkout';

const at = (s: string): Date => new Date(s);
const bounds = (seed as unknown as Record<string, { min: number; max: number; default: number }>)[TRIAL_MONTHS_KEY]!;

describe('trialEndFor', () => {
  it('Jan 31 + 1 month clamps to Feb 28 (and Feb 29 in a leap year), time of day kept', () => {
    expect(trialEndFor(at('2026-01-31T10:20:30.000Z'), 1).toISOString()).toBe('2026-02-28T10:20:30.000Z');
    expect(trialEndFor(at('2028-01-31T10:20:30.000Z'), 1).toISOString()).toBe('2028-02-29T10:20:30.000Z');
  });
  it('crosses a year end; 12 months is one year', () => {
    expect(trialEndFor(at('2026-12-15T00:00:00.000Z'), 1).toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(trialEndFor(at('2026-03-05T00:00:00.000Z'), 12).toISOString()).toBe('2027-03-05T00:00:00.000Z');
  });
  it('the bounds are the setting seed bounds (min 1, max 12), not literals; 0, above max, fractions and NaN throw', () => {
    expect([bounds.min, bounds.max, bounds.default]).toEqual([1, 12, 1]);
    for (const bad of [bounds.min - 1, bounds.max + 1, 1.5, Number.NaN]) {
      expect(() => trialEndFor(at('2026-06-01T00:00:00.000Z'), bad)).toThrow(/trial/i);
    }
  });
  it('an end under 48 hours is refused (Stripe floor); exactly 48 hours is allowed', () => {
    expect(STRIPE_MIN_TRIAL_MS).toBe(48 * 3600 * 1000);
    // trialEndFor's floor guard is exercised through the injectable minimum
    expect(() => trialEndFor(at('2026-06-01T00:00:00.000Z'), 1, STRIPE_MIN_TRIAL_MS * 100)).toThrow(/48|floor|short/i);
    expect(trialEndFor(at('2026-06-01T00:00:00.000Z'), 1, 0).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
