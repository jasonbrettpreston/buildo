'use strict';
/**
 * Zoning precedence — pure config + SQL-fragment builders for enrich-parcels.js.
 * NO DB access. Spec 65 DEC-1 (per-attribute precedence) + DEC-3 (set-based SQL).
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2
 *
 * Unit-tested by src/tests/zoning-parcels.logic.test.ts. The script composes these
 * fragments into ONE set-based UPDATE — this module is never called per-parcel.
 */

// Ambiguity threshold — mirrors docs/specs/_contracts.json zoning.ambiguous_dominant_share_max.
// (contracts.infra.test.ts asserts this literal matches the JSON; see CONSUMER_RULES.)
const AMBIGUOUS_DOMINANT_SHARE_MAX = 0.6;

// Deterministic dominant-zone tie-break (resolves Gemini-E/D8). All three columns
// exist in the base-candidate CTE (intersect_area, zn_zone, source_id).
const DOMINANT_ORDER_BY = 'intersect_area DESC, zn_zone ASC, source_id ASC';

// Per-column precedence rule (DEC-1):
//   dominant    — value from the area-dominant base zone (the rn=1 / largest-area row)
//   min         — numeric ceiling: most-restrictive = MIN across intersecting base polygons
//   max         — numeric floor:  most-restrictive = MAX across intersecting base polygons
//   overlay_min — value from an overlay table (REPLACES base per D4); MIN if multiple overlap
//   membership  — boolean: parcel intersects / is within range of the overlay
const PRECEDENCE_RULES = {
  // identity / categorical ← dominant base zone
  zoning_class: 'dominant',
  zoning_zn_string: 'dominant',
  zoning_gen_zone: 'dominant',
  zoning_holding: 'dominant',
  zone_status: 'dominant',
  exception_number: 'dominant',
  exception_text: 'dominant',
  bylaw_chapter: 'dominant',
  bylaw_section: 'dominant',
  bylaw_exception_ref: 'dominant',
  // FSI ← dominant base zone (WF3 fix, Spec 65 DEC-1). Was 'min': MIN(fsi_max) skips NULLs
  // in Postgres, so a dominantly-RD parcel (RD fsi_max=NULL) that slivers a CR zone (fsi_max=2.0)
  // borrowed CR's FSI via MIN(NULL, 2.0)=2.0 — a data-quality defect (502/555 RD-FSI≥2 parcels).
  // 'dominant' sources FSI from the area-dominant zone only; NULL when that zone has none
  // (the dominant zone governs; zoning_is_ambiguous separately flags share < 0.6).
  bylaw_max_fsi: 'dominant',
  // numeric ceilings ← MIN (most-restrictive). NB: siblings stay 'min' — they feed no cost path;
  // MIN is defensible for genuine density splits (revisit → review_followups.md).
  bylaw_max_units: 'min',
  bylaw_max_density: 'min',
  bylaw_pct_commercial_max: 'min',
  bylaw_pct_residential_max: 'min',
  bylaw_pct_employment_max: 'min',
  bylaw_pct_office_max: 'min',
  // numeric floors ← MAX (most-restrictive)
  bylaw_min_frontage_m: 'max',
  bylaw_min_area_sqm: 'max',
  bylaw_standard_setback_m: 'max',
  // overlay-sourced numerics ← overlay replaces base (D4); MIN if multiple
  bylaw_max_coverage_pct: 'overlay_min',
  bylaw_max_height_m: 'overlay_min',
  bylaw_max_stories: 'overlay_min',
  // overlay memberships
  in_policy_area: 'membership',
  on_policy_road: 'membership',
  in_rooming_house_overlay: 'membership',
  in_parking_zone_overlay: 'membership',
  in_building_setback_overlay: 'membership',
  on_priority_retail: 'membership',
  in_queenstw_eat_overlay: 'membership',
};

// Computed/provenance columns the engine writes directly (NOT via PRECEDENCE_RULES).
const PROVENANCE_COLUMNS = [
  'zoning_overlays',
  'zoning_base_source_id',
  'zoning_dominant_area_share',
  'zoning_is_ambiguous',
  'zoning_base_source_dataset_version',
  'zoning_enriched_at',
];

/**
 * SQL aggregate expression for a parcel zoning column, given the source SQL expr.
 * Used inside a GROUP BY parcel_id aggregation over the base-candidate CTE.
 */
function sqlAggregate(col, src) {
  const rule = PRECEDENCE_RULES[col];
  if (!rule) throw new Error(`zoning-precedence: no precedence rule for column "${col}"`);
  switch (rule) {
    case 'min':
    case 'overlay_min':
      return `MIN(${src})`;
    case 'max':
      return `MAX(${src})`;
    case 'membership':
      return `bool_or(${src})`;
    case 'dominant':
      return `(array_agg(${src} ORDER BY ${DOMINANT_ORDER_BY}))[1]`;
    default:
      throw new Error(`zoning-precedence: unknown rule "${rule}" for column "${col}"`);
  }
}

module.exports = {
  AMBIGUOUS_DOMINANT_SHARE_MAX,
  DOMINANT_ORDER_BY,
  PRECEDENCE_RULES,
  PROVENANCE_COLUMNS,
  sqlAggregate,
};
