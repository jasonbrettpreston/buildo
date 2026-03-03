// 🔗 SPEC LINK: docs/specs/26_admin.md
// Admin panel logic: sync run display, status formatting, duration
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface SyncRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  records_total: number;
  records_new: number;
  records_updated: number;
  records_unchanged: number;
  records_errors: number;
  error_message: string | null;
  duration_ms: number | null;
}

describe('Sync Run Status Formatting', () => {
  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  }

  it('completed status is green', () => {
    expect(getStatusColor('completed')).toBe('bg-green-100 text-green-800');
  });

  it('failed status is red', () => {
    expect(getStatusColor('failed')).toBe('bg-red-100 text-red-800');
  });

  it('running status is yellow', () => {
    expect(getStatusColor('running')).toBe('bg-yellow-100 text-yellow-800');
  });

  it('unknown status defaults to yellow', () => {
    expect(getStatusColor('unknown')).toBe('bg-yellow-100 text-yellow-800');
  });
});

describe('Duration Formatting', () => {
  function formatDuration(ms: number | null): string {
    if (ms == null) return 'N/A';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  it('formats milliseconds to seconds', () => {
    expect(formatDuration(5000)).toBe('5.0s');
  });

  it('formats fractional seconds', () => {
    expect(formatDuration(12345)).toBe('12.3s');
  });

  it('formats null as N/A', () => {
    expect(formatDuration(null)).toBe('N/A');
  });

  it('formats zero duration', () => {
    expect(formatDuration(0)).toBe('0.0s');
  });

  it('formats long durations', () => {
    expect(formatDuration(120000)).toBe('120.0s');
  });
});

describe('Sync Run Record Counts', () => {
  function formatCount(value: number | null | undefined): string {
    if (value == null) return '0';
    return value.toLocaleString();
  }

  it('formats thousands with comma', () => {
    expect(formatCount(237000)).toBe('237,000');
  });

  it('formats null as 0', () => {
    expect(formatCount(null)).toBe('0');
  });

  it('formats undefined as 0', () => {
    expect(formatCount(undefined)).toBe('0');
  });

  it('formats small numbers without comma', () => {
    expect(formatCount(42)).toBe('42');
  });
});

describe('Latest Sync Stats Display', () => {
  const syncRuns: SyncRun[] = [
    {
      id: 3,
      started_at: '2024-03-01T06:00:00Z',
      completed_at: '2024-03-01T06:05:00Z',
      status: 'completed',
      records_total: 237000,
      records_new: 1200,
      records_updated: 5600,
      records_unchanged: 230000,
      records_errors: 200,
      error_message: null,
      duration_ms: 300000,
    },
    {
      id: 2,
      started_at: '2024-02-28T06:00:00Z',
      completed_at: '2024-02-28T06:04:00Z',
      status: 'completed',
      records_total: 236800,
      records_new: 800,
      records_updated: 4200,
      records_unchanged: 231600,
      records_errors: 200,
      error_message: null,
      duration_ms: 240000,
    },
  ];

  it('latest sync is the first in the array', () => {
    const latest = syncRuns[0];
    expect(latest.id).toBe(3);
    expect(latest.status).toBe('completed');
  });

  it('calculates total processed correctly', () => {
    const latest = syncRuns[0];
    const totalProcessed =
      latest.records_new +
      latest.records_updated +
      latest.records_unchanged +
      latest.records_errors;
    expect(totalProcessed).toBe(237000);
  });

  it('shows error message when present', () => {
    const failedRun: SyncRun = {
      ...syncRuns[0],
      status: 'failed',
      error_message: 'Connection timeout after 30s',
    };
    expect(failedRun.error_message).toBeTruthy();
    expect(failedRun.error_message).toContain('timeout');
  });

  it('handles empty sync runs list', () => {
    const empty: SyncRun[] = [];
    const latest = empty[0];
    expect(latest).toBeUndefined();
  });
});

describe('Data Coverage Stats', () => {
  interface AdminStats {
    total_permits: number;
    active_permits: number;
    total_builders: number;
    permits_with_builder: number;
    permits_with_parcel: number;
    permits_with_neighbourhood: number;
  }

  const COVERAGE_LABELS = [
    'Active Permits',
    'With Builder Info',
    'With Property Data',
    'With Neighbourhood',
  ];

  it('defines 4 coverage stat cards', () => {
    expect(COVERAGE_LABELS).toHaveLength(4);
  });

  it('formats coverage counts with locale separators', () => {
    const stats: AdminStats = {
      total_permits: 237000,
      active_permits: 219000,
      total_builders: 3587,
      permits_with_builder: 11845,
      permits_with_parcel: 109123,
      permits_with_neighbourhood: 109116,
    };
    expect(stats.active_permits.toLocaleString()).toBe('219,000');
    expect(stats.permits_with_builder.toLocaleString()).toBe('11,845');
    expect(stats.permits_with_parcel.toLocaleString()).toBe('109,123');
    expect(stats.permits_with_neighbourhood.toLocaleString()).toBe('109,116');
  });

  it('handles zero counts gracefully', () => {
    const stats: AdminStats = {
      total_permits: 0,
      active_permits: 0,
      total_builders: 0,
      permits_with_builder: 0,
      permits_with_parcel: 0,
      permits_with_neighbourhood: 0,
    };
    expect(stats.active_permits.toLocaleString()).toBe('0');
  });

  it('coverage counts never exceed total permits', () => {
    const stats: AdminStats = {
      total_permits: 237000,
      active_permits: 219000,
      total_builders: 3587,
      permits_with_builder: 11845,
      permits_with_parcel: 109123,
      permits_with_neighbourhood: 109116,
    };
    expect(stats.permits_with_builder).toBeLessThanOrEqual(stats.total_permits);
    expect(stats.permits_with_parcel).toBeLessThanOrEqual(stats.total_permits);
    expect(stats.permits_with_neighbourhood).toBeLessThanOrEqual(stats.total_permits);
    expect(stats.active_permits).toBeLessThanOrEqual(stats.total_permits);
  });
});

describe('Active Permit Status Filter', () => {
  const ACTIVE_STATUSES = ['Permit Issued', 'Revision Issued', 'Under Review', 'Inspection'];

  it('includes 4 active status values', () => {
    expect(ACTIVE_STATUSES).toHaveLength(4);
  });

  it('uses exact Toronto Open Data status strings', () => {
    expect(ACTIVE_STATUSES).toContain('Permit Issued');
    expect(ACTIVE_STATUSES).toContain('Inspection');
    expect(ACTIVE_STATUSES).not.toContain('Issued');
    expect(ACTIVE_STATUSES).not.toContain('Under Inspection');
  });

  it('classifies known statuses correctly', () => {
    const isActive = (s: string) => ACTIVE_STATUSES.includes(s);
    expect(isActive('Permit Issued')).toBe(true);
    expect(isActive('Inspection')).toBe(true);
    expect(isActive('Revision Issued')).toBe(true);
    expect(isActive('Under Review')).toBe(true);
    expect(isActive('Abandoned')).toBe(false);
    expect(isActive('Pending Cancellation')).toBe(false);
    expect(isActive('Revocation Pending')).toBe(false);
  });
});

describe('Admin Navigation Links', () => {
  const ADMIN_LINKS = [
    { href: '/admin/data-quality', label: 'Data Quality' },
    { href: '/dashboard', label: 'Dashboard' },
  ];

  it('includes data quality sub-page link', () => {
    const dqLink = ADMIN_LINKS.find((l) => l.href === '/admin/data-quality');
    expect(dqLink).toBeDefined();
    expect(dqLink!.label).toBe('Data Quality');
  });

  it('includes back-to-dashboard link', () => {
    const dashLink = ADMIN_LINKS.find((l) => l.href === '/dashboard');
    expect(dashLink).toBeDefined();
  });
});

describe('Sync History Table Columns', () => {
  const TABLE_HEADERS = [
    'ID',
    'Started',
    'Status',
    'Total',
    'New',
    'Updated',
    'Unchanged',
    'Errors',
    'Duration',
  ];

  it('has 9 columns', () => {
    expect(TABLE_HEADERS).toHaveLength(9);
  });

  it('first column is ID', () => {
    expect(TABLE_HEADERS[0]).toBe('ID');
  });

  it('last column is Duration', () => {
    expect(TABLE_HEADERS[TABLE_HEADERS.length - 1]).toBe('Duration');
  });

  it('includes all record type columns', () => {
    expect(TABLE_HEADERS).toContain('New');
    expect(TABLE_HEADERS).toContain('Updated');
    expect(TABLE_HEADERS).toContain('Unchanged');
    expect(TABLE_HEADERS).toContain('Errors');
  });
});

// ---------------------------------------------------------------------------
// Data Sources & Health Dashboard Tests
// ---------------------------------------------------------------------------

describe('Pipeline Health Status Logic', () => {
  type HealthStatus = 'green' | 'yellow' | 'red';

  function getPermitsPipelineHealth(
    totalPermits: number,
    lastSyncAt: string | null,
    now: Date = new Date()
  ): HealthStatus {
    if (totalPermits === 0 || !lastSyncAt) return 'red';
    const hoursSinceSync = (now.getTime() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync <= 36) return 'green';
    if (hoursSinceSync <= 72) return 'yellow';
    return 'red';
  }

  function getCoaPipelineHealth(
    coaTotal: number,
    lastSyncAt: string | null,
    now: Date = new Date()
  ): HealthStatus {
    if (coaTotal === 0 || !lastSyncAt) return 'red';
    const hoursSinceSync = (now.getTime() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync <= 36) return 'green';
    if (hoursSinceSync <= 72) return 'yellow';
    return 'red';
  }

  function getBuilderPipelineHealth(totalBuilders: number): HealthStatus {
    return totalBuilders > 0 ? 'green' : 'red';
  }

  function getAddressPointsHealth(count: number): HealthStatus {
    if (count >= 500000) return 'green';
    if (count > 0) return 'yellow';
    return 'red';
  }

  function getStaticPipelineHealth(count: number): HealthStatus {
    return count > 0 ? 'green' : 'red';
  }

  function getNeighbourhoodHealth(count: number): HealthStatus {
    if (count >= 158) return 'green';
    if (count > 0) return 'yellow';
    return 'red';
  }

  const now = new Date('2026-02-28T12:00:00Z');

  // Permits pipeline
  it('permits: green when sync < 36h ago', () => {
    expect(getPermitsPipelineHealth(237000, '2026-02-28T06:00:00Z', now)).toBe('green');
  });

  it('permits: yellow when sync 36-72h ago', () => {
    expect(getPermitsPipelineHealth(237000, '2026-02-26T12:00:00Z', now)).toBe('yellow');
  });

  it('permits: red when sync > 72h ago', () => {
    expect(getPermitsPipelineHealth(237000, '2026-02-24T00:00:00Z', now)).toBe('red');
  });

  it('permits: red when no sync at all', () => {
    expect(getPermitsPipelineHealth(0, null, now)).toBe('red');
  });

  // CoA pipeline
  it('coa: green when records exist and sync recent', () => {
    expect(getCoaPipelineHealth(32625, '2026-02-28T06:00:00Z', now)).toBe('green');
  });

  it('coa: red when 0 records', () => {
    expect(getCoaPipelineHealth(0, '2026-02-28T06:00:00Z', now)).toBe('red');
  });

  // Builders
  it('builders: green when > 0', () => {
    expect(getBuilderPipelineHealth(3587)).toBe('green');
  });

  it('builders: red when 0', () => {
    expect(getBuilderPipelineHealth(0)).toBe('red');
  });

  // Address points
  it('address points: green when >= 500k', () => {
    expect(getAddressPointsHealth(530000)).toBe('green');
  });

  it('address points: yellow when > 0 but < 500k', () => {
    expect(getAddressPointsHealth(100000)).toBe('yellow');
  });

  it('address points: red when 0', () => {
    expect(getAddressPointsHealth(0)).toBe('red');
  });

  // Static pipelines (parcels, massing)
  it('parcels: green when > 0', () => {
    expect(getStaticPipelineHealth(450000)).toBe('green');
  });

  it('parcels: red when 0', () => {
    expect(getStaticPipelineHealth(0)).toBe('red');
  });

  // Neighbourhoods
  it('neighbourhoods: green when >= 158', () => {
    expect(getNeighbourhoodHealth(158)).toBe('green');
  });

  it('neighbourhoods: yellow when partial', () => {
    expect(getNeighbourhoodHealth(100)).toBe('yellow');
  });

  it('neighbourhoods: red when 0', () => {
    expect(getNeighbourhoodHealth(0)).toBe('red');
  });
});

describe('Progress Bar Percentage Calculation', () => {
  function calcPercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  function getProgressColor(pct: number): string {
    if (pct >= 90) return 'bg-green-500';
    if (pct >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  it('calculates normal percentage', () => {
    expect(calcPercentage(96, 100)).toBe(96);
  });

  it('handles 0/0 as 0%', () => {
    expect(calcPercentage(0, 0)).toBe(0);
  });

  it('handles 100%', () => {
    expect(calcPercentage(237000, 237000)).toBe(100);
  });

  it('rounds to one decimal', () => {
    expect(calcPercentage(2, 3)).toBe(66.7);
  });

  it('green for >= 90%', () => {
    expect(getProgressColor(95)).toBe('bg-green-500');
    expect(getProgressColor(90)).toBe('bg-green-500');
  });

  it('yellow for 70-89%', () => {
    expect(getProgressColor(85)).toBe('bg-yellow-500');
    expect(getProgressColor(70)).toBe('bg-yellow-500');
  });

  it('red for < 70%', () => {
    expect(getProgressColor(69)).toBe('bg-red-500');
    expect(getProgressColor(0)).toBe('bg-red-500');
  });
});

describe('Health Dashboard Pipeline Definitions', () => {
  const PIPELINE_NAMES = [
    'Building Permits',
    'Committee of Adjustment',
    'Builder Profiles',
    'Address Points',
    'Property Parcels',
    '3D Massing',
    'Neighbourhoods',
  ];

  it('defines exactly 7 pipelines', () => {
    expect(PIPELINE_NAMES).toHaveLength(7);
  });

  it('includes all data sources', () => {
    expect(PIPELINE_NAMES).toContain('Building Permits');
    expect(PIPELINE_NAMES).toContain('Committee of Adjustment');
    expect(PIPELINE_NAMES).toContain('Builder Profiles');
    expect(PIPELINE_NAMES).toContain('Address Points');
    expect(PIPELINE_NAMES).toContain('Property Parcels');
    expect(PIPELINE_NAMES).toContain('3D Massing');
    expect(PIPELINE_NAMES).toContain('Neighbourhoods');
  });
});

describe('Data Quality Progress Metrics', () => {
  const QUALITY_METRICS = [
    'Geocoding Health',
    'Builder Identification',
    'Builder Contact Enrichment',
    'Trade Classification',
  ];

  it('defines exactly 4 quality metrics', () => {
    expect(QUALITY_METRICS).toHaveLength(4);
  });

  it('includes all enrichment metrics', () => {
    expect(QUALITY_METRICS).toContain('Geocoding Health');
    expect(QUALITY_METRICS).toContain('Builder Identification');
    expect(QUALITY_METRICS).toContain('Builder Contact Enrichment');
    expect(QUALITY_METRICS).toContain('Trade Classification');
  });
});

describe('CoA Summary Card Link Rate', () => {
  function calcLinkRate(coaLinked: number, coaApproved: number): number {
    if (coaApproved === 0) return 0;
    return Math.round((coaLinked / coaApproved) * 1000) / 10;
  }

  it('calculates link rate correctly', () => {
    expect(calcLinkRate(14614, 18700)).toBeCloseTo(78.1, 0);
  });

  it('handles 0 approved', () => {
    expect(calcLinkRate(0, 0)).toBe(0);
  });

  it('handles 100% linked', () => {
    expect(calcLinkRate(500, 500)).toBe(100);
  });
});

describe('Builder Enrichment Rate', () => {
  function calcEnrichmentRate(withContact: number, totalBuilders: number): number {
    if (totalBuilders === 0) return 0;
    return Math.round((withContact / totalBuilders) * 1000) / 10;
  }

  it('calculates enrichment rate', () => {
    expect(calcEnrichmentRate(1500, 3587)).toBeCloseTo(41.8, 0);
  });

  it('handles 0 builders', () => {
    expect(calcEnrichmentRate(0, 0)).toBe(0);
  });
});

describe('Expanded AdminStats Interface Validation', () => {

  it('admin stats API returns all new health dashboard fields', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    const newFields = [
      'permits_geocoded',
      'permits_classified',
      'builders_with_contact',
      'address_points_total',
      'parcels_total',
      'building_footprints_total',
      'parcels_with_massing',
      'neighbourhoods_total',
      'coa_approved',
    ];
    for (const field of newFields) {
      expect(source).toContain(field);
    }
  });
});

describe('Admin Page Section Structure', () => {

  it('admin page renders Data Health Overview section', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Data Health Overview|Data Sources/i);
  });

  it('admin page renders Active Sync Operations section', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Active Sync|Sync Operations/i);
  });

  it('admin page renders Data Quality section with progress bars', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Data Quality|Linking Metrics/i);
  });

  it('admin page includes HealthCard component', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/HealthCard/);
  });

  it('admin page includes ProgressMetric component', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/ProgressMetric/);
  });

  it('admin page references all 7 pipeline names', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('Building Permits');
    expect(source).toContain('Committee of Adjustment');
    expect(source).toContain('Builder Profiles');
    expect(source).toContain('Address Points');
    expect(source).toContain('Property Parcels');
    expect(source).toContain('3D Massing');
    expect(source).toContain('Neighbourhoods');
  });
});

