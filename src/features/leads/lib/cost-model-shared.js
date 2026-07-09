/**
 * cost-model-shared.js — Surgical Valuation Brain
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §7.2
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
 * @property {string|null}   [permit_type_class] — Spec 80 §5 taxonomy ('construction' | 'signage' | 'administrative' | 'safety_upgrade' | 'unclassified'). When != 'construction' the Brain short-circuits to cost_source='none' (Spec 83 §3, WF2 #3). Production callers always supply via SOURCE_SQL JOIN with COALESCE → 'unclassified' default.
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
 * @property {number} [permitDeclaredCostCeiling] — logic_variables.permit_declared_cost_ceiling
 *   (P13-2 upper sentinel; Infinity/absent disables the guard)
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

/**
 * permit_type_class value (Spec 80 §5) for which the Surgical Triangle runs.
 * All other classes short-circuit to cost_source='none' per Spec 83 §3 (WF2 #3).
 */
const COST_SLICING_CLASS = 'construction';

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

// ──────────────────────────────────────────────────────────────────────────
// NORMALIZATION CONTRACT (Spec 83 §3.A — WF1 production-vocabulary re-key):
//   - Matrix lookup keys (computeEffectiveArea below) MUST use exact
//     production vocabulary with defensive .trim() only — NO .toLowerCase().
//   - Substring-detection helpers (isShellPermit, isCommercial) MAY use
//     .toLowerCase() because they search for keyword substrings, not key
//     lookups against DB-seeded data. These are different use classes.
// Re-introducing .toLowerCase() to the matrix-lookup path will silently
// reproduce the 14-day cost_source='none' regression (PI-9 audit).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Detect shell permits — triggers the 0.60x interior trade multiplier.
 * Shell = structural envelope only; interior finishes are not in scope.
 * Uses .toLowerCase() for case-insensitive substring search — NOT a matrix lookup.
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
 * Uses .toLowerCase() for case-insensitive substring search — NOT a matrix lookup.
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
 * On matrix miss for a construction-class permit, areaEff = null — the caller
 * `estimateCostShared` then short-circuits to cost_source='none' (Spec 83 §3
 * Step B, WF3 Pass-2.5 Finding D). Operators see misses via the Muscle's
 * `matrix_miss_top_keys` audit_table row and backfill the matrix incrementally
 * via the admin Control Panel (Spec 86) or the SQL fallback in Spec 83 §3.A.
 *
 * Internal defensive guard: when gfa is null/0, the matrix is not consulted
 * (areaEff=0, matched=false). This makes the function self-defensive against
 * future refactors that might drop the caller's `gfa > 0 ?` short-circuit.
 *
 * @param {PermitRow} row
 * @param {number} gfa
 * @param {CostModelConfig} config
 * @returns {{ areaEff: number | null, matrixKey: string | null, matched: boolean }}
 *   areaEff is null only on a matrix miss with gfa > 0; 0 when gfa <= 0;
 *   a positive number on hit. The caller MUST handle the null case
 *   explicitly (downstream Step C and Liar's Gate are skipped via early-return).
 */
function computeEffectiveArea(row, gfa, config) {
  if (gfa == null || gfa <= 0) {
    return { areaEff: 0, matrixKey: null, matched: false };
  }
  // Spec 83 §3.A: exact production-vocabulary match. Defensive .trim() only
  // (PI-7 found 4716 permits with leading/trailing whitespace, 1.9% of corpus).
  // NO .toLowerCase() — see NORMALIZATION CONTRACT above.
  const pt = (row.permit_type || '').trim();
  const st = (row.structure_type || '').trim();
  const matrixKey = `${pt}::${st}`;
  const pct = config.scopeMatrix ? config.scopeMatrix[matrixKey] : undefined;
  if (pct !== undefined && pct > 0) {
    return { areaEff: gfa * pct, matrixKey, matched: true };
  }
  return { areaEff: null, matrixKey, matched: false };
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
 *  2. Default: if est_const_cost is null, ≤ PLACEHOLDER_COST_THRESHOLD, OR ≥ the upper
 *     sentinel (permitDeclaredCostCeiling) → cost_source='model'. The upper guard mirrors
 *     the lower placeholder floor: a declared cost above the ceiling (e.g. the exact-$1e9
 *     round-number filings) is a placeholder, so the model takes over rather than passing
 *     the sentinel through as a trusted permit cost (P13-2).
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
 * @param {number}                    [permitDeclaredCostCeiling]  — P13-2 upper sentinel; Infinity disables
 * @returns {{
 *   estimated_cost: number|null,
 *   cost_source: 'permit'|'model'|'none',
 *   is_geometric_override: boolean,
 *   trade_contract_values: Record<string,number>,
 *   liarsGateOverride: boolean,
 *   zeroTotalBypass: boolean,
 * }}
 */
function applyLiarsGate(reportedCost, surgicalTotal, tradeValues, liarGateThreshold, usedFallback, permitDeclaredCostCeiling = Infinity) {
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
  // P13-2 upper sentinel: an implausibly-high declared cost (e.g. the exact-$1e9
  // round-number filings) is a placeholder, not a real bid. Default Infinity keeps
  // legacy callers unchanged; the pipeline threads permit_declared_cost_ceiling.
  const upperSentinel = Number.isFinite(permitDeclaredCostCeiling) ? permitDeclaredCostCeiling : Infinity;

  // Branch 2: Default — reported cost is absent, below placeholder, or above the upper sentinel
  if (reportedCost === null || !Number.isFinite(reportedCost)
      || reportedCost <= PLACEHOLDER_COST_THRESHOLD || reportedCost >= upperSentinel) {
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
// §3-ARCHETYPE — the archetype cost ladder (WF2 2026-07-06, Spec 83 §3-ARCHETYPE)
// ---------------------------------------------------------------------------

const {
  LINE_DEFS,
  mapToLines,
  isLowRiseResidential,
} = require('./archetype-cost-map');

/** Archetype range uncertainty (±25% — same as the geometric model band). */
const ARCHETYPE_RANGE_PCT = 0.25;

/**
 * Decision-4 trade slicing for archetype totals: Step C never runs on this path, so the relative
 * weights reduce to base_rate × complexity over the lead's OWN deduped slugs (in Step C every trade
 * shares the same areaEff, so the area cancels out of the relative weights). A rough allocation,
 * NOT a bottom-up estimate (revisit at Spec 88 P3). Trade-less lead → {} (counted by the Muscle).
 */
function sliceArchetypeTotal(row, total, config) {
  const slugs = [...new Set(Array.isArray(row.active_trade_slugs) ? row.active_trade_slugs : [])];
  const rates = config && config.tradeRates ? config.tradeRates : {};
  const weights = {};
  let weightSum = 0;
  for (const slug of slugs) {
    const r = rates[slug];
    if (!r) continue; // unknown slug → 0 weight (matches the legacy slicing)
    const w = (r.base_rate_sqft || 0) * (r.structure_complexity_factor || 1);
    if (w > 0) { weights[slug] = w; weightSum += w; }
  }
  if (weightSum <= 0) return {};
  const out = {};
  for (const [slug, w] of Object.entries(weights)) out[slug] = Math.round((w / weightSum) * total);
  return out;
}

/** Assemble the Brain result envelope for an archetype-priced lead. */
function archetypeEnvelope(row, config, { total, source, area, telemetry }) {
  // premium_factor reports the Spec 88 neighbourhood_cost_premium actually
  // EMBEDDED in the archetype price (1.0 fallback — mirrors §2.1 lineCost),
  // not the legacy income-tier premium, so the column stays truthful about
  // what multiplied the estimate.
  const premium = Number.isFinite(row.neighbourhood_cost_premium)
    ? Number(row.neighbourhood_cost_premium)
    : 1.0;
  const rounded = Math.round(total);
  return {
    permit_num:             row.permit_num,
    revision_num:           row.revision_num,
    estimated_cost:         rounded,
    cost_source:            source,
    cost_tier:              determineCostTier(rounded),
    cost_range_low:         Math.round(rounded * (1 - ARCHETYPE_RANGE_PCT)),
    cost_range_high:        Math.round(rounded * (1 + ARCHETYPE_RANGE_PCT)),
    premium_factor:         premium,
    complexity_score:       computeComplexityScore(row),
    is_geometric_override:  false,
    modeled_gfa_sqm:        area != null ? Math.round(area * 100) / 100 : null,
    effective_area_sqm:     area != null ? Math.round(area * 100) / 100 : null,
    trade_contract_values:  sliceArchetypeTotal(row, rounded, config),
    _liarsGateOverride:     false,
    _zeroTotalBypass:       false,
    _usedFallback:          false,
    _matrixMiss:            false,
    _matrixMissKey:         null,
    ...telemetry,
  };
}

/** The byte-symmetric no-cost envelope for fit-blocked / zero-total archetype outcomes. */
function archetypeNoneEnvelope(row, config, telemetry) {
  return {
    permit_num:             row.permit_num,
    revision_num:           row.revision_num,
    estimated_cost:         null,
    cost_source:            'none',
    cost_tier:              null,
    cost_range_low:         null,
    cost_range_high:        null,
    premium_factor:         computePremiumFactor(row.avg_household_income, config),
    complexity_score:       computeComplexityScore(row),
    is_geometric_override:  false,
    modeled_gfa_sqm:        null,
    effective_area_sqm:     null,
    trade_contract_values:  {},
    _liarsGateOverride:     false,
    _zeroTotalBypass:       false,
    _usedFallback:          false,
    _matrixMiss:            false,
    _matrixMissKey:         null,
    ...telemetry,
  };
}

/**
 * Price ONE mapped line down the T1→T3 ladder.
 * @returns {{ total:number, tier:'t1'|'t2'|'t3', area:number|null, rejections:string[] } |
 *           { fitBlocked:true } | { zeroTotal:true } | null}
 *           null = unpriceable on this ladder (caller falls to T4).
 */
function priceLine(row, line, config, capClassOverride) {
  const def = LINE_DEFS[line];
  if (!def) return null;
  const scalar = Number.isFinite(row[def.scalarCol]) ? Number(row[def.scalarCol]) : null;
  const basisArea = Number.isFinite(row[def.areaCol]) ? Number(row[def.areaCol]) : null;
  const rejections = [];

  // Present-but-ZERO (or negative) propagated total → the 'none' envelope, never
  // $0 and never a T4 re-price (Guardian F1-B — the Zero-Total-Bypass analog;
  // a computed $0 archetype price is a data-poison signal, not missing data).
  if (scalar != null && scalar <= 0) return { zeroTotal: true };

  // Line total + per-sqm from the propagated columns (premium-INCLUSIVE — never re-premium, §2.6).
  const lineTotal = def.kind === 'total' ? scalar
    : scalar != null && basisArea != null && basisArea > 0 ? scalar * basisArea : null;
  const perSqm = def.kind === 'per_sqm' ? scalar
    : scalar != null && basisArea != null && basisArea > 0 ? scalar / basisArea : null;

  // ── T1: the lead's OWN declared area × the line per-sqm ──
  const ownArea = def.ownAreaField && Number.isFinite(row[def.ownAreaField]) && Number(row[def.ownAreaField]) > 0
    ? Number(row[def.ownAreaField]) : null;
  if (ownArea != null && perSqm != null && perSqm > 0) {
    const lot = Number.isFinite(row.lot_size_sqm) ? Number(row.lot_size_sqm) : null;
    const fsi = lot && lot > 0 ? ownArea / lot : null;
    const fsiOk = fsi != null && fsi >= config.archetypeT1FsiMin && fsi <= config.archetypeT1FsiMax;
    if (!fsiOk) {
      rejections.push('t1_band');
    } else {
      const t1 = perSqm * ownArea;
      const cap = config.archetypeT1TotalCap * Math.max(1, Number(row.dwelling_units_created) || 1);
      if (t1 > cap) rejections.push('t1_cap');
      else if (t1 > 0) return { total: t1, tier: 't1', area: ownArea, rejections };
    }
  }

  // ── T2: the parcel's precomputed line total ──
  if (def.fitGated && scalar == null) return { fitBlocked: true }; // fits:false = permissioning, never a fallback
  if (lineTotal != null && lineTotal > 0) {
    // WF3 2026-07-06 (F1 escalation cap-class): a reno-origin escalated max_build carries
    // capClassOverride='reno' so BOTH the cap AND the min use the reno family — not just the
    // ceiling. Overriding only the cap would leave the $200K new-build sliver `min` gating a
    // reno-origin row (Independent/Guardian round-2), wrongly dropping a sub-$200K reno-escalation.
    // Undefined override (every non-escalated / additive / single-line path) → def.class, unchanged.
    const eff = capClassOverride || def.class;
    const cap = eff === 'build' ? config.archetypeT2BuildCap : config.archetypeT2RenoCap;
    const min = eff === 'build' ? config.archetypeT2BuildMin : 0;
    if (lineTotal <= cap && lineTotal >= min) {
      return { total: lineTotal, tier: 't2', area: basisArea, rejections };
    }
    rejections.push('t2_bound');
  }

  // ── T3: the rate table × the lead's OWN area (no derived-area invention) ──
  // config.archetypeRates values are PRE-RESOLVED premium-EXCLUSIVE per-sqm
  // (cost_per_sqm × escalation × adj — see resolveArchetypeRates), so the
  // premium is applied exactly once here, mirroring Spec 88 §2.1/§2.6/§2.9.
  const ratePerSqm = config.archetypeRates ? config.archetypeRates[def.rateKey] : null;
  if (ratePerSqm != null && ratePerSqm > 0 && ownArea != null) {
    const premium = Number.isFinite(row.neighbourhood_cost_premium) ? Number(row.neighbourhood_cost_premium) : 1.0;
    const t3 = ratePerSqm * ownArea * premium;
    // WF3 2026-07-06 (F2): a dedicated per-unit cap on T3 (rate × own area × premium). T3 was
    // shipped uncapped on the assumption own area is bounded; live data disproved it (19 rows
    // >$20M, max $159.9M) — the own-area basis is inflated by oversized/mislinked parent parcels.
    // Mirrors t1_cap: over-cap → reject to T4, never $0. Number.isFinite guard so a mis-seeded /
    // unregistered cap (undefined→NaN) degrades to UNCAPPED (today's behavior), never reject-all —
    // Zod (.positive().finite()) in both Muscles is the fail-fast primary defense (Independent #1).
    // CoA has no dwelling_units_created column → divisor degrades to 1 → flat $15M for CoA (intended).
    const t3Cap = Number(config.archetypeT3TotalCap) * Math.max(1, Number(row.dwelling_units_created) || 1);
    if (Number.isFinite(t3Cap) && t3 > t3Cap) {
      rejections.push('t3_cap');
    } else if (t3 > 0) {
      return { total: t3, tier: 't3', area: ownArea, rejections };
    }
  }

  return rejections.length ? { rejections } : null; // unpriceable → T4 (telemetry rides along)
}

/**
 * Pre-resolve archetype_cost_rates rows into { archetypeKey → premium-EXCLUSIVE
 * per-sqm rate } for config.archetypeRates. Single implementation shared by the
 * Muscle and the TS shim so the Spec 88 §2.9 escalation formula
 * (MAX(1, index_now ÷ index_base), never deflate; missing/invalid → 1.0)
 * cannot drift between the pipeline write path and the admin read path.
 *
 * @param {Array<{archetype:string, cost_per_sqm:number, cost_adjustment_factor:number, escalation_index_base:number}>} rateRows
 * @param {number|null|undefined} indexNow logic_variables.cost_escalation_index
 * @returns {Record<string, number>}
 */
function resolveArchetypeRates(rateRows, indexNow) {
  const out = {};
  const now = Number(indexNow);
  for (const r of rateRows || []) {
    const base = Number(r.escalation_index_base);
    const esc = Number.isFinite(now) && Number.isFinite(base) && base > 0
      ? Math.max(1, now / base)
      : 1;
    const per = Number(r.cost_per_sqm) * esc * (Number(r.cost_adjustment_factor) || 1);
    if (Number.isFinite(per) && per > 0) out[r.archetype] = per;
  }
  return out;
}

/**
 * The archetype path (Spec 83 §3-ARCHETYPE). Returns a full Brain envelope when the lead is
 * archetype-priced (or fit-blocked/zero-total → the 'none' envelope), or null → the caller falls
 * through to the legacy Steps A–D (T4). Entry gate: low-rise residential AND mapper non-null —
 * the MAPPER is the T4 discriminator (a MEC-only residential permit maps to null).
 */
/** Single source of truth for the Brain-row → mapper-input shape (used by the
 *  pricing path AND the Muscle's telemetry classifier — never build it twice). */
function buildMapperInput(row) {
  const slugs = [...new Set(Array.isArray(row.active_trade_slugs) ? row.active_trade_slugs : [])];
  return {
    projectType: row.project_type,
    scopeTags: row.scope_tags,
    structureType: row.structure_type,
    isCoa: row._is_coa === true,
    activeTradeCount: slugs.length,
  };
}

/**
 * Telemetry classifier for rows that FELL THROUGH to T4 — lets the Muscle
 * distinguish the non-residential bypass (mapper never called) from a genuine
 * mapper-null residential (the archetype_nofit_residential_warn_pct signal).
 * @returns {'not_lowrise'|'mapper_null'|'mapped'}
 */
function archetypeMapperOutcome(row) {
  if (!isLowRiseResidential(row.structure_type)) return 'not_lowrise';
  return mapToLines(buildMapperInput(row)) ? 'mapped' : 'mapper_null';
}

function tryArchetypeCost(row, config) {
  if (!config || !config.archetypeEnabled) return null;
  if (!isLowRiseResidential(row.structure_type)) return null;

  const mapped = mapToLines(buildMapperInput(row));
  if (!mapped) return null; // T4

  const telemetryBase = { _archetypeLines: mapped.lines, _archetypeMapKind: mapped.mapKind };

  // Additive pair: sum the two line TOTALS (each per-sqm × ITS OWN area — never one shared area).
  // T1 refinement deliberately skipped for pairs (two scopes, one declared area is ambiguous).
  if (mapped.lines.length === 2) {
    // capClass is only ever set on the escalated single-line result (undefined for additive
    // pairs) → the override is a harmless no-op here, forwarded for uniformity.
    const a = priceLine(row, mapped.lines[0], config, mapped.capClass);
    const b = priceLine(row, mapped.lines[1], config, mapped.capClass);
    const aOk = a && !a.fitBlocked && a.total != null;
    const bOk = b && !b.fitBlocked && b.total != null;
    if (aOk && bOk) {
      return archetypeEnvelope(row, config, {
        total: a.total + b.total,
        source: 'archetype_parcel',
        area: (a.area || 0) + (b.area || 0) || null,
        telemetry: { ...telemetryBase, _archetypeTier: 'additive', _archetypeRejections: [...a.rejections, ...b.rejections] },
      });
    }
    // One side unpriceable → fall back to the dominance winner alone.
    const single = aOk ? a : bOk ? b : null;
    if (single) {
      return archetypeEnvelope(row, config, {
        total: single.total,
        source: single.tier === 't1' ? 'archetype_declared_area' : single.tier === 't3' ? 'archetype_rate' : 'archetype_parcel',
        area: single.area,
        telemetry: { ...telemetryBase, _archetypeTier: single.tier, _archetypeRejections: single.rejections },
      });
    }
    if ((a && a.fitBlocked) || (b && b.fitBlocked)) {
      return archetypeNoneEnvelope(row, config, { ...telemetryBase, _archetypeFitBlocked: true });
    }
    if ((a && a.zeroTotal) || (b && b.zeroTotal)) {
      return archetypeNoneEnvelope(row, config, { ...telemetryBase, _archetypeZeroTotal: true });
    }
    return null; // both unpriceable → T4
  }

  const priced = priceLine(row, mapped.lines[0], config, mapped.capClass);
  if (priced && priced.fitBlocked) {
    return archetypeNoneEnvelope(row, config, { ...telemetryBase, _archetypeFitBlocked: true });
  }
  if (priced && priced.zeroTotal) {
    return archetypeNoneEnvelope(row, config, { ...telemetryBase, _archetypeZeroTotal: true });
  }
  if (priced && priced.total != null && priced.total > 0) {
    return archetypeEnvelope(row, config, {
      total: priced.total,
      source: priced.tier === 't1' ? 'archetype_declared_area' : priced.tier === 't3' ? 'archetype_rate' : 'archetype_parcel',
      area: priced.area,
      telemetry: { ...telemetryBase, _archetypeTier: priced.tier, _archetypeRejections: priced.rejections },
    });
  }
  // Mapped but unpriceable (no scalar, no own area) → the legacy path prices it as today (T4).
  return null;
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
  // ── WF2 #3 — permit_type_class gate (Spec 80 §5 + Spec 83 §3) ──────────
  // Short-circuit non-construction permits BEFORE running Step A (GFA),
  // Step B (Area_Eff), Step C (trade valuation), or Step D (Liar's Gate).
  // Eliminates the $29M-for-2-signs bug class where sign permits inherit
  // host-building GFA through the Surgical Triangle. Production SOURCE_SQL
  // uses COALESCE(ptc.class, 'unclassified') so this is never silently NULL.
  if (row.permit_type_class !== COST_SLICING_CLASS) {
    // premium_factor + complexity_score are properties of the permit's
    // location/characteristics, not of the cost model itself — compute them
    // for telemetry consistency (Gemini WF2 #3 review). The actual surgical
    // valuation steps (GFA → Area_Eff → trade rates → Liar's Gate) are
    // skipped because the Surgical Triangle does not apply to this class.
    return {
      permit_num:             row.permit_num,
      revision_num:           row.revision_num,
      estimated_cost:         null,
      cost_source:            'none',
      cost_tier:              null,
      cost_range_low:         null,
      cost_range_high:        null,
      premium_factor:         computePremiumFactor(row.avg_household_income, config),
      complexity_score:       computeComplexityScore(row),
      is_geometric_override:  false,
      modeled_gfa_sqm:        null,
      effective_area_sqm:     null,
      trade_contract_values:  {},
      _liarsGateOverride:     false,
      _zeroTotalBypass:       false,
      _usedFallback:          false,
      _permitTypeClassSkipped: true,
      _matrixMiss:            false,
      _matrixMissKey:         null,
    };
  }

  // ── §3-ARCHETYPE ladder (WF2 2026-07-06) ────────────────────────────────
  // Low-rise residential leads whose scope maps to a Spec 88 archetype line
  // are priced top-down from the parcel's precomputed archetype costs
  // (T1 declared-area → T2 parcel line total → T3 rate-table). Everything
  // else — mapper-null residential, non-residential, non-lowrise — falls
  // through to the legacy Steps A–D below (the T4 path), unchanged.
  const archetypeResult = tryArchetypeCost(row, config);
  if (archetypeResult) return archetypeResult;

  // ── Input sanitization (spec 83 §3 Step 1 — W12, W21) ──────────────────
  const rawCost = Number.isFinite(row.est_const_cost) ? row.est_const_cost : null;

  // ── Step A: Geometric Truth ─────────────────────────────────────────────
  const { gfa, usedFallback, modeledGfaSqm } = computeGfa(row, config);

  // ── Step B: Effective Work Area ─────────────────────────────────────────
  const { areaEff, matrixKey } = gfa > 0
    ? computeEffectiveArea(row, gfa, config)
    : { areaEff: 0, matrixKey: null };

  // ── Step B.1 — Matrix-miss safe-skip (WF3 Pass-2.5 Finding D) ───────────
  // When the Surgical Triangle has no row for this permit_type×structure_type
  // pair, areaEff is null. Defaulting to full GFA (the pre-fix behavior) made
  // a 119m² plumbing permit on a 46K-sqm office produce a $14M cost. Safe-skip
  // returns an envelope byte-symmetric with the permit_type_class!=construction
  // short-circuit above. Operator backfills the matrix via Spec 86 / SQL
  // fallback once the audit_table's `matrix_miss_top_keys` exposes which pairs
  // are hot. premium_factor + complexity_score are still computed for telemetry
  // consistency (matching the non-construction short-circuit's contract).
  if (areaEff === null) {
    return {
      permit_num:             row.permit_num,
      revision_num:           row.revision_num,
      estimated_cost:         null,
      cost_source:            'none',
      cost_tier:              null,
      cost_range_low:         null,
      cost_range_high:        null,
      premium_factor:         computePremiumFactor(row.avg_household_income, config),
      complexity_score:       computeComplexityScore(row),
      is_geometric_override:  false,
      modeled_gfa_sqm:        null,
      effective_area_sqm:     null,
      trade_contract_values:  {},
      _liarsGateOverride:     false,
      _zeroTotalBypass:       false,
      _usedFallback:          false,
      _matrixMiss:            true,
      _matrixMissKey:         matrixKey,
    };
  }

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
  const permitDeclaredCostCeiling = (config && Number.isFinite(config.permitDeclaredCostCeiling))
    ? config.permitDeclaredCostCeiling : Infinity;
  const gate = applyLiarsGate(rawCost, surgicalTotal, tradeValues, liarThreshold, usedFallback, permitDeclaredCostCeiling);

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
    _matrixMiss:            false,
    _matrixMissKey:         null,
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
  // §3-ARCHETYPE ladder (for unit testing + Muscle/shim config assembly)
  tryArchetypeCost,
  priceLine,
  sliceArchetypeTotal,
  resolveArchetypeRates,
  archetypeMapperOutcome,
  ARCHETYPE_RANGE_PCT,
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
