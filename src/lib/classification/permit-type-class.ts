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

// ─── WF2 #2 (2026-05-08) — Trade allowlist per class ─────────────────────
//
// Single source of truth that the classifier (both src/lib/classification/
// classifier.ts AND scripts/classify-permits.js) consults to filter the
// tag-trade matrix output per permit_type_class. Mirror lives at
// scripts/lib/permit-type-classifier.js (Spec 7 §7.1 dual-path); parity
// regression-locked by src/tests/permit-type-class.logic.test.ts.
//
// Policy values:
//   - 'all'                 — pass-through (current behavior, full matrix)
//   - 'none'                — empty result (administrative + unclassified)
//   - readonly string[]     — narrow trade allowlist (signage + safety_upgrade)

/** Policy directive for a class — drives `filterTradesByClass`. */
export type TradeAllowlistPolicy = 'all' | 'none' | readonly string[];

/**
 * Per-class trade allowlist. The classifier filters its matches array through
 * `filterTradesByClass(matches, permitClass)` before any realtor append.
 *
 * Behavior summary (Spec 80 §5 Consumer behaviors):
 *   - construction:    full Tier 1 + Tier 2 + narrow-scope (current behavior)
 *   - signage:         RESERVED — no rows seeded today; reachable only after
 *                      future WF3 description-level subtype detection
 *   - administrative:  empty — no permit_trades rows written
 *   - safety_upgrade:  electrical + fire-protection only
 *   - unclassified:    empty — safe-skip default
 */
export const PERMIT_CLASS_TRADE_ALLOWLIST: Record<PermitTypeClass, TradeAllowlistPolicy> = {
  construction: 'all',
  signage: ['electrical', 'structural-steel'] as const,
  administrative: 'none',
  safety_upgrade: ['electrical', 'fire-protection'] as const,
  unclassified: 'none',
} as const;

/**
 * Filter a TradeMatch-shaped array by the per-class allowlist. Any element
 * with a `trade_slug` is supported — not coupled to a specific TradeMatch type.
 */
export function filterTradesByClass<T extends { trade_slug: string }>(
  matches: T[],
  permitClass: PermitTypeClass,
): T[] {
  const policy = PERMIT_CLASS_TRADE_ALLOWLIST[permitClass];
  if (policy === 'all') return matches;
  if (policy === 'none') return [];
  const allowed = new Set(policy);
  return matches.filter((m) => allowed.has(m.trade_slug));
}

/**
 * Residential building permit_types that signal "home will be sold."
 * WF3 2026-05-09 — sub-axis 2 of `shouldAppendRealtor`. The construction
 * class (mig 120) bundles trade-only permits (PLB/MS/DSS), demolition (DM),
 * and non-residential — none of which signal a real-estate listing
 * opportunity. The 5 entries below are the residential structural permit
 * types per a live-DB audit + Spec 80 §5 amended Realtor sub-table.
 *
 * Mirror lives at scripts/lib/permit-type-classifier.js per Spec 7 §7.1
 * dual-path; parity regression-locked by permit-type-class.logic.test.ts.
 */
export const REALTOR_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  'New Building',
  'Building Additions/Alterations',
  'New Houses',
  'Small Residential Projects',
  'Residential Building Permit',
]);

/**
 * Realtor's "home will be sold" signal — 3-axis gate (WF3 2026-05-09):
 *   1. permitClass === 'construction'  (existing class-level gate)
 *   2. permit_type ∈ REALTOR_RELEVANT_TYPES  (residential structural only)
 *   3. 'commercial' ∉ scope_tags  (catches mixed-use)
 *
 * All three axes must pass. Trade-only permits (Plumbing(PS), Mechanical(MS),
 * Drain and Site Service), demolition (DM), and commercially-scoped permits
 * — even when classified as construction by mig 120 — do NOT generate listing
 * opportunities.
 *
 * Edge cases:
 *   - permit_type null/undefined → false (fail-closed)
 *   - permit_type not in REALTOR_RELEVANT_TYPES → false
 *   - scope_tags null/undefined/empty → permissive (no commercial evidence)
 *   - 'commercial' in scope_tags (even alongside 'residential') → false
 *
 * Branches on `permit_type_class` (DB-derived, NOT account_preset). Spec 95
 * §2.5.1 anti-pattern (no persona-axis branching) preserved.
 */
export function shouldAppendRealtor(
  permitClass: PermitTypeClass,
  permitType: string | null | undefined,
  scopeTags: readonly string[] | null | undefined,
): boolean {
  if (permitClass !== CONSTRUCTION) return false;
  if (permitType == null || !REALTOR_RELEVANT_TYPES.has(permitType)) return false;
  if (scopeTags?.includes('commercial')) return false;
  return true;
}

// ─── WF2 #3 (2026-05-08) — Cost-model gate per class ─────────────────────
//
// The Surgical Triangle (Spec 83 §3) only applies when permit_type_class is
// 'construction'. Non-construction classes short-circuit the cost model to
// `cost_source = 'none'` to eliminate the $29M-for-2-signs / $1.96B WESTON
// GOLF CLUB bug class where sign permits inherited host-building GFA.
//
// Mirror lives at scripts/lib/permit-type-classifier.js (Spec 7 §7.1
// dual-path); parity regression-locked by permit-type-class.logic.test.ts.

/**
 * True iff the cost model should run the Surgical Triangle for this class.
 * Returns `true` only for 'construction'. All other classes (signage,
 * administrative, safety_upgrade, unclassified) short-circuit to
 * `cost_source = 'none'`.
 *
 * Branches on `permit_type_class` (DB-derived). Used by both the JS Brain
 * (cost-model-shared.js) and the TS shim (cost-model.ts) — gating once at
 * the Brain layer is sufficient because both surfaces delegate to it.
 */
export function shouldApplyCostSlicing(permitClass: PermitTypeClass): boolean {
  return permitClass === CONSTRUCTION;
}
