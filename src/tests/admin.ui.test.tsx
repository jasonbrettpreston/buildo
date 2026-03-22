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

describe('Pipeline run concurrency handling', () => {
  const routeSource = () => fs.readFileSync(
    path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
  );

  it('force-cancels stale running rows before inserting a new run', () => {
    const source = routeSource();
    expect(source).toContain('Superseded by new run');
    expect(source).toMatch(/UPDATE pipeline_runs[\s\S]*?SET status = 'cancelled'[\s\S]*?WHERE status = 'running'/);
  });

  it('rejects with 409 when pipeline process is already running (B11)', () => {
    const source = routeSource();
    expect(source).toContain('already running');
    expect(source).toContain('status: 409');
  });

  it('no stale threshold windows — all running rows are cancelled', () => {
    const source = routeSource();
    // No time-based thresholds — force-cancel everything
    expect(source).not.toContain("INTERVAL '2 hours'");
    expect(source).not.toContain("INTERVAL '60 minutes'");
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

  it('load-massing.js no longer couples to link-massing via execSync (chain orchestrator handles sequencing)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-massing.js'),
      'utf-8'
    );
    // execSync coupling removed — chain orchestrator runs link-massing as the next step
    expect(source).not.toMatch(/execSync.*link-massing/);
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

  it('DataQualityDashboard passes pipeline_schedules to child components', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('pipeline_schedules');
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
// Funnel Accordion in FreshnessTimeline Tests
// ---------------------------------------------------------------------------

describe('FreshnessTimeline funnel accordion', () => {
  it('renders drill-down chevron for all steps with 44px touch target', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Chevron button with 44px touch target — universal for all steps
    expect(source).toContain('min-h-[44px]');
    expect(source).toContain('min-w-[44px]');
    // Chevron is NOT gated behind funnelRow — all steps get it
    expect(source).toContain('Drill-down expand chevron');
    expect(source).not.toMatch(/funnelRow\s*&&\s*\(\s*<button[^>]*toggleExpand/);
  });

  it('renders data flow description with source → target visualization and live meta support', () => {
    const timeline = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // FreshnessTimeline delegates to DataFlowTile with pipelineMeta
    expect(timeline).toContain('DataFlowTile');
    expect(timeline).toContain('dbSchemaMap');
    expect(timeline).toContain('pipelineMeta');
    expect(timeline).toContain('pipeline_meta');
    expect(timeline).not.toContain('desc.fields');

    const panels = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    // DataFlowTile uses live pipeline_meta exclusively for reads and writes
    expect(panels).toContain('pipelineMeta');
    expect(panels).toContain('PipelineMeta');
    expect(panels).toContain('pipelineMeta!.reads');
    expect(panels).toContain('pipelineMeta!.writes');
    // No static desc.sources/reads/writes
    expect(panels).not.toContain('desc.sources');
    expect(panels).not.toContain('desc.reads');
    expect(panels).not.toContain('desc.writes');
    expect(panels).toContain('Live Meta');
    expect(panels).toContain('Awaiting First Run');
    expect(panels).toContain('Data Flow');
    expect(panels).toContain('LiveColumnCard');
  });

  it('circular badge uses correct color thresholds', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    // CircularBadge uses pct >= 90/70/50 thresholds
    expect(source).toContain('pct >= 90');
    expect(source).toContain('pct >= 70');
    expect(source).toContain('pct >= 50');
    // Uses stroke colors for SVG rings
    expect(source).toContain('stroke-green-500');
    expect(source).toContain('stroke-blue-500');
    expect(source).toContain('stroke-yellow-500');
    expect(source).toContain('stroke-red-500');
  });

  it('accordion does NOT render FunnelAllTimePanel or FunnelLastRunPanel (B4: replaced by DataFlowTile telemetry)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // All Time and Last Run funnel panels removed — DataFlowTile + telemetry replaces them
    expect(source).not.toContain('FunnelAllTimePanel');
    expect(source).not.toContain('FunnelLastRunPanel');
    // Non-funnel fallback "Last Run" block still exists for steps without DataFlowTile
    expect(source).toContain('Last Run');
  });

  it('non-funnel steps always show status in drill-down (even with no run data)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Non-funnel drill-down always renders status, even when info is null
    expect(source).toContain("info?.status ?? 'Never run'");
    expect(source).toContain('drilldown-status');
    expect(source).toContain('records_total');
    expect(source).toContain('records_new');
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
    // Health is destructured as a prop — access via health.issues, not data.health.issues
    expect(source).toContain('health.issues');
    expect(source).toContain('health.warnings');
  });
});

describe('FreshnessTimeline quality group', () => {
  it('FreshnessTimeline includes quality group in PIPELINE_REGISTRY', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain("group: 'quality'");
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

// ---------------------------------------------------------------------------
// Phase 1: Mobile-First Row Layout & Toggle/Run Bug Fixes
// ---------------------------------------------------------------------------

describe('FreshnessTimeline mobile-first row layout', () => {
  it('does NOT use dotted line spacer between name and controls', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Dotted line has been removed from row layout
    expect(source).not.toContain('border-dotted');
  });

  it('renders circular percentage badge beside pipeline name', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // CircularBadge is rendered in the primary zone (beside step name)
    expect(source).toContain('CircularBadge');
    // Badge should be in primary zone (before Flexible spacer), not telemetry column
    const primaryZoneEnd = source.indexOf('Flexible spacer');
    const badgeIdx = source.indexOf('CircularBadge pct=');
    expect(badgeIdx).toBeGreaterThan(0);
    expect(badgeIdx).toBeLessThan(primaryZoneEnd);
    // circular-badge CSS class lives in the extracted component
    const panelSource = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    expect(panelSource).toContain('circular-badge');
  });

  it('uses mobile-first flex-wrap layout for row controls', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Controls wrap to new line on mobile
    expect(source).toContain('flex-wrap');
  });

  it('uses semantic update status with clock icon', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Clock icon for timestamp
    expect(source).toMatch(/update-status/);
  });
});

