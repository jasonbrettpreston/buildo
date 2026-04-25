// SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Test Feed API route — file shape', () => {
  const testFeedRoute = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/leads/test-feed/route.ts'), 'utf-8'
  );

  it('exports a GET handler', () => {
    const hasDirectExport = testFeedRoute.includes('export async function GET');
    const hasEnvelopeExport = testFeedRoute.includes('withApiEnvelope');
    expect(hasDirectExport || hasEnvelopeExport).toBe(true);
  });

  it('uses logError for error handling', () => {
    expect(testFeedRoute).toContain('logError');
    expect(testFeedRoute).not.toContain('console.error');
  });

  it('has Zod validation', () => {
    expect(testFeedRoute).toContain('safeParse');
    expect(testFeedRoute).toContain('testFeedSchema');
  });

  it('bypasses user auth — uses synthetic admin-test user_id', () => {
    expect(testFeedRoute).toContain("'admin-test'");
    expect(testFeedRoute).not.toContain('getCurrentUserContext');
  });

  it('returns { data, error: null, meta, _debug } on success', () => {
    expect(testFeedRoute).toContain('error: null');
    expect(testFeedRoute).toContain('_debug');
  });

  it('calls getLeadFeed from the standard lead feed lib', () => {
    expect(testFeedRoute).toContain("from '@/features/leads/lib/get-lead-feed'");
  });

  it('returns 400 on validation failure with VALIDATION_FAILED code', () => {
    expect(testFeedRoute).toContain('status: 400');
    // Must use VALIDATION_FAILED (not VALIDATION_ERROR) to match codebase convention.
    expect(testFeedRoute).toContain("'VALIDATION_FAILED'");
    expect(testFeedRoute).not.toContain("'VALIDATION_ERROR'");
  });

  it('pre-flights PostGIS before calling getLeadFeed (WF3 2026-04-11)', () => {
    // isPostgisAvailable must appear BEFORE getLeadFeed in the source so
    // the 503 short-circuits rather than letting the query crash with an
    // opaque pg error.
    expect(testFeedRoute).toContain('isPostgisAvailable');
    expect(testFeedRoute).toContain('DEV_ENV_MISSING_POSTGIS');
    expect(testFeedRoute).toContain('status: 503');
    const postgisPos = testFeedRoute.indexOf('isPostgisAvailable');
    const feedPos = testFeedRoute.indexOf('getLeadFeed(');
    expect(postgisPos).toBeLessThan(feedPos);
  });

  it('imports utilities from test-feed-utils (not lead-feed-health)', () => {
    expect(testFeedRoute).toContain("from '@/lib/admin/test-feed-utils'");
    expect(testFeedRoute).not.toContain("from '@/lib/admin/lead-feed-health'");
  });

  it('has a try-catch boundary', () => {
    expect(testFeedRoute).toContain('try {');
    expect(testFeedRoute).toContain('catch (err)');
  });
});

describe('Production feed route — imports test-feed-utils for PostGIS check', () => {
  const feedRoute = fs.readFileSync(
    path.resolve(__dirname, '../app/api/leads/feed/route.ts'), 'utf-8'
  );

  it('imports isPostgisAvailable from test-feed-utils (not lead-feed-health)', () => {
    expect(feedRoute).toContain("from '@/lib/admin/test-feed-utils'");
    expect(feedRoute).not.toContain("from '@/lib/admin/lead-feed-health'");
  });
});