// ---------------------------------------------------------------------------
// Freshness, Schedule, Hierarchy & Update Trigger Tests
// ---------------------------------------------------------------------------

describe('Pipeline Schedule Constants', () => {
  const PIPELINE_SCHEDULES: Record<string, string> = {
    permits: 'Daily',
    coa: 'Daily',
    builders: 'Daily',
    address_points: 'Quarterly',
    parcels: 'Quarterly',
    massing: 'Quarterly',
    neighbourhoods: 'Annual',
  };

  it('defines schedules for all 7 pipelines', () => {
    expect(Object.keys(PIPELINE_SCHEDULES)).toHaveLength(7);
  });

  it('permits, coa, builders are Daily', () => {
    expect(PIPELINE_SCHEDULES.permits).toBe('Daily');
    expect(PIPELINE_SCHEDULES.coa).toBe('Daily');
    expect(PIPELINE_SCHEDULES.builders).toBe('Daily');
  });

  it('address_points, parcels, massing are Quarterly', () => {
    expect(PIPELINE_SCHEDULES.address_points).toBe('Quarterly');
    expect(PIPELINE_SCHEDULES.parcels).toBe('Quarterly');
    expect(PIPELINE_SCHEDULES.massing).toBe('Quarterly');
  });

  it('neighbourhoods is Annual', () => {
    expect(PIPELINE_SCHEDULES.neighbourhoods).toBe('Annual');
  });
});

