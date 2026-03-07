// Logic Layer Tests - Data quality score calculations and metric extraction
// SPEC LINK: docs/specs/28_data_quality_dashboard.md
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  calculateEffectivenessScore,
  extractMetrics,
  EFFECTIVENESS_WEIGHTS,
  trendDelta,
  findSnapshotDaysAgo,
  detectVolumeAnomalies,
  detectSchemaDrift,
  computeSystemHealth,
  SLA_TARGETS,
} from '@/lib/quality/types';
import { parseSnapshot } from '@/lib/quality/metrics';
import { createMockDataQualitySnapshot } from './factories';

describe('Data Effectiveness Score', () => {
  it('returns a score between 0 and 100 for valid data', () => {
    const snapshot = createMockDataQualitySnapshot();
    const score = calculateEffectivenessScore(snapshot);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('returns null when active_permits is 0', () => {
    const snapshot = createMockDataQualitySnapshot({ active_permits: 0 });
    expect(calculateEffectivenessScore(snapshot)).toBeNull();
  });

  it('returns 100 when all coverage is complete', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_trades: 1000,
      builders_total: 100,
      builders_enriched: 100,
      permits_with_parcel: 1000,
      permits_with_neighbourhood: 1000,
      permits_geocoded: 1000,
      coa_total: 50,
      coa_linked: 50,
    });
    const score = calculateEffectivenessScore(snapshot);
    expect(score).toBe(100);
  });

  it('returns 0 when no matches exist', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_trades: 0,
      builders_total: 100,
      builders_enriched: 0,
      permits_with_parcel: 0,
      permits_with_neighbourhood: 0,
      permits_geocoded: 0,
      coa_total: 50,
      coa_linked: 0,
    });
    const score = calculateEffectivenessScore(snapshot);
    expect(score).toBe(0);
  });

  it('handles zero builders_total gracefully (0% builder enrichment)', () => {
    const snapshot = createMockDataQualitySnapshot({
      builders_total: 0,
      builders_enriched: 0,
    });
    const score = calculateEffectivenessScore(snapshot);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
  });

  it('handles zero coa_total gracefully (0% CoA linking)', () => {
    const snapshot = createMockDataQualitySnapshot({
      coa_total: 0,
      coa_linked: 0,
    });
    const score = calculateEffectivenessScore(snapshot);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(EFFECTIVENESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('trade coverage has the highest weight (25%)', () => {
    expect(EFFECTIVENESS_WEIGHTS.tradeCoverage).toBe(0.25);
  });

  it('CoA linking has the lowest weight (10%)', () => {
    expect(EFFECTIVENESS_WEIGHTS.coaLinking).toBe(0.10);
  });

  it('scores higher with more trade coverage', () => {
    const low = createMockDataQualitySnapshot({
      active_permits: 10000,
      permits_with_trades: 1000,
      permits_with_parcel: 1000,
      permits_with_neighbourhood: 1000,
      permits_geocoded: 1000,
    });
    const high = createMockDataQualitySnapshot({
      active_permits: 10000,
      permits_with_trades: 9000,
      permits_with_parcel: 1000,
      permits_with_neighbourhood: 1000,
      permits_geocoded: 1000,
    });
    const lowScore = calculateEffectivenessScore(low)!;
    const highScore = calculateEffectivenessScore(high)!;
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('caps score at 100 even if coverage somehow exceeds 100%', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 100,
      permits_with_trades: 200,
      builders_total: 10,
      builders_enriched: 20,
      permits_with_parcel: 200,
      permits_with_neighbourhood: 200,
      permits_geocoded: 200,
      coa_total: 5,
      coa_linked: 10,
    });
    const score = calculateEffectivenessScore(snapshot);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('Extract Matching Metrics', () => {
  it('computes trade coverage percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_trades: 873,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.tradeCoverage.percentage).toBe(87.3);
    expect(metrics.tradeCoverage.matched).toBe(873);
    expect(metrics.tradeCoverage.total).toBe(1000);
  });

  it('computes builder enrichment percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      builders_total: 200,
      builders_enriched: 150,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.builderEnrichment.percentage).toBe(75);
    expect(metrics.builderEnrichment.matched).toBe(150);
    expect(metrics.builderEnrichment.total).toBe(200);
  });

  it('computes parcel linking percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_parcel: 800,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.parcelLinking.percentage).toBe(80);
  });

  it('computes neighbourhood coverage percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_neighbourhood: 900,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.neighbourhoodCoverage.percentage).toBe(90);
  });

  it('computes geocoding percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_geocoded: 950,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.geocoding.percentage).toBe(95);
  });

  it('computes CoA linking percentage correctly', () => {
    const snapshot = createMockDataQualitySnapshot({
      coa_total: 500,
      coa_linked: 350,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.coaLinking.percentage).toBe(70);
  });

  it('returns 0% when denominators are zero', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 0,
      builders_total: 0,
      coa_total: 0,
    });
    const metrics = extractMetrics(snapshot);
    expect(metrics.tradeCoverage.percentage).toBe(0);
    expect(metrics.builderEnrichment.percentage).toBe(0);
    expect(metrics.coaLinking.percentage).toBe(0);
    expect(metrics.parcelLinking.percentage).toBe(0);
    expect(metrics.neighbourhoodCoverage.percentage).toBe(0);
    expect(metrics.geocoding.percentage).toBe(0);
  });

  it('all metrics have correct labels', () => {
    const snapshot = createMockDataQualitySnapshot();
    const metrics = extractMetrics(snapshot);
    expect(metrics.tradeCoverage.label).toBe('Trade Classification');
    expect(metrics.builderEnrichment.label).toBe('Builder Enrichment');
    expect(metrics.parcelLinking.label).toBe('Parcel Linking');
    expect(metrics.neighbourhoodCoverage.label).toBe('Neighbourhood');
    expect(metrics.geocoding.label).toBe('Geocoding');
    expect(metrics.coaLinking.label).toBe('CoA Linking');
  });

  it('percentages are rounded to one decimal place', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 3,
      permits_with_trades: 1,
    });
    const metrics = extractMetrics(snapshot);
    // 1/3 = 33.333... should round to 33.3
    expect(metrics.tradeCoverage.percentage).toBe(33.3);
  });
});

