// 🔗 SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 step 2 (F-H3)
//
// Attribute schema-drift check for a layer's source field set (CKAN DataStore
// record keys per Spec 58 R-C1; originally shapefile .dbf — the comparison is
// format-agnostic).
//
// Why this exists (F-H3): an earlier draft aborted a layer on ANY attribute
// drift (including extra/unknown columns), which is too strict — Toronto adds
// columns between annual refreshes. The refined policy: abort a layer ONLY when
// a REQUIRED column is missing; unknown EXTRA columns emit a WARN audit row and
// the layer continues to load. Pure module so it's unit-testable without a DB
// or a real shapefile stream (load-zoning.js wires it in inline).

'use strict';

/**
 * Compare the field set present in a CKAN DataStore record (or shapefile .dbf)
 * against the layer's frozen REQUIRED_ATTR_COLUMNS. Comparison is case-insensitive
 * (CKAN field names are upper-case, e.g. ZN_ZONE); returned names are upper-cased.
 *
 * @param {string[]} presentFields  - field names present in the source record
 * @param {string[]} requiredFields - frozen required columns for the layer
 * @returns {{ missingRequired: string[], extraColumns: string[], ok: boolean }}
 *   `ok` is true iff no REQUIRED column is missing. Extra columns NEVER set
 *   `ok` to false (F-H3) — they are surfaced for a WARN audit row only.
 */
function checkAttrDrift(presentFields, requiredFields) {
  const present = new Set((presentFields || []).map((f) => String(f).toUpperCase()));
  const required = (requiredFields || []).map((f) => String(f).toUpperCase());
  const requiredSet = new Set(required);

  const missingRequired = required.filter((f) => !present.has(f));
  const extraColumns = [...present].filter((f) => !requiredSet.has(f));

  return { missingRequired, extraColumns, ok: missingRequired.length === 0 };
}

module.exports = { checkAttrDrift };