describe('Relative Time Formatting', () => {
  function formatRelativeTime(dateStr: string | null, now: Date = new Date()): string {
    if (!dateStr) return 'Never';
    const ms = now.getTime() - new Date(dateStr).getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  const now = new Date('2026-02-28T12:00:00Z');

  it('null returns Never', () => {
    expect(formatRelativeTime(null, now)).toBe('Never');
  });

  it('recent returns Just now', () => {
    expect(formatRelativeTime('2026-02-28T11:45:00Z', now)).toBe('Just now');
  });

  it('hours ago', () => {
    expect(formatRelativeTime('2026-02-28T06:00:00Z', now)).toBe('6h ago');
  });

  it('1 day ago', () => {
    expect(formatRelativeTime('2026-02-27T12:00:00Z', now)).toBe('1 day ago');
  });

  it('multiple days', () => {
    expect(formatRelativeTime('2026-02-20T12:00:00Z', now)).toBe('8 days ago');
  });

  it('months ago', () => {
    expect(formatRelativeTime('2025-12-01T00:00:00Z', now)).toBe('2mo ago');
  });
});

describe('Admin Page Hierarchy & Freshness Features', () => {

  it('admin page shows permits as primary/hero card', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Primary.*Source|primary.*database/i);
  });

  it('admin page shows builder profiles as derived from permits', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Extracted from|Derived from/i);
  });

  it('admin page has Update Now buttons', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Update Now/);
  });

  it('admin page imports schedule labels from helpers', () => {
    const page = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(page).toContain('PIPELINE_SCHEDULES');
    const helpers = fs.readFileSync(
      path.join(__dirname, '../lib/admin/helpers.ts'),
      'utf-8'
    );
    expect(helpers).toContain('Daily');
    expect(helpers).toContain('Quarterly');
    expect(helpers).toContain('Annual');
  });

  it('admin page has PIPELINE_SCHEDULES constant', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('PIPELINE_SCHEDULES');
  });

  it('admin page renders last updated info', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Last updated|lastRunAt|last_run_at|formatRelativeTime/);
  });

  it('HealthCard accepts schedule and onUpdate props', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/schedule.*string/);
    expect(source).toMatch(/onUpdate/);
  });
});

