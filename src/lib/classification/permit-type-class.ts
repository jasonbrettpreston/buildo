// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.2
//             docs/specs/00_engineering_standards.md §7.1 (dual code path)
//
// TS-side mirror of the `permit_type_class` PG enum (migration 120). Web admin
// code that needs the canonical class names imports from here. Values MUST
// match the PG enum exactly — drift is regression-locked by
// src/tests/permit-type-class.logic.test.ts.
//
// JS-side mirror lives at scripts/lib/permit-type-classifier.js per Spec 7
// §7.1 dual-path discipline; the parity test ensures both surfaces stay in
// sync with the SQL CREATE TYPE definition.

/**
 * Canonical class for a permit_type. Mirrors the `permit_type_class` PG enum
 * defined in migration 120.
 */
export type PermitTypeClass =
  | 'construction'
  | 'signage'
  | 'administrative'
  | 'safety_upgrade'
  | 'unclassified';

/**
 * Tuple of all permit_type_class values in the canonical SQL CREATE TYPE
 * order. Use this for admin UI dropdowns or any code that needs to iterate
 * the full set.
 */
export const PERMIT_TYPE_CLASSES = [
  'construction',
  'signage',
  'administrative',
  'safety_upgrade',
  'unclassified',
] as const satisfies readonly PermitTypeClass[];

// Named constants for direct reference (avoids stringly-typed comparisons).
export const CONSTRUCTION: PermitTypeClass = 'construction';
export const SIGNAGE: PermitTypeClass = 'signage';
export const ADMINISTRATIVE: PermitTypeClass = 'administrative';
export const SAFETY_UPGRADE: PermitTypeClass = 'safety_upgrade';
export const UNCLASSIFIED: PermitTypeClass = 'unclassified';

/**
 * Type guard — true when `value` is a valid PermitTypeClass.
 * Useful at boundaries that receive untyped strings (API params, URL slugs).
 */
export function isPermitTypeClass(value: unknown): value is PermitTypeClass {
  return typeof value === 'string' && (PERMIT_TYPE_CLASSES as readonly string[]).includes(value);
}
