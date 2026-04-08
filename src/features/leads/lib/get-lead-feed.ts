// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Implementation
//
// Unified lead feed — ranks permit and builder leads in ONE SQL pass via
// UNION ALL + cursor pagination on (relevance_score, lead_type, lead_id).
// This is the entry point Phase 2 wraps in `/api/leads/feed`. THROWS on
// pool/DB error so the route can return a 500 — an earlier version swallowed
// errors and returned empty, which made full DB outages look like an empty
// feed to clients (spec 70 §API Endpoints requires 500 on unexpected error).
//
// Spec 70 calls out an earlier-draft foot-gun: interleaving permit and
// builder leads at the application layer breaks pagination because the
// interleave order shifts between requests. The fix is to UNION both lead
// types into one ranked result set, then apply the cursor uniformly. This
// file implements that fix.
//
// The 4 score pillars are computed in SQL (not JS) for the feed, aligned
// with spec 70 §4 Behavioral Contract per-pillar boundaries:
//   - proximity (0-30) from PostGIS distance bands
//   - timing (0-30) from a fast SQL proxy via permit_trades.phase
//     (the full 3-tier engine in src/features/leads/lib/timing.ts is too
//     slow to call per row in a 15-item feed; that engine drives the
//     per-permit detail page)
//   - value (0-20) from cost_estimates.cost_tier (cached by Phase 1b-i
//     compute-cost-estimates.js). Earlier drafts used a 0-30 range; spec
//     70 §4 line 234 pins Value at 0-20.
//   - opportunity (0-20) from permits.status. Earlier drafts used 0-10;
//     spec 70 §4 line 235 pins Opportunity at 0-20.
// Permit total: 30 + 30 + 20 + 20 = 100. Builder total: see builder CTE
// comment below — builder pillar semantics differ from permit; the feed
// uses a simplified proxy distinct from the full `builder-query.ts` engine.

import type { Pool } from 'pg';
import { MAX_RADIUS_KM, metersFromKilometers } from '@/features/leads/lib/distance';
import type {
  LeadFeedCursor,
  LeadFeedInput,
  LeadFeedItem,
  LeadFeedResult,
} from '@/features/leads/types';
import { logError, logWarn } from '@/lib/logger';

/**
 * Hard cap on the number of leads returned per request. Spec 70 §API
 * Endpoints documents `limit: default 15, max 30`. Without this clamp,
 * a malicious or misconfigured caller could request `limit: 1000000`
 * and force the server to rank/sort the entire feed corpus — DoS vector.
 */
export const MAX_FEED_LIMIT = 30;
export const DEFAULT_FEED_LIMIT = 15;

/**
 * Spec 70 §Implementation — verbatim. Parameters:
 *   $1 = trade_slug (text)
 *   $2 = lng (float8)
 *   $3 = lat (float8)
 *   $4 = radius_m (float8)
 *   $5 = limit (int)
 *   $6 = cursor_score (int or NULL)        — page 1 sends NULL
 *   $7 = cursor_lead_type (text or NULL)
 *   $8 = cursor_lead_id (text or NULL)
 *
 * The `$6::int IS NULL` short-circuit makes the WHERE a no-op on page 1, so
 * we use a single SQL string for both first-page and cursor cases.
 */
