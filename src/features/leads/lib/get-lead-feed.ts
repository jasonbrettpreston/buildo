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
  WITH
  -- Pre-aggregated WSIB lookup keyed by entity_id. The previous
  -- implementation used LEFT JOIN LATERAL inside builder_candidates,
  -- which evaluates the lateral subquery ONCE PER ROW of the
  -- (entities × entity_projects × permits × permit_trades × trades)
  -- cross product. With 150 permits per builder, the lateral fired
  -- 150 times for that single builder — Postgres doesn't dedupe
  -- correlated lateral evaluations even when the correlation is on
  -- a single column. Lifting the lookup into a CTE that's keyed by
  -- entity makes it run ONCE per unique entity for the whole query.
  -- The DISTINCT ON ... ORDER BY pair preserves the same row-pick
  -- semantics as the original LATERAL ORDER BY w2.last_enriched_at
  -- DESC, w2.id DESC. Caught by user-supplied Gemini holistic
  -- 2026-04-09 ("Lateral Cartesian Explosion").
  wsib_per_entity AS (
    SELECT DISTINCT ON (linked_entity_id)
      linked_entity_id,
      business_size
    FROM wsib_registry
    WHERE is_gta = true
      AND last_enriched_at IS NOT NULL
      AND business_size IN ('Small Business', 'Medium Business')
      AND (website IS NOT NULL OR primary_phone IS NOT NULL)
    ORDER BY linked_entity_id, last_enriched_at DESC, id DESC
  ),
  permit_candidates AS (
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
      -- Phase 3-iii widened columns: spec 70's SELECT projects these to
      -- the cards. Phase 1b-iii under-projected; reconciled here so the
      -- two cards can be built once against real data instead of
      -- retrofitting after a Phase 3-iii.5 SQL widening.
      n.name           AS neighbourhood_name,
      ce.cost_tier     AS cost_tier,
      -- DECIMAL(15,2) is returned as a string by node-pg unless cast.
      -- mapRow's toNumberOrNull handles either, but the explicit cast
      -- avoids the silent string-vs-number mismatch on JSON serialize.
      ce.estimated_cost::float8 AS estimated_cost,
      NULL::int        AS active_permits_nearby,
      NULL::float8     AS avg_project_cost,
      -- Phase 3-vi: project the user's saved-state for this lead.
      -- Pre-fix, SaveButton.initialSaved defaulted to false because
      -- LeadFeedItem had no is_saved field — every refetch / page
      -- reload reset every heart in the feed regardless of what
      -- lead_views.saved said server-side. The LEFT JOIN to lv_p
      -- below produces NULL when the user has never viewed/saved
      -- this lead → COALESCE coerces to false.
      COALESCE(lv_p.saved, false) AS is_saved,
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
      END AS opportunity_score,
      -- Semantic timing confidence — derived from the phase proxy
      -- because the feed doesn't run the full 3-tier timing engine.
      -- Phase 3 cards display "est." when confidence != 'high'.
      -- Active build phases are 'high' (we have real phase data);
      -- the generic 'ELSE' fallthrough is 'medium' (best-effort).
      CASE
        WHEN pt.phase IN ('structural', 'finishing', 'early_construction', 'landscaping')
          THEN 'high'
        ELSE 'medium'
      END AS timing_confidence,
      -- Semantic opportunity classification for card display. Spec 70
      -- §4 defines 4 categories: homeowner (likely DIY-adjacent),
      -- newbuild (full trade lineup needed), builder-led (established
      -- contractor), unknown (fallback). We classify from permit_type
      -- keywords because 95% of Toronto permits have no builder_name.
      CASE
        WHEN p.permit_type ILIKE '%small residential%'
          OR p.permit_type ILIKE '%interior alteration%' THEN 'homeowner'
        WHEN p.permit_type ILIKE '%new building%'
          OR p.permit_type ILIKE '%new house%'          THEN 'newbuild'
        ELSE 'unknown'
      END AS opportunity_type
    FROM permits p
    JOIN permit_trades pt USING (permit_num, revision_num)
    JOIN trades t ON t.id = pt.trade_id
    LEFT JOIN cost_estimates ce USING (permit_num, revision_num)
    -- LEFT JOIN: permits.neighbourhood_id is non-FK and may be NULL on
    -- permits the geocoder failed to bucket. neighbourhoods.neighbourhood_id
    -- is UNIQUE (migration 013 line 3) so this JOIN cannot multiply rows.
    LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
    -- Phase 3-vi saved-state JOIN: lead_views is UNIQUE on
    -- (user_id, lead_key, trade_slug) per migration 070 line 28.
    -- The JOIN MUST match on lead_key to use the actual unique
    -- index — the decomposed (permit_num, revision_num) pair is
    -- NOT a unique key, and pre-LPAD-normalization rows could
    -- coexist with lead_key=24-101234-1 and 24-101234-01 for the
    -- same (permit_num=24 101234, revision_num=1),
    -- which would multiply the permit row 2x without the lead_key
    -- equality. The decomposed-column predicates remain for
    -- index selectivity (idx_lead_views_user_viewed). Independent
    -- reviewer Issue 1 caught the original JOIN's incorrect safety
    -- claim. The lead_type='permit' guard is defense-in-depth
    -- against a future schema where permit_num could collide with
    -- an entity_id by accident.
    -- Phase 3-holistic WF3 Phase A (2026-04-09): MUST include the
    -- 'permit:' prefix. buildLeadKey() at record-lead-view.ts writes
    -- permit:{num}:{rev}; without the prefix here the LEFT JOIN
    -- NEVER matches and is_saved is structurally always false for the
    -- entire permit feed. Phase 3-vi shipped with this silent
    -- regression because the test in get-lead-feed.logic.test.ts
    -- codified the wrong format. Caught by independent reviewer I4.
    LEFT JOIN lead_views lv_p
      ON lv_p.user_id = $9::text
     AND lv_p.lead_key = ('permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0'))
     AND lv_p.permit_num = p.permit_num
     AND lv_p.revision_num = p.revision_num
     AND lv_p.trade_slug = $1
     AND lv_p.lead_type = 'permit'
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
      -- Phase 3-iii widened columns mirror permit_candidates so the
      -- UNION ALL shape lines up. Permit-only fields are NULL on
      -- builder rows; builder-only stats are NULL on permit rows.
      NULL::text    AS neighbourhood_name,
      NULL::text    AS cost_tier,
      NULL::float8  AS estimated_cost,
      -- The WHERE clause already filters to p.status IN
      -- ('Permit Issued','Inspection'), so COUNT here IS the count of
      -- ACTIVE permits within the radius — name is accurate.
      -- COUNT DISTINCT defends against entity_projects duplication: if a
      -- builder is linked to the same (permit_num, revision_num) under
      -- two Builder-role rows, plain COUNT would double-count. The
      -- composite tuple is the natural key per migration 001. Caught by
      -- DeepSeek 2026-04-09 review.
      COUNT(DISTINCT (p.permit_num, p.revision_num))::int AS active_permits_nearby,
      -- Same FILTER expression that feeds the value_score CASE — exposed
      -- as a column so the card can render the dollar figure. NULL when
      -- the builder has zero costed permits in radius (card omits the
      -- avg clause from the stats line).
      -- Uses COALESCE(cache, GUARDED_RAW) so the builder's avg uses the
      -- normalized cost_estimates value when available and falls back
      -- to the raw CKAN field ONLY when it exceeds PLACEHOLDER_COST_THRESHOLD
      -- (1000 — defined in spec 72 + cost-model.ts). The cost model
      -- explicitly rejects raw values <= 1000 as placeholders ($1 is a
      -- common Toronto CKAN placeholder); without this guard, placeholder
      -- values from yet-uncached permits would leak into the builder
      -- average and pull medium builders into the "small" tier.
      -- Independent reviewer C5 caught this in the holistic Phase 3 WF3.
      AVG(COALESCE(
        ce_b.estimated_cost::float8,
        CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END
      ))
        FILTER (WHERE COALESCE(
          ce_b.estimated_cost::float8,
          CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END
        ) > 0)
        AS avg_project_cost,
      -- Phase 3-vi saved-state — bool_or aggregate (instead of plain
      -- COALESCE on the JOIN column) because the builder CTE has a
      -- GROUP BY. lead_views is UNIQUE on (user_id, entity_id+lead_key,
      -- trade_slug) so bool_or is structurally always single-value, but
      -- using the aggregate keeps the SQL future-proof against a UNIQUE
      -- constraint relaxation.
      COALESCE(bool_or(lv_b.saved), false) AS is_saved,
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
      -- Pillar 3: value (0-20) — average project cost bucketed.
      -- Same COALESCE(cache, GUARDED_raw) as avg_project_cost above so
      -- value_score and avg_project_cost are computed against the
      -- IDENTICAL set of permits. The PLACEHOLDER_COST_THRESHOLD guard
      -- on the raw fallback prevents $1 placeholders from contaminating
      -- the bucket selection. Independent reviewer C5 fix.
      CASE
        WHEN AVG(COALESCE(ce_b.estimated_cost::float8,
             CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END))
             FILTER (WHERE COALESCE(ce_b.estimated_cost::float8,
               CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END) > 0) IS NULL    THEN 3
        WHEN AVG(COALESCE(ce_b.estimated_cost::float8,
             CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END))
             FILTER (WHERE COALESCE(ce_b.estimated_cost::float8,
               CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END) > 0) >= 2000000 THEN 20
        WHEN AVG(COALESCE(ce_b.estimated_cost::float8,
             CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END))
             FILTER (WHERE COALESCE(ce_b.estimated_cost::float8,
               CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END) > 0) >= 500000  THEN 14
        WHEN AVG(COALESCE(ce_b.estimated_cost::float8,
             CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END))
             FILTER (WHERE COALESCE(ce_b.estimated_cost::float8,
               CASE WHEN p.est_const_cost > 1000 THEN p.est_const_cost::float8 ELSE NULL END) > 0) >= 100000  THEN 10
        ELSE 6
      END AS value_score,
      -- Pillar 4: opportunity (0-20) — count of active permits. Rescaled
      -- from 0-10 to match the permit pillar boundaries (spec 70 §4).
      -- Uses COUNT(DISTINCT (permit_num, revision_num)) for the same
      -- entity_projects-duplication defense as active_permits_nearby
      -- above. Pre-fix this used plain COUNT(p.permit_num) which would
      -- double-count when a builder is linked to the same permit
      -- under multiple entity_projects rows. Caught by Gemini holistic
      -- WF3 review 2026-04-09 (line 1165).
      CASE
        WHEN COUNT(DISTINCT (p.permit_num, p.revision_num)) >= 5 THEN 20
        WHEN COUNT(DISTINCT (p.permit_num, p.revision_num)) >= 3 THEN 14
        WHEN COUNT(DISTINCT (p.permit_num, p.revision_num)) >= 1 THEN 10
        ELSE 0
      END AS opportunity_score,
      -- Semantic columns mirror the permit CTE so the UNION ALL shape
      -- lines up. Builder leads are always 'high' confidence (we know
      -- they have active permits) and always 'builder-led' opportunity.
      'high'::text AS timing_confidence,
      'builder-led'::text AS opportunity_type
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
    -- Pre-aggregated WSIB join (see wsib_per_entity CTE above for the
    -- rationale: the previous LATERAL fired per-row of the post-JOIN
    -- cross product, this fires once per entity for the whole query).
    LEFT JOIN wsib_per_entity w ON w.linked_entity_id = e.id
    -- Cost cache JOIN: surface cost_estimates.estimated_cost (the
    -- normalized/corrected value from compute-cost-estimates.js) so
    -- the builder value_score uses the SAME cleaned data as the
    -- permit value_score. Pre-fix, the builder CTE averaged the raw
    -- p.est_const_cost CKAN field while permits used the cache —
    -- creating a parity divergence where two cards based on the same
    -- underlying permits could disagree. COALESCE falls back to the
    -- raw value when a permit hasn't been cached yet (the cache is
    -- populated incrementally by the nightly compute job). User-
    -- supplied Gemini holistic 2026-04-09 ("Cost Cache Bypass").
    LEFT JOIN cost_estimates ce_b
      ON ce_b.permit_num = p.permit_num
     AND ce_b.revision_num = p.revision_num
    -- Phase 3-vi saved-state JOIN — same lead_key safety pattern as
    -- the permit branch. Builder lead_keys are the entity_id
    -- stringified per buildLeadKey() in record-lead-view.ts. Using
    -- both the lead_key equality (matches the unique index) AND the
    -- decomposed entity_id predicate (selectivity via the
    -- idx_lead_views_user_viewed index path). The bool_or
    -- aggregation in the SELECT collapses duplicates from the
    -- post-JOIN cross product (every permit row for the same
    -- builder sees the same lv_b row repeated).
    -- Phase 3-holistic WF3 Phase A fix: MUST include the 'builder:'
    -- prefix. buildLeadKey() writes builder:{entity_id}; bare
    -- e.id::text never matches, so is_saved was structurally
    -- always false for every builder lead in the feed. Independent
    -- reviewer C1 (Phase 0-3 bundle).
    LEFT JOIN lead_views lv_b
      ON lv_b.user_id = $9::text
     AND lv_b.lead_key = ('builder:' || e.id::text)
     AND lv_b.entity_id = e.id
     AND lv_b.trade_slug = $1
     AND lv_b.lead_type = 'builder'
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
  neighbourhood_name: string | null;
  cost_tier: string | null; // narrowed to enum in mapRow
  estimated_cost: number | string | null;
  active_permits_nearby: number | null;
  avg_project_cost: number | string | null;
  is_saved: boolean;
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
  // Semantic columns for Phase 3-iii cards — added by the Phase 0-3
  // comprehensive review as the cross-phase contract amendment.
  timing_confidence: 'high' | 'medium' | 'low';
  opportunity_type: 'homeowner' | 'newbuild' | 'builder-led' | 'unknown';
}

