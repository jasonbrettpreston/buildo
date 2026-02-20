// SPEC LINK: docs/specs/21_notifications.md
import { describe, it, expect } from 'vitest';
import type { UserPreferences } from '@/lib/auth/types';
import { DEFAULT_PREFERENCES } from '@/lib/auth/types';

describe('Notification Matching Logic', () => {
  interface PermitForMatching {
    ward: string;
    postal: string;
    est_const_cost: number | null;
    trade_slugs: string[];
  }

  function doesPermitMatchPreferences(
    permit: PermitForMatching,
    prefs: UserPreferences
  ): { matches: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Trade match
    if (prefs.trade_filters.length > 0) {
      const matchingTrades = permit.trade_slugs.filter((t) =>
        prefs.trade_filters.includes(t)
      );
      if (matchingTrades.length > 0) {
        reasons.push(`Matching trades: ${matchingTrades.join(', ')}`);
      } else {
        return { matches: false, reasons: [] };
      }
    }

    // Ward match
    if (prefs.wards.length > 0) {
      if (prefs.wards.includes(permit.ward)) {
        reasons.push(`Ward ${permit.ward} matches`);
      } else {
        return { matches: false, reasons: [] };
      }
    }

    // Postal code prefix match
    if (prefs.postal_codes.length > 0) {
      const prefix = permit.postal.substring(0, 3).toUpperCase();
      if (prefs.postal_codes.some((p) => p.toUpperCase() === prefix)) {
        reasons.push(`Postal ${prefix} matches`);
      } else {
        return { matches: false, reasons: [] };
      }
    }

    // Cost range match
    if (permit.est_const_cost != null) {
      if (prefs.min_cost && permit.est_const_cost < prefs.min_cost) {
        return { matches: false, reasons: [] };
      }
      if (prefs.max_cost && permit.est_const_cost > prefs.max_cost) {
        return { matches: false, reasons: [] };
      }
    }

    return { matches: reasons.length > 0 || prefs.trade_filters.length === 0, reasons };
  }

  const samplePermit: PermitForMatching = {
    ward: '10',
    postal: 'M5V 2A1',
    est_const_cost: 150000,
    trade_slugs: ['plumbing', 'electrical'],
  };

  it('matches when trade filters overlap', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing', 'hvac'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(true);
    expect(result.reasons[0]).toContain('plumbing');
  });

  it('does not match when no trade overlap', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['roofing', 'painting'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(false);
  });

  it('matches with ward filter', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing'],
      wards: ['10', '14'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(true);
  });

  it('does not match wrong ward', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing'],
      wards: ['01', '05'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(false);
  });

  it('matches with postal code prefix', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['electrical'],
      postal_codes: ['M5V', 'M4K'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(true);
  });

  it('does not match wrong postal prefix', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['electrical'],
      postal_codes: ['M6G'],
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(false);
  });

  it('matches all permits with empty preferences', () => {
    const result = doesPermitMatchPreferences(samplePermit, DEFAULT_PREFERENCES);
    expect(result.matches).toBe(true);
  });

  it('filters by min cost', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing'],
      min_cost: 200000,
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(false);
  });

  it('filters by max cost', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing'],
      max_cost: 100000,
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(false);
  });

  it('permit within cost range matches', () => {
    const prefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      trade_filters: ['plumbing'],
      min_cost: 100000,
      max_cost: 200000,
    };
    const result = doesPermitMatchPreferences(samplePermit, prefs);
    expect(result.matches).toBe(true);
  });
});

describe('Notification Email Templates', () => {
  function buildNewLeadSubject(tradeName: string, address: string): string {
    return `New ${tradeName} Lead: ${address}`;
  }

  function buildDigestSubject(count: number, period: string): string {
    return `${count} New Lead${count !== 1 ? 's' : ''} - ${period} Digest`;
  }

  it('formats new lead subject correctly', () => {
    const subject = buildNewLeadSubject('Plumbing', '123 Queen St');
    expect(subject).toBe('New Plumbing Lead: 123 Queen St');
  });

  it('formats digest subject for single lead', () => {
    const subject = buildDigestSubject(1, 'Daily');
    expect(subject).toBe('1 New Lead - Daily Digest');
  });

  it('formats digest subject for multiple leads', () => {
    const subject = buildDigestSubject(15, 'Weekly');
    expect(subject).toBe('15 New Leads - Weekly Digest');
  });
});

describe('Alert Frequency Logic', () => {
  function shouldSendNow(
    alertFrequency: UserPreferences['alert_frequency'],
    lastSentAt: Date | null,
    now: Date
  ): boolean {
    if (alertFrequency === 'instant') return true;

    if (!lastSentAt) return true;

    const hoursSinceLast = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60);

    if (alertFrequency === 'daily_digest') {
      return hoursSinceLast >= 23; // ~24 hours with buffer
    }

    if (alertFrequency === 'weekly') {
      return hoursSinceLast >= 167; // ~7 days with buffer
    }

    return false;
  }

  it('instant always sends', () => {
    expect(shouldSendNow('instant', new Date(), new Date())).toBe(true);
  });

  it('daily_digest sends after 24 hours', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(shouldSendNow('daily_digest', yesterday, new Date())).toBe(true);
  });

  it('daily_digest does not send within 24 hours', () => {
    const recent = new Date(Date.now() - 12 * 60 * 60 * 1000);
    expect(shouldSendNow('daily_digest', recent, new Date())).toBe(false);
  });

  it('weekly sends after 7 days', () => {
    const lastWeek = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(shouldSendNow('weekly', lastWeek, new Date())).toBe(true);
  });

  it('weekly does not send within 7 days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(shouldSendNow('weekly', threeDaysAgo, new Date())).toBe(false);
  });

  it('sends if never sent before', () => {
    expect(shouldSendNow('daily_digest', null, new Date())).toBe(true);
    expect(shouldSendNow('weekly', null, new Date())).toBe(true);
  });
});
