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
 * Realtor's "home will be sold" signal applies only to construction-class
 * permits (renovations/additions/new builds). Sign permits, fee deferrals,
 * and fire-upgrade permits do NOT generate listing opportunities, so the
 * realtor TradeMatch should not be appended for those classes.
 *
 * Branches on `permit_type_class` (DB-derived, NOT account_preset). Spec 95
 * §2.5.1 anti-pattern (no persona-axis branching) preserved — `trade_slug`
 * + `permit_type_class` are both canonical algorithmic axes.
 */
export function shouldAppendRealtor(permitClass: PermitTypeClass): boolean {
  return permitClass === CONSTRUCTION;
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