describe('Admin Stats Pipeline Freshness', () => {

  it('admin stats API returns pipeline_last_run data', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toContain('pipeline_last_run');
  });

  it('admin stats API queries pipeline_runs table', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toContain('pipeline_runs');
  });
});

describe('Pipeline Trigger Endpoint', () => {

  it('pipeline trigger route exists', () => {
    const routePath = path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it('pipeline trigger route exports POST handler', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/export.*async.*function.*POST/);
  });

  it('pipeline trigger validates slug against allowlist', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/ALLOWED_PIPELINES|PIPELINE_SCRIPTS/);
  });
});

// ---------------------------------------------------------------------------
// Bug Fix Tests: Update Buttons, Schedule Dates, Stat Cards, Permits Linked
// ---------------------------------------------------------------------------

describe('Bug A: Update Now Button Persistent State', () => {

  it('admin page tracks running pipelines as a Set (not single string)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // Should use Set<string> for concurrent pipeline tracking
    expect(source).toMatch(/runningPipelines/);
    expect(source).toMatch(/Set<string>/);
  });

  it('admin page polls stats while a pipeline is running', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // Should have polling logic (setInterval or setTimeout loop)
    expect(source).toMatch(/setInterval|setTimeout.*fetchData|pollInterval/);
  });

  it('HealthCard shows running state from runningPipelines or pipeline_last_run status', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // The running prop should come from the runningPipelines set
    expect(source).toMatch(/runningPipelines\.has/);
  });
});

