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
