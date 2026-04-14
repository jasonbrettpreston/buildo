// 🔗 SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §Implementation
// 🔗 ADR: docs/adr/001-dual-code-path.md — dual TS↔JS path is an explicit design choice; do not re-litigate in review
// 🔗 DUAL CODE PATH: scripts/compute-cost-estimates.js (inline JS port) — per
// CLAUDE.md §7, these files MUST stay in sync. Any change to BASE_RATES,
// PREMIUM_TIERS, SCOPE_ADDITIONS, COST_TIER_BOUNDARIES, or COMPLEXITY_SIGNALS
// must land in BOTH. A future hardening WF can extract to a shared JSON file
// consumable by both.
//
// Pure function — no DB, no side effects, no throws on well-typed input.

import type { CostEstimate, CostSource, CostTier } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Input interfaces — narrow, lib-local shapes (not re-exported from
// @/lib/permits/types to keep the surface tight)
// ---------------------------------------------------------------------------

/**
 * Full cost-model output — a CostEstimate row plus the pre-formatted
 * `display` string used by the lead card UI. The DB row doesn't persist
 * `display` (it's derived at read time), but the pipeline script and the
 * lead feed both need it, so the function returns it inline.
 */
export type CostModelResult = CostEstimate & { display: string };

export interface CostModelPermitInput {
  permit_num: string;
  revision_num: string;
  permit_type: string | null;
  structure_type: string | null;
  work: string | null;
  est_const_cost: number | null;
  scope_tags: string[] | null;
  dwelling_units_created: number | null;
  storeys: number | null;
}

export interface CostModelParcelInput {
  lot_size_sqm: number | null;
  frontage_m: number | null;
}

export interface CostModelFootprintInput {
  footprint_area_sqm: number | null;
  estimated_stories: number | null;
}

export interface CostModelNeighbourhoodInput {
  avg_household_income: number | null;
  tenure_renter_pct: number | null;
}

// ---------------------------------------------------------------------------
// Constants — MUST match compute-cost-estimates.js byte-for-byte
// ---------------------------------------------------------------------------

/** Base rate per square metre by category. Spec 72 §Implementation table, midpoint values. */
export const BASE_RATES = {
  sfd: 3000,          // New residential (SFD) $2500-$3500
  semi_town: 2600,    // New residential (semi/town) $2200-$3000
  multi_res: 3400,    // New multi-residential $2800-$4000
  addition: 2000,     // Addition/alteration $1500-$2500
  commercial: 4000,   // Commercial new build $3000-$5000
  interior_reno: 1150, // Interior renovation $800-$1500
} as const;

/** Neighbourhood premium factor from avg_household_income. Spec 72 §Implementation. */
export const PREMIUM_TIERS = [
  { min: 0, max: 60_000, multiplier: 1.0 },
  { min: 60_000, max: 100_000, multiplier: 1.15 },
  { min: 100_000, max: 150_000, multiplier: 1.35 },
  { min: 150_000, max: 200_000, multiplier: 1.6 },
  { min: 200_000, max: null, multiplier: 1.85 },
] as const;

/** Scope complexity additions. Spec 72 §Implementation. Additive, not multiplicative. */
export const SCOPE_ADDITIONS = {
  pool: 80_000,
  elevator: 60_000,
  underpinning: 40_000,
  solar: 25_000,
} as const;

/** Cost tier boundaries. Spec 72 §Implementation table. Boundaries inclusive on lower bound. */
export const COST_TIER_BOUNDARIES = {
  small: { min: 0, max: 100_000, display: 'Small Job' },
  medium: { min: 100_000, max: 500_000, display: 'Medium Job' },
  large: { min: 500_000, max: 2_000_000, display: 'Large Job' },
  major: { min: 2_000_000, max: 10_000_000, display: 'Major Project' },
  mega: { min: 10_000_000, max: null, display: 'Mega Project' },
} as const;

/** Complexity score signals. Spec 72 §Implementation. Capped at 100 via Math.min. */
export const COMPLEXITY_SIGNALS = {
  highRise: 30,       // stories > 6
  multiUnit: 20,      // dwelling_units > 4
  largeFootprint: 15, // footprint > 300 sqm
  premiumNbhd: 15,    // income > 150K
  complexScope: 10,   // each of pool / elevator / underpinning
  newBuild: 10,       // new build vs renovation
} as const;

const FALLBACK_URBAN_COVERAGE = 0.7;
const FALLBACK_SUBURBAN_COVERAGE = 0.4;
const FALLBACK_RESIDENTIAL_FLOORS = 2;
const FALLBACK_COMMERCIAL_FLOORS = 1;
const MODEL_RANGE_PCT = 0.25;
const FALLBACK_RANGE_PCT = 0.5;
const PLACEHOLDER_COST_THRESHOLD = 1000;

/**
 * Liar's Gate default threshold. When a permit's reported `est_const_cost`
 * is less than `modelCost * LIAR_GATE_THRESHOLD_DEFAULT`, the reported
 * value is considered fee-minimization and overridden with the geometric
 * model. Mirrors `LIAR_GATE_THRESHOLD` fallback in
 * `scripts/compute-cost-estimates.js`. Operator overrides via
 * `logic_variables.liar_gate_threshold` in the pipeline runtime; the
 * TS read-path accepts the override via the `config` parameter of
 * `estimateCost`.
 */
export const LIAR_GATE_THRESHOLD_DEFAULT = 0.25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNewBuild(permit: CostModelPermitInput): boolean {
  const pt = (permit.permit_type ?? '').toLowerCase();
  return pt.includes('new building') || pt.includes('new construction');
}

function isResidential(permit: CostModelPermitInput): boolean {
  const st = (permit.structure_type ?? '').toLowerCase();
  return (
    st.includes('dwelling') ||
    st.includes('residential') ||
    st.includes('detached') ||
    st.includes('semi') ||
    st.includes('town')
  );
}

function isCommercial(permit: CostModelPermitInput): boolean {
  const st = (permit.structure_type ?? '').toLowerCase();
  return st.includes('commercial') || st.includes('office') || st.includes('retail');
}

/**
 * Map a permit to a per-sqm base rate per spec 72 §Implementation table.
 *
 * **Known gap:** spec 72 only enumerates 6 categories: SFD, semi/town,
 * multi-residential, addition/alteration, commercial new build, interior
 * renovation. Real Toronto permits include "Institutional", "Industrial",
 * "Mixed-Use", and other structure types that fall through this dispatch.
 * The current behaviour is:
 *   - new builds with unrecognized structure_type → fall through to SFD rate
 *   - renovations with unrecognized permit_type → fall through to interior_reno
 * This is a deliberate "best-effort default" pending a spec 72 update that
 * adds explicit Institutional / Industrial / Mixed-Use rates. Tracked in
 * `docs/reports/review_followups.md` as MED-priority "Future spec 72 update".
 * Don't add these branches in cost-model.ts in isolation — they must land
 * with matching constants in `compute-cost-estimates.js` (dual code path).
 */
function determineBaseRate(permit: CostModelPermitInput): number {
  const st = (permit.structure_type ?? '').toLowerCase();
  const newBuild = isNewBuild(permit);

  if (newBuild) {
    if (st.includes('multi') || st.includes('apartment') || st.includes('condo')) {
      return BASE_RATES.multi_res;
    }
    if (st.includes('semi') || st.includes('town')) {
      return BASE_RATES.semi_town;
    }
    if (isCommercial(permit)) {
      return BASE_RATES.commercial;
    }
    if (isResidential(permit)) {
      return BASE_RATES.sfd;
    }
    return BASE_RATES.sfd; // default to SFD for unknown residential
  }

  // Renovation / alteration path. Check "interior" BEFORE "alteration" so
  // "Interior Alteration" gets the interior_reno rate, not addition.
  const pt = (permit.permit_type ?? '').toLowerCase();
  const work = (permit.work ?? '').toLowerCase();
  if (pt.includes('interior') || work.includes('interior')) {
    return BASE_RATES.interior_reno;
  }
  if (pt.includes('addition') || pt.includes('alteration') || work.includes('addition')) {
    return BASE_RATES.addition;
  }
  return BASE_RATES.interior_reno;
}

function computePremiumFactor(neighbourhood: CostModelNeighbourhoodInput | null): number {
  const income = neighbourhood?.avg_household_income;
  if (income === null || income === undefined) return 1.0;
  for (const tier of PREMIUM_TIERS) {
    if (income >= tier.min && (tier.max === null || income < tier.max)) {
      return tier.multiplier;
    }
  }
  return 1.0;
}

function computeBuildingArea(
  permit: CostModelPermitInput,
  parcel: CostModelParcelInput | null,
  footprint: CostModelFootprintInput | null,
  neighbourhood: CostModelNeighbourhoodInput | null,
): { area: number; usedFallback: boolean } {
  // Preferred path: real footprint × stories
  if (
    footprint &&
    footprint.footprint_area_sqm !== null &&
    footprint.estimated_stories !== null &&
    footprint.footprint_area_sqm > 0
  ) {
    return {
      area: footprint.footprint_area_sqm * footprint.estimated_stories,
      usedFallback: false,
    };
  }

  // Urban-aware fallback from parcel + neighbourhood
  if (parcel && parcel.lot_size_sqm !== null && parcel.lot_size_sqm > 0) {
    const rentPct = neighbourhood?.tenure_renter_pct ?? 0;
    const coverage =
      rentPct > 50 ? FALLBACK_URBAN_COVERAGE : FALLBACK_SUBURBAN_COVERAGE;
    const floors = isCommercial(permit)
      ? FALLBACK_COMMERCIAL_FLOORS
      : FALLBACK_RESIDENTIAL_FLOORS;
    return { area: parcel.lot_size_sqm * coverage * floors, usedFallback: true };
  }

  return { area: 0, usedFallback: true };
}

function sumScopeAdditions(tags: string[] | null): number {
  if (!tags) return 0;
  // DEDUP via Set BEFORE iterating: PostgreSQL TEXT[] does not enforce
  // uniqueness, and the upstream classifier + inspector edits can
  // append duplicate tags (e.g., ['pool', 'pool']). Without the
  // Set, a duplicate 'pool' adds $80K TWICE — inflating the
  // estimate by tens of thousands and corrupting the value_score
  // pillar. Caught by user-supplied Gemini holistic review 2026-04-09.
  // WF3-06: `(t ?? '')` guard — PostgreSQL TEXT[] permits NULL elements
  // (ARRAY['pool', NULL, 'elevator']). JS uses the same `(t || '')`
  // defence; without it, a null element throws on .toLowerCase().
  const unique = new Set(tags.map((t) => (t ?? '').toLowerCase()));
  let total = 0;
  for (const norm of unique) {
    if (norm === 'pool') total += SCOPE_ADDITIONS.pool;
    else if (norm === 'elevator') total += SCOPE_ADDITIONS.elevator;
    else if (norm === 'underpinning') total += SCOPE_ADDITIONS.underpinning;
    else if (norm === 'solar') total += SCOPE_ADDITIONS.solar;
  }
  return total;
}

function determineCostTier(cost: number): CostTier {
  if (cost < COST_TIER_BOUNDARIES.medium.min) return 'small';
  if (cost < COST_TIER_BOUNDARIES.large.min) return 'medium';
  if (cost < COST_TIER_BOUNDARIES.major.min) return 'large';
  if (cost < COST_TIER_BOUNDARIES.mega.min) return 'major';
  return 'mega';
}

function tierDisplay(tier: CostTier): string {
  return COST_TIER_BOUNDARIES[tier].display;
}

function computeComplexityScore(
  permit: CostModelPermitInput,
  footprint: CostModelFootprintInput | null,
  neighbourhood: CostModelNeighbourhoodInput | null,
): number {
  let score = 0;
  const stories = permit.storeys ?? footprint?.estimated_stories ?? 0;
  if (stories > 6) score += COMPLEXITY_SIGNALS.highRise;
  if ((permit.dwelling_units_created ?? 0) > 4) score += COMPLEXITY_SIGNALS.multiUnit;
  if ((footprint?.footprint_area_sqm ?? 0) > 300) score += COMPLEXITY_SIGNALS.largeFootprint;
  if ((neighbourhood?.avg_household_income ?? 0) > 150_000) {
    score += COMPLEXITY_SIGNALS.premiumNbhd;
  }
  // Same dedup pattern as sumScopeAdditions — duplicate tags would
  // double-count the +10 complexity signal per category. `(t ?? '')`
  // guards against NULL elements in a PostgreSQL TEXT[] — see
  // sumScopeAdditions above for the full rationale.
  const uniqueTags = new Set(
    (permit.scope_tags ?? []).map((t) => (t ?? '').toLowerCase()),
  );
  for (const norm of uniqueTags) {
    if (norm === 'pool' || norm === 'elevator' || norm === 'underpinning') {
      score += COMPLEXITY_SIGNALS.complexScope;
    }
  }
  if (isNewBuild(permit)) score += COMPLEXITY_SIGNALS.newBuild;
  return Math.min(100, score);
}

function formatDollarShort(cost: number): string {
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1000) return `$${Math.round(cost / 1000)}K`;
  return `$${Math.round(cost)}`;
}

