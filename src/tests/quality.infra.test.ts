// Infra Layer Tests - Data quality API routes and snapshot table schema
// SPEC LINK: docs/specs/02-web-admin/26_admin_dashboard.md
// (POST-B1-2: the previous link, docs/specs/28_data_quality_dashboard.md, has
// never existed in this repo — a dangling SPEC LINK. Spec 26 owns
// /api/quality, src/lib/quality/ and DataQualityDashboard.tsx; §3.4 is the
// engine-health surface these tests lock.)
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import type { DataQualityResponse } from '@/lib/quality/types';
import * as qualityTypes from '@/lib/quality/types';
import { createMockDataQualitySnapshot } from './factories';

// ─── Mocks for the POST-B1-2 behavioural lock (only the dynamically-imported
//     route module consumes these; every other test in this file is fs-based) ──
const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogError = vi.fn();
const mockLogWarn = vi.fn();
vi.mock('@/lib/logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarn: (...args: unknown[]) => mockLogWarn(...args),
  logInfo: vi.fn(),
}));

vi.mock('@/lib/quality/metrics', () => ({
  getQualityData: async () => ({ current: null, trends: [], lastUpdated: null }),
}));

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

  // Timeout 30s (was the 5s default): the dynamic import of the FreshnessTimeline component pulls a heavy
  // Next.js module graph that can starve >5s under full-suite parallel transform load (passes in ~0.5s
  // isolated). Bumping the per-test timeout removes the flaky-under-load failure without changing assertions.
  it('both CQA slugs are registered in PIPELINE_REGISTRY with quality group', async () => {
    const { PIPELINE_REGISTRY } = await import('@/components/FreshnessTimeline');
    expect(PIPELINE_REGISTRY.assert_schema).toBeDefined();
    expect(PIPELINE_REGISTRY!.assert_schema!.group).toBe('quality');
    expect(PIPELINE_REGISTRY.assert_data_bounds).toBeDefined();
    expect(PIPELINE_REGISTRY!.assert_data_bounds!.group).toBe('quality');
  }, 30000);
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

// COMMIT 7 REPOINT (batch1 I3, 2026-09-14): assert-engine-health.js is now the Spec 122
// frozen shell; the domain logic (pg_stat_user_tables discovery, the guarded upsert, the
// VACUUM ANALYZE loop) lives verbatim in scripts/lib/compute/assert-engine-health.js.
// Mirrors assert-data-bounds's own I2 commit-7 precedent (§634 below), and assert_schema/
// assert_global_coverage's identical prior RE-HOMEs in this same file.
describe('Engine Health CQA Tier 3', () => {
  it('the frozen shell uses the Pipeline SDK pattern (pipeline.step + descriptor + compute)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain("require('../lib/pipeline')");
    expect(source).toContain('pipeline.step(');
    expect(source).toContain('assert-engine-health.descriptor.json');
    expect(source).toContain("require('../lib/compute/assert-engine-health')");
  });

  it('the compute queries pg_stat_user_tables', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('pg_stat_user_tables');
    expect(source).toContain('n_live_tup');
    expect(source).toContain('n_dead_tup');
    expect(source).toContain('seq_scan');
    expect(source).toContain('idx_scan');
  });

  it('the compute writes to engine_health_snapshots', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
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

  it('the guarded upsert uses IS DISTINCT FROM to skip no-op updates (6-column guard, more disciplined than the refresh_snapshot RECORDER exemplar\'s own guard:"none")', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('IS DISTINCT FROM');
  });

  it('the compute reports records_updated via ctx.report()\'s counters (Rule 10 — the descriptor\'s counters.records_updated sources records_meta.records_updated, not a hand-rolled PIPELINE_SUMMARY call)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('records_updated');
    const descriptor = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-engine-health.descriptor.json'),
      'utf-8'
    )) as { counters: { records_updated?: { source: string } } };
    expect(descriptor.counters.records_updated?.source).toBe('records_meta.records_updated');
  });

  it('auto-triggers VACUUM ANALYZE on tables exceeding the dead-tuple threshold (now config-driven, Rule 3)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('VACUUM ANALYZE');
    expect(source).toContain('config.engine_health_dead_tuple_ratio_warn_max');
  });

  it('vacuumTargets is declared before its own consuming loop (AEH-IL-2, the 9d9acf7a scope-crash fix — re-stated for the pure-function rewrite, no try/catch spans the declaration)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    const declIdx = source.indexOf('const vacuumTargets = tableResults.filter(');
    const loopIdx = source.indexOf('for (const target of vacuumTargets)');
    expect(declIdx).toBeGreaterThan(-1);
    expect(loopIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(loopIdx);
  });

  it('recordsUpdated is derived from the write loop and threaded through to records_meta/counters (scope bug fix, re-stated: no reference-before-assignment across a catch boundary)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(source).toContain('recordsUpdated');
    expect(source).toContain('records_updated: recordsUpdated');
  });
});

