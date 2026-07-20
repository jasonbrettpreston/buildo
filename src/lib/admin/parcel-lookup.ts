// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API) + §4 (normative mapping)
//
// Business logic for the Parcel Cost Model Tool lookup (route stays thin — standards §10.3):
//   resolveAddress()   — free-text → exact parcel | ≤10 candidates (Spec 54 normalized keys)
//   fetchParcelById()  — ONE row, explicit projection of ALL mapped columns (raw SQL: the Spec 88
//                        cost columns are absent from drizzle schema.ts — known mig-206 drift)
//   fetchCoaProjects() — nearby CoA list by neighbourhood_id (undecided-first)
//   assembleParcelPayload() — the 3-tier organization + tier-stratified safeParse degradation
//
// READ-ONLY: no writes, no derivation — organization + formatting only (Spec 89 §2.1).
// Parameterized SQL ONLY ($1…) — user input is never interpolated into SQL strings.

import { query } from '@/lib/db/client';
import { normalizeAddressNumber, parseLinearName } from '@/lib/parcels/address';
import { logWarn } from '@/lib/logger';
import {
  CostMenuSchema,
  NearbyBuildsSummarySchema,
  CoaProjectSchema,
  GROUP_KEYS,
  type ComparableBuild,
  type CoaProject,
  type GroupKey,
  type ParcelCandidate,
  type ParcelMatch,
  type ParcelPayload,
} from '@/app/api/admin/parcels/lookup/types';

// ── Spec 89 §4 — the NORMATIVE column-to-tier mapping ────────────────────────
// Single source of truth: the SELECT projection AND the schema-drift test both derive from these
// lists, so `information_schema.columns` minus EXCLUDED must equal their union (tested).
export const EXCLUDED_COLS = ['geometry', 'geom'] as const; // map blobs, not data (Spec 89 §3)

export const T1_COST_MENU_COL = 'parcel_cost_menu' as const;
export const T1_COST_SCALAR_COLS = [
  'cost_fb_total', 'cost_coa_total', 'cost_solar_total', 'cost_garden_suite_total',
  'cost_laneway_suite_total', 'cost_garage_total', 'cost_gut_total', 'cost_addition_total',
  'cost_kitchen_per_sqm', 'cost_bath_per_sqm', 'cost_basement_per_sqm', 'cost_basement_underpin_per_sqm',
] as const;

export const T1_AREA_COLS = [
  'lot_size_sqm', 'lot_size_sqft', 'opt_aor_gfa_sqm', 'opt_aor_storeys', 'opt_coa_gfa_sqm',
  'opt_coa_storeys', 'max_buildable_gfa_sqm', 'max_buildable_footprint_sqm', 'imagery_roof_gfa_sqm',
  'imagery_roof_footprint_sqm', 'cur_floor_gfa_sqm', 'max_newbuild_coa_gfa_sqm',
] as const;

export const T2_NBHD_COLS = [
  'nearby_builds_summary', 'comparable_builds', 'comp_count', 'comp_dominant_build',
  'comp_build_ratio_p50', 'comp_fsi_p50', 'neighbourhood_id', 'neighbourhood_cost_premium',
] as const;