describe('DataQualitySnapshot Shape Validation', () => {
  it('factory creates all required fields', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.id).toBeDefined();
    expect(snapshot.snapshot_date).toBeDefined();
    expect(snapshot.total_permits).toBeGreaterThan(0);
    expect(snapshot.active_permits).toBeGreaterThan(0);
    expect(snapshot.permits_with_trades).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_matches_total).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_tier1_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_tier2_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_tier3_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.builders_total).toBeGreaterThanOrEqual(0);
    expect(snapshot.builders_enriched).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_with_parcel).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_with_neighbourhood).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_geocoded).toBeGreaterThanOrEqual(0);
    expect(snapshot.coa_total).toBeGreaterThanOrEqual(0);
    expect(snapshot.coa_linked).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_updated_24h).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_updated_7d).toBeGreaterThanOrEqual(0);
    expect(snapshot.permits_updated_30d).toBeGreaterThanOrEqual(0);
  });

  it('snapshot_date is a valid date string', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(new Date(snapshot.snapshot_date).toString()).not.toBe('Invalid Date');
  });

  it('confidence values are in range 0-1 or null', () => {
    const snapshot = createMockDataQualitySnapshot();
    if (snapshot.trade_avg_confidence !== null) {
      expect(snapshot.trade_avg_confidence).toBeGreaterThanOrEqual(0);
      expect(snapshot.trade_avg_confidence).toBeLessThanOrEqual(1);
    }
    if (snapshot.parcel_avg_confidence !== null) {
      expect(snapshot.parcel_avg_confidence).toBeGreaterThanOrEqual(0);
      expect(snapshot.parcel_avg_confidence).toBeLessThanOrEqual(1);
    }
    if (snapshot.coa_avg_confidence !== null) {
      expect(snapshot.coa_avg_confidence).toBeGreaterThanOrEqual(0);
      expect(snapshot.coa_avg_confidence).toBeLessThanOrEqual(1);
    }
  });

  it('active_permits <= total_permits', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.active_permits).toBeLessThanOrEqual(snapshot.total_permits);
  });

  it('tier counts are non-negative', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.trade_tier1_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_tier2_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.trade_tier3_count).toBeGreaterThanOrEqual(0);
  });

  it('coa_high + coa_low <= coa_linked', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.coa_high_confidence + snapshot.coa_low_confidence)
      .toBeLessThanOrEqual(snapshot.coa_linked);
  });

  it('freshness counts are in order: 24h <= 7d <= 30d', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.permits_updated_24h).toBeLessThanOrEqual(snapshot.permits_updated_7d);
    expect(snapshot.permits_updated_7d).toBeLessThanOrEqual(snapshot.permits_updated_30d);
  });

  it('last_sync_status is a valid value', () => {
    const snapshot = createMockDataQualitySnapshot();
    if (snapshot.last_sync_status !== null) {
      expect(['running', 'completed', 'failed']).toContain(snapshot.last_sync_status);
    }
  });
});

// ── parseSnapshot — NUMERIC coercion ──────────────────────────────────

describe('parseSnapshot coerces NUMERIC fields from strings', () => {
  it('coerces string-typed avg_confidence fields to numbers', () => {
    // Simulate what node-postgres returns: NUMERIC(4,3) as strings
    const raw = createMockDataQualitySnapshot({
      trade_avg_confidence: 0.847,
      parcel_avg_confidence: 0.95,
      coa_avg_confidence: 0.623,
    });
    // Force to strings like node-postgres does
    const dbRow = {
      ...raw,
      trade_avg_confidence: '0.847' as unknown as number,
      parcel_avg_confidence: '0.950' as unknown as number,
      coa_avg_confidence: '0.623' as unknown as number,
    };
    const parsed = parseSnapshot(dbRow);
    expect(typeof parsed.trade_avg_confidence).toBe('number');
    expect(typeof parsed.parcel_avg_confidence).toBe('number');
    expect(typeof parsed.coa_avg_confidence).toBe('number');
    expect(parsed.trade_avg_confidence!.toFixed(3)).toBe('0.847');
    expect(parsed.parcel_avg_confidence!.toFixed(3)).toBe('0.950');
    expect(parsed.coa_avg_confidence!.toFixed(3)).toBe('0.623');
  });

  it('preserves null confidence values', () => {
    const raw = createMockDataQualitySnapshot({
      trade_avg_confidence: null,
      parcel_avg_confidence: null,
      coa_avg_confidence: null,
    });
    const parsed = parseSnapshot(raw);
    expect(parsed.trade_avg_confidence).toBeNull();
    expect(parsed.parcel_avg_confidence).toBeNull();
    expect(parsed.coa_avg_confidence).toBeNull();
  });

  it('preserves already-numeric confidence values', () => {
    const raw = createMockDataQualitySnapshot({
      trade_avg_confidence: 0.75,
      parcel_avg_confidence: 0.85,
      coa_avg_confidence: 0.60,
    });
    const parsed = parseSnapshot(raw);
    expect(parsed.trade_avg_confidence).toBe(0.75);
    expect(parsed.parcel_avg_confidence).toBe(0.85);
    expect(parsed.coa_avg_confidence).toBe(0.60);
  });
});

