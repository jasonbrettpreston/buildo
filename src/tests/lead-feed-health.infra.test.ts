// SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Lead Feed Health API routes — file shape', () => {
  const healthRoute = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/leads/health/route.ts'), 'utf-8'
  );
  const testFeedRoute = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/leads/test-feed/route.ts'), 'utf-8'
  );

  // Health endpoint
  it('health route exports a GET handler', () => {
    expect(healthRoute).toContain('export async function GET');
  });

  it('health route uses logError for error handling', () => {
    expect(healthRoute).toContain('logError');
    expect(healthRoute).not.toContain('console.error');
  });

  it('health route has try-catch boundary', () => {
    expect(healthRoute).toContain('try {');
    expect(healthRoute).toContain('catch (err)');
  });

  it('health route uses the cached lead feed health fetcher (Phase 2)', () => {
    // WF3 Phase 2: the route delegates to getCachedLeadFeedHealth, which
    // wraps the 3 underlying query functions behind a 30s in-memory cache.
    // The lib-level test below checks the cache wrapper invokes all 3
    // underlying fetchers — here we only verify the handler indirection.
    expect(healthRoute).toContain('getCachedLeadFeedHealth');
  });

  // Test feed endpoint
  it('test-feed route exports a GET handler', () => {
    expect(testFeedRoute).toContain('export async function GET');
  });

  it('test-feed route uses logError for error handling', () => {
    expect(testFeedRoute).toContain('logError');
    expect(testFeedRoute).not.toContain('console.error');
  });

  it('test-feed route has Zod validation', () => {
    expect(testFeedRoute).toContain('safeParse');
    expect(testFeedRoute).toContain('testFeedSchema');
  });

  it('test-feed route bypasses user auth — uses synthetic admin-test user_id', () => {
    expect(testFeedRoute).toContain("'admin-test'");
    expect(testFeedRoute).not.toContain('getCurrentUserContext');
  });

  it('test-feed route returns { data, error: null, meta, _debug }', () => {
    expect(testFeedRoute).toContain('error: null');
    expect(testFeedRoute).toContain('_debug');
  });

  it('test-feed route calls getLeadFeed from the same lib as the real feed', () => {
    expect(testFeedRoute).toContain("from '@/features/leads/lib/get-lead-feed'");
  });

  it('test-feed route returns 400 on validation failure (not 500)', () => {
    expect(testFeedRoute).toContain('status: 400');
  });

  it('test-feed route pre-flights PostGIS before calling getLeadFeed (WF3 2026-04-11)', () => {
    // Missing PostGIS is the #1 cause of "Feed query failed" in dev. The
    // route must check isPostgisAvailable BEFORE calling getLeadFeed and
    // return a clear 503 + DEV_ENV_MISSING_POSTGIS when absent, so devs
    // see an actionable message instead of an opaque 500.
    expect(testFeedRoute).toContain('isPostgisAvailable');
    expect(testFeedRoute).toContain('DEV_ENV_MISSING_POSTGIS');
    expect(testFeedRoute).toContain('status: 503');

    // ORDERING CHECK (adversarial review 2026-04-11): a regression that
    // moved the isPostgisAvailable call INSIDE the catch block or AFTER
    // the getLeadFeed call would still pass the token-presence checks
    // above but silently re-introduce the opaque-500 bug. Assert the
    // check fires BEFORE the getLeadFeed invocation by comparing source
    // positions. If both strings appear and the pre-flight is first,
    // this passes; otherwise it fails loudly.
    const preflightIdx = testFeedRoute.indexOf('isPostgisAvailable(pool)');
    const getLeadFeedIdx = testFeedRoute.indexOf('getLeadFeed(');
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(getLeadFeedIdx).toBeGreaterThan(-1);
    expect(preflightIdx).toBeLessThan(getLeadFeedIdx);
  });

  it('test-feed route surfaces sanitized error message in non-production (WF3 2026-04-11)', () => {
    // Catch block must mirror the health route pattern: canned message in
    // production, sanitizePgErrorMessage(error.message) in dev/test so
    // operators can diagnose without digging through server logs.
    expect(testFeedRoute).toContain('sanitizePgErrorMessage');
    expect(testFeedRoute).toMatch(/NODE_ENV\s*===\s*['"]production['"]/);
  });
});

describe('Lead Feed Health lib — query function shape', () => {
  const lib = fs.readFileSync(
    path.resolve(__dirname, '../lib/admin/lead-feed-health.ts'), 'utf-8'
  );

  it('exports getLeadFeedReadiness, getCostCoverage, getEngagement', () => {
    expect(lib).toContain('export async function getLeadFeedReadiness');
    expect(lib).toContain('export async function getCostCoverage');
    expect(lib).toContain('export async function getEngagement');
  });

  it('computes feed_ready_pct from 3-way intersection (geocoded + trade + cost)', () => {
    expect(lib).toContain('JOIN permit_trades');
    expect(lib).toContain('JOIN cost_estimates');
    expect(lib).toContain('latitude IS NOT NULL');
  });

  it('queries lead_views using saved column (not is_saved)', () => {
    expect(lib).toContain('saved = true');
    expect(lib).not.toContain('is_saved = true');
  });

  it('exports LeadFeedHealthResponse type', () => {
    expect(lib).toContain('export interface LeadFeedHealthResponse');
  });

  it('getCachedLeadFeedHealth wrapper invokes all 3 underlying fetchers (Phase 2)', () => {
    // Moved out of the route.ts file-shape tests in Phase 2 when the cache
    // wrapper took ownership of the fan-out. Verifies the relocation
    // preserved the contract — all 3 queries still run on cache miss.
    expect(lib).toContain('export async function getCachedLeadFeedHealth');
    expect(lib).toContain('getLeadFeedReadiness(pool)');
    expect(lib).toContain('getCostCoverage(pool)');
    expect(lib).toContain('getEngagement(pool)');
  });

  it('getCachedLeadFeedHealth sets performance block with null latency (Phase A contract preserved)', () => {
    expect(lib).toContain('avg_latency_ms: null');
    expect(lib).toContain('p95_latency_ms: null');
  });
});

describe('DataQualitySnapshot interface includes cost/timing fields', () => {
  const types = fs.readFileSync(
    path.resolve(__dirname, '../lib/quality/types.ts'), 'utf-8'
  );

  it('has cost_estimates_total field', () => {
    expect(types).toContain('cost_estimates_total');
  });

  it('has timing_calibration_total field', () => {
    expect(types).toContain('timing_calibration_total');
  });

  it('has timing_calibration_freshness_hours field', () => {
    expect(types).toContain('timing_calibration_freshness_hours');
  });
});

describe('Admin stats includes lead_views in live_table_counts', () => {
  const stats = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/stats/route.ts'), 'utf-8'
  );

  it('queries lead_views table in live_table_counts', () => {
    expect(stats).toContain("'lead_views'");
  });

  it('queries cost_estimates table in live_table_counts', () => {
    expect(stats).toContain("'cost_estimates'");
  });

  it('queries phase_calibration table in live_table_counts', () => {
    expect(stats).toContain("'phase_calibration'");
  });
});

describe('Admin page has Lead Feed tile', () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, '../app/admin/page.tsx'), 'utf-8'
  );

  it('links to /admin/lead-feed', () => {
    expect(page).toContain('/admin/lead-feed');
  });

  it('has 4 navigation tiles (Data Quality + Market Metrics + Lead Feed + Control Panel)', () => {
    const linkMatches = page.match(/href="\/admin\//g);
    expect(linkMatches).toHaveLength(4);
  });
});
