/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3
//             docs/specs/01-pipeline/83_lead_cost_model.md §2

import fs from 'node:fs';
import path from 'node:path';
import {
  formatSqft,
  formatIncome,
  formatCostTier,
  formatCurrencyAbbrev,
} from '@/lib/leadDetailFormat';

describe('formatSqft (the API serves square feet, FIX.AREA-FACTOR / fe.44: the phone only formats)', () => {
  it('returns null for null and undefined input', () => {
    expect(formatSqft(null)).toBeNull();
    expect(formatSqft(undefined)).toBeNull();
  });

  it('returns null for NaN and Infinity', () => {
    expect(formatSqft(Number.NaN)).toBeNull();
    expect(formatSqft(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('formats 0 as "0 sq ft"', () => {
    expect(formatSqft(0)).toBe('0 sq ft');
  });

  it('rounds the served square feet: 1076.39 -> "1,076 sq ft"', () => {
    expect(formatSqft(1076.39)).toBe('1,076 sq ft');
  });

  it('1533.85575 -> "1,534 sq ft" (typical small permit)', () => {
    expect(formatSqft(1533.85575)).toBe('1,534 sq ft');
  });

  it('53819.5 -> "53,820 sq ft" (large project, thousand separator)', () => {
    expect(formatSqft(53819.5)).toBe('53,820 sq ft');
  });

  it('the helper types no conversion factor and exports none', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/leadDetailFormat.ts'), 'utf8');
    expect(src).not.toMatch(/10\.76|SQM_TO_SQFT/);
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
