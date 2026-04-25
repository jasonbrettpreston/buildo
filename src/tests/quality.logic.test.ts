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
  detectDurationAnomalies,
  detectEngineHealthIssues,
  computeSystemHealth,
  SLA_TARGETS,
  ENGINE_HEALTH_THRESHOLDS,
} from '@/lib/quality/types';
import type { EngineHealthEntry } from '@/lib/quality/types';
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

  it('has exactly 45 tracked pipelines', () => {
    // -1 v1 compute_timing_calibration removed (migration 106, 2026-04-21)
    // +1 backup_db added (WF3 2026-04-25, OP4 fix — spec 112)
    expect(Object.keys(PIPELINE_REGISTRY)).toHaveLength(45);
  });

  it('groups are correct: 10 ingest, 14 link, 9 classify, 2 snapshot, 10 quality', () => {
    // -1 classify: v1 compute_timing_calibration removed (2026-04-21)
    // +1 snapshot: backup_db added (WF3 2026-04-25)
    const groups = Object.values(PIPELINE_REGISTRY).map((e) => e.group);
    expect(groups.filter((g) => g === 'ingest')).toHaveLength(10);
    expect(groups.filter((g) => g === 'link')).toHaveLength(14);
    expect(groups.filter((g) => g === 'classify')).toHaveLength(9);
    expect(groups.filter((g) => g === 'snapshot')).toHaveLength(2);
    expect(groups.filter((g) => g === 'quality')).toHaveLength(10);
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

  it('has exactly 6 chains: permits, coa, entities, wsib, sources, deep_scrapes', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(ids).toEqual(['permits', 'coa', 'entities', 'wsib', 'sources', 'deep_scrapes']);
  });

  it('permits chain has 28 steps ending with backup_db', () => {
    // WF3 2026-04-13: v1 `compute_timing_calibration` removed per Path A.
    // WF2 2026-04-18: +2 steps (assert_lifecycle_phase_distribution step 22,
    // assert_entity_tracing step 26).
    // WF1 2026-04-19: +1 step (assert_global_coverage step 27).
    // WF3 2026-04-25: +1 step (backup_db step 28, OP4 fix).
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    expect(permits.steps).toHaveLength(28);
    expect(permits!.steps[0]!.slug).toBe('assert_schema');
    expect(permits!.steps[1]!.slug).toBe('permits');
    expect(permits!.steps[permits.steps.length - 1]!.slug).toBe('backup_db');
    expect(permits!.steps[permits.steps.length - 2]!.slug).toBe('assert_global_coverage');
    expect(permits!.steps[permits.steps.length - 3]!.slug).toBe('assert_entity_tracing');
    expect(permits!.steps[permits.steps.length - 8]!.slug).toBe('classify_lifecycle_phase');
  });

  it('permits chain has link_wsib as indent-1 step (not sub-step)', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const linkWsib = permits.steps.find((s) => s.slug === 'link_wsib');
    expect(linkWsib).toBeDefined();
    expect(linkWsib!.indent).toBe(1);
    // No indent-2+ steps in permits chain after B6 fix
    const indent2plus = permits.steps.filter((s) => s.indent >= 2);
    expect(indent2plus).toHaveLength(0);
  });

  it('coa chain has 12 steps ending with assert_global_coverage', () => {
    // WF2 2026-04-11: +1 (classify_lifecycle_phase) — was 9 before.
    // WF2 2026-04-18: +1 (assert_lifecycle_phase_distribution as step 11).
    // WF1 2026-04-19: +1 (assert_global_coverage as step 12).
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa')!;
    expect(coa.steps).toHaveLength(12);
    expect(coa!.steps[0]!.slug).toBe('assert_schema');
    expect(coa!.steps[1]!.slug).toBe('coa');
    expect(coa!.steps[coa.steps.length - 1]!.slug).toBe('assert_global_coverage');
    expect(coa!.steps[coa.steps.length - 2]!.slug).toBe('assert_lifecycle_phase_distribution');
  });

  it('sources chain has 15 steps including WSIB, compute_centroids and assert_engine_health', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources')!;
    expect(sources.steps).toHaveLength(15);
    expect(sources.steps.some((s) => s.slug === 'compute_centroids')).toBe(true);
    expect(sources.steps.some((s) => s.slug === 'load_wsib')).toBe(true);
    expect(sources.steps.some((s) => s.slug === 'link_wsib')).toBe(true);
    expect(sources!.steps[0]!.slug).toBe('assert_schema');
    expect(sources!.steps[sources.steps.length - 1]!.slug).toBe('assert_engine_health');
  });

  it('every slug in chains exists in PIPELINE_REGISTRY', () => {
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect(PIPELINE_REGISTRY, `${step.slug} missing from registry`).toHaveProperty(step.slug);
      }
    }
  });
});

// ── Regression: assert-schema expected columns match CKAN reality ─────

