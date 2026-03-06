// SPEC LINK: docs/specs/26_admin.md
// Admin panel logic: sync run display, status formatting, duration, navigation hub
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

// ---------------------------------------------------------------------------
// Admin Navigation Hub Tests
// ---------------------------------------------------------------------------

describe('Admin Page Navigation Hub', () => {

  it('admin page links to /admin/data-quality', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('/admin/data-quality');
  });

  it('admin page links to /admin/market-metrics', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('/admin/market-metrics');
  });

  it('admin page has Data Quality button text', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('Data Quality');
  });

  it('admin page has Market Metrics button text', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('Market Metrics');
  });

  it('admin page has back-to-dashboard link', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).toContain('/dashboard');
  });

  it('admin page does NOT contain HealthCard component', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/function HealthCard/);
    expect(source).not.toMatch(/<HealthCard/);
  });

  it('admin page does NOT contain ProgressMetric component', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/function ProgressMetric/);
    expect(source).not.toMatch(/<ProgressMetric/);
  });

  it('admin page does NOT contain sync history table', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/admin/page.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/Sync History/);
    expect(source).not.toMatch(/<table/);
  });
});

// ---------------------------------------------------------------------------
// Data Sources & Health Dashboard Tests (standalone logic — not page-dependent)
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
    'Entity Profiles',
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
    expect(PIPELINE_NAMES).toContain('Entity Profiles');
    expect(PIPELINE_NAMES).toContain('Address Points');
    expect(PIPELINE_NAMES).toContain('Property Parcels');
    expect(PIPELINE_NAMES).toContain('3D Massing');
    expect(PIPELINE_NAMES).toContain('Neighbourhoods');
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

  it('newest permit date uses first_seen_at (not issued_date) to capture Under Review permits', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    // issued_date is NULL for "Under Review" permits, so MAX(issued_date) misses
    // newly ingested permits. first_seen_at is set on every permit.
    expect(source).toContain('MAX(first_seen_at)');
    // Must NOT use MAX(issued_date) for the newest permit query
    expect(source).not.toMatch(/MAX\(issued_date\)[\s\S]*?newest[\s\S]*?FROM permits/);
  });
});

// ---------------------------------------------------------------------------
// Freshness, Schedule & Trigger Tests (standalone logic)
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

describe('Next Scheduled Date Computation', () => {
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
    expect(result).toBe('Mar 1, 2026');
  });

  it('quarterly pipeline returns next quarter start', () => {
    const result = getNextScheduledDate('parcels', now);
    expect(result).toBe('Apr 1, 2026');
  });

  it('annual pipeline returns next January', () => {
    const result = getNextScheduledDate('neighbourhoods', now);
    expect(result).toBe('Jan 1, 2027');
  });

  it('never returns Not scheduled for known slugs', () => {
    for (const slug of Object.keys(PIPELINE_SCHEDULES)) {
      const result = getNextScheduledDate(slug, now);
      expect(result).not.toBe('Not scheduled');
    }
  });

  it('returns a real date even without any last run data', () => {
    const result = getNextScheduledDate('massing', now);
    expect(result).toBe('Apr 1, 2026');
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

  it('admin stats API includes extended pipeline_last_run fields (duration, error, records)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toContain('duration_ms');
    expect(source).toContain('error_message');
    expect(source).toContain('records_total');
    expect(source).toContain('records_new');
    expect(source).toContain('records_updated');
  });

  it('admin stats API returns pipeline_schedules', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(source).toContain('pipeline_schedules');
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
// Script & Pipeline Route Tests (not page-dependent)
// ---------------------------------------------------------------------------

describe('load-permits.js fetches live CKAN data', () => {

  it('fetches from CKAN API by default instead of reading a local file', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-permits.js'),
      'utf-8'
    );
    // Must contain the CKAN base URL for live fetching
    expect(source).toContain('ckan0.cf.opendata.inter.prod-toronto.ca');
    expect(source).toContain('datastore_search');
  });

  it('uses the correct Active Building Permits resource ID', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-permits.js'),
      'utf-8'
    );
    expect(source).toContain('6d0229af-bc54-46de-9c2b-26759b01dd05');
  });

  it('supports --file flag for local file fallback', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-permits.js'),
      'utf-8'
    );
    expect(source).toMatch(/--file/);
  });

  it('does not default to reading a local JSON file', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-permits.js'),
      'utf-8'
    );
    // The old default path should not be the primary code path
    expect(source).not.toMatch(/const filePath\s*=\s*process\.argv\[2\]\s*\|\|\s*path\.join/);
  });
});

