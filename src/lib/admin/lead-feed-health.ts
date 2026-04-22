// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.1
//
// Query functions for the Lead Feed Health admin endpoint.
// Read-only aggregates against existing tables — no mutations.

import type { Pool } from 'pg';
import { parsePositiveIntEnv } from '@/lib/db/client';

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
  // phase_calibration (v2). Answers "what does N permit types calibrated mean?"
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
  /** Zero-Total Bypass rows (spec 83 §3): active_trade_slugs was empty → no estimate possible */
  from_none: number;
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
   * Computed by `getCachedLeadFeedHealth` from values already fetched via
   * `getLeadFeedReadiness` (zero extra DB load). Returns 0 when
   * `active_permits === 0` to avoid division by zero.
   *
   * **CAN EXCEED 100%** — `permits_with_cost` counts cost_estimates rows
   * without a permit-status filter, while `active_permits` uses the
   * ADMIN_ACTIVE inclusion list. If cost_estimates lags permit cancellations
   * the numerator includes now-terminal permits and the ratio rises above
   * 100. This is deliberate honest signaling that the cost cache has
   * drifted from the permit state — NOT a bug to cap. See
   * `review_followups.md` for the deferred query-hardening follow-up.
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
// PostGIS pre-flight — WF3 2026-04-11
// ---------------------------------------------------------------------------
// Dev-env pre-flight for the /api/admin/leads/test-feed route.
// `LEAD_FEED_SQL` (in features/leads/lib/get-lead-feed.ts) uses PostGIS
// `geography` casts for radius filtering. Production Cloud SQL has PostGIS;
// local dev may not. Without detection, the route fails with an opaque
// `"Feed query failed"` 500 at position 3306 of the SQL (pg code 42704:
// type "geography" does not exist).
//
// This helper queries `pg_extension` and caches SUCCESSFUL results for the
// process lifetime. In production with PostGIS present, the first call
// returns `true` and every subsequent call is a cache hit — zero DB load
// beyond the first request. In dev without PostGIS, the first call caches
// `false` and subsequent calls short-circuit.
//
// Cache semantics:
// - Only SUCCESSFUL query results are cached. Query FAILURES (e.g., a
//   transient pool error on first request) return `false` for that
//   specific call but leave the cache unpopulated, so the next request
//   retries. This prevents the "transient blip wedges the cache for the
//   entire process lifetime" trap that the initial WF3 pass had.
//   (Adversarial + independent review, 2026-04-11.)
// - Process-lifetime for successful results — a dev who installs PostGIS
//   mid-session needs a server restart. Acceptable for a dev tool because
//   `true` is sticky in production too (Cloud SQL's PostGIS isn't going
//   anywhere).
// - `__resetPostgisCacheForTests` clears state for isolated test cases.
// - NO single-flight guard. The check is one-shot, ~1-2ms. Multiple
//   concurrent first-time callers would each issue one query; all results
//   are identical in practice (PostGIS either is or isn't installed).

let postgisChecked: boolean | null = null;

/**
 * Check whether the PostGIS extension is installed in the current database.
 * Cached process-wide on first SUCCESSFUL check. Intended for dev-env pre-
 * flights in routes that require PostGIS (e.g. the test-feed endpoint).
 *
 * Query failures (e.g., transient pool error) return `false` for the
 * current call but are NOT cached — the next call retries. This prevents
 * a first-request hiccup from wedging the endpoint for the whole process
 * lifetime.
 */