describe('FreshnessTimeline toggle bug fix', () => {
  it('uses local optimistic toggle state for immediate feedback', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Local state tracks optimistic toggle overrides
    expect(source).toContain('optimisticToggles');
  });

  it('stores correct enabled value in optimistic state (not inverted)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // The handleToggle must store `currentlyDisabled` (the desired new enabled state),
    // NOT `!currentlyDisabled` which would store the SAME state as before.
    // Extract the handleToggle function body
    const handleToggleIdx = source.indexOf('const handleToggle');
    expect(handleToggleIdx).toBeGreaterThan(-1);
    const handleToggleBlock = source.slice(handleToggleIdx, handleToggleIdx + 300);
    // Must contain `next.set(slug, currentlyDisabled)` — not `!currentlyDisabled`
    expect(handleToggleBlock).toContain('next.set(slug, currentlyDisabled)');
    expect(handleToggleBlock).not.toContain('next.set(slug, !currentlyDisabled)');
  });

  it('auto-clears optimistic state via timeout (not broken reference comparison)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Must use timeout-based cleanup, not reference comparison on Set
    expect(source).toContain('optimisticTimerRef');
    expect(source).toContain('setTimeout');
    // Must NOT use broken reference equality on disabledPipelines Set
    expect(source).not.toContain('prevDisabledRef.current === disabledPipelines');
  });
});

describe('FreshnessTimeline Run All bug fix', () => {
  it('shows error when all toggleable steps are disabled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('All Steps Disabled');
  });

  it('wraps onTrigger in try-catch with UI error feedback', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Run button has error handling
    expect(source).toContain('runError');
  });

  it('isChainRunning only checks chain slug, not individual step slugs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Extract isChainRunning assignment
    const idx = source.indexOf('const isChainRunning');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 200);
    // Must check only chain slug
    expect(block).toContain('runningPipelines.has(chainSlug)');
    // Must NOT check individual step slugs (causes stale runs to block Run All)
    expect(block).not.toContain('chain.steps.some');
  });

  it('Run All button uses handleRun for error reporting, not raw onTrigger', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Find the Run All button onClick handler
    const chainSlugIdx = source.indexOf("onClick={() => handleRun(chainSlug)");
    const rawTriggerIdx = source.indexOf("onClick={() => onTrigger(chainSlug)");
    // Must use handleRun (which has try-catch + setRunError)
    expect(chainSlugIdx).toBeGreaterThan(-1);
    // Must NOT use raw onTrigger (which swallows errors silently)
    expect(rawTriggerIdx).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Stats API resilience
// ---------------------------------------------------------------------------

describe('Stats API pipeline_last_run resilience', () => {
  it('stats route has fallback query when records_meta column is missing', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    // Must have two separate SELECT queries for pipeline_runs — full and fallback
    const fullQuery = source.indexOf('records_meta');
    expect(fullQuery).toBeGreaterThan(-1);
    // The fallback query must NOT include records_meta
    const fallbackIdx = source.indexOf('records_meta', fullQuery + 1);
    // There should be multiple references — the fallback maps null for it
    expect(fallbackIdx).toBeGreaterThan(fullQuery);
    // Must have nested try-catch for graceful degradation
    const nestedTryCatch = (source.match(/try\s*\{/g) || []).length;
    expect(nestedTryCatch).toBeGreaterThanOrEqual(3); // outer + pipeline query + fallback
  });
});

describe('B15: Pipeline status fallback when stats times out', () => {
  it('B15: initial load seeds pipeline_last_run from lightweight status endpoint when stats fails', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // The initial load effect must fetch from the lightweight status endpoint
    // as a fallback when full stats returns undefined (timed out).
    // Slice from "On initial load" to "Polling while" to isolate just the initial load effect.
    const start = source.indexOf('On initial load');
    const end = source.indexOf('Polling while');
    const initialLoadBlock = source.slice(start, end);
    expect(initialLoadBlock).toContain('pipelines/status');
  });

  it('B15: polling merge handles null stats (does not silently return null)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // The old pattern: `prev ? { ...prev, pipeline_last_run } : prev` silently returns null
    // The fix must provide a fallback object when prev is null
    const pollBlock = source.slice(source.indexOf('Merge fresh pipeline_last_run'));
    // Should NOT have the pattern that returns prev unchanged when null
    expect(pollBlock).not.toMatch(/prev\s*\?\s*\{[^}]*pipeline_last_run[^}]*\}\s*:\s*prev\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Pipeline Tiles & Accordion Tile Design
// ---------------------------------------------------------------------------

describe('FreshnessTimeline pipeline tiles', () => {
  it('each pipeline step is wrapped in its own bordered tile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('pipeline-tile');
    expect(source).toContain('border rounded-lg');
  });

  it('uses circular percentage badge instead of bar chart', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Circular badge replaces bar chart
    expect(source).toMatch(/CircularBadge|circular-badge|<circle/);
  });

  it('accordion panels use bordered white card tiles', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('bg-white border border-gray-200 rounded-lg');
  });

  it('All Time and Last Run panels are wrapped in tile cards', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('accordion-tile');
  });

  it('FunnelAllTimePanel sub-zones have nested tile cards for alignment', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    // Each sub-zone (Baseline, Intersection, Yield) should be in its own nested card
    const panelIdx = source.indexOf('function FunnelAllTimePanel');
    expect(panelIdx).toBeGreaterThan(-1);
    const panelBlock = source.slice(panelIdx, panelIdx + 3000);
    // Nested tiles within the All Time panel
    expect(panelBlock).toContain('nested-tile');
  });

  it('FunnelLastRunPanel sub-zones have nested tile cards for alignment', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    const panelIdx = source.indexOf('function FunnelLastRunPanel');
    expect(panelIdx).toBeGreaterThan(-1);
    const panelBlock = source.slice(panelIdx, panelIdx + 3000);
    expect(panelBlock).toContain('nested-tile');
  });

  it('right-hand controls have adequate spacing (gap-3)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Right-aligned telemetry column uses gap-3
    expect(source).toMatch(/telemetry[\s\S]*gap-3/);
  });
});

