// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
// 🔗 DUAL CODE PATH: scripts/lib/coa-trade-classifier.js must mirror this logic.
//                   Functional parity verified by src/tests/coa-trade-classifier.logic.test.ts.
//
// Pure-function consumer of the in-process TAG_TRADE_MATRIX. Maps CoA scope_tags
// (produced by classify-coa-scope.js / coa-scope-classifier.ts) into a deduped
// set of {slug, confidence} trade rows that downstream R5.4
// (scripts/classify-coa-trades.js) writes to lead_trades.
//
// Hard guarantees per Spec 47 §R8:
//   - Pure functions. No DB access. No side effects.
//   - Same input → same output. Deterministic.
//   - Output array sorted by slug (deterministic ordering for downstream batchers).
//
// R5.4 R8 plan-review folds (2026-05-14):
//   - #4 (Worktree#2): TAG_ALIASES include `dwelling → build-sfd` and
//        `renovation → interior` (high-frequency R5.3-emitted meta-tags that
//        had no matrix entry).
//   - #6 (Gemini CRIT): normalizeTag is case-insensitive via .toLowerCase().
//   - #7 (Gemini HIGH): lookupTradesForTags guards against non-string elements.
//
// Review fold (Indep N-5): no `'use strict'` directive — TS/ESM modules are
// strict mode by default.

// ─────────────────────────── Public types ────────────────────────────────────

export interface TradeMatch {
  slug: string;
  confidence: number;
}

export interface CoaRowForRealtorGate {
  coa_type_class?: string | null;
}

export type ConstructionPhase =
  | 'early_construction'
  | 'structural'
  | 'finishing'
  | 'landscaping'
  | null;

// ─────────────────────────── TAG_ALIASES ─────────────────────────────────────
// Verbatim from scripts/classify-permits.js:168 + R5.4 fold #4 CoA additions.

export const TAG_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  roofing: 'roof',
  'laneway-suite': 'laneway',
  'fire-alarm': 'fire_alarm',
  'interior-alterations': 'interior',
  'finished-basement': 'basement',
  'basement-finish': 'basement',
  'stacked-townhouse': 'townhouse',
  'semi-detached': 'semi',
  condo: 'apartment',
  'rear-addition': 'addition',
  'front-addition': 'addition',
  'side-addition': 'addition',
  'storey-addition': 'addition',
  '2nd-floor': 'addition',
  '3rd-floor': 'addition',
  'convert-unit': 'unit-conversion',
  // R5.4 R8 fold #4 — CoA-side coverage gap fills (initial set):
  dwelling: 'build-sfd',
  renovation: 'interior',
  // R5.4 review fold (Worktree#2 IMP-6 CRIT) — additional coverage gaps; see
  // scripts/lib/coa-trade-classifier.js for full rationale.
  'secondary-suite': 'second-suite',
  'accessory-structure': 'accessory-building',
  'new-construction': 'build-sfd',
  'service-shop': 'retail',
  'mixed-use': 'tenant-fitout',
});

// ─────────────────────────── normalizeTag ────────────────────────────────────
// R5.4 R8 fold #6 (Gemini CRIT): single .toLowerCase() at entry makes the
// matrix lookup case-insensitive. R5.3 emits lowercase today but defensive
// normalization prevents future regression.

export function normalizeTag(tag: string): string {
  let base = tag.toLowerCase().replace(/^(new|alter|sys|scale|exp):/, '');
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  return TAG_ALIASES[base] ?? base;
}

// ─────────────────────────── TAG_TRADE_MATRIX ────────────────────────────────
// Verbatim from scripts/classify-permits.js:193. Each entry maps a normalized
// scope-tag key to a list of [slug, confidence] tuples (confidence ∈ [0,1]).
// Confidence is intentionally not 1.0 — these are inferred trade involvements,
// not contractually-required ones.

type MatrixEntry = readonly [string, number];

