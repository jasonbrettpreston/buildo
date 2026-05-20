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
import { phaseName } from '@/lib/classification/phase-names';
import {
  buildTimeline,
  type CalibrationRow,
  type TransitionRow,
} from '@/lib/leads/build-lifecycle-timeline';

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
  linked_coa_application_number: string | null;
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
    p.linked_coa_application_number,
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
    -- spatial: pick the primary parcel link.
    -- WF3 2026-05-08: parcels (mig 011) exposes lot_size_sqm; the inspector
    -- aliases that as parcel_area_sqm to keep the MainRow shape stable.
    -- Mirrors compute-cost-estimates.js SOURCE_SQL.
    pp.parcel_id,
    parc.lot_size_sqm::text AS parcel_area_sqm,
    parc.centroid_lat::text AS parcel_lat,
    parc.centroid_lng::text AS parcel_lng,
    -- spatial: pick the primary parcel_buildings row (massing).
    -- WF3 2026-05-08: the LATERAL fetches building_id only; geometry lives
    -- on building_footprints (mig 023) — parcel_buildings (migs 024 + 026)
    -- is a join table with no area_sqm/height_m columns. Mirrors the
    -- compute-cost-estimates.js SOURCE_SQL pattern (single source of truth
    -- for permits → parcel_buildings → building_footprints chain).
    bf.footprint_area_sqm::text AS pb_area_sqm,
    bf.max_height_m::text       AS pb_height_m,
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
    SELECT building_id
      FROM parcel_buildings
     WHERE parcel_id = pp.parcel_id
     ORDER BY is_primary DESC NULLS LAST, confidence DESC NULLS LAST
     LIMIT 1
  ) pb ON true
  LEFT JOIN building_footprints bf ON bf.id = pb.building_id
  -- WF2 2026-05-08 revert: permits.neighbourhood_id references the SERIAL
  -- neighbourhoods.id per FK constraint fk_permits_neighbourhoods (mig 109
  -- step 4b nullified non-matching rows then VALIDATEd). The previous WF3
  -- 73f3ae6 commit changed this to n.neighbourhood_id based on the
  -- compute-cost-estimates.js SOURCE_SQL pattern — but that pattern is
  -- also wrong (silent miss; produces wrong neighbourhood per permit) and
  -- is filed for separate WF3 cleanup. Lead-detail-query.ts has the
  -- FK-correct shape. Live-DB test lead-inspect-query.db.test.ts pins
  -- this contract from now on.
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

  const [tradesRes, forecastsRes, entityRes, premiumTier, transitionsRes, calibrationRes] = await Promise.all([
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
    // WF1 #B 2026-05-09: lifecycle.timeline[] — historical transitions (the
    // ledger written by classify-lifecycle-phase step 21).
    pool.query<TransitionRow>(
      `SELECT from_phase, to_phase, transitioned_at::text AS transitioned_at
         FROM permit_phase_transitions
        WHERE permit_num = $1 AND revision_num = $2
        ORDER BY transitioned_at ASC`,
      [args.permit_num, args.revision_num],
    ),
    // WF1 #B 2026-05-09: phase_stay_calibration cohort percentiles for THIS
    // permit's permit_type — across all phases (timeline needs cohort
    // for past + current + future entries). Returns ~10-20 rows; cheap.
    pool.query<CalibrationRow>(
      `SELECT phase, median_days, p25_days, p75_days, sample_size
         FROM phase_stay_calibration
        WHERE permit_type = $1`,
      [m.permit_type],
    ),
  ]);

  // WF1 #B 2026-05-09: assemble lifecycle.timeline[] from the ledger +
  // calibration table + canonical Spec 84 §3 path. Pure function call —
  // no further DB access. Closes Spec 84 bug 84-W4.
  const calibrationByPhase: Record<string, CalibrationRow> = {};
  for (const row of calibrationRes.rows) {
    calibrationByPhase[row.phase] = row;
  }
  const timeline = buildTimeline({
    permitType: m.permit_type,
    currentPhase: m.lifecycle_phase,
    phaseStartedAt: m.phase_started_at,
    transitions: transitionsRes.rows,
    calibrationByPhase,
    now: new Date(),
  });

  // Sugar fields derived from the timeline.
  const currentEntry = timeline.find((e) => e.status === 'current');
  const upcomingEntries = timeline.filter((e) => e.status === 'upcoming');
  const predictedRemainingDays = upcomingEntries.reduce<number | null>(
    (sum, e) => (e.cohort_median_days != null ? (sum ?? 0) + e.cohort_median_days : sum),
    null,
  );
  const predictedCompletionAt = predictedRemainingDays != null
    ? new Date(Date.now() + predictedRemainingDays * 86_400_000).toISOString()
    : null;

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
      linked_coa_application_number: m.linked_coa_application_number,   // F.4
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
      phase_name: phaseName(m.lifecycle_phase),
      stalled: m.lifecycle_stalled,
      classified_at: m.lifecycle_classified_at,
      phase_started_at: m.phase_started_at,
      current_phase_days_in: currentEntry?.days_in_phase ?? null,
      predicted_remaining_days: predictedRemainingDays,
      predicted_completion_at: predictedCompletionAt,
      timeline,
    },
    forecast,
    engagement: {
      competition_count: m.competition_count,
      saved_by_admin: m.saved_by_admin,
    },
    updated_at: m.updated_at,
    // F.4 (Spec 76 §3.5 Cycle 8): CoA panel populated when permit has linked_coa.
    coa: m.linked_coa_application_number != null
      ? await fetchCoaPanel(pool, {
          coaLeadId: `coa:${m.linked_coa_application_number}`,
          permit_num: m.permit_num,
          paddedRevision,
          parentLeadType: 'permit',
        })
      : null,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// F.4 — CoA Classification panel fetcher (Spec 76 §3.5 Cycle 8 amendment).