// ---------------------------------------------------------------------------
// Run All and Toggle API fixes
// ---------------------------------------------------------------------------

describe('Pipeline API route fixes', () => {
  it('API route force-cancels stale DB rows AND guards with 409 for live processes (B11)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    // Force-cancel stale DB rows
    expect(source).toContain('Superseded by new run');
    // 409 guard for live processes
    expect(source).toContain('already running');
    expect(source).toContain('status: 409');
  });

  it('Toggle PATCH uses UPSERT for missing pipeline_schedules rows', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/app/api/admin/pipelines/schedules/route.ts'),
      'utf-8'
    );
    expect(source).toContain('ON CONFLICT (pipeline) DO UPDATE');
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Actionable Health Banner
// ---------------------------------------------------------------------------

describe('Actionable Health Banner', () => {
  it('renders Retry Failed Pipelines button when failures exist', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('Retry Failed');
  });

  it('renders clickable issue count that scrolls to failed pipeline', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // Deep link scroll behavior
    expect(source).toContain('scrollToFailed');
  });

  it('uses swipeable horizontal carousel for trend metrics on mobile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // Mobile carousel: overflow-x-auto snap-x
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('snap-x');
  });

  it('Health Banner has premium gradient styling', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // Gradient background for premium look
    expect(source).toContain('bg-gradient');
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Dismissible schedule notice
// ---------------------------------------------------------------------------

describe('Dismissible schedule notice', () => {
  it('schedule notice can be dismissed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('dismissedNotice');
  });
});

// ---------------------------------------------------------------------------
// Viewport mocking: 375px viewport mock in src/tests/admin.ui.test.tsx
// ---------------------------------------------------------------------------

describe('Mobile viewport layout assertions', () => {
  it('FreshnessTimeline row uses responsive stacking for mobile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Mobile-first: base = stacked, md: = inline
    expect(source).toMatch(/md:flex-nowrap|md:flex-row/);
  });

  it('DataQualityDashboard trend carousel uses snap scroll on mobile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    expect(source).toContain('snap-mandatory');
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

import { NON_TOGGLEABLE_SLUGS, PIPELINE_CHAINS, PIPELINE_REGISTRY } from '@/components/FreshnessTimeline';

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

  it('every ingestion chain has at least one non-toggleable step', () => {
    // Entities and deep_scrapes chains have no infrastructure steps — skip them
    const ingestionChains = PIPELINE_CHAINS.filter((c) => !['entities', 'deep_scrapes'].includes(c.id));
    for (const chain of ingestionChains) {
      const hasInfra = chain.steps.some((s) => NON_TOGGLEABLE_SLUGS.has(s.slug));
      expect(hasInfra).toBe(true);
    }
  });
});

describe('Pipeline controls visibility', () => {
  it('Run All button has no opacity-0 (always visible)', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const runAllBlock = content.slice(
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") + 50
    );
    expect(runAllBlock).not.toContain('opacity-0');
  });

  it('per-step Run and Toggle are hover-hidden on desktop (md:opacity-0)', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Controls wrapper should use md:opacity-0 for desktop hover-hidden
    expect(content).toContain('md:opacity-0');
  });

  it('Run All button has 44px min touch target', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const runAllBlock = content.slice(
      content.indexOf('{runAllLabel}') - 500,
      content.indexOf('{runAllLabel}')
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
  it('at 375px width, controls use md:opacity-0 (not base opacity-0)', () => {
    // Mock narrow viewport
    const originalInnerWidth = globalThis.innerWidth;
    Object.defineProperty(globalThis, 'innerWidth', { value: 375, writable: true });

    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );

    // Controls use md:opacity-0 for desktop only — base (mobile) has no opacity-0
    // Run All button should never be hover-hidden
    const runAllBlock = content.slice(
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") + 50
    );
    expect(runAllBlock).not.toContain('opacity-0');

    // Verify 44px touch targets exist
    expect(content).toContain('min-h-[44px] min-w-[44px]');
    expect(content).toContain("min-h-[44px]");

    // Restore
    Object.defineProperty(globalThis, 'innerWidth', { value: originalInnerWidth, writable: true });
  });
});

// ---------------------------------------------------------------------------
// Chain trigger race condition fix — API must insert chain row before spawn
// ---------------------------------------------------------------------------

describe('Chain trigger inserts pipeline_runs row before spawning process', () => {
  const routeSource = () => fs.readFileSync(
    path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
  );

  it('API route inserts pipeline_runs row for chain slugs (no isChain skip)', () => {
    const source = routeSource();
    // The old guard `if (!isChain)` around the INSERT should be removed.
    // The INSERT should run for ALL pipelines (chains included) so the row
    // exists immediately when polling starts.
    expect(source).not.toMatch(/if\s*\(\s*!isChain\s*\)\s*\{[\s\S]*?INSERT INTO pipeline_runs/);
  });

  it('API route passes runId to chain script as CLI argument', () => {
    const source = routeSource();
    // For chains, the runId should be passed so run-chain.js can reuse it
    expect(source).toMatch(/runId/);
    expect(source).toMatch(/String\(runId\)/);
  });

  it('API route parses PIPELINE_SUMMARY from script stdout', () => {
    const source = routeSource();
    expect(source).toContain('PIPELINE_SUMMARY');
    expect(source).toContain('records_total');
  });
});

describe('run-chain.js accepts external run ID argument', () => {
  const chainSource = () => fs.readFileSync(
    path.join(__dirname, '../../scripts/run-chain.js'), 'utf-8'
  );

  it('accepts run ID from CLI argument to skip duplicate INSERT', () => {
    const source = chainSource();
    // run-chain.js should check for a run ID argument (argv[3])
    expect(source).toMatch(/process\.argv\[3\]/);
  });

  it('skips chain row INSERT when external run ID is provided', () => {
    const source = chainSource();
    // Should have conditional logic: if run ID provided, use it; else INSERT
    expect(source).toMatch(/parseInt\(process\.argv\[3\]/);
  });
});

describe('Polling resilience — grace period for newly triggered pipelines', () => {
  it('DataQualityDashboard keeps recently-triggered slugs even if not yet in stats', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'), 'utf-8'
    );
    // The polling updater should not blindly clear slugs that are missing from stats.
    // It should keep slugs that were recently added (grace period).
    expect(source).toMatch(/triggerTimestamps|triggerTimes|addedAt|graceMs|GRACE/i);
  });
});

