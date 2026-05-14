'use strict';
/**
 * coa-scope-classifier — description-keyword classifier for CoA leads.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D, §6.8 row 666
 *            docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
 *
 * 🔗 DUAL CODE PATH: src/lib/classification/coa-scope-classifier.ts must mirror
 *                   this logic byte-for-byte. Parity verified by
 *                   src/tests/coa-scope-classifier.logic.test.ts.
 *
 * WF1 R5.3 (2026-05-14): SUPERSEDES the R5.1 substrate stub (commit cea6d47).
 * The prior implementation used spec-non-conformant enums (`'uncategorized'`,
 * `'unclassified'`), read a non-existent `sub_type` parameter, and returned
 * empty-array (not NULL) when no keywords matched — all rejected by the R8
 * plan-review (Worktree FAIL-1/-2). This implementation is spec-strict.
 *
 * Spec 42 §6.6.D enum tables (CANONICAL — do NOT extend without spec amendment):
 *   coa_type_class: 'residential' | 'commercial' | 'institutional' | 'mixed' | null
 *   project_type:   'NewConstruction' | 'Addition' | 'Alteration' |
 *                   'Demolition' | 'Severance' | 'Mixed' | null
 *   scope_tags:     TEXT[] (NULL when no keyword matches — not empty array)
 *
 * Pure functions — no DB, no I/O.
 */

// ─────────────────────────── Type-class indicators ───────────────────────────