/**
 * Phase 3-iii synthetic timing display strings. The fast SQL phase proxy
 * gives us a confidence label but no human-readable timing window — the
 * spec-71 3-tier engine that produces a real `display` string is too
 * expensive to call per row in a 15-item feed (it'd join the inspection
 * stage map + calibration table per permit). Instead we map confidence
 * to a presentation phrase here at the mapRow boundary, then the
 * detail-view phase (Phase 4) overlays the precise engine output via
 * the `useLeadView` mutation response — no LeadFeedItem schema change
 * needed at that time. The phrase table is intentionally short and
 * presentational, NOT a translation key (i18n is out of scope for V1).
 */
// NOTE on the 'low' entry: the current feed SQL only produces 'high'
// (matched phase) or 'medium' (ELSE fallthrough) for permits, and the
// builder CTE hardcodes 'high'. The 'low' entry is dead code in the
// feed path TODAY but matches the spec-71 TradeTimingEstimate type
// which DOES have a 'low' confidence level (the staleness fallback
// for tier 1 inspections older than 180 days). When the detail-view
// phase wires the spec-71 engine, that engine's `confidence='low'`
// output will overlay the card via the useLeadView mutation response,
// and this phrase table is what the card will look up. Keeping the
// entry here means the wiring is one prop change, not a schema change.
// Independent reviewer holistic 2026-04-09 (C16).
export const TIMING_DISPLAY_BY_CONFIDENCE: Record<
  'high' | 'medium' | 'low',
  string