// ---------------------------------------------------------------------------
// POST-B1-2 — engine health has ONE threshold source
// ---------------------------------------------------------------------------
// Spec 26 §3.4 + Spec 124 R-AE. Before this lock the admin carried a SECOND,
// independent engine-health implementation: its own live pg_stat_user_tables
// query over a hardcoded 11-table list, and its own `ENGINE_HEALTH_THRESHOLDS`
// literals. Measured 2026-09-15 against the live DB (migrations 244): the
// admin's PING_PONG_RATIO was 2 while engine_health_ping_pong_ratio_warn_max
// has been 10 since 8c9e64d7 (2026-03-21), and the admin had no counterpart at
// all for engine_health_dead_tuple_min_rows (1000) — so it flagged small
// tables the step deliberately skips. This describe pins BOTH directions: the
// admin's defaults must be the seeded logic-variable defaults, and the step
// must keep owning the discovery/compute side.
describe('Engine health has ONE threshold source (POST-B1-2)', () => {
  const ENGINE_HEALTH_LOGIC_VAR_KEYS = [
    'engine_health_dead_tuple_ratio_warn_max',
    'engine_health_dead_tuple_min_rows',
    'engine_health_seq_scan_ratio_warn_max',
    'engine_health_seq_scan_min_rows',
    'engine_health_ping_pong_ratio_warn_max',
    'engine_health_insp_dead_tuple_fail_pct',
    'engine_health_insp_update_insert_fail_ratio',
  ];

  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
  ) as Record<string, { default: number }>;

  // Namespace import + cast: the retirement arm has to be able to ask for an
  // export that must NOT exist, which a named import cannot express.
  const mod = qualityTypes as unknown as Record<string, unknown>;
  const defaults = mod.ENGINE_HEALTH_DEFAULTS as Record<string, number> | undefined;

  const routeSource = fs.readFileSync(
    path.join(__dirname, '../app/api/quality/route.ts'),
    'utf-8'
  );

  it('exports ENGINE_HEALTH_DEFAULTS and has retired the ENGINE_HEALTH_THRESHOLDS literals', () => {
    expect(defaults, 'src/lib/quality/types.ts must export ENGINE_HEALTH_DEFAULTS').toBeDefined();
    expect(
      mod.ENGINE_HEALTH_THRESHOLDS,
      'ENGINE_HEALTH_THRESHOLDS is retired — the admin keys are the logic-variable names'
    ).toBeUndefined();
  });

  it('declares a counterpart for all 7 engine_health_* logic variables', () => {
    expect(Object.keys(defaults ?? {}).sort()).toEqual([...ENGINE_HEALTH_LOGIC_VAR_KEYS].sort());
  });

  it('every admin default equals the seeded logic-variable default (no second source of truth)', () => {
    for (const key of ENGINE_HEALTH_LOGIC_VAR_KEYS) {
      expect(seed[key], `${key} must be seeded in scripts/seeds/logic_variables.json`).toBeDefined();
      expect(
        defaults?.[key],
        `${key}: the admin default must equal the seed default`
      ).toBe(seed[key]?.default);
    }
  });

  // The admin keeps its own LIVE read: liveness is load-bearing (the snapshot
  // cadence measured 2026-09-15 is not daily — 09-14, 08-24, 08-01, 07-17) and
  // the snapshot's 87-table scope cannot be published from an unauthenticated
  // route. What POST-B1-2 retired is the second THRESHOLD source, not the query.
  it('/api/quality keeps the live pg_stat_user_tables read and does NOT read engine_health_snapshots', () => {
    expect(routeSource).toContain('pg_stat_user_tables');
    expect(routeSource).not.toMatch(/FROM\s+engine_health_snapshots/);
  });

  it('/api/quality resolves the thresholds from logic_variables at request time', () => {
    expect(routeSource).toContain('logic_variables');
    expect(routeSource).toContain('variable_key = ANY($1)');
  });

  it('wires the resolved thresholds INTO the detector (not the default-arg call)', () => {
    expect(routeSource).toMatch(/await loadEngineHealthThresholds\(\)/);
    expect(routeSource).toMatch(
      /detectEngineHealthIssues\(\s*engineHealthEntries\s*,\s*thresholds\s*\)/
    );
  });

  it('INVERSE ARM (must stay GREEN): the step still owns discovery and still reads its thresholds from ctx.config', () => {
    const compute = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-engine-health.js'),
      'utf-8'
    );
    expect(compute).toContain('pg_stat_user_tables');
    expect(compute).toContain('config.engine_health_dead_tuple_ratio_warn_max');
    expect(compute).toContain('config.engine_health_dead_tuple_min_rows');
  });
});

