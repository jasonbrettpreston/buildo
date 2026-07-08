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
  // P12-C3: top untyped-but-non-empty CoA description shapes are rear-yard
  // residential ACCESSORY structures that carried no use-class keyword. These are
  // unambiguously residential in the CoA minor-variance context (a commercial lot
  // does not file a CoA for a rear-yard "garden suite" / "detached garage").
  // Recovers ~1,188 of the 7,195 addressable NULLs. Deliberately NOT typing bare
  // "addition" / severance / easement / planning-act descriptions — those are
  // genuinely use-class-ambiguous and stay NULL (honest, not chased to 100%).
  /\bgarden\s+suite\b/i,
  /\bdetached\s+garage\b/i,
  /\baccessory\s+(dwelling|building|structure)\b/i,
  /\bancillary\s+(building|structure)\b/i,
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
  // P12-C1: "lot addition" / "land addition" / "parcel addition" is a SEVERANCE
  // land-transfer term (consent to sever a portion of land onto an adjacent lot),
  // NOT a building addition. The bare /\baddition\b/ leaked the construction
  // `addition` tag onto ~271 pure land-division consent applications → active ADD
  // trades on no-construction leads. Negative lookbehind excludes the land sense
  // while preserving genuine building additions ("rear addition", "two storey
  // addition"). A real sever+build ("construct a new dwelling on the severed lot")
  // still tags via NEW_CONSTRUCTION_PATTERNS and keeps its trades.
  /(?<!\b(?:lot|land|parcel)\s)\baddition\b/i,
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

// ─────────────────────────── Structure-type archetype ────────────────────────
// Maps a CoA description to a `scope_intensity_matrix.structure_type` archetype
// (Spec 83 §3.A). Precedence (first hit wins): institutional use → explicit
// mixed-use → implicit res+commercial mixed → commercial use → laneway/suite →
// converted house → apartment → unit-count×form → form-only → null. Residential
// FORM keywords are guarded against accessory nouns (a "detached garage" is NOT
// an SFD). NO match → null (honest under-emission, never a default-guess).

