// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/01-pipeline/83_lead_cost_model.md §3 (Surgical Triangle inputs)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.3
//
// Admin Lead Inspect query — 8-panel diagnostic shape mirroring the field-
// coverage matrix of step 27 (assert-global-coverage.js). Two queries:
//   1. Main row — permits + cost_estimates + parcel/massing/neighbourhood
//      + entity (1:1 cardinality, single LEFT JOIN chain)
//   2. Side rows — permit_trades + trade_forecasts (1:N each, separate
//      queries to avoid cartesian explosion)
//
// Decoupled from /api/leads/detail/:id (Spec 91 §4.3.1 mobile contract):
// admin can inspect ANY permit, not just saved ones — no `lead_views.saved=true`
// LATERAL gate.

import type { Pool } from 'pg';
import type {
  LeadInspect,
  LeadInspectForecastRow,
  LeadInspectTradeRow,
} from '@/lib/admin/lead-schemas';

export interface FetchLeadInspectArgs {
  permit_num: string;
  revision_num: string;
  /** Admin uid from verifyAdminAuth — used to compute `engagement.saved_by_admin`. */
  adminUid: string;
}

interface MainRow {
  permit_num: string;
  revision_num: string;
  permit_type: string | null;
  structure_type: string | null;
  status: string | null;
  enriched_status: string | null;
  street_num: string | null;
  street_name: string | null;
  street_type: string | null;
  latitude: string | null;
  longitude: string | null;
  application_date: string | null;
  issued_date: string | null;
  completed_date: string | null;
  work: string | null;
  description: string | null;
  builder_name: string | null;
  owner: string | null;
  est_const_cost: string | null;
  last_seen_at: string;
  first_seen_at: string;
  // scope
  project_type: string | null;
  scope_tags: string[] | null;
  // cost_estimates
  cost_source: string | null;
  is_geometric_override: boolean | null;
  estimated_cost: string | null;
  modeled_gfa_sqm: string | null;
  trade_contract_values: Record<string, number> | null;
  effective_area_sqm: string | null;
  // spatial
  parcel_id: number | null;
  parcel_area_sqm: string | null;
  parcel_lat: string | null;
  parcel_lng: string | null;
  pb_area_sqm: string | null;
  pb_height_m: string | null;
  permit_storeys: number | null;
  neighbourhood_id: number | null;
  neighbourhood_name: string | null;
  avg_household_income: number | null;
  period_of_construction: string | null;
  // entity fields populated by a separate query (entitiesRes) — see fetchLeadInspect
  // body below. JS-side normalization is required because permits.builder_name is
  // raw (mixed-case, with suffixes) while entities.name_normalized is canonical.
  // Matrix lookup: Surgical Triangle allocation % (Spec 83 §3B)
  permit_type_allocation_pct: string | null;
  // lifecycle
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  lifecycle_classified_at: string | null;
  phase_started_at: string | null;
  // engagement
  competition_count: number;
  saved_by_admin: boolean;
  updated_at: string;
}

interface TradeRow {
  trade_id: number;
  trade_slug: string;
  confidence: string;
}

interface ForecastRow {
  trade_slug: string;
  target_window: 'bid' | 'work' | null;
  urgency: string | null;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
}

