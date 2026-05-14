// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D, §6.8 row 666
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
// 🔗 DUAL CODE PATH: scripts/lib/coa-scope-classifier.js must mirror this logic
//                   byte-for-byte. Parity verified by
//                   src/tests/coa-scope-classifier.logic.test.ts.
//
// Pure-function description-keyword classifier for Toronto Committee of
// Adjustment applications. Produces three derived attributes from a CoA
// description string:
//   - coa_type_class: residential / commercial / institutional / mixed (or null)
//   - project_type:   NewConstruction / Addition / Alteration / Demolition /
//                     Severance / Mixed (or null)
//   - scope_tags:     array of ~30 reduced tags (or null when no keyword fires)
//
// Hard guarantees per Spec 47 §R8:
//   - Pure function. No DB access. No side effects.
//   - Same input → same output. Deterministic.
//   - Output enum values strictly conform to Spec 42 §6.6.D (no "other",
//     "VarianceOnly", "ChangeOfUse" — those are spec-drift values).
//   - scope_tags is null (not empty array) when no keyword matches —
//     prevents assert-global-coverage's `IS NOT NULL` gate from falsely
//     reporting 100% coverage on a no-op classifier.
//
// Spec 42 §6.6.D enum tables (CANONICAL — do NOT extend without a spec amendment):
//   coa_type_class: 'residential' | 'commercial' | 'institutional' | 'mixed' | null
//   project_type:   'NewConstruction' | 'Addition' | 'Alteration' |
//                   'Demolition' | 'Severance' | 'Mixed' | null
//

'use strict';

export type CoaTypeClass = 'residential' | 'commercial' | 'institutional' | 'mixed' | null;

export type ProjectType =
  | 'NewConstruction'
  | 'Addition'
  | 'Alteration'
  | 'Demolition'
  | 'Severance'
  | 'Mixed'
  | null;

export interface ClassifyCoaScopeInput {
  /** CoA description text. May be null/empty — classifier returns all-nulls. */
  description: string | null | undefined;
  /** Optional CoA status — currently not consumed; reserved for future heuristics. */
  status?: string | null;
  /** Optional CoA decision — currently not consumed; reserved for future heuristics. */
  decision?: string | null;
}

export interface ClassifyCoaScopeOutput {
  coa_type_class: CoaTypeClass;
  project_type: ProjectType;
  /** Sorted alphabetically. NULL (not empty array) when no keyword matched. */
  scope_tags: string[] | null;
}

// ─────────────────────────── Type-class indicators ───────────────────────────
// Each regex must use `\b` word boundaries to avoid matching substrings of
// unrelated words (e.g. "office" inside "officer"). Order does not matter —
// classification combines all matched indicators.

const RESIDENTIAL_PATTERNS: RegExp[] = [
  /\bdwelling\b/i,
  /\bhouse\b/i,
  /\bduplex\b/i,
  /\btriplex\b/i,
  /\bfourplex\b/i,
  /\btown\s*house\b/i,
  /\btown\s*home\b/i,   // R8 DeepSeek LOW — "townhome" missed in prior pattern
  /\brow\s*house\b/i,
  /\bapartment\b/i,
  /\bcondo(minium)?\b/i,
  /\bsecondary\s+suite\b/i,
  /\blaneway\s+(suite|house)\b/i,
  /\bresidential\b/i,
];

const COMMERCIAL_PATTERNS: RegExp[] = [
  /\boffice\b/i,
  /\bretail\b/i,
  /\brestaurant\b/i,
  /\bwarehouse\b/i,
  /\bcommercial\b/i,
  /\bservice\s+shop\b/i,
  /\bpersonal\s+service\b/i,
  /\bstore\b/i,
  /\bbar\b/i,
  /\btavern\b/i,
  /\bhotel\b/i,
];

const INSTITUTIONAL_PATTERNS: RegExp[] = [
  /\bschool\b/i,
  /\bhospital\b/i,
  /\bchurch\b/i,
  /\bplace\s+of\s+worship\b/i,
  /\binstitution(al)?\b/i,
  /\blibrary\b/i,
  /\bcommunity\s+centre\b/i,
];

// ─────────────────────────── Project-type verbs ──────────────────────────────
// Order is meaningful only for the "Mixed" detection — see classify() body.

// R8 DeepSeek HIGH (narrowed) — action-noun forms `construction`/`erection`
// but NOT `building` (ambiguous: gerund vs existing-structure noun).
const NEW_CONSTRUCTION_PATTERNS: RegExp[] = [
  /\b(construct(ion|ed|s)?|build|erect(ion|ed|s)?)\b/i,
  /\bnew\s+(dwelling|building|structure|house|construction)\b/i,
];

const ADDITION_PATTERNS: RegExp[] = [
  /\baddition\b/i,
  /\bextend(ing|ed)?\b/i,
  /\bextension\b/i,
  /\benlarge(ment|d|ing)?\b/i,
];