describe('Bug B: Next Scheduled Date Computation', () => {
  const PIPELINE_SCHEDULES: Record<string, { label: string; intervalDays: number; scheduleNote: string }> = {
    permits: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 2:00 AM EST' },
    coa: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 3:00 AM EST' },
    builders: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 4:00 AM EST (after permits)' },
    address_points: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
    parcels: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
    massing: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
    neighbourhoods: { label: 'Annual', intervalDays: 365, scheduleNote: 'Annual (January)' },
  };

  function getNextScheduledDate(slug: string, now: Date = new Date()): string {
    const schedule = PIPELINE_SCHEDULES[slug];
    if (!schedule) return 'Unknown';
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (schedule.label === 'Daily') {
      const estHours: Record<string, number> = { permits: 7, coa: 8, builders: 9 };
      const hour = estHours[slug] ?? 7;
      const next = new Date(now);
      next.setUTCHours(hour, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      return fmt(next);
    }
    if (schedule.label === 'Quarterly') {
      const quarterMonths = [0, 3, 6, 9];
      const year = now.getFullYear();
      for (const month of quarterMonths) {
        const d = new Date(year, month, 1);
        if (d > now) return fmt(d);
      }
      return fmt(new Date(year + 1, 0, 1));
    }
    if (schedule.label === 'Annual') {
      const thisYear = new Date(now.getFullYear(), 0, 1);
      if (thisYear > now) return fmt(thisYear);
      return fmt(new Date(now.getFullYear() + 1, 0, 1));
    }
    return 'Unknown';
  }

  const now = new Date('2026-02-28T12:00:00Z');

  it('daily pipeline returns next day date', () => {
    const result = getNextScheduledDate('permits', now);
    // Feb 28 at 12:00 UTC, permits run at 7:00 UTC → already passed today → Mar 1
    expect(result).toBe('Mar 1, 2026');
  });

  it('quarterly pipeline returns next quarter start', () => {
    const result = getNextScheduledDate('parcels', now);
    // Feb 28 → next quarter is Apr 1
    expect(result).toBe('Apr 1, 2026');
  });

  it('annual pipeline returns next January', () => {
    const result = getNextScheduledDate('neighbourhoods', now);
    // Feb 28, 2026 → Jan 1 2026 is past → next is Jan 1 2027
    expect(result).toBe('Jan 1, 2027');
  });

  it('never returns Not scheduled for known slugs', () => {
    for (const slug of Object.keys(PIPELINE_SCHEDULES)) {
      const result = getNextScheduledDate(slug, now);
      expect(result).not.toBe('Not scheduled');
    }
  });

  it('returns a real date even without any last run data', () => {
    // This is the key fix — schedules are fixed, not dependent on lastRunAt
    const result = getNextScheduledDate('massing', now);
    expect(result).toBe('Apr 1, 2026');
  });

  it('admin page uses getNextScheduledDate', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('getNextScheduledDate');
  });

  it('admin page shows next date info on cards', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Next:/);
  });
});

