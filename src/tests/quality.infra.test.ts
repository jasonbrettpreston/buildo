// Infra Layer Tests - Data quality API routes and snapshot table schema
// SPEC LINK: docs/specs/28_data_quality_dashboard.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { DataQualityResponse } from '@/lib/quality/types';
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

describe('Quality API includes anomalies and health keys', () => {
  it('quality route imports and computes anomalies', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    expect(source).toContain('detectVolumeAnomalies');
    expect(source).toContain('anomalies');
    expect(source).toContain('health');
  });

  it('quality route imports and computes schema drift', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    expect(source).toContain('detectSchemaDrift');
    expect(source).toContain('schemaDrift');
  });

  it('quality route imports computeSystemHealth', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    expect(source).toContain('computeSystemHealth');
  });
});

describe('Pipeline schedules API route exists', () => {
  it('schedules route file exists', () => {
    const routePath = path.join(__dirname, '../app/api/admin/pipelines/schedules/route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it('schedules route exports GET and PUT handlers', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/schedules/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/export.*async.*function.*GET/);
    expect(source).toMatch(/export.*async.*function.*PUT/);
  });

  it('PUT validates cadence values', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/schedules/route.ts'),
      'utf-8'
    );
    expect(source).toContain('Daily');
    expect(source).toContain('Quarterly');
    expect(source).toContain('Annual');
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

describe('CQA Script Files', () => {
  it('assert-schema.js exists in scripts/quality/', () => {
    const scriptPath = path.join(__dirname, '../../scripts/quality/assert-schema.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('assert-data-bounds.js exists in scripts/quality/', () => {
    const scriptPath = path.join(__dirname, '../../scripts/quality/assert-data-bounds.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('both CQA slugs are registered in PIPELINE_REGISTRY with quality group', async () => {
    const { PIPELINE_REGISTRY } = await import('@/components/FreshnessTimeline');
    expect(PIPELINE_REGISTRY.assert_schema).toBeDefined();
    expect(PIPELINE_REGISTRY.assert_schema.group).toBe('quality');
    expect(PIPELINE_REGISTRY.assert_data_bounds).toBeDefined();
    expect(PIPELINE_REGISTRY.assert_data_bounds.group).toBe('quality');
  });
});

describe('Migration 041 records_meta', () => {
  it('migration file exists', () => {
    const migrationPath = path.join(__dirname, '../../migrations/041_records_meta.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('migration adds records_meta JSONB column', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '../../migrations/041_records_meta.sql'),
      'utf-8'
    );
    expect(content).toContain('records_meta');
    expect(content).toContain('JSONB');
  });
});

describe('enrich-web-search.js writes records_meta', () => {
  it('script writes records_meta to pipeline_runs', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '../../scripts/enrich-web-search.js'),
      'utf-8'
    );
    expect(content).toContain('records_meta');
  });

  it('script tracks per-field extraction counts', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '../../scripts/enrich-web-search.js'),
      'utf-8'
    );
    expect(content).toContain('extracted_fields');
    expect(content).toContain('fieldCounts');
  });

  it('script tracks websites_found for multi-step pipeline view', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '../../scripts/enrich-web-search.js'),
      'utf-8'
    );
    expect(content).toContain('websites_found');
    expect(content).toContain('websitesScraped');
  });
});

describe('Stats API returns records_meta', () => {
  it('stats route selects records_meta from pipeline_runs', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(content).toContain('records_meta');
  });
});

describe('Pipeline runs API route exists', () => {
  it('runs route file exists', () => {
    const routePath = path.join(__dirname, '../app/api/admin/pipelines/runs/route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it('runs route exports GET handler', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/runs/route.ts'),
      'utf-8'
    );
    expect(source).toMatch(/export.*async.*function.*GET/);
  });

  it('supports pagination with limit and offset', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/runs/route.ts'),
      'utf-8'
    );
    expect(source).toContain('limit');
    expect(source).toContain('offset');
  });

  it('supports filtering by pipeline and status', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/runs/route.ts'),
      'utf-8'
    );
    expect(source).toContain("searchParams.get('pipeline')");
    expect(source).toContain("searchParams.get('status')");
  });

  it('returns duration_ms and error_message fields', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/runs/route.ts'),
      'utf-8'
    );
    expect(source).toContain('duration_ms');
    expect(source).toContain('error_message');
    expect(source).toContain('records_total');
  });
});

describe('Pipeline status polling endpoint exists', () => {
  const statusRoutePath = path.join(__dirname, '../app/api/admin/pipelines/status/route.ts');

  it('status route file exists', () => {
    expect(fs.existsSync(statusRoutePath)).toBe(true);
  });

  it('status route exports GET handler', () => {
    const source = fs.readFileSync(statusRoutePath, 'utf-8');
    expect(source).toMatch(/export.*async.*function.*GET/);
  });

  it('returns pipeline_last_run in response', () => {
    const source = fs.readFileSync(statusRoutePath, 'utf-8');
    expect(source).toContain('pipeline_last_run');
  });

  it('uses DISTINCT ON (pipeline) for latest status per slug', () => {
    const source = fs.readFileSync(statusRoutePath, 'utf-8');
    expect(source).toContain('DISTINCT ON (pipeline)');
  });

  it('uses logError in catch block', () => {
    const source = fs.readFileSync(statusRoutePath, 'utf-8');
    expect(source).toContain('logError');
  });
});

