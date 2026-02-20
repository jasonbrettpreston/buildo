import type { Permit, TradeMappingRule, TradeMatch } from '@/lib/permits/types';
import { getTradeById } from '@/lib/classification/trades';
import { determinePhase, isTradeActiveInPhase } from '@/lib/classification/phases';
import { calculateLeadScore } from '@/lib/classification/scoring';

// ---------------------------------------------------------------------------
// Default confidence values per tier
// ---------------------------------------------------------------------------
const TIER_CONFIDENCE: Record<number, number> = {
  1: 0.95,
  2: 0.80,
  3: 0.60, // base for Tier 3; adjusted per match strength
};

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Test whether a permit field value matches a rule pattern.
 * For tiers 1 and 2 the match is a case-insensitive exact/includes check.
 * For tier 3 the pattern is treated as a regular expression.
 */
function fieldMatches(
  fieldValue: string | undefined | null,
  pattern: string,
  tier: number
): { matched: boolean; strength: number } {
  if (!fieldValue) return { matched: false, strength: 0 };

  const normValue = fieldValue.toLowerCase().trim();
  const normPattern = pattern.toLowerCase().trim();

  if (tier === 3) {
    // Tier 3 - regex / keyword scan over description
    try {
      const re = new RegExp(normPattern, 'i');
      const match = re.test(fieldValue);
      if (!match) return { matched: false, strength: 0 };

      // Award higher strength for longer keyword matches
      const execResult = re.exec(fieldValue);
      const matchLength = execResult ? execResult[0].length : 0;
      // strength range: 0.50 - 0.70 scaled by match length relative to value length
      const ratio = Math.min(matchLength / normValue.length, 1);
      const strength = 0.50 + ratio * 0.20;
      return { matched: true, strength };
    } catch {
      // Invalid regex -- fall back to includes
      const matched = normValue.includes(normPattern);
      return { matched, strength: matched ? 0.50 : 0 };
    }
  }

  // Tier 1 & 2 - case-insensitive includes
  const matched = normValue.includes(normPattern);
  return { matched, strength: matched ? 1 : 0 };
}

/**
 * Return the permit field value that corresponds to a rule's match_field.
 */
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

/**
 * Extract the permit type code suffix from a permit number.
 * e.g., "21 123456 BLD 00" → "BLD", "22 654321 PLB 00" → "PLB"
 */
export function extractPermitCode(permitNum: string | undefined): string | null {
  if (!permitNum) return null;
  // Permit numbers can be "XX XXXXXX BLD 00" or "XX XXXXXX PLB" (code at end or mid)
  const match = permitNum.match(/\s([A-Z]{2,4})(?:\s|$)/);
  return match ? match[1] : null;
}

/**
 * Narrow-scope permit codes that restrict classification to specific trades.
 * If a code is not listed here, full classification is applied.
 */
const NARROW_SCOPE_CODES: Record<string, string[]> = {
  PLB: ['plumbing'],
  PSA: ['plumbing'],
  HVA: ['hvac'],
  MSA: ['hvac'],
  DRN: ['plumbing'],
  STS: ['plumbing'],
  FSU: ['fire-protection'],
  DEM: ['demolition'],
  SHO: ['excavation', 'shoring', 'concrete', 'waterproofing'],
  FND: ['excavation', 'concrete', 'waterproofing', 'shoring'],
  TPS: ['framing', 'electrical'],
  PCL: ['electrical', 'plumbing', 'hvac'],
};

/**
 * Work-field scope limits for broad-scope permits. When these work types
 * are present, certain trades are excluded because they are out of scope.
 */
const WORK_SCOPE_EXCLUSIONS: Record<string, string[]> = {
  'Interior Alterations': ['excavation', 'shoring', 'roofing', 'landscaping', 'waterproofing'],
  'Underpinning': ['roofing', 'glazing', 'landscaping', 'elevator', 'painting', 'flooring'],
  'Re-Roofing': ['excavation', 'shoring', 'concrete', 'elevator', 'landscaping'],
  'Re-Cladding': ['excavation', 'shoring', 'elevator', 'landscaping'],
  'Fire Alarm': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'Sprinklers': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'Electromagnetic Locks': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'Elevator': ['excavation', 'shoring', 'roofing', 'landscaping', 'demolition', 'masonry', 'insulation', 'painting', 'waterproofing'],
  'Demolition': ['framing', 'roofing', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'landscaping'],
  'Deck': ['elevator', 'shoring', 'structural-steel'],
  'Porch': ['elevator', 'shoring', 'structural-steel'],
  'Garage': ['elevator', 'landscaping'],
  'Garage Repair/Reconstruction': ['elevator', 'landscaping'],
};

/**
 * Apply permit code scope limiting and work-field exclusions to classification results.
 * Returns only the trades that are in scope for the permit.
 */
export function applyScopeLimit(
  matches: TradeMatch[],
  permitNum: string | undefined,
  work: string | undefined
): TradeMatch[] {
  const code = extractPermitCode(permitNum);

  // Check narrow-scope codes first
  if (code && NARROW_SCOPE_CODES[code]) {
    const allowed = NARROW_SCOPE_CODES[code];
    return matches.filter((m) => allowed.includes(m.trade_slug));
  }

  // For broad-scope permits, apply work-field exclusions
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
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a permit against a set of trade mapping rules using 3-tier matching.
 *
 * - **Tier 1** (permit_type, confidence 0.95): highest-signal match on the
 *   permit type code.
 * - **Tier 2** (work field, confidence 0.80): match on the work/scope field.
 * - **Tier 3** (description scan, confidence 0.50-0.70): keyword / regex scan
 *   over the free-text description.
 *
 * A single permit can match multiple trades. Duplicate trade matches within
 * the same tier are de-duplicated keeping the highest confidence.
 */
export function classifyPermit(
  permit: Partial<Permit>,
  rules: TradeMappingRule[]
): TradeMatch[] {
  const phase = determinePhase(permit);
  const matchMap = new Map<string, TradeMatch>(); // keyed by `${trade_id}-${tier}`

  // Process rules grouped by tier (1, 2, 3) in ascending order.
  const activeRules = rules.filter((r) => r.is_active);
  const sortedRules = [...activeRules].sort((a, b) => a.tier - b.tier);

  for (const rule of sortedRules) {
    const fieldValue = getFieldValue(permit, rule.match_field);
    const { matched, strength } = fieldMatches(fieldValue, rule.match_pattern, rule.tier);

    if (!matched) continue;

    const trade = getTradeById(rule.trade_id);
    if (!trade) continue;

    // Determine confidence: use rule-level override when present, otherwise
    // fall back to the tier default (scaled by match strength for tier 3).
    let confidence: number;
    if (rule.confidence > 0) {
      confidence = rule.confidence;
    } else if (rule.tier === 3) {
      confidence = strength; // already in 0.50-0.70 range
    } else {
      confidence = TIER_CONFIDENCE[rule.tier] ?? 0.60;
    }

    const isActive = isTradeActiveInPhase(trade.slug, phase);

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: rule.tier,
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
      tier: rule.tier,
      confidence,
      is_active: isActive,
      phase,
      lead_score: leadScore,
    };

    // De-duplicate: keep highest confidence per trade+tier combo.
    const key = `${trade.id}-${rule.tier}`;
    const existing = matchMap.get(key);
    if (!existing || existing.confidence < tradeMatch.confidence) {
      matchMap.set(key, tradeMatch);
    }
  }

  const allMatches = Array.from(matchMap.values());

  // Apply permit code scope limiting and work-field exclusions
  return applyScopeLimit(allMatches, permit.permit_num, permit.work);
}
