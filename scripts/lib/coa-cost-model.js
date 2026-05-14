'use strict';
/**
 * coa-cost-model — CoA-side config builder for the Brain
 * (`src/features/leads/lib/cost-model-shared.js` — `estimateCostShared`).
 *
 * Brain math is UNCHANGED; this lib only constructs the config + maps
 * coa_applications row shapes onto the Brain's expected input shape.
 *
 * CoA-specific defaults:
 *   - est_const_cost: null always (no applicant-declared cost on CoA)
 *   - cost_source intent: 'geometric' (no Liar's Gate path)
 *   - permit_type_class skipped (Brain's permit-class gating is permit-only)
 *
 * R0.14 confirmed: `cost-model-shared.js:512` is null-safe via
 * `Number.isFinite(row.est_const_cost) ? row.est_const_cost : null` — passing
 * `est_const_cost: null` routes cleanly through the model-only path.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §Geometric-Only Path for CoA (Brain consumer)
 */

const DEFAULT_LIAR_GATE_THRESHOLD = 0.25;
const DEFAULT_MODEL_RANGE_PCT     = 0.20;
const DEFAULT_FALLBACK_RANGE_PCT  = 0.40;

// ──────────────────────────────────────────────────────────────────────
// buildCoaConfig — produces the config object that `estimateCostShared`
// consumes. Mirrors the shape that `scripts/compute-cost-estimates.js`
// builds (lines 265-272 of the twin), but with CoA-specific defaults.
// ──────────────────────────────────────────────────────────────────────
function buildCoaConfig({ tradeRates: tradeRatesInput, scopeMatrix: scopeMatrixInput, logicVars }) {
  if (!Array.isArray(tradeRatesInput)) tradeRatesInput = [];
  if (!Array.isArray(scopeMatrixInput)) scopeMatrixInput = [];
  const lv = logicVars || {};

  // R5.5 review fold #1 (W#1 L-1 + W#2 CRIT-1 — 4-reviewer convergence):
  // The Brain (cost-model-shared.js:233,286) reads `config.tradeRates[slug]`
  // and `config.scopeMatrix[matrixKey]` via plain-object bracket access. The
  // original R5.1 substrate returned `tradeRateBySlug` and `scopeIntensity`
  // as JS Maps — wrong field names AND wrong type. Both would silently miss
  // every lookup → 100% null cost on every CoA. Fix: plain objects with
  // the Brain's expected key names.
  const tradeRates = {};
  for (const row of tradeRatesInput) {
    tradeRates[row.trade_slug] = {
      base_rate_sqft: Number(row.base_rate_sqft) || 0,
      structure_complexity_factor: Number(row.structure_complexity_factor) || 1.0,
    };
  }

  // Index scope intensity matrix by (permit_type, structure_type). For CoA
  // we don't have permit_type, so the lookup degrades to a default GFA
  // allocation. Phase E may revisit this.
  const scopeMatrix = {};
  for (const row of scopeMatrixInput) {
    const key = `${row.permit_type}::${row.structure_type}`;
    scopeMatrix[key] = Number(row.gfa_allocation_percentage) || 0;
  }

  return {
    tradeRates,    // R5.5 review fold #1 — renamed from tradeRateBySlug + Map → plain object
    scopeMatrix,   // R5.5 review fold #1 — renamed from scopeIntensity + Map → plain object
    liarGateThreshold: Number(lv.liar_gate_threshold) || DEFAULT_LIAR_GATE_THRESHOLD,
    modelRangePct:    Number(lv.model_range_pct)      || DEFAULT_MODEL_RANGE_PCT,
    fallbackRangePct: Number(lv.fallback_range_pct)   || DEFAULT_FALLBACK_RANGE_PCT,
    // R5.5 review fold #2 (W#2 CRIT-3): Brain (cost-model-shared.js:200-201)
    // reads urbanCoverageRatio + suburbanCoverageRatio with hardcoded fallbacks
    // (0.7/0.4). Operators must be able to tune these via Control Panel per
    // Spec 47 §4.1. Pass them through from logicVars.
    urbanCoverageRatio:    Number(lv.urban_coverage_ratio)    || 0.7,
    suburbanCoverageRatio: Number(lv.suburban_coverage_ratio) || 0.4,
    // R5.5 review fold #5 (W#2 HIGH-5): the previously-present
    // `skipPermitTypeClassGating: true` flag was DEAD CODE — the Brain never
    // read it. CoA rows pass the Brain's permit_type_class gate via the
    // `permit_type_class: 'construction'` sentinel set in
    // mapCoaRowToBrainInput (see comment there). Removing the dead flag
    // prevents future developers from trusting an inert escape hatch.
    coaContext: true,
  };
}