const MAIN_SQL = `
  SELECT
    p.permit_num, p.revision_num,
    p.permit_type, p.structure_type, p.status, p.enriched_status,
    p.street_num, p.street_name, p.street_type,
    p.latitude::text AS latitude, p.longitude::text AS longitude,
    p.application_date::text AS application_date,
    p.issued_date::text AS issued_date,
    p.completed_date::text AS completed_date,
    p.work, p.description, p.builder_name, p.owner,
    p.est_const_cost::text AS est_const_cost,
    p.last_seen_at::text AS last_seen_at,
    p.first_seen_at::text AS first_seen_at,
    p.project_type, p.scope_tags,
    p.storeys AS permit_storeys,
    p.lifecycle_phase, p.lifecycle_stalled,
    p.lifecycle_classified_at::text AS lifecycle_classified_at,
    p.phase_started_at::text AS phase_started_at,
    p.updated_at::text AS updated_at,
    -- cost_estimates
    ce.cost_source, ce.is_geometric_override,
    ce.estimated_cost::text AS estimated_cost,
    ce.modeled_gfa_sqm::text AS modeled_gfa_sqm,
    ce.trade_contract_values,
    ce.effective_area_sqm::text AS effective_area_sqm,
    -- spatial: pick the primary parcel link
    pp.parcel_id,
    parc.area_sqm::text AS parcel_area_sqm,
    parc.centroid_lat::text AS parcel_lat,
    parc.centroid_lng::text AS parcel_lng,
    -- spatial: pick the primary parcel_buildings row (massing)
    pb.area_sqm::text AS pb_area_sqm,
    pb.height_m::text AS pb_height_m,
    -- neighbourhood
    p.neighbourhood_id,
    n.name AS neighbourhood_name,
    n.avg_household_income,
    n.period_of_construction,
    -- matrix lookup: Surgical Triangle allocation % per Spec 83 §3B
    sim.gfa_allocation_percentage::text AS permit_type_allocation_pct,
    -- engagement
    COALESCE(lv_count.c, 0)::int AS competition_count,
    EXISTS (
      SELECT 1 FROM lead_views lv2
      WHERE lv2.lead_key = 'permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0')
        AND lv2.saved = true
        AND lv2.user_id = $3
    ) AS saved_by_admin
  FROM permits p
  LEFT JOIN cost_estimates ce
    ON ce.permit_num = p.permit_num
   AND ce.revision_num = p.revision_num
  LEFT JOIN LATERAL (
    SELECT pp.parcel_id
      FROM permit_parcels pp
     WHERE pp.permit_num = p.permit_num
       AND pp.revision_num = p.revision_num
     ORDER BY pp.confidence DESC NULLS LAST
     LIMIT 1
  ) pp ON true
  LEFT JOIN parcels parc ON parc.id = pp.parcel_id
  LEFT JOIN LATERAL (
    SELECT pb.area_sqm, pb.height_m
      FROM parcel_buildings pb
     WHERE pb.parcel_id = pp.parcel_id
     ORDER BY pb.is_primary DESC NULLS LAST, pb.confidence DESC NULLS LAST
     LIMIT 1
  ) pb ON true
  LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id
  -- Matrix lookup: scope_intensity_matrix (permit_type × structure_type → allocation %)
  -- per Spec 83 §3B. The other two cost.inputs fields (structure_complexity_factor,
  -- neighbourhood_premium_tier) are surfaced via separate paths:
  --   - structure_complexity_factor lives in trade_sqft_rates (per trade_slug, not
  --     per permit), so it'd be surfaced PER-TRADE in the forecast panel — not in
  --     this single-row cost.inputs panel. Future amendment may add to forecast rows.
  --   - neighbourhood_premium_tier is derived from logic_variables.income_premium_tiers
  --     (JSONB bracket lookup against avg_household_income). JS-side derivation is
  --     done in the mapper below — not a SQL JOIN.
  LEFT JOIN scope_intensity_matrix sim
         ON sim.permit_type = p.permit_type
        AND sim.structure_type = p.structure_type
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT lv.user_id)::int AS c
      FROM lead_views lv
     WHERE lv.lead_key = 'permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0')
       AND lv.saved = true
       AND lv.lead_type = 'permit'
  ) lv_count ON true
  WHERE p.permit_num = $1 AND p.revision_num = $2
`;

const TRADES_SQL = `
  SELECT pt.trade_id, t.slug AS trade_slug, pt.confidence::text
    FROM permit_trades pt
    JOIN trades t ON t.id = pt.trade_id
   WHERE pt.permit_num = $1 AND pt.revision_num = $2
   ORDER BY pt.confidence DESC NULLS LAST
`;

const FORECASTS_SQL = `
  SELECT trade_slug, target_window, urgency,
         predicted_start::text AS predicted_start,
         p25_days, p75_days, opportunity_score
    FROM trade_forecasts
   WHERE permit_num = $1 AND revision_num = $2
   ORDER BY opportunity_score DESC NULLS LAST
`;

function toNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Builder-name normalization mirror — ports `normalizeBuilderName` from
 * scripts/extract-builders.js so the inspector's entity lookup matches
 * `entities.name_normalized` correctly. Raw `permits.builder_name` is
 * mixed-case with suffixes ("ACME Builders Inc.") while
 * `entities.name_normalized` is canonical ("ACME BUILDERS").
 *
 * If this drifts from the JS source-of-truth, the entity panel will silently
 * miss matches. (TODO: extract to a shared module.)
 */
function normalizeBuilderName(name: string): string {
  let n = name.toUpperCase().trim();
  n = n.replace(/\s+/g, ' ');
  const suffixes = [
    'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
    'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
  ];
  const re = new RegExp(`\\s*\\b(${suffixes.join('|')})\\s*$`, 'i');
  n = n.replace(re, '').trim();
  n = n.replace(re, '').trim(); // run twice for "CORP INCORPORATED"
  n = n.replace(/[.,;]+$/, '').trim();
  return n;
}

/**
 * Resolve the `neighbourhood_premium_tier` label by reading
 * `logic_variables.income_premium_tiers` (JSONB: `{income_threshold: multiplier}`)
 * and finding which bracket `avg_household_income` falls into. Returns "base"
 * for income below the lowest threshold; the highest threshold's key otherwise.
 *
 * Spec 86 §1: `income_premium_tiers` example `{"100000": 1.2, "150000": 1.5}`.
 */