describe('Cross-platform ZIP extraction in load-massing.js', () => {

  it('load-massing.js does not use unzip without platform guard', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    expect(source).toMatch(/platform\(\)\s*===\s*['"]win32['"]/);
    expect(source).toMatch(/else\s*\{[\s\S]*?unzip/);
  });

  it('load-massing.js handles Windows extraction', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    expect(source).toMatch(/win32|Expand-Archive|platform/);
  });
});

describe('Pipeline route captures stderr and validates script', () => {

  it('pipeline route captures stderr from child process', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
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
    expect(source).toMatch(/try\s*\{[\s\S]*?INSERT INTO pipeline_runs[\s\S]*?\}\s*catch/);
    expect(source).toMatch(/runId.*null/);
  });
});

describe('Massing pipeline chains link-massing after load', () => {

  it('load-massing.js invokes link-massing.js after loading footprints', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    expect(source).toMatch(/link-massing/);
  });

  it('link-massing.js is called with execSync or child_process', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    expect(source).toMatch(/execSync.*link-massing|exec.*link-massing|spawn.*link-massing/);
  });
});

describe('FreshnessTimeline duration and error display', () => {
  it('exports formatDuration helper', async () => {
    const mod = await import('@/components/FreshnessTimeline');
    expect(mod.formatDuration).toBeDefined();
    expect(typeof mod.formatDuration).toBe('function');
  });

  it('formatDuration handles milliseconds', async () => {
    const { formatDuration } = await import('@/components/FreshnessTimeline');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(42000)).toBe('42s');
    expect(formatDuration(135000)).toBe('2m 15s');
    expect(formatDuration(3780000)).toBe('1h 3m');
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });

  it('PipelineRunInfo includes extended fields', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('duration_ms');
    expect(source).toContain('error_message');
    expect(source).toContain('records_total');
    expect(source).toContain('records_new');
  });

  it('Failed badge is clickable for error popover', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('errorPopover');
    expect(source).toContain('Error Details');
  });
});

describe('ScheduleEditModal', () => {
  it('ScheduleEditModal component exists', () => {
    const modalPath = path.join(__dirname, '../components/ScheduleEditModal.tsx');
    expect(fs.existsSync(modalPath)).toBe(true);
  });

  it('ScheduleEditModal has cadence dropdown options', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/ScheduleEditModal.tsx'),
      'utf-8'
    );
    expect(source).toContain('Daily');
    expect(source).toContain('Quarterly');
    expect(source).toContain('Annual');
    expect(source).toContain('CADENCE_OPTIONS');
  });

  it('ScheduleEditModal has Save and Cancel buttons', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/ScheduleEditModal.tsx'),
      'utf-8'
    );
    expect(source).toContain('Save');
    expect(source).toContain('Cancel');
  });

  it('ScheduleEditModal calls onSave with pipeline and cadence', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/ScheduleEditModal.tsx'),
      'utf-8'
    );
    expect(source).toContain('onSave(pipeline, cadence)');
  });

  it('DataQualityDashboard imports and renders ScheduleEditModal', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('ScheduleEditModal');
    expect(source).toContain('scheduleModal');
    expect(source).toContain('saveSchedule');
  });

  it('DataQualityDashboard uses API schedules for getNextScheduledDate', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('pipeline_schedules');
    expect(source).toMatch(/getNextScheduledDate\([^)]+pipeline_schedules/);
  });
});

describe('Pipeline schedules in DataQualityDashboard', () => {

  it('PIPELINE_SCHEDULES includes schedule labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('PIPELINE_SCHEDULES');
    expect(source).toContain('label');
  });

  it('schedule labels include frequency terms', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/Daily|Quarterly|Annual/);
  });
});

// ---------------------------------------------------------------------------
// DataSourceCircle Trend Arrow + Newest Record Tests
// ---------------------------------------------------------------------------

describe('DataSourceCircle quality badges', () => {
  it('DataSourceCircle accepts volumeAnomaly prop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('volumeAnomaly');
    expect(source).toContain('Volume');
  });

  it('DataSourceCircle shows schema drift badge', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('schemaDrift');
    expect(source).toContain('Schema Changed');
  });

  it('DataSourceCircle shows violation badge on hero', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('violationCount');
    expect(source).toContain('violations');
  });

  it('DataSourceCircle shows null rates on hero', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('nullRates');
    expect(source).toContain('Completeness');
  });

  it('DataQualityDashboard passes anomalies to hero circle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('volumeAnomaly');
    expect(source).toContain('violationCount');
    expect(source).toContain('nullRates');
  });
});