// Returns the full LeadInspectCoa shape, OR null when:
//   - CoA application_number not found (orphan reference; emits data_quality breadcrumb)
//   - Substrate not yet classified (Phase D classifier hasn't run)
//
// Used for BOTH:
//   - Cross-stream-from-permit (called from fetchLeadInspect above)
//   - Primary CoA inspection (called from fetchLeadInspectByCoaLeadId below)
// ════════════════════════════════════════════════════════════════════════════════════════
import type {
  LeadInspectCoa,
  LeadInspectCoaDecisionEntry,
  LeadInspectCoaLinkedPermit,
  LeadInspectCoaCrossStreamEntry,
  LeadInspectCoaTrade,
} from '@/lib/admin/lead-schemas';
import { addBreadcrumb } from '@sentry/nextjs';

interface FetchCoaPanelArgs {
  coaLeadId: string;        // 'coa:APP-NUM'
  permit_num: string | null; // bare permit_num for cross-stream LIKE prefix (NULL if primary CoA without linked permit)
  paddedRevision: string | null; // LPAD'd revision_num of the actively inspected permit (for Arm 1 exact-match); NULL for CoA-primary inspections
  parentLeadType: 'permit' | 'coa';
}

interface CoaMainRow {
  application_number: string;
  coa_type_class: string | null;
  project_type: string | null;
  scope_tags: string[] | null;
  structure_type: string | null;
  decision_current: string | null;
  decision_date: string | null;
  hearing_date: string | null;
  estimated_cost: string | null;
  cost_source: string | null;
  modeled_gfa_sqm: string | null;
  lifecycle_seq: number | null;
  lifecycle_group: string | null;
  lifecycle_block: string | null;
  lifecycle_stage: string | null;
  bid_value: string | null;
  linked_permit_num: string | null;
  group_label: string | null;  group_color: string | null;  group_icon: string | null;
  block_label: string | null;  block_color: string | null;  block_icon: string | null;
  stage_label: string | null;  stage_color: string | null;  stage_icon: string | null;
}

