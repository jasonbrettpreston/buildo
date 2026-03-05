/**
 * Entity name normalization — shared between TypeScript API code and pipeline scripts.
 * Canonical source for the normalization logic used in extract-entities.js, load-permits.js, etc.
 */

const CORPORATE_SUFFIXES = [
  'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
  'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
];

const SUFFIX_PATTERN = new RegExp(
  `\\s*\\b(${CORPORATE_SUFFIXES.join('|')})\\s*$`,
  'i'
);

/**
 * Normalize an entity name for deduplication:
 * - Uppercase + trim
 * - Collapse whitespace
 * - Strip corporate suffixes (run twice for double suffixes like "INC. LTD.")
 * - Remove trailing punctuation
 *
 * Returns null for empty/whitespace-only input.
 */
export function normalizeEntityName(name: string | null | undefined): string | null {
  if (!name || !name.trim()) return null;

  let normalized = name.toUpperCase().trim();
  normalized = normalized.replace(/\s+/g, ' ');

  // Run twice to catch double suffixes like "INC. LTD."
  normalized = normalized.replace(SUFFIX_PATTERN, '').trim();
  normalized = normalized.replace(SUFFIX_PATTERN, '').trim();

  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;]+$/, '').trim();

  return normalized || null;
}

/**
 * Check if a name appears to be a corporation (has corporate suffixes).
 */
export function isIncorporated(name: string): boolean {
  return SUFFIX_PATTERN.test(name);
}