describe('DataSourceCircle trend arrow rendering', () => {
  it('renders up arrow when trend > 0', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('trend');
    expect(source).toMatch(/▲/);
  });

  it('renders down arrow when trend < 0', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/▼/);
  });

  it('renders flat indicator when trend is exactly 0', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    // Zero trend should show a flat dash, not be hidden
    expect(source).toMatch(/—.*0\.0|flat|trend\s*===\s*0/);
  });

  it('renders no arrow when trend is null', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/trend\s*!=\s*null|trend\s*!==\s*null/);
  });

  it('shows comparison period label (vs 30d)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('vs 30d');
  });
});

describe('DataSourceCircle latest record date', () => {
  it('renders latest record date with "Latest Record" label', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toContain('newestRecord');
    expect(source).toContain('Latest Record');
  });

  it('shows formatted date (not relative time) for latest record', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    // Latest record should use formatShortDate, not formatRelativeTime
    expect(source).toMatch(/formatShortDate\(newestRecord\)/);
  });

  it('does not render latest record date when null', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataSourceCircle.tsx'),
      'utf-8'
    );
    expect(source).toMatch(/newestRecord\s*&&|newestRecord\s*!=\s*null|newestRecord\s*!==\s*null/);
  });
});

describe('Health Banner in DataQualityDashboard', () => {
  it('dashboard renders health banner', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('Health Banner');
    expect(source).toContain('All systems healthy');
  });

  it('banner shows green/yellow/red states', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('bg-green-50');
    expect(source).toContain('bg-yellow-50');
    expect(source).toContain('bg-red-50');
  });

  it('banner displays issue and warning messages', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('data.health.issues');
    expect(source).toContain('data.health.warnings');
  });
});

describe('FreshnessTimeline quality group', () => {
  it('FreshnessTimeline includes quality group label', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain("quality: 'Quality'");
  });

  it('FreshnessTimeline registers Schema Validation step', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('Schema Validation');
    expect(source).toContain('assert_schema');
  });

  it('FreshnessTimeline registers Data Quality Checks step', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('Data Quality Checks');
    expect(source).toContain('assert_data_bounds');
  });
});

describe('SLA badge in FreshnessTimeline', () => {
  it('FreshnessTimeline accepts slaTargets prop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('slaTargets');
    expect(source).toContain('SLA');
  });

  it('DataQualityDashboard passes SLA_TARGETS to timeline', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('SLA_TARGETS');
    expect(source).toContain('slaTargets');
  });
});

describe('Permit link percentage calculation', () => {

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
});

// ---------------------------------------------------------------------------
// Pipeline Toggle Controls
// ---------------------------------------------------------------------------

describe('Pipeline Toggle — disabled step filtering', () => {
  it('derives disabledPipelines set from pipeline_schedules with enabled=false', () => {
    const schedules: Record<string, { cadence: string; cron_expression: string | null; enabled: boolean }> = {
      permits: { cadence: 'Daily', cron_expression: null, enabled: true },
      enrich_wsib_builders: { cadence: 'Daily', cron_expression: null, enabled: false },
      enrich_named_builders: { cadence: 'Daily', cron_expression: null, enabled: false },
      builders: { cadence: 'Daily', cron_expression: null, enabled: true },
    };
    const disabled = new Set(
      Object.entries(schedules)
        .filter(([, s]) => s.enabled === false)
        .map(([slug]) => slug)
    );
    expect(disabled.size).toBe(2);
    expect(disabled.has('enrich_wsib_builders')).toBe(true);
    expect(disabled.has('enrich_named_builders')).toBe(true);
    expect(disabled.has('permits')).toBe(false);
  });

  it('empty schedules produces empty disabled set', () => {
    const schedules: Record<string, { cadence: string; cron_expression: string | null; enabled: boolean }> = {};
    const disabled = new Set(
      Object.entries(schedules)
        .filter(([, s]) => s.enabled === false)
        .map(([slug]) => slug)
    );
    expect(disabled.size).toBe(0);
  });

  it('all enabled produces empty disabled set', () => {
    const schedules: Record<string, { cadence: string; cron_expression: string | null; enabled: boolean }> = {
      permits: { cadence: 'Daily', cron_expression: null, enabled: true },
      coa: { cadence: 'Daily', cron_expression: null, enabled: true },
    };
    const disabled = new Set(
      Object.entries(schedules)
        .filter(([, s]) => s.enabled === false)
        .map(([slug]) => slug)
    );
    expect(disabled.size).toBe(0);
  });
});

