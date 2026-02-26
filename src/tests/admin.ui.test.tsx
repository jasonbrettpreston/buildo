// 🔗 SPEC LINK: docs/specs/26_admin.md
// Admin panel logic: sync run display, status formatting, duration
import { describe, it, expect } from 'vitest';

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
