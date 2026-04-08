// 🔗 SPEC LINK: docs/specs/product/future/73_builder_leads.md §Implementation
//
// Standalone builder-leads query — spec 73's full 4-pillar SQL with the
// 3-CTE structure (nearby_permits → builder_aggregates → scored). Used by
// Phase 2 for any builder-only listing endpoint AND by spec 73's behavior
// tests. The unified lead feed (`get-lead-feed.ts`) inlines a similar but
// not identical builder_candidates CTE because it groups by entity in the
// same SQL pass as permits — the SQL↔SQL "duplication" is structural cost
// of having both a standalone endpoint AND a unified feed per spec 70/73.
//
// Never throws — returns empty array on error so Phase 2 routes can rely on
// this without their own try/catch.

import type { Pool } from 'pg';
import { metersFromKilometers } from '@/features/leads/lib/distance';
import type { BuilderLeadCandidate } from '@/features/leads/types';
import { logError, logInfo } from '@/lib/logger';

export const BUILDER_QUERY_LIMIT = 20;

/**
 * Spec 73 §Implementation — verbatim. Parameters:
 *   $1 = trade_slug (text)
 *   $2 = lng (float8) — note: PostGIS ST_MakePoint takes longitude FIRST
 *   $3 = lat (float8)
 *   $4 = radius_m (float8)
 */
export const BUILDER_QUERY_SQL = `
  WITH nearby_permits AS (
    SELECT
      ep.entity_id,
      p.permit_num, p.revision_num, p.status, p.est_const_cost,
      -- Explicit ::geography cast on p.location forces meter-based KNN
      -- distance regardless of PostGIS function-resolution behavior. The
      -- column is stored as geometry(Point, 4326) (migration 067) for
      -- GIST index compatibility, but distance math must be meters.
      (p.location::geography <-> ST_MakePoint($2::float8, $3::float8)::geography) AS distance_m
    FROM permits p
    JOIN entity_projects ep
      ON ep.permit_num = p.permit_num
     AND ep.revision_num = p.revision_num
     AND ep.role = 'Builder'
    JOIN permit_trades pt
      ON pt.permit_num = p.permit_num
     AND pt.revision_num = p.revision_num
     AND pt.is_active = true
     AND pt.confidence >= 0.5
    JOIN trades t ON t.id = pt.trade_id AND t.slug = $1
    WHERE p.status IN ('Permit Issued', 'Inspection')
      AND p.location IS NOT NULL
      AND ST_DWithin(p.location::geography, ST_MakePoint($2::float8, $3::float8)::geography, $4::float8)
  ),
  builder_aggregates AS (
    SELECT
      e.id AS entity_id,
      e.legal_name,
      e.trade_name,
      e.primary_phone,
      e.primary_email,
      e.website,
      e.photo_url,
      e.is_wsib_registered,
      -- Multi-WSIB tie-breaker: most recent enrichment wins
      (SELECT business_size FROM wsib_registry w
         WHERE w.linked_entity_id = e.id
           AND w.is_gta = true
           AND w.last_enriched_at IS NOT NULL
           AND w.business_size IN ('Small Business', 'Medium Business')
           AND (w.website IS NOT NULL OR w.primary_phone IS NOT NULL)
         ORDER BY w.last_enriched_at DESC LIMIT 1) AS business_size,
      COUNT(np.permit_num)::int AS active_permits_nearby,
      MIN(np.distance_m)::float8 AS closest_permit_m,
      AVG(np.est_const_cost::float8) FILTER (WHERE np.est_const_cost > 0) AS avg_project_cost
    FROM nearby_permits np
    JOIN entities e ON e.id = np.entity_id
    WHERE EXISTS (
      SELECT 1 FROM wsib_registry w
      WHERE w.linked_entity_id = e.id
        AND w.is_gta = true
        AND w.last_enriched_at IS NOT NULL
        AND w.business_size IN ('Small Business', 'Medium Business')
        AND (w.website IS NOT NULL OR w.primary_phone IS NOT NULL)
    )
    GROUP BY
      e.id, e.legal_name, e.trade_name,
      e.primary_phone, e.primary_email, e.website, e.photo_url,
      e.is_wsib_registered
    HAVING COUNT(np.permit_num) >= 1
  ),
  scored AS (
    SELECT *,
      -- Pillar 1: proximity (0-30) — closest active permit
      CASE
        WHEN closest_permit_m < 500   THEN 30
        WHEN closest_permit_m < 1000  THEN 25
        WHEN closest_permit_m < 2000  THEN 20
        WHEN closest_permit_m < 5000  THEN 15
        WHEN closest_permit_m < 10000 THEN 10
        WHEN closest_permit_m < 20000 THEN 5
        ELSE 0
      END AS proximity_score,
      -- Pillar 2: activity (0-30) — count of nearby permits matching this trade
      CASE
        WHEN active_permits_nearby >= 5 THEN 30
        WHEN active_permits_nearby >= 3 THEN 25
        WHEN active_permits_nearby = 2 THEN 20
        ELSE 15
      END AS activity_score,
      -- Pillar 3: contact (0-20) — better contact info = better lead
      CASE
        WHEN website IS NOT NULL AND primary_phone IS NOT NULL THEN 20
        WHEN website IS NOT NULL OR primary_phone IS NOT NULL THEN 15
        WHEN primary_email IS NOT NULL THEN 10
        ELSE 0
      END AS contact_score,
      -- Pillar 4: fit (0-23) — nearby count tiers + WSIB +3 bonus
      CASE
        WHEN active_permits_nearby >= 5 THEN 20
        WHEN active_permits_nearby >= 3 THEN 17
        WHEN active_permits_nearby = 2 THEN 14
        ELSE 10
      END
      + CASE WHEN is_wsib_registered THEN 3 ELSE 0 END
      AS fit_score
    FROM builder_aggregates
  )
  SELECT *,
    (proximity_score + activity_score + contact_score + fit_score) AS relevance_score
  FROM scored
  ORDER BY relevance_score DESC, closest_permit_m ASC
  LIMIT 20
`;

