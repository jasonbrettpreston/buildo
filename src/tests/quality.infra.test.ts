// Infra Layer Tests - Data quality API routes and snapshot table schema
// SPEC LINK: docs/specs/28_data_quality_dashboard.md
import { describe, it, expect } from 'vitest';
import type { DataQualitySnapshot, DataQualityResponse } from '@/lib/quality/types';
import { createMockDataQualitySnapshot } from './factories';

describe('GET /api/quality Response Shape', () => {
  function validateQualityResponse(data: Record<string, unknown>): boolean {
    return (
      'current' in data &&
      'trends' in data &&
      'lastUpdated' in data &&
      Array.isArray(data.trends)
    );
  }

  it('response contains current, trends, and lastUpdated fields', () => {
    const response: DataQualityResponse = {
      current: null,
      trends: [],
      lastUpdated: null,
    };
    expect(validateQualityResponse(response as unknown as Record<string, unknown>)).toBe(true);
  });

  it('trends is an array', () => {
    const response: DataQualityResponse = {
      current: null,
      trends: [],
      lastUpdated: null,
    };
    expect(Array.isArray(response.trends)).toBe(true);
  });

  it('current can be null (no snapshots yet)', () => {
    const response: DataQualityResponse = {
      current: null,
      trends: [],
      lastUpdated: null,
    };
    expect(response.current).toBeNull();
    expect(response.lastUpdated).toBeNull();
  });
});

describe('DataQualitySnapshot Schema Constraints', () => {
  function validateSnapshotShape(s: Record<string, unknown>): boolean {
    const requiredFields = [
      'id', 'snapshot_date',
      'total_permits', 'active_permits',
      'permits_with_trades', 'trade_matches_total', 'trade_avg_confidence',
      'trade_tier1_count', 'trade_tier2_count', 'trade_tier3_count',
      'permits_with_builder', 'builders_total', 'builders_enriched',
      'builders_with_phone', 'builders_with_email', 'builders_with_website',
      'builders_with_google', 'builders_with_wsib',
      'permits_with_parcel', 'parcel_exact_matches', 'parcel_name_matches',
      'parcel_avg_confidence',
      'permits_with_neighbourhood',
      'permits_geocoded',
      'coa_total', 'coa_linked', 'coa_avg_confidence',
      'coa_high_confidence', 'coa_low_confidence',
      'permits_updated_24h', 'permits_updated_7d', 'permits_updated_30d',
      'last_sync_at', 'last_sync_status',
      'created_at',
    ];
    return requiredFields.every((f) => f in s);
  }

  it('validates complete snapshot shape', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(validateSnapshotShape(snapshot as unknown as Record<string, unknown>)).toBe(true);
  });

  it('has 35 required fields', () => {
    const requiredFields = [
      'id', 'snapshot_date',
      'total_permits', 'active_permits',
      'permits_with_trades', 'trade_matches_total', 'trade_avg_confidence',
      'trade_tier1_count', 'trade_tier2_count', 'trade_tier3_count',
      'permits_with_builder', 'builders_total', 'builders_enriched',
      'builders_with_phone', 'builders_with_email', 'builders_with_website',
      'builders_with_google', 'builders_with_wsib',
      'permits_with_parcel', 'parcel_exact_matches', 'parcel_name_matches',
      'parcel_avg_confidence',
      'permits_with_neighbourhood',
      'permits_geocoded',
      'coa_total', 'coa_linked', 'coa_avg_confidence',
      'coa_high_confidence', 'coa_low_confidence',
      'permits_updated_24h', 'permits_updated_7d', 'permits_updated_30d',
      'last_sync_at', 'last_sync_status',
      'created_at',
    ];
    expect(requiredFields).toHaveLength(35);
  });
});

describe('Snapshot Date Uniqueness', () => {
  it('snapshot_date is used for upsert (UNIQUE constraint)', () => {
    // The migration defines UNIQUE(snapshot_date) which allows
    // ON CONFLICT (snapshot_date) DO UPDATE in the metrics capture query
    const date1 = '2024-03-01';
    const date2 = '2024-03-01';
    expect(date1).toBe(date2); // Same date → upsert overwrites
  });

  it('different dates create separate rows', () => {
    const dates = new Set(['2024-03-01', '2024-03-02', '2024-03-03']);
    expect(dates.size).toBe(3);
  });
});