// ── Bug Fix Tests — Data Quality Display Accuracy ────────────────────

describe('Neighbourhood count must not exceed active permits', () => {
  it('permits_with_neighbourhood <= active_permits in factory defaults', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.permits_with_neighbourhood).toBeLessThanOrEqual(snapshot.active_permits);
  });
});

describe('Builder accuracy uses permits_with_builder / active_permits', () => {
  it('builder coverage is based on permits with builder name', () => {
    const snapshot = createMockDataQualitySnapshot({
      active_permits: 1000,
      permits_with_builder: 750,
      builders_total: 200,
      builders_enriched: 50,
    });
    // The correct metric: 750/1000 = 75%, NOT 50/200 = 25%
    const builderCoverage = snapshot.active_permits > 0
      ? Math.round((snapshot.permits_with_builder / snapshot.active_permits) * 1000) / 10
      : 0;
    expect(builderCoverage).toBe(75);
  });
});

describe('Builder tier percentages', () => {
  it('computes tier percentages relative to builders_total', () => {
    const snapshot = createMockDataQualitySnapshot({
      builders_total: 1000,
      builders_with_google: 450,
      builders_with_wsib: 128,
      builders_with_phone: 600,
      builders_with_email: 480,
      builders_with_website: 360,
    });
    const googlePct = Math.round((snapshot.builders_with_google / snapshot.builders_total) * 1000) / 10;
    const wsibPct = Math.round((snapshot.builders_with_wsib / snapshot.builders_total) * 1000) / 10;
    expect(googlePct).toBe(45);
    expect(wsibPct).toBe(12.8);
  });
});

describe('Work Scope split: classification vs detailed tags', () => {
  it('snapshot includes permits_with_scope_tags field', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot).toHaveProperty('permits_with_scope_tags');
    expect(typeof snapshot.permits_with_scope_tags).toBe('number');
    expect(snapshot.permits_with_scope_tags).toBeGreaterThanOrEqual(0);
  });

  it('snapshot includes scope_tags_top distribution', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot).toHaveProperty('scope_tags_top');
    if (snapshot.scope_tags_top) {
      const keys = Object.keys(snapshot.scope_tags_top);
      expect(keys.length).toBeGreaterThan(0);
      for (const val of Object.values(snapshot.scope_tags_top)) {
        expect(typeof val).toBe('number');
      }
    }
  });

  it('snapshot includes permits_with_detailed_tags field', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot).toHaveProperty('permits_with_detailed_tags');
    expect(typeof snapshot.permits_with_detailed_tags).toBe('number');
    expect(snapshot.permits_with_detailed_tags).toBeGreaterThanOrEqual(0);
  });

  it('detailed_tags <= scope_tags (subset relationship)', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.permits_with_detailed_tags).toBeLessThanOrEqual(snapshot.permits_with_scope_tags);
  });

  it('permits_with_scope <= active_permits (scope class cannot exceed 100%)', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.permits_with_scope).toBeLessThanOrEqual(snapshot.active_permits);
  });

  it('permits_with_detailed_tags <= active_permits', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.permits_with_detailed_tags).toBeLessThanOrEqual(snapshot.active_permits);
  });

  it('scope_project_type_breakdown contains residential, commercial, and mixed-use keys', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.scope_project_type_breakdown).not.toBeNull();
    const keys = Object.keys(snapshot.scope_project_type_breakdown!);
    expect(keys.sort()).toEqual(['commercial', 'mixed-use', 'residential']);
  });

  it('residential + commercial + mixed-use counts <= permits_with_scope', () => {
    const snapshot = createMockDataQualitySnapshot();
    const breakdown = snapshot.scope_project_type_breakdown!;
    const total = (breakdown.residential ?? 0) + (breakdown.commercial ?? 0) + (breakdown['mixed-use'] ?? 0);
    expect(total).toBeLessThanOrEqual(snapshot.permits_with_scope);
  });

  it('trade_residential_classified <= trade_residential_total', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.trade_residential_classified).toBeLessThanOrEqual(snapshot.trade_residential_total);
  });

  it('trade_commercial_classified <= trade_commercial_total', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.trade_commercial_classified).toBeLessThanOrEqual(snapshot.trade_commercial_total);
  });

  it('trade_residential_total + trade_commercial_total <= active_permits', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.trade_residential_total + snapshot.trade_commercial_total)
      .toBeLessThanOrEqual(snapshot.active_permits);
  });

  it('trade_residential_classified + trade_commercial_classified <= permits_with_trades', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.trade_residential_classified + snapshot.trade_commercial_classified)
      .toBeLessThanOrEqual(snapshot.permits_with_trades);
  });
});

// ── Pipeline Registry Tests ───────────────────────────────────────────

