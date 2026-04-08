// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md §Implementation
// 🔗 DUAL CODE PATH: scripts/compute-cost-estimates.js (inline JS port) — per
// CLAUDE.md §7, these files MUST stay in sync. Any change to BASE_RATES,
// PREMIUM_TIERS, SCOPE_ADDITIONS, COST_TIER_BOUNDARIES, or COMPLEXITY_SIGNALS
// must land in BOTH. A future hardening WF can extract to a shared JSON file
// consumable by both.
//
// Pure function — no DB, no side effects, no throws on well-typed input.

import type { CostEstimate, CostTier } from '@/lib/permits/types';

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

  // Renovation / alteration path
  const pt = (permit.permit_type ?? '').toLowerCase();
  const work = (permit.work ?? '').toLowerCase();
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
  let total = 0;
  for (const tag of tags) {
    const norm = tag.toLowerCase();
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
  const tags = permit.scope_tags ?? [];
  for (const tag of tags) {
    const norm = tag.toLowerCase();
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
  if (premiumFactor >= 1.35) parts.push('Premium neighbourhood');
  if (complexityScore >= 40) parts.push('Complex scope');

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Estimate construction cost for a permit. Pure function — no DB, no side
 * effects. Returns a CostEstimate matching the `cost_estimates` table row
 * shape. The pipeline script `compute-cost-estimates.js` is the only writer
 * to that table; the lead feed API reads from the cache.
 */
export function estimateCost(
  permit: CostModelPermitInput,
  parcel: CostModelParcelInput | null,
  footprint: CostModelFootprintInput | null,
  neighbourhood: CostModelNeighbourhoodInput | null,
): CostModelResult {
  const now = new Date();

  // Path 1: permit-reported cost above placeholder threshold
  if (
    permit.est_const_cost !== null &&
    permit.est_const_cost > PLACEHOLDER_COST_THRESHOLD
  ) {
    const cost = permit.est_const_cost;
    const tier = determineCostTier(cost);
    const complexity = computeComplexityScore(permit, footprint, neighbourhood);
    const premiumFactor = computePremiumFactor(neighbourhood);
    return {
      permit_num: permit.permit_num,
      revision_num: permit.revision_num,
      estimated_cost: cost,
      cost_source: 'permit',
      cost_tier: tier,
      cost_range_low: cost,
      cost_range_high: cost,
      premium_factor: premiumFactor,
      complexity_score: complexity,
      model_version: 1,
      computed_at: now,
      display: buildDisplay(cost, tier, 'permit', cost, cost, premiumFactor, complexity),
    };
  }

  // Path 2: model-based estimate
  const { area, usedFallback } = computeBuildingArea(
    permit,
    parcel,
    footprint,
    neighbourhood,
  );
  const baseRate = determineBaseRate(permit);
  const premiumFactor = computePremiumFactor(neighbourhood);
  const scopeAdditions = sumScopeAdditions(permit.scope_tags);
  const rawCost = area * baseRate * premiumFactor + scopeAdditions;

  // If we have no area at all, we can't estimate a cost
  if (area <= 0) {
    const complexity = computeComplexityScore(permit, footprint, neighbourhood);
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
      display: buildDisplay(null, null, 'model', null, null, premiumFactor, complexity),
    };
  }

  const rangePct = usedFallback ? FALLBACK_RANGE_PCT : MODEL_RANGE_PCT;
  const low = rawCost * (1 - rangePct);
  const high = rawCost * (1 + rangePct);
  const tier = determineCostTier(rawCost);
  const complexity = computeComplexityScore(permit, footprint, neighbourhood);

  return {
    permit_num: permit.permit_num,
    revision_num: permit.revision_num,
    estimated_cost: rawCost,
    cost_source: 'model',
    cost_tier: tier,
    cost_range_low: low,
    cost_range_high: high,
    premium_factor: premiumFactor,
    complexity_score: complexity,
    model_version: 1,
    computed_at: now,
    display: buildDisplay(rawCost, tier, 'model', low, high, premiumFactor, complexity),
  };
}
