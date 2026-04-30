// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
//
// Single-permit detail join. Composes the rich shape backing the mobile
// `/(app)/[lead]` screen — permits + cost_estimates + neighbourhoods +
// trade_forecasts + a LATERAL competition count from lead_views.
//
// `target_window` and `opportunity_score` are read directly from
// trade_forecasts (already persisted there); we do NOT recompute in JS.

import type {
  LeadDetail,
  LeadDetailCost,
  LeadDetailNeighbourhood,
} from '@/app/api/leads/detail/[id]/types';

/**
 * Raw row shape returned by `pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, …)`.
 * pg returns NUMERIC columns as strings (JS lacks arbitrary precision), so
 * decimal-typed columns are typed as `string | null` and unwrapped in the
 * mapper.
 */
export interface LeadDetailRow {
  permit_num: string;
  revision_num: string;
  street_num: string | null;
  street_name: string | null;
  work_description: string | null;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  latitude: string | null;
  longitude: string | null;
  updated_at: string;
  // cost
  estimated_cost: string | null;
  cost_tier: string | null;
  cost_range_low: string | null;
  cost_range_high: string | null;
  modeled_gfa_sqm: string | null;
  // neighbourhood
  neighbourhood_name: string | null;
  avg_household_income: number | null;
  median_household_income: number | null;
  period_of_construction: string | null;
  // forecast (per the user's trade_slug)
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
  target_window: 'bid' | 'work' | null;
  // competition (count from lateral)
  competition_count: number;
}

// $1 permit_num · $2 revision_num · $3 trade_slug · $4 viewer's user_id (excluded from competition count)
//
// competition_count must match the feed's semantic exactly so the same
// permit reports the same number on both list and detail screens:
//   - keyed on lead_key (`'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')`)
//     so the indexed path matches get-lead-feed.ts
//   - COUNT(DISTINCT user_id) so a multi-trade power user is counted once
//   - user_id != $4 to exclude the viewer's own save (spec 91 §3 says "OTHER users")
//   - lead_type = 'permit' to ignore CoA/builder rows that share the table
export const LEAD_DETAIL_SQL = `
  SELECT
    p.permit_num,
    p.revision_num,
    p.street_num,
    p.street_name,
    p.description AS work_description,
    p.lifecycle_phase,
    p.lifecycle_stalled,
    p.latitude::text AS latitude,
    p.longitude::text AS longitude,
    p.updated_at::text AS updated_at,
    ce.estimated_cost::text AS estimated_cost,
    ce.cost_tier,
    ce.cost_range_low::text AS cost_range_low,
    ce.cost_range_high::text AS cost_range_high,
    ce.modeled_gfa_sqm::text AS modeled_gfa_sqm,
    n.name AS neighbourhood_name,
    n.avg_household_income,
    n.median_household_income,
    n.period_of_construction,
    tf.predicted_start::text AS predicted_start,
    tf.p25_days,
    tf.p75_days,
    tf.opportunity_score,
    tf.target_window,
    COALESCE(lv_count.c, 0)::int AS competition_count
  FROM permits p
  LEFT JOIN cost_estimates ce
    ON ce.permit_num = p.permit_num
    AND ce.revision_num = p.revision_num
  LEFT JOIN neighbourhoods n
    ON n.id = p.neighbourhood_id
  LEFT JOIN trade_forecasts tf
    ON tf.permit_num = p.permit_num
    AND tf.revision_num = p.revision_num
    AND tf.trade_slug = $3
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT lv2.user_id)::int AS c
    FROM lead_views lv2
    WHERE lv2.lead_key = ('permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0'))
      AND lv2.saved = true
      AND lv2.user_id != $4::text
      AND lv2.lead_type = 'permit'
  ) lv_count ON TRUE
  WHERE p.permit_num = $1
    AND p.revision_num = $2
  LIMIT 1
`;

function toNumberOrNull(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function composeAddress(
  streetNum: string | null,
  streetName: string | null,
  fallback: string,
): string {
  const composed = `${streetNum ?? ''} ${streetName ?? ''}`.trim();
  return composed.length > 0 ? composed : fallback;
}

function toCost(row: LeadDetailRow): LeadDetailCost | null {
  // Surface the cost block only when at least one cost field is populated;
  // an all-null block from the LEFT JOIN with no matching cost_estimates
  // row should serialize as `cost: null` so the client can render an
  // empty-state, not "$0".
  if (
    row.estimated_cost === null &&
    row.cost_tier === null &&
    row.cost_range_low === null &&
    row.cost_range_high === null &&
    row.modeled_gfa_sqm === null
  ) {
    return null;
  }
  return {
    estimated: toNumberOrNull(row.estimated_cost),
    tier: row.cost_tier,
    range_low: toNumberOrNull(row.cost_range_low),
    range_high: toNumberOrNull(row.cost_range_high),
    modeled_gfa_sqm: toNumberOrNull(row.modeled_gfa_sqm),
  };
}

function toNeighbourhood(row: LeadDetailRow): LeadDetailNeighbourhood | null {
  if (
    row.neighbourhood_name === null &&
    row.avg_household_income === null &&
    row.median_household_income === null &&
    row.period_of_construction === null
  ) {
    return null;
  }
  return {
    name: row.neighbourhood_name,
    avg_household_income: row.avg_household_income,
    median_household_income: row.median_household_income,
    period_of_construction: row.period_of_construction,
  };
}

export function toLeadDetail(row: LeadDetailRow): LeadDetail {
  const lead_id = `${row.permit_num}--${row.revision_num}`;
  const lat = toNumberOrNull(row.latitude);
  const lng = toNumberOrNull(row.longitude);
  return {
    lead_id,
    lead_type: 'permit',
    permit_num: row.permit_num,
    revision_num: row.revision_num,
    address: composeAddress(row.street_num, row.street_name, lead_id),
    location: lat !== null && lng !== null ? { lat, lng } : null,
    work_description: row.work_description,
    // Reserved — see types.ts. Always null until the builders join helper exists.
    applicant: null,
    lifecycle_phase: row.lifecycle_phase,
    lifecycle_stalled: row.lifecycle_stalled,
    target_window: row.target_window,
    opportunity_score: row.opportunity_score,
    competition_count: row.competition_count,
    predicted_start: row.predicted_start,
    p25_days: row.p25_days,
    p75_days: row.p75_days,
    cost: toCost(row),
    neighbourhood: toNeighbourhood(row),
    updated_at: row.updated_at,
  };
}