function formatDollarFull(cost: number): string {
  return `$${Math.round(cost).toLocaleString('en-US')}`;
}

function buildDisplay(
  cost: number | null,
  tier: CostTier | null,
  source: 'permit' | 'model',
  low: number | null,
  high: number | null,
  premiumFactor: number,
  complexityScore: number,
): string {
  const parts: string[] = [];
  if (cost === null || tier === null) {
    return 'Cost estimate unavailable';
  }

  if (source === 'permit') {
    parts.push(formatDollarFull(cost));
  } else if (low !== null && high !== null) {
    parts.push(`${formatDollarShort(low)}–${formatDollarShort(high)} estimated`);
  } else {
    parts.push(`${formatDollarShort(cost)} estimated`);
  }

  parts.push(tierDisplay(tier));
  // "Premium neighbourhood" threshold = the $100k-$150k income band's
  // multiplier. Phase 3-holistic WF3 Phase F (Gemini Phase 0-3 HIGH):
  // the previous implementation used `PREMIUM_TIERS[2]` which silently
  // points to whatever row is third — reordering or inserting a tier
  // would shift the label to the wrong band. Looking up by the exact
  // income band anchors the threshold semantically.
  const PREMIUM_LABEL_BAND = PREMIUM_TIERS.find((t) => t.min === 100_000);
  const PREMIUM_LABEL_THRESHOLD = PREMIUM_LABEL_BAND?.multiplier ?? 1.35;
  if (premiumFactor >= PREMIUM_LABEL_THRESHOLD) parts.push('Premium neighbourhood');
  if (complexityScore >= 40) parts.push('Complex scope');

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Per-trade allocation percentages (slug → fraction of total cost).
 * Passed in because the pipeline loads operator overrides from
 * `trade_configurations.allocation_pct`; the TS read-path accepts the
 * same shape so the JS↔TS parity contract is real, not cosmetic.
 */
export type TradeAllocationPct = Record<string, number>;

/**
 * Runtime config for `estimateCost`. Both fields are optional and
 * default to the same fallbacks the JS pipeline uses before it loads
 * Control Panel overrides.
 */
export interface EstimateCostConfig {
  /** Override for `LIAR_GATE_THRESHOLD_DEFAULT` (0.25). */
  liarGateThreshold?: number;
  /** Per-trade allocation percentages. Defaults to `{}` → no slicing. */
  tradeAllocationPct?: TradeAllocationPct;
}

/** The Slicer: per-trade dollar values from total cost. Mirrors JS sliceTradeValues. */
function sliceTradeValues(
  totalCost: number | null,
  pct: TradeAllocationPct,
): Record<string, number> {
  if (totalCost == null || totalCost <= 0) return {};
  const out: Record<string, number> = {};
  for (const [slug, p] of Object.entries(pct)) {
    const val = Math.round(totalCost * p);
    if (val > 0) out[slug] = val;
  }
  return out;
}

/**
 * Estimate construction cost for a permit. Pure function — no DB, no side
 * effects. Returns a CostEstimate matching the `cost_estimates` table row
 * shape. The pipeline script `compute-cost-estimates.js` is the only writer
 * to that table; the lead feed API reads from the cache. This function
 * exists as a dual-path parity checker (CLAUDE.md §7.1) — if this function
 * and `estimateCostInline` in the JS script disagree on any input, the
 * parity battery test in `src/tests/cost-model.logic.test.ts` fails.
 */
export function estimateCost(
  permit: CostModelPermitInput,
  parcel: CostModelParcelInput | null,
  footprint: CostModelFootprintInput | null,
  neighbourhood: CostModelNeighbourhoodInput | null,
  config: EstimateCostConfig = {},
): CostModelResult {
  const now = new Date();
  const liarGateThreshold = config.liarGateThreshold ?? LIAR_GATE_THRESHOLD_DEFAULT;
  const tradeAllocationPct = config.tradeAllocationPct ?? {};

  // WF3-06 (H-W9): Always compute the geometric model so Path 1 can
  // run the Liar's Gate. Mirrors JS estimateCostInline L221-225.
  const { area, usedFallback } = computeBuildingArea(
    permit,
    parcel,
    footprint,
    neighbourhood,
  );
  const baseRate = determineBaseRate(permit);
  const premiumFactor = computePremiumFactor(neighbourhood);
  const scopeAdditions = sumScopeAdditions(permit.scope_tags);
  const modelCost = area > 0 ? area * baseRate * premiumFactor + scopeAdditions : 0;
  const complexity = computeComplexityScore(permit, footprint, neighbourhood);
  const modeledGfaSqm = area > 0 ? area : null;

  let estimatedCost: number | null;
  let costSource: CostSource;
  let isGeometricOverride = false;

  // Path 1: permit-reported cost above placeholder threshold.
  if (
    permit.est_const_cost !== null &&
    permit.est_const_cost > PLACEHOLDER_COST_THRESHOLD
  ) {
    // WF3-06 (H-W9): THE LIAR'S GATE. If reported cost is less than
    // modelCost × threshold, the permit is likely fee-minimization.
    // Override with the geometric estimate. Suppressed when
    // usedFallback=true — the lot-size fallback has ±50% uncertainty
    // and can dramatically overstate cost for small renos on large
    // lots (JS L241 carve-out, mirrored byte-for-byte).
    if (
      modelCost > 0 &&
      !usedFallback &&
      permit.est_const_cost < modelCost * liarGateThreshold
    ) {
      estimatedCost = modelCost;
      costSource = 'model';
      isGeometricOverride = true;
    } else {
      estimatedCost = permit.est_const_cost;
      costSource = 'permit';
    }
  } else if (area > 0) {
    // Path 2: no reported cost → use model.
    estimatedCost = modelCost;
    costSource = 'model';
  } else {
    // Path 3: no reported cost AND no geometry → null.
    return {
      permit_num: permit.permit_num,
      revision_num: permit.revision_num,
      estimated_cost: null,
      cost_source: 'model',
      cost_tier: null,
      cost_range_low: null,
      cost_range_high: null,
      premium_factor: premiumFactor,
      complexity_score: complexity,
      model_version: 1,
      computed_at: now,
      is_geometric_override: false,
      modeled_gfa_sqm: null,
      trade_contract_values: {},
      display: buildDisplay(null, null, 'model', null, null, premiumFactor, complexity),
    };
  }

  const rangePct =
    costSource === 'permit' && !isGeometricOverride
      ? 0 // permit-reported costs have no range
      : usedFallback
        ? FALLBACK_RANGE_PCT
        : MODEL_RANGE_PCT;
  const low = rangePct > 0 ? estimatedCost * (1 - rangePct) : estimatedCost;
  const high = rangePct > 0 ? estimatedCost * (1 + rangePct) : estimatedCost;
  const tier = determineCostTier(estimatedCost);

  return {
    permit_num: permit.permit_num,
    revision_num: permit.revision_num,
    estimated_cost: estimatedCost,
    cost_source: costSource,
    cost_tier: tier,
    cost_range_low: low,
    cost_range_high: high,
    premium_factor: premiumFactor,
    complexity_score: complexity,
    model_version: 1,
    computed_at: now,
    is_geometric_override: isGeometricOverride,
    modeled_gfa_sqm: modeledGfaSqm,
    trade_contract_values: sliceTradeValues(estimatedCost, tradeAllocationPct),
    display: buildDisplay(estimatedCost, tier, costSource, low, high, premiumFactor, complexity),
  };
}