async function fetchNeighbourhoodPremiumTier(
  pool: Pool,
  avgIncome: number | null,
): Promise<string | null> {
  if (avgIncome == null) return null;
  // No try/catch here — DB errors propagate to the route's outer try-catch
  // (returns 500 sanitized via internalError). A failed logic_variables lookup
  // is a serious DB issue and should not be silently swallowed (Spec 47 §10.3
  // + Phase 2 holistic-review precedent — silent fallback masked a getLeadFeed
  // DB-on-fire signal as HTTP 200 empty feed at commit 0a3e680).
  const res = await pool.query<{ variable_value_json: Record<string, number> | null }>(
    `SELECT variable_value_json FROM logic_variables WHERE variable_key = 'income_premium_tiers'`,
  );
  const tiers = res.rows[0]?.variable_value_json;
  if (!tiers) return null;
  const sorted = Object.keys(tiers)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  let label = 'base';
  for (const threshold of sorted) {
    if (avgIncome >= threshold) label = `${threshold}+`;
    else break;
  }
  return label;
}

/** Heuristic: classify Liar's Gate path from cost_source + override flag (Spec 83 §3D). */
function classifyLiarGatePath(
  costSource: string | null,
  isGeometricOverride: boolean | null,
): 'surgical_only' | 'proportional_slicing' | 'none' | null {
  if (costSource == null) return null;
  if (costSource === 'none') return 'none';
  if (costSource === 'model' && isGeometricOverride === true) return 'surgical_only';
  if (costSource === 'permit') return 'proportional_slicing';
  // model without geometric_override = surgical-only fallback path
  if (costSource === 'model') return 'surgical_only';
  return null;
}

