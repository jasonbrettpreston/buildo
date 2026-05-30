'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
 *
 * Pure compute for the CKAN Address Points CSV column-drift detector
 * that scripts/load-address-points.js wires into its audit_table.
 *
 * Analogous to scripts/lib/parcels-csv-drift.js — same pattern,
 * different table. Same motivation: defense-in-depth against the
 * 2026-05-20 Toronto Open Data strip pattern that originally hit
 * the Property Boundaries CSV. If Toronto silently removes one of
 * the 10 required Address Points columns, the loader's
 * `(record.X || '').trim()` fallback would null-fill ~525K rows
 * without surfacing a signal. assert-schema.js is the FAIL gate;
 * these helpers surface the loss in the loader's audit_table as
 * WARN so operators get a visible cascade.
 *
 * WHY a separate module: keeps the compute pure (no I/O, no
 * `pipeline` SDK coupling) so it can be unit-tested without
 * spinning up a CSV stream or a DB connection.
 */

// Non-coordinate data-bearing columns whose silent absence loses information
// (ADDRESS_POINT_ID is the PK ON CONFLICT key; the other 10 are mig-162 fields).
// Coordinates are NOT in this flat list — they have an OR-contract (see
// hasCoordinateSource): the loader derives geom + lat/lng from the `geometry`
// GeoJSON column (primary, load-address-points.js:285-301) OR falls back to
// LATITUDE+LONGITUDE (line 304). [WF3 2026-05-30: the old flat LATITUDE/LONGITUDE
// requirement never matched the live CSV — which ships `geometry`, not lat/lng.]
const REQUIRED_CSV_COLUMNS = Object.freeze([
  'ADDRESS_POINT_ID',
  'ADDRESS_NUMBER',
  'LINEAR_NAME_FULL',
  'ADDRESS_FULL',
  'LO_NUM',
  'HI_NUM',
  'MAINT_STAGE',
  'ADDRESS_STATUS',
  'ADDRESS_CLASS_DESC',
  'CLASS_FAMILY_DESC',
  'PLACE_NAME',
]);

// Sentinel surfaced in the drift WARN row when NO coordinate source is present.
const COORDINATE_SOURCE_SENTINEL = '<coordinate-source: geometry OR LATITUDE+LONGITUDE>';

/**
 * Coordinate-source contract: a usable coordinate source is EITHER the GeoJSON
 * `geometry` column (loader primary path) OR both LATITUDE + LONGITUDE (fallback).
 * Drift fires only when NEITHER is present — the real "link-parcel-addresses
 * produces 0 rows" loss mode. Toronto's live CSV ships `geometry`; both formats
 * are accepted for format-volatility robustness.
 * NOTE: presence-only check. All-empty-per-row geometry is caught by the loader's
 * `skip_rate ≥ 5% → FAIL` audit row (a dedicated geom_parse_failures row is tracked
 * in review_followups #253, out of scope here).
 */
function hasCoordinateSource(fieldSet) {
  return fieldSet.has('geometry') || (fieldSet.has('LATITUDE') && fieldSet.has('LONGITUDE'));
}

function detectMissingColumns(recordKeys) {
  const present = new Set(recordKeys);
  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !present.has(c));
  if (!hasCoordinateSource(present)) missing.push(COORDINATE_SOURCE_SENTINEL);
  return missing;
}

function buildDriftAuditRow(missingColumns) {
  const missing = missingColumns.length;
  return {
    metric: 'address_points_csv_schema_drift',
    value: missing === 0 ? 'none' : missingColumns.join(','),
    threshold: 'no missing required columns',
    // WARN not FAIL — drift loses data but does not corrupt the table.
    // assert-schema.js is the FAIL gate; the loader surfaces the loss
    // without breaking the chain.
    status: missing === 0 ? 'PASS' : 'WARN',
  };
}

function buildNullAddressNumberAuditRow(nullCount, attemptedCount) {
  if (attemptedCount === 0) {
    return {
      metric: 'address_points_null_address_number_pct',
      value: '0.0%',
      threshold: '< 10%',
      status: 'INFO',
    };
  }
  const fraction = nullCount / attemptedCount;
  return {
    metric: 'address_points_null_address_number_pct',
    value: `${(fraction * 100).toFixed(1)}%`,
    threshold: '< 10%',
    status: fraction >= 0.10 ? 'WARN' : 'PASS',
  };
}

module.exports = {
  REQUIRED_CSV_COLUMNS,
  COORDINATE_SOURCE_SENTINEL,
  hasCoordinateSource,
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressNumberAuditRow,
};