describe('assert-schema.js EXPECTED_COA_COLUMNS sync with load-coa.js', () => {
  const schemaSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/quality/assert-schema.js'), 'utf-8'
  );
  const coaSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/load-coa.js'), 'utf-8'
  );

  it('does not reference renamed CKAN columns (APPLICATION_DATE, STATUS)', () => {
    // CKAN renamed APPLICATION_DATE → IN_DATE and STATUS → STATUSDESC.
    // If these old names reappear in EXPECTED_COA_COLUMNS, schema check will
    // false-fail because the CKAN resource no longer has them.
    const match = schemaSource.match(/EXPECTED_COA_COLUMNS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const columnsBlock = match![1];
    expect(columnsBlock).not.toContain("'APPLICATION_DATE'");
    expect(columnsBlock).not.toContain("'STATUS'");
  });

  it('EXPECTED_COA_COLUMNS includes STATUSDESC which load-coa.js reads', () => {
    // load-coa.js reads raw.STATUSDESC — assert-schema must validate it exists
    expect(coaSource).toContain('raw.STATUSDESC');
    const match = schemaSource.match(/EXPECTED_COA_COLUMNS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("'STATUSDESC'");
  });

  it('EXPECTED_COA_COLUMNS includes REFERENCE_FILE# which load-coa.js reads', () => {
    expect(coaSource).toContain("raw['REFERENCE_FILE#']");
    const match = schemaSource.match(/EXPECTED_COA_COLUMNS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("'REFERENCE_FILE#'");
  });
});

// ── Regression: assert-schema NEIGHBOURHOOD_ID_PROPS sync ─────────────

describe('assert-schema.js NEIGHBOURHOOD_ID_PROPS sync with load-neighbourhoods.js', () => {
  const schemaSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/quality/assert-schema.js'), 'utf-8'
  );

  it('does not reference non-existent AREA_S_CD property', () => {
    const match = schemaSource.match(/NEIGHBOURHOOD_ID_PROPS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain("'AREA_S_CD'");
  });

  it('includes AREA_SHORT_CODE which load-neighbourhoods.js reads', () => {
    const loadSource = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-neighbourhoods.js'), 'utf-8'
    );
    expect(loadSource).toContain('AREA_SHORT_CODE');
    const match = schemaSource.match(/NEIGHBOURHOOD_ID_PROPS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("'AREA_SHORT_CODE'");
  });

  it('fetchGeoJsonPropertyKeys skips CRS properties block before Feature', () => {
    // The GeoJSON has a CRS block with "properties":{"name":"..."} that must be skipped
    expect(schemaSource).toContain("chunk.indexOf('\"Feature\"')");
    expect(schemaSource).toContain('featureStart');
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

  it('assert-schema.js emits PIPELINE_SUMMARY with records_meta for chain orchestrator', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-schema.js'), 'utf-8'
    );
    expect(source).toContain('PIPELINE_SUMMARY');
    expect(source).toContain('records_meta');
  });

  it('assert-data-bounds.js emits PIPELINE_SUMMARY with records_meta for chain orchestrator', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/quality/assert-data-bounds.js'), 'utf-8'
    );
    expect(source).toContain('PIPELINE_SUMMARY');
    expect(source).toContain('records_meta');
  });

  it('run-chain.js parses records_meta from PIPELINE_SUMMARY and writes to DB', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    expect(source).toContain('recordsMeta');
    expect(source).toContain('records_meta');
    expect(source).toContain('summary.records_meta');
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

  it('each STEP_DESCRIPTIONS entry has summary and table', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');
    for (const [slug, desc] of Object.entries(STEP_DESCRIPTIONS)) {
      expect(desc.summary.length, `${slug} summary empty`).toBeGreaterThan(0);
      expect(desc.table.length, `${slug} table empty`).toBeGreaterThan(0);
    }
  });

  it('stats route queries information_schema.columns for live DB schema', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'), 'utf-8'
    );
    expect(source).toContain('information_schema.columns');
    expect(source).toContain('db_schema_map');
  });

  it('FreshnessTimeline passes dbSchemaMap and pipelineMeta to DataFlowTile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('dbSchemaMap');
    expect(source).toContain('DataFlowTile');
    expect(source).toContain('pipelineMeta');
    expect(source).toContain('pipeline_meta');
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
    expect(anomalies[0]!.direction).toBe('drop');
    expect(anomalies[0]!.source).toBe('permits');
    expect(anomalies[0]!.deviations).toBeGreaterThanOrEqual(2);
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
    expect(anomalies[0]!.direction).toBe('spike');
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
    expect(alerts[0]!.table).toBe('builders');
    expect(alerts[0]!.previousCount).toBe(14);
    expect(alerts[0]!.currentCount).toBe(15);
  });

  it('ignores new tables not present in previous', () => {
    const current = { permits: 30, builders: 15, new_table: 5 };
    const previous = { permits: 30, builders: 15 };
    expect(detectSchemaDrift(current, previous)).toEqual([]);
  });
});

