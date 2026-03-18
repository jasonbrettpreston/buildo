import type { Permit, TradeMappingRule, TradeMatch, ProductMatch } from '@/lib/permits/types';
import { getTradeById, getTradeBySlug } from '@/lib/classification/trades';
import { determinePhase, isTradeActiveInPhase } from '@/lib/classification/phases';
import { calculateLeadScore } from '@/lib/classification/scoring';
import { lookupTradesForTags } from '@/lib/classification/tag-trade-matrix';
import { lookupProductsForTags } from '@/lib/classification/tag-product-matrix';
import { PRODUCT_GROUPS } from '@/lib/classification/products';

// ---------------------------------------------------------------------------
// Default confidence values per tier
// ---------------------------------------------------------------------------
const TIER_CONFIDENCE: Record<number, number> = {
  1: 0.95,
  2: 0.80,
};

// ---------------------------------------------------------------------------
// Matching helpers (kept for Tier 1 rule matching)
// ---------------------------------------------------------------------------

function fieldMatches(
  fieldValue: string | undefined | null,
  pattern: string,
  tier: number
): { matched: boolean; strength: number } {
  if (!fieldValue) return { matched: false, strength: 0 };

  const normValue = fieldValue.toLowerCase().trim();
  const normPattern = pattern.toLowerCase().trim();

  if (tier === 3) {
    try {
      const re = new RegExp(normPattern, 'i');
      const match = re.test(fieldValue);
      if (!match) return { matched: false, strength: 0 };
      // Flat confidence for keyword matches — long descriptions should not
      // be penalized vs short ones when the keyword is clearly present.
      return { matched: true, strength: 0.65 };
    } catch {
      const matched = normValue.includes(normPattern);
      return { matched, strength: matched ? 0.65 : 0 };
    }
  }

  const matched = normValue.includes(normPattern);
  return { matched, strength: matched ? 1 : 0 };
}

function getFieldValue(permit: Partial<Permit>, matchField: string): string | undefined | null {
  switch (matchField) {
    case 'permit_type':
      return permit.permit_type;
    case 'work':
      return permit.work;
    case 'description':
      return permit.description;
    case 'structure_type':
      return permit.structure_type;
    case 'current_use':
      return permit.current_use;
    case 'proposed_use':
      return permit.proposed_use;
    default:
      return (permit as Record<string, unknown>)[matchField] as string | undefined;
  }
}

// ---------------------------------------------------------------------------
// Permit code scope limiting
// ---------------------------------------------------------------------------

export function extractPermitCode(permitNum: string | undefined): string | null {
  if (!permitNum) return null;
  const match = permitNum.match(/\s([A-Z]{2,4})(?:\s|$)/);
  return match ? match[1] : null;
}

/**
 * Narrow-scope permit codes that restrict classification to specific trades.
 */
export const NARROW_SCOPE_CODES: Record<string, string[]> = {
  PLB: ['plumbing'],
  PSA: ['plumbing'],
  HVA: ['hvac'],
  MSA: ['hvac'],
  DRN: ['drain-plumbing'],
  STS: ['drain-plumbing'],
  FSU: ['fire-protection'],
  DEM: ['demolition'],
  SHO: ['excavation', 'shoring', 'concrete', 'waterproofing'],
  FND: ['excavation', 'concrete', 'waterproofing', 'shoring'],
  TPS: ['framing', 'electrical'],
  PCL: ['electrical', 'plumbing', 'hvac'],
};