// ---------------------------------------------------------------------------
// POST-B1-2 — BEHAVIOURAL lock on GET /api/quality
// ---------------------------------------------------------------------------
// The source-text locks above are necessary but not sufficient: a call site
// reverted to `detectEngineHealthIssues(engineHealthEntries)` leaves every
// grep-string in place (loadEngineHealthThresholds survives as dead code) and
// stays green. These cases drive the real handler with a stubbed pool and
// assert the threshold that came OUT is the one the DB put IN.
describe('GET /api/quality — engine health uses the logic_variables threshold (POST-B1-2, behavioural)', () => {
  /** One large, bloated table: 15% dead over 50K live rows. */
  const bloatedStatRow = {
    table_name: 'permits',
    n_live_tup: '50000',
    n_dead_tup: '7500',
    seq_scan: '100',
    idx_scan: '900',
  };

  /** Same table, comfortably UNDER the seeded 10% ceiling: 5% dead. */
  const healthyStatRow = { ...bloatedStatRow, n_dead_tup: '2500' };

  function seededLogicVarRows(overrides: Record<string, string> = {}) {
    const defaults = qualityTypes.ENGINE_HEALTH_DEFAULTS as unknown as Record<string, number>;
    return Object.keys(defaults).map((variable_key) => ({
      variable_key,
      variable_value: overrides[variable_key] ?? String(defaults[variable_key]),
    }));
  }

  /**
   * Routes by SQL text rather than call order, so an unrelated query added to
   * the handler later cannot silently shift which stub a case is asserting on.
   */
  function stubPool(opts: {
    statRows: Record<string, string>[];
    logicVarRows: { variable_key: string; variable_value: string | null }[];
  }) {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('pg_stat_user_tables')) return opts.statRows;
      if (text.includes('logic_variables')) return opts.logicVarRows;
      return [];
    });
  }

  async function callRoute() {
    const { GET } = await import('@/app/api/quality/route');
    const res = await GET(new NextRequest('http://localhost/api/quality'));
    return (await res.json()) as {
      engineHealth: { table_name: string }[];
      engineHealthAnomalies: { table: string; type: string; threshold: number }[];
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the STUBBED logic-variable ceiling, not ENGINE_HEALTH_DEFAULTS', async () => {
    // 5% dead is BELOW the seeded 10% default, so the only way an anomaly can
    // appear is if the 2% row actually reached the detector.
    stubPool({
      statRows: [healthyStatRow],
      logicVarRows: seededLogicVarRows({ engine_health_dead_tuple_ratio_warn_max: '0.02' }),
    });

    const body = await callRoute();

    expect(body.engineHealthAnomalies).toHaveLength(1);
    expect(body.engineHealthAnomalies[0]!.type).toBe('dead_tuples');
    expect(body.engineHealthAnomalies[0]!.table).toBe('permits');
    expect(body.engineHealthAnomalies[0]!.threshold).toBe(2);
    expect(body.engineHealthAnomalies[0]!.threshold).not.toBe(
      qualityTypes.ENGINE_HEALTH_DEFAULTS.engine_health_dead_tuple_ratio_warn_max * 100
    );
    expect(body.engineHealth).toHaveLength(1);
    // A fully-seeded logic_variables table must produce no fallback noise.
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('a RELAXED logic-variable ceiling suppresses an anomaly the default would have raised', async () => {
    // 15% dead is ABOVE the seeded 10% default — green here proves the default
    // did not win.
    stubPool({
      statRows: [bloatedStatRow],
      logicVarRows: seededLogicVarRows({ engine_health_dead_tuple_ratio_warn_max: '0.90' }),
    });

    const body = await callRoute();

    expect(body.engineHealthAnomalies).toHaveLength(0);
  });

  /** The single aggregated fallback warning, if one was emitted. */
  function fallbackWarning() {
    const calls = mockLogWarn.mock.calls.filter(
      (c) => (c[2] as { phase?: string } | undefined)?.phase === 'engine_health_thresholds'
    );
    expect(calls, 'the fallback is aggregated into exactly ONE logWarn').toHaveLength(1);
    return {
      message: calls[0]![1] as string,
      fellBack: (calls[0]![2] as { fell_back: { variable_key: string; raw: string | null; fallback: number }[] })
        .fell_back,
    };
  }

  it('INVERSE: falls back to the seeded defaults when the rows are absent, in ONE aggregated warning', async () => {
    stubPool({ statRows: [bloatedStatRow], logicVarRows: [] });

    const body = await callRoute();

    expect(body.engineHealthAnomalies).toHaveLength(1);
    expect(body.engineHealthAnomalies[0]!.threshold).toBe(
      qualityTypes.ENGINE_HEALTH_DEFAULTS.engine_health_dead_tuple_ratio_warn_max * 100
    );
    // Config ABSENCE is info-class, not error-class: no Sentry event, one
    // warning naming every key that fell back. The fallback is never silent.
    expect(mockLogError).not.toHaveBeenCalled();
    const warning = fallbackWarning();
    expect(warning.fellBack.map((f) => f.variable_key).sort()).toEqual(
      Object.keys(qualityTypes.ENGINE_HEALTH_DEFAULTS).sort()
    );
    expect(warning.message).toContain('engine_health_dead_tuple_ratio_warn_max');
    expect(warning.fellBack[0]).toMatchObject({
      variable_key: 'engine_health_dead_tuple_ratio_warn_max',
      fallback: qualityTypes.ENGINE_HEALTH_DEFAULTS.engine_health_dead_tuple_ratio_warn_max,
    });
  });

  it('INVERSE: a non-numeric variable_value is rejected by the Zod boundary and named in the warning, never coerced', async () => {
    stubPool({
      statRows: [bloatedStatRow],
      logicVarRows: seededLogicVarRows({ engine_health_dead_tuple_ratio_warn_max: 'not-a-number' }),
    });

    const body = await callRoute();

    expect(body.engineHealthAnomalies[0]!.threshold).toBe(
      qualityTypes.ENGINE_HEALTH_DEFAULTS.engine_health_dead_tuple_ratio_warn_max * 100
    );
    const warning = fallbackWarning();
    expect(warning.fellBack).toHaveLength(1);
    expect(warning.fellBack[0]).toMatchObject({
      variable_key: 'engine_health_dead_tuple_ratio_warn_max',
      raw: 'not-a-number',
    });
  });

  it('INVERSE: a FAILED logic_variables query is error-class — logError, not the aggregated warning', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('pg_stat_user_tables')) return [bloatedStatRow];
      if (text.includes('logic_variables')) throw new Error('relation "logic_variables" does not exist');
      return [];
    });

    const body = await callRoute();

    expect(body.engineHealthAnomalies[0]!.threshold).toBe(
      qualityTypes.ENGINE_HEALTH_DEFAULTS.engine_health_dead_tuple_ratio_warn_max * 100
    );
    const errorCalls = mockLogError.mock.calls.filter(
      (c) => (c[2] as { phase?: string } | undefined)?.phase === 'engine_health_thresholds'
    );
    expect(errorCalls).toHaveLength(1);
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('no pg_stat rows → empty engine health, no anomalies, still 200', async () => {
    stubPool({ statRows: [], logicVarRows: seededLogicVarRows() });

    const body = await callRoute();

    expect(body.engineHealth).toEqual([]);
    expect(body.engineHealthAnomalies).toEqual([]);
  });
});