// ── Duration Anomaly Detection ────────────────────────────────────────

describe('detectDurationAnomalies()', () => {
  it('returns empty array for empty input', () => {
    expect(detectDurationAnomalies({})).toEqual([]);
  });

  it('returns empty array when pipeline has only 1 run', () => {
    expect(detectDurationAnomalies({ permits: [5000] })).toEqual([]);
  });

  it('returns empty array when duration is within normal range', () => {
    // Current: 8s, historical avg: 7s → ratio 1.14x (under 2x threshold)
    const runs = { permits: [8000, 7000, 7000, 7000, 7000] };
    expect(detectDurationAnomalies(runs)).toEqual([]);
  });

  it('detects anomaly when current run > 2x rolling average', () => {
    // Current: 20s, historical avg: 8s → ratio 2.5x
    const runs = { classify_permits: [20000, 8000, 8000, 8000, 8000] };
    const anomalies = detectDurationAnomalies(runs);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.pipeline).toBe('classify_permits');
    expect(anomalies[0]!.currentMs).toBe(20000);
    expect(anomalies[0]!.avgMs).toBe(8000);
    expect(anomalies[0]!.ratio).toBe(2.5);
  });

  it('detects anomalies across multiple pipelines', () => {
    const runs = {
      permits: [30000, 5000, 5000, 5000],    // 6x → anomaly
      coa: [6000, 5000, 5000, 5000],          // 1.2x → normal
      classify_scope: [50000, 10000, 10000],   // 5x → anomaly
    };
    const anomalies = detectDurationAnomalies(runs);
    expect(anomalies).toHaveLength(2);
    expect(anomalies.map(a => a.pipeline).sort()).toEqual(['classify_scope', 'permits']);
  });

  it('handles exactly 2 runs (minimum for detection)', () => {
    // Current: 10s, historical: [5s] → ratio 2x (boundary)
    const runs = { permits: [10000, 5000] };
    const anomalies = detectDurationAnomalies(runs);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.ratio).toBe(2);
  });

  it('ignores pipelines with zero average duration', () => {
    const runs = { permits: [5000, 0, 0, 0] };
    expect(detectDurationAnomalies(runs)).toEqual([]);
  });

  it('excludes 0ms skipped/gated runs from historical average', () => {
    // Real scenario: builders ran once at 2200ms, one real run at 400ms, rest gated (0ms)
    // Without fix: avg of [400, 0, 0, 0, 0, 0] = 66ms → ratio 33x → false anomaly
    // With fix: avg of [400] only → ratio 5.5x → real anomaly (legitimate)
    // But the key case: current 8300ms, historical has one 100ms + six 0ms
    // Without fix: avg = 14ms → 580x ratio → absurd false alarm
    // With fix: avg = 100ms → 83x → still an anomaly but a real one
    const runs = { enrich_web_search: [8300, 100, 0, 0, 0, 0, 0, 0] };
    const anomalies = detectDurationAnomalies(runs);
    // After fix: only [100] used as historical → avg=100, ratio=83 → anomaly
    // Key assertion: avgMs should be 100 (not 14)
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.avgMs).toBe(100);
  });

  it('computes average from only non-zero historical runs', () => {
    // Mix of real runs and gated 0ms runs
    // Real historical: [7000, 8000] → avg 7500, current 16000 → 2.1x → anomaly
    const runs = { builders: [16000, 0, 7000, 0, 8000, 0] };
    const anomalies = detectDurationAnomalies(runs);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.avgMs).toBe(7500);
  });

  it('uses at most 7 historical runs for average', () => {
    // 1 current + 10 historical → should only use 7 historical
    const runs = { permits: [20000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 1000, 1000, 1000] };
    const anomalies = detectDurationAnomalies(runs);
    // Avg of 7 historical: 8000, current: 20000 → 2.5x
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.avgMs).toBe(8000);
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

  it('violation warning shows type breakdown, not just total', () => {
    const snapshot = createMockDataQualitySnapshot({
      violation_cost_out_of_range: 5,
      violation_future_issued_date: 2,
      violation_missing_status: 0,
      violations_total: 7,
      sla_permits_ingestion_hours: 6,
    });
    const health = computeSystemHealth(snapshot, [], []);
    const violationWarning = health.warnings.find(w => w.includes('cost') || w.includes('violation'));
    expect(violationWarning).toBeDefined();
    // Must mention the specific types, not just "7 data quality violations"
    expect(violationWarning).toContain('cost');
    expect(violationWarning).not.toBe('7 data quality violations');
  });

  it('duration warning includes human-readable pipeline name, not raw slug', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const durationAnomalies = [
      { pipeline: 'builders', avgMs: 5000, currentMs: 15000, ratio: 3.0 },
    ];
    const health = computeSystemHealth(snapshot, [], [], durationAnomalies);
    const durationWarning = health.warnings.find(w => w.includes('Slow pipeline'));
    expect(durationWarning).toBeDefined();
    // Must include human name (e.g. "Extract Entities"), not just raw slug "builders"
    expect(durationWarning).toContain('Extract Entities');
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

  it('returns yellow when duration anomalies detected', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const durationAnomalies = [
      { pipeline: 'classify_permits', avgMs: 8000, currentMs: 20000, ratio: 2.5 },
    ];
    const health = computeSystemHealth(snapshot, [], [], durationAnomalies);
    expect(health.level).toBe('yellow');
    expect(health.warnings[0]).toContain('Slow pipeline: Classify Trades (classify_permits)');
    expect(health.warnings[0]).toContain('2.5x slower');
  });

  it('returns green when pipeline failures array is empty', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const health = computeSystemHealth(snapshot, [], [], [], []);
    expect(health.level).toBe('green');
    expect(health.issues).toHaveLength(0);
    expect(health.warnings).toHaveLength(0);
  });

  it('returns yellow when 1 pipeline failure in last 24h', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const failures = [
      { pipeline: 'chain_permits', error_message: 'Connection refused', failed_at: new Date().toISOString() },
    ];
    const health = computeSystemHealth(snapshot, [], [], [], failures);
    expect(health.level).toBe('yellow');
    expect(health.warnings).toHaveLength(1);
    expect(health.warnings[0]).toContain('chain_permits');
    expect(health.warnings[0]).toContain('Connection refused');
  });

  it('returns red when 2+ pipelines have a failed latest run', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const failures = [
      { pipeline: 'chain_permits', error_message: 'Connection refused', failed_at: new Date().toISOString() },
      { pipeline: 'chain_coa', error_message: 'Timeout after 3600s', failed_at: new Date().toISOString() },
    ];
    const health = computeSystemHealth(snapshot, [], [], [], failures);
    expect(health.level).toBe('red');
    expect(health.issues).toHaveLength(1);
    expect(health.issues[0]).toContain('2 pipelines have a failed latest run');
  });

  it('truncates long error messages in pipeline failure warnings', () => {
    const snapshot = createMockDataQualitySnapshot({
      violations_total: 0,
      sla_permits_ingestion_hours: 6,
    });
    const longMessage = 'A'.repeat(200);
    const failures = [
      { pipeline: 'chain_permits', error_message: longMessage, failed_at: new Date().toISOString() },
    ];
    const health = computeSystemHealth(snapshot, [], [], [], failures);
    expect(health!.warnings[0]!.length).toBeLessThanOrEqual(200);
    expect(health.warnings[0]).toContain('...');
  });
});

