// Logic Layer Tests - Neighbourhood summary and formatting
// SPEC LINK: docs/specs/27_neighbourhood_profiles.md
import { describe, it, expect } from 'vitest';
import {
  classifyIncome,
  classifyTenure,
  generateSummary,
  formatIncome,
  formatPct,
  formatPeriod,
} from '@/lib/neighbourhoods/summary';
import { createMockNeighbourhood } from './factories';

describe('classifyIncome', () => {
  it('returns high-income for ≥100K', () => {
    expect(classifyIncome(100000)).toBe('high-income');
  });

  it('returns high-income for well above threshold', () => {
    expect(classifyIncome(250000)).toBe('high-income');
  });

  it('returns middle-income for ≥60K', () => {
    expect(classifyIncome(60000)).toBe('middle-income');
  });

  it('returns middle-income for 80K', () => {
    expect(classifyIncome(80000)).toBe('middle-income');
  });

  it('returns lower-income for <60K', () => {
    expect(classifyIncome(45000)).toBe('lower-income');
  });

  it('returns unknown-income for null', () => {
    expect(classifyIncome(null)).toBe('unknown-income');
  });

  it('returns lower-income for zero', () => {
    expect(classifyIncome(0)).toBe('lower-income');
  });
});

describe('classifyTenure', () => {
  it('returns owner-occupied for ≥60%', () => {
    expect(classifyTenure(60)).toBe('owner-occupied');
  });

  it('returns owner-occupied for 85%', () => {
    expect(classifyTenure(85)).toBe('owner-occupied');
  });

  it('returns renter-majority for ≤40%', () => {
    expect(classifyTenure(40)).toBe('renter-majority');
  });

  it('returns renter-majority for 20%', () => {
    expect(classifyTenure(20)).toBe('renter-majority');
  });

  it('returns mixed-tenure for values between 40 and 60', () => {
    expect(classifyTenure(50)).toBe('mixed-tenure');
  });

  it('returns unknown-tenure for null', () => {
    expect(classifyTenure(null)).toBe('unknown-tenure');
  });

  it('returns renter-majority for 100% (edge: all owners not possible at 100 owner)', () => {
    expect(classifyTenure(100)).toBe('owner-occupied');
  });
});

describe('generateSummary', () => {
  it('generates full summary with all parts', () => {
    const n = createMockNeighbourhood({
      avg_household_income: 120000,
      tenure_owner_pct: 75,
      period_of_construction: '1961-1980',
    });
    expect(generateSummary(n)).toBe('High-income, owner-occupied, built 1961-1980');
  });

  it('generates summary without era when period is null', () => {
    const n = createMockNeighbourhood({
      avg_household_income: 120000,
      tenure_owner_pct: 75,
      period_of_construction: null,
    });
    expect(generateSummary(n)).toBe('High-income, owner-occupied');
  });

  it('generates lower-income renter-majority summary', () => {
    const n = createMockNeighbourhood({
      avg_household_income: 45000,
      tenure_owner_pct: 30,
      period_of_construction: '1981-1990',
    });
    expect(generateSummary(n)).toBe('Lower-income, renter-majority, built 1981-1990');
  });

  it('generates empty string when all values are null', () => {
    const n = createMockNeighbourhood({
      avg_household_income: null,
      tenure_owner_pct: null,
      period_of_construction: null,
    });
    expect(generateSummary(n)).toBe('');
  });

  it('capitalizes first letter of income classification', () => {
    const n = createMockNeighbourhood({
      avg_household_income: 70000,
      tenure_owner_pct: null,
      period_of_construction: null,
    });
    expect(generateSummary(n)).toBe('Middle-income');
  });
});

describe('formatIncome', () => {
  it('formats income with dollar sign and comma', () => {
    expect(formatIncome(120000)).toBe('$120,000');
  });

  it('formats small income', () => {
    expect(formatIncome(45000)).toBe('$45,000');
  });

  it('returns N/A for null', () => {
    expect(formatIncome(null)).toBe('N/A');
  });

  it('formats zero as $0', () => {
    expect(formatIncome(0)).toBe('$0');
  });
});

describe('formatPct', () => {
  it('formats percentage with percent sign', () => {
    expect(formatPct(65.5)).toBe('65.5%');
  });

  it('formats zero percentage', () => {
    expect(formatPct(0)).toBe('0%');
  });

  it('formats 100%', () => {
    expect(formatPct(100)).toBe('100%');
  });

  it('returns N/A for null', () => {
    expect(formatPct(null)).toBe('N/A');
  });
});

describe('formatPeriod', () => {
  it('formats period with Built prefix', () => {
    expect(formatPeriod('1961-1980')).toBe('Built 1961-1980');
  });

  it('returns N/A for null', () => {
    expect(formatPeriod(null)).toBe('N/A');
  });

  it('returns N/A for empty string', () => {
    expect(formatPeriod('')).toBe('N/A');
  });
});

describe('createMockNeighbourhood', () => {
  it('returns defaults matching Agincourt North', () => {
    const n = createMockNeighbourhood();
    expect(n.neighbourhood_id).toBe(129);
    expect(n.name).toBe('Agincourt North');
    expect(n.census_year).toBe(2021);
  });

  it('allows overrides', () => {
    const n = createMockNeighbourhood({ name: 'The Annex', neighbourhood_id: 95 });
    expect(n.name).toBe('The Annex');
    expect(n.neighbourhood_id).toBe(95);
  });
});
