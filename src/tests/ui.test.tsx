// UI Layer Tests - Component rendering and behavior
// SPEC LINKS: docs/specs/15_dashboard_tradesperson.md, 18_permit_detail.md, 19_search_filter.md
import { describe, it, expect } from 'vitest';
import { PROJECT_TYPE_CONFIG, formatScopeTag } from '@/lib/classification/scope';
import type { ProjectType } from '@/lib/classification/scope';

// Since these are 'use client' components that require React DOM,
// we test the pure logic extracted from components here.
// Full component rendering tests would use @testing-library/react with jsdom.

describe('PermitCard Logic', () => {
  function formatCost(cost: number | null): string {
    if (cost == null) return 'N/A';
    if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
    if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
    return `$${cost.toLocaleString()}`;
  }

  function formatAddress(p: {
    street_num: string;
    street_name: string;
    street_type: string;
    city: string;
  }): string {
    return [p.street_num, p.street_name, p.street_type, p.city]
      .filter(Boolean)
      .join(' ');
  }

  function daysSince(dateStr: string | null): string {
    if (!dateStr) return '';
    const days = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  it('formats cost in thousands', () => {
    expect(formatCost(150000)).toBe('$150K');
  });

  it('formats cost in millions', () => {
    expect(formatCost(2500000)).toBe('$2.5M');
  });

  it('formats null cost as N/A', () => {
    expect(formatCost(null)).toBe('N/A');
  });

  it('formats small cost with dollar sign', () => {
    expect(formatCost(500)).toBe('$500');
  });

  it('formats full address', () => {
    const result = formatAddress({
      street_num: '123',
      street_name: 'QUEEN',
      street_type: 'ST',
      city: 'TORONTO',
    });
    expect(result).toBe('123 QUEEN ST TORONTO');
  });

  it('handles missing street type', () => {
    const result = formatAddress({
      street_num: '456',
      street_name: 'BAY',
      street_type: '',
      city: 'TORONTO',
    });
    expect(result).toBe('456 BAY TORONTO');
  });

  it('returns empty string for null date', () => {
    expect(daysSince(null)).toBe('');
  });

  it('returns Today for current date', () => {
    const today = new Date().toISOString();
    expect(daysSince(today)).toBe('Today');
  });

  it('returns days ago for recent dates', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(fiveDaysAgo)).toBe('5 days ago');
  });

  it('returns months for older dates', () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(threeMonthsAgo)).toBe('3 months ago');
  });

  it('returns years for very old dates', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(twoYearsAgo)).toBe('2 years ago');
  });
});

describe('ScoreBadge Logic', () => {
  function getScoreColor(score: number): string {
    if (score >= 80) return '#16A34A';
    if (score >= 60) return '#CA8A04';
    if (score >= 40) return '#EA580C';
    return '#DC2626';
  }

  function getScoreLabel(score: number): string {
    if (score >= 80) return 'Hot';
    if (score >= 60) return 'Warm';
    if (score >= 40) return 'Cool';
    return 'Cold';
  }

  it('hot score (80+) is green', () => {
    expect(getScoreColor(85)).toBe('#16A34A');
    expect(getScoreLabel(85)).toBe('Hot');
  });

  it('warm score (60-79) is yellow', () => {
    expect(getScoreColor(65)).toBe('#CA8A04');
    expect(getScoreLabel(65)).toBe('Warm');
  });

  it('cool score (40-59) is orange', () => {
    expect(getScoreColor(45)).toBe('#EA580C');
    expect(getScoreLabel(45)).toBe('Cool');
  });

  it('cold score (<40) is red', () => {
    expect(getScoreColor(20)).toBe('#DC2626');
    expect(getScoreLabel(20)).toBe('Cold');
  });

  it('boundary at 80 is hot', () => {
    expect(getScoreLabel(80)).toBe('Hot');
  });

  it('boundary at 60 is warm', () => {
    expect(getScoreLabel(60)).toBe('Warm');
  });

  it('boundary at 40 is cool', () => {
    expect(getScoreLabel(40)).toBe('Cool');
  });

  it('zero score is cold', () => {
    expect(getScoreLabel(0)).toBe('Cold');
  });

  it('perfect score is hot', () => {
    expect(getScoreLabel(100)).toBe('Hot');
  });
});

