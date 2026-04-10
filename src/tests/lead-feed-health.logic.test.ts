// SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md
import { describe, it, expect } from 'vitest';
import { computeTestFeedDebug } from '@/lib/admin/lead-feed-health';

describe('computeTestFeedDebug', () => {
  it('returns null distributions for empty items', () => {
    const debug = computeTestFeedDebug([], 100);
    expect(debug.query_duration_ms).toBe(100);
    expect(debug.permits_in_results).toBe(0);
    expect(debug.builders_in_results).toBe(0);
    expect(debug.score_distribution).toBeNull();
    expect(debug.pillar_averages).toBeNull();
  });

  it('counts permits and builders separately', () => {
    const items = [
      { lead_type: 'permit', relevance_score: 80, proximity_score: 25, timing_score: 20, value_score: 15, opportunity_score: 20 },
      { lead_type: 'permit', relevance_score: 60, proximity_score: 20, timing_score: 15, value_score: 10, opportunity_score: 15 },
      { lead_type: 'builder', relevance_score: 70, proximity_score: 22, timing_score: 18, value_score: 12, opportunity_score: 18 },
    ];
    const debug = computeTestFeedDebug(items, 250);
    expect(debug.permits_in_results).toBe(2);
    expect(debug.builders_in_results).toBe(1);
  });

  it('computes score distribution correctly', () => {
    const items = [10, 20, 30, 40, 50].map(s => ({
      lead_type: 'permit', relevance_score: s, proximity_score: 0, timing_score: 0, value_score: 0, opportunity_score: 0,
    }));
    const debug = computeTestFeedDebug(items, 100);
    expect(debug.score_distribution).not.toBeNull();
    expect(debug.score_distribution!.min).toBe(10);
    expect(debug.score_distribution!.max).toBe(50);
    expect(debug.score_distribution!.median).toBe(30);
  });

  it('computes pillar averages', () => {
    const items = [
      { lead_type: 'permit', relevance_score: 80, proximity_score: 20, timing_score: 30, value_score: 10, opportunity_score: 20 },
      { lead_type: 'permit', relevance_score: 60, proximity_score: 10, timing_score: 20, value_score: 20, opportunity_score: 10 },
    ];
    const debug = computeTestFeedDebug(items, 100);
    expect(debug.pillar_averages).not.toBeNull();
    expect(debug.pillar_averages!.proximity).toBe(15);
    expect(debug.pillar_averages!.timing).toBe(25);
    expect(debug.pillar_averages!.value).toBe(15);
    expect(debug.pillar_averages!.opportunity).toBe(15);
  });
});
