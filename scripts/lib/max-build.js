'use strict';
/**
 * Max-build envelope — pure config + SQL-fragment builders (Spec 65 max-build extension).
 *
 * Single source of truth for: the lot-validation + max-build constants, the zone-default
 * setback table (front/side/rear/flankage), the parcels output column list (MAX_BUILD_COLS)
 * and the permits/coa propagation column list (LOT_MAXBUILD_COLS). The heavy geometry +
 * tier/confidence logic lives in the SQL that enrich-parcels.js generates from these helpers
 * (set-based; PostGIS ST_Buffer is SQL-only) — this module is the testable, drift-free seam:
 * the setback CASE is GENERATED from SETBACK_DEFAULTS (so the table is the only place the
 * numbers live), and the column arrays are asserted disjoint from the zoning ALL_WRITE_COLS.
 *
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§ Max-build envelope)
 */

// --- Model constants (inline, documented — model values like the cost-model 45/35) ---
// Lot-size 3-way cross-check tolerance: two area measures "agree" within 15%.
const LOT_TOLERANCE = 0.15;
// Sane residential lot band (m²). Outside → lot_size_confidence='low' (data-quality signal).
const LOT_MIN_SQM = 50;
const LOT_MAX_SQM = 2000;
// Fallback storey height (m) when only bylaw_max_height_m is known (no bylaw_max_stories).
// RESIDENTIAL_STOREY_HEIGHT_M is the default + externalized (logic_var `storey_height_m`);
// non-residential zones are taller (NONRES_STOREY_HEIGHT_M, inline). STOREY_HEIGHT_M kept as the
// residential default alias for back-compat with any inline reference.
const STOREY_HEIGHT_M = 3.0;
const RESIDENTIAL_STOREY_HEIGHT_M = 3.0;
const NONRES_STOREY_HEIGHT_M = 4.0; // commercial/employment/institutional ≈ 4–4.5 m floors

// WF3-A mislink guard: existing_footprint > lot × (1 + tol) → the linked building is the WRONG one
// (block/neighbour attribution — RT 56.5%, R 23.8% in dev). Whole existing structure is NULLed +
// existing_data_quality_flag='footprint_exceeds_lot'. Externalized (logic-var mislink_footprint_lot_tol).
const MISLINK_FOOTPRINT_LOT_TOL_DEFAULT = 0.05;
const MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT = 'footprint_exceeds_lot';

/**
 * SQL CASE returning the storey-height (m) for `zoneCol`: non-residential (C/E/I prefixes) → taller;
 * everything else → `residentialHeight` (the externalized residential default). Mirrors the
 * setback-table pattern so height→storey translation is use-class-aware, not a single 3.0.
 */
function buildStoreyHeightCase(zoneCol, residentialHeight = RESIDENTIAL_STOREY_HEIGHT_M) {
  return `CASE WHEN upper(${zoneCol}) LIKE 'C%' OR upper(${zoneCol}) LIKE 'E%' OR upper(${zoneCol}) LIKE 'I%' OR upper(${zoneCol}) LIKE 'UT%'\n         THEN ${NONRES_STOREY_HEIGHT_M.toFixed(2)} ELSE ${Number(residentialHeight).toFixed(2)} END`;
}
/** Pure JS mirror of the storey-height lookup. */
function lookupStoreyHeight(zoningClass, residentialHeight = RESIDENTIAL_STOREY_HEIGHT_M) {
  const zc = (zoningClass || '').toUpperCase();
  return (zc.startsWith('C') || zc.startsWith('E') || zc.startsWith('I') || zc.startsWith('UT'))
    ? NONRES_STOREY_HEIGHT_M : residentialHeight;
}