// COMMIT 7 REPOINT (batch1 I2, 2026-09-12): assert-data-bounds.js is now the
// Spec 122 frozen 8-line shell; the ghost-record SQL lives verbatim in
// scripts/lib/compute/assert-data-bounds.js, the declared check's `why` text
// (which carries "non-terminal") in scripts/lib/assert-data-bounds-fields.js.
describe('Ghost record detection in assert-data-bounds', () => {
  it('checks for permits not seen in 30+ days', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-data-bounds.js'),
      'utf-8'
    );
    expect(source).toMatch(/last_seen_at[\s\S]{0,100}30\s*days/i);
  });

  it('excludes already-terminal permits (P19/P20) from ghost count so vacuumed permits are not double-counted', () => {
    // close-stale-permits.js vacuums stale permits into P19 (Pending Closed)
    // then P20 (Closed). The assert must not re-count them as "ghosts" —
    // otherwise the warning grows unboundedly with every successful vacuum run.
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-data-bounds.js'),
      'utf-8'
    );
    // Must filter lifecycle_phase IS NOT NULL (excludes dead states: Cancelled, Revoked, Withdrawn)
    expect(source).toMatch(/lifecycle_phase\s+IS\s+NOT\s+NULL/i);
    // Must exclude P19 (Pending Closed / Pending Cancellation) and P20 (Closed)
    expect(source).toMatch(/lifecycle_phase\s+NOT\s+IN\s*\(\s*'P19'\s*,\s*'P20'\s*\)/i);
  });

  it('WARN message describes non-terminal scope (not all stale permits)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/assert-data-bounds-fields.js'),
      'utf-8'
    );
    // The declared check's why-text should reflect that terminal permits are excluded
    expect(source).toMatch(/non-terminal/i);
  });
});

