// 🔗 SPEC LINKS: docs/specs/15_dashboard_tradesperson.md, 16_dashboard_company.md, 17_dashboard_supplier.md
// Dashboard page logic: stat display, navigation, filter state
import { describe, it, expect } from 'vitest';
import { isValidDashboardStats } from '@/lib/admin/dashboard-stats';

// WF3 regression lock: /api/admin/stats returns a truthy error envelope on a
// 500 (DB failure) — `{ error }` from the route or `{ data: null, error, meta }`
// from withApiEnvelope. The old client did `setStats(data)` unconditionally, so
// the error object passed the `stats ?` guard and `stats.total_permits
// .toLocaleString()` threw on undefined → whole dashboard white-screened.
// isValidDashboardStats must reject every non-stats shape so the page degrades
// to `--` instead of crashing.
describe('Dashboard stats payload guard (white-screen regression)', () => {
  const VALID = {
    total_permits: 237000,
    active_permits: 219000,
    permits_this_week: 480,
    coa_total: 33400,
    coa_linked: 29694,
    coa_upcoming: 512,
  };

  it('accepts a well-formed stats payload', () => {
    expect(isValidDashboardStats(VALID)).toBe(true);
  });

  it('rejects the route-level 500 error shape', () => {
    expect(isValidDashboardStats({ error: 'Failed to fetch system statistics' })).toBe(false);
  });

  it('rejects the withApiEnvelope error envelope', () => {
    expect(
      isValidDashboardStats({ data: null, error: { code: 'DATABASE_ERROR', message: 'x' }, meta: null })
    ).toBe(false);
  });

  it('rejects null / undefined / non-objects', () => {
    expect(isValidDashboardStats(null)).toBe(false);
    expect(isValidDashboardStats(undefined)).toBe(false);
    expect(isValidDashboardStats('oops')).toBe(false);
    expect(isValidDashboardStats(42)).toBe(false);
  });

  it('rejects a partial payload missing a numeric field', () => {
    const { coa_upcoming, ...partial } = VALID;
    void coa_upcoming;
    expect(isValidDashboardStats(partial)).toBe(false);
  });

  it('rejects a payload with a null field (would throw on .toLocaleString)', () => {
    expect(isValidDashboardStats({ ...VALID, total_permits: null })).toBe(false);
  });
});

describe('Dashboard StatCard Logic', () => {
  function formatStatValue(
    value: number | string | null,
    prefix?: string,
    suffix?: string
  ): string {
    if (value == null) return '--';
    const str = typeof value === 'number' ? value.toLocaleString() : value;
    return `${prefix || ''}${str}${suffix || ''}`;
  }

  it('formats number with comma grouping', () => {
    expect(formatStatValue(237000)).toBe('237,000');
  });

  it('formats with prefix', () => {
    expect(formatStatValue(150000, '$')).toBe('$150,000');
  });

  it('formats with suffix', () => {
    expect(formatStatValue(20, undefined, '+')).toBe('20+');
  });

  it('displays -- for null value', () => {
    expect(formatStatValue(null)).toBe('--');
  });

  it('handles string values directly', () => {
    expect(formatStatValue('237,000+')).toBe('237,000+');
  });
});

describe('Dashboard Navigation Links', () => {
  // Two-Client Architecture (2026-04-22): /search and /map pages removed.
  // Dashboard nav now links to Admin only; tradesperson UI lives in Expo mobile app.
  const NAV_LINKS = [
    { href: '/admin', label: 'Admin' },
  ];

  it('has 1 navigation link (admin only — Two-Client Architecture)', () => {
    expect(NAV_LINKS).toHaveLength(1);
  });

  it('includes admin link and NOT deleted /search or /map', () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs).toContain('/admin');
    expect(hrefs).not.toContain('/search');
    expect(hrefs).not.toContain('/map');
  });

  it('each link has a label', () => {
    NAV_LINKS.forEach((link) => {
      expect(link.label).toBeTruthy();
      expect(typeof link.label).toBe('string');
    });
  });
});

describe('Dashboard Filter State', () => {
  it('initializes with empty filter object', () => {
    const filters: Record<string, string> = {};
    expect(Object.keys(filters)).toHaveLength(0);
  });

  it('updates filters immutably', () => {
    const original: Record<string, string> = {};
    const updated = { ...original, status: 'Issued' };
    expect(original).not.toHaveProperty('status');
    expect(updated.status).toBe('Issued');
  });

  it('tracks active filter count', () => {
    const filters: Record<string, string> = {
      status: 'Issued',
      ward: '10',
      trade_slug: 'plumbing',
    };
    const activeCount = Object.keys(filters).filter((k) => filters[k]).length;
    expect(activeCount).toBe(3);
  });

  it('clears all filters', () => {
    const filters: Record<string, string> = {
      status: 'Issued',
      ward: '10',
    };
    const cleared: Record<string, string> = {};
    expect(Object.keys(cleared)).toHaveLength(0);
    // Original unchanged
    expect(Object.keys(filters)).toHaveLength(2);
  });
});

describe('Dashboard Stats Row', () => {
  const STAT_CARDS = [
    { label: 'Total Permits', value: '237,000+' },
    { label: 'Active Trades', value: '20' },
    { label: 'New Today', value: '--' },
    { label: 'Updated Today', value: '--' },
  ];

  it('shows 4 stat cards', () => {
    expect(STAT_CARDS).toHaveLength(4);
  });

  it('Total Permits card shows 237,000+', () => {
    const card = STAT_CARDS.find((c) => c.label === 'Total Permits');
    expect(card).toBeDefined();
    expect(card!.value).toBe('237,000+');
  });

  it('Active Trades card shows 20', () => {
    const card = STAT_CARDS.find((c) => c.label === 'Active Trades');
    expect(card!.value).toBe('20');
  });

  it('placeholder cards show --', () => {
    const newToday = STAT_CARDS.find((c) => c.label === 'New Today');
    const updatedToday = STAT_CARDS.find((c) => c.label === 'Updated Today');
    expect(newToday!.value).toBe('--');
    expect(updatedToday!.value).toBe('--');
  });
});

describe('Dashboard Account Type Variants', () => {
  // Specs 15/16/17 describe different dashboard views per account type
  const ACCOUNT_TYPE_FEATURES: Record<
    string,
    { showTeam: boolean; showAnalytics: boolean; showSupplyChain: boolean }
  > = {
    individual: {
      showTeam: false,
      showAnalytics: false,
      showSupplyChain: false,
    },
    company: {
      showTeam: true,
      showAnalytics: true,
      showSupplyChain: false,
    },
    supplier: {
      showTeam: false,
      showAnalytics: true,
      showSupplyChain: true,
    },
  };

  it('individual sees basic dashboard (no team, no analytics)', () => {
    const features = ACCOUNT_TYPE_FEATURES.individual;
    expect(features!.showTeam).toBe(false);
    expect(features!.showAnalytics).toBe(false);
    expect(features!.showSupplyChain).toBe(false);
  });

  it('company sees team and analytics', () => {
    const features = ACCOUNT_TYPE_FEATURES.company;
    expect(features!.showTeam).toBe(true);
    expect(features!.showAnalytics).toBe(true);
  });

  it('supplier sees analytics and supply chain', () => {
    const features = ACCOUNT_TYPE_FEATURES.supplier;
    expect(features!.showAnalytics).toBe(true);
    expect(features!.showSupplyChain).toBe(true);
    expect(features!.showTeam).toBe(false);
  });
});