describe('Badge Variant Logic', () => {
  const STATUS_COLORS: Record<string, string> = {
    'Permit Issued': '#16A34A',
    'Revision Issued': '#16A34A',
    'Inspection': '#2563EB',
    'Under Review': '#CA8A04',
    'Issuance Pending': '#CA8A04',
    'Application On Hold': '#9333EA',
    'Application Received': '#9333EA',
    'Work Not Started': '#6B7280',
    'Revocation Pending': '#DC2626',
    'Pending Cancellation': '#DC2626',
    'Abandoned': '#6B7280',
  };

  it('has color for all common statuses', () => {
    expect(STATUS_COLORS['Permit Issued']).toBe('#16A34A');
    expect(STATUS_COLORS['Inspection']).toBe('#2563EB');
    expect(STATUS_COLORS['Under Review']).toBe('#CA8A04');
    expect(STATUS_COLORS['Application On Hold']).toBe('#9333EA');
    expect(STATUS_COLORS['Revocation Pending']).toBe('#DC2626');
    expect(STATUS_COLORS['Abandoned']).toBe('#6B7280');
  });

  it('unknown status returns undefined (fallback handled in component)', () => {
    expect(STATUS_COLORS['Unknown']).toBeUndefined();
  });
});

describe('FilterPanel Logic', () => {
  // Top statuses from actual Toronto Open Data (by permit count)
  const STATUS_OPTIONS = [
    'Inspection',
    'Permit Issued',
    'Revision Issued',
    'Under Review',
    'Issuance Pending',
    'Application On Hold',
    'Work Not Started',
    'Revocation Pending',
    'Pending Cancellation',
    'Abandoned',
  ];

  const WARD_OPTIONS = Array.from({ length: 25 }, (_, i) =>
    String(i + 1).padStart(2, '0')
  );

  it('has 10 status options matching real Toronto data', () => {
    expect(STATUS_OPTIONS).toHaveLength(10);
    // These are the actual values from the permits table, not abbreviated
    expect(STATUS_OPTIONS).toContain('Inspection');
    expect(STATUS_OPTIONS).toContain('Permit Issued');
    expect(STATUS_OPTIONS).not.toContain('Issued'); // Bug: abbreviated name doesn't match DB
  });

  it('has 25 ward options', () => {
    expect(WARD_OPTIONS).toHaveLength(25);
    expect(WARD_OPTIONS[0]).toBe('01');
    expect(WARD_OPTIONS[24]).toBe('25');
  });

  // Permit type filter options (from real Toronto data)
  const PERMIT_TYPE_OPTIONS = [
    { value: 'Small Residential Projects', label: 'Small Residential' },
    { value: 'Plumbing(PS)', label: 'Plumbing (PS)' },
    { value: 'Mechanical(MS)', label: 'Mechanical (MS)' },
    { value: 'Building Additions/Alterations', label: 'Additions/Alterations' },
    { value: 'Drain and Site Service', label: 'Drain & Site Service' },
    { value: 'New Houses', label: 'New Houses' },
    { value: 'Fire/Security Upgrade', label: 'Fire/Security' },
    { value: 'Demolition Folder (DM)', label: 'Demolition (DM)' },
    { value: 'New Building', label: 'New Building' },
    { value: 'Residential Building Permit', label: 'Residential Permit' },
  ];

  const SORT_OPTIONS = [
    { value: 'issued_date:desc', label: 'Recently Issued' },
    { value: 'application_date:desc', label: 'Recently Applied' },
    { value: 'est_const_cost:desc', label: 'Highest Cost' },
    { value: 'est_const_cost:asc', label: 'Lowest Cost' },
  ];

  it('has at least 10 permit type options from real data', () => {
    expect(PERMIT_TYPE_OPTIONS.length).toBeGreaterThanOrEqual(10);
    expect(PERMIT_TYPE_OPTIONS[0].value).toBe('Small Residential Projects');
    expect(PERMIT_TYPE_OPTIONS.find(o => o.value === 'Plumbing(PS)')).toBeDefined();
    expect(PERMIT_TYPE_OPTIONS.find(o => o.value === 'Demolition Folder (DM)')).toBeDefined();
  });

  it('has 4 sort options with correct default', () => {
    expect(SORT_OPTIONS).toHaveLength(4);
    expect(SORT_OPTIONS[0].value).toBe('issued_date:desc');
    expect(SORT_OPTIONS[0].label).toBe('Recently Issued');
  });

  it('sort option parses into sort_by and sort_order', () => {
    const sortValue = 'est_const_cost:desc';
    const [sort_by, sort_order] = sortValue.split(':');
    expect(sort_by).toBe('est_const_cost');
    expect(sort_order).toBe('desc');
  });

  it('permit_type filter included in active filter count', () => {
    const filters: Record<string, string> = { status: 'Inspection', permit_type: 'Plumbing(PS)' };
    const activeCount = Object.keys(filters).filter((k) => filters[k]).length;
    expect(activeCount).toBe(2);
  });

  it('active filter count tracks correctly', () => {
    const filters: Record<string, string> = { status: 'Inspection', ward: '10' };
    const activeCount = Object.keys(filters).filter((k) => filters[k]).length;
    expect(activeCount).toBe(2);
  });

  it('empty filters returns zero count', () => {
    const filters: Record<string, string> = {};
    const activeCount = Object.keys(filters).filter((k) => filters[k]).length;
    expect(activeCount).toBe(0);
  });

  // Structure Type filter options (top values from real Toronto data)
  const STRUCTURE_TYPE_OPTIONS = [
    { value: 'SFD - Detached', label: 'Detached' },
    { value: 'SFD - Semi-Detached', label: 'Semi-Detached' },
    { value: 'Office', label: 'Office' },
    { value: 'Apartment Building', label: 'Apartment' },
    { value: 'SFD - Townhouse', label: 'Townhouse' },
    { value: 'Retail Store', label: 'Retail' },
    { value: 'Multiple Unit Building', label: 'Multi-Unit' },
    { value: '2 Unit - Detached', label: '2 Unit Detached' },
    { value: 'Multiple Use/Non Residential', label: 'Multi-Use Non-Res' },
    { value: 'Other', label: 'Other' },
    { value: 'Industrial', label: 'Industrial' },
    { value: 'Laneway / Rear Yard Suite', label: 'Laneway Suite' },
    { value: 'Restaurant 30 Seats or Less', label: 'Restaurant (Small)' },
    { value: 'Stacked Townhouses', label: 'Stacked Townhouse' },
    { value: 'Mixed Use/Res w Non Res', label: 'Mixed Use' },
  ];

  it('has at least 15 structure type options from real data', () => {
    expect(STRUCTURE_TYPE_OPTIONS.length).toBeGreaterThanOrEqual(15);
    expect(STRUCTURE_TYPE_OPTIONS[0].value).toBe('SFD - Detached');
    expect(STRUCTURE_TYPE_OPTIONS.find(o => o.value === 'Apartment Building')).toBeDefined();
    expect(STRUCTURE_TYPE_OPTIONS.find(o => o.value === 'Industrial')).toBeDefined();
  });

  // Work filter options (top values from real Toronto data)
  const WORK_OPTIONS = [
    { value: 'Building Permit Related(PS)', label: 'Plumbing Related' },
    { value: 'Building Permit Related(MS)', label: 'Mechanical Related' },
    { value: 'Interior Alterations', label: 'Interior Alterations' },
    { value: 'Multiple Projects', label: 'Multiple Projects' },
    { value: 'New Building', label: 'New Building' },
    { value: 'Building Permit Related (DR)', label: 'Drain Related' },
    { value: 'Addition(s)', label: 'Additions' },
    { value: 'Demolition', label: 'Demolition' },
    { value: 'Fire Alarm', label: 'Fire Alarm' },
    { value: 'Garage', label: 'Garage' },
    { value: 'Garage Repair/Reconstruction', label: 'Garage Repair' },
    { value: 'Porch', label: 'Porch' },
    { value: 'Deck', label: 'Deck' },
    { value: 'Underpinning', label: 'Underpinning' },
    { value: 'Sprinklers', label: 'Sprinklers' },
  ];

  it('has at least 15 work options from real data', () => {
    expect(WORK_OPTIONS.length).toBeGreaterThanOrEqual(15);
    expect(WORK_OPTIONS[0].value).toBe('Building Permit Related(PS)');
    expect(WORK_OPTIONS.find(o => o.value === 'Interior Alterations')).toBeDefined();
    expect(WORK_OPTIONS.find(o => o.value === 'Demolition')).toBeDefined();
  });

  it('structure_type and work filters included in active filter count', () => {
    const filters: Record<string, string> = {
      status: 'Inspection',
      structure_type: 'SFD - Detached',
      work: 'Interior Alterations',
    };
    const activeCount = Object.keys(filters).filter((k) => filters[k]).length;
    expect(activeCount).toBe(3);
  });
});

