// SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md
import { describe, it, expect, vi } from 'vitest';
import {
  computeTestFeedDebug,
  getLeadFeedReadiness,
  getCostCoverage,
  sanitizePgErrorMessage,
} from '@/lib/admin/lead-feed-health';
import type { Pool } from 'pg';

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

// ---------------------------------------------------------------------------
// getLeadFeedReadiness — pool pressure regression lock (WF3 2026-04-10)
// ---------------------------------------------------------------------------
// Guards against the pool-exhaustion regression introduced by the 14-query
// parallel batch. The consolidated version runs at most 8 queries, which
// comfortably fits the default-10 pool (now raised to 20).

describe('getLeadFeedReadiness — query fan-out regression lock', () => {
  function makeMockPool() {
    const queries: string[] = [];
    const mock = {
      query: vi.fn((sql: string) => {
        queries.push(sql);
        // Return a shape that satisfies every destructuring in the function.
        // Every COUNT FILTER column used in the real SQL must appear here.
        return Promise.resolve({
          rows: [{
            // permits consolidated query
            admin_active: '1000',
            feed_active: '1200',
            geocoded: '950',
            opp_permit_issued: '500',
            opp_inspection: '300',
            opp_application: '100',
            opp_other_active: '100',
            with_neighbourhood: '900',
            // trades consolidated
            classified_all: '800',
            classified_active: '700',
            with_phase: '650',
            // cost + timing consolidated
            cost_count: '750',
            timing_total: '4',
            timing_freshness_hours: '6.5',
            // entities consolidated
            total: '500',
            with_contact: '200',
            wsib: '150',
            feed_eligible: '100',
            // generic count columns used by single-value queries
            c: '80',
          }],
        });
      }),
    };
    return { pool: mock as unknown as Pool, queries };
  }

  it('runs at most 8 queries to stay well below the default pool size', async () => {
    const { pool, queries } = makeMockPool();
    await getLeadFeedReadiness(pool);
    expect(queries.length).toBeLessThanOrEqual(8);
  });

  it('returns every field documented in the LeadFeedReadiness interface', async () => {
    const { pool } = makeMockPool();
    const readiness = await getLeadFeedReadiness(pool);

    // Legacy fields
    expect(readiness.active_permits).toBe(1000);
    expect(readiness.permits_geocoded).toBe(950);
    expect(readiness.permits_classified).toBe(800);
    expect(readiness.permits_with_cost).toBe(750);
    expect(readiness.timing_types_calibrated).toBe(4);
    expect(readiness.timing_freshness_hours).toBe(6.5);
    expect(readiness.builders_total).toBe(500);
    expect(readiness.builders_with_contact).toBe(200);
    expect(readiness.builders_wsib_verified).toBe(150);

    // New WF3 fields — MUST all be populated
    expect(readiness.feed_active_permits).toBe(1200);
    expect(readiness.permits_classified_active).toBe(700);
    expect(readiness.permits_with_phase).toBe(650);
    expect(readiness.permits_with_timing_calibration_match).toBe(80);
    expect(readiness.permits_feed_eligible).toBe(80);
    expect(readiness.builders_feed_eligible).toBe(100);
    expect(readiness.neighbourhoods_total).toBe(80);
    expect(readiness.permits_with_neighbourhood).toBe(900);

    // Opportunity breakdown
    expect(readiness.permits_by_opportunity_status.permit_issued).toBe(500);
    expect(readiness.permits_by_opportunity_status.inspection).toBe(300);
    expect(readiness.permits_by_opportunity_status.application).toBe(100);
    expect(readiness.permits_by_opportunity_status.other_active).toBe(100);
  });

  it('handles null timing_freshness_hours gracefully', async () => {
    const mock = {
      query: vi.fn(() => Promise.resolve({
        rows: [{
          admin_active: '1000', feed_active: '1000', geocoded: '0',
          opp_permit_issued: '0', opp_inspection: '0', opp_application: '0', opp_other_active: '0',
          with_neighbourhood: '0', classified_all: '0', classified_active: '0', with_phase: '0',
          cost_count: '0', timing_total: '0', timing_freshness_hours: null,
          total: '0', with_contact: '0', wsib: '0', feed_eligible: '0', c: '0',
        }],
      })),
    };
    const readiness = await getLeadFeedReadiness(mock as unknown as Pool);
    expect(readiness.timing_freshness_hours).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sanitizePgErrorMessage — credential leak guard
// ---------------------------------------------------------------------------
// Adversarial review (WF3 2026-04-10) flagged that the dev-mode error
// handler in /api/admin/leads/health/route.ts returns `error.message` raw,
// and that node-postgres (brianc/node-postgres#3145) can embed the full
// DATABASE_URL — including the password component — in error messages when
// connection-string parsing fails. This regression lock ensures any
// postgres(ql):// credential pattern is masked before leaving the server.

describe('sanitizePgErrorMessage', () => {
  it('masks postgres:// credentials', () => {
    const raw = 'connection failed: postgres://buildo:s3cret@localhost:5432/buildo';
    expect(sanitizePgErrorMessage(raw)).toBe(
      'connection failed: postgres://***@localhost:5432/buildo',
    );
  });

  it('masks postgresql:// credentials (long form)', () => {
    const raw = 'could not connect to postgresql://admin:hunter2@db.internal/buildo';
    expect(sanitizePgErrorMessage(raw)).toBe(
      'could not connect to postgres://***@db.internal/buildo',
    );
  });

  it('masks multiple credential occurrences in one message', () => {
    const raw = 'primary=postgres://a:b@h1/db replica=postgres://c:d@h2/db';
    expect(sanitizePgErrorMessage(raw)).toBe(
      'primary=postgres://***@h1/db replica=postgres://***@h2/db',
    );
  });

  it('passes through messages with no credentials unchanged', () => {
    const raw = 'timeout exceeded when trying to connect';
    expect(sanitizePgErrorMessage(raw)).toBe(raw);
  });

  it('is case-insensitive on scheme', () => {
    expect(sanitizePgErrorMessage('POSTGRES://u:p@h/d')).toBe('postgres://***@h/d');
    expect(sanitizePgErrorMessage('PostgreSQL://u:p@h/d')).toBe('postgres://***@h/d');
  });
});

// ---------------------------------------------------------------------------
// getCostCoverage — dual coverage metric (WF3 2026-04-10 Phase 1, external
// review Claim 9)
// ---------------------------------------------------------------------------
// The library's `coverage_pct` measures coverage WITHIN the cost_estimates
// cache. The `coverage_pct_vs_active_permits` field is the headline metric
// for "how much of the active permit universe has a cost estimate". It's
// computed by the route handler from LeadFeedReadiness values already
// fetched, so getCostCoverage initializes it to 0 as a placeholder.

describe('getCostCoverage — dual coverage contract', () => {
  function makeMockPool(rows: Record<string, string>) {
    return {
      query: vi.fn(() => Promise.resolve({ rows: [rows] })),
    } as unknown as Pool;
  }

  it('returns the legacy cache-scoped coverage_pct', async () => {
    const pool = makeMockPool({
      total: '7200',
      from_permit: '4000',
      from_model: '2800',
      null_cost: '400',
    });
    const cc = await getCostCoverage(pool);
    expect(cc.total).toBe(7200);
    // (7200 - 400) / 7200 = 94.44% → rounded to 94.4
    expect(cc.coverage_pct).toBe(94.4);
  });

  it('initializes coverage_pct_vs_active_permits to 0 (route handler overrides)', async () => {
    const pool = makeMockPool({
      total: '1000',
      from_permit: '500',
      from_model: '500',
      null_cost: '0',
    });
    const cc = await getCostCoverage(pool);
    // The library placeholder — route handler computes the real value from
    // LeadFeedReadiness.permits_with_cost / LeadFeedReadiness.active_permits.
    expect(cc.coverage_pct_vs_active_permits).toBe(0);
  });

  it('handles the empty-table edge (total=0) without division by zero', async () => {
    const pool = makeMockPool({
      total: '0',
      from_permit: '0',
      from_model: '0',
      null_cost: '0',
    });
    const cc = await getCostCoverage(pool);
    expect(cc.coverage_pct).toBe(0);
    expect(cc.coverage_pct_vs_active_permits).toBe(0);
  });
});