// ── SLA Targets ───────────────────────────────────────────────────────

describe('SLA_TARGETS', () => {
  it('defines permits target as 36 hours (accounts for Toronto Open Data publish gaps)', () => {
    expect(SLA_TARGETS.permits).toBe(36);
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

  it('defines exactly 14 data sources', () => {
    expect(FUNNEL_SOURCES).toHaveLength(14);
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
    expect(ids).toContain('scope');
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
    expect(ids.indexOf('permits')).toBeLessThan(ids.indexOf('scope'));
    expect(ids.indexOf('scope')).toBeLessThan(ids.indexOf('builders'));
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
      'classify_scope', 'classify_permits',
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

  it('scope yields yieldNullRates for both project_type and scope_tags', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'scope')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    expect(row.yieldNullRates.length).toBeGreaterThan(0);
    expect(row.yieldNullRates.some(r => r.field === 'project_type')).toBe(true);
    expect(row.yieldNullRates.some(r => r.field === 'scope_tags')).toBe(true);
  });

  it('scope matchTiers includes both project type breakdown and tag coverage', () => {
    const config = FUNNEL_SOURCES.find((s) => s.id === 'scope')!;
    const row = computeRowData(config, makeStats(), makeSnapshot());
    const labels = row.matchTiers.map(t => t.label);
    expect(labels).toContain('With Project Type');
    expect(labels).toContain('With Scope Tags');
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
    for (const sourceId of ['parcels', 'neighbourhoods', 'massing', 'scope']) {
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
          last_run_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
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
          last_run_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
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
          last_run_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
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
          last_run_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
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

  it('chain-scoped key wins over stale unscoped legacy key', () => {
    // BUG FIX: When both "permits" (legacy, 3 days old) and "permits:permits"
    // (chain-scoped, just ran) exist, must pick the most recent — not the unscoped key.
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        // Legacy unscoped key — 3 days old
        'permits': {
          last_run_at: '2026-03-04T10:00:00Z',
          status: 'completed',
          records_total: 200000,
          records_new: 50,
          records_updated: null,
          records_meta: null,
        },
        // Chain-scoped key — just ran
        'permits:permits': {
          last_run_at: '2026-03-07T10:00:00Z',
          status: 'completed',
          records_total: 234856,
          records_new: 0,
          records_updated: null,
          records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // Must use the chain-scoped entry (most recent), not the legacy one
    expect(row.lastRunRecordsTotal).toBe(234856);
    expect(row.lastUpdated).toBe('2026-03-07T10:00:00Z');
  });

  it('chain-scoped key wins tie when timestamps are equal', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const sameTimestamp = '2026-03-07T10:00:00Z';
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits': {
          last_run_at: sameTimestamp, status: 'completed',
          records_total: 100, records_new: 5, records_updated: null, records_meta: null,
        },
        'permits:permits': {
          last_run_at: sameTimestamp, status: 'completed',
          records_total: 234856, records_new: 0, records_updated: 496, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // Chain-scoped key should win ties (>= comparison, iterated after unscoped)
    expect(row.lastRunRecordsTotal).toBe(234856);
  });

  it('getStatusDot maps 1:1 to DB status with audit verdict override (Raw DB Transparency)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    const fnStart = source.indexOf('function getStatusDot');
    const fnBody = source.slice(fnStart, fnStart + 1500);
    // Direct DB status → color mapping
    expect(fnBody).toContain("'completed'");
    expect(fnBody).toContain("'Completed'");
    expect(fnBody).toContain("'failed'");
    expect(fnBody).toContain("'Failed'");
    // Verdict override for completed steps
    expect(fnBody).toContain('audit_table');
    expect(fnBody).toContain("verdict === 'FAIL'");
    // No stale detection — removed
    expect(fnBody).not.toContain("'Stale'");
    expect(fnBody).not.toContain('records_new');
    // tile-flash-stale still used for Failed status
    expect(source).toContain('tile-flash-stale');
  });

  it('getFreshnessBadge provides time-based badges (decoupled from status)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).toContain('function getFreshnessBadge');
    const fnStart = source.indexOf('function getFreshnessBadge');
    const fnBody = source.slice(fnStart, fnStart + 1200);
    expect(fnBody).toContain("'Fresh'");
    expect(fnBody).toContain("'Aging'");
    expect(fnBody).toContain("'Overdue'");
  });

  it('getStatusDot no longer uses staleExempt (Raw DB Transparency)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).not.toContain('STALE_EXEMPT_GROUPS');
    expect(source).not.toContain('staleExempt');
  });

  it('records_meta renderer filters out pipeline_meta and nested objects', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    // Must filter pipeline_meta key to prevent [object Object] display
    expect(source).toContain("k !== 'pipeline_meta'");
    // Must also filter non-primitive values (objects) from rendering
    expect(source).toContain("typeof v !== 'object'");
  });

  it('computeRowData status is "warning" when 0 new and 0 updated records', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits:permits': {
          last_run_at: new Date().toISOString(), status: 'completed',
          records_total: 234856, records_new: 0, records_updated: 0, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // 0 new + 0 updated within SLA window = warning, not healthy
    expect(row.status).toBe('warning');
  });

  it('computeRowData status is "healthy" when records were processed', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits:permits': {
          last_run_at: new Date().toISOString(), status: 'completed',
          records_total: 234856, records_new: 50, records_updated: 200, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    expect(row.status).toBe('healthy');
  });

  it('computeRowData status is NOT "warning" when step is still running (counts incomplete)', () => {
    const snapshot = createMockDataQualitySnapshot();
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits:permits': {
          last_run_at: new Date().toISOString(), status: 'running',
          records_total: 0, records_new: 0, records_updated: 0, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    // Running step with 0/0/0 should NOT be flagged as warning — counts aren't final
    expect(row.status).toBe('healthy');
  });

  it('B18: linker steps with 0 new + 0 updated are "healthy" not "warning"', () => {
    const snapshot = createMockDataQualitySnapshot();
    // geocode_permits is an incremental linker — 0 records is expected
    const config = FUNNEL_SOURCES.find((s) => s.statusSlug === 'geocode_permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 525000, parcels_total: 486000, building_footprints_total: 428000,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 158,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits:geocode_permits': {
          last_run_at: new Date().toISOString(), status: 'completed',
          records_total: 0, records_new: 0, records_updated: 0, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    expect(row.status).toBe('healthy');
  });

  it('B18: loader steps with 0 new + 0 updated remain "warning"', () => {
    const snapshot = createMockDataQualitySnapshot();
    // permits is a primary loader — 0 records is a genuine concern
    const config = FUNNEL_SOURCES.find((s) => s.id === 'permits')!;
    const stats = {
      wsib_total: 0, wsib_linked: 0, wsib_lead_pool: 0, wsib_with_trade: 0,
      address_points_total: 0, parcels_total: 0, building_footprints_total: 0,
      parcels_with_massing: 0, permits_with_massing: 0, neighbourhoods_total: 0,
      permits_propagated: 0,
      pipeline_last_run: {
        'permits:permits': {
          last_run_at: new Date().toISOString(), status: 'completed',
          records_total: 234856, records_new: 0, records_updated: 0, records_meta: null,
        },
      },
      pipeline_schedules: null,
    };
    const row = computeRowData(config, stats, snapshot);
    expect(row.status).toBe('warning');
  });

  it('DataFlowTile renders exclusively from live pipeline_meta', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/funnel/FunnelPanels.tsx'), 'utf-8'
    );
    // Must use live pipelineMeta for reads and writes — no static desc.sources/reads/writes
    expect(source).toContain('pipelineMeta!.reads');
    expect(source).toContain('pipelineMeta!.writes');
    expect(source).not.toContain('desc.sources');
    expect(source).not.toContain('desc.reads');
    expect(source).not.toContain('desc.writes');
    // Never-run fallback shows placeholder
    expect(source).toContain('Awaiting First Run');
  });

  it('STEP_DESCRIPTIONS has no static sources/reads/writes fields', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');
    for (const [slug, desc] of Object.entries(STEP_DESCRIPTIONS)) {
      const d = desc as unknown as Record<string, unknown>;
      expect(d.sources, `${slug} should not have static sources`).toBeUndefined();
      expect(d.reads, `${slug} should not have static reads`).toBeUndefined();
      expect(d.writes, `${slug} should not have static writes`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Engine Health & Volume Volatility (CQA Tier 3)
// ---------------------------------------------------------------------------

describe('detectEngineHealthIssues', () => {
  const healthyEntry: EngineHealthEntry = {
    table_name: 'permits',
    n_live_tup: 237000,
    n_dead_tup: 5000,
    dead_ratio: 0.021,
    seq_scan: 100,
    idx_scan: 900,
    seq_ratio: 0.10,
  };

  it('returns empty array for healthy tables', () => {
    const result = detectEngineHealthIssues([healthyEntry]);
    expect(result).toEqual([]);
  });

  it('flags dead tuple ratio above threshold', () => {
    const bloated: EngineHealthEntry = {
      ...healthyEntry,
      n_dead_tup: 30000,
      dead_ratio: 0.127, // 12.7%
    };
    const result = detectEngineHealthIssues([bloated]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('dead_tuples');
    expect(result[0]!.table).toBe('permits');
    expect(result[0]!.value).toBeGreaterThan(ENGINE_HEALTH_THRESHOLDS.DEAD_TUPLE_RATIO * 100);
  });

  it('does not flag dead tuples on empty tables', () => {
    const empty: EngineHealthEntry = {
      ...healthyEntry,
      n_live_tup: 0,
      n_dead_tup: 100,
      dead_ratio: 0,
    };
    const result = detectEngineHealthIssues([empty]);
    expect(result.filter(a => a.type === 'dead_tuples')).toHaveLength(0);
  });

  it('flags sequential scan heavy tables with 10K+ rows', () => {
    const seqHeavy: EngineHealthEntry = {
      ...healthyEntry,
      seq_scan: 900,
      idx_scan: 100,
      seq_ratio: 0.90,
    };
    const result = detectEngineHealthIssues([seqHeavy]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('seq_scan_heavy');
    expect(result[0]!.value).toBeGreaterThan(ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_RATIO * 100);
  });

  it('does not flag seq scan on small tables', () => {
    const smallTable: EngineHealthEntry = {
      ...healthyEntry,
      n_live_tup: 500, // below 10K threshold
      seq_scan: 900,
      idx_scan: 100,
      seq_ratio: 0.90,
    };
    const result = detectEngineHealthIssues([smallTable]);
    expect(result.filter(a => a.type === 'seq_scan_heavy')).toHaveLength(0);
  });

  it('flags update ping-pong from pgStats', () => {
    const pgStats = {
      permit_trades: { ins: 1000, upd: 5000, del: 0 },
    };
    const result = detectEngineHealthIssues([], pgStats);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('update_ping_pong');
    expect(result[0]!.table).toBe('permit_trades');
    expect(result[0]!.value).toBe(5);
  });

  it('does not flag update ping-pong when ratio is below threshold', () => {
    const pgStats = {
      permits: { ins: 1000, upd: 1500, del: 0 },
    };
    const result = detectEngineHealthIssues([], pgStats);
    expect(result).toHaveLength(0);
  });

  it('does not flag update ping-pong when inserts are zero', () => {
    const pgStats = {
      permits: { ins: 0, upd: 5000, del: 0 },
    };
    const result = detectEngineHealthIssues([], pgStats);
    expect(result).toHaveLength(0);
  });

  it('can detect multiple anomalies across multiple tables', () => {
    const entries: EngineHealthEntry[] = [
      { ...healthyEntry, table_name: 'permits', n_dead_tup: 30000, dead_ratio: 0.127 },
      { ...healthyEntry, table_name: 'entities', seq_scan: 950, idx_scan: 50, seq_ratio: 0.95 },
    ];
    const pgStats = {
      permit_trades: { ins: 100, upd: 500, del: 0 },
    };
    const result = detectEngineHealthIssues(entries, pgStats);
    expect(result).toHaveLength(3);
    expect(result.map(a => a.type).sort()).toEqual(['dead_tuples', 'seq_scan_heavy', 'update_ping_pong']);
  });
});

describe('computeSystemHealth with engine health anomalies', () => {
  it('adds engine health warnings to system health', () => {
    const snapshot = createMockDataQualitySnapshot({ violations_total: 0 });
    const engineAnomalies = [{
      table: 'permits',
      type: 'dead_tuples' as const,
      value: 15.2,
      threshold: 10,
      detail: '36,000 dead tuples',
    }];
    const health = computeSystemHealth(snapshot, [], [], [], [], engineAnomalies);
    expect(health.level).toBe('yellow');
    expect(health.warnings).toHaveLength(1);
    expect(health.warnings[0]).toContain('Dead tuples');
    expect(health.warnings[0]).toContain('permits');
  });

  it('surfaces seq_scan_heavy as warning', () => {
    const snapshot = createMockDataQualitySnapshot({ violations_total: 0 });
    const engineAnomalies = [{
      table: 'permit_trades',
      type: 'seq_scan_heavy' as const,
      value: 92.3,
      threshold: 80,
      detail: '923 seq scans',
    }];
    const health = computeSystemHealth(snapshot, [], [], [], [], engineAnomalies);
    expect(health.warnings.some(w => w.includes('Sequential scans'))).toBe(true);
  });

  it('surfaces update_ping_pong as warning', () => {
    const snapshot = createMockDataQualitySnapshot({ violations_total: 0 });
    const engineAnomalies = [{
      table: 'permit_trades',
      type: 'update_ping_pong' as const,
      value: 5.2,
      threshold: 2,
      detail: '5,200 updates vs 1,000 inserts',
    }];
    const health = computeSystemHealth(snapshot, [], [], [], [], engineAnomalies);
    expect(health.warnings.some(w => w.includes('Update ping-pong'))).toBe(true);
  });
});

describe('ENGINE_HEALTH_THRESHOLDS', () => {
  it('has expected threshold values', () => {
    expect(ENGINE_HEALTH_THRESHOLDS.DEAD_TUPLE_RATIO).toBe(0.10);
    expect(ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_RATIO).toBe(0.80);
    expect(ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_MIN_ROWS).toBe(10000);
    expect(ENGINE_HEALTH_THRESHOLDS.PING_PONG_RATIO).toBe(2);
  });
});

describe('Pipeline manifest includes assert_engine_health', () => {
  it('assert_engine_health is registered in manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../scripts/manifest.json'), 'utf-8')
    );
    expect(manifest.scripts.assert_engine_health).toBeDefined();
    expect(manifest.scripts.assert_engine_health.file).toBe('scripts/quality/assert-engine-health.js');
  });

  it('assert_engine_health is in all three chains', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../scripts/manifest.json'), 'utf-8')
    );
    expect(manifest.chains.permits).toContain('assert_engine_health');
    expect(manifest.chains.coa).toContain('assert_engine_health');
    expect(manifest.chains.sources).toContain('assert_engine_health');
  });

  it('assert_engine_health runs after assert_data_bounds in all chains', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../scripts/manifest.json'), 'utf-8')
    );
    for (const chain of ['permits', 'coa', 'sources']) {
      const steps = manifest.chains[chain];
      const boundsIdx = steps.indexOf('assert_data_bounds');
      const engineIdx = steps.indexOf('assert_engine_health');
      expect(engineIdx).toBeGreaterThan(boundsIdx);
    }
  });

  it('assert_engine_health script file exists', () => {
    const scriptPath = path.join(__dirname, '../../scripts/quality/assert-engine-health.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('STEP_DESCRIPTIONS includes assert_engine_health', async () => {
    const { STEP_DESCRIPTIONS } = await import('@/lib/admin/funnel');
    expect(STEP_DESCRIPTIONS.assert_engine_health).toBeDefined();
    expect(STEP_DESCRIPTIONS!.assert_engine_health!.summary).toContain('Engine health');
  });

  it('PIPELINE_TABLE_MAP includes assert_engine_health', async () => {
    const { PIPELINE_TABLE_MAP } = await import('@/lib/admin/funnel');
    expect(PIPELINE_TABLE_MAP.assert_engine_health).toBe('engine_health_snapshots');
  });

  it('PIPELINE_TABLE_MAP includes compute_cost_estimates', async () => {
    const { PIPELINE_TABLE_MAP } = await import('@/lib/admin/funnel');
    expect(PIPELINE_TABLE_MAP.compute_cost_estimates).toBe('cost_estimates');
  });

  it('PIPELINE_TABLE_MAP includes compute_timing_calibration_v2', async () => {
    const { PIPELINE_TABLE_MAP } = await import('@/lib/admin/funnel');
    expect(PIPELINE_TABLE_MAP.compute_timing_calibration_v2).toBe('phase_calibration');
  });
});