const WORK_SCOPE_EXCLUSIONS: Record<string, string[]> = {
  'Interior Alterations': ['excavation', 'shoring', 'roofing', 'landscaping', 'waterproofing', 'pool-installation', 'temporary-fencing', 'decking-fences', 'eavestrough-siding', 'solar'],
  'Underpinning': ['roofing', 'glazing', 'landscaping', 'elevator', 'painting', 'flooring', 'tiling', 'trim-work', 'millwork-cabinetry', 'stone-countertops', 'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar', 'caulking'],
  'Re-Roofing': ['excavation', 'shoring', 'concrete', 'elevator', 'landscaping', 'tiling', 'trim-work', 'millwork-cabinetry', 'stone-countertops', 'decking-fences', 'pool-installation'],
  'Re-Cladding': ['excavation', 'shoring', 'elevator', 'landscaping', 'tiling', 'trim-work', 'millwork-cabinetry', 'stone-countertops', 'decking-fences', 'pool-installation'],
  'Fire Alarm': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel', 'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops', 'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar', 'temporary-fencing', 'caulking'],
  'Sprinklers': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel', 'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops', 'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar', 'temporary-fencing', 'caulking'],
  'Electromagnetic Locks': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel', 'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops', 'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar', 'temporary-fencing', 'caulking'],
  'Elevator': ['excavation', 'shoring', 'roofing', 'landscaping', 'demolition', 'masonry', 'insulation', 'painting', 'waterproofing', 'decking-fences', 'pool-installation', 'solar', 'temporary-fencing'],
  'Demolition': ['framing', 'roofing', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'landscaping', 'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops', 'caulking', 'solar', 'security', 'pool-installation', 'decking-fences'],
  'Deck': ['elevator', 'shoring', 'structural-steel', 'pool-installation', 'solar'],
  'Porch': ['elevator', 'shoring', 'structural-steel', 'pool-installation', 'solar'],
  'Garage': ['elevator', 'landscaping', 'pool-installation'],
  'Garage Repair/Reconstruction': ['elevator', 'landscaping', 'pool-installation'],
};

