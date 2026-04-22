/**
 * Safe numeric parsing utilities for src/ (TypeScript version).
 *
 * Raw parseInt() and parseFloat() silently propagate NaN into DB writes and API responses.
 * These wrappers throw immediately with a descriptive message, making failures loud.
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §16 Rule B5
 */

/**
 * Parse a value as a positive (≥0) integer or throw.
 * Throws if the result is NaN, Infinity, negative, or non-integer.
 */
export function safeParsePositiveInt(value: string | number | null | undefined, label: string): number {
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
  // Guard against truncation of floats (parseInt("3.14") === 3 is wrong for integer contexts)
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber !== parsed) {
    throw new Error(`[safe-math] ${label}: expected an integer but got non-integer value "${value}"`);
  }
  return parsed;
}

/**
 * Parse a value as a finite float or throw.
 * Throws if the result is NaN or Infinity.
 */
export function safeParseFloat(value: string | number | null | undefined, label: string): number {
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
 * Use for optional numeric fields where null is a valid sentinel.
 * Unlike safeParsePositiveInt, this does NOT throw — returns null on any invalid input.
 */
export function safeParseIntOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
