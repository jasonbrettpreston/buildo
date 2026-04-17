/**
 * cost-model-shared.js — Surgical Valuation Brain
 *
 * SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §7.2
 * DUAL CODE PATH: Shared by:
 *   - scripts/compute-cost-estimates.js  (The Muscle — pipeline bulk writer)
 *   - src/features/leads/lib/cost-model.ts (The TS API shim — lead feed reader)
 * No formula logic may exist in either of those files. This module is the
 * single source of truth for all surgical valuation math.
 *
 * Pure functions only — no DB, no side effects, no process-level state.
 * All inputs arrive via the `row` (PermitRow) and `config` (CostModelConfig)
 * parameters. Functions are deterministic and re-entrant.
 *
 * @module cost-model-shared
 */
'use strict';

// ---------------------------------------------------------------------------
// JSDoc typedefs — enforces checkJs compatibility for TS consumers
// ---------------------------------------------------------------------------

/**
 * Flat permit row as returned by the pipeline SOURCE_SQL JOIN.
 * The `active_trade_slugs` array comes from the permit_trades LATERAL JOIN
 * (ARRAY_AGG). Contains ALL classified trades regardless of construction phase —
 * the is_active phase filter is intentionally excluded here so alteration permits
 * with interior-only scope are not zero-bypassed. An empty array (no classified
 * trades at all) still triggers Zero-Total Bypass.
 *
 * @typedef {Object} PermitRow
 * @property {string}        permit_num
 * @property {string}        revision_num
 * @property {string|null}   permit_type
 * @property {string|null}   structure_type
 * @property {string|null}   work
 * @property {number|null}   est_const_cost
 * @property {string[]|null} scope_tags
 * @property {number|null}   storeys
 * @property {number|null}   estimated_stories
 * @property {number|null}   footprint_area_sqm
 * @property {number|null}   lot_size_sqm
 * @property {number|null}   tenure_renter_pct
 * @property {number|null}   avg_household_income
 * @property {number|null}   dwelling_units_created
 * @property {string[]}      active_trade_slugs  — all classified trades from permit_trades LATERAL JOIN (phase-agnostic for cost distribution)
 */

/**
 * Runtime configuration loaded from the control panel (trade_sqft_rates,
 * scope_intensity_matrix, logic_variables). Passed into every call so the
 * Brain has zero DB access.
 *
 * @typedef {Object} CostModelConfig
 * @property {Record<string,{base_rate_sqft:number,structure_complexity_factor:number}>} tradeRates
 *   — keyed by trade_slug; comes from trade_sqft_rates table
 * @property {Record<string,number>} scopeMatrix
 *   — keyed as `${permit_type}::${structure_type}`; comes from scope_intensity_matrix
 * @property {number} urbanCoverageRatio       — logic_variables.urban_coverage_ratio
 * @property {number} suburbanCoverageRatio    — logic_variables.suburban_coverage_ratio
 * @property {number} [trustThresholdPct]       — logic_variables.trust_threshold_pct
 *   (reserved for Spec 83 Phase 2 coverage trust gate — not yet consumed by any Brain function)
 * @property {number} liarGateThreshold        — logic_variables.liar_gate_threshold
 * @property {Array<{min:number,max:number|null,multiplier:number}>} premiumTiers
 *   — income → neighbourhood premium multiplier table
 */

/**
 * Full surgical cost estimate for one permit.
 *
 * @typedef {Object} CostEstimate
 * @property {string}                  permit_num
 * @property {string}                  revision_num
 * @property {number|null}             estimated_cost
 * @property {'permit'|'model'|'none'} cost_source
 * @property {string|null}             cost_tier
 * @property {number|null}             cost_range_low
 * @property {number|null}             cost_range_high
 * @property {number|null}             premium_factor
 * @property {number}                  complexity_score
 * @property {boolean}                 is_geometric_override
 * @property {number|null}             modeled_gfa_sqm
 * @property {number|null}             effective_area_sqm
 * @property {Record<string,number>}   trade_contract_values
 */

