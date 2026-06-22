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
const STOREY_HEIGHT_M = 3.0;
// Fixed TRCA top-of-bank setback (m) — Toronto Ch.658 stable-slope default. NOT scaled by
// ravine_distance_m (Spec 59 L2: distance is signed proximity, not a gradient multiplier).
const RAVINE_SETBACK_M = 10.0;
// Garden-suite (rear-yard) eligibility floor: min lot area + min usable rear yard (m / m²).
const GARDEN_SUITE_MIN_LOT_SQM = 270; // Toronto garden-suite by-law practical floor
const GARDEN_SUITE_MIN_REAR_YARD_M = 5.0;
const GARDEN_SUITE_MAX_GFA_SQM = 60.0; // typical by-law cap for a one-storey rear suite

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
  'max_build_basis',              // TEXT rect_approx/heritage_existing
  'max_buildable_gfa_sqm',        // NUMERIC
  'max_buildable_gfa_basis',      // TEXT fsi/coverage_box/heritage_existing
  'max_build_confidence',         // TEXT high/medium/low — output-number trust
  'max_garden_suite_gfa_sqm',     // NUMERIC
  'garden_suite_fits',            // BOOLEAN NOT NULL DEFAULT false
  'envelope_constrained',         // BOOLEAN NOT NULL DEFAULT false
  'envelope_constraint_reason',   // TEXT
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
];

module.exports = {
  LOT_TOLERANCE, LOT_MIN_SQM, LOT_MAX_SQM, STOREY_HEIGHT_M, RAVINE_SETBACK_M,
  GARDEN_SUITE_MIN_LOT_SQM, GARDEN_SUITE_MIN_REAR_YARD_M, GARDEN_SUITE_MAX_GFA_SQM,
  SETBACK_DEFAULTS, SETBACK_DIMS, lookupSetback, buildSetbackCase,
  MAX_BUILD_COLS, MAX_BUILD_BOOL_COLS,
  LOT_MAXBUILD_INPUT_COLS, LOT_MAXBUILD_OUTPUT_COLS, LOT_MAXBUILD_COLS,
  EXISTING_COLS, EXISTING_CONFIDENCE_HIGH_MIN,
};
