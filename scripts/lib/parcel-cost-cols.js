'use strict';
/**
 * parcel-cost-cols.js — the propagation column contract for the parcel cost model (Spec 88 §2.10).
 * A neutral LEAF module (no deps) so BOTH compute-parcel-cost-estimates.js (the writer) and
 * enrich-permits.js (the §4D dominant-parcel propagator) import the SAME column lists without a cycle.
 *
 * COST_PROP_COLS = the 15 FLAT scalars propagated from the dominant parcel onto permits +
 * coa_applications (the §4D mechanism — like OPT_COMP_PROP_COLS). The `parcel_cost_menu` JSONB is
 * NOT propagated — it stays parcel-scoped (joinable via zoning_dominant_parcel_id), exactly like
 * optimal_config/nearby_builds_summary. All 15 are NULLABLE numerics → they ride the generic
 * `= NULL` orphan-nullify path (no NOT-NULL `= false` resets here).
 *
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.5 / §2.10
 */

// 12 headline cost scalars (§2.5). 'total' lines emit the full premium-inclusive total; 'per_sqm'
// lines (kitchen/bath/basement/basement-underpin — small/uncertain area) emit the area-independent $/m².
const COST_SCALAR_COLS = [
  'cost_fb_total',
  'cost_coa_total',
  'cost_solar_total',
  'cost_garden_suite_total',
  'cost_laneway_suite_total',
  'cost_garage_total',
  'cost_gut_total',
  'cost_addition_total',
  'cost_kitchen_per_sqm',
  'cost_bath_per_sqm',
  'cost_basement_per_sqm',
  'cost_basement_underpin_per_sqm',
];

// 3 FSI scalars (§2.5): max_build_fsi (= max_buildable_gfa_sqm ÷ lot), coa_fsi (= opt_coa_gfa_sqm ÷ lot,
// = realized_fsi_p90 post-R2), realized_fsi_p90 (the density basis — NULL in P1, populated in P2).
const FSI_SCALAR_COLS = ['max_build_fsi', 'coa_fsi', 'realized_fsi_p90'];

// The parcel-scoped JSONB that is NOT propagated.
const COST_JSONB_COLS = ['parcel_cost_menu'];

const COST_PROP_COLS = [...COST_SCALAR_COLS, ...FSI_SCALAR_COLS];

module.exports = { COST_SCALAR_COLS, FSI_SCALAR_COLS, COST_JSONB_COLS, COST_PROP_COLS };
