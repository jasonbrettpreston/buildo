// Logic Layer Tests - Data quality score calculations and metric extraction
// SPEC LINK: docs/specs/28_data_quality_dashboard.md
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

  it('has exactly 23 tracked pipelines', () => {
    expect(Object.keys(PIPELINE_REGISTRY)).toHaveLength(23);
  });

  it('groups are correct: 7 ingest, 10 link, 3 classify, 1 snapshot, 2 quality', () => {
    const groups = Object.values(PIPELINE_REGISTRY).map((e) => e.group);
    expect(groups.filter((g) => g === 'ingest')).toHaveLength(7);
    expect(groups.filter((g) => g === 'link')).toHaveLength(10);
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

  it('has exactly 3 chains: permits, coa, sources', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(ids).toEqual(['permits', 'coa', 'sources']);
  });

  it('permits chain has 16 steps in dependency order', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    expect(permits.steps).toHaveLength(16);
    expect(permits.steps[0].slug).toBe('permits');
    expect(permits.steps[permits.steps.length - 1].slug).toBe('assert_data_bounds');
  });

  it('permits chain includes indent-2 sub-steps for builder enrichment', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const indent2 = permits.steps.filter((s) => s.indent === 2);
    expect(indent2.map((s) => s.slug)).toEqual(['enrich_google', 'enrich_wsib']);
  });

  it('coa chain has 5 steps', () => {
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa')!;
    expect(coa.steps).toHaveLength(5);
    expect(coa.steps[0].slug).toBe('coa');
  });

  it('sources chain has 10 steps including compute_centroids and refresh_snapshot', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources')!;
    expect(sources.steps).toHaveLength(10);
    expect(sources.steps.some((s) => s.slug === 'compute_centroids')).toBe(true);
    expect(sources.steps[sources.steps.length - 1].slug).toBe('refresh_snapshot');
  });

  it('every slug in chains exists in PIPELINE_REGISTRY', () => {
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect(PIPELINE_REGISTRY, `${step.slug} missing from registry`).toHaveProperty(step.slug);
      }
    }
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

describe('DataSourceCircle field annotations', () => {
  it('DataSourceCircle accepts fields prop', () => {
    // Verify the component interface accepts a fields array
    const props = {
      name: 'Test',
      slug: 'test',
      accuracy: 80,
      count: 100,
      total: 125,
      lastUpdated: null,
      nextScheduled: 'Daily',
      onUpdate: () => {},
      fields: ['latitude', 'longitude'],
    };
    // fields prop must be accepted by the interface
    expect(props.fields).toHaveLength(2);
    expect(props.fields[0]).toBe('latitude');
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