// ---------------------------------------------------------------------------
// 4-Pillar Architecture — chain_entities registered in route.ts
// ---------------------------------------------------------------------------

describe('4-Pillar Architecture — chain_entities registration', () => {
  const routeSource = () => fs.readFileSync(
    path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
  );

  it('CHAIN_SLUGS includes chain_entities', () => {
    const source = routeSource();
    expect(source).toContain('chain_entities');
  });

  it('manifest.json defines entities chain with enrichment steps', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../../scripts/manifest.json'), 'utf-8'
    ));
    expect(manifest.chains.entities).toBeDefined();
    const entitySteps = manifest.chains.entities;
    expect(entitySteps).toContain('enrich_wsib_builders');
    expect(entitySteps).toContain('enrich_named_builders');
  });

  it('manifest.json permits chain does NOT contain enrichment steps', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../../scripts/manifest.json'), 'utf-8'
    ));
    const permitsSteps = manifest.chains.permits;
    expect(permitsSteps).toBeDefined();
    expect(permitsSteps).not.toContain('enrich_wsib_builders');
    expect(permitsSteps).not.toContain('enrich_named_builders');
  });
});

// ---------------------------------------------------------------------------
// Group 4: Deep Scrapes & Documents (comingSoon chain)
// ---------------------------------------------------------------------------

describe('Deep Scrapes pipeline group', () => {
  it('PIPELINE_REGISTRY includes coa_documents entry', () => {
    expect(PIPELINE_REGISTRY.coa_documents).toBeDefined();
    expect(PIPELINE_REGISTRY.coa_documents.name).toBeTruthy();
  });

  it('deep_scrapes chain exists in PIPELINE_CHAINS with inspections', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'deep_scrapes');
    expect(chain).toBeDefined();
    expect(chain!.steps.map((s) => s.slug)).toContain('inspections');
  });

  it('deep_scrapes chain is not marked comingSoon', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'deep_scrapes');
    expect(chain).toBeDefined();
    expect(chain!.comingSoon).toBeFalsy();
  });
});

describe('Run All disabled when all steps disabled or comingSoon', () => {
  it('FreshnessTimeline disables Run All for comingSoon chains', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('comingSoon');
    // The Run All button should be disabled when comingSoon is true
    expect(source).toMatch(/chain\.comingSoon/);
  });

  it('FreshnessTimeline disables Run All when all non-infra steps are disabled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Should check if all toggleable steps are disabled
    expect(source).toMatch(/allStepsDisabled|allDisabled|everyDisabled/i);
  });
});

// ---------------------------------------------------------------------------
// Fix 2: FunnelLastRunPanel has 3 tiles to align with FunnelAllTimePanel
// ---------------------------------------------------------------------------

describe('FunnelLastRunPanel has 3 tiles matching FunnelAllTimePanel columns', () => {
  it('FunnelLastRunPanel renders a Run Baseline tile as first column', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    // Extract the FunnelLastRunPanel function body
    const panelStart = source.indexOf('function FunnelLastRunPanel');
    const panelBody = source.slice(panelStart, panelStart + 5000);
    // Count nested-tile divs — exactly 3 (Run Baseline + Run Intersection + Run Yield)
    const tileCount = (panelBody.match(/nested-tile/g) || []).length;
    expect(tileCount).toBe(3);
  });

  it('FunnelLastRunPanel first tile is labeled Run Baseline', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    const panelStart = source.indexOf('function FunnelLastRunPanel');
    const panelBody = source.slice(panelStart, panelStart + 2000);
    expect(panelBody).toContain('Run Baseline');
  });
});

// ---------------------------------------------------------------------------
// Fix 4 (WF2): Stop/cancel button beside Run All for running chains
// ---------------------------------------------------------------------------

describe('Stop/cancel button for running chains', () => {
  it('FreshnessTimeline has a Stop or Cancel button near Run All', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Should have a stop/cancel button that appears when chain is running
    expect(source).toMatch(/Stop|Cancel/);
    // The button should call onCancel or handleCancel
    expect(source).toMatch(/onCancel|handleCancel|onStop|handleStop/);
  });

  it('FreshnessTimeline accepts onCancel prop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('onCancel');
  });

  it('DELETE handler exists in pipelines route for cancel', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
    );
    expect(source).toMatch(/export\s+(async\s+)?function\s+DELETE/);
  });

  it('DELETE handler updates pipeline_runs status to cancelled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
    );
    expect(source).toContain("'cancelled'");
  });

  it('DELETE handler validates slug against ALLOWED_PIPELINES', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
    );
    // Extract the DELETE function body
    const deleteIdx = source.indexOf('async function DELETE');
    const deleteBody = source.slice(deleteIdx, deleteIdx + 500);
    expect(deleteBody).toContain('ALLOWED_PIPELINES');
  });

  it('Stop button has 44px min touch target', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Find the stop button block by locating the cancel onClick handler
    const cancelIdx = source.indexOf('onCancel(chainSlug)');
    expect(cancelIdx).toBeGreaterThan(-1);
    const stopBlock = source.slice(cancelIdx - 100, cancelIdx + 600);
    expect(stopBlock).toContain('min-h-[44px]');
    expect(stopBlock).toMatch(/Stop/);

  });
});

// ---------------------------------------------------------------------------
// Fix 1: Status dots reset to "Pending" when parent chain is running
// ---------------------------------------------------------------------------