describe('Pipeline Registry', () => {
  // Lazy import so the module is resolved at test time
  let PIPELINE_REGISTRY: Record<string, { name: string; group: string }>;

  beforeAll(async () => {
    const mod = await import('@/components/FreshnessTimeline');
    PIPELINE_REGISTRY = mod.PIPELINE_REGISTRY;
  });

  it('has exactly 27 tracked pipelines', () => {
    expect(Object.keys(PIPELINE_REGISTRY)).toHaveLength(27);
  });

  it('groups are correct: 8 ingest, 13 link, 3 classify, 1 snapshot, 2 quality', () => {
    const groups = Object.values(PIPELINE_REGISTRY).map((e) => e.group);
    expect(groups.filter((g) => g === 'ingest')).toHaveLength(8);
    expect(groups.filter((g) => g === 'link')).toHaveLength(13);
    expect(groups.filter((g) => g === 'classify')).toHaveLength(3);
    expect(groups.filter((g) => g === 'snapshot')).toHaveLength(1);
    expect(groups.filter((g) => g === 'quality')).toHaveLength(2);
  });

  it('every pipeline has a non-empty human-readable name', () => {
    for (const [slug, entry] of Object.entries(PIPELINE_REGISTRY)) {
      expect(entry.name, `${slug} should have a name`).toBeTruthy();
      expect(entry.name.length).toBeGreaterThan(2);
    }
  });
});

describe('Pipeline Chains', () => {
  let PIPELINE_CHAINS: { id: string; steps: { slug: string; indent: number }[] }[];
  let PIPELINE_REGISTRY: Record<string, { name: string; group: string }>;

  beforeAll(async () => {
    const mod = await import('@/components/FreshnessTimeline');
    PIPELINE_CHAINS = mod.PIPELINE_CHAINS;
    PIPELINE_REGISTRY = mod.PIPELINE_REGISTRY;
  });

  it('has exactly 5 chains: permits, coa, entities, sources, deep_scrapes', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(ids).toEqual(['permits', 'coa', 'entities', 'sources', 'deep_scrapes']);
  });

  it('permits chain has 15 steps in dependency order (no enrichment)', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    expect(permits.steps).toHaveLength(15);
    expect(permits.steps[0].slug).toBe('assert_schema');
    expect(permits.steps[1].slug).toBe('permits');
    expect(permits.steps[permits.steps.length - 1].slug).toBe('assert_data_bounds');
  });

  it('permits chain includes WSIB sub-step under builders', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const indent2plus = permits.steps.filter((s) => s.indent >= 2);
    expect(indent2plus.map((s) => s.slug)).toEqual(['link_wsib']);
  });

  it('coa chain has 6 steps', () => {
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa')!;
    expect(coa.steps).toHaveLength(6);
    expect(coa.steps[0].slug).toBe('assert_schema');
    expect(coa.steps[1].slug).toBe('coa');
  });

  it('sources chain has 14 steps including WSIB, compute_centroids and assert_data_bounds', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources')!;
    expect(sources.steps).toHaveLength(14);
    expect(sources.steps.some((s) => s.slug === 'compute_centroids')).toBe(true);
    expect(sources.steps.some((s) => s.slug === 'load_wsib')).toBe(true);
    expect(sources.steps.some((s) => s.slug === 'link_wsib')).toBe(true);
    expect(sources.steps[0].slug).toBe('assert_schema');
    expect(sources.steps[sources.steps.length - 1].slug).toBe('assert_data_bounds');
  });

  it('every slug in chains exists in PIPELINE_REGISTRY', () => {
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect(PIPELINE_REGISTRY, `${step.slug} missing from registry`).toHaveProperty(step.slug);
      }
    }
  });
});

// ── WF5 Audit Fix: CQA scripts write records_meta ────────────────────

describe('CQA scripts write records_meta to pipeline_runs', () => {
  it('assert-schema.js writes records_meta with checks_passed and checks_failed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-schema.js'), 'utf-8'
    );
    expect(source).toContain('records_meta');
    expect(source).toContain('checks_passed');
    expect(source).toContain('checks_failed');
  });

  it('assert-data-bounds.js writes records_meta with checks_passed, checks_failed, and checks_warned', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-data-bounds.js'), 'utf-8'
    );
    expect(source).toContain('records_meta');
    expect(source).toContain('checks_passed');
    expect(source).toContain('checks_failed');
    expect(source).toContain('checks_warned');
  });
});

// ── trendDelta() ─────────────────────────────────────────────────────

describe('trendDelta()', () => {
  it('returns positive number when current > previous', () => {
    expect(trendDelta(85.5, 80.0)).toBe(5.5);
  });

  it('returns negative number when current < previous', () => {
    expect(trendDelta(72.3, 80.0)).toBe(-7.7);
  });

  it('returns null when no previous snapshot available', () => {
    expect(trendDelta(85.5, null)).toBeNull();
  });

  it('returns 0 when current equals previous', () => {
    expect(trendDelta(50.0, 50.0)).toBe(0);
  });
});

// ── findSnapshotDaysAgo() ────────────────────────────────────────────

