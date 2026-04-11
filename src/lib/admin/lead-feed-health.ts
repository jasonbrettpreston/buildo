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
  /**
   * Coverage WITHIN the cost_estimates cache: (total - null_cost) / total.
   * Tells you how clean the estimate table is. Does NOT tell you how much of
   * the permit universe is covered — use {@link coverage_pct_vs_active_permits}
   * for that.
   */
  coverage_pct: number;
  /**
   * Coverage of active permits: `permits_with_cost / active_permits`. This is
   * the headline metric for "how much of the real dataset is costed".
   * Computed in the route handler from values already fetched by
   * `getLeadFeedReadiness` (zero extra DB load). Returns 0 when
   * `active_permits === 0` to avoid division by zero.
   *
   * Added by WF3 2026-04-10 Phase 1 — resolves external review's
   * "Denominational Isolation" concern (Claim 9).
   */
  coverage_pct_vs_active_permits: number;
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
// Error sanitization
// ---------------------------------------------------------------------------

/**
 * Strip database credentials from an error message before it leaves the
 * server. node-postgres can embed the full DATABASE_URL (including the
 * password component) in error messages when connection string parsing
 * fails — see brianc/node-postgres#3145. Returning `error.message` raw in
 * non-production would expose those credentials in the JSON response body.
 *
 * This masks any `postgres(ql)://user:pass@host` pattern with
 * `postgres://***@`. Kept here (not in `src/lib/logger.ts`) because
 * Next.js API route files cannot export non-handler functions and this
 * is the nearest shared module already loaded by the health endpoint.
 */