// ---------------------------------------------------------------------------
// Module-level constants (not DB-tunable — only in DB via config object)
// ---------------------------------------------------------------------------

/** Trades that receive a 0.60x rate discount on shell permits. */
const INTERIOR_TRADE_SLUGS = new Set([
  'drywall',
  'painting',
  'electrical',
  'plumbing',
  'drain-plumbing',
  'flooring',
  'tiling',
  'trim-work',
  'millwork-cabinetry',
  'stone-countertops',
]);

/** Rate multiplier for interior trades on shell permits. Spec 83 §3 Step 3. */
const SHELL_INTERIOR_MULTIPLIER = 0.60;

/**
 * Below this threshold a city-reported est_const_cost is treated as a
 * "placeholder" filing fee (many Toronto permits list $1 as cost).
 * The model takes over without triggering the Liar's Gate.
 */
const PLACEHOLDER_COST_THRESHOLD = 1000;

/** Model range uncertainty (±25%) when using geometric model. */
const MODEL_RANGE_PCT = 0.25;

/** Fallback range uncertainty (±50%) when using lot-size fallback. */
const FALLBACK_RANGE_PCT = 0.50;

/** Default number of residential floors when massing data is absent. */
const FALLBACK_RESIDENTIAL_FLOORS = 2;

/** Default number of commercial floors when massing data is absent. */
const FALLBACK_COMMERCIAL_FLOORS = 1;

/** model_version written to cost_estimates — signals surgical formula. */
const MODEL_VERSION = 2;

/** Default premium tiers used when config.premiumTiers is not supplied. */
const DEFAULT_PREMIUM_TIERS = [
  { min: 0,       max: 60000,  multiplier: 1.00 },
  { min: 60000,   max: 100000, multiplier: 1.15 },
  { min: 100000,  max: 150000, multiplier: 1.35 },
  { min: 150000,  max: 200000, multiplier: 1.60 },
  { min: 200000,  max: null,   multiplier: 1.85 },
];

// ---------------------------------------------------------------------------
// Step A: Geometric Truth (GFA)
// ---------------------------------------------------------------------------

/**
 * Detect shell permits — triggers the 0.60x interior trade multiplier.
 * Shell = structural envelope only; interior finishes are not in scope.
 *
 * @param {PermitRow} row
 * @returns {boolean}
 */
function isShellPermit(row) {
  const pt = (row.permit_type || '').toLowerCase();
  const wk = (row.work || '').toLowerCase();
  return pt.includes('shell') || wk.includes('shell');
}

/**
 * Detect commercial permits for fallback floor count selection.
 *
 * @param {PermitRow} row
 * @returns {boolean}
 */
function isCommercial(row) {
  const st = (row.structure_type || '').toLowerCase();
  return st.includes('commercial') || st.includes('office') || st.includes('retail');
}

/**
 * Compute Gross Floor Area (GFA) from massing data or lot-size fallback.
 *
 * Primary path: footprint_area_sqm × stories (from massing).
 * Fallback path: lot_size_sqm × coverage_ratio × floors.
 *   coverage_ratio: urban (0.7) if tenure_renter_pct > 50, else suburban (0.4).
 *   floors: FALLBACK_COMMERCIAL_FLOORS for commercial, else FALLBACK_RESIDENTIAL_FLOORS.
 *
 * @param {PermitRow} row
 * @param {CostModelConfig} config
 * @returns {{ gfa: number, usedFallback: boolean, modeledGfaSqm: number|null }}
 */