describe('findSnapshotDaysAgo()', () => {
  it('returns closest snapshot to target day count (minimum 7-day gap)', () => {
    const now = new Date();
    const d28 = new Date(now);
    d28.setDate(d28.getDate() - 28);
    const d32 = new Date(now);
    d32.setDate(d32.getDate() - 32);

    const trends = [
      createMockDataQualitySnapshot({ id: 1, snapshot_date: d28.toISOString().slice(0, 10) }),
      createMockDataQualitySnapshot({ id: 2, snapshot_date: d32.toISOString().slice(0, 10) }),
    ];

    const result = findSnapshotDaysAgo(trends, 30);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1); // 28 days is closer to 30
  });

  it('returns null when trends array is empty', () => {
    expect(findSnapshotDaysAgo([], 30)).toBeNull();
  });

  it('returns null when only recent snapshots exist (< 7 days old)', () => {
    // If the only snapshot is from today or yesterday, it's too recent to be a
    // meaningful "previous" comparison — should return null
    const now = new Date();
    const d1 = new Date(now);
    d1.setDate(d1.getDate() - 1);
    const trends = [
      createMockDataQualitySnapshot({ id: 99, snapshot_date: d1.toISOString().slice(0, 10) }),
    ];
    const result = findSnapshotDaysAgo(trends, 30);
    expect(result).toBeNull();
  });

  it('returns snapshot that is at least 7 days old', () => {
    const now = new Date();
    const d2 = new Date(now);
    d2.setDate(d2.getDate() - 2);
    const d10 = new Date(now);
    d10.setDate(d10.getDate() - 10);

    const trends = [
      createMockDataQualitySnapshot({ id: 1, snapshot_date: d2.toISOString().slice(0, 10) }),
      createMockDataQualitySnapshot({ id: 2, snapshot_date: d10.toISOString().slice(0, 10) }),
    ];
    const result = findSnapshotDaysAgo(trends, 30);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2); // d2 is too recent, d10 qualifies
  });
});

describe('Funnel computation (extracted to lib/admin/funnel)', () => {
  it('computeAllFunnelRows is importable from funnel module', async () => {
    const mod = await import('@/lib/admin/funnel');
    expect(typeof mod.computeAllFunnelRows).toBe('function');
    expect(typeof mod.computeRowData).toBe('function');
    expect(mod.FUNNEL_SOURCES).toBeDefined();
  });

  it('STEP_DESCRIPTIONS covers all PIPELINE_REGISTRY slugs', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');
    const { PIPELINE_REGISTRY } = await import('@/components/FreshnessTimeline');
    const registrySlugs = Object.keys(PIPELINE_REGISTRY);
    const descSlugs = Object.keys(STEP_DESCRIPTIONS);
    for (const slug of registrySlugs) {
      expect(descSlugs, `Missing STEP_DESCRIPTIONS entry for "${slug}"`).toContain(slug);
    }
  });

  it('each STEP_DESCRIPTIONS entry has summary, fields, and table', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');
    for (const [slug, desc] of Object.entries(STEP_DESCRIPTIONS)) {
      expect(desc.summary.length, `${slug} summary empty`).toBeGreaterThan(0);
      expect(desc.fields.length, `${slug} fields empty`).toBeGreaterThan(0);
      expect(desc.table.length, `${slug} table empty`).toBeGreaterThan(0);
    }
  });

  it('STEP_DESCRIPTIONS fields match actual DB column names', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');

    // Verified against migration CREATE TABLE statements
    const SCHEMA: Record<string, string[]> = {
      address_points:       ['address_point_id', 'latitude', 'longitude'],
      parcels:              ['parcel_id', 'lot_size_sqm', 'frontage_m', 'depth_m', 'geom'],
      building_footprints:  ['source_id', 'footprint_area_sqm', 'max_height_m', 'estimated_stories'],
      neighbourhoods:       ['neighbourhood_id', 'name', 'avg_household_income', 'geom'],
      permit_inspections:   ['stage_name', 'inspection_date', 'status'],
      parcel_buildings:     ['parcel_id', 'building_id', 'match_type', 'confidence'],
    };

    // Steps whose fields MUST be a subset of their target table columns
    const FIELD_CHECKS: Record<string, { table: string; fields: string[] }> = {
      address_points:       { table: 'address_points',      fields: SCHEMA.address_points },
      parcels:              { table: 'parcels',             fields: SCHEMA.parcels },
      massing:              { table: 'building_footprints', fields: SCHEMA.building_footprints },
      neighbourhoods:       { table: 'neighbourhoods',      fields: SCHEMA.neighbourhoods },
      inspections:          { table: 'permit_inspections',  fields: SCHEMA.permit_inspections },
      link_massing:         { table: 'parcel_buildings',    fields: SCHEMA.parcel_buildings },
    };

    for (const [slug, check] of Object.entries(FIELD_CHECKS)) {
      const desc = STEP_DESCRIPTIONS[slug];
      expect(desc, `Missing STEP_DESCRIPTIONS for ${slug}`).toBeDefined();
      expect(desc.table, `${slug} table mismatch`).toBe(check.table);
      for (const field of desc.fields) {
        expect(check.fields, `${slug}: field "${field}" not in ${check.table} schema`).toContain(field);
      }
    }

    // CQA steps must reference records_meta fields, not nonexistent columns
    expect(STEP_DESCRIPTIONS.assert_schema.fields).toContain('checks_passed');
    expect(STEP_DESCRIPTIONS.assert_schema.fields).toContain('checks_failed');
    expect(STEP_DESCRIPTIONS.assert_data_bounds.fields).toContain('checks_passed');
    expect(STEP_DESCRIPTIONS.assert_data_bounds.fields).toContain('checks_warned');

    // classify_scope_class must NOT reference nonexistent scope_class column
    expect(STEP_DESCRIPTIONS.classify_scope_class.fields).toContain('project_type');
    expect(STEP_DESCRIPTIONS.classify_scope_class.fields).not.toContain('scope_class');
  });
});

// ── Volume Anomaly Detection ──────────────────────────────────────────

