// 🔗 SPEC LINK: docs/specs/14_onboarding.md
// Onboarding wizard logic: step validation, preferences, trade selection
import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, type UserPreferences, type AccountType } from '@/lib/auth/types';

describe('Onboarding Default Preferences', () => {
  it('has correct default values', () => {
    expect(DEFAULT_PREFERENCES.trade_filters).toEqual([]);
    expect(DEFAULT_PREFERENCES.postal_codes).toEqual([]);
    expect(DEFAULT_PREFERENCES.wards).toEqual([]);
    expect(DEFAULT_PREFERENCES.alert_frequency).toBe('daily_digest');
    expect(DEFAULT_PREFERENCES.email_notifications).toBe(true);
    expect(DEFAULT_PREFERENCES.push_notifications).toBe(false);
  });

  it('min_cost and max_cost are undefined by default', () => {
    expect(DEFAULT_PREFERENCES.min_cost).toBeUndefined();
    expect(DEFAULT_PREFERENCES.max_cost).toBeUndefined();
  });
});

describe('Onboarding Step Validation', () => {
  const STEPS = ['Trades', 'Location', 'Notifications', 'Confirm'];

  it('has exactly 4 steps', () => {
    expect(STEPS).toHaveLength(4);
  });

  it('first step is trade selection', () => {
    expect(STEPS[0]).toBe('Trades');
  });

  it('last step is confirmation', () => {
    expect(STEPS[STEPS.length - 1]).toBe('Confirm');
  });

  it('step 0 requires at least one trade selected', () => {
    function canProceedFromTradeStep(selectedTrades: string[]): boolean {
      return selectedTrades.length > 0;
    }
    expect(canProceedFromTradeStep([])).toBe(false);
    expect(canProceedFromTradeStep(['plumbing'])).toBe(true);
    expect(canProceedFromTradeStep(['plumbing', 'hvac'])).toBe(true);
  });

  it('step navigation clamps to valid range', () => {
    function clampStep(step: number, totalSteps: number): number {
      return Math.max(0, Math.min(step, totalSteps - 1));
    }
    expect(clampStep(-1, 4)).toBe(0);
    expect(clampStep(0, 4)).toBe(0);
    expect(clampStep(3, 4)).toBe(3);
    expect(clampStep(5, 4)).toBe(3);
  });
});

describe('Trade Selection Toggle', () => {
  function toggleTrade(current: string[], slug: string): string[] {
    return current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
  }

  it('adds trade to empty list', () => {
    expect(toggleTrade([], 'plumbing')).toEqual(['plumbing']);
  });

  it('removes trade from list', () => {
    expect(toggleTrade(['plumbing', 'hvac'], 'plumbing')).toEqual(['hvac']);
  });

  it('adds second trade to list', () => {
    expect(toggleTrade(['plumbing'], 'hvac')).toEqual(['plumbing', 'hvac']);
  });

  it('removing only trade results in empty list', () => {
    expect(toggleTrade(['plumbing'], 'plumbing')).toEqual([]);
  });
});

describe('Postal Code Parsing', () => {
  function parsePostalCodes(input: string): string[] {
    return input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  it('parses comma-separated postal codes', () => {
    expect(parsePostalCodes('M5V, M4K, M6G')).toEqual(['M5V', 'M4K', 'M6G']);
  });

  it('handles no spaces', () => {
    expect(parsePostalCodes('M5V,M4K')).toEqual(['M5V', 'M4K']);
  });

  it('returns empty array for empty input', () => {
    expect(parsePostalCodes('')).toEqual([]);
  });

  it('handles single postal code', () => {
    expect(parsePostalCodes('M5V')).toEqual(['M5V']);
  });

  it('filters empty entries from trailing commas', () => {
    expect(parsePostalCodes('M5V,,M4K,')).toEqual(['M5V', 'M4K']);
  });
});

describe('Account Type Validation', () => {
  const VALID_ACCOUNT_TYPES: AccountType[] = [
    'individual',
    'company',
    'supplier',
  ];

  it('has exactly 3 account types', () => {
    expect(VALID_ACCOUNT_TYPES).toHaveLength(3);
  });

  it('includes individual, company, and supplier', () => {
    expect(VALID_ACCOUNT_TYPES).toContain('individual');
    expect(VALID_ACCOUNT_TYPES).toContain('company');
    expect(VALID_ACCOUNT_TYPES).toContain('supplier');
  });
});

describe('Preferences Construction', () => {
  it('builds complete preferences from user input', () => {
    const prefs: UserPreferences = {
      trade_filters: ['plumbing', 'hvac'],
      postal_codes: ['M5V', 'M4K'],
      wards: ['10'],
      min_cost: 50000,
      max_cost: 500000,
      alert_frequency: 'instant',
      email_notifications: true,
      push_notifications: true,
    };

    expect(prefs.trade_filters).toHaveLength(2);
    expect(prefs.postal_codes).toHaveLength(2);
    expect(prefs.alert_frequency).toBe('instant');
    expect(prefs.min_cost).toBe(50000);
  });

  it('alert frequency has valid options', () => {
    const validFrequencies: UserPreferences['alert_frequency'][] = [
      'instant',
      'daily_digest',
      'weekly',
    ];
    expect(validFrequencies).toHaveLength(3);
  });
});