export const LEAD_FEED_SQL = `
  WITH permit_candidates AS (
    SELECT
      'permit'::text AS lead_type,
      -- LPAD revision_num to 2 digits so the lead_id is stable across the
      -- DB's historical '0' vs '00' drift (migration 001's loader uses
      -- '00' but earlier ingestions left bare '0' values). Matches the
      -- normalization in buildLeadKey() at record-lead-view.ts.
      (p.permit_num || ':' || LPAD(p.revision_num, 2, '0')) AS lead_id,
      p.permit_num,
      p.revision_num,
      p.status,
      p.permit_type,
      p.description,
      p.street_num,
      p.street_name,
      NULL::int  AS entity_id,
      NULL::text AS legal_name,
      NULL::text AS business_size,
      NULL::text AS primary_phone,
      NULL::text AS primary_email,
      NULL::text AS website,
      NULL::text AS photo_url,
      p.latitude,
      p.longitude,
      (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography)::float8 AS distance_m,
      -- Pillar 1: proximity (0-30)
      CASE
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 500   THEN 30
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 1000  THEN 25
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 2000  THEN 20
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 5000  THEN 15
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 10000 THEN 10
        WHEN (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 20000 THEN 5
        ELSE 0
      END AS proximity_score,
      -- Pillar 2: timing (0-30) — fast SQL proxy via permit_trades.phase
      CASE pt.phase
        WHEN 'structural'         THEN 30
        WHEN 'finishing'          THEN 25
        WHEN 'early_construction' THEN 20
        WHEN 'landscaping'        THEN 15
        ELSE 10
      END AS timing_score,
      -- Pillar 3: value (0-20) — from cost_estimates.cost_tier (cached).
      -- Rescaled from a pre-review 0-30 draft to match spec 70 §4 line 234.
      CASE ce.cost_tier
        WHEN 'mega'   THEN 20
        WHEN 'major'  THEN 16
        WHEN 'large'  THEN 12
        WHEN 'medium' THEN 8
        WHEN 'small'  THEN 5
        ELSE 3
      END AS value_score,
      -- Pillar 4: opportunity (0-20) — permit lifecycle status.
      -- Rescaled from a pre-review 0-10 draft to match spec 70 §4 line 235.
      CASE p.status
        WHEN 'Permit Issued' THEN 20
        WHEN 'Inspection'    THEN 14
        WHEN 'Application'   THEN 10
        ELSE 0
      END AS opportunity_score
    FROM permits p
    JOIN permit_trades pt USING (permit_num, revision_num)
    JOIN trades t ON t.id = pt.trade_id
    LEFT JOIN cost_estimates ce USING (permit_num, revision_num)
    WHERE t.slug = $1
      AND pt.is_active = true
      AND pt.confidence >= 0.5
      AND p.location IS NOT NULL
      AND ST_DWithin(p.location::geography, ST_MakePoint($2::float8, $3::float8)::geography, $4::float8)
      AND p.status NOT IN ('Cancelled', 'Revoked', 'Closed')
  ),
  builder_candidates AS (
    SELECT
      'builder'::text AS lead_type,
      e.id::text AS lead_id,
      NULL::text    AS permit_num,
      NULL::text    AS revision_num,
      NULL::text    AS status,
      NULL::text    AS permit_type,
      NULL::text    AS description,
      NULL::text    AS street_num,
      NULL::text    AS street_name,
      e.id          AS entity_id,
      e.legal_name,
      w.business_size,
      e.primary_phone,
      e.primary_email,
      e.website,
      e.photo_url,
      NULL::numeric AS latitude,
      NULL::numeric AS longitude,
      MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography)::float8 AS distance_m,
      -- Pillar 1: proximity (0-30) — closest active permit
      CASE
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 500   THEN 30
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 1000  THEN 25
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 2000  THEN 20
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 5000  THEN 15
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 10000 THEN 10
        WHEN MIN(p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) < 20000 THEN 5
        ELSE 0
      END AS proximity_score,
      -- Pillar 2: timing (0-30) — builders are "ongoing capacity", fixed mid-band
      15 AS timing_score,
      -- Pillar 3: value (0-20) — average project cost bucketed. Rescaled
      -- from 0-30 to match the permit pillar boundaries (spec 70 §4).
      -- NULL (no cost data on any nearby permit) is "unknown", NOT "small";
      -- score it lower than the smallest known bucket so unknowns sort last
      -- among value-tied builders.
      CASE
        WHEN AVG(p.est_const_cost::float8) FILTER (WHERE p.est_const_cost > 0) IS NULL    THEN 3
        WHEN AVG(p.est_const_cost::float8) FILTER (WHERE p.est_const_cost > 0) >= 2000000 THEN 20
        WHEN AVG(p.est_const_cost::float8) FILTER (WHERE p.est_const_cost > 0) >= 500000  THEN 14
        WHEN AVG(p.est_const_cost::float8) FILTER (WHERE p.est_const_cost > 0) >= 100000  THEN 10
        ELSE 6
      END AS value_score,
      -- Pillar 4: opportunity (0-20) — count of active permits. Rescaled
      -- from 0-10 to match the permit pillar boundaries (spec 70 §4).
      CASE
        WHEN COUNT(p.permit_num) >= 5 THEN 20
        WHEN COUNT(p.permit_num) >= 3 THEN 14
        WHEN COUNT(p.permit_num) >= 1 THEN 10
        ELSE 0
      END AS opportunity_score
    FROM entities e
    JOIN entity_projects ep ON ep.entity_id = e.id AND ep.role = 'Builder'
    JOIN permits p
      ON p.permit_num = ep.permit_num
     AND p.revision_num = ep.revision_num
    JOIN permit_trades pt
      ON pt.permit_num = p.permit_num
     AND pt.revision_num = p.revision_num
     AND pt.is_active = true
     AND pt.confidence >= 0.5
    JOIN trades t ON t.id = pt.trade_id AND t.slug = $1
    LEFT JOIN LATERAL (
      SELECT business_size
      FROM wsib_registry w2
      WHERE w2.linked_entity_id = e.id
        AND w2.is_gta = true
        AND w2.last_enriched_at IS NOT NULL
        AND w2.business_size IN ('Small Business', 'Medium Business')
        AND (w2.website IS NOT NULL OR w2.primary_phone IS NOT NULL)
      ORDER BY w2.last_enriched_at DESC
      LIMIT 1
    ) w ON true
    WHERE p.location IS NOT NULL
      AND p.status IN ('Permit Issued', 'Inspection')
      AND ST_DWithin(p.location::geography, ST_MakePoint($2::float8, $3::float8)::geography, $4::float8)
      AND w.business_size IS NOT NULL
    GROUP BY
      e.id, e.legal_name, w.business_size,
      e.primary_phone, e.primary_email, e.website, e.photo_url
  ),
  unified AS (
    SELECT * FROM permit_candidates
    UNION ALL
    SELECT * FROM builder_candidates
  ),
  ranked AS (
    SELECT *,
      (proximity_score + timing_score + value_score + opportunity_score) AS relevance_score
    FROM unified
  )
  SELECT * FROM ranked
  WHERE
    -- Cursor pagination via row tuple comparison. NULL cursor on page 1
    -- short-circuits this WHERE clause.
    ($6::int IS NULL OR
     (relevance_score, lead_type, lead_id) <
     ($6::int, $7::text, $8::text))
  ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC
  LIMIT $5::int
`;

