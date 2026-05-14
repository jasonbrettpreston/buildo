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
 */

const DEFAULT_LIAR_GATE_THRESHOLD = 0.25;
const DEFAULT_MODEL_RANGE_PCT     = 0.20;
const DEFAULT_FALLBACK_RANGE_PCT  = 0.40;

// ──────────────────────────────────────────────────────────────────────
// buildCoaConfig — produces the config object that `estimateCostShared`
// consumes. Mirrors the shape that `scripts/compute-cost-estimates.js`
// builds (lines 265-272 of the twin), but with CoA-specific defaults.
// ──────────────────────────────────────────────────────────────────────
function buildCoaConfig({ tradeRates, scopeMatrix, logicVars }) {
  if (!Array.isArray(tradeRates)) tradeRates = [];
  if (!Array.isArray(scopeMatrix)) scopeMatrix = [];
  const lv = logicVars || {};

  // Index trade rates by slug for O(1) lookup inside the Brain.
  const tradeRateBySlug = new Map();
  for (const row of tradeRates) {
    tradeRateBySlug.set(row.trade_slug, {
      base_rate_sqft: Number(row.base_rate_sqft) || 0,
      structure_complexity_factor: Number(row.structure_complexity_factor) || 1.0,
    });
  }

  // Index scope intensity matrix by (permit_type, structure_type). For CoA
  // we don't have permit_type, so the lookup degrades to a default GFA
  // allocation. Phase E may revisit this.
  const scopeIntensity = new Map();
  for (const row of scopeMatrix) {
    const key = `${row.permit_type}::${row.structure_type}`;
    scopeIntensity.set(key, Number(row.gfa_allocation_percentage) || 0);
  }

  return {
    tradeRateBySlug,
    scopeIntensity,
    liarGateThreshold: Number(lv.liar_gate_threshold) || DEFAULT_LIAR_GATE_THRESHOLD,
    modelRangePct:    Number(lv.model_range_pct)      || DEFAULT_MODEL_RANGE_PCT,
    fallbackRangePct: Number(lv.fallback_range_pct)   || DEFAULT_FALLBACK_RANGE_PCT,
    // CoA-specific flag: skip the permit_type_class gating in the Brain.
    skipPermitTypeClassGating: true,
    // CoA-specific intent: Brain will write 'model' cost_source, but the
    // pipeline script transforms it to 'geometric' on the way to
    // cost_estimates / coa_applications.cost_source. The Brain itself does
    // not need to know about 'geometric'.
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

    // CoA carries no permit_type_class — pass 'construction' as a benign
    // sentinel so the Brain's gating (when skipPermitTypeClassGating is
    // not set or as defensive default) does not block.
    permit_type_class: 'construction',
  };
}

module.exports = {
  buildCoaConfig,
  mapCoaRowToBrainInput,
};
