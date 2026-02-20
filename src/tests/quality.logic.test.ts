// Logic Layer Tests - Data quality score calculations and metric extraction
// SPEC LINK: docs/specs/28_data_quality_dashboard.md
import { describe, it, expect } from 'vitest';
import {
  calculateEffectivenessScore,
  extractMetrics,
  EFFECTIVENESS_WEIGHTS,
} from '@/lib/quality/types';
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