// R8 DeepSeek HIGH — catch-all `\brenovat\w*\b` covers all inflections.
const ALTERATION_PATTERNS: RegExp[] = [
  /\balter(ation|ing|ed)?\b/i,
  /\brenovat\w*\b/i,
  /\binterior\s+(work|modif|renovat)/i,
  /\bremodel(ing|ed)?\b/i,
];

const DEMOLITION_PATTERNS: RegExp[] = [
  /\bdemolish(ing|ed)?\b/i,
  /\bdemolition\b/i,
  /\btear[\s-]?down\b/i,
];

const SEVERANCE_PATTERNS: RegExp[] = [
  /\bsever(ance|ed|ing)?\b/i,
  /\bconsent\s+to\s+(sever|create)\b/i,
  /\bsplit\s+(lot|parcel)\b/i,
  /\blot\s+division\b/i,
];

// Change-of-use language → folds into Alteration per spec enum + adds the
// `change-of-use` scope tag so the signal is preserved.
const CHANGE_OF_USE_PATTERNS: RegExp[] = [
  /\bchange\s+of\s+use\b/i,
  /\bpermit\s+the\s+use\s+of\b/i,
  /\bconvert(ed|ing)?\s+(to|into|for)\b/i,
];

// Variance-only language (setback adjust / parking pad / lot coverage / etc.)
// → folds into Alteration per spec enum + adds the `minor-variance` tag.
const VARIANCE_KEYWORD_PATTERNS: RegExp[] = [
  /\bset[\s-]?back\b/i,
  /\bparking\s+(standards?|pad|space|requirements?)\b/i,
  /\blot\s+coverage\b/i,
  /\bheight\s+(adjustments?|variance|relief)\b/i,
  /\bdensity\s+(variance|relief)\b/i,
  /\bminor\s+variance\b/i,
  /\bzoning\s+(variance|relief|by-?law)\b/i,
];

// ─────────────────────────── Scope tag matrix (~30) ──────────────────────────
// Each entry maps a tag string → array of regex patterns that fire it.
// First match wins per tag (set-based dedup).

const TAG_PATTERNS: Array<{ tag: string; patterns: RegExp[] }> = [
  // Residential-side tags
  { tag: 'dwelling',           patterns: [/\bdwelling\b/i, /\bhouse\b/i] },
  { tag: 'apartment',          patterns: [/\bapartment\b/i] },
  { tag: 'condo',              patterns: [/\bcondo(minium)?\b/i] },
  { tag: 'townhouse',          patterns: [/\btown\s*house\b/i, /\brow\s*house\b/i, /\btown\s*home\b/i] },
  { tag: 'secondary-suite',    patterns: [/\bsecondary\s+suite\b/i, /\b(second|2nd)\s+(suite|unit)\b/i] },

  // Structural / floor-level tags
  { tag: 'two-storey',         patterns: [/\b(two|2)[\s-]?stor(e?y|ies)\b/i] },
  { tag: 'third-storey',       patterns: [/\b(three|3rd|third)[\s-]?stor(e?y|ies)\b/i] },
  { tag: 'rear-addition',      patterns: [/\brear\b[\s\w-]{0,40}?\b(addition|extension)\b/i] },   // R8 DeepSeek LOW — non-greedy
  { tag: 'basement',           patterns: [/\bbasement\b/i] },
  { tag: 'walkout',            patterns: [/\bwalk[\s-]?out\b/i] },
  { tag: 'garage',             patterns: [/\bgarage\b/i, /\bcarport\b/i] },
  { tag: 'accessory-structure', patterns: [/\baccessory\s+(building|structure|dwelling)\b/i, /\bshed\b/i, /\bcabana\b/i] },

  // Commercial-side tags
  { tag: 'office',             patterns: [/\boffice\b/i] },
  { tag: 'retail',             patterns: [/\bretail\b/i, /\bstore\b/i] },
  { tag: 'service-shop',       patterns: [/\bservice\s+shop\b/i, /\bpersonal\s+service\b/i] },

  // Institutional-side tags
  { tag: 'school',             patterns: [/\bschool\b/i] },

  // Project-type signal tags
  { tag: 'addition',           patterns: ADDITION_PATTERNS },
  { tag: 'new-construction',   patterns: NEW_CONSTRUCTION_PATTERNS },
  { tag: 'renovation',         patterns: [/\brenovat(e|ion|ing)\b/i, /\bremodel(ing|ed)?\b/i] },
  { tag: 'demolition',         patterns: DEMOLITION_PATTERNS },
  { tag: 'severance',          patterns: SEVERANCE_PATTERNS },
  { tag: 'change-of-use',      patterns: CHANGE_OF_USE_PATTERNS },

  // Variance-language tags (preserve signal when project_type=Alteration via fall-through)
  { tag: 'setback',            patterns: [/\bset[\s-]?back\b/i] },
  { tag: 'parking',            patterns: [/\bparking\s+(standards?|pad|space|requirements?)\b/i] },
  { tag: 'lot-coverage',       patterns: [/\blot\s+coverage\b/i] },
  { tag: 'minor-variance',     patterns: [/\bminor\s+variance\b/i, /\bzoning\s+(variance|relief|by-?law)\b/i] },

  // Mixed-use / category meta tags
  { tag: 'mixed-use',          patterns: [/\bmixed[\s-]?use\b/i] },

  // Class meta tags (always appended when corresponding class fires)
  { tag: 'residential',        patterns: RESIDENTIAL_PATTERNS },
  { tag: 'commercial',         patterns: COMMERCIAL_PATTERNS },
  { tag: 'institutional',      patterns: INSTITUTIONAL_PATTERNS },

  // Fence (Toronto CoA frequent — usually variance-driven)
  { tag: 'fence',              patterns: [/\bfenc(e|ing)\b/i] },
];