const DWELLING_CONTEXT = /\b(dwelling|house|home|residence|residential|unit)\b/i;
const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Explicit residential unit count from plex words or "N [residential] [dwelling] unit(s)"; null if absent. */
function extractUnitCount(desc) {
  if (/\bduplex\b/i.test(desc)) return 2;
  if (/\btriplex\b/i.test(desc)) return 3;
  if (/\bfourplex\b/i.test(desc)) return 4;
  // Up to two optional qualifier words ("two residential dwelling units"); digit or word
  // count; hyphen OR space separators ("2-unit", "two-unit", "2 residential units").
  const m = desc.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]+(?:(?:residential|dwelling)[\s-]+){0,2}units?\b/i);
  if (m) {
    const tok = m[1].toLowerCase();
    const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : WORD_NUMS[tok];
    if (n && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * @param {string} desc
 * @returns {string|null} a scope_intensity_matrix.structure_type archetype, or null.
 */
function classifyStructureType(desc) {
  if (!desc) return null;

  // 1. Institutional use — most specific; wins over conversion/residential context.
  if (/\bhospital\b/i.test(desc)) return 'Hospital';
  if (/\b(university|college)\b/i.test(desc)) return 'University';
  if (/\bschool\b/i.test(desc)) return 'Elementary School';
  if (/\b(church|place\s+of\s+worship|mosque|synagogue|temple)\b/i.test(desc)) return 'Place of Worship';

  const hasCommercialUse = /\b(office|retail|restaurant|store|shop|warehouse|industrial|commercial|hotel|bar|tavern)\b/i.test(desc);
  const hasResidentialUse = /\b(dwelling|apartment|condo(?:minium)?|town\s*house|town\s*home|row\s*house|duplex|triplex|fourplex|residential)\b/i.test(desc);

  // 2-3. Mixed use: explicit, OR simultaneous res+commercial that is NOT a sequential conversion.
  if (/\bmixed[\s-]?use\b/i.test(desc)) return 'Mixed Use/Res w Non Res';
  if (hasResidentialUse && hasCommercialUse && !/\b(convert|conversion|change\s+of\s+use)\b/i.test(desc)) {
    return 'Mixed Use/Res w Non Res';
  }

  // 4. Commercial use.
  if (/\b(medical|dental)\b/i.test(desc) && /\b(office|clinic|building)\b/i.test(desc)) return 'Medical/Dental Office';
  if (/\boffice\b/i.test(desc)) return 'Office';
  if (/\brestaurant\b/i.test(desc)) return 'Restaurant 30 Seats or Less';
  if (/\b(industrial|warehouse|manufacturing)\b/i.test(desc)) return 'Industrial';
  if (/\bretail\b/i.test(desc) || /\bstore\b/i.test(desc) || /\bshop\b/i.test(desc)) return 'Retail Store';

  // 5. Laneway / rear-yard / garden suite.
  if (/\b(laneway|garden|rear[\s-]?yard)\s+(suite|house|home)\b/i.test(desc)) return 'Laneway / Rear Yard Suite';

  // 6. Converted house — sequential residential conversion to >1 unit.
  if (/\bconvert(?:ed|ing|sion)?\b/i.test(desc) && DWELLING_CONTEXT.test(desc) &&
      (/\b(units?|apartments?|rooming|multiple)\b/i.test(desc) || (extractUnitCount(desc) ?? 0) >= 2)) {
    return 'Converted House';
  }

  // 7. Apartment / condominium building.
  if (/\b(apartment|condo(?:minium)?)\b/i.test(desc)) return 'Apartment Building';

  // 8. Unit-count × dwelling form.
  const units = extractUnitCount(desc);
  const stacked = /\bstacked\s+town\s*house/i.test(desc);
  const townhouse = /\b(town\s*house|town\s*home|row\s*house)\b/i.test(desc);
  const semi = /\bsemi[\s-]?detached\b/i.test(desc);
  // "detached" must sit within a short window of a dwelling noun — a proximity match
  // (not bare \bdetached\b) so "detached garage" is excluded WITHOUT also killing
  // "detached dwelling" when both appear (e.g. "...detached dwelling and a detached garage").
  const detached = /\bdetached\b[\s\w-]{0,30}?\b(dwelling|house|home|residence)\b/i.test(desc);

  if (stacked) return 'Stacked Townhouses';
  if (townhouse) return 'SFD - Townhouse';

  if (units !== null) {
    if (units >= 5) return 'Multiple Unit Building';
    if (units >= 3) return '3+ Unit - Detached';
    if (units === 2) return semi ? '2 Unit - Semi-detached' : '2 Unit - Detached';
    // units === 1 → fall through to form-only
  } else if (/\b(multiplex|multiple\s+units?)\b/i.test(desc)) {
    // keyword-only fallback — fires ONLY when there is no explicit plex/unit count,
    // so "duplex within the multiplex site" stays 2 Unit (the explicit count wins).
    return 'Multiple Unit Building';
  }

  if (semi) return 'SFD - Semi-Detached';
  if (detached) return 'SFD - Detached';

  return null;
}

/**
 * Classify a CoA description into the canonical (coa_type_class, project_type,
 * scope_tags, structure_type) tuple per Spec 42 §6.6.D enums + Spec 83 §3.A vocab.
 *
 * @param {object} input
 * @param {string|null|undefined} input.description - CoA description text.
 * @param {string|null} [input.status] - reserved for future heuristics
 * @param {string|null} [input.decision] - reserved for future heuristics
 * @returns {{coa_type_class: string|null, project_type: string|null, scope_tags: string[]|null, structure_type: string|null}}
 */
function classifyCoaScope(input) {
  const desc = (input && input.description != null ? String(input.description) : '').trim();
  if (!desc) {
    return { coa_type_class: null, project_type: null, scope_tags: null, structure_type: null };
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

  const structure_type = classifyStructureType(desc);

  return { coa_type_class: coaTypeClass, project_type: projectType, scope_tags: scopeTags, structure_type };
}

module.exports = {
  classifyCoaScope,
  classifyStructureType,
  TAG_PATTERNS,
};