describe('Bug C: Stat Cards Removed from Sync Operations', () => {

  it('admin page does NOT contain StatCard component', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // StatCard was the 5-box summary (Last Sync, Total, New, Updated, Duration)
    expect(source).not.toMatch(/function StatCard/);
    expect(source).not.toMatch(/<StatCard/);
  });
});

describe('Bug D: Enrichment Sources Show Permits Linked', () => {

  it('admin stats API returns permits_with_massing field', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toContain('permits_with_massing');
  });

  it('permits_with_massing query joins permit_parcels to parcel_buildings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/permit_parcels[\s\S]*parcel_buildings|parcel_buildings[\s\S]*permit_parcels/);
  });

  it('all 4 enrichment source cards show permits linked text', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // Each enrichment card should reference "permits linked" in its detail
    expect(source).toMatch(/permits_geocoded[\s\S]*permits linked|permits linked[\s\S]*permits_geocoded/i);
    expect(source).toMatch(/permits_with_parcel[\s\S]*permits linked|permits linked[\s\S]*permits_with_parcel/i);
    expect(source).toMatch(/permits_with_massing[\s\S]*permits linked|permits linked[\s\S]*permits_with_massing/i);
    expect(source).toMatch(/permits_with_neighbourhood[\s\S]*permits linked|permits linked[\s\S]*permits_with_neighbourhood/i);
  });

  it('AdminStats interface includes permits_with_massing', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('permits_with_massing');
  });
});

