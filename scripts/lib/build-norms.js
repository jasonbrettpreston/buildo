'use strict';
/**
 * build-norms.js — pure constants + SQL for compute-build-norms.js (Spec 78 Phase 1).
 *
 * Single source for the neighbourhood build/reno norm definitions: the 5-year window, the min sample,
 * the over-capture clamp, the permit-kind classification, and the per-neighbourhood aggregation SQL.
 * Kept JS-only (no TS twin) — compute-build-norms.js is the only consumer. Logic-tested for the kind
 * classifier + the structural constants.
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-1
 */

// --- Structural constants (spec-driven; NOT operator-tunable → shared lib, not logic_variables) ---
const BUILD_NORM_WINDOW_YEARS = 5;        // rolling activity window
const OVER_CAPTURE_CLAMP = 1.1;           // realized/max-build ratios above this are massing over-capture → excluded

// --- Operator-tunable (DB logic_variables + _contracts.json; defaults here are the fallback) ---
const BUILD_NORM_MIN_SAMPLE_DEFAULT = 5;  // < this in a neighbourhood → low_sample → optimal-config uses citywide
const BUILD_RATIO_NULL_RATE_WARN = 0.5;   // audit WARN when >50% of neighbourhoods have no build_ratio

/**
 * Pure JS mirror of the SQL kind classifier — for the parity/logic test. Mirrors the CASE in
 * buildNormsSql exactly: new_build / addition / suite / kitchen / bath / demo / reno / other.
 */
function classifyKind({ project_type, structure_type, description }) {
  const st = (structure_type || '').toLowerCase();
  const d = (description || '').toLowerCase();
  if (/laneway|rear yard suite/.test(st)) return 'suite';
  if (project_type === 'demolition') return 'demo';
  if (project_type === 'new_build') return 'new_build';
  if (project_type === 'addition') return 'addition';
  if (/\bkitchen\b/.test(d)) return 'kitchen';
  if (/\bbath(room)?\b|washroom|ensuite/.test(d)) return 'bath';
  if (project_type === 'renovation') return 'reno';
  return 'other';
}

/** SQL CASE mirroring classifyKind(), keyed on alias `a`. The single source for the kind buckets
 *  used by both the JS mirror (parity test) and the inline aggregation SQL in compute-build-norms.js. */
function buildKindCaseSql(a) {
  return `CASE
    WHEN lower(coalesce(${a}.structure_type,'')) ~ 'laneway|rear yard suite' THEN 'suite'
    WHEN ${a}.project_type = 'demolition' THEN 'demo'
    WHEN ${a}.project_type = 'new_build' THEN 'new_build'
    WHEN ${a}.project_type = 'addition' THEN 'addition'
    WHEN lower(coalesce(${a}.description,'')) ~ '\\mkitchen\\M' THEN 'kitchen'
    WHEN lower(coalesce(${a}.description,'')) ~ '\\mbath(room)?\\M|washroom|ensuite' THEN 'bath'
    WHEN ${a}.project_type = 'renovation' THEN 'reno'
    ELSE 'other' END`;
}

module.exports = {
  BUILD_NORM_WINDOW_YEARS,
  OVER_CAPTURE_CLAMP,
  BUILD_NORM_MIN_SAMPLE_DEFAULT,
  BUILD_RATIO_NULL_RATE_WARN,
  classifyKind,
  buildKindCaseSql,
};
