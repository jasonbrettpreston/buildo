// ---------------------------------------------------------------------------
// Builder name normalization
// ---------------------------------------------------------------------------

/**
 * Common corporate suffixes to strip during normalization.
 * Order matters: longer/more specific patterns are listed first so that
 * e.g. "INCORPORATED" is removed before "INC" could leave residue.
 */
const CORPORATE_SUFFIXES = [
  'INCORPORATED',
  'CORPORATION',
  'LIMITED',
  'CORP',
  'INC',
  'LTD',
  'L\\.P\\.',
  'LP',
  'CO',
];

/**
 * Pre-compiled regex that matches any corporate suffix at the end of a name,
 * optionally preceded by a comma or period and followed by trailing punctuation.
 *
 * Examples that match:
 *   "ACME CONSTRUCTION INC."  -> strip " INC."
 *   "ACME CONSTRUCTION, LTD"  -> strip ", LTD"
 *   "ACME L.P."               -> strip " L.P."
 */
const SUFFIX_REGEX = new RegExp(
  `[,.]?\\s+(${CORPORATE_SUFFIXES.join('|')})\\.?\\s*$`,
  'i'
);

/**
 * Regex used by `isIncorporated` to detect corporate suffixes anywhere in the
 * original name (not just at the end). The word-boundary markers ensure we
 * don't match partial words like "INCLINE".
 */
const INCORPORATED_REGEX = new RegExp(
  `\\b(${CORPORATE_SUFFIXES.join('|')})\\b\\.?`,
  'i'
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a builder name for deduplication and matching.
 *
 * Steps:
 *  1. Uppercase the entire string.
 *  2. Collapse all consecutive whitespace to a single space.
 *  3. Strip common corporate suffixes (INC, LTD, CORP, etc.).
 *  4. Trim leading/trailing whitespace and punctuation.
 *
 * @example
 *   normalizeBuilderName("Acme Construction Inc.")   // "ACME CONSTRUCTION"
 *   normalizeBuilderName("  bob's  plumbing ltd  ")  // "BOB'S PLUMBING"
 *   normalizeBuilderName("Smith & Sons, L.P.")       // "SMITH & SONS"
 */
export function normalizeBuilderName(name: string): string {
  let normalized = name.toUpperCase();

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Strip corporate suffixes (may need multiple passes for names like
  // "ACME CORP INC" -- unlikely but defensive)
  let previous = '';
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(SUFFIX_REGEX, '');
  }

  // Trim residual punctuation and whitespace from the edges
  normalized = normalized.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

  return normalized;
}

/**
 * Check whether the *original* (un-normalized) name contains a corporate
 * suffix such as INC, LTD, CORP, etc.  This can be used to flag builders
 * that are formally incorporated vs. sole proprietors or DBAs.
 */
export function isIncorporated(name: string): boolean {
  return INCORPORATED_REGEX.test(name);
}