// ---------------------------------------------------------------------------
// Fix Round 2: Massing Pipeline, Schedule Notes, Permit Link Percentages
// ---------------------------------------------------------------------------

describe('Fix A2: Cross-platform ZIP extraction in load-massing.js', () => {

  it('load-massing.js does not use unzip without platform guard', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    // Must have a platform check (win32) guarding the unzip call
    expect(source).toMatch(/platform\(\)\s*===\s*['"]win32['"]/);
    // The unzip call should only appear in an else branch, not standalone
    expect(source).toMatch(/else\s*\{[\s\S]*?unzip/);
  });

  it('load-massing.js handles Windows extraction', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    // Should have Windows-compatible extraction (Expand-Archive or platform check)
    expect(source).toMatch(/win32|Expand-Archive|platform/);
  });
});

describe('Fix A2: Pipeline route captures stderr and validates script', () => {

  it('pipeline route captures stderr from child process', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    // Should use stderr from execFile callback or pipe stderr
    expect(source).toMatch(/stderr/);
  });

  it('pipeline route validates script exists before spawn', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/existsSync|access/);
  });

  it('pipeline route spawns script even if pipeline_runs table is missing', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    // The INSERT into pipeline_runs should be in its own try/catch
    // so that script spawning proceeds even if the table doesn't exist
    expect(source).toMatch(/try\s*\{[\s\S]*?INSERT INTO pipeline_runs[\s\S]*?\}\s*catch/);
    // Script execution (execFile) should be outside that try/catch
    expect(source).toMatch(/runId.*null/);
  });
});

