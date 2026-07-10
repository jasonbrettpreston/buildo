import type { Permit, TradeMappingRule, TradeMatch, ProductMatch } from '@/lib/permits/types';
import { TRADES, getTradeById, getTradeBySlug } from '@/lib/classification/trades';
import { deriveArchetypes, bundleSlugsFor } from '@/lib/classification/archetypes';
import { determinePhase } from '@/lib/classification/phases';
import { calculateLeadScore } from '@/lib/classification/scoring';
import { lookupTradesForTags } from '@/lib/classification/tag-trade-matrix';
// WF2 #2 (2026-05-08) — gate the tag-trade matrix on permit_type_class
// (mig 120 / Spec 80 §5). Mirror of scripts/classify-permits.js.
import {
  filterTradesByClass,
  shouldAppendRealtor,
  UNCLASSIFIED,
  type PermitTypeClass,
} from '@/lib/classification/permit-type-class';
import { lookupProductsForTags } from '@/lib/classification/tag-product-matrix';
import { PRODUCT_GROUPS } from '@/lib/classification/products';

// ---------------------------------------------------------------------------
// Default confidence values per tier
// ---------------------------------------------------------------------------
const TIER_CONFIDENCE: Record<number, number> = {
  1: 0.95,
  2: 0.80,
};

// The deprecated trades (Spec 80 §5.B.6) — never bundle-emit these.
const DEPRECATED_SLUGS: ReadonlySet<string> = new Set(
  TRADES.filter((t) => t.kind === 'deprecated').map((t) => t.slug),
);

// ---------------------------------------------------------------------------
// P16 16C (Spec 80 §5.C) — lean scope-mapped inference layer inputs.
// The complement + line detector live in the Brain-side JS module (single source of
// truth shared with scripts/classify-permits.js — §7.1 dual-path). TS→JS require is
// the sanctioned pattern (precedent: cost-model.ts:16 requires cost-model-shared).
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archetypeCostMap = require('../../features/leads/lib/archetype-cost-map') as {
  mapToLines: (lead: {
    projectType: string | null | undefined;
    scopeTags: string[] | null | undefined;
    structureType: string | null | undefined;
    isCoa: boolean;
    activeTradeCount: number;
  }) => { lines: string[]; mapKind: string } | null;
  complementTradesFor: (lines: string[]) => string[];
};
const { mapToLines, complementTradesFor } = archetypeCostMap;
// [FAB4] — inference-tier confidence. DESCRIPTIVE ONLY: serving/ranking authority is
// attachment_basis, never this value. Mirrors scripts/classify-permits.js.
const INFERENCE_TIER_CONFIDENCE = 0.50;

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
  return match ? match[1]! : null;
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

/**
 * PERMIT_TYPE_CEILING (P16 §5.C / D2) — dual-path mirror of scripts/classify-permits.js. A
 * `permit_type`-STRING family cap, complement to the `permit_num`-CODE NARROW_SCOPE_CODES. Fires
 * only on the plumbing/mechanical/drain permit_types whose permit_num carries no narrow code
 * (code-carrying permits early-return via the narrow-scope path, unchanged).
 */
export const PERMIT_TYPE_CEILING: Record<string, string[]> = {
  'Plumbing(PS)': ['plumbing'],
  'Mechanical(MS)': ['hvac'],
  'Drain and Site Service': ['drain-plumbing'],
};
function permitTypeCeilingFor(permitType: string | null | undefined): string[] | null {
  return (permitType && PERMIT_TYPE_CEILING[permitType]) || null;
}

