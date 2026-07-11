/** @jest-environment node */
// Jest tests — Parcel Cost Tool presentation helpers (Spec 100 §2.3/§2.4).
// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §6
import {
  getCostLine,
  costLineState,
  maxBuildBasisLabel,
  isEnvelopeFallback,
  formatCurrency,
  formatFsi,
  formatSqft,
  formatSqm,
  COST_LINE_ORDER,
} from '@/lib/parcelCostFormat';
import { SponsorSlot } from '@/components/parcel/SponsorSlot';
import type { ParcelCostMenu } from '@/lib/schemas';

describe('envelope-fallback labeling (Spec 100 §2.4)', () => {
  it('labels "maximum envelope" when opt_aor_gfa_sqm is null', () => {
    expect(maxBuildBasisLabel({ opt_aor_gfa_sqm: null, max_buildable_gfa_sqm: 500 })).toBe('maximum envelope');
    expect(isEnvelopeFallback({ opt_aor_gfa_sqm: null })).toBe(true);
  });
  it('labels "as-of-right" when opt_aor_gfa_sqm is present', () => {
    expect(maxBuildBasisLabel({ opt_aor_gfa_sqm: 300 })).toBe('as-of-right');
    expect(isEnvelopeFallback({ opt_aor_gfa_sqm: 300 })).toBe(false);
  });
  it('undefined areas degrades to the envelope label (safe default)', () => {
    expect(maxBuildBasisLabel(undefined)).toBe('maximum envelope');
  });
});

describe('absent ≠ fits:false (Spec 100 §2.3)', () => {
  const menu: ParcelCostMenu = {
    _schema_version: 3,
    kitchen: { total: 1000, per_sqm: 100, fits: undefined },
    garden_suite: { total: 5000, fits: false },
    garage: { total: 4000, fits: true },
  };
  it('a line absent from the menu → state "absent" (n/a, not a doesn\'t-fit badge)', () => {
    expect(getCostLine(menu, 'laneway_suite')).toBeNull();
    expect(costLineState(getCostLine(menu, 'laneway_suite'))).toBe('absent');
  });
  it('fits:false → state "no_fit" (a distinct badge)', () => {
    expect(costLineState(getCostLine(menu, 'garden_suite'))).toBe('no_fit');
  });
  it('present + no fits gate (or fits:true) → "available"', () => {
    expect(costLineState(getCostLine(menu, 'kitchen'))).toBe('available');
    expect(costLineState(getCostLine(menu, 'garage'))).toBe('available');
  });
  it('the root _schema_version number is never treated as a cost line', () => {
    expect(getCostLine(menu, '_schema_version')).toBeNull();
  });
  it('a null menu yields absent for every line', () => {
    for (const id of COST_LINE_ORDER) expect(getCostLine(null, id)).toBeNull();
  });
});

describe('formatters', () => {
  it('formatCurrency: M / K / small / null', () => {
    expect(formatCurrency(1_500_000)).toBe('$1.50M');
    expect(formatCurrency(75_000)).toBe('$75K');
    expect(formatCurrency(500)).toBe('$500');
    expect(formatCurrency(null)).toBeNull();
  });
  it('formatFsi: number, numeric string, null', () => {
    expect(formatFsi(1.234)).toBe('1.23');
    expect(formatFsi('0.9')).toBe('0.90');
    expect(formatFsi(null)).toBeNull();
  });
  it('formatSqft / formatSqm', () => {
    expect(formatSqft(100)).toBe('1,076 sq ft');
    expect(formatSqm(400)).toBe('400 m²');
    expect(formatSqft(null)).toBeNull();
  });
});

describe('SponsorSlot renders null while flag-off (Spec 100 §6.8)', () => {
  it('returns null when EXPO_PUBLIC_PARCEL_SPONSORS is unset', () => {
    delete process.env.EXPO_PUBLIC_PARCEL_SPONSORS;
    expect(SponsorSlot({ placement: 'detail_footer' })).toBeNull();
  });
});