const COA_MAIN_SQL = `
  SELECT
    ca.application_number,
    ca.coa_type_class,
    ca.project_type,
    ca.scope_tags,
    ca.structure_type,
    ca.decision               AS decision_current,
    ca.decision_date::text    AS decision_date,
    ca.hearing_date::text     AS hearing_date,
    ca.estimated_cost::text   AS estimated_cost,
    ca.cost_source,
    ca.modeled_gfa_sqm::text  AS modeled_gfa_sqm,
    ca.lifecycle_seq,
    ca.lifecycle_group, ca.lifecycle_block, ca.lifecycle_stage,
    ca.bid_value::text        AS bid_value,
    ca.linked_permit_num,
    usc.group_label, usc.group_color, usc.group_icon,
    usc.block_label, usc.block_color, usc.block_icon,
    usc.stage_label, usc.stage_color, usc.stage_icon
  FROM coa_applications ca
  LEFT JOIN universal_stream_catalog usc ON usc.seq = ca.lifecycle_seq
  WHERE ca.lead_id = $1
  LIMIT 1
`;

const COA_DECISION_HISTORY_SQL = `
  SELECT decision, transitioned_at::text AS transitioned_at,
         from_status, to_status
    FROM lifecycle_status_history
   WHERE lead_id = $1 AND decision IS NOT NULL
   ORDER BY transitioned_at ASC, id ASC
`;

// Pass-2 fold (2026-05-20 Spec 79 §7 Surface 1): lead_trades has `trade_id`
// (FK to trades.id), not `trade_slug` — the bare `lt.trade_slug` columns
// caused 42703 on every CoA inspector call. Mirror the working permit-trades
// pattern at line 224: read lt.trade_id, JOIN trades on t.id, SELECT
// t.slug AS trade_slug so the downstream CoaLeadTradesRow shape is preserved.
const COA_LEAD_TRADES_SQL = `
  SELECT lt.trade_id, t.slug AS trade_slug, lt.confidence::text AS confidence,
         t.name AS display_name
    FROM lead_trades lt
    LEFT JOIN trades t ON t.id = lt.trade_id
   WHERE lt.lead_id = $1
   ORDER BY lt.confidence DESC NULLS LAST
`;

// F.4 v4.1 (HIGH-DS-v4-A + HIGH-DS-v4-B/Ind-v4-6): 3-arm UNION ALL.
// Arm 1: active lead_id (exact match). Arm 2: ALL permit revisions via LIKE prefix (skipped when $2 NULL).
// Arm 3: linked CoA lead_id (skipped when $3 NULL). Defensive IS NOT NULL guards.
// Pass-2 fold (2026-05-20): explicit ::text casts on $2 and $3 — when the
// caller passes null (no linked permit / no cross-stream coa lead), pg-pool
// can't infer the parameter type and raises 42P18 ("could not determine data
// type of parameter $N"). Casting forces text inference up-front.
// Pass-2 fold #2: id::int casts — lifecycle_status_history.id is BIGINT; pg
// returns it as a string by default. The LeadInspect schema declares id as
// `number`, so the bare bigint string fails Zod validation. Cast in SQL.
const COA_CROSS_STREAM_SQL = `
  SELECT lead_id,
         CASE WHEN lead_id LIKE 'coa:%' THEN 'coa' ELSE 'permit' END AS lead_type,
         from_status, to_status, transitioned_at::text AS transitioned_at, id::int AS id
    FROM lifecycle_status_history
   WHERE lead_id = $1
  UNION ALL
  SELECT lead_id, 'permit', from_status, to_status, transitioned_at::text, id::int
    FROM lifecycle_status_history
   WHERE $2::text IS NOT NULL
     AND lead_id LIKE 'permit:' || $2::text || ':%' ESCAPE '\\'
  UNION ALL
  SELECT lead_id, 'coa', from_status, to_status, transitioned_at::text, id::int
    FROM lifecycle_status_history
   WHERE $3::text IS NOT NULL
     AND lead_id = $3::text
   ORDER BY transitioned_at ASC, id ASC
`;

const COA_LINKED_PERMIT_SQL = `
  SELECT permit_num,
         LPAD(revision_num::text, 2, '0') AS revision_num_padded,
         status
    FROM permits
   WHERE permit_num = $1
   ORDER BY revision_num DESC
   LIMIT 1
`;

interface CoaCrossStreamRow {
  lead_id: string;
  lead_type: 'permit' | 'coa';
  from_status: string | null;
  to_status: string | null;
  transitioned_at: string;
  id: number;
}

interface CoaDecisionRow {
  decision: string;
  transitioned_at: string;
  from_status: string | null;
  to_status: string | null;
}