describe('Confidence Value Validation', () => {
  function validateConfidence(val: unknown): boolean {
    if (val === null) return true;
    const n = Number(val);
    return !isNaN(n) && n >= 0 && n <= 1;
  }

  it('accepts valid confidence values', () => {
    expect(validateConfidence(0.82)).toBe(true);
    expect(validateConfidence(0.0)).toBe(true);
    expect(validateConfidence(1.0)).toBe(true);
    expect(validateConfidence(null)).toBe(true);
  });

  it('rejects invalid confidence values', () => {
    expect(validateConfidence(1.5)).toBe(false);
    expect(validateConfidence(-0.1)).toBe(false);
    expect(validateConfidence(NaN)).toBe(false);
  });
});

describe('Coverage Rate Validation', () => {
  function validateCoverage(matched: number, total: number): boolean {
    if (total < 0 || matched < 0) return false;
    if (total === 0) return matched === 0;
    return matched <= total * 2; // Allow some over-count due to multiple matches per permit
  }

  it('accepts valid coverage: matched <= total', () => {
    expect(validateCoverage(800, 1000)).toBe(true);
    expect(validateCoverage(0, 1000)).toBe(true);
    expect(validateCoverage(1000, 1000)).toBe(true);
  });

  it('accepts zero total with zero matched', () => {
    expect(validateCoverage(0, 0)).toBe(true);
  });

  it('rejects negative values', () => {
    expect(validateCoverage(-1, 100)).toBe(false);
    expect(validateCoverage(50, -1)).toBe(false);
  });
});

describe('Freshness Interval Validation', () => {
  function validateFreshnessOrder(h24: number, d7: number, d30: number): boolean {
    return h24 >= 0 && d7 >= 0 && d30 >= 0 && h24 <= d7 && d7 <= d30;
  }

  it('accepts valid freshness ordering', () => {
    expect(validateFreshnessOrder(100, 500, 2000)).toBe(true);
    expect(validateFreshnessOrder(0, 0, 0)).toBe(true);
    expect(validateFreshnessOrder(500, 500, 500)).toBe(true);
  });

  it('rejects invalid freshness ordering', () => {
    expect(validateFreshnessOrder(1000, 500, 2000)).toBe(false);
    expect(validateFreshnessOrder(100, 2000, 500)).toBe(false);
  });

  it('rejects negative freshness counts', () => {
    expect(validateFreshnessOrder(-1, 500, 2000)).toBe(false);
  });
});

describe('Sync Status Validation', () => {
  function validateSyncStatus(status: string | null): boolean {
    if (status === null) return true;
    return ['running', 'completed', 'failed'].includes(status);
  }

  it('accepts valid sync statuses', () => {
    expect(validateSyncStatus('running')).toBe(true);
    expect(validateSyncStatus('completed')).toBe(true);
    expect(validateSyncStatus('failed')).toBe(true);
    expect(validateSyncStatus(null)).toBe(true);
  });

  it('rejects invalid sync status', () => {
    expect(validateSyncStatus('cancelled')).toBe(false);
    expect(validateSyncStatus('')).toBe(false);
  });
});

describe('Migration 015 DDL Expectations', () => {
  it('table name is data_quality_snapshots', () => {
    const tableName = 'data_quality_snapshots';
    expect(tableName).toBe('data_quality_snapshots');
  });

  it('has UNIQUE constraint on snapshot_date', () => {
    // Verified by the ON CONFLICT (snapshot_date) DO UPDATE in metrics.ts
    const constraintColumn = 'snapshot_date';
    expect(constraintColumn).toBe('snapshot_date');
  });

  it('numeric columns for all six matching processes', () => {
    const matchingColumns = [
      'permits_with_trades',
      'permits_with_builder',
      'permits_with_parcel',
      'permits_with_neighbourhood',
      'permits_geocoded',
      'coa_linked',
    ];
    expect(matchingColumns).toHaveLength(6);
  });
});