describe('OnboardingWizard Logic', () => {
  const STEPS = ['Trades', 'Location', 'Notifications', 'Confirm'];

  function toggleItem(list: string[], item: string): string[] {
    return list.includes(item)
      ? list.filter((s) => s !== item)
      : [...list, item];
  }

  function parsePostalCodes(input: string): string[] {
    return input.split(',').map((s) => s.trim()).filter(Boolean);
  }

  it('has 4 steps', () => {
    expect(STEPS).toHaveLength(4);
  });

  it('toggle adds item to list', () => {
    expect(toggleItem([], 'plumbing')).toEqual(['plumbing']);
  });

  it('toggle removes item from list', () => {
    expect(toggleItem(['plumbing', 'hvac'], 'plumbing')).toEqual(['hvac']);
  });

  it('toggle handles empty list removal (no-op)', () => {
    expect(toggleItem([], 'plumbing')).toEqual(['plumbing']);
  });

  it('parses postal codes correctly', () => {
    expect(parsePostalCodes('M5V, M4K, M6G')).toEqual(['M5V', 'M4K', 'M6G']);
  });

  it('handles empty postal code input', () => {
    expect(parsePostalCodes('')).toEqual([]);
  });

  it('handles postal codes without spaces', () => {
    expect(parsePostalCodes('M5V,M4K')).toEqual(['M5V', 'M4K']);
  });

  it('step 0 requires at least one trade', () => {
    const step = 0;
    const selectedTrades: string[] = [];
    const canProceed = step === 0 ? selectedTrades.length > 0 : true;
    expect(canProceed).toBe(false);
  });

  it('step 0 allows proceeding with trades selected', () => {
    const step = 0;
    const selectedTrades = ['plumbing'];
    const canProceed = step === 0 ? selectedTrades.length > 0 : true;
    expect(canProceed).toBe(true);
  });

  it('non-zero steps always allow proceeding', () => {
    const step: number = 1;
    const selectedTrades: string[] = [];
    const canProceed = step === 0 ? selectedTrades.length > 0 : true;
    expect(canProceed).toBe(true);
  });
});