interface CoaLeadTradesRow {
  trade_id: number | null;
  trade_slug: string;
  confidence: string | null;
  display_name: string | null;
}

interface CoaLinkedPermitRow {
  permit_num: string;
  revision_num_padded: string;
  status: string | null;
}

async function fetchCoaPanel(
  pool: Pool,
  args: FetchCoaPanelArgs,
): Promise<LeadInspectCoa | null> {
  const mainRes = await pool.query<CoaMainRow>(COA_MAIN_SQL, [args.coaLeadId]);

  // v4.1 CRIT-Obs-2 + MED-v1-O: orphan/missing-CoA signals via admin_action/warning breadcrumb.
  // Two cases: (a) primary coa: leadId with no row → 200+coa:null contract from caller; (b) cross-stream
  // from permit with orphaned linked_coa_application_number → caller renders OrphanLinkedCoaBanner.
  if (mainRes.rowCount === 0) {
    // Spec 76 §3.5 line 241: "data_quality Sentry breadcrumb" — automated DB-orphan signal,
    // not an admin action (Spec 33 §11 reserves admin_action for state-mutating events).
    addBreadcrumb({
      category: 'data_quality',
      level: 'warning',
      message: 'data_quality_coa_substrate_missing',
      data: {
        lead_id: args.coaLeadId,
        parent_lead_type: args.parentLeadType,
      },
    });
    return null;
  }

  const c = mainRes.rows[0]!;

  // Cross-stream timeline parameters (diff-stage CRIT-Ind/DS): pass paddedRevision so Arm 1 exact-match
  // hits the actually-inspected revision (NOT hardcoded :00 which doubled rev-00 rows and missed rev-01+).
  // $1 = the active lead (the one user is inspecting); $2 = bare permit_num for LIKE; $3 = linked CoA leadId.
  // For PRIMARY CoA inspection: $1=coaLeadId, $2=ca.linked_permit_num, $3=NULL (CoA's history is in arm 1).
  // For CROSS-STREAM from permit: $1=`permit:NUM:REV` of inspected permit, $2=permit_num, $3=coaLeadId (CoA via arm 3).
  const activeLeadId =
    args.parentLeadType === 'coa'
      ? args.coaLeadId
      : `permit:${args.permit_num}:${args.paddedRevision}`;
  const $2 = args.parentLeadType === 'coa' ? c.linked_permit_num : args.permit_num;
  const $3 = args.parentLeadType === 'permit' ? args.coaLeadId : null;

  // Value sanitization: reject SQL LIKE metacharacters in permit_num (mig 132 trigger format is alphanumeric+hyphen).
  if ($2 != null && /[%_\\]/.test($2)) {
    addBreadcrumb({
      category: 'security',
      level: 'warning',
      message: 'cross_stream_param_rejected_sql_metachars',
      data: { rejected_permit_num: $2 },
    });
  }

  const [decisionRes, tradesRes, crossRes, linkedPermitRes] = await Promise.all([
    pool.query<CoaDecisionRow>(COA_DECISION_HISTORY_SQL, [args.coaLeadId]),
    pool.query<CoaLeadTradesRow>(COA_LEAD_TRADES_SQL, [args.coaLeadId]),
    pool.query<CoaCrossStreamRow>(
      COA_CROSS_STREAM_SQL,
      [activeLeadId, $2 != null && !/[%_\\]/.test($2) ? $2 : null, $3],
    ),
    c.linked_permit_num != null
      ? pool.query<CoaLinkedPermitRow>(COA_LINKED_PERMIT_SQL, [c.linked_permit_num])
      : Promise.resolve({ rows: [] as CoaLinkedPermitRow[] }),
  ]);

  const decision_history: LeadInspectCoaDecisionEntry[] = decisionRes.rows.map((r) => ({
    decision: r.decision,
    transitioned_at: new Date(r.transitioned_at).toISOString(),
    from_status: r.from_status,
    to_status: r.to_status,
  }));

  const cross_stream_timeline: LeadInspectCoaCrossStreamEntry[] = crossRes.rows.map((r) => ({
    lead_id: r.lead_id,
    lead_type: r.lead_type,
    from_status: r.from_status,
    to_status: r.to_status,
    transitioned_at: new Date(r.transitioned_at).toISOString(),
    id: r.id,
  }));

  const lead_trades: LeadInspectCoaTrade[] = tradesRes.rows.map((r) => ({
    trade_id: r.trade_id,
    trade_slug: r.trade_slug,
    display_name: r.display_name,
    confidence: r.confidence != null ? Number(r.confidence) : null,
  }));

  const linkedRow = linkedPermitRes.rows[0];
  const linked_permit: LeadInspectCoaLinkedPermit | null = linkedRow
    ? {
        permit_num: linkedRow.permit_num,
        revision_num: linkedRow.revision_num_padded,
        status: linkedRow.status,
        lead_id: `permit:${linkedRow.permit_num}:${linkedRow.revision_num_padded}`,
      }
    : null;

  return {
    application_number: c.application_number,
    coa_type_class: c.coa_type_class,
    project_type: c.project_type,
    scope_tags: c.scope_tags ?? [],
    structure_type: c.structure_type,
    decision_current: c.decision_current,
    decision_history,
    decision_date: c.decision_date,
    hearing_date: c.hearing_date,
    estimated_cost: c.estimated_cost != null ? Number(c.estimated_cost) : null,
    cost_source: c.cost_source,
    modeled_gfa_sqm: c.modeled_gfa_sqm != null ? Number(c.modeled_gfa_sqm) : null,
    lifecycle_seq: c.lifecycle_seq,
    lifecycle_group: c.lifecycle_group,
    lifecycle_block: c.lifecycle_block,
    lifecycle_stage: c.lifecycle_stage,
    group_label: c.group_label,  group_color: c.group_color,  group_icon: c.group_icon,
    block_label: c.block_label,  block_color: c.block_color,  block_icon: c.block_icon,
    stage_label: c.stage_label,  stage_color: c.stage_color,  stage_icon: c.stage_icon,
    bid_value: c.bid_value != null ? Number(c.bid_value) : null,
    linked_permit,
    cross_stream_timeline,
    lead_trades,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// F.4 — Primary CoA inspection entrypoint (Spec 76 §3.5 Cycle 8).
// Returns 200+coa:null with explicit source-stub when the CoA application_number is not yet
// classified OR doesn't exist. UI renders <ClassifierPendingBanner> in this case.
// ════════════════════════════════════════════════════════════════════════════════════════
export async function fetchLeadInspectByCoaLeadId(
  pool: Pool,
  args: { coaLeadId: string; adminUid: string },
): Promise<LeadInspect> {
  const coa = await fetchCoaPanel(pool, {
    coaLeadId: args.coaLeadId,
    permit_num: null,            // CoA primary; permit_num lookup happens in fetchCoaPanel via ca.linked_permit_num
    paddedRevision: null,        // not applicable — Arm 1 uses $1=coaLeadId for primary-CoA inspections
    parentLeadType: 'coa',
  });

  // v4.1 HIGH-Ind-v4-5: explicit source stub for 200+coa:null contract.
  const nowIso = new Date().toISOString();
  const sourceStub: LeadInspect['source'] = {
    permit_num: null,
    revision_num: null,
    permit_type: null,
    structure_type: null,
    status: null,
    enriched_status: null,
    address: { street_num: null, street_name: null, street_type: null, full: '' },
    location: null,
    application_date: null,
    issued_date: null,
    completed_date: null,
    work: null,
    description: null,
    builder_name: null,
    owner: null,
    est_const_cost: null,
    last_seen_at: nowIso,
    first_seen_at: nowIso,
    linked_coa_application_number: null,
  };

  return {
    lead_id: args.coaLeadId,
    lead_type: 'coa',
    source: sourceStub,
    scope: { project_type: coa?.project_type ?? null, scope_tags: coa?.scope_tags ?? [] },
    trades: [],
    entity: null,
    spatial: { parcel: null, massing: null, neighbourhood: null },
    cost: null,
    lifecycle: {
      phase: null,
      phase_name: null,
      stalled: false,
      classified_at: null,
      phase_started_at: null,
      current_phase_days_in: null,
      predicted_remaining_days: null,
      predicted_completion_at: null,
      timeline: [],
    },
    forecast: [],
    engagement: { competition_count: 0, saved_by_admin: false },
    updated_at: nowIso,
    coa,
  };
}