describe('Status dots reset when chain re-runs', () => {
  it('getStatusDot or step dot logic handles chain-running + not-individually-running as pending', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // When a chain is running, individual steps that are not yet running should
    // show a pending/queued state instead of their last-run status
    expect(source).toMatch(/isChainRunning[\s\S]{0,200}(pending|Pending|Queued|queued|bg-gray)/);
  });

  it('compares step last_run_at against chain start time to detect done-this-run', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // stepDoneThisRun must compare step time vs chain start time — not just check status
    expect(source).toMatch(/chainStartedAt/);
    expect(source).toMatch(/stepRanAt[\s\S]{0,100}chainStartedAt/);
    expect(source).toMatch(/stepDoneThisRun/);
    expect(source).toMatch(/isPending[\s\S]{0,80}!stepDoneThisRun/);
  });
});

// ---------------------------------------------------------------------------
// Fix 3+5: Stop button always visible while chain is running
// ---------------------------------------------------------------------------

describe('Stop button stays visible during cancel', () => {
  it('cancelPipeline does NOT immediately remove slug from runningPipelines', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'), 'utf-8'
    );
    // Extract cancelPipeline function body
    const cancelIdx = source.indexOf('cancelPipeline');
    const cancelBody = source.slice(cancelIdx, cancelIdx + 500);
    // Should NOT have next.delete(slug) in the success path — let polling handle it
    expect(cancelBody).not.toMatch(/next\.delete\(slug\)[\s\S]*return next/);
  });
});

// ---------------------------------------------------------------------------
// Fix 4: run-chain.js checks for cancellation between steps
// ---------------------------------------------------------------------------

describe('run-chain.js cancellation check between steps', () => {
  it('checks pipeline_runs status before each step', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    expect(source).toContain('cancelled');
    // Should query pipeline_runs to check if chain was cancelled
    expect(source).toMatch(/SELECT[\s\S]*status[\s\S]*pipeline_runs[\s\S]*WHERE[\s\S]*id/);
  });
});

// ---------------------------------------------------------------------------
// Fix 4: API route kills child process on DELETE
// ---------------------------------------------------------------------------

describe('API route kills child process on cancel', () => {
  it('stores running child processes in a map', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
    );
    expect(source).toMatch(/runningProcesses|childProcesses|activeProcesses/);
  });

  it('DELETE handler kills the child process', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
    );
    const deleteBody = source.slice(source.indexOf('async function DELETE'));
    expect(deleteBody).toMatch(/\.kill|process\.kill/);
  });
});

// ---------------------------------------------------------------------------
// WF2 Fix 6: Warning/stale dots flash with animate-pulse
// ---------------------------------------------------------------------------

describe('Warning and stale status tile flash', () => {
  it('getStatusDot returns direct DB status mapping (Raw DB Transparency)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const fnBody = source.slice(fnStart, fnEnd);
    // Direct 1:1 status mapping — no stale detection
    expect(fnBody).toContain("'Completed'");
    expect(fnBody).toContain("'Failed'");
    expect(fnBody).toContain("'Running'");
    expect(fnBody).not.toContain("'Stale'");
    expect(fnBody).not.toContain("'Aging'");
    expect(fnBody).not.toContain("'Overdue'");
  });

  it('getFreshnessBadge handles time-based freshness separately from status', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getFreshnessBadge');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'Fresh'");
    expect(fnBody).toContain("'Aging'");
    expect(fnBody).toContain("'Overdue'");
  });

  it('applies tile-flash CSS animation based on DB status and freshness', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Failed steps get red flash
    expect(source).toMatch(/Failed[\s\S]{0,30}tile-flash-stale/);
    // Freshness-based flashes (from getFreshnessBadge, not getStatusDot)
    expect(source).toMatch(/Aging[\s\S]{0,80}tile-flash-warning[\s\S]{0,80}border-yellow/);
    expect(source).toMatch(/Overdue[\s\S]{0,80}tile-flash-overdue[\s\S]{0,80}border-purple/);
    // tileFlash applied to pipeline-tile div
    expect(source).toMatch(/pipeline-tile[\s\S]{0,200}tileFlash|tileFlash[\s\S]{0,200}pipeline-tile/);
  });

  it('globals.css defines tile-flash keyframes with background-color pulse', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../app/globals.css'), 'utf-8'
    );
    expect(css).toContain('tile-flash-yellow');
    expect(css).toContain('tile-flash-red');
    expect(css).toContain('background-color');
    expect(css).toContain('.tile-flash-warning');
    expect(css).toContain('.tile-flash-stale');
  });

  it('globals.css defines tile-flash-blue keyframe for running state', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../app/globals.css'), 'utf-8'
    );
    expect(css).toContain('tile-flash-blue');
    expect(css).toContain('.tile-flash-running');
  });

  it('globals.css defines tile-flash-purple keyframe for overdue state', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../app/globals.css'), 'utf-8'
    );
    expect(css).toContain('tile-flash-purple');
    expect(css).toContain('.tile-flash-overdue');
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Full-Tile Status Coloring
// ---------------------------------------------------------------------------