interface LeadFeedRow {
  lead_type: 'permit' | 'builder';
  lead_id: string;
  permit_num: string | null;
  revision_num: string | null;
  status: string | null;
  permit_type: string | null;
  description: string | null;
  street_num: string | null;
  street_name: string | null;
  entity_id: number | null;
  legal_name: string | null;
  business_size: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  photo_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  distance_m: number | string;
  proximity_score: number;
  timing_score: number;
  value_score: number;
  opportunity_score: number;
  relevance_score: number;
}

function toNumberOrNull(v: number | string | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumber(v: number | string): number {
  if (typeof v === 'number') return v;
  return Number(v);
}

function mapRow(row: LeadFeedRow): LeadFeedItem | null {
  const base = {
    lead_id: row.lead_id,
    distance_m: toNumber(row.distance_m),
    proximity_score: row.proximity_score,
    timing_score: row.timing_score,
    value_score: row.value_score,
    opportunity_score: row.opportunity_score,
    relevance_score: row.relevance_score,
  };

  if (row.lead_type === 'permit') {
    // The SQL UNION ALL guarantees these are non-null on permit rows. We
    // narrow defensively because TypeScript can't see through the SQL CASE.
    // If the invariant is ever violated (SQL refactor that changes the
    // UNION shape), logWarn so the silent drop becomes visible in logs
    // instead of a phantom "items disappeared from feed" bug.
    if (row.permit_num === null || row.revision_num === null) {
      logWarn('[lead-feed/get]', 'mapRow dropped malformed permit row', {
        lead_id: row.lead_id,
        lead_type: row.lead_type,
      });
      return null;
    }
    return {
      ...base,
      lead_type: 'permit',
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      status: row.status,
      permit_type: row.permit_type,
      description: row.description,
      street_num: row.street_num,
      street_name: row.street_name,
      latitude: toNumberOrNull(row.latitude),
      longitude: toNumberOrNull(row.longitude),
    };
  }

  // Builder branch — same defensive narrowing on the entity-required fields
  if (row.entity_id === null || row.legal_name === null) {
    logWarn('[lead-feed/get]', 'mapRow dropped malformed builder row', {
      lead_id: row.lead_id,
      lead_type: row.lead_type,
    });
    return null;
  }
  return {
    ...base,
    lead_type: 'builder',
    entity_id: row.entity_id,
    legal_name: row.legal_name,
    business_size: row.business_size,
    primary_phone: row.primary_phone,
    primary_email: row.primary_email,
    website: row.website,
    photo_url: row.photo_url,
  };
}

/**
 * Run the unified spec 70 lead feed query against the pool. Throws on pool
 * or query error — the caller (Phase 2 route) MUST wrap this in its own
 * try/catch and surface a 500 envelope via `internalError()`. Earlier
 * versions swallowed errors and returned empty; that made DB outages
 * invisible as empty 200s.
 */
export async function getLeadFeed(
  input: LeadFeedInput,
  pool: Pool,
): Promise<LeadFeedResult> {
  // Clamp BOTH radius_km and limit BEFORE the empty-result fallback so the
  // meta block reflects the clamped values even on error. The limit clamp
  // is per spec 70 §API Endpoints (max 30) and prevents DoS via massive
  // result-set requests.
  const clampedKm = Math.min(input.radius_km, MAX_RADIUS_KM);
  const clampedLimit = Math.min(Math.max(1, input.limit), MAX_FEED_LIMIT);
  const radius_m = metersFromKilometers(clampedKm);

  try {
    const params: unknown[] = [
      input.trade_slug,
      input.lng,
      input.lat,
      radius_m,
      clampedLimit,
      input.cursor?.score ?? null,
      input.cursor?.lead_type ?? null,
      input.cursor?.lead_id ?? null,
    ];

    const res = await pool.query<LeadFeedRow>(LEAD_FEED_SQL, params);
    // Filter out any defensively-null mapping (rows where the SQL UNION
    // produced an unexpected shape — should never happen given the CASE
    // structure but the DU forces explicit narrowing).
    const data = res.rows
      .map(mapRow)
      .filter((item): item is LeadFeedItem => item !== null);

    let next_cursor: LeadFeedCursor | null = null;
    if (data.length === clampedLimit && data.length > 0) {
      const last = data[data.length - 1];
      if (last) {
        next_cursor = {
          score: last.relevance_score,
          lead_type: last.lead_type,
          lead_id: last.lead_id,
        };
      }
    }

    // Single success log at the route layer via logRequestComplete —
    // duplicating here would double-emit user_id/lat/lng (PII) per request.
    return {
      data,
      meta: {
        next_cursor,
        count: data.length,
        radius_km: clampedKm,
      },
    };
  } catch (err) {
    logError('[lead-feed/get]', err, {
      user_id: input.user_id,
      trade_slug: input.trade_slug,
      lat: input.lat,
      lng: input.lng,
      radius_km: clampedKm,
    });
    throw err;
  }
}
