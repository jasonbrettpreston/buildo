// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R5 + §10.2
//
// JS-side helper for reading the `permit_type_classifications` lookup table
// (migration 120). Pipeline scripts that need to gate behavior on permit_type
// class (WF2 #2 classifier gating + WF2 #3 cost-model gating) call
// `loadPermitTypeClassMap(pool)` once at startup per Spec 47 §R5 startup-guard
// pattern, then use the returned `Map<permit_type, class>` in their hot path.
//
// Defensive failure mode: any query error → returns an empty map. Callers MUST
// treat unknown permit_types as `'unclassified'` (the table's DEFAULT) so a
// missing classification can never accidentally enable the full tag-trade
// matrix on a non-construction permit.
//
// Mirror of the TS-side enum lives at src/lib/classification/permit-type-class.ts
// per Spec 7 §7.1 dual code path. Both surfaces are regression-locked against
// the SQL CREATE TYPE in migration 120 by src/tests/permit-type-class.logic.test.ts.

'use strict';

// Canonical class values — mirror of the PG enum defined in migration 120.
// Drift between this list and the migration breaks classification silently;
// the parity test asserts they stay in sync.
const PERMIT_TYPE_CLASSES = Object.freeze([
  'construction',
  'signage',
  'administrative',
  'safety_upgrade',
  'unclassified',
]);

const CONSTRUCTION = 'construction';
const SIGNAGE = 'signage';
const ADMINISTRATIVE = 'administrative';
const SAFETY_UPGRADE = 'safety_upgrade';
const UNCLASSIFIED = 'unclassified';

const PERMIT_TYPE_CLASS_SET = new Set(PERMIT_TYPE_CLASSES);

/**
 * Fetch the entire permit_type → class map at script startup. Single round
 * trip; suitable for the ~30-row table.
 *
 * Failure mode: DB errors propagate to the caller's outer try-catch (Spec 47
 * §R5 startup-guard pattern — startup failures must surface, not silently
 * crash the pipeline with empty data). The previous silent-catch pattern was
 * removed in WF2 #1 Multi-Agent Review (DeepSeek finding) — same lesson as
 * commit 0f2b3d7's `fetchNeighbourhoodPremiumTier` fix.
 *
 * Drift detection: rows with a class value NOT in PERMIT_TYPE_CLASSES (e.g.
 * an operator typo via direct SQL) are skipped + logged via console.warn.
 * The map only contains canonical values, so consumer code's
 * `=== CONSTRUCTION` comparisons stay correct.
 *
 * @param {{ query: (text: string) => Promise<{ rows: Array<{ permit_type: string; class: string | null }> }> }} pool
 * @returns {Promise<Map<string, string>>} permit_type → class map (canonical values only)
 */
async function loadPermitTypeClassMap(pool) {
  const result = await pool.query(
    `SELECT permit_type, class FROM permit_type_classifications`,
  );
  const map = new Map();
  for (const row of result.rows) {
    // Defensive null guard: column is NOT NULL per migration 120, but if a
    // future ALTER nullifies it, fall back to UNCLASSIFIED rather than store
    // a `null` value that downstream `=== CONSTRUCTION` checks would miss.
    const cls = row.class ?? UNCLASSIFIED;
    // Drift detection: any non-canonical value (operator typo, schema drift)
    // is skipped + logged. The map stays canonical so consumers compare cleanly.
    if (!PERMIT_TYPE_CLASS_SET.has(cls)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[permit-type-classifier] Skipping row with non-canonical class: permit_type=${JSON.stringify(row.permit_type)}, class=${JSON.stringify(cls)}. Expected one of: ${[...PERMIT_TYPE_CLASS_SET].join(', ')}`,
      );
      continue;
    }
    map.set(row.permit_type, cls);
  }
  return map;
}

/**
 * Convenience: classify a single permit_type. Used by call sites that already
 * have the loaded map and want the canonical default behavior.
 *
 * @param {Map<string, string> | null | undefined} classMap
 * @param {string | null | undefined} permitType
 * @returns {string} a permit_type_class value (defaults to UNCLASSIFIED)
 */
function classifyPermitType(classMap, permitType) {
  // Defensive guard against a non-Map input (DeepSeek WF2 #1 review).
  // Pipeline scripts that pass the wrong type would otherwise throw
  // TypeError mid-stream — return UNCLASSIFIED (safe-skip) instead.
  if (!(classMap instanceof Map)) return UNCLASSIFIED;
  if (!permitType) return UNCLASSIFIED;
  return classMap.get(permitType) ?? UNCLASSIFIED;
}

// ─── WF2 #2 (2026-05-08) — Trade allowlist per class ──────────────────────
//
// JS mirror of the TS-side allowlist (src/lib/classification/permit-type-class.ts).
// Both surfaces consume identical policy keys; parity regression-locked by
// src/tests/permit-type-class.logic.test.ts.
//
// Policy values:
//   'all'  — full pass-through (construction)
//   'none' — empty result (administrative, unclassified)
//   array  — narrow trade allowlist (signage, safety_upgrade)

const PERMIT_CLASS_TRADE_ALLOWLIST = Object.freeze({
  construction: 'all',
  signage: Object.freeze(['electrical', 'structural-steel']),
  administrative: 'none',
  safety_upgrade: Object.freeze(['electrical', 'fire-protection']),
  unclassified: 'none',
});

/**
 * Filter a TradeMatch-shaped array by the per-class allowlist. Any element
 * with a `trade_slug` field is supported.
 *
 * @template T
 * @param {T[]} matches
 * @param {string} permitClass
 * @returns {T[]}
 */
function filterTradesByClass(matches, permitClass) {
  const policy = PERMIT_CLASS_TRADE_ALLOWLIST[permitClass];
  if (policy === 'all') return matches;
  if (policy === 'none') return [];
  if (Array.isArray(policy)) {
    const allowed = new Set(policy);
    return matches.filter((m) => allowed.has(m.trade_slug));
  }
  // Unknown policy value — defensive: treat as 'none' (safe-skip).
  return [];
}

/**
 * Realtor's "home will be sold" signal applies only to construction-class
 * permits. Mirror of TS-side `shouldAppendRealtor`.
 *
 * @param {string} permitClass
 * @returns {boolean}
 */
function shouldAppendRealtor(permitClass) {
  return permitClass === CONSTRUCTION;
}

// ─── WF2 #3 (2026-05-08) — Cost-model gate per class ──────────────────────
//
// JS mirror of the TS-side `shouldApplyCostSlicing`. The Surgical Triangle
// (Spec 83 §3) runs only for construction-class permits; all other classes
// short-circuit to `cost_source = 'none'` to eliminate the $29M-for-2-signs
// bug class. Parity regression-locked by permit-type-class.logic.test.ts.
//
// @param {string} permitClass
// @returns {boolean}

function shouldApplyCostSlicing(permitClass) {
  return permitClass === CONSTRUCTION;
}

module.exports = {
  loadPermitTypeClassMap,
  classifyPermitType,
  filterTradesByClass,
  shouldAppendRealtor,
  shouldApplyCostSlicing,
  PERMIT_TYPE_CLASSES,
  PERMIT_CLASS_TRADE_ALLOWLIST,
  CONSTRUCTION,
  SIGNAGE,
  ADMINISTRATIVE,
  SAFETY_UPGRADE,
  UNCLASSIFIED,
};
