'use strict';
/**
 * Safe numeric parsing utilities for pipeline scripts.
 *
 * Raw parseInt() and parseFloat() silently propagate NaN into DB writes — a source of
 * phantom-zero bugs that are invisible until a data audit. These wrappers throw immediately
 * with a descriptive message that includes the label and the raw value, making the failure
 * loud and debuggable rather than silent and corrupting.
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §16 Rule B5
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md
 * SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md
 */

/**
 * Parse a value as a positive (≥0) integer or throw.
 *
 * @param {string|number|null|undefined} value
 * @param {string} label  - Human-readable name for the value (used in the error message).
 * @returns {number}
 * @throws {Error} If the parsed result is NaN, Infinity, negative, or non-integer.
 */
function safeParsePositiveInt(value, label) {
  if (value === null || value === undefined) {
    throw new Error(`[safe-math] ${label}: expected a positive integer but got ${String(value)}`);
  }
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[safe-math] ${label}: expected a positive integer but got NaN/Infinity from "${value}"`);
  }
  if (parsed < 0) {
    throw new Error(`[safe-math] ${label}: expected a positive integer but got negative value ${parsed} from "${value}"`);
  }
  // Guard against truncation of floats (e.g. parseInt("3.14") === 3 which is wrong for some uses)
  if (Number(value) !== parsed && !Number.isNaN(Number(value))) {
    throw new Error(`[safe-math] ${label}: expected an integer but got non-integer value "${value}"`);
  }
  return parsed;
}

/**
 * Parse a value as a finite float or throw.
 *
 * @param {string|number|null|undefined} value
 * @param {string} label
 * @returns {number}
 * @throws {Error} If the parsed result is NaN or Infinity.
 */
function safeParseFloat(value, label) {
  if (value === null || value === undefined) {
    throw new Error(`[safe-math] ${label}: expected a finite float but got ${String(value)}`);
  }
  const parsed = parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`[safe-math] ${label}: expected a finite float but got NaN/Infinity from "${value}"`);
  }
  return parsed;
}

/**
 * Parse a value as an integer, returning null for missing/invalid inputs.
 * Use this for optional numeric fields where null is a valid sentinel.
 *
 * Unlike safeParsePositiveInt, this does NOT throw — it returns null on any
 * invalid input. Negative values and truncated floats are returned as-is.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
function safeParseIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

module.exports = { safeParsePositiveInt, safeParseFloat, safeParseIntOrNull };
