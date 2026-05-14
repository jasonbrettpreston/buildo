'use strict';
/**
 * coa-scope-classifier — description-only scope classifier for CoA leads.
 *
 * Twin-extracted from `scripts/classify-scope.js`'s general scope tagger
 * (TAG_PATTERNS + extractScopeTags). Stripped to description-only inputs;
 * the permit twin reads permit_type, structure_type, work, current_use,
 * proposed_use, storeys, housing_units, dwelling_units — none of which
 * exist on CoA rows.
 *
 * R2.v5 fix #15 (Gemini MED escalation): the permit twin's
 * `extractResidentialTags` function (which reads housing_units / storeys)
 * was wholly dropped in R2.v4. R2.v5 restores a description-only
 * `extractCoaResidentialKeywords` (~30 lines, not 100) to capture
 * residential signal that CoA descriptions DO carry (deck/garage/pool/
 * single-family-dwelling/etc.).
 *
 * Pure functions — no DB, no I/O.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
 */

// ──────────────────────────────────────────────────────────────────────
// TAG_PATTERNS (verbatim from scripts/classify-scope.js lines 64-113)
// ──────────────────────────────────────────────────────────────────────
const TAG_PATTERNS = [
  { tag: '2nd-floor',       patterns: [/\b2nd\s*(floor|storey|flr)\b/i, /\bsecond\s*(floor|storey|flr)\b/i] },
  { tag: '3rd-floor',       patterns: [/\b3rd\s*(floor|storey|flr)\b/i, /\bthird\s*(floor|storey|flr)\b/i] },
  { tag: 'rear-addition',   patterns: [/\brear\s*(addition|ext(ension)?)\b/i] },
  { tag: 'side-addition',   patterns: [/\bside\s*(addition|ext(ension)?)\b/i] },
  { tag: 'front-addition',  patterns: [/\bfront\s*(addition|ext(ension)?)\b/i] },
  { tag: 'storey-addition', patterns: [/\b(storey|story)\s*addition\b/i, /\badd(ition)?\s*(a|one|1|two|2|three|3)?\s*(storey|story|stories)\b/i] },
  { tag: 'basement',        patterns: [/\bbasement\b/i] },
  { tag: 'underpinning',    patterns: [/\bunderpinn?ing\b/i] },
  { tag: 'foundation',      patterns: [/\bfoundation\b/i] },
  { tag: 'deck',            patterns: [/\bdeck\b/i] },
  { tag: 'porch',           patterns: [/\bporch\b/i] },
  { tag: 'garage',          patterns: [/\bgarage\b/i] },
  { tag: 'carport',         patterns: [/\bcarport\b/i] },
  { tag: 'canopy',          patterns: [/\bcanopy\b/i] },
  { tag: 'walkout',         patterns: [/\bwalk[\s-]?out\b/i] },
  { tag: 'balcony',         patterns: [/\bbalcon(y|ies)\b/i] },
  { tag: 'laneway-suite',   patterns: [/\blaneway\s*(suite|house)\b/i, /\blaneway\b/i] },
  { tag: 'pool',            patterns: [/\bpool\b/i] },
  { tag: 'fence',           patterns: [/\bfenc(e|ing)\b/i] },
  { tag: 'roofing',         patterns: [/\broof(ing)?\b/i, /\bre-?roof\b/i] },
  { tag: 'kitchen',         patterns: [/\bkitchen\b/i] },
  { tag: 'bathroom',        patterns: [/\bbath(room)?\b/i, /\bwashroom\b/i] },
  { tag: 'basement-finish', patterns: [/\bbasement\s*(finish|reno|completion|convert|apartment)\b/i, /\bfinish(ed|ing)?\s*basement\b/i] },
  { tag: 'second-suite',    patterns: [/\b(2nd|second)\s*suite\b/i, /\bsecondary\s*suite\b/i, /\b2nd\s*unit\b/i, /\bsecond\s*unit\b/i] },
  { tag: 'open-concept',    patterns: [/\bopen\s*concept\b/i, /\bremov(e|al|ing)\s*(of\s*)?(bearing|load|interior)\s*wall\b/i] },
  { tag: 'convert-unit',    patterns: [/\bconvert\b/i] },
  { tag: 'tenant-fitout',   patterns: [/\btenant\b/i, /\bfit[\s-]?out\b/i, /\bleasehold\s*improv/i] },
  { tag: 'condo',           patterns: [/\bcondo(minium)?\b/i] },
  { tag: 'apartment',       patterns: [/\bapartment\b/i] },
  { tag: 'townhouse',       patterns: [/\btownhouse\b/i, /\btown\s*home\b/i, /\brow\s*house\b/i] },
  { tag: 'mixed-use',       patterns: [/\bmixed[\s-]?use\b/i] },
  { tag: 'retail',          patterns: [/\bretail\b/i] },
  { tag: 'office',          patterns: [/\boffice\b/i] },
  { tag: 'restaurant',      patterns: [/\brestaurant\b/i] },
  { tag: 'warehouse',       patterns: [/\bwarehouse\b/i] },
  { tag: 'school',          patterns: [/\bschool\b/i] },
  { tag: 'hospital',        patterns: [/\bhospital\b/i] },
  { tag: 'hvac',            patterns: [/\bhvac\b/i, /\b(furnace|air\s*condition|heat\s*pump|duct(work)?)\b/i] },
  { tag: 'plumbing',        patterns: [/\bplumbing\b/i] },
  { tag: 'electrical',      patterns: [/\belectrical\b/i] },
  { tag: 'sprinkler',       patterns: [/\bsprinkler\b/i] },
  { tag: 'fire-alarm',      patterns: [/\bfire\s*alarm\b/i] },
  { tag: 'elevator',        patterns: [/\belevator\b/i, /\blift\b/i] },
  { tag: 'drain',           patterns: [/\bdrain\b/i, /\bsewer\b/i, /\bstorm\s*water\b/i] },
  { tag: 'backflow-preventer', patterns: [/\bbackflow\s*(preventer|prevent(ion)?|device)\b/i, /\bbackflow\b/i] },
  { tag: 'access-control',  patterns: [/\bmaglock\b/i, /\baccess\s*control\b/i, /\bcard\s*reader\b/i, /\bsecurity\s*(lock|access)\b/i] },
  { tag: 'station',         patterns: [/\b(transit|pumping|subway|bus)\s*station\b/i, /\bstation\b/i] },
  { tag: 'storage',         patterns: [/\bstorage\b/i, /\bracking\b/i, /\bsilo\b/i] },
];