export function applyScopeLimit(
  matches: TradeMatch[],
  permitNum: string | undefined,
  work: string | undefined
): TradeMatch[] {
  const code = extractPermitCode(permitNum);

  if (code && NARROW_SCOPE_CODES[code]) {
    const allowed = NARROW_SCOPE_CODES[code];
    return matches.filter((m) => allowed.includes(m.trade_slug));
  }

  if (work) {
    const workLower = work.toLowerCase();
    for (const [workPattern, excluded] of Object.entries(WORK_SCOPE_EXCLUSIONS)) {
      if (workLower.includes(workPattern.toLowerCase())) {
        return matches.filter((m) => !excluded.includes(m.trade_slug));
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Tier 1 rule matching (unchanged)
// ---------------------------------------------------------------------------

function matchTier1Rules(
  permit: Partial<Permit>,
  rules: TradeMappingRule[],
  phase: string
): TradeMatch[] {
  const matchMap = new Map<number, TradeMatch>();
  const activeRules = rules.filter((r) => r.is_active && r.tier === 1);

  for (const rule of activeRules) {
    const fieldValue = getFieldValue(permit, rule.match_field);
    const { matched } = fieldMatches(fieldValue, rule.match_pattern, rule.tier);
    if (!matched) continue;

    const trade = getTradeById(rule.trade_id);
    if (!trade) continue;

    const confidence = rule.confidence > 0 ? rule.confidence : (TIER_CONFIDENCE[1] ?? 0.95);
    const isActive = isTradeActiveInPhase(trade.slug, phase);

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 1,
      confidence,
      is_active: isActive,
      phase,
    };

    const leadScore = calculateLeadScore(permit, partial, phase);

    const tradeMatch: TradeMatch = {
      permit_num: permit.permit_num ?? '',
      revision_num: permit.revision_num ?? '',
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 1,
      confidence,
      is_active: isActive,
      phase,
      lead_score: leadScore,
    };

    const existing = matchMap.get(trade.id);
    if (!existing || existing.confidence < tradeMatch.confidence) {
      matchMap.set(trade.id, tradeMatch);
    }
  }

  return Array.from(matchMap.values());
}

// ---------------------------------------------------------------------------
// Tag-matrix matching (replaces Tier 2/3)
// ---------------------------------------------------------------------------

function matchTagMatrix(
  permit: Partial<Permit>,
  scopeTags: string[],
  phase: string
): TradeMatch[] {
  const tagMatches = lookupTradesForTags(scopeTags);
  const results: TradeMatch[] = [];

  for (const { tradeSlug, confidence } of tagMatches) {
    const trade = getTradeBySlug(tradeSlug);
    if (!trade) continue;

    const isActive = isTradeActiveInPhase(tradeSlug, phase);

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 2, // tag-matrix matches are reported as tier 2
      confidence,
      is_active: isActive,
      phase,
    };

    const leadScore = calculateLeadScore(permit, partial, phase);

    results.push({
      permit_num: permit.permit_num ?? '',
      revision_num: permit.revision_num ?? '',
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 2,
      confidence,
      is_active: isActive,
      phase,
      lead_score: leadScore,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tier 1 Work-Field Fallback — replaces deprecated Tier 3
// ---------------------------------------------------------------------------

interface WorkFallback {
  slugs: string[];
  confidence: number;
}

/**
 * Maps common `work` field values to trade slug arrays.
 * Used as Tier 1 fallback when no Tier 1 rules or tag-matrix matches fire.
 */
const WORK_TRADE_FALLBACK: Record<string, WorkFallback> = {
  'Interior Alterations':       { slugs: ['drywall', 'painting', 'flooring', 'electrical', 'plumbing'], confidence: 0.70 },
  'New Building':               { slugs: ['framing', 'concrete', 'excavation', 'plumbing', 'electrical', 'hvac', 'drywall', 'roofing', 'insulation'], confidence: 0.65 },
  'Addition':                   { slugs: ['framing', 'concrete', 'plumbing', 'electrical', 'hvac', 'drywall', 'insulation'], confidence: 0.65 },
  'Re-Roofing':                 { slugs: ['roofing'], confidence: 0.85 },
  'Re-Cladding':                { slugs: ['masonry', 'glazing', 'insulation'], confidence: 0.75 },
  'Underpinning':               { slugs: ['shoring', 'concrete', 'excavation', 'waterproofing'], confidence: 0.80 },
  'Demolition':                 { slugs: ['demolition'], confidence: 0.85 },
  'Deck':                       { slugs: ['framing', 'concrete'], confidence: 0.75 },
  'Porch':                      { slugs: ['framing', 'concrete', 'masonry'], confidence: 0.70 },
  'Garage':                     { slugs: ['framing', 'concrete', 'electrical', 'drywall'], confidence: 0.70 },
  'Garage Repair':              { slugs: ['framing', 'concrete', 'masonry'], confidence: 0.70 },
  'Fire Alarm':                 { slugs: ['fire-protection', 'electrical'], confidence: 0.85 },
  'Sprinklers':                 { slugs: ['fire-protection', 'plumbing'], confidence: 0.85 },
  'Electromagnetic Locks':      { slugs: ['electrical', 'fire-protection'], confidence: 0.80 },
  'Elevator':                   { slugs: ['elevator', 'electrical'], confidence: 0.85 },
  'Curtain Wall':               { slugs: ['glazing', 'structural-steel'], confidence: 0.80 },
  'Excavation':                 { slugs: ['excavation', 'shoring'], confidence: 0.85 },
  'Site Servicing':             { slugs: ['plumbing', 'excavation'], confidence: 0.70 },
  'Foundation Repair':          { slugs: ['concrete', 'waterproofing', 'excavation'], confidence: 0.75 },
  'Masonry':                    { slugs: ['masonry'], confidence: 0.85 },
  'Shoring':                    { slugs: ['shoring', 'excavation'], confidence: 0.85 },
  'Mechanical':                 { slugs: ['hvac', 'plumbing', 'electrical'], confidence: 0.75 },
};

const DEFAULT_FALLBACK: WorkFallback = {
  slugs: ['framing', 'plumbing', 'electrical', 'hvac', 'drywall', 'painting'],
  confidence: 0.55,
};

/**
 * Work-field-based Tier 1 fallback for permits with no tag-matrix or rule matches.
 * Checks `permit.work` against WORK_TRADE_FALLBACK (case-insensitive includes).
 * All matches are reported at tier: 1.
 */
function fallbackWorkTrades(
  permit: Partial<Permit>,
  phase: string
): TradeMatch[] {
  const work = permit.work?.toLowerCase() ?? '';

  let fallback = DEFAULT_FALLBACK;
  for (const [pattern, fb] of Object.entries(WORK_TRADE_FALLBACK)) {
    if (work.includes(pattern.toLowerCase())) {
      fallback = fb;
      break;
    }
  }

  const matches: TradeMatch[] = [];
  for (const slug of fallback.slugs) {
    const trade = getTradeBySlug(slug);
    if (!trade) continue;

    const isActive = isTradeActiveInPhase(slug, phase);

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: slug,
      trade_name: trade.name,
      tier: 1,
      confidence: fallback.confidence,
      is_active: isActive,
      phase,
    };

    const leadScore = calculateLeadScore(permit, partial, phase);

    matches.push({
      permit_num: permit.permit_num ?? '',
      revision_num: permit.revision_num ?? '',
      trade_id: trade.id,
      trade_slug: slug,
      trade_name: trade.name,
      tier: 1,
      confidence: fallback.confidence,
      is_active: isActive,
      phase,
      lead_score: leadScore,
    });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a permit using a hybrid approach:
 *
 * - **Path A (Narrow-scope):** If the permit code is in NARROW_SCOPE_CODES,
 *   only Tier 1 rules apply (unchanged).
 *
 * - **Path B (Broad-scope):** scope_tags from classifyScope() are looked up
 *   in the tag-trade matrix, merged with any Tier 1 rule matches.
 *
 * - **Fallback:** Permits with no matches get work-field-based Tier 1
 *   trades. Common work values (Interior Alterations, New Building, etc.)
 *   map to appropriate trades at 0.65-0.85 confidence. Unknown work values
 *   get broad residential trades at 0.55 confidence.
 *
 * @param scopeTags - Optional pre-computed scope tags. If not provided,
 *   the classifier uses only Tier 1 rules + work-field fallback.
 */
export function classifyPermit(
  permit: Partial<Permit>,
  rules: TradeMappingRule[],
  scopeTags?: string[]
): TradeMatch[] {
  const phase = determinePhase(permit);
  const code = extractPermitCode(permit.permit_num);
  const isNarrowScope = code != null && NARROW_SCOPE_CODES[code] != null;

  // Path A: Narrow-scope — Tier 1 rules only, filtered by allowed trades
  if (isNarrowScope) {
    const tier1 = matchTier1Rules(permit, rules, phase);
    const limited = applyScopeLimit(tier1, permit.permit_num, permit.work);
    if (limited.length > 0) return limited;

    // Fallback: assign code's allowed trades at 0.80 confidence
    const allowed = NARROW_SCOPE_CODES[code!];
    const narrowFallback: TradeMatch[] = [];
    for (const slug of allowed) {
      const trade = getTradeBySlug(slug);
      if (!trade) continue;

      const isActive = isTradeActiveInPhase(slug, phase);

      const partial: Partial<TradeMatch> = {
        trade_id: trade.id,
        trade_slug: slug,
        trade_name: trade.name,
        tier: 1,
        confidence: 0.80,
        is_active: isActive,
        phase,
      };

      const leadScore = calculateLeadScore(permit, partial, phase);

      narrowFallback.push({
        permit_num: permit.permit_num ?? '',
        revision_num: permit.revision_num ?? '',
        trade_id: trade.id,
        trade_slug: slug,
        trade_name: trade.name,
        tier: 1,
        confidence: 0.80,
        is_active: isActive,
        phase,
        lead_score: leadScore,
      });
    }
    return applyScopeLimit(narrowFallback, permit.permit_num, permit.work);
  }

  // Path B: Broad-scope — tag matrix + Tier 1 merge
  const tier1 = matchTier1Rules(permit, rules, phase);
  const tags = scopeTags ?? [];

  let tagMatches: TradeMatch[] = [];
  if (tags.length > 0) {
    tagMatches = matchTagMatrix(permit, tags, phase);
  }

  // Merge: de-duplicate by trade_slug, keeping highest confidence
  const merged = new Map<string, TradeMatch>();

  for (const m of tier1) {
    const existing = merged.get(m.trade_slug);
    if (!existing || existing.confidence < m.confidence) {
      merged.set(m.trade_slug, m);
    }
  }

  for (const m of tagMatches) {
    const existing = merged.get(m.trade_slug);
    if (!existing || existing.confidence < m.confidence) {
      merged.set(m.trade_slug, m);
    }
  }

  // Fallback if no matches from Tier 1 or tag matrix — work-field-based Tier 1
  if (merged.size === 0) {
    const fallback = fallbackWorkTrades(permit, phase);
    for (const m of fallback) {
      merged.set(m.trade_slug, m);
    }
  }

  const allMatches = Array.from(merged.values());
  return applyScopeLimit(allMatches, permit.permit_num, permit.work);
}

// ---------------------------------------------------------------------------
// Product classifier
// ---------------------------------------------------------------------------

/**
 * Classify products for a permit based on scope_tags.
 * Returns a list of product matches with confidence.
 */
export function classifyProducts(
  permit: Partial<Permit>,
  scopeTags?: string[]
): ProductMatch[] {
  const tags = scopeTags ?? [];
  if (tags.length === 0) return [];

  const productSlugs = lookupProductsForTags(tags);

  return productSlugs.map((slug) => {
    const group = PRODUCT_GROUPS.find((p) => p.slug === slug);
    return {
      permit_num: permit.permit_num ?? '',
      revision_num: permit.revision_num ?? '',
      product_id: group?.id ?? 0,
      product_slug: slug,
      product_name: group?.name ?? slug,
      confidence: 0.75,
    };
  });
}