export async function fetchLeadInspect(
  pool: Pool,
  args: FetchLeadInspectArgs,
): Promise<LeadInspect | null> {
  const params = [args.permit_num, args.revision_num, args.adminUid];

  const mainRes = await pool.query<MainRow>(MAIN_SQL, params);
  if (mainRes.rowCount === 0) return null;
  const m = mainRes.rows[0]!;

  // Entity lookup uses JS-side normalization to match entities.name_normalized
  // (Gemini WF2 #4 review HIGH finding: joining `e.name_normalized = p.builder_name`
  // misses ~all matches because builder_name is raw, name_normalized is canonical).
  const normalizedBuilder =
    m.builder_name != null ? normalizeBuilderName(m.builder_name) : null;

  const [tradesRes, forecastsRes, entityRes, premiumTier] = await Promise.all([
    pool.query<TradeRow>(TRADES_SQL, [args.permit_num, args.revision_num]),
    pool.query<ForecastRow>(FORECASTS_SQL, [args.permit_num, args.revision_num]),
    normalizedBuilder
      ? pool.query<{
          legal_name: string | null;
          name_normalized: string | null;
          is_wsib_registered: boolean | null;
        }>(
          `SELECT legal_name, name_normalized, is_wsib_registered
             FROM entities
            WHERE name_normalized = $1
            LIMIT 1`,
          [normalizedBuilder],
        )
      : Promise.resolve({ rows: [] as Array<{ legal_name: string | null; name_normalized: string | null; is_wsib_registered: boolean | null }> }),
    fetchNeighbourhoodPremiumTier(pool, m.avg_household_income),
  ]);

  const trades: LeadInspectTradeRow[] = tradesRes.rows.map((r) => {
    const conf = Number(r.confidence);
    return {
      trade_id: r.trade_id,
      trade_slug: r.trade_slug,
      confidence: Number.isFinite(conf) ? conf : 0,
      // 0.55 is the default tag-trade-matrix fallback signaling no permit-specific signal.
      // Range is 0.50..0.60 to absorb minor floating-point + future tweaks while still
      // catching the canonical "no signal" pattern (the DST/ZARA over-classification).
      is_default_fallback: Number.isFinite(conf) && conf >= 0.5 && conf <= 0.6,
    };
  });

  const tradeContractValues = m.trade_contract_values ?? null;
  const forecast: LeadInspectForecastRow[] = forecastsRes.rows.map((r) => {
    const slice = tradeContractValues ? tradeContractValues[r.trade_slug] ?? null : null;
    return {
      trade_slug: r.trade_slug,
      target_window: r.target_window,
      urgency: r.urgency,
      predicted_start: r.predicted_start,
      p25_days: r.p25_days,
      p75_days: r.p75_days,
      opportunity_score: r.opportunity_score,
      trade_slice_dollar: slice == null ? null : Number(slice),
    };
  });

  // Compose address
  const addressParts = [m.street_num, m.street_name, m.street_type].filter(
    (s): s is string => !!s,
  );
  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : args.permit_num;

  // Compose location
  const lat = toNumber(m.latitude);
  const lng = toNumber(m.longitude);
  const location = lat != null && lng != null ? { lat, lng } : null;

  // Compose entity (from the JS-normalized side query)
  const entityRow = entityRes.rows[0];
  const entity = entityRow
    ? {
        matched: true,
        legal_name: entityRow.legal_name,
        name_normalized: entityRow.name_normalized,
        wsib_registered: entityRow.is_wsib_registered,
      }
    : null;

  // Compose spatial
  const parcelLat = toNumber(m.parcel_lat);
  const parcelLng = toNumber(m.parcel_lng);
  const parcel =
    m.parcel_id != null
      ? {
          id: m.parcel_id,
          area_sqm: toNumber(m.parcel_area_sqm),
          latitude: parcelLat,
          longitude: parcelLng,
        }
      : null;
  const pbAreaSqm = toNumber(m.pb_area_sqm);
  const pbHeightM = toNumber(m.pb_height_m);
  const massing =
    pbAreaSqm != null || pbHeightM != null || m.permit_storeys != null
      ? {
          area_sqm: pbAreaSqm,
          height_m: pbHeightM,
          stories: m.permit_storeys,
        }
      : null;
  const neighbourhood =
    m.neighbourhood_id != null
      ? {
          id: m.neighbourhood_id,
          name: m.neighbourhood_name,
          avg_household_income: m.avg_household_income,
          period_of_construction: m.period_of_construction,
        }
      : null;

  // Compose cost
  const estimatedTotal = toNumber(m.estimated_cost);
  const cost = m.cost_source
    ? {
        cost_source: m.cost_source as 'permit' | 'model' | 'none',
        is_geometric_override: m.is_geometric_override,
        estimated_cost_total: estimatedTotal,
        modeled_gfa_sqm: toNumber(m.modeled_gfa_sqm),
        trade_contract_values: tradeContractValues,
        inputs: {
          lot_size_sqm: parcel?.area_sqm ?? null,
          footprint_area_sqm: pbAreaSqm,
          height_m: pbHeightM,
          stories: m.permit_storeys,
          permit_type_allocation_pct: toNumber(m.permit_type_allocation_pct),
          // structure_complexity_factor lives per-trade_slug in trade_sqft_rates,
          // not per-permit. Surfaced PER-TRADE in the forecast panel rather than
          // here. Follow-up: extend the forecast row with this column.
          structure_complexity_factor: null,
          // Resolved JS-side from logic_variables.income_premium_tiers JSONB
          // bracket lookup against neighbourhood.avg_household_income.
          neighbourhood_premium_tier: premiumTier,
        },
        liar_gate: {
          modeled_total: estimatedTotal,
          reported_total: toNumber(m.est_const_cost),
          ratio:
            toNumber(m.est_const_cost) && estimatedTotal
              ? Number((toNumber(m.est_const_cost)! / estimatedTotal!).toFixed(3))
              : null,
          path: classifyLiarGatePath(m.cost_source, m.is_geometric_override),
        },
      }
    : null;

  // Pad revision_num to match the canonical lead_id format used in
  // lead_views.lead_key SQL (`LPAD(revision_num, 2, '0')`). Gemini WF2 #4 review LOW.
  const paddedRevision = m.revision_num.padStart(2, '0');
  return {
    lead_id: `${m.permit_num}--${paddedRevision}`,
    lead_type: 'permit',
    source: {
      permit_num: m.permit_num,
      revision_num: m.revision_num,
      permit_type: m.permit_type,
      structure_type: m.structure_type,
      status: m.status,
      enriched_status: m.enriched_status,
      address: {
        street_num: m.street_num,
        street_name: m.street_name,
        street_type: m.street_type,
        full: fullAddress,
      },
      location,
      application_date: m.application_date,
      issued_date: m.issued_date,
      completed_date: m.completed_date,
      work: m.work,
      description: m.description,
      builder_name: m.builder_name,
      owner: m.owner,
      est_const_cost: toNumber(m.est_const_cost),
      last_seen_at: m.last_seen_at,
      first_seen_at: m.first_seen_at,
    },
    scope: {
      project_type: m.project_type,
      scope_tags: m.scope_tags ?? [],
    },
    trades,
    entity,
    spatial: { parcel, massing, neighbourhood },
    cost,
    lifecycle: {
      phase: m.lifecycle_phase,
      stalled: m.lifecycle_stalled,
      classified_at: m.lifecycle_classified_at,
      phase_started_at: m.phase_started_at,
    },
    forecast,
    engagement: {
      competition_count: m.competition_count,
      saved_by_admin: m.saved_by_admin,
    },
    updated_at: m.updated_at,
  };
}