function applyScopeLimit(
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

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 1,
      confidence,
      is_active: true,
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
      is_active: true,
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

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: trade.slug,
      trade_name: trade.name,
      tier: 2, // tag-matrix matches are reported as tier 2
      confidence,
      is_active: true,
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
      is_active: true,
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

    const partial: Partial<TradeMatch> = {
      trade_id: trade.id,
      trade_slug: slug,
      trade_name: trade.name,
      tier: 1,
      confidence: fallback.confidence,
      is_active: true,
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
      is_active: true,
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
/**
 * Append a realtor TradeMatch to every classifier output. Per Spec 91
 * §1.2 algorithmic invariant + §3.5 item 4 (option (a) MANDATED): every
 * active permit gets a `(permit_num, revision_num, realtor)` row so
 * realtors see the same set of permits tradespeople do. The realtor
 * persona's calibration (P1 bid_phase, P19 work_phase) is purely DB-side
 * (`trade_configurations.realtor` + `TRADE_TARGET_PHASE_FALLBACK.realtor`);
 * `getLeadFeed` and the flight-board endpoint do NOT branch on persona.
 */
const REALTOR_TRADE_ID = 33;
const REALTOR_TRADE_SLUG = 'realtor';
const REALTOR_TRADE_NAME = 'Real Estate Agent';

function appendRealtorMatch(
  matches: TradeMatch[],
  permit: Partial<Permit>,
  phase: string,
  realtorAvailable: boolean,
): TradeMatch[] {
  // WF3 startup-guard: skip the realtor append when migration 118 hasn't
  // been applied (trades.id=33 missing → FK constraint would crash on
  // INSERT). Caller is responsible for setting `realtorAvailable` from
  // a one-time DB lookup at script-startup. See
  // scripts/lib/pipeline-realtor-availability.js.
  if (!realtorAvailable) return matches;
  const permit_num = permit.permit_num ?? '';
  const revision_num = permit.revision_num ?? '';
  if (!permit_num || !revision_num) return matches;

  const partial: Partial<TradeMatch> = {
    trade_id: REALTOR_TRADE_ID,
    trade_slug: REALTOR_TRADE_SLUG,
    trade_name: REALTOR_TRADE_NAME,
    tier: 1,
    confidence: 1.0,
    is_active: true,
    phase,
  };
  const lead_score = calculateLeadScore(permit, partial, phase);

  return [
    ...matches,
    {
      permit_num,
      revision_num,
      trade_id: REALTOR_TRADE_ID,
      trade_slug: REALTOR_TRADE_SLUG,
      trade_name: REALTOR_TRADE_NAME,
      tier: 1,
      confidence: 1.0,
      is_active: true,
      phase,
      lead_score,
    },
  ];
}

export interface ClassifyPermitOptions {
  /**
   * Whether the realtor trade row (`trades.id=33`) exists in the DB.
   * Pipeline scripts should compute this once at startup via
   * `scripts/lib/pipeline-realtor-availability.js#checkRealtorAvailable`
   * and pass the result here so the classifier can skip the realtor
   * append when migration 118 hasn't been applied (avoids FK crash).
   * Defaults to `true` to preserve Cycle 7 behavior for callers that
   * don't supply the option (tests, programmatic uses).
   */
  realtorAvailable?: boolean;
  /**
   * The permit_type's class (WF2 #2, mig 120 / Spec 80 §5). The classifier
   * filters its output: construction → full matrix; administrative/unclassified
   * → empty; safety_upgrade → electrical+fire-protection only; signage →
   * electrical+structural-steel only (RESERVED).
   *
   * Pipeline scripts compute this once per permit via
   * `scripts/lib/permit-type-classifier.js#classifyPermitType(classMap, permit_type)`.
   * Defaults to `'unclassified'` (safe-skip) when not provided — protects future
   * call sites from accidentally bypassing the gate.
   */
  permitClass?: PermitTypeClass;
  /**
   * The permit's `project_type` (scope.ts) — input to the §5.B.5 archetype
   * bundle prior alongside `scopeTags`. Optional; NULL/absent + no matching
   * tags → no bundle (the permit keeps its direct-hit/fallback trades).
   */
  projectType?: string | null;
  /**
   * Bundle-tier confidence for archetype-implied trades. P16 16C: the trade bundle
   * prior is RETIRED (replaced by the lean inference layer); this value now only
   * anchors telemetry on the script side. Retained for API stability — unused here.
   */
  bundleConfidence?: number;
  /**
   * P16 16C (Spec 80 §5.C [BUG-6]) — hard gate for the lean scope-mapped inference layer
   * (mirrors the `p16_inference_layer_enabled` logic_variable). Default false: evidence-only
   * emission, the P13-3 precision posture preserved. When true, LINE_TRADE_COMPLEMENT trades
   * for the mapToLines-detected cost lines are UNIONed onto evidence at is_active=true /
   * attachment_basis='inference' / confidence 0.50 (descriptive only — ranking authority is
   * the basis, never the value).
   */
  inferenceEnabled?: boolean;
}

/**
 * Apply WF2 #2 (mig 120 / Spec 80 §5) class-based gating to a matches array.
 * Filters the trade matrix per `permit_type_class`, then conditionally appends
 * the realtor TradeMatch only for construction-class permits. Mirror of
 * scripts/classify-permits.js#applyClassGating per Spec 7 §7.1 dual-path.
 */
function applyClassGating(
  matches: TradeMatch[],
  permit: Partial<Permit>,
  phase: string,
  realtorAvailable: boolean,
  permitClass: PermitTypeClass,
  scopeTags: readonly string[] | undefined,
): TradeMatch[] {
  const filtered = filterTradesByClass(matches, permitClass);
  // WF3 2026-05-09 — 3-axis gate: class + permit_type + scope_tags. The
  // construction class alone is too coarse (mig 120 bundles trade-only
  // permits, demolition, and non-residential). See Spec 80 §5 Realtor
  // sub-gating sub-table. scope_tags arrives via classifyPermit's existing
  // `scopeTags` arg (NOT on `Permit` — it's a separate axis from the row).
  if (!shouldAppendRealtor(permitClass, permit.permit_type, scopeTags)) return filtered;
  return appendRealtorMatch(filtered, permit, phase, realtorAvailable);
}

export function classifyPermit(
  permit: Partial<Permit>,
  rules: TradeMappingRule[],
  scopeTags?: string[],
  options?: ClassifyPermitOptions,
): TradeMatch[] {
  const realtorAvailable = options?.realtorAvailable ?? true;
  const permitClass: PermitTypeClass = options?.permitClass ?? UNCLASSIFIED;
  const phase = determinePhase(permit);
  const code = extractPermitCode(permit.permit_num);
  const isNarrowScope = code != null && NARROW_SCOPE_CODES[code] != null;

  // Path A: Narrow-scope — Tier 1 rules only, filtered by allowed trades
  if (isNarrowScope) {
    const tier1 = matchTier1Rules(permit, rules, phase);
    const limited = applyScopeLimit(tier1, permit.permit_num, permit.work);
    if (limited.length > 0) return applyClassGating(limited, permit, phase, realtorAvailable, permitClass, scopeTags);

    // Fallback: assign code's allowed trades at 0.80 confidence
    const allowed = NARROW_SCOPE_CODES[code!]!;
    const narrowFallback: TradeMatch[] = [];
    for (const slug of allowed) {
      const trade = getTradeBySlug(slug);
      if (!trade) continue;

      const partial: Partial<TradeMatch> = {
        trade_id: trade.id,
        trade_slug: slug,
        trade_name: trade.name,
        tier: 1,
        confidence: 0.80,
        is_active: true,
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
        is_active: true,
        phase,
        lead_score: leadScore,
      });
    }
    return applyClassGating(
      applyScopeLimit(narrowFallback, permit.permit_num, permit.work),
      permit,
      phase,
      realtorAvailable,
      permitClass,
      scopeTags,
    );
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

  // P16 16C (Spec 80 §5.C): lean scope-mapped INFERENCE layer — takes the retired coarse archetype
  // bundle prior's slot (dual-path mirror of scripts/classify-permits.js). [GRD-1]: the old bundle
  // loop cannot coexist with this one — it filled `merged` with is_active=false slugs FIRST, so the
  // merged.has() guard would skip exactly the overlap set inference exists to re-activate. The
  // P13-3 demotion fence is KNOWINGLY extended into retirement + measured lean inference (16B GO).
  // HARD-GATED on options.inferenceEnabled [BUG-6] (default false → evidence-only, P13-3 posture
  // byte-preserved). Emitted BEFORE applyScopeLimit + the permit_type ceiling + applyClassGating
  // [GRD-2] — a narrow/class-gated permit gains NO inference trades. mapToLines → null (T4) keeps
  // the permit evidence-only by construction.
  if (options?.inferenceEnabled) {
    const mapped = mapToLines({
      projectType: options?.projectType ?? null,
      scopeTags: tags,
      structureType: permit.structure_type ?? null,
      isCoa: false,
      activeTradeCount: merged.size, // evidence count — the W7 escalation input
    });
    if (mapped && mapped.lines) {
      for (const slug of complementTradesFor(mapped.lines)) {
        if (merged.has(slug)) continue; // an evidence hit already won the slot (D1 union)
        const trade = getTradeBySlug(slug);
        if (!trade) continue;
        const partial: Partial<TradeMatch> = {
          trade_id: trade.id,
          trade_slug: slug,
          trade_name: trade.name,
          tier: 2,
          confidence: INFERENCE_TIER_CONFIDENCE,
          is_active: true,
          phase,
        };
        merged.set(slug, {
          permit_num: permit.permit_num ?? '',
          revision_num: permit.revision_num ?? '',
          trade_id: trade.id,
          trade_slug: slug,
          trade_name: trade.name,
          tier: 2,
          confidence: INFERENCE_TIER_CONFIDENCE,
          // D1/D5: inference SERVES (is_active=true) but ranks below evidence BY BASIS.
          is_active: true,
          attachment_basis: 'inference',
          phase,
          lead_score: calculateLeadScore(permit, partial, phase),
        });
      }
    }
  }

  let allMatches = applyScopeLimit(Array.from(merged.values()), permit.permit_num, permit.work);
  // P16 D2 — permit_type family ceiling for the code-LESS plumbing/mechanical/drain residual
  // (narrow-scope permits already early-returned above). Dual-path mirror of classify-permits.js.
  const ceiling = permitTypeCeilingFor(permit.permit_type);
  if (ceiling) allMatches = allMatches.filter((m) => ceiling.includes(m.trade_slug));
  return applyClassGating(
    allMatches,
    permit,
    phase,
    realtorAvailable,
    permitClass,
    scopeTags,
  );
}

// ---------------------------------------------------------------------------
// Product classifier
// ---------------------------------------------------------------------------

/** Tag-driven product confidence (direct scope_tag → product hit). */
const PRODUCT_TAG_CONFIDENCE = 0.75;
/** Archetype-implied product confidence (bundle prior; below tag hits). */
const PRODUCT_BUNDLE_CONFIDENCE = 0.45;

export interface ClassifyProductsOptions {
  /** project_type — input to the §5.B.5 archetype {products} bundle. */
  projectType?: string | null;
  /** Product bundle-tier confidence (default PRODUCT_BUNDLE_CONFIDENCE). */
  bundleConfidence?: number;
}

/**
 * Classify products for a permit (Spec 80 §5.B). Tag-driven hits at 0.75, plus the
 * §5.B.5 archetype {products} bundle at a lower bundle-tier confidence — the bundle
 * fires ONLY when `deriveArchetypes(projectType, tags)` returns a non-empty set (i.e.
 * NOT on every permit; a no-archetype permit yields only its tag-products, or none).
 * MAX-dedup: a tag hit always wins over a bundle hit for the same product.
 */
export function classifyProducts(
  permit: Partial<Permit>,
  scopeTags?: string[],
  options?: ClassifyProductsOptions,
): ProductMatch[] {
  // Narrow-scope companion permits (PLB/MS/DR/DM/…) repeat the whole project's
  // description, so their tags/archetype look like a full build. Products belong on
  // the PRIMARY permit, not duplicated across companions — so emit none here, exactly
  // as the trade path returns just the narrow trade for these codes (Spec 80 §5.B).
  const code = extractPermitCode(permit.permit_num);
  if (code != null && NARROW_SCOPE_CODES[code] != null) return [];

  const tags = scopeTags ?? [];
  const conf = new Map<string, number>();
  for (const slug of lookupProductsForTags(tags)) conf.set(slug, PRODUCT_TAG_CONFIDENCE);

  const bundleConf = options?.bundleConfidence ?? PRODUCT_BUNDLE_CONFIDENCE;
  const archetypes = deriveArchetypes(options?.projectType, tags);
  const { products: bundleProducts } = bundleSlugsFor(archetypes, DEPRECATED_SLUGS);
  for (const slug of bundleProducts) {
    if (!conf.has(slug)) conf.set(slug, bundleConf); // tag hit wins (MAX-dedup)
  }

  const out: ProductMatch[] = [];
  for (const [slug, c] of conf) {
    const group = PRODUCT_GROUPS.find((p) => p.slug === slug);
    if (!group) continue;
    out.push({
      permit_num: permit.permit_num ?? '',
      revision_num: permit.revision_num ?? '',
      product_id: group.id,
      product_slug: slug,
      product_name: group.name,
      confidence: c,
    });
  }
  return out;
}