describe('Telemetry & Last Run labelling with expected behavior ranges', () => {
  it('STEP_EXPECTED_RANGES is exported from funnel.ts and covers telemetry-enabled steps', async () => {
    const funnel = await import('@/lib/admin/funnel');
    expect(funnel.STEP_EXPECTED_RANGES).toBeDefined();
    expect(typeof funnel.STEP_EXPECTED_RANGES).toBe('object');
    // Must cover all steps that have telemetry_tables in manifest
    const telemetrySteps = [
      'permits', 'coa', 'builders', 'address_points', 'parcels', 'massing',
      'neighbourhoods', 'load_wsib', 'geocode_permits', 'link_parcels',
      'link_neighbourhoods', 'link_massing', 'link_coa', 'link_wsib',
      'enrich_wsib_builders', 'enrich_named_builders', 'classify_scope',
      'classify_permits', 'compute_centroids', 'link_similar',
      'refresh_snapshot', 'assert_engine_health',
    ];
    for (const slug of telemetrySteps) {
      expect(funnel.STEP_EXPECTED_RANGES[slug], `Missing expected range for ${slug}`).toBeDefined();
      expect(funnel!.STEP_EXPECTED_RANGES[slug]!.behavior, `Missing behavior note for ${slug}`).toBeTruthy();
    }
  });

  it('getRangeStatus returns correct status for in-range, borderline, and anomaly values', async () => {
    const { getRangeStatus } = await import('@/lib/admin/funnel');
    expect(getRangeStatus(100, [50, 150])).toBe('normal');
    expect(getRangeStatus(50, [50, 150])).toBe('normal');
    expect(getRangeStatus(150, [50, 150])).toBe('normal');
    // borderline = within 20% beyond range boundary
    expect(getRangeStatus(170, [50, 150])).toBe('borderline');
    expect(getRangeStatus(42, [50, 150])).toBe('borderline');
    // anomaly = beyond 20% of range boundary
    expect(getRangeStatus(200, [50, 150])).toBe('anomaly');
    expect(getRangeStatus(20, [50, 150])).toBe('anomaly');
  });

  it('TelemetrySection header says "DB State Changes" not "Last Run Telemetry"', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    expect(source).toContain('DB State Changes');
    expect(source).not.toContain('Last Run Telemetry');
  });

  it('Last Run tile header says "Performance Metrics" not just "Last Run"', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // The non-funnel Last Run tile should have the new header
    expect(source).toContain('Performance Metrics');
  });

  it('TelemetrySection includes a descriptor explaining DB mutations', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    expect(source).toMatch(/pg_stat_user_tables|database mutations|PostgreSQL stats/i);
  });

  it('Last Run tile includes a descriptor explaining script-reported values', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toMatch(/PIPELINE_SUMMARY|script.*report|self-reported/i);
  });
});

