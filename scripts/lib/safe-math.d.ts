/**
 * Type declarations for scripts/lib/safe-math.js
 * SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §16 Rule B5
 */

/**
 * Parse a value as a positive (≥0) integer or throw.
 * Throws if the result is NaN, Infinity, negative, or non-integer.
 */
export function safeParsePositiveInt(value: string | number | null | undefined, label: string): number;

/**
 * Parse a value as a finite float or throw.
 * Throws if the result is NaN or Infinity.
 */
export function safeParseFloat(value: string | number | null | undefined, label: string): number;

/**
 * Parse a value as an integer, returning null for missing/invalid inputs.
 * Use for optional numeric fields where null is a valid sentinel.
 */
export function safeParseIntOrNull(value: string | number | null | undefined): number | null;