// ──────────────────────────────────────────────────────────────────────
// mapCoaRowToBrainInput — flattens a 6-table-joined CoA row onto the
// Brain's expected input shape. The Brain reads:
//   est_const_cost, modeled_gfa_sqm, footprint_area_sqm, estimated_stories,
//   avg_household_income, scope_tags, active_trade_slugs, permit_type_class
//   (latter is for permit-only gating; CoA passes a sentinel).
// ──────────────────────────────────────────────────────────────────────
function mapCoaRowToBrainInput(coaRow) {
  if (coaRow == null) {
    throw new Error('mapCoaRowToBrainInput: coaRow is null');
  }
  return {
    // CoA records never have an applicant-declared cost — pass null and let
    // the Brain's null-safe handling (cost-model-shared.js:512) route through
    // the model-only path.
    est_const_cost: null,

    // Geometric inputs sourced via the 6-table JOIN in compute-coa-cost-estimates.
    modeled_gfa_sqm:    coaRow.modeled_gfa_sqm    != null ? Number(coaRow.modeled_gfa_sqm)    : null,
    footprint_area_sqm: coaRow.footprint_area_sqm != null ? Number(coaRow.footprint_area_sqm) : null,
    estimated_stories:  coaRow.estimated_stories  != null ? Number(coaRow.estimated_stories)  : null,
    avg_household_income: coaRow.avg_household_income != null ? Number(coaRow.avg_household_income) : null,

    // Scope tags from R5.3 (classify-coa-scope) — drive the trade matrix lookup.
    scope_tags: Array.isArray(coaRow.scope_tags) ? coaRow.scope_tags : [],

    // Active trades from R5.4 (classify-coa-trades) — drive the surgical valuation.
    active_trade_slugs: Array.isArray(coaRow.active_trade_slugs) ? coaRow.active_trade_slugs : [],

    // R5.1.g Worktree HIGH-4 fix: pass `permit_num: null` (NOT lead_id).
    // The Brain echoes `permit_num` verbatim into its output, which the
    // calling pipeline script writes to cost_estimates.permit_num. After
    // migration 145, that column is nullable AND retains its composite FK
    // to permits — writing a 'coa:...' string would violate the FK (MATCH
    // SIMPLE requires non-NULL FK columns reference real parents).
    // CoA identity flows through lead_id only.
    permit_num: null,
    revision_num: null,
    lead_id: coaRow.lead_id || null,

    // R5.5 review fold #5 (W#2 HIGH-5): this sentinel is the ACTUAL mechanism
    // that routes CoA rows through the Brain's Surgical Triangle. The Brain's
    // permit_type_class gate (`cost-model-shared.js:484`) compares
    // `row.permit_type_class !== COST_SLICING_CLASS` where COST_SLICING_CLASS
    // is 'construction'. Setting 'construction' here ensures the gate passes.
    // DO NOT REMOVE without removing the gate itself in the Brain.
    permit_type_class: 'construction',
  };
}

module.exports = {
  buildCoaConfig,
  mapCoaRowToBrainInput,
};