export async function isPostgisAvailable(pool: Pool): Promise<boolean> {
  if (postgisChecked !== null) return postgisChecked;
  try {
    const res = await pool.query<{ installed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed`,
    );
    // Only cache on successful query — see cache semantics comment above.
    postgisChecked = res.rows[0]?.installed ?? false;
    return postgisChecked;
  } catch {
    // Don't cache. Return `false` for THIS call so the caller returns a
    // dev-env 503, but leave `postgisChecked === null` so the next call
    // will re-attempt. A persistent pool failure will keep re-querying,
    // but the main query (getLeadFeed) would also be failing on every
    // click, so the marginal cost is trivial.
    return false;
  }
}

/** Test-only reset for module-level PostGIS cache. Never call from prod. */
export function __resetPostgisCacheForTests(): void {
  postgisChecked = null;
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
    // Cost estimates total + phase calibration (v2) total/freshness in one round-trip
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM cost_estimates WHERE estimated_cost IS NOT NULL) as cost_count,
        (SELECT COUNT(DISTINCT permit_type) FROM phase_calibration WHERE from_phase = 'ISSUED' AND permit_type != '__ALL__') as timing_total,
        (SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0, 1) FROM phase_calibration) as timing_freshness_hours
    `),
    // Active permits whose permit_type has a row in phase_calibration (v2).
    pool.query(`
      SELECT COUNT(*) as c
      FROM permits p
      WHERE p.${ADMIN_ACTIVE_STATUS_PREDICATE}
        AND EXISTS (
          SELECT 1 FROM phase_calibration pc
          WHERE pc.permit_type = p.permit_type
            AND pc.from_phase = 'ISSUED'
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
           COUNT(*) FILTER (WHERE cost_source = 'none') as from_none,
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
    from_none: parseInt(r.from_none, 10),
    null_cost: nullCost,
    coverage_pct: total > 0 ? Math.round(((total - nullCost) / total) * 1000) / 10 : 0,
    // Placeholder — `getCachedLeadFeedHealth` (the Phase 2 cache wrapper)
    // overrides this with the real permit-scoped coverage computed from
    // LeadFeedReadiness values already fetched. Kept out of this query to
    // avoid a second pg round-trip. Direct callers of `getCostCoverage`
    // (not going through `getCachedLeadFeedHealth`) will see the placeholder
    // 0 — see review_followups.md for a deferred type-safety hardening note.
    coverage_pct_vs_active_permits: 0,
  };
}

export async function getEngagement(pool: Pool): Promise<Engagement> {
  // WF3 2026-04-10 Phase 3: saves counts use `saved_at` (migration 082)
  // while views counts + unique_users stay on `viewed_at`. The competition
  // sub-query also keeps `viewed_at` because it answers "leads a user
  // might view next" — scoped by view recency is intentional.
  //
  // The daily-aggregation query loses its outer `WHERE viewed_at >=
  // CURRENT_DATE - INTERVAL '7 days'` clause because each metric filter
  // is now independently scoped (views by viewed_at, saves by saved_at,
  // unique_users by viewed_at). A lead saved today but viewed 30 days
  // ago would have been excluded by the outer WHERE.
  const [dailyRes, tradesRes, competitionRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE) as views_today,
        COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days') as views_7d,
        COUNT(*) FILTER (WHERE saved = true AND saved_at >= CURRENT_DATE) as saves_today,
        COUNT(*) FILTER (WHERE saved = true AND saved_at >= CURRENT_DATE - INTERVAL '7 days') as saves_7d,
        COUNT(DISTINCT user_id) FILTER (WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days') as unique_users
      FROM lead_views
    `),
    pool.query(`
      -- Trade breakdown: a trade appears if it has EITHER recent views OR
      -- recent saves. Scoping by viewed_at alone would drop saves on old-
      -- viewed leads (the same class of bug fixed in the daily aggregation
      -- above). Each FILTER then scopes its own metric independently so
      -- top_trades.saves matches saves_7d semantically. Adversarial review
      -- flagged this inconsistency in the first Phase 3 pass.
      SELECT trade_slug,
             COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days') as views,
             COUNT(*) FILTER (WHERE saved = true AND saved_at >= CURRENT_DATE - INTERVAL '7 days') as saves
      FROM lead_views
      WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days'
         OR (saved = true AND saved_at >= CURRENT_DATE - INTERVAL '7 days')
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

// ---------------------------------------------------------------------------
// Cached health fetcher — WF3 2026-04-10 Phase 2
// ---------------------------------------------------------------------------
// Server-side in-memory cache + single-flight guard for the lead feed health
// endpoint. Protects the pg connection pool from concurrent admin tab polling.
//
// Problem: a single health fetch fans out ~12 parallel queries (8 readiness +
// 1 cost + 3 engagement) against a pool of 20. With 2 admin tabs polling
// every 10s, peak concurrent query count is 24 — over the pool budget. Under
// sustained multi-tab activity + any unrelated admin query load, overflow
// queries hit `connectionTimeoutMillis` and the endpoint returns 500.
//
// Solution: 30s in-memory cache. The dashboard polls every 10s but only the
// first request per cache window actually hits the DB; cached hits cost
// nothing. N concurrent tabs consume only 1 fetch's worth of pool capacity
// per 30s window — a ~9x reduction in pool pressure for a 3-tab scenario.
//
// Single-flight: if a request arrives while another is mid-fetch, it awaits
// the same promise instead of kicking off a parallel fetch. Prevents
// thundering herd at cache expiry.
//
// Rejection semantics: failed fetches do NOT populate the cache. Subsequent
// requests re-attempt immediately. `inFlight` is cleared on both success AND
// rejection via try/finally so a wedged fetch cannot permanently block future
// requests.
//
// NOTE for dev: Next.js dev HMR wipes module state on hot reload, so cache
// behavior is unreliable during local development. Production builds (and
// the test harness below) retain module state across requests.

const DEFAULT_HEALTH_CACHE_TTL_MS = 30_000;
const HEALTH_CACHE_TTL_MS = parsePositiveIntEnv(
  process.env.HEALTH_CACHE_TTL_MS,
  DEFAULT_HEALTH_CACHE_TTL_MS,
);

interface HealthCacheEntry {
  data: LeadFeedHealthResponse;
  expiresAt: number;
}

let cacheEntry: HealthCacheEntry | null = null;
let inFlight: Promise<LeadFeedHealthResponse> | null = null;

/**
 * Fetch the aggregated lead feed health response, using a short-TTL
 * in-memory cache with single-flight protection. The route handler for
 * `/api/admin/leads/health` MUST go through this function — calling the
 * underlying `getLeadFeedReadiness` / `getCostCoverage` / `getEngagement`
 * helpers directly from a handler bypasses the cache and re-introduces the
 * pool exhaustion class of bug.
 *
 * **Cache semantics (read before adding a new caller):**
 * - **Pool identity is ignored.** The cache is a module-level singleton
 *   keyed by nothing. If two callers pass different `Pool` instances within
 *   the TTL window, both see the same cached data from whichever call
 *   populated the cache first. Production has a single shared pool so this
 *   is a non-issue; a future multi-pool setup would need a cache key.
 * - **Response is returned by reference.** The cached `LeadFeedHealthResponse`
 *   is returned as-is from the stored reference on cache hits. DO NOT
 *   mutate the returned object — subsequent cache hits within the TTL
 *   window will see the mutation. There is no defensive clone; the
 *   assumption is that callers serialize via `NextResponse.json()` without
 *   mutation.
 * - **`HEALTH_CACHE_TTL_MS=0` silently falls back to default.** The env
 *   parser rejects 0 as "not a positive int", so setting the env var to 0
 *   cannot disable caching. Use the `ttlMs` parameter in tests to force
 *   cache misses.
 * - **Single-flight on failure cleared via try/finally.** A rejected fetch
 *   does NOT populate the cache; the next caller re-attempts fresh.
 *   `inFlight` is cleared in `finally` so a wedged fetch cannot
 *   permanently block future requests.
 *
 * @param pool  pg pool (typically `src/lib/db/client.ts` shared instance)
 * @param ttlMs override TTL in ms (default: `HEALTH_CACHE_TTL_MS` from env,
 *              falling back to 30000)
 */
export async function getCachedLeadFeedHealth(
  pool: Pool,
  ttlMs: number = HEALTH_CACHE_TTL_MS,
): Promise<LeadFeedHealthResponse> {
  const now = Date.now();

  // Cache hit: return immediately. Note: we use strict `>` so an entry
  // expiring at exactly `now` is considered stale — matches the expected
  // mental model that "TTL = lifetime" rather than "TTL = lifetime + 1ms".
  if (cacheEntry !== null && cacheEntry.expiresAt > now) {
    return cacheEntry.data;
  }

  // Single-flight: if another call already kicked off a fetch, await it
  // instead of starting a parallel one. This deduplicates the thundering
  // herd at cache expiry when N tabs all poll simultaneously.
  if (inFlight !== null) {
    return inFlight;
  }

  // Kick off a fresh fetch. `inFlight` is set BEFORE the async IIFE runs so
  // any synchronously-subsequent call sees the in-flight promise (not a
  // race window where the check above passes and a second fetch starts).
  inFlight = (async () => {
    try {
      const [readiness, costCoverage, engagement] = await Promise.all([
        getLeadFeedReadiness(pool),
        getCostCoverage(pool),
        getEngagement(pool),
      ]);

      // WF3 Phase 1: derive the permit-scoped coverage metric from values
      // already fetched by getLeadFeedReadiness. See route handler comment
      // for the predicate-mismatch note (can exceed 100% by design).
      const coveragePctVsActivePermits = readiness.active_permits > 0
        ? Math.round((readiness.permits_with_cost / readiness.active_permits) * 1000) / 10
        : 0;

      const response: LeadFeedHealthResponse = {
        readiness,
        cost_coverage: {
          ...costCoverage,
          coverage_pct_vs_active_permits: coveragePctVsActivePermits,
        },
        engagement,
        performance: {
          avg_latency_ms: null,
          p95_latency_ms: null,
          error_rate_pct: null,
          avg_results_per_query: null,
        },
      };

      // Only populate the cache AFTER the full response is built — if any
      // step above throws, `cacheEntry` is left untouched and the next
      // caller re-attempts fresh.
      cacheEntry = { data: response, expiresAt: Date.now() + ttlMs };
      return response;
    } finally {
      // Clear `inFlight` on BOTH success and rejection so a wedged fetch
      // can never permanently block future requests. Rejection propagates
      // through the promise to every awaiter; the next caller after that
      // starts fresh (or hits the cache if a prior success populated it).
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Test-only reset for module-level cache state. NEVER call from production
 * code — there is no legitimate reason to reset the cache outside of tests.
 * `beforeEach` / `afterEach` in logic tests should call this to guarantee
 * clean state between cases.
 */
export function __resetLeadFeedHealthCacheForTests(): void {
  cacheEntry = null;
  inFlight = null;
}