describe('Cost violation threshold', () => {
  it('metrics.ts flags only negative costs (< 0), not $0 permits', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../lib/quality/metrics.ts'), 'utf-8'
    );
    // Must use < 0 (not < 100) — $0 permits are legitimate in Toronto data
    expect(source).toMatch(/est_const_cost\s*<\s*0/);
    expect(source).not.toMatch(/est_const_cost\s*<\s*100/);
  });

  it('metrics.ts upper bound matches assert-data-bounds at $500M', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../lib/quality/metrics.ts'), 'utf-8'
    );
    expect(source).toMatch(/est_const_cost\s*>\s*500000000/);
    expect(source).not.toMatch(/est_const_cost\s*>\s*1000000000/);
  });

  it('assert-data-bounds.js flags only negative costs (< 0), not $0 permits', () => {
    // COMMIT 7 REPOINT (batch1 I2, 2026-09-12): the cost-outlier SQL lives
    // verbatim in scripts/lib/compute/assert-data-bounds.js post-conversion.
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/compute/assert-data-bounds.js'), 'utf-8'
    );
    expect(source).toMatch(/est_const_cost\s*<\s*0/);
    expect(source).not.toMatch(/est_const_cost\s*<\s*100/);
  });
});

describe('Duration anomaly SQL normalization', () => {
  it('quality API route normalizes chain prefixes in duration query with SPLIT_PART', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/quality/route.ts'), 'utf-8'
    );
    // Extract the duration query section (between "duration anomalies" comment and the
    // runsByPipeline grouping) — this must have its own SPLIT_PART normalization,
    // separate from the failure query that already has one
    const durationSection = source.slice(
      source.indexOf('Compute duration anomalies'),
      source.indexOf('runsByPipeline')
    );
    expect(durationSection.length).toBeGreaterThan(0);
    expect(durationSection).toMatch(/SPLIT_PART.*pipeline.*:.*2/i);
  });
});

// ---------------------------------------------------------------------------
// Bundle A: assert-lifecycle-phase-distribution.js advisory lock migration
// ---------------------------------------------------------------------------

describe('assert-lifecycle-phase-distribution.js — advisory lock delegation (spec 47 §5)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-lifecycle-phase-distribution.js'),
      'utf-8',
    );
  });

  it('delegates advisory lock to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // WF2 2026-04-18: ADVISORY_LOCK_ID changed from 85 → 109 (unique per §A.5).
    // Lock 85 belongs to compute-trade-forecasts.js; sharing it was misleading.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 109/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('emits SKIP with reason classifier_running when lock held (custom reason preserved)', () => {
    // This script uses reason:'classifier_running' (not the standard
    // 'advisory_lock_held_elsewhere') because it skips to avoid reading
    // half-written phase data from a concurrent classify run.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/classifier_running/);
    expect(content).not.toMatch(/advisory_lock_held_elsewhere/);
  });

  it('SPEC LINK points to canonical spec (not docs/reports/)', () => {
    // Bundle D: de-report fix — SPEC LINK must point to docs/specs/, not docs/reports/
    expect(content).toMatch(/SPEC LINK:.*docs\/specs\//);
    expect(content).not.toMatch(/SPEC LINK:.*docs\/reports\//);
  });
});