const RESIDENTIAL_PATTERNS = [
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

const COMMERCIAL_PATTERNS = [
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

const INSTITUTIONAL_PATTERNS = [
  /\bschool\b/i,
  /\bhospital\b/i,
  /\bchurch\b/i,
  /\bplace\s+of\s+worship\b/i,
  /\binstitution(al)?\b/i,
  /\blibrary\b/i,
  /\bcommunity\s+centre\b/i,
];

// ─────────────────────────── Project-type verbs ──────────────────────────────

// R8 DeepSeek HIGH (narrowed) — include action-noun forms `construction` and
// `erection` so "Construction of a new dwelling" fires. Deliberately exclude
// `building` (noun) — it's ambiguous between gerund ("Building of...") and
// the existing-structure noun ("the two-storey building"). The latter is
// far more common in Toronto CoA descriptions ("permit use of X within the
// existing building"), so matching `\bbuilding\b` causes false positives.
// The `\bnew\s+building\b` pattern in the second alternation still catches
// the legitimate gerund case ("a new building").
const NEW_CONSTRUCTION_PATTERNS = [
  /\b(construct(ion|ed|s)?|build|erect(ion|ed|s)?)\b/i,
  /\bnew\s+(dwelling|building|structure|house|construction)\b/i,
];

const ADDITION_PATTERNS = [
  /\baddition\b/i,
  /\bextend(ing|ed)?\b/i,
  /\bextension\b/i,
  /\benlarge(ment|d|ing)?\b/i,
];

// R8 DeepSeek HIGH — catch all `renovat*` inflections (renovated, renovates,
// renovation, etc.). Catch-all `\brenovat\w*\b` covers any English ending.
const ALTERATION_PATTERNS = [
  /\balter(ation|ing|ed)?\b/i,
  /\brenovat\w*\b/i,
  /\binterior\s+(work|modif|renovat)/i,
  /\bremodel(ing|ed)?\b/i,
];

const DEMOLITION_PATTERNS = [
  /\bdemolish(ing|ed)?\b/i,
  /\bdemolition\b/i,
  /\btear[\s-]?down\b/i,
];

const SEVERANCE_PATTERNS = [
  /\bsever(ance|ed|ing)?\b/i,
  /\bconsent\s+to\s+(sever|create)\b/i,
  /\bsplit\s+(lot|parcel)\b/i,
  /\blot\s+division\b/i,
];

const CHANGE_OF_USE_PATTERNS = [
  /\bchange\s+of\s+use\b/i,
  /\bpermit\s+the\s+use\s+of\b/i,
  /\bconvert(ed|ing)?\s+(to|into|for)\b/i,
];

const VARIANCE_KEYWORD_PATTERNS = [
  /\bset[\s-]?back\b/i,
  /\bparking\s+(standards?|pad|space|requirements?)\b/i,
  /\blot\s+coverage\b/i,
  /\bheight\s+(adjustments?|variance|relief)\b/i,
  /\bdensity\s+(variance|relief)\b/i,
  /\bminor\s+variance\b/i,
  /\bzoning\s+(variance|relief|by-?law)\b/i,
];

// ─────────────────────────── Scope tag matrix (~30) ──────────────────────────

const TAG_PATTERNS = [
  // Residential-side
  { tag: 'dwelling',           patterns: [/\bdwelling\b/i, /\bhouse\b/i] },
  { tag: 'apartment',          patterns: [/\bapartment\b/i] },
  { tag: 'condo',              patterns: [/\bcondo(minium)?\b/i] },
  { tag: 'townhouse',          patterns: [/\btown\s*house\b/i, /\brow\s*house\b/i, /\btown\s*home\b/i] },
  { tag: 'secondary-suite',    patterns: [/\bsecondary\s+suite\b/i, /\b(second|2nd)\s+(suite|unit)\b/i] },
  // Structural / floor-level
  { tag: 'two-storey',         patterns: [/\b(two|2)[\s-]?stor(e?y|ies)\b/i] },
  { tag: 'third-storey',       patterns: [/\b(three|3rd|third)[\s-]?stor(e?y|ies)\b/i] },
  { tag: 'rear-addition',      patterns: [/\brear\b[\s\w-]{0,40}?\b(addition|extension)\b/i] },   // R8 DeepSeek LOW — non-greedy avoids pathological backtracking
  { tag: 'basement',           patterns: [/\bbasement\b/i] },
  { tag: 'walkout',            patterns: [/\bwalk[\s-]?out\b/i] },
  { tag: 'garage',             patterns: [/\bgarage\b/i, /\bcarport\b/i] },
  { tag: 'accessory-structure', patterns: [/\baccessory\s+(building|structure|dwelling)\b/i, /\bshed\b/i, /\bcabana\b/i] },
  // Commercial
  { tag: 'office',             patterns: [/\boffice\b/i] },
  { tag: 'retail',             patterns: [/\bretail\b/i, /\bstore\b/i] },
  { tag: 'service-shop',       patterns: [/\bservice\s+shop\b/i, /\bpersonal\s+service\b/i] },
  // Institutional
  { tag: 'school',             patterns: [/\bschool\b/i] },
  // Project-type signal tags
  { tag: 'addition',           patterns: ADDITION_PATTERNS },
  { tag: 'new-construction',   patterns: NEW_CONSTRUCTION_PATTERNS },
  { tag: 'renovation',         patterns: [/\brenovat\w*\b/i, /\bremodel(ing|ed)?\b/i] },   // WF3 #r5-3-observability-fixes BUG-2 — catch-all aligns with ALTERATION_PATTERNS
  { tag: 'demolition',         patterns: DEMOLITION_PATTERNS },
  { tag: 'severance',          patterns: SEVERANCE_PATTERNS },
  { tag: 'change-of-use',      patterns: CHANGE_OF_USE_PATTERNS },
  // Variance language
  { tag: 'setback',            patterns: [/\bset[\s-]?back\b/i] },
  { tag: 'parking',            patterns: [/\bparking\s+(standards?|pad|space|requirements?)\b/i] },
  { tag: 'lot-coverage',       patterns: [/\blot\s+coverage\b/i] },
  { tag: 'minor-variance',     patterns: [/\bminor\s+variance\b/i, /\bzoning\s+(variance|relief|by-?law)\b/i] },
  // Mixed-use / meta
  { tag: 'mixed-use',          patterns: [/\bmixed[\s-]?use\b/i] },
  { tag: 'residential',        patterns: RESIDENTIAL_PATTERNS },
  { tag: 'commercial',         patterns: COMMERCIAL_PATTERNS },
  { tag: 'institutional',      patterns: INSTITUTIONAL_PATTERNS },
  { tag: 'fence',              patterns: [/\bfenc(e|ing)\b/i] },
];

/**
 * Classify a CoA description into the canonical (coa_type_class, project_type,
 * scope_tags) triple per Spec 42 §6.6.D enums.
 *
 * @param {object} input
 * @param {string|null|undefined} input.description - CoA description text.
 * @param {string|null} [input.status] - reserved for future heuristics
 * @param {string|null} [input.decision] - reserved for future heuristics
 * @returns {{coa_type_class: string|null, project_type: string|null, scope_tags: string[]|null}}
 */
function classifyCoaScope(input) {
  const desc = (input && input.description != null ? String(input.description) : '').trim();
  if (!desc) {
    return { coa_type_class: null, project_type: null, scope_tags: null };
  }

  // ─── coa_type_class ──────────────────────────────────────────────────
  const hasResidential = RESIDENTIAL_PATTERNS.some((p) => p.test(desc));
  const hasCommercial = COMMERCIAL_PATTERNS.some((p) => p.test(desc));
  const hasInstitutional = INSTITUTIONAL_PATTERNS.some((p) => p.test(desc));

  let coaTypeClass = null;
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
  const verbHits = [];
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

  let projectType = null;
  // Note: the `hasNewConstruction` guard (suppressed when hasAddition fires)
  // shapes project_type ONLY — it does NOT suppress the 'new-construction'
  // scope_tag. That's intentional: project_type is a single-value enum so we
  // disambiguate "construct addition" as Addition; scope_tags are richer
  // signals where having both 'addition' and 'new-construction' is fine
  // (R8 DeepSeek MED — documented asymmetry).
  if (verbHits.length >= 2) {
    projectType = 'Mixed';
  } else if (verbHits.length === 1) {
    projectType = verbHits[0];
  } else if (hasChangeOfUse || hasVarianceOnly) {
    projectType = 'Alteration';
  }

  // ─── scope_tags ──────────────────────────────────────────────────────
  const tagSet = new Set();
  for (const { tag, patterns } of TAG_PATTERNS) {
    for (const p of patterns) {
      if (p.test(desc)) {
        tagSet.add(tag);
        break;
      }
    }
  }

  // NULL sentinel (not empty array) when no keyword matched.
  const scopeTags = tagSet.size > 0 ? Array.from(tagSet).sort() : null;

  return { coa_type_class: coaTypeClass, project_type: projectType, scope_tags: scopeTags };
}

module.exports = {
  classifyCoaScope,
  TAG_PATTERNS,
};
