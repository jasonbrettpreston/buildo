// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §2.1
//
// Query functions for the Lead Feed Health admin endpoint.
// Read-only aggregates against existing tables — no mutations.

import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface LeadFeedReadiness {
  // --- Existing fields (preserved for backward compatibility) ---
  active_permits: number;
  permits_geocoded: number;
  /** @deprecated Counts any permit_trades row; use permits_classified_active for feed-path accuracy. */
  permits_classified: number;
  permits_with_cost: number;
  timing_types_calibrated: number;
  timing_freshness_hours: number | null;
  feed_ready_pct: number;
  builders_total: number;
  builders_with_contact: number;
  builders_wsib_verified: number;

  // --- Expanded fields (WF3 2026-04-10) ---
  // Each field matches an input the feed SQL actually reads.
  //
  // The DENOMINATOR for all "feed path" coverage percentages. Uses the
  // SAME status predicate as get-lead-feed.ts:235 (NOT IN terminal list),
  // which differs from the historical `active_permits` inclusion list.
  // The Feed-Path Coverage dashboard section uses this as its denominator
  // so every bar's percentage is computed against a consistent population.
  feed_active_permits: number;

  // Classification: feed requires pt.is_active=true AND pt.confidence>=0.5
  permits_classified_active: number;
  // Timing (feed path): permit_trades.phase IS NOT NULL AND phase IN the
  // 4 active phases the feed SQL maps to a timing_score. Feed does NOT use
  // timing_calibration — that's the detail-page engine (spec 71).
  permits_with_phase: number;
  // Detail-page timing: active permits whose permit_type has a row in
  // timing_calibration. Answers "what does 4 permit types calibrated mean?"
  permits_with_timing_calibration_match: number;
  // Opportunity breakdown: counts by permit status (Permit Issued, Inspection,
  // Application, other). Powers the opportunity pillar input.
  permits_by_opportunity_status: {
    permit_issued: number;
    inspection: number;
    application: number;
    other_active: number;
  };
  // Full feed intersection per get-lead-feed.ts WHERE clause:
  //   location NOT NULL + status NOT IN (Cancelled,Revoked,Closed)
  //   + permit_trades.is_active + confidence>=0.5
  permits_feed_eligible: number;
  // Builder feed eligibility = intersection of wsib_per_entity CTE filters:
  //   is_gta + last_enriched + business_size ∈ (Small,Medium)
  //   + (website OR primary_phone)
  builders_feed_eligible: number;
  // Neighbourhoods coverage — LEFT JOIN in feed, powers display card
  neighbourhoods_total: number;
  permits_with_neighbourhood: number;
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

// WF3 2026-04-10: match the feed SQL's hard filters (get-lead-feed.ts:235)
// not the admin's previous fuzzy inclusion list. "Active" for the FEED means
// the status is not in a terminal state, not that the status is in an
// enumerated progress list.
const FEED_ACTIVE_STATUS_PREDICATE = `status NOT IN ('Cancelled','Revoked','Closed')`;

// Historical admin predicate — retained so the existing `active_permits`
// field continues to behave the same way for any consumer that has read
// the raw number. New feed-path fields use FEED_ACTIVE_STATUS_PREDICATE.
const ADMIN_ACTIVE_STATUS_PREDICATE = `status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`;

// The 4 active-build phases the feed SQL maps to a non-fallback timing_score
// (get-lead-feed.ts:147-153). Anything else falls through to timing_score=10.
const FEED_TIMING_PHASES = `('structural','finishing','early_construction','landscaping')`;

export async function getLeadFeedReadiness(pool: Pool): Promise<LeadFeedReadiness> {
  // 14-query parallel batch. All Feed-Path fields share the same
  // FEED_ACTIVE_STATUS_PREDICATE denominator via feed_active_permits,
  // avoiding the apples-to-oranges predicate mismatch flagged in WF3
  // review (adversarial H1, H3).
  const [
    activeRes,
    feedActiveRes,
    geocodedRes,
    classifiedAllRes,
    classifiedActiveRes,
    phaseRes,
    costRes,
    timingRes,
    timingMatchRes,
    oppRes,
    feedEligibleRes,
    feedReadyRes,
    buildersRes,
    buildersFeedRes,
    neighbourhoodsRes,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) as c FROM permits WHERE ${ADMIN_ACTIVE_STATUS_PREDICATE}`),
    pool.query(`SELECT COUNT(*) as c FROM permits WHERE ${FEED_ACTIVE_STATUS_PREDICATE}`),
    pool.query(`SELECT COUNT(*) as c FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND ${ADMIN_ACTIVE_STATUS_PREDICATE}`),
    // Legacy: any trade row (preserved for backward compat — deprecated)
    pool.query(`SELECT COUNT(DISTINCT (pt.permit_num, pt.revision_num)) as c FROM permit_trades pt JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num WHERE p.${ADMIN_ACTIVE_STATUS_PREDICATE}`),
    // Feed-accurate: pt.is_active + confidence >= 0.5 per get-lead-feed.ts:231-232
    pool.query(`
      SELECT COUNT(DISTINCT (pt.permit_num, pt.revision_num)) as c
      FROM permit_trades pt
      JOIN permits p USING (permit_num, revision_num)
      WHERE pt.is_active = true
        AND pt.confidence >= 0.5
        AND p.${FEED_ACTIVE_STATUS_PREDICATE}
    `),
    // Permits whose active+high-conf trades have a non-null phase in the
    // 4 feed-recognized phases
    pool.query(`
      SELECT COUNT(DISTINCT (pt.permit_num, pt.revision_num)) as c
      FROM permit_trades pt
      JOIN permits p USING (permit_num, revision_num)
      WHERE pt.is_active = true
        AND pt.confidence >= 0.5
        AND pt.phase IN ${FEED_TIMING_PHASES}
        AND p.${FEED_ACTIVE_STATUS_PREDICATE}
    `),
    pool.query(`SELECT COUNT(*) as c FROM cost_estimates WHERE estimated_cost IS NOT NULL`),
    pool.query(`SELECT COUNT(*) as total, ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0, 1) as freshness_hours FROM timing_calibration`),
    // Active permits whose permit_type has a row in timing_calibration —
    // answers "what do 4 calibrated permit types mean for coverage"
    pool.query(`
      SELECT COUNT(*) as c
      FROM permits p
      WHERE p.${ADMIN_ACTIVE_STATUS_PREDICATE}
        AND EXISTS (
          SELECT 1 FROM timing_calibration tc
          WHERE tc.permit_type = p.permit_type
        )
    `),
    // Opportunity breakdown: status bands that the feed's opportunity_score
    // CASE maps to 20/14/10/0 (get-lead-feed.ts:166-171)
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Permit Issued') as permit_issued,
        COUNT(*) FILTER (WHERE status = 'Inspection') as inspection,
        COUNT(*) FILTER (WHERE status = 'Application') as application,
        COUNT(*) FILTER (WHERE status NOT IN ('Permit Issued','Inspection','Application','Cancelled','Revoked','Closed')) as other_active
      FROM permits
      WHERE ${FEED_ACTIVE_STATUS_PREDICATE}
    `),
    // Full feed eligibility intersection. Mirrors the permit_candidates
    // WHERE clause in get-lead-feed.ts:230-235. No PostGIS required — we
    // approximate the location check via latitude IS NOT NULL because
    // the trigger in migration 067 keeps them in sync.
    pool.query(`
      SELECT COUNT(DISTINCT (p.permit_num, p.revision_num)) as c
      FROM permits p
      JOIN permit_trades pt USING (permit_num, revision_num)
      WHERE pt.is_active = true
        AND pt.confidence >= 0.5
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.${FEED_ACTIVE_STATUS_PREDICATE}
    `),
    // Legacy 3-way intersection (backward compatible feed_ready_pct).
    // Uses ADMIN predicate to match existing test fixtures. New consumers
    // should prefer `permits_feed_eligible` which uses the FEED predicate.
    pool.query(`
      SELECT COUNT(DISTINCT p.permit_num || ':' || p.revision_num) as c
      FROM permits p
      JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
      JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num AND ce.estimated_cost IS NOT NULL
      WHERE p.latitude IS NOT NULL
        AND p.${ADMIN_ACTIVE_STATUS_PREDICATE}
    `),
    pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL) as with_contact, COUNT(*) FILTER (WHERE is_wsib_registered = true) as wsib FROM entities`),
    // Builder feed eligibility intersection — mirrors wsib_per_entity CTE
    // in get-lead-feed.ts:80-89. Count DISTINCT linked_entity_id because
    // the CTE uses DISTINCT ON to collapse multi-row matches.
    pool.query(`
      SELECT COUNT(DISTINCT linked_entity_id) as c
      FROM wsib_registry
      WHERE is_gta = true
        AND last_enriched_at IS NOT NULL
        AND business_size IN ('Small Business','Medium Business')
        AND (website IS NOT NULL OR primary_phone IS NOT NULL)
        AND linked_entity_id IS NOT NULL
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM neighbourhoods) as total,
        (SELECT COUNT(*) FROM permits WHERE neighbourhood_id IS NOT NULL AND ${FEED_ACTIVE_STATUS_PREDICATE}) as active_with_nbhd
    `),
  ]);

  const active = parseInt(activeRes.rows[0].c, 10);
  const feedActive = parseInt(feedActiveRes.rows[0].c, 10);
  const geocoded = parseInt(geocodedRes.rows[0].c, 10);
  const classified = parseInt(classifiedAllRes.rows[0].c, 10);
  const classifiedActive = parseInt(classifiedActiveRes.rows[0].c, 10);
  const withPhase = parseInt(phaseRes.rows[0].c, 10);
  const withCost = parseInt(costRes.rows[0].c, 10);
  const timingTotal = parseInt(timingRes.rows[0].total, 10);
  const timingFreshness = timingRes.rows[0].freshness_hours !== null
    ? parseFloat(timingRes.rows[0].freshness_hours)
    : null;
  const timingMatch = parseInt(timingMatchRes.rows[0].c, 10);
  const feedEligible = parseInt(feedEligibleRes.rows[0].c, 10);
  const feedReady = parseInt(feedReadyRes.rows[0].c, 10);

  const oppRow = oppRes.rows[0];
  const byOpp = {
    permit_issued: parseInt(oppRow.permit_issued, 10),
    inspection: parseInt(oppRow.inspection, 10),
    application: parseInt(oppRow.application, 10),
    other_active: parseInt(oppRow.other_active, 10),
  };

  const nbhdRow = neighbourhoodsRes.rows[0];

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
    // --- New fields ---
    feed_active_permits: feedActive,
    permits_classified_active: classifiedActive,
    permits_with_phase: withPhase,
    permits_with_timing_calibration_match: timingMatch,
    permits_by_opportunity_status: byOpp,
    permits_feed_eligible: feedEligible,
    builders_feed_eligible: parseInt(buildersFeedRes.rows[0].c, 10),
    neighbourhoods_total: parseInt(nbhdRow.total, 10),
    permits_with_neighbourhood: parseInt(nbhdRow.active_with_nbhd, 10),
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