// WF3-A current-building GFA range (Spec 65 §6). The contaminated existing_stories is retired, so
// we present a MENU of priceable scope options off the TRUSTWORTHY footprint rather than one wrong
// GFA: cur_floor (known single floor) + cur_pot_2story + cur_pot_3story, with the 3-storey option
// gated on what the pocket actually builds (max_build_stories — the upper end of the build envelope).
// range_basis flags the menu span. Footprint or max_build_stories unknown → all NULL (honest).
// Pure fn; the SQL CASE in buildExistingStructureSql mirrors this exactly.
function computeCurGfaRange(footprintSqm, maxBuildStories) {
  const fp = footprintSqm == null ? null : Number(footprintSqm);
  const mbs = maxBuildStories == null ? null : Number(maxBuildStories);
  if (fp == null || !Number.isFinite(fp) || mbs == null || !Number.isFinite(mbs)) {
    return { cur_floor_gfa_sqm: null, cur_pot_2story_gfa_sqm: null, cur_pot_3story_gfa_sqm: null, cur_gfa_range_basis: null };
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  const supports3 = mbs >= 3;
  return {
    cur_floor_gfa_sqm: round2(fp),
    cur_pot_2story_gfa_sqm: round2(fp * 2),
    cur_pot_3story_gfa_sqm: supports3 ? round2(fp * 3) : null,
    cur_gfa_range_basis: supports3 ? '1-3' : '1-2',
  };
}
// Fixed TRCA top-of-bank setback (m) — Toronto Ch.658 stable-slope default. NOT scaled by
// ravine_distance_m (Spec 59 L2: distance is signed proximity, not a gradient multiplier).
const RAVINE_SETBACK_M = 10.0;
// Garden-suite (rear-yard) eligibility floor: min lot area + min usable rear yard (m / m²).
// These three are the DEFAULTS for the externalized logic_variables of the same name (Phase 3,
// Spec 65 §7) — buildMaxBuildSql takes them as params (like storeyHeight); kept here as the
// JS fallback. A two-source-sync test asserts logic_variables.json defaults === these.
const GARDEN_SUITE_MIN_LOT_SQM = 270; // Toronto garden-suite by-law practical floor
const GARDEN_SUITE_MIN_REAR_YARD_M = 5.0;
const GARDEN_SUITE_MAX_GFA_SQM = 60.0; // typical by-law cap for a one-storey rear suite

// --- Accessory-structure by-law constants (Spec 65 Phase 3) — all externalized as logic_variables;
// these are the JS-fallback defaults. Garage = footprint area fit (single-storey); laneway/garden
// suite = lot + rear-yard-depth fit; *_permission tri-state gated on soft-landscaping (greenspace). ---
const GARAGE_MIN_LOT_SQM = 230;           // min lot to consider an accessory garage
const GARAGE_MAX_GFA_SQM = 60;            // by-law cap on a detached garage footprint
const GARAGE_MIN_FOOTPRINT_SQM = 18;      // a garage smaller than this doesn't fit one car
const ACCESSORY_MAX_COVERAGE_PCT = 0.30;  // max share of usable rear-yard a garage may cover
const CAR_FOOTPRINT_SQM = 18.5;           // ≈ one parking stall incl. clearance → garage_capacity_cars
const LANEWAY_SUITE_MAX_GFA_SQM = 120;    // larger (2-storey) than a garden suite
const LANEWAY_SUITE_MIN_LOT_SQM = 230;
const LANEWAY_SUITE_MIN_REAR_YARD_M = 5.0;
const MIN_SOFT_LANDSCAPING_PCT = 0.30;    // share of lot that must remain soft landscaping (as-of-right floor)
const LANEWAY_SUITE_STOREYS = 2;          // footprint = GFA / storeys (greenspace uses ground coverage)
const GARDEN_SUITE_STOREYS = 1;

// --- Zone-default setbacks (metres) — COARSE fallback only (Integration WRONG#3 + Gemini) ---
// bylaw_standard_setback_m (the real STAND_SET value) is used as the FRONT setback when present;
// side/rear/flankage have NO source field, so they ALWAYS come from this table. Keyed by the
// zoning_class prefix (longest match wins). Approximations from By-law 569-2013 typical yards —
// documented coarse; max_build_setback_basis records 'bylaw' vs 'zone_default' for visibility.
const SETBACK_DEFAULTS = {
  RD: { front: 6.0, side: 0.9, rear: 7.5, flankage: 4.5 }, // detached
  RS: { front: 6.0, side: 0.9, rear: 7.5, flankage: 4.5 }, // semi-detached
  RT: { front: 6.0, side: 0.9, rear: 7.5, flankage: 4.5 }, // townhouse
  RM: { front: 6.0, side: 1.5, rear: 7.5, flankage: 4.5 }, // multiple dwelling
  R:  { front: 6.0, side: 0.9, rear: 7.5, flankage: 4.5 }, // residential (generic)
  CR: { front: 3.0, side: 0.0, rear: 7.5, flankage: 3.0 }, // commercial-residential
  CL: { front: 3.0, side: 0.0, rear: 7.5, flankage: 3.0 }, // commercial-local
  C:  { front: 3.0, side: 0.0, rear: 7.5, flankage: 3.0 }, // commercial
  E:  { front: 6.0, side: 1.5, rear: 7.5, flankage: 6.0 }, // employment
  I:  { front: 6.0, side: 1.5, rear: 7.5, flankage: 6.0 }, // institutional
  O:  { front: 3.0, side: 1.5, rear: 3.0, flankage: 3.0 }, // open space (rare build)
  UT: { front: 3.0, side: 1.5, rear: 3.0, flankage: 3.0 }, // utility
  DEFAULT: { front: 6.0, side: 1.2, rear: 7.5, flankage: 4.5 },
};
const SETBACK_DIMS = ['front', 'side', 'rear', 'flankage'];

// Prefix keys ordered longest-first so 'RD' beats 'R'. Excludes DEFAULT (the ELSE).
const SETBACK_PREFIXES = Object.keys(SETBACK_DEFAULTS)
  .filter((k) => k !== 'DEFAULT')
  .sort((a, b) => b.length - a.length);

/** Pure JS mirror of the setback lookup (used to GENERATE the SQL CASE — same source). */
function lookupSetback(zoningClass, dim) {
  if (!SETBACK_DIMS.includes(dim)) throw new Error(`[max-build] unknown setback dim ${dim}`);
  const zc = (zoningClass || '').toUpperCase();
  for (const p of SETBACK_PREFIXES) {
    if (zc.startsWith(p)) return SETBACK_DEFAULTS[p][dim];
  }
  return SETBACK_DEFAULTS.DEFAULT[dim];
}

/**
 * SQL CASE expression returning the zone-default setback for `dim`, keyed on `zoneCol`.
 * Generated from SETBACK_DEFAULTS so the numbers live in exactly one place.
 */
function buildSetbackCase(zoneCol, dim) {
  if (!SETBACK_DIMS.includes(dim)) throw new Error(`[max-build] unknown setback dim ${dim}`);
  const whens = SETBACK_PREFIXES
    .map((p) => `    WHEN upper(${zoneCol}) LIKE '${p}%' THEN ${SETBACK_DEFAULTS[p][dim].toFixed(2)}`)
    .join('\n');
  return `CASE\n${whens}\n    ELSE ${SETBACK_DEFAULTS.DEFAULT[dim].toFixed(2)}\n  END`;
}

// --- Output columns written onto parcels by the second UPDATE pass (16) ---
// MUST stay disjoint from enrich-parcels ALL_WRITE_COLS (Guardian#1 — separate UPDATE pass).
const MAX_BUILD_COLS = [
  'lot_size_confidence',          // TEXT high/medium/low — input-area-agreement trust
  'lot_size_basis',               // TEXT 3way/pair/single/oob
  'max_build_setback_basis',      // TEXT bylaw/zone_default
  'max_buildable_footprint_sqm',  // NUMERIC — LEAST(buffer, box, coverage cap)
  'max_build_width_m',            // NUMERIC — rect approx
  'max_build_length_m',           // NUMERIC — rect approx
  'max_build_height_m',           // NUMERIC — bylaw_max_height_m
  'max_build_stories',            // INTEGER
  'max_build_stories_basis',      // TEXT bylaw/derived (Phase 2 — storey-height refinement)
  'max_build_basis',              // TEXT rect_approx/heritage_existing
  'max_buildable_gfa_sqm',        // NUMERIC
  'max_buildable_gfa_basis',      // TEXT fsi/coverage_box/heritage_existing
  'max_build_confidence',         // TEXT high/medium/low — output-number trust
  'max_garden_suite_gfa_sqm',     // NUMERIC
  'garden_suite_fits',            // BOOLEAN NOT NULL DEFAULT false
  'envelope_constrained',         // BOOLEAN NOT NULL DEFAULT false
  'envelope_constraint_reason',   // TEXT
  // --- Accessory fit (Spec 65 Phase 3) — all nullable; computed in the same max-build pass ---
  'max_garage_gfa_sqm',           // NUMERIC — by-law-capped garage footprint that fits the rear yard
  'garage_capacity_cars',         // INTEGER — floor(max_garage_gfa / car_footprint)
  'garage_constraint_reason',     // TEXT — heritage/ravine/lot_too_small/no_rear_yard/low_lot_confidence
  'garage_permission',            // TEXT — as_of_right/coa_required/not_permitted (greenspace-driven)
  'max_laneway_suite_gfa_sqm',    // NUMERIC — lane-gated 2-storey suite GFA
  'max_rear_suite_gfa_sqm',       // NUMERIC — the chosen suite GFA (laneway⊕garden); archetype LANE geom_basis
  'rear_suite_type',              // TEXT — 'laneway'|'garden'|NULL (mutually exclusive by abuts_laneway)
  'rear_suite_permission',        // TEXT — as_of_right/coa_required/not_permitted (greenspace-driven)
];
// NOT-NULL booleans — reset to false (not NULL) on orphan-nullify (PG 23502 guard).
const MAX_BUILD_BOOL_COLS = ['garden_suite_fits', 'envelope_constrained'];

// --- Propagation set (permits + coa_applications) ---
// Lot-validation INPUTS (currently parcels-only) the operator eyeballs per-application.
// lot_size_sqm is already read in enrich-permits `cand` for area_share — frontage_m/depth_m
// are added. is_through_lot is ALREADY propagated via CENTRELINE_COLS (mig 176) — not here.
const LOT_MAXBUILD_INPUT_COLS = ['lot_size_sqm', 'frontage_m', 'depth_m', 'lot_size_confidence', 'lot_size_basis'];
// OUTPUTS propagated from the dominant parcel (assembly has no coherent envelope).
const LOT_MAXBUILD_OUTPUT_COLS = MAX_BUILD_COLS.filter((c) => c !== 'lot_size_confidence' && c !== 'lot_size_basis');
const LOT_MAXBUILD_COLS = [...LOT_MAXBUILD_INPUT_COLS, ...LOT_MAXBUILD_OUTPUT_COLS];

// --- Existing-structure columns (Spec 65 Phase 1) — written by a SEPARATE third pass in
// enrich-parcels (buildExistingStructureSql), disjoint from MAX_BUILD_COLS + ALL_WRITE_COLS.
// Derived from the PRIMARY linked building (massing) + lot. Propagated to permits/coa. ---
// pb.confidence >= this → existing_structure_confidence 'high', else 'low' (NULL → low).
// link-massing writes 0.95 (centroid-in-parcel) / 0.60 (nearest); 0.90 cleanly splits them.
const EXISTING_CONFIDENCE_HIGH_MIN = 0.90;
const EXISTING_COLS = [
  'existing_footprint_sqm',         // primary footprint (ROUND 2)
  'existing_stories',               // primary estimated_stories (height-derived ≈ h/3)
  'existing_height_m',              // primary max_height_m
  'existing_gfa_sqm',               // footprint × GREATEST(1, stories) (ROUND 2)
  'existing_width_m',               // shorter side of ST_OrientedEnvelope, metres (ROUND 2)
  'existing_length_m',              // longer side, metres (ROUND 2)
  'existing_structure_confidence',  // TEXT high/low from pb.confidence
  'existing_other_structures_count',// # non-primary buildings
  'existing_other_structures_sqm',  // Σ non-primary footprint (ROUND 2)
  'existing_greenspace_sqm',        // lot − primary − other (ROUND 2; non-overlap assumption)
  'existing_data_quality_flag',     // WF3-A: 'footprint_exceeds_lot' mislink sentinel, else NULL
];
// WF3-A (Spec 65 §5): existing_stories + existing_height_m are RETIRED — kept in EXISTING_COLS so the
// array-driven UPDATE NULLs their (tree-contaminated) values on re-enrich; raw height → records_meta.

// --- Reno/build scenario GFA columns (Spec 65 Phase 2) — pure arithmetic off existing_* + max-build,
// written by a sibling UPDATE in the existing-structure pass; propagated to permits/coa. ---
const SCENARIO_COLS = [
  'max_newbuild_coa_gfa_sqm',   // FB+COA = max_buildable_gfa × (1 + reno_coa_uplift_pct)
  'cur_basement_gfa_sqm',       // DEPRECATED (WF3-A) → folds into cur_floor_gfa_sqm; NULL-cleared, kept in-array so the SET writes NULL
  'cur_storey_gfa_sqm',         // DEPRECATED (WF3-A) → depended on retired existing_stories; NULL-cleared
  'cur_interior_reno_gfa_sqm',  // DEPRECATED (WF3-A) → was existing_gfa; NULL-cleared
  'cur_est_kitchen_gfa_sqm',    // KIT = existing_footprint × reno_kitchen_gfa_pct
  'cur_est_bath_gfa_sqm',       // BTH = existing_footprint × reno_bath_gfa_pct
  // WF3-A current-building GFA range (menu of priceable scope options off the known footprint):
  'cur_floor_gfa_sqm',          // known single floor (= existing_footprint) — basement/single-storey/minimum
  'cur_pot_2story_gfa_sqm',     // footprint × 2 (always emitted when footprint known)
  'cur_pot_3story_gfa_sqm',     // footprint × 3; NULL unless pocket supports 3 (max_build_stories >= 3)
  'cur_gfa_range_basis',        // '1-2' | '1-3' | NULL — range/menu-span flag
];
// Externalized reno heuristics — defaults (also seeded in logic_variables.json + control-panel.ts).
const RENO_COA_UPLIFT_PCT_DEFAULT = 0.05;
const RENO_KITCHEN_GFA_PCT_DEFAULT = 0.15;
const RENO_BATH_GFA_PCT_DEFAULT = 0.07;

module.exports = {
  LOT_TOLERANCE, LOT_MIN_SQM, LOT_MAX_SQM, STOREY_HEIGHT_M, RAVINE_SETBACK_M,
  GARDEN_SUITE_MIN_LOT_SQM, GARDEN_SUITE_MIN_REAR_YARD_M, GARDEN_SUITE_MAX_GFA_SQM,
  SETBACK_DEFAULTS, SETBACK_DIMS, lookupSetback, buildSetbackCase,
  MAX_BUILD_COLS, MAX_BUILD_BOOL_COLS,
  LOT_MAXBUILD_INPUT_COLS, LOT_MAXBUILD_OUTPUT_COLS, LOT_MAXBUILD_COLS,
  EXISTING_COLS, EXISTING_CONFIDENCE_HIGH_MIN,
  MISLINK_FOOTPRINT_LOT_TOL_DEFAULT, MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT, computeCurGfaRange,
  SCENARIO_COLS, RENO_COA_UPLIFT_PCT_DEFAULT, RENO_KITCHEN_GFA_PCT_DEFAULT, RENO_BATH_GFA_PCT_DEFAULT,
  RESIDENTIAL_STOREY_HEIGHT_M, NONRES_STOREY_HEIGHT_M, buildStoreyHeightCase, lookupStoreyHeight,
  // Accessory fit (Phase 3)
  GARAGE_MIN_LOT_SQM, GARAGE_MAX_GFA_SQM, GARAGE_MIN_FOOTPRINT_SQM, ACCESSORY_MAX_COVERAGE_PCT,
  CAR_FOOTPRINT_SQM, LANEWAY_SUITE_MAX_GFA_SQM, LANEWAY_SUITE_MIN_LOT_SQM, LANEWAY_SUITE_MIN_REAR_YARD_M,
  MIN_SOFT_LANDSCAPING_PCT, LANEWAY_SUITE_STOREYS, GARDEN_SUITE_STOREYS,
};