function computeGfa(row, config) {
  // Primary: massing footprint × stories
  if (
    row.footprint_area_sqm !== null &&
    row.footprint_area_sqm > 0 &&
    (row.estimated_stories !== null || row.storeys !== null)
  ) {
    const stories = row.estimated_stories !== null ? row.estimated_stories : (row.storeys || 1);
    const gfa = row.footprint_area_sqm * stories;
    return { gfa, usedFallback: false, modeledGfaSqm: gfa };
  }

  // Fallback: lot size × coverage × floors
  if (row.lot_size_sqm !== null && row.lot_size_sqm > 0) {
    const urban = config.urbanCoverageRatio !== undefined ? config.urbanCoverageRatio : 0.7;
    const suburban = config.suburbanCoverageRatio !== undefined ? config.suburbanCoverageRatio : 0.4;
    const rentPct = row.tenure_renter_pct || 0;
    const coverage = rentPct > 50 ? urban : suburban;
    const floors = isCommercial(row) ? FALLBACK_COMMERCIAL_FLOORS : FALLBACK_RESIDENTIAL_FLOORS;
    const gfa = row.lot_size_sqm * coverage * floors;
    return { gfa, usedFallback: true, modeledGfaSqm: gfa };
  }

  return { gfa: 0, usedFallback: true, modeledGfaSqm: null };
}

// ---------------------------------------------------------------------------
// Step B: Effective Work Area (Area_Eff)
// ---------------------------------------------------------------------------

/**
 * Determine the Effective Work Area by applying the Surgical Triangle lookup.
 *
 * Area_Eff = GFA × scope_intensity_matrix[permit_type::structure_type].
 * On matrix miss, Area_Eff = GFA (allocation = 1.0 — treat as full scope).
 * This is a conservative miss strategy; Phase 3 EXPLAIN ANALYZE will identify
 * which permit_type × structure_type pairs are most frequently missed.
 *
 * @param {PermitRow} row
 * @param {number} gfa
 * @param {CostModelConfig} config
 * @returns {{ areaEff: number, matrixKey: string, matched: boolean }}
 */
function computeEffectiveArea(row, gfa, config) {
  const pt = (row.permit_type || '').toLowerCase().trim();
  const st = (row.structure_type || '').toLowerCase().trim();
  const matrixKey = `${pt}::${st}`;
  const pct = config.scopeMatrix ? config.scopeMatrix[matrixKey] : undefined;
  if (pct !== undefined && pct > 0) {
    return { areaEff: gfa * pct, matrixKey, matched: true };
  }
  // Miss: default to full GFA (allocation = 1.0)
  return { areaEff: gfa, matrixKey, matched: false };
}

// ---------------------------------------------------------------------------
// Neighbourhood premium factor
// ---------------------------------------------------------------------------

/**
 * Compute the neighbourhood income premium multiplier.
 *
 * @param {number|null} avgIncome
 * @param {CostModelConfig} config
 * @returns {number}
 */
function computePremiumFactor(avgIncome, config) {
  if (avgIncome === null || avgIncome === undefined || !Number.isFinite(avgIncome)) {
    return 1.0;
  }
  const tiers = (config && config.premiumTiers) ? config.premiumTiers : DEFAULT_PREMIUM_TIERS;
  for (const tier of tiers) {
    if (avgIncome >= tier.min && (tier.max === null || avgIncome < tier.max)) {
      return tier.multiplier;
    }
  }
  return 1.0;
}

// ---------------------------------------------------------------------------
// Step C: Trade Valuation (The Constraint Filter)
// ---------------------------------------------------------------------------

/**
 * Compute the surgical dollar value for a single trade.
 *
 * Trade Value = Area_Eff × base_rate_sqft × structure_complexity_factor × premium.
 * If the permit is a shell and the trade is interior, apply the 0.60x multiplier.
 * If the trade_slug is not in tradeRates, returns 0.
 *
 * NOTE: complexity is applied per-trade (not globally) — spec 83 §8 Part 2.
 *
 * @param {string}         slug        — trade_slug
 * @param {number}         areaEff     — effective work area (sqm)
 * @param {boolean}        isShell     — is this a shell permit?
 * @param {number}         premium     — neighbourhood premium factor
 * @param {CostModelConfig} config
 * @returns {number}
 */