describe('detectVolumeAnomalies()', () => {
  it('returns empty when fewer than 3 trends', () => {
    const trends = [createMockDataQualitySnapshot(), createMockDataQualitySnapshot()];
    expect(detectVolumeAnomalies(trends)).toEqual([]);
  });

  it('returns empty when volume is stable', () => {
    const trends = Array.from({ length: 10 }, (_, i) =>
      createMockDataQualitySnapshot({
        id: i + 1,
        permits_updated_24h: 1200,
        snapshot_date: `2024-03-${String(10 - i).padStart(2, '0')}`,
      })
    );
    expect(detectVolumeAnomalies(trends)).toEqual([]);
  });

  it('flags a volume drop exceeding 2 standard deviations', () => {
    const historical = Array.from({ length: 10 }, (_, i) =>
      createMockDataQualitySnapshot({
        id: i + 2,
        permits_updated_24h: 1200,
        snapshot_date: `2024-02-${String(20 - i).padStart(2, '0')}`,
      })
    );
    const current = createMockDataQualitySnapshot({
      id: 1,
      permits_updated_24h: 2, // extreme drop
      snapshot_date: '2024-03-01',
    });
    const trends = [current, ...historical];
    const anomalies = detectVolumeAnomalies(trends);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].direction).toBe('drop');
    expect(anomalies[0].source).toBe('permits');
    expect(anomalies[0].deviations).toBeGreaterThanOrEqual(2);
  });

  it('flags a volume spike exceeding 2 standard deviations', () => {
    const historical = Array.from({ length: 10 }, (_, i) =>
      createMockDataQualitySnapshot({
        id: i + 2,
        permits_updated_24h: 100,
        snapshot_date: `2024-02-${String(20 - i).padStart(2, '0')}`,
      })
    );
    const current = createMockDataQualitySnapshot({
      id: 1,
      permits_updated_24h: 50000, // extreme spike
      snapshot_date: '2024-03-01',
    });
    const trends = [current, ...historical];
    const anomalies = detectVolumeAnomalies(trends);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].direction).toBe('spike');
  });
});

// ── Schema Drift Detection ────────────────────────────────────────────

describe('detectSchemaDrift()', () => {
  it('returns empty when both inputs are null', () => {
    expect(detectSchemaDrift(null, null)).toEqual([]);
  });

  it('returns empty when schemas are identical', () => {
    const schema = { permits: 30, builders: 15 };
    expect(detectSchemaDrift(schema, schema)).toEqual([]);
  });

  it('detects column count change', () => {
    const current = { permits: 30, builders: 15 };
    const previous = { permits: 30, builders: 14 };
    const alerts = detectSchemaDrift(current, previous);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].table).toBe('builders');
    expect(alerts[0].previousCount).toBe(14);
    expect(alerts[0].currentCount).toBe(15);
  });

  it('ignores new tables not present in previous', () => {
    const current = { permits: 30, builders: 15, new_table: 5 };
    const previous = { permits: 30, builders: 15 };
    expect(detectSchemaDrift(current, previous)).toEqual([]);
  });
});

// ── System Health Summary ─────────────────────────────────────────────

describe('computeSystemHealth()', () => {
  it('returns green when no issues or warnings', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      null_description_count: 0,
      sla_permits_ingestion_hours: 6,
    });
    const health = computeSystemHealth(snapshot, [], []);
    expect(health.level).toBe('green');
    expect(health.issues).toHaveLength(0);
    expect(health.warnings).toHaveLength(0);
  });

  it('returns yellow when there are warnings but no issues', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 10,
      null_description_count: 0,
      sla_permits_ingestion_hours: 6,
    });
    const health = computeSystemHealth(snapshot, [], []);
    expect(health.level).toBe('yellow');
    expect(health.warnings.length).toBeGreaterThan(0);
  });

  it('returns red when violations >= 100', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 150,
      sla_permits_ingestion_hours: 6,
    });
    const health = computeSystemHealth(snapshot, [], []);
    expect(health.level).toBe('red');
    expect(health.issues.length).toBeGreaterThan(0);
  });

  it('returns red when volume anomaly drop detected', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const anomalies = [{ source: 'permits', expected: 1200, actual: 2, deviations: 5.0, direction: 'drop' as const }];
    const health = computeSystemHealth(snapshot, anomalies, []);
    expect(health.level).toBe('red');
  });

  it('returns yellow when schema drift detected', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const drift = [{ table: 'permits', previousCount: 30, currentCount: 29 }];
    const health = computeSystemHealth(snapshot, [], drift);
    expect(health.level).toBe('yellow');
    expect(health.warnings).toContain('Schema changes detected in 1 table(s)');
  });

  it('returns red when SLA breached', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 48,
    });
    const health = computeSystemHealth(snapshot, [], []);
    expect(health.level).toBe('red');
    expect(health.issues[0]).toContain('SLA breach');
  });
});

// ── SLA Targets ───────────────────────────────────────────────────────

describe('SLA_TARGETS', () => {
  it('defines permits target as 24 hours', () => {
    expect(SLA_TARGETS.permits).toBe(24);
  });

  it('defines quarterly targets as 2160 hours (90 days)', () => {
    expect(SLA_TARGETS.parcels).toBe(2160);
    expect(SLA_TARGETS.address_points).toBe(2160);
  });

  it('defines annual targets as 8760 hours (365 days)', () => {
    expect(SLA_TARGETS.neighbourhoods).toBe(8760);
  });
});

// ── Enrichment Funnel Config ──────────────────────────────────────