describe('Fix: Massing pipeline chains link-massing after load', () => {

  it('load-massing.js invokes link-massing.js after loading footprints', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    // Must call link-massing.js (via execSync, require, or spawn)
    expect(source).toMatch(/link-massing/);
  });

  it('link-massing.js is called with execSync or child_process', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    // Should use execSync to run link-massing synchronously after load
    expect(source).toMatch(/execSync.*link-massing|exec.*link-massing|spawn.*link-massing/);
  });
});

describe('Fix B2: Schedule notes on data source cards', () => {

  it('PIPELINE_SCHEDULES includes scheduleNote field', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('scheduleNote');
  });

  it('schedule notes include specific times or periods', () => {
    const helpers = fs.readFileSync(
      path.join(__dirname, '../lib/admin/helpers.ts'),
      'utf-8'
    );
    // Should have time-specific schedule notes like "2:00 AM" or "Jan, Apr"
    expect(helpers).toMatch(/AM|PM|Jan.*Apr|January/);
  });
});

describe('Fix C2: Permit link percentages on enrichment cards', () => {

  function calcPct(num: number, denom: number): number {
    if (denom === 0) return 0;
    return Math.round((num / denom) * 1000) / 10;
  }

  it('calculates geocoding link rate', () => {
    expect(calcPct(235000, 237000)).toBeCloseTo(99.2, 0);
  });

  it('calculates parcel link rate', () => {
    expect(calcPct(109123, 237000)).toBeCloseTo(46.0, 0);
  });

  it('calculates massing link rate', () => {
    expect(calcPct(85000, 237000)).toBeCloseTo(35.9, 0);
  });

  it('calculates neighbourhood link rate', () => {
    expect(calcPct(109116, 237000)).toBeCloseTo(46.0, 0);
  });

  it('enrichment cards show percentage in detail text', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    // Each enrichment card detail should include calcPct or percentage display
    // Pattern: "X permits linked (Y%)"
    expect(source).toMatch(/permits linked.*%|%.*permits linked/);
  });
});