// ── Regression: refresh-snapshot captures cost + timing metrics ──

describe('refresh-snapshot.js cost/timing observability', () => {
  const snapshotSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/refresh-snapshot.js'), 'utf-8'
  );

  it('queries cost_estimates table', () => {
    expect(snapshotSource).toContain('FROM cost_estimates');
  });

  it('uses null constant for timing_calibration (v1 removed)', () => {
    expect(snapshotSource).toContain('timingCal');
    expect(snapshotSource).not.toContain('FROM timing_calibration');
  });

  it('includes cost/timing columns in INSERT', () => {
    expect(snapshotSource).toContain('cost_estimates_total');
    expect(snapshotSource).toContain('timing_calibration_total');
    expect(snapshotSource).toContain('timing_calibration_freshness_hours');
  });
});

// ── Regression: assert-data-bounds validates cost + timing tables ──

describe('assert-data-bounds.js cost/timing validation', () => {
  const boundsSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/quality/assert-data-bounds.js'), 'utf-8'
  );

  it('checks cost_estimates coverage', () => {
    expect(boundsSource).toContain('FROM cost_estimates');
    expect(boundsSource).toContain('estimated_cost IS NULL');
  });

  it('v1 timing_calibration staleness check removed (migration 106)', () => {
    expect(boundsSource).not.toContain('FROM timing_calibration');
  });

  it('gates cost checks on runPermitChecks', () => {
    const permitBlock = boundsSource.split('runPermitChecks').slice(1).join('');
    expect(permitBlock).toContain('cost_estimates');
  });
});