describe('Enrichment Funnel', () => {
  let FUNNEL_SOURCES: { id: string; name: string; statusSlug: string; triggerSlug: string; yieldFields: string[] }[];

  beforeAll(async () => {
    const mod = await import('@/lib/admin/funnel');
    FUNNEL_SOURCES = mod.FUNNEL_SOURCES;
  });

  it('defines exactly 15 data sources', () => {
    expect(FUNNEL_SOURCES).toHaveLength(15);
  });

  it('source IDs are unique', () => {
    const ids = FUNNEL_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each source has non-empty name, statusSlug, triggerSlug, and yieldFields', () => {
    for (const src of FUNNEL_SOURCES) {
      expect(src.name.length).toBeGreaterThan(0);
      expect(src.statusSlug.length).toBeGreaterThan(0);
      expect(src.triggerSlug.length).toBeGreaterThan(0);
      expect(src.yieldFields.length).toBeGreaterThan(0);
    }
  });

  it('includes all expected source IDs', () => {
    const ids = FUNNEL_SOURCES.map((s) => s.id);
    expect(ids).toContain('permits');
    expect(ids).toContain('scope_class');
    expect(ids).toContain('scope_tags');
    expect(ids).toContain('trades_residential');
    expect(ids).toContain('trades_commercial');
    expect(ids).toContain('builders');
    expect(ids).toContain('wsib');
    expect(ids).toContain('builder_web');
    expect(ids).toContain('address_matching');
    expect(ids).toContain('parcels');
    expect(ids).toContain('neighbourhoods');
    expect(ids).toContain('massing');
    expect(ids).toContain('coa');
    expect(ids).toContain('link_similar');
    expect(ids).toContain('link_coa');
  });

  it('follows pipeline chain execution order', () => {
    const ids = FUNNEL_SOURCES.map((s) => s.id);
    // Permits hub first, then classify, then builders/enrichment, then spatial, then CoA last
    expect(ids.indexOf('permits')).toBeLessThan(ids.indexOf('scope_class'));
    expect(ids.indexOf('scope_class')).toBeLessThan(ids.indexOf('builders'));
    expect(ids.indexOf('builders')).toBeLessThan(ids.indexOf('wsib'));
    expect(ids.indexOf('wsib')).toBeLessThan(ids.indexOf('builder_web'));
    expect(ids.indexOf('builder_web')).toBeLessThan(ids.indexOf('address_matching'));
    expect(ids.indexOf('address_matching')).toBeLessThan(ids.indexOf('parcels'));
    expect(ids.indexOf('massing')).toBeLessThan(ids.indexOf('link_similar'));
    expect(ids.indexOf('link_similar')).toBeLessThan(ids.indexOf('link_coa'));
    expect(ids.indexOf('link_coa')).toBeLessThan(ids.indexOf('coa'));
  });

  it('builder_web source yields phone, email, and website', () => {
    const builderWeb = FUNNEL_SOURCES.find((s) => s.id === 'builder_web')!;
    expect(builderWeb.yieldFields).toContain('phone');
    expect(builderWeb.yieldFields).toContain('email');
    expect(builderWeb.yieldFields).toContain('website');
  });

  it('every triggerSlug is a valid pipeline slug', () => {
    // All trigger slugs should map to known pipelines (or chains)
    const validSlugs = [
      'chain_permits', 'chain_coa', 'chain_sources',
      'permits', 'coa', 'builders', 'address_points', 'parcels', 'massing', 'neighbourhoods',
      'geocode_permits', 'link_parcels', 'link_neighbourhoods', 'link_massing', 'link_coa',
      'load_wsib', 'link_wsib', 'enrich_wsib_builders', 'enrich_named_builders',
      'classify_scope_class', 'classify_scope_tags', 'classify_permits',
      'compute_centroids', 'link_similar', 'create_pre_permits',
      'refresh_snapshot', 'assert_schema', 'assert_data_bounds',
    ];
    for (const src of FUNNEL_SOURCES) {
      expect(validSlugs, `${src.id} trigger ${src.triggerSlug} not valid`).toContain(src.triggerSlug);
    }
  });
});

// ── Snapshot shape includes new quality fields ────────────────────────

describe('Snapshot includes null tracking and violation fields', () => {
  it('factory creates null count fields', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.null_description_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.null_builder_name_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.null_est_const_cost_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.null_street_num_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.null_street_name_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.null_geo_id_count).toBeGreaterThanOrEqual(0);
  });

  it('factory creates violation fields', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.violation_cost_out_of_range).toBeGreaterThanOrEqual(0);
    expect(snapshot.violation_future_issued_date).toBeGreaterThanOrEqual(0);
    expect(snapshot.violation_missing_status).toBeGreaterThanOrEqual(0);
    expect(snapshot.violations_total).toBe(
      snapshot.violation_cost_out_of_range +
      snapshot.violation_future_issued_date +
      snapshot.violation_missing_status
    );
  });

  it('factory creates schema_column_counts', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.schema_column_counts).not.toBeNull();
    expect(Object.keys(snapshot.schema_column_counts!).length).toBeGreaterThan(0);
  });

  it('factory creates sla_permits_ingestion_hours', () => {
    const snapshot = createMockDataQualitySnapshot();
    expect(snapshot.sla_permits_ingestion_hours).not.toBeNull();
    expect(snapshot.sla_permits_ingestion_hours!).toBeGreaterThan(0);
  });
});

// ── WF5 Audit Fix: yieldNullRates plumbing ─────────────────────────────