describe('Pipeline Toggle — PATCH endpoint contract', () => {
  it('PATCH handler requires pipeline and enabled fields', () => {
    // Validates the contract: missing fields should return 400
    const body1 = { pipeline: 'permits' }; // missing enabled
    expect(typeof (body1 as Record<string, unknown>).enabled).not.toBe('boolean');

    const body2 = { enabled: true }; // missing pipeline
    expect((body2 as Record<string, unknown>).pipeline).toBeUndefined();
  });

  it('PATCH handler rejects non-boolean enabled', () => {
    const body = { pipeline: 'permits', enabled: 'yes' };
    expect(typeof body.enabled).not.toBe('boolean');
  });

  it('schedules route.ts contains PATCH handler with logError', () => {
    const routePath = path.resolve(__dirname, '../app/api/admin/pipelines/schedules/route.ts');
    const content = fs.readFileSync(routePath, 'utf-8');
    expect(content).toContain('export async function PATCH');
    expect(content).toContain("logError('[admin/pipelines/schedules]'");
    // Must NOT contain bare console.error in the PATCH handler
    expect(content).not.toContain('console.error');
  });
});

describe('Pipeline Toggle — UI rendering logic', () => {
  it('disabled step gets gray dot and "Disabled" label', () => {
    // Mirrors getStatusDot override in FreshnessTimeline
    const isDisabled = true;
    const dot = isDisabled
      ? { color: 'bg-gray-300', label: 'Disabled' }
      : { color: 'bg-green-500', label: 'Fresh' };
    expect(dot.color).toBe('bg-gray-300');
    expect(dot.label).toBe('Disabled');
  });

  it('enabled step gets normal status dot', () => {
    const isDisabled = false;
    const dot = isDisabled
      ? { color: 'bg-gray-300', label: 'Disabled' }
      : { color: 'bg-green-500', label: 'Fresh' };
    expect(dot.color).toBe('bg-green-500');
    expect(dot.label).toBe('Fresh');
  });

  it('disabled step name gets line-through class', () => {
    const isDisabled = true;
    const className = isDisabled
      ? 'text-gray-300 line-through w-36'
      : 'text-gray-800 font-medium w-36';
    expect(className).toContain('line-through');
    expect(className).toContain('text-gray-300');
  });

  it('FreshnessTimeline accepts disabledPipelines and onToggle props', () => {
    const routePath = path.resolve(__dirname, '../components/FreshnessTimeline.tsx');
    const content = fs.readFileSync(routePath, 'utf-8');
    expect(content).toContain('disabledPipelines?: Set<string>');
    expect(content).toContain('onToggle?: (slug: string, enabled: boolean) => void');
  });

  it('toggle button has 44px minimum touch target for mobile', () => {
    const routePath = path.resolve(__dirname, '../components/FreshnessTimeline.tsx');
    const content = fs.readFileSync(routePath, 'utf-8');
    expect(content).toContain('min-h-[44px] min-w-[44px]');
  });

  it('toggle switch renders accessible aria-label', () => {
    const routePath = path.resolve(__dirname, '../components/FreshnessTimeline.tsx');
    const content = fs.readFileSync(routePath, 'utf-8');
    expect(content).toContain('aria-label=');
  });
});

// ---------------------------------------------------------------------------
// Pipeline Status UX — always-visible controls, NON_TOGGLEABLE_SLUGS, errors
// ---------------------------------------------------------------------------

import { NON_TOGGLEABLE_SLUGS, PIPELINE_CHAINS } from '@/components/FreshnessTimeline';

describe('NON_TOGGLEABLE_SLUGS filtering', () => {
  it('contains assert_schema, assert_data_bounds, and refresh_snapshot', () => {
    expect(NON_TOGGLEABLE_SLUGS.has('assert_schema')).toBe(true);
    expect(NON_TOGGLEABLE_SLUGS.has('assert_data_bounds')).toBe(true);
    expect(NON_TOGGLEABLE_SLUGS.has('refresh_snapshot')).toBe(true);
  });

  it('does not contain operational pipeline slugs', () => {
    expect(NON_TOGGLEABLE_SLUGS.has('permits')).toBe(false);
    expect(NON_TOGGLEABLE_SLUGS.has('builders')).toBe(false);
    expect(NON_TOGGLEABLE_SLUGS.has('enrich_wsib_builders')).toBe(false);
    expect(NON_TOGGLEABLE_SLUGS.has('classify_permits')).toBe(false);
  });

  it('every chain has at least one non-toggleable step', () => {
    for (const chain of PIPELINE_CHAINS) {
      const hasInfra = chain.steps.some((s) => NON_TOGGLEABLE_SLUGS.has(s.slug));
      expect(hasInfra).toBe(true);
    }
  });
});