function computeTradeValue(slug, areaEff, isShell, premium, config) {
  const rateRow = config.tradeRates ? config.tradeRates[slug] : undefined;
  if (!rateRow) return 0;

  let rate = rateRow.base_rate_sqft;
  if (isShell && INTERIOR_TRADE_SLUGS.has(slug)) {
    rate = rate * SHELL_INTERIOR_MULTIPLIER;
  }
  const complexity = rateRow.structure_complexity_factor || 1.0;
  return areaEff * rate * complexity * premium;
}

/**
 * Compute the surgical total across all active_trade_slugs.
 *
 * @param {PermitRow}      row
 * @param {number}         areaEff
 * @param {boolean}        isShell
 * @param {number}         premium
 * @param {CostModelConfig} config
 * @returns {{ total: number, tradeValues: Record<string,number> }}
 */
function computeSurgicalTotal(row, areaEff, isShell, premium, config) {
  // Deduplicate slugs — LATERAL ARRAY_AGG can produce duplicate slugs if the
  // permit_trades JOIN returns multiple rows for the same trade. Without the
  // Set, a duplicated slug inflates the surgical total and shifts Liar's Gate.
  const slugs = [...new Set(Array.isArray(row.active_trade_slugs) ? row.active_trade_slugs : [])];
  const tradeValues = {};
  let total = 0;
  for (const slug of slugs) {
    const val = computeTradeValue(slug, areaEff, isShell, premium, config);
    if (val > 0) {
      tradeValues[slug] = Math.round(val);
      total += val;
    }
  }
  return { total, tradeValues };
}

// ---------------------------------------------------------------------------
// Step D: Liar's Gate Validation
// ---------------------------------------------------------------------------

/**
 * Apply the Liar's Gate logic and determine the final cost estimate.
 *
 * Branching (evaluated in order):
 *  1. Zero-Total Bypass: if surgicalTotal === 0 → cost_source='none', estimated_cost=null.
 *  2. Default: if est_const_cost is null or ≤ PLACEHOLDER_COST_THRESHOLD → cost_source='model'.
 *  3. Override: if est_const_cost < surgicalTotal × threshold → cost_source='model', override=true.
 *  4. Trust (Proportional Slicing): otherwise → cost_source='permit', slice relatively.
 *
 * The Float Guard ensures we never divide by a near-zero surgicalTotal.
 *
 * @param {number|null}               reportedCost     — permit.est_const_cost (already sanitized)
 * @param {number}                    surgicalTotal
 * @param {Record<string,number>}     tradeValues      — per-trade surgical values
 * @param {number}                    liarGateThreshold
 * @param {boolean}                   usedFallback
 * @returns {{
 *   estimated_cost: number|null,
 *   cost_source: 'permit'|'model'|'none',
 *   is_geometric_override: boolean,
 *   trade_contract_values: Record<string,number>,
 *   liarsGateOverride: boolean,
 *   zeroTotalBypass: boolean,
 * }}
 */
