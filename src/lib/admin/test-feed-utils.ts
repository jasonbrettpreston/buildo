// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
//
// Shared utilities for the admin test-feed endpoint and the production
// /api/leads/feed route. Extracted from lead-feed-health.ts when the
// health dashboard was removed (WF2 2026-04-22).

import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestFeedDebug {
  query_duration_ms: number;
  permits_in_results: number;
  builders_in_results: number;
  score_distribution: {
    min: number; max: number; median: number; p25: number; p75: number;
  } | null;
  pillar_averages: {
    proximity: number; timing: number; value: number; opportunity: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

/**
 * Strip database credentials from an error message before it leaves the
 * server. node-postgres can embed the full DATABASE_URL (including the
 * password component) in error messages when connection string parsing
 * fails — see brianc/node-postgres#3145.
 */
export function sanitizePgErrorMessage(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\s@]*@/gi, 'postgres://***@');
}

// ---------------------------------------------------------------------------
// PostGIS pre-flight
// ---------------------------------------------------------------------------
// Dev-env pre-flight for routes that use PostGIS geography casts.
// Production Cloud SQL has PostGIS; local dev may not. Without detection,
// those routes fail with an opaque 500 (pg code 42704: type "geography"
// does not exist).
//
// Cache semantics:
// - Successful results cached for the process lifetime (PostGIS presence
//   doesn't change mid-session in production). A dev who installs PostGIS
//   mid-session needs a server restart — acceptable.
// - Query FAILURES are NOT cached. The next call retries. This prevents a
//   transient pool error from wedging the endpoint permanently.
// - __resetPostgisCacheForTests() clears state for isolated test cases.

let postgisChecked: boolean | null = null;

/**
 * Check whether the PostGIS extension is installed in the current database.
 * Cached process-wide on first SUCCESSFUL check. Query failures return
 * `false` for the current call but are NOT cached — the next call retries.
 */
export async function isPostgisAvailable(pool: Pool): Promise<boolean> {
  if (postgisChecked !== null) return postgisChecked;
  try {
    const res = await pool.query<{ installed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed`,
    );
    postgisChecked = res.rows[0]?.installed ?? false;
    return postgisChecked;
  } catch {
    return false;
  }
}

/** Test-only reset for module-level PostGIS cache. Never call from prod. */
export function __resetPostgisCacheForTests(): void {
  postgisChecked = null;
}

// ---------------------------------------------------------------------------
// Debug computation
// ---------------------------------------------------------------------------

export function computeTestFeedDebug(
  items: Array<{
    lead_type: string;
    relevance_score: number;
    proximity_score: number;
    timing_score: number;
    value_score: number;
    opportunity_score: number;
  }>,
  durationMs: number,
): TestFeedDebug {
  const permits = items.filter(i => i.lead_type === 'permit');
  const builders = items.filter(i => i.lead_type === 'builder');
  const scores = items.map(i => i.relevance_score).sort((a, b) => a - b);

  const scoreDistribution = scores.length > 0
    ? {
        min: scores[0] ?? 0,
        max: scores[scores.length - 1] ?? 0,
        median: scores[Math.floor(scores.length / 2)] ?? 0,
        p25: scores[Math.floor(scores.length * 0.25)] ?? 0,
        p75: scores[Math.floor(scores.length * 0.75)] ?? 0,
      }
    : null;

  const pillarAverages = items.length > 0
    ? {
        proximity: Math.round(items.reduce((s, i) => s + i.proximity_score, 0) / items.length * 10) / 10,
        timing: Math.round(items.reduce((s, i) => s + i.timing_score, 0) / items.length * 10) / 10,
        value: Math.round(items.reduce((s, i) => s + i.value_score, 0) / items.length * 10) / 10,
        opportunity: Math.round(items.reduce((s, i) => s + i.opportunity_score, 0) / items.length * 10) / 10,
      }
    : null;

  return {
    query_duration_ms: durationMs,
    permits_in_results: permits.length,
    builders_in_results: builders.length,
    score_distribution: scoreDistribution,
    pillar_averages: pillarAverages,
  };
}