interface BuilderQueryRow {
  entity_id: number;
  legal_name: string;
  trade_name: string | null;
  business_size: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  photo_url: string | null;
  is_wsib_registered: boolean;
  active_permits_nearby: number;
  closest_permit_m: number;
  avg_project_cost: number | string | null;
  proximity_score: number;
  activity_score: number;
  contact_score: number;
  fit_score: number;
  relevance_score: number;
}

function toNumberOrNull(v: number | string | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: BuilderQueryRow): BuilderLeadCandidate {
  return {
    entity_id: row.entity_id,
    legal_name: row.legal_name,
    trade_name: row.trade_name,
    business_size: row.business_size,
    primary_phone: row.primary_phone,
    primary_email: row.primary_email,
    website: row.website,
    photo_url: row.photo_url,
    is_wsib_registered: row.is_wsib_registered,
    active_permits_nearby: row.active_permits_nearby,
    closest_permit_m: row.closest_permit_m,
    avg_project_cost: toNumberOrNull(row.avg_project_cost),
    proximity_score: row.proximity_score,
    activity_score: row.activity_score,
    contact_score: row.contact_score,
    fit_score: row.fit_score,
    relevance_score: row.relevance_score,
  };
}

/**
 * Run the spec 73 builder query against the pool. Never throws — returns
 * empty array on error so Phase 2 can call this without its own try/catch.
 *
 * **PARAMETER ORDER WARNING:** the function signature is `(slug, lat, lng, ...)`
 * — latitude FIRST, longitude SECOND — matching the rest of the codebase
 * convention (LeadFeedInput, geocoded permit fields, lead cards). Internally
 * we REORDER to PostGIS's `(lng, lat)` convention because `ST_MakePoint(x, y)`
 * expects longitude as x. If you change this signature, also flip the
 * parameter array on the `pool.query` call below.
 */
export async function queryBuilderLeads(
  trade_slug: string,
  lat: number,
  lng: number,
  radius_km: number,
  pool: Pool,
): Promise<BuilderLeadCandidate[]> {
  const start = Date.now();
  const radius_m = metersFromKilometers(radius_km);
  try {
    const res = await pool.query<BuilderQueryRow>(BUILDER_QUERY_SQL, [
      trade_slug,
      lng,
      lat,
      radius_m,
    ]);
    const mapped = res.rows.map(mapRow);
    logInfo('[builder-query]', 'success', {
      trade_slug,
      count: mapped.length,
      duration_ms: Date.now() - start,
    });
    return mapped;
  } catch (err) {
    logError('[builder-query]', err, { trade_slug, lat, lng, radius_km });
    return [];
  }
}