export const T3_GROUPS: Record<GroupKey, readonly string[]> = {
  identity: [
    'id', 'parcel_id', 'feature_type', 'date_effective', 'date_expiry', 'created_at',
    'centroid_lat', 'centroid_lng', 'is_irregular',
  ],
  lot_address: [
    'address_number', 'linear_name_full', 'addr_num_normalized', 'street_name_normalized',
    'street_type_normalized', 'stated_area_raw', 'frontage_m', 'frontage_ft', 'depth_m', 'depth_ft',
    'lot_size_confidence', 'lot_size_basis',
  ],
  zoning: [
    'zoning_class', 'zoning_zn_string', 'zoning_gen_zone', 'zoning_holding', 'zone_status',
    'bylaw_max_fsi', 'bylaw_max_coverage_pct', 'bylaw_max_height_m', 'bylaw_max_stories',
    'bylaw_max_units', 'bylaw_max_density', 'bylaw_min_frontage_m', 'bylaw_min_area_sqm',
    'bylaw_standard_setback_m', 'bylaw_pct_commercial_max', 'bylaw_pct_residential_max',
    'bylaw_pct_employment_max', 'bylaw_pct_office_max', 'exception_number', 'exception_text',
    'bylaw_chapter', 'bylaw_section', 'bylaw_exception_ref', 'in_policy_area', 'on_policy_road',
    'in_rooming_house_overlay', 'in_parking_zone_overlay', 'in_building_setback_overlay',
    'on_priority_retail', 'in_queenstw_eat_overlay', 'zoning_overlays', 'zoning_base_source_id',
    'zoning_dominant_area_share', 'zoning_is_ambiguous', 'zoning_base_source_dataset_version',
    'zoning_enriched_at',
  ],
  heritage_ravine_centreline: [
    'is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched',
    'is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date',
    'heritage_dataset_version_when_enriched', 'is_corner_lot', 'is_through_lot',
    'primary_frontage_street_name', 'centreline_dataset_version_when_enriched', 'abuts_laneway',
  ],
  existing_structure: [
    'existing_stories', 'existing_height_m', 'existing_width_m', 'existing_length_m',
    'existing_structure_confidence', 'existing_other_structures_count', 'existing_other_structures_sqm',
    'existing_greenspace_sqm', 'existing_data_quality_flag', 'cur_gfa_low_sqm', 'cur_gfa_high_sqm',
    'cur_storeys_range', 'cur_gfa_band_basis',
  ],
  max_build: [
    'max_build_setback_basis', 'max_build_width_m', 'max_build_length_m', 'max_build_height_m',
    'max_build_stories', 'max_build_basis', 'max_buildable_gfa_basis', 'max_build_confidence',
    'envelope_constrained', 'envelope_constraint_reason', 'max_build_stories_basis',
    'max_build_stories_aggressive', 'market_exceeds_bylaw', 'max_build_fsi', 'coa_fsi',
    'realized_fsi_p90',
  ],
  scenarios: [
    'cur_basement_gfa_sqm', 'cur_storey_gfa_sqm', 'cur_interior_reno_gfa_sqm',
    'cur_est_kitchen_gfa_sqm', 'cur_est_bath_gfa_sqm', 'cur_pot_2story_gfa_sqm',
    'cur_pot_3story_gfa_sqm', 'cur_gfa_range_basis',
  ],
  accessory: [
    'garden_suite_fits', 'max_garden_suite_gfa_sqm', 'max_garage_gfa_sqm', 'garage_capacity_cars',
    'garage_constraint_reason', 'garage_permission', 'max_laneway_suite_gfa_sqm',
    'max_rear_suite_gfa_sqm', 'rear_suite_type', 'rear_suite_permission',
  ],
  optimal_config: [
    'opt_aor_units', 'opt_suite_type', 'opt_suite_fits_full', 'opt_binding_constraint',
    'opt_config_confidence', 'optimal_config',
  ],
};

/** Every projected column, in a stable order (the SELECT list + the drift test both use this). */
export function allMappedColumns(): string[] {
  return [
    T1_COST_MENU_COL,
    ...T1_COST_SCALAR_COLS,
    ...T1_AREA_COLS,
    ...T2_NBHD_COLS,
    ...GROUP_KEYS.flatMap((g) => [...T3_GROUPS[g]]),
  ];
}

// Column names come from the static lists above (never from user input), but quote-guard anyway.
function ident(col: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(col)) throw new Error(`illegal column identifier: ${col}`);
  return `"${col}"`;
}

// ── Address resolution (Spec 89 §3; Spec 54 keys) ────────────────────────────
export interface Resolution {
  match: ParcelMatch | null;
  candidates: ParcelCandidate[];
  /** true when >10 parcels share the address (e.g. a large condo) — the list is truncated. */
  truncated?: boolean;
}

/**
 * Split "26 Hurlingham Cres" → { num: '26', streetName: 'HURLINGHAM' } via the shared rules.
 *
 * WF3 FIX (2026-07-20, Parcel Cost Model Tool symptom): a real operator types (or
 * copy-pastes) a full postal address, which commonly carries a trailing
 * ", <city>[, <province>]" suffix — e.g. "41 Derwyn Road, Toronto". Without
 * stripping it, `parseLinearName` folded the city into the street name
 * ("DERWYN , TORONTO"), which matches ZERO rows in `parcels`/`address_points`
 * (live-reproduced: "41 Derwyn Road, Toronto" → no match; "41 Derwyn Road"
 * alone → exact match). `parcels`/`address_points` street names never
 * legitimately contain a comma (Toronto's LINEAR_NAME_FULL / addr-point
 * feeds are comma-free), so truncating at the first comma is safe.
 */
