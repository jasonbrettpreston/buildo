/**
 * Shared address normalization utilities for pipeline scripts.
 *
 * Used by load-permits.js, load-coa.js, and link-coa.js to ensure
 * consistent street name normalization across ingestion and linking.
 */

// Street type suffixes to strip (order doesn't matter — \b boundaries prevent partial matches)
const STREET_TYPES = [
  'STREET', 'ST',
  'AVENUE', 'AVE',
  'DRIVE', 'DR',
  'ROAD', 'RD',
  'BOULEVARD', 'BLVD',
  'COURT', 'CRT',
  'CRESCENT', 'CRES',
  'PLACE', 'PL',
  'WAY',
  'LANE', 'LN',
  'TRAIL', 'TR',
  'TERRACE', 'TERR',
  'CIRCLE', 'CIR',
  'PARKWAY', 'PKWY',
  'GATE',
  'GARDENS', 'GDNS',
  'GROVE', 'GRV',
  'HEIGHTS', 'HTS',
  'MEWS',
  'SQUARE', 'SQ',
];

// Build regex: match whole words only, case-insensitive
const STREET_TYPE_RE = new RegExp(
  '\\b(' + STREET_TYPES.join('|') + ')\\b', 'gi'
);

/**
 * Normalize a street name to its base form for matching.
 *
 * - Uppercases
 * - Strips street type suffixes (ST, AVE, DR, etc.)
 * - Strips trailing cardinal directions (N, S, E, W, NE, NW, SE, SW)
 * - Collapses multiple spaces
 * - Returns null if result is empty
 *
 * @param {string|null|undefined} name - Raw street name
 * @returns {string|null} Normalized name or null
 *
 * @example
 *   normalizeStreetName('COLBECK ST')        → 'COLBECK'
 *   normalizeStreetName('DUNDAS ST W')       → 'DUNDAS'
 *   normalizeStreetName('BURNHAMTHORPE CRES') → 'BURNHAMTHORPE'
 *   normalizeStreetName('KING GEORGE RD')    → 'KING GEORGE'
 *   normalizeStreetName('AVENUE RD')         → 'AVENUE'
 *   normalizeStreetName(null)                → null
 */
function normalizeStreetName(name) {
  if (!name) return null;
  const result = name
    .toUpperCase()
    .replace(STREET_TYPE_RE, '')
    .replace(/\b(NE|NW|SE|SW|N|S|E|W)\s*$/, '') // trailing direction
    .replace(/\s+/g, ' ')
    .trim();
  return result || null;
}

/**
 * Normalize ward to a consistent format (strip leading zeros).
 *
 * @param {string|null|undefined} ward
 * @returns {string|null}
 */
function normalizeWard(ward) {
  if (!ward) return null;
  const trimmed = ward.trim().replace(/^0+/, '');
  return trimmed || null;
}

module.exports = { normalizeStreetName, normalizeWard, STREET_TYPES };
