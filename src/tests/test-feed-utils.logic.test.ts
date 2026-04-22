// SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTestFeedDebug,
  isPostgisAvailable,
  sanitizePgErrorMessage,
  __resetPostgisCacheForTests,
} from '@/lib/admin/test-feed-utils';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// computeTestFeedDebug
// ---------------------------------------------------------------------------

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

  it('records exact query_duration_ms', () => {
    const debug = computeTestFeedDebug([], 473);
    expect(debug.query_duration_ms).toBe(473);
  });
});

// ---------------------------------------------------------------------------
// sanitizePgErrorMessage
// ---------------------------------------------------------------------------

describe('sanitizePgErrorMessage', () => {
  it('strips postgres:// credentials', () => {
    const raw = 'connect ECONNREFUSED postgres://user:secret@localhost:5432/db';
    expect(sanitizePgErrorMessage(raw)).toContain('postgres://***@');
    expect(sanitizePgErrorMessage(raw)).not.toContain('secret');
  });

  it('strips postgresql:// variant', () => {
    const raw = 'error postgresql://admin:pass@host/db';
    expect(sanitizePgErrorMessage(raw)).toContain('postgres://***@');
    expect(sanitizePgErrorMessage(raw)).not.toContain('pass');
  });

  it('passes through messages with no credentials', () => {
    const msg = 'type "geography" does not exist';
    expect(sanitizePgErrorMessage(msg)).toBe(msg);
  });
});

// ---------------------------------------------------------------------------
// isPostgisAvailable — cache behaviour
// ---------------------------------------------------------------------------

describe('isPostgisAvailable — cache semantics', () => {
  beforeEach(() => {
    __resetPostgisCacheForTests();
  });

  it('returns true when PostGIS is installed', async () => {
    const mockPool = {
      query: async () => ({ rows: [{ installed: true }] }),
    } as unknown as Pool;
    const result = await isPostgisAvailable(mockPool);
    expect(result).toBe(true);
  });

  it('returns false when PostGIS is not installed', async () => {
    const mockPool = {
      query: async () => ({ rows: [{ installed: false }] }),
    } as unknown as Pool;
    const result = await isPostgisAvailable(mockPool);
    expect(result).toBe(false);
  });

  it('caches successful true result — second call skips query', async () => {
    let callCount = 0;
    const mockPool = {
      query: async () => { callCount++; return { rows: [{ installed: true }] }; },
    } as unknown as Pool;
    await isPostgisAvailable(mockPool);
    await isPostgisAvailable(mockPool);
    expect(callCount).toBe(1);
  });

  it('does NOT cache query failures — next call retries', async () => {
    let callCount = 0;
    const mockPool = {
      query: async () => { callCount++; throw new Error('pool error'); },
    } as unknown as Pool;
    const r1 = await isPostgisAvailable(mockPool);
    const r2 = await isPostgisAvailable(mockPool);
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(callCount).toBe(2);
  });

  it('returns false for query failure without caching', async () => {
    const mockPool = {
      query: async () => { throw new Error('connection error'); },
    } as unknown as Pool;
    const result = await isPostgisAvailable(mockPool);
    expect(result).toBe(false);
  });
});