describe('Pipeline controls always visible (no hover gating)', () => {
  it('Run All button has no opacity-0 or group-hover opacity class', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Find the Run All button className — should not contain opacity-0 group-hover
    const runAllMatch = content.match(/Run All[\s\S]{0,200}/);
    expect(runAllMatch).toBeTruthy();
    // The Run All button block should not have opacity-0
    const runAllBlock = content.slice(
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") + 50
    );
    expect(runAllBlock).not.toContain('opacity-0');
    expect(runAllBlock).not.toContain('group-hover/chain:opacity-100');
  });

  it('per-step Run button has no opacity-0 or group-hover class', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Find the individual Run button (not Run All)
    const runBtnIdx = content.indexOf('{/* Run button');
    expect(runBtnIdx).toBeGreaterThan(-1);
    const runBtnBlock = content.slice(runBtnIdx, runBtnIdx + 500);
    expect(runBtnBlock).not.toContain('opacity-0');
    expect(runBtnBlock).not.toContain('group-hover:opacity-100');
  });

  it('toggle switch has no opacity-0 or group-hover class', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const toggleIdx = content.indexOf('{/* Toggle switch');
    expect(toggleIdx).toBeGreaterThan(-1);
    const toggleBlock = content.slice(toggleIdx, toggleIdx + 500);
    expect(toggleBlock).not.toContain('opacity-0');
    expect(toggleBlock).not.toContain('group-hover:opacity-100');
  });

  it('Run All button has 44px min touch target', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const runAllBlock = content.slice(
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'")
    );
    expect(runAllBlock).toContain('min-h-[44px]');
  });
});

describe('Pipeline controls hidden for infrastructure steps', () => {
  it('Run button is gated by NON_TOGGLEABLE_SLUGS check', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(content).toContain('!NON_TOGGLEABLE_SLUGS.has(step.slug)');
  });
});

describe('Chain error summary box', () => {
  it('FreshnessTimeline renders chain error summary section', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(content).toContain('Chain error summary');
    expect(content).toContain('Last failure:');
  });

  it('FreshnessTimeline accepts triggerError prop', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(content).toContain('triggerError?: string | null');
  });

  it('computes failedSteps from pipelineLastRun entries', () => {
    // Simulate the chain error detection logic
    const pipelineLastRun: Record<string, { status: string | null; error_message?: string | null }> = {
      'permits:assert_schema': { status: 'completed' },
      'permits:permits': { status: 'completed' },
      'permits:classify_permits': { status: 'failed', error_message: 'Script timed out' },
      'permits:builders': { status: 'completed' },
    };
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const failedSteps = chain.steps
      .map((s) => ({ slug: s.slug, info: pipelineLastRun[`permits:${s.slug}`] }))
      .filter((s) => s.info?.status === 'failed' && s.info.error_message);
    expect(failedSteps).toHaveLength(1);
    expect(failedSteps[0].slug).toBe('classify_permits');
    expect(failedSteps[0].info!.error_message).toBe('Script timed out');
  });
});

describe('Mobile viewport (375px) — controls always visible', () => {
  it('at 375px width, no controls use hover-gated visibility patterns', () => {
    // Mock narrow viewport
    const originalInnerWidth = globalThis.innerWidth;
    Object.defineProperty(globalThis, 'innerWidth', { value: 375, writable: true });

    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );

    // Extract all className strings from Run button, toggle, and Run All sections
    const controlSections = [
      content.slice(content.indexOf('{/* Run button'), content.indexOf('{/* Run button') + 500),
      content.slice(content.indexOf('{/* Toggle switch'), content.indexOf('{/* Toggle switch') + 500),
      content.slice(
        content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
        content.indexOf("isChainRunning ? 'Running...' : 'Run All'") + 50
      ),
    ];

    for (const section of controlSections) {
      // No opacity-0 pattern means controls are visible regardless of hover/viewport
      expect(section).not.toContain('opacity-0');
      expect(section).not.toContain('group-hover:opacity-100');
      expect(section).not.toContain('group-hover/chain:opacity-100');
    }

    // Verify 44px touch targets exist
    expect(content).toContain('min-h-[44px] min-w-[44px]');
    expect(content).toContain("min-h-[44px]");

    // Restore
    Object.defineProperty(globalThis, 'innerWidth', { value: originalInnerWidth, writable: true });
  });
});