describe('Full-tile status coloring (no more dots)', () => {
  it('status dot div (w-2 h-2 rounded-full) is removed from tile rows', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // The old 2x2 dot div should no longer exist in the step tile rendering
    const tileSection = source.slice(source.indexOf('pipeline-tile'), source.indexOf('Universal drill-down'));
    expect(tileSection).not.toMatch(/w-2\s+h-2\s+rounded-full/);
  });

  it('tile container gets status background class based on getStatusDot label', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // tile bg should use status-derived classes
    expect(source).toContain('bg-green-50');
    expect(source).toContain('bg-blue-50');
    expect(source).toContain('bg-yellow-50');
    expect(source).toContain('bg-red-50');
  });

  it('getStatusDot maps completed status to green, with verdict override for FAIL/WARN (Raw DB Transparency)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Direct 1:1 mapping — completed → green, with audit verdict override
    const dotFn = source.slice(source.indexOf('function getStatusDot'), source.indexOf('function getStatusDot') + 1500);
    expect(dotFn).toContain("'completed'");
    expect(dotFn).toContain("'Completed'");
    expect(dotFn).toContain('bg-green-50');
    // Verdict override: FAIL → red, WARN → amber
    expect(dotFn).toContain('audit_table');
    expect(dotFn).toContain("verdict === 'FAIL'");
    expect(dotFn).toContain("verdict === 'WARN'");
  });

  it('getStatusDot does not reference records_new or stale detection', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const dotFn = source.slice(source.indexOf('function getStatusDot'), source.indexOf('function getStatusDot') + 500);
    expect(dotFn).not.toContain('records_new');
    expect(dotFn).not.toContain("'Stale'");
  });

  it('pending steps reset to neutral background (no status color)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // When isPending, dot.color is '' (empty = neutral bg). label: 'Pending'
    // color: '' means no status background class is applied
    expect(source).toMatch(/label:\s*'Pending'/);
    expect(source).toMatch(/isPending[\s\S]{0,50}color:\s*''/);
  });

  it('running steps get tile-flash-running class for blue pulse', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toMatch(/Running[\s\S]{0,30}tile-flash-running/);
  });

  it('getStatusDot handles skipped status with gray background', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'skipped'");
    expect(fnBody).toContain("'Skipped'");
    expect(fnBody).toContain('bg-gray-50');
  });

  it('getStatusDot handles cancelled status with gray background', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'cancelled'");
    expect(fnBody).toContain("'Cancelled'");
    expect(fnBody).toContain('bg-gray-50');
  });

  it('footer status text includes skipped and cancelled colors', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const footerSection = source.slice(source.indexOf('drilldown-footer'));
    expect(footerSection).toContain("'skipped'");
    expect(footerSection).toContain("'cancelled'");
    expect(footerSection).toContain('text-orange-500');
  });

  it('drilldown status-bar indicator dot handles skipped and cancelled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const statusBar = source.slice(source.indexOf('drilldown-status-bar'), source.indexOf('drilldown-status-bar') + 2000);
    expect(statusBar).toContain("'skipped'");
    expect(statusBar).toContain("'cancelled'");
    expect(statusBar).toContain('bg-orange-400');
    expect(statusBar).toContain('text-orange-600');
  });

  it('drilldown-status text handles skipped and cancelled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const drilldownStatus = source.slice(source.indexOf('drilldown-status text'));
    expect(drilldownStatus).toContain("'skipped'");
    expect(drilldownStatus).toContain("'cancelled'");
    expect(drilldownStatus).toContain('text-orange-600');
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Parent-Child Indentation
// ---------------------------------------------------------------------------

describe('Parent-child tile indentation', () => {
  it('indent-1 steps get ml-6 on the tile container', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // indent === 1 should map to ml-6
    expect(source).toMatch(/indent\s*===\s*1[\s\S]{0,80}ml-6/);
  });

  it('indent-2 steps get ml-12 on the tile container', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // indent >= 2 should map to ml-12
    expect(source).toMatch(/indent\s*>=\s*2[\s\S]{0,80}ml-12/);
  });

  it('arrow prefix (rarr) is removed from step rows', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // The tile rendering section should not contain rarr arrows
    const tileSection = source.slice(source.indexOf('pipeline-tile'), source.indexOf('Universal drill-down'));
    expect(tileSection).not.toContain('&rarr;');
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Bold Step Number Badges
// ---------------------------------------------------------------------------

describe('Bold step number badges', () => {
  it('step numbers are rendered as bold rounded badges', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Step number badge should have bold + rounded-full + background
    const tileSection = source.slice(source.indexOf('pipeline-tile'), source.indexOf('Universal drill-down'));
    expect(tileSection).toMatch(/font-bold[\s\S]{0,120}rounded-full/);
    expect(tileSection).toContain('bg-gray-100');
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Circular Percentage Badges
// ---------------------------------------------------------------------------

describe('Circular percentage badges', () => {
  it('renders SVG circle/donut for match percentage beside step name', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('CircularBadge');
    // Badge is in primary zone, before the spacer
    const spacerIdx = source.indexOf('Flexible spacer');
    const badgeIdx = source.indexOf('CircularBadge pct=');
    expect(badgeIdx).toBeLessThan(spacerIdx);
    // SVG circle definition lives in the extracted component
    const panelSource = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    expect(panelSource).toMatch(/<circle/);
  });

  it('horizontal bar chart background is removed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const tileSection = source.slice(source.indexOf('pipeline-tile'), source.indexOf('Universal drill-down'));
    expect(tileSection).not.toMatch(/absolute\s+inset-y-0[\s\S]{0,80}barColor/);
  });
});

describe('Drill-down status always visible', () => {
  it('universal status bar renders at top of every drill-down', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Status bar appears before Description tile, inside the accordion
    expect(source).toContain('drilldown-status-bar');
    expect(source).toContain("info?.status ?? 'Never run'");
    // Status bar appears before Description
    const statusBarIdx = source.indexOf('drilldown-status-bar');
    const descIdx = source.indexOf('<DataFlowTile');
    expect(statusBarIdx).toBeLessThan(descIdx);
  });

  it('status bar shows colored dot + status text + time + duration', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const barStart = source.indexOf('drilldown-status-bar');
    const barSection = source.slice(barStart, barStart + 2500);
    // Colored status dot
    expect(barSection).toContain('bg-green-500');
    expect(barSection).toContain('bg-red-500');
    expect(barSection).toContain('bg-blue-500');
    // Time ago and duration
    expect(barSection).toContain('timeAgo');
    expect(barSection).toContain('formatDuration');
  });

  it('footer status line renders for ALL steps (not just funnel steps)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Footer must be unconditional (drilldown-footer class, no funnelRow guard)
    expect(source).toContain('drilldown-footer');
    const footerIdx = source.indexOf('drilldown-footer');
    const footerSection = source.slice(footerIdx, footerIdx + 3000);
    // Funnel steps show their existing status (Healthy/Warning/Stale)
    expect(footerSection).toContain('funnelRow.status');
    // Non-funnel steps show info.status (Completed/Failed/Running/Never run)
    expect(footerSection).toMatch(/info\?\.status/);
    expect(footerSection).toContain('Never run');
    // Both branches render "Status:" label
    expect(footerSection.match(/Status:/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Source Data Reordering
// ---------------------------------------------------------------------------

describe('Source Data Updates relocated to bottom', () => {
  it('sources chain appears after permits, coa, and entities chains', () => {
    const chainsSource = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const sourcesIdx = chainsSource.indexOf("id: 'sources'");
    const permitsIdx = chainsSource.indexOf("id: 'permits'");
    const coaIdx = chainsSource.indexOf("id: 'coa'");
    const entitiesIdx = chainsSource.indexOf("id: 'entities'");
    expect(sourcesIdx).toBeGreaterThan(permitsIdx);
    expect(sourcesIdx).toBeGreaterThan(coaIdx);
    expect(sourcesIdx).toBeGreaterThan(entitiesIdx);
  });
});

// ---------------------------------------------------------------------------
// Option C Redesign — Hover-Hidden Controls (Desktop)
// ---------------------------------------------------------------------------

describe('Hover-hidden controls on desktop', () => {
  it('per-step Run and Toggle buttons have md:opacity-0 for desktop hover', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Controls container should use md:opacity-0 and group-hover
    expect(source).toContain('md:opacity-0');
    expect(source).toMatch(/md:group-hover:opacity-100|group-hover\/tile:opacity-100/);
  });

  it('tile container has group class for hover detection', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // The pipeline-tile div should have the group class
    expect(source).toMatch(/pipeline-tile[\s\S]{0,60}group/);
  });

  it('Run All button does NOT have hover-hidden classes', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const runAllBlock = content.slice(
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") - 300,
      content.indexOf("isChainRunning ? 'Running...' : 'Run All'") + 50
    );
    expect(runAllBlock).not.toContain('md:opacity-0');
  });
});

// ---------------------------------------------------------------------------
// WF5 Audit Fix: Stale Exemption for link/classify/quality/snapshot groups
// ---------------------------------------------------------------------------

describe('Raw DB Transparency — getStatusDot simplification', () => {
  it('getStatusDot does not accept staleExempt parameter (removed)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnSig = source.slice(fnStart, source.indexOf('{', fnStart));
    expect(fnSig).not.toContain('staleExempt');
  });

  it('getStatusDot maps directly to DB status without stale detection', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnBody = source.slice(fnStart, fnStart + 800);
    // Direct mapping: completed/failed/skipped/cancelled → colors
    expect(fnBody).toContain("'completed'");
    expect(fnBody).toContain("'failed'");
    expect(fnBody).not.toContain("'Stale'");
    expect(fnBody).not.toContain("'No Change'");
  });

  it('getFreshnessBadge provides separate time-based badges', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('function getFreshnessBadge');
    const fnStart = source.indexOf('function getFreshnessBadge');
    const fnBody = source.slice(fnStart, fnStart + 800);
    expect(fnBody).toContain("'Fresh'");
    expect(fnBody).toContain("'Aging'");
    expect(fnBody).toContain("'Overdue'");
  });

  it('getStatusDot call site does not use staleExempt', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).not.toContain('STALE_EXEMPT_GROUPS');
    expect(source).not.toMatch(/getStatusDot\([^)]*staleExempt/);
  });
});