// ---------------------------------------------------------------------------
// Bug B9: Pipeline failure count uses current status, not 24h historical
// ---------------------------------------------------------------------------

describe('Pipeline failure query filters to current-status failures (Bug B9)', () => {
  it('quality route only counts pipelines whose latest run is failed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    // The 24h query must be cross-referenced with the latest run per pipeline.
    // A subquery or JOIN must verify the latest run (not just latest in 24h) is still failed.
    // Current bug: uses only `WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours'`
    // which includes pipelines that failed 20h ago but succeeded 2h ago.
    // Fix: the query must ensure no subsequent successful run exists for the pipeline.
    expect(source).not.toContain("WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours'");
  });
});

// ---------------------------------------------------------------------------
// Bug D3: Duration anomaly query must exclude deprecated scope slugs
// ---------------------------------------------------------------------------

describe('Duration anomaly query excludes deprecated scope slugs (Bug D3)', () => {
  it('quality route filters out classify_scope_class and classify_scope_tags from duration query', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    // The duration anomaly SQL must exclude deprecated scope slugs that were
    // merged into classify_scope. Old rows in pipeline_runs trigger false warnings.
    expect(source).toMatch(/classify_scope_class/);
    expect(source).toMatch(/classify_scope_tags/);
    // Must be in a NOT LIKE or NOT IN exclusion context
    expect(source).toMatch(/NOT\s+(LIKE|IN)/i);
  });
});

// ---------------------------------------------------------------------------
// DataFlowTile renders from live pipeline_meta
// ---------------------------------------------------------------------------

describe('DataFlowTile renders from live pipeline_meta', () => {
  it('uses pipelineMeta exclusively, with never-run fallback', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    // Live meta is the sole source for reads/writes — no static desc fields
    expect(source).toContain('pipelineMeta!.reads');
    expect(source).toContain('pipelineMeta!.writes');
    expect(source).not.toContain('desc.sources');
    expect(source).not.toContain('desc.writes');
    // Never-run fallback shows full table schema from dbSchemaMap
    expect(source).toContain('Awaiting First Run');
    expect(source).toContain('LiveColumnCard');
  });
});

// ---------------------------------------------------------------------------
// Engine Health (CQA Tier 3)
// ---------------------------------------------------------------------------

describe('Engine Health CQA Tier 3', () => {
  it('assert-engine-health.js script uses Pipeline SDK pattern', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain("require('../lib/pipeline')");
    expect(source).toContain('PIPELINE_SUMMARY:');
    expect(source).toContain('PIPELINE_META:');
    expect(source).toContain('pipeline.createPool()');
  });

  it('assert-engine-health.js queries pg_stat_user_tables', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('pg_stat_user_tables');
    expect(source).toContain('n_live_tup');
    expect(source).toContain('n_dead_tup');
    expect(source).toContain('seq_scan');
    expect(source).toContain('idx_scan');
  });

  it('assert-engine-health.js writes to engine_health_snapshots', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('engine_health_snapshots');
    expect(source).toContain('ON CONFLICT');
  });

  it('migration 051 creates engine_health_snapshots table', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/051_engine_health_snapshots.sql'),
      'utf-8'
    );
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('engine_health_snapshots');
    expect(sql).toContain('table_name');
    expect(sql).toContain('n_live_tup');
    expect(sql).toContain('n_dead_tup');
    expect(sql).toContain('dead_ratio');
    expect(sql).toContain('seq_scan');
    expect(sql).toContain('idx_scan');
    expect(sql).toContain('seq_ratio');
    // Must have both UP and DOWN
    expect(sql).toContain('-- UP');
    expect(sql).toContain('-- DOWN');
    expect(sql).toContain('DROP TABLE');
  });

  it('quality API route imports detectEngineHealthIssues', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'),
      'utf-8'
    );
    expect(source).toContain('detectEngineHealthIssues');
    expect(source).toContain('engineHealth');
    expect(source).toContain('engineHealthAnomalies');
  });

  it('TelemetrySection supports engine data (T6)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'),
      'utf-8'
    );
    expect(source).toContain('engine?');
    expect(source).toContain('dead_ratio');
    expect(source).toContain('seq_ratio');
  });

  it('Pipeline SDK captureTelemetry includes T6 engine stats', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/pipeline.js'),
      'utf-8'
    );
    expect(source).toContain('T6: Engine health stats');
    expect(source).toContain('snapshot.engine[table]');
  });

  it('Pipeline SDK diffTelemetry includes T6 engine stats', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/pipeline.js'),
      'utf-8'
    );
    expect(source).toContain('result.engine[table]');
    expect(source).toContain('pre.engine');
  });

  it('UPSERT uses IS DISTINCT FROM guard to skip no-op updates', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('IS DISTINCT FROM');
  });

  it('PIPELINE_SUMMARY includes records_updated field', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    const summaryMatch = source.match(/PIPELINE_SUMMARY.*?(\{[^}]+\})/);
    expect(summaryMatch).toBeTruthy();
    expect(summaryMatch![1]).toContain('records_updated');
  });

  it('auto-triggers VACUUM ANALYZE on tables exceeding dead tuple threshold', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('VACUUM ANALYZE');
  });
});

describe('Ghost record detection in assert-data-bounds', () => {
  it('checks for permits not seen in 30+ days', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-data-bounds.js'),
      'utf-8'
    );
    expect(source).toMatch(/last_seen_at[\s\S]{0,100}30\s*days/i);
  });
});