export function parseFreeTextAddress(q: string): { num: string; streetName: string } {
  const withoutCitySuffix = q.split(',')[0]!.trim();
  const m = withoutCitySuffix.match(/^(\S+)\s+(.+)$/);
  if (m && /\d/.test(m[1]!)) {
    return { num: normalizeAddressNumber(m[1]), streetName: parseLinearName(m[2]!).street_name };
  }
  return { num: '', streetName: parseLinearName(withoutCitySuffix).street_name };
}

const displayAddress = `TRIM(COALESCE(address_number, '') || ' ' || COALESCE(linear_name_full, ''))`;

export async function resolveAddress(q: string): Promise<Resolution> {
  const { num, streetName } = parseFreeTextAddress(q);
  if (!streetName) return { match: null, candidates: [] };

  // 1) Exact match on the parcels normalized keys (idx_parcels_address).
  if (num) {
    const exact = await query<{ parcel_id: string; address: string }>(
      `SELECT parcel_id, ${displayAddress} AS address
       FROM parcels
       WHERE addr_num_normalized = $1 AND street_name_normalized = $2
       ORDER BY parcel_id LIMIT 11`,
      [num, streetName],
    );
    if (exact.length === 1) {
      return {
        match: { parcelId: exact[0]!.parcel_id, matchType: 'exact', address: exact[0]!.address },
        candidates: [],
      };
    }
    if (exact.length > 1) {
      return {
        match: null,
        candidates: exact.slice(0, 10).map((r) => ({ parcelId: r.parcel_id, address: r.address })),
        truncated: exact.length > 10, // LIMIT 11 → an 11th row means more exist (Gemini fold)
      };
    }
  }

  // 2) Typeahead on address_points NORMALIZED columns (both btree-indexed; address_full is NOT
  //    indexed and MUST NOT be filtered — Spec 89 Known Failure Modes). Production-correct status
  //    filter: live data is 100% 'None'/NULL — '=CURRENT' alone matches ZERO rows (WF3 hotfix parity).
  // No SQL-fragment assembly (Gemini fold): a single static statement — the optional number is an
  // ($2 IS NULL OR …) bound parameter, so the query text never varies.
  const typeahead = await query<{ parcel_id: string; address: string }>(
    `SELECT DISTINCT p.parcel_id, COALESCE(ap.address_full, ${displayAddress.replaceAll('address_number', 'p.address_number').replaceAll('linear_name_full', 'p.linear_name_full')}) AS address
     FROM address_points ap
     JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
     JOIN parcels p ON p.id = pap.parcel_id
     WHERE ap.linear_name_normalized LIKE $1
       AND ($2::text IS NULL OR ap.addr_num_normalized = $2)
       AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
       AND UPPER(ap.maint_stage) = 'REGULAR'
     ORDER BY address LIMIT 10`,
    [streetName + '%', num || null],
  );
  if (typeahead.length === 1) {
    return {
      match: { parcelId: typeahead[0]!.parcel_id, matchType: 'typeahead', address: typeahead[0]!.address },
      candidates: [],
    };
  }
  return {
    match: null,
    candidates: typeahead.map((r) => ({ parcelId: r.parcel_id, address: r.address })),
  };
}

// ── Parcel + CoA reads ───────────────────────────────────────────────────────
export type ParcelRow = Record<string, unknown>;

export async function fetchParcelById(parcelId: string): Promise<ParcelRow | null> {
  const cols = allMappedColumns().map(ident).join(', ');
  const r = await query<ParcelRow>(
    `SELECT ${cols}, ${displayAddress} AS __display_address FROM parcels WHERE parcel_id = $1 LIMIT 1`,
    [parcelId],
  );
  return r[0] ?? null;
}