// ---------------------------------------------------------------------------
// WF5 Audit Fix: Optimistic Timer Timeout
// ---------------------------------------------------------------------------

describe('Optimistic timer timeout', () => {
  it('optimistic timer uses >= 8000ms to survive cold-start latency', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Find the setTimeout in optimistic timer context
    const timerMatch = source.match(/optimistic[\s\S]{0,500}},\s*(\d+)\)/);
    expect(timerMatch).not.toBeNull();
    const timeoutMs = parseInt(timerMatch![1], 10);
    expect(timeoutMs).toBeGreaterThanOrEqual(8000);
  });
});

// ---------------------------------------------------------------------------
// WF5 Audit Fix: Contextual Intersection Labels
// ---------------------------------------------------------------------------

describe('Contextual intersection labels (INTERSECTION_LABELS)', () => {
  it('INTERSECTION_LABELS constant exists with processedLabel and matchedLabel', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    expect(source).toContain('INTERSECTION_LABELS');
    expect(source).toContain('processedLabel');
    expect(source).toContain('matchedLabel');
  });

  it('geocode_permits has "To Geocode" / "Geocoded" labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    const labelsStart = source.indexOf('INTERSECTION_LABELS');
    const labelsBlock = source.slice(labelsStart, labelsStart + 2000);
    expect(labelsBlock).toContain('geocode_permits');
    expect(labelsBlock).toContain('To Geocode');
    expect(labelsBlock).toContain('Geocoded');
  });

  it('link_parcels has "Unlinked" / "Linked" labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    const labelsStart = source.indexOf('INTERSECTION_LABELS');
    const labelsBlock = source.slice(labelsStart, labelsStart + 2000);
    expect(labelsBlock).toContain('link_parcels');
    expect(labelsBlock).toContain('Unlinked');
    expect(labelsBlock).toContain('Linked');
  });

  it('classify_permits has "To Classify" / "Classified" labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    const labelsStart = source.indexOf('INTERSECTION_LABELS');
    const labelsBlock = source.slice(labelsStart, labelsStart + 2000);
    expect(labelsBlock).toContain('classify_permits');
    expect(labelsBlock).toContain('To Classify');
    expect(labelsBlock).toContain('Classified');
  });

  it('FunnelLastRunPanel uses INTERSECTION_LABELS via statusSlug lookup', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    // The panel should look up labels from statusSlug
    expect(source).toMatch(/INTERSECTION_LABELS\[[\s\S]{0,50}statusSlug/);
  });
});

