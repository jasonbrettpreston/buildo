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
 * §3-ARCHETYPE (WF2 Phase C, 2026-07-06): the CoA path now runs the Brain's
 * archetype cost ladder (Spec 83 §3-ARCHETYPE) AHEAD of the legacy geometric
 * path. CoA carries no applicant-declared area (no residential_sqm /
 * interior_alterations_sqm) so T1 (own-area × per-sqm) and T3 (rate × own area)
 * never fire — the CoA ladder is effectively **T2-or-T4**. `buildCoaArchetypeInput`
 * assembles the `_is_coa: true` Brain row for `tryArchetypeCost`; the legacy
 * `mapCoaRowToBrainInput` is kept UNCHANGED as the byte-identical T4 fallthrough
 * (never passes permit_type into the Brain's matrix machinery — the PI-5 fence).
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (CoA: same ladder minus T1)
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
function buildCoaConfig({ tradeRates: tradeRatesInput, scopeMatrix: scopeMatrixInput, archetypeRates, logicVars }) {
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
  // WF1 Spec 83 §3.A re-key (G11): defensive .trim() to symmetrise with the
  // shared Brain's matrix-lookup input sanitization. CoA currently never
  // passes permit_type/structure_type (all CoA rows safe-skip — see PI-5),
  // but Phase E may revisit this; keeping the key builder symmetric prevents
  // a future divergence between permits and CoA matrix lookups.
  const scopeMatrix = {};
  for (const row of scopeMatrixInput) {
    const pt = (row.permit_type || '').trim();
    const st = (row.structure_type || '').trim();
    const key = `${pt}::${st}`;
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
    // §3-ARCHETYPE (WF2 Phase C, 2026-07-06) — the T2→T3 ladder guards.
    // `archetypeEnabled` is DELIBERATELY NOT set here: the Muscle spreads it
    // onto a dedicated `archConfig` for the explicit `tryArchetypeCost` call so
    // the T4 fallthrough (`estimateCostShared` with this config) keeps the
    // internal ladder OFF and stays byte-identical to the legacy path.
    // T1 (own-area) and T3 (own-area) never fire on CoA (no residential_sqm /
    // interior_alterations_sqm); the T1/FSI values are passed for symmetry only.
    archetypeRates: archetypeRates || {},
    archetypeT1FsiMin:   Number(lv.archetype_t1_fsi_min),
    archetypeT1FsiMax:   Number(lv.archetype_t1_fsi_max),
    archetypeT1TotalCap: Number(lv.archetype_t1_total_cap),
    archetypeT2RenoCap:  Number(lv.archetype_t2_reno_line_cap),
    archetypeT2BuildCap: Number(lv.archetype_t2_build_line_cap),
    archetypeT2BuildMin: Number(lv.archetype_t2_build_line_min),
    archetypeT3TotalCap: Number(lv.archetype_t3_total_cap), // WF3 F2 — inert on CoA (T3 never fires), passed for symmetry
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

// ──────────────────────────────────────────────────────────────────────
// buildCoaArchetypeInput — assembles the Brain row for the archetype ladder
// (`tryArchetypeCost`). Sets `_is_coa: true` (routes the mapper's CoA rules)
// and carries the Spec 88 §4D propagated premium-INCLUSIVE cost scalars + their
// geom-basis areas + structure/project_type/scope_tags.
//
// It DELIBERATELY omits `residential_sqm` / `interior_alterations_sqm` (CoA has
// no applicant-declared area) → the ladder's T1 and T3 rungs can never fire, so
// CoA prices T2 (the parcel line total) or falls through to T4.
//
// PI-5 fence: this row carries NO `permit_type` — the archetype ladder never
// consults the scope_intensity_matrix, and the T4 fallthrough uses the separate
// `mapCoaRowToBrainInput` which also omits permit_type/structure_type.
// ──────────────────────────────────────────────────────────────────────
function buildCoaArchetypeInput(coaRow) {
  if (coaRow == null) {
    throw new Error('buildCoaArchetypeInput: coaRow is null');
  }
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    _is_coa: true,
    // Identity — the Muscle writes permit_num/revision_num = NULL for CoA rows
    // (mig 145); the envelope echoes these but the write path ignores them.
    permit_num: null,
    revision_num: null,
    lead_id: coaRow.lead_id || null,
    // Mapper inputs (Spec 83 §3-ARCHETYPE): project_type + structure_type gate
    // the CoA rules (NewConstruction/Mixed/…) and the low-rise residential gate.
    project_type:   coaRow.project_type ?? null,
    structure_type: coaRow.structure_type ?? null,
    scope_tags:     Array.isArray(coaRow.scope_tags) ? coaRow.scope_tags : [],
    active_trade_slugs: Array.isArray(coaRow.active_trade_slugs) ? coaRow.active_trade_slugs : [],
    // Premium is EMBEDDED in the propagated scalars (§2.6) — reported, never re-applied.
    neighbourhood_cost_premium: num(coaRow.neighbourhood_cost_premium),
    avg_household_income:       num(coaRow.avg_household_income),
    lot_size_sqm:               num(coaRow.lot_size_sqm),
    dwelling_units_created:     num(coaRow.dwelling_units_created),
    // §4D propagated premium-INCLUSIVE cost scalars (T2 line totals + per-sqm).
    cost_fb_total:                  num(coaRow.cost_fb_total),
    cost_coa_total:                 num(coaRow.cost_coa_total),
    cost_addition_total:            num(coaRow.cost_addition_total),
    cost_gut_total:                 num(coaRow.cost_gut_total),
    cost_basement_underpin_per_sqm: num(coaRow.cost_basement_underpin_per_sqm),
    cost_basement_per_sqm:          num(coaRow.cost_basement_per_sqm),
    cost_garage_total:              num(coaRow.cost_garage_total),
    cost_laneway_suite_total:       num(coaRow.cost_laneway_suite_total),
    cost_garden_suite_total:        num(coaRow.cost_garden_suite_total),
    cost_kitchen_per_sqm:           num(coaRow.cost_kitchen_per_sqm),
    cost_bath_per_sqm:              num(coaRow.cost_bath_per_sqm),
    cost_solar_total:               num(coaRow.cost_solar_total),
    // §4D propagated geom-basis areas (the modeled_gfa_sqm / effective_area_sqm basis).
    opt_aor_gfa_sqm:            num(coaRow.opt_aor_gfa_sqm),
    opt_coa_gfa_sqm:            num(coaRow.opt_coa_gfa_sqm),
    cur_floor_gfa_sqm:         num(coaRow.cur_floor_gfa_sqm),
    cur_pot_2story_gfa_sqm:     num(coaRow.cur_pot_2story_gfa_sqm),
    max_garage_gfa_sqm:        num(coaRow.max_garage_gfa_sqm),
    max_laneway_suite_gfa_sqm: num(coaRow.max_laneway_suite_gfa_sqm),
    max_garden_suite_gfa_sqm:  num(coaRow.max_garden_suite_gfa_sqm),
    cur_est_kitchen_gfa_sqm:   num(coaRow.cur_est_kitchen_gfa_sqm),
    cur_est_bath_gfa_sqm:      num(coaRow.cur_est_bath_gfa_sqm),
    max_buildable_footprint_sqm: num(coaRow.max_buildable_footprint_sqm),
    // residential_sqm / interior_alterations_sqm INTENTIONALLY absent — T1/T3
    // own-area rungs can never fire on CoA (see header). Undefined → null in
    // the Brain's Number.isFinite guards.
    // WF3 F2: coa_applications has NO dwelling_units_created column, so the Brain's
    // T3 cap divisor `Math.max(1, … || 1)` degrades to 1 → the CoA T3 cap is
    // effectively a flat archetype_t3_total_cap. Intentional + currently moot (T3
    // never fires on CoA without an own area); documented so it isn't a surprise.
  };
}

module.exports = {
  buildCoaConfig,
  mapCoaRowToBrainInput,
  buildCoaArchetypeInput,
};