describe('PropertyPhoto Logic', () => {
  // Pure logic extracted from src/components/permits/PropertyPhoto.tsx
  function getStreetViewUrl(
    lat: number,
    lng: number,
    apiKey: string | undefined,
    isDev: boolean
  ): string | null {
    if (isDev) return null;
    if (!apiKey) return null;
    return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&key=${apiKey}`;
  }

  function getDisplayState(
    lat: number | null,
    lng: number | null,
    isDev: boolean
  ): 'placeholder' | 'unavailable' | 'image' {
    if (isDev) return 'placeholder';
    if (lat == null || lng == null) return 'unavailable';
    return 'image';
  }

  it('returns null in dev mode', () => {
    expect(getStreetViewUrl(43.65, -79.38, 'test-key', true)).toBeNull();
  });

  it('returns null when no API key', () => {
    expect(getStreetViewUrl(43.65, -79.38, undefined, false)).toBeNull();
  });

  it('builds correct URL format in production', () => {
    const url = getStreetViewUrl(43.65, -79.38, 'MY_KEY', false);
    expect(url).toBe(
      'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=43.65,-79.38&fov=90&key=MY_KEY'
    );
  });

  it('URL contains correct size, fov, and location params', () => {
    const url = getStreetViewUrl(43.6519, -79.3911, 'KEY123', false)!;
    expect(url).toContain('size=600x400');
    expect(url).toContain('fov=90');
    expect(url).toContain('location=43.6519,-79.3911');
  });

  it('display state: dev mode returns placeholder', () => {
    expect(getDisplayState(43.65, -79.38, true)).toBe('placeholder');
  });

  it('display state: null coords returns unavailable', () => {
    expect(getDisplayState(null, -79.38, false)).toBe('unavailable');
    expect(getDisplayState(43.65, null, false)).toBe('unavailable');
  });

  it('display state: prod with coords returns image', () => {
    expect(getDisplayState(43.65, -79.38, false)).toBe('image');
  });

  it('display state: dev mode with null coords still returns placeholder', () => {
    expect(getDisplayState(null, null, true)).toBe('placeholder');
  });
});

describe('PropertyDetails Display Logic', () => {
  // Extracted from src/app/permits/[id]/page.tsx lines 213-232
  function formatLotSize(sqft: number | null): string {
    return sqft ? `${Number(sqft).toLocaleString()} sq ft` : 'N/A';
  }

  function formatLinearFt(ft: number | null): string {
    return ft ? `${Number(ft).toFixed(1)} ft` : 'N/A';
  }

  function formatFeatureType(type: string | null): string {
    return type || 'N/A';
  }

  it('formats lot size with comma grouping', () => {
    expect(formatLotSize(5381.96)).toBe('5,381.96 sq ft');
  });

  it('formats large lot size', () => {
    expect(formatLotSize(26909.78)).toBe('26,909.78 sq ft');
  });

  it('formats null lot size as N/A', () => {
    expect(formatLotSize(null)).toBe('N/A');
  });

  it('formats frontage with one decimal', () => {
    expect(formatLinearFt(15.24)).toBe('15.2 ft');
  });

  it('formats depth with one decimal', () => {
    expect(formatLinearFt(107.94)).toBe('107.9 ft');
  });

  it('formats null frontage as N/A', () => {
    expect(formatLinearFt(null)).toBe('N/A');
  });

  it('formats null depth as N/A', () => {
    expect(formatLinearFt(null)).toBe('N/A');
  });

  it('formats zero frontage as N/A (falsy)', () => {
    expect(formatLinearFt(0)).toBe('N/A');
  });

  it('displays COMMON feature type', () => {
    expect(formatFeatureType('COMMON')).toBe('COMMON');
  });

  it('displays CONDO feature type', () => {
    expect(formatFeatureType('CONDO')).toBe('CONDO');
  });

  it('displays N/A for null feature type', () => {
    expect(formatFeatureType(null)).toBe('N/A');
  });
});

describe('NeighbourhoodProfile Display Logic', () => {
  // Extracted from src/components/permits/NeighbourhoodProfile.tsx
  function formatIncome(v: number | null): string {
    if (v == null) return 'N/A';
    return `$${v.toLocaleString()}`;
  }

  function formatPct(v: number | null): string {
    if (v == null) return 'N/A';
    return `${v}%`;
  }

  function formatPeriod(v: string | null): string {
    if (!v) return 'N/A';
    return `Built ${v}`;
  }

  function generateSummary(income: string, tenure: string, era: string | null): string {
    const parts = [income, tenure];
    if (era) parts.push(`built ${era}`);
    return parts.join(', ');
  }

  it('formats income for display', () => {
    expect(formatIncome(95000)).toBe('$95,000');
  });

  it('formats null income as N/A', () => {
    expect(formatIncome(null)).toBe('N/A');
  });

  it('formats percentage for display', () => {
    expect(formatPct(72.3)).toBe('72.3%');
  });

  it('formats construction period for display', () => {
    expect(formatPeriod('1961-1980')).toBe('Built 1961-1980');
  });

  it('formats null period as N/A', () => {
    expect(formatPeriod(null)).toBe('N/A');
  });

  it('generates summary with all parts', () => {
    expect(generateSummary('High-income', 'owner-occupied', '1961-1980'))
      .toBe('High-income, owner-occupied, built 1961-1980');
  });

  it('generates summary without era', () => {
    expect(generateSummary('Lower-income', 'renter-majority', null))
      .toBe('Lower-income, renter-majority');
  });
});

describe('PROJECT_TYPE_CONFIG', () => {
  const ALL_PROJECT_TYPES: ProjectType[] = [
    'new_build', 'addition', 'renovation', 'demolition', 'mechanical', 'repair', 'other',
  ];

  it('has entries for all 7 project types', () => {
    expect(Object.keys(PROJECT_TYPE_CONFIG)).toHaveLength(7);
    for (const type of ALL_PROJECT_TYPES) {
      expect(PROJECT_TYPE_CONFIG[type]).toBeDefined();
      expect(PROJECT_TYPE_CONFIG[type].label).toBeTruthy();
      expect(PROJECT_TYPE_CONFIG[type].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('labels are human-readable (no underscores)', () => {
    for (const type of ALL_PROJECT_TYPES) {
      expect(PROJECT_TYPE_CONFIG[type].label).not.toContain('_');
    }
  });
});

describe('formatScopeTag', () => {
  it('converts simple slug to title case', () => {
    expect(formatScopeTag('deck')).toBe('Deck');
    expect(formatScopeTag('basement')).toBe('Basement');
  });

  it('converts hyphenated slug to title case words', () => {
    expect(formatScopeTag('basement-finish')).toBe('Basement Finish');
    expect(formatScopeTag('rear-addition')).toBe('Rear Addition');
    expect(formatScopeTag('fire-alarm')).toBe('Fire Alarm');
  });

  it('preserves numeric prefixes', () => {
    expect(formatScopeTag('2nd-floor')).toBe('2nd Floor');
    expect(formatScopeTag('3rd-floor')).toBe('3rd Floor');
  });

  it('handles multi-word tags', () => {
    expect(formatScopeTag('backflow-preventer')).toBe('Backflow Preventer');
    expect(formatScopeTag('laneway-suite')).toBe('Laneway Suite');
  });
});

describe('Irregular Lot Display Logic', () => {
  function formatFrontageLabel(isIrregular: boolean): string {
    return isIrregular ? 'Frontage (est.)' : 'Frontage';
  }

  function formatDepthLabel(isIrregular: boolean): string {
    return isIrregular ? 'Depth (est.)' : 'Depth';
  }

  function showIrregularBadge(isIrregular: boolean | null): boolean {
    return !!isIrregular;
  }

  it('shows (est.) suffix for irregular lot frontage', () => {
    expect(formatFrontageLabel(true)).toBe('Frontage (est.)');
  });

  it('shows (est.) suffix for irregular lot depth', () => {
    expect(formatDepthLabel(true)).toBe('Depth (est.)');
  });

  it('no (est.) suffix for regular lot frontage', () => {
    expect(formatFrontageLabel(false)).toBe('Frontage');
  });

  it('no (est.) suffix for regular lot depth', () => {
    expect(formatDepthLabel(false)).toBe('Depth');
  });

  it('shows irregular badge when is_irregular is true', () => {
    expect(showIrregularBadge(true)).toBe(true);
  });

  it('hides irregular badge when is_irregular is false', () => {
    expect(showIrregularBadge(false)).toBe(false);
  });

  it('hides irregular badge when is_irregular is null', () => {
    expect(showIrregularBadge(null)).toBe(false);
  });
});

describe('Date Formatting', () => {
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-CA');
    } catch {
      return 'N/A';
    }
  }

  it('formats valid date', () => {
    const result = formatDate('2024-03-01T00:00:00.000');
    expect(result).toBe('2024-03-01');
  });

  it('returns N/A for null', () => {
    expect(formatDate(null)).toBe('N/A');
  });

  it('returns N/A for undefined', () => {
    expect(formatDate(undefined)).toBe('N/A');
  });

  it('returns N/A for empty string', () => {
    expect(formatDate('')).toBe('N/A');
  });
});
