'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
 *
 * Pure compute for the CKAN Parcels CSV column-drift detector that
 * scripts/load-parcels.js wires into its audit_table.
 *
 * Spec 79 SUMMARY CRIT-3b: when CKAN drops a required column from the
 * Parcels CSV, the loader's `(record.X || '').trim()` fallback silently
 * inserts empty strings → NULL into ~600 K rows. assert-schema.js (the
 * gate) correctly fails, but the loader (the consumer) sees nothing.
 * These helpers let the loader surface the loss in pipeline_runs.audit_table
 * so operators get a visible WARN cascade instead of a silent PASS.
 *
 * WHY a separate module: keeps the compute pure (no I/O, no `pipeline`
 * SDK coupling) so it can be unit-tested without spinning up a CSV
 * stream or a DB connection. load-parcels.js imports these and inlines
 * them between the stream loop and emitFinal().
 */

// Columns the loader actually reads and propagates into the parcels
// table. DATE_EXPIRY is consumed too but only as a row-skip filter;
// dropping it would not cause silent data loss the way the others do,
// so it is intentionally out of the required set.
const REQUIRED_CSV_COLUMNS = Object.freeze([
  'PARCELID',
  'FEATURE_TYPE',
  'ADDRESS_NUMBER',
  'LINEAR_NAME_FULL',
  'STATEDAREA',
  'geometry',
  'DATE_EFFECTIVE',
]);

function detectMissingColumns(recordKeys) {
  const present = new Set(recordKeys);
  return REQUIRED_CSV_COLUMNS.filter((c) => !present.has(c));
}

function buildDriftAuditRow(missingColumns) {
  const missing = missingColumns.length;
  return {
    metric: 'parcels_csv_schema_drift',
    value: missing === 0 ? 'none' : missingColumns.join(','),
    threshold: 'no missing required columns',
    // WARN not FAIL — drift loses address data but does not corrupt
    // parcels (geometry, lot size, neighbourhood join all still work).
    // assert-schema.js is the FAIL gate; load-parcels.js surfaces the
    // loss without breaking the chain.
    status: missing === 0 ? 'PASS' : 'WARN',
  };
}

function buildNullAddressAuditRow(nullCount, attemptedCount) {
  if (attemptedCount === 0) {
    return {
      metric: 'parcels_null_address_pct',
      value: '0.0%',
      threshold: '< 10%',
      status: 'INFO',
    };
  }
  const fraction = nullCount / attemptedCount;
  return {
    metric: 'parcels_null_address_pct',
    value: `${(fraction * 100).toFixed(1)}%`,
    threshold: '< 10%',
    status: fraction >= 0.10 ? 'WARN' : 'PASS',
  };
}

module.exports = {
  REQUIRED_CSV_COLUMNS,
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressAuditRow,
};
