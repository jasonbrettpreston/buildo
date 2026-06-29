'use strict';
/**
 * optimal-config-cols.js — the propagation column contract for the optimal-config + comparable-builds
 * headline scalars (Spec 78 §4D). A neutral LEAF module (no deps) so enrich-permits.js can require it
 * without a cycle (enrich-parcels → max-build; this avoids putting opt/comp cols in max-build.js — wrong
 * domain — or in enrich-parcels.js — which would cycle).
 *
 * OPT_COMP_PROP_COLS = the 13 FLAT scalars propagated from the dominant parcel onto permits +
 * coa_applications. It is the enrich-parcels write-cols (OPTCFG_WRITE_COLS ∪ COMP_WRITE_COLS) MINUS the
 * 3 JSONB blobs (optimal_config, nearby_builds_summary, comparable_builds — parcel-scoped by design).
 * A regression test pins this against the enrich-parcels arrays so drift is caught.
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §4D
 */

// The 3 parcel-scoped JSONB blobs that are NOT propagated (joinable via zoning_dominant_parcel_id).
const OPT_COMP_JSONB_COLS = ['optimal_config', 'nearby_builds_summary', 'comparable_builds'];

// 13 flat scalars: opt_* (9) + comp_* (4). opt_suite_fits_full is the only BOOLEAN and is NULLABLE on
// parcels + permits + coa — it rides the generic `= NULL` orphan-nullify path (NOT the `= false` reset
// used for the NOT-NULL max-build bools). Orphan lead (no dominant parcel) → all 13 reset to NULL.
const OPT_COMP_PROP_COLS = [
  'opt_aor_storeys',
  'opt_aor_gfa_sqm',
  'opt_aor_units',
  'opt_coa_storeys',
  'opt_coa_gfa_sqm',
  'opt_suite_type',
  'opt_suite_fits_full',
  'opt_binding_constraint',
  'opt_config_confidence',
  'comp_count',
  'comp_dominant_build',
  'comp_build_ratio_p50',
  'comp_fsi_p50',
];

module.exports = { OPT_COMP_PROP_COLS, OPT_COMP_JSONB_COLS };
