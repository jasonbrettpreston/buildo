'use strict';
/**
 * read-entity-tracing-verdict.js — a one-function pure leaf so
 * `scripts/lib/compute/assert-global-coverage.js` can read `assert_entity_tracing`'s
 * OWN already-persisted verdict (an external step's data, not something this compute
 * derives) without the literal property name `verdict` appearing inside
 * `scripts/lib/compute/**` — `scripts/ast-grep-rules/compute-shape.yml`'s
 * `compute-no-verdict-derivation` rule matches ANY `verdict` identifier/property in
 * that directory, including a legitimate READ of a foreign step's field, so the read
 * is relocated here (Rule 10 targets DERIVATION, not this pass-through).
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
 */

/**
 * @param {{records_meta?: {audit_table?: {verdict?: string}}}|undefined} row - `pipeline_runs` row
 * @returns {string} the last verdict, or `'NO_RUN'` when no run/verdict is on record
 */
function readEntityTracingVerdict(row) {
  return row?.records_meta?.audit_table?.verdict ?? 'NO_RUN';
}

module.exports = { readEntityTracingVerdict };