function applyLiarsGate(reportedCost, surgicalTotal, tradeValues, liarGateThreshold, usedFallback) {
  // Branch 1: Zero-Total Bypass (CRITICAL — spec 83 §3 Step D)
  if (surgicalTotal === 0) {
    return {
      estimated_cost: null,
      cost_source: 'none',
      is_geometric_override: false,
      trade_contract_values: {},
      liarsGateOverride: false,
      zeroTotalBypass: true,
    };
  }

  // Float Guard: surgicalTotal is now guaranteed > 0
  const threshold = Number.isFinite(liarGateThreshold) ? liarGateThreshold : 0.25;

  // Branch 2: Default — reported cost is absent or below placeholder
  if (reportedCost === null || !Number.isFinite(reportedCost) || reportedCost <= PLACEHOLDER_COST_THRESHOLD) {
    return {
      estimated_cost: Math.round(surgicalTotal),
      cost_source: 'model',
      is_geometric_override: false,
      trade_contract_values: tradeValues,
      liarsGateOverride: false,
      zeroTotalBypass: false,
    };
  }

  // Branch 3: Override — reported < surgical × threshold (Liar's Gate fires)
  // Suppressed when usedFallback=true: lot-size fallback has ±50% uncertainty
  // and can grossly overstate cost for small renos on large lots.
  if (!usedFallback && reportedCost < surgicalTotal * threshold) {
    return {
      estimated_cost: Math.round(surgicalTotal),
      cost_source: 'model',
      is_geometric_override: true,
      trade_contract_values: tradeValues,
      liarsGateOverride: true,
      zeroTotalBypass: false,
    };
  }

  // Branch 4: Trust — proportional slicing via relative weights
  // Weight = tradeSurgical / surgicalTotal; slice = weight × reportedCost.
  const sliced = {};
  for (const [slug, tradeVal] of Object.entries(tradeValues)) {
    const weight = tradeVal / surgicalTotal;
    const slicedVal = Math.round(weight * reportedCost);
    if (slicedVal > 0) sliced[slug] = slicedVal;
  }
  return {
    estimated_cost: reportedCost,
    cost_source: 'permit',
    is_geometric_override: false,
    trade_contract_values: sliced,
    liarsGateOverride: false,
    zeroTotalBypass: false,
  };
}

// ---------------------------------------------------------------------------
// Complexity Score + Cost Tier (helpers, not core path)
// ---------------------------------------------------------------------------

/**
 * Compute a 0–100 complexity score for a permit.
 * Signals: highRise, multiUnit, largeFootprint, premiumNbhd, complexScope, newBuild.
 * scope_tags are deduplicated via Set before evaluation (W8 — duplicate tag guard).
 *
 * @param {PermitRow} row
 * @returns {number}
 */
function computeComplexityScore(row) {
  let score = 0;
  const stories = row.storeys || row.estimated_stories || 0;
  if (stories > 6) score += 30;                                      // highRise
  if ((row.dwelling_units_created || 0) > 4) score += 20;            // multiUnit
  if ((row.footprint_area_sqm || 0) > 300) score += 15;              // largeFootprint
  if ((row.avg_household_income || 0) > 150000) score += 15;         // premiumNbhd

  // Dedup scope_tags before evaluation — duplicate 'pool' would double-count.
  const uniqueTags = new Set((row.scope_tags || []).map((t) => (t || '').toLowerCase()));
  for (const norm of uniqueTags) {
    if (norm === 'pool' || norm === 'elevator' || norm === 'underpinning') {
      score += 10; // complexScope
    }
  }

  const pt = (row.permit_type || '').toLowerCase();
  if (pt.includes('new building') || pt.includes('new construction')) score += 10; // newBuild

  return Math.min(100, score);
}

/**
 * Classify estimated_cost into a named tier.
 *
 * @param {number} cost
 * @returns {string|null}
 */
function determineCostTier(cost) {
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (cost < 100000)    return 'small';
  if (cost < 500000)    return 'medium';
  if (cost < 2000000)   return 'large';
  if (cost < 10000000)  return 'major';
  return 'mega';
}

// ---------------------------------------------------------------------------
// Primary entry point
// ---------------------------------------------------------------------------

/**
 * Estimate construction cost for one permit using the surgical valuation model.
 *
 * This is the single function called by both:
 *   - scripts/compute-cost-estimates.js   (pipeline batch writer)
 *   - src/features/leads/lib/cost-model.ts (TS read-path shim)
 *
 * @param {PermitRow}      row    — flat permit row with all joined columns
 * @param {CostModelConfig} config — pre-loaded control panel data
 * @returns {CostEstimate}
 */