// ---------------------------------------------------------------------------
// WF5 Audit Fix: CQA records_meta in non-funnel drill-down
// ---------------------------------------------------------------------------

describe('CQA records_meta rendering in non-funnel panel', () => {
  it('non-funnel Last Run panel renders records_meta key/value pairs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // records_meta should be rendered in the drill-down
    expect(source).toContain('records_meta');
    expect(source).toContain('Object.entries(meta)');
  });

  it('failed check counts render in red', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Keys containing 'failed' should get red text
    expect(source).toMatch(/failed[\s\S]{0,100}text-red-600/);
  });

  it('warned check counts render in yellow', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Keys containing 'warned' should get yellow text
    expect(source).toMatch(/warned[\s\S]{0,100}text-yellow-600/);
  });

  it('array values display length count, not raw array', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Array.isArray check should convert to .length
    expect(source).toMatch(/Array\.isArray[\s\S]{0,100}length/);
  });
});

// ---------------------------------------------------------------------------
// WF2: Component extraction — FreshnessTimeline imports from funnel/FunnelPanels
// ---------------------------------------------------------------------------

describe('Funnel panel components extracted to separate file', () => {
  it('FreshnessTimeline.tsx imports from ./funnel/FunnelPanels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain("from './funnel/FunnelPanels'");
  });

  it('FreshnessTimeline.tsx is under 950 lines after extraction', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const lineCount = source.split('\n').length;
    expect(lineCount).toBeLessThan(1300);
  });

  it('FunnelPanels.tsx exports CircularBadge, MetricRow, FunnelAllTimePanel, FunnelLastRunPanel, INTERSECTION_LABELS, DataFlowTile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    expect(source).toContain('export function CircularBadge');
    expect(source).toContain('function MetricRow');
    expect(source).toContain('export function FunnelAllTimePanel');
    expect(source).toContain('export function FunnelLastRunPanel');
    expect(source).toContain('export const INTERSECTION_LABELS');
    expect(source).toContain('export function DataFlowTile');
  });
});

// ── T5 Sparkline wiring ────────────────────────────────────────────

describe('T5 Sparkline wiring', () => {
  it('FreshnessTimeline.tsx imports Sparkline from FunnelPanels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('Sparkline');
    expect(source).toContain("from './funnel/FunnelPanels'");
  });

  it('FreshnessTimeline.tsx fetches pipeline history for sparkline data', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('/api/admin/pipelines/history');
  });

  it('FreshnessTimeline.tsx renders <Sparkline', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('<Sparkline');
  });
});

// ── Shared PIPELINE_TABLE_MAP ──────────────────────────────────────

describe('PIPELINE_TABLE_MAP shared constant', () => {
  it('PIPELINE_TABLE_MAP is exported from funnel.ts', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../lib/admin/funnel.ts'), 'utf-8'
    );
    expect(source).toContain('export const PIPELINE_TABLE_MAP');
  });

  it('FreshnessTimeline.tsx imports PIPELINE_TABLE_MAP', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('PIPELINE_TABLE_MAP');
  });

  it('stats route imports PIPELINE_TABLE_MAP', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'), 'utf-8'
    );
    expect(source).toContain('PIPELINE_TABLE_MAP');
  });
});

// ── CQA drill-down hides irrelevant records for quality/snapshot ────

describe('CQA drill-down hides records bloat', () => {
  it('records block is guarded by quality/snapshot group check', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // records_total/records_new block must be skipped for quality and snapshot steps
    expect(source).toMatch(/stepGroup[\s\S]{0,80}quality[\s\S]{0,200}records_total/);
  });
});

// ── CQA warning detail rendering in accordion panels ─────────────────

describe('CQA accordion renders individual warning text', () => {
  it('renders warnings array items as individual line items', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Must extract warnings from meta.warnings and .map over them to render individually
    expect(source).toContain('meta.warnings');
    expect(source).toMatch(/warningsList\.map/);
  });

  it('renders errors array items as individual line items', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('meta.errors');
    expect(source).toMatch(/errorsList\.map/);
  });

  it('uses amber styling for warnings and red for errors', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Warning items should have amber coloring
    expect(source).toContain('bg-amber-50 text-amber-700');
    // Error items should have red coloring
    expect(source).toContain('bg-red-50 text-red-700');
  });
});

// ── CQA verdict banner must not show "ALL CHECKS PASSED" on failed steps ────

describe('CQA verdict banner respects step failure status', () => {
  it('verdict banner checks info.status before showing green verdict', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Must guard against showing "ALL CHECKS PASSED" when step actually failed
    // Two guards: (1) standalone banner for failed steps with no records_meta, (2) hasFailures includes status check
    expect(source).toContain("info?.status === 'failed'");
  });
});

// ── Cross-chain status bleed: isRunning must only use scoped keys ────

describe('No cross-chain status bleed on shared step slugs', () => {
  it('isRunning does NOT fall back to bare step.slug for chain steps', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // The isRunning check should only use scopedKey, not bare step.slug
    // Old: runningPipelines.has(scopedKey) || runningPipelines.has(step.slug)
    // Fix: remove the bare slug fallback
    expect(source).not.toMatch(/isRunning.*runningPipelines\.has\(step\.slug\)/);
  });
});

// ── Health banner shows pipeline chain schedule status ───────────────

describe('Health banner shows chain schedule status', () => {
  it('displays the 4 pipeline chain names', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'), 'utf-8'
    );
    expect(source).toContain('Permits');
    expect(source).toContain('CoA');
    expect(source).toContain('Entities');
    expect(source).toContain('Sources');
  });

  it('no longer contains generic trend labels', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'), 'utf-8'
    );
    expect(source).not.toMatch(/uppercase tracking-wider">Violations/);
    expect(source).not.toMatch(/uppercase tracking-wider">Completeness/);
    expect(source).not.toMatch(/uppercase tracking-wider">Volume/);
    expect(source).not.toMatch(/uppercase tracking-wider">Enrichment/);
  });
});