export function sanitizePgErrorMessage(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\s@]*@/gi, 'postgres://***@');
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
  // WF3 2026-04-10 regression fix: consolidated from 14 queries to 7 to
  // reduce pool pressure. The previous 14-parallel batch hit "timeout
  // exceeded when trying to connect" on a default-10 pool because two
  // queries (3-way JOIN intersection, timing-calibration EXISTS) took
  // 2.6s and 4.2s respectively. Reducing query count + raising pool max
  // to 20 (in db/client.ts) prevents connection starvation.
  //
  // Consolidation rules: COUNT/COUNT FILTER over the same table in the
  // same WHERE can run in a single query. Joins stay separate.
  const [
    permitsStatusRes,        // active, feed_active, geocoded, opportunity breakdown, with_neighbourhood
    tradesRes,               // classified_all, classified_active, with_phase
    feedEligibleRes,         // feed-path intersection (lat/lng + active trade + high-conf)
    feedReadyRes,            // legacy 3-way intersection (cost + trade + geocoded)
    costTimingRes,           // cost_estimates + timing_calibration stats
    timingMatchRes,          // active permits with calibrated permit_type
    buildersRes,             // entities + WSIB intersection
    neighbourhoodsRes,       // neighbourhoods total
  ] = await Promise.all([
    // Single query over permits — all status-based counts via COUNT FILTER
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ${ADMIN_ACTIVE_STATUS_PREDICATE}) as admin_active,
        COUNT(*) FILTER (WHERE ${FEED_ACTIVE_STATUS_PREDICATE}) as feed_active,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND ${ADMIN_ACTIVE_STATUS_PREDICATE}) as geocoded,
        COUNT(*) FILTER (WHERE status = 'Permit Issued') as opp_permit_issued,
        COUNT(*) FILTER (WHERE status = 'Inspection') as opp_inspection,
        COUNT(*) FILTER (WHERE status = 'Application') as opp_application,
        COUNT(*) FILTER (WHERE status NOT IN ('Permit Issued','Inspection','Application','Cancelled','Revoked','Closed')) as opp_other_active,
        COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND ${FEED_ACTIVE_STATUS_PREDICATE}) as with_neighbourhood
      FROM permits
    `),
    // Single query over permit_trades with JOIN to permits — 3 counts via COUNT FILTER
    pool.query(`
      SELECT
        COUNT(DISTINCT (pt.permit_num, pt.revision_num)) FILTER (WHERE p.${ADMIN_ACTIVE_STATUS_PREDICATE}) as classified_all,
        COUNT(DISTINCT (pt.permit_num, pt.revision_num)) FILTER (WHERE pt.is_active = true AND pt.confidence >= 0.5 AND p.${FEED_ACTIVE_STATUS_PREDICATE}) as classified_active,
        COUNT(DISTINCT (pt.permit_num, pt.revision_num)) FILTER (WHERE pt.is_active = true AND pt.confidence >= 0.5 AND pt.phase IN ${FEED_TIMING_PHASES} AND p.${FEED_ACTIVE_STATUS_PREDICATE}) as with_phase
      FROM permit_trades pt
      JOIN permits p USING (permit_num, revision_num)
      WHERE p.${FEED_ACTIVE_STATUS_PREDICATE} OR p.${ADMIN_ACTIVE_STATUS_PREDICATE}
    `),
    // Full feed eligibility intersection. Mirrors get-lead-feed.ts:230-235.
    // Uses latitude IS NOT NULL as proxy for p.location (migration 067
    // trigger keeps them in sync; on PostGIS-absent envs, location may be
    // NULL while lat/lng are populated — see review_followups.md).
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
    // Legacy 3-way intersection for backward-compatible feed_ready_pct
    pool.query(`
      SELECT COUNT(DISTINCT p.permit_num || ':' || p.revision_num) as c
      FROM permits p
      JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
      JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num AND ce.estimated_cost IS NOT NULL
      WHERE p.latitude IS NOT NULL
        AND p.${ADMIN_ACTIVE_STATUS_PREDICATE}
    `),
    // Cost estimates total + timing calibration total/freshness in one round-trip
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM cost_estimates WHERE estimated_cost IS NOT NULL) as cost_count,
        (SELECT COUNT(*) FROM timing_calibration) as timing_total,
        (SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0, 1) FROM timing_calibration) as timing_freshness_hours
    `),
    // Active permits whose permit_type has a row in timing_calibration.
    // Kept separate because the EXISTS + permit_type scan is the slowest
    // query in the batch (~2.6s) and putting it in the consolidated
    // permits query would serialize the other counts behind it.
    pool.query(`
      SELECT COUNT(*) as c
      FROM permits p
      WHERE p.${ADMIN_ACTIVE_STATUS_PREDICATE}
        AND EXISTS (
          SELECT 1 FROM timing_calibration tc
          WHERE tc.permit_type = p.permit_type
        )
    `),
    // Entities stats + WSIB feed-eligible builder intersection in one query
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM entities) as total,
        (SELECT COUNT(*) FROM entities WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL) as with_contact,
        (SELECT COUNT(*) FROM entities WHERE is_wsib_registered = true) as wsib,
        (SELECT COUNT(DISTINCT linked_entity_id) FROM wsib_registry WHERE is_gta = true AND last_enriched_at IS NOT NULL AND business_size IN ('Small Business','Medium Business') AND (website IS NOT NULL OR primary_phone IS NOT NULL) AND linked_entity_id IS NOT NULL) as feed_eligible
    `),
    pool.query(`SELECT COUNT(*) as c FROM neighbourhoods`),
  ]);

  const p = permitsStatusRes.rows[0];
  const t = tradesRes.rows[0];
  const ct = costTimingRes.rows[0];
  const b = buildersRes.rows[0];

  const active = parseInt(p.admin_active, 10);
  const feedActive = parseInt(p.feed_active, 10);
  const geocoded = parseInt(p.geocoded, 10);
  const classified = parseInt(t.classified_all, 10);
  const classifiedActive = parseInt(t.classified_active, 10);
  const withPhase = parseInt(t.with_phase, 10);
  const withCost = parseInt(ct.cost_count, 10);
  const timingTotal = parseInt(ct.timing_total, 10);
  const timingFreshness = ct.timing_freshness_hours !== null
    ? parseFloat(ct.timing_freshness_hours)
    : null;
  const timingMatch = parseInt(timingMatchRes.rows[0].c, 10);
  const feedEligible = parseInt(feedEligibleRes.rows[0].c, 10);
  const feedReady = parseInt(feedReadyRes.rows[0].c, 10);

  const byOpp = {
    permit_issued: parseInt(p.opp_permit_issued, 10),
    inspection: parseInt(p.opp_inspection, 10),
    application: parseInt(p.opp_application, 10),
    other_active: parseInt(p.opp_other_active, 10),
  };

  return {
    active_permits: active,
    permits_geocoded: geocoded,
    permits_classified: classified,
    permits_with_cost: withCost,
    timing_types_calibrated: timingTotal,
    timing_freshness_hours: timingFreshness,
    feed_ready_pct: active > 0 ? Math.round((feedReady / active) * 1000) / 10 : 0,
    builders_total: parseInt(b.total, 10),
    builders_with_contact: parseInt(b.with_contact, 10),
    builders_wsib_verified: parseInt(b.wsib, 10),
    // --- New fields ---
    feed_active_permits: feedActive,
    permits_classified_active: classifiedActive,
    permits_with_phase: withPhase,
    permits_with_timing_calibration_match: timingMatch,
    permits_by_opportunity_status: byOpp,
    permits_feed_eligible: feedEligible,
    builders_feed_eligible: parseInt(b.feed_eligible, 10),
    neighbourhoods_total: parseInt(neighbourhoodsRes.rows[0].c, 10),
    permits_with_neighbourhood: parseInt(p.with_neighbourhood, 10),
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
    // Injected by the route handler (see /api/admin/leads/health/route.ts)
    // after readiness + cost_coverage are both fetched. Initialized to 0 here;
    // the route overrides it with the real permit-scoped coverage. Kept out of
    // this query to avoid a second pg round-trip — values already exist in
    // LeadFeedReadiness.
    coverage_pct_vs_active_permits: 0,
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
