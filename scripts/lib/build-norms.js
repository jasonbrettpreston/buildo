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

// --- Plausibility backstops (defensive; pinned in _contracts.json `build_norms`). The structure_type
//     ALLOWLIST below is the primary filter; these catch residual artifacts a mislinked parcel can
//     still produce (e.g. a tower's residential_sqm ÷ a single tiny dominant parcel → FSI in the
//     thousands). High enough to never clip a legitimate low-rise residential build. ---
const FSI_PLAUSIBILITY_MAX = 10;          // realized FSI above this is a residential_sqm÷tiny-parcel artifact
const STOREYS_PLAUSIBILITY_MAX = 8;       // storeys above this is not low-rise residential (extract already clamps >15)

// --- Low-rise-residential ALLOWLIST (single source for both compute-build-norms.js + compute-storey-
//     norms.js). Derived from the StructureType enum (src/lib/classification/coa-scope-classifier.ts) +
//     the CKAN production vocab. KEEPS: SFD detached/semi/townhouse, stacked townhouses, 2/3-unit
//     detached/semi, duplex, converted house, laneway/rear-yard suite. EXCLUDES (named): apartment,
//     multiple-unit building, mixed-use, office/medical/retail/restaurant/industrial/school/university/
//     hospital/worship. NULL structure_type is RETAINED (unknown on a genuine new-build; contaminants
//     are all NAMED types; the plausibility caps backstop a NULL-that's-secretly-a-tower). Applied in
//     the SQL WHERE *before* DISTINCT ON / dedup so apartments never win a parcel's representative slot. ---
const LOW_RISE_RESIDENTIAL_RE = /sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)/i;

/** JS predicate mirror (NULL-retained) — for the logic/parity test. */
function isLowRiseResidential(structureType) {
  return structureType == null || LOW_RISE_RESIDENTIAL_RE.test(structureType);
}

/** SQL fragment mirroring isLowRiseResidential(), keyed on alias `a` (a table alias or bare table name). */
function lowRiseResidentialSql(a) {
  return `(${a}.structure_type IS NULL OR lower(${a}.structure_type) ~ 'sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)')`;
}

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

// --- Family mapping (Spec 78 P2). TWO vocabularies over the SAME family keys {detached, townhouse,
//     multiplex} so a parcel's family (from zoning) joins to a build-norm cohort's family (from the
//     permit's structure_type). RD/RS (detached + semi) group as 'detached' — semis share the detached
//     build pattern + the zoning setback family. 'all' is the family-agnostic citywide backstop. ---

/** Permit structure_type → build-norm cohort family, ALIGNED to the parcel zoning family it will be
 *  read against (RD/RS→detached). So detached-FORM buildings (incl. "N Unit - Detached/Semi") map to
 *  'detached'; townhouses → 'townhouse'; duplex/converted-house/multiple → 'multiplex'. Returns null for
 *  suites / unrecognized / NULL (→ the family-agnostic 'all' rollup only). Order: townhouse before
 *  detached (an "SFD - Townhouse" is a townhouse); detached before multiplex ("2 Unit - Detached" is a
 *  detached form, NOT a multiplex). */
function structureFamily(structureType) {
  const st = (structureType || '').toLowerCase();
  if (/townhouse/.test(st)) return 'townhouse';
  if (/sfd|detached|semi/.test(st)) return 'detached';
  if (/duplex|converted house|multiple/.test(st)) return 'multiplex';
  return null;
}

/** SQL CASE mirroring structureFamily(), keyed on alias `a`. NULL for the rollup-only rows. */
function structureFamilyCaseSql(a) {
  return `CASE
    WHEN lower(coalesce(${a}.structure_type,'')) ~ 'townhouse' THEN 'townhouse'
    WHEN lower(coalesce(${a}.structure_type,'')) ~ 'sfd|detached|semi' THEN 'detached'
    WHEN lower(coalesce(${a}.structure_type,'')) ~ 'duplex|converted house|multiple' THEN 'multiplex'
    ELSE NULL END`;
}

/** Parcel zoning_class → the family whose build-norm cohort it reads (Spec 78 P2). 569-2013 residential
 *  prefixes; generic-R / non-residential / NULL → the literal 'all' backstop (NEVER a SQL NULL — a
 *  `structure_family = NULL` join predicate is always false). */
function parcelFamilyFromZoning(zoningClass) {
  const zc = (zoningClass || '').toUpperCase();
  if (zc.startsWith('RD') || zc.startsWith('RS')) return 'detached';
  if (zc.startsWith('RT')) return 'townhouse';
  if (zc.startsWith('RM')) return 'multiplex';
  return 'all';
}

/** SQL CASE mirroring parcelFamilyFromZoning(), keyed on `zoneCol` (a column ref, e.g. `p.zoning_class`). */
function parcelFamilyFromZoningCaseSql(zoneCol) {
  return `CASE
    WHEN upper(coalesce(${zoneCol},'')) LIKE 'RD%' OR upper(coalesce(${zoneCol},'')) LIKE 'RS%' THEN 'detached'
    WHEN upper(coalesce(${zoneCol},'')) LIKE 'RT%' THEN 'townhouse'
    WHEN upper(coalesce(${zoneCol},'')) LIKE 'RM%' THEN 'multiplex'
    ELSE 'all' END`;
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
  FSI_PLAUSIBILITY_MAX,
  STOREYS_PLAUSIBILITY_MAX,
  LOW_RISE_RESIDENTIAL_RE,
  isLowRiseResidential,
  lowRiseResidentialSql,
  classifyKind,
  buildKindCaseSql,
  structureFamily,
  structureFamilyCaseSql,
  parcelFamilyFromZoning,
  parcelFamilyFromZoningCaseSql,
};
