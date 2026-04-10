// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §2.1
//
// Query functions for the Lead Feed Health admin endpoint.
// Read-only aggregates against existing tables — no mutations.

import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface LeadFeedReadiness {
  active_permits: number;
  permits_geocoded: number;
  permits_classified: number;
  permits_with_cost: number;
  timing_types_calibrated: number;
  timing_freshness_hours: number | null;
  feed_ready_pct: number;
  builders_total: number;
  builders_with_contact: number;
  builders_wsib_verified: number;
}

export interface CostCoverage {
  total: number;
  from_permit: number;
  from_model: number;
  null_cost: number;
  coverage_pct: number;
}

export interface TradeEngagement {
  trade_slug: string;
  views: number;
  saves: number;
}

export interface Engagement {
  views_today: number;
  views_7d: number;
  saves_today: number;
  saves_7d: number;
  unique_users_7d: number;
  avg_competition_per_lead: number;
  top_trades: TradeEngagement[];
}

export interface LeadFeedHealthResponse {
  readiness: LeadFeedReadiness;
  cost_coverage: CostCoverage;
  engagement: Engagement;
  performance: {
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    error_rate_pct: number | null;
    avg_results_per_query: number | null;
  };
}

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
// Query functions
// ---------------------------------------------------------------------------

export async function getLeadFeedReadiness(pool: Pool): Promise<LeadFeedReadiness> {
  const [activeRes, geocodedRes, classifiedRes, costRes, timingRes, buildersRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) as c FROM permits WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`),
    pool.query(`SELECT COUNT(*) as c FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`),
    pool.query(`SELECT COUNT(DISTINCT (pt.permit_num, pt.revision_num)) as c FROM permit_trades pt JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num WHERE p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`),
    pool.query(`SELECT COUNT(*) as c FROM cost_estimates WHERE estimated_cost IS NOT NULL`),
    pool.query(`SELECT COUNT(*) as total, ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0, 1) as freshness_hours FROM timing_calibration`),
    pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL) as with_contact, COUNT(*) FILTER (WHERE is_wsib_registered = true) as wsib FROM entities`),
  ]);

  const active = parseInt(activeRes.rows[0].c, 10);
  const geocoded = parseInt(geocodedRes.rows[0].c, 10);
  const classified = parseInt(classifiedRes.rows[0].c, 10);
  const withCost = parseInt(costRes.rows[0].c, 10);
  const timingTotal = parseInt(timingRes.rows[0].total, 10);
  const timingFreshness = timingRes.rows[0].freshness_hours !== null
    ? parseFloat(timingRes.rows[0].freshness_hours)
    : null;

  // 3-way intersection: permits that have ALL of geocoding + trade + cost
  const feedReadyRes = await pool.query(`
    SELECT COUNT(DISTINCT p.permit_num || ':' || p.revision_num) as c
    FROM permits p
    JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
    JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num AND ce.estimated_cost IS NOT NULL
    WHERE p.latitude IS NOT NULL
      AND p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')
  `);
  const feedReady = parseInt(feedReadyRes.rows[0].c, 10);

  return {
    active_permits: active,
    permits_geocoded: geocoded,
    permits_classified: classified,
    permits_with_cost: withCost,
    timing_types_calibrated: timingTotal,
    timing_freshness_hours: timingFreshness,
    feed_ready_pct: active > 0 ? Math.round((feedReady / active) * 1000) / 10 : 0,
    builders_total: parseInt(buildersRes.rows[0].total, 10),
    builders_with_contact: parseInt(buildersRes.rows[0].with_contact, 10),
    builders_wsib_verified: parseInt(buildersRes.rows[0].wsib, 10),
  };
}

export async function getCostCoverage(pool: Pool): Promise<CostCoverage> {
  const res = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE cost_source = 'permit') as from_permit,
           COUNT(*) FILTER (WHERE cost_source = 'model') as from_model,
           COUNT(*) FILTER (WHERE estimated_cost IS NULL) as null_cost
    FROM cost_estimates
  `);
  const r = res.rows[0];
  const total = parseInt(r.total, 10);
  const nullCost = parseInt(r.null_cost, 10);
  return {
    total,
    from_permit: parseInt(r.from_permit, 10),
    from_model: parseInt(r.from_model, 10),
    null_cost: nullCost,
    coverage_pct: total > 0 ? Math.round(((total - nullCost) / total) * 1000) / 10 : 0,
  };
}

export async function getEngagement(pool: Pool): Promise<Engagement> {
  const [dailyRes, tradesRes, competitionRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE) as views_today,
        COUNT(*) as views_7d,
        COUNT(*) FILTER (WHERE saved = true AND viewed_at >= CURRENT_DATE) as saves_today,
        COUNT(*) FILTER (WHERE saved = true) as saves_7d,
        COUNT(DISTINCT user_id) as unique_users
      FROM lead_views
      WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days'
    `),
    pool.query(`
      SELECT trade_slug,
             COUNT(*) as views,
             COUNT(*) FILTER (WHERE saved = true) as saves
      FROM lead_views
      WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY trade_slug
      ORDER BY views DESC
      LIMIT 10
    `),
    pool.query(`
      SELECT COALESCE(ROUND(AVG(save_count)::numeric, 1), 0) as avg_competition
      FROM (
        SELECT lead_key, COUNT(*) FILTER (WHERE saved = true) as save_count
        FROM lead_views
        WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY lead_key
        HAVING COUNT(*) FILTER (WHERE saved = true) > 0
      ) x
    `),
  ]);

  const d = dailyRes.rows[0];
  return {
    views_today: parseInt(d.views_today, 10),
    views_7d: parseInt(d.views_7d, 10),
    saves_today: parseInt(d.saves_today, 10),
    saves_7d: parseInt(d.saves_7d, 10),
    unique_users_7d: parseInt(d.unique_users, 10),
    avg_competition_per_lead: parseFloat(competitionRes.rows[0].avg_competition) || 0,
    top_trades: tradesRes.rows.map((r: { trade_slug: string; views: string; saves: string }) => ({
      trade_slug: r.trade_slug,
      views: parseInt(r.views, 10),
      saves: parseInt(r.saves, 10),
    })),
  };
}

export function computeTestFeedDebug(
  items: Array<{ lead_type: string; relevance_score: number; proximity_score: number; timing_score: number; value_score: number; opportunity_score: number }>,
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