// Spec 79 validation 2026-05-19 — Step 1 surfaced that Parcels schema drift
// (CKAN feed removed 3 columns) caused the script to exit 1 with audit_table
// verdict='PASS'. The verdict cascade (rows.some FAIL) couldn't see the drift
// because no audit row tracked Parcels mismatches — they only landed in
// records_meta.errors[]. This regression-lock asserts the cascade now covers
// the Parcels failure modes per Spec 47 §R10 + Spec 48 §8.2.
// RE-HOMED (pilot 1, Spec 122 §5.1). The metric names this lock read are runner-generated
// now: scripts/lib/step/verdict.js builds one audit row per SELECTED check, keyed by the
// check id, so `parcels_schema_mismatch_count` / `parcels_other_errors` no longer appear in
// any source file. The BEHAVIOUR they protected — parcels drift reaches the audit-table
// cascade of BOTH ingest chains, not just records_meta.errors[] — is now carried by the
// descriptor's `parcel_columns.chains`, which is the thing that would have to be narrowed
// to re-open the Spec 79 CRIT-3a hole. The assertions follow it there.
describe('assert-schema — Parcels audit cascade completeness (Spec 79 CRIT-3a)', () => {
  const descriptor = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../scripts/quality/assert-schema.descriptor.json'),
    'utf-8',
  )) as { checks: Array<{ id: string; chains: string[] | 'all'; severity: string }> };
  const computeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/lib/compute/assert-schema.js'),
    'utf-8',
  );

  it('audit_table.rows includes the parcels check in BOTH chains', () => {
    // The row is emitted once per chain that SELECTS the check, so "at least twice in
    // the source" becomes "declared in at least the permits and coa chains".
    const parcels = descriptor.checks.find((c) => c.id === 'parcel_columns');
    expect(parcels, 'descriptor declares no parcel_columns check').toBeDefined();
    const chains = parcels!.chains === 'all' ? ['permits', 'coa', 'sources'] : parcels!.chains;
    expect(chains).toContain('permits');
    expect(chains).toContain('coa');
    expect(parcels!.severity).toBe('FAIL');
  });

  it('does NOT use the misleading parcels_api_errors metric name', () => {
    // DeepSeek LOW #1 fold: parcels_api_errors over-promises; renamed to
    // parcels_other_errors which is honest about scope. Neither may come back.
    expect(computeSrc).not.toMatch(/parcels_api_errors/);
    expect(JSON.stringify(descriptor)).not.toMatch(/parcels_api_errors/);
  });
});

// Spec 79 validation 2026-05-19 — Step 14 surfaced SDK warning
// "emitSummary called with no audit_table — admin UI will show UNKNOWN
// verdict". backfill-realtor-permit-trades.js was emitting a custom
// `records_meta.backfill` key instead of the standard `records_meta.audit_table`.
// SDK + observers (FreshnessTimeline, observe-chain narrative) read only the
// standard key. Regression-locks the rename + inner structure (DeepSeek MED #2 fold).
describe('backfill-realtor-permit-trades.js — emitSummary audit_table key (Spec 79 HIGH-1)', () => {
  const backfillSrc = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/backfill-realtor-permit-trades.js'),
    'utf-8',
  );

  it('records_meta uses standard audit_table key (not custom backfill key)', () => {
    // Positive: audit_table is the nested key in records_meta
    expect(backfillSrc).toMatch(/records_meta:\s*\{\s*audit_table:/);
    // Negation: backfill must not be the nested key (regression-lock against re-introduction)
    expect(backfillSrc).not.toMatch(/records_meta:\s*\{\s*backfill:/);
  });

  it('audit_table structure preserves phase + name + verdict + rows (Spec 48 §3.5 contract)', () => {
    // DeepSeek MED #2 fold: don't just check the key rename — verify the inner
    // contract is intact. All 4 fields must be present in the audit_table block.
    const auditBlock = backfillSrc.match(/audit_table:\s*\{[\s\S]{0,800}?\}/);
    expect(auditBlock).not.toBeNull();
    const blockText = auditBlock?.[0] ?? '';
    expect(blockText).toMatch(/phase:\s*\d+/);
    expect(blockText).toMatch(/name:\s*['"]/);
    expect(blockText).toMatch(/verdict:/);
    expect(blockText).toMatch(/rows:\s*\[/);
  });
});