function estimateCostShared(row, config) {
  // ── Input sanitization (spec 83 §3 Step 1 — W12, W21) ──────────────────
  const rawCost = Number.isFinite(row.est_const_cost) ? row.est_const_cost : null;

  // ── Step A: Geometric Truth ─────────────────────────────────────────────
  const { gfa, usedFallback, modeledGfaSqm } = computeGfa(row, config);

  // ── Step B: Effective Work Area ─────────────────────────────────────────
  const { areaEff } = gfa > 0
    ? computeEffectiveArea(row, gfa, config)
    : { areaEff: 0 };

  // ── Neighbourhood premium ───────────────────────────────────────────────
  const premium = computePremiumFactor(row.avg_household_income, config);

  // ── Shell detection ─────────────────────────────────────────────────────
  const isShell = isShellPermit(row);

  // ── Step C: Trade Valuation ─────────────────────────────────────────────
  const { total: surgicalTotal, tradeValues } = areaEff > 0
    ? computeSurgicalTotal(row, areaEff, isShell, premium, config)
    : { total: 0, tradeValues: {} };

  // ── Step D: Liar's Gate ─────────────────────────────────────────────────
  const liarThreshold = config ? config.liarGateThreshold : 0.25;
  const gate = applyLiarsGate(rawCost, surgicalTotal, tradeValues, liarThreshold, usedFallback);

  // ── Complexity + Tier ───────────────────────────────────────────────────
  const complexity = computeComplexityScore(row);
  const tier = gate.estimated_cost !== null ? determineCostTier(gate.estimated_cost) : null;

  // ── Cost range ──────────────────────────────────────────────────────────
  let rangePct = 0;
  if (gate.cost_source === 'model') {
    rangePct = usedFallback ? FALLBACK_RANGE_PCT : MODEL_RANGE_PCT;
  }
  const low = (gate.estimated_cost !== null && rangePct > 0)
    ? gate.estimated_cost * (1 - rangePct)
    : gate.estimated_cost;
  const high = (gate.estimated_cost !== null && rangePct > 0)
    ? gate.estimated_cost * (1 + rangePct)
    : gate.estimated_cost;

  return {
    permit_num:             row.permit_num,
    revision_num:           row.revision_num,
    estimated_cost:         gate.estimated_cost,
    cost_source:            gate.cost_source,
    cost_tier:              tier,
    cost_range_low:         low !== null ? Math.round(low) : null,
    cost_range_high:        high !== null ? Math.round(high) : null,
    premium_factor:         premium,
    complexity_score:       complexity,
    is_geometric_override:  gate.is_geometric_override,
    modeled_gfa_sqm:        modeledGfaSqm,
    effective_area_sqm:     areaEff > 0 ? Math.round(areaEff * 100) / 100 : null,
    trade_contract_values:  gate.trade_contract_values,
    // Internal telemetry flags (consumed by Muscle; not persisted to DB)
    _liarsGateOverride:     gate.liarsGateOverride,
    _zeroTotalBypass:       gate.zeroTotalBypass,
    _usedFallback:          usedFallback,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Primary entry point
  estimateCostShared,
  // Granular functions (for unit testing + TS shim delegation)
  computeGfa,
  computeEffectiveArea,
  isShellPermit,
  isCommercial,
  computeTradeValue,
  computeSurgicalTotal,
  applyLiarsGate,
  computePremiumFactor,
  computeComplexityScore,
  determineCostTier,
  // Constants
  INTERIOR_TRADE_SLUGS,
  SHELL_INTERIOR_MULTIPLIER,
  PLACEHOLDER_COST_THRESHOLD,
  MODEL_RANGE_PCT,
  FALLBACK_RANGE_PCT,
  FALLBACK_RESIDENTIAL_FLOORS,
  FALLBACK_COMMERCIAL_FLOORS,
  MODEL_VERSION,
  DEFAULT_PREMIUM_TIERS,
};
