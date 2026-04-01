/**
 * Entity name normalization — shared between TypeScript API code and pipeline scripts.
 * Canonical source for the normalization logic used in extract-entities.js, load-permits.js, etc.
 */

const CORPORATE_SUFFIXES = [
  'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
  'INC\\.', 'CORP\\.', 'LTD\\.', 'CO\\.', 'LLC\\.', 'L\\.P\\.',
  'INC', 'CORP', 'LTD', 'CO', 'LLC', 'LP',
];

const SUFFIX_PATTERN = new RegExp(
  `\\s*\\b(${CORPORATE_SUFFIXES.join('|')})\\s*$`,
  'i'
);

/**
 * Normalize an entity name for deduplication:
 * - Uppercase + trim
 * - Standardize ampersands (& → AND)
 * - Strip internal punctuation (commas, periods, apostrophes, semicolons)
 * - Collapse whitespace
 * - Recursively strip corporate suffixes
 *
 * Returns null for empty/whitespace-only input.
 */
export function normalizeEntityName(name: string | null | undefined): string | null {
  if (!name || !name.trim()) return null;

  let normalized = name.toUpperCase().trim();

  // Standardize ampersands before punctuation stripping
  normalized = normalized.replace(/&/g, ' AND ');

  // Strip rogue punctuation (periods, commas, apostrophes, semicolons)
  normalized = normalized.replace(/[.,;'"]/g, '');

  // Collapse multiple spaces into a single space
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Recursively strip corporate suffixes until none remain
  let previous = '';
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(SUFFIX_PATTERN, '').trim();
  }

  return normalized || null;
}

/**
 * Check if a name appears to be a corporation (has corporate suffixes).
 * Cleans punctuation first so "SMITH INC.," matches correctly.
 */
export function isIncorporated(name: string): boolean {
  if (!name) return false;
  const cleaned = name.toUpperCase().replace(/[.,;'"]/g, '').trim();
  return SUFFIX_PATTERN.test(cleaned);
}

const NUMBERED_CORP_PATTERN = /^\d{5,}/;

const BUSINESS_KEYWORDS =
  /\b(homes?|builders?|construct|develop|design|group|project|reno|plumb|electric|hvac|roof|mason|concrete|contract|pav|excavat|landscape|paint|floor|insul|demol|glass|steel|iron|fenc|deck|drain|fire|solar|elevator|sid|waterproof|cabinet|mill|tile|stone|pool|caulk|trim|property|properties|invest|capital|holding|enterpr|restoration|maintenance|service|tech|solution|supply|architec|engineer|consult|manage|venture|tower|condo|real|custom|infra|mechanic|scaffold|crane|window|door|lumber|wood|metal|weld|pil|excavat|grad|asphalt|survey|environment|energy|systems|basement|estate|living|residence|habitat|urban|metro|civic|municipal|structural|foundation|framing|forming|drywall|glazing|insulation|masonry|siding|eavestrough|millwork|cabinetry|tiling|flooring|roofing|plumbing|electrical|painting|fencing|decking|demolition|drilling|boring|remediat|abatement|hoist|rigging|welding|paving|grading)/i;

/**
 * Classify an entity name as Corporation or Individual.
 * - Has corporate suffix (INC, LTD, CORP, etc.) → Corporation
 * - Numbered corporation (5+ leading digits) → Corporation
 * - Has business keyword → Corporation
 * - 4+ words → Corporation (likely a business name)
 * - 2-3 words with no business indicators → Individual
 */
export function classifyEntityType(name: string): 'Corporation' | 'Individual' {
  if (!name || !name.trim()) return 'Individual';
  const trimmed = name.trim();

  if (isIncorporated(trimmed)) return 'Corporation';
  if (NUMBERED_CORP_PATTERN.test(trimmed)) return 'Corporation';
  if (BUSINESS_KEYWORDS.test(trimmed)) return 'Corporation';

  const words = trimmed.split(/\s+/);
  if (words.length >= 4) return 'Corporation';

  return 'Individual';
}