// ─────────────────────────── Pure classifier ─────────────────────────────────

/**
 * Classify a CoA description into the canonical (coa_type_class, project_type,
 * scope_tags) triple per Spec 42 §6.6.D enums.
 */
export function classifyCoaScope(input: ClassifyCoaScopeInput): ClassifyCoaScopeOutput {
  const desc = (input?.description ?? '').toString().trim();
  if (!desc) {
    return { coa_type_class: null, project_type: null, scope_tags: null };
  }

  // ─── coa_type_class ──────────────────────────────────────────────────
  const hasResidential = RESIDENTIAL_PATTERNS.some((p) => p.test(desc));
  const hasCommercial = COMMERCIAL_PATTERNS.some((p) => p.test(desc));
  const hasInstitutional = INSTITUTIONAL_PATTERNS.some((p) => p.test(desc));

  let coaTypeClass: CoaTypeClass = null;
  const classSignalCount = [hasResidential, hasCommercial, hasInstitutional].filter(Boolean).length;
  if (classSignalCount >= 2) {
    coaTypeClass = 'mixed';
  } else if (hasResidential) {
    coaTypeClass = 'residential';
  } else if (hasCommercial) {
    coaTypeClass = 'commercial';
  } else if (hasInstitutional) {
    coaTypeClass = 'institutional';
  }

  // ─── project_type ────────────────────────────────────────────────────
  // Detect each verb category; 2+ DISTINCT verbs → Mixed.
  const verbHits: Array<'NewConstruction' | 'Addition' | 'Alteration' | 'Demolition' | 'Severance'> = [];

  // Addition checked before NewConstruction so "construct addition" reads as Addition only.
  const hasAddition = ADDITION_PATTERNS.some((p) => p.test(desc));
  const hasNewConstruction = !hasAddition && NEW_CONSTRUCTION_PATTERNS.some((p) => p.test(desc));
  const hasAlteration = ALTERATION_PATTERNS.some((p) => p.test(desc));
  const hasDemolition = DEMOLITION_PATTERNS.some((p) => p.test(desc));
  const hasSeverance = SEVERANCE_PATTERNS.some((p) => p.test(desc));
  const hasChangeOfUse = CHANGE_OF_USE_PATTERNS.some((p) => p.test(desc));
  const hasVarianceOnly = VARIANCE_KEYWORD_PATTERNS.some((p) => p.test(desc));

  if (hasAddition) verbHits.push('Addition');
  if (hasNewConstruction) verbHits.push('NewConstruction');
  if (hasAlteration) verbHits.push('Alteration');
  if (hasDemolition) verbHits.push('Demolition');
  if (hasSeverance) verbHits.push('Severance');

  let projectType: ProjectType = null;
  // Note (R8 DeepSeek MED): the `hasNewConstruction` guard (suppressed when
  // hasAddition fires) shapes project_type ONLY — it does NOT suppress the
  // 'new-construction' scope_tag. project_type is a single-value enum so we
  // disambiguate "construct addition" as Addition; scope_tags are richer
  // signals where having both 'addition' and 'new-construction' is fine.
  if (verbHits.length >= 2) {
    projectType = 'Mixed';
  } else if (verbHits.length === 1) {
    projectType = verbHits[0]!;   // length === 1 guarantees index 0 exists (TS strict-index needs assertion)
  } else if (hasChangeOfUse || hasVarianceOnly) {
    // No construction verb but change-of-use or variance language present →
    // Alteration per spec enum (no VarianceOnly / ChangeOfUse allowed).
    projectType = 'Alteration';
  }

  // ─── scope_tags ──────────────────────────────────────────────────────
  const tagSet = new Set<string>();
  for (const { tag, patterns } of TAG_PATTERNS) {
    for (const p of patterns) {
      if (p.test(desc)) {
        tagSet.add(tag);
        break;
      }
    }
  }

  // NULL sentinel (not empty array) when no keyword matched.
  const scopeTags: string[] | null = tagSet.size > 0 ? Array.from(tagSet).sort() : null;

  return { coa_type_class: coaTypeClass, project_type: projectType, scope_tags: scopeTags };
}