// ──────────────────────────────────────────────────────────────────────
// extractScopeTags — description-only twin of classify-scope.js:115
// ──────────────────────────────────────────────────────────────────────
function extractScopeTags(description) {
  if (description == null || typeof description !== 'string' || description.trim() === '') {
    return [];
  }
  const tags = new Set();
  for (const { tag, patterns } of TAG_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(description)) {
        tags.add(tag);
        break;
      }
    }
  }
  return Array.from(tags).sort();
}

// ──────────────────────────────────────────────────────────────────────
// extractCoaResidentialKeywords — R2.v5 fix #15 description-only residential
// signal extractor. CoAs often describe residential projects via keywords
// even without structured housing_units/storeys fields.
// ──────────────────────────────────────────────────────────────────────
const RESIDENTIAL_KEYWORDS = [
  { tag: 'deck',                  pattern: /\bdeck\b/i },
  { tag: 'garage',                pattern: /\bgarage\b/i },
  { tag: 'pool',                  pattern: /\bpool\b/i },
  { tag: 'single-family-dwelling', pattern: /\b(single[\s-]?family\s*dwelling|sfd|single[\s-]?detached)\b/i },
  { tag: 'addition',              pattern: /\baddition\b/i },
  { tag: 'porch',                 pattern: /\bporch\b/i },
  { tag: 'fence',                 pattern: /\bfenc(e|ing)\b/i },
  { tag: 'shed',                  pattern: /\bshed\b/i },
  { tag: 'house',                 pattern: /\b(detached|semi-?detached|townhouse|townhome|row\s*house)\b/i },
];

function extractCoaResidentialKeywords(description) {
  if (description == null || typeof description !== 'string' || description.trim() === '') {
    return [];
  }
  const tags = [];
  for (const { tag, pattern } of RESIDENTIAL_KEYWORDS) {
    if (pattern.test(description)) tags.push(tag);
  }
  return tags;
}

// ──────────────────────────────────────────────────────────────────────
// classifyCoaScope — top-level orchestrator. Returns the shape that
// classify-coa-scope.js will UPSERT into coa_applications.
// ──────────────────────────────────────────────────────────────────────
function classifyCoaScope({ description, sub_type }) {
  const scope_tags = extractScopeTags(description);
  const residential_tags = extractCoaResidentialKeywords(description);
  const all_tags = Array.from(new Set([...scope_tags, ...residential_tags])).sort();

  // coa_type_class derivation — INTENTIONAL PRIORITY (R5.1.g Worktree HIGH-2):
  //   residential ← residential_tags non-empty OR any residential-shape scope_tag
  //   commercial  ← office/retail/restaurant/warehouse/mixed-use scope_tag
  //   institutional ← school/hospital scope_tag
  //   uncategorized ← otherwise
  //
  // Residential PRIORITY over commercial/institutional is deliberate: most
  // CoAs are residential variance applications, and even mixed-domain
  // descriptions (e.g. "garage apartment to retail") usually concern the
  // residential aspect (zoning/by-law variance) for the realtor target
  // audience. Phase D classifies by primary signal; Phase E lifecycle
  // engine can refine if needed.
  let coa_type_class = 'uncategorized';
  const residentialScope = ['basement', 'basement-finish', 'kitchen', 'bathroom',
    'second-suite', 'laneway-suite', 'townhouse', 'condo', 'apartment'];
  const commercialScope  = ['office', 'retail', 'restaurant', 'warehouse', 'mixed-use', 'tenant-fitout'];
  const institutionalScope = ['school', 'hospital'];

  if (residential_tags.length > 0 || all_tags.some((t) => residentialScope.includes(t))) {
    coa_type_class = 'residential';
  } else if (all_tags.some((t) => commercialScope.includes(t))) {
    coa_type_class = 'commercial';
  } else if (all_tags.some((t) => institutionalScope.includes(t))) {
    coa_type_class = 'institutional';
  }

  // project_type — simplified from the permit twin. CoA sub_type is the
  // primary signal (minor_variance / consent / etc.), augmented by scope.
  let project_type = sub_type || 'unclassified';

  return {
    coa_type_class,
    project_type,
    scope_tags: all_tags,
  };
}

module.exports = {
  classifyCoaScope,
  extractScopeTags,
  extractCoaResidentialKeywords,
  TAG_PATTERNS,
};