> = {
  high: 'Active build phase',
  medium: 'Estimated timing',
  low: 'Approximate timing',
};

const COST_TIER_VALUES = ['small', 'medium', 'large', 'major', 'mega'] as const;
type CostTier = (typeof COST_TIER_VALUES)[number];
function narrowCostTier(raw: string | null): CostTier | null {
  if (raw === null) return null;
  return (COST_TIER_VALUES as readonly string[]).includes(raw)
    ? (raw as CostTier)
    : null;
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
    timing_confidence: row.timing_confidence,
    opportunity_type: row.opportunity_type,
    // Synthetic Phase 3-iii display string. See TIMING_DISPLAY_BY_CONFIDENCE
    // header above for the rationale (heavy engine deferred to detail view).
    timing_display: TIMING_DISPLAY_BY_CONFIDENCE[row.timing_confidence],
    // Phase 3-vi: saved-state from lead_views (per current user).
    // The SQL projects this from a LEFT JOIN to lead_views with
    // COALESCE/bool_or fallback to false, so the row value is
    // ALWAYS a boolean — no narrowing needed here.
    is_saved: row.is_saved,
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
      neighbourhood_name: row.neighbourhood_name,
      cost_tier: narrowCostTier(row.cost_tier),
      estimated_cost: toNumberOrNull(row.estimated_cost),
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
    // active_permits_nearby is the COUNT from the builder CTE (already
    // filtered to active statuses by the WHERE). Should never be null on
    // a builder row from this SQL, but we narrow defensively the same way
    // we narrow other invariants — fall back to 0 instead of dropping the
    // row, since "0 active permits" is a sensible card display.
    active_permits_nearby: row.active_permits_nearby ?? 0,
    avg_project_cost: toNumberOrNull(row.avg_project_cost),
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
      input.user_id, // $9 — Phase 3-vi: keyed for the lead_views LEFT JOIN
    ];

    const res = await pool.query<LeadFeedRow>(LEAD_FEED_SQL, params);
    // Filter out any defensively-null mapping (rows where the SQL UNION
    // produced an unexpected shape — should never happen given the CASE
    // structure but the DU forces explicit narrowing).
    const data = res.rows
      .map(mapRow)
      .filter((item): item is LeadFeedItem => item !== null);

    // CRITICAL pagination contract: derive next_cursor from the RAW row
    // count + the LAST RAW ROW, not from the post-filter `data` length.
    // mapRow can defensively drop a malformed row → data.length <
    // clampedLimit → we'd incorrectly conclude we're on the last page
    // and set next_cursor=null, silently truncating the feed. The fix
    // is to use res.rows.length for the "is there more?" decision and
    // build the cursor from the last raw row (which always carries the
    // three cursor fields regardless of mapRow's verdict). Caught
    // independently by both Gemini and DeepSeek 2026-04-09 reviews.
    let next_cursor: LeadFeedCursor | null = null;
    if (res.rows.length === clampedLimit && res.rows.length > 0) {
      const lastRaw = res.rows[res.rows.length - 1];
      if (lastRaw) {
        next_cursor = {
          score: lastRaw.relevance_score,
          lead_type: lastRaw.lead_type,
          lead_id: lastRaw.lead_id,
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
    // Phase 3-holistic WF3 Phase E (2026-04-09, Independent reviewer
    // Phase 0-3 I2): do NOT log user_id + lat + lng in the infra-error
    // path. A pool exhaustion or DB timeout would bind a named user to
    // their GPS coordinates at a specific timestamp inside third-party
    // log aggregators — a PIPEDA/GDPR location-time record we don't
    // need to debug query failures. Debug context is trade_slug +
    // radius + limit; the user scope lives in per-request access logs.
    logError('[lead-feed/get]', err, {
      trade_slug: input.trade_slug,
      radius_km: clampedKm,
      limit: clampedLimit,
    });
    throw err;
  }
}