export const TAG_TRADE_MATRIX: Readonly<Record<string, readonly MatrixEntry[]>> = Object.freeze({
  kitchen: [['plumbing', 0.8], ['electrical', 0.8], ['flooring', 0.65], ['drywall', 0.6], ['painting', 0.55]],
  bathroom: [['plumbing', 0.85], ['drywall', 0.7], ['glazing', 0.6], ['electrical', 0.65], ['waterproofing', 0.6], ['painting', 0.55]],
  basement: [['framing', 0.75], ['drywall', 0.75], ['plumbing', 0.7], ['electrical', 0.75], ['insulation', 0.7], ['flooring', 0.65], ['waterproofing', 0.65], ['painting', 0.55]],
  pool: [['excavation', 0.75], ['concrete', 0.8], ['plumbing', 0.75], ['electrical', 0.65], ['landscaping', 0.6]],
  deck: [['framing', 0.65], ['concrete', 0.55]],
  porch: [['framing', 0.7], ['concrete', 0.65], ['roofing', 0.55], ['masonry', 0.55]],
  garage: [['framing', 0.7], ['concrete', 0.7], ['roofing', 0.65], ['electrical', 0.6], ['drywall', 0.55]],
  fence: [['framing', 0.55]],
  garden_suite: [['framing', 0.8], ['concrete', 0.75], ['excavation', 0.7], ['plumbing', 0.75], ['electrical', 0.75], ['hvac', 0.7], ['insulation', 0.65], ['drywall', 0.65], ['roofing', 0.65]],
  laneway: [['framing', 0.8], ['concrete', 0.75], ['excavation', 0.7], ['plumbing', 0.75], ['electrical', 0.75], ['hvac', 0.7], ['insulation', 0.65], ['drywall', 0.65], ['roofing', 0.65]],
  'build-sfd': [['excavation', 0.8], ['concrete', 0.8], ['framing', 0.85], ['roofing', 0.8], ['plumbing', 0.8], ['hvac', 0.8], ['electrical', 0.8], ['insulation', 0.75], ['drywall', 0.75], ['painting', 0.7], ['flooring', 0.7], ['masonry', 0.65], ['glazing', 0.6], ['waterproofing', 0.55], ['landscaping', 0.6]],
  semi: [['excavation', 0.75], ['concrete', 0.75], ['framing', 0.8], ['roofing', 0.75], ['plumbing', 0.75], ['hvac', 0.75], ['electrical', 0.75], ['insulation', 0.7], ['drywall', 0.7], ['painting', 0.65], ['flooring', 0.65], ['masonry', 0.7], ['landscaping', 0.55]],
  townhouse: [['excavation', 0.75], ['concrete', 0.75], ['framing', 0.8], ['roofing', 0.75], ['plumbing', 0.75], ['hvac', 0.75], ['electrical', 0.75], ['insulation', 0.7], ['drywall', 0.7], ['painting', 0.65], ['flooring', 0.65], ['masonry', 0.7], ['fire-protection', 0.55], ['landscaping', 0.55]],
  houseplex: [['excavation', 0.75], ['concrete', 0.75], ['framing', 0.8], ['roofing', 0.75], ['plumbing', 0.8], ['hvac', 0.8], ['electrical', 0.8], ['insulation', 0.7], ['drywall', 0.7], ['painting', 0.65], ['flooring', 0.65], ['fire-protection', 0.6], ['masonry', 0.65]],
  apartment: [['concrete', 0.8], ['framing', 0.75], ['plumbing', 0.8], ['hvac', 0.8], ['electrical', 0.8], ['elevator', 0.75], ['drywall', 0.7], ['painting', 0.65], ['fire-protection', 0.7]],
  'tenant-fitout': [['drywall', 0.8], ['painting', 0.75], ['electrical', 0.75], ['flooring', 0.7], ['hvac', 0.65], ['plumbing', 0.6], ['fire-protection', 0.6]],
  retail: [['drywall', 0.75], ['painting', 0.7], ['electrical', 0.75], ['plumbing', 0.65], ['flooring', 0.7], ['glazing', 0.65], ['hvac', 0.6], ['fire-protection', 0.55]],
  office: [['drywall', 0.8], ['painting', 0.75], ['electrical', 0.75], ['hvac', 0.7], ['flooring', 0.7], ['fire-protection', 0.6]],
  restaurant: [['plumbing', 0.85], ['hvac', 0.8], ['electrical', 0.8], ['fire-protection', 0.75], ['drywall', 0.6], ['painting', 0.55]],
  warehouse: [['concrete', 0.75], ['structural-steel', 0.7], ['electrical', 0.75], ['plumbing', 0.6], ['hvac', 0.65], ['fire-protection', 0.7], ['roofing', 0.55]],
  hvac: [['hvac', 0.85]],
  plumbing: [['plumbing', 0.85]],
  electrical: [['electrical', 0.85]],
  fire_alarm: [['fire-protection', 0.85], ['electrical', 0.55]],
  sprinkler: [['fire-protection', 0.85], ['plumbing', 0.55]],
  underpinning: [['shoring', 0.85], ['concrete', 0.75], ['waterproofing', 0.65], ['excavation', 0.7]],
  foundation: [['concrete', 0.85], ['excavation', 0.75], ['waterproofing', 0.7]],
  addition: [['framing', 0.75], ['concrete', 0.65], ['roofing', 0.6], ['plumbing', 0.55], ['electrical', 0.6], ['insulation', 0.55], ['drywall', 0.55]],
  roof: [['roofing', 0.85]],
  cladding: [['masonry', 0.7], ['insulation', 0.6]],
  windows: [['glazing', 0.85]],
  solar: [['electrical', 0.75], ['roofing', 0.55]],
  ev_charger: [['electrical', 0.8]],
  elevator: [['elevator', 0.85], ['electrical', 0.55]],
  interior: [['drywall', 0.7], ['painting', 0.65], ['flooring', 0.6], ['electrical', 0.55]],
  fireplace: [['hvac', 0.65], ['masonry', 0.55]],
  'high-rise': [['elevator', 0.65], ['concrete', 0.65], ['structural-steel', 0.6], ['fire-protection', 0.6], ['glazing', 0.55]],
  'mid-rise': [['concrete', 0.6], ['fire-protection', 0.55], ['elevator', 0.55]],
  demolition: [['demolition', 0.85], ['excavation', 0.5]],
  security: [['electrical', 0.55]],
  walkout: [['excavation', 0.75], ['concrete', 0.7], ['waterproofing', 0.7], ['framing', 0.6]],
  'second-suite': [['framing', 0.75], ['plumbing', 0.75], ['electrical', 0.75], ['hvac', 0.7], ['drywall', 0.7], ['insulation', 0.65], ['flooring', 0.6], ['painting', 0.55]],
  balcony: [['framing', 0.7], ['concrete', 0.65], ['glazing', 0.55], ['waterproofing', 0.6]],
  dormer: [['framing', 0.75], ['roofing', 0.7], ['insulation', 0.6], ['drywall', 0.6], ['glazing', 0.55]],
  'unit-conversion': [['framing', 0.7], ['drywall', 0.7], ['plumbing', 0.65], ['electrical', 0.7], ['hvac', 0.6], ['painting', 0.55], ['flooring', 0.55]],
  'open-concept': [['framing', 0.75], ['structural-steel', 0.65], ['drywall', 0.7], ['painting', 0.6], ['electrical', 0.55]],
  'structural-beam': [['structural-steel', 0.8], ['framing', 0.65]],
  'fire-damage': [['demolition', 0.7], ['framing', 0.7], ['drywall', 0.7], ['painting', 0.65], ['electrical', 0.65], ['plumbing', 0.6], ['insulation', 0.6]],
  carport: [['framing', 0.7], ['concrete', 0.65], ['roofing', 0.65]],
  canopy: [['framing', 0.65], ['concrete', 0.55]],
  laundry: [['plumbing', 0.8], ['electrical', 0.65]],
  'accessory-building': [['framing', 0.7], ['concrete', 0.6], ['electrical', 0.55], ['roofing', 0.55]],
  drain: [['drain-plumbing', 0.85]],
  'backflow-preventer': [['drain-plumbing', 0.8]],
  'access-control': [['electrical', 0.7]],
  school: [['concrete', 0.65], ['framing', 0.65], ['hvac', 0.7], ['electrical', 0.7], ['plumbing', 0.65], ['fire-protection', 0.6]],
  hospital: [['concrete', 0.65], ['framing', 0.6], ['hvac', 0.75], ['electrical', 0.75], ['plumbing', 0.7], ['fire-protection', 0.65], ['elevator', 0.6]],
  station: [['concrete', 0.7], ['structural-steel', 0.65], ['electrical', 0.7]],
  storage: [['framing', 0.6], ['concrete', 0.6]],
});

