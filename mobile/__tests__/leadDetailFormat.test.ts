/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3
//             docs/specs/01-pipeline/83_lead_cost_model.md §2

import {
  SQM_TO_SQFT,
  formatSqft,
  formatIncome,
  formatCostTier,
  formatCurrencyAbbrev,
} from '@/lib/leadDetailFormat';

describe('SQM_TO_SQFT constant', () => {
  it('matches the canonical 1 m² = 10.7639 ft² (3-decimal precision)', () => {
    // Multi-Agent plan review flagged drift between 10.764 and 10.7639 in
    // separate plan sections; this constant is the single source of truth.
    expect(SQM_TO_SQFT).toBe(10.7639);
  });
});

describe('formatSqft', () => {
  it('returns null for null input', () => {
    expect(formatSqft(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(formatSqft(Number.NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(formatSqft(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('formats 0 m² as "0 sq ft"', () => {
    expect(formatSqft(0)).toBe('0 sq ft');
  });

  it('formats 100 m² as "1,076 sq ft" (rounded)', () => {
    expect(formatSqft(100)).toBe('1,076 sq ft');
  });

  it('formats 142.5 m² as "1,534 sq ft" (typical small permit)', () => {
    expect(formatSqft(142.5)).toBe('1,534 sq ft');
  });

  it('formats 5000 m² as "53,820 sq ft" (large project, thousand separator)', () => {
    expect(formatSqft(5000)).toBe('53,820 sq ft');
  });
});

describe('formatIncome', () => {
  it('returns null for null', () => {
    expect(formatIncome(null)).toBeNull();
  });

  it('formats 145000 as "$145,000"', () => {
    expect(formatIncome(145000)).toBe('$145,000');
  });

  it('formats 0 as "$0"', () => {
    expect(formatIncome(0)).toBe('$0');
  });
});

describe('formatCostTier', () => {
  it('returns "—" / empty symbol for null', () => {
    expect(formatCostTier(null)).toEqual({ label: '—', symbol: '' });
  });

  it('maps "large" → label "Large", symbol "$$$"', () => {
    expect(formatCostTier('large')).toEqual({ label: 'Large', symbol: '$$$' });
  });

  it('maps "mega" → label "Mega", symbol "$$$$$"', () => {
    expect(formatCostTier('mega')).toEqual({ label: 'Mega', symbol: '$$$$$' });
  });

  it('passes through unknown tier verbatim with empty symbol', () => {
    expect(formatCostTier('giga' as never)).toEqual({ label: 'giga', symbol: '' });
  });
});

describe('formatCurrencyAbbrev', () => {
  it('returns null for null', () => {
    expect(formatCurrencyAbbrev(null)).toBeNull();
  });

  it('formats 1500000 as "$1.5M"', () => {
    expect(formatCurrencyAbbrev(1500000)).toBe('$1.5M');
  });

  it('formats 450000 as "$450K"', () => {
    expect(formatCurrencyAbbrev(450000)).toBe('$450K');
  });

  it('formats 999 as "$999"', () => {
    expect(formatCurrencyAbbrev(999)).toBe('$999');
  });
});