export async function fetchCoaProjects(neighbourhoodId: number | null): Promise<CoaProject[]> {
  if (neighbourhoodId == null) return []; // NULL-neighbourhood guard (Spec 89 §5)
  const r = await query<CoaProject>(
    `SELECT application_number AS "applicationNumber", address, status, decision,
            decision_date::text AS "decisionDate", hearing_date::text AS "hearingDate",
            description, project_type AS "projectType",
            modeled_gfa_sqm::float8 AS "modeledGfaSqm", estimated_cost::float8 AS "estimatedCost"
     FROM coa_applications
     WHERE neighbourhood_id = $1
     ORDER BY (decision IS NULL) DESC, hearing_date DESC NULLS LAST, application_number ASC
     LIMIT 20`,
    [neighbourhoodId],
  );
  return r;
}

// ── Assembly (the 3 tiers + tier-stratified degradation, Spec 89 §2.4) ──────
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export function assembleParcelPayload(
  row: ParcelRow,
  coaProjects: CoaProject[],
): { payload: ParcelPayload; warnings: string[] } {
  const warnings: string[] = [];
  const parcelId = String(row.parcel_id ?? '');

  // Tier 1 — cost menu (deep-validated; drift degrades to null, never blanks the response).
  let menu: ParcelPayload['costMenu']['menu'] = null;
  if (row[T1_COST_MENU_COL] != null) {
    const parsed = CostMenuSchema.safeParse(row[T1_COST_MENU_COL]);
    if (parsed.success) menu = parsed.data;
    else {
      warnings.push('cost menu unavailable (data shape drift — logged)');
      logWarn('[api/parcel-lookup]', 'jsonb-drift', { field: 'parcel_cost_menu', parcelId });
    }
  }
  const scalars: Record<string, number | null> = {};
  for (const c of T1_COST_SCALAR_COLS) scalars[c] = num(row[c]);
  const areas: Record<string, number | string | null> = {};
  for (const c of T1_AREA_COLS) {
    // pg numeric columns arrive as strings; parse to numbers, but PRESERVE a non-numeric string
    // (e.g. a range like "1-3") verbatim — presentation-only, never coerce to NaN (Gemini fold).
    const v = row[c];
    areas[c] = v == null ? null : typeof v === 'string' && Number.isNaN(Number(v)) ? v : num(v);
  }

  // Tier 2 — neighbourhood.
  let summary: ParcelPayload['neighbourhood']['summary'] = null;
  if (row.nearby_builds_summary != null) {
    const parsed = NearbyBuildsSummarySchema.safeParse(row.nearby_builds_summary);
    if (parsed.success) summary = parsed.data;
    else {
      warnings.push('neighbourhood summary unavailable (data shape drift — logged)');
      logWarn('[api/parcel-lookup]', 'jsonb-drift', { field: 'nearby_builds_summary', parcelId });
    }
  }
  const validCoa: CoaProject[] = [];
  for (const p of coaProjects) {
    const parsed = CoaProjectSchema.safeParse(p);
    if (parsed.success) validCoa.push(parsed.data);
  }
  if (validCoa.length < coaProjects.length) {
    warnings.push('some nearby CoA projects unavailable (data shape drift — logged)');
    logWarn('[api/parcel-lookup]', 'jsonb-drift', { field: 'coa_projects', parcelId });
  }
  const comparableBuilds = Array.isArray(row.comparable_builds) ? (row.comparable_builds as ComparableBuild[]) : null;

  // Tier 3 — the mapped groups, values passed through verbatim (presentation only).
  const groups = {} as Record<GroupKey, Record<string, unknown>>;
  for (const g of GROUP_KEYS) {
    const bucket: Record<string, unknown> = {};
    for (const c of T3_GROUPS[g]) bucket[c] = row[c] ?? null;
    groups[g] = bucket;
  }

  return {
    payload: {
      costMenu: { menu, scalars },
      areas,
      neighbourhood: {
        summary,
        coaProjects: validCoa,
        comparableBuilds,
        compStats: {
          compCount: num(row.comp_count),
          compDominantBuild: (row.comp_dominant_build as string | null) ?? null,
          compBuildRatioP50: num(row.comp_build_ratio_p50),
          compFsiP50: num(row.comp_fsi_p50),
          neighbourhoodId: num(row.neighbourhood_id),
          neighbourhoodCostPremium: num(row.neighbourhood_cost_premium),
        },
      },
      groups,
    },
    warnings,
  };
}