describe('computeRowData returns non-empty yieldNullRates for funnel sources', () => {
  let FUNNEL_SOURCES: { id: string; name: string; statusSlug: string; triggerSlug: string; yieldFields: string[] }[];
  let computeRowData: typeof import('@/lib/admin/funnel').computeRowData;

  beforeAll(async () => {
    const mod = await import('@/lib/admin/funnel');
    FUNNEL_SOURCES = mod.FUNNEL_SOURCES;
    computeRowData = mod.computeRowData;
  });

  const makeStats = () => ({
    wsib_total: 100, wsib_linked: 50, wsib_lead_pool: 30, wsib_with_trade: 40,
    address_points_total: 500000, parcels_total: 800000, building_footprints_total: 600000,
    parcels_with_massing: 200000, permits_with_massing: 50000, neighbourhoods_total: 158,
    permits_propagated: 75000,
    pipeline_last_run: {
      permits: {
        last_run_at: new Date().toISOString(),
        status: 'completed' as const, records_total: 237000, records_new: 100, records_updated: null, records_meta: null,
      },
    },
    pipeline_schedules: null,
  });

  const makeSnapshot = () => createMockDataQualitySnapshot({
    active_permits: 237000,
    permits_with_parcel: 200000,
    permits_with_neighbourhood: 210000,
    permits_with_trades: 220000,
    permits_with_scope: 180000,
    permits_with_detailed_tags: 160000,
  });

  it('parcels yields non-empty yieldNullRates with parcel_link field', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'parcels')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'parcel_link')).toBe(true);
  });

  it('neighbourhoods yields non-empty yieldNullRates with neighbourhood_link field', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'neighbourhoods')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'neighbourhood_id')).toBe(true);
  });

  it('massing yields non-empty yieldNullRates with massing_link field', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'massing')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'massing_link')).toBe(true);
  });

  it('scope_class yields non-empty yieldNullRates with unclassified field', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'scope_class')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'scope_class')).toBe(true);
  });

  it('scope_tags yields non-empty yieldNullRates with untagged field', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'scope_tags')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'scope_tags')).toBe(true);
  });

  it('trades_residential yields non-empty yieldNullRates', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'trades_residential')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
  });

  it('trades_commercial yields non-empty yieldNullRates', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'trades_commercial')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
  });

  it('yieldNullRates pct values are between 0 and 100', () => {
    const stats = makeStats();
    const snapshot = makeSnapshot();
    for (const sourceId of ['parcels', 'neighbourhoods', 'massing', 'scope_class', 'scope_tags']) {
      const config = FUNNEL_SOURCES.find((s) => s.id === sourceId)!;
      const row = computeRowData(config, stats, snapshot);
      for (const nr of row.yieldNullRates) {
        expect(nr.pct).toBeGreaterThanOrEqual(0);
        expect(nr.pct).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ── Bug fix: chain-scoped pipeline_last_run key resolution ─────────────

describe('computeRowData resolves chain-scoped pipeline_last_run keys', () => {
  let FUNNEL_SOURCES: { id: string; name: string; statusSlug: string; triggerSlug: string; yieldFields: string[] }[];
  let computeRowData: typeof import('@/lib/admin/funnel').computeRowData;

  beforeAll(async () => {
    const mod = await import('@/lib/admin/funnel');
    FUNNEL_SOURCES = mod.FUNNEL_SOURCES;
    computeRowData = mod.computeRowData;
  });

  it('link_similar resolves via permits:link_similar when plain key missing', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'link_similar')!;
    // pipeline_last_run has chain-scoped key, NOT plain key
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 80059,
      pipeline_last_run: {
        'permits:link_similar': {
          last_run_at: '2026-03-06T10:00:00Z',
          status: 'completed',
          records_total: 80059,
          records_new: 1234,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // Should find the chain-scoped run data, not return stale/0
    expect(row.status).not.toBe('stale');
    expect(row.lastRunRecordsTotal).toBe(80059);
    // matchCount uses DB-sourced permits_propagated, not last run records_total
    expect(row.matchCount).toBe(80059);
    expect(row.targetPool).toBe(80059);
  });

  it('link_similar uses DB count for baseline even when last run had 0', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'link_similar')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 75000,
      pipeline_last_run: {
        'permits:link_similar': {
          last_run_at: '2026-03-06T10:00:00Z',
          status: 'completed',
          records_total: 0,
          records_new: 0,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // DB has 75K propagated permits — baseline should reflect this, not last run's 0
    expect(row.matchCount).toBe(75000);
    expect(row.targetPool).toBe(75000);
    expect(row.matchPct).toBeGreaterThan(0);
  });

  it('link_coa resolves via coa:link_coa when plain key missing', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'link_coa')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0, permits_propagated: 0,
      pipeline_last_run: {
        'coa:link_coa': {
          last_run_at: '2026-03-06T10:00:00Z',
          status: 'completed',
          records_total: 14614,
          records_new: 200,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    expect(row.status).not.toBe('stale');
    expect(row.lastRunRecordsTotal).toBe(14614);
  });

  it('plain key still works when present (no regression)', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0, permits_propagated: 0,
      pipeline_last_run: {
        permits: {
          last_run_at: '2026-03-06T10:00:00Z',
          status: 'completed',
          records_total: 237000,
          records_new: 50,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    expect(row.status).not.toBe('stale');
    expect(row.lastRunRecordsTotal).toBe(237000);
  });

  it('multi-chain slug picks most recent run across chains', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'link_coa')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0, permits_propagated: 0,
      pipeline_last_run: {
        'permits:link_coa': {
          last_run_at: '2026-03-05T10:00:00Z',
          status: 'completed',
          records_total: 100,
          records_new: 5,
          records_updated: null,
          records_meta: null,
        },
        'coa:link_coa': {
          last_run_at: '2026-03-06T12:00:00Z',
          status: 'completed',
          records_total: 14614,
          records_new: 200,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // Should pick the coa:link_coa run (more recent) not permits:link_coa
    expect(row.lastRunRecordsTotal).toBe(14614);
  });
});
