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
import type { LotMapSeed } from '@/lib/parcels/lot-map';
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
    'lot_size_confidence', 'lot_size_basis', 'lot_size_source',
  ],
  zoning: [
    'zoning_class', 'zoning_zn_string', 'zoning_gen_zone', 'zoning_holding', 'zone_status',
    'bylaw_max_fsi', 'bylaw_max_coverage_pct', 'bylaw_max_height_m', 'bylaw_max_stories',
    'bylaw_max_units', 'bylaw_max_density', 'bylaw_min_frontage_m', 'bylaw_min_area_sqm',
    'bylaw_standard_setback_m', 'bylaw_pct_commercial_max', 'bylaw_pct_residential_max',
    'bylaw_pct_employment_max', 'bylaw_pct_office_max', 'exception_number', 'exception_text',
    'bylaw_chapter', 'bylaw_section', 'bylaw_exception_ref', 'in_policy_area', 'on_policy_road',
    'in_rooming_house_overlay', 'in_parking_zone_overlay', 'in_building_setback_overlay',
    'on_priority_retail', 'in_queenstw_eat_overlay', 'in_sixplex_area', 'sixplex_area_type',
    'sixplex_membership_basis', 'zoning_overlays', 'zoning_base_source_id',
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
    // Migration 240 (Phase B B2 / D1'): the massing-enrichment watermark. Grouped with max_build
    // because it gates the massing/max-build pass, mirroring zoning_enriched_at in `zoning`.
    'massing_enriched_at',
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
/**
 * MF-53 (Spec 100 §2.6 dated note 2026-11-11; operator ruling 2026-09-16, "we should know the difference and just present the right one"):
 * the outcome name. Intersections are not named here (the parser has no intersection handling; the app reads the query shape on no_match).
 */
export type ParcelResolution = 'unique' | 'text_candidates' | 'multi_parcel' | 'unlinked' | 'no_match';

export interface Resolution {
  match: ParcelMatch | null;
  candidates: ParcelCandidate[];
  /** true when >10 parcels share the address (e.g. a large condo) — the list is truncated. */
  truncated?: boolean;
  /** MF-53: added; match / candidates / truncated are unchanged on every outcome (the admin tool reads only those, Spec 89 §3). */
  resolution: ParcelResolution;
  /** MF-53: what the consumer map read needs, built only from this resolver's own rows; null unless multi_parcel / unlinked. */
  lotMap: LotMapSeed | null;
}

/**
 * MF-53 · ONE rule on both paths (plan v4 §2.1): 2+ rows printing ONE non-empty address with a house number typed is one address over
 * several lots (the map); different printed addresses are the list. An empty printed address never counts as "one address" (legacy columns,
 * PLAN panel regression MEDIUM-5).
 */
function classifyRows(rows: { parcel_id: string; address: string }[], num: string, truncated: boolean): Pick<Resolution, 'resolution' | 'lotMap'> {
  const printed = new Set(rows.map((r) => r.address.trim()));
  if (num && printed.size === 1 && !printed.has('')) {
    return {
      resolution: 'multi_parcel',
      lotMap: { kind: 'multi_parcel', parcelIds: truncated ? [] : rows.map((r) => r.parcel_id), num, truncated },
    };
  }
  return { resolution: 'text_candidates', lotMap: null };
}

/**
 * task-69 A.5 (RR-0166, operator "ONE-12 a"): a unit typed after the address ("100 Queen St E Unit 4", "#4", "Apt 4") is dropped BEFORE the parse so the
 * address still matches. Closed forms, one trailing token, applied only while a house number and a street remain ("5 Unit 4", "100" and a street
 * named Unit are untouched; "4A" is a house number). The unit is not used to narrow the match (parcels are lots, not units; the ruled "add a unit
 * number" text stays). Anchored, no nested quantifiers. The JOIN-key normalizers are not touched.
 */
const UNIT_TAIL = /\s+(?:UNIT\s*#?|APT\.?|APARTMENT|SUITE|STE\.?)\s*\d{1,5}[A-Z]?$|\s+#\s*\d{1,5}[A-Z]?$/i;
function stripTrailingUnit(s: string): string {
  const stripped = s.replace(UNIT_TAIL, '').trim();
  if (stripped === s) return s;
  const tokens = stripped.split(/\s+/);
  return tokens.length >= 2 && /\d/.test(tokens[0]!) ? stripped : s; // tokens.length >= 2 is tested first, so tokens[0] exists
}

/**
 * SEARCHFIX.1 (task-449; fold plan A1; RR-0166 "ONE-12 a" for the unit rule): the typed text before the city cut. A period becomes a space ("St." reads
 * as "St"), unless keepPeriods (the raw-first run of resolveAddress, for a stored key that holds a period). One LEADING closed-form unit ("Unit 4, 123
 * Yonge St", "Apt 4B, 12 Elm St", "#4 2760 Yonge St") is dropped. The separator after the unit is required, so "Suite 12 Elm St" and "#12 Elm St" are
 * untouched (a separator-free tail would backtrack inside the digits and read house number 2). Anchored, no nested quantifiers.
 */
const UNIT_HEAD = /^\s*(?:UNIT\s*#?|APT|APARTMENT|SUITE|STE|#)\s*\d{1,5}[A-Z]?(?:\s*,\s*|\s+)(?=\d)/i;
function typedText(q: string, keepPeriods: boolean): string {
  return (keepPeriods ? q : q.replace(/\./g, ' ')).replace(UNIT_HEAD, '');
}

/** The cleaned typed address: typedText, the WF3 city cut (below) and the trailing-unit strip, in that order. */
function typedBase(q: string, keepPeriods: boolean): string {
  return stripTrailingUnit((typedText(q, keepPeriods).split(',')[0] ?? '').trim());
}

export type Compass = 'N' | 'S' | 'E' | 'W';

/** The trailing street direction of an address text as N/S/E/W (one mapper for the typed query and the returned rows), or null. */
function trailingCompass(text: string): Compass | null {
  const base = stripTrailingUnit(text.split(',')[0]!.trim()).toUpperCase(); // split always returns at least one element, so [0] exists
  const m = base.match(/^(.*\S)\s+(NORTH|SOUTH|EAST|WEST|[NSEW])$/);
  return m ? (m[2]![0] as Compass) : null; // group 2 is not optional, so a match always holds it
}

/**
 * task-69 A.4 (RR-0166 "ONE-12 a"): the street direction the user typed (E, W, N, S, East ...), or null. It is a guard AFTER the match
 * (guardByDirection), never part of the join key: parseLinearName still strips it (address.ts:59-62, Spec 89 line 33).
 * Null when no street name remains once the direction is removed ("100 W").
 */
export function typedDirection(q: string): Compass | null {
  const d = trailingCompass(typedText(q, false));
  return d && parseFreeTextAddress(q).streetName ? d : null;
}

/**
 * SEARCHFIX.1 (task-449, A1): the street type the user typed (ST, AVE, DR ...), or '' when none is typed. Read by parseLinearName from the street
 * part of the same cleaned base as parseFreeTextAddress, so a period, a unit or a city suffix never changes it. A guard AFTER the match, never part
 * of the join key (address.ts is not edited).
 */
export function typedStreetType(q: string): string {
  const base = typedBase(q, false);
  const m = base.match(/^(\S+)\s+(.+)$/);
  return parseLinearName(m && /\d/.test(m[1] ?? '') ? (m[2] ?? '') : base).street_type;
}

/**
 * SEARCHFIX.1 (task-449, A1, AC #3): the street-type guard on rows the exact read already returned (no new query), the same shape as
 * guardByDirection. The row type is read by parseLinearName from the whole printed address (a house number never matches the type list). Acts only
 * when a type was typed AND every row prints one (a row that prints none proves nothing: unchanged, so a second parcel on the number is never
 * hidden). Rows of the typed type only when any match; a ONE-row hit of another type is a proven conflict (the list, the lot still shown;
 * RR-0442, RR-0443 c); otherwise unchanged. Never empties a non-empty set.
 */
function guardByType<T extends { address: string }>(rows: T[], typed: string): { rows: T[]; conflict: boolean } {
  if (!typed || rows.length === 0) return { rows, conflict: false };
  const types = rows.map((r) => parseLinearName(r.address).street_type);
  if (types.some((t) => t === '')) return { rows, conflict: false };
  const same = rows.filter((_, i) => types[i] === typed);
  if (same.length > 0) return { rows: same, conflict: false };
  return { rows, conflict: rows.length === 1 };
}

/**
 * SEARCHFIX.1 (task-449; RR-0442 "It should open on an exact match"; RR-0443 c "they need to select from the available addresses that are close"):
 * a printed address is the typed address in full when its first word, normalized, is the typed number, the street name parseLinearName reads from
 * the rest equals the typed one, and its street type does not conflict. "2760 Yon" (YONGE), "14 Norwood" (NORWOOD TER) and a street with no number
 * are not; "21 Langden Ave" printed "21 Langden Ave" is.
 */
function isTypedAddressInFull(printed: string, num: string, streetName: string, typedType: string): boolean {
  const m = printed.trim().match(/^(\S+)\s+(.+)$/);
  if (!num || !m) return false;
  return normalizeAddressNumber(m[1]) === num && parseLinearName(m[2] ?? '').street_name === streetName && !guardByType([{ address: printed }], typedType).conflict;
}

/** SEARCHFIX.1 (task-449, G2 D1): a LIKE prefix with the typed wildcards escaped (Postgres's default LIKE escape is backslash; the SQL text is unchanged). */
function likePrefix(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&') + '%';
}

/**
 * The direction guard on rows the existing match already returned (no new query). Acts only when a direction was typed AND every row carries an
 * explicit direction (a row without one proves nothing: unchanged). Rows on the typed side only when any match; a ONE-row hit on another side is a
 * proven conflict (label 1: unique becomes text_candidates, the lot still listed); otherwise unchanged. Never empties a non-empty set.
 */
function guardByDirection<T extends { address: string }>(rows: T[], typed: Compass | null): { rows: T[]; conflict: boolean } {
  if (!typed || rows.length === 0) return { rows, conflict: false };
  const dirs = rows.map((r) => trailingCompass(r.address));
  if (dirs.some((d) => d === null)) return { rows, conflict: false };
  const same = rows.filter((_, i) => dirs[i] === typed);
  if (same.length > 0) return { rows: same, conflict: false };
  return { rows, conflict: rows.length === 1 };
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
export function parseFreeTextAddress(q: string, keepPeriods = false): { num: string; streetName: string } {
  // SEARCHFIX.1 (task-449): typedText runs first (period, leading unit); the city cut and the trailing-unit strip then run on its result, as before.
  const withoutCitySuffix = typedBase(q, keepPeriods);
  const m = withoutCitySuffix.match(/^(\S+)\s+(.+)$/);
  // groups 1 and 2 are not optional, so a match that succeeded holds both (the `!` on the next two lines)
  if (m && /\d/.test(m[1]!)) {
    return { num: normalizeAddressNumber(m[1]), streetName: parseLinearName(m[2]!).street_name }; // see the comment above: group 2 exists
  }
  return { num: '', streetName: parseLinearName(withoutCitySuffix).street_name };
}

/**
 * Label 1 (ONE-12 a): a one-lot hit whose printed direction differs from the typed one is answered as the address list (the lot still shown).
 * SEARCHFIX.1 (task-449) reuses it for a street-type conflict, a one-row typeahead that is not the typed address in full, and the letter and dash list.
 */
function conflictList(rows: { parcel_id: string; address: string }[]): Resolution {
  return { match: null, candidates: rows.map((r) => ({ parcelId: r.parcel_id, address: r.address })), resolution: 'text_candidates', lotMap: null };
}

const displayAddress = `TRIM(COALESCE(address_number, '') || ' ' || COALESCE(linear_name_full, ''))`;

/**
 * `opts.classifyUnlinked` (MF-53, the consumer route only): on a typeahead miss with a house number, read whether live address points exist
 * with NO lot link (`unlinked`), else `no_match`. The admin call leaves it off and keeps today's two reads (PLAN panel regression MEDIUM-3).
 * `opts.matchMistyped` (task-333 SRCH.FUZZY, the consumer route only): on that final miss, read the permit pipeline's address matcher (below).
 */
/** The exact read on the parcels normalized keys (idx_parcels_address); one statement, also read by the SEARCHFIX.1 letter and dash fallback. */
function readExact(num: string, streetName: string): Promise<{ parcel_id: string; address: string }[]> {
  return query<{ parcel_id: string; address: string }>(
    `SELECT parcel_id, ${displayAddress} AS address
       FROM parcels
       WHERE addr_num_normalized = $1 AND street_name_normalized = $2
       ORDER BY parcel_id LIMIT 11`,
    [num, streetName],
  );
}

/**
 * SEARCHFIX.1 (task-449): `keepPeriods` (an argument, not an option) runs the reads on the street key with its periods kept. A query holding a period
 * whose raw key differs from the stripped one is first run that way (exact, typeahead and unlinked reads only: no matcher, no fallback), and that
 * result is returned unless it is no_match; only then does the stripped key run every step. Raw first, so a stored key with a period (". GASPAR CRT")
 * opens as before, and the strip only adds hits ("St. Clair Ave W", stored without a period).
 */
export async function resolveAddress(
  q: string,
  opts: { classifyUnlinked?: boolean; matchMistyped?: boolean } = {},
  keepPeriods = false,
): Promise<Resolution> {
  if (!keepPeriods && q.includes('.') && parseFreeTextAddress(q, true).streetName !== parseFreeTextAddress(q).streetName) {
    const raw = await resolveAddress(q, { ...opts, matchMistyped: false }, true);
    if (raw.resolution !== 'no_match') return raw;
  }
  const { num, streetName } = parseFreeTextAddress(q, keepPeriods);
  const typed = typedDirection(q);
  const typedType = typedStreetType(q);
  if (!streetName) return { match: null, candidates: [], resolution: 'no_match', lotMap: null };

  // 1) Exact match on the parcels normalized keys (idx_parcels_address).
  if (num) {
    let exact = await readExact(num, streetName);
    const exactTruncated = exact.length > 10; // LIMIT 11 → an 11th row means more exist (Gemini fold); read before the guard narrows
    const exactG = guardByDirection(exact, exactTruncated ? null : typed); // a truncated window cannot prove a narrowed row is the only one: unchanged (output review r2 #2)
    if (exactG.conflict) return conflictList(exactG.rows);
    exact = exactG.rows;
    // SEARCHFIX.1 (A1, AC #3): "32 Fulham Dr" opens Fulham Dr, not the list with Fulham St; same truncation rule as the direction guard, which is checked again on the narrowed row (RR-0166: "32 Fulham Dr E" over Fulham St W and Fulham Dr W is the list).
    const typeG = guardByType(exact, exactTruncated ? '' : typedType);
    exact = typeG.rows;
    if (typeG.conflict || guardByDirection(exact, exactTruncated ? null : typed).conflict) return conflictList(exact);
    if (exact.length === 1) {
      return {
        // exact.length === 1 was tested on the line above, so exact[0] exists (both `!` on the next line)
        match: { parcelId: exact[0]!.parcel_id, matchType: 'exact', address: exact[0]!.address },
        candidates: [],
        resolution: 'unique',
        lotMap: null,
      };
    }
    if (exact.length > 1) {
      return {
        match: null,
        candidates: exact.slice(0, 10).map((r) => ({ parcelId: r.parcel_id, address: r.address })),
        truncated: exactTruncated,
        ...classifyRows(exact, num, exactTruncated),
      };
    }
  }

  // 2) Typeahead on address_points NORMALIZED columns (both btree-indexed; address_full is NOT
  //    indexed and MUST NOT be filtered — Spec 89 Known Failure Modes). Production-correct status
  //    filter: live data is 100% 'None'/NULL — '=CURRENT' alone matches ZERO rows (WF3 hotfix parity).
  //    Fold 10 item 4 (registry-truth, 2026-10-03): soft-retired points (retired_at set) are excluded.
  // No SQL-fragment assembly (Gemini fold): a single static statement — the optional number is an
  // ($2 IS NULL OR …) bound parameter, so the query text never varies.
  let typeahead = await query<{ parcel_id: string; address: string }>(
    `SELECT DISTINCT p.parcel_id, COALESCE(ap.address_full, ${displayAddress.replaceAll('address_number', 'p.address_number').replaceAll('linear_name_full', 'p.linear_name_full')}) AS address
     FROM address_points ap
     JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
     JOIN parcels p ON p.id = pap.parcel_id
     WHERE ap.linear_name_normalized LIKE $1
       AND ($2::text IS NULL OR ap.addr_num_normalized = $2)
       AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
       AND UPPER(ap.maint_stage) = 'REGULAR'
       AND ap.retired_at IS NULL
     ORDER BY address LIMIT 10`,
    [likePrefix(streetName), num || null],
  );
  // SEARCHFIX.1 (ST1, AC #2): a window of 10 may be cut short (no overflow probe), so it cannot prove a narrowed row is the only one on the typed
  // side: unchanged, the list ("Gerrard St W"). The exact path's own truncation rule (above), on the typeahead's LIMIT 10.
  const typeaheadG = guardByDirection(typeahead, typeahead.length >= 10 ? null : typed);
  if (typeaheadG.conflict) return conflictList(typeaheadG.rows);
  typeahead = typeaheadG.rows;
  if (typeahead.length === 1) {
    // SEARCHFIX.1 (2a, AC #1; RR-0442 "It should open on an exact match"; RR-0443 c "they need to select from the available addresses that are
    // close"): one leftover row opens only when it is the typed address in full (about 45,000 plain-number addresses are reached only this way);
    // a prefix ("2760 Yon"), a street with no number and a narrowed leftover are the list. matchType stays 'typeahead' (additive_only enum).
    if (!typeahead.every((r) => isTypedAddressInFull(r.address, num, streetName, typedType))) return conflictList(typeahead);
    return {
      // typeahead.length === 1 was tested above, so typeahead[0] exists (both `!` on the next line)
      match: { parcelId: typeahead[0]!.parcel_id, matchType: 'typeahead', address: typeahead[0]!.address },
      candidates: [],
      resolution: 'unique',
      lotMap: null,
    };
  }
  const candidates = typeahead.map((r) => ({ parcelId: r.parcel_id, address: r.address }));
  // The typeahead LIMIT 10 has no overflow probe: measured 0 (street, number) keys reach more than 10 linked lots (MF-53 plan v4 §8 item 8).
  if (typeahead.length > 1) return { match: null, candidates, ...classifyRows(typeahead, num, false) };

  // 3) MF-53 unlinked (consumer only): live points with this number and NO lot link. Skipped for a street carrying a LIKE wildcard, so the
  //    new read never widens on % or _ (security L-1); the typeahead and this read also escape them (likePrefix, SEARCHFIX.1 D1, done).
  if (opts.classifyUnlinked && num && !/[%_]/.test(streetName)) {
    const unlinked = await query<{ address_point_id: number; address: string; latitude: unknown; longitude: unknown }>(
      `SELECT ap.address_point_id, COALESCE(ap.address_full, TRIM(COALESCE(ap.address_number, '') || ' ' || COALESCE(ap.linear_name_full, ''))) AS address,
              ap.latitude, ap.longitude
       FROM address_points ap
       WHERE ap.linear_name_normalized LIKE $1
         AND ap.addr_num_normalized = $2
         AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
         AND UPPER(ap.maint_stage) = 'REGULAR'
         AND ap.retired_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM parcel_address_points pap WHERE pap.address_point_id = ap.address_point_id)
       ORDER BY address, ap.address_point_id LIMIT 11`,
      [likePrefix(streetName), num],
    );
    if (unlinked.length > 0) {
      const first = unlinked[0]!; // unlinked.length > 0 was tested on the line above, so unlinked[0] exists
      const one = new Set(unlinked.map((u) => u.address)).size === 1;
      const lat = first.latitude == null ? NaN : Number(first.latitude);
      const lng = first.longitude == null ? NaN : Number(first.longitude);
      const pin = one && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      return {
        match: null,
        candidates,
        resolution: 'unlinked',
        // One printed address: the pin and its neighbours (operator ruling 2026-09-16). Several: the honest message, no map (DECISIONS-v3 Q5 i).
        lotMap: { kind: 'unlinked', address: first.address, pin },
      };
    }
  }
  // 4) task-333 SRCH.FUZZY (RR-0277, "the same approach ... the exact same function"): a mis-typed street, on the miss only (exact, typeahead and
  //    unlinked above returned nothing, so the hot path is unchanged). The matcher is the permit pipeline's own pair: normalize_address()
  //    (migration 170) and levenshtein() <= the logic variable enrich_heritage_address_levenshtein_threshold (Spec 61 L13;
  //    scripts/lib/compute/enrich-heritage.js:121, :174). The house number stays exact (idx_parcels_address leads with it); a missing
  //    variable gives NULL and no rows (no literal fallback). `$2` is the parsed street token (the consumer q is capped at 120, types.ts:42).
  if (opts.matchMistyped && num) {
    const near = await query<{ parcel_id: string; address: string }>(
      `SELECT parcel_id, ${displayAddress} AS address
       FROM parcels
       WHERE addr_num_normalized = $1
         AND levenshtein(normalize_address(street_name_normalized), normalize_address($2))
             <= (SELECT variable_value FROM logic_variables WHERE variable_key = 'enrich_heritage_address_levenshtein_threshold')
       ORDER BY levenshtein(normalize_address(street_name_normalized), normalize_address($2)), address, parcel_id LIMIT 10`,
      [num, streetName],
    );
    if (near.length > 0) {
      return { match: null, candidates: near.map((r) => ({ parcelId: r.parcel_id, address: r.address })), resolution: 'text_candidates', lotMap: null };
    }
  }
  // 5) SEARCHFIX.1 (A1, AC #4; RR-0443 c "select from the available addresses that are close"): a letter suffix with no lot ("2760A") or a dash
  //    form ("2760-4", "4-2760": no unit word, so which side is the unit is unknown) reads the exact statement for each bare number (at most 2
  //    reads) and lists what it finds; it never opens. On the full miss only, so every hit above is unchanged; not on the raw-first run.
  const bare = keepPeriods ? null : (/^(\d+)[A-Z]$/.exec(num) ?? /^(\d+)-(\d+)[A-Z]?$/.exec(num));
  if (bare) {
    const nums = [...new Set(bare.slice(1).filter((n): n is string => Boolean(n)).map((n) => normalizeAddressNumber(n)))];
    const seen = new Set<string>();
    const rows: { parcel_id: string; address: string }[] = [];
    for (const n of nums) for (const r of await readExact(n, streetName)) if (!seen.has(r.parcel_id)) { seen.add(r.parcel_id); rows.push(r); }
    if (rows.length > 0) return conflictList(rows.slice(0, 10));
  }
  return { match: null, candidates, resolution: 'no_match', lotMap: null };
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