// ── Regression: assert-schema validateTypeSample handles CKAN junk rows ──

describe('assert-schema.js EST_CONST_COST type validation resilience', () => {
  const schemaSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/quality/assert-schema.js'), 'utf-8'
  );

  it('filters out CKAN sentinel rows before type checking', () => {
    // CKAN returns junk rows like "DO NOT UPDATE OR DELETE THIS INFO FIELD"
    // that must be excluded before checking if costs are parseable
    expect(schemaSource).toContain('isSentinelValue');
    expect(schemaSource).toContain('DO NOT UPDATE');
    expect(schemaSource).toContain('DO NOT DELETE');
  });

  it('strips commas from formatted cost strings before parsing', () => {
    // CKAN returns costs like "1,000" — Number("1,000") is NaN but
    // stripping non-numeric chars makes it parseable, matching cleanCost()
    // in load-permits.js
    expect(schemaSource).toContain('parseCost');
    expect(schemaSource).toContain("replace(/[^0-9.\\-]/g, '')");
  });

  it('samples 20 rows instead of 5 to reduce all-junk risk', () => {
    expect(schemaSource).toContain('limit=20');
    expect(schemaSource).not.toContain('limit=5');
  });

  it('warns instead of failing when all sampled rows are sentinel/empty', () => {
    // If every row is junk, the schema is still valid — we just can't
    // verify cost parseability. This should not block the pipeline.
    expect(schemaSource).toContain('all sampled rows are sentinel/empty');
  });

  it('parseCost mirrors cleanCost regex from load-permits.js', () => {
    const loadSource = fs.readFileSync(
      path.join(__dirname, '../../scripts/load-permits.js'), 'utf-8'
    );
    // Both scripts must use the same non-numeric stripping regex
    const regex = "[^0-9.\\-]";
    expect(schemaSource).toContain(regex);
    expect(loadSource).toContain(regex);
  });
});

// ── Regression: compute-cost-estimates advisory lock emits telemetry ──

describe('compute-cost-estimates.js advisory lock resilience', () => {
  const costSource = fs.readFileSync(
    path.join(__dirname, '../../scripts/compute-cost-estimates.js'), 'utf-8'
  );

  it('emits PIPELINE_SUMMARY on advisory lock early return (Phase 2: lockResult.acquired guard)', () => {
    // When lock is held by another process, the script must still emit
    // telemetry so the chain orchestrator has records_new = 0 (not null).
    // Phase 2: split on lockResult.acquired guard, not pg_try_advisory_lock.
    const skipBlock = costSource.match(/if\s*\(!lockResult\.acquired\)([\s\S]{0,2000})/)?.[0] ?? '';
    const beforeReturn = skipBlock.split('return;')[0] || '';
    expect(beforeReturn).toContain('emitSummary');
  });

  it('runs inside the permits chain (not sources)', () => {
    expect(costSource).toContain('inside the permits chain');
    expect(costSource).not.toContain('inside the sources chain');
  });
});

// V1 compute-timing-calibration.js tests removed — script deleted in migration 106.
// V2 equivalent: compute-timing-calibration-v2.js tested in its own infra file.
