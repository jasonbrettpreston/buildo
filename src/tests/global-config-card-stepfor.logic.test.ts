// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 3
//
// WF2 ADMIN-1 ratchet, F-4 (output-panel finding): stepFor's old
// name-pattern heuristic missed several real seed keys whose defaults are
// fractional but whose NAME matches no ratio-ish pattern
// (confidence/coverage_ratio/threshold_pct/_threshold/multiplier) —
// GlobalConfigCard shipped `step={1}` on values like `0.05`/`0.9`/`14.5`,
// an HTML5 stepMismatch on load for every one of these fields. Fixed by
// deriving the step from the CURRENT value's own decimal places (guaranteed
// valid by construction), falling back to the name-pattern heuristic only
// when the value's decimals are 0 (a ratio-shaped field whose value happens
// to be a whole number today).
import { describe, expect, it } from 'vitest';
import { decimalPlaces, stepFor } from '@/features/admin-controls/components/GlobalConfigCard';

describe('decimalPlaces', () => {
  it('counts digits after the decimal point', () => {
    expect(decimalPlaces(0.05)).toBe(2);
    expect(decimalPlaces(14.5)).toBe(1);
    expect(decimalPlaces(0.9)).toBe(1);
    expect(decimalPlaces(0.95)).toBe(2);
    expect(decimalPlaces(0.8)).toBe(1);
    expect(decimalPlaces(0.5)).toBe(1);
  });

  it('returns 0 for whole numbers, non-finite, and negative-zero edge cases', () => {
    expect(decimalPlaces(0)).toBe(0);
    expect(decimalPlaces(10000)).toBe(0);
    expect(decimalPlaces(-1)).toBe(0);
    expect(decimalPlaces(Number.NaN)).toBe(0);
    expect(decimalPlaces(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('caps at 4 decimal places (defensive bound, not expected on real seed data)', () => {
    expect(decimalPlaces(0.123456)).toBe(4);
  });
});

describe('stepFor — F-4 regression: every named broken key now derives a value-valid step', () => {
  // The exact (key, value) pairs cited in the output-panel finding —
  // each previously fell through the name-pattern heuristic to step={1}.
  it.each([
    ['centreline_propagation_coverage_min', 0.9, 0.1],
    ['coa_parcel_conf_tier1a', 0.95, 0.01],
    ['coa_parcel_conf_tier1b', 0.8, 0.1],
    ['inference_weight', 0.5, 0.1],
    ['archetype_t1_fsi_min', 0.05, 0.01],
    ['cost_ptc_skipped_warn_pct', 14.5, 0.1],
  ])('%s @ %f -> step %f', (key, value, expectedStep) => {
    expect(stepFor(key, value)).toBeCloseTo(expectedStep, 6);
  });

  it.each([
    ['centreline_propagation_coverage_min', 0.9],
    ['coa_parcel_conf_tier1a', 0.95],
    ['coa_parcel_conf_tier1b', 0.8],
    ['inference_weight', 0.5],
    ['archetype_t1_fsi_min', 0.05],
    ['cost_ptc_skipped_warn_pct', 14.5],
  ])('%s @ %f: derived step evenly divides the value (no HTML5 stepMismatch)', (key, value) => {
    const step = stepFor(key, value);
    const remainder = Math.round((value / step) % 1 * 1e6) / 1e6;
    expect(remainder === 0 || remainder === 1).toBe(true);
  });

  it('preserves pre-existing magnitude overrides (special-cased keys unaffected by decimal derivation)', () => {
    expect(stepFor('cost_outlier_ceiling_cad', 5_000_000)).toBe(1_000_000);
    expect(stepFor('los_base_divisor', 10_000)).toBe(100);
    expect(stepFor('scraper_latency_p50_warn_ms', 500)).toBe(100);
    expect(stepFor('placeholder_cost_threshold', 1_000)).toBe(100);
  });

  it('preserves the integer day/sqm/pct overrides even if the value happens to look fractional-adjacent', () => {
    expect(stepFor('expired_threshold_days', 90)).toBe(1);
    expect(stepFor('coa_stall_threshold', 30)).toBe(1);
    expect(stepFor('massing_shed_threshold_sqm', 15)).toBe(1);
    expect(stepFor('scrape_early_phase_threshold_pct', 25)).toBe(1);
  });

  it('preserves the lifecycle band/cross/seq-band integer-count override, checked BEFORE decimal derivation', () => {
    expect(stepFor('lifecycle_band_p7a_min', 100)).toBe(1);
    expect(stepFor('lifecycle_cross_stalled_threshold', 250)).toBe(1);
    expect(stepFor('lifecycle_seq_band_1_min', 5)).toBe(1);
  });

  it('name-pattern fallback still applies when a ratio-shaped key currently holds a whole-number value', () => {
    // urban_coverage_ratio's default is fractional in the real seed, but this
    // proves the FALLBACK path itself (decimals(1) === 0) still returns the
    // fine-grained 0.01 a 0-1 ratio needs, rather than the bare default of 1.
    expect(stepFor('urban_coverage_ratio', 1)).toBe(0.01);
    expect(stepFor('coa_match_conf_high', 1)).toBe(0.01);
  });

  it('bare fallback (no name match, whole-number value) stays step=1', () => {
    expect(stepFor('some_unmatched_integer_key', 42)).toBe(1);
  });
});