// ─────────────────────────── lookupTradesForTags ────────────────────────────
// Twin of scripts/classify-permits.js:259. Returns deduplicated, slug-sorted
// array of {slug, confidence} matches. When the same trade appears in multiple
// tag entries, the highest confidence wins.

export function lookupTradesForTags(scopeTags: readonly unknown[] | null | undefined): TradeMatch[] {
  if (scopeTags == null || !Array.isArray(scopeTags)) return [];
  const best = new Map<string, number>();
  for (const tag of scopeTags) {
    // R5.4 R8 fold #7 (Gemini HIGH): defensive type guard. Upstream data
    // quality is never guaranteed; a non-string element would crash on
    // .replace() inside normalizeTag.
    if (typeof tag !== 'string' || tag === '') continue;
    const key = normalizeTag(tag);
    const entries = TAG_TRADE_MATRIX[key];
    if (!entries) continue;
    for (const [slug, conf] of entries) {
      const existing = best.get(slug) ?? 0;
      if (conf > existing) best.set(slug, conf);
    }
  }
  return Array.from(best.entries())
    .map(([slug, confidence]) => ({ slug, confidence }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// ─────────────────────────── PHASE_TRADES ────────────────────────────────────
// Verbatim from scripts/classify-permits.js:77.

export const PHASE_TRADES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  early_construction: ['excavation', 'shoring', 'demolition', 'concrete', 'waterproofing', 'drain-plumbing', 'temporary-fencing'],
  structural: ['framing', 'structural-steel', 'masonry', 'concrete', 'roofing', 'plumbing', 'hvac', 'electrical', 'elevator', 'fire-protection'],
  finishing: ['insulation', 'drywall', 'painting', 'flooring', 'glazing', 'fire-protection', 'plumbing', 'hvac', 'electrical', 'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops', 'caulking', 'solar', 'security'],
  landscaping: ['landscaping', 'painting', 'decking-fences', 'eavestrough-siding', 'pool-installation'],
});

// ─────────────────────────── isTradeActiveInPhase ───────────────────────────
// R2.v5 fix E (Worktree HIGH CRITICAL FIX): null-phase MUST return true (pass-through).
// CoA-side determineCoaPhase always returns null at submission time.

export function isTradeActiveInPhase(slug: string, phase: ConstructionPhase | string | null | undefined): boolean {
  if (phase == null || phase === '') return true;
  return (PHASE_TRADES[phase] ?? []).includes(slug);
}

// ─────────────────────────── determineCoaPhase ──────────────────────────────
// CoA-adapted: no construction phase at submission time. Phase E lifecycle
// engine handles CoA P1-P4 separately.

export function determineCoaPhase(_coa: unknown, _runAt?: unknown): ConstructionPhase {
  return null;
}

// ─────────────────────────── shouldAppendRealtor ────────────────────────────
// CoA-side simplification of the permits 3-axis gate (Spec 80 §5). CoA has no
// permit_type analogue; coa_type_class is the single available residential
// signal. R5.4 R8 fold #14 (DeepSeek CRIT, deferred): 2-axis (class +
// scope_tags) check is a candidate future enhancement; tracked in
// docs/reports/review_followups.md.

export function shouldAppendRealtor(coaRow: CoaRowForRealtorGate | null | undefined): boolean {
  if (coaRow == null) return false;
  return coaRow.coa_type_class === 'residential';
}
